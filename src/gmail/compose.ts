/**
 * Gmail の作成画面の読み取り。
 * 対象：新規作成、返信、全員に返信、転送、インライン返信、ポップアウト、全画面表示。
 *
 * 作成画面の DOM から送信元・宛先（To/Cc/Bcc）・件名・本文・添付を読み取り、
 * src/core/ に渡すための ComposeSnapshot に変換する。
 * Gmail の DOM を直接触るのは src/gmail/ の中だけにする。
 *
 * - 本文は、返信・転送時の引用部分（過去メール）を取り除いてから bodyText に入れる
 * - 送信元アドレスは作成画面ごとに読み取る（複数アカウント・別名送信に対応するため）
 * - 送信元を含め、必要な要素が見つからない場合は例外を投げる
 *   （呼び出し側で「チェックできませんでした」として送信を止める）
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
