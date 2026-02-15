-- Add video_url column to exercises table for exercise demonstration videos
ALTER TABLE `exercises` ADD COLUMN `video_url` varchar(500) DEFAULT NULL;
