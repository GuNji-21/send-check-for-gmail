import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleLedgerMessage } from '../../src/background/ledger-handler';
import {
  MIN_CC_RATIO,
  MIN_SENDS_TO_ADDRESS,
  ccMissingDetector,
} from '../../src/core/detectors/cc-missing';
import {
  MIN_SENDS_FOR_FIRST_TIME,
  firstTimeDomainDetector,
} from '../../src/core/detectors/first-time-domain';
import {
  type LedgerInsight,
  type LedgerStore,
  buildLedgerQuery,
  buildSendRecord,
  createMemoryLedgerStore,
  lookupLedger,
  pruneLedger,
  recordSend,
} from '../../src/core/ledger/ledger';
import type { Recipient } from '../../src/core/types';
import {
  lookupLedger as lookupViaMessage,
  recordSendToLedger,
} from '../../src/shared/ledger-client';
import { isExtensionMessage } from '../../src/shared/messages';
import { context, recipient, rules, snapshot } from './helpers';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const AT = '2026-11-20T10:00:00+09:00';

/** 送信1回分を記録する（宛先は「欄:アドレス」で書く） */
async function send(store: LedgerStore, recipients: readonly Recipient[], at = AT): Promise<void> {
  await recordSend(store, buildSendRecord(snapshot({ recipients, capturedAt: at }), rules()));
}

const to = (address: string): Recipient => recipient(address, 'to');
const cc = (address: string): Recipient => recipient(address, 'cc');

describe('buildSendRecord', () => {
  it('宛先を正規化し、会社（ドメイン）と社内かどうかを付ける', () => {
    const record = buildSendRecord(
      snapshot({
        recipients: [
          { address: 'Taro@Client.Example', displayName: '山田 太郎', field: 'to' },
          cc('colleague@mycompany.example'),
          recipient('someone@gmail.com', 'bcc'),
        ],
      }),
      rules(),
    );
    expect(record).toEqual({
      at: AT,
      recipients: [
        {
          address: 'taro@client.example',
          displayName: '山田 太郎',
          field: 'to',
          companyKey: 'client.example',
          internal: false,
        },
        {
          address: 'colleague@mycompany.example',
          field: 'cc',
          companyKey: 'mycompany.example',
          internal: true,
        },
        {
          address: 'someone@gmail.com',
          field: 'bcc',
          companyKey: 'someone@gmail.com',
          internal: false,
        },
      ],
    });
  });

  it('問い合わせには、社外の会社と、To に入っている社外の相手のアドレスを入れる', () => {
    const record = buildSendRecord(
      snapshot({
        recipients: [
          to('a@client.example'),
          to('b@client.example'),
          to('colleague@mycompany.example'),
          cc('x@partner.example'),
        ],
      }),
      rules(),
    );
    expect(buildLedgerQuery(record)).toEqual({
      companies: ['client.example', 'partner.example'],
      toAddresses: ['a@client.example', 'b@client.example'],
    });
  });
});

