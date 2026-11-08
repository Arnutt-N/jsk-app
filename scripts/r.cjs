#!/usr/bin/env node
/** Repo-root command runner: fail fast when the cwd is not the repo root.
 *
 * Mistake class: running frontend/backend commands from the wrong directory
 * (npx vitest/tsc/eslint from backend/, pytest from frontend/) fails with
 * confusing "file not found" errors. Every root script routes through here,
 * so the error names the fix instead of a missing binary.
 *
 * Usage: node scripts/r Bin.cjs <dir> <cmd...>  (internal)
 * Public entry points below.
 */
const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { join } = require('node:path');

const ROOT = __dirname + '/..';

function run(dir, cmd, args) {
  const cwd = join(ROOT, dir);
  const marker = dir === 'frontend' ? 'package.json' : 'pyproject.toml';
  const fallback = dir === 'frontend' ? null : 'requirements.txt';
  if (!existsSync(join(cwd, marker)) && !(fallback && existsSync(join(cwd, fallback)))) {
    console.error(`[r] expected ${dir}/${marker} — repo layout changed?`);
    process.exit(2);
  }
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: true });
  process.exit(res.status ?? 1);
}

const [, , target, ...rest] = process.argv;
if (target === 'frontend') {
  const [cmd, ...args] = rest;
  run('frontend', cmd, args);
} else if (target === 'backend') {
  const [cmd, ...args] = rest;
  run('backend', cmd, args);
} else {
  console.error('usage: node scripts/r.cjs <frontend|backend> <cmd...>');
  process.exit(2);
}
