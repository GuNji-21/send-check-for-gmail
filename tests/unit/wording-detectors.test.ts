import { describe, expect, it } from 'vitest';
import { bodyEmptyDetector } from '../../src/core/detectors/body-empty';
import { customTypoDetector } from '../../src/core/detectors/custom-typo';
import { honorificDetector } from '../../src/core/detectors/honorific';
import { signatureMissingDetector } from '../../src/core/detectors/signature-missing';
import { widthMixDetector } from '../../src/core/detectors/width-mix';
import { formatTypoDictionary, parseTypoDictionary } from '../../src/options/form';
import {
  DEFAULT_SETTINGS,
  MAX_TYPO_DICTIONARY_ENTRIES,
  normalizeSettings,
} from '../../src/storage/settings';
import { context, snapshot } from './helpers';

describe('本文が空', () => {
  const detect = (bodyText: string) => bodyEmptyDetector.detect(snapshot({ bodyText }), context());

  it('本文が空、または空白と改行だけなら検知する', () => {
    expect(detect('')).toEqual([{ detectorId: 'body-empty', messageKey: 'detectBodyEmpty' }]);
    expect(detect(' \n　\n\t')).toHaveLength(1);
  });

  it('本文に文字があれば検知しない', () => {
    expect(detect('承知しました。')).toEqual([]);
  });
});

describe('敬称の誤り', () => {
  const detect = (bodyText: string) => honorificDetector.detect(snapshot({ bodyText }), context());
  const keys = (bodyText: string) => detect(bodyText).map((detection) => detection.messageKey);

  it('「各位」に敬称を重ねたものを検知する', () => {
    expect(detect('関係者各位様\n\nお世話になっております。')).toEqual([
      { detectorId: 'honorific', messageKey: 'detectHonorificKakui', substitutions: ['各位様'] },
    ]);
    expect(keys('お客様各位 殿')).toEqual(['detectHonorificKakui']);
    expect(keys('各位御中')).toContain('detectHonorificKakui');
  });

  it('「各位」だけなら検知しない', () => {
    expect(detect('関係者各位\n\nお世話になっております。')).toEqual([]);
    expect(detect('各位、ご確認をお願いします。')).toEqual([]);
  });

  it('同じ行での「御中」と「様」の併用を検知する', () => {
    expect(detect('株式会社サンプル御中 山田様\n\nお世話になっております。')).toEqual([
      {
        detectorId: 'honorific',
        messageKey: 'detectHonorificOnchuSama',
        substitutions: ['御中 山田様'],
      },
    ]);
    expect(keys('株式会社サンプル 営業部様御中')).toEqual(['detectHonorificOnchuSama']);
  });

  it('「御中」と「様」が別の行にあれば検知しない', () => {
    expect(detect('株式会社サンプル 営業部御中\n\n皆様にお知らせします。')).toEqual([]);
    expect(detect('株式会社サンプル\n山田様\n\nお世話になっております。')).toEqual([]);
  });

  it('会社名で始まる宛名に、敬称も役職も無ければ検知する', () => {
    expect(detect('株式会社サンプル\n山田\n\nお世話になっております。')).toEqual([
      {
        detectorId: 'honorific',
        messageKey: 'detectHonorificMissing',
        substitutions: ['株式会社サンプル'],
      },
    ]);
    expect(keys('\n（株）サンプル 山田\n\nお世話になっております。')).toEqual([
      'detectHonorificMissing',
    ]);
  });

  it('宛名に敬称や役職があれば検知しない', () => {
    expect(detect('株式会社サンプル\n営業部 山田様\n\nお世話になっております。')).toEqual([]);
    expect(detect('株式会社サンプル 御中\n\nお世話になっております。')).toEqual([]);
    expect(detect('株式会社サンプル\n山田部長\n\nお世話になっております。')).toEqual([]);
    expect(detect('株式会社サンプル\nご担当者さま\n\nお世話になっております。')).toEqual([]);
  });

  it('名乗りや、会社名の無い書き出しは、宛名とみなさない', () => {
    expect(detect('株式会社サンプルの山田です。\nお世話になっております。')).toEqual([]);
    expect(detect('株式会社サンプルの山田です\n\nお世話になっております。')).toEqual([]);
    expect(detect('お世話になっております。\n株式会社サンプルの件です。')).toEqual([]);
    expect(detect('山田\n\nお疲れさまです。')).toEqual([]);
    expect(detect('')).toEqual([]);
  });
});

describe('登録した誤り（誤字の辞書）', () => {
  const dictionary = [
    { wrong: '以外と', right: '意外と' },
    { wrong: 'サンプル商亊', right: 'サンプル商事' },
    { wrong: '了解しました', right: '' },
  ];
  const detect = (snap: Parameters<typeof snapshot>[0]) =>
    customTypoDetector.detect(snapshot(snap), context({ typoDictionary: dictionary }));

  it('本文や件名に登録した誤りがあれば、正しい書き方と一緒に検知する', () => {
    expect(detect({ bodyText: '以外と早く終わりました。' })).toEqual([
      {
        detectorId: 'custom-typo',
        messageKey: 'detectCustomTypo',
        substitutions: ['以外と → 意外と'],
      },
    ]);
    expect(detect({ subject: 'サンプル商亊の件' })[0]?.substitutions).toEqual([
      'サンプル商亊 → サンプル商事',
    ]);
  });

  it('正しい書き方が登録されていなければ、誤りだけを表示する', () => {
    expect(detect({ bodyText: '了解しました。以外と早いですね。' })[0]?.substitutions).toEqual([
      '以外と → 意外と、了解しました',
    ]);
  });

  it('登録した誤りが無ければ検知しない', () => {
    expect(detect({ bodyText: '意外と早く終わりました。' })).toEqual([]);
  });

  it('辞書が空なら検知しない', () => {
    expect(customTypoDetector.detect(snapshot({ bodyText: '以外と' }), context())).toEqual([]);
  });
});

