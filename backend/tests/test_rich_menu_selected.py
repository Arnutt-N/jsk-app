from types import SimpleNamespace

from app.schemas.rich_menu import selected_for_display_mode
from app.services.rich_menu_service import RichMenuService


def test_selected_follows_display_mode():
    assert selected_for_display_mode("ALWAYS") is True
    assert selected_for_display_mode("SCHEDULED") is True
    assert selected_for_display_mode("MANUAL") is False


def test_projection_includes_selected_so_flip_triggers_recreate():
    local = {
        "size": {"width": 2500, "height": 843},
        "selected": True,
        "name": "Menu A",
        "chatBarText": "menu",
        "areas": [],
    }
    line_copy = dict(local, selected=False)
    assert RichMenuService._config_projection(local) != RichMenuService._config_projection(line_copy)

    menu = SimpleNamespace(config=local, sync_status="SYNCED")
    assert RichMenuService._needs_recreate(menu, line_copy) is True


def test_matching_selected_is_not_drift():
    local = {
        "size": {"width": 2500, "height": 843},
        "selected": True,
        "name": "Menu A",
        "chatBarText": "menu",
        "areas": [],
    }
    assert RichMenuService._needs_recreate(
        SimpleNamespace(config=local, sync_status="SYNCED"), dict(local)
    ) is False
