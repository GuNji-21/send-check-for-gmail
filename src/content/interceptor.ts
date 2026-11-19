/**
 * 送信操作の捕捉。
 *
 * 次の送信操作をキャプチャ段階で捕捉し、いったん送信を止めて確認ダイアログを表示する。
 * 利用者が確認したときだけ送信を続行させる。
 * - 送信ボタンのクリック（キーボードでの Enter・Space を含む）
 * - 送信ショートカット（Ctrl + Enter／Cmd + Enter）
 * - 「送信日時を設定」（予約送信）。メニュー項目を選んだ時点で確認し、確認後に日時の選択へ進ませる
 *
 * 対象画面：新規作成、返信、全員に返信、転送、インライン返信、ポップアウト、全画面表示。
 * Gmail の複数アカウント（/mail/u/0/、/mail/u/1/ など）のどれでも動作させる。
 *
 * 性能：送信操作から 0.5 秒以内に確認ダイアログを表示する。
 * 設定は起動時に読み込んで保持し、送信操作のたびに非同期の読み込みを待たない。
 *
 * 失敗時の動作：
 * - 拡張機能側でエラーが起きた場合は送信を止め、「チェックできませんでした」と表示する。
 * - 黙って送信させない（例外を握りつぶして送信を通さない）。
 */

import { shouldSkipConfirmation } from '../core/classify';
import { type ConfirmationSettings, buildConfirmationModel } from '../core/confirmation';
import type { ClassificationRules } from '../core/types';
import {
  type SendTarget,
  activateElement,
  findComposeOf,
  findSendButton,
  findSendTarget,
  findSendTargetForKey,
  isUnrecognizedCompose,
  readComposeSnapshot,
} from '../gmail/compose';
import { showCheckFailedDialog, showConfirmationDialog, showNotice } from '../ui/dialog/dialog';

/** 捕捉した送信操作の種類 */
export type SendTrigger =
  /** 送信ボタンのクリック */
  | 'button'
  /** 送信ショートカット（Ctrl/Cmd + Enter） */
  | 'shortcut'
  /** 「送信日時を設定」（予約送信） */
  | 'schedule';

/** 送信の捕捉に必要な設定 */
export interface InterceptorSettings extends ConfirmationSettings {
  readonly rules: ClassificationRules;
  readonly skipConfirmationEnabled: boolean;
}

export interface InterceptorOptions {
  /** イベントを監視するウィンドウ */
  readonly view: Window;
  /** 設定を返す。読み込めない場合は reject する（その場合は送信を止める） */
  readonly getSettings: () => Promise<InterceptorSettings>;
  /** 現在時刻（テスト用に差し替えられるようにしている） */
  readonly now?: () => Date;
}

/** マウス操作のうち、送信ボタンに届かせないもの（Gmail のボタンは click 以外にも反応するため） */
const POINTER_EVENTS = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'] as const;
const KEY_EVENTS = ['keydown', 'keypress', 'keyup'] as const;

function isActivationKey(event: KeyboardEvent): boolean {
  return event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar';
}

function isSendShortcut(event: KeyboardEvent): boolean {
  return event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.altKey;
}

function block(event: Event): void {
  event.preventDefault();
  event.stopImmediatePropagation();
}

/**
 * 送信操作の捕捉を開始する。戻り値の関数を呼ぶと捕捉をやめる。
 */
export function startInterceptor(options: InterceptorOptions): () => void {
  const { view, getSettings } = options;
  const now = options.now ?? ((): Date => new Date());
  const doc = view.document;

  /** 確認の処理中（ダイアログ表示中を含む）かどうか。処理中の送信操作は止めるだけにする */
  let busy = false;
  /** 確認が済んで、拡張機能自身が押し直している最中の要素。この要素へのイベントは通す */
  let passing: HTMLElement | null = null;

  const proceed = (trigger: SendTrigger, target: SendTarget): void => {
    // 予約送信はメニュー項目を、それ以外は送信ボタンを押し直す
    const element = trigger === 'schedule' ? target.element : findSendButton(target.compose);
    if (!element.isConnected) throw new Error('The compose window was closed during confirmation');
    passing = element;
    try {
      activateElement(element);
    } finally {
      passing = null;
    }
  };

  const confirmAndSend = async (trigger: SendTrigger, target: SendTarget): Promise<void> => {
    if (busy) return;
    busy = true;
    try {
      const settings = await getSettings();
      const snapshot = readComposeSnapshot(target.compose, now());
      const skip = shouldSkipConfirmation(
        snapshot.recipients,
        settings.rules,
        settings.skipConfirmationEnabled,
      );
      if (!skip) {
        const model = buildConfirmationModel(snapshot, settings);
        const result = await showConfirmationDialog(
          doc,
          model,
          trigger === 'schedule' ? 'schedule' : 'send',
        );
        if (result !== 'confirmed') return;
      }
      proceed(trigger, target);
    } catch (error) {
      // 送信は止めたまま、チェックできなかったことを知らせる
      console.error('[gmail-send-guard] check failed', error);
      try {
        await showCheckFailedDialog(doc);
      } catch (dialogError) {
        console.error('[gmail-send-guard] failed to show the error dialog', dialogError);
      }
    } finally {
      busy = false;
    }
  };

  const onPointer = (event: Event): void => {
    const target = findSendTarget(event.target);
    if (target === null || target.element === passing) return;
    block(event);
    // 押す・離すは止めるだけにして、click が来た時点で確認を始める
    if (event.type !== 'click') return;
    void confirmAndSend(target.kind, target);
  };

  const onKey = (event: KeyboardEvent): void => {
    if (event.isComposing) return;

    if (isSendShortcut(event)) {
      const origin = event.target;
      if (origin === null || typeof (origin as Partial<Element>).closest !== 'function') return;
      const compose = findComposeOf(origin as Element);
      if (compose === null) return;
      block(event);
      if (event.type !== 'keydown' || event.repeat) return;
      void confirmAndSend('shortcut', { kind: 'button', compose, element: compose });
      return;
    }

    if (!isActivationKey(event)) return;
    const target = findSendTargetForKey(event.target);
    if (target === null || target.element === passing) return;
    block(event);
    if (event.type !== 'keydown' || event.repeat) return;
    void confirmAndSend(target.kind, target);
  };

  /** Gmail の画面が変わって送信を捕捉できなくなっていないかを、作成画面にフォーカスが入ったときに確かめる */
  const onFocusIn = (event: FocusEvent): void => {
    const origin = event.target;
    if (origin === null || typeof (origin as Partial<Element>).closest !== 'function') return;
    const element = origin as Element;
    try {
      if (isUnrecognizedCompose(element)) {
        showNotice(doc, 'errorSendButtonNotFound');
        return;
      }
      const compose = findComposeOf(element);
      if (compose !== null) findSendButton(compose);
    } catch (error) {
      console.error('[gmail-send-guard] compose window not recognized', error);
      showNotice(doc, 'errorSendButtonNotFound');
    }
  };

  // window のキャプチャ段階で受け取ることで、Gmail 側の処理より先にイベントを止める
  for (const type of POINTER_EVENTS) view.addEventListener(type, onPointer, true);
  for (const type of KEY_EVENTS) view.addEventListener(type, onKey, true);
  view.addEventListener('focusin', onFocusIn, true);

  return () => {
    for (const type of POINTER_EVENTS) view.removeEventListener(type, onPointer, true);
    for (const type of KEY_EVENTS) view.removeEventListener(type, onKey, true);
    view.removeEventListener('focusin', onFocusIn, true);
  };
}
