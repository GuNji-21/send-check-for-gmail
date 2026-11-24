/**
 * Gmail の作成画面の読み取りと操作。
 * 対象：新規作成、返信、全員に返信、転送、インライン返信、ポップアウト、全画面表示。
 *
 * 作成画面の DOM から送信元・宛先（To/Cc/Bcc）・件名・本文・添付を読み取り、
 * src/core/ に渡すための ComposeSnapshot に変換する。
 * Gmail の DOM を直接触るのは src/gmail/ の中だけにする。
 *
 * - 本文は、返信・転送時の引用部分（過去メール）を取り除いてから bodyText に入れる
 * - 送信元アドレスは作成画面ごとに読み取る（複数アカウント・別名送信に対応するため）
 * - 送信元を含め、必要な要素が見つからない場合は例外を投げる
 *   （呼び出し側で「チェックできませんでした」として送信を止める）
 */

import { fitSuggestion } from '../core/typo/typo-check';
import type { Attachment, ComposeSnapshot, Recipient, RecipientField } from '../core/types';
import { DRIVE_HOSTS, SELECTORS, recipientFieldSelector } from './selectors';

const FIELDS: readonly RecipientField[] = ['to', 'cc', 'bcc'];

/** Gmail の画面から必要な要素を読み取れなかったときのエラー */
export class GmailStructureError extends Error {
  constructor(what: string) {
    super(`Gmail structure not recognized: ${what}`);
    this.name = 'GmailStructureError';
  }
}

/** ページ内で開いている作成画面の要素を列挙する */
export function findComposeWindows(root: ParentNode): readonly HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(SELECTORS.compose)].filter(
    (compose) => compose.querySelector(SELECTORS.subject) !== null,
  );
}

/** 要素が属する作成画面を返す（作成画面の中でなければ null） */
export function findComposeOf(element: Element): HTMLElement | null {
  return element.closest<HTMLElement>(SELECTORS.compose);
}

/**
 * 本文の編集欄や件名の入力欄の中にいるのに、作成画面として認識できない状態かどうか。
 * Gmail の画面構造が変わって送信を捕捉できなくなったことに気づくために使う。
 */
export function isUnrecognizedCompose(element: Element): boolean {
  const inEditor =
    element.closest(SELECTORS.body) !== null || element.closest(SELECTORS.subject) !== null;
  return inEditor && findComposeOf(element) === null;
}

/** 作成画面の送信ボタンを返す。見つからなければ例外 */
export function findSendButton(compose: HTMLElement): HTMLElement {
  const button =
    compose.querySelector<HTMLElement>(SELECTORS.sendButton) ??
    compose.querySelector<HTMLElement>(SELECTORS.sendButtonByShortcutHint);
  if (button === null) throw new GmailStructureError('send button');
  return button;
}

/** 送信操作の対象になった要素の種類 */
export interface SendTarget {
  /** button = 送信ボタン、schedule = 「送信日時を設定」のメニュー項目 */
  readonly kind: 'button' | 'schedule';
  readonly compose: HTMLElement;
  /** 送信ボタン、またはメニュー項目の要素 */
  readonly element: HTMLElement;
}

/** イベントの発生元が送信ボタン・予約送信のメニュー項目なら、その情報を返す */
export function findSendTarget(target: EventTarget | null): SendTarget | null {
  // content script と Gmail のページでは Element の実体が異なる場合があるため、instanceof では判定しない
  if (target === null || typeof (target as Partial<Element>).closest !== 'function') return null;
  const element = target as Element;
  const compose = findComposeOf(element);
  if (compose === null) return null;

  const schedule = element.closest<HTMLElement>(SELECTORS.scheduleMenuItem);
  if (schedule !== null) return { kind: 'schedule', compose, element: schedule };

  const button =
    element.closest<HTMLElement>(SELECTORS.sendButton) ??
    element.closest<HTMLElement>(SELECTORS.sendButtonByShortcutHint);
  if (button !== null) return { kind: 'button', compose, element: button };
  return null;
}

