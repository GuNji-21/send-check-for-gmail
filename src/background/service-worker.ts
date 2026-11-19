/**
 * background（service worker）のエントリポイント（ビルド後は dist/background.js）。
 *
 * 役割：
 * - content script・設定画面からのメッセージを受け取って処理する（src/shared/messages.ts）
 * - 連絡先・会社台帳（フェーズ2）を拡張機能側の IndexedDB に保存・検索する
 *
 * 外部への通信は行わない。
 *
 * フェーズ1では、background に依頼する処理は無い（設定は content script と設定画面が
 * chrome.storage.local を直接読み書きする）。メッセージの受信処理はフェーズ2で追加する。
 */

export {};
