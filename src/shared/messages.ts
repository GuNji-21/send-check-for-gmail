/**
 * content script・設定画面と background の間でやり取りするメッセージの型定義。
 *
 * chrome.runtime.sendMessage / onMessage で送受信するメッセージは、すべてここに型を定義する。
 * 連絡先の記録（台帳）は background 側の IndexedDB にあるため、
 * content と設定画面からは、ここで定義したメッセージで読み書きを依頼する。
 */

import type { LedgerInsight, LedgerQuery, SendRecord } from '../core/ledger/ledger';

/** 台帳の状況（設定画面に表示する） */
export interface LedgerStats {
  /** 記録している連絡先の件数 */
  readonly contactCount: number;
  /** 記録した送信の回数 */
  readonly totalSends: number;
}

/** 拡張機能内のメッセージ */
export type ExtensionMessage =
  /** 今回の送信の判断に使う情報を、台帳から読み取る */
  | { readonly type: 'ledger/lookup'; readonly query: LedgerQuery }
  /** 送信1回分を台帳に記録する。あわせて、保存期間を過ぎた記録を削除する */
  | { readonly type: 'ledger/record'; readonly record: SendRecord; readonly retentionDays: number }
  /** 台帳の記録をすべて削除する */
  | { readonly type: 'ledger/clear' }
  /** 台帳の状況を返す */
  | { readonly type: 'ledger/stats' };

/** メッセージの種類ごとの、返ってくる値 */
export interface ExtensionResults {
  'ledger/lookup': LedgerInsight;
  'ledger/record': null;
  'ledger/clear': null;
  'ledger/stats': LedgerStats;
}

/** background からの応答。失敗した場合は理由を返す（呼び出し側で例外にする） */
export type ExtensionResponse<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: string };

const MESSAGE_TYPES: readonly ExtensionMessage['type'][] = [
  'ledger/lookup',
  'ledger/record',
  'ledger/clear',
  'ledger/stats',
];

/** 受け取った値が、この拡張機能のメッセージかどうか */
export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === 'string' && (MESSAGE_TYPES as readonly string[]).includes(type);
}
