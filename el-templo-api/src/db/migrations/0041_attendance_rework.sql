-- Step 1: Migrate existing registrado records to confirmado
UPDATE attendance SET attendance_status = 'confirmado' WHERE attendance_status = 'registrado'

--> statement-breakpoint
-- Step 2: Remove registrado from attendance status enum (only confirmado remains)
ALTER TABLE attendance MODIFY COLUMN attendance_status ENUM('confirmado') NOT NULL DEFAULT 'confirmado'

--> statement-breakpoint
-- Step 3: Drop confirmed_at column from attendance
ALTER TABLE attendance DROP COLUMN confirmed_at

--> statement-breakpoint
-- Step 4: Drop fixed_days from subscriptions
ALTER TABLE subscriptions DROP COLUMN fixed_days

--> statement-breakpoint
-- Step 5: Drop grace_check_ins_after_expiry from subscriptions
ALTER TABLE subscriptions DROP COLUMN grace_check_ins_after_expiry

--> statement-breakpoint
-- Step 6: Create subscription_schedules junction table
CREATE TABLE subscription_schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subscription_id INT NOT NULL,
  schedule_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id),
  FOREIGN KEY (schedule_id) REFERENCES schedules(id),
  UNIQUE INDEX idx_sub_schedule (subscription_id, schedule_id),
  INDEX idx_subscription_schedules_sub_id (subscription_id)
)
