/**
 * 作成画面の宛先欄（To・Cc）への、アドレスの追加。
 *
 * 台帳の検索結果から宛先を入れるために使う（docs/requirements.md「5-5」）。
 * Gmail の宛先欄は、入力欄に文字を入れて Enter を押すと宛先チップになる。それと同じ操作を、
 * 入力欄の値とイベントで行う。チップができたことを確かめ、できなければ失敗として知らせる
 * （入れたつもりで入っていない、という状態にしない）。
 *
 * 送信とは関係のない補助の機能なので、失敗しても送信の捕捉には影響させない。
 */

import { GmailStructureError, findSendButton } from './compose';
import { SELECTORS, recipientFieldSelector } from './selectors';

/** 追加できる宛先欄 */
export type AddableField = 'to' | 'cc';

/**
 * 追加の結果。
 * added = 追加した、already = すでに同じ欄に入っている、
 * busy = 宛先欄に入力中の文字があるので、手を付けなかった
 */
export type AddRecipientResult = 'added' | 'already' | 'busy';

/** 宛先欄に入れてよいアドレスの形（区切りの記号や空白を含むものは、複数の宛先になりうるので入れない） */
const SAFE_ADDRESS = /^[^\s<>,;:"'()[\]\\]+@[^\s<>,;:"'()[\]\\@]+\.[^\s<>,;:"'()[\]\\@]+$/u;

/** 宛先欄に入れるアドレスの最大文字数 */
const MAX_ADDRESS_LENGTH = 254;

/** チップができるのを待つ時間（ミリ秒）と、確かめる間隔 */
export const ADD_RECIPIENT_TIMEOUT_MS = 1500;
const POLL_INTERVAL_MS = 50;

function hasChip(container: Element, address: string): boolean {
  const wanted = address.toLowerCase();
  return [...container.querySelectorAll(SELECTORS.recipientChip)].some(
    (chip) => chip.getAttribute('data-hovercard-id')?.trim().toLowerCase() === wanted,
  );
}

/** 条件を満たすまで待つ。時間内に満たさなければ undefined */
async function waitFor<T>(view: Window, probe: () => T | null | undefined): Promise<T | undefined> {
  const deadline = Date.now() + ADD_RECIPIENT_TIMEOUT_MS;
  for (;;) {
    const value = probe();
    if (value !== null && value !== undefined && value !== false) return value;
    if (Date.now() >= deadline) return undefined;
    await new Promise<void>((resolve) => {
      view.setTimeout(resolve, POLL_INTERVAL_MS);
    });
  }
}

/**
 * 作成画面の宛先欄に、アドレスを1件追加する。
 * 画面を読めない・チップにならないなど、追加できなかった場合は例外を投げる。
 */
export async function addRecipient(
  compose: HTMLElement,
  field: AddableField,
  address: string,
): Promise<AddRecipientResult> {
  if (address.length > MAX_ADDRESS_LENGTH || !SAFE_ADDRESS.test(address)) {
    throw new Error('The address cannot be used as a recipient');
  }
  const view = compose.ownerDocument.defaultView;
  if (view === null) throw new GmailStructureError('window of the element');
  const findContainer = (): HTMLElement | null =>
    compose.querySelector<HTMLElement>(recipientFieldSelector(field));
  const findInput = (): HTMLInputElement | null =>
    findContainer()?.querySelector<HTMLInputElement>(SELECTORS.recipientInput) ?? null;

  const container = findContainer();
  if (container === null) throw new GmailStructureError(`recipient field "${field}"`);
  if (hasChip(container, address)) return 'already';

  let input = findInput();
  if (input === null && field === 'cc') {
    // Cc の欄は、開くまで入力欄が無い。「Cc」のリンクを押して開く
    const toggle = compose.querySelector<HTMLElement>(SELECTORS.ccToggle);
    if (toggle === null) throw new GmailStructureError('cc toggle');
    toggle.click();
    input = (await waitFor(view, findInput)) ?? null;
  }
  if (input === null) throw new GmailStructureError(`recipient input (${field})`);
  // 利用者が入力している途中の文字は、書き換えない
  if (input.value.trim() !== '') return 'busy';

  input.focus();
  input.value = address;
  input.dispatchEvent(new view.Event('input', { bubbles: true }));
  input.dispatchEvent(
    new view.KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    }),
  );

  const created = await waitFor(view, () => {
    const current = findContainer();
    return current !== null && hasChip(current, address);
  });
  if (created !== true) {
    // チップにならなかった文字を残すと、入ったのかどうかが分からなくなるので消す
    const current = findInput();
    if (current?.value === address) {
      current.value = '';
      current.dispatchEvent(new view.Event('input', { bubbles: true }));
    }
    throw new GmailStructureError(`recipient chip was not created (${field})`);
  }
  return 'added';
}

/**
 * 作成画面の下の操作列で、送信ボタンが入っている枠を返す（宛先検索のボタンを置く場所）。
 * 見つからなければ null（ボタンを置かないだけにする）。
 */
export function findComposeToolbarCell(compose: HTMLElement): HTMLElement | null {
  try {
    return findSendButton(compose).closest<HTMLElement>(SELECTORS.toolbarCell);
  } catch {
    return null;
  }
}
