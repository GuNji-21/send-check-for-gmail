// dist/ を zip 化して release/ に出力する（Chrome Web Store へのアップロード用）
//
//   node scripts/package.mjs
//
// 出力：release/send-check-for-gmail-v<version>.zip（version は dist/manifest.json から取得）
// 実行時の外部ライブラリを増やさないため、zip は Node.js 標準の zlib で自前生成する。

import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');
const releaseDir = path.join(rootDir, 'release');

/** ディレクトリ配下のファイルを再帰的に列挙する（zip 内パスは / 区切り） */
async function listFiles(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath, base)));
    } else if (entry.isFile()) {
      files.push({ fullPath, zipPath: path.relative(base, fullPath).split(path.sep).join('/') });
    }
  }
  return files.sort((a, b) => a.zipPath.localeCompare(b.zipPath));
}

/** Date を MS-DOS 形式の日付・時刻に変換する */
function toDosDateTime(date) {
  const time =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/** ファイル一覧から zip（deflate 圧縮）のバイナリを作る */
async function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const data = await readFile(file.fullPath);
    const { mtime } = await stat(file.fullPath);
    const { time, day } = toDosDateTime(mtime);
    const compressed = deflateRawSync(data, { level: 9 });
    const name = Buffer.from(file.zipPath, 'utf8');
    const checksum = crc32(data);
    const flags = 0x0800; // ファイル名を UTF-8 として扱う

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed to extract
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed to extract
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra field length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE(0, 38); // external attributes
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + compressed.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

const manifestPath = path.join(distDir, 'manifest.json');
let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch {
  console.error(
    '[package] dist/manifest.json が見つかりません。先に npm run build を実行してください。',
  );
  process.exit(1);
}

const files = await listFiles(distDir);
const zip = await createZip(files);

await mkdir(releaseDir, { recursive: true });
const outPath = path.join(releaseDir, `send-check-for-gmail-v${manifest.version}.zip`);
await writeFile(outPath, zip);

console.log(
  `[package] ${path.relative(rootDir, outPath)} (${files.length} files, ${(zip.length / 1024).toFixed(1)} KB)`,
);
