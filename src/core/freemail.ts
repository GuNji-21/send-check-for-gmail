/**
 * フリーメールのドメイン。
 *
 * フリーメールは同じドメインに無関係の利用者が多数いるため、ドメイン単位ではなくアドレス単位で判定する
 * （docs/requirements.md「3-3. 宛先区分の指定」）。
 * - 社内・要注意のドメイン指定は、フリーメールのドメインには適用しない
 * - 送信元がフリーメールの場合、ドメインは自動で社内扱いにせず、送信元アドレス自身だけを社内扱いにする
 *
 * フェーズ1では組み込みの固定リストとし、利用者による編集はできない。
 *
 * TODO(フェーズ1): 一覧を拡充し、isFreemailDomain を実装する。
 */

/** フリーメールのドメイン（小文字） */
export const FREEMAIL_DOMAINS: readonly string[] = [
  'gmail.com',
  'yahoo.co.jp',
  'icloud.com',
  'outlook.jp',
];

/** フリーメールのドメインかどうかを判定する（大文字・小文字は区別しない） */
export function isFreemailDomain(_domain: string): boolean {
  throw new Error('Not implemented: isFreemailDomain');
}
