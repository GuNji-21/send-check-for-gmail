# Chrome Web Store 掲載情報（下書き）

> **【下書き・提出前に確認】** 開発者ダッシュボードに入力する内容をまとめたものです。提出前に、文面と各項目の選択を確認してください。
>
> 掲載の決まりは、Chrome Web Store の公式ドキュメント（images / branding / cws-dashboard-privacy / cws-dashboard-listing / program-policies）を 2026年11月21日に確認した内容に基づいています。

## 1. 名前と商標の表記

| 項目                          | 内容                  |
| ----------------------------- | --------------------- |
| 名前（日本語・英語とも）      | Send Check for Gmail™ |
| 「Gmail」が使えない場合の名前 | Send Check for mail   |

- 公式の決まりでは、Google の商標を拡張機能の名前そのものに使うことはできませんが、Google の製品に対応していることを示す場合は「for」「for use with」「compatible with」を付け、™ を付ける形が認められています（例：for Google Chrome™）。そのため、名前は「Send Check for Gmail™」としています。
- 商標を使う場合は、名前か説明に帰属の表示が必要です。詳細な説明の末尾に入れています。
- アイコンに Google のロゴやその改変を使うことはできません。現在のアイコン（封筒とチェックの印）は Google のロゴではありません。
- Google が作成・公認した製品であるかのような表現はしません。

## 2. 短い説明（manifest の description。132 文字以内）

**日本語**

```text
Gmail™ の送信前に、宛先・本文・添付を確認。添付漏れや誤字を知らせて、誤送信を防ぎます。
```

**English**

```text
Review recipients, body and attachments before sending in Gmail™. Warns about missing attachments and typos to prevent mis-sends.
```

## 3. 詳細な説明

**日本語**

```text
Gmail™ でメールを送信する前に、宛先・件名・本文・添付ファイルを確認するための拡張機能です。送信ボタンを押すと確認の画面が開き、宛先と添付ファイルのすべてにチェックを入れるまで送信できません。

■ できること
・送信ボタン、送信ショートカット（Ctrl + Enter）、予約送信の前に、確認の画面を表示します。
・宛先を To / Cc / Bcc ごとに一覧で表示し、社外の宛先を強調します。
・社内として扱うドメイン、特に注意したい宛先、確認を省略する宛先を登録できます。
・次の項目を自動で調べ、該当すれば警告を表示します（項目ごとにオン・オフを選べます）。
　- 添付漏れ（本文に「添付」「送付」などがあるのに、添付ファイルがない）
　- 件名が空
　- 書き換え忘れの記号（〇〇、XX、{name} など）
　- 同じ文字の重複（「をを」「まます」など）
　- 日付と曜日の不一致（「11月13日（木）」など）
　- 社外の複数の会社が宛先に混ざっている
・Chrome に内蔵された AI を使って、誤字・脱字の候補を表示できます（任意。初期設定はオフ）。候補はその場でメールに反映でき、元に戻すこともできます。
・送信した相手を端末の中に記録して、初めて送るドメインと、いつも Cc に入れている人の入れ忘れを知らせることができます（任意。初期設定はオフ）。

■ プライバシー
・メールの内容や宛先は、お使いの端末の中だけで処理します。外部のサーバーには一切送信しません。
・AI による誤字・脱字チェックも、Chrome に内蔵された AI を使って端末の中で処理します。
・設定は、お使いの端末の中にだけ保存します。
・送信した相手の記録は、有効にした場合だけ、お使いの端末の中に保存します。一定の期間で自動的に削除し、設定画面からいつでもすべて削除できます。
・Gmail API は使いません。ソースコードは GitHub で公開しています。

■ お使いになる前に
・インストールした直後は、開いている Gmail のタブを再読み込みしてください。再読み込みするまで、そのタブでは確認の画面が出ません。
・AI による誤字・脱字チェックを使うには、Chrome の定める端末の条件（空き容量 22GB 以上など）を満たす端末と、モデルのダウンロード（初回のみ）が必要です。
・Gmail の設定で「送信取り消し」の時間を 30 秒にしておくことをおすすめします。
・Gmail の「送信してアーカイブ」ボタンには対応していません。

Gmail は Google LLC の商標です。この商標の使用は Google の使用許諾の対象です。この拡張機能は Google が提供・公認するものではありません。
```

