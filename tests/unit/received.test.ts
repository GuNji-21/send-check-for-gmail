// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFixture } from '../../scripts/lib/fixture-files.mjs';
import { handleLedgerMessage } from '../../src/background/ledger-handler';
import {
  RECEIVED_READ_DELAY_MS,
  startReceivedReader,
  toReceivedMail,
} from '../../src/content/received';
import { type LedgerStore, createMemoryLedgerStore } from '../../src/core/ledger/ledger';
import { MAX_HISTORY, type ReceivedMail, recordReceived } from '../../src/core/ledger/received';
import { extractSignature } from '../../src/core/ledger/signature';
import { readOpenMessages } from '../../src/gmail/message-view';
import type { LedgerMessage } from '../../src/shared/messages';
import { rules } from './helpers';

const AT = '2026-11-24T10:00:00.000Z';
const SENT_AT = '2026-11-01T10:00:00.000Z';

const SIGNATURE = [
  '株式会社サンプル商事',
  '営業部 第一課 課長',
  '見本 太郎',
  'TEL: 03-0000-0000 / FAX: 03-0000-0001',
  '携帯: 090-0000-0000',
  'taro@client.example',
].join('\n');

function body(...parts: string[]): string {
  return ['見本商会', '山田様', '', 'お世話になっております。', ...parts].join('\n');
}

describe('extractSignature', () => {
  const sender = { senderAddress: 'taro@client.example', senderName: '見本 太郎' };

  it('署名から、会社名・部署・役職・電話番号・携帯番号を読み取る', () => {
    const result = extractSignature({
      bodyText: body('資料をお送りします。', '', '--', SIGNATURE),
      ...sender,
    });
    expect(result).toEqual({
      companyName: '株式会社サンプル商事',
      department: '営業部 第一課',
      title: '課長',
      phone: '03-0000-0000',
      mobile: '090-0000-0000',
    });
  });

  it('FAX の番号は読み取らない', () => {
    const result = extractSignature({
      bodyText:
        'よろしくお願いいたします。\n株式会社サンプル\nFAX: 03-0000-0001\ntaro@client.example',
      ...sender,
    });
    expect(result).toEqual({ companyName: '株式会社サンプル' });
  });

  it('ラベルが無くても、070・080・090 で始まる番号は携帯番号にする', () => {
    const result = extractSignature({
      bodyText: 'よろしくお願いいたします。\n見本 太郎\n080-0000-0000',
      ...sender,
    });
    expect(result).toEqual({ mobile: '080-0000-0000' });
  });

  it('全角の番号と、空白で分かれた会社名も読み取る', () => {
    const result = extractSignature({
      bodyText: 'よろしくお願いいたします。\n株式会社 サンプル\n電話：０３－００００－００００',
      ...sender,
    });
    expect(result.companyName).toBe('株式会社サンプル');
    expect(result.phone).toBe('03-0000-0000');
  });

  it('空白で分かれた会社名は、部署の手前までをつなげる', () => {
    const read = (line: string) =>
      extractSignature({ bodyText: 'x', signatureText: line, ...sender }).companyName;
    expect(read('株式会社 Sample & Trade Support')).toBe('株式会社Sample & Trade Support');
    expect(read('株式会社 サンプル 営業部 見本')).toBe('株式会社サンプル');
    expect(read('サンプル 株式会社')).toBe('サンプル株式会社');
  });

  it('英語の会社名も読み取る', () => {
    const result = extractSignature({
      bodyText:
        'Thank you for your help today.\nTaro Mihon\nSample Trading Co., Ltd.\nTel: 03-0000-0000',
      senderAddress: 'taro@client.example',
    });
    expect(result).toEqual({ companyName: 'Sample Trading Co., Ltd.', phone: '03-0000-0000' });
  });

  it('送信元のアドレスも電話番号も無ければ、署名とみなさない', () => {
    const result = extractSignature({
      bodyText: 'よろしくお願いいたします。\n株式会社サンプル\n見本 太郎',
      ...sender,
    });
    expect(result).toEqual({});
  });

  it('冒頭の宛名にある会社名（自分の会社）は拾わない', () => {
    const result = extractSignature({
      bodyText: '株式会社じぶん商会\n山田様\n\n承知しました。\n見本\n090-0000-0000',
      ...sender,
    });
    expect(result).toEqual({ mobile: '090-0000-0000' });
  });

  it('文の中の会社名は拾わない', () => {
    const result = extractSignature({
      bodyText: '株式会社べつの会社の件、承知しました。\n見本\ntaro@client.example',
      ...sender,
    });
    expect(result).toEqual({});
  });

  it('引用の見出しより後ろは見ない', () => {
    const result = extractSignature({
      bodyText: [
        '承知しました。',
        '見本',
        '-----Original Message-----',
        'From: someone@other.example',
        '株式会社べつの会社',
        'TEL: 03-0000-9999',
      ].join('\n'),
      ...sender,
    });
    expect(result).toEqual({});
  });

  it('名前の一部（長谷部など）を部署にしない', () => {
    const result = extractSignature({
      bodyText: 'よろしくお願いいたします。\n長谷部 太郎\n090-0000-0000',
      senderAddress: 'taro@client.example',
      senderName: '長谷部 太郎',
    });
    expect(result.department).toBeUndefined();
  });

  it('署名として印が付いている部分があれば、そこだけを見る', () => {
    const result = extractSignature({
      bodyText: '株式会社べつの会社\n03-0000-9999',
      signatureText: '合同会社サンプル\n総務部',
      ...sender,
    });
    expect(result).toEqual({ companyName: '合同会社サンプル', department: '総務部' });
  });
});

