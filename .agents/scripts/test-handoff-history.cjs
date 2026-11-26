'use strict';

const assert = require('node:assert/strict');
const { buildHandoffHistory } = require('./handoff-new.cjs');

const original = Array.from({ length: 34 }, (_, i) => ({
  timestamp: `2026-11-2${String(i % 10).padStart(2, '0')}T00:00:00+07:00-${i}`,
  platform: 'codex',
  branch: 'main',
  head: `head-${i}`,
  status: 'completed',
}));

let session = { handoff_history: original };

for (const head of ['new-1', 'new-2']) {
  const result = buildHandoffHistory(session, {
    timestamp: `2026-11-27T00:00:00+07:00-${head}`,
    platform: 'claude_code',
    branch: 'main',
    head,
    status: 'completed',
  });
  session = {
    handoff_history: result.compact,
    handoff_history_archive: result.archive,
  };
}

assert.equal(session.handoff_history.length, 20);
assert.equal(session.handoff_history_archive.length, 36);
for (const entry of original) {
  assert.ok(session.handoff_history_archive.some((e) => e.head === entry.head), entry.head);
}
assert.ok(session.handoff_history.some((e) => e.head === 'new-2'));
assert.equal(
  session.handoff_history_archive.filter((e) => e.head === 'new-1').length,
  1
);

const docShaped = { from: 'codex', timestamp: '2026-11-27T01:00:00+07:00', task: 'review', status: 'completed' };
const docResult = buildHandoffHistory(
  { handoff_history: [{ ...docShaped, from: 'cline', task: 'other' }] },
  docShaped
);
assert.equal(docResult.archive.length, 2);
assert.equal(docResult.compact[0].task, 'review');

const malformed = buildHandoffHistory(
  { handoff_history: [null, 'bad', { timestamp: '2026-11-27T02:00:00+07:00', head: 'ok' }] },
  { timestamp: '2026-11-27T03:00:00+07:00', head: 'new' }
);
assert.equal(malformed.archive.length, 2);
assert.equal(malformed.compact[0].head, 'new');

const canonical = { timestamp: '2026-11-27T04:00:00+07:00', platform: 'codex', head: 'same', status: 'completed' };
const reordered = { status: 'completed', head: 'same', platform: 'codex', timestamp: '2026-11-27T04:00:00+07:00' };
const deduped = buildHandoffHistory({ handoff_history: [canonical] }, reordered);
assert.equal(deduped.archive.length, 1);

const mixedOffsets = buildHandoffHistory(
  { handoff_history: [
    { timestamp: '2026-11-26T20:00:00Z', platform: 'codex', head: 'older' },
    { timestamp: '2026-11-27T09:00:00+07:00', platform: 'codex', head: 'newer' },
  ] },
  { timestamp: '2026-11-27T10:00:00+07:00', platform: 'claude_code', head: 'newest' }
);
assert.deepEqual(mixedOffsets.compact.map((e) => e.head), ['newest', 'newer', 'older']);

console.log('handoff history keeps all 34 original entries across two handoffs');