/**
 * キー操作（Enter・Space）の発生元から、送信操作の対象を返す。
 * - 送信ボタンにフォーカスがある状態で押した場合は、送信ボタン
 * - 送信オプションのメニュー（項目は「送信日時を設定」だけ）を開いた状態で押した場合は、予約送信の項目
 *   （メニューはキー操作中もボタン側にフォーカスが残ることがあるため、開いているボタンも対象にする）
 */
export function findSendTargetForKey(target: EventTarget | null): SendTarget | null {
  const direct = findSendTarget(target);
  if (direct !== null) return direct;
  if (target === null || typeof (target as Partial<Element>).closest !== 'function') return null;
  const element = target as Element;
  const compose = findComposeOf(element);
  if (compose === null) return null;

  const menu = element.closest(SELECTORS.menu);
  const menuButton = element.closest(SELECTORS.scheduleMenuButton);
  const inOpenScheduleMenu =
    (menu !== null && menu.querySelector(SELECTORS.scheduleMenuItem) !== null) ||
    menuButton?.getAttribute('aria-expanded') === 'true';
  if (!inOpenScheduleMenu) return null;
  const item = compose.querySelector<HTMLElement>(SELECTORS.scheduleMenuItem);
  return item === null ? null : { kind: 'schedule', compose, element: item };
}

/**
 * 要素をマウスで押したのと同じ一連のイベントを発生させる。
 * Gmail のボタンは click だけでなく mousedown・mouseup に反応するものがあるため、すべて送る。
 */
export function activateElement(element: HTMLElement): void {
  const view = element.ownerDocument.defaultView;
  if (view === null) throw new GmailStructureError('window of the element');
  for (const type of ['mousedown', 'mouseup', 'click'] as const) {
    element.dispatchEvent(
      new view.MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }),
    );
  }
}

/** 文字列からメールアドレスらしい部分を取り出す */
function extractAddresses(text: string): string[] {
  return text.match(/[^\s<>,;"']+@[^\s<>,;"']+\.[^\s<>,;"']+/g) ?? [];
}

function readRecipients(compose: HTMLElement): Recipient[] {
  const recipients: Recipient[] = [];
  for (const field of FIELDS) {
    const container = compose.querySelector<HTMLElement>(recipientFieldSelector(field));
    if (container === null) {
      // To の欄は必ずある。Cc / Bcc は、開いていない場合に欄そのものが無いことがある
      if (field === 'to') throw new GmailStructureError('recipient field "to"');
      continue;
    }
    for (const chip of container.querySelectorAll<HTMLElement>(SELECTORS.recipientChip)) {
      const address = chip.getAttribute('data-hovercard-id')?.trim() ?? '';
      if (address === '') throw new GmailStructureError(`recipient chip address (${field})`);
      const displayName = chip.getAttribute('data-name')?.trim() ?? '';
      recipients.push(displayName === '' ? { address, field } : { address, displayName, field });
    }
    // まだチップになっていない入力中のアドレスも、送信時に宛先になるため含める
    const typed = container.querySelector<HTMLInputElement>(SELECTORS.recipientInput)?.value ?? '';
    for (const address of extractAddresses(typed)) {
      recipients.push({ address, field });
    }
  }
  return recipients;
}

function readFromAddress(compose: HTMLElement): string {
  const fromInput = compose.querySelector<HTMLInputElement>(SELECTORS.from);
  const value = fromInput?.value.trim() ?? '';
  const address = extractAddresses(value)[0];
  if (address === undefined) throw new GmailStructureError('from address');
  return address;
}

/** ブロック要素（前後で改行になる要素） */
const BLOCK_TAGS: ReadonlySet<string> = new Set([
  'div',
  'p',
  'li',
  'ul',
  'ol',
  'tr',
  'table',
  'blockquote',
  'pre',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
]);

/**
 * 要素の中身を、改行を保ったプレーンテキストにする。
 * （innerText に近い結果を、jsdom でも同じように得るために自前で行う）
 */
