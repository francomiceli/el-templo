-- @data-only
-- Inserts the "games" format row. Per Phase 100 SPEC.md Requirement 1:
-- a permissive format where reps/time/rounds are all independently optional.
-- The all-optional enforcement is handled at the UI layer (FormatParamsEditor
-- defaultsMap in el-templo-admin), not here. Idempotent: skips insert when
-- a row with name='games' already exists.
--
-- Migration numbering note: plan specified 0093, but Phase 98 shipped earlier and
-- claimed 0091 and 0092, Phase 99 claimed 0093, Phase 100-01 uses 0094 for the
-- session_blocks.custom_title ALTER. Renumbered to 0095 — next slot.

INSERT INTO formats (name, type, description)
SELECT 'games', 'technical', 'Juegos / warmup libre: reps, tiempo y rondas opcionales'
WHERE NOT EXISTS (SELECT 1 FROM formats WHERE name = 'games');
