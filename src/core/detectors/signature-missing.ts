/**
 * 署名がないことの検知。
 *
 * 利用者が設定画面で登録した「署名に必ず入る言葉」（自分の名前など）が、
 * 本文（引用部分を除く）に1つも無い場合に検知する。
 *
 * 言葉が登録されていないときは、何も検知しない。
 * 署名の形は人によって違い、文面だけから署名の有無を決めると誤りが多くなるため、
 * 利用者が登録した言葉だけを手がかりにする。
 *
 * 空白の有無と、全角・半角、大文字・小文字の違いは無視する（「山田 太郎」と「山田　太郎」を同じに扱う）。
 */

import { toHalfWidth } from '../text/normalize';
import type { Detector } from '../types';

function fold(text: string): string {
  return toHalfWidth(text).replace(/\s+/gu, '').toLowerCase();
}

export const signatureMissingDetector: Detector = {
  id: 'signature-missing',
  detect(snapshot, context) {
    const keywords = context.signatureKeywords.map(fold).filter((keyword) => keyword !== '');
    if (keywords.length === 0) return [];
    const body = fold(snapshot.bodyText);
    if (keywords.some((keyword) => body.includes(keyword))) return [];
    return [
      {
        detectorId: 'signature-missing',
        messageKey: 'detectSignatureMissing',
        substitutions: [context.signatureKeywords.join('、')],
      },
    ];
  },
};
