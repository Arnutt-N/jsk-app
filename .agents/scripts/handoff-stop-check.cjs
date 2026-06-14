#!/usr/bin/env node
/**
 * Stop-hook guard: enforce the Universal Handoff workflow at session end.
 *
 * Fires on Claude Code "Stop". Blocks ONCE (exit 2) when this session has work
 * that is not yet captured by a fresh handoff checkpoint, then lets the user
 * through on the next stop (stop_hook_active guard) so it never traps them.
 *
 * "Handoff missing/stale" = there are commits after the commit that last touched
 * .agents/state/checkpoints/, OR the working tree has uncommitted changes.
 *
 * Fail-open: any unexpected error exits 0 (never block because of a bug).
 *
 * Wired from .claude/settings.json -> hooks.Stop. See
 * .agents/workflows/handoff-to-any.md for the 7-artifact contract.
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

// Run git with an argument array (no shell -> no command injection).
function git(args, cwd) {
  try {
    return execFileSync('git', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
  } catch {
    return '';
  }
}

function main() {
  let input = {};
  try {
    input = JSON.parse(readStdin() || '{}');
  } catch {
    input = {};
  }

  // Avoid loops: if we already blocked once and Claude continued, allow stop.
  if (input.stop_hook_active) return 0;

  const cwd = input.cwd && fs.existsSync(input.cwd) ? input.cwd : process.cwd();

  // Must be a git repo.
  const root = git(['rev-parse', '--show-toplevel'], cwd);
  if (!root) return 0;

  // Only act for repos that use the .agents handoff system.
  const ckDir = path.join(root, '.agents', 'state', 'checkpoints');
  if (!fs.existsSync(ckDir)) return 0;

  const head = git(['rev-parse', 'HEAD'], root);
  if (!head) return 0;

  // Commit that last touched the checkpoints dir.
  const lastCkCommit = git(
    ['log', '-1', '--format=%H', '--', '.agents/state/checkpoints/'],
    root
  );

  let behind = 1; // no checkpoint ever committed -> treat as missing
  if (lastCkCommit) {
    const n = git(['rev-list', '--count', `${lastCkCommit}..HEAD`], root);
    behind = parseInt(n || '0', 10);
    if (Number.isNaN(behind)) behind = 0;
  }

  const dirty = git(['status', '--porcelain'], root).length > 0;

  // Fresh handoff: latest checkpoint commit is HEAD and tree is clean.
  if (behind === 0 && !dirty) return 0;

  const detail = [
    behind > 0 ? `${behind} commit(s) after the last handoff checkpoint` : null,
    dirty ? 'uncommitted changes in the working tree' : null,
  ]
    .filter(Boolean)
    .join(' + ');

  const msg = [
    '⛔ HANDOFF NOT COMPLETE — do not end the session yet.',
    '',
    `Detected: ${detail}.`,
    '',
    'Run the Universal Handoff workflow and pass the Step 6 Verification Gate:',
    '    cat .agents/workflows/handoff-to-any.md',
    '',
    'A handoff is INVALID unless all 7 artifacts are updated this session:',
    '  1) .agents/PROJECT_STATUS.md',
    '  2) .agents/state/current-session.json',
    '  3) .agents/state/TASK_LOG.md            (APPEND a new Task #N)',
    '  4) .agents/state/checkpoints/handover-<platform>-<YYYYMMDD-HHMM>.json  (NEW)',
    '  5) project-log-md/<platform>/session-summary-<YYYYMMDD-HHMM>.md        (NEW)',
    '  6) .agents/state/SESSION_INDEX.md',
    '  7) cross-platform handoff message',
    '',
    'Then commit (and push) the artifacts. Re-run the validator:',
    '    python .agents/scripts/validate_handoff_state.py',
    '',
    'If this session genuinely needs no handoff (read-only / trivial), stop again to bypass.',
  ].join('\n');

  process.stderr.write(msg + '\n');
  return 2;
}

let code = 0;
try {
  code = main();
} catch {
  code = 0; // fail-open
}
process.exit(code);
