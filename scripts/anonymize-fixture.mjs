// Gmail の HTML（DevTools でコピーしたもの）を匿名化して、テスト用フィクスチャにする。
//
//   node scripts/anonymize-fixture.mjs            raw/ の HTML をすべて匿名化して検査する
//   node scripts/anonymize-fixture.mjs <ファイル>  指定した raw/ のファイルだけ匿名化して検査する
//   node scripts/anonymize-fixture.mjs --check    匿名化済みのフィクスチャをすべて検査する（書き換えない）
//   node scripts/anonymize-fixture.mjs --save <画面>[--<状態>...] [--lang en] [--force]
//                                                 クリップボードの HTML を raw/ に保存し、続けて匿名化して検査する
//                                                 （ファイル名の言語は ja、採取日は今日の日付になる）
//
// 入力：tests/fixtures/gmail/raw/*.html（.gitignore 済み。コミットされない）
// 出力：tests/fixtures/gmail/<同じファイル名>
// 検査で置き換え漏れが見つかった場合は、終了コード 1 で終わる。
//
// 手順とファイル名の決まりは tests/fixtures/gmail/README.md、処理の中身は scripts/lib/anonymize-fixture.mjs。

import { execFileSync } from 'node:child_process';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  anonymizeFixtureHtml,
  checkFixtureHtml,
  parseDenylist,
  parseFixtureFileName,
} from './lib/anonymize-fixture.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = path.join(rootDir, 'tests', 'fixtures', 'gmail');
const rawDir = path.join(fixtureDir, 'raw');
const denylistPath = path.join(rawDir, 'denylist.txt');

/** ディレクトリ直下の .html のファイル名を列挙する（ディレクトリが無ければ空） */
async function listHtml(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }
}

/**
 * テキストファイルを読む。UTF-8 のほか、Windows PowerShell の `>` が出力する UTF-16LE（BOM 付き）にも対応する
 */
async function readText(filePath) {
  const buffer = await readFile(filePath);
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString('utf16le');
  return buffer.toString('utf8');
}

