// コミット対象のフィクスチャ（tests/fixtures/gmail/ 直下の .html）の列挙と検査。
// tests/unit/fixtures-anonymized.test.ts から使う（テスト側は Node.js の型定義を持たないため、ここにまとめる）。

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFixtureHtml, parseFixtureFileName } from './anonymize-fixture.mjs';

const fixtureDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../tests/fixtures/gmail',
);

/**
 * フィクスチャのファイル名を列挙する（raw/ は含まない）
 * @returns {string[]}
 */
export function listFixtureFiles() {
  return readdirSync(fixtureDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => entry.name)
    .sort();
}

/**
 * すべてのフィクスチャを検査し、問題を「ファイル名: 内容」の配列で返す（問題が無ければ空配列）。
 * 見つかった値そのものは含めない（テストの出力や CI のログに残さないため）。
 * @returns {string[]}
 */
export function findFixtureProblems() {
  const problems = [];
  for (const name of listFixtureFiles()) {
    const nameResult = parseFixtureFileName(name);
    if (!nameResult.ok) problems.push(`${name}: ファイル名が決まりに合っていません`);
    const html = readFileSync(path.join(fixtureDir, name), 'utf8');
    for (const finding of checkFixtureHtml(html)) {
      problems.push(`${name}: [${finding.kind}] ${finding.location}`);
    }
  }
  return problems;
}
