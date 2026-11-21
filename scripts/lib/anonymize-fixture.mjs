// Gmail の HTML をテスト用フィクスチャにするための匿名化と検査（純粋な処理）。
//
// 方針は「原則すべて置き換える」。残してよいと分かっているもの（タグ・class・id・role など画面構造を表す値）
// だけを残し、それ以外の文字列はすべて置き換える。氏名や会社名を見つけて消すのではないため、
// 見つけ損ねによる置き換え漏れが起きにくい。
//
//   - メールアドレス     … user1@example.com のような架空の値に置き換える（同じアドレスは同じ値になる。
//                           ドメインが同じアドレスは、置き換え後も同じドメインになる）
//   - テキスト・属性値   … 文字の種類ごとに伏せ字にする（英小文字→x、英大文字→X、数字→0、その他の文字→文）。
//                           記号・空白・改行は残す。Gmail の画面文言（「送信」など）も伏せ字になる
//   - URL                … Google のホスト名と、ドライブのリンクと判別できる程度のパスの形だけ残す
//   - script・style など … 要素ごと削除する
//
// 匿名化済みの HTML をもう一度匿名化しても内容は変わらない。検査（checkFixtureHtml）はこの性質を使い、
// 「匿名化したら変わる箇所」を置き換え漏れとして報告する。
//
// コマンドラインからの実行は scripts/anonymize-fixture.mjs、手順は tests/fixtures/gmail/README.md。

import { JSDOM } from 'jsdom';

/** フィクスチャのファイル名に使える画面名 */
export const FIXTURE_SCREENS = [
  'compose-new',
  'reply',
  'reply-all',
  'forward',
  'reply-inline',
  'popout',
  'fullscreen',
  'schedule-menu',
  'schedule-presets',
  'schedule-picker',
  // 届いたメールの表示画面（スレッドを開いた状態）。フェーズ2b の読み取りに使う
  'message-view',
];

const FILE_NAME_PATTERN =
  /^(?<screen>[a-z0-9]+(?:-[a-z0-9]+)*)(?<states>(?:--[a-z0-9]+(?:-[a-z0-9]+)*)*)\.(?<lang>[a-z]{2})\.(?<date>\d{8})\.html$/;

/**
 * フィクスチャのファイル名を検査して分解する。
 * 形式：<画面>[--<状態>...].<Gmailの表示言語>.<採取日YYYYMMDD>.html
 * @param {string} fileName
 * @returns {{ ok: true, screen: string, states: string[], lang: string, date: string } | { ok: false, reason: string }}
 */
export function parseFixtureFileName(fileName) {
  const match = FILE_NAME_PATTERN.exec(fileName);
  if (!match?.groups) {
    return {
      ok: false,
      reason: '形式が <画面>[--<状態>...].<言語>.<採取日YYYYMMDD>.html ではありません',
    };
  }
  const { screen, states, lang, date } = match.groups;
  if (!FIXTURE_SCREENS.includes(screen)) {
    return {
      ok: false,
      reason: `画面名「${screen}」は使えません（使える名前：${FIXTURE_SCREENS.join('、')}）`,
    };
  }
  const month = Number(date.slice(4, 6));
  const day = Number(date.slice(6, 8));
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { ok: false, reason: `採取日「${date}」が日付として正しくありません` };
  }
  return { ok: true, screen, states: states.split('--').filter(Boolean), lang, date };
}

// ---------------------------------------------------------------------------
// メールアドレス
// ---------------------------------------------------------------------------

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;

/** 架空の値として使ってよいドメイン（RFC 2606 / RFC 6761 の予約済みドメイン） */
const RESERVED_DOMAINS = ['example.com', 'example.org', 'example.net'];
const RESERVED_TLDS = ['example', 'test', 'invalid'];

/** @param {string} domain */
export function isReservedDomain(domain) {
  const lower = domain.toLowerCase();
  if (RESERVED_DOMAINS.some((d) => lower === d || lower.endsWith(`.${d}`))) return true;
  const tld = lower.slice(lower.lastIndexOf('.') + 1);
  return RESERVED_TLDS.includes(tld);
}

/** 実在のアドレス・ドメインを架空の値に対応づける表。同じ入力には同じ値を返す */
class EmailMapper {
  /** @type {Map<string, string>} */
  #addresses = new Map();
  /** @type {Map<string, string>} */
  #domains = new Map();