export function toPlainText(root: Node): string {
  let text = '';
  const appendNewline = (): void => {
    if (text !== '' && !text.endsWith('\n')) text += '\n';
  };
  const walk = (node: Node): void => {
    // nodeType: 1 = 要素、3 = テキスト
    if (node.nodeType === 3) {
      text += (node.nodeValue ?? '').replace(/ /g, ' ');
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = (node as Element).localName;
    if (tag === 'br') {
      text += '\n';
      return;
    }
    const isBlock = BLOCK_TAGS.has(tag);
    if (isBlock) appendNewline();
    for (const child of node.childNodes) walk(child);
    if (isBlock) appendNewline();
  };
  walk(root);
  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 本文の編集欄を複製し、引用部分を取り除いたものを返す */
function bodyWithoutQuote(compose: HTMLElement): Element {
  const body = compose.querySelector(SELECTORS.body);
  if (body === null) throw new GmailStructureError('message body');
  const clone = body.cloneNode(true) as Element;
  for (const quote of clone.querySelectorAll(SELECTORS.quote)) quote.remove();
  return clone;
}

/** Google ドライブの URL かどうか */
function isDriveUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') && DRIVE_HOSTS.includes(url.hostname)
    );
  } catch {
    return false;
  }
}

/**
 * 本文（引用を除く）にある Google ドライブのリンクの数を数える。
 * 作成画面では、貼り付けただけの URL はリンク要素にならず文字のままなので、文字列からも探す。
 */
