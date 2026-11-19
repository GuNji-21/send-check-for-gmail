/**
 * 確認ダイアログ（Shadow DOM）。
 *
 * - Shadow DOM の中に描画し、Gmail の CSS と干渉させない
 * - 文字はすべて textContent で入れる（HTML として解釈させない）
 * - <dialog> の showModal() で最前面に表示し、背後の Gmail を操作できないようにする
 * - 宛先・添付のすべてにチェックが入るまで、送信ボタンは押せない
 * - 検知結果は警告として表示するだけで、送信は止めない
 */

import type { ConfirmationModel, RecipientView } from '../../core/confirmation';
import type { Detection, RecipientField } from '../../core/types';
import { type MessageKey, t } from '../../shared/i18n';
import { DIALOG_CSS } from './styles';

/** 確認ダイアログの結果 */
export type ConfirmationResult = 'confirmed' | 'cancelled';

/** 確認ダイアログの種類（send = 送信、schedule = 予約送信の日時選択へ進む） */
export type ConfirmationMode = 'send' | 'schedule';

const HOST_ATTRIBUTE = 'data-gmail-send-guard';

const FIELD_LABELS: Readonly<Record<RecipientField, MessageKey>> = {
  to: 'dialogFieldTo',
  cc: 'dialogFieldCc',
  bcc: 'dialogFieldBcc',
};

const BADGE_LABELS: Readonly<Record<RecipientView['category'], MessageKey>> = {
  internal: 'dialogBadgeInternal',
  external: 'dialogBadgeExternal',
  caution: 'dialogBadgeCaution',
};

/** 要素を作る小さな補助関数 */
function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = doc.createElement(tag);
  if (className !== undefined) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** Shadow DOM を持つ入れ物を作って、ページに追加する */
function createHost(doc: Document): { host: HTMLElement; root: ShadowRoot } {
  const host = doc.createElement('div');
  host.setAttribute(HOST_ATTRIBUTE, '');
  const root = host.attachShadow({ mode: 'open' });

  // ページの CSP の影響を受けにくい adoptedStyleSheets を優先し、使えない環境では <style> を使う
  const view = doc.defaultView;
  let adopted = false;
  if (view !== null && typeof view.CSSStyleSheet === 'function') {
    try {
      const sheet = new view.CSSStyleSheet();
      sheet.replaceSync(DIALOG_CSS);
      root.adoptedStyleSheets = [sheet];
      adopted = true;
    } catch {
      adopted = false;
    }
  }
  if (!adopted) {
    root.append(el(doc, 'style', undefined, DIALOG_CSS));
  }

  // ダイアログ内のキー操作が Gmail のショートカットとして処理されないようにする
  for (const type of ['keydown', 'keyup', 'keypress'] as const) {
    host.addEventListener(type, (event) => {
      event.stopPropagation();
    });
  }
  doc.documentElement.append(host);
  return { host, root };
}

/** <dialog> を最前面に開く（showModal が使えない環境では、通常の表示で代用する） */
function openDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.showModal === 'function') {
    try {
      dialog.showModal();
      return;
    } catch {
      // 下の代用の表示に進む
    }
  }
  dialog.classList.add('fallback');
  dialog.setAttribute('open', '');
}

/** チェックが必要な項目（チェックボックス）をまとめて管理する */
class Checklist {
  readonly #boxes: HTMLInputElement[] = [];
  #onChange: () => void = () => undefined;

  add(doc: Document): HTMLInputElement {
    const box = el(doc, 'input');
    box.type = 'checkbox';
    box.addEventListener('change', () => {
      this.#onChange();
    });
    this.#boxes.push(box);
    return box;
  }

  onChange(listener: () => void): void {
    this.#onChange = listener;
  }

  get remaining(): number {
    return this.#boxes.filter((box) => !box.checked).length;
  }

  get first(): HTMLInputElement | undefined {
    return this.#boxes[0];
  }
}

