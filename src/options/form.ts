/**
 * 設定画面の入力内容と設定（Settings）の変換。
 * 画面の要素には触れない純粋な処理にして、テストしやすくしている。
 */

import {
  looksLikeAddress,
  looksLikeDomain,
  normalizeAddress,
  normalizeDomain,
} from '../core/text/address';
import { parseLines } from '../core/text/normalize';
import type { DetectorId, WarningLevel } from '../core/types';
import { DETECTOR_IDS, type Settings } from '../storage/settings';

/** 設定画面の入力内容（テキスト欄は1行1件の文字列のまま持つ） */
export interface OptionsFormValues {
  readonly internalDomains: string;
  readonly internalAddresses: string;
  readonly cautionDomains: string;
  readonly cautionAddresses: string;
  readonly skipAddresses: string;
  readonly skipConfirmationEnabled: boolean;
  readonly attachmentKeywords: string;
  readonly treatDriveLinksAsAttachment: boolean;
  readonly aiTypoCheckEnabled: boolean;
  readonly ledgerEnabled: boolean;
  readonly ledgerRetentionDays: number;
  readonly warningLevels: Readonly<Record<DetectorId, WarningLevel>>;
}

/** 入力内容を設定に変換した結果。形式が正しくない行があれば invalid に入る */
export type ParseResult =
  | { readonly ok: true; readonly settings: Settings }
  | { readonly ok: false; readonly invalid: readonly string[] };

/** 設定を、設定画面の入力内容にする */
export function toFormValues(settings: Settings): OptionsFormValues {
  const lines = (list: readonly string[]): string => list.join('\n');
  return {
    internalDomains: lines(settings.rules.internalDomains),
    internalAddresses: lines(settings.rules.internalAddresses),
    cautionDomains: lines(settings.rules.cautionDomains),
    cautionAddresses: lines(settings.rules.cautionAddresses),
    skipAddresses: lines(settings.rules.skipAddresses),
    skipConfirmationEnabled: settings.skipConfirmationEnabled,
    attachmentKeywords: lines(settings.attachmentKeywords),
    treatDriveLinksAsAttachment: settings.treatDriveLinksAsAttachment,
    aiTypoCheckEnabled: settings.aiTypoCheckEnabled,
    ledgerEnabled: settings.ledgerEnabled,
    ledgerRetentionDays: settings.ledgerRetentionDays,
    warningLevels: { ...settings.warningLevels },
  };
}

/** 設定画面の入力内容を、設定に変換する。形式が正しくない行は保存せず、一覧にして返す */
export function parseFormValues(values: OptionsFormValues): ParseResult {
  const invalid: string[] = [];

  const read = (
    text: string,
    normalize: (value: string) => string,
    isValid: (value: string) => boolean,
  ): string[] => {
    const result: string[] = [];
    for (const line of parseLines(text)) {
      if (!isValid(line)) {
        invalid.push(line);
        continue;
      }
      const normalized = normalize(line);
      if (!result.includes(normalized)) result.push(normalized);
    }
    return result;
  };
  const domains = (text: string): string[] => read(text, normalizeDomain, looksLikeDomain);
  const addresses = (text: string): string[] => read(text, normalizeAddress, looksLikeAddress);

  const settings: Settings = {
    schemaVersion: 1,
    rules: {
      internalDomains: domains(values.internalDomains),
      internalAddresses: addresses(values.internalAddresses),
      cautionDomains: domains(values.cautionDomains),
      cautionAddresses: addresses(values.cautionAddresses),
      skipAddresses: addresses(values.skipAddresses),
    },
    skipConfirmationEnabled: values.skipConfirmationEnabled,
    warningLevels: Object.fromEntries(
      DETECTOR_IDS.map((id) => [id, values.warningLevels[id]]),
    ) as Record<DetectorId, WarningLevel>,
    attachmentKeywords: parseLines(values.attachmentKeywords),
    treatDriveLinksAsAttachment: values.treatDriveLinksAsAttachment,
    aiTypoCheckEnabled: values.aiTypoCheckEnabled,
    ledgerEnabled: values.ledgerEnabled,
    ledgerRetentionDays: values.ledgerRetentionDays,
  };

  return invalid.length > 0 ? { ok: false, invalid } : { ok: true, settings };
}
