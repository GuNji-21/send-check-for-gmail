/**
 * 検知器の登録と一括実行。
 *
 * 検知器は src/core/detectors/ に1項目1ファイルで作り、ここの DETECTORS に登録する。
 * 各検知器には必ず tests/unit/ にテストを付ける。
 *
 * 警告のオン・オフは検知器ではなく利用者の設定で決まる。
 * runDetectors は「オフ」の検知器を実行しない。
 * 確認ダイアログを 0.5 秒以内に表示するため、検知器は同期処理にする。
 *
 * 検知器が例外を投げた場合は、ここでは捕まえずにそのまま呼び出し元へ伝える。
 * 呼び出し元は「チェックできませんでした」として送信を止める（CLAUDE.md「失敗時の動作」）。
 */

import type {
  ComposeSnapshot,
  Detection,
  Detector,
  DetectorContext,
  WarningLevels,
} from '../types';
import { attachmentMissingDetector } from './attachment-missing';
import { ccMissingDetector } from './cc-missing';
import { dateWeekdayMismatchDetector } from './date-weekday-mismatch';
import { firstTimeDomainDetector } from './first-time-domain';
import { multipleExternalCompaniesDetector } from './multiple-external-companies';
import { placeholderDetector } from './placeholder';
import { subjectEmptyDetector } from './subject-empty';

/** 登録済みの検知器（確認ダイアログでの表示順） */
export const DETECTORS: readonly Detector[] = [
  firstTimeDomainDetector,
  multipleExternalCompaniesDetector,
  ccMissingDetector,
  subjectEmptyDetector,
  attachmentMissingDetector,
  placeholderDetector,
  dateWeekdayMismatchDetector,
];

/** 登録済みの検知器のうち「オフ」以外を実行し、検知結果をまとめて返す */
export function runDetectors(
  snapshot: ComposeSnapshot,
  context: DetectorContext,
  levels: WarningLevels,
  detectors: readonly Detector[] = DETECTORS,
): readonly Detection[] {
  const results: Detection[] = [];
  for (const detector of detectors) {
    if (levels[detector.id] === 'off') continue;
    results.push(...detector.detect(snapshot, context));
  }
  return results;
}
