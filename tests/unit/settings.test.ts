import { afterEach, describe, expect, it, vi } from 'vitest';
import enMessages from '../../public/_locales/en/messages.json';
import jaMessages from '../../public/_locales/ja/messages.json';
import { buildConfirmationModel, previewOf } from '../../src/core/confirmation';
import { parseFormValues, toFormValues } from '../../src/options/form';
import { MESSAGE_KEYS, t } from '../../src/shared/i18n';
import {
  DEFAULT_SETTINGS,
  type Settings,
  clearAllData,
  loadSettings,
  normalizeSettings,
  saveSettings,
  watchSettings,
} from '../../src/storage/settings';
import { recipient, rules, snapshot } from './helpers';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('normalizeSettings', () => {
  it('保存データが無ければ初期値を返す', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('broken')).toEqual(DEFAULT_SETTINGS);
  });

  it('初期設定では、確認省略は無効、警告はすべてオン、ドライブのリンクは添付とみなす', () => {
    expect(DEFAULT_SETTINGS.skipConfirmationEnabled).toBe(false);
    expect(new Set(Object.values(DEFAULT_SETTINGS.warningLevels))).toEqual(new Set(['warn']));
    expect(DEFAULT_SETTINGS.treatDriveLinksAsAttachment).toBe(true);
    expect(DEFAULT_SETTINGS.attachmentKeywords).toContain('添付');
    expect(DEFAULT_SETTINGS.attachmentKeywords).toContain('attached');
  });

  it('ドメイン・アドレスを正規化し、形式が正しくないものと重複を除く', () => {
    const settings = normalizeSettings({
      rules: {
        internalDomains: ['@Example.COM', 'example.com', 'not a domain', 123],
        internalAddresses: ['A@Example.com', 'example.com'],
        cautionDomains: 'broken',
        skipAddresses: ['me@example.com'],
      },
    });
    expect(settings.rules).toEqual({
      internalDomains: ['example.com'],
      internalAddresses: ['a@example.com'],
      cautionDomains: [],
      cautionAddresses: [],
      skipAddresses: ['me@example.com'],
    });
  });

  it('警告のオン・オフは、正しい値だけを採用し、それ以外は初期値（オン）にする', () => {
    const settings = normalizeSettings({
      warningLevels: { placeholder: 'off', 'subject-empty': 'off', 'attachment-missing': 'x' },
    });
    expect(settings.warningLevels).toEqual({
      ...DEFAULT_SETTINGS.warningLevels,
      placeholder: 'off',
      'subject-empty': 'off',
    });
  });

  it('以前の版で保存された「ブロック」は、オンとして読む', () => {
    const settings = normalizeSettings({ warningLevels: { placeholder: 'block' } });
    expect(settings.warningLevels.placeholder).toBe('warn');
  });

  it('添付キーワードは、空の配列（すべて削除した状態）も有効な設定として扱う', () => {
    expect(normalizeSettings({ attachmentKeywords: [] }).attachmentKeywords).toEqual([]);
    expect(
      normalizeSettings({ attachmentKeywords: [' 添付 ', '添付', ''] }).attachmentKeywords,
    ).toEqual(['添付']);
    expect(normalizeSettings({}).attachmentKeywords).toEqual(DEFAULT_SETTINGS.attachmentKeywords);
  });

  it('確認省略は true が保存されているときだけ有効にする', () => {
    expect(normalizeSettings({ skipConfirmationEnabled: true }).skipConfirmationEnabled).toBe(true);
    expect(normalizeSettings({ skipConfirmationEnabled: 'yes' }).skipConfirmationEnabled).toBe(
      false,
    );
  });
});

