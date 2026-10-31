import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webOutput = path.resolve(projectRoot, 'dist');
if (!webOutput.startsWith(`${projectRoot}${path.sep}`)) {
  throw new Error('Android web output must stay inside the World Workshop project.');
}

const bundledPaths = [
  'index.html',
  'app.js',
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

mkdirSync(webOutput, { recursive: true });
for (const relativePath of bundledPaths) {
  const source = path.join(projectRoot, relativePath);
  if (!existsSync(source)) throw new Error(`Required app asset is missing: ${relativePath}`);
  const destination = path.join(webOutput, relativePath);
  if (relativePath === '模板' && existsSync(destination)) rmSync(destination, { recursive: true, force: true });
  cpSync(source, destination, { recursive: true, force: true });
}

const indexPath = path.join(webOutput, 'index.html');
const indexHtml = readFileSync(indexPath, 'utf8');
const appScript = '<script src="app.js?';
if (!indexHtml.includes(appScript)) throw new Error('Could not find the app script tag in index.html.');
writeFileSync(indexPath, indexHtml.replace(appScript, '<script src="native-adapter.js" defer></script>\n  ' + appScript), 'utf8');

console.log(`Prepared Android web assets in ${path.relative(projectRoot, webOutput)}.`);
