/**
 * 本文の冒頭の宛名（「株式会社サンプル 営業部 見本様」など）の読み取り。
 *
 * 宛名とみなすのは、本文の最初のかたまり（先頭の空行を除き、次の空行まで。最大3行）のうち、
 * 文になっていない行だけ。「お世話になっております。」のような文が出てきたら、そこで終わりにする。
 */

import { COMPANY_MARKER } from './company';

/** 宛名として見る最大行数 */
const MAX_SALUTATION_LINES = 3;

/** 宛名とみなす行の最大文字数 */
const MAX_SALUTATION_LENGTH = 50;

/** 文になっている行（宛名ではない）の終わり方 */
const SENTENCE_END = /[。．！？!?]$|です$|ます$|ました$|でした$|ません$|ください$/u;

/** 敬称の直前の言葉（空白や区切りの記号を含まない）と敬称 */
const NAME_WITH_HONORIFIC =
  /([^\s　、,，・/／()（）「」:：]{1,15})[ 　]*(?:様|さま|さん|殿|先生)/gu;

/** 名前の後ろに付く役職（名前の照合の前に取り除く） */
const TITLES: readonly string[] = [
  '代表取締役社長',
  '代表取締役',
  '取締役',
  '社長',
  '会長',
  '専務',
  '常務',
  '本部長',
  '事業部長',
  '支店長',
  '部長',
  '次長',
  '課長',
  '係長',
  '主任',
  '店長',
  '所長',
  '室長',
  'マネージャー',
  'リーダー',
];

/**
 * 役職を取り除いた名前の候補を返す。
 * 「見本部長」は「見本＋部長」とも「見＋本部長」とも読めるので、両方を候補にする。
 * 1文字だけの候補は、ほかに候補があれば捨てる。役職が付いていなければ、そのまま返す。
 */
function withoutTitle(raw: string): string[] {
  const candidates = TITLES.filter((title) => raw.endsWith(title))
    .map((title) => raw.slice(0, -title.length))
    .filter((name) => name !== '');
  if (candidates.length === 0) return TITLES.includes(raw) ? [] : [raw];
  const long = candidates.filter((name) => Array.from(name).length >= 2);
  // 長い候補（取り除いた役職が短いもの）を先にする
  return [...new Set(long.length > 0 ? long : candidates)].sort((a, b) => b.length - a.length);
}

/** 特定の人を指さない宛名（照合しない） */
const GENERIC_NAME = /(?:担当者|担当|皆|皆々|客|関係者|各位|御中|一同|チーム|メンバー)$/u;

/** 読み取った宛名 */
export interface Salutation {
  /**
   * 敬称が付いた名前（敬称と役職は除く）。例：「見本」。
   * 1人分が1つの配列で、読み方が複数ある場合は候補が複数入る（1つ目が表示用）。
   */
  readonly names: readonly (readonly string[])[];
  /** 会社名が書かれた行（会社名の手がかりがある行、または「御中」で終わる行）。無ければ省略 */
  readonly companyLine?: string;
  /** 「ご担当者様」「皆様」など、特定の人を指さない宛名があったか */
  readonly generic: boolean;
}

/** 本文の冒頭から宛名を読み取る。宛名が無ければ、names は空で companyLine は無い */
export function readSalutation(bodyText: string): Salutation {
  const lines = bodyText.split(/\r?\n/).map((line) => line.trim());
  while (lines.length > 0 && lines[0] === '') lines.shift();

  const names: string[][] = [];
  let companyLine: string | undefined;
  let generic = false;
  for (const line of lines.slice(0, MAX_SALUTATION_LINES)) {
    if (line === '' || line.length > MAX_SALUTATION_LENGTH || SENTENCE_END.test(line)) break;
    if (companyLine === undefined && (COMPANY_MARKER.test(line) || line.endsWith('御中'))) {
      companyLine = line;
    }
    for (const match of line.matchAll(NAME_WITH_HONORIFIC)) {
      const raw = match[1] ?? '';
      if (GENERIC_NAME.test(raw)) {
        generic = true;
        continue;
      }
      // 役職だけ（「部長様」）や、会社名に敬称を付けたもの（「株式会社サンプル様」）は、人の名前として扱わない
      if (COMPANY_MARKER.test(raw)) continue;
      const candidates = withoutTitle(raw);
      const shown = candidates[0];
      if (shown === undefined || names.some((existing) => existing[0] === shown)) continue;
      names.push(candidates);
    }
  }
  return companyLine === undefined ? { names, generic } : { names, companyLine, generic };
}
