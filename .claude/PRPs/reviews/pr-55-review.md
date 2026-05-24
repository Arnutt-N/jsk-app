# PR Review: #55 — fix(media): jpg/png miscategorized as OTHER + backfill existing rows

**Reviewed**: 2026-05-14
**Author**: Arnutt-N
**Branch**: `fix/media-categorization-fallback` → `main`
**Scope**: 3 files / +146 / -20 (2 backend source + 1 alembic migration)
**Decision**: ✅ **APPROVE with comments**

## Summary

Clean targeted fix for the JPG/PNG miscategorization bug. The fallback logic in `detect_category` is well-thought-out (preserves client-supplied MIME, only falls back when generic), the upload-side wiring is symmetric across both endpoints, and the alembic backfill is correctly scoped to "upgrade OTHER → specific" with no destructive operations. The only meaningful gap is the absence of unit tests for the new fallback path — author flagged this as a known followup in the PR description, but it deserves to be tracked.

## Findings

### CRITICAL
None.

### HIGH
None.

### MEDIUM

#### M-1: Missing unit test for `detect_category` fallback path
**Location**: `backend/app/models/media_file.py:36-72`

The new behaviour ("generic MIME + filename → guess from filename") has at least three distinct branches and is precisely the kind of logic that benefits from explicit tests:

| Case | Input | Expected |
|------|-------|----------|
| Specific MIME | `("image/jpeg", "photo.jpg")` | IMAGE |
| Generic MIME + good filename | `("application/octet-stream", "photo.jpg")` | IMAGE |
| Empty MIME + good filename | `(None, "doc.pdf")` | DOCUMENT |
| Generic MIME + extension-less filename | `("application/octet-stream", "photo")` | OTHER |
| Specific MIME never overridden | `("text/plain", "photo.jpg")` | DOCUMENT (NOT IMAGE) |
| Empty everything | `(None, None)` | OTHER |

The last row is especially important — it's the "safe against malicious client" guarantee that the comment promises. A regression test would catch any future refactor that breaks it.

Author already acknowledged this in the PR body:
> Unit test for `detect_category` with `application/octet-stream` + `photo.jpg` → `IMAGE` (deferred — call out in review)

**Suggested fix**: Add `backend/tests/test_detect_category.py` with `pytest.mark.parametrize` covering the matrix above. Not required to block this PR, but should be a followup before any further changes to `detect_category`.

---

#### M-2: SQL string interpolation in migration (currently safe, fragile pattern)
**Location**: `backend/alembic/versions/o5p6q7r8s9t0_recategorize_media_files_by_extension.py:68-73`

```python
conditions = " OR ".join(f"LOWER(filename) LIKE '%{ext}'" for ext in exts)
return (
    "UPDATE media_files "
    f"SET category = '{target_category}' "
    f"WHERE category = 'OTHER' AND ({conditions})"
)
```

The `ext` values come from hardcoded module-level tuples (`_IMAGE_EXTS` etc.), so there is **no SQL-injection risk today**. But:

- The f-string pattern teaches future maintainers that string interpolation into SQL is fine here. The next person who edits this file might add a parameter sourced from elsewhere.
- Static analysis tools (`bandit`, `sqlfluff`) will flag this on every scan even though it's benign.

**Suggested fix** (optional, post-merge): Use `sqlalchemy.text(...).bindparams(...)` or pass the extensions as an array parameter:

```python
op.execute(
    sa.text(
        "UPDATE media_files SET category = :cat "
        "WHERE category = 'OTHER' "
        "AND EXISTS (SELECT 1 FROM unnest(CAST(:exts AS text[])) e "
        "WHERE LOWER(filename) LIKE '%' || e)"
    ).bindparams(cat=target_category, exts=list(exts))
)
```

Or simpler — keep the current shape but add a `# noqa: S608` comment + a unit test that proves the SQL is well-formed for each category.

**Severity rationale**: MEDIUM — fragile pattern, not a current vulnerability. Migrations get less review than code, so it's worth strengthening defensively.

---

#### M-3: No local dry-run verification documented
**Location**: PR description checkboxes

The PR description includes this unchecked item:
> [ ] Local migration dry-run (apply + reverse + verify count by category)

For a migration that touches user-visible data (the file count badges in `/admin/files`), it's worth verifying:

1. The `LIKE` patterns actually match expected rows in the dev DB
2. The 4 sequential UPDATEs don't deadlock or take excessive time
3. The downgrade no-op leaves the table in a stable state

**Suggested action**: Before merge, run on a staging copy of the DB:
```bash
# Snapshot counts
psql -c "SELECT category, COUNT(*) FROM media_files GROUP BY category"
# Apply
python scripts/db_target.py alembic --target local upgrade head
# Verify shift OTHER → IMAGE/VIDEO/AUDIO/DOCUMENT
psql -c "SELECT category, COUNT(*) FROM media_files GROUP BY category"
```

### LOW

#### L-1: 4 sequential UPDATEs vs 1 CASE WHEN
**Location**: `backend/alembic/versions/o5p6q7r8s9t0_...py:78-81`

For very large `media_files` tables (10k+ rows), 4 sequential UPDATEs with `LIKE` produce 4 full table scans. Could be consolidated:

