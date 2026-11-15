# Gmail 送信前チェック（仮） / Gmail Send Guard

[日本語](#日本語) | [English](#english)

---

## 日本語

### 概要

Gmail の送信前に宛先（To / Cc / Bcc）・本文・添付を確認させ、添付漏れ、宛名と宛先の不一致、誤字脱字などを検知して誤送信を防ぐ Chrome 拡張機能（Manifest V3）です。

- 対象：PC 版 Chrome 上の Gmail（mail.google.com）
- Gmail API は使いません。外部への通信は一切行わず、データは利用者の端末内にのみ保存します。
- 現在は開発初期段階（v0.1.0）です。

### 主な機能（予定）

**フェーズ1**

- 送信操作の捕捉と、送信前の確認ダイアログ
- 宛先の分類（社内・要注意・確認省略の指定）
- 添付漏れの検知（本文に「添付」等があるのにファイルが無い場合など）
- プレースホルダー（「〇〇様」など）の消し忘れの検知
- 日付と曜日の不一致の検知

**フェーズ2**

- 連絡先・会社台帳（送信したことのある相手を画面から蓄積）
- 宛名と宛先の照合
- Cc 漏れの検知
- 初めて送るドメインの警告

**フェーズ3**

- 誤字辞書による検知
- AI 校正

### 開発環境の準備

必要なもの：

- Node.js 22.13 以上（npm 付属）
- Google Chrome

```bash
git clone <リポジトリのURL>
cd gmail-send-guard
npm install
```

### ビルド方法

| コマンド            | 内容                                             |
| ------------------- | ------------------------------------------------ |
| `npm run build`     | 本番ビルド（`dist/` に出力）                     |
| `npm run dev`       | 監視ビルド（ソースを変更するたびに再ビルド）     |
| `npm test`          | テストを実行                                     |
| `npm run lint`      | ESLint による静的チェック                        |
| `npm run typecheck` | TypeScript の型チェック                          |
| `npm run format`    | Prettier でコードを整形                          |
| `npm run package`   | ビルド後、`release/` にストア提出用の zip を出力 |

### Chrome への読み込み方法

1. `npm run build`（または `npm run dev`）を実行して `dist/` を作成する
2. Chrome で `chrome://extensions` を開く
3. 右上の「デベロッパー モード」をオンにする
4. 「パッケージ化されていない拡張機能を読み込む」をクリックし、このリポジトリの `dist/` フォルダを選択する
5. コードを変更して再ビルドしたら、拡張機能一覧の更新ボタンを押し、Gmail のタブを再読み込みする

### ライセンス

[MIT License](LICENSE) © 2026 Tatsuki Gunji

---

## English

### Overview

A Chrome extension (Manifest V3) that prompts you to review recipients (To / Cc / Bcc), body and attachments before sending in Gmail, and detects missing attachments, mismatches between salutations and recipients, typos and more to prevent mis-sends.

- Target: Gmail (mail.google.com) on desktop Chrome
- Does not use the Gmail API. Makes no external network requests; all data stays on your device.
- Currently in early development (v0.1.0).

### Planned features

**Phase 1**

- Intercepting the send action and showing a pre-send confirmation dialog
- Recipient classification (internal, caution, skip confirmation)
- Missing attachment detection
- Leftover placeholder detection
- Date / day-of-week mismatch detection

**Phase 2**

- Contact and company directory (built from people you have sent email to)
- Salutation vs. recipient matching
- Missing Cc detection
- First-time domain warning

**Phase 3**

- Typo dictionary
- AI proofreading

### Development setup

Requirements:

- Node.js 22.13 or later (with npm)
- Google Chrome

```bash
git clone <repository URL>
cd gmail-send-guard
npm install
```

### Build

| Command             | Description                                       |
| ------------------- | ------------------------------------------------- |
| `npm run build`     | Production build (output to `dist/`)              |
| `npm run dev`       | Watch build (rebuilds on every source change)     |
| `npm test`          | Run tests                                         |
| `npm run lint`      | Lint with ESLint                                  |
| `npm run typecheck` | Type-check with TypeScript                        |
| `npm run format`    | Format code with Prettier                         |
| `npm run package`   | Build, then write a store-ready zip to `release/` |

### Loading into Chrome

1. Run `npm run build` (or `npm run dev`) to create `dist/`
2. Open `chrome://extensions` in Chrome
3. Turn on "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the `dist/` folder of this repository
5. After rebuilding, click the reload button on the extension card and reload your Gmail tab

### License

[MIT License](LICENSE) © 2026 Tatsuki Gunji
