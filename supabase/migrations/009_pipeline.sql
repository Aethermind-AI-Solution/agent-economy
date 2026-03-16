ALTER TABLE crew_run_drafts
  ADD COLUMN IF NOT EXISTS pipeline_status TEXT NOT NULL DEFAULT 'new'
    CHECK (pipeline_status IN ('new','contacted','replied','interested','closed','skipped')),
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_date DATE;

CREATE INDEX IF NOT EXISTS idx_crew_run_drafts_pipeline
  ON crew_run_drafts (pipeline_status, score DESC);
