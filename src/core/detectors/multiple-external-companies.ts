/**
 * 複数社混在の検知。
 *
 * 宛先（To / Cc / Bcc）に、社外の会社が2社以上含まれる場合に検知する。
 * フェーズ1では会社台帳が無いため、ドメインを会社とみなす。フリーメールはアドレスごとに別の相手として数える。
 * 社内扱いの宛先（送信元と同じドメイン、社内として登録済み）は数えない。
 */

import { companyKeyOf, isInternalAddress } from '../classify';
import type { Detector } from '../types';

/** 表示する件数の上限 */
const MAX_SHOWN = 5;

export const multipleExternalCompaniesDetector: Detector = {
  id: 'multiple-external-companies',
  detect(snapshot, context) {
    const classification = { rules: context.rules, fromAddress: snapshot.fromAddress };
    const companies = new Set<string>();
    for (const recipient of snapshot.recipients) {
      if (isInternalAddress(recipient.address, classification)) continue;
      companies.add(companyKeyOf(recipient.address));
    }
    if (companies.size < 2) return [];
    return [
      {
        detectorId: 'multiple-external-companies',
        messageKey: 'detectMultipleExternalCompanies',
        substitutions: [String(companies.size), [...companies].slice(0, MAX_SHOWN).join('、')],
      },
    ];
  },
};
