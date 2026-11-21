/**
 * 連絡先の記録（台帳）の、純粋な処理の部分。フェーズ2a。
 *
 * 利用者が送ったメールの宛先を記録しておき、次の判断に使う。
 * - 初めて送るドメインかどうか
 * - その相手（To のアドレス）へのメールで、よく Cc に入れている人が今回入っているか
 *   （会社単位ではなく、To のアドレス単位で見る。同じ会社でも、部署によって Cc に入れる人が変わるため）
 *
 * ここでは「何を記録するか」「記録から何を読み取るか」だけを扱う。
 * 保存先（background 側の IndexedDB）は LedgerStore として外から渡す。
 * こうしておくと、保存先に依存せずにテストできる。
 *
 * 記録するのは、利用者が設定で「連絡先を記録する」を有効にしたときだけ。
 * 記録は端末の中にだけ置き、外部には送信しない。
 */

import { companyKeyOf, isInternalAddress } from '../classify';
import { normalizeAddress } from '../text/address';
import type { ClassificationRules, ComposeSnapshot, RecipientField } from '../types';

/** 送信1回分の記録の元になる情報（content 側で作り、background に渡す） */
export interface SendRecord {
  /** 送信操作の日時（ISO 8601） */
  readonly at: string;
  readonly recipients: readonly SendRecipient[];
}

export interface SendRecipient {
  /** 正規化したアドレス（小文字） */
  readonly address: string;
  readonly displayName?: string;
  readonly field: RecipientField;
  /** 会社に相当する単位（ドメイン。フリーメールはアドレス） */
  readonly companyKey: string;
  /** 社内扱いかどうか（送信元と同じドメイン、社内として登録済み） */
  readonly internal: boolean;
}

/** 連絡先1件（社外の相手のみ記録する） */
export interface ContactRecord {
  readonly address: string;
  readonly displayName?: string;
  readonly companyKey: string;
  /** To に入れた回数・Cc に入れた回数（判断にだけ使い、画面には表示しない） */
  readonly toCount: number;
  readonly ccCount: number;
  /** 最終やりとり日（ISO 8601） */
  readonly lastAt: string;
}

/** 会社（ドメイン）1件。「送ったことがあるドメインか」の判断に使う */
export interface CompanyRecord {
  readonly companyKey: string;
  readonly lastAt: string;
}

/** 「この相手（To のアドレス）へのメールで、この人を Cc に入れた」の記録 */
export interface CcPairRecord {
  /** toAddress と address をつなげた識別子 */
  readonly id: string;
  /** To に入れた相手のアドレス（社外の相手） */
  readonly toAddress: string;
  /** Cc に入れた人のアドレス（社内の人も含む。上司を毎回 Cc に入れる、という使い方があるため） */
  readonly address: string;
  readonly count: number;
  readonly lastAt: string;
}

/** 台帳全体についての情報 */
export interface LedgerMeta {
  /** 記録した送信の回数 */
  readonly totalSends: number;
}

/** 台帳の保存先。background 側では IndexedDB、テストではメモリ上の実装を使う */
export interface LedgerStore {
  getMeta(): Promise<LedgerMeta>;
  setMeta(meta: LedgerMeta): Promise<void>;
  getContact(address: string): Promise<ContactRecord | undefined>;
  putContact(record: ContactRecord): Promise<void>;
  getCompany(companyKey: string): Promise<CompanyRecord | undefined>;
  putCompany(record: CompanyRecord): Promise<void>;
  getCcPair(id: string): Promise<CcPairRecord | undefined>;
  putCcPair(record: CcPairRecord): Promise<void>;
  /** To のアドレスを指定して、その相手へのメールで Cc に入れた人の記録を返す */
  listCcPairs(toAddress: string): Promise<readonly CcPairRecord[]>;
  /** 最終やりとり日が cutoff より前の記録を削除し、削除した件数を返す */
  deleteOlderThan(cutoff: string): Promise<number>;
  /** すべての記録を削除する */
  clear(): Promise<void>;
  /** 記録している連絡先の件数 */
  countContacts(): Promise<number>;
}

/** 台帳から読み取った、今回の送信の判断に使う情報 */
export interface LedgerInsight {
  /** 記録した送信の回数 */
  readonly totalSends: number;
  /** 今回の宛先の会社のうち、過去に送ったことがある会社 */
  readonly knownCompanies: readonly string[];
  /** 今回の To の相手について、過去に Cc に入れたことのある人 */
  readonly ccHistory: readonly CcHistory[];
}

export interface CcHistory {
  /** To に入れた相手のアドレス */
  readonly toAddress: string;
  /** この相手を To に入れて送った回数 */
  readonly toSendCount: number;
  /** Cc に入れた人のアドレス */
  readonly address: string;
  /** そのうち、この人を Cc に入れた回数 */
  readonly count: number;
}

/** 台帳に問い合わせる内容 */
export interface LedgerQuery {
  /** 今回の宛先（社外）の会社 */
  readonly companies: readonly string[];
  /** 今回の To に入っている社外の相手のアドレス */
  readonly toAddresses: readonly string[];
}

