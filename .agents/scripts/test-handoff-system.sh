#!/usr/bin/env bash
# test-handoff-system.sh — golden test set for the .agents handoff system.
#
# Origin: 2026-08-29 workflow evaluation (/evaluate) of the pickup/handoff flow.
# Covers: handoff-new.cjs (arg errors, special chars, canonicalization, path
# traversal, same-minute collision, dangling flags, bare-repo fail-open),
# gen-handoff-views.cjs (corrupt/legacy checkpoints), handoff-stop-check.cjs
# (gate decisions). Every test runs inside a throwaway sandbox git repo —
# real handoff state is never touched.
#
# Usage: bash .agents/scripts/test-handoff-system.sh
# Exit:  0 = all pass, 1 = at least one failure.

set -u

REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRIPTS="$REPO_ROOT/.agents/scripts"
HANDOFF_NEW="$SCRIPTS/handoff-new.cjs"
GEN_VIEWS="$SCRIPTS/gen-handoff-views.cjs"
STOP_CHECK="$SCRIPTS/handoff-stop-check.cjs"

for f in "$HANDOFF_NEW" "$GEN_VIEWS" "$STOP_CHECK"; do
  if [ ! -f "$f" ]; then
    echo "ERROR: missing script: $f" >&2
    exit 1
  fi
done

SB="$(mktemp -d "${TMPDIR:-/tmp}/handoff-tests.XXXXXX")"
SB2="$(mktemp -d "${TMPDIR:-/tmp}/handoff-bare.XXXXXX")"
trap 'rm -rf "$SB" "$SB2"' EXIT

