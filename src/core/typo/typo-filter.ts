/**
 * AI が返した修正案が「誤字の直し」として受け入れられるかを判定する、純粋な処理。
 *
 * AI は、誤字ではない箇所に、意味を変える提案（例：不要です → 必須です）や
 * 言い換え（例：不要です → 不要でございます）を返すことがある。
 * 修正案は利用者が「修正する」を押すとメールに反映されるため、こうした候補は表示しない。
 *
 * 方針：疑わしい候補は捨てる。正しい誤字の指摘を一部取りこぼしても、
 * 意味を変える候補を表示するよりは安全なため。
 * 読み（かな）の辞書は持たないので、文字の並びだけで判定する。
 */

/** 数字として扱う文字（半角・全角・漢数字）。数字が変わる修正は、金額・日付・数量を変えてしまう */
const DIGIT_CHARACTERS = '0123456789０１２３４５６７８９〇一二三四五六七八九十百千万億兆';

/**
 * 意味を左右する語。修正の前後で、これらの語の出現回数が変わる候補は捨てる。
 * - 否定・可否：ない、ません、なし、不、非、未、無、否、欠、禁、必、可
 * - 範囲・向き：上、下、内、外、前、後、増、減
 * - 時期：今、来、先、昨、明、翌、毎、曜日
 * - 時制：ました、でした
 * 「大」「小」「多」「少」などは、誤変換の直しでよく触れる字のため、入れていない。
 */
export const MEANING_WORDS: readonly string[] = [
  'ない',
  'ません',
  'なし',
  '不',
  '非',
  '未',
  '無',
  '否',
  '欠',
  '禁',
  '必',
  '可',
  '上',
  '下',
  '内',
  '外',
  '前',
  '後',
  '増',
  '減',
  '今',
  '来',
  '先',
  '昨',
  '明',
  '翌',
  '毎',
  '月曜',
  '火曜',
  '水曜',
  '木曜',
  '金曜',
  '土曜',
  '日曜',
  'ました',
  'でした',
];

/** 削除する文字数がこれ以上の候補は捨てる（誤字の直しではなく、書き換えとみなす） */
export const MAX_REMOVED_CHARACTERS = 4;

/** 追加する文字数がこれ以上の候補は捨てる（誤字の直しではなく、書き換えとみなす） */
export const MAX_ADDED_CHARACTERS = 4;

/**
 * 何も削除せずに追加だけをする場合、追加する文字数がこれ以上の候補は捨てる。
 * 1文字の脱字の補完は残すが、2文字以上の付け足しは、丁寧語の付け足し
 * （例：お願いします → お願いいたします）と区別できないため。
 */
export const MAX_PURE_INSERTED_CHARACTERS = 2;

/**
 * 助詞として使われる文字。助詞1文字を別の助詞1文字に入れ替えるだけの候補は捨てる。
 * （例：資料を送付 → 資料の送付）。文の関係が変わり、誤字の直しと区別できないため。
 * 「わ」は含めないので、「こんにちわ → こんにちは」は残る。
 */
export const PARTICLE_CHARACTERS = 'をのにはがでとへも';

/** 文字列から、数字の文字だけを出現順に取り出す */
function digitsOf(text: string): string {
  let digits = '';
  for (const character of text) {
    if (DIGIT_CHARACTERS.includes(character)) digits += character;
  }
  return digits;
}

/** 文字列の中に、語が何回現れるか（重ならない数え方） */
function countOccurrences(text: string, word: string): number {
  return text.split(word).length - 1;
}

/** 修正の前後で、意味を左右する語の出現回数が変わるか */
function changesMeaningWords(wrong: string, replacement: string): boolean {
  return MEANING_WORDS.some(
    (word) => countOccurrences(wrong, word) !== countOccurrences(replacement, word),
  );
}

/**
 * 修正の前後の差分の大きさ。
 * 先頭から一致する部分を除き、次に残りの末尾から一致する部分を除いたときに、
 * 元の側に残る文字数（removed）と、修正後の側に残る文字数（added）を返す。
 * 絵文字などを途中で分けないよう、文字（コードポイント）単位で数える。
 */
export function measureDifference(
  wrong: string,
  replacement: string,
): { readonly removed: number; readonly added: number } {
  const { removed, added } = differingParts(wrong, replacement);
  return { removed: removed.length, added: added.length };
}

/** 修正の前後で食い違う部分（先頭と末尾の一致を除いた残り）を、文字の配列で返す */
function differingParts(
  wrong: string,
  replacement: string,
): { readonly removed: readonly string[]; readonly added: readonly string[] } {
  const from = Array.from(wrong);
  const to = Array.from(replacement);
  const shorter = Math.min(from.length, to.length);

  let head = 0;
  while (head < shorter && from[head] === to[head]) head++;

  let tail = 0;
  while (tail < shorter - head && from[from.length - 1 - tail] === to[to.length - 1 - tail]) {
    tail++;
  }
  return { removed: from.slice(head, from.length - tail), added: to.slice(head, to.length - tail) };
}

/**
 * 修正案を「誤字の直し」として表示してよいか。
 *
 * @param wrong 誤りと指摘された箇所
 * @param replacement その箇所を実際に置き換える文字列（前後との重なりを取り除いた後の修正案）
 */
export function isSafeTypoFix(wrong: string, replacement: string): boolean {
  // 置き換えても何も変わらない
  if (wrong === replacement) return false;
  // 数字が変わる（金額・日付・数量の変更）
  if (digitsOf(wrong) !== digitsOf(replacement)) return false;
  // 否定・可否・範囲・時期・時制が変わる
  if (changesMeaningWords(wrong, replacement)) return false;
  const parts = differingParts(wrong, replacement);
  const removed = parts.removed.length;
  const added = parts.added.length;
  // 差分が大きい（書き換え・付け足し）
  if (removed >= MAX_REMOVED_CHARACTERS || added >= MAX_ADDED_CHARACTERS) return false;
  if (removed === 0 && added >= MAX_PURE_INSERTED_CHARACTERS) return false;
  // 助詞1文字を、別の助詞1文字に入れ替えるだけ
  if (
    removed === 1 &&
    added === 1 &&
    PARTICLE_CHARACTERS.includes(parts.removed[0] ?? '') &&
    PARTICLE_CHARACTERS.includes(parts.added[0] ?? '')
  ) {
    return false;
  }
  return true;
}

/** 制御文字（改行・タブを含む）が入っているか。表示の乱れや埋め込みを防ぐために調べる */
export function hasControlCharacter(text: string): boolean {
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}