describe('recordSend と lookupLedger', () => {
  it('送った会社を「送ったことがある」として読み取れる（Cc にだけ入れた会社も含む）', async () => {
    const store = createMemoryLedgerStore();
    await send(store, [to('a@client.example'), cc('x@partner.example')]);
    const insight = await lookupLedger(store, {
      companies: ['client.example', 'partner.example', 'new.example'],
      toAddresses: [],
    });
    expect(insight.totalSends).toBe(1);
    expect(insight.knownCompanies).toEqual(['client.example', 'partner.example']);
  });

  it('To の相手ごとに、送った回数と Cc に入れた回数を数える', async () => {
    const store = createMemoryLedgerStore();
    await send(store, [to('a@client.example'), cc('boss@mycompany.example')]);
    await send(store, [
      to('a@client.example'),
      cc('boss@mycompany.example'),
      cc('x@partner.example'),
    ]);
    await send(store, [to('a@client.example')]);
    // 同じ会社の別の人（部署が違う）には、別の人を Cc に入れている
    await send(store, [to('b@client.example'), cc('other@mycompany.example')]);

    const insight = await lookupLedger(store, {
      companies: ['client.example'],
      toAddresses: ['a@client.example', 'b@client.example'],
    });
    expect(insight.ccHistory).toEqual([
      {
        toAddress: 'a@client.example',
        toSendCount: 3,
        address: 'boss@mycompany.example',
        count: 2,
      },
      { toAddress: 'a@client.example', toSendCount: 3, address: 'x@partner.example', count: 1 },
      {
        toAddress: 'b@client.example',
        toSendCount: 1,
        address: 'other@mycompany.example',
        count: 1,
      },
    ]);
  });

  it('To に複数の相手がいる場合は、それぞれの相手について Cc を記録する', async () => {
    const store = createMemoryLedgerStore();
    await send(store, [
      to('a@client.example'),
      to('b@client.example'),
      cc('boss@mycompany.example'),
    ]);
    expect(await store.listCcPairs('a@client.example')).toHaveLength(1);
    expect(await store.listCcPairs('b@client.example')).toHaveLength(1);
  });

  it('送ったことのない相手については、Cc の記録を返さない', async () => {
    const store = createMemoryLedgerStore();
    await send(store, [to('a@client.example'), cc('boss@mycompany.example')]);
    const insight = await lookupLedger(store, {
      companies: ['client.example'],
      toAddresses: ['stranger@client.example'],
    });
    expect(insight.ccHistory).toEqual([]);
  });

  it('連絡先は社外の相手だけを記録し、To・Cc の回数と最終やりとり日を持つ', async () => {
    const store = createMemoryLedgerStore();
    await send(store, [to('a@client.example'), cc('colleague@mycompany.example')]);
    await send(
      store,
      [cc('a@client.example'), to('b@client.example')],
      '2026-12-01T09:00:00+09:00',
    );

    expect(await store.countContacts()).toBe(2);
    expect(await store.getContact('a@client.example')).toEqual({
      address: 'a@client.example',
      companyKey: 'client.example',
      toCount: 1,
      ccCount: 1,
      lastAt: '2026-12-01T09:00:00+09:00',
    });
    expect(await store.getContact('colleague@mycompany.example')).toBeUndefined();
  });

  it('表示名は、分かったときに記録し、分からない送信では消さない', async () => {
    const store = createMemoryLedgerStore();
    await send(store, [{ address: 'a@client.example', displayName: '山田 太郎', field: 'to' }]);
    await send(store, [to('a@client.example')]);
    expect((await store.getContact('a@client.example'))?.displayName).toBe('山田 太郎');
  });

  it('社外の宛先が無い送信（社内だけ、自分宛て）は記録しない', async () => {
    const store = createMemoryLedgerStore();
    await send(store, [to('colleague@mycompany.example'), cc('me@mycompany.example')]);
    expect((await store.getMeta()).totalSends).toBe(0);
    expect(await store.countContacts()).toBe(0);
  });

  it('保存期間を過ぎた記録を削除する', async () => {
    const store = createMemoryLedgerStore();
    await send(
      store,
      [to('old@old.example'), cc('boss@mycompany.example')],
      '2024-01-10T10:00:00+09:00',
    );
    await send(store, [to('new@new.example')], '2026-11-01T10:00:00+09:00');

    const removed = await pruneLedger(store, new Date('2026-11-20T00:00:00+09:00'), 730);
    // 連絡先・会社・Cc の記録が1件ずつ消える
    expect(removed).toBe(3);
    expect(await store.getContact('old@old.example')).toBeUndefined();
    expect(await store.getCompany('old.example')).toBeUndefined();
    expect(await store.listCcPairs('old@old.example')).toEqual([]);
    expect(await store.getContact('new@new.example')).toBeDefined();
  });

  it('すべて削除すると、空の状態に戻る', async () => {
    const store = createMemoryLedgerStore();
    await send(store, [to('a@client.example'), cc('boss@mycompany.example')]);
    await store.clear();
    expect(await store.getMeta()).toEqual({ totalSends: 0 });
    expect(await store.countContacts()).toBe(0);
    expect(await store.listCcPairs('a@client.example')).toEqual([]);
  });
});

function insight(overrides: Partial<LedgerInsight> = {}): LedgerInsight {
  return { totalSends: 50, knownCompanies: [], ccHistory: [], ...overrides };
}

