// Sweep shape audit. Answers two questions with numbers:
//   1. How many effects hand-copy the cancelled-guard block?
//   2. How many of those bodies are identical enough that one helper would fit?
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/genAI/jsk-app/frontend';
const files = process.argv.slice(2);

function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function effectBodies(src) {
  const out = [];
  const re = /(?:React\.)?useEffect\(\s*\(\s*\)\s*=>\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
    }
    out.push({
      body: src.slice(start, i - 1),
      line: src.slice(0, m.index).split('\n').length,
    });
  }
  return out;
}

// Collapse whitespace and semicolons so formatting differences do not count.
const norm = (s) => s.replace(/\s+/g, ' ').replace(/;\s*/g, ' ').replace(/\s+/g, ' ').trim();

const shapes = new Map();
let total = 0;
let guarded = 0;

for (const rel of files) {
  let src;
  try {
    src = stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  } catch {
    continue;
  }
  for (const eff of effectBodies(src)) {
    total++;
    if (!/cancelled\s*=\s*true/.test(eff.body)) continue;
    guarded++;
    const n = norm(eff.body);
    if (!shapes.has(n)) shapes.set(n, []);
    shapes.get(n).push(`${rel}:${eff.line}`);
  }
}

// Group by "await X() then if (cancelled) return" core.
const core = /const run = async \(\) => \{ await (\w+)\(\) if \(cancelled\) return \}/;
let coreMatches = 0;
for (const [shape, where] of shapes) {
  if (core.test(shape)) coreMatches += where.length;
}

console.log(`effects scanned: ${total}`);
console.log(`effects with a cancelled guard: ${guarded}`);
console.log(`distinct normalised bodies among them: ${shapes.size}`);
console.log(`matching the canonical core (await X(); if (cancelled) return): ${coreMatches}`);
console.log('');
const repeated = [...shapes.entries()].filter(([, w]) => w.length > 1).sort((a, b) => b[1].length - a[1].length);
console.log(`bodies appearing more than once verbatim: ${repeated.length}`);
for (const [shape, where] of repeated.slice(0, 5)) {
  console.log(`  ${where.length}x  ${shape.slice(0, 110)}...`);
  console.log(`        ${where.join(', ')}`);
}