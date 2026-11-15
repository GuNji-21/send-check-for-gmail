/**
 * background（service worker）のエントリポイント（ビルド後は dist/background.js）。
 *
 * 役割：
 * - content script・設定画面からのメッセージを受け取って処理する（src/shared/messages.ts）
 * - 連絡先・会社台帳（フェーズ2）を拡張機能側の IndexedDB に保存・検索する
 *
 * 外部への通信は行わない。
 *
 * TODO(フェーズ1): メッセージの受信処理を実装する。
 */

/** メッセージの受信処理を登録する */
function registerMessageHandlers(): void {
  // TODO(フェーズ1): chrome.runtime.onMessage にハンドラを登録する
}

registerMessageHandlers();
