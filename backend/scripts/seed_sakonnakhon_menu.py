"""One-off seed: legacy 6-zone menu imagemap + social quick-reply objects.

Source: SakonNakhonBot `menu.gs` (imagemap 1040x701, 6 message actions) and
`quickReply.gs` (website / facebook / cancel). Idempotent: re-running updates
in place (natural keys `$jsk_menu`, `$jsk_social`, `sakonnakhon/menu.jpg`).

Usage:
  python -m scripts.seed_sakonnakhon_menu --apply   # download + write
  (dry run by default; downloads the menu base image and reports only)
"""

from __future__ import annotations

import argparse
import asyncio

MENU_IMAGE_URL = "https://i.imgur.com/AOtbh61.jpg"
MENU_OBJECT_ID = "$jsk_menu"
SOCIAL_OBJECT_ID = "$jsk_social"
MENU_FILENAME = "sakonnakhon/menu.jpg"
MENU_ALT = "เมนูบริการสำนักงานยุติธรรมจังหวัดสกลนคร"

# (x, y, w, h, message text) straight from legacy menu.gs.
MENU_AREAS = [
    (2, 1, 342, 344, "ลงทะเบียน"),
    (350, 0, 342, 344, "ยื่นขอรับบริการ"),
    (698, 0, 342, 344, "ให้บริการปรึกษากฎหมาย"),
    (1, 351, 344, 348, "ศูนย์ยุติธรรมชุมชน"),
    (349, 352, 344, 348, "Social Media"),
    (699, 353, 344, 348, "ติดต่อหน่วยงาน"),
]
MENU_SIZE = {"width": 1040, "height": 701}

SOCIAL_TEXT = "กดปุ่มเลือกรายการที่ต้องการ"
SOCIAL_ITEMS = [
    {
        "type": "action",
        "imageUrl": "https://i.imgur.com/HnmLr4k.png",
        "action": {
            "type": "uri",
            "label": "Website",
            "uri": "https://sakonnakhon.moj.go.th",
        },
    },
    {
        "type": "action",
        "imageUrl": "https://i.imgur.com/Cg77syv.png",
        "action": {
            "type": "uri",
            "label": "Facebook",
            "uri": "https://www.facebook.com/mojsakonnakhon.justice2564",
        },
    },
    {
        "type": "action",
        "imageUrl": "https://i.imgur.com/AFs3s5i.png",
        "action": {"type": "message", "label": "ยกเลิก", "text": "ยกเลิก"},
    },
]


def build_menu_payload(base_url: str) -> dict:
    """Imagemap payload (pure; base_url injected after the image is hosted).

    Legacy zone 6 slightly overflows the 1040px canvas (699+344); widths and
    heights are clamped to the canvas because LINE rejects out-of-bounds
    areas. The 3px difference is invisible on the artwork.
    """
    w_max, h_max = MENU_SIZE["width"], MENU_SIZE["height"]
    actions = []
    for x, y, w, h, text in MENU_AREAS:
        w = min(w, w_max - x)
        h = min(h, h_max - y)
        actions.append(
            {
                "type": "message",
                "area": {"x": x, "y": y, "width": w, "height": h},
                "text": text,
            }
        )
    return {
        "base_url": base_url,
        "base_size": dict(MENU_SIZE),
        "actions": actions,
    }


def build_social_payload() -> dict:
    """Text + quickReply payload (pure)."""
    return {"text": SOCIAL_TEXT, "quickReply": {"items": SOCIAL_ITEMS}}


async def _download(url: str, *, attempts: int = 4) -> bytes:
    import asyncio as _asyncio

    import httpx

    last: Exception | None = None
    for attempt in range(attempts):
        try:
            async with httpx.AsyncClient(
                timeout=30.0, follow_redirects=True,
                headers={"User-Agent": "Mozilla/5.0 (jsk-app menu seed)"},
            ) as c:
                resp = await c.get(url)
                resp.raise_for_status()
                return resp.content
        except Exception as exc:
            last = exc
            # imgur rate-limits (429): back off before retrying.
            await _asyncio.sleep(5 * (attempt + 1))
    raise RuntimeError(f"download failed after {attempts} attempts: {url}: {last}")


