-- Phase 155-01 (HOR-03 / D-05) -- cupo por actividad
-- Hand-written (db:generate roto por drift pre-existente, igual que 0154/0158/0161/0162
-- y meta/_journal.json esta stale). Proximo numero secuencial es 0167 (ultima 0166).
-- NEVER drizzle-kit push/migrate -- la tabla _migrations es la fuente de verdad.
--
-- Un comentario SQL nunca debe contener un separador de sentencias -- el runner splitea
-- las sentencias crudas primero y recien despues strippea los comentarios de linea.
--
-- max_capacity NULL = la actividad hereda branch.max_capacity (cupo efectivo por slot =
-- activity.maxCapacity ?? branch.maxCapacity ?? 22). Nullable y sin default -- sin backfill,
-- cero cambio de comportamiento para las actividades existentes.

ALTER TABLE `activities`
  ADD COLUMN `max_capacity` int NULL AFTER `is_active`;
