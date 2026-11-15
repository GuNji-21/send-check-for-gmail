// @ts-check
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

/**
 * 外部通信に使えるグローバル。CLAUDE.md の禁止事項をlintで機械的に検出する。
 * @type {{ name: string, message: string }[]}
 */
const networkGlobals = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts'].map(
  (name) => ({
    name,
    message:
      '外部への通信は禁止です（CLAUDE.md「禁止事項」）。必要な場合は事前に相談してください。',
  }),
);

/**
 * src/core/ は DOM にも chrome API にも依存しない純粋な処理にする。
 * @type {{ name: string, message: string }[]}
 */
const environmentGlobals = [
  'window',
  'document',
  'navigator',
  'chrome',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'HTMLElement',
  'Element',
  'Node',
].map((name) => ({
  name,
  message:
    'src/core/ ではDOM・chrome API・ブラウザの保存領域を使わないでください（CLAUDE.md「構成ルール」）。',
}));

/**
 * content script 側で IndexedDB を使うと Gmail の保存領域に入るため禁止。
 * @type {{ name: string, message: string }}
 */
const indexedDbInContent = {
  name: 'indexedDB',
  message:
    'content側で IndexedDB は使えません。background にメッセージ通信で依頼してください（CLAUDE.md「構成ルール」）。',
};

export default defineConfig(
  {
    ignores: ['node_modules/', 'dist/', 'release/', 'coverage/'],
  },

  // TypeScript（型情報を使ったルール）
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },

  // JavaScript（ビルドスクリプト・設定ファイル）
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.recommended],
  },

  // src/ 全体：リモートコード実行・外部通信の禁止
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-eval': 'error',
      'no-new-func': 'error',
      '@typescript-eslint/no-implied-eval': 'error',
      'no-restricted-globals': ['error', ...networkGlobals],
      'no-restricted-properties': [
        'error',
        { object: 'navigator', property: 'sendBeacon', message: '外部への通信は禁止です。' },
      ],
      // Gmail のセレクタは src/gmail/ の中からだけ使う
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/gmail/selectors', '**/gmail/selectors.ts'],
              message:
                'GmailのDOM・セレクタへの依存は src/gmail/ に閉じてください。src/gmail/compose.ts などの関数経由で使います。',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/gmail/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },

  // content script 側（Gmail のページ上で動くコード）：IndexedDB 禁止
  {
    files: ['src/content/**/*.ts', 'src/gmail/**/*.ts', 'src/ui/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', ...networkGlobals, indexedDbInContent],
    },
  },

  // src/core/：純粋な処理のみ
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', ...networkGlobals, ...environmentGlobals],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/gmail/**',
                '**/content/**',
                '**/ui/**',
                '**/background/**',
                '**/storage/**',
                '**/options/**',
                '**/shared/i18n',
                '**/shared/i18n.ts',
              ],
              message:
                'src/core/ はDOMにもchrome APIにも依存しない純粋な処理にしてください（CLAUDE.md「構成ルール」）。',
            },
          ],
        },
      ],
    },
  },
);