describe('recordReceived', () => {
  let store: LedgerStore;

  beforeEach(async () => {
    store = createMemoryLedgerStore();
    await store.putContact({
      address: 'taro@client.example',
      companyKey: 'client.example',
      toCount: 2,
      ccCount: 0,
      lastAt: SENT_AT,
    });
    await store.putCompany({ companyKey: 'client.example', lastAt: SENT_AT });
  });

  const mail = (overrides: Partial<ReceivedMail> = {}): ReceivedMail => ({
    sender: { address: 'Taro@Client.example', name: '見本 太郎' },
    others: [],
    signature: {},
    ...overrides,
  });

  it('台帳にある相手から届いたメールで、氏名・会社名・部署・電話番号を補う', async () => {
    const changed = await recordReceived(
      store,
      mail({
        signature: { companyName: '株式会社サンプル', department: '営業部', phone: '03-0000-0000' },
      }),
      AT,
    );
    expect(changed).toBe(true);
    expect(await store.getContact('taro@client.example')).toEqual({
      address: 'taro@client.example',
      companyKey: 'client.example',
      toCount: 2,
      ccCount: 0,
      // 最終やりとり日は変えない
      lastAt: SENT_AT,
      name: '見本 太郎',
      department: '営業部',
      phone: '03-0000-0000',
    });
    // 会社名は、ドメインに付ける
    expect((await store.getCompany('client.example'))?.name).toBe('株式会社サンプル');
  });

  it('台帳に無い相手から届いたメールは、何も記録しない', async () => {
    const changed = await recordReceived(
      store,
      mail({
        sender: { address: 'news@magazine.example', name: 'お知らせ' },
        others: [{ address: 'jiro@client.example' }],
        signature: { companyName: '株式会社マガジン' },
      }),
      AT,
    );
    expect(changed).toBe(false);
    expect(await store.countContacts()).toBe(1);
    expect(await store.getCompany('magazine.example')).toBeUndefined();
  });

  it('同じ内容をもう一度渡しても、書き換えない', async () => {
    const received = mail({ signature: { companyName: '株式会社サンプル', title: '課長' } });
    expect(await recordReceived(store, received, AT)).toBe(true);
    expect(await recordReceived(store, received, AT)).toBe(false);
  });

  it('自動で記録した項目は上書きし、変更前の値を履歴に残す', async () => {
    await recordReceived(store, mail({ signature: { department: '営業部' } }), SENT_AT);
    await recordReceived(store, mail({ signature: { department: '企画部' } }), AT);
    const contact = await store.getContact('taro@client.example');
    expect(contact?.department).toBe('企画部');
    expect(contact?.history).toEqual([{ at: AT, field: 'department', value: '営業部' }]);
  });

  it('履歴は上限の件数までにする', async () => {
    for (let index = 0; index < MAX_HISTORY + 5; index++) {
      await recordReceived(
        store,
        mail({ signature: { department: `第${String(index)}営業部` } }),
        AT,
      );
    }
    expect((await store.getContact('taro@client.example'))?.history).toHaveLength(MAX_HISTORY);
  });

  it('利用者が確認した連絡先は、空いている項目だけを補う', async () => {
    await store.putContact({
      address: 'taro@client.example',
      companyKey: 'client.example',
      toCount: 2,
      ccCount: 0,
      lastAt: SENT_AT,
      name: '見本太郎',
      department: '営業部',
      confirmed: true,
    });
    await recordReceived(
      store,
      mail({ signature: { department: '企画部', mobile: '090-0000-0000' } }),
      AT,
    );
    const contact = await store.getContact('taro@client.example');
    expect(contact?.name).toBe('見本太郎');
    expect(contact?.department).toBe('営業部');
    expect(contact?.mobile).toBe('090-0000-0000');
    expect(contact?.confirmed).toBe(true);
    expect(contact?.history).toBeUndefined();
  });

  it('氏名がすでにあれば、表示名で上書きしない', async () => {
    await recordReceived(store, mail(), SENT_AT);
    await recordReceived(
      store,
      mail({ sender: { address: 'taro@client.example', name: 'Taro' } }),
      AT,
    );
    expect((await store.getContact('taro@client.example'))?.name).toBe('見本 太郎');
  });

  it('アドレスがそのまま入っている表示名は、氏名にしない', async () => {
    await recordReceived(
      store,
      mail({ sender: { address: 'taro@client.example', name: 'taro@client.example' } }),
      AT,
    );
    expect((await store.getContact('taro@client.example'))?.name).toBeUndefined();
  });

  it('ドメインの会社名と違う会社名は、その連絡先だけの会社名にする', async () => {
    await store.putCompany({
      companyKey: 'client.example',
      lastAt: SENT_AT,
      name: '株式会社サンプル',
      aliases: ['サンプル商事'],
      confirmed: true,
    });
    // 書き方が違うだけ・別名と同じなら、何もしない
    await recordReceived(store, mail({ signature: { companyName: '（株）サンプル' } }), AT);
    await recordReceived(store, mail({ signature: { companyName: 'サンプル商事株式会社' } }), AT);
    expect((await store.getContact('taro@client.example'))?.companyName).toBeUndefined();

    await recordReceived(store, mail({ signature: { companyName: '株式会社べつの会社' } }), AT);
    expect((await store.getContact('taro@client.example'))?.companyName).toBe('株式会社べつの会社');
    expect((await store.getCompany('client.example'))?.name).toBe('株式会社サンプル');
  });

  it('フリーメールの相手の会社名は、連絡先ごとに持たせる', async () => {
    await store.putContact({
      address: 'hanako@gmail.com',
      companyKey: 'hanako@gmail.com',
      toCount: 1,
      ccCount: 0,
      lastAt: SENT_AT,
    });
    await recordReceived(
      store,
      mail({
        sender: { address: 'hanako@gmail.com' },
        signature: { companyName: '見本デザイン事務所株式会社' },
      }),
      AT,
    );
    expect((await store.getContact('hanako@gmail.com'))?.companyName).toBe(
      '見本デザイン事務所株式会社',
    );
    expect(await store.getCompany('gmail.com')).toBeUndefined();
  });

  it('宛先に入っていた人のうち、送ったことのある会社のドメインの人だけを足す', async () => {
    await store.putCompany({ companyKey: 'imported.example', lastAt: SENT_AT, neverSent: true });
    await recordReceived(
      store,
      mail({
        others: [
          { address: 'Jiro@client.example', name: '見本 次郎' },
          { address: 'taro@client.example' },
          { address: 'someone@unknown.example' },
          { address: 'someone@imported.example' },
          { address: 'someone@gmail.com' },
        ],
      }),
      AT,
    );
    expect(await store.getContact('jiro@client.example')).toEqual({
      address: 'jiro@client.example',
      companyKey: 'client.example',
      toCount: 0,
      ccCount: 0,
      lastAt: SENT_AT,
      name: '見本 次郎',
    });
    expect(await store.countContacts()).toBe(2);
  });
});

