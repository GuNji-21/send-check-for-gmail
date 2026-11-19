import { describe, expect, it } from 'vitest';
import {
  classifyRecipient,
  companyKeyOf,
  isInternalAddress,
  shouldSkipConfirmation,
} from '../../src/core/classify';
import { FREEMAIL_DOMAINS, isFreemailDomain } from '../../src/core/freemail';
import {
  domainOf,
  looksLikeAddress,
  looksLikeDomain,
  normalizeDomain,
} from '../../src/core/text/address';
import { parseLines, toHalfWidth } from '../../src/core/text/normalize';
import { recipient, rules } from './helpers';

const FROM = 'me@mycompany.example';

describe('address', () => {
  it('ドメインを小文字で取り出す', () => {
    expect(domainOf(' Taro@Client.Example ')).toBe('client.example');
    expect(domainOf('no-at-mark')).toBe('');
  });

  it('ドメインの先頭の @ と前後の空白を除く', () => {
    expect(normalizeDomain(' @Client.Example ')).toBe('client.example');
  });

  it('アドレス・ドメインの形を判定する', () => {
    expect(looksLikeAddress('taro@client.example')).toBe(true);
    expect(looksLikeAddress('taro@client')).toBe(false);
    expect(looksLikeAddress('client.example')).toBe(false);
    expect(looksLikeDomain('client.example')).toBe(true);
    expect(looksLikeDomain('@client.example')).toBe(true);
    expect(looksLikeDomain('taro@client.example')).toBe(false);
    expect(looksLikeDomain('client')).toBe(false);
  });
});

describe('normalize', () => {
  it('全角の英数字・括弧を半角にする', () => {
    expect(toHalfWidth('１１月１３日（木）ＸＸ')).toBe('11月13日(木)XX');
  });

  it('1行1件で読み、空行・重複・前後の空白を除く', () => {
    expect(parseLines(' a \r\n\r\nb\na\n')).toEqual(['a', 'b']);
  });
});

describe('isFreemailDomain', () => {
  it('フリーメールのドメインを、大文字・小文字を区別せずに判定する', () => {
    expect(isFreemailDomain('gmail.com')).toBe(true);
    expect(isFreemailDomain('Yahoo.co.jp')).toBe(true);
    expect(isFreemailDomain('@icloud.com')).toBe(true);
  });

  it('会社のドメインはフリーメールとみなさない', () => {
    expect(isFreemailDomain('client.example')).toBe(false);
    expect(isFreemailDomain('mail.gmail.com.example')).toBe(false);
  });

  it('一覧はすべて小文字で、重複が無い', () => {
    expect(FREEMAIL_DOMAINS.every((domain) => domain === domain.toLowerCase())).toBe(true);
    expect(new Set(FREEMAIL_DOMAINS).size).toBe(FREEMAIL_DOMAINS.length);
  });
});

describe('classifyRecipient', () => {
  const classify = (address: string, r = rules(), fromAddress = FROM) =>
    classifyRecipient(recipient(address), { rules: r, fromAddress });

  it('送信元と同じドメインは、登録が無くても社内', () => {
    expect(classify('hanako@mycompany.example')).toBe('internal');
    expect(classify('Hanako@MyCompany.Example')).toBe('internal');
  });

  it('登録の無い別ドメインは社外', () => {
    expect(classify('taro@client.example')).toBe('external');
    // サブドメインは別のドメインとして扱う
    expect(classify('taro@sub.mycompany.example')).toBe('external');
  });

  it('社内として登録したドメイン・アドレスは社内', () => {
    expect(classify('a@group.example', rules({ internalDomains: ['Group.Example'] }))).toBe(
      'internal',
    );
    expect(
      classify('partner@other.example', rules({ internalAddresses: ['Partner@other.example'] })),
    ).toBe('internal');
    expect(
      classify('someone@other.example', rules({ internalAddresses: ['partner@other.example'] })),
    ).toBe('external');
  });

  it('要注意として登録したドメイン・アドレスは要注意', () => {
    expect(classify('a@vip.example', rules({ cautionDomains: ['vip.example'] }))).toBe('caution');
    expect(classify('x@client.example', rules({ cautionAddresses: ['x@client.example'] }))).toBe(
      'caution',
    );
  });

  it('要注意は社内より優先する', () => {
    expect(
      classify(
        'retired@mycompany.example',
        rules({ cautionAddresses: ['retired@mycompany.example'] }),
      ),
    ).toBe('caution');
  });

  it('フリーメールにはドメイン単位の指定を適用しない', () => {
    const r = rules({ internalDomains: ['gmail.com'], cautionDomains: ['yahoo.co.jp'] });
    expect(classify('someone@gmail.com', r)).toBe('external');
    expect(classify('someone@yahoo.co.jp', r)).toBe('external');
    // アドレス単位の指定は適用する
    expect(classify('friend@gmail.com', rules({ internalAddresses: ['friend@gmail.com'] }))).toBe(
      'internal',
    );
    expect(classify('rival@gmail.com', rules({ cautionAddresses: ['rival@gmail.com'] }))).toBe(
      'caution',
    );
  });

  it('送信元がフリーメールの場合、同じドメインの他人は社外、自分自身だけ社内', () => {
    expect(classify('other@gmail.com', rules(), 'me@gmail.com')).toBe('external');
    expect(classify('Me@Gmail.com', rules(), 'me@gmail.com')).toBe('internal');
  });
});

describe('isInternalAddress', () => {
  it('要注意の登録があっても、社内かどうかは別に判定する', () => {
    const r = rules({ cautionAddresses: ['retired@mycompany.example'] });
    expect(isInternalAddress('retired@mycompany.example', { rules: r, fromAddress: FROM })).toBe(
      true,
    );
  });
});

describe('shouldSkipConfirmation', () => {
  const skip = rules({ skipAddresses: ['Me@mycompany.example', 'memo@mycompany.example'] });

  it('機能が有効で、すべての宛先が確認省略アドレスなら省略する', () => {
    expect(shouldSkipConfirmation([recipient('me@mycompany.example')], skip, true)).toBe(true);
    expect(
      shouldSkipConfirmation(
        [recipient('me@mycompany.example'), recipient('MEMO@mycompany.example', 'cc')],
        skip,
        true,
      ),
    ).toBe(true);
  });

  it('機能が無効（初期設定）なら省略しない', () => {
    expect(shouldSkipConfirmation([recipient('me@mycompany.example')], skip, false)).toBe(false);
  });

  it('確認省略アドレス以外の宛先が1件でもあれば省略しない', () => {
    expect(
      shouldSkipConfirmation(
        [recipient('me@mycompany.example'), recipient('taro@client.example', 'bcc')],
        skip,
        true,
      ),
    ).toBe(false);
  });

  it('宛先が無ければ省略しない', () => {
    expect(shouldSkipConfirmation([], skip, true)).toBe(false);
  });

  it('要注意の宛先が含まれる場合は省略しない', () => {
    const both = rules({
      skipAddresses: ['me@mycompany.example'],
      cautionAddresses: ['me@mycompany.example'],
    });
    expect(shouldSkipConfirmation([recipient('me@mycompany.example')], both, true)).toBe(false);
  });
});

describe('companyKeyOf', () => {
  it('会社のドメインはドメイン、フリーメールはアドレスをキーにする', () => {
    expect(companyKeyOf('Taro@Client.Example')).toBe('client.example');
    expect(companyKeyOf('Someone@Gmail.com')).toBe('someone@gmail.com');
  });
});
