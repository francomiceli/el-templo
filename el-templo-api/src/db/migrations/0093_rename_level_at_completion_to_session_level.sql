-- Rename level_at_completion -> session_level.
-- Semantic: the level describes the SESSION (which level was trained),
-- not a promotion/downgrade event.
-- Preserves Phase-1 backfilled rows (single DDL on MySQL 8+).
-- Originally introduced in migration 0090 / commit c8d0726b.
-- Phase 99 SPEC: .planning/phases/99-member-selectable-training-level/99-SPEC.md R8.
--
-- Migration numbering note: plan specified 0091, but Phase 98 shipped earlier
-- today and claimed 0091 (multi_currency_and_country_scope) and 0092
-- (normalize_es_prices_to_whole_eur). Renumbered to 0093 — next sequential slot.

ALTER TABLE completed_sessions
  CHANGE COLUMN level_at_completion session_level
    ENUM('alfa','delta','sigma','omega','spartan') NOT NULL;
