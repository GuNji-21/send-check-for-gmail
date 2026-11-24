/**
 * src/core/ で使う型定義。
 *
 * src/core/ は DOM にも chrome API にも依存しない純粋な処理の置き場所。
 * Gmail の画面から読み取った送信内容は、src/gmail/ でこの型（ComposeSnapshot）に変換してから渡す。
 */

import type { LedgerInsight } from './ledger/ledger';

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
  /**
   * 本文のプレーンテキスト。返信・転送時の引用部分（過去メール）は除く。
   * 引用部分の判別は Gmail の DOM に依存するため、src/gmail/ で取り除いてから渡す。
   * 検知器はこの値だけを判定対象にする（docs/requirements.md「4. 機能要件：自動検知」）。
   */
  readonly bodyText: string;
  readonly attachments: readonly Attachment[];
  /**
   * 本文（引用部分を除く）に含まれる Google ドライブのリンクの件数。
   * 対象は drive.google.com と docs.google.com のみ（script.google.com などは含めない）。
   * 作成画面では、貼り付けただけの URL は <a> にならず文字列のままなので、リンク要素だけでなく本文の文字列からも数える。
   */
  readonly driveLinkCount: number;
  /** 送信操作を捕捉した日時（ISO 8601）。日付と曜日の照合などの基準にする */
  readonly capturedAt: string;
  /**
   * 送信元アドレス（この作成画面の From）。
   * 送信元のドメインを自動で社内扱いにするために必須。複数アカウント・別名送信に対応するため、
   * アカウント単位ではなく作成画面ごとに読み取る。
   * 取得できない場合はスナップショットを作らず「チェックできませんでした」として送信を止める。
   */
  readonly fromAddress: string;
}

/**
 * 宛先の分類。優先順位は 要注意 ＞ 社内 ＞ 社外。
 * 確認省略は宛先の分類ではなく、送信全体に対する別の判定（classify.ts の shouldSkipConfirmation）。
 */
export type RecipientCategory =
  /** 要注意（特に慎重に確認したい相手として登録済み）。毎回強調して表示し、確認省略より優先する */
  | 'caution'
  /** 社内（送信元と同じドメイン、または社内ドメイン・社内アドレスとして登録済み） */
  | 'internal'
  /** 上記以外の社外 */
  | 'external';

/**
 * 宛先区分のルール（設定画面で利用者が登録する）。
 *
 * フリーメールのドメイン（src/core/freemail.ts）にはドメイン単位の指定を適用せず、
 * アドレス単位の指定だけで判定する。
 */
export interface ClassificationRules {
  /** 社内ドメイン（例：example.com）。送信元アドレスのドメインは登録しなくても自動で社内扱い */
  readonly internalDomains: readonly string[];
  /** 社内として扱う個別アドレス */
  readonly internalAddresses: readonly string[];
  /** 要注意のドメイン・アドレス */
  readonly cautionDomains: readonly string[];
  readonly cautionAddresses: readonly string[];
  /** 確認省略のアドレス（アドレス単位のみ。ドメイン単位では指定できない） */
  readonly skipAddresses: readonly string[];
}

/**
 * 警告のオン・オフ。検知項目ごとに利用者が設定画面で選ぶ（docs/requirements.md「6. 警告の設定」）。
 * - warn：検知したらダイアログに表示する（そのまま送信できる）
 * - off ：チェックしない（検知器を実行しない）
 */
export type WarningLevel = 'warn' | 'off';

/** 検知項目のID。検知項目を追加したらここにも追加する */
export type DetectorId =
  /** 添付漏れ */
  | 'attachment-missing'
  /** 未記入のプレースホルダー */
  | 'placeholder'
  /** 日付と曜日の不一致 */
  | 'date-weekday-mismatch'
  /** 同じ文字の重複（をを、まます など） */
  | 'repeated-characters'
  /** 件名が空 */
  | 'subject-empty'
  /** 本文が空 */
  | 'body-empty'
  /** 敬称の誤り（各位様、御中と様の併用、宛名に敬称がない） */
  | 'honorific'
  /** 利用者が登録した誤り（よくある誤変換） */
  | 'custom-typo'
  /** 全角・半角の英数字の混在 */
  | 'width-mix'
  /** 署名がない */
  | 'signature-missing'
  /** 社外の会社が2社以上含まれる（複数社混在） */
  | 'multiple-external-companies'
  /** 初めて送るドメイン（連絡先の記録を使う） */
  | 'first-time-domain'
  /** Cc 漏れ（連絡先の記録を使う） */
  | 'cc-missing'
  /** 宛名と宛先の不一致（台帳の氏名・会社名を使う） */
  | 'salutation-mismatch'
  /** 添付ファイル名に、宛先に無い会社名がある（台帳の会社名を使う） */
  | 'attachment-company'
  /** 件名・本文に、宛先に無い会社名がある（台帳の会社名を使う） */
  | 'other-company-in-body'
  /** 社名表記（前株・後株、略した書き方。台帳の会社名を使う） */
  | 'company-notation';

