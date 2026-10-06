import { createHash } from 'node:crypto';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const source = join(root, 'extension');
const output = join(root, 'dist');
const files = [];

async function walk(directory) {
  for (const item of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const absolute = join(directory, item.name);
    if (item.isDirectory()) await walk(absolute);
    else if (item.isFile()) files.push(absolute);
  }
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

await walk(source);
const manifestPath = join(source, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (typeof manifest.version !== 'string' || !/^[0-9][0-9A-Za-z.+-]*$/.test(manifest.version))
  throw new Error('Extension manifest has an invalid version');
const entries = await Promise.all(files.sort((a, b) => relative(source, a).localeCompare(relative(source, b), 'en')).map(async path => ({
  name: relative(source, path).split(sep).join('/'),
  data: await readFile(path)
})));
if (!entries.some(entry => entry.name === 'manifest.json')) throw new Error('Extension manifest missing');
const archive = makeZip(entries);
await mkdir(output, { recursive: true });
const artifact = join(output, `kick-vod-chat-fix-${manifest.version}.xpi`);
await writeFile(artifact, archive);
const digest = createHash('sha256').update(archive).digest('hex');
await writeFile(`${artifact}.sha256`, `${digest}  ${basename(artifact)}\n`, 'utf8');
process.stdout.write(`${basename(artifact)} ${archive.length} bytes sha256 ${digest}\n`);
