-- =============================================================================
-- Migration: 20240301000001_create_sw_event_log.sql
-- Description: Create the append-only event ledger for SecureWatch trace IDs.
--
-- Auth model assumptions:
--   - Supabase service-role key is used by Edge Functions and n8n to INSERT.
--   - "admin" role is represented by a custom claim: (auth.jwt() ->> 'role') = 'admin'
--     OR by a Supabase dashboard user.  Adjust the read policy to match your
--     actual auth model (e.g. a specific email domain, a Supabase team role, etc.).
--   - Regular authenticated users get NO access to these tables.
-- =============================================================================

-- -----------------------------------------------------------------------
-- Table: sw_event_log
-- Append-only event timeline keyed by trace_id.
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sw_event_log (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    trace_id      UUID        NOT NULL,
    scan_id       TEXT,
    client_id     TEXT,
    source        TEXT        NOT NULL,   -- e.g. 'bolt', 'n8n', 'edge_function'
    event_type    TEXT        NOT NULL,   -- e.g. 'workflow.start', 'tool.call', 'workflow.error'
    event_name    TEXT,                   -- human-readable label
    status        TEXT        NOT NULL DEFAULT 'info',  -- 'info' | 'ok' | 'error'
    req           JSONB,                  -- request payload snapshot
    res           JSONB,                  -- response payload snapshot
    err           JSONB,                  -- error details {message, code, stack}
    meta          JSONB,                  -- arbitrary metadata, includes fixture_mode flag
    duration_ms   INTEGER,               -- wall-clock duration of this step (ms)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Immutability: prevent updates and deletes (append-only enforcement)
CREATE OR REPLACE RULE sw_event_log_no_update AS
    ON UPDATE TO public.sw_event_log DO INSTEAD NOTHING;

CREATE OR REPLACE RULE sw_event_log_no_delete AS
    ON DELETE TO public.sw_event_log DO INSTEAD NOTHING;

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS sw_event_log_trace_id_idx   ON public.sw_event_log (trace_id);
CREATE INDEX IF NOT EXISTS sw_event_log_scan_id_idx    ON public.sw_event_log (scan_id);
CREATE INDEX IF NOT EXISTS sw_event_log_client_id_idx  ON public.sw_event_log (client_id);
CREATE INDEX IF NOT EXISTS sw_event_log_created_at_idx ON public.sw_event_log (created_at DESC);
CREATE INDEX IF NOT EXISTS sw_event_log_status_idx     ON public.sw_event_log (status);
CREATE INDEX IF NOT EXISTS sw_event_log_event_type_idx ON public.sw_event_log (event_type);

-- Composite index to support "errors in the last N minutes" alert queries
CREATE INDEX IF NOT EXISTS sw_event_log_status_created_at_idx
    ON public.sw_event_log (status, created_at DESC)
    WHERE status = 'error';

COMMENT ON TABLE  public.sw_event_log IS 'Append-only distributed event ledger for SecureWatch trace correlation.';
COMMENT ON COLUMN public.sw_event_log.trace_id   IS 'Single correlation UUID generated at request entry (Bolt/n8n webhook).';
COMMENT ON COLUMN public.sw_event_log.scan_id    IS 'SecureWatch scan identifier, propagated from the root request.';
COMMENT ON COLUMN public.sw_event_log.client_id  IS 'Tenant/client identifier.';
COMMENT ON COLUMN public.sw_event_log.source     IS 'System that emitted this event: bolt | n8n | edge_function | python.';
COMMENT ON COLUMN public.sw_event_log.event_type IS 'Structured lifecycle type: workflow.start | tool.call | tool.result | workflow.complete | workflow.error.';
COMMENT ON COLUMN public.sw_event_log.meta       IS 'Arbitrary key-value pairs. fixture_mode:true is recorded here when running fixture tests.';

-- -----------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------
ALTER TABLE public.sw_event_log ENABLE ROW LEVEL SECURITY;

-- Policy 1: Service role can INSERT (used by Edge Functions, n8n HTTP calls).
-- The service role bypasses RLS by default in Supabase; this policy is
-- documented for explicit intent.  For strictest control, use SECURITY DEFINER
-- functions for inserts instead of direct table access.
CREATE POLICY "service_role_insert" ON public.sw_event_log
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Policy 2: Admin users can SELECT (read the full event ledger).
-- Assumes a JWT custom claim "role" = "admin".
-- Replace with your actual admin predicate if different.
CREATE POLICY "admin_select" ON public.sw_event_log
    FOR SELECT
    TO authenticated
    USING (
        (auth.jwt() ->> 'role') = 'admin'
        OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );

-- No UPDATE or DELETE policies intentionally omitted (append-only).
