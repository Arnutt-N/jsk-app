#!/usr/bin/env node
/**
 * handoff-new.cjs — scaffold a complete handoff in ONE command, then regenerate views.
 *
 * Replaces the old 7-files-by-hand chore (the friction that caused the #79-#101 gap).
 *
 * Usage:
 *   node .agents/scripts/handoff-new.cjs <platform> "<work summary>" ["<next step>" ...]
 *   node .agents/scripts/handoff-new.cjs <platform> "<work summary>" --model "GLM-4.5" --provider "Zhipu AI" ["<next step>" ...]
 * Example:
 *   node .agents/scripts/handoff-new.cjs claude_code "Merged PR #105: fix X" "Deploy to prod" "Re-test on mobile"
 *   node .agents/scripts/handoff-new.cjs cline "Manual test pass" --model "GLM-4.5" --provider "Zhipu AI" "Commit results"
 *
 * Creates:
 *   - .agents/state/checkpoints/handover-<platform>-<YYYYMMDD-HHMM>.json   (source of truth)
 *   - project-log-md/<platform>/session-summary-<YYYYMMDD-HHMM>.md         (narrative; fill in)
 * Syncs .agents/state/current-session.json and refreshes .agents/PROJECT_STATUS.md
 * (Last Updated line + a Recent Completions entry) so validate_handoff_state.py stays green.
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
  qoder: 'qoder', qoder_cli: 'qoder',
};

const DISPLAY = {
  claude_code: 'Claude Code', codex: 'Codex', kimi_code: 'Kimi Code',
  kilo_code: 'Kilo Code', cline: 'Cline', antigravity: 'Antigravity',
  gemini_cli: 'Gemini CLI', open_code: 'OpenCode', qwen: 'Qwen',
  qoder: 'Qoder',
};
const displayName = (p) =>
  DISPLAY[p] || p.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function main() {
  const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  // Parse optional --model and --provider flags from argv, then remove them
  // so the remaining positional args (platform, summary, nextSteps) stay stable.
  const rawArgs = process.argv.slice(2);
  let model = '';
  let provider = '';
  const positional = [];
  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i];
    if (a === '--model' && i + 1 < rawArgs.length) {
      model = rawArgs[++i];
    } else if (a.startsWith('--model=')) {
      model = a.slice('--model='.length);
    } else if (a === '--provider' && i + 1 < rawArgs.length) {
      provider = rawArgs[++i];
    } else if (a.startsWith('--provider=')) {
      provider = a.slice('--provider='.length);
    } else {
      positional.push(a);
    }
  }
  const [platformArg, summaryArg, ...nextSteps] = positional;

  if (!platformArg || !summaryArg) {
    process.stderr.write(
      'Usage: node .agents/scripts/handoff-new.cjs <platform> "<work summary>" [--model "Model"] [--provider "Provider"] ["<next step>" ...]\n'
    );
    process.exit(1);
  }
  const platform = CANON[platformArg] || platformArg.toLowerCase().replace(/-/g, '_');

  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`;
  const time = `${p2(d.getHours())}${p2(d.getMinutes())}`;
  const ts = `${date}-${time}`;
  // Local wall-clock time with the machine's REAL UTC offset (e.g. +07:00).
  // Never hard-code "Z": getHours()/getMinutes() are local, so tagging them UTC
  // would shift every timestamp by the offset (the old bug — 19:06 +07 written as 19:06Z).
  const offMin = -d.getTimezoneOffset(); // minutes east of UTC; +07:00 -> 420
  const offSign = offMin >= 0 ? '+' : '-';
  const offAbs = Math.abs(offMin);
  const tzOffset = `${offSign}${p2(Math.floor(offAbs / 60))}:${p2(offAbs % 60)}`;
  const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:00${tzOffset}`;
  const humanTs = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)} ${time.slice(0, 2)}:${time.slice(2, 4)}`;

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
  // Optional platform metadata (AI CLI IDE model + provider) — only written
  // when the caller passes --model / --provider. Not required by the validator
  // but recommended for cross-platform traceability.
  if (model) checkpoint.model = model;
  if (provider) checkpoint.provider = provider;
  fs.writeFileSync(ckPath, JSON.stringify(checkpoint, null, 2) + '\n');

  if (!fs.existsSync(sumDir)) fs.mkdirSync(sumDir, { recursive: true });
  const sum = [
    `# Session Summary — ${platform}${model ? ` (${model})` : ''} — ${iso}`,
    '',
    `**Branch**: \`${branch || 'main'}\`  **HEAD**: \`${head}\``,
    `**Checkpoint**: \`.agents/state/checkpoints/handover-${platform}-${ts}.json\``,
  ];
  // Platform Meta table (only if model or provider is specified)
  if (model || provider) {
    sum.push(
      '',
      '> **Platform Meta**',
      '> | Field | Value |',
      '> |-------|-------|',
      `> | AI CLI IDE | ${displayName(platform)} |`,
      ...(provider ? [`> | Provider | ${provider} |`] : []),
      ...(model ? [`> | Model | ${model} |`] : []),
      '>',
    );
  }
  sum.push(
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
  );
  fs.writeFileSync(sumPath, sum.join('\n'));

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
        // Track model/provider for the current platform (optional, for traceability)
        ...(model ? { model } : {}),
        ...(provider ? { provider } : {}),
      },
      null,
      2
    ) + '\n'
  );

  // Refresh PROJECT_STATUS.md (Last Updated line + one Recent Completions entry) so the
  // validator's freshness check stays green. Only these two spots are touched — the curated
  // Thai summary / milestones are left intact. Fail-open: never block a handoff on this.
  try {
    const psPath = path.join(ROOT, '.agents', 'PROJECT_STATUS.md');
    if (fs.existsSync(psPath)) {
      let ps = fs.readFileSync(psPath, 'utf8');
      const disp = displayName(platform);
      const oneLine = summaryArg.replace(/\s+/g, ' ').trim();
      const note = oneLine.split(/(?<=[.!?])\s/)[0].replace(/[()]/g, '').slice(0, 90);
      const luRe = /^>?\s*\*\*Last Updated:\*\*.*$/m;
      if (luRe.test(ps)) {
        ps = ps.replace(luRe, `> **Last Updated:** ${humanTs} by ${disp} (${note})`);
      }
      const rcRe = /^(##\s*Recent Completions\s*\n)/m;
      if (rcRe.test(ps)) {
        ps = ps.replace(rcRe, `$1- [${humanTs}] ${disp}: ${oneLine.slice(0, 240)} (${disp})\n`);
      }
      fs.writeFileSync(psPath, ps);
    }
  } catch {
    /* fail-open */
  }

  // Regenerate the views from the (now updated) source of truth.
  execFileSync('node', [path.join(ROOT, '.agents', 'scripts', 'gen-handoff-views.cjs')], {
    cwd: ROOT, stdio: 'inherit',
  });

  // Close the loop: validate the state we just wrote, automatically. The validator
  // is the authority on cross-file consistency (timestamps, required keys, freshness).
  // Best-effort + fail-open: a missing Python or a non-zero exit must never abort the
  // handoff that already succeeded — we only surface the result for the human to act on.
  const validatorOk = runValidator(ROOT, platform);

  process.stdout.write(
    [
      '',
      'Handoff scaffolded:',
      `  checkpoint: .agents/state/checkpoints/handover-${platform}-${ts}.json`,
      `  summary:    project-log-md/${platform}/session-summary-${ts}.md`,
      '  status:     .agents/PROJECT_STATUS.md (Last Updated + recent-completion)',
      `  validator:  ${validatorOk === null ? 'skipped (python not found)' : validatorOk ? 'PASS' : 'FAIL — see output above'}`,
      '',
      'Next: (1) flesh out the summary .md, (2) git add + commit the artifacts, (3) push.',
      '',
    ].join('\n')
  );
}

// Run validate_handoff_state.py with whatever Python is on PATH.
// Returns true (PASS), false (FAIL), or null (no Python / could not run).
function runValidator(root, platform) {
  const script = path.join(root, '.agents', 'scripts', 'validate_handoff_state.py');
  if (!fs.existsSync(script)) return null;
  for (const py of ['python3', 'python', 'py']) {
    try {
      execFileSync(py, [script, '--platform', platform], { cwd: root, stdio: 'inherit' });
      return true; // exit 0
    } catch (err) {
      // ENOENT = this interpreter isn't installed; try the next candidate.
      if (err && err.code === 'ENOENT') continue;
      return false; // interpreter ran but validator exited non-zero (FAIL)
    }
  }
  return null; // no interpreter found
}

main();
