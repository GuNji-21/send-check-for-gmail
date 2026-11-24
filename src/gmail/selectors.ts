/**
 * Gmail の画面要素を特定するためのセレクタ定義。
 *
 * Gmail の画面構造（DOM・セレクタ）への依存は src/gmail/ にのみ書く。
 * このファイルを src/gmail/ 以外から import することは ESLint で禁止している。
 *
 * ルール：
 * - Gmail の表示言語に依存しない方法で要素を特定する（「送信」「Send」などの文言で探さない）
 * - セレクタを追加・変更したら tests/fixtures/gmail/ の HTML で動作を確認するテストを付ける
 * - Gmail の変更で要素が見つからない場合は、送信を通さず「チェックできませんでした」として扱う
 *
 * ここのセレクタは tests/fixtures/gmail/ の採取結果（2026年11月）で確認したもの。
 * class 名（M9・aoO など）は Gmail が付けた短い名前で、Gmail の更新で変わることがある。
 */

export const SELECTORS = {
  /**
   * 作成画面1つ分の入れ物。新規作成・全画面・ポップアウト・インライン返信・転送のすべてにある。
   * （role="dialog" の外枠は新規作成と全画面にしか無いため、起点には使わない）
   */
  compose: '.M9',
  /** 件名の入力欄（返信では画面に出ていないが、要素はある） */
  subject: 'input[name="subjectbox"]',
  /** 送信元アドレスを持つ隠し項目 */
  from: 'input[name="from"]',
  /** 本文の編集欄 */
  body: '[g_editable="true"][contenteditable="true"]',
  /** 本文の中の引用部分（返信・転送時の過去メール） */
  quote: '.gmail_quote',
  /** 宛先チップ（宛先欄の入れ物の中で使う）。アドレスは data-hovercard-id、表示名は data-name */
  recipientChip: '[role="option"][data-hovercard-id]',
  /** 宛先欄の、まだチップになっていない入力中の文字 */
  recipientInput: 'input[role="combobox"]',
  /**
   * Cc の欄を開くリンク（Cc の欄は、開くまで入力欄が無い）。
   * 予備の手がかりは、ツールチップにあるショートカットの表記（表示言語に依存しない）
   */
  ccToggle: '.aB.gQ.pE, span[role="link"][data-tooltip*="Shift+C)"]',
  /** 作成画面の下の操作列の、1枠（送信ボタンから上にたどって使う） */
  toolbarCell: 'td',
  /** 添付ファイル1件分の入れ物 */
  attachment: '.dL',
  /** 添付ファイル名 */
  attachmentName: '.vI',
  /** 送信ボタン */
  sendButton: '.T-I.aoO[role="button"]',
  /** 送信ボタンの予備の手がかり（ツールチップにある送信ショートカットの表記。表示言語に依存しない） */
  sendButtonByShortcutHint: '[role="button"][data-tooltip*="Enter)"]',
  /** 送信ボタン横の、送信オプションのメニューを開くボタン */
  scheduleMenuButton: '.T-I.hG[role="button"][aria-haspopup="true"]',
  /** メニュー（送信オプションのメニューかどうかは、中に予約送信の項目があるかで判断する） */
  menu: '[role="menu"]',
  /** 送信ボタン横のメニューにある「送信日時を設定」（予約送信）の項目 */
  scheduleMenuItem: '[role="menuitem"][selector="scheduledSend"]',
  /** 開いたメール1通分の入れ物（届いたメールの表示画面）。メールの識別子は data-legacy-message-id */
  message: '.adn[data-legacy-message-id]',
  /** メールの送信元。アドレスは email、表示名は name */
  messageSender: '.gD[email]',
  /** メールの宛先（To・Cc）に入っている人。アドレスは email、表示名は name */
  messageRecipient: '.g2[email]',
  /** メールの本文 */
  messageBody: '.a3s',
  /** 本文の中の引用部分（過去メール） */
  messageQuote: '.gmail_quote, blockquote',
  /** 本文の中の署名（Gmail から送られたメールに付く印） */
  messageSignature: '.gmail_signature',
} as const satisfies Record<string, string>;

/** 宛先欄の入れ物（To / Cc / Bcc）。name 属性で欄の種類が分かる */
export function recipientFieldSelector(field: 'to' | 'cc' | 'bcc'): string {
  return `[name="${field}"]`;
}

/** Google ドライブのリンクとみなすホスト名（docs/requirements.md「4-1. 添付漏れ」） */
export const DRIVE_HOSTS: readonly string[] = ['drive.google.com', 'docs.google.com'];