describe('全角・半角の英数字の混在', () => {
  const detect = (snap: Parameters<typeof snapshot>[0]) =>
    widthMixDetector.detect(snapshot(snap), context());

  it('ひと続きの英数字の中に全角と半角が混ざっていれば検知する', () => {
    expect(detect({ bodyText: '2026年1０月１2日にＡBC会議室で行います。' })).toEqual([
      {
        detectorId: 'width-mix',
        messageKey: 'detectWidthMix',
        substitutions: ['1０、１2、ＡBC'],
      },
    ]);
    expect(detect({ subject: '第1０回の件' })).toHaveLength(1);
  });

  it('全角だけ・半角だけの並びは、同じ文面にあっても検知しない', () => {
    expect(detect({ bodyText: '１０月12日にABC会議室で行います。ＴＥＬ 03-0000-0000' })).toEqual(
      [],
    );
    expect(detect({ bodyText: 'https://www.example.com/path?id=123' })).toEqual([]);
  });
});

describe('署名がない', () => {
  const detect = (bodyText: string, signatureKeywords: readonly string[]) =>
    signatureMissingDetector.detect(snapshot({ bodyText }), context({ signatureKeywords }));

  it('登録した言葉が本文に1つも無ければ検知する', () => {
    expect(detect('お世話になっております。', ['見本 太郎', 'Taro Mihon'])).toEqual([
      {
        detectorId: 'signature-missing',
        messageKey: 'detectSignatureMissing',
        substitutions: ['見本 太郎、Taro Mihon'],
      },
    ]);
  });

  it('登録した言葉のどれかが本文にあれば検知しない', () => {
    expect(detect('よろしくお願いします。\n\n見本 太郎', ['見本 太郎', 'Taro Mihon'])).toEqual([]);
    expect(detect('Best regards,\nTaro Mihon', ['見本 太郎', 'Taro Mihon'])).toEqual([]);
  });

  it('空白の有無、全角・半角、大文字・小文字の違いは無視する', () => {
    expect(detect('見本　太郎', ['見本 太郎'])).toEqual([]);
    expect(detect('見本太郎', ['見本 太郎'])).toEqual([]);
    expect(detect('ＴＡＲＯ mihon', ['Taro Mihon'])).toEqual([]);
  });

  it('言葉が登録されていなければ検知しない', () => {
    expect(detect('お世話になっております。', [])).toEqual([]);
    expect(detect('お世話になっております。', ['  '])).toEqual([]);
  });
});

describe('誤字の辞書と署名の言葉の設定', () => {
  it('初期設定では、どちらも空', () => {
    expect(DEFAULT_SETTINGS.typoDictionary).toEqual([]);
    expect(DEFAULT_SETTINGS.signatureKeywords).toEqual([]);
    expect(normalizeSettings({}).typoDictionary).toEqual([]);
    expect(normalizeSettings({}).signatureKeywords).toEqual([]);
  });

  it('1行1件の「誤り=正しい書き方」を読み、同じ形に戻せる', () => {
    const entries = parseTypoDictionary('以外と=意外と\n 確立＝確率 \n了解しました\n関心→感心\n');
    expect(entries).toEqual([
      { wrong: '以外と', right: '意外と' },
      { wrong: '確立', right: '確率' },
      { wrong: '了解しました', right: '' },
      { wrong: '関心', right: '感心' },
    ]);
    expect(formatTypoDictionary(entries)).toBe('以外と=意外と\n確立=確率\n了解しました\n関心=感心');
  });

  it('誤りが空のもの、誤りと正しい書き方が同じもの、重複は除く', () => {
    expect(parseTypoDictionary('=意外と\n同じ=同じ\n以外と=意外と\n以外と=案外と')).toEqual([
      { wrong: '以外と', right: '意外と' },
    ]);
  });

  it('壊れた保存データは読み飛ばし、件数と長さの上限を守る', () => {
    const many = Array.from({ length: MAX_TYPO_DICTIONARY_ENTRIES + 10 }, (_, index) => ({
      wrong: `誤り${String(index)}`,
      right: '正',
    }));
    expect(normalizeSettings({ typoDictionary: many }).typoDictionary).toHaveLength(
      MAX_TYPO_DICTIONARY_ENTRIES,
    );
    expect(
      normalizeSettings({
        typoDictionary: [null, 'x', { wrong: 1 }, { wrong: 'あ'.repeat(101) }, { wrong: '可' }],
        signatureKeywords: [' 見本 太郎 ', '', 3, '見本 太郎'],
      }),
    ).toMatchObject({
      typoDictionary: [{ wrong: '可', right: '' }],
      signatureKeywords: ['見本 太郎'],
    });
  });
});
