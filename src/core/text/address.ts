/**
 * メールアドレス・ドメインの文字列処理。
 * 比較はすべて「前後の空白を除き、小文字にした値」で行う。
 */

/** アドレスを比較用に正規化する（前後の空白を除き、小文字にする） */
export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

/** ドメインを比較用に正規化する（前後の空白と先頭の @ を除き、小文字にする） */
export function normalizeDomain(domain: string): string {
  return domain.trim().replace(/^@/, '').toLowerCase();
}

/** アドレスのドメイン部分（小文字）を返す。@ が無い場合は空文字 */
export function domainOf(address: string): string {
  const normalized = normalizeAddress(address);
  const at = normalized.lastIndexOf('@');
  return at === -1 ? '' : normalized.slice(at + 1);
}

/** メールアドレスらしい形（@ の前後に文字があり、ドメインに . を含む）かどうか */
export function looksLikeAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** ドメインらしい形（空白・@ を含まず、. を含む）かどうか */
export function looksLikeDomain(value: string): boolean {
  return /^[^\s@.]+(\.[^\s@.]+)+$/.test(normalizeDomain(value));
}
