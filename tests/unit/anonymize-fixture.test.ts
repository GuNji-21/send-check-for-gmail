import { describe, expect, it } from 'vitest';
import {
  anonymizeFixtureHtml,
  checkFixtureHtml,
  isReservedDomain,
  maskText,
  parseDenylist,
  parseFixtureFileName,
} from '../../scripts/lib/anonymize-fixture.mjs';

// このテストで「実在の値」の役をするデータも、すべて架空のもの。
// example.com などの予約済みドメインは「置き換え不要」と判定されてしまうため、
// 置き換えられる側には fictional-*.jp や one.jp のような架空の名前を使っている。
const RAW = `
<div class="compose" role="dialog" aria-label="新規メッセージ - yamada@fictional-alpha.jp">
  <!-- account: yamada@fictional-alpha.jp -->
  <script>var owner = "yamada@fictional-alpha.jp";</script>
  <style>.x { background: url(https://lh3.googleusercontent.com/a/SECRET) }</style>
  <input name="subjectbox" value="お見積りの件 2026" placeholder="件名">
  <span class="chip" email="sato@fictional-beta.jp" name="佐藤 花子" data-hovercard-id="sato@fictional-beta.jp">佐藤 花子</span>
  <span class="chip" email="Suzuki@Fictional-Beta.jp" name="鈴木">鈴木</span>
  <span class="chip" email="tanaka@fictional-alpha.jp" name="田中">田中</span>
  <div class="body" contenteditable="true" g_editable="true" style="direction: ltr; background-image: url('https://lh3.googleusercontent.com/a/SECRET')">
    株式会社ベータ 佐藤様<br>資料を添付します。TEL 03-1234-5678
    <a href="https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWx/view?usp=drive_web&amp;authuser=yamada@fictional-alpha.jp">見積書_ベータ.pdf</a>
    <a href="https://www.fictional-beta.jp/secret/path?token=abc">会社サイト</a>
    <a href="mailto:sato@fictional-beta.jp?subject=hello">メール</a>
    <img src="data:image/png;base64,AAAA" alt="佐藤の写真" srcset="https://www.fictional-beta.jp/a.png 2x">
  </div>
  <div class="send" role="button" tabindex="1" data-tooltip="送信 (Ctrl+Enter)" aria-disabled="false" onclick="send()">送信</div>
</div>
`;

describe('maskText', () => {
  it('文字の種類ごとに伏せ字にし、記号・空白・改行は残す', () => {
    expect(maskText('Abc 山田ヤマダ様\n03-1234（木）')).toBe('Xxx 文文文文文文\n00-0000（文）');
  });

  it('伏せ字にした結果をもう一度かけても変わらない', () => {
    const once = maskText('Hello, 世界 2026!');
    expect(maskText(once)).toBe(once);
  });
});

describe('isReservedDomain', () => {
  it('予約済みドメインとそのサブドメインを認める', () => {
    expect(isReservedDomain('example.com')).toBe(true);
    expect(isReservedDomain('mail.Example.org')).toBe(true);
    expect(isReservedDomain('company4.example')).toBe(true);
  });

  it('それ以外のドメインは認めない', () => {
    expect(isReservedDomain('fictional-alpha.jp')).toBe(false);
    expect(isReservedDomain('notexample.com')).toBe(false);
    expect(isReservedDomain('example.com.fictional-alpha.jp')).toBe(false);
  });
});

