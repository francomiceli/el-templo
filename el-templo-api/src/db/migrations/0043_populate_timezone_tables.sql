-- Populate MySQL timezone tables for CONVERT_TZ support
-- Required by bot schedulers (class-reminder, trial-followup) that convert UTC to Argentina time.
--
-- Argentina (Buenos Aires) is UTC-3 with no DST since 2009.
-- This migration inserts the minimum timezone data needed for the bot.
--
-- PREFERRED PRODUCTION APPROACH:
--   Run this on the server to load ALL timezones from the OS:
--     mysql_tzinfo_to_sql /usr/share/zoneinfo | mysql -u root mysql
--   This migration is the fallback for environments where that command
--   cannot be run (e.g., managed MySQL services like RDS, CI environments).
--
-- IDEMPOTENCY:
--   Uses INSERT IGNORE to skip existing rows. If mysql.time_zone already
--   has data (e.g., from mysql_tzinfo_to_sql having been run), these
--   statements will safely no-op without error.

-- Time zone name entry for America/Argentina/Buenos_Aires
INSERT IGNORE INTO mysql.time_zone (Time_zone_id, Use_leap_seconds) VALUES (1, 'N');
INSERT IGNORE INTO mysql.time_zone_name (Name, Time_zone_id) VALUES ('America/Argentina/Buenos_Aires', 1);

-- Transition type: UTC-3 (offset = -10800 seconds), no DST
INSERT IGNORE INTO mysql.time_zone_transition_type (Time_zone_id, Transition_type_id, Offset, Is_DST, Abbreviation) VALUES (1, 0, -10800, 0, 'ART');

-- Single transition (effective from epoch)
INSERT IGNORE INTO mysql.time_zone_transition (Time_zone_id, Transition_time, Transition_type_id) VALUES (1, 0, 0);

-- Also add UTC alias for completeness
INSERT IGNORE INTO mysql.time_zone (Time_zone_id, Use_leap_seconds) VALUES (2, 'N');
INSERT IGNORE INTO mysql.time_zone_name (Name, Time_zone_id) VALUES ('UTC', 2);
INSERT IGNORE INTO mysql.time_zone_transition_type (Time_zone_id, Transition_type_id, Offset, Is_DST, Abbreviation) VALUES (2, 0, 0, 0, 'UTC');
INSERT IGNORE INTO mysql.time_zone_transition (Time_zone_id, Transition_time, Transition_type_id) VALUES (2, 0, 0);

-- Flush tables to pick up changes
FLUSH TABLES;

-- Verify: should return non-NULL (e.g., '2023-12-31 21:00:00' which is UTC-3)
-- SELECT CONVERT_TZ('2024-01-01 00:00:00', 'UTC', 'America/Argentina/Buenos_Aires');
