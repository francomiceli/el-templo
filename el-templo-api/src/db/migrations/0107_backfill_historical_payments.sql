-- ONE-SHOT BACKFILL — v4.8 historical payments (2026-04-29)
--
-- Reinjects 21 real historical payments from the dropped `payments` table
-- (Chapa + BCN, abril 2026) into financial_transactions + transaction_links,
-- plus 1 balance row for Purinán (sub 6116, pre-existing ADEUDA).
--
-- Source: backup eltemplo_20260428_060001.sql.gz, post-cleanup of test data,
-- auto-charges, sub recreations, and duplicate users.
--
-- Atomicity: wrapped in START TRANSACTION ... COMMIT. Connection-level
-- mysql2; if any statement fails, MySQL auto-rollbacks on close and the
-- migration is NOT marked applied → next deploy retries from clean state.
--
-- Environment safety: a sentinel @run flag gates every INSERT on the
-- presence of prod-specific user/branch/sub IDs. In test DBs and staging
-- (where these IDs don't exist) every INSERT is a 0-row no-op, so the
-- migration applies cleanly without polluting non-prod data. In prod
-- every INSERT applies.

START TRANSACTION;
--> statement-breakpoint

-- Sentinel: 1 only if all referenced prod IDs exist. Test/staging → 0.
SET @run = (SELECT IF(
  EXISTS(SELECT 1 FROM users WHERE id = 5821)
  AND EXISTS(SELECT 1 FROM users WHERE id = 5707)
  AND EXISTS(SELECT 1 FROM users WHERE id = 5721)
  AND EXISTS(SELECT 1 FROM users WHERE id = 5860)
  AND EXISTS(SELECT 1 FROM branches WHERE id = 14)
  AND EXISTS(SELECT 1 FROM branches WHERE id = 15)
  AND EXISTS(SELECT 1 FROM subscriptions WHERE id = 6086)
  AND EXISTS(SELECT 1 FROM subscriptions WHERE id = 6116),
  1, 0
));
--> statement-breakpoint

-- ── 21 payment pairs (financial_transaction + transaction_link) ──
-- Pattern: each financial_transaction INSERT is gated by @run=1 (no-op in
-- non-prod). Each transaction_link INSERT looks up the just-inserted
-- parent by LAST_INSERT_ID() — if parent skipped, LAST_INSERT_ID() stays
-- at 0 and the link's WHERE clause matches no rows.

-- pay 31: BCN, EUR 75 transfer, 2026-04-23
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
SELECT 5821, 'plan_charge', 'inflow', 75, 'EUR', 'transfer', '2026-04-23', '2026-04-23', 14, 5721, NULL
FROM (SELECT 1) AS t WHERE @run = 1;
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
SELECT id, 'subscription', 6086, 75 FROM financial_transactions WHERE id = LAST_INSERT_ID() AND id > 0;
--> statement-breakpoint

-- pay 32: BCN, EUR 75 transfer, 2026-04-23 (preventa nota)
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
SELECT 5822, 'plan_charge', 'inflow', 75, 'EUR', 'transfer', '2026-04-23', '2026-04-23', 14, 5721, 'Había pagado preventa en febrero. Se le activa hoy que fue su primera clase.'
FROM (SELECT 1) AS t WHERE @run = 1;
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
SELECT id, 'subscription', 6087, 75 FROM financial_transactions WHERE id = LAST_INSERT_ID() AND id > 0;
--> statement-breakpoint

-- pay 34: Chapa, ARS 65000 cash, 2026-04-23
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
SELECT 5825, 'plan_charge', 'inflow', 65000, 'ARS', 'cash', '2026-04-23', '2026-04-23', 15, 5707, NULL
FROM (SELECT 1) AS t WHERE @run = 1;
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
SELECT id, 'subscription', 6089, 65000 FROM financial_transactions WHERE id = LAST_INSERT_ID() AND id > 0;
--> statement-breakpoint

-- pay 35: BCN, EUR 75 transfer, 2026-05-04
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
SELECT 5826, 'plan_charge', 'inflow', 75, 'EUR', 'transfer', '2026-05-04', '2026-05-04', 14, 5721, NULL
FROM (SELECT 1) AS t WHERE @run = 1;
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
SELECT id, 'subscription', 6090, 75 FROM financial_transactions WHERE id = LAST_INSERT_ID() AND id > 0;
--> statement-breakpoint

-- pay 36: Chapa, ARS 65000 transfer, 2026-04-23
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
SELECT 5827, 'plan_charge', 'inflow', 65000, 'ARS', 'transfer', '2026-04-23', '2026-04-23', 15, 5707, NULL
FROM (SELECT 1) AS t WHERE @run = 1;
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
SELECT id, 'subscription', 6091, 65000 FROM financial_transactions WHERE id = LAST_INSERT_ID() AND id > 0;
--> statement-breakpoint

-- pay 39: Chapa, ARS 65000 transfer, 2026-04-20
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
SELECT 5832, 'plan_charge', 'inflow', 65000, 'ARS', 'transfer', '2026-04-20', '2026-04-20', 15, 5707, NULL
FROM (SELECT 1) AS t WHERE @run = 1;
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
SELECT id, 'subscription', 6094, 65000 FROM financial_transactions WHERE id = LAST_INSERT_ID() AND id > 0;
--> statement-breakpoint

-- pay 40: Chapa, ARS 65000 transfer, 2026-04-20
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
SELECT 5831, 'plan_charge', 'inflow', 65000, 'ARS', 'transfer', '2026-04-20', '2026-04-20', 15, 5707, NULL
FROM (SELECT 1) AS t WHERE @run = 1;
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
SELECT id, 'subscription', 6095, 65000 FROM financial_transactions WHERE id = LAST_INSERT_ID() AND id > 0;
--> statement-breakpoint

-- pay 41: Chapa, ARS 65000 transfer, 2026-04-22
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
SELECT 5803, 'plan_charge', 'inflow', 65000, 'ARS', 'transfer', '2026-04-22', '2026-04-22', 15, 5707, NULL
FROM (SELECT 1) AS t WHERE @run = 1;
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
SELECT id, 'subscription', 6096, 65000 FROM financial_transactions WHERE id = LAST_INSERT_ID() AND id > 0;
--> statement-breakpoint

-- pay 43: Chapa, ARS 65000 transfer, 2026-04-27
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
SELECT 5833, 'plan_charge', 'inflow', 65000, 'ARS', 'transfer', '2026-04-27', '2026-04-27', 15, 5707, NULL
FROM (SELECT 1) AS t WHERE @run = 1;
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
SELECT id, 'subscription', 6098, 65000 FROM financial_transactions WHERE id = LAST_INSERT_ID() AND id > 0;
--> statement-breakpoint

-- pay 44: Chapa, ARS 65000 cash, 2026-04-27
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
SELECT 5834, 'plan_charge', 'inflow', 65000, 'ARS', 'cash', '2026-04-27', '2026-04-27', 15, 5707, NULL
FROM (SELECT 1) AS t WHERE @run = 1;
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
SELECT id, 'subscription', 6099, 65000 FROM financial_transactions WHERE id = LAST_INSERT_ID() AND id > 0;
--> statement-breakpoint

-- pay 45: Chapa, ARS 65000 cash, 2026-04-27
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
SELECT 5835, 'plan_charge', 'inflow', 65000, 'ARS', 'cash', '2026-04-27', '2026-04-27', 15, 5707, NULL
FROM (SELECT 1) AS t WHERE @run = 1;
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
SELECT id, 'subscription', 6100, 65000 FROM financial_transactions WHERE id = LAST_INSERT_ID() AND id > 0;
--> statement-breakpoint

-- pay 47: Chapa, ARS 65000 transfer, 2026-04-28
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
SELECT 5836, 'plan_charge', 'inflow', 65000, 'ARS', 'transfer', '2026-04-28', '2026-04-28', 15, 5707, NULL
FROM (SELECT 1) AS t WHERE @run = 1;
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
SELECT id, 'subscription', 6102, 65000 FROM financial_transactions WHERE id = LAST_INSERT_ID() AND id > 0;
--> statement-breakpoint

-- pay 48: Chapa, ARS 65000 cash, 2026-04-28
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
SELECT 5839, 'plan_charge', 'inflow', 65000, 'ARS', 'cash', '2026-04-28', '2026-04-28', 15, 5707, NULL
FROM (SELECT 1) AS t WHERE @run = 1;
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
SELECT id, 'subscription', 6103, 65000 FROM financial_transactions WHERE id = LAST_INSERT_ID() AND id > 0;
--> statement-breakpoint

-- pay 49: BCN, EUR 75 transfer, 2026-04-24
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
SELECT 5841, 'plan_charge', 'inflow', 75, 'EUR', 'transfer', '2026-04-24', '2026-04-24', 14, 5721, NULL
FROM (SELECT 1) AS t WHERE @run = 1;
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
SELECT id, 'subscription', 6104, 75 FROM financial_transactions WHERE id = LAST_INSERT_ID() AND id > 0;
--> statement-breakpoint

-- pay 50: Chapa, ARS 80000 cash, 2026-04-22
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
SELECT 5842, 'plan_charge', 'inflow', 80000, 'ARS', 'cash', '2026-04-22', '2026-04-22', 15, 5707, NULL
FROM (SELECT 1) AS t WHERE @run = 1;
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
SELECT id, 'subscription', 6105, 80000 FROM financial_transactions WHERE id = LAST_INSERT_ID() AND id > 0;
--> statement-breakpoint

-- pay 51: Chapa, ARS 65000 transfer, 2026-04-21
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
SELECT 5843, 'plan_charge', 'inflow', 65000, 'ARS', 'transfer', '2026-04-21', '2026-04-21', 15, 5707, NULL
FROM (SELECT 1) AS t WHERE @run = 1;
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
SELECT id, 'subscription', 6106, 65000 FROM financial_transactions WHERE id = LAST_INSERT_ID() AND id > 0;
--> statement-breakpoint

-- pay 52: BCN, EUR 75 card, 2026-04-27
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
SELECT 5851, 'plan_charge', 'inflow', 75, 'EUR', 'card', '2026-04-27', '2026-04-27', 14, 5721, NULL
FROM (SELECT 1) AS t WHERE @run = 1;
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
SELECT id, 'subscription', 6108, 75 FROM financial_transactions WHERE id = LAST_INSERT_ID() AND id > 0;
--> statement-breakpoint

-- pay 53: Chapa, ARS 80000 transfer, 2026-04-27
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
SELECT 5844, 'plan_charge', 'inflow', 80000, 'ARS', 'transfer', '2026-04-27', '2026-04-27', 15, 5707, NULL
FROM (SELECT 1) AS t WHERE @run = 1;
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
SELECT id, 'subscription', 6109, 80000 FROM financial_transactions WHERE id = LAST_INSERT_ID() AND id > 0;
--> statement-breakpoint

-- pay 54: Chapa, ARS 65000 cash, 2026-04-28
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
SELECT 5852, 'plan_charge', 'inflow', 65000, 'ARS', 'cash', '2026-04-28', '2026-04-28', 15, 5707, NULL
FROM (SELECT 1) AS t WHERE @run = 1;
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
SELECT id, 'subscription', 6110, 65000 FROM financial_transactions WHERE id = LAST_INSERT_ID() AND id > 0;
--> statement-breakpoint

-- pay 55: BCN, EUR 75 cash, 2026-04-27
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
SELECT 5855, 'plan_charge', 'inflow', 75, 'EUR', 'cash', '2026-04-27', '2026-04-27', 14, 5721, NULL
FROM (SELECT 1) AS t WHERE @run = 1;
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
SELECT id, 'subscription', 6111, 75 FROM financial_transactions WHERE id = LAST_INSERT_ID() AND id > 0;
--> statement-breakpoint

-- pay 56: BCN, EUR 75 cash, 2026-04-27
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
SELECT 5856, 'plan_charge', 'inflow', 75, 'EUR', 'cash', '2026-04-27', '2026-04-27', 14, 5721, NULL
FROM (SELECT 1) AS t WHERE @run = 1;
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
SELECT id, 'subscription', 6112, 75 FROM financial_transactions WHERE id = LAST_INSERT_ID() AND id > 0;
--> statement-breakpoint

-- Purinán: balance seed = pricePaid de la sub 6116. Subquery falla
-- silenciosamente si la sub no existe (test/staging) → 0 rows insertadas.
INSERT INTO balances (member_id, target_kind, target_id, currency, amount)
SELECT 5860, 'subscription', 6116, currency, price_paid
FROM subscriptions WHERE id = 6116 AND @run = 1;
--> statement-breakpoint

COMMIT;
