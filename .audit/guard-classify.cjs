// Finds `cancelled` guards that cannot prevent anything.
//
// Live  = the guard appears before at least one statement that can still run
//         after it inside the async body (a write, a throw, another await).
// Dead  = the guard is the last statement of the async body, so by the time it
//         is evaluated the fetcher has already performed every write it makes.
//
// Also reports guards placed BEFORE the first await without any earlier async
// boundary, which can never be true at that point.
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/genAI/jsk-app/frontend';
const files = process.argv.slice(2);

function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function braceBlock(src, openIdx) {
  let depth = 1;
  let i = openIdx + 1;
  for (; i < src.length && depth > 0; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
  }
  return { body: src.slice(openIdx + 1, i - 1), end: i };
}

const dead = [];
const live = [];
const beforeAwait = [];

for (const rel of files) {
  let src;
  try {
    src = stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  } catch {
    continue;
  }

  // Every `const run = async () => { ... }` and `void (async () => { ... })()` body.
  const re = /(const\s+\w+\s*=\s*async\s*\([^)]*\)\s*=>\s*\{)|(void\s*\(\s*async\s*\(\)\s*=>\s*\{)/g;
  let m;
  while ((m = re.exec(src))) {
    const openIdx = src.indexOf('{', m.index + m[0].length - 1);
    const { body } = braceBlock(src, openIdx);
    const line = src.slice(0, m.index).split('\n').length;

    const guardIdx = body.indexOf('cancelled) return');
    if (guardIdx < 0) continue;

    const before = body.slice(0, guardIdx);
    const after = body.slice(guardIdx + 'cancelled) return'.length);

    // Statements after the guard that still do something (ignore closing braces/semicolons).
    const afterStatements = after
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !/^[\}\];]+$/.test(l));

    // Guard placed before any await inside this body.
    const firstAwait = body.indexOf('await ');
    const guardBeforeAwait = firstAwait < 0 || guardIdx < firstAwait;

    const entry = { rel, line, afterCount: afterStatements.length };

    if (guardBeforeAwait) beforeAwait.push(entry);
    else if (afterStatements.length === 0) dead.push(entry);
    else live.push(entry);
  }
}

const fmt = (arr) => arr.map((e) => `  ${e.rel}:${e.line}`).join('\n');

console.log(`guards evaluated: ${dead.length + live.length + beforeAwait.length}`);
console.log(`\nDEAD (guard is the last statement, protects nothing): ${dead.length}`);
console.log(fmt(dead));
console.log(`\nBEFORE-AWAIT (cannot be true at that point): ${beforeAwait.length}`);
console.log(fmt(beforeAwait));
console.log(`\nLIVE (work still runs after the guard): ${live.length}`);
console.log(fmt(live));
