import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_CANDIDATES,
  MAX_INPUT_LENGTH,
  TYPO_RESPONSE_SCHEMA,
  TYPO_SYSTEM_PROMPT,
  buildTypoSource,
  fitSuggestion,
  hasTextToCheck,
  parseTypoResponse,
} from '../../src/core/typo/typo-check';
import {
  createTypoChecker,
  downloadAiModel,
  getAiAvailability,
} from '../../src/shared/language-model';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const SOURCE = buildTypoSource(
  'お見積りの件',
  'お世話になっておりまます。資料をを送付いたします。',
);

function response(candidates: unknown): string {
  return JSON.stringify({ candidates });
}

describe('buildTypoSource', () => {
  it('件名と本文をつなげる', () => {
    expect(buildTypoSource(' 件名 ', ' 本文 ')).toBe('件名：件名\n本文：\n本文');
  });

  it('長い文面は、決めた長さで切り詰める', () => {
    expect(buildTypoSource('件名', 'あ'.repeat(MAX_INPUT_LENGTH * 2))).toHaveLength(
      MAX_INPUT_LENGTH,
    );
  });

  it('件名も本文も空なら、調べる内容が無いと判定する', () => {
    expect(hasTextToCheck(' ', '\n')).toBe(false);
    expect(hasTextToCheck('件名', '')).toBe(true);
    expect(hasTextToCheck('', '本文')).toBe(true);
  });
});

describe('parseTypoResponse', () => {
  it('候補を読み取る', () => {
    const raw = response([
      { wrong: 'おりまます', suggestion: 'おります', reason: '文字の重複' },
      { wrong: '資料をを', suggestion: '資料を', reason: '助詞の重複' },
    ]);
    expect(parseTypoResponse(raw, SOURCE)).toEqual([
      { wrong: 'おりまます', suggestion: 'おります', reason: '文字の重複' },
      { wrong: '資料をを', suggestion: '資料を', reason: '助詞の重複' },
    ]);
  });

  it('候補が無ければ空配列を返す', () => {
    expect(parseTypoResponse(response([]), SOURCE)).toEqual([]);
  });

  it('元の文面に無い箇所への指摘は捨てる（AI の作り話を表示しない）', () => {
    const raw = response([
      { wrong: '存在しない語句', suggestion: '別の語句', reason: '理由' },
      { wrong: '資料をを', suggestion: '資料を', reason: '助詞の重複' },
    ]);
    expect(parseTypoResponse(raw, SOURCE).map((candidate) => candidate.wrong)).toEqual([
      '資料をを',
    ]);
  });

  it('修正案が元と同じ・空・形が違う候補は捨てる', () => {
    const raw = response([
      { wrong: '資料をを', suggestion: '資料をを', reason: '同じ' },
      { wrong: '資料をを', suggestion: ' ', reason: '空' },
      { wrong: '', suggestion: '資料を', reason: '空' },
      { wrong: 123, suggestion: '資料を', reason: '型が違う' },
      '文字列',
      null,
    ]);
    expect(parseTypoResponse(raw, SOURCE)).toEqual([]);
  });

  it('同じ指摘は1件にまとめ、前後の空白を除く', () => {
    const raw = response([
      { wrong: ' 資料をを ', suggestion: '資料を', reason: ' 助詞の重複 ' },
      { wrong: '資料をを', suggestion: '資料を', reason: '重複' },
    ]);
    expect(parseTypoResponse(raw, SOURCE)).toEqual([
      { wrong: '資料をを', suggestion: '資料を', reason: '助詞の重複' },
    ]);
  });

  it('理由が無くても候補として扱う', () => {
    const raw = response([{ wrong: '資料をを', suggestion: '資料を' }]);
    expect(parseTypoResponse(raw, SOURCE)).toEqual([
      { wrong: '資料をを', suggestion: '資料を', reason: '' },
    ]);
  });

  it('長すぎる指摘（文全体の書き換えなど）は捨て、件数は上限までにする', () => {
    const long = 'あ'.repeat(80);
    const source = `${long} ${'い'.repeat(40)}`;
    expect(
      parseTypoResponse(response([{ wrong: long, suggestion: 'あ', reason: '' }]), source),
    ).toEqual([]);

    const many = Array.from({ length: MAX_CANDIDATES + 5 }, (_, i) => ({
      wrong: 'い',
      suggestion: `う${String(i)}`,
      reason: '',
    }));
    expect(parseTypoResponse(response(many), source)).toHaveLength(MAX_CANDIDATES);
  });

  it('JSON として読めない・形が違う返答では例外を投げる', () => {
    expect(() => parseTypoResponse('これは JSON ではありません', SOURCE)).toThrow();
    expect(() => parseTypoResponse('[]', SOURCE)).toThrow();
    expect(() => parseTypoResponse('{"candidates":"none"}', SOURCE)).toThrow();
  });

  it('指示と返答の形が、同じ項目名を使っている', () => {
    for (const name of ['candidates', 'wrong', 'suggestion', 'reason']) {
      expect(TYPO_SYSTEM_PROMPT).toContain(name);
    }
    expect(TYPO_RESPONSE_SCHEMA.properties.candidates.items.required).toEqual([
      'wrong',
      'suggestion',
      'reason',
    ]);
  });
});

