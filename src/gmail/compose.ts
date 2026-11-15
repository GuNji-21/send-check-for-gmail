/**
 * Gmail の作成画面（新規作成・返信・転送のウィンドウ）の読み取り。
 *
 * 作成画面の DOM から宛先（To/Cc/Bcc）・件名・本文・添付を読み取り、
 * src/core/ に渡すための ComposeSnapshot に変換する。
 * Gmail の DOM を直接触るのは src/gmail/ の中だけにする。
 *
 * TODO(フェーズ1): 実装する。
 */

import type { ComposeSnapshot } from '../core/types';

/** ページ内で開いている作成画面の要素を列挙する */
export function findComposeWindows(_root: ParentNode): readonly HTMLElement[] {
  throw new Error('Not implemented: findComposeWindows');
}

/** 作成画面の要素から送信内容のスナップショットを作る */
export function readComposeSnapshot(_compose: HTMLElement, _capturedAt: Date): ComposeSnapshot {
  throw new Error('Not implemented: readComposeSnapshot');
}
