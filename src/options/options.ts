/**
 * 設定画面のスクリプト（ビルド後は dist/options.js）。
 *
 * 設定項目（フェーズ1）：
 * - 社内ドメイン・社内アドレス（送信元アドレスのドメインは登録不要で自動的に社内扱い）
 * - 要注意のドメイン・アドレス
 * - 確認省略のアドレス（アドレス単位のみ）と、確認省略の有効・無効（初期設定は無効）
 * - 添付キーワードの編集、Google ドライブのリンクを添付ありとみなすか
 * - 誤字の辞書、署名に必ず入る言葉
 * - 検知項目ごとの警告のオン・オフ
 * - AI による誤字・脱字チェックの有効・無効、使う AI の選択
 *   （Chrome 内蔵の AI：モデルの状態の表示とダウンロード。外部の AI：API キーの登録と、通信の許可）
 * - 連絡先の記録（フェーズ2）の有効・無効、保存期間、記録の件数の表示と削除
 * - 保存データの削除
 *
 * 画面文言は options.html に直接書かず、data-i18n 属性のキーで _locales から差し込む。
 */

import type { DetectorId, WarningLevel } from '../core/types';
import { MESSAGE_KEYS, type MessageKey, t } from '../shared/i18n';
import {
  REMOTE_ORIGINS,
  REMOTE_PROVIDERS,
  type RemoteProvider,
  isRemoteProvider,
  looksLikeApiKey,
} from '../core/typo/remote-request';
import { type AiAvailability, downloadAiModel, getAiAvailability } from '../shared/language-model';
import { deleteApiKey, hasApiKey, saveApiKey } from '../storage/api-keys';
import { clearLedger, getLedgerStats } from '../shared/ledger-client';
import {
  DEFAULT_SETTINGS,
  DETECTOR_IDS,
  LEDGER_RETENTION_CHOICES,
  type Settings,
  clearAllData,
  loadSettings,
  saveSettings,
} from '../storage/settings';
import { type OptionsFormValues, parseFormValues, toFormValues } from './form';

const DETECTOR_NAMES: Readonly<Record<DetectorId, MessageKey>> = {
  'multiple-external-companies': 'detectorNameMultipleCompanies',
  'subject-empty': 'detectorNameSubjectEmpty',
  'body-empty': 'detectorNameBodyEmpty',
  honorific: 'detectorNameHonorific',
  'custom-typo': 'detectorNameCustomTypo',
  'width-mix': 'detectorNameWidthMix',
  'signature-missing': 'detectorNameSignatureMissing',
  'attachment-missing': 'detectorNameAttachmentMissing',
  placeholder: 'detectorNamePlaceholder',
  'repeated-characters': 'detectorNameRepeatedCharacters',
  'date-weekday-mismatch': 'detectorNameDateWeekday',
  'first-time-domain': 'detectorNameFirstTimeDomain',
  'cc-missing': 'detectorNameCcMissing',
  'salutation-mismatch': 'detectorNameSalutationMismatch',
  'attachment-company': 'detectorNameAttachmentCompany',
  'other-company-in-body': 'detectorNameOtherCompanyInBody',
  'company-notation': 'detectorNameCompanyNotation',
};

const TEXT_FIELDS = [
  'internalDomains',
  'internalAddresses',
  'cautionDomains',
  'cautionAddresses',
  'skipAddresses',
  'attachmentKeywords',
  'typoDictionary',
  'signatureKeywords',
] as const;

const CHECK_FIELDS = [
  'skipConfirmationEnabled',
  'treatDriveLinksAsAttachment',
  'aiTypoCheckEnabled',
  'ledgerEnabled',
  'ledgerReadReceived',
] as const;

// 呼び出し側が要素の種類を指定できるようにするための型引数（戻り値の型にだけ使う）
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Element not found: #${id}`);
  return element as T;
}

function isMessageKey(value: string): value is MessageKey {
  return (MESSAGE_KEYS as readonly string[]).includes(value);
}

/** data-i18n 属性のキーで、文言を差し込む */
function applyMessages(): void {
  document.title = t('optionsTitle');
  for (const element of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = element.dataset.i18n ?? '';
    if (!isMessageKey(key)) throw new Error(`Unknown message key: ${key}`);
    element.textContent = t(key);
  }
}

function levelCheckboxId(id: DetectorId): string {
  return `level-${id}`;
}

/** 検知項目ごとの警告のオン・オフのチェックボックスを作る */
function renderLevelRows(): void {
  const list = byId('warningLevels');
  list.replaceChildren();
  for (const id of DETECTOR_IDS) {
    const label = document.createElement('label');
    label.className = 'check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.id = levelCheckboxId(id);
    const name = document.createElement('span');
    name.textContent = t(DETECTOR_NAMES[id]);
    label.append(box, name);
    list.append(label);
  }
}

