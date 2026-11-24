import { beforeEach, describe, expect, it } from 'vitest';
import { handleLedgerMessage } from '../../src/background/ledger-handler';
import { buildConfirmationModel } from '../../src/core/confirmation';
import { MAX_IMPORT_ROWS, importRows, parseCsv, splitCsv, toCsv } from '../../src/core/ledger/csv';
import {
  MAX_FIELD_LENGTH,
  buildDirectory,
  cleanField,
  companySearchKey,
  searchDirectory,
  updateCompany,
  updateContact,
} from '../../src/core/ledger/directory';
import {
  type LedgerStore,
  type SendRecord,
  createMemoryLedgerStore,
  lookupLedger,
  recordSend,
} from '../../src/core/ledger/ledger';
import { DEFAULT_SETTINGS } from '../../src/storage/settings';
import { recipient, snapshot } from './helpers';

const NOW = '2026-11-20T10:00:00.000Z';

function send(
  at: string,
  to: readonly string[],
  cc: readonly string[] = [],
  internal: readonly string[] = [],
): SendRecord {
  const make = (address: string, field: 'to' | 'cc') => ({
    address,
    field,
    companyKey: address.endsWith('@gmail.com') ? address : (address.split('@')[1] ?? ''),
    internal: internal.includes(address),
  });
  return {
    at,
    recipients: [...to.map((a) => make(a, 'to')), ...cc.map((a) => make(a, 'cc'))],
  };
}

async function directoryOf(store: LedgerStore) {
  return buildDirectory(
    await store.listContacts(),
    await store.listCompanies(),
    await store.listAllCcPairs(),
  );
}

let store: LedgerStore;

beforeEach(async () => {
  store = createMemoryLedgerStore();
  await recordSend(
    store,
    send('2026-11-01T00:00:00.000Z', ['taro@client.example'], ['hana@partner.example']),
  );
  await recordSend(
    store,
    send('2026-11-10T00:00:00.000Z', ['jiro@client.example', 'free@gmail.com']),
  );
});

describe('台帳の編集', () => {
  it('連絡先の氏名・部署・電話番号などを登録でき、「確定」になる', async () => {
    expect(
      await updateContact(store, 'taro@client.example', {
        name: ' 見本 太郎 ',
        department: '営業部',
        title: '課長',
        phone: '03-0000-0000',
        mobile: '090-0000-0000',
      }),
    ).toBe(true);
    expect(await store.getContact('taro@client.example')).toMatchObject({
      name: '見本 太郎',
      department: '営業部',
      title: '課長',
      phone: '03-0000-0000',
      mobile: '090-0000-0000',
      confirmed: true,
      toCount: 1,
    });
  });

  it('空にした項目は消え、省略した項目は変わらない', async () => {
    await updateContact(store, 'taro@client.example', { name: '見本 太郎', title: '課長' });
    await updateContact(store, 'taro@client.example', { title: '' });
    const contact = await store.getContact('taro@client.example');
    expect(contact?.name).toBe('見本 太郎');
    expect(contact).not.toHaveProperty('title');
  });

  it('記録に無いアドレスは編集しない', async () => {
    expect(await updateContact(store, 'nobody@client.example', { name: 'x' })).toBe(false);
    expect(await store.getContact('nobody@client.example')).toBeUndefined();
  });

  it('入力は、制御文字を除き、長さを制限する', () => {
    expect(cleanField('  見本\n太郎\t ')).toBe('見本 太郎');
    expect(cleanField('あ'.repeat(MAX_FIELD_LENGTH + 20))).toHaveLength(MAX_FIELD_LENGTH);
  });

  it('送信を記録し直しても、登録した氏名や会社名は消えない', async () => {
    await updateContact(store, 'taro@client.example', { name: '見本 太郎' });
    await updateCompany(store, 'client.example', { name: '株式会社サンプル', aliases: [] }, NOW);
    await recordSend(store, send('2026-11-15T00:00:00.000Z', ['taro@client.example']));
    expect(await store.getContact('taro@client.example')).toMatchObject({
      name: '見本 太郎',
      toCount: 2,
      lastAt: '2026-11-15T00:00:00.000Z',
    });
    expect(await store.getCompany('client.example')).toMatchObject({
      name: '株式会社サンプル',
      lastAt: '2026-11-15T00:00:00.000Z',
    });
  });

  it('ドメインに会社名と別名を付けられる。別名は重複と会社名そのものを除く', async () => {
    await updateCompany(
      store,
      'client.example',
      { name: '株式会社サンプル', aliases: ['サンプル', ' サンプル ', '', '株式会社サンプル'] },
      NOW,
    );
    expect(await store.getCompany('client.example')).toMatchObject({
      name: '株式会社サンプル',
      aliases: ['サンプル'],
      confirmed: true,
    });
  });

  it('送ったことのないドメインに会社名を付けても、「送ったことがある」扱いにしない', async () => {
    await updateCompany(store, 'new.example', { name: '新規商事', aliases: [] }, NOW);
    const before = await lookupLedger(store, { companies: ['new.example'], toAddresses: [] });
    expect(before.knownCompanies).toEqual([]);
    expect(before.companyNames).toEqual({ 'new.example': '新規商事' });

    await recordSend(store, send('2026-11-16T00:00:00.000Z', ['a@new.example']));
    const after = await lookupLedger(store, { companies: ['new.example'], toAddresses: [] });
    expect(after.knownCompanies).toEqual(['new.example']);
    expect(after.companyNames).toEqual({ 'new.example': '新規商事' });
  });

  it('連絡先を削除すると、その相手に関する Cc の記録も消える', async () => {
    await store.deleteContact('hana@partner.example');
    expect(await store.getContact('hana@partner.example')).toBeUndefined();
    expect(await store.listCcPairs('taro@client.example')).toEqual([]);
    expect(await store.getContact('taro@client.example')).toBeDefined();
  });

  it('会社の最後の連絡先を削除すると、会社の記録も消える（次は、初めて送るドメインになる）', async () => {
    await recordSend(
      store,
      send('2026-11-16T00:00:00.000Z', ['a@two.example', 'b@two.example', 'c@one.example']),
    );
    await updateCompany(store, 'one.example', { name: '一人商事', aliases: [] }, NOW);
    await updateCompany(store, 'two.example', { name: '二人商事', aliases: [] }, NOW);

    await store.deleteContact('a@two.example');
    expect(await store.getCompany('two.example')).toMatchObject({ name: '二人商事' });

    await store.deleteContact('c@one.example');
    expect(await store.getCompany('one.example')).toBeUndefined();
    const insight = await lookupLedger(store, {
      companies: ['one.example', 'two.example'],
      toAddresses: [],
    });
    expect(insight.knownCompanies).toEqual(['two.example']);
    expect(insight.companyNames).toEqual({ 'two.example': '二人商事' });
  });
});

