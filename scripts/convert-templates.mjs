import { readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const archive = require('../archive.js');
const folderArgument = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const folder = folderArgument ? path.resolve(folderArgument) : path.join(root, '模板');
const removeOriginals = process.argv.includes('--remove-originals');
let count = 0;
for (const name of (await readdir(folder)).filter((name) => name.endsWith('.json'))) {
  const original = JSON.parse(await readFile(path.join(folder, name), 'utf8'));
  const selection = archive.select(original, { kind: 'world' });
  const result = await archive.pack(selection);
  const destination = path.join(folder, name.replace(/\.json$/, '.zip'));
  await writeFile(destination, result.bytes);
  // Read the saved artifact before replacing its original template.
  const restored = await archive.read(await readFile(destination));
  const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).filter((key) => key !== 'exportedAt').sort().map((key) => [key, stable(value[key])])) : value;
  const defaults = { typeGroups: [], typeDefinitions: [], relations: [], relationTypes: [], events: [], maps: [], relationGraphs: [], scripts: [], schemaVersion: 1 };
  if (JSON.stringify(stable({ ...defaults, ...original })) !== JSON.stringify(stable(restored.world))) throw new Error('Conversion did not preserve the original archive: ' + name);
  if (removeOriginals) await unlink(path.join(folder, name));
  console.log(name + ' → ' + path.basename(destination) + ' (' + original.entries.length + ' entries)');
  count++;
}
console.log('Converted ' + count + ' templates.');