function showForm(settings: Settings): void {
  const values = toFormValues(settings);
  for (const field of TEXT_FIELDS) byId<HTMLTextAreaElement>(field).value = values[field];
  for (const field of CHECK_FIELDS) byId<HTMLInputElement>(field).checked = values[field];
  for (const id of DETECTOR_IDS) {
    byId<HTMLInputElement>(levelCheckboxId(id)).checked = values.warningLevels[id] !== 'off';
  }
  byId<HTMLSelectElement>('ledgerRetentionDays').value = String(values.ledgerRetentionDays);
  byId<HTMLSelectElement>('typoCheckProvider').value = values.typoCheckProvider;
  showAiProvider();
}

function readLevel(id: DetectorId): WarningLevel {
  return byId<HTMLInputElement>(levelCheckboxId(id)).checked ? 'warn' : 'off';
}

function readForm(): OptionsFormValues {
  const text = (field: (typeof TEXT_FIELDS)[number]): string =>
    byId<HTMLTextAreaElement>(field).value;
  const checked = (field: (typeof CHECK_FIELDS)[number]): boolean =>
    byId<HTMLInputElement>(field).checked;
  return {
    internalDomains: text('internalDomains'),
    internalAddresses: text('internalAddresses'),
    cautionDomains: text('cautionDomains'),
    cautionAddresses: text('cautionAddresses'),
    skipAddresses: text('skipAddresses'),
    skipConfirmationEnabled: checked('skipConfirmationEnabled'),
    attachmentKeywords: text('attachmentKeywords'),
    treatDriveLinksAsAttachment: checked('treatDriveLinksAsAttachment'),
    typoDictionary: text('typoDictionary'),
    signatureKeywords: text('signatureKeywords'),
    aiTypoCheckEnabled: checked('aiTypoCheckEnabled'),
    typoCheckProvider: byId<HTMLSelectElement>('typoCheckProvider').value,
    ledgerEnabled: checked('ledgerEnabled'),
    ledgerReadReceived: checked('ledgerReadReceived'),
    ledgerRetentionDays: Number(byId<HTMLSelectElement>('ledgerRetentionDays').value),
    warningLevels: Object.fromEntries(DETECTOR_IDS.map((id) => [id, readLevel(id)])) as Record<
      DetectorId,
      WarningLevel
    >,
  };
}

function showStatus(message: string, isError = false): void {
  const status = byId('status');
  status.textContent = message;
  status.classList.toggle('error', isError);
}

async function save(): Promise<void> {
  const result = parseFormValues(readForm());
  if (!result.ok) {
    showStatus(t('optionsInvalidEntries', [result.invalid.join(', ')]), true);
    return;
  }
  try {
    await saveSettings(result.settings);
    // 正規化された内容（小文字化・重複の除去）を画面にも反映する
    showForm(result.settings);
    showStatus(t('optionsSaved'));
  } catch (error) {
    console.error('[gmail-send-guard] failed to save settings', error);
    showStatus(t('optionsSaveFailed'), true);
  }
}

/** 削除ボタンは、2回押して初めて削除する（確認のダイアログの代わり） */
function setUpClearButton(): void {
  const button = byId<HTMLButtonElement>('clear');
  let armed = false;
  const disarm = (): void => {
    armed = false;
    button.textContent = t('optionsClearData');
  };
  button.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      button.textContent = t('optionsClearConfirm');
      return;
    }
    disarm();
    Promise.all([clearAllData(), clearLedger()])
      .then(() => {
        showLedgerStats();
        showForm(DEFAULT_SETTINGS);
        showStatus(t('optionsCleared'));
      })
      .catch((error: unknown) => {
        console.error('[gmail-send-guard] failed to clear data', error);
        showStatus(t('optionsSaveFailed'), true);
      });
  });
  button.addEventListener('blur', disarm);
}

const AI_STATUS_MESSAGES: Readonly<Record<Exclude<AiAvailability, 'downloading'>, MessageKey>> = {
  unavailable: 'optionsAiStatusUnavailable',
  downloadable: 'optionsAiStatusDownloadable',
  available: 'optionsAiStatusAvailable',
};

/** AI のモデルの状態を表示し、必要ならダウンロードのボタンを出す */
function showAiStatus(state: AiAvailability, percent = 0): void {
  const status = byId('aiStatus');
  status.textContent =
    state === 'downloading'
      ? t('optionsAiStatusDownloading', [String(percent)])
      : t(AI_STATUS_MESSAGES[state]);
  // ダウンロードは、利用者がボタンを押したときにだけ始める（Chrome の決まり。数 GB の通信が発生するため）
  byId<HTMLButtonElement>('aiDownload').hidden = state !== 'downloadable';
  builtinAiState = state;
  updateAiCheckbox();
}