**English**

```text
An extension for reviewing recipients, subject, body and attachments before you send an email in Gmail™. When you press Send, a confirmation screen opens, and you cannot send until every recipient and attachment is ticked.

■ What it does
- Shows a confirmation screen before the Send button, the send shortcut (Ctrl + Enter) and scheduled send.
- Lists recipients by To / Cc / Bcc and highlights external recipients.
- Lets you register domains treated as internal, recipients that need extra care, and recipients that skip confirmation.
- Checks the following automatically and shows a warning when one applies (each can be turned on or off):
  - Missing attachment (the body mentions an attachment, but nothing is attached)
  - Empty subject
  - Leftover placeholders (XX, {name}, etc.)
  - Repeated characters in Japanese text
  - Date and day-of-week mismatch (Japanese notation)
  - Recipients from multiple external companies
- Can show possible typos using the AI built into Chrome (optional, off by default). A suggestion can be applied to your email in place, and undone.
- Can record the people you send email to on your device, and warn you about a first-time domain or a person you usually Cc who is missing (optional, off by default).

■ Privacy
- The content of your email and your recipients are processed only on your device. Nothing is sent to any external server.
- The AI typo check also runs on your device, using the AI built into Chrome.
- Settings are stored only on your device.
- Records of the people you send email to are stored on your device, and only when you turn the feature on. They are deleted automatically after a set period, and you can delete all of them at any time from the options page.
- The Gmail API is not used. The source code is published on GitHub.

■ Before you start
- Right after installing, reload any Gmail tabs that are already open. The confirmation screen does not appear in a tab until it is reloaded.
- The AI typo check needs a device that meets Chrome's requirements (such as 22 GB of free space) and a one-time model download.
- We recommend setting Gmail's "Undo Send" cancellation period to 30 seconds.
- Gmail's "Send & Archive" button is not supported.

Gmail is a trademark of Google LLC. Use of this trademark is subject to Google Permissions. This extension is not provided or endorsed by Google.
```

## 4. カテゴリと言語

| 項目     | 内容                                                                                                                 |
| -------- | -------------------------------------------------------------------------------------------------------------------- |
| カテゴリ | 仕事効率化の系統（ダッシュボードの選択肢から選ぶ。候補：「ワークフローとプランニング」または「コミュニケーション」） |
| 言語     | 日本語（既定）、英語                                                                                                 |

カテゴリの選択肢の一覧は、確認した公式ドキュメントには載っていませんでした。提出時にダッシュボードの選択肢を見て決めます。

## 4-2. 販売範囲

| 項目     | 内容     |
| -------- | -------- |
| 公開範囲 | 公開     |
| 販売地域 | 日本のみ |

英語の掲載文とスクリーンショットは用意してあるが、英語表示には未調整の箇所がある（一覧の区切り、曜日の表記）。日本以外に広げるときに直す。

## 5. 画像

| 種類               | 大きさ                                                         | 必須                           | 状態                                                                                |
| ------------------ | -------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------- |
| アイコン           | 128×128 px の PNG（絵の部分は 96×96、周囲 16 px は透明の余白） | 必須                           | `public/icons/icon128.png`（余白の決まりに合わせて作成。元の絵は `store/icon.svg`） |
| スクリーンショット | 1280×800 px（または 640×400）。1〜5 枚                         | 1 枚以上必須                   | `store/screenshots/` に作成                                                         |
| 小さい宣伝用タイル | 440×280 px                                                     | 任意（無いと表示順が後になる） | 未作成                                                                              |
| マーキー           | 1400×560 px                                                    | 任意                           | 作らない                                                                            |