/** Prompt API（LanguageModel）の代用 */
function stubLanguageModel(options: {
  availability?: string;
  reply?: string | (() => Promise<string>);
  createFails?: boolean;
}) {
  const prompts: string[] = [];
  const destroyed: string[] = [];
  const makeSession = (name: string) => ({
    prompt: vi.fn((input: string, promptOptions?: { signal?: AbortSignal }) => {
      prompts.push(input);
      if (promptOptions?.signal?.aborted === true) {
        return Promise.reject(new DOMException('aborted', 'AbortError'));
      }
      if (typeof options.reply === 'function') {
        return new Promise<string>((resolve, reject) => {
          promptOptions?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
          void (options.reply as () => Promise<string>)().then(resolve, reject);
        });
      }
      return Promise.resolve(options.reply ?? '{"candidates":[]}');
    }),
    clone: vi.fn(() => Promise.resolve(makeSession('clone'))),
    destroy: vi.fn(() => {
      destroyed.push(name);
    }),
  });
  const create = vi.fn((createOptions?: { monitor?: (m: unknown) => void }) => {
    if (options.createFails === true) return Promise.reject(new Error('cannot create'));
    createOptions?.monitor?.({
      addEventListener: (_type: string, listener: (event: { loaded: number }) => void) => {
        listener({ loaded: 0.5 });
        listener({ loaded: 1 });
      },
    });
    return Promise.resolve(makeSession('base'));
  });
  const availability = vi.fn(() => Promise.resolve(options.availability ?? 'available'));
  vi.stubGlobal('LanguageModel', { availability, create });
  return { prompts, destroyed, create, availability };
}

describe('getAiAvailability', () => {
  it('Prompt API が無い Chrome では「使えない」と判定する', async () => {
    vi.stubGlobal('LanguageModel', undefined);
    await expect(getAiAvailability()).resolves.toBe('unavailable');
  });

  it('モデルの状態を返す', async () => {
    for (const state of ['available', 'downloadable', 'downloading', 'unavailable'] as const) {
      stubLanguageModel({ availability: state });
      await expect(getAiAvailability()).resolves.toBe(state);
    }
  });

  it('日本語を指定して状態を調べる', async () => {
    const { availability } = stubLanguageModel({});
    await getAiAvailability();
    expect(availability).toHaveBeenCalledWith({
      expectedInputs: [{ type: 'text', languages: ['ja'] }],
      expectedOutputs: [{ type: 'text', languages: ['ja'] }],
    });
  });

  it('知らない値や例外は「使えない」として扱う', async () => {
    stubLanguageModel({ availability: 'something-new' });
    await expect(getAiAvailability()).resolves.toBe('unavailable');
    vi.stubGlobal('LanguageModel', {
      availability: () => Promise.reject(new Error('boom')),
      create: () => Promise.reject(new Error('boom')),
    });
    await expect(getAiAvailability()).resolves.toBe('unavailable');
  });
});

describe('downloadAiModel', () => {
  it('進み具合を伝え、終わったらセッションを破棄する', async () => {
    const { destroyed } = stubLanguageModel({ availability: 'downloadable' });
    const progress: number[] = [];
    await downloadAiModel((ratio) => progress.push(ratio));
    expect(progress).toEqual([0.5, 1]);
    expect(destroyed).toEqual(['base']);
  });

  it('Prompt API が無ければ失敗する', async () => {
    vi.stubGlobal('LanguageModel', undefined);
    await expect(downloadAiModel(() => undefined)).rejects.toThrow();
  });
});

