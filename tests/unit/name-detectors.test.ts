import { beforeEach, describe, expect, it } from 'vitest';
import { attachmentCompanyDetector } from '../../src/core/detectors/attachment-company';
import { companyNotationDetector } from '../../src/core/detectors/company-notation';
import { otherCompanyInBodyDetector } from '../../src/core/detectors/other-company-in-body';
import { salutationMismatchDetector } from '../../src/core/detectors/salutation-mismatch';
import { updateCompany, updateContact } from '../../src/core/ledger/directory';
import {
  type LedgerInsight,
  type LedgerStore,
  createMemoryLedgerStore,
  lookupLedger,
  recordSend,
} from '../../src/core/ledger/ledger';
import { readSalutation } from '../../src/core/text/salutation';
import type { Recipient } from '../../src/core/types';
import { context, snapshot } from './helpers';

function insight(overrides: Partial<LedgerInsight> = {}): LedgerInsight {
  return { totalSends: 50, knownCompanies: [], ccHistory: [], ...overrides };
}

function to(address: string, displayName?: string): Recipient {
  return displayName === undefined
    ? { address, field: 'to' }
    : { address, field: 'to', displayName };
}

describe('宛名の読み取り', () => {
  it('敬称の付いた名前と、会社名の行を読み取る', () => {
    expect(readSalutation('株式会社サンプル\n営業部 見本様\n\nお世話になっております。')).toEqual({
      names: [['見本']],
      companyLine: '株式会社サンプル',
      generic: false,
    });
    expect(readSalutation('\n見本 太郎 様、試験さん\nお世話になっております。')).toEqual({
      names: [['太郎'], ['試験']],
      generic: false,
    });
  });

  it('名前の後ろの役職は取り除く', () => {
    expect(readSalutation('見本部長様\n').names).toEqual([['見本']]);
    expect(readSalutation('株式会社サンプル 代表取締役社長 見本様').names).toEqual([['見本']]);
  });

  it('特定の人を指さない宛名は、名前として扱わない', () => {
    expect(readSalutation('株式会社サンプル\nご担当者様')).toEqual({
      names: [],
      companyLine: '株式会社サンプル',
      generic: true,
    });
    expect(readSalutation('皆様\n').generic).toBe(true);
    expect(readSalutation('株式会社サンプル 営業部御中').companyLine).toBe(
      '株式会社サンプル 営業部御中',
    );
  });

  it('文が始まったら、そこから先は宛名として読まない', () => {
    expect(readSalutation('お世話になっております。\n見本様からご紹介いただきました')).toEqual({
      names: [],
      generic: false,
    });
    expect(readSalutation('株式会社サンプルの見本です。\n試験様')).toEqual({
      names: [],
      generic: false,
    });
    expect(readSalutation('')).toEqual({ names: [], generic: false });
  });
});

