#!/usr/bin/env node
/** Repo-root command runner: fail fast when the cwd is not the repo root.
 *
 * Mistake class: running frontend/backend commands from the wrong directory
 * (npx vitest/tsc/eslint from backend/, pytest from frontend/) fails with
 * confusing "file not found" errors. Every root script routes through here,
 * so the error names the fix instead of a missing binary.
 *
 * Usage: node scripts/r.cjs <frontend|backend> <cmd...>
 */
const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { join } = require('node:path');

const ROOT = join(__dirname, '..');

function run(dir, cmd, args) {
  // Enforce repo-root invocation: the whole point is killing cwd-dependent
  // failures, so running from elsewhere must fail loud, not silently work.
  const cwdNow = process.cwd();
  if (cwdNow !== ROOT && !cwdNow.startsWith(`${ROOT}/`)) {
    console.error(`[r] must run from the repo root (${ROOT}), not ${cwdNow}`);
    process.exit(2);
  }
  const cwd = join(ROOT, dir);
  const marker = dir === 'frontend' ? 'package.json' : 'pyproject.toml';
  const fallback = dir === 'frontend' ? null : 'requirements.txt';
  if (!existsSync(join(cwd, marker)) && !(fallback && existsSync(join(cwd, fallback)))) {
    console.error(`[r] expected ${dir}/${marker} — repo layout changed?`);
    process.exit(2);
  }
  // Windows needs shell for npm/npx .cmd shims; shell:true re-parses
  // metacharacters in args — human-invoked dev tool, no untrusted input.
  const useShell = process.platform === 'win32';
  const res = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: useShell,
  });
  process.exit(res.status ?? 1);
}

const [, , target, ...rest] = process.argv;
if (target === 'frontend' || target === 'backend') {
  const [cmd, ...args] = rest;
  if (!cmd) {
    console.error(`usage: node scripts/r.cjs ${target} <cmd...>`);
    process.exit(2);
  }
  run(target, cmd, args);
} else {
  console.error('usage: node scripts/r.cjs <frontend|backend> <cmd...>');
  process.exit(2);
}
