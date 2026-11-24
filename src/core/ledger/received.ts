/**
 * 届いたメールからの、台帳の補完（フェーズ2b）の、純粋な処理の部分。
 *
 * 画面に開いたメールから読み取った情報（送信元、いっしょに宛先に入っていた人、署名）で、
 * 台帳の連絡先を補う。記録するのは、次の場合だけ。
 * - 送信元が、すでに台帳にある相手（利用者が送ったことのある相手など）のとき
 *   → その相手の氏名・会社名・部署・役職・電話番号を補う
 * - そのメールの宛先に入っていた人のうち、送ったことのある会社のドメインの人
 *   → 連絡先として足す（フリーメールの人は足さない）
 * 台帳に無い相手から届いたメール（メールマガジンなど）は、何も記録しない。
 *
 * 利用者が確認・修正した連絡先（確定）は、空いている項目だけを補い、入力済みの項目は書き換えない。
 * 自動で記録した項目は最新の署名で上書きし、変更前の値を履歴に残す。
 * 最終やりとり日とやりとりの回数は変えない（メールを開いただけでは、保存期間を延ばさない）。
 */

import { companyKeyOf } from '../classify';
import { normalizeAddress } from '../text/address';
import { companySearchKey } from '../text/company';
import { cleanField } from './directory';
import type { ContactHistoryEntry, ContactRecord, LedgerStore } from './ledger';
import type { SignatureInfo } from './signature';

/** 履歴に残す件数の上限（古いものから捨てる） */
export const MAX_HISTORY = 10;

/** 1通のメールから足す連絡先の上限 */
export const MAX_RECEIVED_OTHERS = 50;

export interface ReceivedPerson {
  readonly address: string;
  /** 表示名。無ければ省略 */
  readonly name?: string;
}

/** 画面に開いたメール1通から読み取った情報（content 側で作り、background に渡す） */
export interface ReceivedMail {
  readonly sender: ReceivedPerson;
  /** 宛先（To・Cc）に入っていた人。社内の人は含めない */
  readonly others: readonly ReceivedPerson[];
  readonly signature: SignatureInfo;
}

type AutoField = 'name' | 'companyName' | 'department' | 'title' | 'phone' | 'mobile';

/** 表示名を氏名として使えるか（アドレスがそのまま入っている表示名は使わない） */
function usableName(name: string | undefined): string {
  const cleaned = cleanField(name ?? '');
  return cleaned.includes('@') ? '' : cleaned;
}

/** 自動で読み取った値を連絡先に反映する。変わったときは、変更後の記録を返す */
function applyAuto(
  contact: ContactRecord,
  values: Partial<Record<AutoField, string>>,
  at: string,
): ContactRecord | undefined {
  const next: Record<string, unknown> = { ...contact };
  const history: ContactHistoryEntry[] = [...(contact.history ?? [])];
  let changed = false;
  for (const field of Object.keys(values) as AutoField[]) {
    const value = cleanField(values[field] ?? '');
    const current = contact[field];
    if (value === '' || value === current) continue;
    if (current !== undefined && current !== '') {
      // 利用者が確認・修正した連絡先の、入力済みの項目は書き換えない
      if (contact.confirmed === true) continue;
      history.push({ at, field, value: current });
    }
    next[field] = value;
    changed = true;
  }
  if (!changed) return undefined;
  if (history.length > 0) next.history = history.slice(-MAX_HISTORY);
  return next as unknown as ContactRecord;
}

/** 届いたメール1通の情報で、台帳を補う。台帳を書き換えたら true */
export async function recordReceived(
  store: LedgerStore,
  mail: ReceivedMail,
  at: string,
): Promise<boolean> {
  const senderAddress = normalizeAddress(mail.sender.address);
  const contact = await store.getContact(senderAddress);
  // 台帳に無い相手から届いたメールは、何も記録しない
  if (contact === undefined) return false;
  let changed = false;

  const values: Partial<Record<AutoField, string>> = {};
  // 氏名は、まだ無いときだけ表示名から補う（表示名は署名ほど確かではないので、上書きには使わない）
  const senderName = usableName(mail.sender.name);
  if (senderName !== '' && (contact.name === undefined || contact.name === '')) {
    values.name = senderName;
  }
  const { companyName, department, title, phone, mobile } = mail.signature;
  if (department !== undefined) values.department = department;
  if (title !== undefined) values.title = title;
  if (phone !== undefined) values.phone = phone;
  if (mobile !== undefined) values.mobile = mobile;

  const signatureCompany = cleanField(companyName ?? '');
  if (signatureCompany !== '') {
    // フリーメールの相手は、ドメインと会社を紐づけず、連絡先ごとに会社名を持たせる
    const freemail = contact.companyKey.includes('@');
    const company = freemail ? undefined : await store.getCompany(contact.companyKey);
    if (freemail) {
      values.companyName = signatureCompany;
    } else if (company !== undefined && (company.name === undefined || company.name === '')) {
      await store.putCompany({ ...company, name: signatureCompany });
      changed = true;
    } else if (
      company?.name !== undefined &&
      companySearchKey(company.name) !== companySearchKey(signatureCompany) &&
      !(company.aliases ?? []).some(
        (alias) => companySearchKey(alias) === companySearchKey(signatureCompany),
      )
    ) {
      // ドメインの会社名と違う会社名のときは、ドメインの会社名は変えず、この連絡先だけの会社名にする
      values.companyName = signatureCompany;
    }
  }

  const updated = applyAuto(contact, values, at);
  if (updated !== undefined) {
    await store.putContact(updated);
    changed = true;
  }

  // 宛先に入っていた人のうち、送ったことのある会社のドメインの人を足す
  const seen = new Set<string>([senderAddress]);
  for (const other of mail.others.slice(0, MAX_RECEIVED_OTHERS)) {
    const address = normalizeAddress(other.address);
    if (seen.has(address)) continue;
    seen.add(address);
    const companyKey = companyKeyOf(address);
    if (companyKey.includes('@')) continue;
    const company = await store.getCompany(companyKey);
    if (company === undefined || company.neverSent === true) continue;
    if ((await store.getContact(address)) !== undefined) continue;
    const name = usableName(other.name);
    await store.putContact({
      address,
      companyKey,
      toCount: 0,
      ccCount: 0,
      // 最終やりとり日は、その会社との最終やりとり日に合わせる（保存期間を延ばさない）
      lastAt: company.lastAt,
      ...(name === '' ? {} : { name }),
    });
    changed = true;
  }
  return changed;
}
