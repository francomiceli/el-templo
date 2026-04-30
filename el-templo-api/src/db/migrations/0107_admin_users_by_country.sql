-- Phase 110: Admin users por pais + multi-sede staff
-- 1. ALTER users ADD COLUMN country VARCHAR(2) NULL
-- 2. CREATE TABLE user_branches with FK CASCADE to users + branches
-- 3. Backfill UPDATE users.country from users -> branches JOIN for admin/gestion
-- 4. Backfill INSERT INTO user_branches from users for coach/recepcion
--
-- Idempotency: the _migrations tracker prevents a successful file from running
-- twice. Defensive UPDATE guarded by IS NULL and INSERT IGNORE keep partial
-- replays safe. CREATE TABLE without IF NOT EXISTS surfaces a clear error if
-- DDL was applied outside the tracker.
--
-- Note (Phase 103-01 precedent): SQL line comments must NOT contain inline
-- semicolons because run-migrations.ts splits the file on the semicolon
-- BEFORE stripping comments.

ALTER TABLE users ADD COLUMN country VARCHAR(2) NULL;

CREATE TABLE user_branches (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  branch_id INT NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_user_branches_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_branches_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  UNIQUE KEY user_branch_unique (user_id, branch_id),
  INDEX idx_user_branches_user_id (user_id),
  INDEX idx_user_branches_branch_id (branch_id)
);

UPDATE users
SET country = (SELECT country FROM branches WHERE branches.id = users.branch_id)
WHERE role IN ('admin', 'gestion') AND country IS NULL;

INSERT IGNORE INTO user_branches (user_id, branch_id)
SELECT id, branch_id FROM users WHERE role IN ('coach', 'recepcion');
