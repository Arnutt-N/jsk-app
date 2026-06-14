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
    'Create the handoff in ONE command (source of truth = checkpoint JSON):',
    '    node .agents/scripts/handoff-new.cjs <platform> "<work summary>" ["<next step>" ...]',
    '    # e.g. node .agents/scripts/handoff-new.cjs claude_code "Merged PR #105" "Re-test mobile"',
    '',
    'It writes the checkpoint + session-summary and regenerates TASK_LOG.md + SESSION_INDEX.md',
    '(both are GENERATED — do not hand-edit). Then: flesh out the summary .md, git add + commit',
    '(and push), and verify:  python .agents/scripts/validate_handoff_state.py',
    '',
    'Details: cat .agents/workflows/handoff-to-any.md',
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
