-- Hotfix 2026-11-03: baja de la caja efectivo de Chapadmalal.
--
-- La sede Chapadmalal salio de la operacion diaria en la 0187 (branches y
-- schedules con is_active = 0), pero su caja efectivo (sembrada por la 0154
-- cuando la sede todavia estaba activa) quedo viva y sigue apareciendo en
-- Saldos por caja, arqueos y selectores de caja.
--
-- Baja LOGICA (is_active = 0), no DELETE: financial_transactions.cash_register_id
-- referencia la caja, y los movimientos historicos tienen que seguir pudiendo
-- resolver a que caja pertenecen. Es el mismo criterio que usan las bajas de
-- cuentas banco y centros de costo (D-08). Todas las lecturas operativas
-- (listActiveCajasWithBalance, arqueo, resolveCashRegister) filtran is_active.
--
-- Se filtra por code de sede y tenant, no por id, porque los ids difieren
-- entre entornos (ver 0086/0087).
--
-- Reversible: volver is_active a 1 con el mismo WHERE.

UPDATE cash_registers cr
JOIN branches b ON b.id = cr.branch_id
SET cr.is_active = 0
WHERE b.code = 'CHAPADMALAL'
  AND b.tenant_id = 1
  AND cr.tenant_id = 1
  AND cr.type = 'efectivo';