describe('設定の読み書き（chrome.storage.local）', () => {
  function stubStorage(initial: Record<string, unknown> = {}) {
    const data = new Map<string, unknown>(Object.entries(initial));
    const listeners: ((
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => void)[] = [];
    const local = {
      get: vi.fn((key: string) => Promise.resolve(data.has(key) ? { [key]: data.get(key) } : {})),
      set: vi.fn((items: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(items)) data.set(key, value);
        return Promise.resolve();
      }),
      clear: vi.fn(() => {
        data.clear();
        return Promise.resolve();
      }),
    };
    const onChanged = {
      addListener: vi.fn((listener: (typeof listeners)[number]) => listeners.push(listener)),
      removeListener: vi.fn((listener: (typeof listeners)[number]) => {
        listeners.splice(listeners.indexOf(listener), 1);
      }),
    };
    vi.stubGlobal('chrome', { storage: { local, onChanged } });
    return { data, local, listeners };
  }

  it('未保存の場合は初期値を読み込む', async () => {
    stubStorage();
    await expect(loadSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it('保存した設定を読み込める', async () => {
    const { local } = stubStorage();
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      rules: rules({ internalDomains: ['example.com'] }),
      skipConfirmationEnabled: true,
    };
    await saveSettings(settings);
    expect(local.set).toHaveBeenCalledTimes(1);
    await expect(loadSettings()).resolves.toEqual(settings);
  });

  it('保存先は storage.local のみ（sync は使わない）', async () => {
    stubStorage();
    await saveSettings(DEFAULT_SETTINGS);
    expect('sync' in chrome.storage).toBe(false);
  });

  it('保存データをすべて削除すると、初期値に戻る', async () => {
    const { data } = stubStorage();
    await saveSettings({ ...DEFAULT_SETTINGS, skipConfirmationEnabled: true });
    await clearAllData();
    expect(data.size).toBe(0);
    await expect(loadSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it('読み込みに失敗した場合は、そのまま失敗を伝える（初期値でごまかさない）', async () => {
    const { local } = stubStorage();
    local.get.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(loadSettings()).rejects.toThrow('storage unavailable');
  });

  it('設定の変更を受け取り、解除後は受け取らない', () => {
    const { listeners } = stubStorage();
    const received: Settings[] = [];
    const stop = watchSettings((settings) => received.push(settings));

    listeners[0]?.({ settings: { newValue: { skipConfirmationEnabled: true } } }, 'local');
    listeners[0]?.({ other: { newValue: 1 } }, 'local');
    listeners[0]?.({ settings: { newValue: { skipConfirmationEnabled: true } } }, 'sync');
    expect(received).toHaveLength(1);
    expect(received[0]?.skipConfirmationEnabled).toBe(true);

    // 削除された場合（newValue なし）は初期値になる
    listeners[0]?.({ settings: {} }, 'local');
    expect(received[1]).toEqual(DEFAULT_SETTINGS);

    stop();
    expect(listeners).toHaveLength(0);
  });
});

describe('画面文言（_locales）', () => {
  const ja: Record<string, { message: string }> = jaMessages;
  const en: Record<string, { message: string }> = enMessages;

  it('ja と en のキーが、MESSAGE_KEYS と一致している', () => {
    const keys = [...MESSAGE_KEYS].sort();
    expect(Object.keys(ja).sort()).toEqual(keys);
    expect(Object.keys(en).sort()).toEqual(keys);
  });

  it('すべての文言が空でない', () => {
    for (const key of MESSAGE_KEYS) {
      expect(ja[key]?.message, `ja: ${key}`).toBeTruthy();
      expect(en[key]?.message, `en: ${key}`).toBeTruthy();
    }
  });

  it('差し込み（$1・$2）の数が ja と en で同じ', () => {
    const placeholders = (message: string) => [...new Set(message.match(/\$\d/g) ?? [])].sort();
    for (const key of MESSAGE_KEYS) {
      expect(placeholders(en[key]?.message ?? ''), key).toEqual(
        placeholders(ja[key]?.message ?? ''),
      );
    }
  });

  it('チェックできなかったときの文言が要件どおり', () => {
    expect(ja.errorCheckFailed?.message).toContain('チェックできませんでした');
  });

  it('t は chrome.i18n から文言を取得し、差し込み値を渡す', () => {
    const getMessage = vi.fn(() => '件名');
    vi.stubGlobal('chrome', { i18n: { getMessage } });
    expect(t('dialogSubject')).toBe('件名');
    t('dialogRemaining', ['3']);
    expect(getMessage).toHaveBeenLastCalledWith('dialogRemaining', ['3']);
  });

  it('文言が見つからない・chrome.i18n が使えない場合は、キーの名前を返す', () => {
    vi.stubGlobal('chrome', { i18n: { getMessage: () => '' } });
    expect(t('dialogSubject')).toBe('dialogSubject');
    vi.stubGlobal('chrome', {
      i18n: {
        getMessage: () => {
          throw new Error('Extension context invalidated.');
        },
      },
    });
    expect(t('errorCheckFailed')).toBe('errorCheckFailed');
  });
});

describe('設定画面の入力内容の変換', () => {
  it('設定を入力内容にして、同じ設定に戻せる', () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      rules: rules({
        internalDomains: ['example.com', 'example.org'],
        cautionAddresses: ['vip@client.example'],
        skipAddresses: ['me@example.com'],
      }),
      skipConfirmationEnabled: true,
      warningLevels: { ...DEFAULT_SETTINGS.warningLevels, placeholder: 'off' },
    };
    expect(parseFormValues(toFormValues(settings))).toEqual({ ok: true, settings });
  });

  it('1行1件で読み、正規化して重複を除く', () => {
    const result = parseFormValues({
      ...toFormValues(DEFAULT_SETTINGS),
      internalDomains: '@Example.com\n\nexample.com\n example.org ',
      skipAddresses: 'Me@Example.com',
      attachmentKeywords: '添付\n\n別添\n添付',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settings.rules.internalDomains).toEqual(['example.com', 'example.org']);
    expect(result.settings.rules.skipAddresses).toEqual(['me@example.com']);
    expect(result.settings.attachmentKeywords).toEqual(['添付', '別添']);
  });

  it('形式が正しくない行があれば、保存せずにその行を返す', () => {
    const result = parseFormValues({
      ...toFormValues(DEFAULT_SETTINGS),
      internalDomains: 'example.com\ntaro@example.com',
      // 確認省略はアドレス単位のみ。ドメインは受け付けない
      skipAddresses: 'example.com',
    });
    expect(result).toEqual({ ok: false, invalid: ['taro@example.com', 'example.com'] });
  });
});

describe('buildConfirmationModel', () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    rules: rules({ cautionAddresses: ['vip@client.example'] }),
  };

  it('宛先を分類し、社内以外を会社（ドメイン）ごとにまとめる', () => {
    const model = buildConfirmationModel(
      snapshot({
        recipients: [
          recipient('vip@client.example'),
          recipient('taro@client.example'),
          recipient('colleague@mycompany.example', 'cc'),
          recipient('someone@gmail.com', 'bcc'),
        ],
      }),
      settings,
    );
    expect(model.recipients.map((r) => [r.address, r.field, r.category, r.companyKey])).toEqual([
      ['vip@client.example', 'to', 'caution', 'client.example'],
      ['taro@client.example', 'to', 'external', 'client.example'],
      ['colleague@mycompany.example', 'cc', 'internal', 'mycompany.example'],
      ['someone@gmail.com', 'bcc', 'external', 'someone@gmail.com'],
    ]);
    expect(model.externalCompanies).toEqual([
      { companyKey: 'client.example', count: 2 },
      { companyKey: 'someone@gmail.com', count: 1 },
    ]);
    expect(model.fromAddress).toBe('me@mycompany.example');
  });

  it('警告がオンの項目の検知結果を含め、オフの項目は含めない', () => {
    expect(buildConfirmationModel(snapshot({ subject: '' }), settings).detections).toEqual([
      { detectorId: 'subject-empty', messageKey: 'detectSubjectEmpty' },
    ]);
    const off = {
      ...settings,
      warningLevels: { ...settings.warningLevels, 'subject-empty': 'off' as const },
    };
    expect(buildConfirmationModel(snapshot({ subject: '' }), off).detections).toEqual([]);
  });

  it('問題の無いメールでは検知結果が空になる', () => {
    expect(buildConfirmationModel(snapshot(), settings).detections).toEqual([]);
  });
});

describe('previewOf', () => {
  it('先頭の空行を除き、冒頭の6行までを返す', () => {
    const body = ['', '  ', '1', '2', '3', '4', '5', '6', '7'].join('\n');
    expect(previewOf(body)).toBe('1\n2\n3\n4\n5\n6');
  });

  it('長い行は切り詰める', () => {
    expect(previewOf('あ'.repeat(100))).toBe(`${'あ'.repeat(80)}…`);
  });

  it('空の本文は空文字になる', () => {
    expect(previewOf(' \n ')).toBe('');
  });
});
