/**
 * 添付漏れの検知。
 *
 * 本文（引用部分を除く）に添付を示すキーワードがあり、添付ファイルが0件の場合に検知する。
 *
 * 判定のルール：
 * 1. 添付ファイルが1件以上あれば、検知しない。
 * 2. 設定で「Google ドライブのリンクを添付ありとみなす」が有効で、本文にドライブのリンクがあれば、検知しない。
 * 3. 本文を文ごとに分け、次の文は調べない（自分が添付する話ではないため）。
 *    - 相手に送付・添付を頼んでいる、または相手が送ってくれたことに触れている文
 *      （例：「請求書を送付してください」「ご送付いただいた資料」「添付をお願いします」）
 *    - 添付が無いことを述べている文（例：「添付ファイルはありません」「添付なし」）
 * 4. 残った文にキーワードがあれば検知する。大文字・小文字、全角・半角は区別しない。
 *
 * 調べるのは本文だけで、件名は調べない（返信の件名には、過去のメールの「請求書」などが残るため）。
 * 署名は本文に含まれる。インライン画像は添付として数えない。
 */

import { toHalfWidth } from '../text/normalize';
import type { Detector } from '../types';

/** 表示するキーワードの上限 */
const MAX_SHOWN_KEYWORDS = 3;

/** 文の区切り（句点・感嘆符・疑問符・改行） */
const SENTENCE_BREAK = /[。．.!?！？\n]+/u;

/**
 * 相手の送付・添付についての文（依頼、またはお礼・言及）。
 * 「添付」「送付」などの直後に「いただく」「ください」「お願い」などが続く形で見分ける。
 * 「添付ファイルをご確認ください」は、「添付」の直後が「ファイル」なので当てはまらない。
 */
const ABOUT_THEIR_SENDING =
  /(?:添付|別添|同封|送付|送信|送り|共有|提出|返送)(?:して|を|の)?(?:いただ|頂|くださ|下さ|お願い|願い|もらえ|もらい|賜)/u;

/** 添付が無いことを述べている文 */
const NO_ATTACHMENT =
  /(?:添付|別添|同封)(?:ファイル|資料|書類)?(?:は|も|が)?(?:ありません|ございません|無し|なし|ない|不要|していません|しておりません)/u;

/** 自分が添付する話として調べる文だけを取り出す */
function relevantText(bodyText: string): string {
  return toHalfWidth(bodyText)
    .split(SENTENCE_BREAK)
    .filter((sentence) => !ABOUT_THEIR_SENDING.test(sentence) && !NO_ATTACHMENT.test(sentence))
    .join('\n')
    .toLowerCase();
}

export const attachmentMissingDetector: Detector = {
  id: 'attachment-missing',
  detect(snapshot, context) {
    if (snapshot.attachments.length > 0) return [];
    if (context.treatDriveLinksAsAttachment && snapshot.driveLinkCount > 0) return [];

    const text = relevantText(snapshot.bodyText);
    const found: string[] = [];
    for (const keyword of context.attachmentKeywords) {
      const needle = toHalfWidth(keyword).trim().toLowerCase();
      if (needle === '' || !text.includes(needle)) continue;
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
