/**
 * Gmail の画面要素を特定するためのセレクタ定義。
 *
 * Gmail の画面構造（DOM・セレクタ）への依存は src/gmail/ にのみ書く。
 * このファイルを src/gmail/ 以外から import することは ESLint で禁止している。
 *
 * ルール：
 * - Gmail の表示言語に依存しない方法で要素を特定する（「送信」「Send」などの文言で探さない）
 * - セレクタを追加・変更したら tests/fixtures/gmail/ の HTML で動作を確認するテストを付ける
 * - Gmail の変更で要素が見つからない場合は、送信を通さず「チェックできませんでした」として扱う
 *
 * TODO(フェーズ1): 作成画面・送信元・宛先欄・本文・引用部分・添付・送信ボタン・予約送信のセレクタを定義する。
 */

export const SELECTORS = {} as const satisfies Record<string, string>;
