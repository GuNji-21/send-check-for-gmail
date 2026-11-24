/**
 * 宛先に無い会社名の検知（使い回したメール・添付の、直し忘れ対策）。
 *
 * 台帳に登録されている会社名（別名を含む）のうち、今回の宛先の会社ではないものが、
 * 件名・本文（引用部分を除く）にある場合に検知する。
 * 添付ファイルの名前については、別の検知項目（attachment-company.ts）で、同じ照合を使って調べる。
 *
 * 照合では、「株式会社」などの語、全角・半角、大文字・小文字、空白の違いを無視する。
 * 短い名前が別の言葉の一部に一致しないよう、「株式会社」などを除いた部分が3文字未満の会社名は、
 * 登録した名前がそのまま（「株式会社」なども含めて）書かれているときだけ一致とみなす。
 * 台帳の情報が無いとき、会社名が1件も登録されていないときは、何も検知しない。
 */

import { companySearchKey, searchKey } from '../text/company';
import { normalizeAddress } from '../text/address';
import type { ComposeSnapshot, Detector, DetectorContext } from '../types';

/** 表示する件数の上限 */
const MAX_SHOWN = 3;

/** 「株式会社」などを除いた部分で照合する、最小の文字数 */
const MIN_CORE_LENGTH = 3;

/** 今回の宛先の会社ではない会社名のうち、text に含まれるものを返す */
export function findOtherCompanies(
  text: string,
  snapshot: ComposeSnapshot,
  context: DetectorContext,
): string[] {
  const { ledger } = context;
  const others = ledger?.otherCompanyNames ?? [];
  if (ledger === undefined || others.length === 0 || text.trim() === '') return [];

  const recipientKeys = snapshot.recipients
    .flatMap(
      (recipient) => ledger.recipientCompanyNames?.[normalizeAddress(recipient.address)] ?? [],
    )
    .map(companySearchKey);
  const textKey = searchKey(text);
  const found: string[] = [];
  const foundKeys: string[] = [];
  for (const name of others) {
    const core = companySearchKey(name);
    const key = Array.from(core).length >= MIN_CORE_LENGTH ? core : searchKey(name);
    if (Array.from(key).length < 2 || !textKey.includes(key)) continue;
    // 宛先の会社名の一部になっている名前（サンプル と サンプル商事）は、宛先の会社名として書かれた可能性がある
    if (recipientKeys.some((recipientKey) => recipientKey.includes(core))) continue;
    if (foundKeys.includes(core)) continue;
    foundKeys.push(core);
    found.push(name);
  }
  return found;
}

export const otherCompanyInBodyDetector: Detector = {
  id: 'other-company-in-body',
  detect(snapshot, context) {
    const found = findOtherCompanies(
      `${snapshot.subject}\n${snapshot.bodyText}`,
      snapshot,
      context,
    );
    if (found.length === 0) return [];
    return [
      {
        detectorId: 'other-company-in-body',
        messageKey: 'detectOtherCompanyInBody',
        substitutions: [found.slice(0, MAX_SHOWN).join('、')],
      },
    ];
  },
};
