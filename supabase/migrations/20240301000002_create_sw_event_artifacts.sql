-- =============================================================================
-- Migration: 20240301000002_create_sw_event_artifacts.sql
-- Description: Optional large-payload / storage-path artifact table for events.
--
-- Each artifact row references an event in sw_event_log via event_id.
-- Large payloads (>8 KB) should be uploaded to Supabase Storage and only the
-- storage path stored here; small payloads can be inlined in the data column.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.sw_event_artifacts (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id      UUID        NOT NULL REFERENCES public.sw_event_log(id),
    trace_id      UUID        NOT NULL,   -- denormalised for fast trace-scoped queries
    artifact_type TEXT        NOT NULL,   -- 'payload' | 'report' | 'screenshot' | 'log_file'
    content_type  TEXT,                   -- MIME type, e.g. 'application/json', 'text/html'
    storage_path  TEXT,                   -- Supabase Storage object path (if large)
    data          JSONB,                  -- inline small payload (<8 KB)
    size_bytes    INTEGER,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only enforcement
CREATE OR REPLACE RULE sw_event_artifacts_no_update AS
    ON UPDATE TO public.sw_event_artifacts DO INSTEAD NOTHING;

CREATE OR REPLACE RULE sw_event_artifacts_no_delete AS
    ON DELETE TO public.sw_event_artifacts DO INSTEAD NOTHING;

CREATE INDEX IF NOT EXISTS sw_event_artifacts_event_id_idx  ON public.sw_event_artifacts (event_id);
CREATE INDEX IF NOT EXISTS sw_event_artifacts_trace_id_idx  ON public.sw_event_artifacts (trace_id);
CREATE INDEX IF NOT EXISTS sw_event_artifacts_created_at_idx ON public.sw_event_artifacts (created_at DESC);

COMMENT ON TABLE  public.sw_event_artifacts IS 'Optional large-payload overflow for sw_event_log entries.';
COMMENT ON COLUMN public.sw_event_artifacts.storage_path IS 'Supabase Storage path like debug-artifacts/2024/03/{trace_id}/{id}.json';

-- -----------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------
ALTER TABLE public.sw_event_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_insert" ON public.sw_event_artifacts
    FOR INSERT
    TO service_role
    WITH CHECK (true);

CREATE POLICY "admin_select" ON public.sw_event_artifacts
    FOR SELECT
    TO authenticated
    USING (
        (auth.jwt() ->> 'role') = 'admin'
        OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    );
