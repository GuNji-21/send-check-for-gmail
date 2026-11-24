/**
 * 連絡先の記録（台帳）への依頼。content script と設定画面から使う。
 *
 * 台帳は background 側の IndexedDB にあるため、メッセージで読み書きを依頼する
 * （content script で IndexedDB を使うと、Gmail 側の保存領域に入ってしまうため）。
 */

import type { ImportResult, ImportRow } from '../core/ledger/csv';
import type { CompanyEdit, ContactEdit } from '../core/ledger/directory';
import type { LedgerInsight, LedgerQuery, SendRecord } from '../core/ledger/ledger';
import type { ReceivedMail } from '../core/ledger/received';
import type {
  ExtensionMessage,
  ExtensionResponse,
  ExtensionResults,
  LedgerSnapshot,
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

/** 台帳のすべての記録を返す */
export function listLedger(): Promise<LedgerSnapshot> {
  return request({ type: 'ledger/list' });
}

/** 連絡先を編集する。該当する連絡先が無ければ false */
export function updateLedgerContact(address: string, edit: ContactEdit): Promise<boolean> {
  return request({ type: 'ledger/updateContact', address, edit });
}

/** ドメインに会社名・別名を付ける */
export async function updateLedgerCompany(companyKey: string, edit: CompanyEdit): Promise<void> {
  await request({ type: 'ledger/updateCompany', companyKey, edit });
}

/** 連絡先を1件削除する */
export async function deleteLedgerContact(address: string): Promise<void> {
  await request({ type: 'ledger/deleteContact', address });
}

/** CSV から読んだ行を取り込む */
export function importLedgerRows(rows: readonly ImportRow[]): Promise<ImportResult> {
  return request({ type: 'ledger/import', rows });
}

/** 画面に開いた、届いたメール1通の情報で台帳を補う。台帳を書き換えたら true */
export function recordReceivedToLedger(mail: ReceivedMail): Promise<boolean> {
  return request({ type: 'ledger/received', mail });
}
