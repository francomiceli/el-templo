-- Phase 119 (D-12, D-15, D-18): create the 4 reusable campaign tables
--
-- FOUNDATION tables for any email broadcast over Resend. Mirrors the Drizzle
-- schema in src/db/schema/campaigns.ts (canonical source of truth).
--
--   campaigns             -- one row per broadcast
--   campaign_sends        -- one row per (campaign, recipient), email snapshot
--   campaign_events       -- forward-only open/click/bounce tracking (D-18)
--   campaign_unsubscribes -- marketing suppression list (D-15)
--
-- Idempotency rationale
--   campaign_sends UNIQUE(campaign_id, user_id) prevents double-enrolling a
--   user in the same campaign (D-12). campaign_unsubscribes UNIQUE(email)
--   makes unsubscribe idempotent so duplicate rows cannot dilute the
--   NOT EXISTS audience filter (D-15). The _migrations row tracks this filename
--   and prevents replay by the project runner (src/db/run-migrations.ts).
--
-- FK convention
--   Constraint names follow Drizzle auto-generated convention so a future
--   pnpm db:generate run and this hand-written SQL converge. All FKs to
--   users/campaigns use ON DELETE CASCADE (future-proofing -- delete-account
--   is soft today). campaign_unsubscribes.user_id and campaign_id are nullable.
--
-- Comment safety (Phase 103-01 invariant)
--   The runner splits on semicolons BEFORE stripping line comments, so NO
--   semicolon character may appear inside any comment line.
--
-- Hand-written SQL. CREATE TABLE without IF NOT EXISTS per project convention
-- (0125/0128 precedent -- runner surfaces "table already exists" as a clear
-- error if applied manually outside the tracker).

CREATE TABLE campaigns (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'draft',
  created_by INT NOT NULL,
  country VARCHAR(2) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  CONSTRAINT campaigns_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE campaign_sends (
  id INT NOT NULL AUTO_INCREMENT,
  campaign_id INT NOT NULL,
  user_id INT NOT NULL,
  email VARCHAR(255) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  resend_message_id VARCHAR(64) NULL,
  sent_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE INDEX uniq_campaign_user (campaign_id, user_id),
  CONSTRAINT campaign_sends_campaign_id_campaigns_id_fk FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  CONSTRAINT campaign_sends_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE campaign_events (
  id INT NOT NULL AUTO_INCREMENT,
  send_id INT NOT NULL,
  type VARCHAR(16) NOT NULL,
  metadata VARCHAR(512) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_campaign_events_send_type (send_id, type),
  CONSTRAINT campaign_events_send_id_campaign_sends_id_fk FOREIGN KEY (send_id) REFERENCES campaign_sends(id) ON DELETE CASCADE
);

CREATE TABLE campaign_unsubscribes (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NULL,
  email VARCHAR(255) NOT NULL,
  campaign_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE INDEX uniq_campaign_unsubscribe_email (email),
  CONSTRAINT campaign_unsubscribes_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT campaign_unsubscribes_campaign_id_campaigns_id_fk FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);
