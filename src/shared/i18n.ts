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
  'dialogTypoTitle',
  'dialogTypoChecking',
  'dialogTypoNone',
  'dialogTypoFailed',
  'dialogTypoNotReady',
  'dialogTypoArrow',
  'dialogTypoApply',
  'dialogTypoApplied',
  'dialogTypoApplyFailed',
  'dialogTypoApplyAmbiguous',
  'dialogTypoFixedLine',
  'dialogTypoUndo',
  'dialogTypoUndoFailed',
  'dialogTypoReview',
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
  'detectFirstTimeDomain',
  'detectCcMissing',
  'dialogLedgerUnavailable',
  // 設定画面
  'optionsTitle',
  'optionsReloadTip',
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
  'optionsSectionAi',
  'optionsAiEnabled',
  'optionsAiHelp',
  'optionsAiStatusUnavailable',
  'optionsAiStatusDownloadable',
  'optionsAiStatusDownloading',
  'optionsAiStatusAvailable',
  'optionsAiDownload',
  'optionsAiDownloadFailed',
  'optionsSectionLevels',
  'optionsLevelsHelp',
  'detectorNameAttachmentMissing',
  'detectorNamePlaceholder',
  'detectorNameDateWeekday',
  'detectorNameSubjectEmpty',
  'detectorNameMultipleCompanies',
  'detectorNameFirstTimeDomain',
  'detectorNameCcMissing',
  'optionsSectionLedger',
  'optionsLedgerHelp',
  'optionsLedgerEnabled',
  'optionsLedgerRetention',
  'optionsLedgerRetentionHalf',
  'optionsLedgerRetention1',
  'optionsLedgerRetention2',
  'optionsLedgerRetention5',
  'optionsLedgerStats',
  'optionsLedgerStatsFailed',
  'optionsLedgerClear',
  'optionsLedgerCleared',
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
 * 差し込み位置の目印。chrome.i18n には差し込み値の代わりにこの目印を渡して文言のひな形を取得し、
 * 実際の差し込み値は t() の中で入れる。こうすると、ひな形を一度読み込めば、
 * そのあと chrome.i18n が使えなくなっても文言を組み立てられる。
 * （目印には、文言に出てこない私用領域の文字を使う）
 */
const MARKERS = ['\uE001', '\uE002', '\uE003', '\uE004'] as const;
const MARKER_PATTERN = /[\uE001-\uE004]/g;
const FIRST_MARKER_CODE = 0xe001;

/** 読み込み済みの文言のひな形 */
const templates = new Map<MessageKey, string>();

/** chrome.i18n から文言のひな形を取得する。取得できなければ undefined */
function loadTemplate(key: MessageKey): string | undefined {
  try {
    const message = chrome.i18n.getMessage(key, [...MARKERS]);
    return message === '' ? undefined : message;
  } catch {
    // 拡張機能の更新直後など、chrome.i18n が使えなくなっている場合
    return undefined;
  }
}

/**
 * すべての文言を先に読み込んで保持する。content script の起動時に呼ぶ。
 *
 * 拡張機能が更新されると、すでに開いている Gmail のタブでは古い content script が動き続けるが、
 * そこからは chrome.i18n を使えなくなる。先に読み込んでおけば、そのタブでも
 * 確認ダイアログやエラー表示の文言を正しく出せる。
 */
export function preloadMessages(): void {
  for (const key of MESSAGE_KEYS) {
    const template = loadTemplate(key);
    if (template !== undefined) templates.set(key, template);
  }
}

/** 保持している文言を捨てる（テスト用） */
export function clearMessageCache(): void {
  templates.clear();
}

/**
 * メッセージキーから表示文言を取得する。
 *
 * 文言が見つからない場合や chrome.i18n が使えない場合（読み込み済みの文言も無い場合）は、
 * キーの名前をそのまま返す。ここで例外を投げると、エラーを表示する処理そのものが失敗してしまうため。
 * （キーの定義漏れはテストで検出する）
 */
export function t(key: MessageKey, substitutions?: readonly string[]): string {
  let template = templates.get(key);
  if (template === undefined) {
    template = loadTemplate(key);
    if (template === undefined) return key;
    templates.set(key, template);
  }
  return template.replace(
    MARKER_PATTERN,
    (marker) => substitutions?.[marker.charCodeAt(0) - FIRST_MARKER_CODE] ?? '',
  );
}
