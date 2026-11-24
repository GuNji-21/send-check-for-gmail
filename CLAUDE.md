# CLAUDE.md

このファイルは、Claude Code がこのリポジトリで作業するときの前提・ルールをまとめたものです。作業の前に必ず読んでください。

## プロジェクト概要

- Gmail 誤送信防止の Chrome 拡張機能（Manifest V3）。対象は PC 版 Chrome 上の Gmail（mail.google.com）。
- 目的：送信前に宛先（To / Cc / Bcc）・本文・添付を確認させ、添付漏れ、宛名と宛先の不一致、誤字脱字などを検知して誤送信をなくす。
- 要件は **docs/requirements.md** を参照する。要件に書かれていない仕様を推測で決めず、不明点は相談する。
- 配布：Chrome Web Store で一般公開、GitHub でソース公開（MIT ライセンス）。
- 前提：Gmail API は使わない。外部への通信はしない。データは端末内にのみ保存する。
  - AI による誤字・脱字チェックは、Chrome 内蔵の AI（Gemini Nano の Prompt API）だけを使う。処理は端末内で完結し、外部通信は発生しない。利用者の API キーを使う方式・外部の AI サービスは採用しない（決定済み）。

### 開発フェーズ

要件定義書「9. 開発フェーズ」と同じ内容。

| フェーズ  | 内容                                                                                                                                                                    |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| フェーズ1 | 送信の捕捉、確認ダイアログ（件名が空・複数社混在の警告を含む）、社内・要注意・確認省略の指定、添付漏れ、プレースホルダー、日付と曜日の照合、AI による誤字・脱字チェック |
| フェーズ2 | 連絡先・会社台帳の自動作成、会社名検索、宛名と宛先の照合、添付ファイル名・本文中の他社名チェック、Cc 漏れ通知、初めて送るドメインの警告、会社名での宛先表示             |
| フェーズ3 | 誤字辞書の拡充（敬称の誤り、社名表記、重複・脱字、よくある誤変換、表記ゆれ、署名がない、本文が空を含む）、AI による署名抽出の精度向上                                   |

フェーズ2は3段階（2a・2b・2c）に分けて進める（要件定義書「5-6. フェーズ2の進め方と決定事項」）。現在は 2a（連絡先の記録、初めて送るドメイン、Cc 漏れ）と 2c（会社名検索のポップアップ `src/popup/`、台帳の画面 `src/manage/`、CSV）を実装済み。フェーズ3の検知（同じ文字の重複、敬称の誤り、社名表記、登録した誤り、全角・半角の混在、本文が空、署名がない）も実装済み。2b のうち、宛名と宛先の照合、添付ファイル名・本文中の他社名のチェックは実装済み（台帳の氏名・会社名を使う）。届いたメールからの補完（送信元・宛先・署名。`src/gmail/message-view.ts`、`src/content/received.ts`、`src/core/ledger/received.ts`、`signature.ts`）も実装済み。作成画面からの宛先検索（検索結果を To・Cc に追加。`src/gmail/recipients.ts`、`src/content/recipient-search.ts`、`src/ui/recipient-search/`）も実装済み。未実装は、AI による署名抽出だけ。

### 技術スタック

- TypeScript（strict）
- ビルド：esbuild（`scripts/build.mjs`。各エントリを IIFE 形式で `dist/` に出力し、`public/` の中身をコピー）
- テスト：Vitest（DOM のテストは jsdom）
- 品質：ESLint（typescript-eslint）＋ Prettier
- パッケージ管理：npm、Node.js 22 以上（依存パッケージの都合で 22.13 以降）
- TypeScript は 6.0 系に固定している（typescript-eslint が TypeScript 7 に未対応のため）。typescript-eslint が対応したら 7 系への更新を検討する
- 実行時に使う外部ライブラリはゼロ（`devDependencies` のみ）

## コマンド

