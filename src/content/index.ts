/**
 * content script のエントリポイント（ビルド後は dist/content.js）。
 *
 * mail.google.com 上で読み込まれ、送信操作の捕捉を開始する。
 * Gmail の DOM 操作は src/gmail/、確認ダイアログは src/ui/dialog/、判定ロジックは src/core/ に分ける。
 *
 * 注意：content script で IndexedDB を使うと Gmail 側の保存領域に入るため禁止。
 * 連絡先・会社台帳（フェーズ2）は background にメッセージ通信で読み書きを依頼する。
 */

import { preloadMessages } from '../shared/i18n';
import { createTypoChecker } from '../shared/language-model';
import { lookupLedger, recordSendToLedger } from '../shared/ledger-client';
import { type Settings, loadSettings, watchSettings } from '../storage/settings';
import { startInterceptor } from './interceptor';

/** 読み込み済みの設定。送信操作のたびに読み込みを待たないよう、ここに保持する */
let cachedSettings: Settings | undefined;

const typoChecker = createTypoChecker();

/** AI による誤字・脱字チェックが有効なら、モデルを先に読み込んでおく（最初のチェックを速くするため） */
function warmUpIfEnabled(settings: Settings): void {
  if (settings.aiTypoCheckEnabled) void typoChecker.warmUp();
}

/** 設定を返す。まだ読み込めていない（または前回失敗した）場合は読み込む */
async function getSettings(): Promise<Settings> {
  cachedSettings ??= await loadSettings();
  return cachedSettings;
}

// 文言を先に読み込んでおく。拡張機能の更新後、再読み込みされていないタブでも文言を表示できるようにするため
preloadMessages();

// 送信操作の捕捉は、設定の読み込みを待たずにすぐ始める（読み込み前の送信操作も止められるようにする）
startInterceptor({
  view: window,
  getSettings,
  checkTypos: (snapshot, signal) =>
    typoChecker.check({ subject: snapshot.subject, bodyText: snapshot.bodyText }, signal),
  // 連絡先の記録は background 側にあるので、メッセージで読み書きを依頼する
  ledger: {
    lookup: (query) => lookupLedger(query),
    record: (record, retentionDays) => recordSendToLedger(record, retentionDays),
  },
});

// 設定を先に読み込んでおく。失敗した場合は、送信操作のときに読み込み直す
// （そこでも失敗すれば「チェックできませんでした」として送信を止める）
getSettings()
  .then(warmUpIfEnabled)
  .catch((error: unknown) => {
    console.error('[gmail-send-guard] failed to load settings', error);
  });

try {
  watchSettings((settings) => {
    cachedSettings = settings;
    warmUpIfEnabled(settings);
  });
} catch (error) {
  // 変更を受け取れない場合は、次の送信操作で読み込み直す
  cachedSettings = undefined;
  console.error('[gmail-send-guard] failed to watch settings', error);
}
