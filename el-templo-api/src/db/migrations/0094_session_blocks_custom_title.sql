-- Adds nullable custom_title column to session_blocks for Phase 100 (games format).
-- Per SPEC Requirement 2: INITIUM blocks accept a per-block free-text title that
-- customizes the PDF subtitle. Column is nullable so existing rows remain unchanged
-- and their PDF output is byte-identical to pre-phase output.
--
-- Migration numbering note: plan specified 0092, but Phase 98 shipped earlier and
-- claimed 0091 and 0092, Phase 99 claimed 0093. Renumbered to 0094 — next slot.

ALTER TABLE `session_blocks` ADD `custom_title` varchar(100);