  /** @param {string} address */
  map(address) {
    const at = address.lastIndexOf('@');
    const domain = address.slice(at + 1).toLowerCase();
    if (isReservedDomain(domain)) return address;

    const key = address.toLowerCase();
    const known = this.#addresses.get(key);
    if (known) return known;

    let fakeDomain = this.#domains.get(domain);
    if (!fakeDomain) {
      // example.com などは採取用の下書きの宛先に使われるため、置き換え先には使わない
      // （別々のドメインが、置き換え後に同じドメインに見えてしまうのを防ぐ）
      fakeDomain = `company${String(this.#domains.size + 1)}.example`;
      this.#domains.set(domain, fakeDomain);
    }
    const fake = `user${String(this.#addresses.size + 1)}@${fakeDomain}`;
    this.#addresses.set(key, fake);
    return fake;
  }

  get addressCount() {
    return this.#addresses.size;
  }

  get domainCount() {
    return this.#domains.size;
  }
}

// ---------------------------------------------------------------------------
// 文字列の置き換え
// ---------------------------------------------------------------------------

/**
 * 文字の種類ごとに伏せ字にする。記号・空白・改行は残す。
 * 伏せ字（x・X・0・文）自身は同じ文字になるので、何度かけても結果は変わらない。
 * @param {string} text
 */
export function maskText(text) {
  let result = '';
  for (const char of text) {
    if (/[a-z]/.test(char)) result += 'x';
    else if (/[A-Z]/.test(char)) result += 'X';
    else if (/\p{N}/u.test(char)) result += '0';
    else if (/\p{L}/u.test(char)) result += '文';
    else if (/\p{M}/u.test(char)) result += '';
    else result += char;
  }
  return result;
}

/** テキストの中に書かれた URL（本文に貼り付けたリンクなど）。URL に使える ASCII 文字の並びだけを対象にする */
const URL_IN_TEXT_PATTERN = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/g;

/**
 * メールアドレスは架空のアドレスに、それ以外は伏せ字にする（URL を含まないテキスト用）。
 * @param {string} text
 * @param {EmailMapper} mapper
 */
function sanitizePlainText(text, mapper) {
  let result = '';
  let last = 0;
  for (const match of text.matchAll(EMAIL_PATTERN)) {
    result += maskText(text.slice(last, match.index)) + mapper.map(match[0]);
    last = match.index + match[0].length;
  }
  return result + maskText(text.slice(last));
}

/**
 * テキストを匿名化する。メールアドレスは架空のアドレスに、URL は属性の URL と同じ規則で匿名化し、
 * それ以外は伏せ字にする。
 * URL を残すのは、本文に貼り付けただけのリンク（作成画面では <a> にならない）でも、
 * Google ドライブなどのリンクかどうかを判別できるようにするため。
 * @param {string} text
 * @param {EmailMapper} mapper
 */
function sanitizeText(text, mapper) {
  let result = '';
  let last = 0;
  for (const match of text.matchAll(URL_IN_TEXT_PATTERN)) {
    // 文末の句読点や閉じ括弧は URL に含めない
    const url = match[0].replace(/[.,;:!?)]+$/, '');
    result += sanitizePlainText(text.slice(last, match.index), mapper) + sanitizeUrl(url, mapper);
    last = match.index + url.length;
  }
  return result + sanitizePlainText(text.slice(last), mapper);
}

// ---------------------------------------------------------------------------
// URL
// ---------------------------------------------------------------------------

/** ホスト名を残してよい Google のドメイン（ドライブのリンクなどの判別に必要） */
const KEPT_HOST_SUFFIXES = ['google.com', 'gstatic.com', 'googleusercontent.com'];
const FALLBACK_URL = 'https://example.com/';
const URL_BASE = 'https://mail.google.com/mail/u/0/';

