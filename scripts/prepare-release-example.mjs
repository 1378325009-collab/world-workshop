import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const archive = require('../archive.js');

export async function prepareReleaseExample() {
  const configuration = JSON.parse(readFileSync(path.join(root, 'release-example.json'), 'utf8'));
  const templateRoot = path.join(root, '模板');
  const template = path.resolve(root, configuration.template);
  const relative = path.relative(templateRoot, template);
  if (!relative || path.isAbsolute(relative) || relative.startsWith('..') || path.extname(template) !== '.zip') {
    throw new Error('发布示例必须选自模板目录中的 ZIP。');
  }
  const payload = await archive.read(readFileSync(template));
  if (payload.scope.kind !== 'world') throw new Error('发布示例必须是完整世界模板。');
  const document = JSON.stringify(payload.world, null, 2)
    .replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const output = path.join(root, 'default-world.js');
  const source = '// Generated from the public template in release-example.json. Do not edit directly.\n'
    + 'globalThis.WorldWorkshopDefaultWorld = ' + document + ';\n';
  if (!existsSync(output) || readFileSync(output, 'utf8') !== source) writeFileSync(output, source, 'utf8');
  return payload.world.project.name;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('Prepared public release example: ' + await prepareReleaseExample());
}
