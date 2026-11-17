/**
 * 設定画面のスクリプト（ビルド後は dist/options.js）。
 *
 * 予定している設定項目（フェーズ1）：
 * - 社内ドメイン・社内アドレス（送信元アドレスのドメインは登録不要で自動的に社内扱い）
 * - 要注意のドメイン・アドレス
 * - 確認省略のアドレス（アドレス単位のみ）と、確認省略の有効・無効（初期設定は無効）
 * - 添付キーワードの編集、Google ドライブのリンクを添付ありとみなすか
 * - 検知項目ごとの警告レベル（ブロック／警告／オフ）
 * - 保存データの削除
 *
 * 画面文言は options.html に直接書かず、data-i18n 属性のキーで _locales から差し込む。
 *
 * TODO(フェーズ1): 実装する。
 */

/** 設定画面を初期化する */
function initOptionsPage(): void {
  // TODO(フェーズ1): data-i18n の文言差し込み、設定の読み込み・保存を実装する
}

document.addEventListener('DOMContentLoaded', initOptionsPage);
