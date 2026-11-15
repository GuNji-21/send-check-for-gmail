/**
 * 利用者の設定の読み書き（chrome.storage）。
 *
 * 設定はすべて利用者の端末内に保存し、外部には送信しない。
 * 設定画面から保存データを削除できるようにする（docs/privacy-policy.md）。
 *
 * TODO(フェーズ1): 保存先（storage.local / storage.sync）を docs/requirements.md に従って決めて実装する。
 */

import type { ClassificationRules } from '../core/types';

/** 利用者の設定 */
export interface Settings {
  /** 設定データの形式のバージョン（将来の移行用） */
  readonly schemaVersion: 1;
  readonly rules: ClassificationRules;
}

/** 設定の初期値 */
export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 1,
  rules: {
    internalDomains: [],
    internalAddresses: [],
    cautionDomains: [],
    cautionAddresses: [],
    skipDomains: [],
    skipAddresses: [],
  },
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
