"""Unit tests for `app.models.media_file.detect_category`.

Followup from PR #55 review (M-1). The function has three distinct
behaviour paths — specific MIME, generic-MIME-with-filename-fallback,
and no-signal-at-all — and the contract document promises one of them
("never override a client-supplied specific MIME"). These tests pin
each path so future refactors don't silently break the guarantee.
"""

from __future__ import annotations

import pytest

from app.models.media_file import FileCategory, detect_category


class TestDetectCategoryHappyPath:
    """Each MIME family resolves to its category."""

    @pytest.mark.parametrize(
        "mime, expected",
        [
            ("image/jpeg", FileCategory.IMAGE),
            ("image/png", FileCategory.IMAGE),
            ("image/svg+xml", FileCategory.IMAGE),
            ("video/mp4", FileCategory.VIDEO),
            ("video/webm", FileCategory.VIDEO),
            ("audio/mpeg", FileCategory.AUDIO),
            ("audio/wav", FileCategory.AUDIO),
            ("text/plain", FileCategory.DOCUMENT),
            ("text/csv", FileCategory.DOCUMENT),
            ("application/pdf", FileCategory.DOCUMENT),
            ("application/msword", FileCategory.DOCUMENT),
            (
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                FileCategory.DOCUMENT,
            ),
        ],
    )
    def test_specific_mime_routes_to_correct_category(
        self, mime: str, expected: FileCategory
    ) -> None:
        assert detect_category(mime) == expected

    def test_case_insensitive_mime(self) -> None:
        """Some clients capitalise the MIME header — should still match."""
        assert detect_category("IMAGE/JPEG") == FileCategory.IMAGE
        assert detect_category("Video/MP4") == FileCategory.VIDEO


class TestDetectCategoryFilenameFallback:
    """When MIME is empty or generic, the filename guides the category.

    This is the bug fix introduced in PR #55 — `.jpg` / `.png` uploads
    were getting categorised as OTHER because the browser sent
    `application/octet-stream`.
    """

    @pytest.mark.parametrize(
        "filename, expected",
        [
            ("photo.jpg", FileCategory.IMAGE),
            ("photo.jpeg", FileCategory.IMAGE),
            ("icon.png", FileCategory.IMAGE),
            ("logo.svg", FileCategory.IMAGE),
            ("clip.mp4", FileCategory.VIDEO),
            ("clip.webm", FileCategory.VIDEO),
            ("song.mp3", FileCategory.AUDIO),
            ("song.wav", FileCategory.AUDIO),
            ("report.pdf", FileCategory.DOCUMENT),
            ("notes.txt", FileCategory.DOCUMENT),
        ],
    )
    def test_octet_stream_falls_back_to_filename(
        self, filename: str, expected: FileCategory
    ) -> None:
        """The headline bug: octet-stream + image filename → IMAGE."""
        assert detect_category("application/octet-stream", filename) == expected

    @pytest.mark.parametrize(
        "mime",
        [None, "", "   "],
    )
    def test_empty_mime_falls_back_to_filename(self, mime: str | None) -> None:
        """Missing/blank MIME with a good filename still resolves."""
        assert detect_category(mime, "photo.jpg") == FileCategory.IMAGE

    @pytest.mark.parametrize(
        "filename, expected",
        [
            ("PHOTO.JPG", FileCategory.IMAGE),
            ("Clip.Mp4", FileCategory.VIDEO),
            ("song.MP3", FileCategory.AUDIO),
        ],
    )
    def test_filename_case_insensitive(
        self, filename: str, expected: FileCategory
    ) -> None:
        """`mimetypes.guess_type` is case-insensitive on the extension."""
        assert detect_category("application/octet-stream", filename) == expected


class TestDetectCategoryDoesNotOverrideSpecificMime:
    """The function's safety guarantee — a client-supplied specific MIME
    is the source of truth even when the filename suggests otherwise.
    This blocks a quirky/malicious client from mislabelling content."""

    def test_text_plain_with_jpg_filename_stays_document(self) -> None:
        """`text/plain` + `photo.jpg` must NOT become IMAGE."""
        assert (
            detect_category("text/plain", "photo.jpg") == FileCategory.DOCUMENT
        )

    def test_application_pdf_with_mp4_filename_stays_document(self) -> None:
        """A PDF blob saved as `.mp4` is still a PDF."""
        assert (
            detect_category("application/pdf", "hoax.mp4")
            == FileCategory.DOCUMENT
        )

    def test_image_mime_with_pdf_filename_stays_image(self) -> None:
        """Conversely: `image/png` + `report.pdf` is treated as IMAGE.
        The specific MIME wins regardless of which direction it points."""
        assert (
            detect_category("image/png", "report.pdf") == FileCategory.IMAGE
        )


class TestDetectCategoryUnknown:
    """Inputs that can't be resolved should fall through to OTHER."""

    @pytest.mark.parametrize(
        "mime",
        [
            "application/x-custom",
            "application/zip",
            "x-archive/tar",
        ],
    )
    def test_unknown_mime_returns_other(self, mime: str) -> None:
        assert detect_category(mime) == FileCategory.OTHER

    @pytest.mark.parametrize(
        "filename",
        [
            "archive.bin",
            "data.dat",
            "noext",
            "weird.xyz",
            "photo.tar.gz",  # .gz not in any document allow-list
        ],
    )
    def test_octet_stream_with_unresolvable_filename_returns_other(
        self, filename: str
    ) -> None:
        assert (
            detect_category("application/octet-stream", filename)
            == FileCategory.OTHER
        )

    def test_no_mime_no_filename_returns_other(self) -> None:
        """The 'no signal at all' case — must never throw."""
        assert detect_category(None, None) == FileCategory.OTHER
        assert detect_category("", None) == FileCategory.OTHER
        assert detect_category(None, "") == FileCategory.OTHER
        assert detect_category("", "") == FileCategory.OTHER


class TestDetectCategoryRegression:
    """Concrete scenarios reproduced from production incidents — keep
    these even if they overlap with the parametrized matrices above so
    a future failure makes the lineage obvious in pytest output."""

    def test_pr55_production_bug_jpg_octet_stream(self) -> None:
        """PR #55: user reported .jpg files counted as OTHER on
        https://jsk-app-git-fix-request-mgmt-polish-arnutt-projects.vercel.app/admin/files
        because the browser sent `application/octet-stream`."""
        assert (
            detect_category("application/octet-stream", "photo.jpg")
            == FileCategory.IMAGE
        )

    def test_pr55_production_bug_png_octet_stream(self) -> None:
        """Same incident — `.png` was also affected."""
        assert (
            detect_category("application/octet-stream", "icon.png")
            == FileCategory.IMAGE
        )