describe('宛名と宛先の照合', () => {
  const detect = (bodyText: string, recipients: Recipient[], ledger: LedgerInsight | undefined) =>
    salutationMismatchDetector.detect(
      snapshot({ bodyText, recipients }),
      context(ledger === undefined ? {} : { ledger }),
    );
  const body = (salutation: string) => `${salutation}\n\nお世話になっております。`;

  it('宛名の名前が、どの宛先の名前にも無ければ検知する', () => {
    expect(detect(body('試験様'), [to('taro@client.example', '見本 太郎')], insight())).toEqual([
      {
        detectorId: 'salutation-mismatch',
        messageKey: 'detectSalutationName',
        substitutions: ['試験', '見本 太郎'],
      },
    ]);
  });

  it('宛名の名前が宛先の名前（姓・名のどちらか、空白の有無は問わない）に含まれれば検知しない', () => {
    const recipients = [to('taro@client.example', '見本　太郎')];
    expect(detect(body('見本様'), recipients, insight())).toEqual([]);
    expect(detect(body('見本 太郎 様'), recipients, insight())).toEqual([]);
    expect(detect(body('見本部長様'), recipients, insight())).toEqual([]);
  });

  it('Cc の人に宛てた宛名も、一致とみなす', () => {
    const recipients: Recipient[] = [
      to('taro@client.example', '見本 太郎'),
      { address: 'hana@client.example', field: 'cc', displayName: '試験 花子' },
    ];
    expect(detect(body('見本様、試験様'), recipients, insight())).toEqual([]);
    expect(detect(body('試験様'), recipients, insight())).toEqual([]);
  });

  it('台帳に登録した氏名を、宛先欄の表示名より優先する', () => {
    const ledger = insight({ recipientNames: { 'taro@client.example': '見本 太郎' } });
    expect(detect(body('見本様'), [to('Taro@Client.Example', 'Taro Mihon')], ledger)).toEqual([]);
    expect(
      detect(body('試験様'), [to('taro@client.example', 'Taro Mihon')], ledger)[0]?.substitutions,
    ).toEqual(['試験', '見本 太郎']);
  });

  it('名前が分からない To の宛先がいれば、名前は照合しない', () => {
    // 表示名が無い、アドレスがそのまま入っている、ローマ字で比べられない
    expect(detect(body('試験様'), [to('taro@client.example')], insight())).toEqual([]);
    expect(
      detect(body('試験様'), [to('taro@client.example', 'taro@client.example')], insight()),
    ).toEqual([]);
    expect(detect(body('試験様'), [to('taro@client.example', 'Taro Mihon')], insight())).toEqual(
      [],
    );
    expect(
      detect(
        body('試験様'),
        [to('taro@client.example', '見本 太郎'), to('x@client.example')],
        insight(),
      ),
    ).toEqual([]);
  });

  it('特定の人を指さない宛名や、宛名の無い本文は照合しない', () => {
    const recipients = [to('taro@client.example', '見本 太郎')];
    expect(detect(body('ご担当者様'), recipients, insight())).toEqual([]);
    expect(detect(body('皆様'), recipients, insight())).toEqual([]);
    expect(detect('お世話になっております。', recipients, insight())).toEqual([]);
  });

  it('宛名の会社名が、To の宛先の会社と違えば検知する', () => {
    const ledger = insight({
      recipientCompanyNames: { 'taro@client.example': ['株式会社サンプル', 'SMP'] },
    });
    const recipients = [to('taro@client.example', '見本 太郎')];
    expect(detect(body('試験商事株式会社\n見本様'), recipients, ledger)).toEqual([
      {
        detectorId: 'salutation-mismatch',
        messageKey: 'detectSalutationCompany',
        substitutions: ['試験商事株式会社', '株式会社サンプル'],
      },
    ]);
    // 登録した名前・別名・書き方の違い（（株））は、同じ会社とみなす
    expect(detect(body('株式会社サンプル 営業部\n見本様'), recipients, ledger)).toEqual([]);
    expect(detect(body('（株）サンプル 見本様'), recipients, ledger)).toEqual([]);
    expect(detect(body('SMP 株式会社 御中'), recipients, ledger)).toEqual([]);
  });

  it('会社名が分からない To の宛先がいれば、会社名は照合しない', () => {
    const ledger = insight({
      recipientCompanyNames: { 'taro@client.example': ['株式会社サンプル'] },
    });
    expect(
      detect(
        body('試験商事株式会社 御中'),
        [to('taro@client.example'), to('x@unknown.example')],
        ledger,
      ),
    ).toEqual([]);
  });

  it('台帳の情報が無いとき、To が無いときは検知しない', () => {
    expect(detect(body('試験様'), [to('taro@client.example', '見本 太郎')], undefined)).toEqual([]);
    expect(detect(body('試験様'), [], insight())).toEqual([]);
  });
});

describe('宛先に無い会社名（本文・添付ファイル名）', () => {
  const ledger = insight({
    recipientCompanyNames: { 'taro@client.example': ['株式会社サンプル商事'] },
    otherCompanyNames: ['試験工業株式会社', 'ABC', '株式会社サンプル', '株式会社 東'],
  });
  const recipients = [to('taro@client.example')];
  const inBody = (snap: Parameters<typeof snapshot>[0], insightValue: LedgerInsight | undefined) =>
    otherCompanyInBodyDetector.detect(
      snapshot({ recipients, ...snap }),
      context(insightValue === undefined ? {} : { ledger: insightValue }),
    );

  it('本文や件名に、宛先ではない会社名があれば検知する', () => {
    expect(inBody({ bodyText: '試験工業 様向けのお見積りです。' }, ledger)).toEqual([
      {
        detectorId: 'other-company-in-body',
        messageKey: 'detectOtherCompanyInBody',
        substitutions: ['試験工業株式会社'],
      },
    ]);
    expect(inBody({ subject: '（株）試験工業の件' }, ledger)).toHaveLength(1);
    expect(inBody({ bodyText: 'ａｂｃ社の資料です' }, ledger)[0]?.substitutions).toEqual(['ABC']);
  });

  it('宛先の会社名の一部になっている名前は検知しない', () => {
    // 「サンプル」は、宛先の「サンプル商事」の一部
    expect(inBody({ bodyText: '株式会社サンプル商事 御中' }, ledger)).toEqual([]);
  });

  it('短い会社名は、登録した名前がそのまま書かれているときだけ検知する', () => {
    expect(inBody({ bodyText: '東京の東側にあります。' }, ledger)).toEqual([]);
    expect(inBody({ bodyText: '株式会社東の資料です。' }, ledger)[0]?.substitutions).toEqual([
      '株式会社 東',
    ]);
  });

  it('他社名が無いとき、台帳の情報が無いとき、会社名の登録が無いときは検知しない', () => {
    expect(inBody({ bodyText: 'お世話になっております。' }, ledger)).toEqual([]);
    expect(inBody({ bodyText: '試験工業の件' }, undefined)).toEqual([]);
    expect(inBody({ bodyText: '試験工業の件' }, insight())).toEqual([]);
  });

  it('添付ファイルの名前に、宛先ではない会社名があれば、ファイルごとに検知する', () => {
    const detect = (fileNames: string[]) =>
      attachmentCompanyDetector.detect(
        snapshot({ recipients, attachments: fileNames.map((fileName) => ({ fileName })) }),
        context({ ledger }),
      );
    expect(detect(['見積書_試験工業様.pdf', '見積書_サンプル商事様.pdf'])).toEqual([
      {
        detectorId: 'attachment-company',
        messageKey: 'detectAttachmentCompany',
        substitutions: ['見積書_試験工業様.pdf', '試験工業株式会社'],
      },
    ]);
    expect(detect(['estimate_abc.pdf'])).toHaveLength(1);
    expect(detect(['見積書.pdf'])).toEqual([]);
    expect(detect([])).toEqual([]);
  });
});

