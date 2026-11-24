import type {
  ClassificationRules,
  ComposeSnapshot,
  DetectorContext,
  Recipient,
  RecipientField,
} from '../../src/core/types';

/** テスト用のルール（指定しなかった項目は空） */
export function rules(overrides: Partial<ClassificationRules> = {}): ClassificationRules {
  return {
    internalDomains: [],
    internalAddresses: [],
    cautionDomains: [],
    cautionAddresses: [],
    skipAddresses: [],
    ...overrides,
  };
}

/** テスト用の宛先 */
export function recipient(address: string, field: RecipientField = 'to'): Recipient {
  return { address, field };
}

/** テスト用のスナップショット（指定しなかった項目は、問題の無い内容にしてある） */
export function snapshot(overrides: Partial<ComposeSnapshot> = {}): ComposeSnapshot {
  return {
    recipients: [recipient('taro@client.example')],
    subject: 'お打ち合わせの件',
    bodyText: 'お世話になっております。\nよろしくお願いいたします。',
    attachments: [],
    driveLinkCount: 0,
    // 2026年11月20日は金曜日
    capturedAt: '2026-11-20T10:00:00+09:00',
    fromAddress: 'me@mycompany.example',
    ...overrides,
  };
}

/** テスト用の検知器の設定 */
export function context(overrides: Partial<DetectorContext> = {}): DetectorContext {
  return {
    rules: rules(),
    attachmentKeywords: ['添付', '添付ファイル', '見積書', 'PDF', 'attached'],
    treatDriveLinksAsAttachment: true,
    typoDictionary: [],
    signatureKeywords: [],
    ...overrides,
  };
}
