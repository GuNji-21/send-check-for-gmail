/**
 * 連絡先の記録（台帳）への依頼。content script と設定画面から使う。
 *
 * 台帳は background 側の IndexedDB にあるため、メッセージで読み書きを依頼する
 * （content script で IndexedDB を使うと、Gmail 側の保存領域に入ってしまうため）。
 */

import type { LedgerInsight, LedgerQuery, SendRecord } from '../core/ledger/ledger';
import type {
  ExtensionMessage,
  ExtensionResponse,
  ExtensionResults,
  LedgerStats,
} from './messages';

/** 台帳の読み取りを待つ時間（ミリ秒）。確認ダイアログを 0.5 秒以内に出すため、これを超えたら打ち切る */
export const LEDGER_LOOKUP_TIMEOUT_MS = 300;

async function request<T extends ExtensionMessage>(
  message: T,
): Promise<ExtensionResults[T['type']]> {
  const response = await chrome.runtime.sendMessage<
    T,
    ExtensionResponse<ExtensionResults[T['type']]> | undefined
  >(message);
  if (response === undefined) throw new Error('No response from the background');
  if (!response.ok) throw new Error(response.error);
  return response.value;
}

/** 今回の送信の判断に使う情報を読み取る。時間がかかりすぎた場合は失敗にする */
export function lookupLedger(
  query: LedgerQuery,
  timeoutMs: number = LEDGER_LOOKUP_TIMEOUT_MS,
): Promise<LedgerInsight> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Ledger lookup timed out'));
    }, timeoutMs);
    request({ type: 'ledger/lookup', query }).then(
      (insight) => {
        clearTimeout(timer);
        resolve(insight);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/** 送信1回分を記録する */
export async function recordSendToLedger(record: SendRecord, retentionDays: number): Promise<void> {
  await request({ type: 'ledger/record', record, retentionDays });
}

/** 記録をすべて削除する */
export async function clearLedger(): Promise<void> {
  await request({ type: 'ledger/clear' });
}

/** 台帳の状況を返す */
export function getLedgerStats(): Promise<LedgerStats> {
  return request({ type: 'ledger/stats' });
}