describe('会社ごとのまとめと検索', () => {
  beforeEach(async () => {
    await updateCompany(
      store,
      'client.example',
      { name: '株式会社サンプル', aliases: ['SMP'] },
      NOW,
    );
    await updateContact(store, 'taro@client.example', { name: '見本 太郎', department: '営業部' });
  });

  it('会社 → ドメイン → 人物にまとめる。会社名が無ければドメインやアドレスで表示する', async () => {
    const directory = await directoryOf(store);
    expect(directory.map((company) => [company.label, company.named, company.domains])).toEqual([
      ['free@gmail.com', false, []],
      ['partner.example', false, ['partner.example']],
      ['株式会社サンプル', true, ['client.example']],
    ]);
    const sample = directory.find((company) => company.label === '株式会社サンプル');
    // 最終やりとり日の新しい順
    expect(sample?.people.map((person) => person.address)).toEqual([
      'jiro@client.example',
      'taro@client.example',
    ]);
    expect(sample?.people[1]).toMatchObject({
      name: '見本 太郎',
      department: '営業部',
      role: 'to',
      confirmed: true,
    });
    expect(sample?.aliases).toEqual(['SMP']);
  });

  it('同じ会社名を付けたドメインは、1つの会社にまとめる', async () => {
    await updateCompany(store, 'partner.example', { name: '(株)サンプル', aliases: [] }, NOW);
    const directory = await directoryOf(store);
    const sample = directory.find((company) => company.named);
    expect(sample?.domains).toEqual(['client.example', 'partner.example']);
    expect(sample?.people).toHaveLength(3);
  });

  it('連絡先ごとの会社名は、ドメインの会社名より優先する', async () => {
    await updateContact(store, 'jiro@client.example', { companyName: '別会社' });
    await updateContact(store, 'free@gmail.com', { companyName: '個人商店' });
    const labels = (await directoryOf(store)).map((company) => company.label);
    expect(labels).toContain('別会社');
    expect(labels).toContain('個人商店');
    expect(labels).not.toContain('free@gmail.com');
  });

  it('よく同席する別会社を表示する', async () => {
    const sample = (await directoryOf(store)).find((company) => company.named);
    expect(sample?.related).toEqual(['partner.example']);
  });

  it('会社名・別名・ドメインで検索すると、その会社の全員を返す', async () => {
    const directory = await directoryOf(store);
    for (const query of [
      'サンプル',
      '株式会社 サンプル',
      '（株）サンプル',
      'smp',
      'CLIENT.example',
    ]) {
      const found = searchDirectory(directory, query);
      expect(found.map((company) => company.label)).toEqual(['株式会社サンプル']);
      expect(found[0]?.people).toHaveLength(2);
    }
  });

  it('氏名・アドレス・部署で検索すると、一致した人物だけを返す', async () => {
    const directory = await directoryOf(store);
    for (const query of ['見本太郎', 'taro@', '営業']) {
      const found = searchDirectory(directory, query);
      expect(found).toHaveLength(1);
      expect(found[0]?.people.map((person) => person.address)).toEqual(['taro@client.example']);
    }
    expect(searchDirectory(directory, 'free@gmail')[0]?.label).toBe('free@gmail.com');
  });

  it('検索語が空、または一致が無ければ、何も返さない', async () => {
    const directory = await directoryOf(store);
    expect(searchDirectory(directory, '  ')).toEqual([]);
    expect(searchDirectory(directory, '存在しない会社')).toEqual([]);
  });

  it('会社名の比較では「株式会社」などの語と、全角・半角の違いを無視する', () => {
    expect(companySearchKey('株式会社 サンプル')).toBe(companySearchKey('（株）ｻﾝﾌﾟﾙ'));
    expect(companySearchKey('Sample Inc.')).toBe('sample');
    expect(companySearchKey('株式会社')).toBe('株式会社');
  });
});

