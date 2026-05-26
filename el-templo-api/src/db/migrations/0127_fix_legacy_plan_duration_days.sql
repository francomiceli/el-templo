-- Corrige duration_days en 3 planes legacy archivados cuyo valor fue hardcodeado
-- a 30 al importar los miembros del sistema viejo (src/db/import-members.ts:741).
--
-- Los nombres declaran duraciones multi-mes pero la columna decía 30 dias, lo
-- que ensucia cualquier análisis que agrupe por duration_days (aparecían en el
-- bucket "mensual" junto a Flex/Flex+).
--
-- Mapeo (todos AR, is_active=0 / is_archived=1):
--   7  PROGRAMA 3 MESES : 30 → 90
--   13 PROGRAMA 6 MESES : 30 → 180
--   80 MEMBRESÍA ANUAL  : 30 → 365
--
-- Seguridad: NO toca ninguna suscripción existente. duration_days solo se lee
-- al crear/renovar/cambiar una sub para computar end_date y classes_budget
-- (subscriptions/service.ts). Las subs vigentes ya tienen su end_date guardado
-- por-fila, no se recalcula (no hay cron, y recomputeUserStatus usa end_date).
-- Como los planes están archivados tampoco se generan subs nuevas. Único efecto
-- posible: una hipotética renovación tomaría la duración real en vez de 30 dias.
--
-- NO toca: FLEX TURNOS MAÑANA (96) ni FLEX + TURNOS MAÑANA (99) — son variantes
-- mensuales reales, su duration_days=30 es correcto.
--
-- Idempotente: cada UPDATE incluye el valor de origen (30) en el WHERE.

UPDATE subscription_plans SET duration_days = 90
  WHERE id = 7 AND duration_days = 30;

UPDATE subscription_plans SET duration_days = 180
  WHERE id = 13 AND duration_days = 30;

UPDATE subscription_plans SET duration_days = 365
  WHERE id = 80 AND duration_days = 30;
