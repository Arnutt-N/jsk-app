"""Late-bound dependency lookups for ws_session handlers.

Tests patch singletons as module attributes (e.g.
``patch('app.services.ws_session.ws_manager')``). A direct import inside a
handler would bypass that patch, so handlers resolve dependencies through
the package namespace at call time.
"""


def get_ws_manager():
    from app.services import ws_session as pkg
    return pkg.ws_manager


def get_live_chat_service():
    from app.services import ws_session as pkg
    return pkg.live_chat_service


def get_analytics_service():
    from app.services import ws_session as pkg
    return pkg.analytics_service


def get_ws_health_monitor():
    from app.services import ws_session as pkg
    return pkg.ws_health_monitor


def get_resolve_by_line_id():
    from app.services import ws_session as pkg
    return pkg.resolve_by_line_id


def get_notify_admins_message_sent():
    from app.services import ws_session as pkg
    return pkg.notify_admins_message_sent