describe('初めて送るドメイン', () => {
  const detect = (addresses: string[], ledger: LedgerInsight | undefined) =>
    firstTimeDomainDetector.detect(
      snapshot({ recipients: addresses.map((address) => to(address)) }),
      ledger === undefined ? context() : context({ ledger }),
    );

  it('送ったことのないドメインがあれば検知する', () => {
    expect(
      detect(
        ['a@client.example', 'b@new.example'],
        insight({ knownCompanies: ['client.example'] }),
      ),
    ).toEqual([
      {
        detectorId: 'first-time-domain',
        messageKey: 'detectFirstTimeDomain',
        substitutions: ['new.example'],
      },
    ]);
  });

  it('すべて送ったことのあるドメインなら検知しない', () => {
    expect(detect(['a@client.example'], insight({ knownCompanies: ['client.example'] }))).toEqual(
      [],
    );
  });

  it('社内の宛先は対象にしない', () => {
    expect(detect(['colleague@mycompany.example'], insight())).toEqual([]);
  });

  it('フリーメールは、アドレスごとに判断する', () => {
    const ledger = insight({ knownCompanies: ['known@gmail.com'] });
    expect(detect(['known@gmail.com'], ledger)).toEqual([]);
    expect(detect(['other@gmail.com'], ledger)[0]?.substitutions).toEqual(['other@gmail.com']);
  });

  it('記録した送信が少ないうちは検知しない（入れた直後に警告だらけになるのを防ぐ）', () => {
    expect(
      detect(['b@new.example'], insight({ totalSends: MIN_SENDS_FOR_FIRST_TIME - 1 })),
    ).toEqual([]);
    expect(
      detect(['b@new.example'], insight({ totalSends: MIN_SENDS_FOR_FIRST_TIME })),
    ).toHaveLength(1);
  });

  it('連絡先の記録が無効・読めなかった場合は検知しない', () => {
    expect(detect(['b@new.example'], undefined)).toEqual([]);
  });
});

describe('Cc 漏れ', () => {
  const history = (address: string, count: number, toSendCount: number) => ({
    toAddress: 'a@client.example',
    toSendCount,
    address,
    count,
  });
  const detect = (recipients: Recipient[], ledger: LedgerInsight | undefined) =>
    ccMissingDetector.detect(
      snapshot({ recipients }),
      ledger === undefined ? context() : context({ ledger }),
    );

  it('その相手へのメールでよく Cc に入れている人がいなければ検知する', () => {
    expect(
      detect(
        [to('a@client.example')],
        insight({ ccHistory: [history('boss@mycompany.example', 4, 5)] }),
      ),
    ).toEqual([
      {
        detectorId: 'cc-missing',
        messageKey: 'detectCcMissing',
        substitutions: ['boss@mycompany.example'],
      },
    ]);
  });

  it('今回の宛先（To / Cc / Bcc のどれか）に入っていれば検知しない', () => {
    const ledger = insight({ ccHistory: [history('boss@mycompany.example', 4, 5)] });
    expect(detect([to('a@client.example'), cc('Boss@mycompany.example')], ledger)).toEqual([]);
    expect(
      detect([to('a@client.example'), recipient('boss@mycompany.example', 'bcc')], ledger),
    ).toEqual([]);
  });

  it('たまにしか Cc に入れていない人は対象にしない', () => {
    const below = Math.ceil(10 * MIN_CC_RATIO) - 1;
    expect(
      detect(
        [to('a@client.example')],
        insight({ ccHistory: [history('rare@partner.example', below, 10)] }),
      ),
    ).toEqual([]);
  });

  it('その相手に送った回数が少ないうちは判断しない', () => {
    const few = MIN_SENDS_TO_ADDRESS - 1;
    expect(
      detect(
        [to('a@client.example')],
        insight({ ccHistory: [history('boss@mycompany.example', few, few)] }),
      ),
    ).toEqual([]);
  });

  it('送信元の自分自身は対象にしない', () => {
    expect(
      detect(
        [to('a@client.example')],
        insight({ ccHistory: [history('me@mycompany.example', 5, 5)] }),
      ),
    ).toEqual([]);
  });

  it('連絡先の記録が無効・読めなかった場合は検知しない', () => {
    expect(detect([to('a@client.example')], undefined)).toEqual([]);
  });

  it('記録から検知までを通して動く', async () => {
    const store = createMemoryLedgerStore();
    for (let i = 0; i < 3; i++) {
      await send(store, [to('a@client.example'), cc('boss@mycompany.example')]);
    }
    const current = snapshot({ recipients: [to('a@client.example')] });
    const ledger = await lookupLedger(store, buildLedgerQuery(buildSendRecord(current, rules())));
    expect(ccMissingDetector.detect(current, context({ ledger }))[0]?.substitutions).toEqual([
      'boss@mycompany.example',
    ]);
  });

  it('同じ会社でも、別の相手（別の部署）宛てには、その Cc を求めない', async () => {
    const store = createMemoryLedgerStore();
    for (let i = 0; i < 3; i++) {
      await send(store, [to('a@client.example'), cc('boss@mycompany.example')]);
    }
    // b さんには、まだ boss を Cc に入れて送ったことがない
    const current = snapshot({ recipients: [to('b@client.example')] });
    const ledger = await lookupLedger(store, buildLedgerQuery(buildSendRecord(current, rules())));
    expect(ccMissingDetector.detect(current, context({ ledger }))).toEqual([]);
  });
});

