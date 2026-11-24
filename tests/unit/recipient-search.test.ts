// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFixture } from '../../scripts/lib/fixture-files.mjs';
import { SEARCH_BUTTON_DELAY_MS, startRecipientSearch } from '../../src/content/recipient-search';
import { findComposeWindows } from '../../src/gmail/compose';
import {
  ADD_RECIPIENT_TIMEOUT_MS,
  addRecipient,
  findComposeToolbarCell,
} from '../../src/gmail/recipients';
import { clearMessageCache } from '../../src/shared/i18n';
import type { LedgerSnapshot } from '../../src/shared/messages';
import {
  SEARCH_BUTTON_ATTRIBUTE,
  SEARCH_PANEL_ATTRIBUTE,
} from '../../src/ui/recipient-search/search';

const COMPOSE_FIXTURES = [
  'compose-new.ja.20261119.html',
  'compose-new--drive-chip.ja.20261120.html',
  'reply-inline.ja.20261120.html',
  'reply-all.ja.20261120.html',
  'forward.ja.20261120.html',
  'fullscreen--attachment.ja.20261120.html',
  'popout.ja.20261120.html',
];

const LAST_AT = '2026-11-01T10:00:00.000Z';

function loadCompose(fixture: string): HTMLElement {
  document.body.innerHTML = readFixture(fixture);
  const compose = findComposeWindows(document)[0];
  if (compose === undefined) throw new Error('compose window not found in the fixture');
  // 採取したときに入っていた宛先や入力中の文字は、テストの邪魔になるので取り除く
  for (const chip of compose.querySelectorAll('[role="option"][data-hovercard-id]')) chip.remove();
  for (const input of compose.querySelectorAll<HTMLInputElement>('input[role="combobox"]')) {
    input.value = '';
  }
  return compose;
}

/**
 * Gmail の宛先欄の動きをまねる。
 * - 入力欄で Enter を押すと、入力した文字が宛先チップになる
 * - 「Cc」のリンクを押すと、Cc の欄に入力欄ができる
 */
function simulateGmail(compose: HTMLElement): void {
  compose.addEventListener('keydown', (event) => {
    const input = event.target as HTMLInputElement;
    if (event.key !== 'Enter' || input.getAttribute('role') !== 'combobox') return;
    const chip = document.createElement('div');
    chip.setAttribute('role', 'option');
    chip.setAttribute('data-hovercard-id', input.value);
    input.before(chip);
    input.value = '';
  });
  compose.querySelector('.aB.gQ.pE')?.addEventListener('click', () => {
    const cc = compose.querySelector('[name="cc"]');
    if (cc?.querySelector('input[role="combobox"]') !== null) return;
    const input = document.createElement('input');
    input.setAttribute('role', 'combobox');
    cc.append(input);
  });
}

function chipsOf(compose: HTMLElement, field: 'to' | 'cc'): string[] {
  return [...compose.querySelectorAll(`[name="${field}"] [role="option"][data-hovercard-id]`)].map(
    (chip) => chip.getAttribute('data-hovercard-id') ?? '',
  );
}

function inputOf(compose: HTMLElement, field: 'to' | 'cc'): HTMLInputElement {
  const input = compose.querySelector<HTMLInputElement>(`[name="${field}"] input[role="combobox"]`);
  if (input === null) throw new Error(`input not found: ${field}`);
  return input;
}