| コマンド                       | 内容                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `npm run build`                | 本番ビルド。`dist/` を作り直し、`content.js` / `background.js` / `options.js` / `manage.js` / `popup.js` と静的ファイルを出力 |
| `npm run dev`                  | 監視ビルド（`--watch`）。ソース変更のたびに再ビルドする                                                                       |
| `npm test`                     | `vitest run`。テストを1回実行する                                                                                             |
| `npm run test:watch`           | `vitest`。変更を監視してテストを再実行する                                                                                    |
| `npm run lint`                 | `eslint .`。禁止事項（外部通信・eval・core の DOM 依存など）の一部も検出する                                                  |
| `npm run typecheck`            | `tsc --noEmit`。型チェックのみ（出力なし）                                                                                    |
| `npm run format`               | `prettier --write .`。全ファイルを整形する                                                                                    |
| `npm run fixtures:anonymize`   | `tests/fixtures/gmail/raw/` の HTML を匿名化して `tests/fixtures/gmail/` に出力し、置き換え漏れを検査する                     |
| `npm run fixtures:save <画面>` | クリップボードの HTML を `tests/fixtures/gmail/raw/` に保存し、続けて匿名化と検査をする                                       |
| `npm run fixtures:check`       | 匿名化済みのフィクスチャに置き換え漏れがないか検査する                                                                        |
| `npm run package`              | ビルド後、`dist/` を zip 化して `release/send-check-for-gmail-v<version>.zip` に出力                                          |

## フォルダ構成

```
src/
├── content/      content script（Gmail のページ上で動く）。送信操作の捕捉
├── gmail/        Gmail の DOM・セレクタに依存するコードはすべてここ
├── core/         純粋な処理（分類・検知器・テキスト処理）。DOM・chrome API に依存しない
│   ├── detectors/  検知器（1項目1ファイル）
│   └── text/       テキスト処理の共通部品
├── ui/dialog/    確認ダイアログ（Shadow DOM）
├── options/      設定画面
├── manage/       台帳の画面（連絡先の一覧・編集、CSV の書き出し・取り込み）
├── popup/        会社名検索のポップアップ（拡張機能のアイコンから開く）
├── pages/        台帳の画面とポップアップの共通部品（CSS、画面の部品）
├── background/   service worker（メッセージ処理、フェーズ2の IndexedDB）
├── storage/      設定の読み書き（chrome.storage）
└── shared/       メッセージ型・i18n など共通部品
public/           manifest.json・アイコン・_locales（dist/ にそのままコピー）
tests/unit/       単体テスト
tests/fixtures/   テスト用の Gmail の HTML など（架空のデータのみ）
docs/             要件定義書・プライバシーポリシー
store/            Chrome Web Store 掲載用の素材
```

## 構成ルール

- **Gmail の画面構造（DOM・セレクタ）への依存は `src/gmail/` にのみ書く。** 他のフォルダから Gmail の DOM を直接触らない。`src/gmail/selectors.ts` を `src/gmail/` 以外から import することは ESLint で禁止している。
- **`src/core/` は DOM にも chrome API にも依存しない純粋な処理にする。** `window` / `document` / `chrome` などのグローバルや、`gmail/` `ui/` `storage/` などからの import は ESLint で禁止している。
- **検知器は `src/core/detectors/` に1項目1ファイルで作る。**
  - 入力は送信内容のスナップショット（`ComposeSnapshot`）、出力は検知結果の配列（`Detection[]`。問題が無ければ空配列）とする。型は `src/core/types.ts` の `Detector` に従う。
  - 作った検知器は `src/core/detectors/index.ts` の `DETECTORS` に登録する。
  - **必ず `tests/unit/` にテストを付ける。**（検知する例・検知しない例の両方）
- **確認ダイアログは Shadow DOM で描画し、Gmail の CSS と干渉させない。**
- **連絡先・会社台帳（フェーズ2）は background 側の IndexedDB に保存し、content からはメッセージ通信で読み書きする。** content で IndexedDB を使うと Gmail 側の保存領域に入るため禁止（ESLint でも検出）。メッセージの型は `src/shared/messages.ts` に定義する。
- **画面文言は直接書かず `_locales`（ja / en）に追加する。** `public/_locales/ja/messages.json` と `en/messages.json` の両方に同じキーを追加し、`src/shared/i18n.ts` の `MessageKey` にも追加する。
- **Gmail の表示言語に依存しない方法で要素を特定する。**（「送信」「Send」などの文言で探さない）
- **送信の捕捉対象は、送信ボタンのクリック、ショートカット（Ctrl+Enter／Cmd+Enter）、「送信日時を設定」（予約送信）。** 対象画面は新規作成、返信、全員に返信、転送、インライン返信、ポップアウト、全画面表示。
- **返信・転送時の引用部分（過去メール）は判定対象から除外する。** 引用の判別は DOM に依存するため `src/gmail/` で取り除き、`ComposeSnapshot.bodyText` には引用を除いた本文だけを入れる。
- **複数アカウントに対応する。** 送信元アドレスは作成画面ごとに読み取る（`ComposeSnapshot.fromAddress`、必須）。設定はアカウント共通とする。
- **送信操作から 0.5 秒以内に確認ダイアログを表示する。** 検知器は同期処理にし、設定は content script の起動時に読み込んで保持する（送信操作のたびに非同期の読み込みを待たない）。
- DOM を扱うテストは、テストファイルの先頭に `// @vitest-environment jsdom` を書いて jsdom で実行する。Gmail の HTML の断片は `tests/fixtures/gmail/` に置く。
- **Gmail から採取した HTML は、必ず `npm run fixtures:anonymize` で匿名化したものだけをコミットする。** 採取したままの HTML は `tests/fixtures/gmail/raw/`（`.gitignore` 済み）に置く。採取の手順とファイル名の決まりは `tests/fixtures/gmail/README.md` に従う。匿名化後は画面文言も伏せ字になるため、テストで本文や宛先名が必要なときはテストコード側で DOM に値を入れる。

