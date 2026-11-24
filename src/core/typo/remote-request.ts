/**
 * 外部の AI（OpenAI・Anthropic の API）による誤字・脱字チェックの、純粋な処理の部分。
 *
 * ここでは「API に送る内容を作る」「API の返答から、候補の JSON の文字列を取り出す」だけを行う。
 * 実際の通信は src/background/remote-typo.ts にある（通信をするのは、そのファイルだけ）。
 *
 * 費用を抑えるための決まり：
 * - 送るのは、件名と本文（引用部分を除く）だけ。長いメールは先頭から MAX_INPUT_LENGTH 文字まで（buildTypoSource）
 * - 返答は「誤り → 修正案」の JSON だけにさせる（修正後の全文は返させない）
 * - 推論（思考）は使わない。推論に使ったトークンは出力として課金されるため
 * - 使うモデルは、それぞれの一番軽いモデル
 */

import {
  MAX_CANDIDATES,
  TYPO_EXAMPLES,
  TYPO_RESPONSE_SCHEMA,
  TYPO_SYSTEM_PROMPT,
} from './typo-check';

/** 外部の AI の提供元 */
export type RemoteProvider = 'openai' | 'anthropic';

export const REMOTE_PROVIDERS: readonly RemoteProvider[] = ['openai', 'anthropic'];

/** 使うモデル（それぞれの一番軽いモデル。2026年11月に公式の資料で確認） */
export const REMOTE_MODELS: Readonly<Record<RemoteProvider, string>> = {
  openai: 'gpt-6-luna',
  anthropic: 'claude-haiku-5-5',
};

/** 通信先。ここ以外には送らない */
export const REMOTE_ENDPOINTS: Readonly<Record<RemoteProvider, string>> = {
  openai: 'https://api.openai.com/v1/responses',
  anthropic: 'https://api.anthropic.com/v1/messages',
};

/** 通信の許可を求める範囲（manifest の optional_host_permissions と同じ） */
export const REMOTE_ORIGINS: Readonly<Record<RemoteProvider, string>> = {
  openai: 'https://api.openai.com/*',
  anthropic: 'https://api.anthropic.com/*',
};

/** 返答の長さの上限（トークン）。候補は最大 MAX_CANDIDATES 件の短い JSON なので、これで足りる */
export const MAX_REMOTE_OUTPUT_TOKENS = 1024;

/** Anthropic の API の版 */
const ANTHROPIC_VERSION = '2026-10-21';

/** API キーとして受け付ける長さ */
const MIN_API_KEY_LENGTH = 20;
const MAX_API_KEY_LENGTH = 400;

/** API の返答を読めなかったときの例外の文言（返答の中身を含めない） */
const UNREADABLE_MESSAGE = 'Could not read the response from the remote model';

/** API への依頼1回分 */
export interface RemoteRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  /** JSON にした本体 */
  readonly body: string;
}

/**
 * API キーらしい文字列か（空白や制御文字を含まない、ASCII の文字列）。
 * ヘッダーに入れる値なので、改行などが混ざったものは受け付けない。
 */
export function looksLikeApiKey(value: string): boolean {
  return (
    value.length >= MIN_API_KEY_LENGTH &&
    value.length <= MAX_API_KEY_LENGTH &&
    /^[\x21-\x7e]+$/u.test(value)
  );
}

/** 受け取った値が、外部の AI の提供元か */
export function isRemoteProvider(value: unknown): value is RemoteProvider {
  return REMOTE_PROVIDERS.some((provider) => provider === value);
}

/**
 * Anthropic に渡す返答の形。
 * Anthropic の JSON スキーマは件数の上限（maxItems）に対応していないため、取り除いたものを使う
 * （件数は、返答を読むとき parseTypoResponse で MAX_CANDIDATES 件までに絞る）。
 */
const ANTHROPIC_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      items: TYPO_RESPONSE_SCHEMA.properties.candidates.items,
    },
  },
  required: ['candidates'],
  additionalProperties: false,
} as const;

/** お手本（入力と、望ましい返答の組）を、会話の形にする */
function exampleTurns(): { role: 'user' | 'assistant'; content: string }[] {
  return TYPO_EXAMPLES.flatMap((example) => [
    { role: 'user' as const, content: example.input },
    { role: 'assistant' as const, content: example.output },
  ]);
}

/** 件数の上限を、指示文でも伝える（スキーマで上限を指定できない提供元があるため） */
const SYSTEM_PROMPT = `${TYPO_SYSTEM_PROMPT}\n候補は最大${String(MAX_CANDIDATES)}件までにしてください。`;

/**
 * API に送る内容を作る。
 * @param source 調べる文面（buildTypoSource の結果。件名と、引用を除いた本文）
 */
export function buildRemoteRequest(
  provider: RemoteProvider,
  apiKey: string,
  source: string,
): RemoteRequest {
  if (provider === 'openai') {
    return {
      url: REMOTE_ENDPOINTS.openai,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: REMOTE_MODELS.openai,
        input: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...exampleTurns(),
          { role: 'user', content: source },
        ],
        // 推論は使わない（推論のトークンは出力として課金される）
        reasoning: { effort: 'none' },
        max_output_tokens: MAX_REMOTE_OUTPUT_TOKENS,
        // 送った内容を、提供元の側に会話として残さない
        store: false,
        text: {
          format: {
            type: 'json_schema',
            name: 'typo_candidates',
            strict: true,
            schema: TYPO_RESPONSE_SCHEMA,
          },
        },
      }),
    };
  }
  return {
    url: REMOTE_ENDPOINTS.anthropic,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      // ブラウザ（拡張機能）から直接呼ぶときに必要な指定
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: REMOTE_MODELS.anthropic,
      max_tokens: MAX_REMOTE_OUTPUT_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [...exampleTurns(), { role: 'user', content: source }],
      // 思考は使わない（思考のトークンは出力として課金される）
      thinking: { type: 'disabled' },
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: ANTHROPIC_RESPONSE_SCHEMA },
      },
    }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 配列の中から、type が合う最初の要素を返す */
function findByType(items: unknown, type: string): Record<string, unknown> | undefined {
  if (!Array.isArray(items)) return undefined;
  return (items as unknown[]).filter(isRecord).find((item) => item.type === type);
}

/**
 * API の返答（JSON として読んだもの）から、候補の JSON の文字列を取り出す。
 * 途中で打ち切られた返答・断られた返答・形が違う返答は、例外にする
 * （例外には、返答の中身を含めない。メールの文面の一部が、記録に残らないようにするため）。
 */
export function readRemoteResponse(provider: RemoteProvider, payload: unknown): string {
  if (!isRecord(payload)) throw new Error(UNREADABLE_MESSAGE);

  if (provider === 'openai') {
    // 上限に達して途中で終わった返答は、JSON として読めないので使わない
    if (payload.status !== 'completed') throw new Error(UNREADABLE_MESSAGE);
    const message = findByType(payload.output, 'message');
    const part = findByType(message?.content, 'output_text');
    if (typeof part?.text !== 'string') throw new Error(UNREADABLE_MESSAGE);
    return part.text;
  }

  if (payload.stop_reason !== 'end_turn') throw new Error(UNREADABLE_MESSAGE);
  const block = findByType(payload.content, 'text');
  if (typeof block?.text !== 'string') throw new Error(UNREADABLE_MESSAGE);
  return block.text;
}