/** raw/denylist.txt を読む（無ければ null） */
async function loadDenylist() {
  try {
    return parseDenylist(await readText(denylistPath));
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** 検査結果を表示し、問題の件数を返す */
function report(fileName, nameResult, findings) {
  const problems = [];
  if (!nameResult.ok) problems.push(`ファイル名：${nameResult.reason}`);
  for (const finding of findings) {
    problems.push(`[${finding.kind}] ${finding.location}：${finding.value}`);
  }
  if (problems.length === 0) {
    console.log(`  OK  ${fileName}`);
    return 0;
  }
  console.error(`  NG  ${fileName}（${String(problems.length)} 件）`);
  for (const problem of problems.slice(0, 30)) console.error(`        ${problem}`);
  if (problems.length > 30) console.error(`        …ほか ${String(problems.length - 30)} 件`);
  return problems.length;
}

/** クリップボードの文字列を読む */
function readClipboard() {
  if (process.platform === 'win32') {
    // 出力の文字コードを UTF-8 に固定する（既定のままだと日本語が化ける）
    return execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Clipboard -Raw',
      ],
      { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
    );
  }
  if (process.platform === 'darwin') {
    return execFileSync('pbpaste', { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  }
  throw new Error('この OS ではクリップボードを読めません。raw/ に手で保存してください。');
}

/**
 * クリップボードの HTML を raw/ に保存する。保存したファイル名を返す（保存しなかった場合は null）。
 * コマンドをコピーして貼り付ける必要がないので、クリップボードの HTML を上書きしてしまう失敗が起きない。
 */
async function saveFromClipboard(name, lang, force) {
  const now = new Date();
  const date =
    String(now.getFullYear()) +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  const fileName = `${name}.${lang}.${date}.html`;
  const nameResult = parseFixtureFileName(fileName);
  if (!nameResult.ok) {
    console.error(`保存しませんでした：${nameResult.reason}`);
    return null;
  }
  const html = readClipboard();
  if (!/<[a-z][^>]*>/i.test(html)) {
    console.error(
      '保存しませんでした：クリップボードの内容が HTML ではありません。\n' +
        'DevTools の Console で copy($0.outerHTML) を実行した直後に、ほかのものをコピーせずに実行してください。',
    );
    return null;
  }
  const rawPath = path.join(rawDir, fileName);
  if (!force) {
    try {
      await access(rawPath);
      console.error(
        `保存しませんでした：raw/${fileName} がすでにあります。上書きする場合は --force を付けてください。`,
      );
      return null;
    } catch {
      // ファイルが無ければ、そのまま保存する
    }
  }
  await mkdir(rawDir, { recursive: true });
  await writeFile(rawPath, html, 'utf8');
  console.log(`保存：raw/${fileName}（${String(html.length)} 文字）`);
  return fileName;
}

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  const langIndex = args.indexOf('--lang');
  const lang = langIndex === -1 ? 'ja' : (args[langIndex + 1] ?? '');
  const positional = args.filter(
    (arg, index) => !arg.startsWith('--') && (langIndex === -1 || index !== langIndex + 1),
  );
  let targets = positional.map((arg) => path.basename(arg));

  if (args.includes('--save')) {
    if (positional.length !== 1) {
      console.error(
        '使い方：npm run fixtures:save <画面>[--<状態>...]（例：compose-new--attachment）',
      );
      process.exitCode = 1;
      return;
    }
    const saved = await saveFromClipboard(positional[0], lang, args.includes('--force'));
    if (saved === null) {
      process.exitCode = 1;
      return;
    }
    targets = [saved];
  }

  const denylist = await loadDenylist();
  if (denylist === null) {
    console.warn(
      '注意：tests/fixtures/gmail/raw/denylist.txt がありません。自分の氏名・会社名などを1行1語で書いておくと、\n' +
        '      それらの語が残っていないかも検査します（README.md 参照）。',
    );
  }
  const options = { denylist: denylist ?? [] };
  let problemCount = 0;

  if (checkOnly) {
    const files = await listHtml(fixtureDir);
    console.log(`匿名化済みフィクスチャの検査（${String(files.length)} 件）`);
    for (const fileName of files) {
      const html = await readText(path.join(fixtureDir, fileName));
      problemCount += report(
        fileName,
        parseFixtureFileName(fileName),
        checkFixtureHtml(html, options),
      );
    }
  } else {
    const files = targets.length > 0 ? targets : await listHtml(rawDir);
    if (files.length === 0) {
      console.log(
        'tests/fixtures/gmail/raw/ に .html がありません。README.md の手順で採取してください。',
      );
      return;
    }
    console.log(`匿名化（${String(files.length)} 件）`);
    for (const fileName of files) {
      const nameResult = parseFixtureFileName(fileName);
      if (!nameResult.ok) {
        // 名前が決まりに合わないファイルは出力しない（誤った名前のままコミットされるのを防ぐ）
        problemCount += report(fileName, nameResult, []);
        continue;
      }
      const raw = await readText(path.join(rawDir, fileName));
      if (!/<[a-z][^>]*>/i.test(raw)) {
        // クリップボードが別の内容（コピーしたコマンドなど）に置き換わっていた場合に気づけるようにする
        console.error(`  NG  ${fileName}`);
        console.error(
          '        HTML の要素が1つもありません。クリップボードの内容が HTML ではなかった可能性があります。',
        );
        problemCount += 1;
        continue;
      }
      const result = anonymizeFixtureHtml(raw);
      const findings = checkFixtureHtml(result.html, options);
      if (findings.length === 0) {
        await writeFile(path.join(fixtureDir, fileName), result.html, 'utf8');
      }
      const count = report(fileName, nameResult, findings);
      problemCount += count;
      if (count === 0) {
        console.log(
          `        置き換え ${String(result.changes.length)} 箇所／アドレス ${String(result.addressCount)} 件／ドメイン ${String(result.domainCount)} 件`,
        );
      } else {
        console.error('        置き換え漏れがあるため、出力していません。');
      }
    }
  }

  if (problemCount > 0) {
    console.error(`\n問題が ${String(problemCount)} 件あります。`);
    process.exitCode = 1;
  } else {
    console.log('\n問題はありません。コミット前に、出力されたファイルを目でも確認してください。');
  }
}

await main();