## 6. プライバシーのタブ

### 単一用途の説明

**日本語**

```text
Gmail でメールを送信する前に、宛先・件名・本文・添付ファイルを利用者に確認させ、添付漏れや誤字などを知らせて誤送信を防ぐこと。
```

**English**

```text
To prevent mis-sent email by having the user review recipients, subject, body and attachments before sending in Gmail, and by warning about mistakes such as missing attachments and typos.
```

### 権限を使う理由

| 権限                                   | 理由（日本語）                                                                                                                                       | Reason (English)                                                                                                                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                              | 利用者の設定（社内として扱うドメイン、注意したい宛先、警告のオン・オフ、添付のキーワードなど）を、利用者の端末の中に保存するため。                   | To store the user's settings (internal domains, recipients that need care, which warnings are on, attachment keywords, etc.) on the user's device.                                                |
| ホスト権限 `https://mail.google.com/*` | Gmail の作成画面で送信の操作を検知して確認の画面を表示し、確認のために宛先・件名・本文・添付ファイル名を読み取るため。ほかのサイトでは動作しません。 | To detect the send action on Gmail's compose screen, show the confirmation screen, and read the recipients, subject, body and attachment names for the review. It does not run on any other site. |

### リモートコード

「いいえ、リモートコードは使用していません」を選びます。すべてのコードは拡張機能のパッケージに含まれており、外部からスクリプトを読み込みません。

### データの使用

- この拡張機能は、メールの内容（宛先、件名、本文、添付ファイル名）を**端末の中で読み取って処理します**が、**外部には送信しません**。開発者がデータを受け取ることもありません。
- 連絡先の記録を有効にした場合は、送信した相手のアドレス・表示名・回数・最後に送った日を、**端末の中（IndexedDB）に保存します**。これも外部には送信しません。IndexedDB の利用に、追加の権限は必要ありません。
- ダッシュボードの「収集するデータ」のチェック項目で、端末内だけの処理を「収集」に含めるかどうかは、確認した公式ドキュメントには書かれていませんでした。
- 推奨：審査で説明と申告が食い違うと判断されるのを避けるため、読み取っている情報に当たる項目（**個人を特定できる情報**、**個人的なコミュニケーション**）にチェックを入れ、プライバシーポリシーで「端末内でのみ処理し、外部に送信しない」と明記します。提出時に、ダッシュボードの各項目の説明文を読んで最終判断します。
- 次の3つの確認事項には、すべて当てはまるのでチェックを入れます。
  - 承認されている用途以外で、利用者のデータを第三者に販売・転送しない
  - 拡張機能の単一用途と関係のない目的で、利用者のデータを使用・転送しない
  - 信用力の判断や融資の目的で、利用者のデータを使用・転送しない

### プライバシーポリシーの URL

GitHub Pages で公開する `docs/privacy-policy.md` の URL を入力します。

| 言語   | URL                                                                 |
| ------ | ------------------------------------------------------------------- |
| 日本語 | <https://gunji-21.github.io/send-check-for-gmail/privacy-policy>    |
| 英語   | <https://gunji-21.github.io/send-check-for-gmail/privacy-policy.en> |

GitHub Pages を有効にした後（公開元：main ブランチの `/docs`）、実際に開けることを確認してから入力します。

## 7. 提出前の確認

- [ ] 名前・説明・スクリーンショットが、実際の動作と一致している
- [x] プライバシーポリシーの「下書き」の表示を外し、最終更新日と問い合わせ先を記入した
- [ ] プライバシーポリシーの内容と、ダッシュボードの「データの使用」の申告が一致している
- [ ] `npm run lint`・`npm run typecheck`・`npm test` が通っている
- [ ] `npm run package` で作った zip を、まっさらな Chrome のプロファイルに読み込んで動作を確認した
- [x] バージョン番号を決めた（1.0.0）
