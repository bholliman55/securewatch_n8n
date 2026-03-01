-- =============================================================================
-- Migration: 20240301000003_sw_event_log_helpers.sql
-- Description: Helper views and functions for querying the event ledger.
-- =============================================================================

-- -----------------------------------------------------------------------
-- View: v_trace_timeline
-- Full ordered timeline for a trace_id (admin-accessible via RLS on base table).
-- -----------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_trace_timeline AS
SELECT
    l.trace_id,
    l.id          AS event_id,
    l.created_at,
    l.source,
    l.event_type,
    l.event_name,
    l.status,
    l.scan_id,
    l.client_id,
    l.duration_ms,
    l.err,
    l.meta
FROM public.sw_event_log l
ORDER BY l.trace_id, l.created_at ASC;

COMMENT ON VIEW public.v_trace_timeline IS
    'Ordered lifecycle view per trace_id. Inherits RLS from sw_event_log.';

-- -----------------------------------------------------------------------
-- View: v_recent_errors
-- Last 24 h errors — used by the n8n alert cron workflow.
-- -----------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_recent_errors AS
SELECT
    l.trace_id,
    l.scan_id,
    l.client_id,
    l.source,
    l.event_type,
    l.event_name,
    l.err,
    l.meta,
    l.created_at
FROM public.sw_event_log l
WHERE l.status = 'error'
  AND l.created_at >= now() - INTERVAL '24 hours'
ORDER BY l.created_at DESC;

COMMENT ON VIEW public.v_recent_errors IS
    'Recent error events for alerting. Filter by created_at in the query to narrow window.';

-- -----------------------------------------------------------------------
-- Function: sw_event_log_errors_since(minutes INT)
-- Returns error rows within the last N minutes.
-- Called by the n8n alert workflow via Supabase RPC.
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sw_event_log_errors_since(minutes INT DEFAULT 15)
RETURNS TABLE (
    trace_id    UUID,
    scan_id     TEXT,
    client_id   TEXT,
    source      TEXT,
    event_type  TEXT,
    event_name  TEXT,
    err         JSONB,
    meta        JSONB,
    created_at  TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT
        l.trace_id,
        l.scan_id,
        l.client_id,
        l.source,
        l.event_type,
        l.event_name,
        l.err,
        l.meta,
        l.created_at
    FROM public.sw_event_log l
    WHERE l.status = 'error'
      AND l.created_at >= now() - (minutes || ' minutes')::INTERVAL
    ORDER BY l.created_at DESC;
$$;

COMMENT ON FUNCTION public.sw_event_log_errors_since IS
    'Returns error events within the last N minutes. Used by the n8n cron alert workflow.';
