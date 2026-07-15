-- Data fix pase "Actividades con Aura" (fase 161): 4 cobros sueltos del pase se
-- cargaron a mano en prod (tx 1138 Lucas Molas, 1139 Camila Marcos, 1140 Ezequiel
-- Germinario -- $10.000 transfer 2026-07-15, nota 'clases Aura' -- y tx 1130 Maria
-- Paula Rodriguez, $20.000 transfer 2026-07-14, nota 'clase suelta', confirmado por
-- Franco como pase Externo) y quedaron validados ANTES del deploy del pase.
-- El flujo de imputacion del AssignPlanDialog
-- (COBRO-03, fase 146) solo acepta anticipos con validation_status='pendiente',
-- asi que se los devuelve a pendiente para poder imputarlos al alta del plan especial.
-- Hand-written (db:generate roto por drift de goal_plan_type).
-- Guardas: tupla completa ademas del id -- en eltemplo_staging y en las DBs de test
-- la tupla no matchea (o matchea las mismas filas clonadas, donde el flip es inocuo)
-- y el UPDATE es no-op. Idempotente: re-run sobre filas ya pendientes no cambia nada.
-- Regla dura (skill el-templo-db-migrations): sin punto-y-coma en comentarios.

UPDATE financial_transactions
SET validation_status = 'pendiente',
    validated_by = NULL,
    validated_at = NULL
WHERE id IN (1138, 1139, 1140)
  AND kind = 'advance_payment'
  AND amount = 10000
  AND currency = 'ARS'
  AND notes = 'clases Aura'
  AND transaction_date = '2026-07-15'
  AND voided_at IS NULL;

UPDATE financial_transactions
SET validation_status = 'pendiente',
    validated_by = NULL,
    validated_at = NULL
WHERE id = 1130
  AND kind = 'advance_payment'
  AND amount = 20000
  AND currency = 'ARS'
  AND notes = 'clase suelta'
  AND transaction_date = '2026-07-14'
  AND voided_at IS NULL;
