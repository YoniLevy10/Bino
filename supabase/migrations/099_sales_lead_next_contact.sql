-- Follow-up scheduling for sales leads (manual outreach reminders).
ALTER TABLE sales_leads
  ADD COLUMN IF NOT EXISTS next_contact_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS sales_leads_next_contact_at_idx
  ON sales_leads (next_contact_at)
  WHERE next_contact_at IS NOT NULL
    AND status IN ('discovered', 'qualified', 'contacted');

COMMENT ON COLUMN sales_leads.next_contact_at IS
  'When to follow up next; auto-set +3d on contacted, cleared on demo_scheduled/won/lost/do_not_contact';
