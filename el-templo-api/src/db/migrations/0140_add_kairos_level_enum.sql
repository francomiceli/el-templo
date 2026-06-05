-- Phase 129 Plan 01 (KAIROS-01, D-01, D-07)
-- Additively widen the users.level ENUM to add the new entry tier kairos as the
-- FIRST value. Final order kairos -> alfa -> delta -> sigma -> omega -> spartan,
-- byte-identical to el-templo-api/src/db/schema/users.ts levelEnum (drift lesson
-- 125/126).
--
-- This is a single-statement, behavior-neutral ALTER. It widens the value set
-- only. It does NOT touch any row, does NOT DROP, and keeps DEFAULT alfa (the
-- default change to kairos is phase 130). Existing alfa/delta/sigma/omega/spartan
-- rows are unaffected.
--
-- Comment safety (Phase 103-01 invariant)
--   The migration runner splits this file on semicolons BEFORE stripping line
--   comments, so no semicolon character may appear inside any comment line.
--
-- Hand-written SQL (drizzle-kit meta journal is desynced while the DB is past
-- 0130, same pattern as 0108, 0121, 0125, 0137, 0138, 0139). Do NOT run
-- pnpm db:generate for this enum change (interactive prompts).

ALTER TABLE users MODIFY level ENUM('kairos','alfa','delta','sigma','omega','spartan') NOT NULL DEFAULT 'alfa';

-- completed_sessions.session_level snapshots the level a session was played at.
-- A kairos member's presencial check-in writes 'kairos' here (attendance
-- service), so this enum must accept it too. Same additive widening, kairos
-- first, byte-identical order. This column has no DEFAULT.
ALTER TABLE completed_sessions MODIFY session_level ENUM('kairos','alfa','delta','sigma','omega','spartan') NOT NULL;
