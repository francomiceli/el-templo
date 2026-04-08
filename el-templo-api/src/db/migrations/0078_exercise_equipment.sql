-- Add equipment enum column to exercises table.
-- NULL = untagged, coaches will organically tag exercises via session editing splash.

ALTER TABLE `exercises`
  ADD COLUMN `equipment` enum('barras','anillas','paralelas','cajon','ninguno') DEFAULT NULL AFTER `mobility_related`;
