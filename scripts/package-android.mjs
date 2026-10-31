import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const buildRoot = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug');
const metadata = JSON.parse(readFileSync(path.join(buildRoot, 'output-metadata.json'), 'utf8'));
const artifact = metadata.elements.find((item) => item.type === 'SINGLE');
if (!artifact || artifact.versionName !== version) {
  throw new Error('Android 构建版本与 package.json 不一致，请先重新构建。');
}
mkdirSync(path.join(root, 'release'), { recursive: true });
const destination = path.join(root, 'release', `世界工坊-${version}-Android.apk`);
copyFileSync(path.join(buildRoot, artifact.outputFile), destination);
console.log(`Packaged Android ${version} (build ${artifact.versionCode}): ${destination}`);
