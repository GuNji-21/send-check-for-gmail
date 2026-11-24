/**
 * 外部の AI（OpenAI・Anthropic）の API キーの読み書き（chrome.storage.local）。
 *
 * - API キーは、利用者が設定画面で登録したものを、端末の中にだけ保存する。
 * - 設定（settings）とは別のキーに保存する。content script は設定だけを読み、API キーは読まない
 *   （Gmail のページ上で動くコードに、API キーを持たせないため）。API キーを使うのは background だけ。
 * - API キーを、ログ・例外・画面に出さない。設定画面でも、登録済みかどうかだけを表示する。
 * - 設定画面の「保存データをすべて削除」（clearAllData）で、API キーも削除される。
 */

import { type RemoteProvider, looksLikeApiKey } from '../core/typo/remote-request';

/** chrome.storage.local に保存するときのキー */
const STORAGE_KEY = 'apiKeys';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function loadAll(): Promise<Record<string, unknown>> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const value: unknown = stored[STORAGE_KEY];
  return isRecord(value) ? value : {};
}

/** API キーを読む。登録されていない・形が正しくない場合は undefined */
export async function loadApiKey(provider: RemoteProvider): Promise<string | undefined> {
  const value = (await loadAll())[provider];
  return typeof value === 'string' && looksLikeApiKey(value) ? value : undefined;
}

/** API キーが登録されているか */
export async function hasApiKey(provider: RemoteProvider): Promise<boolean> {
  return (await loadApiKey(provider)) !== undefined;
}

/** API キーを保存する。形が正しくない場合は例外（例外に、キーの中身は含めない） */
export async function saveApiKey(provider: RemoteProvider, apiKey: string): Promise<void> {
  if (!looksLikeApiKey(apiKey)) throw new Error('The API key is not in a valid form');
  await chrome.storage.local.set({ [STORAGE_KEY]: { ...(await loadAll()), [provider]: apiKey } });
}

/** API キーを削除する */
export async function deleteApiKey(provider: RemoteProvider): Promise<void> {
  const rest = Object.fromEntries(
    Object.entries(await loadAll()).filter(([name]) => name !== provider),
  );
  await chrome.storage.local.set({ [STORAGE_KEY]: rest });
}
