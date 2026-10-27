from typing import Optional

from linebot.v3.messaging import AsyncApiClient, AsyncMessagingApi, Configuration
from linebot.v3.webhook import WebhookParser

from app.core.config import settings

# Configuration (sync - no event loop needed)
configuration = Configuration(access_token=settings.LINE_CHANNEL_ACCESS_TOKEN)

# Parser (sync - no event loop needed)
parser = WebhookParser(settings.LINE_CHANNEL_SECRET)

# Lazy initialization for async clients
_async_api_client: Optional[AsyncApiClient] = None
_line_bot_api: Optional[AsyncMessagingApi] = None


def get_async_api_client() -> AsyncApiClient:
    """Get or create the async API client (lazy initialization)"""
    global _async_api_client
    if _async_api_client is None:
        _async_api_client = AsyncApiClient(configuration)
    return _async_api_client


def get_line_bot_api() -> AsyncMessagingApi:
    """Get or create the LINE bot API (lazy initialization)"""
    global _line_bot_api
    if _line_bot_api is None:
        _line_bot_api = AsyncMessagingApi(get_async_api_client())
    return _line_bot_api
