# PRP — Deep Review of Qoder Audit and Architecture Reports

## Phase 1 — Establish Evidence

- Parse both artifacts by section and extract consequential claims.
- Capture working-tree status, diff statistics, file counts, and test assertions.
- Use the repository graph for architecture and dependency evidence.

## Phase 2 — Independent Review Axes

- Audit axis: verify fixes, validation gates, completeness, and residual risk.
- Architecture axis: verify seams, duplication, coupling, scale, and prioritization.

## Phase 3 — Cross-Review

- Compare both artifacts for contradictions and missing dependencies.
- Recheck severe findings directly against exact source spans.
- Separate hard factual errors from design judgments.

## Phase 4 — Report

- Present findings first, ordered by severity.
- Cite exact artifact and source locations.
- Summarize strengths, confidence limits, and recommended next actions.

## Validation

- Reproduce lightweight repository metrics locally.
- Inspect relevant diffs and tests without altering application files.
- Confirm every final finding has direct evidence.

