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
　- 本文が空
　- 敬称の誤り（「各位様」、「御中」と「様」の併用 など）
　- 全角と半角の英数字の混在（「1０月」など）
　- 自分で登録した誤り（誤字の辞書）、署名の入れ忘れ
　- 日付と曜日の不一致（「11月13日（木）」など）
　- 社外の複数の会社が宛先に混ざっている
・AI を使って、誤字・脱字の候補を表示できます（任意。初期設定はオフ）。Chrome に内蔵された AI のほか、ご自身の API キーを登録して ChatGPT（OpenAI）または Claude（Anthropic）も選べます。候補はその場でメールに反映でき、元に戻すこともできます。
・送信した相手を端末の中に記録して、初めて送るドメインと、いつも Cc に入れている人の入れ忘れを知らせることができます（任意。初期設定はオフ）。
・記録した相手に氏名・会社名・電話番号などを書き足し、拡張機能のアイコンから会社名で検索できます。CSV の書き出し・取り込みもできます。
・開いたメールの署名から、記録済みの相手の氏名・会社名・部署・役職・電話番号を補うこともできます（初期設定は無効）。
・作成画面から、記録した相手を会社名で検索して、To・Cc に追加できます。
・氏名・会社名を登録しておくと、本文の宛名と宛先の食い違い、別の会社の名前が本文や添付ファイル名に残っていること、会社名の書き方の誤りも知らせます。

■ プライバシー
・メールの内容や宛先は、お使いの端末の中だけで処理します。初期設定では、外部のサーバーには一切送信しません。
・AI による誤字・脱字チェックも、初期設定では Chrome に内蔵された AI を使って端末の中で処理します。
・設定画面で外部の AI（ChatGPT／Claude の API）を選び、ご自身の API キーを登録した場合に限り、件名と本文（返信の引用部分を除く）を、選んだ提供元に送信します。宛先、添付ファイル名、連絡先の記録は送信しません。開発者がデータを受け取ることはありません。
・設定は、お使いの端末の中にだけ保存します。
・送信した相手の記録は、有効にした場合だけ、お使いの端末の中に保存します。一定の期間で自動的に削除し、設定画面からいつでもすべて削除できます。
・Gmail API は使いません。ソースコードは GitHub で公開しています。

■ お使いになる前に
・インストールした直後は、開いている Gmail のタブを再読み込みしてください。再読み込みするまで、そのタブでは確認の画面が出ません。
・Chrome に内蔵された AI による誤字・脱字チェックを使うには、Chrome の定める端末の条件（空き容量 22GB 以上など）を満たす端末と、モデルのダウンロード（初回のみ）が必要です。
・外部の AI を使う場合は、各社の API キーと、API の料金の前払い（チャージ）が必要です。
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
  - Empty body
  - Honorific mistakes in Japanese salutations
  - Mixed full-width and half-width letters and digits
  - Mistakes you register yourself (typo dictionary), and a missing signature
  - Date and day-of-week mismatch (Japanese notation)
  - Recipients from multiple external companies
- Can show possible typos using AI (optional, off by default). Besides the AI built into Chrome, you can choose ChatGPT (OpenAI) or Claude (Anthropic) with your own API key. A suggestion can be applied to your email in place, and undone.
- Can record the people you send email to on your device, and warn you about a first-time domain or a person you usually Cc who is missing (optional, off by default).
- Lets you add names, company names and phone numbers to recorded contacts, search them by company name from the extension icon, and export or import a CSV file.
- Optionally fills in the name, company, department, title and phone numbers of recorded contacts from the signature of email you open (off by default).
- Lets you search recorded contacts by company name from the compose window and add them to To or Cc.
- With names and company names registered, it also warns when the salutation does not match the recipients, when another company's name is left in the body or an attachment name, and when a company name is written differently from your directory.

■ Privacy
- The content of your email and your recipients are processed only on your device. By default, nothing is sent to any external server.
- By default, the AI typo check also runs on your device, using the AI built into Chrome.
- Only when you choose an external AI (the ChatGPT or Claude API) on the options page and register your own API key, the subject and body (without the quoted part of a reply) are sent to the provider you chose. Recipients, attachment names and contact records are not sent. The developer never receives your data.
- Settings are stored only on your device.
- Records of the people you send email to are stored on your device, and only when you turn the feature on. They are deleted automatically after a set period, and you can delete all of them at any time from the options page.
- The Gmail API is not used. The source code is published on GitHub.

■ Before you start
- Right after installing, reload any Gmail tabs that are already open. The confirmation screen does not appear in a tab until it is reloaded.
- The typo check with the AI built into Chrome needs a device that meets Chrome's requirements (such as 22 GB of free space) and a one-time model download.
- To use an external AI, you need an API key from the provider and prepaid API credit.
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

| 種類               | 大きさ                                                         | 必須                           | 状態                                                                                                   |
| ------------------ | -------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| アイコン           | 128×128 px の PNG（絵の部分は 96×96、周囲 16 px は透明の余白） | 必須                           | `public/icons/icon128.png`（余白の決まりに合わせて作成。元の絵は `store/icon.svg`）                    |
| スクリーンショット | 1280×800 px（または 640×400）。1〜5 枚                         | 1 枚以上必須                   | `store/screenshots/` に作成                                                                            |
| 小さい宣伝用タイル | 440×280 px                                                     | 任意（無いと表示順が後になる） | `store/promo/small-tile.ja.png`（英語は `small-tile.en.png`。元は `small-tile.html`）                  |
| マーキー           | 1400×560 px                                                    | 任意                           | `store/promo/marquee.ja.png`（英語は `marquee.en.png`。元は `marquee.html` と `marquee-dialog.*.png`） |

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