describe('ledger/received メッセージ', () => {
  it('形の正しくない内容は記録しない', async () => {
    const store = createMemoryLedgerStore();
    await store.putContact({
      address: 'taro@client.example',
      companyKey: 'client.example',
      toCount: 1,
      ccCount: 0,
      lastAt: SENT_AT,
    });
    const send = (mail: unknown) =>
      handleLedgerMessage(
        store,
        { type: 'ledger/received', mail } as unknown as LedgerMessage,
        new Date(AT),
      );
    expect(await send({ sender: { address: 'not an address' } })).toEqual({
      ok: true,
      value: false,
    });
    expect(await send(null)).toEqual({ ok: true, value: false });
    expect(
      await send({
        sender: { address: 'taro@client.example', name: 5 },
        others: 'x',
        signature: { title: '課長', phone: 5 },
      }),
    ).toEqual({ ok: true, value: true });
    const contact = await store.getContact('taro@client.example');
    expect(contact?.title).toBe('課長');
    expect(contact?.phone).toBeUndefined();
  });
});

describe('readOpenMessages（届いたメールの表示画面）', () => {
  beforeEach(() => {
    document.body.innerHTML = readFixture('message-view.ja.20261121.html');
  });

  it('開いているメールごとに、送信元・宛先・本文を読む', () => {
    const messages = readOpenMessages(document);
    expect(messages).toHaveLength(2);
    const [first, second] = messages;
    expect(first?.sender.address).toBe('user1@company1.example');
    expect(first?.sender.name).not.toBe('');
    expect(first?.others.map((person) => person.address)).toEqual(['user2@company2.example']);
    expect(second?.sender.address).toBe('user2@company2.example');
    expect(second?.others.map((person) => person.address)).toEqual(['user1@company1.example']);
    expect(first?.id).not.toBe(second?.id);
  });

  it('署名として印が付いている部分を読み、引用の中の署名は読まない', () => {
    const [first, second] = readOpenMessages(document);
    expect(first?.signatureText).toContain('000-0000-0000');
    // 2通目の本文には引用があり、引用の中にも署名がある。引用を除いた本文には引用の印が残らない
    const quoted = document.querySelectorAll('.gmail_quote .gmail_signature').length;
    expect(quoted).toBeGreaterThan(0);
    expect(second?.bodyText).toBeDefined();
    expect(first?.bodyText).toContain(first?.signatureText ?? 'x');
  });

  it('本文が表示されていないメールは読まない', () => {
    for (const element of document.querySelectorAll('.a3s')) element.remove();
    expect(readOpenMessages(document)).toEqual([]);
  });
});

