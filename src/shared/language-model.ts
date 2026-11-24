/**
 * Chrome 内蔵 AI（Gemini Nano）の Prompt API の呼び出し。
 *
 * - 処理はすべて端末の中で行われ、メールの内容が外部に送信されることはない（Chrome の内蔵モデルを使う）。
 *   このファイルの処理で、拡張機能が外部と通信することもない
 *   （外部の AI を使う場合の通信は、src/background/remote-typo.ts にある）。
 * - モデルが使えるかどうかは端末による（空き容量・メモリ・GPU の条件がある）。
 *   使えない端末では「使えない」と分かるだけで、ほかの機能には影響しない。
 * - モデルの初回ダウンロードは、利用者が画面を操作した直後にしか始められない（Chrome の決まり）。
 *   そのため、ダウンロードは設定画面のボタンから行う。
 *
 * 誤字・脱字チェックは補助の機能なので、ここでの失敗は送信を止める理由にしない。
 * 失敗した場合は結果として 'failed' を返し、確認ダイアログにその旨を表示する
 * （CLAUDE.md「失敗時の動作」の例外）。
 */

import {
  TYPO_EXAMPLES,
  TYPO_RESPONSE_SCHEMA,
  TYPO_SYSTEM_PROMPT,
  type TypoCheckResult,
  buildTypoSource,
  hasTextToCheck,
  parseTypoResponse,
} from '../core/typo/typo-check';

/** モデルの状態 */
export type AiAvailability =
  /** この端末・この Chrome では使えない */
  | 'unavailable'
  /** 使えるが、モデルのダウンロードが必要 */
  | 'downloadable'
  /** モデルをダウンロード中 */
  | 'downloading'
  /** すぐに使える */
  | 'available';

/** 解析を打ち切るまでの時間（ミリ秒）。これを超えたら「実行できませんでした」とする */
export const TYPO_CHECK_TIMEOUT_MS = 20_000;

// --- Prompt API の型（このファイルで使う部分だけ） ---------------------------------

interface LanguageModelSession {
  prompt(
    input: string,
    options?: {
      signal?: AbortSignal;
      responseConstraint?: unknown;
      omitResponseConstraintInput?: boolean;
    },
  ): Promise<string>;
  clone(options?: { signal?: AbortSignal }): Promise<LanguageModelSession>;
  destroy(): void;
}

interface DownloadMonitor {
  addEventListener(type: 'downloadprogress', listener: (event: { loaded: number }) => void): void;
}

interface LanguageModelOptions {
  expectedInputs?: readonly { type: 'text'; languages: readonly string[] }[];
  expectedOutputs?: readonly { type: 'text'; languages: readonly string[] }[];
  initialPrompts?: readonly { role: 'system' | 'user' | 'assistant'; content: string }[];
  monitor?: (monitor: DownloadMonitor) => void;
  signal?: AbortSignal;
}

interface LanguageModelApi {
  availability(options?: LanguageModelOptions): Promise<string>;
  create(options?: LanguageModelOptions): Promise<LanguageModelSession>;
}

/** 指示は日本語、入力も出力も日本語（状態の確認と作成で、同じ指定を使う必要がある） */
const LANGUAGE_OPTIONS = {
  expectedInputs: [{ type: 'text', languages: ['ja'] }],
  expectedOutputs: [{ type: 'text', languages: ['ja'] }],
} as const satisfies LanguageModelOptions;

/** Prompt API を返す。この Chrome に無ければ undefined */
function getApi(): LanguageModelApi | undefined {
  const api = (globalThis as { LanguageModel?: Partial<LanguageModelApi> }).LanguageModel;
  return typeof api?.availability === 'function' && typeof api.create === 'function'
    ? (api as LanguageModelApi)
    : undefined;
}

