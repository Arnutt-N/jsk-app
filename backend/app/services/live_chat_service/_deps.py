"""Late-bound dependency lookups for the live chat mixins.

Existing tests replace `app.services.live_chat_service.sla_service` as a
module attribute (`patch('app.services.live_chat_service.sla_service')`).
After the split into submodules, a direct `from app.services.sla_service
import sla_service` inside a mixin would bypass that patch, so mixins that
call SLA checks resolve the service through the package namespace at call
time instead.
"""


def get_sla_service():
    """Resolve sla_service via the package so module-attribute patches apply."""
    from app.services import live_chat_service as pkg

    return pkg.sla_service
