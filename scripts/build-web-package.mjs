import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepareReleaseExample } from './prepare-release-example.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await prepareReleaseExample();
const outputRoot = path.join(projectRoot, 'release', 'web-windows-x64');
const webRoot = path.join(outputRoot, 'web');
const relativeOutput = path.relative(projectRoot, outputRoot);

if (!relativeOutput.startsWith(`release${path.sep}`) || path.isAbsolute(relativeOutput)) {
  throw new Error('Web package output must stay inside the release directory.');
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

if (existsSync(outputRoot)) rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(webRoot, { recursive: true });

for (const relativePath of bundledPaths) {
  const source = path.join(projectRoot, relativePath);
  if (!existsSync(source)) throw new Error(`Required app asset is missing: ${relativePath}`);
  cpSync(source, path.join(webRoot, relativePath), { recursive: true, force: true });
}

const templateRoot = path.join(projectRoot, '模板');
cpSync(templateRoot, path.join(outputRoot, '模板'), { recursive: true, force: true });
cpSync(path.join(projectRoot, 'docs'), path.join(outputRoot, 'docs'), { recursive: true, force: true });

const supportFiles = [
  ['scripts/start-web-package.bat', '启动世界工坊.bat'],
  ['scripts/start-web-package.ps1', 'start-server.ps1'],
  ['scripts/web-package-server.cs', 'web-server.cs'],
  ['scripts/local-lifecycle.js', 'web/local-lifecycle.js']
];

for (const [sourcePath, outputPath] of supportFiles) {
  const source = path.join(projectRoot, sourcePath);
  const destination = path.join(outputRoot, outputPath);
  if (sourcePath.endsWith('.bat')) {
    const batchText = readFileSync(source, 'ascii').replace(/\r?\n/g, '\r\n');
    writeFileSync(destination, batchText, 'ascii');
  } else if (sourcePath.endsWith('.ps1') || sourcePath.endsWith('.cs')) {
    const scriptText = readFileSync(source, 'utf8').replace(/^\uFEFF/, '');
    writeFileSync(destination, `\uFEFF${scriptText}`, 'utf8');
  } else {
    cpSync(source, destination);
  }
}

const packagedIndex = path.join(webRoot, 'index.html');
let packagedHtml = readFileSync(packagedIndex, 'utf8');
if (!packagedHtml.includes('local-lifecycle.js')) {
  const bodyClose = packagedHtml.lastIndexOf('</body>');
  if (bodyClose < 0) throw new Error('Could not inject the local server lifecycle script into index.html.');
  packagedHtml = `${packagedHtml.slice(0, bodyClose)}  <script src="/local-lifecycle.js" defer></script>\n${packagedHtml.slice(bodyClose)}`;
  writeFileSync(packagedIndex, packagedHtml, 'utf8');
}

const packageJson = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const usage = readFileSync(path.join(projectRoot, 'scripts', 'web-package-usage.txt'), 'utf8')
  .replaceAll('{{version}}', packageJson.version);
writeFileSync(path.join(outputRoot, '使用说明.txt'), usage, 'utf8');

console.log(`Prepared Windows web package in ${path.relative(projectRoot, outputRoot)}.`);