describe('anonymizeFixtureHtml', () => {
  const result = anonymizeFixtureHtml(RAW);
  const html = result.html;

  it('元のアドレス・氏名・会社名・本文・電話番号・ファイルIDを残さない', () => {
    for (const secret of [
      'fictional-alpha',
      'fictional-beta',
      'yamada',
      'sato',
      'suzuki',
      '佐藤',
      '鈴木',
      '田中',
      'ベータ',
      '見積',
      '添付',
      '1234',
      '5678',
      '1AbCdEfGhIjKlMnOpQrStUvWx',
      'SECRET',
      'token',
      'AAAA',
    ]) {
      expect(html.toLowerCase()).not.toContain(secret.toLowerCase());
    }
  });

  it('同じアドレスは同じ値に、同じドメインは同じドメインに置き換える', () => {
    // 文書順：yamada@alpha → user1@company1.example、sato@beta → user2@company2.example、
    //         Suzuki@Beta（大文字違い）→ user3@company2.example、tanaka@alpha → user4@company1.example
    expect(html).toContain('aria-label="文文文文文文文 - user1@company1.example"');
    expect(html).toContain('email="user2@company2.example"');
    expect(html).toContain('data-hovercard-id="user2@company2.example"');
    expect(html).toContain('email="user3@company2.example"');
    expect(html).toContain('email="user4@company1.example"');
    expect(html).toContain('href="mailto:user2@company2.example"');
    expect(result.addressCount).toBe(4);
    expect(result.domainCount).toBe(2);
  });

  it('ドメインは出現順に companyN.example にする（宛先に使う example.com などとは重ならない）', () => {
    const many = anonymizeFixtureHtml(
      ['a@one.jp', 'b@two.jp', 'c@three.jp', 'd@four.jp'].map((a) => `<i>${a}</i>`).join(''),
    );
    expect(many.html).toBe(
      '<i>user1@company1.example</i><i>user2@company2.example</i><i>user3@company3.example</i><i>user4@company4.example</i>\n',
    );
  });

  it('画面構造を表す属性（class・role・フォームの name など）は残す', () => {
    expect(html).toContain('class="compose" role="dialog"');
    expect(html).toContain('name="subjectbox"');
    expect(html).toContain('contenteditable="true" g_editable="true"');
    expect(html).toContain('role="button" tabindex="1"');
    expect(html).toContain('aria-disabled="false"');
  });

  it('文言を持つ属性とテキストは伏せ字にする', () => {
    expect(html).toContain('value="文文文文文文 0000"');
    expect(html).toContain('placeholder="文文"');
    expect(html).toContain('name="文文 文文"');
    expect(html).toContain('data-tooltip="文文 (Xxxx+Xxxxx)"');
    expect(html).toContain('>文文</div>');
  });

  it('宛先欄の種類を表す name（to・cc・bcc）は、フォーム以外の要素でも残す', () => {
    const fields = anonymizeFixtureHtml(
      '<div name="to"></div><div name="cc"></div><div name="bcc"></div><div name="taro"></div>',
    );
    expect(fields.html).toBe(
      '<div name="to"></div><div name="cc"></div><div name="bcc"></div><div name="xxxx"></div>\n',
    );
  });

  it('Gmail が決めた記号を持つ属性は、値が記号の形のときだけ残す', () => {
    const tokens = anonymizeFixtureHtml(
      '<div command="+bold" peoplekit-id="BbVjBd" data-smartmail="gmail_signature"></div>' +
        '<div command="山田 太郎" peoplekit-id="a b"></div>',
    );
    expect(tokens.html).toBe(
      '<div command="+bold" peoplekit-id="BbVjBd" data-smartmail="gmail_signature"></div>' +
        '<div command="文文 文文" peoplekit-id="x x"></div>\n',
    );
  });

  it('テキストに書かれた URL も、属性の URL と同じ規則で匿名化する', () => {
    const result2 = anonymizeFixtureHtml(
      '<div>資料はこちら https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing です。' +
        '参考：https://www.one.jp/secret/page。</div>',
    );
    expect(result2.html).toBe(
      '<div>文文文文文文 https://drive.google.com/file/d/ID/view?usp=xxxxxxx 文文。' +
        '文文：https://example.com/。</div>\n',
    );
    expect(anonymizeFixtureHtml(result2.html).html).toBe(result2.html);
  });

  it('ドライブのリンクは、ホスト名とパスの形だけ残す', () => {
    expect(html).toContain(
      'href="https://drive.google.com/file/d/ID/view?usp=xxxxx_xxx&amp;authuser=user1%40company1.example"',
    );
  });

  it('Google 以外の URL は example.com に、data: は about:blank に置き換える', () => {
    expect(html).toContain('href="https://example.com/"');
    expect(html).toContain('src="about:blank"');
    expect(html).not.toContain('srcset');
  });

  it('script・style・コメント・イベント属性を削除し、style 属性の url() を空にする', () => {
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<style');
    expect(html).not.toContain('<!--');
    expect(html).not.toContain('onclick');
    expect(html).toContain('style="direction: ltr; background-image: url()"');
  });

  it('匿名化済みの HTML をもう一度匿名化しても変わらない', () => {
    const again = anonymizeFixtureHtml(html);
    expect(again.html).toBe(html);
    expect(again.changes).toEqual([]);
  });

  it('<html> 全体を渡した場合は、文書として出力する', () => {
    const doc = anonymizeFixtureHtml(
      '<!DOCTYPE html><html lang="ja"><head><title>受信トレイ - a@one.jp</title><meta charset="utf-8"></head><body><p>本文</p></body></html>',
    );
    expect(doc.html).toBe(
      '<!doctype html>\n<html lang="xx"><head><title>文文文文文 - user1@company1.example</title></head><body><p>文文</p></body></html>',
    );
    expect(anonymizeFixtureHtml(doc.html).html).toBe(doc.html);
  });

  it('先頭の BOM を無視する', () => {
    expect(anonymizeFixtureHtml('﻿<p>abc</p>').html).toBe('<p>xxx</p>\n');
  });
});

