/**
 * background（service worker）のエントリポイント（ビルド後は dist/background.js）。
 *
 * 役割：
 * - インストール直後に設定画面を開き、Gmail のタブの再読み込みが必要なことを案内する
 * - content script・設定画面からのメッセージを受け取って処理する（src/shared/messages.ts。フェーズ2で追加）
 * - 連絡先・会社台帳（フェーズ2）を拡張機能側の IndexedDB に保存・検索する
 *
 * 外部への通信は行わない。
 *
 * フェーズ1では、background に依頼する処理は無い（設定は content script と設定画面が
 * chrome.storage.local を直接読み書きする）。
 */

/**
 * インストール直後に設定画面を開く。
 *
 * 拡張機能を入れた時点ですでに開いていた Gmail のタブには、再読み込みするまで content script が入らず、
 * 送信前チェックが働かない。利用者が気づけるように、設定画面の先頭にその案内を表示している。
 * （更新のたびに開くと邪魔になるため、新規インストールのときだけ開く）
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== 'install') return;
  chrome.runtime.openOptionsPage().catch((error: unknown) => {
    console.error('[gmail-send-guard] failed to open the options page', error);
  });
});

export {};
