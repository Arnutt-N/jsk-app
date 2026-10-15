# Enterprise Audit — Backend Test Gates

- Date (UTC): 2026-10-15
- Branch (verified, not switched): `feat/enterprise-audit-sweep` (`git branch --show-current`)
- Working dir for all commands: `D:\genAI\jsk-app\backend`
- Interpreter: `venv/Scripts/python.exe` → Python 3.12.1, pytest 9.0.2
- Mode: read-only investigation. No code edited. No secrets printed (none encountered).

## Environment note (evidence, not a fix)

- System `python` is Python 3.9.5. Running collection with it fails every test module that
  imports the app (`TypeError: unsupported operand type(s) for |: 'type' and 'NoneType'`,
  e.g. `backend/app/models/media_file.py:36` uses `str | None`, which needs Python ≥ 3.10).
- `~/bin/run-pytest.sh` does not exist on this machine, so the venv interpreter above was
  used directly. No DB/redis fallback was needed: suites ran and connected.

## Gate 1 — collection

Command:

```text
venv/Scripts/python.exe -m pytest --collect-only -q
```

Raw output (tail):

```text
============================== warnings summary ===============================
app\api\v1\endpoints\admin_integrations.py:98
  D:\genAI\jsk-app\backend\app\api\v1\endpoints\admin_integrations.py:98: PytestCollectionWarning: cannot collect test class 'TestResult' because it has a __init__ constructor (from: tests/test_admin_integrations_ssrf.py)
    class TestResult(BaseModel):

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
1476 tests collected in 82.77s (0:01:22)
```

Result: **1476 tests collected, 0 collection errors** (one `PytestCollectionWarning`, non-blocking).

## Gate 2 — websocket suite

Command:

```text
venv/Scripts/python.exe -m pytest tests/test_websocket.py -q
```

Raw output (full tail, last 15 lines requested):

```text
..........                                                               [100%]
============================== warnings summary ===============================
tests/test_websocket.py: 10 warnings
  D:\genAI\jsk-app\backend\app\core\websocket_manager.py:627: DeprecationWarning: Call to deprecated setex. (Use 'set' instead.) -- Deprecated since version 2.6.12.
    await redis_client._redis.setex(

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
10 passed, 10 warnings in 24.40s
```

Result: **10 passed, 0 failed.**

## Gate 3 — full suite

Command (background run with `-rf`, log at `/tmp/jsk_full_pytest.log`):

```text
venv/Scripts/python.exe -m pytest -q -rf
```

Note: a first foreground attempt was killed by a 1500 s tool timeout near ~97% progress
(2 `F` markers visible). The rerun completed normally in 163.15 s.

Raw output (exact tail, last 20 lines):

```text
  Enable tracemalloc to get traceback where the object was allocated.
  See https://docs.pytest.org/en/stable/how-to/capture-warnings.html#resource-warnings for more info.

tests/test_websocket_manager_redis.py::test_disconnect_keeps_redis_rate_window_but_clears_local_bucket
  C:\Python312\Lib\asyncio\base_events.py:1989: RuntimeWarning: coroutine 'Connection._cancel' was never awaited
    def get_debug(self):
  Enable tracemalloc to get traceback where the object was allocated.
  See https://docs.pytest.org/en/stable/how-to/capture-warnings.html#resource-warnings for more info.

tests/test_ws_security.py::TestWebSocketAuthHelper::test_ws_auth_rejects_director_under_default_policy
  C:\Python312\Lib\contextlib.py:446: RuntimeWarning: coroutine 'Connection._cancel' was never awaited
    def __exit__(self, exctype, excinst, exctb):
  Enable tracemalloc to get traceback where the object was allocated.
  See https://docs.pytest.org/en/stable/how-to/capture-warnings.html#resource-warnings for more info.

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
=========================== short test summary info ===========================
FAILED tests/test_health_hardening.py::test_detailed_and_ws_health_require_admin
FAILED tests/test_inbox_distinct_on.py::test_inbox_equivalence_db - cryptogra...
2 failed, 1469 passed, 5 skipped, 71 warnings in 163.15s (0:02:43)
```

Full failure reasons (rerun of the 2 nodes with `--tb=no -rf`, `COLUMNS=250`):

```text
FAILED tests/test_health_hardening.py::test_detailed_and_ws_health_require_admin - AssertionError: /api/v1/health/detailed
FAILED tests/test_inbox_distinct_on.py::test_inbox_equivalence_db - cryptography.fernet.InvalidToken
2 failed in 29.84s
```

Failing test node ids (complete list, 2 items):

1. `tests/test_health_hardening.py::test_detailed_and_ws_health_require_admin`
2. `tests/test_inbox_distinct_on.py::test_inbox_equivalence_db`

## Pass/fail table

| Gate | Command | Result |
|------|---------|--------|
| 1 — collect-only | `pytest --collect-only -q` | PASS — 1476 collected, 0 errors |
| 2 — websocket | `pytest tests/test_websocket.py -q` | PASS — 10 passed |
| 3 — full suite | `pytest -q -rf` | FAIL — 1469 passed, 2 failed, 5 skipped |

## Verdicts (one line per gate)

- Gate 1 (collection): PASS — 1476 tests collect cleanly under the repo venv (Python 3.12.1).
- Gate 2 (websocket): PASS — `tests/test_websocket.py` is 10/10 green.
- Gate 3 (full suite): FAIL — 2 failures remain (`test_detailed_and_ws_health_require_admin`,
  `test_inbox_equivalence_db`); everything else green (1469 passed, 5 skipped).
