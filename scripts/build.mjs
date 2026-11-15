// 拡張機能のビルドスクリプト
//
//   node scripts/build.mjs          本番ビルド（dist/ を作り直す）
//   node scripts/build.mjs --watch  監視ビルド（ソース変更のたびに再ビルド）
//
// - 各エントリを IIFE 形式で dist/ に出力する（content script / service worker は ES Modules を前提にしない）
// - public/ の中身と src/options/options.html を dist/ にコピーする
// - 外部へのリモートコード読み込みが混入しないよう、バンドルはすべてローカルで完結させる

import { context, build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');
const publicDir = path.join(rootDir, 'public');

const watch = process.argv.includes('--watch');

/** エントリポイント（出力名 → ソース）。manifest.json のファイル名と一致させること。 */
const entryPoints = {
  content: 'src/content/index.ts',
  background: 'src/background/service-worker.ts',
  options: 'src/options/options.ts',
};

/** dist/ にそのままコピーする静的ファイル（コピー元 → dist/ からの相対パス） */
const staticFiles = [{ from: 'src/options/options.html', to: 'options.html' }];

async function copyStaticFiles() {
  await cp(publicDir, distDir, { recursive: true });
  for (const file of staticFiles) {
    await cp(path.join(rootDir, file.from), path.join(distDir, file.to));
  }
}

/** ビルドのたびに静的ファイルをコピーし直す esbuild プラグイン */
const copyStaticPlugin = {
  name: 'copy-static',
  setup(pluginBuild) {
    pluginBuild.onEnd(async (result) => {
      if (result.errors.length > 0) return;
      await copyStaticFiles();
      if (watch) {
        console.log(`[build] rebuilt at ${new Date().toLocaleTimeString()}`);
      }
    });
  },
};

/** @type {import('esbuild').BuildOptions} */
const options = {
  absWorkingDir: rootDir,
  entryPoints,
  outdir: distDir,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120'],
  charset: 'utf8',
  legalComments: 'none',
  // ストア審査で読みやすいよう本番も minify しない
  minify: false,
  sourcemap: watch ? 'inline' : false,
  logLevel: 'info',
  plugins: [copyStaticPlugin],
};

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('[build] watching for changes... (Ctrl+C で終了)');
  console.log('[build] public/ や options.html の変更は、次のソース変更時に反映されます');
} else {
  await build(options);
}
