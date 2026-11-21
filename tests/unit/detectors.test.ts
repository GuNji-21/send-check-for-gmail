import { describe, expect, it } from 'vitest';
import { attachmentMissingDetector } from '../../src/core/detectors/attachment-missing';
import { dateWeekdayMismatchDetector } from '../../src/core/detectors/date-weekday-mismatch';
import { DETECTORS, runDetectors } from '../../src/core/detectors/index';
import { DEFAULT_SETTINGS } from '../../src/storage/settings';
import { multipleExternalCompaniesDetector } from '../../src/core/detectors/multiple-external-companies';
import { placeholderDetector } from '../../src/core/detectors/placeholder';
import { subjectEmptyDetector } from '../../src/core/detectors/subject-empty';
import type { Detector, WarningLevels } from '../../src/core/types';
import { context, recipient, rules, snapshot } from './helpers';

const LEVELS: WarningLevels = {
  'attachment-missing': 'warn',
  placeholder: 'warn',
  'date-weekday-mismatch': 'warn',
  'subject-empty': 'warn',
  'multiple-external-companies': 'warn',
};

describe('添付漏れ', () => {
  const detect = (snap: Parameters<typeof snapshot>[0], ctx: Parameters<typeof context>[0] = {}) =>
    attachmentMissingDetector.detect(snapshot(snap), context(ctx));

  it('本文にキーワードがあり、添付が無ければ検知する', () => {
    expect(detect({ bodyText: '見積書を添付いたします。' })).toEqual([
      {
        detectorId: 'attachment-missing',
        messageKey: 'detectAttachmentMissing',
        substitutions: ['添付、見積書'],
      },
    ]);
  });

  it('大文字・小文字、全角・半角を区別しない', () => {
    expect(detect({ bodyText: 'Please see the ATTACHED file.' })).toHaveLength(1);
    expect(detect({ bodyText: 'ＰＤＦをお送りします' })).toHaveLength(1);
  });

  it('「添付」と「添付ファイル」のように重なる語は1つにまとめる', () => {
    expect(detect({ bodyText: '添付ファイルをご確認ください' })[0]?.substitutions).toEqual([
      '添付',
    ]);
  });

  it('添付があれば検知しない', () => {
    expect(
      detect({ bodyText: '見積書を添付します', attachments: [{ fileName: 'estimate.pdf' }] }),
    ).toEqual([]);
  });

  it('キーワードが無ければ検知しない', () => {
    expect(detect({ bodyText: 'お世話になっております。' })).toEqual([]);
  });

  it('ドライブのリンクを添付とみなす設定なら、リンクがあれば検知しない', () => {
    expect(detect({ bodyText: '資料を添付します', driveLinkCount: 1 })).toEqual([]);
  });

  it('ドライブのリンクを添付とみなさない設定なら、リンクがあっても検知する', () => {
    expect(
      detect(
        { bodyText: '資料を添付します', driveLinkCount: 1 },
        { treatDriveLinksAsAttachment: false },
      ),
    ).toHaveLength(1);
  });

  describe('初期値のキーワードでの判定', () => {
    const withDefaults = (bodyText: string) =>
      attachmentMissingDetector.detect(
        snapshot({ bodyText }),
        context({ attachmentKeywords: DEFAULT_SETTINGS.attachmentKeywords }),
      );

    it.each([
      '資料を送付します。',
      '資料を送付いたします。',
      '見積書をご送付いたします。',
      '添付ファイルをご確認ください。',
      '別紙のとおりです。',
      '資料を同封しました。',
      'ファイルをお送りします。',
      'ご査収のほどお願いいたします。',
      '請求書を添付しております。',
      'Please find the enclosed document.',
      'I have attached the file.',
    ])('自分が添付・送付する文は検知する：%s', (body) => {
      expect(withDefaults(body)).toHaveLength(1);
    });

    it.each([
      '請求書を送付してください。',
      '請求書のご送付をお願いします。',
      'ご送付いただいた資料を確認しました。',
      '資料を添付いただき、ありがとうございます。',
      '書類をお送りいただけますと幸いです。',
      '今回は添付ファイルはありません。',
      '添付なしで失礼します。',
      '資料の添付は不要です。',
      'お世話になっております。よろしくお願いいたします。',
    ])('相手への依頼・お礼・添付なしの文は検知しない：%s', (body) => {
      expect(withDefaults(body)).toEqual([]);
    });

    it('依頼の文と、自分が添付する文が両方ある場合は検知する', () => {
      expect(
        withDefaults('請求書を送付してください。\nこちらからは見積書を添付します。'),
      ).toHaveLength(1);
    });
  });

  it('キーワードを空にすると検知しない', () => {
    expect(detect({ bodyText: '資料を添付します' }, { attachmentKeywords: [] })).toEqual([]);
  });
});