/**
 * 検知結果の表示文言のキー（public/_locales の messages.json に定義する）。
 * src/shared/i18n.ts の MessageKey に含まれる。
 */
export type DetectionMessageKey =
  /** $1 = 見つかったキーワード */
  | 'detectAttachmentMissing'
  /** $1 = 見つかったプレースホルダー */
  | 'detectPlaceholder'
  /** $1 = 本文中の表記、$2 = 実際の曜日 */
  | 'detectDateWeekdayMismatch'
  /** $1 = 本文中の表記 */
  | 'detectDateInvalid'
  /** $1 = 重複が見つかった箇所の一覧 */
  | 'detectRepeatedCharacters'
  | 'detectSubjectEmpty'
  | 'detectBodyEmpty'
  /** $1 = 見つかった表記（各位様 など） */
  | 'detectHonorificKakui'
  /** $1 = 見つかった箇所 */
  | 'detectHonorificOnchuSama'
  /** $1 = 宛名の行 */
  | 'detectHonorificMissing'
  /** $1 = 見つかった誤り（正しい書き方があれば「誤り → 正しい書き方」）の一覧 */
  | 'detectCustomTypo'
  /** $1 = 全角と半角が混ざっている箇所の一覧 */
  | 'detectWidthMix'
  /** $1 = 登録してある署名の言葉の一覧 */
  | 'detectSignatureMissing'
  /** $1 = 社外の会社（ドメイン）の数、$2 = その一覧 */
  | 'detectMultipleExternalCompanies'
  /** $1 = 初めて送るドメインの一覧 */
  | 'detectFirstTimeDomain'
  /** $1 = 今回入っていない人のアドレスの一覧 */
  | 'detectCcMissing'
  /** $1 = 宛名の名前、$2 = To の宛先の名前 */
  | 'detectSalutationName'
  /** $1 = 宛名の会社名の行、$2 = To の宛先の会社名 */
  | 'detectSalutationCompany'
  /** $1 = 添付ファイルの名前、$2 = 見つかった会社名 */
  | 'detectAttachmentCompany'
  /** $1 = 見つかった会社名の一覧 */
  | 'detectOtherCompanyInBody'
  /** $1 = 見つかった書き方、$2 = 登録した会社名 */
  | 'detectCompanyNotation';

/** 検知項目ごとの警告のオン・オフ */
export type WarningLevels = Readonly<Record<DetectorId, WarningLevel>>;

/**
 * 検知結果1件。検知器の出力（配列）の要素。
 * 警告するかどうかは検知器が決めず、利用者の設定に従って runDetectors がオフの検知器を飛ばす。
 */
export interface Detection {
  readonly detectorId: DetectorId;
  /** 表示文言の _locales のキー。文言そのものは持たない */
  readonly messageKey: DetectionMessageKey;
  /** 文言の差し込み値（chrome.i18n.getMessage の substitutions） */
  readonly substitutions?: readonly string[];
}

/** 利用者が登録した誤り1件（誤字の辞書） */
export interface TypoDictionaryEntry {
  /** 誤った書き方（件名・本文からそのまま探す） */
  readonly wrong: string;
  /** 正しい書き方。登録されていなければ空文字 */
  readonly right: string;
}

/** 検知器が参照する設定など、スナップショット以外の入力 */
export interface DetectorContext {
  readonly rules: ClassificationRules;
  /** 添付を示すキーワード（設定画面で編集可） */
  readonly attachmentKeywords: readonly string[];
  /** Google ドライブのリンクを添付ありとみなすか */
  readonly treatDriveLinksAsAttachment: boolean;
  /** 利用者が登録した誤り（誤字の辞書）。登録が無ければ空 */
  readonly typoDictionary: readonly TypoDictionaryEntry[];
  /** 署名に必ず入る言葉（自分の名前など）。登録が無ければ空で、署名の有無は調べない */
  readonly signatureKeywords: readonly string[];
  /**
   * 連絡先の記録（台帳）から読み取った情報。
   * 台帳が無効な場合や、読み込めなかった場合は省略する（台帳を使う検知器は、何も検知しない）。
   */
  readonly ledger?: LedgerInsight;
}

/**
 * 検知器。1項目1ファイルで src/core/detectors/ に作る。
 * 入力は送信内容のスナップショット、出力は検知結果の配列（問題が無ければ空配列）。
 * 確認ダイアログを 0.5 秒以内に表示するため、同期処理にする。
 */
export interface Detector {
  readonly id: DetectorId;
  detect(snapshot: ComposeSnapshot, context: DetectorContext): readonly Detection[];
}