function ccPairId(toAddress: string, address: string): string {
  return `${toAddress}\u0000${address}`;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/** 送信内容から、台帳に記録する情報を作る */
export function buildSendRecord(snapshot: ComposeSnapshot, rules: ClassificationRules): SendRecord {
  const context = { rules, fromAddress: snapshot.fromAddress };
  return {
    at: snapshot.capturedAt,
    recipients: snapshot.recipients.map((recipient) => {
      const address = normalizeAddress(recipient.address);
      const base = {
        address,
        field: recipient.field,
        companyKey: companyKeyOf(address),
        internal: isInternalAddress(address, context),
      };
      return recipient.displayName === undefined
        ? base
        : { ...base, displayName: recipient.displayName };
    }),
  };
}

/** 送信内容から、台帳に問い合わせる内容を作る */
export function buildLedgerQuery(record: SendRecord): LedgerQuery {
  const external = record.recipients.filter((recipient) => !recipient.internal);
  return {
    companies: unique(external.map((recipient) => recipient.companyKey)),
    toAddresses: unique(
      external.filter((recipient) => recipient.field === 'to').map((r) => r.address),
    ),
  };
}

/** 送信1回分を台帳に記録する */
export async function recordSend(store: LedgerStore, record: SendRecord): Promise<void> {
  const external = record.recipients.filter((recipient) => !recipient.internal);
  // 社外の宛先が無い送信（社内だけ、自分宛てのメモなど）は記録しない
  if (external.length === 0) return;

  const meta = await store.getMeta();
  await store.setMeta({ totalSends: meta.totalSends + 1 });

  // 連絡先（社外のみ）
  for (const recipient of external) {
    const existing = await store.getContact(recipient.address);
    const displayName = recipient.displayName ?? existing?.displayName;
    const next = {
      address: recipient.address,
      companyKey: recipient.companyKey,
      toCount: (existing?.toCount ?? 0) + (recipient.field === 'to' ? 1 : 0),
      ccCount: (existing?.ccCount ?? 0) + (recipient.field === 'cc' ? 1 : 0),
      lastAt: record.at,
    };
    await store.putContact(displayName === undefined ? next : { ...next, displayName });
  }

  // 会社（送ったことがあるドメインか、の判断に使う）
  for (const companyKey of unique(external.map((recipient) => recipient.companyKey))) {
    await store.putCompany({ companyKey, lastAt: record.at });
  }

  // 「この相手（To のアドレス）へのメールで、この人を Cc に入れた」。Cc の人は社内も含める
  const toAddresses = unique(
    external.filter((recipient) => recipient.field === 'to').map((r) => r.address),
  );
  const ccAddresses = unique(
    record.recipients.filter((recipient) => recipient.field === 'cc').map((r) => r.address),
  );
  for (const toAddress of toAddresses) {
    for (const address of ccAddresses) {
      const id = ccPairId(toAddress, address);
      const existing = await store.getCcPair(id);
      await store.putCcPair({
        id,
        toAddress,
        address,
        count: (existing?.count ?? 0) + 1,
        lastAt: record.at,
      });
    }
  }
}

/** 今回の送信の判断に使う情報を、台帳から読み取る */
export async function lookupLedger(store: LedgerStore, query: LedgerQuery): Promise<LedgerInsight> {
  const meta = await store.getMeta();
  const knownCompanies: string[] = [];
  for (const companyKey of unique(query.companies)) {
    if ((await store.getCompany(companyKey)) !== undefined) knownCompanies.push(companyKey);
  }
  const ccHistory: CcHistory[] = [];
  for (const toAddress of unique(query.toAddresses)) {
    // この相手を To に入れて送った回数は、連絡先の記録にある
    const contact = await store.getContact(toAddress);
    if (contact === undefined) continue;
    for (const pair of await store.listCcPairs(toAddress)) {
      ccHistory.push({
        toAddress,
        toSendCount: contact.toCount,
        address: pair.address,
        count: pair.count,
      });
    }
  }
  return { totalSends: meta.totalSends, knownCompanies, ccHistory };
}

/** 保存期間を過ぎた記録を削除する。削除した件数を返す */
export async function pruneLedger(
  store: LedgerStore,
  now: Date,
  retentionDays: number,
): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  return store.deleteOlderThan(cutoff.toISOString());
}

/** メモリ上の台帳（テスト用。保存先を持たない環境での確認にも使える） */
export function createMemoryLedgerStore(): LedgerStore {
  let meta: LedgerMeta = { totalSends: 0 };
  const contacts = new Map<string, ContactRecord>();
  const companies = new Map<string, CompanyRecord>();
  const ccPairs = new Map<string, CcPairRecord>();
  const isOld = (lastAt: string, cutoff: string): boolean =>
    new Date(lastAt).getTime() < new Date(cutoff).getTime();
  const removeOld = <T extends { lastAt: string }>(map: Map<string, T>, cutoff: string): number => {
    let removed = 0;
    for (const [key, value] of map) {
      if (isOld(value.lastAt, cutoff)) {
        map.delete(key);
        removed++;
      }
    }
    return removed;
  };
  return {
    getMeta: () => Promise.resolve(meta),
    setMeta: (next) => {
      meta = next;
      return Promise.resolve();
    },
    getContact: (address) => Promise.resolve(contacts.get(address)),
    putContact: (record) => {
      contacts.set(record.address, record);
      return Promise.resolve();
    },
    getCompany: (companyKey) => Promise.resolve(companies.get(companyKey)),
    putCompany: (record) => {
      companies.set(record.companyKey, record);
      return Promise.resolve();
    },
    getCcPair: (id) => Promise.resolve(ccPairs.get(id)),
    putCcPair: (record) => {
      ccPairs.set(record.id, record);
      return Promise.resolve();
    },
    listCcPairs: (toAddress) =>
      Promise.resolve([...ccPairs.values()].filter((pair) => pair.toAddress === toAddress)),
    deleteOlderThan: (cutoff) =>
      Promise.resolve(
        removeOld(contacts, cutoff) + removeOld(companies, cutoff) + removeOld(ccPairs, cutoff),
      ),
    clear: () => {
      meta = { totalSends: 0 };
      contacts.clear();
      companies.clear();
      ccPairs.clear();
      return Promise.resolve();
    },
    countContacts: () => Promise.resolve(contacts.size),
  };
}
