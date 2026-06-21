#!/usr/bin/env node
/**
 * archive-checkpoints.cjs — keep TASK_LOG.md / SESSION_INDEX.md from growing without bound.
 *
 * Moves checkpoint JSONs older than a cutoff into `.agents/state/checkpoints/archive/`.
 * The generator (gen-handoff-views.cjs) reads ONLY the top-level of the checkpoints dir,
 * so archived files drop out of the active views automatically — but stay on disk (and in
 * git history) for recovery. The views still show how many were archived (no silent drop).
 *
 * Usage:
 *   node .agents/scripts/archive-checkpoints.cjs                # dry-run, 6-month cutoff
 *   node .agents/scripts/archive-checkpoints.cjs --months 12    # dry-run, 12-month cutoff
 *   node .agents/scripts/archive-checkpoints.cjs --months 6 --apply   # actually move + regen
 *
 * Session-summary .md files (project-log-md/) are NOT touched — they remain linked.
 * After --apply, commit the moves: `git add -A .agents/state/checkpoints`.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const CK_DIR = path.join(ROOT, '.agents', 'state', 'checkpoints');
const ARCHIVE_DIR = path.join(CK_DIR, 'archive');

const p2 = (n) => String(n).padStart(2, '0');

// handover-<platform>-<YYYYMMDD>-<HHMM>.json  OR  handover-<platform>-<YYYYMMDD>.json
function dateKeyOf(file) {
  let m = file.match(/^handover-.+?-(\d{8})-(\d{4})\.json$/);
  if (m) return m[1] + m[2];
  m = file.match(/^handover-.+?-(\d{8})\.json$/);
  if (m) return m[1] + '0000';
  return null;
}

function parseArgs(argv) {
  const out = { months: 6, apply: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--apply') out.apply = true;
    else if (argv[i] === '--months') out.months = parseInt(argv[++i], 10);
  }
  if (!Number.isFinite(out.months) || out.months < 1) {
    process.stderr.write('Invalid --months (need an integer >= 1)\n');
    process.exit(1);
  }
  return out;
}

function main() {
  const { months, apply } = parseArgs(process.argv);

  const now = new Date();
  const cut = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());
  const cutKey = `${cut.getFullYear()}${p2(cut.getMonth() + 1)}${p2(cut.getDate())}0000`;
  const cutHuman = `${cut.getFullYear()}-${p2(cut.getMonth() + 1)}-${p2(cut.getDate())}`;

  const files = fs.existsSync(CK_DIR)
    ? fs.readdirSync(CK_DIR).filter((f) => f.endsWith('.json'))
    : [];

  const toArchive = files
    .map((f) => ({ f, key: dateKeyOf(f) }))
    .filter((x) => x.key && x.key < cutKey)
    .sort((a, b) => a.key.localeCompare(b.key));

  process.stdout.write(
    `Cutoff: older than ${months} month(s) (before ${cutHuman}). ` +
    `${files.length} active checkpoint(s); ${toArchive.length} match.\n`
  );

  if (toArchive.length === 0) {
    process.stdout.write('Nothing to archive.\n');
    return;
  }

  for (const { f } of toArchive) process.stdout.write(`  - ${f}\n`);

  if (!apply) {
    process.stdout.write('\nDry-run (no files moved). Re-run with --apply to archive these.\n');
    return;
  }

  if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  for (const { f } of toArchive) {
    fs.renameSync(path.join(CK_DIR, f), path.join(ARCHIVE_DIR, f));
  }
  process.stdout.write(`\nArchived ${toArchive.length} checkpoint(s) -> ${path.relative(ROOT, ARCHIVE_DIR)}\n`);

  // Rebuild the views so they reflect the now-smaller active set (+ archived count).
  execFileSync('node', [path.join(ROOT, '.agents', 'scripts', 'gen-handoff-views.cjs')], {
    cwd: ROOT, stdio: 'inherit',
  });
  process.stdout.write('Next: git add -A .agents/state/checkpoints && commit.\n');
}

main();
