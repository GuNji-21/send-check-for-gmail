import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import manifest from '../../public/manifest.json';
import { type RemoteTypoDeps, checkTyposRemotely } from '../../src/background/remote-typo';
import {
  MAX_REMOTE_OUTPUT_TOKENS,
  REMOTE_ENDPOINTS,
  REMOTE_MODELS,
  REMOTE_ORIGINS,
  REMOTE_PROVIDERS,
  buildRemoteRequest,
  isRemoteProvider,
  looksLikeApiKey,
  readRemoteResponse,
} from '../../src/core/typo/remote-request';
import { MAX_INPUT_LENGTH, buildTypoSource } from '../../src/core/typo/typo-check';
import { parseFormValues, toFormValues } from '../../src/options/form';
import { deleteApiKey, hasApiKey, loadApiKey, saveApiKey } from '../../src/storage/api-keys';
import { DEFAULT_SETTINGS, clearAllData } from '../../src/storage/settings';

/** テスト用の API キー（架空の値） */
const KEY = 'test-key-0123456789abcdefghij';

const SOURCE = buildTypoSource('資料の件', '資料をを送付いたします。');

type Json = Record<string, unknown>;

const bodyOf = (provider: 'openai' | 'anthropic', source = SOURCE): Json =>
  JSON.parse(buildRemoteRequest(provider, KEY, source).body) as Json;

describe('API キーの形の確認', () => {
  it('空白・改行・全角文字を含むもの、短すぎるものは受け付けない', () => {
    expect(looksLikeApiKey(KEY)).toBe(true);
    expect(looksLikeApiKey('short')).toBe(false);
    expect(looksLikeApiKey(`${KEY} `)).toBe(false);
    expect(looksLikeApiKey(`${KEY}\nx-injected: 1`)).toBe(false);
    expect(looksLikeApiKey(`${KEY}キー`)).toBe(false);
    expect(looksLikeApiKey('a'.repeat(401))).toBe(false);
  });

  it('提供元の名前を確かめる', () => {
    expect(isRemoteProvider('openai')).toBe(true);
    expect(isRemoteProvider('anthropic')).toBe(true);
    expect(isRemoteProvider('builtin')).toBe(false);
    expect(isRemoteProvider(undefined)).toBe(false);
  });
});

describe('API に送る内容', () => {
  it('通信先は、提供元の API だけ。manifest で許可を求める範囲と一致する', () => {
    for (const provider of REMOTE_PROVIDERS) {
      const origin = REMOTE_ORIGINS[provider].replace(/\*$/u, '');
      expect(REMOTE_ENDPOINTS[provider].startsWith(origin)).toBe(true);
      expect(buildRemoteRequest(provider, KEY, SOURCE).url).toBe(REMOTE_ENDPOINTS[provider]);
    }
    expect([...manifest.optional_host_permissions].sort()).toEqual(
      Object.values(REMOTE_ORIGINS).sort(),
    );
    // 入れた時点で求める権限は、これまでと同じ（外部の AI への通信は、利用者が選んだときにだけ許可を求める）
    expect(manifest.permissions).toEqual(['storage']);
    expect(manifest.host_permissions).toEqual(['https://mail.google.com/*']);
  });

  it('OpenAI：一番軽いモデルで、推論を使わず、候補の JSON だけを返させる', () => {
    const request = buildRemoteRequest('openai', KEY, SOURCE);
    expect(request.headers.authorization).toBe(`Bearer ${KEY}`);
    const body = bodyOf('openai');
    expect(body.model).toBe(REMOTE_MODELS.openai);
    expect(body.reasoning).toEqual({ effort: 'none' });
    expect(body.max_output_tokens).toBe(MAX_REMOTE_OUTPUT_TOKENS);
    expect(body.store).toBe(false);
    const format = (body.text as { format: Json }).format;
    expect(format.type).toBe('json_schema');
    expect(format.strict).toBe(true);
    const input = body.input as { role: string; content: string }[];
    expect(input[0]?.role).toBe('system');
    expect(input.at(-1)).toEqual({ role: 'user', content: SOURCE });
  });

  it('Anthropic：一番軽いモデルで、思考を使わず、候補の JSON だけを返させる', () => {
    const request = buildRemoteRequest('anthropic', KEY, SOURCE);
    expect(request.headers['x-api-key']).toBe(KEY);
    expect(request.headers['anthropic-version']).toBe('2026-10-21');
    expect(request.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    const body = bodyOf('anthropic');
    expect(body.model).toBe(REMOTE_MODELS.anthropic);
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.max_tokens).toBe(MAX_REMOTE_OUTPUT_TOKENS);
    const config = body.output_config as { effort: string; format: { type: string; schema: Json } };
    expect(config.effort).toBe('low');
    expect(config.format.type).toBe('json_schema');
    // Anthropic の JSON スキーマは、件数の上限（maxItems）に対応していない
    expect(JSON.stringify(config.format.schema)).not.toContain('maxItems');
    // このモデルでは、温度などの指定は受け付けられない
    expect(body).not.toHaveProperty('temperature');
    const messages = body.messages as { role: string; content: string }[];
    expect(messages.at(-1)).toEqual({ role: 'user', content: SOURCE });
    expect(messages.every((message) => message.role !== 'system')).toBe(true);
  });

  it('API キーは、本体には入れない（ヘッダーにだけ入れる）', () => {
    for (const provider of REMOTE_PROVIDERS) {
      expect(buildRemoteRequest(provider, KEY, SOURCE).body).not.toContain(KEY);
    }
  });

  it('長いメールは、先頭から決まった長さまでしか送らない', () => {
    const source = buildTypoSource('件名', 'あ'.repeat(MAX_INPUT_LENGTH * 3));
    expect(source.length).toBe(MAX_INPUT_LENGTH);
    for (const provider of REMOTE_PROVIDERS) {
      expect(buildRemoteRequest(provider, KEY, source).body.length).toBeLessThan(
        MAX_INPUT_LENGTH * 2,
      );
    }
  });
});