describe('background のメッセージ処理', () => {
  const now = new Date('2026-11-20T00:00:00+09:00');
  const record = buildSendRecord(
    snapshot({ recipients: [to('a@client.example'), cc('boss@mycompany.example')] }),
    rules(),
  );

  it('記録・読み取り・件数・削除を処理する', async () => {
    const store = createMemoryLedgerStore();
    expect(
      await handleLedgerMessage(store, { type: 'ledger/record', record, retentionDays: 730 }, now),
    ).toEqual({ ok: true, value: null });

    expect(await handleLedgerMessage(store, { type: 'ledger/stats' }, now)).toEqual({
      ok: true,
      value: { contactCount: 1, totalSends: 1 },
    });

    const lookup = await handleLedgerMessage(
      store,
      { type: 'ledger/lookup', query: buildLedgerQuery(record) },
      now,
    );
    expect(lookup).toMatchObject({ ok: true, value: { knownCompanies: ['client.example'] } });

    await handleLedgerMessage(store, { type: 'ledger/clear' }, now);
    expect(await store.countContacts()).toBe(0);
  });

  it('記録のたびに、保存期間を過ぎた記録を削除する', async () => {
    const store = createMemoryLedgerStore();
    await send(store, [to('old@old.example')], '2020-01-01T00:00:00+09:00');
    await handleLedgerMessage(store, { type: 'ledger/record', record, retentionDays: 365 }, now);
    expect(await store.getContact('old@old.example')).toBeUndefined();
  });

  it('保存期間の値がおかしい場合は、削除を行わない', async () => {
    const store = createMemoryLedgerStore();
    await send(store, [to('old@old.example')], '2020-01-01T00:00:00+09:00');
    for (const retentionDays of [0, -1, Number.NaN, 100000]) {
      await handleLedgerMessage(store, { type: 'ledger/record', record, retentionDays }, now);
    }
    expect(await store.getContact('old@old.example')).toBeDefined();
  });

  it('保存先でエラーが起きたら、失敗の応答を返す（例外にしない）', async () => {
    const store = createMemoryLedgerStore();
    store.getMeta = () => Promise.reject(new Error('database is broken'));
    expect(await handleLedgerMessage(store, { type: 'ledger/stats' }, now)).toEqual({
      ok: false,
      error: 'database is broken',
    });
  });

  it('この拡張機能のメッセージだけを見分ける', () => {
    expect(isExtensionMessage({ type: 'ledger/stats' })).toBe(true);
    expect(isExtensionMessage({ type: 'something/else' })).toBe(false);
    expect(isExtensionMessage('ledger/stats')).toBe(false);
    expect(isExtensionMessage(null)).toBe(false);
  });
});

describe('content からの依頼（ledger-client）', () => {
  function stubRuntime(reply: (message: unknown) => Promise<unknown>) {
    const sendMessage = vi.fn(reply);
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    return sendMessage;
  }
  const query = { companies: ['client.example'], toAddresses: ['a@client.example'] };

  it('background に依頼し、返ってきた値を受け取る', async () => {
    const value = { totalSends: 3, knownCompanies: ['client.example'], ccHistory: [] };
    const sendMessage = stubRuntime(() => Promise.resolve({ ok: true, value }));
    await expect(lookupViaMessage(query)).resolves.toEqual(value);
    expect(sendMessage).toHaveBeenCalledWith({ type: 'ledger/lookup', query });
  });

  it('失敗の応答・応答なしは、失敗として伝える', async () => {
    stubRuntime(() => Promise.resolve({ ok: false, error: 'database is broken' }));
    await expect(lookupViaMessage(query)).rejects.toThrow('database is broken');
    stubRuntime(() => Promise.resolve(undefined));
    await expect(recordSendToLedger({ at: AT, recipients: [] }, 730)).rejects.toThrow();
  });

  it('読み取りに時間がかかりすぎた場合は、打ち切って失敗にする', async () => {
    vi.useFakeTimers();
    stubRuntime(() => new Promise(() => undefined));
    const pending = lookupViaMessage(query, 300);
    const assertion = expect(pending).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(300);
    await assertion;
  });
});
