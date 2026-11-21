/**
 * 確認ダイアログ（Shadow DOM）。
 *
 * - Shadow DOM の中に描画し、Gmail の CSS と干渉させない
 * - 文字はすべて textContent で入れる（HTML として解釈させない）
 * - <dialog> の showModal() で最前面に表示し、背後の Gmail を操作できないようにする
 * - 宛先・添付のすべてにチェックが入るまで、送信ボタンは押せない
 * - 検知結果は警告として表示するだけで、送信は止めない
 * - AI による誤字・脱字チェックの結果は、ダイアログを開いた後で届く。届くまでは「確認中」と表示し、
 *   結果を待たずに送信できる（失敗しても送信は止めない）
 */

import type { ConfirmationModel, RecipientView } from '../../core/confirmation';
import type { TypoCandidate, TypoCheckResult } from '../../core/typo/typo-check';
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
  const section = el(doc, 'section', 'recipients');
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
      const text = el(doc, 'span', 'text address', recipient.address);
      if (recipient.displayName !== undefined) {
        text.append(el(doc, 'span', 'sub', recipient.displayName));
      }
      label.append(
        box,
        text,
        el(doc, 'span', `tag ${recipient.category}`, t(BADGE_LABELS[recipient.category])),
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

/** 警告の印（三角に感嘆符）を描く。意味は隣の読み上げ用の文字で伝えるため、絵そのものは読み上げさせない */
function warningIcon(doc: Document): SVGSVGElement {
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(namespace, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icon');
  const triangle = doc.createElementNS(namespace, 'path');
  triangle.setAttribute('d', 'M8 1.9 14.6 13.6H1.4L8 1.9Z');
  triangle.setAttribute('class', 'icon-shape');
  const mark = doc.createElementNS(namespace, 'path');
  mark.setAttribute('d', 'M8 6.3v3.4M8 11.5v.1');
  mark.setAttribute('class', 'icon-mark');
  svg.append(triangle, mark);
  return svg;
}

function renderDetections(doc: Document, detections: readonly Detection[]): HTMLElement | null {
  if (detections.length === 0) return null;
  const section = el(doc, 'section', 'warnings');
  section.append(el(doc, 'h2', undefined, t('dialogWarnings')));
  const list = el(doc, 'ul');
  for (const detection of detections) {
    const item = el(doc, 'li', 'detection');
    item.append(
      warningIcon(doc),
      el(doc, 'span', 'sr-only', t('dialogLevelWarn')),
      el(doc, 'span', 'message', t(detection.messageKey, detection.substitutions)),
    );
    list.append(item);
  }
  section.append(list);
  return section;
}

function renderAttachments(
  doc: Document,
  model: ConfirmationModel,
  checklist: Checklist,
): HTMLElement {
  const section = el(doc, 'section', 'attachments');
  section.append(el(doc, 'h2', undefined, t('dialogAttachments')));
  if (model.attachments.length === 0) {
    section.append(el(doc, 'p', 'muted', t('dialogNoAttachments')));
    return section;
  }
  const list = el(doc, 'ul');
  for (const attachment of model.attachments) {
    const item = el(doc, 'li');
    const label = el(doc, 'label', 'item');
    label.append(checklist.add(doc), el(doc, 'span', 'text file', attachment.fileName));
    item.append(label);
    list.append(item);
  }
  section.append(list);
  return section;
}

/** 件名・本文の欄。update を呼ぶと、表示する内容を差し替えられる */
interface TextField {
  readonly section: HTMLElement;
  update(value: string): void;
}

function renderText(doc: Document, title: string, value: string, emptyText: string): TextField {
  const section = el(doc, 'section', 'field');
  section.append(el(doc, 'h2', undefined, title));
  const content = el(doc, 'p');
  const update = (next: string): void => {
    const empty = next.trim() === '';
    content.className = empty ? 'muted' : 'plain';
    content.textContent = empty ? emptyText : next;
  };
  update(value);
  section.append(content);
  return { section, update };
}

/** 確認ダイアログに追加で渡すもの */
export interface ConfirmationExtras {
  /** AI による誤字・脱字チェックの結果（後から届く）。指定しなければ、欄そのものを出さない */
  readonly typoCheck?: Promise<TypoCheckResult>;
  /**
   * 誤字・脱字の候補を、メールに反映する。指定しなければ「修正する」ボタンを出さない。
   * 反映できなかったら、その理由を返す
   * （'ambiguous' = 同じ表記が複数あって決められない、'not-found' = 該当箇所が見つからない）。
   */
  readonly applyFix?: (candidate: TypoCandidate) => AppliedFix | 'ambiguous' | 'not-found';
  /**
   * 連絡先の記録（台帳）を読み込めなかったか。true の場合、台帳を使うチェック
   * （初めて送るドメイン、Cc 漏れ）を行えなかったことをダイアログに表示する。
   */
  readonly ledgerUnavailable?: boolean;
}

/** メールの件名と本文の冒頭（ダイアログの表示を更新するために使う） */
export interface MailText {
  readonly subject: string;
  readonly bodyPreview: string;
}

/** 修正案をメールに反映した結果 */
export interface AppliedFix extends MailText {
  /** 書き換えた行（メール本体から読み直したもの）。fixed が書き換えた部分 */
  readonly line: { readonly before: string; readonly fixed: string; readonly after: string };
  /** 元に戻す。戻せたら、戻した後の件名と本文の冒頭を返す。戻せなかったら null */
  undo(): MailText | null;
  /** 書き換えた箇所を、メールの画面で選択して見える位置に出す（ダイアログを閉じた後に呼ぶ） */
  reveal(): void;
}

/** 誤字・脱字の候補の欄から、ダイアログ本体に頼む操作 */
interface TypoActions {
  applyFix(candidate: TypoCandidate): AppliedFix | 'ambiguous' | 'not-found';
  /** メールを書き換えた（または元に戻した）ので、件名・本文の表示を更新する */
  mailChanged(mail: MailText): void;
  /** ダイアログを閉じて、メールの画面で該当箇所を見せる */
  review(reveal: () => void): void;
}

/** 修正した行の前後は、長い場合に切り詰めて表示する */
const LINE_CONTEXT_LENGTH = 24;

/** 書き換えた行を、書き換えた部分を強調して表示する */
function renderFixedLine(doc: Document, line: AppliedFix['line']): HTMLElement {
  const paragraph = el(doc, 'p', 'fixed-line');
  const before =
    line.before.length > LINE_CONTEXT_LENGTH
      ? `…${line.before.slice(-LINE_CONTEXT_LENGTH)}`
      : line.before;
  const after =
    line.after.length > LINE_CONTEXT_LENGTH
      ? `${line.after.slice(0, LINE_CONTEXT_LENGTH)}…`
      : line.after;
  paragraph.append(
    el(doc, 'span', 'fixed-label', t('dialogTypoFixedLine')),
    doc.createTextNode(before),
    el(doc, 'mark', undefined, line.fixed),
    doc.createTextNode(after),
  );
  return paragraph;
}

/** 誤字・脱字の候補1件。修正する → 修正後の行を表示（元に戻す／メールで確認）と状態が変わる */
function renderTypoItem(
  doc: Document,
  candidate: TypoCandidate,
  actions: TypoActions | undefined,
): HTMLElement {
  const item = el(doc, 'li', 'typo');
  const change = el(doc, 'span', 'change');
  change.append(
    el(doc, 'span', 'wrong', candidate.wrong),
    el(doc, 'span', 'arrow', t('dialogTypoArrow')),
    el(doc, 'span', 'suggestion', candidate.suggestion),
  );
  const buttons = el(doc, 'span', 'typo-actions');
  const detail = el(doc, 'div', 'typo-detail');
  detail.setAttribute('aria-live', 'polite');
  item.append(change, buttons);
  if (candidate.reason !== '') item.append(el(doc, 'span', 'reason', candidate.reason));
  item.append(detail);
  if (actions === undefined) return item;

  const button = (className: string, key: MessageKey, onClick: () => void): HTMLButtonElement => {
    const element = el(doc, 'button', `mini ${className}`, t(key));
    element.type = 'button';
    element.addEventListener('click', onClick);
    return element;
  };
  const showMessage = (key: MessageKey): void => {
    detail.replaceChildren(el(doc, 'p', 'fix-result', t(key)));
  };

  const showInitial = (): void => {
    item.classList.remove('applied', 'unapplied');
    detail.replaceChildren();
    buttons.replaceChildren(
      button('fix', 'dialogTypoApply', () => {
        const outcome = actions.applyFix(candidate);
        if (outcome === 'ambiguous' || outcome === 'not-found') {
          item.classList.add('unapplied');
          buttons.replaceChildren();
          showMessage(
            outcome === 'ambiguous' ? 'dialogTypoApplyAmbiguous' : 'dialogTypoApplyFailed',
          );
          return;
        }
        actions.mailChanged(outcome);
        showApplied(outcome);
      }),
    );
  };

  const showApplied = (fix: AppliedFix): void => {
    item.classList.add('applied');
    // 「修正しました」だけでなく、メール本体から読み直した修正後の行を見せる
    detail.replaceChildren(
      el(doc, 'p', 'fix-result', t('dialogTypoApplied')),
      renderFixedLine(doc, fix.line),
    );
    buttons.replaceChildren(
      button('undo', 'dialogTypoUndo', () => {
        const restored = fix.undo();
        if (restored === null) {
          buttons.replaceChildren();
          showMessage('dialogTypoUndoFailed');
          return;
        }
        actions.mailChanged(restored);
        showInitial();
      }),
      button('review', 'dialogTypoReview', () => {
        actions.review(() => {
          fix.reveal();
        });
      }),
    );
  };

  showInitial();
  return item;
}

/**
 * AI による誤字・脱字チェックの欄を作る。最初は「確認中」を表示し、結果が届いたら置き換える。
 */
function renderTypoCheck(
  doc: Document,
  typoCheck: Promise<TypoCheckResult>,
  actions: TypoActions | undefined,
): HTMLElement {
  const section = el(doc, 'section', 'typos');
  section.append(el(doc, 'h2', undefined, t('dialogTypoTitle')));
  const body = el(doc, 'div', 'typo-body');
  body.setAttribute('aria-live', 'polite');
  body.append(el(doc, 'p', 'muted pending', t('dialogTypoChecking')));
  section.append(body);

  const show = (result: TypoCheckResult): void => {
    if (result.status === 'not-ready') {
      body.replaceChildren(el(doc, 'p', 'muted', t('dialogTypoNotReady')));
      return;
    }
    if (result.status === 'failed') {
      body.replaceChildren(el(doc, 'p', 'muted', t('dialogTypoFailed')));
      return;
    }
    if (result.candidates.length === 0) {
      body.replaceChildren(el(doc, 'p', 'muted', t('dialogTypoNone')));
      return;
    }
    const list = el(doc, 'ul');
    for (const candidate of result.candidates) {
      list.append(renderTypoItem(doc, candidate, actions));
    }
    body.replaceChildren(list);
  };

  typoCheck.then(show, () => {
    show({ status: 'failed' });
  });
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
  extras: ConfirmationExtras = {},
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
    if (extras.ledgerUnavailable === true) {
      // 連絡先の記録を読めなかったので、それを使うチェックを行えていないことを知らせる
      const note = el(doc, 'section', 'note');
      note.append(el(doc, 'p', 'muted', t('dialogLedgerUnavailable')));
      main.append(note);
    }
    const subjectField = renderText(
      doc,
      t('dialogSubject'),
      model.subject,
      t('dialogSubjectEmpty'),
    );
    const bodyField = renderText(doc, t('dialogBody'), model.bodyPreview, t('dialogBodyEmpty'));
    if (extras.typoCheck !== undefined) {
      const { applyFix } = extras;
      main.append(
        renderTypoCheck(
          doc,
          extras.typoCheck,
          applyFix === undefined
            ? undefined
            : {
                applyFix,
                // メールを書き換えたので、ダイアログに表示している件名・本文も合わせる
                mailChanged(mail) {
                  subjectField.update(mail.subject);
                  bodyField.update(mail.bodyPreview);
                },
                // ダイアログを閉じてから（開いている間は Gmail を操作できないため）、該当箇所を見せる
                review(reveal) {
                  finish('cancelled');
                  doc.defaultView?.setTimeout(reveal, 0);
                },
              },
        ),
      );
    }
    main.append(
      renderRecipients(doc, model, checklist),
      subjectField.section,
      bodyField.section,
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
    const section = el(doc, 'section', 'failure');
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