describe('プレースホルダー', () => {
  const found = (subject: string, bodyText: string) =>
    placeholderDetector.detect(snapshot({ subject, bodyText }), context())[0]?.substitutions?.[0];

  it('〇〇・●●・XX・【 】・{name} を検知する', () => {
    expect(found('件名', '〇〇様')).toBe('〇〇');
    expect(found('件名', '○○株式会社 ●●様')).toBe('○○、●●');
    expect(found('件名', '担当：XX')).toBe('XX');
    expect(found('件名', '日時：【 】')).toBe('【 】');
    expect(found('件名', '{name} 様、{{company}} 御中')).toBe('{name}、{{company}}');
    expect(found('件名', '△△部 □□課')).toBe('△△、□□');
  });

  it('件名に残っている場合も検知する', () => {
    expect(found('【〇〇】のご案内', '本文です')).toBe('〇〇');
  });

  it('同じ記号は1回だけ挙げる', () => {
    expect(found('件名', '〇〇様\n〇〇の件')).toBe('〇〇');
  });

  it('プレースホルダーでないものは検知しない', () => {
    for (const body of [
      'お世話になっております。',
      'サイズは XXL です',
      '型番 MAXX-100',
      '【重要】ご確認ください',
      '結果は ○ でした',
      '第X回の会議',
    ]) {
      expect(placeholderDetector.detect(snapshot({ bodyText: body }), context()), body).toEqual([]);
    }
  });
});

describe('日付と曜日の不一致', () => {
  // capturedAt は 2026年11月20日（金）
  const detect = (bodyText: string, subject = '件名') =>
    dateWeekdayMismatchDetector.detect(snapshot({ bodyText, subject }), context());
  const mismatch = (written: string, actual: string) => ({
    detectorId: 'date-weekday-mismatch',
    messageKey: 'detectDateWeekdayMismatch',
    substitutions: [written, actual],
  });

  it('曜日が違えば検知する', () => {
    expect(detect('11月13日（木）にお伺いします')).toEqual([mismatch('11月13日(木)', '金')]);
  });

  it('曜日が合っていれば検知しない', () => {
    expect(detect('11月13日（金）にお伺いします')).toEqual([]);
    expect(detect('2026年11月20日(金曜日) 10時')).toEqual([]);
    expect(detect('11/24(火)・11/25（水）のいずれか')).toEqual([]);
  });

  it('スラッシュ区切り・年付き・全角数字の表記も読む', () => {
    expect(detect('11/24(月)')).toEqual([mismatch('11/24(月)', '火')]);
    expect(detect('2026/11/24(月)')).toEqual([mismatch('2026/11/24(月)', '火')]);
    expect(detect('１１月２４日（月）')).toEqual([mismatch('11月24日(月)', '火')]);
  });

  it('年が無い場合は、送信日にいちばん近い年の日付とみなす', () => {
    // 2027年1月8日は金曜日（2026年1月8日は木曜日）
    expect(detect('1月8日（金）')).toEqual([]);
    expect(detect('1月8日（木）')).toEqual([mismatch('1月8日(木)', '金')]);
  });

  it('年が書かれていれば、その年で判定する', () => {
    // 2026年1月8日は木曜日
    expect(detect('2026年1月8日（木）')).toEqual([]);
  });

  it('存在しない日付を検知する', () => {
    expect(detect('2月30日（月）')).toEqual([
      {
        detectorId: 'date-weekday-mismatch',
        messageKey: 'detectDateInvalid',
        substitutions: ['2月30日(月)'],
      },
    ]);
  });

  it('件名の日付も調べ、同じ表記は1件にまとめる', () => {
    expect(detect('11月13日（木）の件です', '11月13日（木）のお打ち合わせ')).toHaveLength(1);
  });

  it('曜日の括弧が無い日付は対象にしない', () => {
    expect(detect('11月13日にお伺いします。(木)')).toEqual([]);
    expect(detect('11月13日 木曜日')).toEqual([]);
  });

  it('capturedAt が日時として読めない場合は例外を投げる（送信を止めるため）', () => {
    expect(() =>
      dateWeekdayMismatchDetector.detect(snapshot({ capturedAt: 'not a date' }), context()),
    ).toThrow();
  });
});