describe('API の返答の読み取り', () => {
  const text = '{"candidates":[]}';

  it('OpenAI：完了した返答から、文字列を取り出す', () => {
    const payload = {
      status: 'completed',
      output: [
        { type: 'reasoning', summary: [] },
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] },
      ],
    };
    expect(readRemoteResponse('openai', payload)).toBe(text);
  });

  it('OpenAI：途中で終わった返答・断られた返答・形が違う返答は使わない', () => {
    expect(() =>
      readRemoteResponse('openai', {
        status: 'incomplete',
        output: [{ type: 'message', content: [{ type: 'output_text', text: '{"cand' }] }],
      }),
    ).toThrow();
    expect(() =>
      readRemoteResponse('openai', {
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }],
      }),
    ).toThrow();
    expect(() => readRemoteResponse('openai', { status: 'completed' })).toThrow();
    expect(() => readRemoteResponse('openai', null)).toThrow();
  });

  it('Anthropic：最後まで返った返答から、文字列を取り出す（先頭が思考のブロックでも読める）', () => {
    const payload = {
      stop_reason: 'end_turn',
      content: [
        { type: 'thinking', thinking: '' },
        { type: 'text', text },
      ],
    };
    expect(readRemoteResponse('anthropic', payload)).toBe(text);
  });

  it('Anthropic：途中で終わった返答・断られた返答・形が違う返答は使わない', () => {
    const content = [{ type: 'text', text }];
    expect(() => readRemoteResponse('anthropic', { stop_reason: 'max_tokens', content })).toThrow();
    expect(() => readRemoteResponse('anthropic', { stop_reason: 'refusal', content })).toThrow();
    expect(() => readRemoteResponse('anthropic', { stop_reason: 'end_turn' })).toThrow();
    expect(() => readRemoteResponse('anthropic', 'text')).toThrow();
  });

  it('例外に、返答の中身を含めない', () => {
    let message = '';
    try {
      readRemoteResponse('anthropic', { stop_reason: 'max_tokens', secret: '本文の一部' });
    } catch (error) {
      message = String(error);
    }
    expect(message).not.toBe('');
    expect(message).not.toContain('本文の一部');
  });
});

