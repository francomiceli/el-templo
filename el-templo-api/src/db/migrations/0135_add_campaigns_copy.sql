-- Phase 119 (CR-02): persist the campaign email copy + hero image
--
-- The admin create form collects copySlots (headline/subheadline/body) and an
-- optional heroImageUrl, but the campaigns table had no columns for them, so the
-- copy was validated and then silently dropped. The send pipeline rendered the
-- subject as the headline with an empty subheadline/body. These columns let
-- CampaignService.create persist the real copy and buildTemplateVars read it
-- back at send time.
--
-- Existing draft campaigns keep NULL copy. buildTemplateVars falls back to the
-- subject for the headline when headline IS NULL, so legacy rows still render.
--
-- Comment safety (Phase 103-01 invariant)
--   The runner splits on semicolons BEFORE stripping line comments, so NO
--   semicolon character may appear inside any comment line.
--
-- Hand-written SQL (drizzle-kit meta journal is desynced, same pattern as
-- 0132/0133/0134). ADD COLUMN without IF NOT EXISTS per project convention.

ALTER TABLE campaigns ADD COLUMN headline VARCHAR(255) NULL AFTER country;
ALTER TABLE campaigns ADD COLUMN subheadline VARCHAR(255) NULL AFTER headline;
ALTER TABLE campaigns ADD COLUMN body TEXT NULL AFTER subheadline;
ALTER TABLE campaigns ADD COLUMN hero_image_url VARCHAR(500) NULL AFTER body;
