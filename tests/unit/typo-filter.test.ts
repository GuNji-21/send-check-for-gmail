import { describe, expect, it } from 'vitest';
import {
  MAX_INPUT_LENGTH,
  MAX_INSPECTED_ITEMS,
  TYPO_EXAMPLES,
  TYPO_SYSTEM_PROMPT,
  buildTypoSource,
  parseTypoResponse,
} from '../../src/core/typo/typo-check';
import {
  MEANING_WORDS,
  hasControlCharacter,
  isSafeTypoFix,
  measureDifference,
} from '../../src/core/typo/typo-filter';

/** 例の1件：本文、誤りと指摘された箇所、修正案 */
type Example = readonly [body: string, wrong: string, suggestion: string];

function response(candidates: unknown): string {
  return JSON.stringify({ candidates });
}

/** 本文に対して、候補1件の返答を検証した結果 */
function parseOne([body, wrong, suggestion]: Example) {
  const source = buildTypoSource('ご連絡', body);
  return parseTypoResponse(response([{ wrong, suggestion, reason: '理由' }]), source);
}

describe('意味を変える候補・言い換えの候補を捨てる', () => {
  const rephrasing: Example[] = [
    ['返信は不要です。', '不要です', '必須です'],
    ['返信は不要です。', '不要です', '必要です'],
    ['返信は不要です。', '不要です', '不要でございます'],
    ['ご確認ください。', 'ご確認ください', 'ご確認のほどお願いいたします'],
    ['よろしくお願いします。', 'お願いします', 'お願いいたします'],
    ['そう思います。お願いします', 'お願いします', 'お願いします！よろしく'],
  ];
  it.each(rephrasing)('意味の反転・言い換えは捨てる：%s ／ %s → %s', (...example) => {
    expect(parseOne(example)).toEqual([]);
  });

  const polarity: Example[] = [
    ['参加できます。', 'できます', 'できません'],
    ['参加します。', '参加します', '参加しません'],
    ['問題ありません。', '問題ありません', '問題あります'],
    ['対応可能です', '可能です', '不可能です'],
    ['在庫ありです', '在庫あり', '在庫なし'],
    ['承認されました', '承認され', '否認され'],
    ['必ず出席します', '出席します', '欠席します'],
    ['有料です', '有料', '無料'],
    ['資料を送ります。', '送ります', '送りました'],
  ];
  it.each(polarity)('肯定と否定・可否・時制の入れ替えは捨てる：%s ／ %s → %s', (...example) => {
    expect(parseOne(example)).toEqual([]);
  });

  const numbersAndDirections: Example[] = [
    ['3000円です', '3000円', '30000円'],
    ['12月3日に', '12月3日', '12月5日'],
    ['三万円です', '三万円', '五万円'],
    ['10個以上で注文', '10個以上', '10個以下'],
    ['午前10時に伺います', '午前10時', '午後10時'],
    ['月曜日に伺います', '月曜日', '火曜日'],
    ['来週の会議', '来週の会議', '今週の会議'],
    ['売上が増加', '増加', '減少'],
    ['社内に共有', '社内に共有', '社外に共有'],
    ['上記の通り', '上記の通り', '下記の通り'],
  ];
  it.each(numbersAndDirections)(
    '数字・日時・範囲・向きの変更は捨てる：%s ／ %s → %s',
    (...example) => {
      expect(parseOne(example)).toEqual([]);
    },
  );

  it('置き換えても結果が変わらない候補は捨てる', () => {
    // 修正案の「ございます」は直後の文字と重なるので、実際の置き換えは「ありがとう」のまま
    expect(
      parseOne(['ありがとうございます。よろしく', 'ありがとう', 'ありがとうございます']),
    ).toEqual([]);
  });
});