function renderRecipients(
  doc: Document,
  model: ConfirmationModel,
  checklist: Checklist,
): HTMLElement {
  const section = el(doc, 'section');
  section.append(el(doc, 'h2', undefined, t('dialogRecipients')));

  if (model.recipients.length === 0) {
    section.append(el(doc, 'p', 'muted', t('dialogNoRecipients')));
    return section;
  }

  if (model.externalCompanies.length > 0) {
    const list = model.externalCompanies
      .map((company) => t('dialogCompanyCount', [company.companyKey, String(company.count)]))
      .join(' / ');
    section.append(el(doc, 'p', 'summary', t('dialogExternalSummary', [list])));
  }

  const internalBoxes: HTMLInputElement[] = [];
  for (const field of ['to', 'cc', 'bcc'] as const) {
    const recipients = model.recipients.filter((recipient) => recipient.field === field);
    if (recipients.length === 0) continue;
    section.append(el(doc, 'h3', undefined, t(FIELD_LABELS[field])));
    const list = el(doc, 'ul');
    for (const recipient of recipients) {
      const item = el(doc, 'li');
      const label = el(doc, 'label', `item ${recipient.category}`);
      const box = checklist.add(doc);
      if (recipient.category === 'internal') internalBoxes.push(box);
      const text = el(doc, 'span', 'text', recipient.address);
      if (recipient.displayName !== undefined) {
        text.append(el(doc, 'span', 'sub', recipient.displayName));
      }
      label.append(
        box,
        text,
        el(doc, 'span', `badge ${recipient.category}`, t(BADGE_LABELS[recipient.category])),
      );
      item.append(label);
      list.append(item);
    }
    section.append(list);
  }

  // 社内の宛先が複数あるときは、まとめてチェックできるようにする（社内は確認を簡易にする）
  if (internalBoxes.length >= 2) {
    const button = el(
      doc,
      'button',
      'linkbutton',
      t('dialogCheckAllInternal', [String(internalBoxes.length)]),
    );
    button.type = 'button';
    button.addEventListener('click', () => {
      for (const box of internalBoxes) {
        box.checked = true;
        box.dispatchEvent(new Event('change'));
      }
    });
    section.append(button);
  }
  return section;
}

function renderDetections(doc: Document, detections: readonly Detection[]): HTMLElement | null {
  if (detections.length === 0) return null;
  const section = el(doc, 'section');
  section.append(el(doc, 'h2', undefined, t('dialogWarnings')));
  for (const detection of detections) {
    const box = el(doc, 'div', 'detection');
    const head = el(doc, 'div', 'head');
    head.append(
      el(doc, 'span', 'badge external', t('dialogLevelWarn')),
      el(doc, 'span', 'message', t(detection.messageKey, detection.substitutions)),
    );
    box.append(head);
    section.append(box);
  }
  return section;
}

function renderAttachments(
  doc: Document,
  model: ConfirmationModel,
  checklist: Checklist,
): HTMLElement {
  const section = el(doc, 'section');
  section.append(el(doc, 'h2', undefined, t('dialogAttachments')));
  if (model.attachments.length === 0) {
    section.append(el(doc, 'p', 'muted', t('dialogNoAttachments')));
    return section;
  }
  const list = el(doc, 'ul');
  for (const attachment of model.attachments) {
    const item = el(doc, 'li');
    const label = el(doc, 'label', 'item');
    label.append(checklist.add(doc), el(doc, 'span', 'text', attachment.fileName));
    item.append(label);
    list.append(item);
  }
  section.append(list);
  return section;
}

function renderText(doc: Document, title: string, value: string, emptyText: string): HTMLElement {
  const section = el(doc, 'section');
  section.append(el(doc, 'h2', undefined, title));
  section.append(
    value.trim() === '' ? el(doc, 'p', 'muted', emptyText) : el(doc, 'p', 'plain', value),
  );
  return section;
}

/**
 * 確認ダイアログを表示する。利用者が送信を選んだら 'confirmed'、
 * キャンセル・Esc・閉じる操作なら 'cancelled' で解決する。
 */
