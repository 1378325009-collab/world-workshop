import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidRoot = path.join(projectRoot, 'android');
const localPropertiesPath = path.join(androidRoot, 'local.properties');

function localPropertiesSdkPath() {
  if (!existsSync(localPropertiesPath)) return '';
  const contents = readFileSync(localPropertiesPath, 'utf8');
  const line = contents.split(/\r?\n/).find((item) => /^\s*sdk\.dir\s*=/.test(item));
  if (!line) return '';
  return line.replace(/^\s*sdk\.dir\s*=\s*/, '').replace(/\\:/g, ':').replace(/\\\\/g, '\\');
}

const candidates = [
  process.env.ANDROID_HOME,
  process.env.ANDROID_SDK_ROOT,
  localPropertiesSdkPath(),
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : ''
].filter(Boolean);

const sdkRoot = candidates.find((candidate) => existsSync(path.join(candidate, 'platforms', 'android-36', 'android.jar')));
if (!sdkRoot) {
  const locations = candidates.length ? candidates.join('\n  ') : '(未设置 ANDROID_HOME / ANDROID_SDK_ROOT)';
  console.error(`找不到 Android SDK Platform 36。请在 Android Studio 的 SDK Manager 中安装 Platform 36 和 Build Tools，然后设置 ANDROID_HOME。\n已检查：\n  ${locations}`);
  process.exitCode = 1;
} else {
  if (!existsSync(localPropertiesPath)) {
    const escapedPath = path.resolve(sdkRoot).replace(/\\/g, '/');
    writeFileSync(localPropertiesPath, `sdk.dir=${escapedPath}\n`, 'utf8');
  }
  console.log(`Using Android SDK: ${path.resolve(sdkRoot)}`);
}
