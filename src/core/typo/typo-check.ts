/**
 * AI（Chrome 内蔵の Gemini Nano）による誤字・脱字チェックの、純粋な処理の部分。
 *
 * ここでは「AI に渡す文面を作る」「AI が返した JSON を検証して候補にする」だけを行う。
 * AI の呼び出しそのもの（Prompt API）は src/shared/language-model.ts にある。
 *
 * AI の返答は必ずしも正しくないため、そのまま表示せずに検証する：
 * - JSON として読めない、形が違う場合は例外を投げる（呼び出し側で「実行できませんでした」と表示する）
 * - 指摘された箇所が元の文面に存在しない候補は捨てる（AI の作り話を表示しないため）
 * - 修正案が元と同じ・空の候補は捨てる
 * - 意味を変える候補（否定の入れ替え、数字・日付の変更など）と、言い換えの候補は捨てる（typo-filter.ts）
 */

import { hasControlCharacter, isSafeTypoFix } from './typo-filter';

/** 誤字・脱字の候補1件 */
export interface TypoCandidate {
  /** 誤りと思われる箇所（元の文面にある表記のまま） */
  readonly wrong: string;
  /** 修正案 */
  readonly suggestion: string;
  /** 理由（短い説明） */
  readonly reason: string;
}

/** AI による誤字・脱字チェックの結果 */
export type TypoCheckResult =
  /** 解析できた（candidates が空なら、候補なし） */
  | { readonly status: 'ok'; readonly candidates: readonly TypoCandidate[] }
  /** モデルがまだ使えない（未ダウンロード、ダウンロード中、端末が非対応） */
  | { readonly status: 'not-ready' }
  /** 外部の AI を使う設定だが、API キーが登録されていない、または通信が許可されていない */
  | { readonly status: 'no-key' }
  /** 解析に失敗した（時間切れ、返答が読めない、など） */
  | { readonly status: 'failed' };

/** AI に渡す文面の最大文字数（長いメールは先頭からこの長さまでを調べる） */
export const MAX_INPUT_LENGTH = 4000;

/** 表示する候補の上限 */
export const MAX_CANDIDATES = 5;

/** 1つの候補の各項目の最大文字数（これを超える返答は、誤字の指摘として不自然なので捨てる） */
const MAX_FIELD_LENGTH = 60;
const MAX_REASON_LENGTH = 120;

/**
 * AI の返答のうち、調べる候補の上限。
 * 返答の形は MAX_CANDIDATES 件までと指定しているが、守られない場合に備えて、
 * これより後ろの要素は中身を見ずに無視する（異常に長い返答で画面を固まらせないため）。
 */
export const MAX_INSPECTED_ITEMS = 20;

/** AI の返答を読めなかったときの例外の文言（返答の中身を含めない） */
const UNREADABLE_RESPONSE_MESSAGE = 'Could not read the response from the language model';

/** AI への指示（役割と出力の決まり） */
export const TYPO_SYSTEM_PROMPT = [
  'あなたは日本語のビジネスメールの校正者です。',
  '与えられたメールの件名と本文から、文字の打ち間違いだけを見つけてください。',
  '指摘してよいもの：誤字、脱字、誤変換、同じ助詞や文字の重複、送り仮名の誤り。これ以外は指摘しないでください。',
  '意味を変える修正は挙げないでください。肯定と否定の入れ替え（例：不要→必要、できます→できません）、数字・日付・曜日・金額の変更は、書き手の意図を変えるため禁止です。',
  '言い換え、敬語の変更、文章の改善提案も挙げないでください（例：「お願いします」を「お願いいたします」に変えない）。',
  '固有名詞（人名・会社名・商品名）、メールアドレス、URL も指摘しないでください。',
  '正しい表現には何も指摘しないでください。誤りかどうか確信が持てないものは挙げないでください。',
  '出力は JSON のみ。形式：{"candidates":[{"wrong":"誤りの箇所","suggestion":"修正案","reason":"理由"}]}',
  'wrong は本文の表記のまま、前後の文字を少し含めて、その箇所が1か所に決まるように書いてください（3〜15文字）。',
  'suggestion は wrong をそのまま置き換えられる形で、1〜2文字だけを直したものにしてください。reason は10文字以内。',
  '誤りが無い場合は {"candidates":[]} を返してください。',
].join('\n');

/**
 * AI に見せるお手本（入力と、望ましい返答の組）。
 * 1つ目：誤りのある文と、正しい文（言い換えたくなる文）を混ぜ、誤りだけを指摘する例。
 * 2つ目：誤りの無い例。「不要です」のような正しい文に、意味を変える指摘を付けないようにさせる。
 */
export const TYPO_EXAMPLES: readonly { readonly input: string; readonly output: string }[] = [
  {
    input:
      '件名：資料送付の件\n本文：\nお世話になっております。内容をご確認ください。資料をを送付いたします。今後ともよろしくお願いしす。',
    output: JSON.stringify({
      candidates: [
        { wrong: '資料をを', suggestion: '資料を', reason: '助詞の重複' },
        { wrong: 'よろしくお願いしす', suggestion: 'よろしくお願いします', reason: '脱字' },
      ],
    }),
  },
  {
    input:
      '件名：お打ち合わせの日程\n本文：\nいつもお世話になっております。資料を送付いたします。本メールへのご返信は不要です。よろしくお願いします。',
    output: JSON.stringify({ candidates: [] }),
  },
];