describe('誤字の直しは残す', () => {
  const duplicatesAndOmissions: Example[] = [
    ['お世話になっておりまます。', 'おりまます', 'おります'],
    ['資料をを送付いたします。', '資料をを', '資料を'],
    ['お世話になっていおります。', 'なっていおります', 'なっております'],
    ['ご連絡いたたします。', 'いたたします', 'いたします'],
    ['申し訳ございませんん。', 'ございませんん', 'ございません'],
    ['今後ともよろしくお願いしす。', 'よろしくお願いしす', 'よろしくお願いします'],
  ];
  it.each(duplicatesAndOmissions)('重複・脱字の直しは残す：%s ／ %s → %s', (...example) => {
    const [, wrong, suggestion] = example;
    expect(parseOne(example)).toEqual([{ wrong, suggestion, reason: '理由' }]);
  });

  const conversions: Example[] = [
    ['以外と早く終わりました。', '以外と', '意外と'],
    ['貴社の記者がますます', '貴社の記者が', '貴社の貴社が'],
    ['こんにちわ。', 'こんにちわ', 'こんにちは'],
    ['社内で検当します。', '検当します', '検討します'],
    ['会議質を予約しました。', '会議質', '会議室'],
    ['ご協力をお願い板します。', 'お願い板します', 'お願いいたします'],
  ];
  it.each(conversions)('誤変換・かなの誤りの直しは残す：%s ／ %s → %s', (...example) => {
    const [, wrong, suggestion] = example;
    expect(parseOne(example)).toEqual([{ wrong, suggestion, reason: '理由' }]);
  });

  it('修正案が後ろの文字と重なって広めに返る候補は、本文に続きがある場合だけ残す', () => {
    // 続きがある：実際の置き換えは「ありがとう」。表示する修正案は AI が返したままにする
    expect(parseOne(['アリががとうございます。', 'アリががとう', 'ありがとうございます'])).toEqual([
      { wrong: 'アリががとう', suggestion: 'ありがとうございます', reason: '理由' },
    ]);
    // 続きが無い：「ございます」を付け足す書き換えになる
    expect(parseOne(['アリががとう。', 'アリががとう', 'ありがとうございます'])).toEqual([]);
  });

  it('捨てる候補と残す候補が混ざっている場合は、残す候補だけを、返答の順で返す', () => {
    const source = buildTypoSource('ご連絡', '返信は不要です。資料をを送付いたします。');
    const raw = response([
      { wrong: '不要です', suggestion: '必須です', reason: '理由' },
      { wrong: '資料をを', suggestion: '資料を', reason: '助詞の重複' },
    ]);
    expect(parseTypoResponse(raw, source)).toEqual([
      { wrong: '資料をを', suggestion: '資料を', reason: '助詞の重複' },
    ]);
  });

  it('すべての候補が捨てられた場合は、例外を投げずに空配列を返す', () => {
    const source = buildTypoSource('ご連絡', '返信は不要です。3000円です');
    const raw = response([
      { wrong: '不要です', suggestion: '必須です', reason: '理由' },
      { wrong: '3000円', suggestion: '30000円', reason: '理由' },
    ]);
    expect(parseTypoResponse(raw, source)).toEqual([]);
  });

  it('文字数は、絵文字を途中で分けずに数える', () => {
    expect(parseOne(['資料をを😀送付', '資料をを😀', '資料を😀'])).toEqual([
      { wrong: '資料をを😀', suggestion: '資料を😀', reason: '理由' },
    ]);
    expect(measureDifference('資料をを😀', '資料を😀')).toEqual({ removed: 1, added: 0 });
  });
});

describe('isSafeTypoFix（規則ごとの境界）', () => {
  it('置き換えても変わらない場合は受け入れない', () => {
    expect(isSafeTypoFix('あいう', 'あいう')).toBe(false);
  });

  it('数字の並びが変わる場合は受け入れない（半角・全角・漢数字）', () => {
    expect(isSafeTypoFix('第3回ををお', '第3回をお')).toBe(true);
    expect(isSafeTypoFix('第3回', '第4回')).toBe(false);
    expect(isSafeTypoFix('第３回', '第４回')).toBe(false);
    expect(isSafeTypoFix('第三回', '第四回')).toBe(false);
    expect(isSafeTypoFix('3日', '13日')).toBe(false);
    expect(isSafeTypoFix('13日', '3日')).toBe(false);
    // 数字の書き方を変えるだけの候補も、数字の文字が変わるので受け入れない
    expect(isSafeTypoFix('3日', '三日')).toBe(false);
  });

  it('意味を左右する語の回数が変わる場合は受け入れない', () => {
    // 「ない」の回数が同じなら受け入れる
    expect(isSafeTypoFix('しないでくだい', 'しないでください')).toBe(true);
    expect(isSafeTypoFix('少い', '少ない')).toBe(false);
    expect(isSafeTypoFix('ないない', 'ない')).toBe(false);
    expect(isSafeTypoFix('以外', '以内')).toBe(false);
    expect(isSafeTypoFix('来週', '先週')).toBe(false);
    expect(isSafeTypoFix('でした', 'です')).toBe(false);
  });

  it('語の一覧は、決めた36語である', () => {
    expect(MEANING_WORDS).toHaveLength(36);
    expect(new Set(MEANING_WORDS).size).toBe(36);
    for (const word of ['ない', 'ません', '不', '可', '上', '下', '内', '外', '月曜', 'ました']) {
      expect(MEANING_WORDS).toContain(word);
    }
  });

  it('削除する文字数が3までは受け入れ、4以上は受け入れない', () => {
    expect(measureDifference('あかきくい', 'あさしすい')).toEqual({ removed: 3, added: 3 });
    expect(isSafeTypoFix('あかきくい', 'あさしすい')).toBe(true);
    expect(measureDifference('あかきくけい', 'あさい')).toEqual({ removed: 4, added: 1 });
    expect(isSafeTypoFix('あかきくけい', 'あさい')).toBe(false);
  });

  it('追加する文字数が3までは受け入れ、4以上は受け入れない', () => {
    expect(measureDifference('あかい', 'あさしすい')).toEqual({ removed: 1, added: 3 });
    expect(isSafeTypoFix('あかい', 'あさしすい')).toBe(true);
    expect(measureDifference('あかい', 'あさしすせい')).toEqual({ removed: 1, added: 4 });
    expect(isSafeTypoFix('あかい', 'あさしすせい')).toBe(false);
  });

  it('何も削除しない場合は、1文字の追加だけを受け入れる', () => {
    expect(measureDifference('あい', 'あかい')).toEqual({ removed: 0, added: 1 });
    expect(isSafeTypoFix('あい', 'あかい')).toBe(true);
    expect(measureDifference('あい', 'あかきい')).toEqual({ removed: 0, added: 2 });
    expect(isSafeTypoFix('あい', 'あかきい')).toBe(false);
  });
});

