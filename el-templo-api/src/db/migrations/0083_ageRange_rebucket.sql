-- Onboarding AgeRange rebucket: old 3 buckets -> new 4 buckets.
-- Old: 18_28, 29_40, 41_plus
-- New: 18_24, 25_34, 35_50, 50_plus
-- Best-overlap mapping chosen (we only have the bucket, not the real age):
--   18_28  -> 18_24   (loses 25-28yo who stay in 18_24)
--   29_40  -> 25_34   (loses 35-40yo who stay in 25_34)
--   41_plus -> 35_50  (loses >50yo who stay in 35_50)
UPDATE `member_profiles` SET `age_range` = '18_24' WHERE `age_range` = '18_28';
UPDATE `member_profiles` SET `age_range` = '25_34' WHERE `age_range` = '29_40';
UPDATE `member_profiles` SET `age_range` = '35_50' WHERE `age_range` = '41_plus';
