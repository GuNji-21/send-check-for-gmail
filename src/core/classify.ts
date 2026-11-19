/**
 * 宛先の分類（要注意・社内・社外）と、確認省略の判定。
 *
 * 設定画面で登録されたドメイン・アドレスのルールと送信元アドレスに従って、宛先1件ごとに分類する。
 * DOM・chrome API には依存しない純粋な関数。
 *
 * 分類のルール：
 * - 優先順位は 要注意 ＞ 社内 ＞ 社外
 * - 送信元アドレスのドメインは、登録が無くても自動で社内扱いにする
 * - フリーメールのドメイン（freemail.ts）にはドメイン単位の指定を適用しない。
 *   送信元がフリーメールの場合は、送信元アドレス自身だけを社内扱いにする
 * - アドレス・ドメインは大文字・小文字を区別せずに比較する。ドメインは完全一致で比べる
 *   （example.com を登録しても、sub.example.com には一致しない）
 */

import { isFreemailDomain } from './freemail';
import { domainOf, normalizeAddress, normalizeDomain } from './text/address';
import type { ClassificationRules, Recipient, RecipientCategory } from './types';

/** 分類に使う入力 */
export interface ClassificationContext {
  readonly rules: ClassificationRules;
  /** 送信元アドレス（ComposeSnapshot.fromAddress） */
  readonly fromAddress: string;
}

function includesAddress(list: readonly string[], address: string): boolean {
  return list.some((item) => normalizeAddress(item) === address);
}

/** ドメイン単位の指定に一致するか。フリーメールのドメインには適用しない */
function includesDomain(list: readonly string[], domain: string): boolean {
  if (domain === '' || isFreemailDomain(domain)) return false;
  return list.some((item) => normalizeDomain(item) === domain);
}

/** 要注意として登録されているか */
export function isCautionAddress(address: string, rules: ClassificationRules): boolean {
  const normalized = normalizeAddress(address);
  return (
    includesAddress(rules.cautionAddresses, normalized) ||
    includesDomain(rules.cautionDomains, domainOf(normalized))
  );
}

/**
 * 社内かどうか（要注意の登録は考慮しない）。
 * 社外の会社を数えるときなど、「要注意だが社内」の宛先を社内として扱いたい場面で使う。
 */
export function isInternalAddress(address: string, context: ClassificationContext): boolean {
  const normalized = normalizeAddress(address);
  const domain = domainOf(normalized);
  const from = normalizeAddress(context.fromAddress);
  if (normalized === from) return true;
  if (includesAddress(context.rules.internalAddresses, normalized)) return true;
  if (includesDomain(context.rules.internalDomains, domain)) return true;
  // 送信元と同じドメインは自動で社内（フリーメールを除く）
  return domain !== '' && domain === domainOf(from) && !isFreemailDomain(domain);
}

/** 宛先1件を分類する */
export function classifyRecipient(
  recipient: Recipient,
  context: ClassificationContext,
): RecipientCategory {
  if (isCautionAddress(recipient.address, context.rules)) return 'caution';
  if (isInternalAddress(recipient.address, context)) return 'internal';
  return 'external';
}

/**
 * 確認ダイアログを省略してよいかを判定する。
 *
 * 次をすべて満たすときだけ true：
 * - 確認省略の機能が有効（初期設定では無効）
 * - 宛先が1件以上あり、すべての宛先（To / Cc / Bcc）が確認省略アドレスとして登録済み
 * - 要注意として登録された宛先が1件も無い（要注意は確認省略より優先する）
 */
export function shouldSkipConfirmation(
  recipients: readonly Recipient[],
  rules: ClassificationRules,
  skipConfirmationEnabled: boolean,
): boolean {
  if (!skipConfirmationEnabled || recipients.length === 0) return false;
  return recipients.every((recipient) => {
    const address = normalizeAddress(recipient.address);
    return includesAddress(rules.skipAddresses, address) && !isCautionAddress(address, rules);
  });
}

/**
 * 宛先を「会社」に相当する単位にまとめるためのキー。
 * 通常はドメイン、フリーメールはアドレスそのもの（同じドメインでも別の相手として数える）。
 */
export function companyKeyOf(address: string): string {
  const normalized = normalizeAddress(address);
  const domain = domainOf(normalized);
  return domain === '' || isFreemailDomain(domain) ? normalized : domain;
}
