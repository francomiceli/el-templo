-- Fix de dato 2026-11-10: cobro suelto cargado en la sede equivocada.
--
-- Sabado 07/11 Patricio Duran, con la jornada abierta en Moreno, cobro en
-- efectivo $10.000 (concepto "Vertis", tx 3278) a una alumna de Alberti. La
-- "Sede del cobro" de la PoS arranca en la sede del socio, asi que el cargo
-- quedo con branch Alberti y en la caja efectivo de Alberti, mientras el
-- billete quedo fisicamente en Moreno. Dos minutos despues el arqueo de Moreno
-- (cash_counts 165) dio +$10.000 de sobrante sin explicacion, y la caja de
-- Alberti espera $10.000 que no tiene.
--
-- Se mueve el cargo a la sede y caja efectivo de Moreno. El esperado de un
-- arqueo es acumulado (fondo + saldo firme + pendientes), asi que con esto
-- Moreno pasa a esperar lo que realmente hay y Alberti deja de esperar los
-- $10.000. Los arqueos ya registrados no se tocan (son historia).
--
-- Guardas: los ids difieren entre entornos (staging es un clon), por eso el
-- WHERE exige el estado ANTERIOR completo (id, monto, concepto, fecha, metodo,
-- sede y caja Alberti por code, no anulado). En staging la fila no existe y
-- todo es no-op. El audit_log se escribe ANTES del UPDATE con las mismas
-- guardas, asi solo queda registro si el cargo efectivamente se mueve.
--
-- Reversible: mismo UPDATE con Alberti y Moreno invertidos.

INSERT INTO audit_log (actor_id, action, target_kind, target_id, payload_json, reason, tenant_id, created_at)
SELECT
  ft.recorded_by,
  'transaction_branch_moved',
  'transaction',
  ft.id,
  JSON_OBJECT(
    'fromBranchId', ft.branch_id,
    'fromCashRegisterId', ft.cash_register_id,
    'toBranchId', bm.id,
    'toCashRegisterId', crm.id
  ),
  'Cobro suelto cargado en Alberti con la plata en Moreno (jornada de Pato 07/11). Mig 0324.',
  ft.tenant_id,
  NOW()
FROM financial_transactions ft
JOIN branches ba ON ba.id = ft.branch_id AND ba.code = 'ALBERTI' AND ba.tenant_id = 1
JOIN cash_registers cra ON cra.id = ft.cash_register_id AND cra.branch_id = ba.id AND cra.type = 'efectivo' AND cra.tenant_id = 1
JOIN branches bm ON bm.code = 'MORENO' AND bm.tenant_id = 1
JOIN cash_registers crm ON crm.branch_id = bm.id AND crm.type = 'efectivo' AND crm.tenant_id = 1 AND crm.is_active = 1 AND crm.currency = 'ARS'
WHERE ft.id = 3278
  AND ft.tenant_id = 1
  AND ft.kind = 'advance_payment'
  AND ft.amount = 10000
  AND ft.payment_method = 'cash'
  AND ft.transaction_date = '2026-11-07'
  AND ft.notes = 'Vertis'
  AND ft.voided_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM audit_log al
    WHERE al.action = 'transaction_branch_moved' AND al.target_id = 3278 AND al.tenant_id = 1
  );

UPDATE financial_transactions ft
JOIN branches ba ON ba.id = ft.branch_id AND ba.code = 'ALBERTI' AND ba.tenant_id = 1
JOIN cash_registers cra ON cra.id = ft.cash_register_id AND cra.branch_id = ba.id AND cra.type = 'efectivo' AND cra.tenant_id = 1
JOIN branches bm ON bm.code = 'MORENO' AND bm.tenant_id = 1
JOIN cash_registers crm ON crm.branch_id = bm.id AND crm.type = 'efectivo' AND crm.tenant_id = 1 AND crm.is_active = 1 AND crm.currency = 'ARS'
SET ft.branch_id = bm.id,
    ft.cash_register_id = crm.id
WHERE ft.id = 3278
  AND ft.tenant_id = 1
  AND ft.kind = 'advance_payment'
  AND ft.amount = 10000
  AND ft.payment_method = 'cash'
  AND ft.transaction_date = '2026-11-07'
  AND ft.notes = 'Vertis'
  AND ft.voided_at IS NULL;
