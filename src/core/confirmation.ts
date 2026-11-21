/**
 * 確認ダイアログに表示する内容の組み立て。
 *
 * 送信内容のスナップショットと設定から、ダイアログが表示する項目（宛先の分類、社外のまとめ、
 * 本文の冒頭、添付、検知結果）を作る。DOM・chrome API には依存しない純粋な関数。
 */

import { classifyRecipient, companyKeyOf } from './classify';
import { runDetectors } from './detectors/index';
import type { LedgerInsight } from './ledger/ledger';
import type {
  Attachment,
  ClassificationRules,
  ComposeSnapshot,
  Detection,
  Recipient,
  RecipientCategory,
  WarningLevels,
} from './types';

/** 本文のプレビューに出す行数と、1行の最大文字数 */
const PREVIEW_LINES = 6;
const PREVIEW_LINE_LENGTH = 80;

/** 確認ダイアログの組み立てに必要な設定（storage の Settings のうち、ここで使う部分） */
export interface ConfirmationSettings {
  readonly rules: ClassificationRules;
  readonly warningLevels: WarningLevels;
  readonly attachmentKeywords: readonly string[];
  readonly treatDriveLinksAsAttachment: boolean;
}

/** 宛先1件の表示内容 */
export interface RecipientView extends Recipient {
  readonly category: RecipientCategory;
  /** 会社に相当する単位（ドメイン。フリーメールはアドレス） */
  readonly companyKey: string;
}

/** 社外の会社（ドメイン）ごとの人数 */
export interface CompanyCount {
  readonly companyKey: string;
  readonly count: number;
}

/** 確認ダイアログの表示内容 */
export interface ConfirmationModel {
  readonly fromAddress: string;
  readonly recipients: readonly RecipientView[];
  /** 社内以外の宛先を会社（ドメイン）ごとにまとめたもの。人数の多い順 */
  readonly externalCompanies: readonly CompanyCount[];
  readonly subject: string;
  /** 本文の冒頭の数行（宛名の確認用） */
  readonly bodyPreview: string;
  readonly attachments: readonly Attachment[];
  readonly detections: readonly Detection[];
}

/** 本文の冒頭の数行を取り出す（先頭の空行は除き、長い行は切り詰める） */
export function previewOf(bodyText: string): string {
  const lines = bodyText.split(/\r?\n/).map((line) => line.trimEnd());
  while (lines.length > 0 && lines[0]?.trim() === '') lines.shift();
  return lines
    .slice(0, PREVIEW_LINES)
    .map((line) =>
      line.length > PREVIEW_LINE_LENGTH ? `${line.slice(0, PREVIEW_LINE_LENGTH)}…` : line,
    )
    .join('\n');
}

/** 確認ダイアログの表示内容を組み立てる（検知器もここで実行する） */
export function buildConfirmationModel(
  snapshot: ComposeSnapshot,
  settings: ConfirmationSettings,
  ledger?: LedgerInsight,
): ConfirmationModel {
  const context = { rules: settings.rules, fromAddress: snapshot.fromAddress };
  const recipients: RecipientView[] = snapshot.recipients.map((recipient) => ({
    ...recipient,
    category: classifyRecipient(recipient, context),
    companyKey: companyKeyOf(recipient.address),
  }));

  const counts = new Map<string, number>();
  for (const recipient of recipients) {
    if (recipient.category === 'internal') continue;
    counts.set(recipient.companyKey, (counts.get(recipient.companyKey) ?? 0) + 1);
  }
  const externalCompanies = [...counts.entries()]
    .map(([companyKey, count]) => ({ companyKey, count }))
    .sort((a, b) => b.count - a.count || a.companyKey.localeCompare(b.companyKey));

  const detections = runDetectors(
    snapshot,
    {
      rules: settings.rules,
      attachmentKeywords: settings.attachmentKeywords,
      treatDriveLinksAsAttachment: settings.treatDriveLinksAsAttachment,
      ...(ledger === undefined ? {} : { ledger }),
    },
    settings.warningLevels,
  );

  return {
    fromAddress: snapshot.fromAddress,
    recipients,
    externalCompanies,
    subject: snapshot.subject,
    bodyPreview: previewOf(snapshot.bodyText),
    attachments: snapshot.attachments,
    detections,
  };
}
