/**
 * 届いたメールからの、連絡先の補完（フェーズ2b）。
 *
 * 利用者が設定で「連絡先の記録」と「届いたメールからも連絡先を補う」の両方を有効にしているときだけ、
 * 画面に開いたメールの送信元・宛先・署名を読み、background に渡して台帳を補う。
 * 署名からの読み取り（会社名・電話番号など）はここで済ませ、本文そのものは background に渡さない。
 *
 * 送信とは関係のない補助の機能なので、失敗しても画面には何も出さない（コンソールに記録するだけ）。
 */

import { isInternalAddress } from '../core/classify';
import type { ReceivedMail } from '../core/ledger/received';
import { extractSignature } from '../core/ledger/signature';
import type { ClassificationRules } from '../core/types';
import { type OpenMessage, readOpenMessages } from '../gmail/message-view';

/** 画面の変化が落ち着くのを待つ時間（ミリ秒）。Gmail は画面を細かく書き換えるので、まとめて1回だけ読む */
export const RECEIVED_READ_DELAY_MS = 1500;

/** 処理済みとして覚えておくメールの件数（これを超えたら、古いものから忘れる） */
const MAX_REMEMBERED = 500;

export interface ReceivedReaderSettings {
  readonly rules: ClassificationRules;
  readonly ledgerEnabled: boolean;
  readonly ledgerReadReceived: boolean;
}

export interface ReceivedReaderOptions {
  readonly view: Window & typeof globalThis;
  getSettings(): Promise<ReceivedReaderSettings>;
  /** 届いたメール1通の情報を、台帳に渡す */
  record(mail: ReceivedMail): Promise<unknown>;
}

/** 開いたメール1通を、台帳に渡す形にする */
export function toReceivedMail(message: OpenMessage, rules: ClassificationRules): ReceivedMail {
  // 送信元アドレスは分からないので、社内かどうかは登録（社内のドメイン・アドレス）だけで判断する。
  // 自分の会社のドメインは台帳に無いので、background 側で記録の対象から外れる
  const context = { rules, fromAddress: '' };
  return {
    sender: message.sender,
    others: message.others.filter((person) => !isInternalAddress(person.address, context)),
    signature: extractSignature({
      bodyText: message.bodyText,
      senderAddress: message.sender.address,
      ...(message.signatureText === undefined ? {} : { signatureText: message.signatureText }),
      ...(message.sender.name === undefined ? {} : { senderName: message.sender.name }),
    }),
  };
}

/** 届いたメールの読み取りを始める。戻り値の関数を呼ぶと止まる */
export function startReceivedReader(options: ReceivedReaderOptions): () => void {
  const { view } = options;
  const done = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const read = async (): Promise<void> => {
    const settings = await options.getSettings();
    if (!settings.ledgerEnabled || !settings.ledgerReadReceived) return;
    for (const message of readOpenMessages(view.document)) {
      if (done.has(message.id)) continue;
      done.add(message.id);
      if (done.size > MAX_REMEMBERED) {
        const oldest = done.values().next().value;
        if (oldest !== undefined) done.delete(oldest);
      }
      // 社内の人から届いたメールは対象外
      if (isInternalAddress(message.sender.address, { rules: settings.rules, fromAddress: '' })) {
        continue;
      }
      await options.record(toReceivedMail(message, settings.rules));
    }
  };

  const schedule = (): void => {
    // すでに予定があれば、そのままにする（画面が変わり続けていても、一定の間隔で読めるようにする）
    if (timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      read().catch((error: unknown) => {
        console.error('[gmail-send-guard] failed to read a received message', error);
      });
    }, RECEIVED_READ_DELAY_MS);
  };

  const observer = new view.MutationObserver(schedule);
  observer.observe(view.document.documentElement, { childList: true, subtree: true });
  schedule();
  return () => {
    observer.disconnect();
    if (timer !== undefined) clearTimeout(timer);
  };
}
