/**
 * 連絡先の記録（台帳）の保存先。拡張機能専用の IndexedDB を使う。
 *
 * background（service worker）で開くので、Gmail 側の保存領域とは別の、拡張機能だけの領域に入る。
 * 外部には送信しない。拡張機能を削除すると、この領域ごと消える。
 */

import type {
  CcPairRecord,
  CompanyRecord,
  ContactRecord,
  LedgerMeta,
  LedgerStore,
} from '../core/ledger/ledger';

const DB_NAME = 'send-check-ledger';
/** 2：Cc の記録を、会社単位から To のアドレス単位に変えた */
const DB_VERSION = 2;
const META = 'meta';
const CONTACTS = 'contacts';
const COMPANIES = 'companies';
const CC_PAIRS = 'ccPairs';
const META_KEY = 'meta';
const DATED_STORES = [CONTACTS, COMPANIES, CC_PAIRS] as const;

function asPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB request failed'));
    };
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    };
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      if (!db.objectStoreNames.contains(CONTACTS)) {
        db.createObjectStore(CONTACTS, { keyPath: 'address' });
      }
      if (!db.objectStoreNames.contains(COMPANIES)) {
        db.createObjectStore(COMPANIES, { keyPath: 'companyKey' });
      }
      // 版 1 の Cc の記録は会社単位で、いまの形（To のアドレス単位）に直せないため、作り直す
      if (db.objectStoreNames.contains(CC_PAIRS)) db.deleteObjectStore(CC_PAIRS);
      const pairs = db.createObjectStore(CC_PAIRS, { keyPath: 'id' });
      pairs.createIndex('toAddress', 'toAddress');
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('Failed to open IndexedDB'));
    };
  });
}

/** IndexedDB を使う台帳を作る。データベースは最初に使うときに開き、以後は使い回す */
export function createIndexedDbLedgerStore(): LedgerStore {
  let opening: Promise<IDBDatabase> | undefined;
  const database = (): Promise<IDBDatabase> => {
    opening ??= openDatabase().catch((error: unknown) => {
      // 開けなかった場合は、次に使うときに開き直す
      opening = undefined;
      throw error;
    });
    return opening;
  };

  const get = async <T>(storeName: string, key: string): Promise<T | undefined> => {
    const db = await database();
    return asPromise(
      db.transaction(storeName, 'readonly').objectStore(storeName).get(key) as IDBRequest<
        T | undefined
      >,
    );
  };
  const getAll = async <T>(storeName: string): Promise<T[]> => {
    const db = await database();
    return asPromise(
      db.transaction(storeName, 'readonly').objectStore(storeName).getAll() as IDBRequest<T[]>,
    );
  };
  const put = async (storeName: string, value: unknown, key?: string): Promise<void> => {
    const db = await database();
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(value, key);
    await done(transaction);
  };

  return {
    async getMeta() {
      return (await get<LedgerMeta>(META, META_KEY)) ?? { totalSends: 0 };
    },
    setMeta: (meta) => put(META, meta, META_KEY),
    getContact: (address) => get<ContactRecord>(CONTACTS, address),
    putContact: (record) => put(CONTACTS, record),
    getCompany: (companyKey) => get<CompanyRecord>(COMPANIES, companyKey),
    putCompany: (record) => put(COMPANIES, record),
    getCcPair: (id) => get<CcPairRecord>(CC_PAIRS, id),
    putCcPair: (record) => put(CC_PAIRS, record),
    async listCcPairs(toAddress) {
      const db = await database();
      const index = db.transaction(CC_PAIRS, 'readonly').objectStore(CC_PAIRS).index('toAddress');
      return asPromise(index.getAll(toAddress) as IDBRequest<CcPairRecord[]>);
    },
    async deleteOlderThan(cutoff) {
      const db = await database();
      const cutoffTime = new Date(cutoff).getTime();
      const transaction = db.transaction([...DATED_STORES], 'readwrite');
      let removed = 0;
      for (const storeName of DATED_STORES) {
        const request = transaction.objectStore(storeName).openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor === null) return;
          const lastAt = (cursor.value as { lastAt?: string }).lastAt;
          if (lastAt !== undefined && new Date(lastAt).getTime() < cutoffTime) {
            cursor.delete();
            removed++;
          }
          cursor.continue();
        };
      }
      await done(transaction);
      return removed;
    },
    async clear() {
      const db = await database();
      const transaction = db.transaction([META, ...DATED_STORES], 'readwrite');
      for (const storeName of [META, ...DATED_STORES]) transaction.objectStore(storeName).clear();
      await done(transaction);
    },
    async countContacts() {
      const db = await database();
      return asPromise(db.transaction(CONTACTS, 'readonly').objectStore(CONTACTS).count());
    },
    listContacts: () => getAll<ContactRecord>(CONTACTS),
    listCompanies: () => getAll<CompanyRecord>(COMPANIES),
    listAllCcPairs: () => getAll<CcPairRecord>(CC_PAIRS),
    async deleteContact(address) {
      const db = await database();
      const transaction = db.transaction([CONTACTS, COMPANIES, CC_PAIRS], 'readwrite');
      const contactStore = transaction.objectStore(CONTACTS);
      const found = contactStore.get(address) as IDBRequest<ContactRecord | undefined>;
      found.onsuccess = () => {
        const companyKey = found.result?.companyKey;
        contactStore.delete(address);
        if (companyKey === undefined) return;
        // その会社の連絡先が1件も残らなければ、会社の記録も消す
        const rest = contactStore.getAll() as IDBRequest<ContactRecord[]>;
        rest.onsuccess = () => {
          if (!rest.result.some((contact) => contact.companyKey === companyKey)) {
            transaction.objectStore(COMPANIES).delete(companyKey);
          }
        };
      };
      const request = transaction.objectStore(CC_PAIRS).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor === null) return;
        const pair = cursor.value as CcPairRecord;
        if (pair.toAddress === address || pair.address === address) cursor.delete();
        cursor.continue();
      };
      await done(transaction);
    },
  };
}
