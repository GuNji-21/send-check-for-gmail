/**
 * 外部の AI による誤字・脱字チェックの依頼。content script から使う。
 *
 * 通信は background で行う（API キーを、Gmail のページ上で動くコードに持たせないため）。
 * ここでは、件名と本文（引用部分を除く）をメッセージで渡し、結果を受け取るだけ。
 */

import type { RemoteProvider } from '../core/typo/remote-request';
import type { TypoCheckResult } from '../core/typo/typo-check';
import type { ExtensionMessage, ExtensionResponse } from './messages';

/**
 * 外部の AI で、件名と本文を調べる。例外は投げず、失敗は結果（status）で返す
 * （誤字・脱字チェックの失敗では、送信を止めないため）。
 */
export async function checkTyposWithRemoteAi(
  provider: RemoteProvider,
  input: { readonly subject: string; readonly bodyText: string },
): Promise<TypoCheckResult> {
  try {
    const response = await chrome.runtime.sendMessage<
      ExtensionMessage,
      ExtensionResponse<TypoCheckResult> | undefined
    >({ type: 'typo/check', provider, subject: input.subject, bodyText: input.bodyText });
    return response?.ok === true ? response.value : { status: 'failed' };
  } catch (error) {
    console.error(
      '[gmail-send-guard] failed to request the remote typo check',
      error instanceof Error ? error.name : 'unknown error',
    );
    return { status: 'failed' };
  }
}