/** AI の返答の形（JSON スキーマ）。Prompt API の responseConstraint に渡す */
export const TYPO_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      maxItems: MAX_CANDIDATES,
      items: {
        type: 'object',
        properties: {
          wrong: { type: 'string' },
          suggestion: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['wrong', 'suggestion', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['candidates'],
  additionalProperties: false,
} as const;

/** 調べる対象の文面（件名と本文をつなげ、長すぎる場合は切り詰めたもの） */
export function buildTypoSource(subject: string, bodyText: string): string {
  const source = `件名：${subject.trim()}\n本文：\n${bodyText.trim()}`;
  return source.length > MAX_INPUT_LENGTH ? source.slice(0, MAX_INPUT_LENGTH) : source;
}

/** 調べる内容があるか（件名も本文も空なら、AI を呼ぶ必要がない） */
export function hasTextToCheck(subject: string, bodyText: string): boolean {
  return subject.trim() !== '' || bodyText.trim() !== '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * AI の返答（JSON の文字列）を検証して、表示する候補にする。
 * JSON として読めない・形が違う場合は例外を投げる。
 * 例外には、返答の中身を含めない（メールの文面の一部が、記録に残らないようにするため）。
 *
 * @param raw AI の返答
 * @param source AI に渡した文面（buildTypoSource の結果）。指摘が実在するかの確認に使う
 */
export function parseTypoResponse(raw: string, source: string): TypoCandidate[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // JSON.parse の例外には返答の一部が入るため、そのまま投げ直さない
    throw new Error(UNREADABLE_RESPONSE_MESSAGE);
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.candidates)) {
    throw new Error(UNREADABLE_RESPONSE_MESSAGE);
  }

  const items = parsed.candidates as unknown[];
  const inspected = Math.min(items.length, MAX_INSPECTED_ITEMS);
  const candidates: TypoCandidate[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < inspected; index++) {
    const item = items[index];
    if (!isRecord(item)) continue;
    const { wrong, suggestion, reason } = item;
    if (typeof wrong !== 'string' || typeof suggestion !== 'string') continue;

    const wrongText = wrong.trim();
    const suggestionText = suggestion.trim();
    const reasonText = typeof reason === 'string' ? reason.trim() : '';
    if (wrongText === '' || suggestionText === '' || wrongText === suggestionText) continue;
    if (wrongText.length > MAX_FIELD_LENGTH || suggestionText.length > MAX_FIELD_LENGTH) continue;
    if (hasControlCharacter(wrongText) || hasControlCharacter(suggestionText)) continue;
    // 元の文面に無い箇所への指摘は、AI の作り話なので捨てる
    const position = source.indexOf(wrongText);
    if (position < 0) continue;

    // 意味を変える候補・言い換えの候補は捨てる。
    // 判定は、メールに反映するときと同じく、前後との重なりを取り除いた修正案で行う
    const replacement = fitSuggestion(
      source.slice(0, position),
      wrongText,
      suggestionText,
      source.slice(position + wrongText.length),
    );
    if (!isSafeTypoFix(wrongText, replacement)) continue;

    const key = `${wrongText}\u0000${suggestionText}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      wrong: wrongText,
      suggestion: suggestionText,
      reason: reasonText.slice(0, MAX_REASON_LENGTH),
    });
    if (candidates.length >= MAX_CANDIDATES) break;
  }
  return candidates;
}

/**
 * 修正案を、前後の文字と重ならない形に整える。
 *
 * AI は、誤りの箇所（wrong）よりも広い範囲を修正案（suggestion）に含めて返すことがある。
 * 例：本文「アリががとうございます」に対して wrong「アリががとう」、suggestion「ありがとうございます」。
 * そのまま置き換えると「ありがとうございますございます」になってしまうため、
 * 修正案の末尾（先頭）が、直後（直前）の文字と同じ場合は、その重なりを取り除く。
 *
 * @param before 誤りの箇所の直前にある文字
 * @param wrong 誤りの箇所
 * @param suggestion 修正案
 * @param after 誤りの箇所の直後にある文字
 */
export function fitSuggestion(
  before: string,
  wrong: string,
  suggestion: string,
  after: string,
): string {
  let fitted = suggestion;

  // 末尾の重なり：修正案の末尾が直後の文字と同じで、誤りの箇所の末尾とは違う場合
  for (let length = Math.min(fitted.length - 1, after.length); length >= 2; length--) {
    const tail = fitted.slice(-length);
    if (after.startsWith(tail) && !wrong.endsWith(tail)) {
      fitted = fitted.slice(0, -length);
      break;
    }
  }
  // 先頭の重なり：修正案の先頭が直前の文字と同じで、誤りの箇所の先頭とは違う場合
  for (let length = Math.min(fitted.length - 1, before.length); length >= 2; length--) {
    const head = fitted.slice(0, length);
    if (before.endsWith(head) && !wrong.startsWith(head)) {
      fitted = fitted.slice(length);
      break;
    }
  }
  return fitted;
}
