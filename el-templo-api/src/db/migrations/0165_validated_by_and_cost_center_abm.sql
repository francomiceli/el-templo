-- Phase 152-01 (CAJA-04/CAJA-05) — validated_by/validated_at en financial_transactions
-- (D-05, read path denormalizado del validador) + índice único (name, country) sobre
-- cost_centers (D-08) + renames de seeds Templo-céntricos a genéricos y seed
-- 'Pago a proveedores' (D-09).
-- Escrita A MANO (db:generate choca con el drift interactivo pre-existente de
-- sessions.goal_plan_type, igual que 0154/0158/0161/0163, y meta/_journal.json esta
-- desactualizado). Siguiente numero secuencial en esta rama es 0165 (ultima aplicada
-- 0164). NUNCA drizzle-kit push/migrate -- la tabla _migrations es la fuente de verdad.
--
-- Un comentario SQL NUNCA debe contener el separador de statements: el runner primero
-- splittea los statements crudos y recien despues strippea los comentarios de linea.
--
-- Los nombres de columna/indice coinciden byte-for-byte con los schemas Drizzle
-- (financial-transactions.ts / cost-centers.ts, Task 1). validated_by/validated_at son
-- NULLABLE (mismo patron que voided_by/voided_at): solo la transicion pendiente-validado
-- las setea, los cobros nacidos validados y todo historico no-backfilleado quedan NULL.
--
-- Orden estricto y load-bearing:
--   1. ALTER ADD columnas validated_by/validated_at + FK
--   2. Backfill desde audit_log (action transaction_validated, 1 evento por tx = JOIN plano seguro)
--   3. Renames de seeds AR (UPDATE por name+country, NO delete -- ninguna categoria en uso se pierde)
--   4. Seed 'Pago a proveedores' idempotente + ADD UNIQUE INDEX (DESPUES de los renames para no colisionar)

-- 1. Columnas validated_by / validated_at (nullable), encadenadas AFTER validation_status
ALTER TABLE `financial_transactions`
  ADD COLUMN `validated_by` int NULL AFTER `validation_status`,
  ADD COLUMN `validated_at` timestamp NULL AFTER `validated_by`;

ALTER TABLE `financial_transactions`
  ADD CONSTRAINT `financial_transactions_validated_by_users_id_fk`
  FOREIGN KEY (`validated_by`) REFERENCES `users`(`id`);

-- 2. Backfill de validaciones historicas desde audit_log (D-05). validate() escribe
-- exactamente un evento transaction_validated por tx, asi que el JOIN plano no multiplica.
UPDATE `financial_transactions` ft
JOIN `audit_log` al
  ON al.`target_kind` = 'transaction'
  AND al.`target_id` = ft.`id`
  AND al.`action` = 'transaction_validated'
SET ft.`validated_by` = al.`actor_id`, ft.`validated_at` = al.`created_at`
WHERE ft.`validated_by` IS NULL;

-- 3. Renames de seeds Templo-centricos a genericos (D-09). UPDATE por (name, country)
-- exacto, NO delete: ninguna categoria en uso se pierde.
UPDATE `cost_centers` SET `name` = 'Alquiler'
  WHERE `name` = 'Alquiler Constitución' AND `country` = 'AR';

UPDATE `cost_centers` SET `name` = 'Viáticos'
  WHERE `name` = 'Viáticos profes' AND `country` = 'AR';

-- 4. Seed idempotente 'Pago a proveedores' (AR, D-09). INSERT ... SELECT ... FROM DUAL
-- WHERE NOT EXISTS keyed en (name, country) para que una re-corrida nunca duplique.
-- Seleccionar FROM DUAL (no desde cost_centers) evita el error 1093.
INSERT INTO `cost_centers` (`name`, `country`, `is_active`)
SELECT 'Pago a proveedores', 'AR', true FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `cost_centers` cc
  WHERE cc.`name` = 'Pago a proveedores' AND cc.`country` = 'AR'
);

-- Indice unico (name, country) para el ABM (D-08). Corre DESPUES de los renames del
-- bloque 3 para que los seeds ya sean distintos por (name, country) y no colisione.
ALTER TABLE `cost_centers`
  ADD UNIQUE INDEX `uq_cost_centers_name_country` (`name`, `country`);
