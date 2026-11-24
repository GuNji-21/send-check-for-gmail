/**
 * 利用者が登録した誤り（よくある誤変換）の検知。
 *
 * 設定画面で登録した「誤り」が、件名または本文（引用部分を除く）にあれば検知する。
 * 登録した文字列と、そのまま一致するものだけを探す（大文字・小文字、全角・半角も区別する）。
 * 「正しい書き方」が登録されていれば、あわせて表示する。
 */

import type { Detector } from '../types';

/** 表示する件数の上限 */
const MAX_SHOWN = 5;

export const customTypoDetector: Detector = {
  id: 'custom-typo',
  detect(snapshot, context) {
    const text = `${snapshot.subject}\n${snapshot.bodyText}`;
    const found: string[] = [];
    for (const entry of context.typoDictionary) {
      if (entry.wrong === '' || !text.includes(entry.wrong)) continue;
      found.push(entry.right === '' ? entry.wrong : `${entry.wrong} → ${entry.right}`);
    }
    if (found.length === 0) return [];
    return [
      {
        detectorId: 'custom-typo',
        messageKey: 'detectCustomTypo',
        substitutions: [found.slice(0, MAX_SHOWN).join('、')],
      },
    ];
  },
};
