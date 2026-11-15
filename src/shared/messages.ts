/**
 * content script・設定画面と background の間でやり取りするメッセージの型定義。
 *
 * chrome.runtime.sendMessage / onMessage で送受信するメッセージは、すべてここに型を定義する。
 * 例：フェーズ2の連絡先・会社台帳は background 側の IndexedDB にあるため、
 * content からはここで定義したメッセージで読み書きを依頼する。
 *
 * TODO(フェーズ1): 必要なメッセージを判別可能なユニオン型（type フィールドで判別）で定義する。
 */

/** 拡張機能内のメッセージ（現時点では未定義） */
export type ExtensionMessage = never;
