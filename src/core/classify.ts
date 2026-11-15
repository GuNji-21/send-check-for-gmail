/**
 * 宛先の分類（社内・要注意・確認省略・社外）。
 *
 * 設定画面で登録されたドメイン・アドレスのルールに従って、宛先1件ごとに分類する。
 * DOM・chrome API には依存しない純粋な関数として実装する。
 *
 * TODO(フェーズ1): 実装する。優先順位（確認省略・要注意・社内の重なり）は docs/requirements.md に従う。
 */

import type { ClassificationRules, Recipient, RecipientCategory } from './types';

/** 宛先1件を分類する */
export function classifyRecipient(
  _recipient: Recipient,
  _rules: ClassificationRules,
): RecipientCategory {
  throw new Error('Not implemented: classifyRecipient');
}
