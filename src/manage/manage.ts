/**
 * 台帳の画面のスクリプト（ビルド後は dist/manage.js）。フェーズ2c。
 *
 * - 連絡先の一覧と編集（氏名、会社名、部署・役職、電話番号）、1件ずつの削除
 * - ドメインごとの会社名・別名の登録
 * - CSV の書き出し・取り込み
 *
 * 台帳は background 側の IndexedDB にあるため、メッセージで読み書きを依頼する。
 * すべての記録の削除と、記録の有効・無効は、設定画面にある。
 * 外部には通信しない。CSV は、利用者が選んだファイルを端末の中で読むだけ。
 */

import { MAX_IMPORT_CHARACTERS, parseCsv, toCsv } from '../core/ledger/csv';
import { companyNameOf, companySearchKey, searchKey } from '../core/ledger/directory';
import type { CompanyRecord, ContactRecord } from '../core/ledger/ledger';
import { applyMessages, armButton, byId, dateOf, el } from '../pages/page';
import { type MessageKey, t } from '../shared/i18n';
import {
  deleteLedgerContact,
  importLedgerRows,
  listLedger,
  updateLedgerCompany,
  updateLedgerContact,
} from '../shared/ledger-client';
import type { LedgerSnapshot } from '../shared/messages';

/** 一度に画面へ出す件数の上限（多すぎると画面が重くなるため、絞り込みを促す） */
const MAX_ROWS = 200;

/** 別名の区切り（読点・カンマ） */
const ALIAS_SEPARATOR = /[、,，]/u;

let snapshot: LedgerSnapshot = { contacts: [], companies: [], ccPairs: [] };

function showStatus(message: string, isError = false): void {
  const status = byId('status');
  status.textContent = message;
  status.classList.toggle('error', isError);
}

function fail(error: unknown): void {
  console.error('[gmail-send-guard] ledger page failed', error);
  showStatus(t('manageFailed'), true);
}

/** ラベル付きの入力欄を作る */
function field(labelKey: MessageKey, value: string, placeholder = ''): HTMLInputElement {
  const input = el('input');
  input.type = 'text';
  input.value = value;
  input.placeholder = placeholder;
  input.maxLength = 200;
  input.spellcheck = false;
  input.dataset.label = t(labelKey);
  return input;
}

function wrap(input: HTMLInputElement): HTMLLabelElement {
  const label = el('label');
  label.append(el('span', undefined, input.dataset.label ?? ''), input);
  return label;
}

/** ドメイン1件の行（会社名・別名の登録） */
function companyRow(companyKey: string, company: CompanyRecord | undefined): HTMLElement {
  const row = el('div', 'row');
  const head = el('div', 'row-head');
  head.append(el('span', 'data', companyKey));
  row.append(head);

  const name = field('manageCompanyName', company?.name ?? '');
  const aliases = field('manageAliases', (company?.aliases ?? []).join('、'));
  const fields = el('div', 'fields');
  fields.append(wrap(name), wrap(aliases));
  row.append(fields);

  const save = el('button', 'small', t('manageSave'));
  save.type = 'button';
  save.addEventListener('click', () => {
    updateLedgerCompany(companyKey, {
      name: name.value,
      aliases: aliases.value.split(ALIAS_SEPARATOR),
    })
      .then(() => reload(t('manageSaved')))
      .catch(fail);
  });
  const actions = el('div', 'row-actions');
  actions.append(save);
  row.append(actions);
  return row;
}

/** 連絡先1件の行（編集と削除） */
function contactRow(
  contact: ContactRecord,
  companies: ReadonlyMap<string, CompanyRecord>,
): HTMLElement {
  const row = el('div', 'row');
  const head = el('div', 'row-head');
  head.append(
    el('span', 'data', contact.address),
    el('span', 'badge', t(contact.confirmed === true ? 'manageBadgeConfirmed' : 'manageBadgeAuto')),
    el('span', 'soft', t('manageLastAt', [dateOf(contact.lastAt)])),
  );
  row.append(head);

  const name = field('manageName', contact.name ?? '', contact.displayName ?? '');
  // 連絡先ごとの会社名が無いときは、ドメインに付けた会社名を薄く表示する
  const domainCompany = companies.get(contact.companyKey)?.name ?? '';
  const company = field('manageOwnCompany', contact.companyName ?? '', domainCompany);
  const department = field('manageDepartment', contact.department ?? '');
  const title = field('manageFieldTitle', contact.title ?? '');
  const phone = field('managePhone', contact.phone ?? '');
  const mobile = field('manageMobile', contact.mobile ?? '');
  const fields = el('div', 'fields');
  fields.append(
    wrap(name),
    wrap(company),
    wrap(department),
    wrap(title),
    wrap(phone),
    wrap(mobile),
  );
  row.append(fields);

  const save = el('button', 'small', t('manageSave'));
  save.type = 'button';
  save.addEventListener('click', () => {
    updateLedgerContact(contact.address, {
      name: name.value,
      companyName: company.value,
      department: department.value,
      title: title.value,
      phone: phone.value,
      mobile: mobile.value,
    })
      .then(() => reload(t('manageSaved')))
      .catch(fail);
  });
  const remove = el('button', 'small danger');
  remove.type = 'button';
  armButton(remove, t('manageDelete'), t('manageDeleteConfirm'), () => {
    deleteLedgerContact(contact.address)
      .then(() => reload(t('manageDeleted')))
      .catch(fail);
  });
  const actions = el('div', 'row-actions');
  actions.append(save, remove);
  row.append(actions);
  return row;
}

