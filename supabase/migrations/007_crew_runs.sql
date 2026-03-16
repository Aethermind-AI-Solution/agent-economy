CREATE TABLE IF NOT EXISTS crew_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  company_count INTEGER,
  lead_count    INTEGER,
  draft_count   INTEGER,
  error         TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crew_run_drafts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_run_id      UUID NOT NULL REFERENCES crew_runs(id) ON DELETE CASCADE,
  company_name     TEXT NOT NULL,
  industry         TEXT,
  decision_maker   TEXT,
  score            INTEGER,
  subject_line     TEXT,
  email_body       TEXT,
  linkedin_message TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_runs_created
  ON crew_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crew_run_drafts_run
  ON crew_run_drafts (crew_run_id, score DESC);

ALTER TABLE crew_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY crew_runs_service_all ON crew_runs
  FOR ALL TO service_role USING (true);
ALTER TABLE crew_run_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY crew_run_drafts_service_all ON crew_run_drafts
  FOR ALL TO service_role USING (true);
