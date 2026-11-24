/**
 * 連絡先の記録（台帳）へのメッセージの処理。
 * 保存先（LedgerStore）を外から受け取るので、IndexedDB が無い環境でもテストできる。
 */

import { MAX_IMPORT_ROWS, type ImportRow, importRows } from '../core/ledger/csv';
import { updateCompany, updateContact } from '../core/ledger/directory';
import { type LedgerStore, lookupLedger, pruneLedger, recordSend } from '../core/ledger/ledger';
import { looksLikeAddress, normalizeAddress } from '../core/text/address';
import type { ExtensionMessage, ExtensionResponse } from '../shared/messages';

/** 保存期間として受け付ける範囲（日）。壊れた値で記録が消えたり、消えなくなったりしないようにする */
const MIN_RETENTION_DAYS = 30;
const MAX_RETENTION_DAYS = 3650;

/**
 * 取り込む行を確かめ直す。画面側でも確かめているが、メッセージの中身は信頼しない。
 * アドレスの形が正しくない行と、文字列でない値は捨てる（値の長さは、取り込みの処理で制限する）。
 */
function sanitizeImportRows(rows: unknown): ImportRow[] {
  if (!Array.isArray(rows)) return [];
  const result: ImportRow[] = [];
  for (const item of rows.slice(0, MAX_IMPORT_ROWS)) {
    if (typeof item !== 'object' || item === null) continue;
    const row = item as Record<string, unknown>;
    if (typeof row.address !== 'string') continue;
    const address = normalizeAddress(row.address);
    if (!looksLikeAddress(address) || address.length > 254) continue;
    const text = (field: Exclude<keyof ImportRow, 'address'>): string => {
      const value = row[field];
      return typeof value === 'string' ? value : '';
    };
    result.push({
      address,
      name: text('name'),
      companyName: text('companyName'),
      department: text('department'),
      title: text('title'),
      phone: text('phone'),
      mobile: text('mobile'),
    });
  }
  return result;
}

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
      case 'ledger/list':
        return {
          ok: true,
          value: {
            contacts: await store.listContacts(),
            companies: await store.listCompanies(),
            ccPairs: await store.listAllCcPairs(),
          },
        };
      case 'ledger/updateContact':
        return {
          ok: true,
          value: await updateContact(store, normalizeAddress(message.address), message.edit),
        };
      case 'ledger/updateCompany':
        await updateCompany(store, message.companyKey, message.edit, now.toISOString());
        return { ok: true, value: null };
      case 'ledger/deleteContact':
        await store.deleteContact(normalizeAddress(message.address));
        return { ok: true, value: null };
      case 'ledger/import':
        return {
          ok: true,
          value: await importRows(store, sanitizeImportRows(message.rows), now.toISOString()),
        };
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
