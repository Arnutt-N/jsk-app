"""Idempotent Sheet1 (cols A-K) -> intent rows + media + reply objects.

Source schema (legacy SakonNakhonBot Google Sheet, exported to CSV):
  intent, response, imageType, imageData, imageAltText, aspectRatio,
  fullSizeUrls, previewUrls, size, aspectMode, backgroundColor

Design record: `.claude/PRPs/plans/2026-10-13-sakonnakhon-arena-synthesis.md`.
PRD: `.claude/PRPs/prds/2026-10-13-sakonnakhon-content-reuse.prd.md`.

Identity without schema changes (natural keys):
  categories  -> exact name (marked "source: sakonnakhon" in description)
  keywords    -> (category_id, keyword)
  responses   -> the single active response of a pack category (update in place)
  objects     -> object_id "$jsk_<12hex of group key>"
  media       -> filename "sakonnakhon/<slug>.<ext>"
  settings    -> key (WELCOME_TEMPLATE, ZERO_HANDOFF_ENABLED)

Usage:
  python backend/scripts/seed_sakonnakhon_content.py Sheet1.csv          # dry run
  python backend/scripts/seed_sakonnakhon_content.py Sheet1.csv --apply  # write
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import hashlib
import json
import re
from dataclasses import dataclass, field
from pathlib import Path


# ---------------------------------------------------------------------------
# Pure layer: no third-party imports, no DB, fully unit-testable.
# ---------------------------------------------------------------------------

SOURCE_MARKER = "source: sakonnakhon"
SETTING_WELCOME_TEMPLATE = "WELCOME_TEMPLATE"
SETTING_ZERO_HANDOFF = "ZERO_HANDOFF_ENABLED"
DEFAULT_WELCOME = (
    "ยินดีต้อนรับสู่ LINE Official Account สำนักงานยุติธรรมจังหวัดสกลนคร! 🎉\n\n"
    "ขอบคุณที่เป็นเพื่อนกับเราค่ะ\n"
    "หากต้องการความช่วยเหลือ พิมพ์ 'เมนู' หรือ '1' เพื่อดูบริการต่างๆ"
)

HEADER_ORDER = [
    "intent", "response", "imageType", "imageData", "imageAltText",
    "aspectRatio", "fullSizeUrls", "previewUrls", "size", "aspectMode",
    "backgroundColor",
]
SILENT_RESPONSES = frozenset({"line-oa", "no-action"})
OBJECT_REF_RE = re.compile(r"\$([A-Za-z_][A-Za-z0-9_]*)")
DOLLAR_DIGITS_RE = re.compile(r"\$(\d)")
SELFHOST_EXTS = frozenset({".jpg", ".jpeg", ".png"})
SELFHOST_MIMES = frozenset({"image/jpeg", "image/png"})
MAX_MEDIA_BYTES = 10 * 1024 * 1024
MAX_CAROUSEL_BUBBLES = 12
MAX_TEMPLATE_COLUMNS = 10
OBJECT_ID_LEN = 12


@dataclass(frozen=True)
class AnsweredRow:
    keyword: str
    answer: str
    image_type: str  # none | single | carousel | flex_carousel (lowercased)
    image_data: str
    alt_text: str
    aspect_ratio: str
    full_size_urls: str
    preview_urls: str
    size: str
    aspect_mode: str
    background_color: str


@dataclass(frozen=True)
class SilentRow:
    keyword: str


@dataclass(frozen=True)
class AnswerGroup:
    """Rows sharing one answer (+ media). One category per group."""
    name: str  # first keyword, truncated for display
    keywords: tuple[str, ...]
    answer: str
    image_type: str
    image_urls: tuple[str, ...]
    full_urls: tuple[str, ...]
    preview_urls: tuple[str, ...]
    alt_text: str
    aspect_ratio: str
    size: str
    aspect_mode: str
    background_color: str
    slug: str  # stable content-hash fragment


@dataclass
class ImportPlan:
    groups: list[AnswerGroup] = field(default_factory=list)
    silent_skipped: int = 0
    junk_skipped: int = 0
    overlap: list[str] = field(default_factory=list)
    # Structured twin of `overlap` for the supersede step: (keyword, source)
    # where source is "intent" (live intent_keywords) or "autoreply".
    overlap_keywords: list[tuple[str, str]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def can_apply(self, *, force_with_overlap: bool = False) -> bool:
        return not self.overlap or force_with_overlap


@dataclass
class ImportReport:
    categories_created: int = 0
    categories_reused: int = 0
    categories_deactivated: int = 0
    keywords_created: int = 0
    keywords_skipped: int = 0
    responses_created: int = 0
    responses_updated: int = 0
    objects_created: int = 0
    objects_updated: int = 0
    objects_deactivated: int = 0
    media_hosted: int = 0
    media_hotlinked: int = 0
    media_failed: list[str] = field(default_factory=list)
    settings_set: int = 0
    superseded_categories: int = 0
    superseded_autoreplies: int = 0


def _norm(text: str | None) -> str:
    return (text or "").strip()


def _split_urls(value: str | None) -> tuple[str, ...]:
    return tuple(u.strip() for u in (value or "").split(",") if u.strip())


def load_rows(source: Path) -> list[dict]:
    """Read CSV by header name (utf-8-sig). Unknown/extra columns ignored."""
    with source.open("r", encoding="utf-8-sig", newline="") as fh:
        sample = fh.read(4096)
        fh.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;")
        except csv.Error:
            dialect = csv.excel
        # The sniffer misdetects quoting on Thai text with stray `"`
        # (doublequote=False splits rows at embedded newlines). Standard
        # CSV escaping always applies to our exports.
        dialect.doublequote = True
        reader = csv.DictReader(fh, dialect=dialect)
        if reader.fieldnames and all(
            (h or "").strip() == "" for h in reader.fieldnames
        ):
            # No usable header: fall back to positional A-K mapping.
            fh.seek(0)
            reader = csv.DictReader(fh, fieldnames=HEADER_ORDER, dialect=dialect)
        return [dict(r) for r in reader]


def _row_get(raw: dict, name: str, index: int) -> str:
    if name in raw and raw[name] is not None:
        return str(raw[name])
    values = list(raw.values())
    if index < len(values) and values[index] is not None:
        return str(values[index])
    return ""


def classify_row(raw: dict) -> AnsweredRow | SilentRow | None:
    """Header-normalized raw row -> AnsweredRow | SilentRow | None (junk).

    Raises ValueError on keyword "0": zero is behavior (handoff), not content.
    """
    keyword = _norm(_row_get(raw, "intent", 0))
    answer = _norm(_row_get(raw, "response", 1))
    if not keyword:
        return None
    if keyword.strip() == "0":
        raise ValueError(
            "keyword '0' is behavior, not content "
            "(handled by the exact-'0' handoff branch, never import it)"
        )
    if not answer or answer.lower() in SILENT_RESPONSES:
        return SilentRow(keyword=keyword)
    return AnsweredRow(
        keyword=keyword,
        answer=answer,
        image_type=_norm(_row_get(raw, "imageType", 2)).lower() or "none",
        image_data=_norm(_row_get(raw, "imageData", 3)),
        alt_text=_norm(_row_get(raw, "imageAltText", 4)) or "รูปภาพประกอบ",
        aspect_ratio=_norm(_row_get(raw, "aspectRatio", 5)) or "auto",
        full_size_urls=_norm(_row_get(raw, "fullSizeUrls", 6)),
        preview_urls=_norm(_row_get(raw, "previewUrls", 7)),
        size=_norm(_row_get(raw, "size", 8)),
        aspect_mode=_norm(_row_get(raw, "aspectMode", 9)),
        background_color=_norm(_row_get(raw, "backgroundColor", 10)),
    )


def _group_key(row: AnsweredRow) -> str:
    return json.dumps(
        [row.answer, row.image_type, row.image_data, row.alt_text],
        ensure_ascii=False,
        sort_keys=True,
    )


def _slug(key: str) -> str:
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:OBJECT_ID_LEN]


def group_rows(answered: list[AnsweredRow]) -> list[AnswerGroup]:
    """Merge rows with identical answer+media into one category group.

    Stable across runs: grouping key and slug derive from content only.
    """
    buckets: dict[str, list[AnsweredRow]] = {}
    for row in answered:
        buckets.setdefault(_group_key(row), []).append(row)
    groups = []
    for key in sorted(buckets):
        rows = buckets[key]
        first = rows[0]
        full = _split_urls(first.full_size_urls) or _split_urls(first.image_data)
        prev = _split_urls(first.preview_urls) or _split_urls(first.image_data)
        groups.append(
            AnswerGroup(
                name=first.keyword[:200],
                keywords=tuple(r.keyword for r in rows),
                answer=first.answer,
                image_type=first.image_type,
                image_urls=_split_urls(first.image_data),
                full_urls=full,
                preview_urls=prev,
                alt_text=first.alt_text,
                aspect_ratio=first.aspect_ratio,
                size=first.size,
                aspect_mode=first.aspect_mode,
                background_color=first.background_color,
                slug=_slug(key),
            )
        )
    return groups


def is_selfhostable(url: str, size_bytes: int | None = None) -> bool:
    """Pure classifier: only JPEG/PNG within the size cap are self-hosted.

    GIF/WebP/video/audio stay as external hotlinks (media module rejects them).
    """
    path = (url or "").split("?")[0].lower()
    ext = "." + path.rsplit(".", 1)[-1] if "." in path.rsplit("/", 1)[-1] else ""
    if ext not in SELFHOST_EXTS:
        return False
    if size_bytes is not None and size_bytes > MAX_MEDIA_BYTES:
        return False
    return True


def dollar_warnings(answer: str, keyword: str) -> list[str]:
    """`$`-refs are greedy: `$100` parses as object ref `100` and vanishes."""
    out = []
    for m in DOLLAR_DIGITS_RE.finditer(answer or ""):
        out.append(
            f"$<digits> collision in answer for keyword {keyword!r}: "
            f"'${m.group(1)}' will parse as a reply-object ref and vanish"
        )
    return out


def build_plan(
    answered: list[AnsweredRow],
    silent_count: int,
    junk_count: int,
    live_keywords: set[str],
    live_autoreplies: set[str],
) -> ImportPlan:
    """Pure: rows + live snapshots -> plan. No DB, no network."""
    plan = ImportPlan(silent_skipped=silent_count, junk_skipped=junk_count)
    plan.groups = group_rows(answered)
    for group in plan.groups:
        for keyword in group.keywords:
            lowered = keyword.lower()
            if lowered in live_keywords:
                plan.overlap.append(f"keyword {keyword!r} already in intent_keywords")
                plan.overlap_keywords.append((keyword, "intent"))
            if lowered in live_autoreplies:
                plan.overlap.append(f"keyword {keyword!r} also matches auto_replies")
                plan.overlap_keywords.append((keyword, "autoreply"))
        plan.warnings.extend(dollar_warnings(group.answer, group.keywords[0]))
        if group.image_type == "carousel" and len(group.image_urls) > MAX_TEMPLATE_COLUMNS:
            plan.warnings.append(
                f"carousel for {group.keywords[0]!r} has "
                f"{len(group.image_urls)} images, LINE allows "
                f"{MAX_TEMPLATE_COLUMNS} (extras dropped)"
            )
        if group.image_type == "flex_carousel" and len(group.image_urls) > MAX_CAROUSEL_BUBBLES:
            plan.warnings.append(
                f"flex carousel for {group.keywords[0]!r} has "
                f"{len(group.image_urls)} images, capped at "
                f"{MAX_CAROUSEL_BUBBLES} (extras dropped)"
            )
    # Deterministic: same input always yields the same plan.
    plan.overlap.sort()
    plan.warnings.sort()
    return plan


# ---------------------------------------------------------------------------
# Payload builders (pure JSON shapes; SDK objects are built at send time).
# ---------------------------------------------------------------------------


def _flex_aspect_ratio(aspect_ratio: str) -> str:
    if aspect_ratio == "legal":
        return "4:5"
    return aspect_ratio if aspect_ratio and aspect_ratio != "auto" else "3:2"


def _flex_aspect_mode(aspect_ratio: str, aspect_mode: str) -> str:
    if aspect_mode in ("cover", "fit"):
        return aspect_mode
    if aspect_ratio in ("legal", "1:1"):
        return "fit"
    return "cover"


def build_flex_carousel_payload(group: AnswerGroup) -> dict:
    """Whole carousel as ONE flex payload (avoids the inline hero-strip trap)."""
    bubbles = []
    for url, full, prev in zip(
        group.image_urls[:MAX_CAROUSEL_BUBBLES],
        list(group.full_urls) + [None] * MAX_CAROUSEL_BUBBLES,
        list(group.preview_urls) + [None] * MAX_CAROUSEL_BUBBLES,
    ):
        hero: dict = {
            "type": "image",
            "url": prev or url,
            "size": "full",
            "aspectMode": _flex_aspect_mode(group.aspect_ratio, group.aspect_mode),
            "aspectRatio": _flex_aspect_ratio(group.aspect_ratio),
            "action": {"type": "uri", "uri": full or url},
        }
        bubble: dict = {"type": "bubble", "hero": hero}
        if group.background_color:
            bubble["styles"] = {"body": {"backgroundColor": group.background_color}}
        bubbles.append(bubble)
    return {"type": "carousel", "contents": bubbles}


def build_template_carousel_payload(group: AnswerGroup) -> dict:
    """Legacy `carousel` imageType -> template image_carousel (<=10 columns)."""
    columns = []
    for i, url in enumerate(group.image_urls[:MAX_TEMPLATE_COLUMNS]):
        label = (group.alt_text or f"รูปที่ {i + 1}")[:20]
        columns.append(
            {
                "imageUrl": url,
                "action": {"type": "message", "label": label, "text": label},
            }
        )
    return {"template": {"type": "image_carousel", "columns": columns}}


# ---------------------------------------------------------------------------
# DB + network layer (thin shell over the pure plan).
# ---------------------------------------------------------------------------


async def _fetch_bytes(url: str, *, timeout_s: float = 20.0) -> tuple[bytes, str]:
    import httpx

    async with httpx.AsyncClient(timeout=timeout_s, follow_redirects=True) as client:
        async with client.stream("GET", url) as resp:
            resp.raise_for_status()
            chunks: list[bytes] = []
            total = 0
            async for chunk in resp.aiter_bytes():
                total += len(chunk)
                if total > MAX_MEDIA_BYTES:
                    raise ValueError(f"exceeds {MAX_MEDIA_BYTES} byte cap: {url}")
                chunks.append(chunk)
            return b"".join(chunks), resp.headers.get("content-type", "")


def _sniff_mime(data: bytes) -> str | None:
    from app.utils.mime_sniff import sniff_mime

    return sniff_mime(data)


async def apply_plan(plan: ImportPlan, db, *, source_label: str = "",
                   deactivate_stale: bool = False,
                   full_sync: bool = False) -> ImportReport:
    """Execute a plan. Idempotent: same plan twice -> second run changes nothing.

    Crash-safe: per-row upserts by natural key; re-running converges.
    Never deletes: stale pack rows are deactivated, never removed.
    With deactivate_stale=True, overlapping live rows NOT owned by this
    import are deactivated first (audit-logged, reversible via is_active).
    The pack-owned stale sweep runs ONLY with full_sync=True: a partial plan
    must never retire categories it did not see (a test/dev single-group
    apply once swept all 61 pack categories — this flag is the guard).
    """
    from sqlalchemy import select

    from app.core.config import settings
    from app.models.intent import (
        IntentCategory,
        IntentKeyword,
        IntentResponse,
        MatchType,
        ReplyType,
    )
    from app.models.media_file import MediaFile, detect_category
    from app.models.reply_object import ObjectType, ReplyObject
    from app.services.settings_service import SettingsService

    import secrets as secrets_mod

    report = ImportReport()
    seen_categories: set[str] = set()
    seen_objects: set[str] = set()

    if deactivate_stale and plan.overlap_keywords:
        cats, autos = await _supersede_overlap(db, plan)
        report.superseded_categories += cats
        report.superseded_autoreplies += autos

    for group in plan.groups:
        category = (
            await db.execute(
                select(IntentCategory).where(IntentCategory.name == group.name)
            )
        ).scalar_one_or_none()
        if category is None:
            category = IntentCategory(
                name=group.name,
                description=f"{SOURCE_MARKER} import"
                + (f" ({source_label})" if source_label else ""),
                is_active=True,
            )
            db.add(category)
            await db.flush()
            report.categories_created += 1
        else:
            if not category.is_active:
                category.is_active = True
            if not (category.description or "").startswith(SOURCE_MARKER):
                category.description = (
                    f"{SOURCE_MARKER} import"
                    + (f" ({source_label})" if source_label else "")
                )
            report.categories_reused += 1
        seen_categories.add(category.name)

        for keyword in group.keywords:
            if len(keyword) > 255:
                # Schema cap: skip, never truncate a trigger phrase silently.
                report.keywords_skipped += 1
                continue
            existing_kw = (
                await db.execute(
                    select(IntentKeyword).where(
                        IntentKeyword.category_id == category.id,
                        IntentKeyword.keyword == keyword,
                    )
                )
            ).scalar_one_or_none()
            if existing_kw is None:
                db.add(
                    IntentKeyword(
                        category_id=category.id,
                        keyword=keyword,
                        match_type=MatchType.EXACT,
                    )
                )
                report.keywords_created += 1

        object_id: str | None = None
        if group.image_type == "flex_carousel" and group.image_urls:
            object_id = f"$jsk_{group.slug}"
            payload = build_flex_carousel_payload(group)
            _, status = await _upsert_object(
                db, ReplyObject,
                object_id=object_id,
                name=f"JSK flex carousel: {group.name[:120]}",
                object_type=ObjectType.FLEX,
                payload=payload,
                alt_text=group.alt_text,
            )
            seen_objects.add(object_id)
            if status == "created":
                report.objects_created += 1
            elif status == "updated":
                report.objects_updated += 1
            report.media_hotlinked += len(group.image_urls)
        elif group.image_type == "carousel" and group.image_urls:
            object_id = f"$jsk_{group.slug}"
            payload = build_template_carousel_payload(group)
            _, status = await _upsert_object(
                db, ReplyObject,
                object_id=object_id,
                name=f"JSK image carousel: {group.name[:120]}",
                object_type=ObjectType.TEMPLATE,
                payload=payload,
                alt_text=group.alt_text,
            )
            seen_objects.add(object_id)
            if status == "created":
                report.objects_created += 1
            elif status == "updated":
                report.objects_updated += 1
            report.media_hotlinked += len(group.image_urls)
        elif group.image_type == "single" and group.image_urls:
            url = group.image_urls[0]
            preview = (group.preview_urls[0] if group.preview_urls else url) or url
            hosted_url: str | None = None
            if is_selfhostable(url):
                try:
                    hosted_url = await _selfhost_image(
                        db, MediaFile, detect_category, settings,
                        secrets_mod, url, group.slug,
                    )
                    report.media_hosted += 1
                except Exception as exc:  # per-file isolation: never abort run
                    report.media_failed.append(f"{url}: {exc}")
            if hosted_url is None:
                # Fallback payload still points at the external URL: it is a
                # hotlink (failures additionally land in media_failed).
                report.media_hotlinked += 1
            object_id = f"$jsk_{group.slug}"
            payload = {"url": hosted_url or url, "preview_url": preview}
            _, status = await _upsert_object(
                db, ReplyObject,
                object_id=object_id,
                name=f"JSK image: {group.name[:120]}",
                object_type=ObjectType.IMAGE,
                payload=payload,
                alt_text=group.alt_text,
            )
            seen_objects.add(object_id)
            if status == "created":
                report.objects_created += 1
            elif status == "updated":
                report.objects_updated += 1

        text_content = group.answer + (f" {object_id}" if object_id else "")
        existing_responses = (
            await db.execute(
                select(IntentResponse)
                .where(IntentResponse.category_id == category.id)
                .order_by(IntentResponse.id)
            )
        ).scalars().all()
        if not existing_responses:
            db.add(
                IntentResponse(
                    category_id=category.id,
                    reply_type=ReplyType.TEXT,
                    text_content=text_content,
                    payload=None,
                    order=0,
                    is_active=True,
                )
            )
            report.responses_created += 1
        else:
            first = existing_responses[0]
            if (
                first.text_content != text_content
                or first.reply_type != ReplyType.TEXT
                or first.payload is not None
                or not first.is_active
            ):
                first.text_content = text_content
                first.reply_type = ReplyType.TEXT
                first.payload = None
                first.is_active = True
                report.responses_updated += 1
            for extra in existing_responses[1:]:
                if extra.is_active:
                    extra.is_active = False
                    report.responses_updated += 1

    # Stale sweep (pack-owned only, FULL-SYNC ONLY): deactivate marked
    # categories absent from this import. Gated because a partial plan
    # (tests, single-group dev runs) must never retire unseen categories.
    # Objects match both the current `$jsk_` prefix and the legacy `$skn_`
    # prefix (pre-rename rows survive until the rename migration runs).
    if full_sync and seen_categories:
        from sqlalchemy import select as _select

        stale_cats = (
            await db.execute(
                _select(IntentCategory).where(
                    IntentCategory.description.startswith(SOURCE_MARKER),
                    IntentCategory.is_active == True,  # noqa: E712
                )
            )
        ).scalars().all()
        for cat in stale_cats:
            if cat.name not in seen_categories:
                cat.is_active = False
                report.categories_deactivated += 1
                resps = (
                    await db.execute(
                        select(IntentResponse).where(
                            IntentResponse.category_id == cat.id,
                            IntentResponse.is_active == True,  # noqa: E712
                        )
                    )
                ).scalars().all()
                for resp in resps:
                    resp.is_active = False
                    report.responses_updated += 1
        from sqlalchemy import or_ as _or

        stale_objs = (
            await db.execute(
                select(ReplyObject).where(
                    _or(
                        ReplyObject.object_id.startswith("$jsk_"),
                        ReplyObject.object_id.startswith("$skn_"),
                    ),
                    ReplyObject.is_active == True,  # noqa: E712
                )
            )
        ).scalars().all()
        for obj in stale_objs:
            if obj.object_id not in seen_objects:
                obj.is_active = False
                report.objects_deactivated += 1

    await SettingsService.set_setting(
        db, SETTING_WELCOME_TEMPLATE, DEFAULT_WELCOME,
        "Imported from SakonNakhonBot first-time greeting",
    )
    await SettingsService.set_setting(
        db, SETTING_ZERO_HANDOFF, "true", "Legacy exact-'0' staff handoff switch"
    )
    report.settings_set += 2

    await db.commit()
    return report


async def _supersede_overlap(db, plan: ImportPlan) -> tuple[int, int]:
    """Deactivate (never delete) overlapping live rows not owned by this import.

    Intent categories carrying the source marker are skipped here — the stale
    sweep below owns them. Everything touched is printed (audit trail) and
    reversible with an is_active flip.
    """
    from sqlalchemy import func, select

    from app.models.auto_reply import AutoReply
    from app.models.intent import IntentCategory, IntentKeyword, IntentResponse

    cats_done: set[int] = set()
    autos_done = 0
    for keyword, where in plan.overlap_keywords:
        if where == "intent":
            kw_rows = (
                await db.execute(
                    select(IntentKeyword).where(
                        func.lower(IntentKeyword.keyword) == keyword.lower()
                    )
                )
            ).scalars().all()
            for kw in kw_rows:
                cat = await db.get(IntentCategory, kw.category_id)
                if cat is None or cat.id in cats_done:
                    continue
                if (cat.description or "").startswith(SOURCE_MARKER):
                    continue  # ours: the stale sweep handles it
                if not cat.is_active:
                    continue  # already retired: don't recount, don't touch
                cat.is_active = False
                cats_done.add(cat.id)
                resps = (
                    await db.execute(
                        select(IntentResponse).where(
                            IntentResponse.category_id == cat.id,
                            IntentResponse.is_active == True,  # noqa: E712
                        )
                    )
                ).scalars().all()
                for resp in resps:
                    resp.is_active = False
                print(f"SUPERSEDE: deactivated intent category {cat.name!r} "
                      f"(id={cat.id}, collided on {keyword!r})")
        else:
            auto_rows = (
                await db.execute(
                    select(AutoReply).where(
                        func.lower(AutoReply.keyword) == keyword.lower(),
                        AutoReply.is_active == True,  # noqa: E712
                    )
                )
            ).scalars().all()
            for auto_row in auto_rows:
                auto_row.is_active = False
                autos_done += 1
                print(f"SUPERSEDE: deactivated auto_reply id={auto_row.id} "
                      f"(collided on {keyword!r})")
    await db.flush()
    return len(cats_done), autos_done


async def _upsert_object(db, ReplyObject, *, object_id, name,
                         object_type, payload, alt_text) -> tuple[str, str]:
    """Upsert a reply object. Returns (object_id, 'created'|'updated'|'unchanged')."""
    from sqlalchemy import select

    existing = (
        await db.execute(
            select(ReplyObject).where(ReplyObject.object_id == object_id)
        )
    ).scalar_one_or_none()
    if existing is None:
        db.add(
            ReplyObject(
                object_id=object_id, name=name, category="sakonnakhon",
                object_type=object_type, payload=payload,
                alt_text=alt_text, is_active=True,
            )
        )
        return object_id, "created"
    changed = (
        existing.payload != payload
        or existing.object_type != object_type
        or (existing.alt_text or "") != (alt_text or "")
        or not existing.is_active
    )
    if changed:
        existing.payload = payload
        existing.object_type = object_type
        existing.alt_text = alt_text
        existing.is_active = True
        return object_id, "updated"
    return object_id, "unchanged"


async def _selfhost_image(db, MediaFile, detect_category, settings,
                          secrets_mod, url: str, slug: str) -> str:
    from sqlalchemy import select

    data, content_type = await _fetch_bytes(url)
    mime = (_sniff_mime(data) or "").lower()
    if mime not in SELFHOST_MIMES:
        raise ValueError(f"unsupported content {mime or content_type or 'unknown'}")
    ext = ".jpg" if mime == "image/jpeg" else ".png"
    filename = f"sakonnakhon/{slug}{ext}"
    existing = (
        await db.execute(select(MediaFile).where(MediaFile.filename == filename))
    ).scalar_one_or_none()
    if existing is not None:
        base = str(settings.SERVER_BASE_URL).rstrip("/")
        if existing.is_public and existing.public_token:
            return f"{base}/api/v1/public/files/{existing.public_token}"
        existing.is_public = True
        existing.public_token = existing.public_token or secrets_mod.token_urlsafe(16)
        await db.flush()
        return f"{base}/api/v1/public/files/{existing.public_token}"
    row = MediaFile(
        filename=filename, mime_type=mime, data=data, size_bytes=len(data),
        category=detect_category(mime, filename),
        is_public=True, public_token=secrets_mod.token_urlsafe(16),
    )
    db.add(row)
    await db.flush()
    base = str(settings.SERVER_BASE_URL).rstrip("/")
    return f"{base}/api/v1/public/files/{row.public_token}"


# ---------------------------------------------------------------------------
# CLI (thin shell).
# ---------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Idempotent import of SakonNakhonBot Sheet1 Q&A (dry run by default)."
    )
    parser.add_argument("source", help="Path to Sheet1 CSV export (cols A-K).")
    parser.add_argument("--apply", action="store_true", help="Write to the database.")
    parser.add_argument(
        "--force-with-overlap", action="store_true",
        help="Apply even when new keywords overlap live rows (audit-logged).",
    )
    parser.add_argument(
        "--deactivate-stale-overlap", action="store_true",
        help="Before applying, deactivate (never delete) overlapping live "
        "rows not owned by this import. Reversible via is_active.",
    )
    parser.add_argument(
        "--full-sync", action="store_true",
        help="Retire pack-owned categories absent from this source "
        "(full-sheet sync only; partial plans must never sweep).",
    )
    parser.add_argument("--report-out", default=None, help="Write report to file.")
    return parser


async def _live_snapshot(db) -> tuple[set[str], set[str]]:
    from sqlalchemy import select

    from app.models.auto_reply import AutoReply
    from app.models.intent import IntentKeyword

    keywords = {
        (row or "").lower()
        for row in (await db.execute(select(IntentKeyword.keyword))).scalars().all()
    }
    autoreplies = {
        (row or "").lower()
        for row in (
            await db.execute(
                select(AutoReply.keyword).where(AutoReply.is_active == True)  # noqa: E712
            )
        ).scalars().all()
    }
    return keywords, autoreplies


def _report_lines(plan: ImportPlan, report: ImportReport | None,
                  *, apply: bool, source: Path) -> list[str]:
    lines = [
        f"Source     : {source}",
        f"Groups     : {len(plan.groups)}",
        f"Silent skip: {plan.silent_skipped} | Junk skip: {plan.junk_skipped}",
        f"Overlap    : {len(plan.overlap)}",
    ]
    for item in plan.overlap:
        lines.append(f"  OVERLAP: {item}")
    for warn in plan.warnings:
        lines.append(f"  WARNING: {warn}")
    if report is not None:
        lines += [
            f"Categories : +{report.categories_created} new, "
            f"{report.categories_reused} reused, "
            f"-{report.categories_deactivated} deactivated",
            f"Keywords   : +{report.keywords_created} "
            f"({report.keywords_skipped} skipped >255 chars)",
            f"Responses  : +{report.responses_created} new, "
            f"{report.responses_updated} updated",
            f"Objects    : +{report.objects_created} new, "
            f"{report.objects_updated} updated, "
            f"-{report.objects_deactivated} deactivated",
            f"Media      : {report.media_hosted} hosted, "
            f"{report.media_hotlinked} hotlinked, "
            f"{len(report.media_failed)} failed",
            f"Settings   : {report.settings_set} set",
            f"Superseded : {report.superseded_categories} categories, "
            f"{report.superseded_autoreplies} auto_replies "
            f"(deactivated, reversible)",
        ]
        for item in report.media_failed:
            lines.append(f"  MEDIA FAIL: {item}")
    lines.append(f"Effect     : {'wrote to database' if apply else 'dry run (no writes)'}")
    return lines


async def _dry_run_plan(source: Path, answered: list[AnsweredRow],
                      silent: int, junk: int) -> ImportPlan:
    """Build a plan with the live keyword snapshot (read-only, zero writes)."""
    import os as _os

    from dotenv import load_dotenv

    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
    from sqlalchemy.orm import sessionmaker

    from scripts._script_safety import print_script_header

    env_path, _ = print_script_header(
        "Import SakonNakhonBot Q&A (preview)", apply=False
    )
    # Explicit environment wins (e.g. local DATABASE_URL); the env file
    # only fills gaps. This lets ops target local-vs-remote without editing files.
    load_dotenv(env_path, override=False)
    db_url = _os.getenv("DATABASE_URL")
    if not db_url:
        print("DATABASE_URL is required (dry run reads live rows read-only)")
        return build_plan(answered, silent, junk, set(), set())
    engine = create_async_engine(db_url, echo=False)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with Session() as db:
            live_keywords, live_autoreplies = await _live_snapshot(db)
        return build_plan(answered, silent, junk, live_keywords, live_autoreplies)
    finally:
        await engine.dispose()


async def run(source: Path, *, apply: bool,
              force_with_overlap: bool = False,
              deactivate_stale: bool = False,
              full_sync: bool = False) -> int:
    from dotenv import load_dotenv

    from scripts._script_safety import print_dry_run_hint, print_script_header

    if not source.exists():
        print(f"Source file not found: {source}")
        return 1
    try:
        raws = load_rows(source)
    except Exception as exc:
        print(f"Failed to parse source: {exc}")
        return 1

    answered: list[AnsweredRow] = []
    silent = junk = 0
    try:
        for raw in raws:
            row = classify_row(raw)
            if row is None:
                junk += 1
            elif isinstance(row, SilentRow):
                silent += 1
            else:
                answered.append(row)
    except ValueError as exc:
        print(f"Import refused: {exc}")
        return 1

    if not apply:
        plan = await _dry_run_plan(source, answered, silent, junk)
        for line in _report_lines(plan, None, apply=False, source=source):
            print(line)
        print_dry_run_hint()
        return 0

    env_path, _ = print_script_header("Import SakonNakhonBot Q&A", apply=True)
    load_dotenv(env_path, override=False)

    import os as _os

    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
    from sqlalchemy.orm import sessionmaker

    db_url = _os.getenv("DATABASE_URL")
    if not db_url:
        print("DATABASE_URL is required")
        return 1
    engine = create_async_engine(db_url, echo=False)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with Session() as db:
            live_keywords, live_autoreplies = await _live_snapshot(db)
            plan = build_plan(answered, silent, junk, live_keywords, live_autoreplies)
            if not plan.can_apply(force_with_overlap=force_with_overlap):
                print("Refused: new keywords overlap live rows. Resolve or re-run with")
                print("--force-with-overlap (the override is audit-logged below).")
                for item in plan.overlap:
                    print(f"  OVERLAP: {item}")
                print("AUDIT: blocked apply due to overlap "
                      f"({len(plan.overlap)} items, force not given)")
                return 1
            if plan.overlap and force_with_overlap:
                print("AUDIT: applying despite "
                      f"{len(plan.overlap)} overlap items (--force-with-overlap)")
            report = await apply_plan(
                plan, db, source_label=source.name,
                deactivate_stale=deactivate_stale, full_sync=full_sync,
            )
            for line in _report_lines(plan, report, apply=True, source=source):
                print(line)
            return 0
    finally:
        await engine.dispose()


def main(argv: list[str] | None = None) -> int:
    import sys as _sys
    from pathlib import Path as _Path

    _here = _Path(__file__).resolve().parent
    if str(_here) not in _sys.path:
        _sys.path.insert(0, str(_here))  # scripts/ for _cli_utils
    from _cli_utils import ensure_backend_on_path

    ensure_backend_on_path()  # backend/ for scripts.* + app.*
    args = build_parser().parse_args(argv)
    source = Path(args.source).expanduser()
    if not source.is_absolute():
        source = Path.cwd() / source
    import asyncio as _asyncio

    return _asyncio.run(
        run(source.resolve(), apply=args.apply,
            force_with_overlap=args.force_with_overlap,
            deactivate_stale=args.deactivate_stale_overlap,
            full_sync=args.full_sync)
    )


if __name__ == "__main__":
    raise SystemExit(main())