function countDriveLinks(body: Element, bodyText: string): number {
  const urls = new Set<string>();
  for (const anchor of body.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href') ?? '';
    if (isDriveUrl(href)) urls.add(href);
  }
  for (const match of bodyText.match(/https?:\/\/[^\s<>"']+/g) ?? []) {
    const url = match.replace(/[.,;:!?)]+$/, '');
    if (isDriveUrl(url)) urls.add(url);
  }
  return urls.size;
}

function readAttachments(compose: HTMLElement): Attachment[] {
  return [...compose.querySelectorAll<HTMLElement>(SELECTORS.attachment)].map((item) => {
    const fileName = item.querySelector(SELECTORS.attachmentName)?.textContent.trim() ?? '';
    if (fileName === '') throw new GmailStructureError('attachment file name');
    return { fileName };
  });
}

/** 書き換えた行（書き換えた後に、メール本体から読み直したもの） */
export interface FixedLine {
  /** 書き換えた部分より前（同じ行の中） */
  readonly before: string;
  /** 書き換えた後の文字 */
  readonly fixed: string;
  /** 書き換えた部分より後（同じ行の中） */
  readonly after: string;
}

/** 文字を置き換えられたときの結果 */
export interface AppliedReplacement {
  readonly status: 'applied';
  readonly line: FixedLine;
  /**
   * 元の文字に戻す。戻せたら true。
   * 書き換えた後にその箇所が編集されていた場合は、戻さずに false を返す。
   */
  undo(): boolean;
  /** 書き換えた箇所を、メールの画面で選択し、見える位置まで動かす */
  reveal(): void;
}

/** 文字の置き換えの結果 */
export type ReplacementOutcome =
  | AppliedReplacement
  /** not-found = 該当する箇所が見つからない、ambiguous = 2か所以上あって決められない */
  | { readonly status: 'not-found' | 'ambiguous' };

/** 本文の中の文字のかたまり（テキストノード）と、つなげた文字列の中での位置 */
interface TextPiece {
  readonly node: Text;
  readonly start: number;
  readonly end: number;
}

/**
 * 本文の編集欄の文字（引用部分を除く）を、1本の文字列につなげる。
 *
 * Gmail の本文は、打ち直しや変換のたびに文字のかたまり（テキストノード）が細かく分かれるため、
 * かたまりごとに探すと、見た目では続いている文字を見つけられない。つなげた文字列で探し、
 * 見つかった位置からどのかたまりに当たるかを引けるようにする。
 * 行の区切り（ブロック要素の境目、改行）には改行文字を入れ、行をまたいだ一致が起きないようにする。
 */
function collectEditableText(body: Element): { text: string; pieces: TextPiece[] } {
  let text = '';
  const pieces: TextPiece[] = [];
  const walk = (node: Node): void => {
    // nodeType: 1 = 要素、3 = テキスト
    if (node.nodeType === 3) {
      // 改行しない空白（&nbsp;）は、普通の空白として扱う（文字数は変わらないので位置はずれない）
      const value = (node.nodeValue ?? '').replace(/\u00a0/g, ' ');
      pieces.push({ node: node as Text, start: text.length, end: text.length + value.length });
      text += value;
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as Element;
    if (element.matches(SELECTORS.quote)) return;
    const tag = element.localName;
    if (tag === 'br') {
      text += '\n';
      return;
    }
    const isBlock = BLOCK_TAGS.has(tag);
    if (isBlock) text += '\n';
    for (const child of node.childNodes) walk(child);
    if (isBlock) text += '\n';
  };
  walk(body);
  return { text, pieces };
}

/** 文字列の中に、探す文字が現れる位置をすべて返す */
function findAll(text: string, search: string): number[] {
  const positions: number[] = [];
  for (let at = text.indexOf(search); at !== -1; at = text.indexOf(search, at + 1)) {
    positions.push(at);
  }
  return positions;
}

/** 文字列の中で、指定した範囲を含む行（改行から改行まで）を、範囲の前・範囲・範囲の後に分けて返す */
function lineAround(text: string, start: number, end: number): FixedLine {
  const lineStart = start === 0 ? 0 : text.lastIndexOf('\n', start - 1) + 1;
  const lineEndIndex = text.indexOf('\n', end);
  const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
  return {
    before: text.slice(lineStart, start),
    fixed: text.slice(start, end),
    after: text.slice(end, lineEnd),
  };
}

/**
 * 作成画面の件名・本文（引用部分を除く）にある文字を、別の文字に置き換える。
 * AI が示した誤字の修正案を、メールに反映するために使う。
 *
 * - 取り違えを防ぐため、該当する箇所が件名と本文を通して「ちょうど1か所」のときだけ置き換える。
 * - 本文では、文字のかたまり（テキストノード）や書式（太字など）の境目をまたいでいても置き換える。
 *   行をまたぐ場合は置き換えない。
 * - 修正案が前後の文字と重なる場合は、重なりを取り除いてから置き換える（fitSuggestion）。
 * - 置き換えた後は、Gmail が変更に気づいて下書きを保存できるよう、入力のイベントを発生させる。
 * - 置き換えた場合は、書き換えた行（メール本体から読み直したもの）と、
 *   元に戻す処理・該当箇所をメールの画面で見せる処理を返す。
 */
export function replaceComposeText(
  compose: HTMLElement,
  search: string,
  replacement: string,
): ReplacementOutcome {
  const needle = search.replace(/\u00a0/g, ' ');
  if (needle === '' || needle.includes('\n')) return { status: 'not-found' };
  const subjectInput = compose.querySelector<HTMLInputElement>(SELECTORS.subject);
  const body = compose.querySelector<HTMLElement>(SELECTORS.body);
  if (subjectInput === null || body === null) throw new GmailStructureError('subject or body');
  const view = compose.ownerDocument.defaultView;
  if (view === null) throw new GmailStructureError('window of the element');
  const notifyGmail = (element: HTMLElement): void => {
    element.dispatchEvent(new view.Event('input', { bubbles: true }));
  };

  const subject = subjectInput.value;
  const inSubject = findAll(subject, needle);
  const { text, pieces } = collectEditableText(body);
  const inBody = findAll(text, needle);
  if (inSubject.length + inBody.length === 0) return { status: 'not-found' };
  if (inSubject.length + inBody.length > 1) return { status: 'ambiguous' };

  // ---- 件名
  const subjectAt = inSubject[0];
  if (subjectAt !== undefined) {
    const before = subject.slice(0, subjectAt);
    const after = subject.slice(subjectAt + needle.length);
    const fitted = fitSuggestion(before, needle, replacement, after);
    const changed = before + fitted + after;
    subjectInput.value = changed;
    notifyGmail(subjectInput);
    return {
      status: 'applied',
      line: lineAround(subjectInput.value, subjectAt, subjectAt + fitted.length),
      undo() {
        if (subjectInput.value !== changed) return false;
        subjectInput.value = subject;
        notifyGmail(subjectInput);
        return true;
      },
      reveal() {
        subjectInput.focus();
        subjectInput.setSelectionRange(subjectAt, subjectAt + fitted.length);
      },
    };
  }

  // ---- 本文
  const start = inBody[0];
  if (start === undefined) return { status: 'not-found' };
  const end = start + needle.length;
  const fitted = fitSuggestion(text.slice(0, start), needle, replacement, text.slice(end));
  // 一致した範囲にかかるかたまりを、前から順に書き換える。
  // 修正後の文字は最初のかたまりに入れ、残りのかたまりからは一致した部分だけを取り除く
  const changes: { node: Text; previous: string; current: string; offset: number }[] = [];
  for (const piece of pieces) {
    if (piece.end <= start || piece.start >= end) continue;
    const previous = piece.node.nodeValue ?? '';
    const from = Math.max(start, piece.start) - piece.start;
    const to = Math.min(end, piece.end) - piece.start;
    const current =
      previous.slice(0, from) + (changes.length === 0 ? fitted : '') + previous.slice(to);
    piece.node.nodeValue = current;
    changes.push({ node: piece.node, previous, current, offset: from });
  }
  const first = changes[0];
  if (first === undefined) return { status: 'not-found' };
  notifyGmail(body);

  return {
    status: 'applied',
    // 書き換えた後の本文を読み直して、該当の行を取り出す（書き換えた結果そのものを見せるため）
    line: lineAround(collectEditableText(body).text, start, start + fitted.length),
    undo() {
      // 書き換えた後に、その箇所が編集されたり消されたりしていたら戻さない
      const untouched = changes.every(
        (change) => change.node.isConnected && change.node.nodeValue === change.current,
      );
      if (!untouched) return false;
      for (const change of changes) change.node.nodeValue = change.previous;
      notifyGmail(body);
      return true;
    },
    reveal() {
      if (!first.node.isConnected) return;
      const document = compose.ownerDocument;
      const range = document.createRange();
      const length = (first.node.nodeValue ?? '').length;
      range.setStart(first.node, Math.min(first.offset, length));
      range.setEnd(first.node, Math.min(first.offset + fitted.length, length));
      body.focus();
      const selection = document.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      // 画面の外にある場合は、見える位置まで動かす（この機能が無い環境では何もしない）
      const parent = first.node.parentElement as Partial<HTMLElement> | null;
      parent?.scrollIntoView?.({ block: 'center' });
    },
  };
}

/**
 * 日時を、利用者の時計での ISO 8601 表記（例：2026-11-20T09:30:00+09:00）にする。
 * 先頭の年月日が利用者の暦の日付になるようにするため、UTC ではなく現地時刻で表す。
 */
export function toLocalIsoString(date: Date): string {
  const pad = (value: number, length = 2): string => String(value).padStart(length, '0');
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);
  return (
    `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`
  );
}

/** 作成画面の要素から送信内容のスナップショットを作る */
export function readComposeSnapshot(compose: HTMLElement, capturedAt: Date): ComposeSnapshot {
  const subjectInput = compose.querySelector<HTMLInputElement>(SELECTORS.subject);
  if (subjectInput === null) throw new GmailStructureError('subject');

  const body = bodyWithoutQuote(compose);
  const bodyText = toPlainText(body);

  return {
    recipients: readRecipients(compose),
    subject: subjectInput.value,
    bodyText,
    attachments: readAttachments(compose),
    driveLinkCount: countDriveLinks(body, bodyText),
    capturedAt: toLocalIsoString(capturedAt),
    fromAddress: readFromAddress(compose),
  };
}
