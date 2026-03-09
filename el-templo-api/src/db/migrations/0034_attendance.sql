-- Phase 50: Attendance
-- Create attendance table for QR check-in, coach confirmation, and AURA awards

CREATE TABLE `attendance` (
  `id` int AUTO_INCREMENT NOT NULL,
  `member_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `checked_in_at` timestamp NOT NULL DEFAULT (now()),
  `confirmed_at` timestamp NULL,
  `attendance_status` enum('registrado','confirmado') NOT NULL DEFAULT 'registrado',
  `attendance_source` enum('qr','manual') NOT NULL DEFAULT 'qr',
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `attendance_id` PRIMARY KEY(`id`)
);

-- Foreign keys
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_member_id_users_id_fk` FOREIGN KEY (`member_id`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Indexes for fast lookups
CREATE INDEX `idx_attendance_member_checked_in` ON `attendance` (`member_id`, `checked_in_at`);
CREATE INDEX `idx_attendance_branch_checked_in` ON `attendance` (`branch_id`, `checked_in_at`);
