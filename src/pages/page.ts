/**
 * 台帳の画面と、会社名検索のポップアップで共通に使う、画面の部品。
 *
 * 画面に出す値は、台帳の記録（利用者が入力した値、CSV から取り込んだ値、宛先欄の表示名）を含む。
 * どれも信頼できない文字列として扱い、必ず textContent / value で入れる（HTML として解釈させない）。
 */

import { MESSAGE_KEYS, type MessageKey, t } from '../shared/i18n';

// 呼び出し側が要素の種類を指定できるようにするための型引数（戻り値の型にだけ使う）
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Element not found: #${id}`);
  return element as T;
}

function isMessageKey(value: string): value is MessageKey {
  return (MESSAGE_KEYS as readonly string[]).includes(value);
}

/** data-i18n（文言）と data-i18n-placeholder（入力欄の案内）のキーで、文言を差し込む */
export function applyMessages(titleKey: MessageKey): void {
  document.title = t(titleKey);
  for (const element of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = element.dataset.i18n ?? '';
    if (!isMessageKey(key)) throw new Error(`Unknown message key: ${key}`);
    element.textContent = t(key);
  }
  for (const element of document.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]')) {
    const key = element.dataset.i18nPlaceholder ?? '';
    if (!isMessageKey(key)) throw new Error(`Unknown message key: ${key}`);
    element.placeholder = t(key);
    element.setAttribute('aria-label', t(key));
  }
}

/** 要素を作る（文字は textContent で入れる） */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className !== undefined) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** 日時（ISO 8601）を、日付だけの表示にする */
export function dateOf(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 2回押して初めて実行するボタンにする（取り消せない操作の、確認の代わり） */
export function armButton(
  button: HTMLButtonElement,
  label: string,
  confirmLabel: string,
  action: () => void,
): void {
  let armed = false;
  const disarm = (): void => {
    armed = false;
    button.textContent = label;
  };
  button.textContent = label;
  button.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      button.textContent = confirmLabel;
      return;
    }
    disarm();
    action();
  });
  button.addEventListener('blur', disarm);
}
