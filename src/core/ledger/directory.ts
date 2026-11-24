/**
 * 台帳の閲覧・検索・編集（フェーズ2c）の、純粋な処理の部分。
 *
 * - 連絡先を会社ごとにまとめる（会社 → ドメイン → 人物）
 * - 会社名・ドメイン・氏名などで検索する
 * - 利用者による編集（氏名、会社名、部署・役職、電話番号）と削除を台帳に反映する
 *
 * 会社名は、次の順に決める。
 * 1. 連絡先ごとに指定した会社名（フリーメールの相手や、1つのドメインに複数の会社がある場合に使う）
 * 2. ドメインに付けた会社名
 * 3. どちらも無ければ、ドメイン（フリーメールはアドレス）で表示する
 *
 * 同じ会社名を付けたドメインは、1つの会社としてまとめる（1社で複数ドメイン）。
 * やりとりの回数は、役割（To / Cc）の表示にだけ使い、回数そのものは画面に出さない。
 */

import { companySearchKey, searchKey } from '../text/company';
import type { CcPairRecord, CompanyRecord, ContactRecord, LedgerStore } from './ledger';

export { companySearchKey, searchKey };

/** 利用者が入力する項目の最大文字数 */
export const MAX_FIELD_LENGTH = 100;

/** 会社の別名の最大件数 */
export const MAX_ALIASES = 10;

/** 検索結果に出す「よく同席する別会社」の最大件数 */
const MAX_RELATED = 5;

/** その相手を To・Cc のどちらに入れてきたか */
export type ContactRole = 'to' | 'cc' | 'both' | 'none';

/** 人物1件の表示内容 */
export interface DirectoryPerson {
  readonly address: string;
  /** 氏名（登録した氏名。無ければ宛先欄の表示名。どちらも無ければ空文字） */
  readonly name: string;
  readonly department: string;
  readonly title: string;
  readonly phone: string;
  readonly mobile: string;
  readonly role: ContactRole;
  /** 最終やりとり日（ISO 8601） */
  readonly lastAt: string;
  /** 利用者が確認・修正した情報か（false は自動で記録した情報） */
  readonly confirmed: boolean;
}

/** 会社1件の表示内容 */
export interface DirectoryCompany {
  /** 表示する名前（会社名。無ければドメイン、フリーメールはアドレス） */
  readonly label: string;
  /** 会社名が登録されているか（false のとき label はドメインまたはアドレス） */
  readonly named: boolean;
  readonly aliases: readonly string[];
  /** この会社のドメイン（フリーメールの相手は含めない） */
  readonly domains: readonly string[];
  readonly people: readonly DirectoryPerson[];
  /** この会社へのメールで、よく Cc に入っている別の会社の名前 */
  readonly related: readonly string[];
}

/** 入力された項目を整える（前後の空白と制御文字を除き、長さを制限する） */
export function cleanField(value: string): string {
  // 改行・タブなどの制御文字は、表示の乱れや CSV の崩れを防ぐために空白にする
  const cleaned = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f ? ' ' : character;
  })
    .join('')
    .trim();
  return Array.from(cleaned).slice(0, MAX_FIELD_LENGTH).join('');
}

function roleOf(contact: ContactRecord): ContactRole {
  if (contact.toCount > 0 && contact.ccCount > 0) return 'both';
  if (contact.toCount > 0) return 'to';
  if (contact.ccCount > 0) return 'cc';
  return 'none';
}

function personOf(contact: ContactRecord): DirectoryPerson {
  return {
    address: contact.address,
    name: contact.name ?? contact.displayName ?? '',
    department: contact.department ?? '',
    title: contact.title ?? '',
    phone: contact.phone ?? '',
    mobile: contact.mobile ?? '',
    role: roleOf(contact),
    lastAt: contact.lastAt,
    confirmed: contact.confirmed === true,
  };
}

/** 連絡先の会社名（連絡先ごとの指定 → ドメインに付けた会社名 → 無し） */
export function companyNameOf(
  contact: ContactRecord,
  companies: ReadonlyMap<string, CompanyRecord>,
): string | undefined {
  const own = contact.companyName;
  if (own !== undefined && own !== '') return own;
  const name = companies.get(contact.companyKey)?.name;
  return name === undefined || name === '' ? undefined : name;
}

interface MutableGroup {
  label: string;
  named: boolean;
  aliases: Set<string>;
  domains: Set<string>;
  people: DirectoryPerson[];
  relatedCounts: Map<string, number>;
}

