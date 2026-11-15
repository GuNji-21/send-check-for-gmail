/**
 * 検知器の登録と一括実行。
 *
 * 検知器は src/core/detectors/ に1項目1ファイルで作り、ここの DETECTORS に登録する。
 * 各検知器には必ず tests/unit/ にテストを付ける。
 *
 * フェーズ1で作る予定の検知器：添付漏れ、プレースホルダーの消し忘れ、日付と曜日の不一致
 *
 * TODO(フェーズ1): 検知器を追加し、runDetectors を実装する。
 * 1つの検知器が例外を投げた場合も「チェックできませんでした」として扱い、送信は止める（CLAUDE.md「失敗時の動作」）。
 */

import type { ComposeSnapshot, Detection, Detector, DetectorContext } from '../types';

/** 登録済みの検知器 */
export const DETECTORS: readonly Detector[] = [];

/** 登録済みの検知器をすべて実行し、検知結果をまとめて返す */
export function runDetectors(
  _snapshot: ComposeSnapshot,
  _context: DetectorContext,
): readonly Detection[] {
  throw new Error('Not implemented: runDetectors');
}
