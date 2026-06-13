import { describe, it, expect } from 'vitest';
import { mergeTimeline, type AuditLogEntry, type TimelineComment } from '../timeline-merge';

function comment(id: number, createdAt: string): TimelineComment {
    return { id, content: `comment-${id}`, user_id: 1, display_name: 'Admin A', created_at: createdAt };
}

function audit(id: number, createdAt: string | null, fields?: AuditLogEntry['details']): AuditLogEntry {
    return {
        id,
        admin_name: 'Admin B',
        action: 'edit_request_details',
        details: fields === undefined
            ? { fields: { phone_number: { old: '081', new: '089' } } }
            : fields,
        created_at: createdAt,
    };
}

describe('mergeTimeline', () => {
    it('interleaves audits between comments in chronological order', () => {
        const comments = [comment(1, '2026-06-12T10:00:00+00:00'), comment(2, '2026-06-12T11:00:00+00:00')];
        const audits = [audit(9, '2026-06-12T10:30:00+00:00')];

        const result = mergeTimeline(comments, audits);

        expect(result.map((i) => i.kind)).toEqual(['comment', 'audit', 'comment']);
        expect(result[1].kind === 'audit' && result[1].audit.id).toBe(9);
    });

    it('sorts regardless of incoming order (audit API returns DESC)', () => {
        const audits = [audit(2, '2026-06-12T12:00:00+00:00'), audit(1, '2026-06-12T09:00:00+00:00')];

        const result = mergeTimeline([], audits);

        expect(result.map((i) => i.kind === 'audit' && i.audit.id)).toEqual([1, 2]);
    });

    it('places audit before comment when timestamps tie', () => {
        const ts = '2026-06-12T10:00:00+00:00';
        const result = mergeTimeline([comment(1, ts)], [audit(9, ts)]);

        expect(result.map((i) => i.kind)).toEqual(['audit', 'comment']);
    });

    it('drops malformed audits (missing created_at or empty fields diff)', () => {
        const audits = [
            audit(1, null),
            audit(2, '2026-06-12T10:00:00+00:00', { fields: {} }),
            audit(3, '2026-06-12T10:00:00+00:00', null),
            audit(4, '2026-06-12T10:00:00+00:00'),
        ];

        const result = mergeTimeline([], audits);

        expect(result).toHaveLength(1);
        expect(result[0].kind === 'audit' && result[0].audit.id).toBe(4);
    });

    it('returns empty array for empty inputs', () => {
        expect(mergeTimeline([], [])).toEqual([]);
    });

    it('keeps comment-only timelines in their original order', () => {
        const comments = [comment(1, '2026-06-12T10:00:00+00:00'), comment(2, '2026-06-12T11:00:00+00:00')];

        const result = mergeTimeline(comments, []);

        expect(result.map((i) => i.kind === 'comment' && i.comment.id)).toEqual([1, 2]);
    });
});
