/**
 * 連絡先の記録（台帳）へのメッセージの処理。
 * 保存先（LedgerStore）を外から受け取るので、IndexedDB が無い環境でもテストできる。
 */

import { type LedgerStore, lookupLedger, pruneLedger, recordSend } from '../core/ledger/ledger';
import type { ExtensionMessage, ExtensionResponse } from '../shared/messages';

/** 保存期間として受け付ける範囲（日）。壊れた値で記録が消えたり、消えなくなったりしないようにする */
const MIN_RETENTION_DAYS = 30;
const MAX_RETENTION_DAYS = 3650;

/** メッセージを処理して、応答を返す。例外は応答（ok: false）にして返す */
export async function handleLedgerMessage(
  store: LedgerStore,
  message: ExtensionMessage,
  now: Date,
): Promise<ExtensionResponse<unknown>> {
  try {
    switch (message.type) {
      case 'ledger/lookup':
        return { ok: true, value: await lookupLedger(store, message.query) };
      case 'ledger/record': {
        await recordSend(store, message.record);
        const days = message.retentionDays;
        if (Number.isFinite(days) && days >= MIN_RETENTION_DAYS && days <= MAX_RETENTION_DAYS) {
          await pruneLedger(store, now, days);
        }
        return { ok: true, value: null };
      }
      case 'ledger/clear':
        await store.clear();
        return { ok: true, value: null };
      case 'ledger/stats': {
        const meta = await store.getMeta();
        return {
          ok: true,
          value: { contactCount: await store.countContacts(), totalSends: meta.totalSends },
        };
      }
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
