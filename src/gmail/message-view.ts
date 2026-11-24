/**
 * 届いたメールの表示画面の読み取り（フェーズ2b）。
 *
 * 画面に開いているメールから、送信元・宛先に入っている人・本文（引用を除く）・署名を読む。
 * 作成画面と違い、読めなくても送信には影響しないので、読めないメールは黙って飛ばす
 * （Gmail の画面が変わったときは、補完が行われなくなるだけにする）。
 */

import { toPlainText } from './compose';
import { SELECTORS } from './selectors';

export interface MessagePerson {
  readonly address: string;
  /** 表示名。無ければ省略 */
  readonly name?: string;
}

/** 画面に開いているメール1通 */
export interface OpenMessage {
  /** メールの識別子（同じメールを何度も処理しないために使う） */
  readonly id: string;
  readonly sender: MessagePerson;
  /** 宛先（To・Cc）に入っている人。To と Cc の区別は、表示言語に依存するので読まない */
  readonly others: readonly MessagePerson[];
  /** 本文（引用を除く） */
  readonly bodyText: string;
  /** 署名として印が付いている部分（引用の外にあるもの）。無ければ省略 */
  readonly signatureText?: string;
}

function personOf(element: Element): MessagePerson | undefined {
  const address = element.getAttribute('email')?.trim() ?? '';
  if (address === '') return undefined;
  const name = element.getAttribute('name')?.trim() ?? '';
  return name === '' ? { address } : { address, name };
}

/** 画面に開いているメール（本文が表示されているもの）を読む */
export function readOpenMessages(root: ParentNode): OpenMessage[] {
  const messages: OpenMessage[] = [];
  for (const container of root.querySelectorAll(SELECTORS.message)) {
    const id = container.getAttribute('data-legacy-message-id') ?? '';
    const senderElement = container.querySelector(SELECTORS.messageSender);
    const body = container.querySelector(SELECTORS.messageBody);
    // 折りたたまれているメールには、本文が無い
    if (id === '' || senderElement === null || body === null) continue;
    const sender = personOf(senderElement);
    if (sender === undefined) continue;

    const others: MessagePerson[] = [];
    for (const element of container.querySelectorAll(SELECTORS.messageRecipient)) {
      // 本文の中の要素は、宛先ではない
      if (body.contains(element)) continue;
      const person = personOf(element);
      if (person !== undefined) others.push(person);
    }

    // 引用部分（過去メール）は、別人の署名と取り違えないように取り除く
    const clone = body.cloneNode(true) as Element;
    for (const quote of clone.querySelectorAll(SELECTORS.messageQuote)) quote.remove();
    const signatures = clone.querySelectorAll(SELECTORS.messageSignature);
    const signature = signatures[signatures.length - 1];
    const signatureText = signature === undefined ? '' : toPlainText(signature);
    const base = { id, sender, others, bodyText: toPlainText(clone) };
    messages.push(signatureText === '' ? base : { ...base, signatureText });
  }
  return messages;
}
