#!/usr/bin/env node
/**
 * handoff-new.cjs — scaffold a complete handoff in ONE command, then regenerate views.
 *
 * Replaces the old 7-files-by-hand chore (the friction that caused the #79-#101 gap).
 *
 * Usage:
 *   node .agents/scripts/handoff-new.cjs <platform> "<work summary>" ["<next step>" ...]
 * Example:
 *   node .agents/scripts/handoff-new.cjs claude_code "Merged PR #105: fix X" "Deploy to prod" "Re-test on mobile"
 *
 * Creates:
 *   - .agents/state/checkpoints/handover-<platform>-<YYYYMMDD-HHMM>.json   (source of truth)
 *   - project-log-md/<platform>/session-summary-<YYYYMMDD-HHMM>.md         (narrative; fill in)
 * Then runs gen-handoff-views.cjs so TASK_LOG.md + SESSION_INDEX.md update automatically.
 * Prints the remaining manual steps (review summary, commit, push).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const CANON = {
  'claude-code': 'claude_code', claude_code: 'claude_code',
  codex: 'codex', codeX: 'codex', kimi: 'kimi_code', kimi_code: 'kimi_code',
  kilo_code: 'kilo_code', cline: 'cline', antigravity: 'antigravity',
  gemini_cli: 'gemini_cli', open_code: 'open_code', qwen: 'qwen',
};

function main() {
  const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const [, , platformArg, summaryArg, ...nextSteps] = process.argv;

  if (!platformArg || !summaryArg) {
    process.stderr.write(
      'Usage: node .agents/scripts/handoff-new.cjs <platform> "<work summary>" ["<next step>" ...]\n'
    );
    process.exit(1);
  }
  const platform = CANON[platformArg] || platformArg.toLowerCase().replace(/-/g, '_');

  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`;
  const time = `${p2(d.getHours())}${p2(d.getMinutes())}`;
  const ts = `${date}-${time}`;
  const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:00Z`;

  let head = '';
  try { head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch {}
  let branch = '';
  try { branch = execFileSync('git', ['branch', '--show-current'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch {}

  const ckPath = path.join(ROOT, '.agents', 'state', 'checkpoints', `handover-${platform}-${ts}.json`);
  const sumDir = path.join(ROOT, 'project-log-md', platform);
  const sumPath = path.join(sumDir, `session-summary-${ts}.md`);

  const checkpoint = {
    handoff_version: '2.0',
    platform,
    agent: process.env.AGENT_NAME || platform,
    timestamp: iso,
    branch: branch || 'main',
    head_commit: head,
    status: 'completed',
    work_summary: summaryArg,
    priority_actions: nextSteps,
    context_for_next_agent: '',
    session_summary: `project-log-md/${platform}/session-summary-${ts}.md`,
    cross_platform_read: [],
  };
  fs.writeFileSync(ckPath, JSON.stringify(checkpoint, null, 2) + '\n');

  if (!fs.existsSync(sumDir)) fs.mkdirSync(sumDir, { recursive: true });
  const sum = [
    `# Session Summary — ${platform} — ${iso}`,
    '',
    `**Branch**: \`${branch || 'main'}\`  **HEAD**: \`${head}\``,
    `**Checkpoint**: \`.agents/state/checkpoints/handover-${platform}-${ts}.json\``,
    '',
    '## Objective',
    summaryArg,
    '',
    '## Completed',
    '- ' + summaryArg,
    '',
    '## Next Steps',
    ...(nextSteps.length ? nextSteps.map((s) => `- ${s}`) : ['- _none_']),
    '',
    '## Blockers',
    '- _none_',
    '',
    '> Fill in detail above, then commit. TASK_LOG.md + SESSION_INDEX.md are generated.',
    '',
  ].join('\n');
  fs.writeFileSync(sumPath, sum);

  // Keep current-session.json in sync (validator requires last_updated >= newest checkpoint).
  const csPath = path.join(ROOT, '.agents', 'state', 'current-session.json');
  let cs = {};
  try { cs = JSON.parse(fs.readFileSync(csPath, 'utf8')); } catch { cs = {}; }
  const history = Array.isArray(cs.handoff_history) ? cs.handoff_history : [];
  history.unshift({ timestamp: iso, platform, branch: branch || 'main', head, status: 'completed' });
  fs.writeFileSync(
    csPath,
    JSON.stringify(
      {
        last_updated: iso,
        platform,
        current_task: summaryArg.slice(0, 200),
        plan_status: 'completed',
        next_steps: nextSteps,
        handoff_history: history.slice(0, 20),
        cross_platform_context: cs.cross_platform_context || {},
      },
      null,
      2
    ) + '\n'
  );

  // Regenerate the views from the (now updated) source of truth.
  execFileSync('node', [path.join(ROOT, '.agents', 'scripts', 'gen-handoff-views.cjs')], {
    cwd: ROOT, stdio: 'inherit',
  });

  process.stdout.write(
    [
      '',
      'Handoff scaffolded:',
      `  checkpoint: .agents/state/checkpoints/handover-${platform}-${ts}.json`,
      `  summary:    project-log-md/${platform}/session-summary-${ts}.md`,
      '',
      'Next: (1) flesh out the summary .md, (2) git add + commit the artifacts,',
      '      (3) push. Verify: python .agents/scripts/validate_handoff_state.py',
      '',
    ].join('\n')
  );
}

main();
