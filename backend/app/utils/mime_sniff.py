"""Shared magic-byte sniffing: single enforcement point for upload mime checks."""
from typing import Optional


def sniff_mime(data: bytes) -> Optional[str]:
    """Real mime from magic bytes, or None when the bytes are neither PNG,
    JPEG, nor PDF."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"%PDF"):
        return "application/pdf"
    return None
