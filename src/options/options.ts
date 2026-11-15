/**
 * 設定画面のスクリプト（ビルド後は dist/options.js）。
 *
 * 予定している設定項目（フェーズ1）：
 * - 社内ドメイン・社内アドレス
 * - 要注意のドメイン・アドレス
 * - 確認省略のドメイン・アドレス
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
