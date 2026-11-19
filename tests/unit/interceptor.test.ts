// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFixture } from '../../scripts/lib/fixture-files.mjs';
import { type InterceptorSettings, startInterceptor } from '../../src/content/interceptor';
import { findComposeWindows, findSendButton } from '../../src/gmail/compose';
import { DEFAULT_SETTINGS } from '../../src/storage/settings';
import { isDialogOpen } from '../../src/ui/dialog/dialog';
import { rules } from './helpers';

// 送信ボタンを押す → 送信が止まる → 確認ダイアログ → 確認後にだけ送信される、という一連の流れを、
// 採取した Gmail の HTML（匿名化済み）の上で確かめる。
// 「Gmail の送信処理」は、送信ボタンに届いたイベントを数えることで代用している。

let stop: () => void = () => undefined;
let compose: HTMLElement;
let sendButton: HTMLElement;
/** Gmail 側（送信ボタン）に届いたイベント */
let delivered: string[];
let settings: InterceptorSettings;
let getSettings: () => Promise<InterceptorSettings>;

/** 件名の入力欄に値を入れる（入力値は HTML に残らないため、テストで入れる） */
function setSubject(value: string): void {
  const input = compose.querySelector<HTMLInputElement>('input[name="subjectbox"]');
  if (input === null) throw new Error('subject input not found');
  input.value = value;
}

function setUp(fixture = 'compose-new--attachment.ja.20261120.html'): void {
  document.body.innerHTML = readFixture(fixture);
  const found = findComposeWindows(document)[0];
  if (found === undefined) throw new Error('no compose window');
  compose = found;
  sendButton = findSendButton(compose);
  setSubject('お見積りの件');
  delivered = [];
  for (const type of ['mousedown', 'mouseup', 'click', 'keydown']) {
    sendButton.addEventListener(type, () => delivered.push(type));
  }
  stop = startInterceptor({
    view: window,
    getSettings: () => getSettings(),
    now: () => new Date(2026, 10, 20, 10, 0, 0),
  });
}

/** 確認ダイアログ（Shadow DOM）の中身 */
function dialogRoot(): ShadowRoot {
  const host = document.querySelector('[data-gmail-send-guard]');
  if (host?.shadowRoot == null) throw new Error('dialog is not open');
  return host.shadowRoot;
}

function buttons(): HTMLButtonElement[] {
  return [...dialogRoot().querySelectorAll<HTMLButtonElement>('footer button')];
}

function checkAll(): void {
  for (const box of dialogRoot().querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
    box.checked = true;
    box.dispatchEvent(new Event('change'));
  }
}

/** 利用者のクリック（押す・離す・click）を模す */
function userClick(element: Element): void {
  for (const type of ['mousedown', 'mouseup', 'click']) {
    element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
  }
}

function key(element: Element, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  element.dispatchEvent(event);
  return event;
}

/** 非同期の処理（設定の読み込み、ダイアログの表示）が進むのを待つ */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

beforeEach(() => {
  // 文言は「キー名」または「キー名:差し込み値」として返す
  vi.stubGlobal('chrome', {
    i18n: {
      getMessage: (name: string, substitutions?: string[]) =>
        substitutions === undefined ? name : `${name}:${substitutions.join('|')}`,
    },
  });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  settings = { ...DEFAULT_SETTINGS };
  getSettings = () => Promise.resolve(settings);
});

