/**
 * 画面文言の取得（chrome.i18n）。
 *
 * 画面文言はコードに直接書かず、public/_locales/ja/messages.json と en/messages.json の両方に追加し、
 * ここの関数を通して取得する。キーを追加したら MESSAGE_KEYS にも追加する
 * （_locales と MESSAGE_KEYS が一致していることは tests/unit/locales.test.ts で確認している）。
 */

import type { DetectionMessageKey } from '../core/types';

/** _locales に定義済みのメッセージキー */
export const MESSAGE_KEYS = [
  // 拡張機能の名前など
  'extName',
  'extDescription',
  // エラー・注意
  'errorCheckFailed',
  'errorCheckFailedHint',
  'errorSendButtonNotFound',
  // 確認ダイアログ
  'dialogTitle',
  'dialogFrom',
  'dialogRecipients',
  'dialogNoRecipients',
  'dialogFieldTo',
  'dialogFieldCc',
  'dialogFieldBcc',
  'dialogBadgeExternal',
  'dialogBadgeInternal',
  'dialogBadgeCaution',
  'dialogExternalSummary',
  'dialogCompanyCount',
  'dialogCheckAllInternal',
  'dialogSubject',
  'dialogSubjectEmpty',
  'dialogBody',
  'dialogBodyEmpty',
  'dialogAttachments',
  'dialogNoAttachments',
  'dialogWarnings',
  'dialogLevelWarn',
  'dialogRemaining',
  'dialogSend',
  'dialogSchedule',
  'dialogCancel',
  'dialogClose',
  // 検知結果
  'detectAttachmentMissing',
  'detectPlaceholder',
  'detectDateWeekdayMismatch',
  'detectDateInvalid',
  'detectSubjectEmpty',
  'detectMultipleExternalCompanies',
  // 設定画面
  'optionsTitle',
  'optionsOnePerLine',
  'optionsSectionRecipients',
  'optionsInternalDomains',
  'optionsInternalDomainsHelp',
  'optionsInternalAddresses',
  'optionsCautionDomains',
  'optionsCautionAddresses',
  'optionsCautionHelp',
  'optionsSkipEnabled',
  'optionsSkipAddresses',
  'optionsSkipHelp',
  'optionsFreemailNote',
  'optionsSectionAttachment',
  'optionsAttachmentKeywords',
  'optionsDriveLinks',
  'optionsSectionLevels',
  'optionsLevelsHelp',
  'detectorNameAttachmentMissing',
  'detectorNamePlaceholder',
  'detectorNameDateWeekday',
  'detectorNameSubjectEmpty',
  'detectorNameMultipleCompanies',
  'optionsSave',
  'optionsSaved',
  'optionsInvalidEntries',
  'optionsLoadFailed',
  'optionsSaveFailed',
  'optionsSectionData',
  'optionsClearData',
  'optionsClearConfirm',
  'optionsCleared',
  'optionsUndoSendTip',
] as const;

export type MessageKey = (typeof MESSAGE_KEYS)[number];

// 検知結果のキー（src/core/types.ts）がすべて MESSAGE_KEYS に含まれていることを、型で確認する
type AssertTrue<T extends true> = T;
export type DetectionKeysAreMessageKeys = AssertTrue<
  DetectionMessageKey extends MessageKey ? true : false
>;

/**
 * メッセージキーから表示文言を取得する。
 *
 * 文言が見つからない場合や chrome.i18n が使えない場合は、キーの名前をそのまま返す。
 * ここで例外を投げると、エラーを表示する処理そのものが失敗してしまうため。
 * （キーの定義漏れはテストで検出する）
 */
export function t(key: MessageKey, substitutions?: readonly string[]): string {
  try {
    const message = chrome.i18n.getMessage(key, substitutions ? [...substitutions] : undefined);
    return message === '' ? key : message;
  } catch {
    // 拡張機能の更新直後など、chrome.i18n が使えなくなっている場合
    return key;
  }
}