/** 絞り込みの語に一致する連絡先か */
function matches(
  contact: ContactRecord,
  companies: ReadonlyMap<string, CompanyRecord>,
  key: string,
  companyKey: string,
): boolean {
  if (key === '') return true;
  const company = companies.get(contact.companyKey);
  const names = [companyNameOf(contact, companies) ?? '', ...(company?.aliases ?? [])];
  return (
    contact.address.includes(key) ||
    searchKey(contact.name ?? '').includes(key) ||
    searchKey(contact.displayName ?? '').includes(key) ||
    searchKey(contact.department ?? '').includes(key) ||
    names.some((name) => name !== '' && companySearchKey(name).includes(companyKey))
  );
}

function render(): void {
  const query = byId<HTMLInputElement>('filter').value;
  const key = searchKey(query);
  const companyKey = companySearchKey(query);
  const companies = new Map(snapshot.companies.map((company) => [company.companyKey, company]));

  const contacts = snapshot.contacts
    .filter((contact) => matches(contact, companies, key, companyKey))
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt) || a.address.localeCompare(b.address));
  const shown = contacts.slice(0, MAX_ROWS);

  // 会社の欄には、表示している連絡先のドメインを出す（フリーメールの相手はドメインを持たない）
  const domains = [...new Set(shown.map((contact) => contact.companyKey))]
    .filter((domain) => !domain.includes('@'))
    .sort();

  byId('companies').replaceChildren(
    ...domains.map((domain) => companyRow(domain, companies.get(domain))),
  );
  byId('contacts').replaceChildren(...shown.map((contact) => contactRow(contact, companies)));

  const summary = byId('summary');
  if (snapshot.contacts.length === 0) summary.textContent = t('manageEmpty');
  else if (contacts.length === 0) summary.textContent = t('manageNoMatch');
  else if (contacts.length > shown.length) {
    summary.textContent = t('manageTruncated', [String(shown.length), String(contacts.length)]);
  } else summary.textContent = t('manageCount', [String(contacts.length)]);
}

async function reload(message = ''): Promise<void> {
  snapshot = await listLedger();
  render();
  showStatus(message);
}

/** CSV を書き出す（端末の中でファイルを作って保存するだけで、外部には送らない） */
function exportCsv(): void {
  const csv = toCsv(snapshot.contacts, snapshot.companies);
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = el('a');
  link.href = url;
  link.download = `send-check-contacts-${dateOf(new Date().toISOString())}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  showStatus(t('manageExported', [String(snapshot.contacts.length)]));
}

async function importCsv(file: File): Promise<void> {
  // 文字数の上限の前に、ファイルの大きさでも確かめる（UTF-8 は1文字が最大4バイト）
  if (file.size > MAX_IMPORT_CHARACTERS * 4) {
    showStatus(t('manageImportTooLarge'), true);
    return;
  }
  const parsed = parseCsv(await file.text());
  if (!parsed.ok) {
    showStatus(
      t(parsed.reason === 'noHeader' ? 'manageImportNoHeader' : 'manageImportTooLarge'),
      true,
    );
    return;
  }
  const result = await importLedgerRows(parsed.rows);
  await reload(
    t('manageImported', [String(result.added), String(result.updated), String(parsed.skipped)]),
  );
}

function init(): void {
  applyMessages('manageTitle');
  byId('export').addEventListener('click', exportCsv);
  const fileInput = byId<HTMLInputElement>('importFile');
  byId('import').addEventListener('click', () => {
    fileInput.click();
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    // 同じファイルをもう一度選べるように、選択を空に戻す
    fileInput.value = '';
    if (file === undefined) return;
    importCsv(file).catch(fail);
  });
  byId('filter').addEventListener('input', render);
  reload().catch(fail);
}

document.addEventListener('DOMContentLoaded', init);
