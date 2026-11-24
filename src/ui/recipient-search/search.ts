/**
 * 宛先検索（作成画面のボタンと、検索パネル）。docs/requirements.md「5-5」。
 *
 * 作成画面の下の操作列にボタンを置き、押すと検索パネルを開く。パネルでは台帳を
 * 会社名・ドメイン・氏名・アドレスで検索し、見つかった人を To・Cc に追加できる。
 *
 * - Shadow DOM の中に描画し、Gmail の CSS と干渉させない
 * - 台帳の値（会社名、氏名など）は信頼できない文字列なので、必ず textContent で入れる
 * - Gmail の画面には触らない（宛先欄への追加は、呼び出し側から渡された処理に任せる）
 * - 補助の機能なので、失敗してもパネルの中に表示するだけにする
 */

import {
  type DirectoryCompany,
  type DirectoryPerson,
  searchDirectory,
} from '../../core/ledger/directory';
import { type MessageKey, t } from '../../shared/i18n';
import { createBeam } from '../beam';
import { SEARCH_BUTTON_CSS, SEARCH_PANEL_CSS } from './styles';

/** 作成画面に置いたボタンの目印 */
export const SEARCH_BUTTON_ATTRIBUTE = 'data-gmail-send-guard-search';
/** 検索パネルの目印 */
export const SEARCH_PANEL_ATTRIBUTE = 'data-gmail-send-guard-search-panel';

/** 追加先の宛先欄 */
export type SearchField = 'to' | 'cc';

/** 追加の結果（added = 追加した、already = すでに入っている、busy = 宛先欄に入力中の文字がある） */
export type SearchAddResult = 'added' | 'already' | 'busy';

export interface RecipientSearchOptions {
  /** 押されたボタン（パネルの位置を決めるのに使う） */
  readonly anchor: HTMLElement;
  /** 作成画面（パネルを、作成画面に重ならない位置に置くために使う） */
  readonly beside: HTMLElement;
  /** 台帳を読み、会社ごとにまとめて返す */
  loadDirectory(): Promise<readonly DirectoryCompany[]>;
  /** 宛先欄にアドレスを追加する。追加できなかった場合は reject する */
  add(field: SearchField, address: string): Promise<SearchAddResult>;
  /** パネルを閉じたときに呼ぶ */
  onClose?(): void;
}

export interface RecipientSearchPanel {
  close(): void;
}

/** 一度に表示する会社と人物の上限 */
const MAX_COMPANIES = 10;
const MAX_PEOPLE = 20;

const PANEL_WIDTH = 380;
const PANEL_MAX_HEIGHT = 520;
const PANEL_MIN_HEIGHT = 240;
const GAP = 8;

const ADD_LABELS: Readonly<Record<SearchField, MessageKey>> = {
  to: 'composeSearchAddTo',
  cc: 'composeSearchAddCc',
};

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = doc.createElement(tag);
  if (className !== undefined) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** Shadow DOM を持つ入れ物を作る（ページにはまだ追加しない） */
function createHost(
  doc: Document,
  attribute: string,
  css: string,
): { host: HTMLElement; root: ShadowRoot } {
  const host = doc.createElement('div');
  host.setAttribute(attribute, '');
  const root = host.attachShadow({ mode: 'open' });
  // ページの CSP の影響を受けにくい adoptedStyleSheets を優先し、使えない環境では <style> を使う
  const view = doc.defaultView;
  let adopted = false;
  if (view !== null && typeof view.CSSStyleSheet === 'function') {
    try {
      const sheet = new view.CSSStyleSheet();
      sheet.replaceSync(css);
      root.adoptedStyleSheets = [sheet];
      adopted = true;
    } catch {
      adopted = false;
    }
  }
  if (!adopted) root.append(el(doc, 'style', undefined, css));
  // 中でのキー操作が、Gmail のショートカット（Esc で作成画面を閉じる、など）として処理されないようにする
  for (const type of ['keydown', 'keyup', 'keypress'] as const) {
    host.addEventListener(type, (event) => {
      event.stopPropagation();
    });
  }
  return { host, root };
}

/** 作成画面に置く「宛先を検索」のボタンを作る */
export function createSearchButton(doc: Document, onClick: () => void): HTMLElement {
  const { host, root } = createHost(doc, SEARCH_BUTTON_ATTRIBUTE, SEARCH_BUTTON_CSS);
  const button = el(doc, 'button', undefined, t('composeSearchButton'));
  button.type = 'button';
  button.title = t('composeSearchTitle');
  button.addEventListener('click', onClick);
  root.append(button);
  return host;
}

/** パネルを、作成画面の横（空きが無ければボタンの上か下）に置く */
function place(panel: HTMLElement, options: RecipientSearchOptions): void {
  const view = panel.ownerDocument.defaultView;
  const viewportWidth = view?.innerWidth ?? 1024;
  const viewportHeight = view?.innerHeight ?? 768;
  const compose = options.beside.getBoundingClientRect();
  const button = options.anchor.getBoundingClientRect();
  const width = Math.min(PANEL_WIDTH, viewportWidth - GAP * 2);
  const limit = (height: number): number =>
    Math.max(PANEL_MIN_HEIGHT, Math.min(PANEL_MAX_HEIGHT, height));

  let left: number;
  let style: { top?: number; bottom?: number; maxHeight: number };
  const bottomOfCompose = Math.max(GAP, viewportHeight - compose.bottom);
  if (compose.left >= width + GAP * 2) {
    left = compose.left - width - GAP;
    style = { bottom: bottomOfCompose, maxHeight: limit(viewportHeight - bottomOfCompose - GAP) };
  } else if (viewportWidth - compose.right >= width + GAP * 2) {
    left = compose.right + GAP;
    style = { bottom: bottomOfCompose, maxHeight: limit(viewportHeight - bottomOfCompose - GAP) };
  } else {
    left = Math.max(GAP, Math.min(button.left, viewportWidth - width - GAP));
    const above = button.top - GAP * 2;
    const below = viewportHeight - button.bottom - GAP * 2;
    style =
      above >= below
        ? { bottom: viewportHeight - button.top + GAP, maxHeight: limit(above) }
        : { top: button.bottom + GAP, maxHeight: limit(below) };
  }
  panel.style.width = `${String(width)}px`;
  panel.style.left = `${String(Math.max(GAP, left))}px`;
  panel.style.maxHeight = `${String(style.maxHeight)}px`;
  if (style.top !== undefined) panel.style.top = `${String(style.top)}px`;
  if (style.bottom !== undefined) panel.style.bottom = `${String(style.bottom)}px`;
}

