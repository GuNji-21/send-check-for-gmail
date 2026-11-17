/**
 * 検知器の登録と一括実行。
 *
 * 検知器は src/core/detectors/ に1項目1ファイルで作り、ここの DETECTORS に登録する。
 * 各検知器には必ず tests/unit/ にテストを付ける。
 *
 * フェーズ1で作る予定の検知器：添付漏れ、プレースホルダーの消し忘れ、日付と曜日の不一致、
 * 件名が空、複数社混在（ID は src/core/types.ts の DetectorId）
 *
 * 警告レベル（ブロック／警告／オフ）は検知器ではなく利用者の設定で決まる。
 * runDetectors は「オフ」の検知器を実行せず、検知結果に設定のレベルを付けて返す。
 * 確認ダイアログを 0.5 秒以内に表示するため、検知器は同期処理にする。
 *
 * TODO(フェーズ1): 検知器を追加し、runDetectors を実装する。
 * 1つの検知器が例外を投げた場合も「チェックできませんでした」として扱い、送信は止める（CLAUDE.md「失敗時の動作」）。
 */

import type {
  ComposeSnapshot,
  Detector,
  DetectorContext,
  LeveledDetection,
  WarningLevels,
} from '../types';

/** 登録済みの検知器 */
export const DETECTORS: readonly Detector[] = [];

/** 登録済みの検知器のうち「オフ」以外を実行し、警告レベルを付けた検知結果をまとめて返す */
export function runDetectors(
  _snapshot: ComposeSnapshot,
  _context: DetectorContext,
  _levels: WarningLevels,
): readonly LeveledDetection[] {
  throw new Error('Not implemented: runDetectors');
}
