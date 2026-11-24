/**
 * 台帳の CSV の書き出し・取り込み（フェーズ2c）の、純粋な処理の部分。
 *
 * 端末間の自動同期はしないので、別の端末へ移すときは CSV を使う（docs/requirements.md「7. 非機能要件」）。
 *
 * 列：メールアドレス、氏名、会社名、部署、役職、電話番号、携帯番号、最終やりとり日
 * - 取り込みでは、1行目の見出しで列を見分ける（列の順番は問わない。英語の見出しも受け付ける）
 * - 「最終やりとり日」は書き出すだけで、取り込みでは使わない
 * - やりとりの回数は書き出さない（判断にだけ使う情報のため）
 *
 * CSV は外から持ち込まれるファイルなので、取り込む値は信頼しない。
 * アドレスの形を確かめ、長さと件数を制限し、制御文字を取り除く。
 */

import { isFreemailDomain } from '../freemail';
import { domainOf, looksLikeAddress, normalizeAddress } from '../text/address';
import { companyKeyOf } from '../classify';
import {
  type ContactEdit,
  cleanField,
  companyNameOf,
  companySearchKey,
  editedContact,
} from './directory';
import type { CompanyRecord, ContactRecord, LedgerStore } from './ledger';

/** 1回の取り込みで受け付ける最大行数 */
export const MAX_IMPORT_ROWS = 5000;

/** 取り込むファイルの最大文字数 */
export const MAX_IMPORT_CHARACTERS = 2_000_000;

/** CSV の列（書き出しの順番） */
const COLUMNS = [
  { field: 'address', header: 'メールアドレス', aliases: ['address', 'email', 'e-mail', 'mail'] },
  { field: 'name', header: '氏名', aliases: ['name', '名前'] },
  { field: 'companyName', header: '会社名', aliases: ['company', '会社'] },
  { field: 'department', header: '部署', aliases: ['department'] },
  { field: 'title', header: '役職', aliases: ['title'] },
  { field: 'phone', header: '電話番号', aliases: ['phone', 'tel', '電話'] },
  { field: 'mobile', header: '携帯番号', aliases: ['mobile', '携帯', '携帯電話'] },
  { field: 'lastAt', header: '最終やりとり日', aliases: ['last', 'lastat'] },
] as const;

type ColumnField = (typeof COLUMNS)[number]['field'];

/** 取り込む1行分 */
export interface ImportRow {
  readonly address: string;
  readonly name: string;
  readonly companyName: string;
  readonly department: string;
  readonly title: string;
  readonly phone: string;
  readonly mobile: string;
}

/** CSV を読んだ結果 */
export type CsvParseResult =
  | {
      readonly ok: true;
      readonly rows: readonly ImportRow[];
      /** アドレスの形が正しくないために読み飛ばした行の数 */
      readonly skipped: number;
    }
  | {
      readonly ok: false;
      /** noHeader：見出しにメールアドレスの列が無い／tooLarge：大きすぎる */
      readonly reason: 'noHeader' | 'tooLarge';
    };

/**
 * 表計算ソフトで開いたときに、値が数式として実行されないようにする。
 * =、+、-、@ で始まる値は、先頭に ' を付ける（電話番号の +81 なども対象になる）。
 */
function guardFormula(value: string): string {
  return /^[=+\-@\t\r]/u.test(value) ? `'${value}` : value;
}

/** 書き出しのときに付けた ' を取り除く */
function unguardFormula(value: string): string {
  return /^'[=+\-@]/u.test(value) ? value.slice(1) : value;
}

function quote(value: string): string {
  return `"${guardFormula(value).replaceAll('"', '""')}"`;
}

/** 台帳の記録を CSV にする（先頭に BOM を付け、表計算ソフトで文字化けしないようにする） */
export function toCsv(
  contacts: readonly ContactRecord[],
  companies: readonly CompanyRecord[],
): string {
  const companyByKey = new Map(companies.map((company) => [company.companyKey, company]));
  const lines = [COLUMNS.map((column) => quote(column.header)).join(',')];
  const sorted = [...contacts].sort((a, b) => a.address.localeCompare(b.address));
  for (const contact of sorted) {
    const values: Record<ColumnField, string> = {
      address: contact.address,
      name: contact.name ?? contact.displayName ?? '',
      companyName: companyNameOf(contact, companyByKey) ?? '',
      department: contact.department ?? '',
      title: contact.title ?? '',
      phone: contact.phone ?? '',
      mobile: contact.mobile ?? '',
      lastAt: contact.lastAt.slice(0, 10),
    };
    lines.push(COLUMNS.map((column) => quote(values[column.field])).join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** CSV の文字列を、行と列に分ける（" で囲んだ値の中のカンマ・改行・"" に対応） */
export function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  const source = text.startsWith('﻿') ? text.slice(1) : text;
  for (let index = 0; index < source.length; index++) {
    const character = source.charAt(index);
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          value += '"';
          index++;
        } else {
          quoted = false;
        }
      } else {
        value += character;
      }
      continue;
    }
    if (character === '"' && value === '') {
      quoted = true;
    } else if (character === ',') {
      row.push(value);
      value = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && source[index + 1] === '\n') index++;
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else {
      value += character;
    }
  }
  if (value !== '' || row.length > 0) {
    row.push(value);
    rows.push(row);
  }
  // 空行（値がすべて空）は除く
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

