## 概要 / Summary

<!-- 何を・なぜ変更したか / What changed and why -->

## 関連 Issue / Related issues

<!-- 例: Closes #123 -->

## 確認事項 / Checklist

- [ ] `npm run lint` / `npm run typecheck` / `npm test` / `npm run build` が通る
- [ ] 検知器を追加・変更した場合、`tests/unit/` にテストを追加した
- [ ] 画面文言は `public/_locales/ja` と `en` の両方に追加した（コードに直接書いていない）
- [ ] Gmail の DOM・セレクタへの依存は `src/gmail/` の中だけにある
- [ ] 外部への通信・リモートコード実行・Gmail API・manifest の権限追加・`dependencies` の追加をしていない
- [ ] テストデータ・コードに実在のメールアドレス・氏名・会社名を書いていない（`example.com` などを使用）
- [ ] エラー時に送信を止め、「チェックできませんでした」と表示する動作を壊していない

## 動作確認 / How it was tested

<!-- Chrome で dist/ を読み込んで確認した内容など -->
