-- Phase 112 D-13: extend transaction_links.target_kind enum with 'enrollment'
--
-- New target_kind value supports admin add-on financial transactions where
-- a paid program enrollment ID is the link target. Existing rows are not
-- mutated - re-running this migration is blocked by the _migrations
-- tracker D-04 idempotency contract
--
-- Hand-written SQL not drizzle-kit generate per phase 86 90 103-01 111 precedent
--
-- SQL line comments must NOT contain inline semicolons because run-migrations.ts
-- splits the file on the semicolon BEFORE stripping comments

ALTER TABLE transaction_links
  MODIFY COLUMN target_kind ENUM('subscription','debt_balance','transaction','enrollment') NOT NULL;