/** 検索パネルを開く */
export function openRecipientSearch(
  doc: Document,
  options: RecipientSearchOptions,
): RecipientSearchPanel {
  const { host, root } = createHost(doc, SEARCH_PANEL_ATTRIBUTE, SEARCH_PANEL_CSS);
  const panel = el(doc, 'div', 'panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', t('composeSearchTitle'));

  const header = el(doc, 'header');
  header.append(el(doc, 'h2', undefined, t('composeSearchTitle')));
  const closeButton = el(doc, 'button', 'close', t('dialogClose'));
  closeButton.type = 'button';
  header.append(closeButton);

  const query = el(doc, 'input', 'query');
  query.type = 'search';
  query.placeholder = t('popupPlaceholder');
  query.setAttribute('aria-label', t('popupPlaceholder'));
  query.autocomplete = 'off';
  query.spellcheck = false;

  const status = el(doc, 'p', 'status');
  status.setAttribute('role', 'status');
  const results = el(doc, 'div', 'results');
  panel.append(createBeam(doc), header, query, status, results);
  root.append(panel);

  let directory: readonly DirectoryCompany[] | undefined;
  let closed = false;

  const showStatus = (message: string, isError = false): void => {
    status.textContent = message;
    status.classList.toggle('error', isError);
  };

  const close = (): void => {
    if (closed) return;
    closed = true;
    host.remove();
    options.onClose?.();
  };

  const addButton = (person: DirectoryPerson, field: SearchField): HTMLButtonElement => {
    const button = el(doc, 'button', 'add', t(ADD_LABELS[field]));
    button.type = 'button';
    button.addEventListener('click', () => {
      button.disabled = true;
      options.add(field, person.address).then(
        (result) => {
          if (result === 'busy') {
            button.disabled = false;
            showStatus(t('composeSearchBusy'), true);
            return;
          }
          button.textContent = t(
            result === 'added' ? 'composeSearchAdded' : 'composeSearchAlready',
          );
          showStatus('');
        },
        (error: unknown) => {
          console.error('[gmail-send-guard] failed to add the recipient', error);
          button.disabled = false;
          showStatus(t('composeSearchFailed'), true);
        },
      );
    });
    return button;
  };

  const personElement = (person: DirectoryPerson): HTMLElement => {
    const row = el(doc, 'div', 'person');
    const who = el(doc, 'div', 'who');
    const heading = [person.name, person.department, person.title].filter((part) => part !== '');
    if (heading.length > 0) who.append(el(doc, 'div', undefined, heading.join(' ')));
    who.append(el(doc, 'div', 'data', person.address));
    row.append(who, addButton(person, 'to'), addButton(person, 'cc'));
    return row;
  };

  const companyElement = (company: DirectoryCompany): HTMLElement => {
    const block = el(doc, 'section', 'company');
    block.append(el(doc, 'h3', undefined, company.label));
    // 会社名が無いときは見出しがドメインなので、ドメインを重ねて出さない
    if (company.named && company.domains.length > 0) {
      block.append(el(doc, 'div', 'data soft', company.domains.join(' / ')));
    }
    for (const person of company.people.slice(0, MAX_PEOPLE)) block.append(personElement(person));
    if (company.people.length > MAX_PEOPLE) {
      block.append(
        el(doc, 'p', 'more', t('popupMore', [String(company.people.length - MAX_PEOPLE)])),
      );
    }
    return block;
  };

  const render = (): void => {
    if (directory === undefined) return;
    if (directory.length === 0) {
      results.replaceChildren();
      showStatus(t('popupEmpty'));
      return;
    }
    if (query.value.trim() === '') {
      results.replaceChildren();
      showStatus(t('popupHint'));
      return;
    }
    const found = searchDirectory(directory, query.value);
    results.replaceChildren(...found.slice(0, MAX_COMPANIES).map(companyElement));
    if (found.length === 0) showStatus(t('popupNoMatch'));
    else if (found.length > MAX_COMPANIES) {
      showStatus(t('popupMore', [String(found.length - MAX_COMPANIES)]));
    } else showStatus('');
  };

  query.addEventListener('input', render);
  closeButton.addEventListener('click', close);
  panel.addEventListener('keydown', (event) => {
    // 変換中の Esc は、変換の取り消しに使う
    if (event.key === 'Escape' && !event.isComposing) {
      event.preventDefault();
      close();
    }
  });

  doc.documentElement.append(host);
  place(panel, options);
  query.focus();

  options.loadDirectory().then(
    (loaded) => {
      directory = loaded;
      render();
    },
    (error: unknown) => {
      console.error('[gmail-send-guard] failed to read the ledger', error);
      showStatus(t('manageFailed'), true);
    },
  );

  return { close };
}
