/**
 * 画面文言の取得（chrome.i18n）。
 *
 * 画面文言はコードに直接書かず、public/_locales/ja/messages.json と en/messages.json の両方に追加し、
 * ここの関数を通して取得する。キーを追加したら MessageKey にも追加する。
 *
 * TODO(フェーズ1): 実装する（キーが見つからない場合の扱いも決める）。
 */

/** _locales に定義済みのメッセージキー */
export type MessageKey = 'extName' | 'extDescription' | 'optionsTitle' | 'errorCheckFailed';

/** メッセージキーから表示文言を取得する */
export function t(_key: MessageKey, _substitutions?: readonly string[]): string {
  throw new Error('Not implemented: t');
}
