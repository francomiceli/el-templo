-- Add linear difficulty column to exercises table
-- Linear scale: Alfa 1-3, Delta 4-6, Sigma 7-8, Omega 9-10, Spartan 11-12
ALTER TABLE `exercises` ADD COLUMN `dificultad_lineal` int NOT NULL DEFAULT 1;
--> statement-breakpoint
-- Calculate linear difficulty from existing level and difficulty values
UPDATE `exercises` SET `dificultad_lineal` = CASE
  WHEN `level` = 'alfa' THEN `difficulty`
  WHEN `level` = 'delta' THEN `difficulty` + 3
  WHEN `level` = 'sigma' THEN `difficulty` + 6
  WHEN `level` = 'omega' THEN `difficulty` + 8
  WHEN `level` = 'spartan' THEN `difficulty` + 10
  ELSE `difficulty`
END;
--> statement-breakpoint
-- Add index for efficient difficulty-based filtering
CREATE INDEX `exercises_dificultad_lineal_idx` ON `exercises` (`dificultad_lineal`);