## 宛先区分と警告の設定

- **宛先の分類は 要注意 ＞ 社内 ＞ 社外 の優先順位で決める。**（`src/core/classify.ts`）
- **送信元アドレスのドメインは、登録が無くても自動で社内扱いにする。**
- **フリーメール（gmail.com など。`src/core/freemail.ts` の固定リスト）はドメイン単位ではなくアドレス単位で判定する。** ドメイン単位の社内・要注意の指定は適用しない。送信元がフリーメールの場合は、送信元アドレス自身だけを社内扱いにする。
- **確認省略はアドレス単位のみで、初期設定では無効。** 宛先の分類とは別の判定とし、機能が有効で、かつすべての宛先が確認省略アドレスのときだけダイアログを省略する。
- **利用者の登録が必要な検知（登録した誤り、署名がない）は、登録が無いときは何も検知しない。** 文面だけから推測して警告を出さない。
- **警告のオン・オフは検知項目ごとに利用者が設定する。** 検知器は警告するかどうかを決めない。`runDetectors` が「オフ」の検知器を実行しない。検知項目の初期値はすべてオン。警告は表示するだけで、送信は止めない（送信を止めるのは、宛先と添付の全件チェックのみ）。
- 設定の保存先は `chrome.storage.local`（端末間の自動同期はしない）。

## AI による誤字・脱字チェック

- **Chrome 内蔵の AI（Prompt API）だけを使う。** 呼び出しは `src/shared/language-model.ts` にまとめる。AI に渡す文面の組み立てと、返ってきた JSON の検証は `src/core/typo/typo-check.ts`（純粋な処理）に置く。
- **初期設定は無効。** モデルのダウンロードは、設定画面のボタンから利用者が始める（Chrome の決まりで、利用者の操作の直後にしか始められない）。未ダウンロードの状態で `create()` を呼ばない。
- **AI の返答をそのまま表示しない。** JSON スキーマで形を指定したうえで検証し、指摘された箇所が元の文面に無い候補は捨てる。
- **意味を変える候補（肯定と否定の入れ替え、数字・日付の変更など）と言い換えの候補は表示しない。** 判定は `src/core/typo/typo-filter.ts`（純粋な処理）に置く。疑わしい候補は捨てる側に倒す。助詞1文字を別の助詞に入れ替えるだけの候補と、ひらがな2文字以上を別の文字に置き換える候補（言い回しの変更。置き換え先が漢字でも同じ）、2文字以上を削るだけの候補（隣と同じ文字の繰り返しを消すものを除く）、句読点などの記号や空白を足す・消すだけの候補も捨てる。
- **同じ文字の重複（をを、まます など）は、AI に頼らず検知器（`src/core/detectors/repeated-characters.ts`）で拾う。** AI は長い文面の中の重複を取りこぼすため。
- **AI に渡すのは、件名と本文（引用部分を除く）だけ。** 宛先や添付ファイル名は渡さない。
- **修正案をメールに反映するのは、利用者が「修正する」を押したときだけ。** 該当する箇所が件名と本文（引用を除く）を通して1か所に決まる場合にだけ書き換える（`src/gmail/compose.ts` の `replaceComposeText`）。

## 連絡先の記録（台帳）