afterEach(() => {
  stop();
  document.documentElement.querySelectorAll('[data-gmail-send-guard]').forEach((h) => {
    h.remove();
  });
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('送信ボタンのクリック', () => {
  it('送信を止めて、確認ダイアログを表示する', async () => {
    setUp();
    userClick(sendButton);
    await settle();
    expect(delivered).toEqual([]);
    expect(isDialogOpen(document)).toBe(true);
  });

  it('宛先・添付をすべてチェックするまで、送信ボタンを押せない', async () => {
    setUp();
    userClick(sendButton);
    await settle();
    const [, send] = buttons();
    // 宛先4件＋添付2件
    expect(dialogRoot().querySelectorAll('input[type="checkbox"]')).toHaveLength(6);
    expect(send?.disabled).toBe(true);
    expect(dialogRoot().querySelector('.remaining')?.textContent).toBe('dialogRemaining:6');

    checkAll();
    expect(send?.disabled).toBe(false);
    expect(dialogRoot().querySelector('.remaining')?.textContent).toBe('');
  });

  it('確認して送信を押すと、送信ボタンが押し直されて送信される', async () => {
    setUp();
    userClick(sendButton);
    await settle();
    checkAll();
    buttons()[1]?.click();
    await settle();
    expect(delivered).toEqual(['mousedown', 'mouseup', 'click']);
    expect(isDialogOpen(document)).toBe(false);
  });

  it('キャンセルすると、送信されない', async () => {
    setUp();
    userClick(sendButton);
    await settle();
    buttons()[0]?.click();
    await settle();
    expect(delivered).toEqual([]);
    expect(isDialogOpen(document)).toBe(false);
  });

  it('キャンセルした後、もう一度送信すると再び確認する', async () => {
    setUp();
    userClick(sendButton);
    await settle();
    buttons()[0]?.click();
    await settle();
    userClick(sendButton);
    await settle();
    expect(delivered).toEqual([]);
    expect(isDialogOpen(document)).toBe(true);
  });

  it('確認して送信した後の、次の送信操作も確認する（確認は1回ごと）', async () => {
    setUp();
    userClick(sendButton);
    await settle();
    checkAll();
    buttons()[1]?.click();
    await settle();
    delivered.length = 0;

    userClick(sendButton);
    await settle();
    expect(delivered).toEqual([]);
    expect(isDialogOpen(document)).toBe(true);
  });

  it('ダイアログの表示中に重ねて送信操作をしても、送信されず、ダイアログは増えない', async () => {
    setUp();
    userClick(sendButton);
    await settle();
    userClick(sendButton);
    key(compose, { key: 'Enter', ctrlKey: true });
    await settle();
    expect(delivered).toEqual([]);
    expect(document.querySelectorAll('[data-gmail-send-guard]')).toHaveLength(1);
  });

  it('送信ボタン以外のクリックは止めない', () => {
    setUp();
    const bold = compose.querySelector('[command="+bold"]');
    if (bold === null) throw new Error('bold button not found');
    let reached = 0;
    bold.addEventListener('click', () => reached++);
    userClick(bold);
    expect(reached).toBe(1);
    expect(isDialogOpen(document)).toBe(false);
  });
});

describe('確認ダイアログの内容', () => {
  it('宛先を To / Cc / Bcc ごとに、社外の印を付けて表示する', async () => {
    setUp();
    userClick(sendButton);
    await settle();
    const text = dialogRoot().querySelector('main')?.textContent ?? '';
    for (const address of [
      'taro.yamada@example.com',
      'hanako.sato@example.org',
      'jiro.suzuki@example.com',
      'archive@example.net',
    ]) {
      expect(text).toContain(address);
    }
    expect([...dialogRoot().querySelectorAll('h3')].map((h) => h.textContent)).toEqual([
      'dialogFieldTo',
      'dialogFieldCc',
      'dialogFieldBcc',
    ]);
    expect(dialogRoot().querySelectorAll('label.item.external')).toHaveLength(4);
    expect(text).toContain('お見積りの件');
  });

  it('社外の宛先が複数のドメインにまたがる場合に警告する', async () => {
    setUp();
    userClick(sendButton);
    await settle();
    const warnings = [...dialogRoot().querySelectorAll('.detection .message')].map(
      (m) => m.textContent,
    );
    expect(warnings).toContain(
      'detectMultipleExternalCompanies:3|example.com、example.org、example.net',
    );
  });

  it('社内として登録したドメインは社内として表示し、まとめてチェックできる', async () => {
    settings = { ...settings, rules: rules({ internalDomains: ['example.com'] }) };
    setUp();
    userClick(sendButton);
    await settle();
    expect(dialogRoot().querySelectorAll('label.item.internal')).toHaveLength(2);
    const checkAllInternal = dialogRoot().querySelector<HTMLButtonElement>('.linkbutton');
    expect(checkAllInternal?.textContent).toBe('dialogCheckAllInternal:2');
    checkAllInternal?.click();
    expect(dialogRoot().querySelector('.remaining')?.textContent).toBe('dialogRemaining:4');
  });

  it('要注意として登録した宛先を強調する', async () => {
    settings = { ...settings, rules: rules({ cautionAddresses: ['archive@example.net'] }) };
    setUp();
    userClick(sendButton);
    await settle();
    const caution = dialogRoot().querySelector('label.item.caution');
    expect(caution?.textContent).toContain('archive@example.net');
    expect(caution?.textContent).toContain('dialogBadgeCaution');
  });

  it('警告は表示するだけで、宛先と添付をチェックすれば送信できる', async () => {
    setUp();
    userClick(sendButton);
    await settle();
    expect(dialogRoot().querySelectorAll('.detection').length).toBeGreaterThan(0);
    // 警告の項目には、チェックボックスを付けない
    expect(dialogRoot().querySelectorAll('.detection input')).toHaveLength(0);
    checkAll();
    expect(buttons()[1]?.disabled).toBe(false);
  });

  it('警告をオフにした項目は表示しない', async () => {
    settings = {
      ...settings,
      warningLevels: { ...settings.warningLevels, 'multiple-external-companies': 'off' },
    };
    setUp();
    userClick(sendButton);
    await settle();
    // フィクスチャの本文は伏せ字（XXX など）のため、プレースホルダーの検知は出る。ここでは複数社混在だけを見る
    const messages = [...dialogRoot().querySelectorAll('.detection .message')].map(
      (m) => m.textContent,
    );
    expect(messages.some((m) => m.startsWith('detectMultipleExternalCompanies'))).toBe(false);
  });

  it('文字は HTML として解釈しない', async () => {
    setUp();
    setSubject('<img src=x onerror=alert(1)>');
    userClick(sendButton);
    await settle();
    expect(dialogRoot().querySelector('img')).toBeNull();
    expect(dialogRoot().querySelector('main')?.textContent).toContain('<img src=x');
  });

  it('Esc キーでキャンセルする', async () => {
    setUp();
    userClick(sendButton);
    await settle();
    dialogRoot()
      .querySelector('dialog')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    expect(isDialogOpen(document)).toBe(false);
    expect(delivered).toEqual([]);
  });

  it('ダイアログ内のキー操作を、Gmail 側（ページ）に伝えない', async () => {
    setUp();
    userClick(sendButton);
    await settle();
    let reached = 0;
    document.addEventListener('keydown', () => reached++);
    dialogRoot()
      .querySelector('input')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true, composed: true }));
    expect(reached).toBe(0);
  });
});

