from fastapi import APIRouter

api_router = APIRouter()

from app.api.v1.endpoints import (
    auth,
    webhook,
    media,
    admin_reply_objects,
    admin_auto_replies,
    admin_intents,
    liff,
    locations,
    admin_requests,
    admin_users,
    rich_menus,
    settings,
    admin_live_chat,
    ws_live_chat,
    health,
    admin_analytics,
    admin_audit,
    admin_canned_responses,
    admin_export,
    admin_tags,
    admin_credentials,
    admin_friends,
    admin_integrations,
    admin_broadcast,
    admin_reports,
)

api_router.include_router(webhook.router, prefix="/line", tags=["line"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(media.router, tags=["media"])
api_router.include_router(liff.router, prefix="/liff", tags=["liff"])
api_router.include_router(locations.router, prefix="/locations", tags=["locations"])

# Admin APIs (auth via get_current_admin dependency on each endpoint)
api_router.include_router(admin_reply_objects.router, prefix="/admin/reply-objects", tags=["admin"])
api_router.include_router(admin_auto_replies.router, prefix="/admin/auto-replies", tags=["admin"]) # Legacy
api_router.include_router(admin_intents.router, prefix="/admin/intents", tags=["admin"])
api_router.include_router(admin_requests.router, prefix="/admin/requests", tags=["admin"])
api_router.include_router(admin_users.router, prefix="/admin/users", tags=["admin"])
api_router.include_router(rich_menus.router, prefix="/admin/rich-menus", tags=["admin"])
api_router.include_router(settings.router, prefix="/admin/settings", tags=["admin"])
api_router.include_router(admin_live_chat.router, prefix="/admin/live-chat", tags=["admin"])
api_router.include_router(admin_analytics.router, prefix="/admin/analytics", tags=["admin"])
api_router.include_router(admin_audit.router, prefix="/admin/audit", tags=["admin"])
api_router.include_router(admin_canned_responses.router, prefix="/admin/canned-responses", tags=["admin"])
api_router.include_router(admin_export.router, prefix="/admin/export", tags=["admin"])
api_router.include_router(admin_tags.router, prefix="/admin/tags", tags=["admin"])
api_router.include_router(admin_credentials.router, prefix="/admin/credentials", tags=["admin-credentials"])
api_router.include_router(admin_friends.router, prefix="/admin/friends", tags=["admin-friends"])
api_router.include_router(admin_integrations.router, prefix="/admin/settings", tags=["admin-settings"])
api_router.include_router(admin_broadcast.router, prefix="/admin/broadcasts", tags=["admin-broadcast"])
api_router.include_router(admin_reports.router, prefix="/admin/reports", tags=["admin-reports"])
api_router.include_router(ws_live_chat.router, tags=["websocket"])
api_router.include_router(health.router, tags=["health"])