- **初期設定は無効。** 利用者が設定画面で有効にしたときだけ、送信した相手を記録する。
- **記録の中身と判断は `src/core/ledger/ledger.ts`（純粋な処理）に置く。** 保存先は `LedgerStore` として外から渡す。実際の保存先は background 側の IndexedDB（`src/background/ledger-idb.ts`）。
- **content と設定画面からは、メッセージで読み書きを依頼する。**（`src/shared/ledger-client.ts`、型は `src/shared/messages.ts`）
- **やりとりの回数は、判断にだけ使い、画面には表示しない。**
- **台帳を使う検知器は、台帳の情報が無いとき（無効・読めなかった）は何も検知しない。** 氏名・会社名を使う検知器（宛名照合、他社名、社名表記）は、照合に必要な情報が一部でも分からないときは検知しない（誤った警告を出さないほうを優先する）。会社名・氏名の照合用の文字列処理は `src/core/text/company.ts`、宛名の読み取りは `src/core/text/salutation.ts` にまとめる。
- **台帳の閲覧・検索・編集・CSV の処理は `src/core/ledger/directory.ts` と `csv.ts`（純粋な処理）に置く。**
- **台帳の値（表示名、利用者の入力、CSV から取り込んだ値）は信頼できない文字列として扱う。** 画面には必ず `textContent`／`value` で入れる（`innerHTML` を使わない）。CSV の取り込みは、アドレスの形・長さ・件数を確かめ、background 側でも確かめ直す。
- **会社名を付けただけ・取り込んだだけのドメインは、「送ったことがあるドメイン」として扱わない。**（`CompanyRecord.neverSent`）
- **作成画面からの宛先検索は、連絡先の記録が有効なときだけボタンを置く。** 宛先欄への追加（`addRecipient`）は、宛先チップができたことを確かめ、できなければ失敗として表示する。台帳のアドレスは、アドレスの形を確かめてから宛先欄に入れる。失敗しても送信の捕捉には影響させない。
- **届いたメールの読み取りは、連絡先の記録とは別の設定（`ledgerReadReceived`）で、初期設定は無効。** 補完するのは、送信元がすでに台帳にある相手のときだけ。本文そのものは background に渡さず、保存もしない（署名から読み取った項目だけを渡す）。利用者が確認した連絡先（確定）の入力済みの項目は書き換えない。読めないメールは黙って飛ばす（送信には影響させない）。

## 禁止事項（変更が必要な場合は必ず事前に相談すること）

- 外部への通信（`fetch`、`XMLHttpRequest`、`WebSocket` 等）
- 外部スクリプトの読み込み・`eval` 等のリモートコード実行
- Gmail API の使用
- `manifest.json` の権限追加（現在は `permissions: ["storage"]`、`host_permissions: ["https://mail.google.com/*"]` のみ）
- 実行時に使う外部ライブラリ（`dependencies`）の追加
- テストデータ・コードへの実在のメールアドレス・氏名・会社名の記載（架空のもの、`example.com` 等を使う）

## 失敗時の動作

- **拡張機能側でエラーが起きた場合は送信を止め、「チェックできませんでした」と表示する。黙って送信させない。**
- 例外を握りつぶして送信を通す実装（`catch` で何もせず続行する等）は不可。Gmail の画面変更で要素が見つからない場合も同様に扱う。
- 表示文言は `_locales` の `errorCheckFailed` を使う。
- **例外：連絡先の記録（台帳）の読み書きの失敗では送信を止めない。** 読めなかった場合は、台帳を使うチェックを行えなかったことを確認ダイアログに表示する（`dialogLedgerUnavailable`）。記録の失敗は、すでに始まった送信に影響させない。
- **例外：AI による誤字・脱字チェックの失敗では送信を止めない。** 補助の機能であり、解析には時間がかかるため、確認ダイアログを先に表示して結果を後から差し込む。解析の失敗・時間切れ・モデルが使えない場合は、ダイアログの欄にその旨を表示するだけにする（`dialogTypoFailed`・`dialogTypoNotReady`）。

## 作業の進め方

- **変更後は `npm run lint`・`npm run typecheck`・`npm test` を実行し、すべて通過したことを確認してから完了とする。**
- 未実装の関数は `throw new Error('Not implemented: <関数名>')` としておき、黙って成功したように振る舞わせない。
- コミットメッセージは Conventional Commits 形式（`feat:` `fix:` `chore:` `docs:` `test:` `refactor:`）で書く。
