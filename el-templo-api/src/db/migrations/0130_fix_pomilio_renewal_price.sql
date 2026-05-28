-- 0130: Corrige la renovacion mal tarifada de Francisco Pomilio (user 5856)
-- Sub 6830 (Flex+, scheduled, inicio 2026-05-27) se creo a 100 EUR por error
-- (precio correcto 75 EUR). El cobro original de 75 EUR (tx 401) fue anulado,
-- por lo que el balance quedo en 100 EUR de deuda. Esta migracion:
--   1. registra el pago de 75 EUR (debt_settlement, transferencia)
--   2. lo vincula a la renovacion (sub 6830)
--   3. salda la deuda (balance 442) a 0
--   4. corrige el precio registrado de la sub 6830 (100 -> 75)
-- Todos los statements estan guardados por ids/valores especificos de prod, asi
-- que son no-op en CI/staging/local (donde esos ids no existen) y el pipeline
-- queda verde. Tambien son idempotentes (reaplicar no duplica nada).
-- IMPORTANTE: el runner separa por punto y coma antes de strippear comentarios,
-- asi que no debe haber punto y coma en comentarios NI en strings.

-- 1. Registrar el pago de 75 EUR. Guardado en el balance todavia impago (=100).
INSERT INTO financial_transactions
  (member_id, kind, direction, amount, currency, payment_method, transaction_date, effective_date, branch_id, recorded_by, notes)
SELECT 5856, 'debt_settlement', 'inflow', 75, 'EUR', 'transfer', '2026-05-27', '2026-05-27', 14, 5721, 'Pago renovacion Flex+ (correccion de importe a 75 EUR)'
FROM DUAL
WHERE EXISTS (SELECT 1 FROM balances WHERE id = 442 AND member_id = 5856 AND amount = 100);

-- 2. Vincular el pago a la renovacion (usa el id insertado en el statement 1).
INSERT INTO transaction_links
  (transaction_id, target_kind, target_id, allocated_amount)
SELECT LAST_INSERT_ID(), 'subscription', 6830, 75
FROM DUAL
WHERE EXISTS (SELECT 1 FROM balances WHERE id = 442 AND member_id = 5856 AND amount = 100);

-- 3. Saldar la deuda: obligacion corregida a 75 y 75 pagados -> 0.
UPDATE balances SET amount = 0
WHERE id = 442 AND member_id = 5856 AND amount = 100;

-- 4. Corregir el precio registrado de la renovacion (100 -> 75).
UPDATE subscriptions SET price_paid = 75
WHERE id = 6830 AND user_id = 5856 AND price_paid = 100;
