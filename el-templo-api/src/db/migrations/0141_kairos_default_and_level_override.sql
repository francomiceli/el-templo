-- Phase 130 Plan 01 (KAIROS-04, KAIROS-06, D-01, D-03, D-05)
-- Two additive, brownfield-safe statements:
--   (1) Flip the users.level column DEFAULT from alfa to kairos so every new
--       member is born kairos. The enum value list/order is byte-identical to
--       migration 0140 and to el-templo-api/src/db/schema/users.ts levelEnum
--       (kairos -> alfa -> delta -> sigma -> omega -> spartan) to avoid enum
--       drift (lesson 125/126). This ONLY changes the DEFAULT. It does NOT
--       touch any existing row, so current alfa/delta/sigma/omega/spartan
--       members keep their level (D-05).
--   (2) Add the level_override boolean column (D-03). Existing rows get 0
--       (false) -- they keep their level and stay auto-graduation eligible but
--       untouched. When a coach manually changes a member's level, the service
--       sets this flag true and auto-graduation skips override=true members.
--
-- Comment safety (Phase 103-01 invariant)
--   The migration runner splits this file on semicolons BEFORE stripping line
--   comments, so no semicolon character may appear inside any comment line.
--
-- Hand-written SQL (drizzle-kit meta journal is desynced while the DB is past
-- 0130, same pattern as 0108, 0121, 0125, 0137, 0138, 0139, 0140). Do NOT run
-- pnpm db:generate for this change (interactive prompts).

ALTER TABLE users MODIFY level ENUM('kairos','alfa','delta','sigma','omega','spartan') NOT NULL DEFAULT 'kairos';

ALTER TABLE users ADD COLUMN level_override BOOLEAN NOT NULL DEFAULT 0;
