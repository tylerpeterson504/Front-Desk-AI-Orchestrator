#!/usr/bin/env node
// Source-corruption guard.
//
// Two corruption classes have hit this repository before:
//
// 1. HARD FAILURE: raw control bytes in source files. A previous incident
//    wrote literal backspace (U+0008) bytes where the regex escape \b was
//    intended, and mid-token line splits broke identifiers across lines.
//    Tabs (09), LF (0A) and CR (0D) are allowed.
// 2. ADVISORY: mid-token line splits such as "mockRep\nository". These are
//    reported as warnings so pre-existing cases surface in CI logs without
//    blocking development; repair them when files are touched.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.cache']);
const SKIP_FILES = /(package-lock\.json|\.snap)$/;
const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.yml', '.yaml', '.md', '.css', '.html', '.sh', '.bat'];
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
// A letter immediately before a newline followed immediately by a lowercase
// letter: words are never hyphenated in this codebase, so this is corruption.
const SPLIT = /[A-Za-z]\n[a-z]/;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...walk(full));
    } else if (!SKIP_FILES.test(entry.name) && EXTS.some((e) => entry.name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

const hard = [];
const soft = [];
const files = walk(ROOT);
for (const f of files) {
  const rel = f.slice(ROOT.length + 1);
  let text;
  try {
    text = readFileSync(f, 'utf8');
  } catch {
    continue;
  }
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const m = line.match(CONTROL);
    if (m) {
      hard.push(rel + ':' + (i + 1) + ' control char U+' + m[0].charCodeAt(0).toString(16).padStart(4, '0'));
    }
  });
  const s = text.match(SPLIT);
  if (s) {
    soft.push(rel + ' mid-token split "' + s[0].replace('\n', '\\n') + '"');
  }
}

for (const h of hard) console.error('CORRUPTION ' + h);
for (const w of soft) console.warn('SUSPECT   ' + w);
console.log('checked ' + files.length + ' files: ' + hard.length + ' hard failures, ' + soft.length + ' suspects');

if (hard.length) {
  console.error('Failing: raw control characters are present in tracked source files.');
  process.exit(1);
}
if (soft.length) {
  console.warn('Advisory: mid-token line splits detected. Repair them when the file is next touched.');
}
