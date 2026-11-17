/**
 * 宛先の分類（要注意・社内・社外）と、確認省略の判定。
 *
 * 設定画面で登録されたドメイン・アドレスのルールと送信元アドレスに従って、宛先1件ごとに分類する。
 * DOM・chrome API には依存しない純粋な関数として実装する。
 *
 * 分類のルール：
 * - 優先順位は 要注意 ＞ 社内 ＞ 社外
 * - 送信元アドレスのドメインは、登録が無くても自動で社内扱いにする
 * - フリーメールのドメイン（freemail.ts）にはドメイン単位の指定を適用しない。
 *   送信元がフリーメールの場合は、送信元アドレス自身だけを社内扱いにする
 * - アドレス・ドメインは大文字・小文字を区別せずに比較する
 *
 * TODO(フェーズ1): 実装する。
 */

import type { ClassificationRules, Recipient, RecipientCategory } from './types';

/** 分類に使う入力 */
export interface ClassificationContext {
  readonly rules: ClassificationRules;
  /** 送信元アドレス（ComposeSnapshot.fromAddress） */
  readonly fromAddress: string;
}

/** 宛先1件を分類する */
export function classifyRecipient(
  _recipient: Recipient,
  _context: ClassificationContext,
): RecipientCategory {
  throw new Error('Not implemented: classifyRecipient');
}

/**
 * 確認ダイアログを省略してよいかを判定する。
 *
 * 次をすべて満たすときだけ true：
 * - 確認省略の機能が有効（初期設定では無効）
 * - 宛先が1件以上あり、すべての宛先（To / Cc / Bcc）が確認省略アドレスとして登録済み
 */
export function shouldSkipConfirmation(
  _recipients: readonly Recipient[],
  _rules: ClassificationRules,
  _skipConfirmationEnabled: boolean,
): boolean {
  throw new Error('Not implemented: shouldSkipConfirmation');
}
