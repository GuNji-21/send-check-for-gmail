/**
 * 会社名・氏名の文字列処理（検索と照合で共通に使う）。
 */

import { toHalfWidth } from './normalize';

/** 会社の種類を表す語（照合では無視する）。全角は NFKC で半角にそろえてから比べる */
const COMPANY_TYPE_WORDS =
  /株式会社|有限会社|合同会社|合資会社|合名会社|\(株\)|\(有\)|\(同\)|co\.,?ltd\.?|inc\.?|corp\.?|ltd\.?|llc/giu;

/** 会社名の手がかりになる語が入っているか（宛名の行が会社名かどうかの判断に使う） */
export const COMPANY_MARKER =
  /株式会社|有限会社|合同会社|合資会社|合名会社|[（(]株[）)]|[（(]有[）)]|[（(]同[）)]|㈱|㈲/u;

/** 照合用に文字列をそろえる（全角・半角、大文字・小文字、空白の違いを無視する） */
export function searchKey(text: string): string {
  return toHalfWidth(text).toLowerCase().replace(/\s+/gu, '');
}

/** 会社名を照合用にそろえる（「株式会社」などの語も無視する） */
export function companySearchKey(name: string): string {
  const key = toHalfWidth(name).toLowerCase().replace(COMPANY_TYPE_WORDS, '').replace(/\s+/gu, '');
  // 種類の語だけの名前（「株式会社」だけ）は、元の文字列で比べる
  return key === '' ? searchKey(name) : key;
}

/** 日本語の文字（漢字・ひらがな・カタカナ）を含むか */
export function hasJapanese(text: string): boolean {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);
}
