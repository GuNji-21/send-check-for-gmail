/**
 * 同じ文字の重複の検知（打ち間違いで同じ文字が2回入ったもの）。
 *
 * 件名と本文（引用部分を除く）から、次のものを検知する。
 * - 「をを」（どこにあっても誤り）
 * - 漢字・カタカナ・英数字の直後で、同じ助詞が2つ続くもの（例：資料がが、会議にに）
 * - 文末の言い回しの重複（例：おりまます、お送りしまします、くだださい）
 * - ひらがなの決まった言い回しの中の重複（例：ありががとう、よろろしく）
 *
 * 正しい表現を誤って検知しないよう、対象を絞っている。
 * - 助詞の重複は、ひらがなの直後では検知しない（「こととなり」「ものの」「ここまでで」などが正しいため）
 * - 「もも」は検知しない（「鶏もも」などが正しいため）
 * - 「ますます」は検知しない（正しい副詞のため）
 * - 「まます」は、文の終わりにあるときだけ検知する（「このまますぐに」などが正しいため）
 */

import type { Detector } from '../types';

/** 表示する件数の上限 */
const MAX_SHOWN = 5;

/** 見つかった箇所の前に付けて表示する文字数（どこの重複かが分かるようにする） */
const CONTEXT_CHARACTERS = 2;

const PATTERNS: readonly RegExp[] = [
  // 「をを」
  /を{2,}/gu,
  // 名詞らしい文字（漢字・カタカナ・英数字）の直後で、同じ助詞が2つ続く
  /(?<=[\p{Script=Han}\p{Script=Katakana}々ーA-Za-z0-9Ａ-Ｚａ-ｚ０-９])([がのにはでとへ])\1/gu,
  // 「ます」の重複。「まます」は文の終わり（句読点・空白・末尾の前）にあるときだけ
  /まます(?=[。、．，！？!?\s]|$)/gu,
  /まま(?:せん|した|しょう)/gu,
  /しまし(?:ます|ました|ません)/gu,
  // 文末の言い回しがそのまま2回続く（「ますます」は正しい副詞なので含めない）
  /(です|でした|ました|ません|ください)\1/gu,
  // よくある言い回しの中の重複
  /くだださい|くだささい|いたたし|いたしし|いいいた/gu,
  // ひらがなの決まった言い回しの中の重複（助詞の重複の検知では、ひらがなの直後を見ないため、ここで拾う）
  /ありりがとう|ありががとう|ありがととう|よろろしく|よろししく|おねががい/gu,
];

function findRepeats(text: string): string[] {
  const found: { index: number; value: string }[] = [];
  for (const pattern of PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      // 直前の文字を少し付ける（改行や空白はまたがない）
      const before = Array.from(text.slice(Math.max(0, match.index - 8), match.index))
        .slice(-CONTEXT_CHARACTERS)
        .join('')
        .replace(/^.*\s/su, '');
      found.push({ index: match.index, value: before + match[0] });
    }
  }
  return found.sort((a, b) => a.index - b.index).map((item) => item.value);
}

export const repeatedCharactersDetector: Detector = {
  id: 'repeated-characters',
  detect(snapshot) {
    const all = [...findRepeats(snapshot.subject), ...findRepeats(snapshot.bodyText)];
    const unique = [...new Set(all)];
    if (unique.length === 0) return [];
    return [
      {
        detectorId: 'repeated-characters',
        messageKey: 'detectRepeatedCharacters',
        substitutions: [unique.slice(0, MAX_SHOWN).join('、')],
      },
    ];
  },
};
