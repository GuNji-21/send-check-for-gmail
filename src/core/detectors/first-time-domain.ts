/**
 * 初めて送るドメインの検知。
 *
 * 宛先（To / Cc / Bcc）に、これまで送ったことのない社外のドメインがある場合に検知する。
 * 似たドメインへの誤送信（example.co.jp と example.com など）に気づくためのもの。
 *
 * 連絡先の記録（台帳）を使う。次の場合は検知しない。
 * - 台帳が無効、または読み込めなかった（context.ledger が無い）
 * - 記録した送信が少ない（入れた直後は、すべての宛先が「初めて」になり、警告だらけになるため）
 * - 社内扱いの宛先
 *
 * フリーメールは、アドレスごとに別の相手として扱う。
 */

import { companyKeyOf, isInternalAddress } from '../classify';
import type { Detector } from '../types';

/** この回数の送信を記録するまでは、検知しない */
export const MIN_SENDS_FOR_FIRST_TIME = 5;

/** 表示する件数の上限 */
const MAX_SHOWN = 5;

export const firstTimeDomainDetector: Detector = {
  id: 'first-time-domain',
  detect(snapshot, context) {
    const { ledger } = context;
    if (ledger === undefined || ledger.totalSends < MIN_SENDS_FOR_FIRST_TIME) return [];

    const classification = { rules: context.rules, fromAddress: snapshot.fromAddress };
    const known = new Set(ledger.knownCompanies);
    const firstTime: string[] = [];
    for (const recipient of snapshot.recipients) {
      if (isInternalAddress(recipient.address, classification)) continue;
      const companyKey = companyKeyOf(recipient.address);
      if (!known.has(companyKey) && !firstTime.includes(companyKey)) firstTime.push(companyKey);
    }
    if (firstTime.length === 0) return [];
    return [
      {
        detectorId: 'first-time-domain',
        messageKey: 'detectFirstTimeDomain',
        substitutions: [firstTime.slice(0, MAX_SHOWN).join('、')],
      },
    ];
  },
};