describe('checkFixtureHtml', () => {
  it('匿名化済みの HTML では何も報告しない', () => {
    expect(checkFixtureHtml(anonymizeFixtureHtml(RAW).html)).toEqual([]);
  });

  it('匿名化前の HTML では置き換え漏れを報告する', () => {
    const kinds = new Set(checkFixtureHtml(RAW).map((finding) => finding.kind));
    expect(kinds).toEqual(new Set(['email', 'element', 'comment', 'attribute', 'text']));
  });

  it('手で書き足したテキストを報告する', () => {
    const findings = checkFixtureHtml('<div class="body">文文文 山田様</div>');
    expect(findings).toEqual([
      { kind: 'text', location: 'html > body > div.body', value: '文文文 山田様' },
    ]);
  });

  it('伏せ字になっていない属性値を報告する', () => {
    const findings = checkFixtureHtml('<span class="chip" name="山田">文文</span>');
    expect(findings).toEqual([
      { kind: 'attribute', location: 'html > body > span.chip [name]', value: '山田' },
    ]);
  });

  it('予約済みドメイン以外のメールアドレスを報告する', () => {
    const findings = checkFixtureHtml('<span email="a@one.jp">user1@example.com</span>');
    expect(findings.map((finding) => finding.kind)).toEqual(['attribute', 'email']);
    expect(findings[1]?.value).toBe('a@one.jp');
  });

  it('Google 以外のホストの URL や、ID が残った URL を報告する', () => {
    expect(checkFixtureHtml('<a href="https://www.one.jp/">xxx</a>')).toHaveLength(1);
    expect(
      checkFixtureHtml('<a href="https://drive.google.com/file/d/1AbCdEfGh/view">xxx</a>'),
    ).toHaveLength(1);
    expect(checkFixtureHtml('<a href="https://drive.google.com/file/d/ID/view">xxx</a>')).toEqual(
      [],
    );
  });

  it('denylist の語を、大文字・小文字を区別せずに報告する', () => {
    // class は残す属性なので匿名化では変わらない。こうした残り方を denylist で拾う
    const html = '<div class="Yamada-box">xxx</div>';
    expect(checkFixtureHtml(html)).toEqual([]);
    expect(checkFixtureHtml(html, { denylist: ['yamada', '山田'] })).toEqual([
      { kind: 'denylist', location: '文字位置 12', value: 'yamada' },
    ]);
  });
});

describe('parseDenylist', () => {
  it('1行1語で読み、空行・コメント行・前後の空白・BOM を無視する', () => {
    expect(parseDenylist('﻿# 自分の名前\r\n山田\r\n\r\n  Fictional Alpha  \n')).toEqual([
      '山田',
      'Fictional Alpha',
    ]);
  });
});

describe('parseFixtureFileName', () => {
  it('決まりに合う名前を分解する', () => {
    expect(parseFixtureFileName('compose-new.ja.20261117.html')).toEqual({
      ok: true,
      screen: 'compose-new',
      states: [],
      lang: 'ja',
      date: '20261117',
    });
    expect(parseFixtureFileName('reply-inline--attachment--drive-link.en.20261117.html')).toEqual({
      ok: true,
      screen: 'reply-inline',
      states: ['attachment', 'drive-link'],
      lang: 'en',
      date: '20261117',
    });
  });

  it('決まりに合わない名前を拒否する', () => {
    for (const name of [
      'compose-new.html',
      'compose-new.ja.html',
      'compose-new.20261117.html',
      'Compose-New.ja.20261117.html',
      'compose_new.ja.20261117.html',
      'unknown-screen.ja.20261117.html',
      'compose-new.ja.20261317.html',
      'compose-new-attachment.ja.20261117.html',
      'compose-new.ja.20261117.htm',
    ]) {
      expect(parseFixtureFileName(name).ok, name).toBe(false);
    }
  });
});
