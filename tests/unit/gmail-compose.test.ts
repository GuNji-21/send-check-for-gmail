// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { listFixtureFiles, readFixture } from '../../scripts/lib/fixture-files.mjs';
import {
  GmailStructureError,
  activateElement,
  findComposeOf,
  findComposeWindows,
  findSendButton,
  findSendTarget,
  findSendTargetForKey,
  isUnrecognizedCompose,
  readComposeSnapshot,
  replaceComposeText,
  toLocalIsoString,
} from '../../src/gmail/compose';

// フィクスチャは匿名化済みで、本文・件名・氏名はすべて伏せ字（文・x・0）になっている。
// 件名の入力値などページ上の状態は HTML に残らないため、必要な値はテストの中で入れる。

const AT = new Date(2026, 10, 20, 9, 30, 0);

/** 作成画面を含むフィクスチャ（予約送信のダイアログ2つと、届いたメールの表示画面は作成画面を含まない） */
const COMPOSE_FIXTURES = listFixtureFiles().filter(
  (name) =>
    !name.startsWith('schedule-presets') &&
    !name.startsWith('schedule-picker') &&
    // 届いたメールの表示画面（フェーズ2b 用）も、作成画面ではない
    !name.startsWith('message-view'),
);

function load(name: string): HTMLElement {
  document.body.innerHTML = readFixture(name);
  const compose = findComposeWindows(document)[0];
  if (compose === undefined) throw new Error(`no compose window in ${name}`);
  return compose;
}

function query(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(selector);
  if (element === null) throw new Error(`not found: ${selector}`);
  return element;
}

