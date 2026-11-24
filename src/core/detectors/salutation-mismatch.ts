/**
 * 宛名と宛先の照合。
 *
 * 本文の冒頭の宛名（「株式会社サンプル 見本様」）を、宛先の名前・会社名と比べる。
 * - 名前：To の宛先全員の名前（台帳の氏名。無ければ宛先欄の表示名）が分かっていて、
 *   宛名の名前がどの宛先（To / Cc / Bcc）の名前にも含まれないときに検知する
 * - 会社名：To の宛先全員の会社名が台帳に登録されていて、
 *   宛名の会社名の行に、どの宛先の会社名も含まれないときに検知する
 *
 * 分からないことがあるときは検知しない（誤った警告を出さないことを優先する）。
 * - 名前が分からない To の宛先が1人でもいれば、名前は照合しない（宛名はその人かもしれないため）
 * - 宛名が漢字・かなで、表示名がローマ字（またはその逆）の宛先は、名前が分からないものとして扱う
 * - 「ご担当者様」「皆様」など、特定の人を指さない宛名があれば、名前は照合しない
 * - 台帳の情報が無いとき（無効・読めなかった）は、何も検知しない
 */

import { companySearchKey, hasJapanese, searchKey } from '../text/company';
import { normalizeAddress } from '../text/address';
import { readSalutation } from '../text/salutation';
import type { Detection, Detector } from '../types';

/** 表示する件数の上限 */
const MAX_SHOWN = 3;

export const salutationMismatchDetector: Detector = {
  id: 'salutation-mismatch',
  detect(snapshot, context) {
    const { ledger } = context;
    if (ledger === undefined) return [];
    const salutation = readSalutation(snapshot.bodyText);
    const results: Detection[] = [];
    const toRecipients = snapshot.recipients.filter((recipient) => recipient.field === 'to');
    if (toRecipients.length === 0) return [];

    // 宛先の名前（台帳の氏名 → 宛先欄の表示名。アドレスがそのまま入っている表示名は名前として扱わない）
    const nameOf = (address: string, displayName: string | undefined): string | undefined => {
      const name = ledger.recipientNames?.[normalizeAddress(address)] ?? displayName;
      return name === undefined || name.trim() === '' || name.includes('@') ? undefined : name;
    };

    if (salutation.names.length > 0 && !salutation.generic) {
      const japanese = salutation.names.some((candidates) => candidates.some(hasJapanese));
      const comparable = (name: string | undefined): name is string =>
        name !== undefined && hasJapanese(name) === japanese;
      const toNames = toRecipients.map((recipient) =>
        nameOf(recipient.address, recipient.displayName),
      );
      if (toNames.every(comparable)) {
        const allKeys = snapshot.recipients
          .map((recipient) => nameOf(recipient.address, recipient.displayName))
          .filter(comparable)
          .map(searchKey);
        const matched = salutation.names.some((candidates) =>
          candidates.some((name) => {
            const key = searchKey(name);
            return allKeys.some((recipientKey) => recipientKey.includes(key));
          }),
        );
        if (!matched) {
          results.push({
            detectorId: 'salutation-mismatch',
            messageKey: 'detectSalutationName',
            substitutions: [
              salutation.names
                .slice(0, MAX_SHOWN)
                .map((candidates) => candidates[0] ?? '')
                .join('、'),
              toNames.slice(0, MAX_SHOWN).join('、'),
            ],
          });
        }
      }
    }

    if (salutation.companyLine !== undefined) {
      const lineKey = companySearchKey(salutation.companyLine);
      const toCompanies = toRecipients.map(
        (recipient) => ledger.recipientCompanyNames?.[normalizeAddress(recipient.address)] ?? [],
      );
      if (toCompanies.every((names) => names.length > 0)) {
        const allNames = snapshot.recipients.flatMap(
          (recipient) => ledger.recipientCompanyNames?.[normalizeAddress(recipient.address)] ?? [],
        );
        const matched = allNames.some((name) => lineKey.includes(companySearchKey(name)));
        if (!matched) {
          const shown = [...new Set(toCompanies.map((names) => names[0] ?? ''))];
          results.push({
            detectorId: 'salutation-mismatch',
            messageKey: 'detectSalutationCompany',
            substitutions: [salutation.companyLine, shown.slice(0, MAX_SHOWN).join('、')],
          });
        }
      }
    }
    return results;
  },
};