/** Chrome 内蔵の AI の状態（まだ調べ終わっていなければ undefined） */
let builtinAiState: AiAvailability | undefined;

/** 選択欄で選ばれている、外部の AI の提供元。内蔵の AI が選ばれていれば undefined */
function selectedRemoteProvider(): RemoteProvider | undefined {
  const value = byId<HTMLSelectElement>('typoCheckProvider').value;
  return isRemoteProvider(value) ? value : undefined;
}

/** 内蔵の AI が使えない端末では、内蔵の AI を選んでいる間は、有効にできないようにする（有効にしても意味がないため） */
function updateAiCheckbox(): void {
  byId<HTMLInputElement>('aiTypoCheckEnabled').disabled =
    selectedRemoteProvider() === undefined && builtinAiState === 'unavailable';
}

const REMOTE_HELP: Readonly<Record<RemoteProvider, MessageKey>> = {
  openai: 'optionsAiRemoteHelpOpenai',
  anthropic: 'optionsAiRemoteHelpAnthropic',
};

const PROVIDER_LABELS: Readonly<Record<RemoteProvider, MessageKey>> = {
  openai: 'optionsAiProviderOpenai',
  anthropic: 'optionsAiProviderAnthropic',
};

/** API キーの状態（登録済みか、通信が許可されているか）を表示する。キーそのものは表示しない */
function showAiKeyState(): void {
  const provider = selectedRemoteProvider();
  if (provider === undefined) return;
  const state = byId('aiKeyState');
  Promise.all([
    hasApiKey(provider),
    chrome.permissions.contains({ origins: [REMOTE_ORIGINS[provider]] }),
  ])
    .then(([registered, allowed]) => {
      // 調べている間に、別の AI が選ばれていたら表示しない
      if (selectedRemoteProvider() !== provider) return;
      state.textContent = !registered
        ? t('optionsAiKeyStateNone')
        : allowed
          ? t('optionsAiKeyStateReady')
          : t('optionsAiKeyStateNoPermission');
      byId<HTMLButtonElement>('aiKeyDelete').hidden = !registered;
    })
    .catch((error: unknown) => {
      console.error('[gmail-send-guard] failed to read the API key state', error);
      state.textContent = t('optionsAiKeyFailed');
    });
}

/** 選ばれている AI に合わせて、表示する欄を切り替える */
function showAiProvider(): void {
  const provider = selectedRemoteProvider();
  byId('aiBuiltin').hidden = provider !== undefined;
  byId('aiRemote').hidden = provider === undefined;
  byId<HTMLInputElement>('aiKey').value = '';
  updateAiCheckbox();
  if (provider === undefined) return;
  byId('aiRemoteHelp').textContent = t(REMOTE_HELP[provider]);
  showAiKeyState();
}

/** 外部の AI の欄（AI の選択、API キーの保存・削除）を準備する */
function setUpRemoteAi(): void {
  const select = byId<HTMLSelectElement>('typoCheckProvider');
  const builtin = document.createElement('option');
  builtin.value = 'builtin';
  builtin.textContent = t('optionsAiProviderBuiltin');
  select.append(builtin);
  for (const provider of REMOTE_PROVIDERS) {
    const option = document.createElement('option');
    option.value = provider;
    option.textContent = t(PROVIDER_LABELS[provider]);
    select.append(option);
  }
  select.addEventListener('change', showAiProvider);
  // 設定の案内ページ（GitHub Pages）へのリンク。開くのは、利用者がリンクを押したときだけ
  byId<HTMLAnchorElement>('aiGuide').href = t('optionsAiGuideUrl');

  const input = byId<HTMLInputElement>('aiKey');
  byId<HTMLButtonElement>('aiKeySave').addEventListener('click', () => {
    const provider = selectedRemoteProvider();
    if (provider === undefined) return;
    const apiKey = input.value.trim();
    // 入力が空でも、登録済みのキーがあれば、通信の許可だけをやり直せるようにする
    if (apiKey !== '' && !looksLikeApiKey(apiKey)) {
      showStatus(t('optionsAiKeyInvalid'), true);
      return;
    }
    // 通信の許可は、利用者の操作（クリック）の直後にしか求められないので、最初に求める
    chrome.permissions
      .request({ origins: [REMOTE_ORIGINS[provider]] })
      .then(async (granted) => {
        if (!granted) {
          showStatus(t('optionsAiKeyDenied'), true);
          return;
        }
        if (apiKey === '') {
          if (!(await hasApiKey(provider))) showStatus(t('optionsAiKeyInvalid'), true);
          return;
        }
        await saveApiKey(provider, apiKey);
        input.value = '';
        showStatus(t('optionsAiKeySaved'));
      })
      .catch((error: unknown) => {
        // 例外の種類だけを記録する（API キーを記録に残さない）
        console.error(
          '[gmail-send-guard] failed to save the API key',
          error instanceof Error ? error.name : 'unknown error',
        );
        showStatus(t('optionsAiKeyFailed'), true);
      })
      .finally(showAiKeyState);
  });

  byId<HTMLButtonElement>('aiKeyDelete').addEventListener('click', () => {
    const provider = selectedRemoteProvider();
    if (provider === undefined) return;
    // キーを消したら、その提供元への通信の許可も取り下げる
    Promise.all([
      deleteApiKey(provider),
      chrome.permissions.remove({ origins: [REMOTE_ORIGINS[provider]] }),
    ])
      .then(() => {
        input.value = '';
        showStatus(t('optionsAiKeyDeleted'));
      })
      .catch((error: unknown) => {
        console.error(
          '[gmail-send-guard] failed to delete the API key',
          error instanceof Error ? error.name : 'unknown error',
        );
        showStatus(t('optionsAiKeyFailed'), true);
      })
      .finally(showAiKeyState);
  });
}