function subjectInput(compose: HTMLElement): HTMLInputElement {
  const input = compose.querySelector<HTMLInputElement>('input[name="subjectbox"]');
  if (input === null) throw new Error('subject input not found');
  return input;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('すべての作成画面のフィクスチャ', () => {
  it('検査対象のフィクスチャがある', () => {
    expect(COMPOSE_FIXTURES.length).toBeGreaterThanOrEqual(9);
  });

  it.each(COMPOSE_FIXTURES)('%s：作成画面・送信ボタン・予約送信の項目を特定できる', (name) => {
    const compose = load(name);
    expect(findComposeWindows(document)).toHaveLength(1);

    const sendButton = findSendButton(compose);
    expect(findSendTarget(sendButton)).toEqual({ kind: 'button', compose, element: sendButton });

    const scheduleItem = query(compose, '[selector="scheduledSend"]');
    expect(findSendTarget(scheduleItem)).toEqual({
      kind: 'schedule',
      compose,
      element: scheduleItem,
    });
  });

  it.each(COMPOSE_FIXTURES)('%s：送信内容を読み取れる', (name) => {
    const snapshot = readComposeSnapshot(load(name), AT);
    expect(snapshot.fromAddress).toMatch(/^user\d+@company\d+\.example$/);
    expect(snapshot.capturedAt).toMatch(/^2026-11-20T09:30:00[+-]\d{2}:\d{2}$/);
    // 本文は、何も書いていない返信・転送では空になる（署名の無いアカウントの場合）
    expect(typeof snapshot.bodyText).toBe('string');
    for (const recipient of snapshot.recipients) {
      expect(recipient.address).toContain('@');
    }
  });
});

describe('readComposeSnapshot', () => {
  it('To / Cc / Bcc の宛先を、欄の種類とあわせて読む', () => {
    const snapshot = readComposeSnapshot(load('compose-new.ja.20261119.html'), AT);
    expect(snapshot.recipients).toEqual([
      { address: 'taro.yamada@example.com', field: 'to' },
      { address: 'hanako.sato@example.org', field: 'to' },
      { address: 'jiro.suzuki@example.com', field: 'cc' },
      { address: 'archive@example.net', field: 'bcc' },
    ]);
  });

  it('宛先チップに表示名があれば読む', () => {
    const compose = load('compose-new.ja.20261119.html');
    query(compose, '[name="to"] [role="option"][data-hovercard-id]').setAttribute(
      'data-name',
      '山田 太郎',
    );
    expect(readComposeSnapshot(compose, AT).recipients[0]).toEqual({
      address: 'taro.yamada@example.com',
      displayName: '山田 太郎',
      field: 'to',
    });
  });

  it('チップになっていない入力中のアドレスも宛先に含める', () => {
    const compose = load('compose-new.ja.20261119.html');
    query(compose, '[name="cc"] input[role="combobox"]').setAttribute(
      'value',
      'typing@example.com',
    );
    expect(readComposeSnapshot(compose, AT).recipients).toContainEqual({
      address: 'typing@example.com',
      field: 'cc',
    });
  });

  it('件名は入力欄の現在の値を読む', () => {
    const compose = load('compose-new.ja.20261119.html');
    expect(readComposeSnapshot(compose, AT).subject).toBe('');
    (query(compose, 'input[name="subjectbox"]') as HTMLInputElement).value = 'お見積りの件';
    expect(readComposeSnapshot(compose, AT).subject).toBe('お見積りの件');
  });

  it('本文を、行の区切りを保ったテキストとして読む', () => {
    const compose = load('compose-new.ja.20261119.html');
    query(compose, '[g_editable="true"]').innerHTML =
      '<div>山田様</div><div><br></div><div>資料を添付します。<br>11月20日（金）まで</div>';
    expect(readComposeSnapshot(compose, AT).bodyText).toBe(
      '山田様\n\n資料を添付します。\n11月20日（金）まで',
    );
  });

  it('添付ファイルの件数とファイル名を読む', () => {
    const none = readComposeSnapshot(load('compose-new.ja.20261119.html'), AT);
    expect(none.attachments).toEqual([]);

    const two = readComposeSnapshot(load('compose-new--attachment.ja.20261120.html'), AT);
    expect(two.attachments).toHaveLength(2);
    // ファイル名は伏せ字だが、拡張子の形（.xxx）は残っている
    expect(two.attachments.every((attachment) => attachment.fileName.endsWith('.xxx'))).toBe(true);
  });

  it('引用を畳んだ返信では、本文に引用が含まれない', () => {
    const collapsed = readComposeSnapshot(load('reply-inline.ja.20261120.html'), AT);
    const expanded = readComposeSnapshot(load('reply-inline--quote-expanded.ja.20261120.html'), AT);
    // 引用を展開しても、引用部分（gmail_quote）は取り除かれるので本文は同じになる
    expect(expanded.bodyText).toBe(collapsed.bodyText);
  });

  it('引用部分の中の文字は、検知の対象にならない', () => {
    const compose = load('reply-inline--quote-expanded.ja.20261120.html');
    const body = query(compose, '[g_editable="true"]');
    query(body, '.gmail_quote').append('見積書を添付します 〇〇様');
    expect(readComposeSnapshot(compose, AT).bodyText).not.toContain('見積書');

    body.prepend('自分で書いた文です。');
    expect(readComposeSnapshot(compose, AT).bodyText).toContain('自分で書いた文です。');
  });

  it('転送の本文からも引用部分を除く', () => {
    const snapshot = readComposeSnapshot(load('forward.ja.20261120.html'), AT);
    expect(snapshot.recipients).toEqual([]);
    expect(snapshot.bodyText).toBe(
      readComposeSnapshot(load('reply-inline.ja.20261120.html'), AT).bodyText,
    );
  });

  it('全員に返信では、To と Cc の宛先を読む', () => {
    const snapshot = readComposeSnapshot(load('reply-all.ja.20261120.html'), AT);
    expect(snapshot.recipients.map((recipient) => recipient.field)).toEqual(['to', 'cc']);
  });

  it('最初から転送を押した場合も、転送元のメール（引用部分）を本文から除く', () => {
    const compose = load('forward--from-button.ja.20261120.html');
    expect(compose.querySelector('[g_editable="true"] .gmail_quote')).not.toBeNull();
    const snapshot = readComposeSnapshot(compose, AT);
    expect(snapshot.recipients).toEqual([]);
    // 自分では何も書いていないので、転送元のメール（引用）を除くと本文は空になる
    expect(snapshot.bodyText).toBe('');
  });

  it('ドライブのボタンから挿入したファイル（チップ）を、ドライブのリンクとして数える', () => {
    const snapshot = readComposeSnapshot(load('compose-new--drive-chip.ja.20261120.html'), AT);
    expect(snapshot.driveLinkCount).toBe(1);
    expect(snapshot.attachments).toEqual([]);
  });

  describe('Google ドライブのリンク', () => {
    const count = (html: string): number => {
      const compose = load('compose-new.ja.20261119.html');
      query(compose, '[g_editable="true"]').innerHTML = html;
      return readComposeSnapshot(compose, AT).driveLinkCount;
    };

    it('drive.google.com と docs.google.com のリンクを数える', () => {
      expect(
        count(
          '<a href="https://drive.google.com/file/d/ID/view">資料</a> と ' +
            '<a href="https://docs.google.com/document/d/ID/edit">文書</a>',
        ),
      ).toBe(2);
    });

    it('貼り付けただけの URL（リンクになっていない文字列）も数える', () => {
      expect(count('<div>資料：https://drive.google.com/file/d/ID/view。</div>')).toBe(1);
    });

    it('リンクの文字が URL そのものでも、二重には数えない', () => {
      expect(
        count(
          '<a href="https://drive.google.com/file/d/ID/view">https://drive.google.com/file/d/ID/view</a>',
        ),
      ).toBe(1);
    });

    it('ドライブ以外のリンクは数えない', () => {
      expect(
        count(
          '<a href="https://script.google.com/d/ID/edit">スクリプト</a> ' +
            '<a href="https://www.example.com/drive.google.com">その他</a> ' +
            'https://mail.google.com/mail/u/0/',
        ),
      ).toBe(0);
    });

    it('本文に URL を貼った採取結果（script.google.com）は 0 件', () => {
      const snapshot = readComposeSnapshot(
        load('compose-new--attachment--drive-link.ja.20261120.html'),
        AT,
      );
      expect(snapshot.bodyText).toContain('https://script.google.com/d/ID/edit');
      expect(snapshot.driveLinkCount).toBe(0);
    });

    it('引用部分の中のリンクは数えない', () => {
      expect(
        count(
          '<div>本文</div><div class="gmail_quote"><a href="https://drive.google.com/file/d/ID/view">x</a></div>',
        ),
      ).toBe(0);
    });
  });

  describe('要素が見つからない場合は例外を投げる（送信を止めるため）', () => {
    const cases: readonly (readonly [string, string])[] = [
      ['送信元', 'input[name="from"]'],
      ['件名', 'input[name="subjectbox"]'],
      ['本文', '[g_editable="true"]'],
      ['To の欄', '[name="to"]'],
    ];

    it.each(cases)('%s', (_label, selector) => {
      const compose = load('compose-new--attachment.ja.20261120.html');
      query(compose, selector).remove();
      expect(() => readComposeSnapshot(compose, AT)).toThrow(GmailStructureError);
    });

    it('送信元の値が空', () => {
      const compose = load('compose-new.ja.20261119.html');
      query(compose, 'input[name="from"]').setAttribute('value', '');
      expect(() => readComposeSnapshot(compose, AT)).toThrow(GmailStructureError);
    });

    it('添付ファイル名', () => {
      const compose = load('compose-new--attachment.ja.20261120.html');
      query(compose, '.dL .vI').remove();
      expect(() => readComposeSnapshot(compose, AT)).toThrow(GmailStructureError);
    });

    it('送信ボタン', () => {
      const compose = load('compose-new.ja.20261119.html');
      findSendButton(compose).remove();
      expect(() => findSendButton(compose)).toThrow(GmailStructureError);
    });
  });
});

describe('送信操作の対象の特定', () => {
  it('送信ボタンの中の要素からも、送信ボタンとして特定する', () => {
    const compose = load('compose-new.ja.20261119.html');
    const button = findSendButton(compose);
    const inner = document.createElement('span');
    button.append(inner);
    expect(findSendTarget(inner)?.element).toBe(button);
  });

  it('送信ボタン以外（書式のボタン、本文、作成画面の外）は対象にしない', () => {
    const compose = load('compose-new.ja.20261119.html');
    expect(findSendTarget(query(compose, '[command="+bold"]'))).toBeNull();
    expect(findSendTarget(query(compose, '[g_editable="true"]'))).toBeNull();
    expect(findSendTarget(document.body)).toBeNull();
    expect(findSendTarget(null)).toBeNull();
    expect(findSendTarget(document)).toBeNull();
  });

  it('class が変わっても、ツールチップの送信ショートカットの表記で送信ボタンを特定する', () => {
    const compose = load('compose-new.ja.20261119.html');
    const button = findSendButton(compose);
    button.className = 'changed';
    button.setAttribute('data-tooltip', 'Send (Ctrl+Enter)');
    expect(findSendButton(compose)).toBe(button);
    expect(findSendTarget(button)?.kind).toBe('button');
  });

  it('予約送信のメニューを開いた状態のキー操作は、予約送信として扱う', () => {
    const compose = load('schedule-menu.ja.20261120.html');
    const item = query(compose, '[selector="scheduledSend"]');
    const menuButton = query(compose, '.T-I.hG');
    expect(menuButton.getAttribute('aria-expanded')).toBe('true');
    expect(findSendTargetForKey(menuButton)).toEqual({ kind: 'schedule', compose, element: item });
    expect(findSendTargetForKey(item.parentElement)).toEqual({
      kind: 'schedule',
      compose,
      element: item,
    });
  });

  it('メニューを閉じた状態のキー操作は、予約送信として扱わない', () => {
    const compose = load('compose-new.ja.20261119.html');
    expect(findSendTargetForKey(query(compose, '.T-I.hG'))).toBeNull();
    expect(findSendTargetForKey(query(compose, '[g_editable="true"]'))).toBeNull();
  });

  it('作成画面の中の要素から、その作成画面を返す', () => {
    const compose = load('popout.ja.20261120.html');
    expect(findComposeOf(query(compose, '[g_editable="true"]'))).toBe(compose);
    expect(findComposeOf(document.body)).toBeNull();
  });

  it('件名と本文の欄はあるのに作成画面として認識できない状態を見分ける', () => {
    const compose = load('compose-new.ja.20261119.html');
    const body = query(compose, '[g_editable="true"]');
    expect(isUnrecognizedCompose(body)).toBe(false);
    // Gmail の更新で作成画面の class が変わった場合を模す
    compose.className = 'renamed';
    expect(isUnrecognizedCompose(body)).toBe(true);
    expect(isUnrecognizedCompose(document.body)).toBe(false);
  });
});

describe('replaceComposeText', () => {
  function setUp(bodyHtml: string, subject = 'お見積りの件'): HTMLElement {
    const compose = load('reply-inline--quote-expanded.ja.20261120.html');
    const body = query(compose, '[g_editable="true"]');
    const quote = query(body, '.gmail_quote');
    body.innerHTML = bodyHtml;
    body.append(quote);
    const subjectInput = compose.querySelector<HTMLInputElement>('input[name="subjectbox"]');
    if (subjectInput === null) throw new Error('subject input not found');
    subjectInput.value = subject;
    return compose;
  }

  it('本文の該当箇所を置き換え、Gmail に変更を知らせる', () => {
    const compose = setUp('<div>資料をを送付いたします。</div>');
    const body = query(compose, '[g_editable="true"]');
    let inputEvents = 0;
    body.addEventListener('input', () => inputEvents++);

    expect(replaceComposeText(compose, '資料をを', '資料を').status).toBe('applied');
    expect(readComposeSnapshot(compose, AT).bodyText).toBe('資料を送付いたします。');
    expect(inputEvents).toBe(1);
  });

  it('件名の該当箇所を置き換える', () => {
    const compose = setUp('<div>本文です。</div>', 'お見積りのの件');
    expect(replaceComposeText(compose, 'りのの件', 'りの件').status).toBe('applied');
    expect(readComposeSnapshot(compose, AT).subject).toBe('お見積りの件');
  });

  it('該当箇所が2か所以上あるときは、置き換えない', () => {
    const compose = setUp('<div>資料をを送ります。</div><div>書類をを送ります。</div>');
    expect(replaceComposeText(compose, 'をを', 'を').status).toBe('ambiguous');
    expect(readComposeSnapshot(compose, AT).bodyText).toContain('資料をを');
  });

  it('件名と本文の両方にあるときも、置き換えない', () => {
    const compose = setUp('<div>見積もりの件です。</div>', '見積もりの件');
    expect(replaceComposeText(compose, '見積もり', '見積り').status).toBe('ambiguous');
  });

  it('該当箇所が無いときは、置き換えない', () => {
    const compose = setUp('<div>資料を送ります。</div>');
    expect(replaceComposeText(compose, '存在しない', 'x').status).toBe('not-found');
    expect(replaceComposeText(compose, '', 'x').status).toBe('not-found');
  });

  it('文字のかたまり（テキストノード）が分かれていても、続いている文字として置き換える', () => {
    const compose = setUp('<div></div>');
    const line = query(compose, '[g_editable="true"] div');
    // Gmail の本文は、打ち直しや変換のたびに文字のかたまりが分かれる
    line.append('アリが', 'がとう', 'ございます。');
    expect(line.childNodes).toHaveLength(3);

    expect(replaceComposeText(compose, 'アリががとう', 'ありがとう').status).toBe('applied');
    expect(readComposeSnapshot(compose, AT).bodyText).toBe('ありがとうございます。');
  });

  it('太字などの書式の境目をまたいでいても置き換える', () => {
    const compose = setUp('<div>資料を<b>を</b>送ります。</div>');
    expect(replaceComposeText(compose, '資料をを', '資料を').status).toBe('applied');
    expect(readComposeSnapshot(compose, AT).bodyText).toBe('資料を送ります。');
  });

  it('行をまたぐ一致は、置き換えない', () => {
    const compose = setUp('<div>資料を</div><div>を送ります。</div>');
    expect(replaceComposeText(compose, '資料をを', '資料を').status).toBe('not-found');
    const lines = setUp('<div>資料を<br>を送ります。</div>');
    expect(replaceComposeText(lines, '資料をを', '資料を').status).toBe('not-found');
  });

  it('改行しない空白（&nbsp;）が混ざっていても見つける', () => {
    const compose = setUp('<div>資料&nbsp;をを送ります。</div>');
    expect(replaceComposeText(compose, '資料 をを', '資料を').status).toBe('applied');
    expect(readComposeSnapshot(compose, AT).bodyText).toBe('資料を送ります。');
  });

  it('修正案が直後の文字と重なる場合は、重なりを除いて置き換える', () => {
    // AI が「アリががとう」に対して「ありがとうございます」を返した場合
    const compose = setUp('<div>アリががとうございます。</div>');
    expect(replaceComposeText(compose, 'アリががとう', 'ありがとうございます').status).toBe(
      'applied',
    );
    expect(readComposeSnapshot(compose, AT).bodyText).toBe('ありがとうございます。');
  });

  describe('書き換えた後', () => {
    function applied(compose: HTMLElement, search: string, replacement: string) {
      const outcome = replaceComposeText(compose, search, replacement);
      if (outcome.status !== 'applied') throw new Error(`not applied: ${outcome.status}`);
      return outcome;
    }

    it('書き換えた行を、メール本体から読み直して返す', () => {
      const compose = setUp(
        '<div>お世話になっております。</div><div>資料をを送付いたします。</div>',
      );
      expect(applied(compose, '資料をを', '資料を').line).toEqual({
        before: '',
        fixed: '資料を',
        after: '送付いたします。',
      });
    });

    it('行の途中を書き換えた場合は、同じ行の前後を返す（ほかの行は含めない）', () => {
      const compose = setUp(
        '<div>1行目</div><div>先日はアリががとうございました。</div><div>3行目</div>',
      );
      expect(applied(compose, 'アリががとう', 'ありがとう').line).toEqual({
        before: '先日は',
        fixed: 'ありがとう',
        after: 'ございました。',
      });
    });

    it('件名を書き換えた場合は、件名の前後を返す', () => {
      const compose = setUp('<div>本文です。</div>', 'お見積りのの件');
      expect(applied(compose, 'りのの件', 'りの件').line).toEqual({
        before: 'お見積',
        fixed: 'りの件',
        after: '',
      });
    });

    it('元に戻すと、書き換える前の本文に戻り、Gmail に変更を知らせる', () => {
      const compose = setUp('<div></div>');
      const line = query(compose, '[g_editable="true"] div');
      line.append('アリが', 'がとう', 'ございます。');
      const outcome = applied(compose, 'アリががとう', 'ありがとう');
      expect(readComposeSnapshot(compose, AT).bodyText).toBe('ありがとうございます。');

      let inputEvents = 0;
      query(compose, '[g_editable="true"]').addEventListener('input', () => inputEvents++);
      expect(outcome.undo()).toBe(true);
      expect(readComposeSnapshot(compose, AT).bodyText).toBe('アリががとうございます。');
      expect(inputEvents).toBe(1);
    });

    it('件名の書き換えも元に戻せる', () => {
      const compose = setUp('<div>本文です。</div>', 'お見積りのの件');
      const outcome = applied(compose, 'りのの件', 'りの件');
      expect(outcome.undo()).toBe(true);
      expect(readComposeSnapshot(compose, AT).subject).toBe('お見積りのの件');
    });

    it('書き換えた後にその箇所が編集されていたら、元に戻さない', () => {
      const compose = setUp('<div>資料をを送付いたします。</div>');
      const outcome = applied(compose, '資料をを', '資料を');
      const node = query(compose, '[g_editable="true"] div').firstChild;
      if (node === null) throw new Error('text node not found');
      node.nodeValue = '資料を郵送いたします。';
      expect(outcome.undo()).toBe(false);
      expect(readComposeSnapshot(compose, AT).bodyText).toBe('資料を郵送いたします。');

      const subject = setUp('<div>本文です。</div>', 'お見積りのの件');
      const subjectOutcome = applied(subject, 'りのの件', 'りの件');
      subjectInput(subject).value = '別の件名';
      expect(subjectOutcome.undo()).toBe(false);
    });

    it('書き換えた箇所を、メールの画面で選択する', () => {
      const compose = setUp('<div>先日はアリががとうございました。</div>');
      applied(compose, 'アリががとう', 'ありがとう').reveal();
      expect(document.getSelection()?.toString()).toBe('ありがとう');
    });

    it('件名の書き換えた箇所を選択する', () => {
      const compose = setUp('<div>本文です。</div>', 'お見積りのの件');
      applied(compose, 'りのの件', 'りの件').reveal();
      const input = subjectInput(compose);
      expect(input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? 0)).toBe('りの件');
    });
  });

  it('引用部分（過去のメール）は書き換えない', () => {
    const compose = setUp('<div>本文です。</div>');
    const quote = query(compose, '[g_editable="true"] .gmail_quote');
    quote.append('引用の中の誤字をを含む文');
    expect(replaceComposeText(compose, '誤字をを', '誤字を').status).toBe('not-found');
    expect(quote.textContent).toContain('誤字をを');
  });

  it('件名や本文の欄が無い場合は例外を投げる', () => {
    const compose = setUp('<div>本文</div>');
    query(compose, '[g_editable="true"]').remove();
    expect(() => replaceComposeText(compose, '本文', 'x')).toThrow(GmailStructureError);
  });
});

describe('activateElement', () => {
  it('mousedown・mouseup・click を順に発生させる', () => {
    const button = document.createElement('div');
    document.body.append(button);
    const seen: string[] = [];
    for (const type of ['mousedown', 'mouseup', 'click']) {
      document.addEventListener(type, (event) => {
        if (event.target === button) seen.push(type);
      });
    }
    activateElement(button);
    expect(seen).toEqual(['mousedown', 'mouseup', 'click']);
  });
});

describe('toLocalIsoString', () => {
  it('利用者の時計での年月日・時刻と、UTC との差を出力する', () => {
    const text = toLocalIsoString(new Date(2026, 0, 5, 7, 8, 9));
    expect(text).toMatch(/^2026-01-05T07:08:09[+-]\d{2}:\d{2}$/);
    expect(new Date(text).getTime()).toBe(new Date(2026, 0, 5, 7, 8, 9).getTime());
  });
});