ダッシュボードの欄は、`storage` と「ホスト権限」の2つ。ホスト権限は、任意の権限（`optional_host_permissions`）も含めて、1つの欄にまとめて書く（2026年11月25日に実際の画面で確認）。

**storage が必要な理由**

```text
利用者の設定（社内として扱うドメイン、注意したい宛先、警告のオン・オフ、添付のキーワードなど）を、利用者の端末の中に保存するため。利用者が外部の AI による誤字・脱字チェックを選んだ場合は、利用者自身が登録した API キーも、端末の中に保存します。
```

**ホスト権限が必要な理由**

```text
【https://mail.google.com/*】Gmail の作成画面で送信の操作を検知して確認の画面を表示し、確認のために宛先・件名・本文・添付ファイル名を読み取るため。ほかのサイトでは動作しません。

【https://api.openai.com/* と https://api.anthropic.com/*（任意の権限）】利用者が設定画面で、ChatGPT（OpenAI の API）または Claude（Anthropic の API）による誤字・脱字チェックを選び、自分の API キーを登録したときにだけ、件名と本文（返信・転送の引用部分を除く）を送って、誤字・脱字の候補を受け取るため。インストール時には求めず、利用者が API キーを保存するときに許可を求めます。初期設定では、外部とは通信しません。
```

**English**（英語で入力する場合）

```text
storage: To store the user's settings (internal domains, recipients that need care, which warnings are on, attachment keywords, etc.) on the user's device. If the user chooses the external AI typo check, the API key the user registers is also stored on the device.
```

```text
Host permissions: [https://mail.google.com/*] To detect the send action on Gmail's compose screen, show the confirmation screen, and read the recipients, subject, body and attachment names for the review. It does not run on any other site.

[https://api.openai.com/* and https://api.anthropic.com/* (optional)] Only when the user chooses the typo check by ChatGPT (OpenAI API) or Claude (Anthropic API) on the options page and registers their own API key, to send the subject and body (without the quoted part of a reply or forward) and receive typo suggestions. It is not requested at install time, only when the user saves an API key. By default, nothing is sent out.
```

### リモートコード

2026年11月25日時点のダッシュボードには、リモートコードの質問は表示されなかった（入力は不要）。質問が表示された場合は、「いいえ、リモートコードは使用していません」を選びます。すべてのコードは拡張機能のパッケージに含まれており、外部からスクリプトを読み込みません。外部の AI の API から受け取るのは、誤字・脱字の候補のデータ（JSON）だけで、コードとして実行することはありません。

### データの使用

- この拡張機能は、メールの内容（宛先、件名、本文、添付ファイル名）を**端末の中で読み取って処理します**。初期設定では、**外部には送信しません**。開発者がデータを受け取ることはありません。
- **外部の AI による誤字・脱字チェック**（利用者が設定画面で選び、自分の API キーを登録し、通信を許可した場合のみ）では、件名と本文（引用部分を除く）を、利用者が選んだ提供元（OpenAI または Anthropic）の API に送信します。宛先・添付ファイル名・連絡先の記録は送信しません。これは、利用者の指示による、単一用途（送信前の誤字の確認）のための転送です。「個人的なコミュニケーション」の項目にチェックを入れ、プライバシーポリシーに送信先と内容を明記しています。
- 連絡先の記録を有効にした場合は、送信した相手のアドレス・表示名・回数・最後に送った日と、利用者が入力・取り込みした氏名・会社名・部署・役職・電話番号を、**端末の中（IndexedDB）に保存します**。「届いたメールからも連絡先を補う」も有効にした場合は、開いたメールの送信元・宛先・署名を読み取り、記録済みの相手の氏名・会社名・部署・役職・電話番号を補います（本文そのものは保存しません）。これも外部には送信しません。IndexedDB の利用に、追加の権限は必要ありません。
- 拡張機能のアイコンから開くポップアップ（`action`）を追加していますが、権限は増えていません（`storage` と `https://mail.google.com/*` のまま）。
- ダッシュボードの「収集するデータ」のチェック項目で、端末内だけの処理を「収集」に含めるかどうかは、確認した公式ドキュメントには書かれていませんでした。
- 推奨：審査で説明と申告が食い違うと判断されるのを避けるため、読み取っている情報に当たる項目（**個人を特定できる情報**、**個人的コミュニケーション**。外部の AI の API キーを保存して提供元に送るので、**認証に関する情報**も）にチェックを入れ、プライバシーポリシーで「端末内でのみ処理し、外部に送信しない」と明記します。提出時に、ダッシュボードの各項目の説明文を読んで最終判断します。
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

- [x] 名前・説明・スクリーンショットが、実際の動作と一致している
- [x] プライバシーポリシーの「下書き」の表示を外し、最終更新日と問い合わせ先を記入した
- [x] プライバシーポリシーの内容と、ダッシュボードの「データの使用」の申告が一致している
- [x] `npm run lint`・`npm run typecheck`・`npm test` が通っている
- [x] `npm run package` で作った zip を、まっさらな Chrome のプロファイルに読み込んで動作を確認した（まっさらなプロファイルでの確認は省略し、ふだんのプロファイルでの動作確認で完了とした。2026年11月25日）
- [x] バージョン番号を決めた（1.1.0。1.0.0 は公開済み）