/** モデルの状態を調べる。調べられない場合は 'unavailable' */
export async function getAiAvailability(): Promise<AiAvailability> {
  const api = getApi();
  if (api === undefined) return 'unavailable';
  try {
    const state = await api.availability(LANGUAGE_OPTIONS);
    return state === 'available' || state === 'downloadable' || state === 'downloading'
      ? state
      : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

/**
 * モデルをダウンロードする。利用者の操作（ボタンのクリックなど）の直後に呼ぶこと。
 * @param onProgress 進み具合（0〜1）を受け取る
 */
export async function downloadAiModel(onProgress: (ratio: number) => void): Promise<void> {
  const api = getApi();
  if (api === undefined) throw new Error('The Prompt API is not available in this browser');
  const session = await api.create({
    ...LANGUAGE_OPTIONS,
    monitor(monitor) {
      monitor.addEventListener('downloadprogress', (event) => {
        onProgress(event.loaded);
      });
    },
  });
  session.destroy();
}

/** 誤字・脱字チェックの入力 */
export interface TypoCheckInput {
  readonly subject: string;
  readonly bodyText: string;
}

/** 誤字・脱字チェックを行うもの */
export interface TypoChecker {
  /**
   * 件名と本文を調べる。例外は投げず、失敗は結果（status）で返す。
   * @param signal 中止の合図（確認ダイアログが閉じられたときなど）
   */
  check(input: TypoCheckInput, signal?: AbortSignal): Promise<TypoCheckResult>;
  /**
   * モデルを先に読み込んでおく（最初のチェックを速くするため）。
   * モデルがすぐ使える状態のときだけ読み込み、未ダウンロードのときは何もしない。例外は投げない。
   */
  warmUp(): Promise<void>;
}

/**
 * 誤字・脱字チェックを作る。
 * 指示（システムプロンプト）を読み込ませたセッションを1つ保持し、チェックのたびに複製して使う
 * （前のメールの内容が次のチェックに混ざらないようにするため）。
 */
export function createTypoChecker(timeoutMs: number = TYPO_CHECK_TIMEOUT_MS): TypoChecker {
  let base: Promise<LanguageModelSession> | undefined;

  const getBase = (api: LanguageModelApi): Promise<LanguageModelSession> => {
    base ??= api
      .create({
        ...LANGUAGE_OPTIONS,
        initialPrompts: [
          { role: 'system', content: TYPO_SYSTEM_PROMPT },
          ...TYPO_EXAMPLES.flatMap((example) => [
            { role: 'user' as const, content: example.input },
            { role: 'assistant' as const, content: example.output },
          ]),
        ],
      })
      .catch((error: unknown) => {
        // 作成に失敗した場合は、次のチェックで作り直せるようにする
        base = undefined;
        throw error;
      });
    return base;
  };

  return {
    async warmUp() {
      try {
        const api = getApi();
        if (api === undefined || (await getAiAvailability()) !== 'available') return;
        await getBase(api);
      } catch (error) {
        console.error('[gmail-send-guard] failed to warm up the language model', error);
      }
    },

    async check(input, signal) {
      if (!hasTextToCheck(input.subject, input.bodyText)) return { status: 'ok', candidates: [] };

      const api = getApi();
      if (api === undefined) return { status: 'not-ready' };
      if ((await getAiAvailability()) !== 'available') return { status: 'not-ready' };

      // 時間切れと、呼び出し側からの中止のどちらでも打ち切る
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, timeoutMs);
      const onAbort = (): void => {
        controller.abort();
      };
      signal?.addEventListener('abort', onAbort);
      if (signal?.aborted === true) controller.abort();

      let session: LanguageModelSession | undefined;
      try {
        controller.signal.throwIfAborted();
        session = await (await getBase(api)).clone({ signal: controller.signal });
        const source = buildTypoSource(input.subject, input.bodyText);
        // 複製を待っている間に中止されていたら、AI を呼ばずに終える
        controller.signal.throwIfAborted();
        const raw = await session.prompt(source, {
          signal: controller.signal,
          responseConstraint: TYPO_RESPONSE_SCHEMA,
          // 返答の形は指示文とお手本で伝えているので、スキーマそのものは入力に含めない（入力を短くして速くする）
          omitResponseConstraintInput: true,
        });
        return { status: 'ok', candidates: parseTypoResponse(raw, source) };
      } catch (error) {
        if (signal?.aborted !== true) {
          console.error('[gmail-send-guard] typo check failed', error);
        }
        return { status: 'failed' };
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        session?.destroy();
      }
    },
  };
}