/** @param {string} host */
function isKeptHost(host) {
  return (
    KEPT_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`)) ||
    isReservedDomain(host)
  );
}

/**
 * URL を匿名化する。
 * - Google のホスト：ホスト名は残す。パスは短い英小文字の語（file、d、view など）と1〜2桁の数字だけ残し、
 *   それ以外（ファイルIDなど）は ID に置き換える。クエリの値とハッシュは伏せ字にする
 * - それ以外のホスト：https://example.com/ に置き換える
 * - mailto:：アドレスを架空の値に置き換える
 * - data:・blob:・javascript: など：about:blank に置き換える
 * @param {string} value
 * @param {EmailMapper} mapper
 */
function sanitizeUrl(value, mapper) {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '#' || trimmed === 'about:blank') return trimmed;

  if (/^mailto:/i.test(trimmed)) {
    const addresses = (trimmed.match(EMAIL_PATTERN) ?? []).map((a) => mapper.map(a));
    return `mailto:${addresses.join(',')}`;
  }

  /** @type {URL} */
  let url;
  try {
    url = new URL(trimmed, URL_BASE);
  } catch {
    return FALLBACK_URL;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'about:blank';
  if (!isKeptHost(url.hostname)) return FALLBACK_URL;

  const segments = url.pathname
    .split('/')
    .map((segment) =>
      segment === '' || /^[a-z]{1,12}$/.test(segment) || /^\d{1,2}$/.test(segment) ? segment : 'ID',
    );
  const query = [...url.searchParams.entries()]
    .map(([key, paramValue]) => {
      const safeKey = /^[A-Za-z_]{1,16}$/.test(key) ? key : 'k';
      return `${safeKey}=${encodeURIComponent(sanitizePlainText(paramValue, mapper))}`;
    })
    .join('&');
  const hash = url.hash.length > 1 ? `#${maskText(decodeURIComponentSafe(url.hash.slice(1)))}` : '';
  return `https://${url.hostname}${segments.join('/')}${query ? `?${query}` : ''}${hash}`;
}

/** @param {string} value */
function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// ---------------------------------------------------------------------------
// 要素・属性
// ---------------------------------------------------------------------------

/** 要素ごと削除するタグ（個人情報を含み得るうえ、テストに不要） */
const REMOVED_TAGS = ['script', 'style', 'noscript', 'link', 'meta', 'base', 'iframe', 'template'];

/** 値をそのまま残す属性（画面構造を表し、個人情報を含まない） */
const KEPT_ATTRIBUTES = new Set([
  'class',
  'id',
  'role',
  'type',
  'tabindex',
  'dir',
  'contenteditable',
  'spellcheck',
  'hidefocus',
  'autocomplete',
  'autocapitalize',
  'autocorrect',
  'for',
  'colspan',
  'rowspan',
  'cellpadding',
  'cellspacing',
  'border',
  'width',
  'height',
  'size',
  'maxlength',
  'rows',
  'cols',
  'disabled',
  'checked',
  'selected',
  'hidden',
  'readonly',
  'multiple',
  'draggable',
  'g_editable',
  'jsaction',
  'jscontroller',
  'jsname',
  'jsmodel',
  'viewBox',
  'xmlns',
  'fill',
  'focusable',
  'd',
  // 状態や ID 参照を表す aria 属性。aria-label などの文言を持つ属性は含めない
  'aria-hidden',
  'aria-expanded',
  'aria-haspopup',
  'aria-selected',
  'aria-checked',
  'aria-disabled',
  'aria-pressed',
  'aria-multiline',
  'aria-multiselectable',
  'aria-readonly',
  'aria-required',
  'aria-invalid',
  'aria-modal',
  'aria-live',
  'aria-atomic',
  'aria-relevant',
  'aria-busy',
  'aria-autocomplete',
  'aria-orientation',
  'aria-level',
  'aria-posinset',
  'aria-setsize',
  'aria-owns',
  'aria-controls',
  'aria-labelledby',
  'aria-describedby',
  'aria-activedescendant',
  'aria-flowto',
]);

/** URL を値に持つ属性 */
const URL_ATTRIBUTES = new Set([
  'href',
  'src',
  'action',
  'formaction',
  'background',
  'poster',
  'cite',
  'data',
  'ping',
  'longdesc',
  'xlink:href',
  'data-saferedirecturl',
]);

/** name 属性が「フォームの項目名」（to、subjectbox など）を表すタグ */
const FORM_TAGS = new Set(['input', 'textarea', 'select', 'button', 'form']);

/** フォーム以外の要素でも残す name 属性の値（Gmail の宛先欄の入れ物に付く、欄の種類） */
const RECIPIENT_FIELD_NAMES = new Set(['to', 'cc', 'bcc']);

/**
 * Gmail が決めた記号（コマンド名や部品の識別子）を値に持つ属性。
 * 値が記号の形（英数字と + _ . / - のみ）のときだけ残し、それ以外は伏せ字にする。
 */
const TOKEN_ATTRIBUTES = new Set([
  'peoplekit-id',
  'command',
  'selector',
  'data-rp-placement-id',
  'data-smartmail',
  'data-mdc-dialog-action',
  'translate',
  'method',
  'enctype',
  'accept-charset',
  'target',
  'clear',
  'form',
]);
const TOKEN_VALUE = /^[+\w./-]{1,60}$/;

/** 置き換えなくてよい値（真偽値・空・4桁までの数値） */
const HARMLESS_VALUE = /^(?:true|false|\d{0,4})$/;

/**
 * 属性値を匿名化した値を返す。属性ごと削除する場合は null。
 * @param {string} tag
 * @param {string} name
 * @param {string} value
 * @param {EmailMapper} mapper
 * @returns {string | null}
 */
function sanitizeAttribute(tag, name, value, mapper) {
  if (name.startsWith('on') || name === 'srcset' || name === 'imagesrcset') return null;
  if (KEPT_ATTRIBUTES.has(name)) return value;
  if (name === 'name' && FORM_TAGS.has(tag) && /^[A-Za-z_][\w-]{0,30}$/.test(value)) return value;
  if (name === 'name' && RECIPIENT_FIELD_NAMES.has(value)) return value;
  if (TOKEN_ATTRIBUTES.has(name) && TOKEN_VALUE.test(value)) return value;
  if (name === 'style') return value.replace(/url\([^)]*\)/gi, 'url()');
  if (
    URL_ATTRIBUTES.has(name) ||
    /^(?:https?:)?\/\/|^(?:mailto|data|blob|javascript):/i.test(value)
  ) {
    return sanitizeUrl(value, mapper);
  }
  if (HARMLESS_VALUE.test(value)) return value;
  return sanitizeText(value, mapper);
}

