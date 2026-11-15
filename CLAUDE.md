# CLAUDE.md

このファイルは、Claude Code がこのリポジトリで作業するときの前提・ルールをまとめたものです。作業の前に必ず読んでください。

## プロジェクト概要

- Gmail 誤送信防止の Chrome 拡張機能（Manifest V3）。対象は PC 版 Chrome 上の Gmail（mail.google.com）。
- 目的：送信前に宛先（To / Cc / Bcc）・本文・添付を確認させ、添付漏れ、宛名と宛先の不一致、誤字脱字などを検知して誤送信をなくす。
- 要件は **docs/requirements.md** を参照する。要件に書かれていない仕様を推測で決めず、不明点は相談する。
- 配布：Chrome Web Store で一般公開、GitHub でソース公開（MIT ライセンス）。
- 前提：Gmail API は使わない。外部への通信はしない。データは端末内にのみ保存する。

### 開発フェーズ

| フェーズ  | 内容                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------ |
| フェーズ1 | 送信の捕捉、確認ダイアログ、社内・要注意・確認省略の指定、添付漏れ、プレースホルダー、日付と曜日の照合 |
| フェーズ2 | 連絡先・会社台帳、宛名照合、Cc 漏れ、初めて送るドメイン                                                |
| フェーズ3 | 誤字辞書、AI 校正                                                                                      |

現在のフェーズ以外の機能・ファイル（例：フェーズ2の `src/popup/`、連絡先台帳、`src/gmail/message.ts` など）は、指示があるまで作らない。

### 技術スタック

- TypeScript（strict）
- ビルド：esbuild（`scripts/build.mjs`。各エントリを IIFE 形式で `dist/` に出力し、`public/` の中身をコピー）
- テスト：Vitest（DOM のテストは jsdom）
- 品質：ESLint（typescript-eslint）＋ Prettier
- パッケージ管理：npm、Node.js 22 以上（依存パッケージの都合で 22.13 以降）
- TypeScript は 6.0 系に固定している（typescript-eslint が TypeScript 7 に未対応のため）。typescript-eslint が対応したら 7 系への更新を検討する
- 実行時に使う外部ライブラリはゼロ（`devDependencies` のみ）

## コマンド

| コマンド             | 内容                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `npm run build`      | 本番ビルド。`dist/` を作り直し、`content.js` / `background.js` / `options.js` と静的ファイルを出力 |
| `npm run dev`        | 監視ビルド（`--watch`）。ソース変更のたびに再ビルドする                                            |
| `npm test`           | `vitest run`。テストを1回実行する                                                                  |
| `npm run test:watch` | `vitest`。変更を監視してテストを再実行する                                                         |
| `npm run lint`       | `eslint .`。禁止事項（外部通信・eval・core の DOM 依存など）の一部も検出する                       |
| `npm run typecheck`  | `tsc --noEmit`。型チェックのみ（出力なし）                                                         |
| `npm run format`     | `prettier --write .`。全ファイルを整形する                                                         |
| `npm run package`    | ビルド後、`dist/` を zip 化して `release/gmail-send-guard-v<version>.zip` に出力                   |

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
- DOM を扱うテストは、テストファイルの先頭に `// @vitest-environment jsdom` を書いて jsdom で実行する。Gmail の HTML の断片は `tests/fixtures/gmail/` に置く。

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

## 作業の進め方

- **変更後は `npm run lint`・`npm run typecheck`・`npm test` を実行し、すべて通過したことを確認してから完了とする。**
- 未実装の関数は `throw new Error('Not implemented: <関数名>')` としておき、黙って成功したように振る舞わせない。
- コミットメッセージは Conventional Commits 形式（`feat:` `fix:` `chore:` `docs:` `test:` `refactor:`）で書く。
