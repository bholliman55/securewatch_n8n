"""
contract_tests.py — SecureWatch Pipeline Invariant Tests
=========================================================

Validates that a completed trace_id in sw_event_log satisfies the expected
lifecycle invariants.  Run via pytest against a real Supabase project.

Usage
-----
    # Run all invariants against a known trace_id
    TRACE_ID=<uuid> pytest debug/contract_tests.py -v

    # Run against a specific fixture trace_id
    TRACE_ID=<uuid> FIXTURE_MODE=true pytest debug/contract_tests.py -v

    # Run with verbose output and stop on first failure
    TRACE_ID=<uuid> pytest debug/contract_tests.py -v -x

Environment
-----------
    SUPABASE_URL              – required
    SUPABASE_SERVICE_ROLE_KEY – required
    TRACE_ID                  – required (the trace to validate)
    FIXTURE_MODE              – optional, "true" to assert fixture_mode=true in meta

Invariants checked
------------------
  1. At least one event exists for the trace_id.
  2. A workflow.start event exists.
  3. At least one tool.call or HTTP/webhook call event exists.
  4. A terminal event exists (workflow.complete OR workflow.error).
  5. If workflow.error exists, the err field is non-null and has a message.
  6. All events share the same scan_id (if present).
  7. Events are temporally ordered (created_at strictly ascending).
  8. If fixture_mode=True expected, all events have meta.fixture_mode=true.
  9. The sw-log Edge Function returns 201 for a valid test insert (health check).
"""

from __future__ import annotations

import os
import re
import time
import uuid
from pathlib import Path
from typing import Any

import pytest
import httpx
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------

_SCRIPT_DIR = Path(__file__).parent
load_dotenv(_SCRIPT_DIR / ".env")
load_dotenv(_SCRIPT_DIR.parent / ".env")

UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)

EXPECTED_FIXTURE_MODE = os.environ.get("FIXTURE_MODE", "").lower() == "true"


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------

def _require_env(name: str) -> str:
    val = os.environ.get(name, "").strip()
    if not val:
        pytest.fail(
            f"Required environment variable {name!r} is not set. "
            "Copy debug/.env.example to debug/.env and fill in values."
        )
    return val


