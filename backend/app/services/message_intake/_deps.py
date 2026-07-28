"""Late-bound dependency lookups for the message intake mixins.

Existing tests replace singletons as module attributes (e.g.
`patch('app.services.message_intake.ws_manager')`). A direct
`from app.core.websocket_manager import ws_manager` inside a mixin would
bypass that patch, so mixins resolve dependencies through the package
namespace at call time instead.
"""


def get_ws_manager():
    from app.services import message_intake as pkg
    return pkg.ws_manager


def get_line_service():
    from app.services import message_intake as pkg
    return pkg.line_service


def get_live_chat_service():
    from app.services import message_intake as pkg
    return pkg.live_chat_service


def get_handoff_service():
    from app.services import message_intake as pkg
    return pkg.handoff_service


def get_friend_service():
    from app.services import message_intake as pkg
    return pkg.friend_service
