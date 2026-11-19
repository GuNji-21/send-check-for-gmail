/**
 * フリーメールのドメイン。
 *
 * フリーメールは同じドメインに無関係の利用者が多数いるため、ドメイン単位ではなくアドレス単位で判定する
 * （docs/requirements.md「3-3. 宛先区分の指定」）。
 * - 社内・要注意のドメイン指定は、フリーメールのドメインには適用しない
 * - 送信元がフリーメールの場合、ドメインは自動で社内扱いにせず、送信元アドレス自身だけを社内扱いにする
 *
 * 携帯キャリアやプロバイダのメールも、同じ理由（同じドメインに無関係の利用者がいる）でここに含める。
 * フェーズ1では組み込みの固定リストとし、利用者による編集はできない。
 */

import { normalizeDomain } from './text/address';

/** フリーメールのドメイン（小文字） */
export const FREEMAIL_DOMAINS: readonly string[] = [
  // Google
  'gmail.com',
  'googlemail.com',
  // Yahoo
  'yahoo.co.jp',
  'ymail.ne.jp',
  'yahoo.com',
  'ymail.com',
  // Apple
  'icloud.com',
  'me.com',
  'mac.com',
  // Microsoft
  'outlook.jp',
  'outlook.com',
  'hotmail.com',
  'hotmail.co.jp',
  'live.jp',
  'live.com',
  'msn.com',
  // その他のフリーメール
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'zoho.com',
  'mail.com',
  // 携帯キャリア
  'docomo.ne.jp',
  'ezweb.ne.jp',
  'au.com',
  'softbank.ne.jp',
  'i.softbank.jp',
  'ymobile.ne.jp',
  'rakumail.jp',
  // プロバイダ
  'nifty.com',
  'biglobe.ne.jp',
  'ocn.ne.jp',
  'so-net.ne.jp',
  'plala.or.jp',
];

const FREEMAIL_SET: ReadonlySet<string> = new Set(FREEMAIL_DOMAINS);

/** フリーメールのドメインかどうかを判定する（大文字・小文字は区別しない） */
export function isFreemailDomain(domain: string): boolean {
  return FREEMAIL_SET.has(normalizeDomain(domain));
}
