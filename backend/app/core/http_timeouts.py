"""Shared httpx timeout budgets: single enforcement point (R3-M23)."""
import httpx

DEFAULT_TIMEOUT = httpx.Timeout(connect=5.0, read=15.0, write=15.0, pool=5.0)
UPLOAD_TIMEOUT = httpx.Timeout(connect=5.0, read=30.0, write=60.0, pool=5.0)
