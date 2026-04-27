-- Phase 104 R1: subscription_plans.grants_all_programs flag.
-- Marks plans that auto-enroll the member into every active program for
-- the duration of the subscription (the "Todos los Programas" bundle).
-- NOT NULL DEFAULT false avoids backfill — every existing plan stays
-- false. Enforcement of the auto-enroll behavior is service-layer
-- (subscriptions/service.ts assignPlan + cancelSubscription, Plan 02).

ALTER TABLE `subscription_plans`
  ADD COLUMN `grants_all_programs` BOOLEAN NOT NULL DEFAULT FALSE;
