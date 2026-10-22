import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
if (!process.argv[2])
  throw Error('Supply an output directory outside the repository');
const output = resolve(process.argv[2]);
const outputRelative = relative(root, output);
if (
  !outputRelative ||
  (!outputRelative.startsWith('..') && !isAbsolute(outputRelative))
)
  throw Error('Output must be outside the repository');
mkdirSync(output, { recursive: true });
const files = execFileSync(
  'git',
  [
    '--git-dir=' + join(root, '.git'),
    '--work-tree=' + root,
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '-z',
  ],
  { cwd: root, encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
for (const name of files) {
  if (
    /[\r\n]/.test(name) ||
    name.startsWith('-') ||
    /(^|\/)\.\.(\/|$)/.test(name) ||
    /^(?:data|node_modules|\.git|\.next(?:-e2e)?)(?:\/|$)/.test(name) ||
    (/(^|\/)\.env[^/]*$/.test(name) && name !== '.env.example') ||
    /\.(?:sqlite(?:-wal|-shm)?|pem|key|log)$/i.test(name)
  )
    throw Error('Unexpected private or unsafe source path: ' + name);
}
for (const required of [
  'package-lock.json',
  'lib/data/place-names.json',
  'lib/data/place-name-overrides.json',
  'deploy/questkeeps.service',
]) {
  if (!files.includes(required) || !existsSync(join(root, required)))
    throw Error('Required deployment source is missing: ' + required);
}
const list = join(output, 'questkeeps-source-files.txt');
const archive = join(output, 'questkeeps-source.tar.gz');
writeFileSync(list, files.join('\n') + '\n');
execFileSync('tar', ['-czf', archive, '-T', list], {
  cwd: root,
  stdio: 'pipe',
});
console.log(
  JSON.stringify({
    files: files.length,
    archive,
    bytes: statSync(archive).size,
  }),
);
