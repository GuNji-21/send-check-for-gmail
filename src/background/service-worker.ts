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
 * 設定は content script と設定画面が chrome.storage.local を直接読み書きする。
 * 連絡先の記録（台帳）だけは、ここで IndexedDB に保存し、メッセージで読み書きを受け付ける。
 */

import { isExtensionMessage } from '../shared/messages';
import { handleLedgerMessage } from './ledger-handler';
import { createIndexedDbLedgerStore } from './ledger-idb';

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

/** 連絡先の記録（台帳）。この拡張機能専用の IndexedDB に置く */
const ledgerStore = createIndexedDbLedgerStore();

/**
 * content script・設定画面からの依頼を処理する。
 * この拡張機能の中から届いたメッセージだけを受け付ける（ほかの拡張機能やウェブページからは受け付けない）。
 */
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !isExtensionMessage(message)) return false;
  handleLedgerMessage(ledgerStore, message, new Date()).then(sendResponse, (error: unknown) => {
    sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
  });
  // 応答を後から返すことを Chrome に伝える
  return true;
});