describe('社名表記', () => {
  const ledger = insight({
    recipientCompanyNames: {
      'taro@client.example': ['株式会社サンプル', 'サンプル'],
      'hana@partner.example': ['試験工業株式会社'],
    },
  });
  const detect = (bodyText: string, insightValue: LedgerInsight | null = ledger) =>
    companyNotationDetector.detect(
      snapshot({
        bodyText,
        recipients: [to('taro@client.example'), to('hana@partner.example')],
      }),
      context(insightValue === null ? {} : { ledger: insightValue }),
    );

  it('前株・後株の誤りを検知する', () => {
    expect(detect('サンプル株式会社\n見本様')).toEqual([
      {
        detectorId: 'company-notation',
        messageKey: 'detectCompanyNotation',
        substitutions: ['サンプル株式会社', '株式会社サンプル'],
      },
    ]);
    expect(detect('株式会社 試験工業 御中')[0]?.substitutions).toEqual([
      '株式会社試験工業',
      '試験工業株式会社',
    ]);
  });

  it('略した書き方（（株）、㈱）を検知する', () => {
    expect(detect('（株）サンプル 見本様')[0]?.substitutions).toEqual([
      '(株)サンプル',
      '株式会社サンプル',
    ]);
    expect(detect('㈱サンプル 見本様')).toHaveLength(1);
    expect(detect('試験工業(株) 御中')[0]?.substitutions).toEqual([
      '試験工業(株)',
      '試験工業株式会社',
    ]);
  });

  it('登録どおりの書き方、会社名だけの書き方は検知しない', () => {
    expect(detect('株式会社サンプル\n見本様')).toEqual([]);
    expect(detect('株式会社 サンプル 見本様、試験工業株式会社 試験様')).toEqual([]);
    expect(detect('サンプルの見本様')).toEqual([]);
    expect(detect('株式会社サンプル株式会社試験の件')).toEqual([]);
  });

  it('台帳の情報が無いときは検知しない', () => {
    expect(detect('サンプル株式会社', null)).toEqual([]);
    expect(detect('サンプル株式会社', insight())).toEqual([]);
  });
});

describe('台帳からの氏名・会社名の読み取り', () => {
  let store: LedgerStore;
  const NOW = '2026-11-20T10:00:00.000Z';
  const sent = (address: string) => ({
    at: NOW,
    recipients: [
      {
        address,
        field: 'to' as const,
        companyKey: address.endsWith('@gmail.com') ? address : (address.split('@')[1] ?? ''),
        internal: false,
      },
    ],
  });

  beforeEach(async () => {
    store = createMemoryLedgerStore();
    for (const address of ['taro@client.example', 'hana@partner.example', 'free@gmail.com']) {
      await recordSend(store, sent(address));
    }
    await updateCompany(
      store,
      'client.example',
      { name: '株式会社サンプル', aliases: ['SMP'] },
      NOW,
    );
    await updateCompany(store, 'partner.example', { name: '試験工業株式会社', aliases: [] }, NOW);
    await updateContact(store, 'taro@client.example', { name: '見本 太郎' });
    await updateContact(store, 'free@gmail.com', { companyName: '個人商店' });
  });

  it('宛先の氏名・会社名と、宛先ではない会社名を返す', async () => {
    const result = await lookupLedger(store, {
      companies: ['client.example'],
      toAddresses: ['taro@client.example'],
      addresses: ['taro@client.example', 'new@client.example'],
    });
    expect(result.recipientNames).toEqual({ 'taro@client.example': '見本 太郎' });
    expect(result.recipientCompanyNames).toEqual({
      'taro@client.example': ['株式会社サンプル', 'SMP'],
      // 記録に無い相手でも、ドメインに会社名があれば分かる
      'new@client.example': ['株式会社サンプル', 'SMP'],
    });
    expect(result.otherCompanyNames).toEqual(['試験工業株式会社', '個人商店']);
  });

  it('連絡先ごとの会社名は、その人だけに使う', async () => {
    const result = await lookupLedger(store, {
      companies: [],
      toAddresses: [],
      addresses: ['free@gmail.com'],
    });
    expect(result.recipientCompanyNames).toEqual({ 'free@gmail.com': ['個人商店'] });
    expect(result.otherCompanyNames).toEqual(['株式会社サンプル', 'SMP', '試験工業株式会社']);
  });

  it('アドレスを渡さない問い合わせでは、氏名・会社名を読まない', async () => {
    const result = await lookupLedger(store, { companies: [], toAddresses: [] });
    expect(result.recipientNames).toBeUndefined();
    expect(result.otherCompanyNames).toBeUndefined();
  });
});