describe('startReceivedReader', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = readFixture('message-view.ja.20261121.html');
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const settings = (overrides = {}) => ({
    rules: rules(),
    ledgerEnabled: true,
    ledgerReadReceived: true,
    ...overrides,
  });

  it('両方の設定が有効なときだけ読み、同じメールは1回だけ渡す', async () => {
    const record = vi.fn(() => Promise.resolve(true));
    const stop = startReceivedReader({
      view: window,
      getSettings: () => Promise.resolve(settings()),
      record,
    });
    await vi.advanceTimersByTimeAsync(RECEIVED_READ_DELAY_MS);
    expect(record).toHaveBeenCalledTimes(2);
    document.body.append(document.createElement('div'));
    await vi.advanceTimersByTimeAsync(RECEIVED_READ_DELAY_MS * 2);
    expect(record).toHaveBeenCalledTimes(2);
    stop();
  });

  it.each([{ ledgerEnabled: false }, { ledgerReadReceived: false }])(
    '設定が無効なら読まない（%o）',
    async (overrides) => {
      const record = vi.fn(() => Promise.resolve(true));
      const stop = startReceivedReader({
        view: window,
        getSettings: () => Promise.resolve(settings(overrides)),
        record,
      });
      await vi.advanceTimersByTimeAsync(RECEIVED_READ_DELAY_MS);
      expect(record).not.toHaveBeenCalled();
      stop();
    },
  );

  it('社内の人から届いたメールは渡さず、宛先からも社内の人を外す', async () => {
    const record = vi.fn((_mail: ReceivedMail) => Promise.resolve(true));
    const stop = startReceivedReader({
      view: window,
      getSettings: () =>
        Promise.resolve(settings({ rules: rules({ internalDomains: ['company2.example'] }) })),
      record,
    });
    await vi.advanceTimersByTimeAsync(RECEIVED_READ_DELAY_MS);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0]?.[0].sender.address).toBe('user1@company1.example');
    expect(record.mock.calls[0]?.[0].others).toEqual([]);
    stop();
  });

  it('記録に失敗しても、例外を外に出さない', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const stop = startReceivedReader({
      view: window,
      getSettings: () => Promise.resolve(settings()),
      record: () => Promise.reject(new Error('failed')),
    });
    await vi.advanceTimersByTimeAsync(RECEIVED_READ_DELAY_MS);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
    stop();
  });
});

describe('toReceivedMail', () => {
  it('署名を読み取り、本文そのものは含めない', () => {
    const mail = toReceivedMail(
      {
        id: 'm1',
        sender: { address: 'taro@client.example', name: '見本 太郎' },
        others: [],
        bodyText: `承知しました。\n${SIGNATURE}`,
      },
      rules(),
    );
    expect(mail.signature.companyName).toBe('株式会社サンプル商事');
    expect(JSON.stringify(mail)).not.toContain('承知しました');
  });
});