describe('CSV の書き出しと取り込み', () => {
  it('書き出した CSV を読み直すと、同じ内容になる', async () => {
    await updateCompany(store, 'client.example', { name: '株式会社サンプル', aliases: [] }, NOW);
    await updateContact(store, 'taro@client.example', {
      name: '見本, "太郎"',
      department: '営業部',
      phone: '+81-3-0000-0000',
    });
    const csv = toCsv(await store.listContacts(), await store.listCompanies());
    expect(csv.startsWith('﻿"メールアドレス","氏名","会社名"')).toBe(true);
    // 数式として実行されないよう、+ で始まる値には ' を付けて書き出す
    expect(csv).toContain(`"'+81-3-0000-0000"`);
    // 回数は書き出さない
    expect(csv).not.toMatch(/toCount|回数/u);

    const parsed = parseCsv(csv);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.skipped).toBe(0);
    expect(parsed.rows.find((row) => row.address === 'taro@client.example')).toEqual({
      address: 'taro@client.example',
      name: '見本, "太郎"',
      companyName: '株式会社サンプル',
      department: '営業部',
      title: '',
      phone: '+81-3-0000-0000',
      mobile: '',
    });
  });

  it('" で囲んだ値の中のカンマ・改行・"" を読める', () => {
    expect(splitCsv('a,"b,1","c ""x"""\r\n"d\ne",f,\n\n')).toEqual([
      ['a', 'b,1', 'c "x"'],
      ['d\ne', 'f', ''],
    ]);
  });

  it('列の順番が違っても、英語の見出しでも読める。余分な列は無視する', () => {
    const parsed = parseCsv('Name,memo,Email\n見本 花子,x,Hana@Client.Example\n');
    expect(parsed).toEqual({
      ok: true,
      skipped: 0,
      rows: [
        {
          address: 'hana@client.example',
          name: '見本 花子',
          companyName: '',
          department: '',
          title: '',
          phone: '',
          mobile: '',
        },
      ],
    });
  });

  it('アドレスの形が正しくない行と、重複した行は読み飛ばす', () => {
    const parsed = parseCsv(
      'メールアドレス,氏名\nnot-an-address,x\na@client.example,A\nA@client.example,B\n',
    );
    expect(parsed.ok && parsed.rows.map((row) => row.name)).toEqual(['A']);
    expect(parsed.ok && parsed.skipped).toBe(2);
  });

  it('メールアドレスの列が無い CSV と、大きすぎる CSV は受け付けない', () => {
    expect(parseCsv('氏名,会社名\nx,y\n')).toEqual({ ok: false, reason: 'noHeader' });
    expect(parseCsv('')).toEqual({ ok: false, reason: 'noHeader' });
    const many = Array.from(
      { length: MAX_IMPORT_ROWS + 1 },
      (_, index) => `a${String(index)}@client.example`,
    );
    expect(parseCsv(`address\n${many.join('\n')}\n`)).toEqual({ ok: false, reason: 'tooLarge' });
  });

  it('取り込みで、新しい連絡先を追加し、すでにある連絡先は値のある項目だけ上書きする', async () => {
    await updateContact(store, 'taro@client.example', { name: '見本 太郎', title: '課長' });
    const result = await importRows(
      store,
      [
        {
          address: 'taro@client.example',
          name: '',
          companyName: '株式会社サンプル',
          department: '営業部',
          title: '',
          phone: '',
          mobile: '',
        },
        {
          address: 'new@other.example',
          name: '新規 一郎',
          companyName: '新規商事',
          department: '',
          title: '',
          phone: '',
          mobile: '',
        },
      ],
      NOW,
    );
    expect(result).toEqual({ added: 1, updated: 1 });
    expect(await store.getContact('taro@client.example')).toMatchObject({
      name: '見本 太郎',
      title: '課長',
      department: '営業部',
      toCount: 1,
    });
    expect(await store.getContact('new@other.example')).toMatchObject({
      name: '新規 一郎',
      toCount: 0,
      ccCount: 0,
      lastAt: NOW,
      confirmed: true,
    });
    expect((await store.getCompany('client.example'))?.name).toBe('株式会社サンプル');
    // 取り込んだだけのドメインは「送ったことがある」扱いにしない
    const insight = await lookupLedger(store, { companies: ['other.example'], toAddresses: [] });
    expect(insight.knownCompanies).toEqual([]);
    expect(insight.companyNames).toEqual({ 'other.example': '新規商事' });
  });

  it('会社名が、ドメインの会社名と違う場合と、フリーメールの相手は、連絡先ごとの会社名にする', async () => {
    await updateCompany(store, 'client.example', { name: '株式会社サンプル', aliases: [] }, NOW);
    const row = { name: '', department: '', title: '', phone: '', mobile: '' };
    await importRows(
      store,
      [
        { ...row, address: 'taro@client.example', companyName: '(株)サンプル' },
        { ...row, address: 'jiro@client.example', companyName: '別会社' },
        { ...row, address: 'free@gmail.com', companyName: '個人商店' },
      ],
      NOW,
    );
    expect(await store.getContact('taro@client.example')).not.toHaveProperty('companyName');
    expect((await store.getContact('jiro@client.example'))?.companyName).toBe('別会社');
    expect((await store.getContact('free@gmail.com'))?.companyName).toBe('個人商店');
    expect(await store.getCompany('free@gmail.com')).toMatchObject({
      companyKey: 'free@gmail.com',
    });
    expect((await store.getCompany('free@gmail.com'))?.name).toBeUndefined();
  });
});

