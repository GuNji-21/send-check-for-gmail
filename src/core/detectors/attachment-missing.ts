/**
 * 添付漏れの検知。
 *
 * 本文（引用部分を除く）に添付を示すキーワードがあり、添付ファイルが0件の場合に検知する。
 * 設定で「Google ドライブのリンクを添付ありとみなす」が有効な場合、ドライブのリンクがあれば検知しない。
 * キーワードは大文字・小文字、全角・半角を区別せずに探す。
 */

import { toHalfWidth } from '../text/normalize';
import type { Detector } from '../types';

/** 表示するキーワードの上限 */
const MAX_SHOWN_KEYWORDS = 3;

export const attachmentMissingDetector: Detector = {
  id: 'attachment-missing',
  detect(snapshot, context) {
    if (snapshot.attachments.length > 0) return [];
    if (context.treatDriveLinksAsAttachment && snapshot.driveLinkCount > 0) return [];

    const body = toHalfWidth(snapshot.bodyText).toLowerCase();
    const found: string[] = [];
    for (const keyword of context.attachmentKeywords) {
      const needle = toHalfWidth(keyword).trim().toLowerCase();
      if (needle === '' || !body.includes(needle)) continue;
      // 「添付」と「添付ファイル」のように、すでに挙げた語に含まれる・含む語は重ねて挙げない
      if (found.some((other) => other.includes(needle) || needle.includes(other))) continue;
      found.push(needle);
    }
    if (found.length === 0) return [];

    return [
      {
        detectorId: 'attachment-missing',
        messageKey: 'detectAttachmentMissing',
        substitutions: [found.slice(0, MAX_SHOWN_KEYWORDS).join('、')],
      },
    ];
  },
};