function fieldOfHeader(header: string): ColumnField | undefined {
  const key = header.trim().toLowerCase();
  return COLUMNS.find(
    (column) => column.header === key || (column.aliases as readonly string[]).includes(key),
  )?.field;
}

/** CSV を読んで、取り込む行にする */
export function parseCsv(text: string): CsvParseResult {
  if (text.length > MAX_IMPORT_CHARACTERS) return { ok: false, reason: 'tooLarge' };
  const table = splitCsv(text);
  const header = table[0];
  if (header === undefined) return { ok: false, reason: 'noHeader' };
  const fields = header.map(fieldOfHeader);
  if (!fields.includes('address')) return { ok: false, reason: 'noHeader' };
  if (table.length - 1 > MAX_IMPORT_ROWS) return { ok: false, reason: 'tooLarge' };

  const rows: ImportRow[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const cells of table.slice(1)) {
    const values: Partial<Record<ColumnField, string>> = {};
    fields.forEach((field, index) => {
      if (field !== undefined) values[field] = cleanField(unguardFormula(cells[index] ?? ''));
    });
    const address = normalizeAddress(values.address ?? '');
    if (!looksLikeAddress(address) || address.length > 254 || seen.has(address)) {
      skipped++;
      continue;
    }
    seen.add(address);
    rows.push({
      address,
      name: values.name ?? '',
      companyName: values.companyName ?? '',
      department: values.department ?? '',
      title: values.title ?? '',
      phone: values.phone ?? '',
      mobile: values.mobile ?? '',
    });
  }
  return { ok: true, rows, skipped };
}

/** 取り込みの結果 */
export interface ImportResult {
  /** 新しく追加した連絡先の数 */
  readonly added: number;
  /** すでにあった連絡先を更新した数 */
  readonly updated: number;
}

/**
 * 取り込む行を台帳に反映する。
 * - すでにある連絡先は、CSV に値がある項目だけを上書きする（空の項目で消さない）
 * - 新しい連絡先は、送った回数 0、最終やりとり日は取り込んだ日時にする
 * - 会社名は、ドメインにまだ会社名が無ければドメインに付ける。
 *   別の会社名がすでに付いている場合と、フリーメールの相手は、連絡先ごとの会社名にする
 * - 取り込んだだけのドメインは「送ったことがある」扱いにしない
 */
export async function importRows(
  store: LedgerStore,
  rows: readonly ImportRow[],
  now: string,
): Promise<ImportResult> {
  let added = 0;
  let updated = 0;
  for (const row of rows) {
    const companyKey = companyKeyOf(row.address);
    const existing = await store.getContact(row.address);
    const base: ContactRecord = existing ?? {
      address: row.address,
      companyKey,
      toCount: 0,
      ccCount: 0,
      lastAt: now,
    };

    let ownCompanyName: string | undefined;
    if (row.companyName !== '') {
      if (isFreemailDomain(domainOf(row.address)) || companyKey.includes('@')) {
        ownCompanyName = row.companyName;
      } else {
        const company = await store.getCompany(companyKey);
        if (company?.name === undefined || company.name === '') {
          await store.putCompany({
            ...(company ?? { companyKey, lastAt: now, neverSent: true }),
            name: row.companyName,
            confirmed: true,
          });
        } else if (companySearchKey(company.name) !== companySearchKey(row.companyName)) {
          ownCompanyName = row.companyName;
        }
      }
    }

    const edit: { -readonly [K in keyof ContactEdit]: string } = {};
    for (const field of ['name', 'department', 'title', 'phone', 'mobile'] as const) {
      if (row[field] !== '') edit[field] = row[field];
    }
    if (ownCompanyName !== undefined) edit.companyName = ownCompanyName;
    await store.putContact(editedContact(base, edit));
    if (existing === undefined) added++;
    else updated++;
  }
  return { added, updated };
}
