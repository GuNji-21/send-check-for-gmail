/**
 * 届いたメールの署名から、会社名・部署・役職・電話番号を読み取る（フェーズ2b）。
 *
 * 署名とみなす範囲は、次のどちらか。
 * - メールの画面で署名として印が付いている部分（Gmail から送られたメール）
 * - 本文（引用を除く）の最後の文より後ろの行（最大 15 行）。
 *   ただし、その中に送信元のアドレスか電話番号があるときだけ署名とみなす
 *
 * 読み取れないもの・あいまいなものは、空のままにする（誤った情報を台帳に入れないことを優先する）。
 */

import { COMPANY_MARKER, searchKey } from '../text/company';
import { toHalfWidth } from '../text/normalize';
import { TITLES } from '../text/salutation';

/** 署名から読み取った情報（読み取れなかった項目は無い） */
export interface SignatureInfo {
  readonly companyName?: string;
  readonly department?: string;
  readonly title?: string;
  /** 電話番号（代表・固定） */
  readonly phone?: string;
  /** 携帯番号 */
  readonly mobile?: string;
}

export interface SignatureSource {
  /** 本文（引用を除く） */
  readonly bodyText: string;
  /** メールの画面で署名として印が付いている部分の文字。無ければ省略 */
  readonly signatureText?: string;
  /** 送信元のアドレス */
  readonly senderAddress: string;
  /** 送信元の表示名（名前を部署と取り違えないために使う） */
  readonly senderName?: string;
}

/** 署名として見る最大行数 */
const MAX_SIGNATURE_LINES = 15;

/** 会社名・部署とみなす行や語の最大文字数 */
const MAX_COMPANY_LENGTH = 40;
const MAX_DEPARTMENT_LENGTH = 30;

/** 文になっている行（署名ではない） */
const SENTENCE = /[。！？!?]|です$|ます$|ました$|でした$|ません$|ください$|いたします$|致します$/u;

/** 英語の文（語が4つ以上あって、ピリオドなどで終わる） */
const ENGLISH_SENTENCE = /^(?:\S+\s+){3,}\S*[.!?]$/u;

/** ここから後ろは引用（過去のメール）とみなす行 */
const QUOTE_START =
  /^>|^-{2,}\s*(?:Original Message|Forwarded message|元のメッセージ|転送メッセージ)|^(?:From|差出人|送信者)\s*[:：]|^On .+ wrote:$|^\d{4}年\d{1,2}月\d{1,2}日.+[:：]$/iu;

/** 英語の会社名の手がかり */
const ENGLISH_COMPANY = /\b(?:Inc|Co\.,? ?Ltd|Ltd|LLC|Corp|Corporation|K\.K)\b\.?/u;

/** 会社の種類の語だけの語（「株式会社 サンプル」のように、空白で分かれているときに隣とつなぐ） */
const COMPANY_TYPE_ONLY = /^(?:株式会社|有限会社|合同会社|合資会社|合名会社)$/u;

/** 部署の終わり方 */
const DEPARTMENT_END =
  /(?:部|課|室|本部|事業部|グループ|チーム|センター|支店|営業所|Division|Department|Dept\.?)$/u;

/** 電話番号（市外局番から。国番号 +81 も受け付ける） */
const PHONE = /(?:\+81[-\s]?\(?0?\)?|0)\d{1,4}[-\s()]{1,2}\d{1,4}[-\s)]{1,2}\d{3,4}/gu;

const FAX_LABEL = /fax|ファックス|ファクス/iu;
const MOBILE_LABEL = /携帯|mobile|cell|(?:^|[\s/|])m\s*[:.]/iu;

/** 番号の前にあるラベルとして見る文字数 */
const LABEL_WINDOW = 14;

function isSentence(line: string): boolean {
  // 「Sample Co., Ltd.」のような、ピリオドで終わる会社名は文にしない
  return SENTENCE.test(line) || (ENGLISH_SENTENCE.test(line) && !ENGLISH_COMPANY.test(line));
}

/** 行を、空白や区切りの記号で語に分ける */
function tokensOf(line: string): string[] {
  return line.split(/[\s　/／|｜]+/u).filter((token) => token !== '');
}

/** 「会社名：」などの見出しを取り除く */
function withoutLabel(token: string): string {
  return token.replace(/^[^:：]{1,6}[:：]/u, '');
}

/** 署名とみなす行を返す。署名が無いと判断したら空 */
function signatureLines(source: SignatureSource): string[] {
  const clean = (text: string): string[] =>
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '');
  if (source.signatureText !== undefined && source.signatureText.trim() !== '') {
    return clean(source.signatureText).slice(0, MAX_SIGNATURE_LINES);
  }
  let lines = clean(source.bodyText);
  const quoteAt = lines.findIndex((line) => QUOTE_START.test(line));
  if (quoteAt !== -1) lines = lines.slice(0, quoteAt);
  // 最後の文より後ろだけを見る（冒頭の宛名にある、自分の会社名を拾わないため）
  let start = lines.length;
  while (start > 0 && lines.length - start < MAX_SIGNATURE_LINES) {
    const line = lines[start - 1] ?? '';
    if (isSentence(line)) break;
    start--;
  }
  const tail = lines.slice(start);
  const address = source.senderAddress.toLowerCase();
  const hasEvidence = tail.some((line) => {
    const half = toHalfWidth(line);
    return (address !== '' && half.toLowerCase().includes(address)) || half.match(PHONE) !== null;
  });
  return hasEvidence ? tail : [];
}