export function showConfirmationDialog(
  doc: Document,
  model: ConfirmationModel,
  mode: ConfirmationMode,
): Promise<ConfirmationResult> {
  return new Promise((resolve) => {
    const { host, root } = createHost(doc);
    const dialog = el(doc, 'dialog');
    dialog.setAttribute('aria-label', t('dialogTitle'));
    const checklist = new Checklist();

    const header = el(doc, 'header');
    header.append(
      el(doc, 'h1', undefined, t('dialogTitle')),
      el(doc, 'div', 'from', `${t('dialogFrom')}: ${model.fromAddress}`),
    );

    const main = el(doc, 'main');
    const detections = renderDetections(doc, model.detections);
    if (detections !== null) main.append(detections);
    main.append(
      renderRecipients(doc, model, checklist),
      renderText(doc, t('dialogSubject'), model.subject, t('dialogSubjectEmpty')),
      renderText(doc, t('dialogBody'), model.bodyPreview, t('dialogBodyEmpty')),
      renderAttachments(doc, model, checklist),
    );

    const footer = el(doc, 'footer');
    const remaining = el(doc, 'span', 'remaining');
    remaining.setAttribute('aria-live', 'polite');
    const cancel = el(doc, 'button', 'action', t('dialogCancel'));
    cancel.type = 'button';
    const send = el(
      doc,
      'button',
      'action primary',
      t(mode === 'schedule' ? 'dialogSchedule' : 'dialogSend'),
    );
    send.type = 'button';
    footer.append(remaining, cancel, send);

    const update = (): void => {
      const count = checklist.remaining;
      send.disabled = count > 0;
      remaining.textContent = count > 0 ? t('dialogRemaining', [String(count)]) : '';
    };
    checklist.onChange(update);
    update();

    let settled = false;
    const finish = (result: ConfirmationResult): void => {
      if (settled) return;
      settled = true;
      host.remove();
      resolve(result);
    };
    cancel.addEventListener('click', () => {
      finish('cancelled');
    });
    send.addEventListener('click', () => {
      // 念のため、押された時点でも未チェックが無いことを確かめる
      if (checklist.remaining === 0) finish('confirmed');
    });
    // Esc で閉じた場合（cancel イベント）もキャンセル扱い
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish('cancelled');
    });
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish('cancelled');
      }
    });

    dialog.append(header, main, footer);
    root.append(dialog);
    openDialog(dialog);
    (checklist.first ?? cancel).focus();
  });
}

/**
 * 「チェックできませんでした」を表示する。送信は止めたままにする（送信へ進む操作は用意しない）。
 * 閉じる操作で解決する。
 */
export function showCheckFailedDialog(doc: Document): Promise<void> {
  return new Promise((resolve) => {
    const { host, root } = createHost(doc);
    const dialog = el(doc, 'dialog');
    dialog.setAttribute('role', 'alertdialog');
    dialog.setAttribute('aria-label', t('errorCheckFailed'));

    const main = el(doc, 'main');
    const section = el(doc, 'section');
    section.append(
      el(doc, 'p', 'error', t('errorCheckFailed')),
      el(doc, 'p', 'muted', t('errorCheckFailedHint')),
    );
    main.append(section);

    const footer = el(doc, 'footer');
    const spacer = el(doc, 'span', 'remaining');
    const close = el(doc, 'button', 'action primary', t('dialogClose'));
    close.type = 'button';
    footer.append(spacer, close);

    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      host.remove();
      resolve();
    };
    close.addEventListener('click', finish);
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish();
    });
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish();
      }
    });

    dialog.append(main, footer);
    root.append(dialog);
    openDialog(dialog);
    close.focus();
  });
}

/** 画面の隅に注意書きを表示する（利用者が閉じるまで残る）。同じ注意書きは重ねて出さない */
export function showNotice(doc: Document, key: MessageKey): void {
  const marker = `${HOST_ATTRIBUTE}-notice`;
  if (doc.querySelector(`[${marker}="${key}"]`) !== null) return;
  const { host, root } = createHost(doc);
  host.setAttribute(marker, key);
  const notice = el(doc, 'div', 'notice');
  notice.setAttribute('role', 'alert');
  const close = el(doc, 'button', undefined, t('dialogClose'));
  close.type = 'button';
  close.addEventListener('click', () => {
    host.remove();
  });
  notice.append(el(doc, 'span', undefined, t(key)), close);
  root.append(notice);
}

/** 確認ダイアログ（エラー表示を含む）が開いているかどうか */
export function isDialogOpen(doc: Document): boolean {
  return [...doc.querySelectorAll(`[${HOST_ATTRIBUTE}]`)].some(
    (host) => host.shadowRoot?.querySelector('dialog') != null,
  );
}