beforeEach(() => {
  clearMessageCache();
  vi.stubGlobal('chrome', { i18n: { getMessage: (name: string) => name } });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  document.documentElement.querySelectorAll(`[${SEARCH_PANEL_ATTRIBUTE}]`).forEach((host) => {
    host.remove();
  });
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('addRecipient', () => {
  it('To の欄にアドレスを入れて、宛先チップにする', async () => {
    const compose = loadCompose('compose-new.ja.20261119.html');
    simulateGmail(compose);
    await expect(addRecipient(compose, 'to', 'taro@client.example')).resolves.toBe('added');
    expect(chipsOf(compose, 'to')).toEqual(['taro@client.example']);
    expect(inputOf(compose, 'to').value).toBe('');
  });

  it('すでに同じ欄に入っているアドレスは、足さない（大文字・小文字は区別しない）', async () => {
    const compose = loadCompose('compose-new.ja.20261119.html');
    simulateGmail(compose);
    await addRecipient(compose, 'to', 'taro@client.example');
    await expect(addRecipient(compose, 'to', 'Taro@Client.example')).resolves.toBe('already');
    expect(chipsOf(compose, 'to')).toEqual(['taro@client.example']);
  });

  it('Cc の欄が開いていなければ、開いてから入れる', async () => {
    const compose = loadCompose('compose-new--drive-chip.ja.20261120.html');
    simulateGmail(compose);
    expect(compose.querySelector('[name="cc"] input[role="combobox"]')).toBeNull();
    await expect(addRecipient(compose, 'cc', 'hana@partner.example')).resolves.toBe('added');
    expect(chipsOf(compose, 'cc')).toEqual(['hana@partner.example']);
    expect(chipsOf(compose, 'to')).toEqual([]);
  });

  it('宛先欄に入力中の文字があるときは、書き換えない', async () => {
    const compose = loadCompose('compose-new.ja.20261119.html');
    simulateGmail(compose);
    inputOf(compose, 'to').value = 'jiro@cli';
    await expect(addRecipient(compose, 'to', 'taro@client.example')).resolves.toBe('busy');
    expect(inputOf(compose, 'to').value).toBe('jiro@cli');
    expect(chipsOf(compose, 'to')).toEqual([]);
  });

  it('宛先チップにならなかったら失敗にして、入れた文字を消す', async () => {
    vi.useFakeTimers();
    const compose = loadCompose('compose-new.ja.20261119.html');
    const result = addRecipient(compose, 'to', 'taro@client.example');
    const rejected = expect(result).rejects.toThrow('recipient chip was not created');
    await vi.advanceTimersByTimeAsync(ADD_RECIPIENT_TIMEOUT_MS + 100);
    await rejected;
    expect(inputOf(compose, 'to').value).toBe('');
  });

  it.each([
    'taro@client.example, jiro@other.example',
    'taro @client.example',
    '見本 <taro@client.example>',
    'taro@client',
    'not-an-address',
    '',
  ])('宛先が複数になりうる文字・アドレスの形でない文字は入れない（%s）', async (address) => {
    const compose = loadCompose('compose-new.ja.20261119.html');
    simulateGmail(compose);
    await expect(addRecipient(compose, 'to', address)).rejects.toThrow();
    expect(chipsOf(compose, 'to')).toEqual([]);
    expect(inputOf(compose, 'to').value).toBe('');
  });
});

describe('findComposeToolbarCell', () => {
  it.each(COMPOSE_FIXTURES)('送信ボタンのある枠を見つける（%s）', (fixture) => {
    const compose = loadCompose(fixture);
    const cell = findComposeToolbarCell(compose);
    expect(cell).not.toBeNull();
    expect(compose.contains(cell)).toBe(true);
  });

  it.each(COMPOSE_FIXTURES)('To の入力欄と、Cc を開くリンクがある（%s）', (fixture) => {
    const compose = loadCompose(fixture);
    expect(compose.querySelector('[name="to"] input[role="combobox"]')).not.toBeNull();
    expect(compose.querySelector('[name="cc"]')).not.toBeNull();
    expect(compose.querySelector('.aB.gQ.pE')).not.toBeNull();
  });
});

describe('startRecipientSearch', () => {
  const ledger: LedgerSnapshot = {
    contacts: [
      {
        address: 'taro@client.example',
        companyKey: 'client.example',
        name: '見本 太郎',
        department: '営業部',
        toCount: 3,
        ccCount: 0,
        lastAt: LAST_AT,
      },
      {
        address: 'jiro@client.example',
        companyKey: 'client.example',
        name: '<img src=x onerror=alert(1)>',
        toCount: 1,
        ccCount: 0,
        lastAt: LAST_AT,
      },
      {
        address: 'hana@partner.example',
        companyKey: 'partner.example',
        toCount: 0,
        ccCount: 2,
        lastAt: LAST_AT,
      },
    ],
    companies: [
      { companyKey: 'client.example', name: '株式会社サンプル', lastAt: LAST_AT },
      { companyKey: 'partner.example', lastAt: LAST_AT },
    ],
    ccPairs: [],
  };

  let stop: () => void = () => undefined;
  let enabled = true;

  const start = (loadLedger = () => Promise.resolve(ledger)): void => {
    stop = startRecipientSearch({
      view: window,
      getSettings: () => Promise.resolve({ ledgerEnabled: enabled }),
      loadLedger,
    });
  };

  const buttonHost = (compose: HTMLElement): HTMLElement | null =>
    compose.querySelector<HTMLElement>(`[${SEARCH_BUTTON_ATTRIBUTE}]`);

  const panelRoot = (): ShadowRoot | null =>
    document.documentElement.querySelector(`[${SEARCH_PANEL_ATTRIBUTE}]`)?.shadowRoot ?? null;

  const openPanel = async (compose: HTMLElement): Promise<ShadowRoot> => {
    await vi.advanceTimersByTimeAsync(SEARCH_BUTTON_DELAY_MS);
    buttonHost(compose)?.shadowRoot?.querySelector('button')?.click();
    await vi.advanceTimersByTimeAsync(0);
    const root = panelRoot();
    if (root === null) throw new Error('the search panel did not open');
    return root;
  };

  const search = (root: ShadowRoot, text: string): void => {
    const query = root.querySelector<HTMLInputElement>('input.query');
    if (query === null) throw new Error('query input not found');
    query.value = text;
    query.dispatchEvent(new Event('input'));
  };

  beforeEach(() => {
    vi.useFakeTimers();
    enabled = true;
  });
  afterEach(() => {
    stop();
    stop = () => undefined;
  });

  it('連絡先の記録が有効なら、作成画面にボタンを1つだけ置く', async () => {
    const compose = loadCompose('compose-new.ja.20261119.html');
    start();
    await vi.advanceTimersByTimeAsync(SEARCH_BUTTON_DELAY_MS);
    expect(findComposeToolbarCell(compose)?.contains(buttonHost(compose))).toBe(true);
    // 画面が変わっても、ボタンは増えない
    document.body.append(document.createElement('div'));
    await vi.advanceTimersByTimeAsync(SEARCH_BUTTON_DELAY_MS * 2);
    expect(compose.querySelectorAll(`[${SEARCH_BUTTON_ATTRIBUTE}]`)).toHaveLength(1);
    expect(buttonHost(compose)?.shadowRoot?.querySelector('button')?.textContent).toBe(
      'composeSearchButton',
    );
  });

  it('連絡先の記録が無効なら、ボタンを置かない。途中で無効にしたら取り除く', async () => {
    const compose = loadCompose('compose-new.ja.20261119.html');
    enabled = false;
    start();
    await vi.advanceTimersByTimeAsync(SEARCH_BUTTON_DELAY_MS);
    expect(buttonHost(compose)).toBeNull();

    enabled = true;
    document.body.append(document.createElement('div'));
    await vi.advanceTimersByTimeAsync(SEARCH_BUTTON_DELAY_MS);
    expect(buttonHost(compose)).not.toBeNull();

    enabled = false;
    document.body.append(document.createElement('div'));
    await vi.advanceTimersByTimeAsync(SEARCH_BUTTON_DELAY_MS);
    expect(buttonHost(compose)).toBeNull();
  });

  it('止めると、ボタンとパネルを取り除く', async () => {
    const compose = loadCompose('compose-new.ja.20261119.html');
    start();
    await openPanel(compose);
    stop();
    expect(buttonHost(compose)).toBeNull();
    expect(panelRoot()).toBeNull();
  });

  it('会社名で検索して、選んだ人を To・Cc に追加する', async () => {
    const compose = loadCompose('compose-new.ja.20261119.html');
    simulateGmail(compose);
    start();
    const root = await openPanel(compose);
    expect(root.querySelector('.status')?.textContent).toBe('popupHint');

    search(root, 'サンプル');
    expect([...root.querySelectorAll('h3')].map((h) => h.textContent)).toEqual([
      '株式会社サンプル',
    ]);
    const rows = [...root.querySelectorAll('.person')];
    expect(rows).toHaveLength(2);
    const taro = rows.find((row) => row.textContent.includes('taro@client.example'));
    const [toButton, ccButton] = taro?.querySelectorAll('button') ?? [];
    expect(toButton?.textContent).toBe('composeSearchAddTo');
    expect(ccButton?.textContent).toBe('composeSearchAddCc');

    toButton?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(chipsOf(compose, 'to')).toEqual(['taro@client.example']);
    expect(toButton?.textContent).toBe('composeSearchAdded');
    expect(toButton?.disabled).toBe(true);

    const jiro = rows.find((row) => row.textContent.includes('jiro@client.example'));
    jiro?.querySelectorAll('button')[1]?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(chipsOf(compose, 'cc')).toEqual(['jiro@client.example']);
    expect(chipsOf(compose, 'to')).toEqual(['taro@client.example']);
  });

  it('台帳の値は、文字としてだけ表示する（HTML として解釈しない）', async () => {
    const compose = loadCompose('compose-new.ja.20261119.html');
    start();
    const root = await openPanel(compose);
    search(root, 'client.example');
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('.results')?.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('宛先に追加できなかったら、パネルに表示して、もう一度押せるようにする', async () => {
    // Gmail の動きをまねないので、宛先チップができない
    const compose = loadCompose('compose-new.ja.20261119.html');
    start();
    const root = await openPanel(compose);
    search(root, 'partner');
    const button = root.querySelector<HTMLButtonElement>('.person button');
    button?.click();
    await vi.advanceTimersByTimeAsync(ADD_RECIPIENT_TIMEOUT_MS + 100);
    expect(root.querySelector('.status')?.textContent).toBe('composeSearchFailed');
    expect(button?.disabled).toBe(false);
    expect(chipsOf(compose, 'to')).toEqual([]);
  });

  it('宛先欄に入力中の文字があるときは、その旨を表示する', async () => {
    const compose = loadCompose('compose-new.ja.20261119.html');
    simulateGmail(compose);
    inputOf(compose, 'to').value = 'someone';
    start();
    const root = await openPanel(compose);
    search(root, 'partner');
    root.querySelector<HTMLButtonElement>('.person button')?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(root.querySelector('.status')?.textContent).toBe('composeSearchBusy');
    expect(inputOf(compose, 'to').value).toBe('someone');
  });

  it('台帳を読めなかったら、パネルに表示する（例外を外に出さない）', async () => {
    const compose = loadCompose('compose-new.ja.20261119.html');
    start(() => Promise.reject(new Error('ledger unavailable')));
    const root = await openPanel(compose);
    expect(root.querySelector('.status')?.textContent).toBe('manageFailed');
  });

  it('記録が1件も無ければ、その旨を表示する', async () => {
    const compose = loadCompose('compose-new.ja.20261119.html');
    start(() => Promise.resolve({ contacts: [], companies: [], ccPairs: [] }));
    const root = await openPanel(compose);
    expect(root.querySelector('.status')?.textContent).toBe('popupEmpty');
  });

  it('Esc・閉じるボタン・ボタンの押し直し・作成画面を閉じたときに、パネルを閉じる', async () => {
    const compose = loadCompose('compose-new.ja.20261119.html');
    start();

    let root = await openPanel(compose);
    root
      .querySelector('.panel')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(panelRoot()).toBeNull();

    root = await openPanel(compose);
    root.querySelector<HTMLButtonElement>('button.close')?.click();
    expect(panelRoot()).toBeNull();

    await openPanel(compose);
    buttonHost(compose)?.shadowRoot?.querySelector('button')?.click();
    expect(panelRoot()).toBeNull();

    await openPanel(compose);
    compose.remove();
    await vi.advanceTimersByTimeAsync(SEARCH_BUTTON_DELAY_MS);
    expect(panelRoot()).toBeNull();
  });

  it('パネルの中のキー操作を、Gmail に伝えない', async () => {
    const compose = loadCompose('compose-new.ja.20261119.html');
    start();
    const root = await openPanel(compose);
    const seen = vi.fn();
    document.addEventListener('keydown', seen);
    root
      .querySelector('input.query')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true, composed: true }));
    document.removeEventListener('keydown', seen);
    expect(seen).not.toHaveBeenCalled();
  });
});