/**
 * 「株式会社」の後ろに続く語を、会社名としてつなげる。
 * 「株式会社 M&D Support」のように、会社名が空白で分かれていることがあるため、
 * 部署・役職・数字・アドレスが出てくるまでの語をつなぐ（英数字どうしの間は空白を残す）。
 */
function companyWords(tokens: readonly string[]): string {
  let name = '';
  for (const token of tokens) {
    if (DEPARTMENT_END.test(token) || TITLES.includes(token) || /\d{2,}|@/u.test(token)) break;
    const spaced = /[\w&.]$/u.test(name) && /^[\w&.]/u.test(token);
    name += spaced ? ` ${token}` : token;
  }
  return name;
}

function readCompany(lines: readonly string[]): string | undefined {
  for (const line of lines) {
    if (line.length > MAX_COMPANY_LENGTH * 2 || /[、。]/u.test(line)) continue;
    const japanese = COMPANY_MARKER.test(line);
    if (!japanese && !ENGLISH_COMPANY.test(line)) continue;
    if (!japanese) {
      // 英語の会社名は空白を含むので、行をそのまま使う（短い行だけ）
      const name = withoutLabel(line).trim();
      if (name.length <= MAX_COMPANY_LENGTH && !name.includes('@')) return name;
      continue;
    }
    const tokens = tokensOf(line);
    const index = tokens.findIndex((token) => COMPANY_MARKER.test(token));
    const token = tokens[index];
    if (token === undefined) continue;
    let name = withoutLabel(token);
    if (COMPANY_TYPE_ONLY.test(name)) {
      // 「株式会社 サンプル」は後ろの語と、「サンプル 株式会社」は前の語とつなぐ
      const rest = companyWords(tokens.slice(index + 1));
      const previous = tokens[index - 1];
      if (rest !== '') name = `${name}${rest}`;
      else if (previous !== undefined) name = `${withoutLabel(previous)}${name}`;
      else continue;
    }
    if (name.length <= MAX_COMPANY_LENGTH && !name.includes('@')) return name;
  }
  return undefined;
}

function readDepartment(lines: readonly string[], senderName: string): string | undefined {
  const nameKey = searchKey(senderName);
  for (const line of lines) {
    if (/[、。@〒]|\d{3,}/u.test(toHalfWidth(line))) continue;
    const parts = tokensOf(line)
      .map(withoutLabel)
      .filter(
        (token) =>
          DEPARTMENT_END.test(token) &&
          Array.from(token).length >= 3 &&
          !COMPANY_MARKER.test(token) &&
          // 「長谷部」のような、名前の一部は部署にしない
          !nameKey.includes(searchKey(token)),
      );
    const department = parts.join(' ');
    if (department !== '' && department.length <= MAX_DEPARTMENT_LENGTH) return department;
  }
  return undefined;
}

function readTitle(lines: readonly string[]): string | undefined {
  for (const line of lines) {
    for (const token of tokensOf(line).map(withoutLabel)) {
      if (TITLES.includes(token)) return token;
    }
  }
  return undefined;
}

function readPhones(lines: readonly string[]): Pick<SignatureInfo, 'phone' | 'mobile'> {
  let phone: string | undefined;
  let mobile: string | undefined;
  for (const raw of lines) {
    const line = toHalfWidth(raw);
    for (const match of line.matchAll(PHONE)) {
      const number = match[0].trim();
      const label = line.slice(Math.max(0, match.index - LABEL_WINDOW), match.index);
      // 同じ行に番号が並ぶとき（TEL: ... FAX: ...）は、直前の番号より後ろだけをラベルとして見る
      const nearLabel = label.replace(/^.*\d/u, '');
      if (FAX_LABEL.test(nearLabel)) continue;
      const digits = number.replace(/\D/gu, '').replace(/^81/u, '0').replace(/^00/u, '0');
      const isMobile = MOBILE_LABEL.test(nearLabel) || /^0[789]0/u.test(digits);
      if (isMobile) mobile ??= number;
      else phone ??= number;
    }
  }
  return {
    ...(phone === undefined ? {} : { phone }),
    ...(mobile === undefined ? {} : { mobile }),
  };
}

/** 署名から情報を読み取る。署名が無い・読み取れないときは、空のオブジェクトを返す */
export function extractSignature(source: SignatureSource): SignatureInfo {
  const lines = signatureLines(source);
  if (lines.length === 0) return {};
  const companyName = readCompany(lines);
  const department = readDepartment(lines, source.senderName ?? '');
  const title = readTitle(lines);
  return {
    ...(companyName === undefined ? {} : { companyName }),
    ...(department === undefined ? {} : { department }),
    ...(title === undefined ? {} : { title }),
    ...readPhones(lines),
  };
}