describe('件名が空', () => {
  it('空・空白だけの件名を検知する', () => {
    expect(subjectEmptyDetector.detect(snapshot({ subject: '' }), context())).toEqual([
      { detectorId: 'subject-empty', messageKey: 'detectSubjectEmpty' },
    ]);
    expect(subjectEmptyDetector.detect(snapshot({ subject: ' 　' }), context())).toHaveLength(1);
  });

  it('件名があれば検知しない', () => {
    expect(subjectEmptyDetector.detect(snapshot({ subject: 'Re: 件名' }), context())).toEqual([]);
  });
});

describe('複数社混在', () => {
  const detect = (addresses: string[], r = rules()) =>
    multipleExternalCompaniesDetector.detect(
      snapshot({ recipients: addresses.map((address) => recipient(address)) }),
      context({ rules: r }),
    );

  it('社外のドメインが2つ以上あれば検知する', () => {
    expect(detect(['a@client.example', 'b@other.example'])).toEqual([
      {
        detectorId: 'multiple-external-companies',
        messageKey: 'detectMultipleExternalCompanies',
        substitutions: ['2', 'client.example、other.example'],
      },
    ]);
  });

  it('社外が1社だけなら検知しない', () => {
    expect(detect(['a@client.example', 'b@client.example'])).toEqual([]);
  });

  it('社内（送信元と同じドメイン・社内として登録済み）は数えない', () => {
    expect(detect(['a@client.example', 'colleague@mycompany.example'])).toEqual([]);
    expect(
      detect(
        ['a@client.example', 'b@group.example'],
        rules({ internalDomains: ['group.example'] }),
      ),
    ).toEqual([]);
  });

  it('フリーメールはアドレスごとに別の相手として数える', () => {
    expect(detect(['a@gmail.com', 'b@gmail.com'])[0]?.substitutions?.[0]).toBe('2');
  });
});

describe('runDetectors', () => {
  it('オンの検知項目を登録順に実行する', () => {
    const results = runDetectors(
      snapshot({ subject: '', bodyText: '〇〇様 資料を添付します' }),
      context(),
      LEVELS,
    );
    expect(results.map((result) => result.detectorId)).toEqual([
      'subject-empty',
      'attachment-missing',
      'placeholder',
    ]);
  });

  it('オフの検知器は実行しない', () => {
    const results = runDetectors(snapshot({ subject: '' }), context(), {
      ...LEVELS,
      'subject-empty': 'off',
    });
    expect(results).toEqual([]);
  });

  it('問題が無ければ空配列を返す', () => {
    expect(runDetectors(snapshot(), context(), LEVELS)).toEqual([]);
  });

  it('検知器の例外は握りつぶさずに呼び出し元へ伝える', () => {
    const broken: Detector = {
      id: 'placeholder',
      detect() {
        throw new Error('boom');
      },
    };
    expect(() => runDetectors(snapshot(), context(), LEVELS, [broken])).toThrow('boom');
  });

  it('フェーズ1の5項目がすべて登録されている', () => {
    expect(DETECTORS.map((detector) => detector.id).sort()).toEqual(Object.keys(LEVELS).sort());
  });
});