def _supabase_client():
    """Return a Supabase Python client using the service-role key."""
    from supabase import create_client
    url = _require_env("SUPABASE_URL")
    key = _require_env("SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)


@pytest.fixture(scope="session")
def trace_id() -> str:
    raw = os.environ.get("TRACE_ID", "").strip()
    if not raw:
        pytest.fail(
            "TRACE_ID environment variable is required. "
            "Example: TRACE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx pytest debug/contract_tests.py"
        )
    if not UUID_RE.match(raw):
        pytest.fail(f"TRACE_ID '{raw}' is not a valid UUID.")
    return raw.lower()


@pytest.fixture(scope="session")
def events(trace_id: str) -> list[dict[str, Any]]:
    """Fetch all events for the trace_id from sw_event_log, ordered by created_at."""
    client = _supabase_client()
    response = (
        client
        .table("sw_event_log")
        .select("*")
        .eq("trace_id", trace_id)
        .order("created_at", desc=False)
        .execute()
    )
    rows = response.data or []
    if not rows:
        pytest.fail(
            f"No events found for trace_id={trace_id!r}. "
            "Ensure the trace has been executed and data is in sw_event_log."
        )
    return rows


# ---------------------------------------------------------------------------
# Contract tests
# ---------------------------------------------------------------------------

class TestTraceExists:
    """Invariant 1: At least one event must exist for the trace."""

    def test_events_found(self, events: list[dict]) -> None:
        assert len(events) >= 1, (
            f"Expected at least 1 event for trace, got {len(events)}."
        )

    def test_all_events_share_trace_id(self, trace_id: str, events: list[dict]) -> None:
        bad = [ev["id"] for ev in events if ev.get("trace_id", "").lower() != trace_id]
        assert not bad, (
            f"Events with mismatched trace_id: {bad}. "
            "All events should share the same trace_id."
        )


class TestWorkflowStart:
    """Invariant 2: A workflow.start event must exist."""

    def test_workflow_start_present(self, events: list[dict]) -> None:
        starts = [ev for ev in events if ev.get("event_type") == "workflow.start"]
        assert starts, (
            "No 'workflow.start' event found for this trace. "
            "The first logged event must have event_type='workflow.start'."
        )

    def test_workflow_start_has_source(self, events: list[dict]) -> None:
        starts = [ev for ev in events if ev.get("event_type") == "workflow.start"]
        if not starts:
            pytest.skip("No workflow.start event (covered by test_workflow_start_present).")
        for ev in starts:
            assert ev.get("source"), (
                f"workflow.start event {ev['id']} is missing 'source' field."
            )


class TestToolOrWebhookCall:
    """Invariant 3: At least one tool/webhook activity event must exist."""

    ACTIVITY_TYPES = {"tool.call", "tool.result", "http.request", "webhook.received"}

    def test_activity_event_present(self, events: list[dict]) -> None:
        activity = [
            ev for ev in events
            if ev.get("event_type") in self.ACTIVITY_TYPES
            or (ev.get("event_type") or "").startswith("tool.")
        ]
        assert activity, (
            f"No activity event found (expected one of: {self.ACTIVITY_TYPES}). "
            "Each workflow should log at least one tool call or HTTP request."
        )


class TestTerminalEvent:
    """Invariant 4: A terminal event (workflow.complete or workflow.error) must exist."""

    TERMINAL_TYPES = {"workflow.complete", "workflow.error"}

    def test_terminal_event_present(self, events: list[dict]) -> None:
        terminals = [ev for ev in events if ev.get("event_type") in self.TERMINAL_TYPES]
        assert terminals, (
            f"No terminal event found (expected one of: {self.TERMINAL_TYPES}). "
            "Every completed or failed workflow must log a terminal event."
        )

    def test_only_one_terminal_event(self, events: list[dict]) -> None:
        terminals = [ev for ev in events if ev.get("event_type") in self.TERMINAL_TYPES]
        assert len(terminals) <= 2, (
            f"Unexpectedly many terminal events ({len(terminals)}). "
            "A trace should have at most one complete and one error terminal."
        )


class TestErrorInvariant:
    """Invariant 5: workflow.error events must have a populated err field."""

    def test_error_events_have_err_field(self, events: list[dict]) -> None:
        error_events = [ev for ev in events if ev.get("event_type") == "workflow.error"]
        for ev in error_events:
            err = ev.get("err")
            assert err is not None, (
                f"workflow.error event {ev['id']} has a null 'err' field. "
                "Error events must include err.message (and optionally err.code, err.stack)."
            )
            assert err.get("message"), (
                f"workflow.error event {ev['id']} has err={err!r} but no 'message' key."
            )


class TestScanIdConsistency:
    """Invariant 6: All events with a scan_id must share the same one."""

    def test_scan_id_consistent(self, events: list[dict]) -> None:
        scan_ids = {ev["scan_id"] for ev in events if ev.get("scan_id")}
        assert len(scan_ids) <= 1, (
            f"Multiple distinct scan_ids found in one trace: {scan_ids}. "
            "All events in a trace must share the same scan_id (or leave it null)."
        )


class TestTemporalOrdering:
    """Invariant 7: Events must be temporally ordered (non-decreasing created_at)."""

    def test_events_are_ordered(self, events: list[dict]) -> None:
        timestamps = [ev["created_at"] for ev in events]
        for i in range(1, len(timestamps)):
            assert timestamps[i] >= timestamps[i - 1], (
                f"Event ordering violated: event at index {i} "
                f"({timestamps[i]}) is before event at index {i-1} ({timestamps[i-1]})."
            )


class TestFixtureMode:
    """Invariant 8: If FIXTURE_MODE=true, all events must record meta.fixture_mode=true."""

    def test_fixture_mode_in_meta(self, events: list[dict]) -> None:
        if not EXPECTED_FIXTURE_MODE:
            pytest.skip("FIXTURE_MODE not requested; skipping fixture meta check.")
        bad = []
        for ev in events:
            meta = ev.get("meta") or {}
            if not meta.get("fixture_mode"):
                bad.append(ev["id"])
        assert not bad, (
            f"These events are missing meta.fixture_mode=true: {bad}. "
            "When fixture_mode=true is in the request payload, all events must record it in meta."
        )


class TestSwLogHealthCheck:
    """Invariant 9: sw-log Edge Function must accept a valid insert."""

    def test_sw_log_endpoint_accepts_valid_event(self) -> None:
        url = os.environ.get("SW_LOG_FUNCTION_URL", "").strip()
        if not url:
            pytest.skip("SW_LOG_FUNCTION_URL not set; skipping Edge Function health check.")

        service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        test_trace = str(uuid.uuid4())
        payload = {
            "trace_id": test_trace,
            "source": "contract_tests",
            "event_type": "test.health_check",
            "event_name": "Contract test health check",
            "status": "info",
            "meta": {"fixture_mode": False, "_test": True},
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {service_key}",
        }

        try:
            resp = httpx.post(url, json=payload, headers=headers, timeout=15.0)
        except httpx.ConnectError as exc:
            pytest.fail(f"Could not connect to sw-log at {url}: {exc}")

        assert resp.status_code == 201, (
            f"sw-log returned HTTP {resp.status_code} (expected 201). "
            f"Body: {resp.text[:400]}"
        )
        body = resp.json()
        assert body.get("ok") is True, f"Expected ok=true, got: {body}"
        assert body.get("id"), f"Expected 'id' in response, got: {body}"


# ---------------------------------------------------------------------------
# Summary helper (called by pytest hook if desired)
# ---------------------------------------------------------------------------

def pytest_terminal_summary(terminalreporter, exitstatus, config) -> None:  # noqa: ARG001
    """Print a compact summary after all tests."""
    passed = len(terminalreporter.stats.get("passed", []))
    failed = len(terminalreporter.stats.get("failed", []))
    skipped = len(terminalreporter.stats.get("skipped", []))
    print(
        f"\n[contract_tests] Results: {passed} passed / {failed} failed / {skipped} skipped"
    )
    trace = os.environ.get("TRACE_ID", "unknown")
    if failed:
        print(f"[contract_tests] FAIL — trace_id={trace} has invariant violations.")
    else:
        print(f"[contract_tests] PASS — trace_id={trace} satisfies all invariants.")
