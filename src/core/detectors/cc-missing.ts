/**
 * Cc 漏れの検知。
 *
 * その相手（To のアドレス）へのメールで、過去によく Cc に入れていた人が、今回の宛先（To / Cc / Bcc）に
 * 入っていない場合に検知する。
 *
 * 会社単位ではなく、To のアドレス単位で判断する。同じ会社でも、相手の部署によって
 * Cc に入れる人が変わるため。
 *
 * 「よく」の基準：その相手を To に入れて送った回数が MIN_SENDS_TO_ADDRESS 回以上あり、
 * そのうち MIN_CC_RATIO 以上の割合で Cc に入れていた人。
 *
 * 連絡先の記録（台帳）を使う。台帳が無効、または読み込めなかった場合（context.ledger が無い）は
 * 検知しない。
 */

import { normalizeAddress } from '../text/address';
import type { Detector } from '../types';

/** その相手を To に入れて、この回数以上送っている場合だけ判断する */
export const MIN_SENDS_TO_ADDRESS = 3;

/** その相手へのメールのうち、この割合以上で Cc に入れていた人を「よく入れる人」とみなす */
export const MIN_CC_RATIO = 0.5;

/** 表示する件数の上限 */
const MAX_SHOWN = 5;

export const ccMissingDetector: Detector = {
  id: 'cc-missing',
  detect(snapshot, context) {
    const { ledger } = context;
    if (ledger === undefined) return [];

    const present = new Set(snapshot.recipients.map((r) => normalizeAddress(r.address)));
    present.add(normalizeAddress(snapshot.fromAddress));
    const missing: string[] = [];
    for (const history of ledger.ccHistory) {
      if (history.toSendCount < MIN_SENDS_TO_ADDRESS) continue;
      if (history.count / history.toSendCount < MIN_CC_RATIO) continue;
      const address = normalizeAddress(history.address);
      if (!present.has(address) && !missing.includes(address)) missing.push(address);
    }
    if (missing.length === 0) return [];
    return [
      {
        detectorId: 'cc-missing',
        messageKey: 'detectCcMissing',
        substitutions: [missing.slice(0, MAX_SHOWN).join('、')],
      },
    ];
  },
};
