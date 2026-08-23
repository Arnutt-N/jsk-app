"""
URL Utility Functions
Resolves relative URLs to absolute HTTPS URLs for LINE API compatibility.
"""
import json
import re
from typing import Any, Dict
from app.core.config import settings


def get_base_url() -> str:
    """
    Get the server's public base URL.
    Falls back to localhost if not configured.
    """
    base_url = settings.SERVER_BASE_URL
    if not base_url:
        # Warning: localhost won't work with LINE API
        return "http://localhost:8000"
    return base_url.rstrip("/")


def resolve_payload_urls(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Recursively resolve all media URLs in a Flex Message payload.
    Looks for 'url' keys and resolves them if they start with '/api/'.
    
    This modifies the payload in-place and also returns it.
    """
    if not payload:
        return payload
    
    # Convert to JSON string for easier regex replacement
    payload_str = json.dumps(payload, ensure_ascii=False)
    
    # Pattern to find relative URLs like "/api/v1/media/..."
    base_url = get_base_url()
    
    # Replace all occurrences of "/api/..." with absolute URL
    resolved_str = re.sub(
        r'"url"\s*:\s*"(/api/[^"]+)"',
        lambda m: f'"url": "{base_url}{m.group(1)}"',
        payload_str
    )
    
    return json.loads(resolved_str)


def strip_flex_body(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Remove body/header/footer from Flex bubbles, keeping only hero (images).
    This is used when Text is sent as a separate balloon.
    
    Handles both single bubbles and carousels.
    """
    if not payload:
        return payload
    
    payload_type = payload.get("type", "")
    
    if payload_type == "bubble":
        # Single bubble - keep only hero and type
        return _strip_bubble(payload)
    
    elif payload_type == "carousel":
        # Carousel - strip each bubble inside
        contents = payload.get("contents", [])
        stripped_contents = [_strip_bubble(b) for b in contents if b.get("type") == "bubble"]
        return {
            "type": "carousel",
            "contents": stripped_contents
        }
    
    return payload


def _strip_bubble(bubble: Dict[str, Any]) -> Dict[str, Any]:
    """Strip a single bubble to keep only hero section."""
    result = {"type": "bubble"}
    
    # Keep hero (image) if exists
    if "hero" in bubble:
        result["hero"] = bubble["hero"]
    
    # Keep size if specified
    if "size" in bubble:
        result["size"] = bubble["size"]
    
    # Keep styles if exists (for background colors etc)
    if "styles" in bubble:
        result["styles"] = bubble["styles"]
    
    return result

