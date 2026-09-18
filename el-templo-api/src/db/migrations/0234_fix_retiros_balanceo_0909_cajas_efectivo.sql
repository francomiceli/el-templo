-- Correccion de los 5 retiros "Balanceo a cero" del 09/09/2026 (cajas de
-- efectivo Moreno, Alem, Constitucion, Jujuy y Mario Bravo).
--
-- Que paso: el 09/09 se registro un retiro por caja para dejarla en cero,
-- eligiendo TODOS los cobros en efectivo pendientes de retiro. El listado
-- ofrecia cobros desde abril, pero el saldo firme de la caja (D-08) solo
-- cuenta cobros desde su cutoff_date (30/06). Los cobros anteriores al corte
-- ya estaban excluidos del saldo, asi que se restaron de mas y las 5 cajas
-- quedaron en negativo (Constitucion -8.975.000). El fix de codigo que
-- acompana esta migracion pone el piso del corte en el listado y en el alta
-- del retiro. Aca se corrige el dato:
--
--   1. Se ANULAN los 5 retiros (void, no delete), con guardas estrictas de
--      id + caja + monto + fecha + kind para que en cualquier otra base
--      (staging, test, local) no matcheen y todo el archivo sea no-op.
--   2. Por cada retiro anulado se inserta UN retiro nuevo con fecha 09/09,
--      mismo centro de costo, responsable y cargador, cuyo monto es la suma
--      de los cobros en efectivo firmes de esa caja entre el corte y el
--      09/09 que no tengan retiro activo. Es exactamente lo que se quiso
--      hacer: caja en cero al 09/09. idempotency_key unico por caja.
--   3. Se vinculan esos cobros al retiro nuevo (transaction_links), igual que
--      lo hace registerWithdrawal, asi salen del listado de pendientes.
--
-- Idempotente: el UPDATE exige voided_at IS NULL, el INSERT del retiro exige
-- que no exista su idempotency_key y el INSERT de links es INSERT IGNORE
-- sobre la unique (transaction_id, target_kind, target_id) y excluye cobros
-- con otro retiro activo. Encadenado: los pasos 2 y 3 solo actuan sobre
-- retiros anulados por esta misma migracion (void_reason con el marcador).
--
-- Sin punto-y-coma dentro de comentarios (regla dura del skill
-- el-templo-db-migrations).

UPDATE financial_transactions
  SET voided_at = NOW(),
      voided_by = recorded_by,
      void_reason = 'Migracion 0234: retiro Balanceo a cero del 09/09 anulado, incluia cobros anteriores al corte de la caja (30/06) que el saldo ya excluia. Reemplazado por un retiro por lo cobrado desde el corte.'
  WHERE kind = 'expense'
    AND direction = 'outflow'
    AND transaction_date = '2026-09-09'
    AND voided_at IS NULL
    AND (id, cash_register_id, amount) IN (
      (2097, 1, 8475000),
      (2102, 2, 8155000),
      (2103, 3, 16198000),
      (2104, 4, 6370000),
      (2105, 5, 8050000)
    );
--> statement-breakpoint
INSERT INTO financial_transactions
  (member_id, kind, direction, amount, currency, payment_method,
   transaction_date, effective_date, branch_id, cash_register_id, cost_center_id,
   recorded_by, validation_status, validated_by, validated_at,
   notes, idempotency_key, responsible_name, tenant_id)
SELECT NULL, 'expense', 'outflow', SUM(t.amount), w.currency, 'internal',
   '2026-09-09', '2026-09-09', w.branch_id, w.cash_register_id, w.cost_center_id,
   w.recorded_by, 'validado', w.recorded_by, NOW(),
   CONCAT('Balanceo a cero al 09/09: cobros en efectivo desde el corte de la caja. Reemplaza al retiro #', w.id, ' (anulado por la migracion 0234).'),
   CONCAT('fix-0234-balanceo-0909-caja-', w.cash_register_id), w.responsible_name, w.tenant_id
FROM financial_transactions w
JOIN cash_registers cr ON cr.id = w.cash_register_id
JOIN financial_transactions t
  ON t.cash_register_id = w.cash_register_id
 AND t.tenant_id = w.tenant_id
 AND t.direction = 'inflow'
 AND t.payment_method = 'cash'
 AND t.kind IN ('plan_charge', 'debt_settlement', 'advance_payment')
 AND t.voided_at IS NULL
 AND t.validation_status = 'validado'
 AND t.transaction_date >= cr.cutoff_date
 AND t.transaction_date <= '2026-09-09'
 AND NOT EXISTS (
   SELECT 1 FROM transaction_links tl
   JOIN financial_transactions w2 ON w2.id = tl.transaction_id
   WHERE tl.target_kind = 'transaction'
     AND tl.target_id = t.id
     AND w2.kind = 'expense'
     AND w2.responsible_name IS NOT NULL
     AND w2.voided_at IS NULL
 )
WHERE w.id IN (2097, 2102, 2103, 2104, 2105)
  AND w.void_reason LIKE 'Migracion 0234:%'
  AND NOT EXISTS (
    SELECT 1 FROM financial_transactions x
    WHERE x.idempotency_key = CONCAT('fix-0234-balanceo-0909-caja-', w.cash_register_id)
  )
GROUP BY w.id, w.currency, w.branch_id, w.cash_register_id, w.cost_center_id,
         w.recorded_by, w.responsible_name, w.tenant_id
HAVING SUM(t.amount) > 0;
--> statement-breakpoint
INSERT IGNORE INTO transaction_links
  (transaction_id, target_kind, target_id, allocated_amount, tenant_id)
SELECT n.id, 'transaction', t.id, t.amount, n.tenant_id
FROM financial_transactions n
JOIN cash_registers cr ON cr.id = n.cash_register_id
JOIN financial_transactions t
  ON t.cash_register_id = n.cash_register_id
 AND t.tenant_id = n.tenant_id
 AND t.direction = 'inflow'
 AND t.payment_method = 'cash'
 AND t.kind IN ('plan_charge', 'debt_settlement', 'advance_payment')
 AND t.voided_at IS NULL
 AND t.validation_status = 'validado'
 AND t.transaction_date >= cr.cutoff_date
 AND t.transaction_date <= '2026-09-09'
 AND NOT EXISTS (
   SELECT 1 FROM transaction_links tl
   JOIN financial_transactions w2 ON w2.id = tl.transaction_id
   WHERE tl.target_kind = 'transaction'
     AND tl.target_id = t.id
     AND w2.id <> n.id
     AND w2.kind = 'expense'
     AND w2.responsible_name IS NOT NULL
     AND w2.voided_at IS NULL
 )
WHERE n.idempotency_key LIKE 'fix-0234-balanceo-0909-caja-%'
  AND n.voided_at IS NULL;
