/**
 * src/core/ で使う型定義。
 *
 * src/core/ は DOM にも chrome API にも依存しない純粋な処理の置き場所。
 * Gmail の画面から読み取った送信内容は、src/gmail/ でこの型（ComposeSnapshot）に変換してから渡す。
 */

/** 宛先の欄 */
export type RecipientField = 'to' | 'cc' | 'bcc';

/** 宛先1件 */
export interface Recipient {
  /** メールアドレス（小文字化などの正規化前の値） */
  readonly address: string;
  /** 表示名（Gmail の宛先チップに表示される名前）。無い場合は省略 */
  readonly displayName?: string;
  readonly field: RecipientField;
}

/** 添付ファイル1件 */
export interface Attachment {
  readonly fileName: string;
  /** バイト数。画面から取得できない場合は省略 */
  readonly sizeBytes?: number;
}

/**
 * 送信内容のスナップショット。検知器の入力。
 * 送信操作を捕捉した時点の内容を固定して保持する（検知中に画面が変わっても影響を受けない）。
 */
export interface ComposeSnapshot {
  readonly recipients: readonly Recipient[];
  readonly subject: string;
  /** 本文のプレーンテキスト（引用部分を含む） */
  readonly bodyText: string;
  readonly attachments: readonly Attachment[];
  /** 送信操作を捕捉した日時（ISO 8601）。日付と曜日の照合などの基準にする */
  readonly capturedAt: string;
  /** 送信者のアドレス（取得できない場合は省略） */
  readonly fromAddress?: string;
}

/** 宛先の分類 */
export type RecipientCategory =
  /** 社内（社内ドメイン・社内アドレスとして登録済み） */
  | 'internal'
  /** 要注意（特に慎重に確認したい相手として登録済み） */
  | 'caution'
  /** 確認省略（確認ダイアログを出さなくてよい相手として登録済み） */
  | 'skip'
  /** 上記以外の社外 */
  | 'external';

/** 宛先分類のルール（設定画面で利用者が登録する） */
export interface ClassificationRules {
  /** 社内ドメイン（例：example.com） */
  readonly internalDomains: readonly string[];
  /** 社内として扱う個別アドレス */
  readonly internalAddresses: readonly string[];
  /** 要注意のドメイン・アドレス */
  readonly cautionDomains: readonly string[];
  readonly cautionAddresses: readonly string[];
  /** 確認省略のドメイン・アドレス */
  readonly skipDomains: readonly string[];
  readonly skipAddresses: readonly string[];
}

/** 検知結果の重要度 */
export type Severity = 'error' | 'warning' | 'info';

/** 検知結果1件。検知器の出力（配列）の要素 */
export interface Detection {
  /** 検知器のID（例：'attachment-missing'） */
  readonly detectorId: string;
  readonly severity: Severity;
  /** 表示文言の _locales のキー。文言そのものは持たない */
  readonly messageKey: string;
  /** 文言の差し込み値（chrome.i18n.getMessage の substitutions） */
  readonly substitutions?: readonly string[];
}

/** 検知器が参照する設定など、スナップショット以外の入力 */
export interface DetectorContext {
  readonly rules: ClassificationRules;
}

/**
 * 検知器。1項目1ファイルで src/core/detectors/ に作る。
 * 入力は送信内容のスナップショット、出力は検知結果の配列（問題が無ければ空配列）。
 */
export interface Detector {
  readonly id: string;
  detect(snapshot: ComposeSnapshot, context: DetectorContext): readonly Detection[];
}
