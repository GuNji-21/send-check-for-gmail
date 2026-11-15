/**
 * content script のエントリポイント（ビルド後は dist/content.js）。
 *
 * mail.google.com 上で読み込まれ、送信操作の捕捉を開始する。
 * Gmail の DOM 操作は src/gmail/、確認ダイアログは src/ui/dialog/、判定ロジックは src/core/ に分ける。
 *
 * 注意：content script で IndexedDB を使うと Gmail 側の保存領域に入るため禁止。
 * 連絡先・会社台帳（フェーズ2）は background にメッセージ通信で読み書きを依頼する。
 */

import { startInterceptor } from './interceptor';

startInterceptor();
