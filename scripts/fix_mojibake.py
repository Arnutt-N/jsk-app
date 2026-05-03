"""Recover Thai labels in admin detail pages corrupted by encoding chain bug.

Strategy (mirrors PR #40):
  Phase 1: Context-aware mapping using English structural anchors (status enum
           values, tab ids, JSX element selectors) cross-referenced against the
           last clean commit before the encoding bug.
  Phase 2: Manual contextual replacement for default fallbacks
           ('LOW' priority, 'REJECTED' status, due_date null, etc.).
  Phase 3: Structural element-based replacement for JSX text labels
           (<p uppercase>, <span italic>, <div empty state>, etc.).
  Phase 4: Strip stray C1 control characters (U+0080-U+009F).

The clean reference commit is 79f0dd8 (last commit before mojibake-introducing
9b4ddcc on 2026-04-05). Files that did not exist at 79f0dd8 are skipped from
phase 1 lookup but still go through phase 2-4.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

CLEAN_REF = "b6bc3f0"  # parent of 9b4ddcc — last commit before mojibake-introducing commit
REPO_ROOT = Path(__file__).resolve().parent.parent

TARGETS = [
    "frontend/app/admin/auto-replies/[id]/page.tsx",
    "frontend/app/admin/chat-histories/[lineUserId]/page.tsx",
    "frontend/app/admin/chatbot/broadcast/[id]/page.tsx",
    "frontend/app/admin/friends/[lineUserId]/page.tsx",
    "frontend/app/admin/rich-menus/[id]/edit/page.tsx",
    "frontend/app/admin/users/[id]/page.tsx",
]


def git_show_clean(target: str) -> str | None:
    """Read file content at the clean reference commit, or None if it did not exist."""
    result = subprocess.run(
        ["git", "--no-pager", "show", f"{CLEAN_REF}:{target}"],
        capture_output=True,
        cwd=REPO_ROOT,
    )
    if result.returncode != 0:
        return None
    return result.stdout.decode("utf-8")


def is_mojibake(s: str) -> bool:
    return "เน€เธ" in s or "เธขเธ" in s


def has_thai(s: str) -> bool:
    return any(0x0E00 <= ord(c) <= 0x0E7F for c in s)


def is_control(c: str) -> bool:
    o = ord(c)
    return (o < 0x20 and c not in "\t\n\r") or 0x80 <= o <= 0x9F


def extract_anchored_pairs(text):
    """Return list of (kind, anchor_key, value) tuples for any string carrying Thai or mojibake."""
    pairs = []

    # tab labels: id: 'X', label: 'Y'
    for m in re.finditer(r"id:\s*'(\w+)',\s*label:\s*'([^']+)'", text):
        pairs.append(("tab", m.group(1), m.group(2)))

    # ternary against UPPERCASE enum: 'URGENT' ? 'label'
    for m in re.finditer(r"'([A-Z_][A-Z_0-9]+)'\s*\?\s*'([^']+)'", text):
        pairs.append(("ternary_sq", m.group(1), m.group(2)))
    for m in re.finditer(r'"([A-Z_][A-Z_0-9]+)"\s*\?\s*"([^"]+)"', text):
        pairs.append(("ternary_dq", m.group(1), m.group(2)))

    # radio/select option { value: 'X', label: 'Y' }
    for m in re.finditer(r"\{\s*value:\s*'([A-Z_]+)',\s*label:\s*'([^']+)'", text):
        pairs.append(("option", m.group(1), m.group(2)))

    # switch case: case 'KEY': return 'VALUE'
    for m in re.finditer(r"case\s*'([A-Z_]+)'\s*:\s*return\s*'([^']+)'", text):
        pairs.append(("case_return", m.group(1), m.group(2)))

    # status config object: KEY: { variant: '...', label: '...' }
    for m in re.finditer(r"(\w+):\s*\{\s*variant:\s*'\w+',\s*label:\s*'([^']+)'", text):
        pairs.append(("status_config", m.group(1), m.group(2)))

    # type label maps: text: 'X', image: 'X', etc. (only when value has Thai/mojibake)
    for m in re.finditer(r"^\s*(\w+):\s*'([^']+)',?\s*$", text, re.MULTILINE):
        s = m.group(2)
        if has_thai(s) or is_mojibake(s):
            pairs.append(("kv_pair", m.group(1), s))

    # password strength / scoring: level: N, label: 'X'
    for m in re.finditer(r"level:\s*(\d+),\s*label:\s*'([^']+)'", text):
        pairs.append(("level_label", m.group(1), m.group(2)))

    # placeholder
    for m in re.finditer(r'placeholder="([^"]+)"', text):
        pairs.append(("placeholder_dq", None, m.group(1)))
    for m in re.finditer(r"placeholder='([^']+)'", text):
        pairs.append(("placeholder_sq", None, m.group(1)))

    # toast paired title/description
    for m in re.finditer(
        r"title:\s*'([^']+)'\s*,\s*description:\s*'([^']+)'", text
    ):
        pairs.append(("toast_title", None, m.group(1)))
        pairs.append(("toast_description", None, m.group(2)))

    # <label> bound to a request.<field> reference within the next ~300 chars
    for m in re.finditer(
        r'<label\s+className="[^"]+">([^<\n]+)</label>', text
    ):
        s = m.group(1).strip()
        next_chunk = text[m.end() : m.end() + 300]
        var_match = re.search(r"request\.(\w+)", next_chunk)
        if var_match:
            pairs.append(("label_for_field", var_match.group(1), s))

    # <label>X (...{request.field}...)</label> — labels with parens like ไฟล์แนบ ({count})
    for m in re.finditer(
        r'<label\s+className="[^"]+">([^<\n]+?)\s*\(\{?request\.(\w+)', text
    ):
        pairs.append(("label_for_field", m.group(2), m.group(1).strip()))

    # <span> bound to a request.<field> reference shortly after
    for m in re.finditer(
        r'<span\s+className="[^"]+">([^<\n]+?)</span>', text
    ):
        s = m.group(1).strip()
        next_chunk = text[m.end() : m.end() + 200]
        var_match = re.search(r"\{request\.(\w+)", next_chunk)
        if var_match:
            pairs.append(("span_for_field", var_match.group(1), s))

    return pairs


def build_mapping_phase1(clean_text, head_text):
    """Phase 1: Context-aware mapping using anchored pairs from both versions."""
    mapping = {}
    clean_pairs = extract_anchored_pairs(clean_text)
    head_pairs = extract_anchored_pairs(head_text)

    clean_idx = {(t, k): v for t, k, v in clean_pairs}
    head_idx = {(t, k): v for t, k, v in head_pairs}

    for key, clean_v in clean_idx.items():
        head_v = head_idx.get(key)
        if head_v is None or head_v == clean_v:
            continue
        if is_mojibake(head_v) and has_thai(clean_v):
            mapping.setdefault(head_v, clean_v)

    # Position-match for unkeyed types (placeholders, toast pairs)
    for kind in ("placeholder_dq", "placeholder_sq", "toast_title", "toast_description"):
        cv = [v for t, _, v in clean_pairs if t == kind]
        hv = [v for t, _, v in head_pairs if t == kind]
        for c, h in zip(cv, hv):
            if is_mojibake(h) and has_thai(c) and h != c:
                mapping.setdefault(h, c)

    return mapping


def apply_mapping(text: str, mapping: dict[str, str]) -> tuple[str, int]:
    """Apply mapping with longest-first ordering to avoid partial overlap."""
    count = 0
    for k in sorted(mapping.keys(), key=len, reverse=True):
        if k in text:
            count += text.count(k)
            text = text.replace(k, mapping[k])
    return text, count


def phase25_callsite_pairing(text, clean_text):
    """Phase 2.5: For each unique call-site pattern, extract Thai strings from
    clean and mojibake from HEAD in order, then pair them up by sequence.
    Works because file structure is preserved across the encoding bug — only
    the strings inside the call sites changed."""
    notes = []
    if clean_text is None:
        return text, ["clean reference unavailable, skipping phase 2.5"]

    patterns = [
        ("alert call",                r"alert\(\s*['\"]([^'\"\n]+)['\"]\s*\)"),
        ("setError call",             r"setError\(\s*['\"]([^'\"\n]+)['\"]\s*\)"),
        ("setError fallback",         r"setError\([^,)]+\|\|\s*['\"]([^'\"\n]+)['\"]\s*\)"),
        ("setError .detail fallback", r"setError\([^|)]+\.detail\s*\|\|\s*['\"]([^'\"\n]+)['\"]\s*\)"),
        ("setFetchError call",        r"setFetchError\(\s*['\"]([^'\"\n]+)['\"]\s*\)"),
        ("console.error first arg",   r"console\.error\(\s*['\"]([^'\"\n]+)['\"]"),
        ("setAlert title",            r"setAlert\(\s*\{[^}]*title:\s*['\"]([^'\"\n]+)['\"]"),
        ("setAlert message",          r"setAlert\(\s*\{[^}]*message:\s*['\"]([^'\"\n]+)['\"]"),
        ("PageHeader title attr",     r'<PageHeader\s+title=["\']([^"\'\n]+)["\']'),
        ("PageHeader subtitle attr",  r'subtitle=["\']([^"\'\n]+)["\']'),
        ("Modal title attr",          r'<Modal\s+[^>]*title=["\']([^"\'\n]+)["\']'),
        ("title= var assign",         r"\btitle\s*=\s*['\"]([^'\"\n]+)['\"]"),
        ("displayName fallback",      r"displayName\s*\|\|\s*['\"]([^'\"\n]+)['\"]"),
        ("display_name fallback",     r"display_name\s*\?\?\s*['\"]([^'\"\n]+)['\"]"),
        ("err.message fallback",      r"err\.message\s*:\s*['\"]([^'\"\n]+)['\"]"),
        ("error.message fallback",    r"error\.message\s*:\s*['\"]([^'\"\n]+)['\"]"),
        ("label= attr",               r'\blabel=["\']([^"\'\n]+)["\']'),
    ]

    for description, pat in patterns:
        clean_strs = [s for s in re.findall(pat, clean_text) if has_thai(s)]
        head_strs = re.findall(pat, text)

        mapping = {}
        ci = 0
        for hs in head_strs:
            if not is_mojibake(hs):
                continue
            while ci < len(clean_strs) and not has_thai(clean_strs[ci]):
                ci += 1
            if ci < len(clean_strs):
                mapping[hs] = clean_strs[ci]
                ci += 1

        if mapping:
            text, count = apply_mapping(text, mapping)
            if count:
                notes.append(f"{description}: {count}")

    return text, notes


def phase2_contextual_fallbacks(text: str) -> tuple[str, list[str]]:
    """Phase 2: Replace default-fallback strings using context anchors that bypass enum keys."""
    notes: list[str] = []

    # request.priority === 'LOW' ? 'X' : 'Y'  → 'ปกติ' / 'ไม่ระบุ'
    text, n = re.subn(
        r"(request\.priority === 'LOW' \? )'([^']*เน€เธ[^']*)'( : )'([^']*เน€เธ[^']*)'",
        r"\1'ปกติ'\3'ไม่ระบุ'",
        text,
    )
    if n:
        notes.append(f"LOW priority + default fallback: {n}")

    text, n = re.subn(
        r"(request\.priority === 'LOW' \? )'([^']*เน€เธ[^']*)'(?!\s*:)",
        r"\1'ปกติ'",
        text,
    )
    if n:
        notes.append(f"LOW priority alone: {n}")

    # request.status === 'REJECTED' ? 'X' : 'Y' → 'ยกเลิก' / 'มาใหม่'
    text, n = re.subn(
        r"(request\.status === 'REJECTED' \? )'([^']*เน€เธ[^']*)'( : )'([^']*เน€เธ[^']*)'",
        r"\1'ยกเลิก'\3'มาใหม่'",
        text,
    )
    if n:
        notes.append(f"REJECTED + default: {n}")

    # request.due_date ? <expr> : 'X' → 'ไม่ได้กำหนด'
    text, n = re.subn(
        r"(\{request\.due_date \? .+? : )'([^']*เน€เธ[^']*)'",
        r"\1'ไม่ได้กำหนด'",
        text,
        flags=re.DOTALL,
    )
    if n:
        notes.append(f"due_date fallback: {n}")

    # request.assignee_name || 'X' → 'ยังไม่ได้มอบหมาย'
    text, n = re.subn(
        r"(\{request\.assignee_name \|\| )'([^']*เน€เธ[^']*)'",
        r"\1'ยังไม่ได้มอบหมาย'",
        text,
    )
    if n:
        notes.append(f"assignee fallback (sq): {n}")
    text, n = re.subn(
        r'(\{request\.assignee_name \|\| )"([^"]*เน€เธ[^"]*)"',
        r'\1"ยังไม่ได้มอบหมาย"',
        text,
    )
    if n:
        notes.append(f"assignee fallback (dq): {n}")

    # request.description || 'X' → 'ไม่มีรายละเอียดเพิ่มเติม'
    text, n = re.subn(
        r"(\{request\.description \|\| )'([^']*เน€เธ[^']*)'",
        r"\1'ไม่มีรายละเอียดเพิ่มเติม'",
        text,
    )
    if n:
        notes.append(f"description fallback (sq): {n}")
    text, n = re.subn(
        r'(\{request\.description \|\| )"([^"]*เน€เธ[^"]*)"',
        r'\1"ไม่มีรายละเอียดเพิ่มเติม"',
        text,
    )
    if n:
        notes.append(f"description fallback (dq): {n}")

    # Footer copyright
    text = text.replace("เธขเธ 2026", "© 2026")
    text = text.replace("เธขเธ", "©")

    return text, notes


def phase3_structural_match(text: str, clean_text: str | None) -> tuple[str, list[str]]:
    """Phase 3: Element-based replacement using clean version as the source of truth.

    Walk parallel lists of matched elements; if HEAD content is mojibake and
    clean content is Thai, swap them in.
    """
    notes: list[str] = []
    if clean_text is None:
        return text, ["clean reference unavailable, skipping phase 3"]

    selectors = [
        # (description, regex_with_two_groups: (open, content, close))
        ("p uppercase tertiary", r'(<p className="text-xs font-bold text-text-tertiary uppercase[^"]*">)([^<\n]+)(</p>)'),
        ("span text-xs italic", r'(<span className="text-xs text-text-tertiary italic[^"]*">)([^<\n]+)(</span>)'),
        ("div empty state center py-10", r'(<div className="text-center py-10 text-text-tertiary text-xs italic[^"]*">)([^<\n]+)(</div>)'),
        ("h4 section header", r'(<h4 className="[^"]+">)([^<\n]+)(</h4>)'),
        ("MessageSquare label", r'(<MessageSquare size=\{14\} className="text-text-tertiary" />\s*)([^<\n]+?)(\s*\n)'),
        ("CheckCircle2 button text", r'(<CheckCircle2 size=\{18\} />\s*)([^<\n]+?)(\s*\n)'),
        ("Send button text", r'(<Send size=\{16\}\s*/>\s*)([^<\n]+?)(\s*\n)'),
        ("Activity section heading", r'(<Activity size=\{14\} className="text-cyan-500" />\s*)([^<\n]+?)(\s*\n)'),
        ("Calendar Due Date", r'(<Calendar size=\{14\} className="text-amber-500" />\s*)([^<\n]+?)(\s*\(Due Date\))'),
        ("UserPlus assignee heading", r'(<UserPlus size=\{14\} className="text-primary" />\s*)([^<\n]+?)(\s*\n)'),
    ]

    for description, pattern in selectors:
        clean_matches = re.findall(pattern, clean_text)
        head_matches = list(re.finditer(pattern, text))
        if not head_matches:
            continue

        # Build a list of HEAD content slots, in order
        replacements: list[tuple[int, int, str]] = []
        for i, hm in enumerate(head_matches):
            head_open, head_content, head_close = hm.group(1), hm.group(2).strip(), hm.group(3)
            if not is_mojibake(head_content):
                continue
            if i >= len(clean_matches):
                continue
            clean_open, clean_content, clean_close = clean_matches[i]
            clean_content = clean_content.strip()
            if not has_thai(clean_content):
                continue
            replacements.append((hm.start(), hm.end(), head_open + clean_content + head_close))

        # Apply right-to-left so positions stay valid
        for start, end, replacement in reversed(replacements):
            text = text[:start] + replacement + text[end:]
        if replacements:
            notes.append(f"{description}: {len(replacements)}")

    # Generic JSX-text catch-all using parallel lists by line for any element type
    # Only applies when remaining mojibake is in JSX text positions like ">XXX<"
    jsx_pattern = re.compile(r">([^<>{}\n]*เน€เธ[^<>{}\n]*?)<")
    head_jsx_matches = list(jsx_pattern.finditer(text))
    if head_jsx_matches:
        # Find clean equivalents using the same regex without the mojibake constraint
        clean_jsx_pattern = re.compile(r">([^<>{}\n]*[฀-๿][^<>{}\n]*)<")
        clean_jsx = [m.group(1).strip() for m in clean_jsx_pattern.finditer(clean_text)]

        # Best-effort: greedy align by sequence — only safe when counts match
        # If counts diverge significantly, skip to avoid wrong mapping.
        if abs(len(head_jsx_matches) - len(clean_jsx)) <= 2:
            head_seq = [m.group(1).strip() for m in head_jsx_matches]
            mapping: dict[str, str] = {}
            ci = 0
            for h in head_seq:
                if not is_mojibake(h):
                    continue
                # advance clean cursor until we find a Thai entry
                while ci < len(clean_jsx) and not has_thai(clean_jsx[ci]):
                    ci += 1
                if ci < len(clean_jsx):
                    mapping[h] = clean_jsx[ci]
                    ci += 1
            text, count = apply_mapping(text, mapping)
            if count:
                notes.append(f"JSX text catch-all: {count}")

    return text, notes


def phase35_jsx_body_match(text, clean_text):
    """Phase 3.5: aggressive JSX body content matchers.

    Handles cases that earlier phases miss because the surrounding JSX uses
    icons or class chains that vary across files. Walks parallel sequences
    of matches in clean and HEAD; pairs only when the count matches exactly
    or differs by at most one (best-effort alignment).
    """
    notes = []
    if clean_text is None:
        return text, ["clean reference unavailable, skipping phase 3.5"]

    # JSX-aware tag header pattern: matches `<Tag ...>` where attributes can include
    # JSX expressions in {} (with possible `=>` arrow functions inside)
    def tag_regex(tag, body=r"[^<\n]+?"):
        # `(?:[^<>{}]|\{[^{}]*\})*` — any non-bracket chars OR balanced { ... } pairs
        return rf"<{tag}\b(?:[^<>{{}}]|\{{[^{{}}]*\}})*>\s*({body})\s*</{tag}>"

    patterns = [
        ("Button text", tag_regex("Button")),
        ("Link text",   tag_regex("Link")),
        ("h2 text",     tag_regex("h2")),
        ("h3 text",     tag_regex("h3")),
        ("h4 text",     tag_regex("h4")),
        # `Icon + text </Tag>` — icon with text following before close tag
        ("ArrowLeft + text", r"<ArrowLeft[^>]*/>\s*([^<\n]+?)\s*<"),
        ("Trash2 + text",    r"<Trash2[^>]*/>\s*([^<\n]+?)\s*<"),
        ("Loader2 + text",   r"<Loader2[^>]*/>\s*([^<\n]+?)\s*<"),
        # JSX text just before a closing fragment: `> X </>`
        ("text before </>",  r">\s*([^<>{}\n]+?)\s*</>"),
        # Ternary in JSX expression
        ("ternary in JSX",   r"\{[^{}\n]*\?\s*['\"]([^'\"\n]+)['\"]\s*:\s*['\"]([^'\"\n]+)['\"][^{}\n]*\}"),
        # Standalone ` > XXX </Tag>` JSX text fragments after icons
        ("any > text </Button>", r">\s*([^<>{}\n]+?)\s*</Button>"),
        ("any > text </Link>",   r">\s*([^<>{}\n]+?)\s*</Link>"),
    ]

    for description, pat in patterns:
        clean_groups = re.findall(pat, clean_text)
        head_matches = list(re.finditer(pat, text))

        # Build a sequential mapping
        # For ternary, we have 2 groups per match — flatten
        if description == "ternary in JSX":
            clean_seq = [s.strip() for tup in clean_groups for s in tup]
            head_seq = []
            for m in head_matches:
                head_seq.append(m.group(1).strip())
                head_seq.append(m.group(2).strip())
        else:
            clean_seq = [s.strip() for s in clean_groups]
            head_seq = [m.group(1).strip() for m in head_matches]

        mapping = {}
        ci = 0
        for hs in head_seq:
            if not is_mojibake(hs):
                continue
            while ci < len(clean_seq) and not has_thai(clean_seq[ci]):
                ci += 1
            if ci < len(clean_seq):
                # Only map if reasonably similar in role (mojibake is 5-12x longer than Thai)
                ratio = len(hs) / max(len(clean_seq[ci]), 1)
                if 1.5 <= ratio <= 30:  # forgiving range
                    mapping[hs] = clean_seq[ci]
                ci += 1

        if mapping:
            text, count = apply_mapping(text, mapping)
            if count:
                notes.append(f"{description}: {count}")

    return text, notes


def phase4_strip_controls(text: str) -> tuple[str, int]:
    cleaned = "".join(c for c in text if not is_control(c))
    return cleaned, len(text) - len(cleaned)


def count_mojibake_unique(text: str) -> set[str]:
    found: set[str] = set()
    for m in re.finditer(r"'([^'\n]*เน€เธ[^'\n]*)'", text):
        found.add(m.group(1))
    for m in re.finditer(r'"([^"\n]*เน€เธ[^"\n]*)"', text):
        found.add(m.group(1))
    for m in re.finditer(r">\s*([^<>{}\n]*เน€เธ[^<>{}\n]*?)\s*[<{]", text):
        s = m.group(1).strip()
        if s:
            found.add(s)
    return found


def fix_file(target_rel: str) -> dict:
    target_abs = REPO_ROOT / target_rel
    head_text = target_abs.read_text(encoding="utf-8")
    clean_text = git_show_clean(target_rel)

    initial_count = len(re.findall(r"เน€เธ", head_text))
    initial_unique = len(count_mojibake_unique(head_text))

    notes: list[str] = []

    # Phase 1
    if clean_text:
        mapping = build_mapping_phase1(clean_text, head_text)
        head_text, n1 = apply_mapping(head_text, mapping)
        notes.append(f"Phase 1 (context-aware): {n1} occurrences via {len(mapping)} unique mappings")

    # Phase 2
    head_text, p2_notes = phase2_contextual_fallbacks(head_text)
    notes.extend(f"Phase 2: {n}" for n in p2_notes)

    # Phase 2.5
    head_text, p25_notes = phase25_callsite_pairing(head_text, clean_text)
    notes.extend(f"Phase 2.5: {n}" for n in p25_notes)

    # Phase 3
    head_text, p3_notes = phase3_structural_match(head_text, clean_text)
    notes.extend(f"Phase 3: {n}" for n in p3_notes)

    # Phase 3.5: aggressive JSX body content matchers
    head_text, p35_notes = phase35_jsx_body_match(head_text, clean_text)
    notes.extend(f"Phase 3.5: {n}" for n in p35_notes)

    # Phase 4
    head_text, removed = phase4_strip_controls(head_text)
    if removed:
        notes.append(f"Phase 4: stripped {removed} control chars")

    target_abs.write_text(head_text, encoding="utf-8")

    final_count = len(re.findall(r"เน€เธ", head_text))
    final_unique = len(count_mojibake_unique(head_text))
    final_thai = sum(1 for c in head_text if 0x0E00 <= ord(c) <= 0x0E7F)

    return {
        "file": target_rel,
        "initial_mojibake_substrings": initial_count,
        "initial_unique_strings": initial_unique,
        "final_mojibake_substrings": final_count,
        "final_unique_strings": final_unique,
        "final_thai_chars": final_thai,
        "notes": notes,
    }


def main() -> int:
    targets = TARGETS if len(sys.argv) == 1 else sys.argv[1:]
    results = [fix_file(t) for t in targets]

    print(json.dumps(results, ensure_ascii=False, indent=2))
    failures = [r for r in results if r["final_unique_strings"] > 0]
    if failures:
        print(f"\n{len(failures)} file(s) still contain mojibake — needs manual follow-up:")
        for r in failures:
            print(f"  - {r['file']}: {r['final_unique_strings']} unique mojibake remain")
        return 1
    print("\nAll files clean.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