PASS=0
FAIL=0
ok() { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL  %s\n' "$1"; }
check_exit() { # name, expected, actual
  if [ "$2" -eq "$3" ]; then ok "$1"; else bad "$1 (expected exit $2, got $3)"; fi
}

# ---------- sandbox bootstrap ----------
cd "$SB"
git init -q
git config user.email eval@test.local
git config user.name eval
mkdir -p .agents/state/checkpoints .agents/scripts project-log-md
echo '{}' > .agents/state/current-session.json
cp "$GEN_VIEWS" .agents/scripts/
git add -A
git commit -qm init

# ---------- handoff-new.cjs ----------

# T01-T03: argument errors -> usage + exit 1, no partial writes
node "$HANDOFF_NEW" >/dev/null 2>&1; check_exit "T01 no args -> exit 1" 1 $?
node "$HANDOFF_NEW" qoder >/dev/null 2>&1; check_exit "T02 platform only -> exit 1" 1 $?
node "$HANDOFF_NEW" qoder "" >/dev/null 2>&1; check_exit "T03 empty summary -> exit 1" 1 $?
[ -z "$(ls .agents/state/checkpoints 2>/dev/null)" ] \
  && ok "T03b arg errors leave no files" || bad "T03b arg errors leave no files"

# T04: happy path with Thai text, emoji, backticks, quotes + model/provider flags
SUMMARY='ทดสอบ: `code` + "quotes" + 100% 🎉'
node "$HANDOFF_NEW" qoder "$SUMMARY" --model TestModel --provider TestProv "next 1" >/dev/null 2>&1
check_exit "T04 happy path (special chars) -> exit 0" 0 $?
CK="$(ls .agents/state/checkpoints/handover-qoder-*.json 2>/dev/null | head -1)"
if [ -n "$CK" ] && node -e '
  const fs = require("fs");
  const j = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (j.work_summary !== process.argv[2]) process.exit(1);
  if (j.model !== "TestModel" || j.provider !== "TestProv") process.exit(1);
' "$CK" "$SUMMARY"; then
  ok "T04b checkpoint JSON preserves summary + flags"
else
  bad "T04b checkpoint JSON preserves summary + flags"
fi
[ -f .agents/state/TASK_LOG.md ] && [ -f .agents/state/SESSION_INDEX.md ] \
  && ok "T04c views regenerated" || bad "T04c views regenerated"

# T05: platform canonicalization
node "$HANDOFF_NEW" Claude-Code "canon test" >/dev/null 2>&1
RC=$?
if [ $RC -eq 0 ] && ls .agents/state/checkpoints/handover-claude_code-*.json >/dev/null 2>&1; then
  ok "T05 Claude-Code canonicalized to claude_code"
else
  bad "T05 Claude-Code canonicalized to claude_code (exit $RC)"
fi

# T06: ADVERSARIAL path traversal must be rejected, nothing written outside
node "$HANDOFF_NEW" "../../evil" "traversal attempt" >/dev/null 2>&1
RC=$?
if [ $RC -eq 1 ] \
  && [ -z "$(find "$SB" -name '*evil*' 2>/dev/null)" ] \
  && [ ! -e "$(dirname "$SB")/evil" ]; then
  ok "T06 path traversal rejected, no escape from sandbox"
else
  bad "T06 path traversal rejected, no escape from sandbox (exit $RC)"
fi

# T07: same-minute collision -> refuse to overwrite (deterministic: pre-create the target).
# Retry loop guards the minute-boundary flake: if the minute rolls over between
# pre-creation and the run, recreate the target for the new minute and try again.
T07_RC=1
for _ in 1 2 3; do
  TS="$(date +%Y%m%d-%H%M)"
  echo '{"work_summary":"ORIGINAL"}' > ".agents/state/checkpoints/handover-codex-${TS}.json"
  node "$HANDOFF_NEW" codex "second handoff same minute" >/dev/null 2>&1
  T07_RC=$?
  [ "$T07_RC" -eq 1 ] && break
done
if [ "$T07_RC" -eq 1 ] && grep -q ORIGINAL ".agents/state/checkpoints/handover-codex-${TS}.json"; then
  ok "T07 same-minute collision refused, original intact"
else
  bad "T07 same-minute collision refused, original intact (exit $T07_RC)"
fi

# T08-T09: dangling flags are errors, not summaries
node "$HANDOFF_NEW" qoder --model >/dev/null 2>&1; check_exit "T08 dangling --model -> exit 1" 1 $?
node "$HANDOFF_NEW" qoder --provider >/dev/null 2>&1; check_exit "T09 dangling --provider -> exit 1" 1 $?
node "$HANDOFF_NEW" qoder "x" --model= >/dev/null 2>&1; check_exit "T08b empty --model= -> exit 1" 1 $?
# T08c: inline --model=VALUE still works (only the empty form is rejected)
node "$HANDOFF_NEW" cline "inline flag form" --model=InlineModel >/dev/null 2>&1
RC=$?
CKI="$(ls .agents/state/checkpoints/handover-cline-*.json 2>/dev/null | head -1)"
if [ $RC -eq 0 ] && [ -n "$CKI" ] && grep -q '"model": "InlineModel"' "$CKI"; then
  ok "T08c inline --model=VALUE accepted"
else
  bad "T08c inline --model=VALUE accepted (exit $RC)"
fi

# T10: bare repo (first session, no scripts) -> fail-open, checkpoint still written
cd "$SB2"
git init -q
git config user.email eval@test.local
git config user.name eval
mkdir -p .agents/state/checkpoints
node "$HANDOFF_NEW" qoder "first session in bare repo" >/dev/null 2>&1
RC=$?
if [ $RC -eq 0 ] && ls .agents/state/checkpoints/handover-qoder-*.json >/dev/null 2>&1; then
  ok "T10 bare repo fail-open: exit 0 + checkpoint written"
else
  bad "T10 bare repo fail-open: exit 0 + checkpoint written (exit $RC)"
fi
cd "$SB"

# ---------- gen-handoff-views.cjs ----------

# Reset checkpoints to a controlled corrupted set for the generator tests
GEN_SB="$SB/.agents/state/checkpoints"
rm -f "$GEN_SB"/*.json
echo '{ broken json !!!' > "$GEN_SB/handover-cline-20260101-0900.json"
printf '{"from_platform":"claude","to_platform":"codex","work_completed":["did A","did B"],"status":"done"}' \
  > "$GEN_SB/handover-claude_code-20260102-1000.json"
echo '{}' > "$GEN_SB/handover-nodate.json"
echo '{}' > "$GEN_SB/random-file.json"

node .agents/scripts/gen-handoff-views.cjs >/dev/null 2>&1
check_exit "T11 gen-views survives corrupt+legacy checkpoints" 0 $?
grep -q '_(unparseable checkpoint JSON)_' .agents/state/TASK_LOG.md \
  && ok "T11b invalid JSON labeled, not fatal" || bad "T11b invalid JSON labeled, not fatal"
grep -q 'did A; did B' .agents/state/TASK_LOG.md \
  && ok "T12 legacy work_completed array rendered" || bad "T12 legacy work_completed array rendered"
N=$(grep -c '^### ' .agents/state/TASK_LOG.md)
[ "$N" -eq 2 ] && ok "T13 bad filenames skipped (2 entries)" || bad "T13 bad filenames skipped (expected 2 entries, got $N)"

# ---------- handoff-stop-check.cjs ----------

# Dirty tree (uncommitted checkpoint changes) -> block
echo '{"work_summary":"dirty"}' > "$GEN_SB/handover-codex-20260103-1100.json"
printf '{"cwd":"%s"}' "$SB" | node "$STOP_CHECK" >/dev/null 2>&1
check_exit "T14 dirty tree blocks (exit 2)" 2 $?
printf '{"stop_hook_active":true,"cwd":"%s"}' "$SB" | node "$STOP_CHECK" >/dev/null 2>&1
check_exit "T15 stop_hook_active passes through (exit 0)" 0 $?
printf 'not json at all' | node "$STOP_CHECK" >/dev/null 2>&1
check_exit "T16 malformed stdin: no crash, still blocks (exit 2)" 2 $?

# Clean tree + checkpoint committed -> pass
git add -A
git commit -qm "checkpoint commit"
printf '{"cwd":"%s"}' "$SB" | node "$STOP_CHECK" >/dev/null 2>&1
check_exit "T17 clean tree with fresh checkpoint passes (exit 0)" 0 $?

# ---------- directed handoff (--to) + board ----------

# T18: --to canonicalizes the recipient like the platform
# (fresh platforms only below: reusing qoder/cline/codex could hit the
# same-minute collision guard against T04/T07/T08c artifacts.)
node "$HANDOFF_NEW" kilo_code "directed work" --to Claude-Code >/dev/null 2>&1
RC=$?
CKD="$(ls .agents/state/checkpoints/handover-kilo_code-*.json 2>/dev/null | head -1)"
if [ $RC -eq 0 ] && [ -n "$CKD" ] && grep -q '"to_agent": "claude_code"' "$CKD"; then
  ok "T18 --to Claude-Code canonicalized to claude_code in JSON"
else
  bad "T18 --to Claude-Code canonicalized to claude_code in JSON (exit $RC)"
fi
grep -q '^\*\*To\*\*: `claude_code` (directed)$' project-log-md/kilo_code/session-summary-*.md 2>/dev/null \
  && ok "T18b summary stub carries **To** line" || bad "T18b summary stub carries **To** line"

# T19: broadcast default (no flag -> no key) + explicit --to all + --to=any alias
node "$HANDOFF_NEW" zcode "broadcast work" >/dev/null 2>&1
CKB="$(ls .agents/state/checkpoints/handover-zcode-*.json 2>/dev/null | head -1)"
if [ -n "$CKB" ] && ! grep -q '"to_agent"' "$CKB"; then
  ok "T19 no --to flag -> no to_agent key (broadcast)"
else
  bad "T19 no --to flag -> no to_agent key (broadcast)"
fi
node "$HANDOFF_NEW" antigravity "explicit broadcast" --to all >/dev/null 2>&1
CKA="$(ls .agents/state/checkpoints/handover-antigravity-*.json 2>/dev/null | head -1)"
if [ -n "$CKA" ] && grep -q '"to_agent": "all"' "$CKA"; then
  ok "T19b --to all stored as explicit broadcast marker"
else
  bad "T19b --to all stored as explicit broadcast marker"
fi
node "$HANDOFF_NEW" open_code "legacy alias" --to=any >/dev/null 2>&1
CKN="$(ls .agents/state/checkpoints/handover-open_code-*.json 2>/dev/null | head -1)"
if [ -n "$CKN" ] && grep -q '"to_agent": "all"' "$CKN"; then
  ok "T19c --to=any normalized to all"
else
  bad "T19c --to=any normalized to all"
fi

# T20: invalid --to values rejected, nothing written
N_BEFORE=$(ls .agents/state/checkpoints/*.json 2>/dev/null | wc -l)
node "$HANDOFF_NEW" qoder "x" --to ../../evil >/dev/null 2>&1; check_exit "T20a --to path traversal -> exit 1" 1 $?
node "$HANDOFF_NEW" qoder "x" --to "" >/dev/null 2>&1; check_exit "T20b empty --to -> exit 1" 1 $?
node "$HANDOFF_NEW" qoder "work" --to >/dev/null 2>&1; check_exit "T20c dangling --to -> exit 1" 1 $?
N_AFTER=$(ls .agents/state/checkpoints/*.json 2>/dev/null | wc -l)
if [ "$N_BEFORE" -eq "$N_AFTER" ] && [ -z "$(find "$SB" -name '*evil*' 2>/dev/null)" ]; then
  ok "T20d rejections leave no files"
else
  bad "T20d rejections leave no files ($N_BEFORE -> $N_AFTER)"
fi

# T21: directed checkpoint lands in the recipient's board queue
node "$HANDOFF_NEW" gemini_cli "fix ready for qwen review" --to qwen >/dev/null 2>&1
RC=$?
BOARD=.agents/state/HANDOFF_BOARD.md
if [ $RC -eq 0 ] && [ -f "$BOARD" ] \
  && grep -q '^### qwen (1 pending)$' "$BOARD" \
  && grep -q 'fix ready for qwen review' "$BOARD"; then
  ok "T21 board queues gemini_cli->qwen handoff under qwen"
else
  bad "T21 board queues gemini_cli->qwen handoff under qwen (exit $RC)"
fi
grep -q '^- To: `qwen` (directed)$' .agents/state/TASK_LOG.md \
  && ok "T21b TASK_LOG entry carries - To: line" || bad "T21b TASK_LOG entry carries - To: line"

# T22: recipient checkpoint auto-clears the queue (time-based rule)
node "$HANDOFF_NEW" qwen "reviewed gemini fix" >/dev/null 2>&1
RC=$?
if [ $RC -eq 0 ] && ! grep -q '^### qwen (' "$BOARD"; then
  ok "T22 qwen queue cleared after qwen checkpoint"
else
  bad "T22 qwen queue cleared after qwen checkpoint (exit $RC)"
fi
# claude_code never checkpointed -> T18 item still pending
grep -q '^### claude_code (1 pending)$' "$BOARD" \
  && ok "T22b untouched recipient stays queued" || bad "T22b untouched recipient stays queued"

# T23: board sections render with empty states
if grep -q '^## Agent Status$' "$BOARD" \
  && grep -q '^## Handoff Queue$' "$BOARD" \
  && grep -q '^## Needs attention$' "$BOARD" \
  && grep -q '^## Recent Activity$' "$BOARD" \
  && grep -q '_None.*no blocked checkpoints' "$BOARD"; then
  ok "T23 board sections + empty states render"
else
  bad "T23 board sections + empty states render"
fi

# T24: validator W4/W5 regression — warnings fire, exit 0, RESULT: PASS.
# Guards the warning logic AND the no-crash-on-console contract (a non-ASCII
# warning string once crashed Windows cp874 consoles with UnicodeEncodeError).
PYBIN=""
for c in python3 python py; do
  if command -v "$c" >/dev/null 2>&1; then PYBIN="$c"; break; fi
done
if [ -z "$PYBIN" ]; then
  ok "T24 validator W4/W5 (skipped: no python)"
else
  mkdir -p project-log-md/w24a
  printf '# PS\n\n> **Last Updated:** %s by T24 (x)\n' "$(date '+%Y-%m-%d %H:%M')" > .agents/PROJECT_STATUS.md
  printf '# T\n**Started**: %s\n**Overall Progress:** 10%%\n' "$(date '+%Y-%m-%d')" > .agents/state/task.md
  printf '# s\n' > project-log-md/w24a/session-summary-20200101-0900.md
  printf '%s' '{"handoff_version":"2.0","platform":"w24a","agent":"w24a","timestamp":"2020-01-01T09:00:00+07:00","branch":"main","head_commit":"abc","status":"completed","work_summary":"w","priority_actions":[],"context_for_next_agent":"","to_agent":"w24_typo"}' \
    > "$GEN_SB/handover-w24a-20200101-0900.json"
  printf '%s' '{"to_agent":"w24c"}' > "$GEN_SB/handover-w24b-20200102-0900.json"
  cp "$SCRIPTS/validate_handoff_state.py" .agents/scripts/
  VOUT=$("$PYBIN" .agents/scripts/validate_handoff_state.py --platform w24a 2>&1)
  VRC=$?
  if [ $VRC -eq 0 ] \
    && printf '%s' "$VOUT" | grep -q "is unknown" \
    && printf '%s' "$VOUT" | grep -q "pending directed" \
    && printf '%s' "$VOUT" | grep -q "RESULT: PASS"; then
    ok "T24 validator W4+W5 fire, exit 0, PASS (no crash)"
  else
    bad "T24 validator W4+W5 fire, exit 0, PASS (exit $VRC)"
  fi
fi

# ---------- summary ----------
echo
echo "handoff-system golden tests: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
