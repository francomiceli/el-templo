-- Phase 119 (D-24): add branches.address + backfill canonical sede addresses
--
-- D-13 source: the trial-campaign email lists each physical sede with its
-- street address. branches had no address column (name/code/timezone/country/
-- capacity only), so this adds a nullable address and backfills the 8 canonical
-- sedes from el-templo-web/data/sedes.ts (7 Mar del Plata + Barcelona).
--
-- Backfill matches by name keyword (LIKE) rather than code, because branch
-- codes drift across environments (local seed vs production). Each UPDATE is an
-- idempotent no-op where the sede is absent, and re-running this migration
-- after a manual replay leaves identical values. Virtual branches (Templo
-- Online) intentionally stay NULL.
--
-- Comment safety (Phase 103-01 invariant)
--   The runner splits on semicolons BEFORE stripping line comments, so NO
--   semicolon character may appear inside any comment line.
--
-- Hand-written SQL (drizzle-kit meta journal is desynced, same pattern as
-- 0125/0128). ADD COLUMN without IF NOT EXISTS per project convention.

ALTER TABLE branches ADD COLUMN address VARCHAR(255) NULL AFTER country;

UPDATE branches SET address = 'Av. Constitución 6745' WHERE name LIKE '%Constituci%' AND is_virtual = 0;
UPDATE branches SET address = 'Jujuy 3761' WHERE name LIKE '%Jujuy%' AND is_virtual = 0;
UPDATE branches SET address = 'Moreno 3751' WHERE name LIKE '%Moreno%' AND is_virtual = 0;
UPDATE branches SET address = 'Alem 3958' WHERE name LIKE '%Alem%' AND is_virtual = 0;
UPDATE branches SET address = 'Mario Bravo 618' WHERE name LIKE '%Mogotes%' AND is_virtual = 0;
UPDATE branches SET address = 'Parque Primavesi' WHERE name LIKE '%Park%' AND is_virtual = 0;
UPDATE branches SET address = 'Los Lobos, Chapadmalal' WHERE name LIKE '%Chapadmalal%' AND is_virtual = 0;
UPDATE branches SET address = 'Eixample, Av. Diagonal 368' WHERE (name LIKE '%Eixample%' OR name LIKE '%Barcelona%') AND is_virtual = 0;
