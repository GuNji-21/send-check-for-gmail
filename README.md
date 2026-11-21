# Send Check for Gmail

[日本語](#日本語) | [English](#english)

---

## 日本語

### 概要

Gmail の送信操作をいったん止めて、宛先（To / Cc / Bcc）・件名・本文・添付を確認させてから送信する Chrome 拡張機能（Manifest V3）です。添付漏れや書き換え忘れなどを自動で検知し、誤送信を防ぎます。

- 対象：PC 版 Chrome 上の Gmail（mail.google.com）
- Gmail API は使いません。外部への通信は一切行わず、設定は利用者の端末内にのみ保存します。
- 現在はフェーズ1（v1.0.0）を実装済みです。Chrome Web Store への公開を準備しています。
- Gmail は Google LLC の商標です。この拡張機能は Google が提供・公認するものではありません。

### できること（フェーズ1・実装済み）

**送信前の確認**

- 次の操作を止めて、確認ダイアログを表示します。
  - 送信ボタン（クリック、Enter、Space）
  - 送信ショートカット（Ctrl + Enter／Cmd + Enter）
  - 「送信日時を設定」（予約送信）。確認後に、日時の選択へ進みます
- 対象の画面：新規作成、返信、全員に返信、転送、ポップアウト、全画面表示
- ダイアログには、宛先（To / Cc / Bcc ごと）、件名、本文の冒頭、添付ファイルを表示します。
- **宛先と添付のすべてにチェックを入れるまで、送信できません。**
- 社外の宛先は強調して表示し、ドメインごとの人数をまとめて表示します。
- Gmail の表示言語には依存しません。拡張機能の画面は日本語と英語に対応しています。

**宛先の区分**（設定画面で登録）

| 区分     | 単位               | 動作                                                                               |
| -------- | ------------------ | ---------------------------------------------------------------------------------- |
| 社内     | ドメイン／アドレス | 送信元アドレスと同じドメインは自動で社内扱い。社内の宛先はまとめてチェックできます |
| 要注意   | ドメイン／アドレス | 毎回、赤で強調して表示します                                                       |
| 確認省略 | アドレス           | 宛先のすべてが登録済みのときだけ、ダイアログを出さずに送信します（初期設定は無効） |

フリーメール（gmail.com、yahoo.co.jp など）は、ドメインではなくアドレスごとに判定します。

**自動検知**（項目ごとにオン・オフを選べます。初期設定はすべてオン）

| 項目               | 検知する内容                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| 複数の会社の混在   | 社外の宛先が2つ以上のドメインにまたがっている                                                                |
| 件名が空           | 件名が入力されていない                                                                                       |
| 添付漏れ           | 本文に「添付」「送付」「見積書」などのキーワードがあるのに、添付ファイルがない（相手への依頼の文などは除く） |
| 書き換え忘れの記号 | 〇〇、●●、XX、【 】、{name} などが件名・本文に残っている                                                     |
| 日付と曜日の不一致 | 「11月13日（木）」のように、日付と曜日が合っていない。存在しない日付も検知                                   |

- 警告は表示するだけで、警告が出ていてもそのまま送信できます。
- 返信・転送時の引用部分（過去のメール）は、検知の対象にしません。
- 添付のキーワードは設定画面で編集できます。本文に Google ドライブ（drive.google.com／docs.google.com）のリンクがあれば添付ありとみなす設定もあります（初期設定はオン）。

**AI による誤字・脱字チェック**（初期設定は無効）

- Chrome に内蔵された AI（Gemini Nano）で、件名と本文の誤字・脱字の候補を調べ、確認ダイアログに「誤りの箇所 → 修正案」と理由を表示します。
- 処理は端末の中だけで行われ、メールの内容が外部に送信されることはありません。料金もかかりません。
- 結果は確認ダイアログを開いた後に表示されます。結果を待たずに送信でき、解析に失敗しても送信は止まりません。
- 候補ごとの「修正する」ボタンで、修正案をメールに反映できます（該当する箇所が1か所に決まる場合のみ）。反映後は、書き換えた行がその場に表示され、「元に戻す」で取り消したり、「メールで確認」で実際のメールの画面に戻って該当箇所を確かめたりできます。
- 使うには、設定画面で有効にして、モデルをダウンロードします（初回のみ）。空き容量 22GB 以上、メモリ 16GB 以上または VRAM 4GB 超の GPU など、Chrome の定める端末の条件があります。対応していない端末では、設定画面にその旨が表示されます。

**連絡先の記録**（初期設定は無効。開発中の版に含まれ、ストアの版にはまだ含まれていません）

- 設定画面で有効にすると、送信した相手（アドレス、表示名、To・Cc に入れた回数、最後に送った日）を、端末の中に記録します。外部には送信しません。
- 記録を使って、次の2つを確認します。
  - 初めて送るドメイン（似たドメインへの誤送信に気づくため）
  - Cc 漏れ（その相手へのメールで、よく Cc に入れている人が今回入っていない）
- 記録は、最後に送った日から一定の期間（初期値は1年）で自動的に削除します。設定画面から、いつでもすべて削除できます。

**うまく動かないとき**

- 拡張機能側でエラーが起きた場合や、Gmail の画面を読み取れなかった場合は、送信を止めて「チェックできませんでした」と表示します。確認なしに送信されることはありません。

### 使うときの注意

- **インストールした直後は、開いている Gmail のタブを再読み込みしてください。** 再読み込みするまで、そのタブでは送信前チェックが働きません。インストール時に開く設定画面にも、同じ案内を表示しています。
- Gmail の設定で「送信取り消し」の時間を30秒にしておくことをおすすめします（Gmail の設定 → 全般 → 送信取り消し）。
- Gmail の「送信してアーカイブ」ボタン（Gmail の設定で有効にした場合に表示されるボタン）には対応していません。このボタンでの送信は確認されない可能性があります。
- Gmail の画面が変更されると、送信ボタンを認識できなくなることがあります。その場合は、画面の隅に注意書きを表示します。
- Gmail のモバイルアプリでは動作しません（拡張機能が使えないため）。

### 今後の予定

**フェーズ2**

- 連絡先・会社台帳の自動作成（送信した相手と、その相手から届いたメールの Cc・署名を画面から蓄積）
- 会社名検索
- 宛名と宛先の照合
- 添付ファイル名・本文中の他社名のチェック
- Cc 漏れの通知
- 初めて送るドメインの警告
- 会社名での宛先表示

**フェーズ3**

- 誤字辞書の拡充
- AI による署名抽出の精度向上

### 開発環境の準備

必要なもの：

- Node.js 22.13 以上（npm 付属）
- Google Chrome

```bash
git clone https://github.com/GuNji-21/send-check-for-gmail.git
cd send-check-for-gmail
npm install
```

### ビルド方法

| コマンド                       | 内容                                                    |
| ------------------------------ | ------------------------------------------------------- |
| `npm run build`                | 本番ビルド（`dist/` に出力）                            |
| `npm run dev`                  | 監視ビルド（ソースを変更するたびに再ビルド）            |
| `npm test`                     | テストを実行                                            |
| `npm run lint`                 | ESLint による静的チェック                               |
| `npm run typecheck`            | TypeScript の型チェック                                 |
| `npm run format`               | Prettier でコードを整形                                 |
| `npm run package`              | ビルド後、`release/` にストア提出用の zip を出力        |
| `npm run fixtures:save <画面>` | クリップボードの Gmail の HTML を保存し、匿名化して検査 |
| `npm run fixtures:anonymize`   | 採取した Gmail の HTML を匿名化して検査                 |
| `npm run fixtures:check`       | 匿名化済みのテスト用 HTML に置き換え漏れがないか検査    |

テストでは、実際の Gmail から採取して匿名化した HTML を使っています。採取の手順は [tests/fixtures/gmail/README.md](tests/fixtures/gmail/README.md) を参照してください。

### Chrome への読み込み方法

1. `npm run build`（または `npm run dev`）を実行して `dist/` を作成する
2. Chrome で `chrome://extensions` を開く
3. 右上の「デベロッパー モード」をオンにする
4. 「パッケージ化されていない拡張機能を読み込む」をクリックし、このリポジトリの `dist/` フォルダを選択する
5. **開いている Gmail のタブを再読み込みする**
6. コードを変更して再ビルドしたら、拡張機能一覧の更新ボタンを押し、Gmail のタブを再読み込みする

設定画面は、`chrome://extensions` でこの拡張機能の「詳細」→「拡張機能のオプション」から開けます。

### ライセンス

[MIT License](LICENSE) © 2026 Tatsuki Gunji

---

## English

### Overview

A Chrome extension (Manifest V3) that stops the send action in Gmail and makes you review recipients (To / Cc / Bcc), subject, body and attachments before the message goes out. It also detects missing attachments, leftover placeholders and similar mistakes to prevent mis-sends.

- Target: Gmail (mail.google.com) on desktop Chrome
- Does not use the Gmail API. Makes no external network requests; settings are stored only on your device.
- Phase 1 (v1.0.0) is implemented. Publication on the Chrome Web Store is being prepared.
- Gmail is a trademark of Google LLC. This extension is not provided or endorsed by Google.

### What it does (Phase 1, implemented)

**Pre-send confirmation**

- Stops the following actions and shows a confirmation dialog:
  - The Send button (click, Enter, Space)
  - The send shortcut (Ctrl + Enter / Cmd + Enter)
  - "Schedule send". After you confirm, Gmail's date and time selection opens
- Supported screens: new message, reply, reply all, forward, pop-out and full-screen
- The dialog shows recipients (grouped by To / Cc / Bcc), the subject, the beginning of the body and the attachments.
- **You cannot send until every recipient and attachment is ticked.**
- External recipients are highlighted, with a per-domain count.
- Works regardless of Gmail's display language. The extension UI is available in Japanese and English.

**Recipient categories** (registered on the options page)

| Category          | Unit             | Behavior                                                                                               |
| ----------------- | ---------------- | ------------------------------------------------------------------------------------------------------ |
| Internal          | Domain / address | The domain of your sender address is internal automatically. Internal recipients can be ticked at once |
| Caution           | Domain / address | Highlighted in red every time                                                                          |
| Skip confirmation | Address          | The dialog is skipped only when every recipient is registered (off by default)                         |

Free email services (gmail.com, yahoo.co.jp, etc.) are judged per address, not per domain.

**Automatic checks** (each can be turned on or off; all are on by default)

| Check                       | What it detects                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------- |
| Multiple external companies | External recipients span two or more domains                                       |
| Empty subject               | The subject is empty                                                               |
| Missing attachment          | The body mentions an attachment keyword, but nothing is attached                   |
| Leftover placeholders       | 〇〇, ●●, XX, 【 】, {name} and similar remain in the subject or body              |
| Date / day-of-week mismatch | A date and its day of the week do not match (Japanese notation); invalid dates too |

- Warnings are only shown; you can still send when a warning appears.
- Quoted text in replies and forwards is not checked.
- Attachment keywords can be edited on the options page. A Google Drive link (drive.google.com / docs.google.com) in the body can be treated as an attachment (on by default).

**AI typo check** (off by default)

- Uses the AI built into Chrome (Gemini Nano) to look for possible typos in the subject and body, and shows "wrong text → suggestion" with a reason in the confirmation dialog.
- Everything is processed on your device; the content of your email is never sent anywhere. It is free.
- Results appear after the confirmation dialog opens. You can send without waiting, and a failed check never blocks sending.
- Each candidate has a "Fix" button that applies the suggestion to your email (only when the text to fix can be identified in exactly one place). After a fix, the changed line is shown in place; "Undo" reverts it, and "See in email" closes the dialog and selects the fixed text in your email.
- To use it, turn it on in the options page and download the model (once). Chrome's device requirements apply, such as 22 GB of free space and either 16 GB of RAM or a GPU with more than 4 GB of VRAM. On unsupported devices, the options page says so.

**Contact records** (off by default; in the development version, not yet in the store version)

- When you turn it on in the options page, the people you send email to (address, display name, how often they were in To or Cc, and the date of the last send) are recorded on your device. Nothing is sent anywhere.
- The records are used for two checks:
  - First-time domain (to notice look-alike domains)
  - Missing Cc (people you usually Cc on email to that recipient are not included this time)
- Records are deleted automatically after a set period from the last send (1 year by default). You can delete all of them at any time from the options page.

**When something goes wrong**

- If the extension hits an error or cannot read the Gmail screen, it stops the send and shows "The check could not be completed". A message is never sent without the check.

### Notes for use

- **Right after installing, reload any Gmail tabs that are already open.** The pre-send check does not work in a tab until it is reloaded. The options page opened on install shows the same notice.
- We recommend setting Gmail's "Undo Send" cancellation period to 30 seconds (Gmail Settings → General → Undo Send).
- Gmail's "Send & Archive" button (shown when enabled in Gmail settings) is not supported. Messages sent with it may not be checked.
- If Gmail changes its screen layout, the Send button may no longer be recognized. In that case a notice is shown in the corner of the screen.
- It does not work in the Gmail mobile apps (extensions are not available there).

### Roadmap

**Phase 2**

- Automatically built contact and company directory (from people you have sent email to, plus the Cc lines and signatures of email received from them)
- Company name search
- Salutation vs. recipient matching
- Attachment file name and other-company-name checks
- Missing Cc notification
- First-time domain warning
- Showing recipients grouped by company name

**Phase 3**

- Expanded typo dictionary
- More accurate signature extraction with AI

### Development setup

Requirements:

- Node.js 22.13 or later (with npm)
- Google Chrome

```bash
git clone https://github.com/GuNji-21/send-check-for-gmail.git
cd send-check-for-gmail
npm install
```

### Build

| Command                          | Description                                                     |
| -------------------------------- | --------------------------------------------------------------- |
| `npm run build`                  | Production build (output to `dist/`)                            |
| `npm run dev`                    | Watch build (rebuilds on every source change)                   |
| `npm test`                       | Run tests                                                       |
| `npm run lint`                   | Lint with ESLint                                                |
| `npm run typecheck`              | Type-check with TypeScript                                      |
| `npm run format`                 | Format code with Prettier                                       |
| `npm run package`                | Build, then write a store-ready zip to `release/`               |
| `npm run fixtures:save <screen>` | Save Gmail HTML from the clipboard, then anonymize and check it |
| `npm run fixtures:anonymize`     | Anonymize and check captured Gmail HTML                         |
| `npm run fixtures:check`         | Check the anonymized test HTML for leftover real data           |

The tests use HTML captured from real Gmail and then anonymized. See [tests/fixtures/gmail/README.md](tests/fixtures/gmail/README.md) (Japanese) for the capture steps.

### Loading into Chrome

1. Run `npm run build` (or `npm run dev`) to create `dist/`
2. Open `chrome://extensions` in Chrome
3. Turn on "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the `dist/` folder of this repository
5. **Reload any Gmail tabs that are already open**
6. After rebuilding, click the reload button on the extension card and reload your Gmail tab

The options page is available from `chrome://extensions` → "Details" → "Extension options".

### License

[MIT License](LICENSE) © 2026 Tatsuki Gunji