describe('外部の AI への通信', () => {
  const anthropicReply = (candidates: unknown): unknown => ({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: JSON.stringify({ candidates }) }],
  });

  let sent: { url: string; headers: Readonly<Record<string, string>>; body: string }[];
  let logged: unknown[][];

  const deps = (overrides: Partial<RemoteTypoDeps> = {}): RemoteTypoDeps => ({
    loadKey: () => Promise.resolve(KEY),
    isAllowed: () => Promise.resolve(true),
    send: (url, init) => {
      sent.push({ url, headers: init.headers, body: init.body });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            anthropicReply([{ wrong: '資料をを', suggestion: '資料を', reason: '助詞の重複' }]),
          ),
      });
    },
    timeoutMs: 1000,
    ...overrides,
  });

  beforeEach(() => {
    sent = [];
    logged = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logged.push(args);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('候補を返す。送るのは、件名と本文だけ', async () => {
    const result = await checkTyposRemotely(
      'anthropic',
      '資料の件',
      '資料をを送付いたします。',
      deps(),
    );
    expect(result).toEqual({
      status: 'ok',
      candidates: [{ wrong: '資料をを', suggestion: '資料を', reason: '助詞の重複' }],
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe(REMOTE_ENDPOINTS.anthropic);
    expect(sent[0]?.body).toContain('資料をを送付いたします。');
  });

  it('元の文面に無い指摘と、意味を変える候補は捨てる（内蔵の AI と同じ検証を通す）', async () => {
    const result = await checkTyposRemotely(
      'anthropic',
      '件名',
      '本メールへのご返信は不要です。',
      deps({
        send: () =>
          Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve(
                anthropicReply([
                  { wrong: '存在しない箇所', suggestion: '別の文', reason: '作り話' },
                  { wrong: '不要です', suggestion: '必要です', reason: '意味の変更' },
                ]),
              ),
          }),
      }),
    );
    expect(result).toEqual({ status: 'ok', candidates: [] });
  });

  it('API キーが無い・通信が許可されていないときは、通信しない', async () => {
    expect(
      await checkTyposRemotely(
        'openai',
        '件名',
        '本文',
        deps({ loadKey: () => Promise.resolve(undefined) }),
      ),
    ).toEqual({ status: 'no-key' });
    expect(
      await checkTyposRemotely(
        'openai',
        '件名',
        '本文',
        deps({ isAllowed: () => Promise.resolve(false) }),
      ),
    ).toEqual({ status: 'no-key' });
    expect(sent).toHaveLength(0);
  });

  it('件名も本文も空なら、通信しない', async () => {
    expect(await checkTyposRemotely('openai', ' ', '', deps())).toEqual({
      status: 'ok',
      candidates: [],
    });
    expect(sent).toHaveLength(0);
  });

  it('形が正しくない依頼は、通信せずに失敗にする', async () => {
    expect(await checkTyposRemotely('builtin', '件名', '本文', deps())).toEqual({
      status: 'failed',
    });
    expect(await checkTyposRemotely('openai', 1, '本文', deps())).toEqual({ status: 'failed' });
    expect(await checkTyposRemotely('openai', '件名', 'あ'.repeat(200_001), deps())).toEqual({
      status: 'failed',
    });
    expect(sent).toHaveLength(0);
  });

  it('API が失敗を返したら、失敗にする（例外は投げない）。記録に API キー・文面を残さない', async () => {
    const result = await checkTyposRemotely(
      'openai',
      '秘密の件名',
      '秘密の本文',
      deps({
        send: () =>
          Promise.resolve({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ error: { message: `Incorrect API key: ${KEY}` } }),
          }),
      }),
    );
    expect(result).toEqual({ status: 'failed' });
    const text = JSON.stringify(logged);
    expect(text).toContain('401');
    expect(text).not.toContain(KEY);
    expect(text).not.toContain('秘密');
  });

  it('通信の失敗・読めない返答・時間切れは、失敗にする。記録に API キー・文面を残さない', async () => {
    const failing: RemoteTypoDeps['send'][] = [
      () => Promise.reject(new Error(`network error ${KEY} 秘密の本文`)),
      () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ no: 1 }) }),
      () =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.reject(new SyntaxError('Unexpected token 秘密の本文')),
        }),
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    ];
    for (const send of failing) {
      expect(
        await checkTyposRemotely('anthropic', '件名', '秘密の本文', deps({ send, timeoutMs: 20 })),
      ).toEqual({ status: 'failed' });
    }
    const text = JSON.stringify(logged);
    expect(text).not.toContain(KEY);
    expect(text).not.toContain('秘密');
  });
});

describe('API キーの保存', () => {
  let store: Record<string, unknown>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: (key: string) => Promise.resolve(key in store ? { [key]: store[key] } : {}),
          set: (items: Record<string, unknown>) => {
            Object.assign(store, items);
            return Promise.resolve();
          },
          clear: () => {
            store = {};
            return Promise.resolve();
          },
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('提供元ごとに保存・削除できる。設定とは別のキーに保存する', async () => {
    expect(await hasApiKey('openai')).toBe(false);
    await saveApiKey('openai', KEY);
    await saveApiKey('anthropic', `${KEY}-2`);
    expect(await loadApiKey('openai')).toBe(KEY);
    expect(await loadApiKey('anthropic')).toBe(`${KEY}-2`);
    expect(Object.keys(store)).toEqual(['apiKeys']);

    await deleteApiKey('openai');
    expect(await hasApiKey('openai')).toBe(false);
    expect(await hasApiKey('anthropic')).toBe(true);
  });

  it('形が正しくないキーは保存しない。壊れた保存データは、未登録として扱う', async () => {
    await expect(saveApiKey('openai', 'bad key with spaces 0123456789')).rejects.toThrow();
    expect(store).toEqual({});
    store.apiKeys = { openai: 12345, anthropic: 'x' };
    expect(await loadApiKey('openai')).toBeUndefined();
    expect(await loadApiKey('anthropic')).toBeUndefined();
    store.apiKeys = 'broken';
    expect(await loadApiKey('openai')).toBeUndefined();
  });

  it('「保存データをすべて削除」で、API キーも消える', async () => {
    await saveApiKey('anthropic', KEY);
    await clearAllData();
    expect(await hasApiKey('anthropic')).toBe(false);
  });
});

describe('設定画面の「使う AI」', () => {
  it('選択欄の値が読めないときは、内蔵の AI にする（外部に送らない側）', () => {
    const parsed = parseFormValues({
      ...toFormValues(DEFAULT_SETTINGS),
      typoCheckProvider: 'something-else',
    });
    expect(parsed.ok && parsed.settings.typoCheckProvider).toBe('builtin');
    const chosen = parseFormValues({
      ...toFormValues(DEFAULT_SETTINGS),
      typoCheckProvider: 'openai',
    });
    expect(chosen.ok && chosen.settings.typoCheckProvider).toBe('openai');
  });
});
