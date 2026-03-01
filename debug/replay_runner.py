#!/usr/bin/env python3
"""
replay_runner.py — SecureWatch event replay tool
=================================================

Fetches the root event for a given trace_id from sw_event_log and replays
the original request payload into a configurable entrypoint URL, preserving
the same trace_id so the replayed run is fully traceable.

Usage
-----
    python replay_runner.py --trace-id <UUID>              # uses STAGING by default
    python replay_runner.py --trace-id <UUID> --env local
    python replay_runner.py --trace-id <UUID> --env staging
    python replay_runner.py --trace-id <UUID> --dry-run    # print payload only

Environment
-----------
    SUPABASE_URL              – Supabase project URL
    SUPABASE_SERVICE_ROLE_KEY – service-role key
    STAGING_ENTRYPOINT_URL    – base URL for staging n8n webhooks
    LOCAL_ENTRYPOINT_URL      – base URL for local n8n webhooks
    WEBHOOK_API_KEY           – X-API-Key header value for webhook auth

All env vars can be set in debug/.env (auto-loaded by python-dotenv).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv
from supabase import create_client, Client

# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------

# Load .env from the same directory as this script, then from project root.
_SCRIPT_DIR = Path(__file__).parent
load_dotenv(_SCRIPT_DIR / ".env")
load_dotenv(_SCRIPT_DIR.parent / ".env")

UUID_RE_STR = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"


# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------

def _supabase_client() -> Client:
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        print(
            "ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.\n"
            "       Copy debug/.env.example to debug/.env and fill in values.",
            file=sys.stderr,
        )
        sys.exit(1)
    return create_client(url, key)


def fetch_trace_events(trace_id: str) -> list[dict[str, Any]]:
    """Return all sw_event_log rows for trace_id, ordered by created_at."""
    client = _supabase_client()
    response = (
        client
        .table("sw_event_log")
        .select("*")
        .eq("trace_id", trace_id.lower())
        .order("created_at", desc=False)
        .execute()
    )
    return response.data or []


def find_root_event(events: list[dict[str, Any]]) -> dict[str, Any] | None:
    """
    Locate the root event to replay.

    Priority:
      1. event_type == 'workflow.start'
      2. Earliest event with a non-null `req` payload
      3. The earliest event overall
    """
    if not events:
        return None

    # Priority 1
    for ev in events:
        if ev.get("event_type") == "workflow.start":
            return ev

    # Priority 2
    for ev in events:
        if ev.get("req") is not None:
            return ev

    # Priority 3
    return events[0]


# ---------------------------------------------------------------------------
# Replay logic
# ---------------------------------------------------------------------------

def build_entrypoint_url(env: str, root_event: dict[str, Any]) -> str:
    """
    Build the full webhook URL to replay into.

    Falls back to the meta.webhook_path stored on the event if present,
    otherwise the user must supply --webhook-path.
    """
    if env == "local":
        base = os.environ.get("LOCAL_ENTRYPOINT_URL", "").strip().rstrip("/")
    else:
        base = os.environ.get("STAGING_ENTRYPOINT_URL", "").strip().rstrip("/")

    if not base:
        key = "LOCAL_ENTRYPOINT_URL" if env == "local" else "STAGING_ENTRYPOINT_URL"
        print(f"ERROR: {key} is not set in your .env.", file=sys.stderr)
        sys.exit(1)

    # Try to derive path from stored event metadata
    meta = root_event.get("meta") or {}
    webhook_path = meta.get("webhook_path", "")
    source = root_event.get("source", "unknown")

    # Map source to default webhook path if not stored
    if not webhook_path:
        default_paths = {
            "agent-1": "/security-scanner-start",
            "bolt:agent-1": "/security-scanner-start",
            "agent-2": "/vulnerability-assessment-start",
            "agent-3": "/compliance-start",
        }
        webhook_path = default_paths.get(source, "/security-scanner-start")

    return f"{base}{webhook_path}"


def replay(
    trace_id: str,
    env: str = "staging",
    webhook_path: str | None = None,
    dry_run: bool = False,
    timeout_s: float = 120.0,
) -> None:
    """Fetch the root event and replay it."""
    print(f"\n[replay_runner] Fetching trace: {trace_id}")
    events = fetch_trace_events(trace_id)

    if not events:
        print(f"ERROR: No events found for trace_id={trace_id}", file=sys.stderr)
        sys.exit(1)

    print(f"[replay_runner] Found {len(events)} event(s) for this trace.")

    root = find_root_event(events)
    if root is None:
        print("ERROR: Could not identify root event.", file=sys.stderr)
        sys.exit(1)

    print(
        f"[replay_runner] Root event: id={root['id']}  "
        f"event_type={root.get('event_type')}  source={root.get('source')}"
    )

    # Build replay payload — use stored req, inject trace_id + mark as replay
    req_payload: dict[str, Any] = dict(root.get("req") or {})
    req_payload["trace_id"] = trace_id          # preserve original trace_id
    req_payload["_replay"] = True
    req_payload["_original_event_id"] = root["id"]

    # Build URL
    url = (
        f"{(os.environ.get('STAGING_ENTRYPOINT_URL' if env == 'staging' else 'LOCAL_ENTRYPOINT_URL', '').rstrip('/'))}{webhook_path}"
        if webhook_path
        else build_entrypoint_url(env, root)
    )

    headers: dict[str, str] = {"Content-Type": "application/json"}
    api_key = os.environ.get("WEBHOOK_API_KEY", "").strip()
    if api_key:
        headers["X-API-Key"] = api_key

    # Print full event timeline
    print("\n── Event timeline ───────────────────────────────────────")
    for ev in events:
        err_summary = ""
        if ev.get("err"):
            err_obj = ev["err"]
            msg = err_obj.get("message", str(err_obj))[:80]
            err_summary = f"  ERR={msg}"
        print(
            f"  {ev['created_at']}  [{ev.get('status','?'):5s}]  "
            f"{ev.get('event_type','?'):30s}  {ev.get('source','?')}{err_summary}"
        )
    print("─────────────────────────────────────────────────────────\n")

    print(f"[replay_runner] Replay target: {url}")
    print(f"[replay_runner] Payload:\n{json.dumps(req_payload, indent=2)}")

    if dry_run:
        print("\n[replay_runner] --dry-run: skipping HTTP call.")
        return

    print(f"\n[replay_runner] Sending replay request (timeout={timeout_s}s)...")
    t0 = time.monotonic()
    try:
        with httpx.Client(timeout=timeout_s) as http:
            resp = http.post(url, json=req_payload, headers=headers)
        elapsed = time.monotonic() - t0
        print(f"[replay_runner] Response: HTTP {resp.status_code}  ({elapsed:.2f}s)")
        try:
            body = resp.json()
            print(f"[replay_runner] Body:\n{json.dumps(body, indent=2)}")
        except Exception:
            print(f"[replay_runner] Body (raw): {resp.text[:500]}")

        if resp.status_code >= 400:
            sys.exit(1)

    except httpx.TimeoutException:
        elapsed = time.monotonic() - t0
        print(
            f"[replay_runner] Request timed out after {elapsed:.2f}s.",
            file=sys.stderr,
        )
        sys.exit(1)
    except Exception as exc:
        print(f"[replay_runner] Request failed: {exc}", file=sys.stderr)
        sys.exit(1)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Replay a SecureWatch root event by trace_id.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument(
        "--trace-id",
        required=True,
        metavar="UUID",
        help="trace_id UUID to look up and replay.",
    )
    p.add_argument(
        "--env",
        choices=["staging", "local"],
        default="staging",
        help="Target entrypoint: staging (default) or local.",
    )
    p.add_argument(
        "--webhook-path",
        metavar="PATH",
        default=None,
        help="Override webhook path suffix (e.g. /security-scanner-start).",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print payload and URL without sending the request.",
    )
    p.add_argument(
        "--timeout",
        type=float,
        default=120.0,
        metavar="SECONDS",
        help="HTTP request timeout in seconds (default: 120).",
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()

    import re
    if not re.match(UUID_RE_STR, args.trace_id, re.IGNORECASE):
        print(
            f"ERROR: --trace-id '{args.trace_id}' is not a valid UUID.",
            file=sys.stderr,
        )
        sys.exit(1)

    replay(
        trace_id=args.trace_id,
        env=args.env,
        webhook_path=args.webhook_path,
        dry_run=args.dry_run,
        timeout_s=args.timeout,
    )


if __name__ == "__main__":
    main()