/** 台帳の記録を、会社ごとにまとめる。会社は名前順、人物は最終やりとり日の新しい順 */
export function buildDirectory(
  contacts: readonly ContactRecord[],
  companies: readonly CompanyRecord[],
  ccPairs: readonly CcPairRecord[],
): DirectoryCompany[] {
  const companyByKey = new Map(companies.map((company) => [company.companyKey, company]));
  const groups = new Map<string, MutableGroup>();
  const groupIdOfAddress = new Map<string, string>();

  for (const contact of contacts) {
    const name = companyNameOf(contact, companyByKey);
    const id = name === undefined ? `key:${contact.companyKey}` : `name:${companySearchKey(name)}`;
    let group = groups.get(id);
    if (group === undefined) {
      group = {
        label: name ?? contact.companyKey,
        named: name !== undefined,
        aliases: new Set(),
        domains: new Set(),
        people: [],
        relatedCounts: new Map(),
      };
      groups.set(id, group);
    }
    // フリーメールの相手は companyKey がアドレスなので、ドメインには入れない
    if (!contact.companyKey.includes('@')) {
      group.domains.add(contact.companyKey);
      // 連絡先ごとに別の会社名を指定した場合、ドメインの別名はその会社のものではないので使わない
      if (contact.companyName === undefined || contact.companyName === '') {
        for (const alias of companyByKey.get(contact.companyKey)?.aliases ?? []) {
          group.aliases.add(alias);
        }
      }
    }
    group.people.push(personOf(contact));
    groupIdOfAddress.set(contact.address, id);
  }

  // よく同席する別会社：この会社の人を To にしたメールで、Cc に入っていた別の会社
  for (const pair of ccPairs) {
    const toGroupId = groupIdOfAddress.get(pair.toAddress);
    const ccGroupId = groupIdOfAddress.get(pair.address);
    if (toGroupId === undefined || ccGroupId === undefined || toGroupId === ccGroupId) continue;
    const toGroup = groups.get(toGroupId);
    const ccGroup = groups.get(ccGroupId);
    if (toGroup === undefined || ccGroup === undefined) continue;
    toGroup.relatedCounts.set(
      ccGroup.label,
      (toGroup.relatedCounts.get(ccGroup.label) ?? 0) + pair.count,
    );
  }

  return [...groups.values()]
    .map((group) => ({
      label: group.label,
      named: group.named,
      aliases: [...group.aliases],
      domains: [...group.domains].sort(),
      people: [...group.people].sort(
        (a, b) => b.lastAt.localeCompare(a.lastAt) || a.address.localeCompare(b.address),
      ),
      related: [...group.relatedCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, MAX_RELATED)
        .map(([label]) => label),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ja'));
}

/**
 * 会社名・別名・ドメイン・氏名・アドレス・部署で検索する。
 * 会社（名前・別名・ドメイン）に一致した場合は、その会社の全員を返す。
 * 人物だけが一致した場合は、その会社の、一致した人物だけを返す。
 * 検索語が空の場合は、何も返さない。
 */
export function searchDirectory(
  directory: readonly DirectoryCompany[],
  query: string,
): DirectoryCompany[] {
  const key = searchKey(query);
  if (key === '') return [];
  const companyKey = companySearchKey(query);
  const results: DirectoryCompany[] = [];
  for (const company of directory) {
    const companyMatches =
      (company.named && companySearchKey(company.label).includes(companyKey)) ||
      company.aliases.some((alias) => companySearchKey(alias).includes(companyKey)) ||
      company.domains.some((domain) => domain.includes(key)) ||
      (!company.named && searchKey(company.label).includes(key));
    if (companyMatches) {
      results.push(company);
      continue;
    }
    const people = company.people.filter(
      (person) =>
        searchKey(person.name).includes(key) ||
        person.address.includes(key) ||
        searchKey(person.department).includes(key),
    );
    if (people.length > 0) results.push({ ...company, people });
  }
  return results;
}

/** 連絡先の編集内容（省略した項目は変えない。空文字にすると、その項目を消す） */
export interface ContactEdit {
  readonly name?: string;
  readonly companyName?: string;
  readonly department?: string;
  readonly title?: string;
  readonly phone?: string;
  readonly mobile?: string;
}

const CONTACT_EDIT_FIELDS = [
  'name',
  'companyName',
  'department',
  'title',
  'phone',
  'mobile',
] as const;

/** 編集内容を連絡先に反映した記録を作る。空文字にした項目は消す。利用者が直したので「確定」にする */
export function editedContact(contact: ContactRecord, edit: ContactEdit): ContactRecord {
  const next: Record<string, unknown> = { ...contact };
  for (const field of CONTACT_EDIT_FIELDS) {
    const value = edit[field];
    if (value === undefined) continue;
    const cleaned = cleanField(value);
    if (cleaned === '') {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- 項目名は固定の一覧から取っている
      delete next[field];
    } else {
      next[field] = cleaned;
    }
  }
  next.confirmed = true;
  return next as unknown as ContactRecord;
}

/** 連絡先を編集する。該当する連絡先が無ければ false を返す */
export async function updateContact(
  store: LedgerStore,
  address: string,
  edit: ContactEdit,
): Promise<boolean> {
  const contact = await store.getContact(address);
  if (contact === undefined) return false;
  await store.putContact(editedContact(contact, edit));
  return true;
}

/** 会社（ドメイン）の編集内容 */
export interface CompanyEdit {
  readonly name: string;
  readonly aliases: readonly string[];
}

/**
 * ドメインに会社名と別名を付ける。
 * まだ送ったことのないドメインに名前を付けた場合は、「送ったことがある」扱いにしない（neverSent）。
 */
export async function updateCompany(
  store: LedgerStore,
  companyKey: string,
  edit: CompanyEdit,
  now: string,
): Promise<void> {
  const existing = await store.getCompany(companyKey);
  const name = cleanField(edit.name);
  const aliases = [...new Set(edit.aliases.map(cleanField).filter((alias) => alias !== ''))]
    .filter((alias) => alias !== name)
    .slice(0, MAX_ALIASES);
  const base: CompanyRecord =
    existing === undefined
      ? { companyKey, lastAt: now, neverSent: true }
      : {
          companyKey,
          lastAt: existing.lastAt,
          ...(existing.neverSent === true ? { neverSent: true } : {}),
        };
  await store.putCompany({
    ...base,
    ...(name === '' ? {} : { name }),
    ...(aliases.length === 0 ? {} : { aliases }),
    confirmed: true,
  });
}