describe('キーボードでの送信', () => {
  it('Ctrl + Enter を止めて確認し、確認後は送信ボタンを押して送信する', async () => {
    setUp();
    const body = compose.querySelector('[g_editable="true"]');
    if (body === null) throw new Error('body not found');
    let reachedGmail = 0;
    document.addEventListener('keydown', () => reachedGmail++);

    const event = key(body, { key: 'Enter', ctrlKey: true });
    await settle();
    expect(event.defaultPrevented).toBe(true);
    expect(reachedGmail).toBe(0);
    expect(isDialogOpen(document)).toBe(true);

    checkAll();
    buttons()[1]?.click();
    await settle();
    expect(delivered).toEqual(['mousedown', 'mouseup', 'click']);
  });

  it('Cmd + Enter（Mac）も同じように止める', async () => {
    setUp();
    key(compose, { key: 'Enter', metaKey: true });
    await settle();
    expect(isDialogOpen(document)).toBe(true);
  });

  it('送信ボタンにフォーカスがある状態の Enter・Space を止める', async () => {
    setUp();
    const event = key(sendButton, { key: 'Enter' });
    await settle();
    expect(event.defaultPrevented).toBe(true);
    expect(delivered).toEqual([]);
    expect(isDialogOpen(document)).toBe(true);
  });

  it('本文での通常の Enter や、作成画面の外での Ctrl + Enter は止めない', async () => {
    setUp();
    const body = compose.querySelector('[g_editable="true"]');
    if (body === null) throw new Error('body not found');
    expect(key(body, { key: 'Enter' }).defaultPrevented).toBe(false);
    expect(key(document.body, { key: 'Enter', ctrlKey: true }).defaultPrevented).toBe(false);
    await settle();
    expect(isDialogOpen(document)).toBe(false);
  });

  it('日本語入力の変換中の Enter は対象にしない', async () => {
    setUp();
    const event = key(compose, { key: 'Enter', ctrlKey: true, isComposing: true });
    await settle();
    expect(event.defaultPrevented).toBe(false);
    expect(isDialogOpen(document)).toBe(false);
  });
});

