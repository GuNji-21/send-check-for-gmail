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
 * 送信操作のたびに読み込みを待たない（watchSettings で変更を受け取る）。
 */

import {
  looksLikeAddress,
  looksLikeDomain,
  normalizeAddress,
  normalizeDomain,
} from '../core/text/address';
import type { ClassificationRules, DetectorId, WarningLevel, WarningLevels } from '../core/types';

/** chrome.storage.local に保存するときのキー */
const STORAGE_KEY = 'settings';

/** 利用者の設定 */
export interface Settings {
  /** 設定データの形式のバージョン（将来の移行用） */
  readonly schemaVersion: 1;
  readonly rules: ClassificationRules;
  /** 確認省略（rules.skipAddresses）を有効にするか。初期設定では無効 */
  readonly skipConfirmationEnabled: boolean;
  /** 検知項目ごとの警告のオン・オフ */
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

/** 検知項目のID（設定画面の表示順） */
export const DETECTOR_IDS: readonly DetectorId[] = [
  'multiple-external-companies',
  'subject-empty',
  'attachment-missing',
  'placeholder',
  'date-weekday-mismatch',
];

const WARNING_LEVELS: readonly WarningLevel[] = ['warn', 'off'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 文字列の配列として読み、正規化して、条件に合うものだけを重複なく残す */
function readList(
  value: unknown,
  normalize: (item: string) => string,
  isValid: (item: string) => boolean,
): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const normalized = normalize(item);
    if (normalized === '' || !isValid(normalized) || result.includes(normalized)) continue;
    result.push(normalized);
  }
  return result;
}

const readDomains = (value: unknown): string[] => readList(value, normalizeDomain, looksLikeDomain);
const readAddresses = (value: unknown): string[] =>
  readList(value, normalizeAddress, looksLikeAddress);

/**
 * 保存されていた値（形が壊れている可能性がある）を、正しい形の設定にする。
 * 読めない項目は初期値にする。保存データが無い場合（undefined）は初期値を返す。
 */
export function normalizeSettings(raw: unknown): Settings {
  if (!isRecord(raw)) return DEFAULT_SETTINGS;
  const rules = isRecord(raw.rules) ? raw.rules : {};
  const levels = isRecord(raw.warningLevels) ? raw.warningLevels : {};

  const warningLevels = Object.fromEntries(
    DETECTOR_IDS.map((id) => {
      const value = levels[id];
      const level = WARNING_LEVELS.find((candidate) => candidate === value);
      return [id, level ?? DEFAULT_SETTINGS.warningLevels[id]];
    }),
  ) as Record<DetectorId, WarningLevel>;

  return {
    schemaVersion: 1,
    rules: {
      internalDomains: readDomains(rules.internalDomains),
      internalAddresses: readAddresses(rules.internalAddresses),
      cautionDomains: readDomains(rules.cautionDomains),
      cautionAddresses: readAddresses(rules.cautionAddresses),
      skipAddresses: readAddresses(rules.skipAddresses),
    },
    skipConfirmationEnabled: raw.skipConfirmationEnabled === true,
    warningLevels,
    // キーワードは利用者が全部消すこともできる（空の配列も有効な設定として扱う）
    attachmentKeywords: Array.isArray(raw.attachmentKeywords)
      ? readList(
          raw.attachmentKeywords,
          (item) => item.trim(),
          () => true,
        )
      : DEFAULT_SETTINGS.attachmentKeywords,
    treatDriveLinksAsAttachment:
      typeof raw.treatDriveLinksAsAttachment === 'boolean'
        ? raw.treatDriveLinksAsAttachment
        : DEFAULT_SETTINGS.treatDriveLinksAsAttachment,
  };
}

/** 設定を読み込む（未保存の場合は初期値） */
export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeSettings(stored[STORAGE_KEY]);
}

/** 設定を保存する */
export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: normalizeSettings(settings) });
}

/** 保存データをすべて削除する */
export async function clearAllData(): Promise<void> {
  await chrome.storage.local.clear();
}

/**
 * 設定の変更を受け取る。設定画面で保存・削除されるたびに、新しい設定で listener を呼ぶ。
 * 戻り値の関数を呼ぶと、受け取りをやめる。
 */
export function watchSettings(listener: (settings: Settings) => void): () => void {
  const handler = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void => {
    if (areaName !== 'local') return;
    const change = changes[STORAGE_KEY];
    if (change === undefined) return;
    listener(normalizeSettings(change.newValue));
  };
  chrome.storage.onChanged.addListener(handler);
  return () => {
    chrome.storage.onChanged.removeListener(handler);
  };
}