function setUpAiSection(): void {
  const button = byId<HTMLButtonElement>('aiDownload');
  button.addEventListener('click', () => {
    button.disabled = true;
    showAiStatus('downloading', 0);
    downloadAiModel((ratio) => {
      showAiStatus('downloading', Math.round(ratio * 100));
    })
      .then(() => getAiAvailability())
      .then((state) => {
        showAiStatus(state);
      })
      .catch((error: unknown) => {
        console.error('[gmail-send-guard] failed to download the AI model', error);
        showAiStatus('downloadable');
        showStatus(t('optionsAiDownloadFailed'), true);
      })
      .finally(() => {
        button.disabled = false;
      });
  });
  getAiAvailability()
    .then((state) => {
      showAiStatus(state);
    })
    .catch(() => {
      showAiStatus('unavailable');
    });
}

const RETENTION_LABELS: readonly MessageKey[] = [
  'optionsLedgerRetentionHalf',
  'optionsLedgerRetention1',
  'optionsLedgerRetention2',
  'optionsLedgerRetention5',
];

/** 連絡先の記録の件数を表示する */
function showLedgerStats(): void {
  const stats = byId('ledgerStats');
  getLedgerStats()
    .then((result) => {
      stats.textContent = t('optionsLedgerStats', [String(result.contactCount)]);
    })
    .catch((error: unknown) => {
      console.error('[gmail-send-guard] failed to read the ledger', error);
      stats.textContent = t('optionsLedgerStatsFailed');
    });
}

function setUpLedgerSection(): void {
  const select = byId<HTMLSelectElement>('ledgerRetentionDays');
  LEDGER_RETENTION_CHOICES.forEach((days, index) => {
    const option = document.createElement('option');
    option.value = String(days);
    const label = RETENTION_LABELS[index];
    option.textContent = label === undefined ? String(days) : t(label);
    select.append(option);
  });

  // 記録の削除も、2回押して初めて実行する
  const button = byId<HTMLButtonElement>('ledgerClear');
  let armed = false;
  const disarm = (): void => {
    armed = false;
    button.textContent = t('optionsLedgerClear');
  };
  button.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      button.textContent = t('optionsClearConfirm');
      return;
    }
    disarm();
    clearLedger()
      .then(() => {
        showLedgerStats();
        showStatus(t('optionsLedgerCleared'));
      })
      .catch((error: unknown) => {
        console.error('[gmail-send-guard] failed to clear the ledger', error);
        showStatus(t('optionsSaveFailed'), true);
      });
  });
  button.addEventListener('blur', disarm);
  // 一覧・編集・CSV は、別の画面（台帳の画面）にある
  byId<HTMLButtonElement>('ledgerManage').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('manage.html') }).catch((error: unknown) => {
      console.error('[gmail-send-guard] failed to open the ledger page', error);
    });
  });
  showLedgerStats();
}

/** 設定画面を初期化する */
async function initOptionsPage(): Promise<void> {
  applyMessages();
  renderLevelRows();
  setUpClearButton();
  setUpAiSection();
  setUpRemoteAi();
  setUpLedgerSection();
  const saveButton = byId<HTMLButtonElement>('save');
  saveButton.addEventListener('click', () => {
    void save();
  });
  try {
    showForm(await loadSettings());
  } catch (error) {
    // 読み込めないまま保存すると、既存の設定を初期値で上書きしてしまうため、保存できないようにする
    console.error('[gmail-send-guard] failed to load settings', error);
    saveButton.disabled = true;
    showStatus(t('optionsLoadFailed'), true);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initOptionsPage().catch((error: unknown) => {
    console.error('[gmail-send-guard] failed to initialize the options page', error);
    showStatus(t('optionsLoadFailed'), true);
  });
});