describe('予約送信', () => {
  it('「送信日時を設定」を止めて確認し、確認後にメニュー項目を押し直す', async () => {
    setUp('schedule-menu.ja.20261120.html');
    const item = compose.querySelector('[selector="scheduledSend"]');
    if (item === null) throw new Error('schedule item not found');
    const reached: string[] = [];
    for (const type of ['mousedown', 'mouseup', 'click']) {
      item.addEventListener(type, () => reached.push(type));
    }

    userClick(item);
    await settle();
    expect(reached).toEqual([]);
    expect(buttons()[1]?.textContent).toBe('dialogSchedule');

    checkAll();
    buttons()[1]?.click();
    await settle();
    expect(reached).toEqual(['mousedown', 'mouseup', 'click']);
    // 送信ボタンは押さない（日時の選択へ進むだけ）
    expect(delivered).toEqual([]);
  });
});

describe('確認省略', () => {
  const skipRules = rules({
    skipAddresses: [
      'taro.yamada@example.com',
      'hanako.sato@example.org',
      'jiro.suzuki@example.com',
      'archive@example.net',
    ],
  });

  it('機能が有効で、すべての宛先が確認省略アドレスなら、ダイアログを出さずに送信する', async () => {
    settings = { ...settings, rules: skipRules, skipConfirmationEnabled: true };
    setUp();
    userClick(sendButton);
    await settle();
    expect(isDialogOpen(document)).toBe(false);
    expect(delivered).toEqual(['mousedown', 'mouseup', 'click']);
  });

  it('機能が無効（初期設定）なら、登録があっても確認する', async () => {
    settings = { ...settings, rules: skipRules };
    setUp();
    userClick(sendButton);
    await settle();
    expect(isDialogOpen(document)).toBe(true);
    expect(delivered).toEqual([]);
  });
});

describe('失敗時の動作', () => {
  async function expectCheckFailed(): Promise<void> {
    await settle();
    expect(delivered).toEqual([]);
    expect(dialogRoot().querySelector('.error')?.textContent).toBe('errorCheckFailed');
    // 送信へ進むボタンは無い（閉じるだけ）
    expect(buttons().map((button) => button.textContent)).toEqual(['dialogClose']);
  }

  it('設定を読み込めない場合は、送信を止めて「チェックできませんでした」と表示する', async () => {
    getSettings = () => Promise.reject(new Error('storage unavailable'));
    setUp();
    userClick(sendButton);
    await expectCheckFailed();
  });

  it('Gmail の画面から内容を読み取れない場合も、送信を止めて表示する', async () => {
    setUp();
    compose.querySelector('input[name="from"]')?.remove();
    userClick(sendButton);
    await expectCheckFailed();
  });

  it('検知の途中で例外が起きた場合も、送信を止めて表示する', async () => {
    // 設定が壊れている状態を模す
    settings = { ...settings, attachmentKeywords: null as unknown as string[] };
    setUp();
    compose.querySelectorAll('.dL').forEach((attachment) => {
      attachment.remove();
    });
    userClick(sendButton);
    await expectCheckFailed();
  });

  it('エラー表示を閉じても送信されず、次の送信操作でもう一度チェックする', async () => {
    getSettings = () => Promise.reject(new Error('storage unavailable'));
    setUp();
    userClick(sendButton);
    await settle();
    buttons()[0]?.click();
    await settle();
    expect(delivered).toEqual([]);

    getSettings = () => Promise.resolve(settings);
    userClick(sendButton);
    await settle();
    expect(dialogRoot().querySelector('.error')).toBeNull();
    expect(isDialogOpen(document)).toBe(true);
  });

  it('確認中に作成画面が閉じられた場合は、送信せずにエラーを表示する', async () => {
    setUp();
    userClick(sendButton);
    await settle();
    checkAll();
    compose.remove();
    buttons()[1]?.click();
    await expectCheckFailed();
  });

  it('作成画面を認識できない場合は、注意書きを表示する', () => {
    setUp();
    compose.className = 'renamed';
    compose
      .querySelector('[g_editable="true"]')
      ?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    const notice = document.querySelector('[data-gmail-send-guard-notice]');
    expect(notice?.shadowRoot?.textContent).toContain('errorSendButtonNotFound');
  });

  it('捕捉をやめた後は、送信操作を止めない', () => {
    setUp();
    stop();
    userClick(sendButton);
    expect(delivered).toEqual(['mousedown', 'mouseup', 'click']);
  });
});