describe('AI の返答を信頼しない（異常な返答）', () => {
  const SOURCE = buildTypoSource('ご連絡', '資料をを送付');
  const KEEP = { wrong: '資料をを', suggestion: '資料を', reason: '助詞の重複' };
  const DROP = { wrong: '本文に無い語句', suggestion: '別の語句', reason: '理由' };

  it('例外に、返答の中身を含めない', () => {
    const secret = '秘密の本文ABC';
    let thrown: unknown;
    try {
      parseTypoResponse(`${secret}はJSONではありません`, SOURCE);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    const error = thrown as Error;
    expect(error.message).toBe('Could not read the response from the language model');
    expect(error.message).not.toContain(secret);
    expect(String(error)).not.toContain(secret);
    expect(error.cause).toBeUndefined();
  });

  it('形が違う返答でも、同じ固定の文言の例外を投げる', () => {
    for (const raw of ['[]', '{"candidates":"秘密の本文ABC"}', 'null', '"秘密の本文ABC"']) {
      expect(() => parseTypoResponse(raw, SOURCE)).toThrow(
        'Could not read the response from the language model',
      );
    }
  });

  it('制御文字（改行・タブなど）を含む候補は捨てる', () => {
    for (const suggestion of [
      '資料\nを',
      '資料\tを',
      '資料\u0000を',
      '資料\u007fを',
      '資料\u001bを',
    ]) {
      expect(parseTypoResponse(response([{ ...KEEP, suggestion }]), SOURCE)).toEqual([]);
    }
    const withNewline = buildTypoSource('ご連絡', '資料を\nを送付');
    expect(
      parseTypoResponse(response([{ wrong: '資料を\nを', suggestion: '資料を' }]), withNewline),
    ).toEqual([]);
    expect(hasControlCharacter('資料を')).toBe(false);
    expect(hasControlCharacter('資料を\r')).toBe(true);
  });

  it('形のおかしい要素は、例外を投げずに捨てる', () => {
    const raw = response([
      { wrong: 123, suggestion: '資料を' },
      { wrong: '資料をを', suggestion: 456 },
      { wrong: ['資料をを'], suggestion: '資料を' },
      { wrong: '資料をを', suggestion: { text: '資料を' } },
      { wrong: null, suggestion: '資料を' },
      { wrong: '資料をを', suggestion: null },
      { wrong: '資料をを' },
      '文字列',
      null,
      42,
      ['資料をを', '資料を'],
      KEEP,
    ]);
    expect(parseTypoResponse(raw, SOURCE)).toEqual([KEEP]);
  });

  it('返答の候補は、先頭から決めた数までしか調べない', () => {
    expect(MAX_INSPECTED_ITEMS).toBe(20);
    const twentyThenKeep = [...Array.from({ length: 20 }, () => DROP), KEEP];
    expect(parseTypoResponse(response(twentyThenKeep), SOURCE)).toEqual([]);

    const nineteenThenKeep = [...Array.from({ length: 19 }, () => DROP), KEEP];
    expect(parseTypoResponse(response(nineteenThenKeep), SOURCE)).toEqual([KEEP]);

    // 形のおかしい要素も1個と数える
    const malformedThenKeep = [...Array.from({ length: 20 }, () => null), KEEP];
    expect(parseTypoResponse(response(malformedThenKeep), SOURCE)).toEqual([]);
  });

  it('最大の大きさの返答でも、すぐに終わる', () => {
    // 4000文字の文面の末尾に、60文字の区切りを20個並べる。
    // どの候補も最後の検査（差分の大きさ）まで進み、そこで捨てられる
    const marks = Array.from('カキクケコサシスセソタチツテトナニヌネノ');
    const segments = marks.map((mark) => `${'あ'.repeat(58)}${mark}ハ`);
    const prefixLength = buildTypoSource('ご連絡', '').length;
    const filler = 'あ'.repeat(MAX_INPUT_LENGTH - prefixLength - segments.join('').length);
    const source = buildTypoSource('ご連絡', filler + segments.join(''));
    expect(source).toHaveLength(MAX_INPUT_LENGTH);

    const items = marks.map((mark, index) => ({
      wrong: segments[index],
      suggestion: `${'い'.repeat(4)}${'あ'.repeat(54)}${mark}ハ`,
      reason: '理由',
    }));
    expect(items).toHaveLength(20);
    expect(items.every((item) => item.wrong?.length === 60 && item.suggestion.length === 60)).toBe(
      true,
    );

    const startedAt = performance.now();
    const result = parseTypoResponse(response(items), source);
    expect(performance.now() - startedAt).toBeLessThan(1000);
    expect(result).toEqual([]);

    // 同じ大きさで、すべて受け入れられる候補の場合（上限の件数で打ち切る）
    const accepted = marks.map((mark, index) => ({
      wrong: segments[index],
      suggestion: `${'あ'.repeat(58)}${mark}ヒ`,
      reason: '理由',
    }));
    const startedAgainAt = performance.now();
    expect(parseTypoResponse(response(accepted), source)).toHaveLength(5);
    expect(performance.now() - startedAgainAt).toBeLessThan(1000);
  });
});

describe('AI への指示とお手本', () => {
  it('指示に、指摘してよいものと、挙げてはいけないものが書かれている', () => {
    for (const word of ['誤字', '脱字', '誤変換', '重複']) {
      expect(TYPO_SYSTEM_PROMPT).toContain(word);
    }
    for (const word of ['意味', '否定', '数字', '言い換え', '敬語']) {
      expect(TYPO_SYSTEM_PROMPT).toContain(word);
    }
    for (const name of ['candidates', 'wrong', 'suggestion', 'reason']) {
      expect(TYPO_SYSTEM_PROMPT).toContain(name);
    }
  });

  it('指示とお手本は、解析時間を延ばさない長さに収める', () => {
    expect(TYPO_SYSTEM_PROMPT.length).toBeLessThanOrEqual(900);
    for (const example of TYPO_EXAMPLES) {
      expect(example.input.length).toBeLessThanOrEqual(200);
    }
  });

  it('お手本は2件。誤りだけを指摘する例と、「不要です」を含む正しい文面に何も指摘しない例', () => {
    expect(TYPO_EXAMPLES).toHaveLength(2);
    const [withErrors, withoutErrors] = TYPO_EXAMPLES;

    // 1つ目：誤りのある箇所と、言い換えたくなる正しい文が混ざっていて、誤りだけを指摘する
    const first = JSON.parse(withErrors?.output ?? '') as {
      candidates: { wrong: string; suggestion: string }[];
    };
    expect(withErrors?.input).toContain('ご確認ください。');
    expect(first.candidates.map((candidate) => candidate.wrong)).toEqual([
      '資料をを',
      'よろしくお願いしす',
    ]);
    for (const candidate of first.candidates) {
      expect(candidate.wrong).not.toContain('ご確認');
    }

    // 2つ目：正しい文面には、何も指摘しない
    expect(withoutErrors?.input).toContain('不要です');
    expect(withoutErrors?.output).toBe('{"candidates":[]}');
  });

  it('お手本の返答は、検証で捨てられない', () => {
    for (const example of TYPO_EXAMPLES) {
      const expected = (JSON.parse(example.output) as { candidates: unknown[] }).candidates.length;
      expect(parseTypoResponse(example.output, example.input)).toHaveLength(expected);
    }
  });
});
