/**
 * 会社名検索のポップアップのスクリプト（ビルド後は dist/popup.js）。フェーズ2c。
 *
 * 拡張機能のアイコンを押すと開く。台帳を、会社名・ドメイン・氏名・アドレスで検索し、
 * 会社 → ドメイン → 人物の順に表示する。やりとりの回数は表示しない。
 *
 * 台帳は background 側の IndexedDB にあるため、メッセージで読み取る。外部には通信しない。
 */

import {
  type ContactRole,
  type DirectoryCompany,
  type DirectoryPerson,
  buildDirectory,
  searchDirectory,
} from '../core/ledger/directory';
import { applyMessages, byId, dateOf, el } from '../pages/page';
import { type MessageKey, t } from '../shared/i18n';
import { listLedger } from '../shared/ledger-client';

/** 一度に表示する会社と人物の上限（ポップアップは狭いため） */
const MAX_COMPANIES = 10;
const MAX_PEOPLE = 20;

const ROLE_LABELS: Readonly<Record<Exclude<ContactRole, 'none'>, MessageKey>> = {
  to: 'directoryRoleTo',
  cc: 'directoryRoleCc',
  both: 'directoryRoleBoth',
};

let directory: readonly DirectoryCompany[] = [];

function showStatus(message: string, isError = false): void {
  const status = byId('status');
  status.textContent = message;
  status.classList.toggle('error', isError);
}

function personElement(person: DirectoryPerson): HTMLElement {
  const block = el('div', 'person');
  const heading = [person.name, person.department, person.title].filter((part) => part !== '');
  if (heading.length > 0) block.append(el('div', undefined, heading.join(' ')));

  const line = el('div', 'person-line');
  line.append(el('span', 'data', person.address));
  const copy = el('button', 'small', t('popupCopy'));
  copy.type = 'button';
  copy.addEventListener('click', () => {
    navigator.clipboard.writeText(person.address).then(
      () => {
        copy.textContent = t('popupCopied');
      },
      (error: unknown) => {
        console.error('[gmail-send-guard] failed to copy the address', error);
      },
    );
  });
  line.append(copy);
  block.append(line);

  const details = [person.phone, person.mobile].filter((part) => part !== '');
  if (person.role !== 'none') details.push(t(ROLE_LABELS[person.role]));
  details.push(t('manageLastAt', [dateOf(person.lastAt)]));
  block.append(el('div', 'soft', details.join(' / ')));
  return block;
}

function companyElement(company: DirectoryCompany): HTMLElement {
  const block = el('section', 'company');
  block.append(el('h2', undefined, company.label));
  // 会社名が無いときは見出しがドメインなので、ドメインを重ねて出さない
  if (company.named && company.domains.length > 0) {
    block.append(el('div', 'data', company.domains.join(' / ')));
  }
  if (company.aliases.length > 0) {
    block.append(el('div', 'soft', t('popupAliases', [company.aliases.join('、')])));
  }
  if (company.related.length > 0) {
    block.append(el('div', 'soft', t('popupRelated', [company.related.join('、')])));
  }
  for (const person of company.people.slice(0, MAX_PEOPLE)) block.append(personElement(person));
  if (company.people.length > MAX_PEOPLE) {
    block.append(el('p', 'soft', t('popupMore', [String(company.people.length - MAX_PEOPLE)])));
  }
  return block;
}

function render(): void {
  const query = byId<HTMLInputElement>('query').value;
  const results = byId('results');
  if (directory.length === 0) {
    results.replaceChildren();
    showStatus(t('popupEmpty'));
    return;
  }
  if (query.trim() === '') {
    results.replaceChildren();
    showStatus(t('popupHint'));
    return;
  }
  const found = searchDirectory(directory, query);
  results.replaceChildren(...found.slice(0, MAX_COMPANIES).map(companyElement));
  if (found.length === 0) showStatus(t('popupNoMatch'));
  else if (found.length > MAX_COMPANIES) {
    showStatus(t('popupMore', [String(found.length - MAX_COMPANIES)]));
  } else showStatus('');
}

function openPage(path: string): void {
  chrome.tabs.create({ url: chrome.runtime.getURL(path) }).catch((error: unknown) => {
    console.error('[gmail-send-guard] failed to open the page', error);
  });
}

function init(): void {
  applyMessages('popupTitle');
  byId('query').addEventListener('input', render);
  byId('openManage').addEventListener('click', () => {
    openPage('manage.html');
  });
  byId('openOptions').addEventListener('click', () => {
    chrome.runtime.openOptionsPage().catch((error: unknown) => {
      console.error('[gmail-send-guard] failed to open the options page', error);
    });
  });
  listLedger()
    .then((snapshot) => {
      directory = buildDirectory(snapshot.contacts, snapshot.companies, snapshot.ccPairs);
      render();
    })
    .catch((error: unknown) => {
      console.error('[gmail-send-guard] failed to read the ledger', error);
      showStatus(t('manageFailed'), true);
    });
}

document.addEventListener('DOMContentLoaded', init);