/**
 * @typedef {object} Change
 * @property {'element' | 'comment' | 'attribute' | 'text'} kind 変更の種類
 * @property {string} location 場所（要素までの道筋）
 * @property {string} before 変更前の値（長い場合は先頭のみ）
 */

/** @param {string} value */
function excerpt(value) {
  const oneLine = value.replace(/\s+/g, ' ').trim();
  return oneLine.length > 80 ? `${oneLine.slice(0, 80)}…` : oneLine;
}

/** @param {Element} element */
function describe(element) {
  const parts = [];
  /** @type {Element | null} */
  let current = element;
  while (current && parts.length < 4) {
    const id = current.getAttribute('id');
    const cls = current.getAttribute('class')?.trim().split(/\s+/)[0];
    parts.unshift(`${current.localName}${id ? `#${id}` : cls ? `.${cls}` : ''}`);
    current = current.parentElement;
  }
  return parts.join(' > ');
}

/**
 * DOM を文書順にたどって匿名化する。変更した箇所を changes に記録する。
 * @param {Node} root
 * @param {EmailMapper} mapper
 * @param {Change[]} changes
 */
function sanitizeTree(root, mapper, changes) {
  for (const node of [...root.childNodes]) {
    // nodeType: 1 = 要素、3 = テキスト、8 = コメント、10 = <!doctype>
    if (node.nodeType === 1) {
      const element = /** @type {Element} */ (node);
      const tag = element.localName;
      if (REMOVED_TAGS.includes(tag)) {
        changes.push({ kind: 'element', location: describe(element), before: `<${tag}>` });
        element.remove();
        continue;
      }
      for (const attribute of [...element.attributes]) {
        const after = sanitizeAttribute(tag, attribute.name, attribute.value, mapper);
        if (after === attribute.value) continue;
        changes.push({
          kind: 'attribute',
          location: `${describe(element)} [${attribute.name}]`,
          before: excerpt(attribute.value),
        });
        if (after === null) element.removeAttribute(attribute.name);
        else element.setAttribute(attribute.name, after);
      }
      sanitizeTree(element, mapper, changes);
    } else if (node.nodeType === 3) {
      const before = node.nodeValue ?? '';
      const after = sanitizeText(before, mapper);
      if (after !== before) {
        changes.push({
          kind: 'text',
          location: node.parentElement ? describe(node.parentElement) : '(root)',
          before: excerpt(before),
        });
        node.nodeValue = after;
      }
    } else if (node.nodeType !== 10) {
      // 10 = <!doctype>（そのまま残す）。それ以外（コメントなど）は削除する
      changes.push({
        kind: 'comment',
        location: node.parentElement ? describe(node.parentElement) : '(root)',
        before: excerpt(node.nodeValue ?? node.nodeName),
      });
      node.parentNode?.removeChild(node);
    }
  }
}

/**
 * @param {string} html
 * @returns {{ dom: JSDOM, isFullDocument: boolean }}
 */
function parse(html) {
  const source = html.replace(/^﻿/, '');
  // DevTools で <html> 全体をコピーした場合は文書として、要素をコピーした場合は断片として扱う
  const isFullDocument = /^\s*(?:<!doctype[^>]*>\s*)?<html[\s>]/i.test(source);
  // スクリプトは実行しない（JSDOM の既定）。外部リソースも読み込まない
  return { dom: new JSDOM(source), isFullDocument };
}

/**
 * Gmail の HTML を匿名化する。
 * @param {string} html DevTools でコピーした HTML（要素の outerHTML、または <html> 全体）
 * @returns {{ html: string, changes: Change[], addressCount: number, domainCount: number }}
 */
export function anonymizeFixtureHtml(html) {
  const { dom, isFullDocument } = parse(html);
  const { document } = dom.window;
  const mapper = new EmailMapper();
  /** @type {Change[]} */
  const changes = [];
  sanitizeTree(isFullDocument ? document : document.body, mapper, changes);
  // 文書の場合、</html> の後ろに改行を付けると次に読み込んだとき body の末尾に入り込むため、付けない
  const output = isFullDocument
    ? `<!doctype html>\n${document.documentElement.outerHTML}`
    : `${document.body.innerHTML.trim()}\n`;
  return {
    html: output,
    changes,
    addressCount: mapper.addressCount,
    domainCount: mapper.domainCount,
  };
}

/**
 * @typedef {object} Finding
 * @property {'email' | 'denylist' | 'element' | 'comment' | 'attribute' | 'text'} kind 置き換え漏れの種類
 * @property {string} location 場所
 * @property {string} value 見つかった値（長い場合は先頭のみ）
 */

/**
 * 匿名化済みの HTML に置き換え漏れがないか検査する。問題が無ければ空配列を返す。
 *
 * 検査内容：
 * 1. 匿名化をもう一度かけて変わる箇所がないか（伏せ字になっていないテキスト・属性値、残った script など）
 * 2. 予約済みドメイン（example.com など）以外のメールアドレスが、HTML のどこかに残っていないか
 * 3. denylist の語（自分の氏名・会社名など、利用者が指定した語）が残っていないか（大文字・小文字は区別しない）
 *
 * @param {string} html
 * @param {{ denylist?: readonly string[] }} [options]
 * @returns {Finding[]}
 */
export function checkFixtureHtml(html, options = {}) {
  /** @type {Finding[]} */
  const findings = [];

  const { dom, isFullDocument } = parse(html);
  /** @type {Change[]} */
  const changes = [];
  sanitizeTree(
    isFullDocument ? dom.window.document : dom.window.document.body,
    new EmailMapper(),
    changes,
  );
  for (const change of changes) {
    findings.push({ kind: change.kind, location: change.location, value: change.before });
  }

  // DOM をたどる検査とは別に、文字列全体も調べる（解析のされ方に左右されない二重の確認）
  const seen = new Set();
  for (const match of html.matchAll(EMAIL_PATTERN)) {
    const address = match[0];
    const domain = address.slice(address.lastIndexOf('@') + 1);
    if (isReservedDomain(domain) || seen.has(address.toLowerCase())) continue;
    seen.add(address.toLowerCase());
    findings.push({ kind: 'email', location: `文字位置 ${String(match.index)}`, value: address });
  }

  const lowerHtml = html.toLowerCase();
  for (const term of options.denylist ?? []) {
    const index = lowerHtml.indexOf(term.toLowerCase());
    if (term !== '' && index !== -1) {
      findings.push({ kind: 'denylist', location: `文字位置 ${String(index)}`, value: term });
    }
  }
  return findings;
}

/**
 * denylist ファイルの内容を語の配列にする。1行1語。空行と # で始まる行は無視する。
 * @param {string} content
 * @returns {string[]}
 */
export function parseDenylist(content) {
  return content
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}
