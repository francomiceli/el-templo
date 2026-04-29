-- ONE-SHOT BACKFILL — v4.8 historical payments (2026-04-29)
--
-- Reinjects 21 real historical payments from the dropped `payments` table
-- (Chapa + BCN, abril 2026) into financial_transactions + transaction_links,
-- plus 1 balance row for Purinán (sub 6116, pre-existing ADEUDA, balance =
-- subscriptions.price_paid).
--
-- Source: backup eltemplo_20260428_060001.sql.gz, post-cleanup of test data,
-- auto-charges, sub recreations, and duplicate users (60 raw → 22 real, of
-- which 21 are full payments and 1 is the open debt).
--
-- Atomicity: wrapped in START TRANSACTION ... COMMIT. mysql2 respects this
-- at the connection level — if any statement fails, the connection is
-- closed and MySQL auto-rollbacks. The migration is NOT marked applied
-- in _migrations, so a re-deploy retries from a clean slate.
--
-- Idempotency: by construction. _migrations.name UNIQUE prevents re-run.

START TRANSACTION;
--> statement-breakpoint

-- pay 31: BCN, EUR 75 transfer, 2026-04-23
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
VALUES (5821, 'plan_charge', 'inflow', 75, 'EUR', 'transfer', '2026-04-23', '2026-04-23', 14, 5721, NULL);
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
VALUES (LAST_INSERT_ID(), 'subscription', 6086, 75);
--> statement-breakpoint

-- pay 32: BCN, EUR 75 transfer, 2026-04-23 (preventa nota)
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
VALUES (5822, 'plan_charge', 'inflow', 75, 'EUR', 'transfer', '2026-04-23', '2026-04-23', 14, 5721, 'Había pagado preventa en febrero. Se le activa hoy que fue su primera clase.');
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
VALUES (LAST_INSERT_ID(), 'subscription', 6087, 75);
--> statement-breakpoint

-- pay 34: Chapa, ARS 65000 cash, 2026-04-23
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
VALUES (5825, 'plan_charge', 'inflow', 65000, 'ARS', 'cash', '2026-04-23', '2026-04-23', 15, 5707, NULL);
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
VALUES (LAST_INSERT_ID(), 'subscription', 6089, 65000);
--> statement-breakpoint

-- pay 35: BCN, EUR 75 transfer, 2026-05-04
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
VALUES (5826, 'plan_charge', 'inflow', 75, 'EUR', 'transfer', '2026-05-04', '2026-05-04', 14, 5721, NULL);
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
VALUES (LAST_INSERT_ID(), 'subscription', 6090, 75);
--> statement-breakpoint

-- pay 36: Chapa, ARS 65000 transfer, 2026-04-23
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
VALUES (5827, 'plan_charge', 'inflow', 65000, 'ARS', 'transfer', '2026-04-23', '2026-04-23', 15, 5707, NULL);
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
VALUES (LAST_INSERT_ID(), 'subscription', 6091, 65000);
--> statement-breakpoint

-- pay 39: Chapa, ARS 65000 transfer, 2026-04-20
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
VALUES (5832, 'plan_charge', 'inflow', 65000, 'ARS', 'transfer', '2026-04-20', '2026-04-20', 15, 5707, NULL);
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
VALUES (LAST_INSERT_ID(), 'subscription', 6094, 65000);
--> statement-breakpoint

-- pay 40: Chapa, ARS 65000 transfer, 2026-04-20
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
VALUES (5831, 'plan_charge', 'inflow', 65000, 'ARS', 'transfer', '2026-04-20', '2026-04-20', 15, 5707, NULL);
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
VALUES (LAST_INSERT_ID(), 'subscription', 6095, 65000);
--> statement-breakpoint

-- pay 41: Chapa, ARS 65000 transfer, 2026-04-22
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
VALUES (5803, 'plan_charge', 'inflow', 65000, 'ARS', 'transfer', '2026-04-22', '2026-04-22', 15, 5707, NULL);
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
VALUES (LAST_INSERT_ID(), 'subscription', 6096, 65000);
--> statement-breakpoint

-- pay 43: Chapa, ARS 65000 transfer, 2026-04-27
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
VALUES (5833, 'plan_charge', 'inflow', 65000, 'ARS', 'transfer', '2026-04-27', '2026-04-27', 15, 5707, NULL);
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
VALUES (LAST_INSERT_ID(), 'subscription', 6098, 65000);
--> statement-breakpoint

-- pay 44: Chapa, ARS 65000 cash, 2026-04-27
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
VALUES (5834, 'plan_charge', 'inflow', 65000, 'ARS', 'cash', '2026-04-27', '2026-04-27', 15, 5707, NULL);
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
VALUES (LAST_INSERT_ID(), 'subscription', 6099, 65000);
--> statement-breakpoint

