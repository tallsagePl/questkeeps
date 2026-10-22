import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from '@babel/parser';
import prettier from 'prettier';

const roots = ['app', 'components', 'lib', 'scripts', 'tests', 'e2e'];

const check = process.argv.includes('--check');

const config = await prettier.resolveConfig(
  path.join(process.cwd(), 'package.json'),
);

function syntax(source, file) {
  return parse(source, {
    sourceType: 'module',
    plugins: file.endsWith('.mjs') ? [] : ['typescript', 'jsx'],
  });
}

function edit(source, edits) {
  return edits
    .sort((a, b) => b.start - a.start)
    .reduce(
      (text, change) =>
        text.slice(0, change.start) + change.text + text.slice(change.end),
      source,
    );
}

function splitDeclarations(source, file) {
  const edits = [];
  function visit(node, parent) {
    if (!node || typeof node !== 'object') return;
    if (
      node.type === 'VariableDeclaration' &&
      node.declarations.length > 1 &&
      [
        'Program',
        'BlockStatement',
        'SwitchCase',
        'ExportNamedDeclaration',
      ].includes(parent?.type)
    ) {
      const prefix = parent.type === 'ExportNamedDeclaration' ? 'export ' : '';
      for (let index = 1; index < node.declarations.length; index++) {
        const start = node.declarations[index - 1].end;
        const end = node.declarations[index].start;
        // Leave declarations with comments between them untouched.
        if (/^\s*,\s*$/.test(source.slice(start, end))) {
          edits.push({ start, end, text: ';\n' + prefix + node.kind + ' ' });
        }
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (
        [
          'comments',
          'leadingComments',
          'trailingComments',
          'loc',
          'tokens',
        ].includes(key)
      )
        continue;
      if (Array.isArray(value)) value.forEach((child) => visit(child, node));
      else if (value && typeof value === 'object') visit(value, node);
    }
  }
  visit(syntax(source, file).program, null);
  return edit(source, edits);
}

function groupImports(source, file) {
  const program = syntax(source, file).program;
  const imports = program.body.filter(
    (node) => node.type === 'ImportDeclaration',
  );
  if (!imports.length) return source;
  const last = imports.at(-1);
  if (
    !program.body.some(
      (node) => node.type !== 'ImportDeclaration' && node.start < last.start,
    )
  )
    return source;
  const position =
    program.directives.at(-1)?.end ?? program.interpreter?.end ?? 0;
  // Preserve import evaluation order, especially side-effect imports.
  return edit(source, [
    ...imports.map((node) => ({ start: node.start, end: node.end, text: '' })),
    {
      start: position,
      end: position,
      text:
        '\n\n' +
        imports.map((node) => source.slice(node.start, node.end)).join('\n') +
        '\n\n',
    },
  ]);
}

function spaceDeclarations(source, file) {
  const program = syntax(source, file).program;
  const edits = [];
  const body = [...program.directives, ...program.body];
  for (let index = 1; index < body.length; index++) {
    const previous = body[index - 1];
    const current = body[index];
    if (
      previous.type === 'ImportDeclaration' &&
      current.type === 'ImportDeclaration'
    )
      continue;
    const start = previous.end;
    const end = current.leadingComments?.[0]?.start ?? current.start;
    if (/^\s*$/.test(source.slice(start, end)))
      edits.push({ start, end, text: '\n\n' });
  }
  return edit(source, edits);
}

async function* files(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* files(file);
    else if (/\.(tsx?|mjs)$/.test(file)) yield file;
  }
}

let changed = 0;

let inspected = 0;

for (const root of roots) {
  for await (const file of files(root)) {
    const original = await fs.readFile(file, 'utf8');
    const readable = spaceDeclarations(
      groupImports(splitDeclarations(original, file), file),
      file,
    );
    const formatted = await prettier.format(readable, {
      ...config,
      filepath: file,
    });
    inspected++;
    if (formatted === original) continue;
    changed++;
    if (check) console.error(file);
    else await fs.writeFile(file, formatted);
  }
}

console.log(
  `${inspected} source files checked; ${changed} ${check ? 'need formatting' : 'formatted'}.`,
);

if (check && changed) process.exitCode = 1;
