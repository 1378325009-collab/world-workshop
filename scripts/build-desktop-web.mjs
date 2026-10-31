import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepareReleaseExample } from './prepare-release-example.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await prepareReleaseExample();
const desktopRoot = path.join(projectRoot, 'desktop');
const webOutput = path.join(desktopRoot, 'web');
const relativeOutput = path.relative(projectRoot, webOutput);

if (!relativeOutput || relativeOutput === '..' || relativeOutput.startsWith(`..${path.sep}`) || path.isAbsolute(relativeOutput)) {
  throw new Error('Desktop web output must stay inside the World Workshop project.');
}

const bundledPaths = [
  'index.html',
  'app.js',
  'default-world.js',
  'archive.js',
  'docs',
  'style.css',
  'mobile-pwa.css',
  'design-polish.css',
  'manifest.json',
  'sw.js',
  'assets',
  'vendor',
  '模板'
];

if (existsSync(webOutput)) rmSync(webOutput, { recursive: true, force: true });
mkdirSync(webOutput, { recursive: true });

for (const relativePath of bundledPaths) {
  const source = path.join(projectRoot, relativePath);
  if (!existsSync(source)) throw new Error(`Required app asset is missing: ${relativePath}`);
  cpSync(source, path.join(webOutput, relativePath), { recursive: true, force: true });
}

const iconSource = path.join(projectRoot, 'assets', 'pwa', 'icon-256.png');
const iconOutput = path.join(desktopRoot, 'icon.ico');
const png = readFileSync(iconSource);
if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
  throw new Error('The desktop icon source is not a PNG image.');
}

const width = png.readUInt32BE(16);
const height = png.readUInt32BE(20);
if (!width || !height || width > 256 || height > 256) {
  throw new Error('The desktop icon PNG must be between 1 and 256 pixels in each dimension.');
}

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);

const entry = Buffer.alloc(16);
entry[0] = width === 256 ? 0 : width;
entry[1] = height === 256 ? 0 : height;
entry[2] = 0;
entry[3] = 0;
entry.writeUInt16LE(1, 4);
entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(png.length, 8);
entry.writeUInt32LE(header.length + entry.length, 12);
writeFileSync(iconOutput, Buffer.concat([header, entry, png]));

console.log(`Prepared Windows desktop resources in ${path.relative(projectRoot, desktopRoot)}.`);