-- pay 45: Chapa, ARS 65000 cash, 2026-04-27
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
VALUES (5835, 'plan_charge', 'inflow', 65000, 'ARS', 'cash', '2026-04-27', '2026-04-27', 15, 5707, NULL);
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
VALUES (LAST_INSERT_ID(), 'subscription', 6100, 65000);
--> statement-breakpoint

-- pay 47: Chapa, ARS 65000 transfer, 2026-04-28
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
VALUES (5836, 'plan_charge', 'inflow', 65000, 'ARS', 'transfer', '2026-04-28', '2026-04-28', 15, 5707, NULL);
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
VALUES (LAST_INSERT_ID(), 'subscription', 6102, 65000);
--> statement-breakpoint

-- pay 48: Chapa, ARS 65000 cash, 2026-04-28
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
VALUES (5839, 'plan_charge', 'inflow', 65000, 'ARS', 'cash', '2026-04-28', '2026-04-28', 15, 5707, NULL);
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
VALUES (LAST_INSERT_ID(), 'subscription', 6103, 65000);
--> statement-breakpoint

-- pay 49: BCN, EUR 75 transfer, 2026-04-24
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
VALUES (5841, 'plan_charge', 'inflow', 75, 'EUR', 'transfer', '2026-04-24', '2026-04-24', 14, 5721, NULL);
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
VALUES (LAST_INSERT_ID(), 'subscription', 6104, 75);
--> statement-breakpoint

-- pay 50: Chapa, ARS 80000 cash, 2026-04-22
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
VALUES (5842, 'plan_charge', 'inflow', 80000, 'ARS', 'cash', '2026-04-22', '2026-04-22', 15, 5707, NULL);
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
VALUES (LAST_INSERT_ID(), 'subscription', 6105, 80000);
--> statement-breakpoint

-- pay 51: Chapa, ARS 65000 transfer, 2026-04-21
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
VALUES (5843, 'plan_charge', 'inflow', 65000, 'ARS', 'transfer', '2026-04-21', '2026-04-21', 15, 5707, NULL);
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
VALUES (LAST_INSERT_ID(), 'subscription', 6106, 65000);
--> statement-breakpoint

-- pay 52: BCN, EUR 75 card, 2026-04-27
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
VALUES (5851, 'plan_charge', 'inflow', 75, 'EUR', 'card', '2026-04-27', '2026-04-27', 14, 5721, NULL);
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
VALUES (LAST_INSERT_ID(), 'subscription', 6108, 75);
--> statement-breakpoint

-- pay 53: Chapa, ARS 80000 transfer, 2026-04-27
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
VALUES (5844, 'plan_charge', 'inflow', 80000, 'ARS', 'transfer', '2026-04-27', '2026-04-27', 15, 5707, NULL);
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
VALUES (LAST_INSERT_ID(), 'subscription', 6109, 80000);
--> statement-breakpoint

-- pay 54: Chapa, ARS 65000 cash, 2026-04-28
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
VALUES (5852, 'plan_charge', 'inflow', 65000, 'ARS', 'cash', '2026-04-28', '2026-04-28', 15, 5707, NULL);
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
VALUES (LAST_INSERT_ID(), 'subscription', 6110, 65000);
--> statement-breakpoint

-- pay 55: BCN, EUR 75 cash, 2026-04-27
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
VALUES (5855, 'plan_charge', 'inflow', 75, 'EUR', 'cash', '2026-04-27', '2026-04-27', 14, 5721, NULL);
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
VALUES (LAST_INSERT_ID(), 'subscription', 6111, 75);
--> statement-breakpoint

-- pay 56: BCN, EUR 75 cash, 2026-04-27
INSERT INTO financial_transactions (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
VALUES (5856, 'plan_charge', 'inflow', 75, 'EUR', 'cash', '2026-04-27', '2026-04-27', 14, 5721, NULL);
--> statement-breakpoint
INSERT INTO transaction_links (transaction_id, target_kind, target_id, allocated_amount)
VALUES (LAST_INSERT_ID(), 'subscription', 6112, 75);
--> statement-breakpoint

-- Purinán: balance seed = pricePaid de la sub 6116. Subquery garantiza que
-- si la sub no existe (FK falla) la migration aborta y rollbackea.
INSERT INTO balances (member_id, target_kind, target_id, currency, amount)
SELECT 5860, 'subscription', 6116, currency, price_paid
FROM subscriptions WHERE id = 6116;
--> statement-breakpoint

COMMIT;