describe('createTypoChecker', () => {
  const input = { subject: 'お見積りの件', bodyText: '資料をを送付いたします。' };

  it('AI の返答から候補を作る', async () => {
    const { prompts, destroyed } = stubLanguageModel({
      reply: response([{ wrong: '資料をを', suggestion: '資料を', reason: '助詞の重複' }]),
    });
    const result = await createTypoChecker().check(input);
    expect(result).toEqual({
      status: 'ok',
      candidates: [{ wrong: '資料をを', suggestion: '資料を', reason: '助詞の重複' }],
    });
    expect(prompts).toEqual(['件名：お見積りの件\n本文：\n資料をを送付いたします。']);
    // チェックに使った複製は、終わったら破棄する
    expect(destroyed).toEqual(['clone']);
  });

  it('指示を読み込ませたセッションは1度だけ作り、チェックのたびに複製する', async () => {
    const { create } = stubLanguageModel({});
    const checker = createTypoChecker();
    await checker.check(input);
    await checker.check(input);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('指示とお手本（誤りのある例・無い例）を読み込ませる', async () => {
    const { create } = stubLanguageModel({});
    await createTypoChecker().check(input);
    const options = create.mock.calls[0]?.[0] as { initialPrompts?: { role: string }[] };
    expect(options.initialPrompts?.map((prompt) => prompt.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
  });

  it('warmUp は、モデルが使えるときだけ先に読み込む', async () => {
    const ready = stubLanguageModel({});
    const checker = createTypoChecker();
    await checker.warmUp();
    expect(ready.create).toHaveBeenCalledTimes(1);
    // 先に読み込んだものを、チェックで使い回す
    await checker.check(input);
    expect(ready.create).toHaveBeenCalledTimes(1);

    const notReady = stubLanguageModel({ availability: 'downloadable' });
    await createTypoChecker().warmUp();
    expect(notReady.create).not.toHaveBeenCalled();
  });

  it('warmUp は失敗しても例外を投げない', async () => {
    stubLanguageModel({ createFails: true });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(createTypoChecker().warmUp()).resolves.toBeUndefined();
  });

  it('件名も本文も空なら、AI を呼ばずに「候補なし」を返す', async () => {
    const { create } = stubLanguageModel({});
    await expect(createTypoChecker().check({ subject: '', bodyText: ' ' })).resolves.toEqual({
      status: 'ok',
      candidates: [],
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('モデルが使えない・未ダウンロードの場合は not-ready を返す', async () => {
    vi.stubGlobal('LanguageModel', undefined);
    await expect(createTypoChecker().check(input)).resolves.toEqual({ status: 'not-ready' });
    for (const state of ['downloadable', 'downloading', 'unavailable']) {
      const { create } = stubLanguageModel({ availability: state });
      await expect(createTypoChecker().check(input)).resolves.toEqual({ status: 'not-ready' });
      // 未ダウンロードの状態で作成を呼ぶと、勝手にダウンロードが始まってしまうため、呼ばない
      expect(create).not.toHaveBeenCalled();
    }
  });

  it('AI の返答が JSON として読めない場合は failed を返す（例外は投げない）', async () => {
    stubLanguageModel({ reply: 'すみません、分かりません。' });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(createTypoChecker().check(input)).resolves.toEqual({ status: 'failed' });
  });

  it('セッションを作れなかった場合は failed を返し、次のチェックで作り直す', async () => {
    const failing = stubLanguageModel({ createFails: true });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const checker = createTypoChecker();
    await expect(checker.check(input)).resolves.toEqual({ status: 'failed' });
    expect(failing.create).toHaveBeenCalledTimes(1);

    const working = stubLanguageModel({});
    await expect(checker.check(input)).resolves.toEqual({ status: 'ok', candidates: [] });
    expect(working.create).toHaveBeenCalledTimes(1);
  });

  it('時間がかかりすぎた場合は打ち切って failed を返す', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubLanguageModel({ reply: () => new Promise<string>(() => undefined) });
    const pending = createTypoChecker(1000).check(input);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toEqual({ status: 'failed' });
  });

  it('すでに中止されている場合は、AI を呼ばずに終える', async () => {
    const { prompts } = stubLanguageModel({});
    const controller = new AbortController();
    controller.abort();
    await expect(createTypoChecker().check(input, controller.signal)).resolves.toEqual({
      status: 'failed',
    });
    expect(prompts).toEqual([]);
  });

  it('中止の合図を受けたら打ち切る（ダイアログが閉じられた場合）', async () => {
    stubLanguageModel({ reply: () => new Promise<string>(() => undefined) });
    const controller = new AbortController();
    const pending = createTypoChecker().check(input, controller.signal);
    // AI の呼び出しが始まるのを待ってから中止する
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await expect(pending).resolves.toEqual({ status: 'failed' });
  });
});

describe('fitSuggestion', () => {
  it('前後と重ならない修正案は、そのまま返す', () => {
    expect(fitSuggestion('お世話に', 'なっておりまます', 'なっております', '。')).toBe(
      'なっております',
    );
  });

  it('修正案の末尾が直後の文字と重なる場合は、重なりを取り除く', () => {
    expect(fitSuggestion('', 'アリががとう', 'ありがとうございます', 'ございます。')).toBe(
      'ありがとう',
    );
  });

  it('修正案の先頭が直前の文字と重なる場合は、重なりを取り除く', () => {
    expect(fitSuggestion('資料を', 'をを送付', '資料を送付', 'いたします')).toBe('送付');
  });

  it('誤りの箇所そのものが同じ文字で終わる場合は、取り除かない', () => {
    // 「ますます」の重複ではなく、wrong 自体が「ます」で終わっている
    expect(fitSuggestion('', 'おりまます', 'おります', 'ますます発展')).toBe('おります');
  });

  it('1文字だけの重なりは偶然の一致とみなし、取り除かない', () => {
    expect(fitSuggestion('', '資料をを', '資料を', 'を送ります')).toBe('資料を');
  });
});
