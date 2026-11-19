/**
 * 検知器で共通に使うテキストの正規化。
 */

/**
 * 全角の英数字・記号を半角にそろえる（NFKC）。
 * 「１１月１３日（木）」と「11月13日(木)」を同じように扱えるようにするため。
 * 文字数が変わることがあるので、正規化後の位置を元の文字列の位置として使わないこと。
 */
export function toHalfWidth(text: string): string {
  return text.normalize('NFKC');
}

/** 1行1件のテキストを配列にする（前後の空白を除き、空行と重複を除く） */
export function parseLines(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const value = line.trim();
    if (value === '' || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}