describe('台帳の画面・ポップアップからの依頼（background）', () => {
  const now = new Date(NOW);

  it('一覧・編集・削除・取り込みを処理する', async () => {
    const list = await handleLedgerMessage(store, { type: 'ledger/list' }, now);
    expect(list).toMatchObject({ ok: true });
    expect(list.ok && (list.value as { contacts: unknown[] }).contacts).toHaveLength(4);

    expect(
      await handleLedgerMessage(
        store,
        { type: 'ledger/updateContact', address: 'Taro@Client.Example', edit: { name: '太郎' } },
        now,
      ),
    ).toEqual({ ok: true, value: true });
    expect(
      await handleLedgerMessage(
        store,
        {
          type: 'ledger/updateCompany',
          companyKey: 'client.example',
          edit: { name: '株式会社サンプル', aliases: [] },
        },
        now,
      ),
    ).toEqual({ ok: true, value: null });
    expect(
      await handleLedgerMessage(
        store,
        { type: 'ledger/deleteContact', address: 'jiro@client.example' },
        now,
      ),
    ).toEqual({ ok: true, value: null });
    expect(await store.getContact('jiro@client.example')).toBeUndefined();
    expect((await store.getContact('taro@client.example'))?.name).toBe('太郎');
  });

  it('取り込む行は、background でも確かめ直す', async () => {
    const rows = [
      { address: 'ok@other.example', name: '可', companyName: 3 },
      { address: 'broken', name: 'x' },
      null,
      'text',
    ];
    const response = await handleLedgerMessage(
      store,
      { type: 'ledger/import', rows: rows as never },
      now,
    );
    expect(response).toEqual({ ok: true, value: { added: 1, updated: 0 } });
    expect(await store.getContact('ok@other.example')).toMatchObject({ name: '可' });
    expect(await store.getContact('broken')).toBeUndefined();
  });
});

describe('確認ダイアログでの会社名の表示', () => {
  it('台帳に会社名があれば、会社ごとの人数に会社名を付ける', () => {
    const model = buildConfirmationModel(
      snapshot({
        recipients: [recipient('taro@client.example'), recipient('hana@partner.example', 'cc')],
      }),
      DEFAULT_SETTINGS,
      {
        totalSends: 50,
        knownCompanies: ['client.example', 'partner.example'],
        ccHistory: [],
        companyNames: { 'client.example': '株式会社サンプル' },
      },
    );
    expect(model.externalCompanies).toEqual([
      { companyKey: 'client.example', count: 1, name: '株式会社サンプル' },
      { companyKey: 'partner.example', count: 1 },
    ]);
  });
});
