-- Adds level_at_completion to completed_sessions so each completion records
-- which level the member was training at, independent of their current users.level.
-- Enables members to train at any level (view/train any level) while coach
-- promotions remain the sole path for changing users.level itself.

ALTER TABLE completed_sessions
  ADD COLUMN level_at_completion
    ENUM('alfa','delta','sigma','omega','spartan') NULL
    AFTER day_id;

-- Backfill from day_id suffix. Every day_id ends with the level (W7-lunes-alfa,
-- GP-tren_inferior-W7-lunes-sigma, etc.). Verified 11/11 prod rows match.
UPDATE completed_sessions
  SET level_at_completion = SUBSTRING_INDEX(day_id, '-', -1)
  WHERE level_at_completion IS NULL;

-- Lock the column as required going forward.
ALTER TABLE completed_sessions
  MODIFY level_at_completion
    ENUM('alfa','delta','sigma','omega','spartan') NOT NULL;
