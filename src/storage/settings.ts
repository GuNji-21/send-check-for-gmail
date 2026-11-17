/**
 * 利用者の設定の読み書き（chrome.storage）。
 *
 * 設定はすべて利用者の端末内に保存し、外部には送信しない。
 * 設定画面から保存データを削除できるようにする（docs/privacy-policy.md）。
 *
 * 保存先は chrome.storage.local。端末間の自動同期はしないため storage.sync は使わない
 * （docs/requirements.md「7. 非機能要件」）。
 * 設定は Gmail の複数アカウントで共通。社内の判定は作成画面ごとの送信元アドレスから導く。
 *
 * 確認ダイアログを 0.5 秒以内に表示するため、content script では起動時に読み込んだ設定を保持し、
 * 送信操作のたびに読み込みを待たない。
 *
 * TODO(フェーズ1): 実装する。
 */

import type { ClassificationRules, WarningLevels } from '../core/types';

/** 利用者の設定 */
export interface Settings {
  /** 設定データの形式のバージョン（将来の移行用） */
  readonly schemaVersion: 1;
  readonly rules: ClassificationRules;
  /** 確認省略（rules.skipAddresses）を有効にするか。初期設定では無効 */
  readonly skipConfirmationEnabled: boolean;
  /** 検知項目ごとの警告レベル */
  readonly warningLevels: WarningLevels;
  /** 添付を示すキーワード（添付漏れの検知に使う。設定画面で編集可） */
  readonly attachmentKeywords: readonly string[];
  /** Google ドライブのリンクを添付ありとみなすか */
  readonly treatDriveLinksAsAttachment: boolean;
}

/** 設定の初期値 */
export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 1,
  rules: {
    internalDomains: [],
    internalAddresses: [],
    cautionDomains: [],
    cautionAddresses: [],
    skipAddresses: [],
  },
  skipConfirmationEnabled: false,
  warningLevels: {
    'attachment-missing': 'warn',
    placeholder: 'warn',
    'date-weekday-mismatch': 'warn',
    'subject-empty': 'warn',
    'multiple-external-companies': 'warn',
  },
  attachmentKeywords: [
    '添付',
    '添付ファイル',
    '別添',
    '同封',
    '資料をお送り',
    'ご送付',
    '送付いたします',
    '見積書',
    '請求書',
    'PDF',
    'attached',
    'attachment',
  ],
  treatDriveLinksAsAttachment: true,
};

/** 設定を読み込む（未保存の場合は初期値） */
export function loadSettings(): Promise<Settings> {
  return Promise.reject(new Error('Not implemented: loadSettings'));
}

/** 設定を保存する */
export function saveSettings(_settings: Settings): Promise<void> {
  return Promise.reject(new Error('Not implemented: saveSettings'));
}

/** 保存データをすべて削除する */
export function clearAllData(): Promise<void> {
  return Promise.reject(new Error('Not implemented: clearAllData'));
}
