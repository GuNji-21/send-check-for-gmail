/**
 * 作成画面からの宛先検索（docs/requirements.md「5-5」）。
 *
 * 利用者が設定で「連絡先の記録」を有効にしているときだけ、作成画面の下の操作列に
 * 「宛先を検索」のボタンを置く。押すと検索パネルを開き、台帳から選んだ人を To・Cc に追加する。
 *
 * 送信とは関係のない補助の機能なので、ボタンを置けない・追加できないなどの失敗は、
 * 送信の捕捉に影響させない（パネルの中に表示するか、コンソールに記録するだけにする）。
 */

import { type DirectoryCompany, buildDirectory } from '../core/ledger/directory';
import { findComposeWindows } from '../gmail/compose';
import { addRecipient, findComposeToolbarCell } from '../gmail/recipients';
import type { LedgerSnapshot } from '../shared/messages';
import {
  type RecipientSearchPanel,
  SEARCH_BUTTON_ATTRIBUTE,
  createSearchButton,
  openRecipientSearch,
} from '../ui/recipient-search/search';

/** 画面の変化をまとめて見る間隔（ミリ秒）。Gmail は画面を細かく書き換えるので、まとめて1回だけ確かめる */
export const SEARCH_BUTTON_DELAY_MS = 500;

export interface RecipientSearchSettings {
  readonly ledgerEnabled: boolean;
}

export interface RecipientSearchStartOptions {
  readonly view: Window & typeof globalThis;
  getSettings(): Promise<RecipientSearchSettings>;
  /** 台帳のすべての記録を読む（background に依頼する） */
  loadLedger(): Promise<LedgerSnapshot>;
}

/** 作成画面への、宛先検索のボタンの設置を始める。戻り値の関数を呼ぶと止まる */
export function startRecipientSearch(options: RecipientSearchStartOptions): () => void {
  const { view } = options;
  const doc = view.document;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let open: { panel: RecipientSearchPanel; compose: HTMLElement } | undefined;

  const closePanel = (): void => {
    open?.panel.close();
    open = undefined;
  };

  const loadDirectory = async (): Promise<readonly DirectoryCompany[]> => {
    const snapshot = await options.loadLedger();
    return buildDirectory(snapshot.contacts, snapshot.companies, snapshot.ccPairs);
  };

  const openPanel = (compose: HTMLElement, button: HTMLElement): void => {
    const sameCompose = open?.compose === compose;
    closePanel();
    // 開いているときにもう一度押したら、閉じるだけにする
    if (sameCompose) return;
    const panel = openRecipientSearch(doc, {
      anchor: button,
      beside: compose,
      loadDirectory,
      add: (field, address) => {
        if (!compose.isConnected) return Promise.reject(new Error('The compose window was closed'));
        return addRecipient(compose, field, address);
      },
      onClose: () => {
        if (open?.panel === panel) open = undefined;
      },
    });
    open = { panel, compose };
  };

  const sync = async (): Promise<void> => {
    const settings = await options.getSettings();
    // 作成画面が閉じられたら、パネルも閉じる
    if (open !== undefined && (!open.compose.isConnected || !settings.ledgerEnabled)) closePanel();
    for (const compose of findComposeWindows(doc)) {
      const existing = compose.querySelector(`[${SEARCH_BUTTON_ATTRIBUTE}]`);
      if (!settings.ledgerEnabled) {
        existing?.remove();
        continue;
      }
      if (existing !== null) continue;
      const cell = findComposeToolbarCell(compose);
      if (cell === null) continue;
      const button = createSearchButton(doc, () => {
        openPanel(compose, button);
      });
      cell.append(button);
    }
  };

  const schedule = (): void => {
    // すでに予定があれば、そのままにする（画面が変わり続けていても、一定の間隔で確かめられるようにする）
    if (timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      sync().catch((error: unknown) => {
        console.error('[gmail-send-guard] failed to set up the recipient search', error);
      });
    }, SEARCH_BUTTON_DELAY_MS);
  };

  const observer = new view.MutationObserver(schedule);
  observer.observe(doc.documentElement, { childList: true, subtree: true });
  schedule();
  return () => {
    observer.disconnect();
    if (timer !== undefined) clearTimeout(timer);
    closePanel();
    for (const button of doc.querySelectorAll(`[${SEARCH_BUTTON_ATTRIBUTE}]`)) button.remove();
  };
}
