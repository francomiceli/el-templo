-- Migration 0036: Performance indexes
-- Adds missing indexes on users, subscriptions, and payments tables
-- for filtering, analytics, and expire-on-read query patterns.

-- Users: branch filtering, role filtering, registration date queries, active filtering
CREATE INDEX `idx_users_branch_id` ON `users` (`branch_id`);
CREATE INDEX `idx_users_role` ON `users` (`role`);
CREATE INDEX `idx_users_created_at` ON `users` (`created_at`);
CREATE INDEX `idx_users_is_active` ON `users` (`is_active`);

-- Subscriptions: expire-on-read (status + end_date), branch filtering
CREATE INDEX `idx_subscriptions_status_end_date` ON `subscriptions` (`subscription_status`, `end_date`);
CREATE INDEX `idx_subscriptions_branch_id` ON `subscriptions` (`branch_id`);

-- Payments: date-range analytics, financial summary by method + date
CREATE INDEX `idx_payments_payment_date` ON `payments` (`payment_date`);
CREATE INDEX `idx_payments_date_method` ON `payments` (`payment_date`, `payment_method`);
