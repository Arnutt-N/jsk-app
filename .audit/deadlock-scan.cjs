// Scans changed files for the self-cancelling deadlock shape:
//   effect body writes a setState (directly or via the fetcher it awaits)
//   AND that state appears in the effect's own dependency list
//   AND the effect has a cleanup that sets `cancelled = true`.
// A match means the run cancels itself and the result is never applied.
const fs = require('fs');
const path = require('path');

const ROOT = 'D:/genAI/jsk-app/frontend';
const files = process.argv.slice(2);

const STATE_ALIAS = /const\s*\[(\w+),\s*(\w+)\]\s*=\s*(?:React\.)?useState/g;

function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

// Pull each useEffect(() => { ... }, [deps]) block with brace matching.
function effects(src) {
  const out = [];
  const re = /(?:React\.)?useEffect\(\s*\(\s*\)\s*=>\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const bodyStart = m.index + m[0].length;
    let depth = 1;
    let i = bodyStart;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
    }
    const body = src.slice(bodyStart, i - 1);
    // deps array follows the closing paren
    const tail = src.slice(i, i + 400);
    const depsMatch = tail.match(/^\s*,\s*\[([^\]]*)\]/);
    const deps = depsMatch ? depsMatch[1].split(',').map((d) => d.trim().split('.')[0]).filter(Boolean) : null;
    out.push({ body, deps, line: src.slice(0, m.index).split('\n').length });
  }
  return out;
}

let findings = 0;
let scanned = 0;

for (const rel of files) {
  const p = path.join(ROOT, rel);
  let src;
  try {
    src = fs.readFileSync(p, 'utf8');
  } catch {
    console.log(`SKIP (missing) ${rel}`);
    continue;
  }
  scanned++;
  const clean = stripComments(src);

  // state -> setter map
  const setters = {};
  let sm;
  while ((sm = STATE_ALIAS.exec(clean))) setters[sm[2]] = sm[1];

  for (const eff of effects(clean)) {
    if (!eff.deps) continue;
    if (!/cancelled\s*=\s*true/.test(eff.body)) continue;

    // every setState this effect can reach: direct writes here, plus the body
    // of any component-scoped function the effect awaits or calls.
    const written = new Set();
    const direct = /(\w+)\(/g;
    let dm;
    while ((dm = direct.exec(eff.body))) if (setters[dm[1]]) written.add(setters[dm[1]]);

    // one hop: a called identifier whose own definition we can find
    const called = new Set();
    let cm;
    while ((cm = direct.exec(eff.body))) called.add(cm[1]);
    for (const fn of called) {
      const defRe = new RegExp(`const\\s+${fn}\\s*=\\s*(?:React\\.)?useCallback\\(\\s*(?:async\\s*)?\\([^)]*\\)\\s*=>\\s*\\{`, 'g');
      let fm;
      while ((fm = defRe.exec(clean))) {
        const start = fm.index + fm[0].length;
        let depth = 1;
        let j = start;
        for (; j < clean.length && depth > 0; j++) {
          if (clean[j] === '{') depth++;
          else if (clean[j] === '}') depth--;
        }
        const inner = clean.slice(start, j - 1);
        let im;
        const innerRe = /(\w+)\(/g;
        while ((im = innerRe.exec(inner))) if (setters[im[1]]) written.add(setters[im[1]]);
      }
    }

    const overlap = [...written].filter((s) => eff.deps.includes(s));
    if (overlap.length) {
      findings++;
      console.log(`DEADLOCK  ${rel}:${eff.line}  writes ${overlap.join(', ')} also in deps [${eff.deps.join(', ')}]`);
    }
  }
}

console.log(`\nscanned ${scanned} files, ${findings} deadlock-shaped effect(s)`);
