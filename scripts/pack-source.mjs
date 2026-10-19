import { createHash } from 'node:crypto';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = join(root, 'dist');
const manifestPath = join(root, 'extension', 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

const files = [];

async function walk(directory) {
  const items = await readdir(directory, { withFileTypes: true });
  for (const item of items.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    if (item.name === '__pycache__' || item.name === 'node_modules' || item.name === '.git') continue;
    const absolute = join(directory, item.name);
    if (item.isDirectory()) await walk(absolute);
    else if (item.isFile()) files.push(absolute);
  }
}

for (const folder of ['extension', 'tests', 'scripts']) {
  await walk(join(root, folder));
}

const individualFiles = [
  '.gitignore', '.gitattributes', 'README.md', 'CHANGELOG.md', 'LICENSE', 'package.json', 'package-lock.json',
  '.github/workflows/ci.yml',
  'submission/privacy-policy.txt', 'submission/reviewer-notes.txt',
  'submission/validation.md', 'submission/firefox-results.json', 'submission/listing.json', 'submission/pack-source.py',
  'submission/icon.png', 'submission/popup-ru.png'
];

for (const name of individualFiles) {
  const p = join(root, ...name.split('/'));
  try {
    const stat = await readFile(p);
    files.push(p);
  } catch {}
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) { const b = Buffer.alloc(2); b.writeUInt16LE(value); return b; }
function u32(value) { const b = Buffer.alloc(4); b.writeUInt32LE(value >>> 0); return b; }

function makeZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const compressed = deflateRawSync(entry.data, { level: 9 });
    const crc = crc32(entry.data);
    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(8), u16(0), u16(0x21),
      u32(crc), u32(compressed.length), u32(entry.data.length), u16(name.length), u16(0), name, compressed
    ]);
    const central = Buffer.concat([
      u32(0x02014b50), u16(0x0314), u16(20), u16(0x0800), u16(8), u16(0), u16(0x21),
      u32(crc), u32(compressed.length), u32(entry.data.length), u16(name.length), u16(0), u16(0),
      u16(0), u16(0), u32(0x81a40000), u32(offset), name
    ]);
    localParts.push(local);
    centralParts.push(central);
    offset += local.length;
  }
  const central = Buffer.concat(centralParts);
  const end = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(central.length), u32(offset), u16(0)
  ]);
  return Buffer.concat([...localParts, central, end]);
}

const uniqueFiles = [...new Set(files)].sort((a, b) => relative(root, a).localeCompare(relative(root, b), 'en'));
const entries = await Promise.all(uniqueFiles.map(async path => ({
  name: relative(root, path).split(sep).join('/'),
  data: await readFile(path)
})));

const archive = makeZip(entries);
await mkdir(output, { recursive: true });
const target = join(output, `kick-vod-chat-fix-${manifest.version}-source.zip`);
await writeFile(target, archive);
const digest = createHash('sha256').update(archive).digest('hex');
await writeFile(`${target}.sha256`, `${digest}  ${basename(target)}\n`, 'utf8');
console.log(`${basename(target)} ${archive.length} bytes sha256 ${digest} (${entries.length} files)`);
