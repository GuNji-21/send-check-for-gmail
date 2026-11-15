import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // 既定は node 環境（src/core/ の純粋な処理向け）。
    // DOM を扱うテストはファイル先頭に `// @vitest-environment jsdom` を書いて jsdom で実行する。
    environment: 'node',
    // 初期構成ではテストファイルが無いため、0件でも失敗扱いにしない。
    passWithNoTests: true,
    restoreMocks: true,
  },
});
