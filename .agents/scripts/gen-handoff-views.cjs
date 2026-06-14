#!/usr/bin/env node
/**
 * gen-handoff-views.cjs — regenerate the handoff "views" from the source of truth.
 *
 * SOURCE OF TRUTH: .agents/state/checkpoints/*.json  (one per session/handoff)
 * GENERATED VIEWS (never hand-edit):
 *   - .agents/state/TASK_LOG.md
 *   - .agents/state/SESSION_INDEX.md
 *
 * Why filename-first: the 11 platforms wrote heterogeneous JSON schemas and one
 * file is even invalid JSON. The filename `handover-<platform>-<YYYYMMDD-HHMM>.json`
 * is the only stable contract, so platform + timestamp come from the filename and
 * JSON internals are read best-effort.
 *
 * Run: node .agents/scripts/gen-handoff-views.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const CK_DIR = path.join(ROOT, '.agents', 'state', 'checkpoints');
const LOG_DIR = path.join(ROOT, 'project-log-md');

// Canonical platform names (fixes codeX/codex, claude-code/claude_code, kimi/kimi_code).
const CANON = {
  'claude-code': 'claude_code', claude_code: 'claude_code',
  codex: 'codex', codeX: 'codex',
  kimi: 'kimi_code', kimi_code: 'kimi_code',
  kilo_code: 'kilo_code', cline: 'cline', antigravity: 'antigravity',
  gemini_cli: 'gemini_cli', open_code: 'open_code', qwen: 'qwen',
};
const canon = (p) => CANON[p] || String(p).toLowerCase().replace(/-/g, '_');

function parseName(file) {
  let m = file.match(/^handover-(.+?)-(\d{8})-(\d{4})\.json$/);
  if (m) return { raw: m[1].replace(/-any$/, ''), date: m[2], time: m[3] };
  m = file.match(/^handover-(.+?)-(\d{8})\.json$/);
  if (m) return { raw: m[1].replace(/-any$/, ''), date: m[2], time: '0000' };
  return null;
}
const fmtWhen = (d, t) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)} ${t.slice(0, 2)}:${t.slice(2, 4)}`;
const readJson = (fp) => { try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { return null; } };

function summaryOf(j) {
  if (!j) return '_(unparseable checkpoint JSON)_';
  if (j.work_summary) {
    if (typeof j.work_summary === 'string') return j.work_summary.trim();
    if (Array.isArray(j.work_summary)) return j.work_summary.map(String).join('; ');
    return JSON.stringify(j.work_summary).slice(0, 500);
  }
  if (Array.isArray(j.work_completed)) {
    return j.work_completed.slice(0, 4).map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('; ');
  }
  if (typeof j.work_completed === 'string') return j.work_completed.trim();
  if (j.metadata && j.metadata.summary) return String(j.metadata.summary).trim();
  return '_(no work_summary field)_';
}
const statusOf = (j) => (j && (j.status || (j.metadata && j.metadata.status))) || 'unknown';

function listSummaries() {
  const out = {};
  if (!fs.existsSync(LOG_DIR)) return out;
  for (const plat of fs.readdirSync(LOG_DIR)) {
    const dir = path.join(LOG_DIR, plat);
    if (!fs.statSync(dir).isDirectory()) continue;
    out[plat] = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  }
  return out;
}
function findSummary(summaries, platform, date, time) {
  const files = summaries[platform] || [];
  const exact = `session-summary-${date}-${time}.md`;
  if (files.includes(exact)) return `${platform}/${exact}`;
  const byDate = files.find((f) => f.includes(date));
  return byDate ? `${platform}/${byDate}` : null;
}

function main() {
  const files = fs.readdirSync(CK_DIR).filter((f) => f.endsWith('.json'));
  const summaries = listSummaries();
  const entries = [];
  for (const f of files) {
    const pn = parseName(f);
    if (!pn) continue;
    const j = readJson(path.join(CK_DIR, f));
    entries.push({
      file: f,
      platform: canon(pn.raw),
      date: pn.date,
      time: pn.time,
      sortKey: pn.date + pn.time,
      when: fmtWhen(pn.date, pn.time),
      status: statusOf(j),
      summary: summaryOf(j),
    });
  }
  entries.sort((a, b) => b.sortKey.localeCompare(a.sortKey));

  const platforms = [...new Set(entries.map((e) => e.platform))].sort();
  const totalSummaries = Object.values(summaries).reduce((n, a) => n + a.length, 0);
  const stamp = entries[0] ? entries[0].when : '(none)';
  const banner = '<!-- GENERATED — do not hand-edit. Regenerate: node .agents/scripts/gen-handoff-views.cjs -->';

  // ---- TASK_LOG.md ----
  const log = [
    banner,
    '# Task Log (generated)',
    '',
    `> Source of truth: \`.agents/state/checkpoints/*.json\` — ${entries.length} handoffs, ${platforms.length} platforms.`,
    '> Newest first. Keyed by timestamp + platform (no fragile sequential numbers).',
    '',
  ];
  for (const e of entries) {
    const sm = findSummary(summaries, e.platform, e.date, e.time);
    log.push(`### ${e.when} — ${e.platform} — ${e.status}`, '', e.summary, '');
    log.push(`- Checkpoint: \`.agents/state/checkpoints/${e.file}\``);
    if (sm) log.push(`- Summary: \`project-log-md/${sm}\``);
    log.push('', '---', '');
  }
  fs.writeFileSync(path.join(ROOT, '.agents', 'state', 'TASK_LOG.md'), log.join('\n'));

  // ---- SESSION_INDEX.md ----
  const idx = [
    banner,
    '# Cross-Platform Session Index (generated)',
    '',
    `> **Last generated**: ${stamp} (from newest checkpoint)`,
    '',
    '## Quick Stats',
    '',
    '| Metric | Value |',
    '|--------|-------|',
    `| Handoff checkpoints | ${entries.length} |`,
    `| Session summaries on disk | ${totalSummaries} |`,
    `| Platforms | ${platforms.length} (${platforms.join(', ')}) |`,
    `| Most recent | ${stamp} — ${entries[0] ? entries[0].platform : '-'} |`,
    '',
    '> Regenerate after any handoff: `node .agents/scripts/gen-handoff-views.cjs`',
    '',
  ];
  for (const p of platforms) {
    const rows = entries.filter((e) => e.platform === p);
    idx.push(`## ${p} (${rows.length})`, '', '| When | Status | Checkpoint |', '|------|--------|------------|');
    for (const e of rows.slice(0, 20)) {
      idx.push(`| ${e.when} | ${e.status} | \`${e.file}\` |`);
    }
    if (rows.length > 20) idx.push(`| … | | +${rows.length - 20} older |`);
    idx.push('');
  }
  fs.writeFileSync(path.join(ROOT, '.agents', 'state', 'SESSION_INDEX.md'), idx.join('\n'));

  process.stdout.write(
    `Generated TASK_LOG.md + SESSION_INDEX.md from ${entries.length} checkpoints ` +
    `(${platforms.length} platforms, ${totalSummaries} summaries).\n`
  );
}

main();
