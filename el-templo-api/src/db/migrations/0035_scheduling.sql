-- Migration 0035: Scheduling system
-- Creates activities, schedules, bookings, holidays tables
-- Adds country, max_capacity, rom_enabled to branches
-- Adds schedule_id FK to attendance

-- Activities table
CREATE TABLE IF NOT EXISTS `activities` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `description` text,
  `is_active` boolean NOT NULL DEFAULT true,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

-- Schedules table (weekly recurring slots)
CREATE TABLE IF NOT EXISTS `schedules` (
  `id` int NOT NULL AUTO_INCREMENT,
  `branch_id` int NOT NULL,
  `activity_id` int NOT NULL,
  `day_of_week` tinyint NOT NULL,
  `start_time` varchar(5) NOT NULL,
  `end_time` varchar(5) NOT NULL,
  `is_active` boolean NOT NULL DEFAULT true,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_schedules_branch_day_time` (`branch_id`, `day_of_week`, `start_time`),
  CONSTRAINT `schedules_branch_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  CONSTRAINT `schedules_activity_id_fk` FOREIGN KEY (`activity_id`) REFERENCES `activities` (`id`)
);

-- Bookings table
CREATE TABLE IF NOT EXISTS `bookings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `member_id` int NOT NULL,
  `schedule_id` int NOT NULL,
  `booking_date` date NOT NULL,
  `booking_status` enum('confirmed','cancelled','waitlist','no_show') NOT NULL DEFAULT 'confirmed',
  `waitlist_position` int,
  `booked_at` timestamp NOT NULL DEFAULT (now()),
  `cancelled_at` timestamp,
  PRIMARY KEY (`id`),
  KEY `idx_bookings_schedule_date_status` (`schedule_id`, `booking_date`, `booking_status`),
  KEY `idx_bookings_member_date` (`member_id`, `booking_date`),
  UNIQUE KEY `idx_bookings_member_schedule_date` (`member_id`, `schedule_id`, `booking_date`),
  CONSTRAINT `bookings_member_id_fk` FOREIGN KEY (`member_id`) REFERENCES `users` (`id`),
  CONSTRAINT `bookings_schedule_id_fk` FOREIGN KEY (`schedule_id`) REFERENCES `schedules` (`id`)
);

-- Holidays table
CREATE TABLE IF NOT EXISTS `holidays` (
  `id` int NOT NULL AUTO_INCREMENT,
  `country` varchar(2) NOT NULL,
  `date` date NOT NULL,
  `name` varchar(150) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_holidays_country_date` (`country`, `date`)
);

-- Add columns to branches
ALTER TABLE `branches`
  ADD COLUMN IF NOT EXISTS `country` varchar(2) NOT NULL DEFAULT 'AR',
  ADD COLUMN IF NOT EXISTS `max_capacity` int NOT NULL DEFAULT 22,
  ADD COLUMN IF NOT EXISTS `rom_enabled` boolean NOT NULL DEFAULT false;

-- Add schedule_id FK to attendance
ALTER TABLE `attendance`
  ADD COLUMN IF NOT EXISTS `schedule_id` int,
  ADD CONSTRAINT `attendance_schedule_id_fk` FOREIGN KEY (`schedule_id`) REFERENCES `schedules` (`id`);