def _sniff_magic(data: bytes) -> str:
    """Minimal magic-byte sniff (no app imports) for the dry-run gate."""
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    return ""


async def run(*, apply: bool) -> int:
    import secrets as secrets_mod

    from sqlalchemy import select

    print("Menu image:", MENU_IMAGE_URL)
    try:
        image_bytes = await _download(MENU_IMAGE_URL)
    except Exception as exc:
        print(f"Menu image download failed (no writes made): {exc}")
        return 1
    mime = _sniff_magic(image_bytes)
    if mime not in ("image/jpeg", "image/png"):
        print(f"Menu image rejected: unexpected content {mime or 'unknown'}")
        return 1
    print(f"Menu image: {len(image_bytes)} bytes, {mime}" +
          (" (dry run, no writes)" if not apply else ""))
    if not apply:
        print("Dry run only. Re-run with --apply to write.")
        return 0

    from app.core.config import settings
    from app.models.media_file import MediaFile, detect_category
    from app.models.reply_object import ObjectType
    from scripts.seed_sakonnakhon_content import _upsert_object

    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
    from sqlalchemy.orm import sessionmaker
    from scripts.seed_sakonnakhon_content import SOURCE_MARKER  # noqa: F401

    import os as _os

    from dotenv import load_dotenv

    from scripts._script_safety import print_script_header

    env_path, _ = print_script_header("Seed SakonNakhonBot menu objects", apply=True)
    load_dotenv(env_path, override=False)
    db_url = _os.getenv("DATABASE_URL")
    if not db_url:
        print("DATABASE_URL is required")
        return 1
    engine = create_async_engine(db_url, echo=False)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with Session() as db:
            existing = (
                await db.execute(
                    select(MediaFile).where(MediaFile.filename == MENU_FILENAME)
                )
            ).scalar_one_or_none()
            if existing is None:
                existing = MediaFile(
                    filename=MENU_FILENAME, mime_type=mime, data=image_bytes,
                    size_bytes=len(image_bytes),
                    category=detect_category(mime, MENU_FILENAME),
                    is_public=True, public_token=secrets_mod.token_urlsafe(16),
                )
                db.add(existing)
                await db.flush()
                print("Media: created sakonnakhon/menu.jpg")
            else:
                existing.data = image_bytes
                existing.mime_type = mime
                existing.size_bytes = len(image_bytes)
                existing.is_public = True
                existing.public_token = existing.public_token or secrets_mod.token_urlsafe(16)
                print("Media: refreshed sakonnakhon/menu.jpg")
            base = str(settings.SERVER_BASE_URL).rstrip("/")
            base_url = f"{base}/api/v1/public/files/{existing.public_token}"

            from app.models.reply_object import ReplyObject

            _, s1 = await _upsert_object(
                db, ReplyObject, object_id=MENU_OBJECT_ID,
                name="JSK 6-zone service menu (legacy imagemap)",
                object_type=ObjectType.IMAGEMAP,
                payload=build_menu_payload(base_url), alt_text=MENU_ALT,
            )
            _, s2 = await _upsert_object(
                db, ReplyObject, object_id=SOCIAL_OBJECT_ID,
                name="JSK social quick reply (legacy)",
                object_type=ObjectType.TEXT,
                payload=build_social_payload(), alt_text=SOCIAL_TEXT,
            )
            await db.commit()
            print(f"Objects: $jsk_menu={s1}, $jsk_social={s2}")
            print("Reference from answers as $jsk_menu / $jsk_social.")
            return 0
    finally:
        await engine.dispose()


def main(argv: list[str] | None = None) -> int:
    import sys as _sys
    from pathlib import Path as _Path

    _here = _Path(__file__).resolve().parent
    if str(_here) not in _sys.path:
        _sys.path.insert(0, str(_here))
    from _cli_utils import ensure_backend_on_path

    ensure_backend_on_path()
    parser = argparse.ArgumentParser(description="Seed legacy menu objects (dry run by default).")
    parser.add_argument("--apply", action="store_true", help="Write to the database.")
    args = parser.parse_args(argv)
    return asyncio.run(run(apply=args.apply))


if __name__ == "__main__":
    raise SystemExit(main())
