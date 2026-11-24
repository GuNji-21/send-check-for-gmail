/**
 * 外部の AI（OpenAI・Anthropic の API）による誤字・脱字チェックの通信。
 *
 * この拡張機能で外部と通信するのは、このファイルだけ。
 * - 通信するのは、利用者が設定画面で外部の AI を選び、自分の API キーを登録し、通信を許可したときだけ。
 * - 通信先は、選んだ提供元の API だけ（src/core/typo/remote-request.ts の REMOTE_ENDPOINTS）。
 * - 送るのは、件名と本文（引用部分を除く）だけ。宛先・添付ファイル名・連絡先の記録は送らない。
 * - API キーと、送った文面・返答の中身は、ログにも例外にも出さない。
 *
 * 誤字・脱字チェックは補助の機能なので、ここでの失敗は送信を止める理由にしない。
 * 失敗は結果（status）で返し、確認ダイアログにその旨を表示する（CLAUDE.md「失敗時の動作」の例外）。
 */

import {
  REMOTE_ORIGINS,
  type RemoteProvider,
  buildRemoteRequest,
  isRemoteProvider,
  readRemoteResponse,
} from '../core/typo/remote-request';
import {
  type TypoCheckResult,
  buildTypoSource,
  hasTextToCheck,
  parseTypoResponse,
} from '../core/typo/typo-check';
import { loadApiKey } from '../storage/api-keys';

/** 返答を待つ時間（ミリ秒）。これを超えたら「実行できませんでした」とする */
export const REMOTE_TYPO_TIMEOUT_MS = 20_000;

/** 件名・本文として受け付ける長さ（メッセージの中身は信頼しない。実際に送る長さは buildTypoSource で絞る） */
const MAX_FIELD_LENGTH = 200_000;

/** 通信に使うもの（テストで差し替えられるようにしている） */
export interface RemoteTypoDeps {
  readonly loadKey: (provider: RemoteProvider) => Promise<string | undefined>;
  /** 利用者が、その提供元への通信を許可しているか */
  readonly isAllowed: (provider: RemoteProvider) => Promise<boolean>;
  readonly send: (
    url: string,
    init: {
      method: 'POST';
      headers: Readonly<Record<string, string>>;
      body: string;
      signal: AbortSignal;
    },
  ) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
  readonly timeoutMs: number;
}

const DEFAULT_DEPS: RemoteTypoDeps = {
  loadKey: loadApiKey,
  isAllowed: (provider) => chrome.permissions.contains({ origins: [REMOTE_ORIGINS[provider]] }),
  // 資格情報（Cookie など）は付けない。リダイレクト先には送らない
  send: (url, init) => fetch(url, { ...init, credentials: 'omit', redirect: 'error' }),
  timeoutMs: REMOTE_TYPO_TIMEOUT_MS,
};

/**
 * 外部の AI で、件名と本文を調べる。例外は投げず、失敗は結果（status）で返す。
 * 引数はメッセージで届いた値なので、形を確かめてから使う。
 */
export async function checkTyposRemotely(
  provider: unknown,
  subject: unknown,
  bodyText: unknown,
  deps: RemoteTypoDeps = DEFAULT_DEPS,
): Promise<TypoCheckResult> {
  if (!isRemoteProvider(provider) || typeof subject !== 'string' || typeof bodyText !== 'string') {
    return { status: 'failed' };
  }
  if (subject.length > MAX_FIELD_LENGTH || bodyText.length > MAX_FIELD_LENGTH) {
    return { status: 'failed' };
  }
  if (!hasTextToCheck(subject, bodyText)) return { status: 'ok', candidates: [] };

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, deps.timeoutMs);
  try {
    const apiKey = await deps.loadKey(provider);
    if (apiKey === undefined || !(await deps.isAllowed(provider))) return { status: 'no-key' };

    const source = buildTypoSource(subject, bodyText);
    const request = buildRemoteRequest(provider, apiKey, source);
    const response = await deps.send(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    });
    if (!response.ok) {
      // 返答の本体は記録しない（状態の番号だけ）。401 はキーの誤り、429 は残高・回数の上限など
      console.error('[gmail-send-guard] remote typo check failed', provider, response.status);
      return { status: 'failed' };
    }
    const raw = readRemoteResponse(provider, await response.json());
    return { status: 'ok', candidates: parseTypoResponse(raw, source) };
  } catch (error) {
    // 例外の文言だけを記録する（API キーや文面は、例外に含めていない）
    console.error(
      '[gmail-send-guard] remote typo check failed',
      error instanceof Error ? error.name : 'unknown error',
    );
    return { status: 'failed' };
  } finally {
    clearTimeout(timer);
  }
}