```sql
UPDATE media_files
SET category = CASE
  WHEN LOWER(filename) LIKE '%.jpg' OR ... THEN 'IMAGE'
  WHEN LOWER(filename) LIKE '%.mp4' OR ... THEN 'VIDEO'
  ...
  ELSE category  -- keep existing
END
WHERE category = 'OTHER'
```

Current shape is acceptable for this project's table size (admin-only uploads, expected <1000 rows). Filing as LOW.

#### L-2: No docstring update on `MediaFile` model
**Location**: `backend/app/models/media_file.py:75+`

The `MediaFile.category` column comment doesn't mention that the new fallback exists. If someone reads the model file looking for "how is category determined?", they only see the type. Minor — the `detect_category` function above it has the explanation. LOW.

#### L-3: Filename guard could be stricter
**Location**: `backend/app/models/media_file.py:54`

```python
if (not mt or mt == "application/octet-stream") and filename:
```

`mimetypes.guess_type(filename)` is tolerant of edge cases (returns `(None, None)` for empty or extension-less strings), so the current guard is sufficient. But it's worth noting:
- `filename = ""` → guard passes? No (`""` is falsy). ✅
- `filename = "..."` (dots only) → `guess_type` returns `(None, None)` → falls through to OTHER. ✅
- `filename = "../../../etc/passwd"` → `guess_type` looks only at suffix `passwd` (no extension match), returns `(None, None)` → OTHER. ✅ (path-traversal safe)

No action needed. Documented for future readers.

## Validation Results

| Check | Result | Source |
|---|---|---|
| Python syntax | ✅ Pass | Local `ast.parse` run during implementation |
| Backend Pytest | ✅ Pass | CI run 25817007725 (58s) |
| Frontend Lint and Build | ✅ Pass | CI run 25817007725 (1m6s) |
| Playwright Smoke | ✅ Pass | CI run 25817007783 (7m31s) |
| Source Encoding Scan | ✅ Pass | CI run 25817007771 (8s) |
| Vercel Preview | ✅ Deployed | — |
| Unit test for `detect_category` fallback | ⏸️ Not added | Author flagged as followup |
| Local migration dry-run | ⏸️ Not documented | Recommend before merge |

## Files Reviewed

| File | Type | Verdict |
|---|---|---|
| `backend/app/models/media_file.py` | Modified | ✅ Clean. Filename fallback is correctly guarded against overriding specific MIMEs. Frozenset for `_DOCUMENT_MIMES` is a nice perf touch. Modern `str \| None` syntax is fine on the project's Python 3.13. |
| `backend/app/api/v1/endpoints/media.py` | Modified | ✅ Clean. Both upload sites (admin + legacy) now wire filename through symmetrically. The `_serialise` helper unchanged — JSON shape stable. |
| `backend/alembic/versions/o5p6q7r8s9t0_...py` | Added | ⚠️ M-2 (SQL string interpolation). Migration chain (`n4o5p6q7r8s9` → `o5p6q7r8s9t0`) is correct. Upgrade is idempotent; downgrade is intentional no-op. |

## Cross-Cutting Concerns

### Security
- ✅ No new auth surface
- ✅ No exposed secrets
- ✅ Path-traversal safe: `mimetypes.guess_type` only inspects the string suffix, never opens the file
- ⚠️ M-2: SQL interpolation is benign-today but fragile

### Migration Safety
- ✅ Upgrade only adds information (OTHER → specific), never reverses
- ✅ Idempotent — re-running has no further effect
- ✅ Downgrade is documented no-op (clear rationale for why)
- ✅ Migration chain correctly linked from latest revision
- ⚠️ M-3: Local dry-run not yet documented

### Backward Compatibility
- ✅ `detect_category(mime_type)` signature is backward compatible — `filename` is optional with default `None`
- ✅ No DB schema change (column types unchanged); only data UPDATEs
- ✅ API contract unchanged — `_serialise` shape identical

### Performance
- ✅ Frozenset for document MIMEs is O(1)
- ⚠️ L-1: 4 sequential UPDATEs (acceptable for table size, optimization filed as LOW)

## Decision Rationale

**APPROVE with comments** because:
1. Bug fix is correct and well-defended (preserves explicit MIME, falls back only on generic)
2. Migration is safe — no DELETEs, idempotent, documented no-op downgrade
3. All CI checks pass
4. No CRITICAL or HIGH findings

The MEDIUM findings are followups, not blockers:
- M-1 (unit test) — author already flagged in PR body
- M-2 (SQL pattern) — currently safe, refactor opportunity
- M-3 (dry-run) — operational check before merge, not a code change

**Recommended action**: Merge this PR + open a followup issue for M-1 (unit tests). M-3 should be run by the merger before the merge to confirm the migration behaves as expected on a real DB snapshot.

## Suggested Pre-Merge Checklist
- [x] CI green
- [ ] M-3: Run migration dry-run on a staging snapshot — verify counts shift from OTHER → specific
- [ ] (Optional) Add M-1 unit test in this PR, or open followup issue
- [ ] Merge with `gh pr merge 55 --squash`
- [ ] Verify on production: `/admin/files` shows updated counts after deploy + migration

## Suggested Post-Merge Followups
- Issue: `backend/tests/test_detect_category.py` — parametrized test for the 6 cases in M-1
- Issue: Consider hardening migration helpers with `sa.text(...).bindparams(...)` pattern repo-wide
