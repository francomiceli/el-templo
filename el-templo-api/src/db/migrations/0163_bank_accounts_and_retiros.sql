-- Phase 150-01 (CTA-01/CTA-03) — columnas bancarias flexibles en cash_registers
-- + seed idempotente del centro de costo 'Retiros' (retiro del dueño como egreso).
-- Escrita A MANO (db:generate choca con el drift interactivo pre-existente de
-- sessions.goal_plan_type, igual que 0154/0158/0161, y meta/_journal.json esta
-- desactualizado). Siguiente numero secuencial en esta rama es 0163 (ultima
-- aplicada 0162). NUNCA drizzle-kit push/migrate -- la tabla _migrations es la
-- fuente de verdad.
--
-- Un comentario SQL NUNCA debe contener el separador de statements: el runner
-- primero splittea los statements crudos y recien despues strippea los
-- comentarios de linea.
--
-- Los nombres de columna coinciden byte-for-byte con el schema Drizzle
-- (cash-registers.ts, Task 1). Todas NULLABLE: solo aplican a cajas tipo 'banco'
-- y el ABM impone en el service que 3 son obligatorias (D-03) mientras las cajas
-- efectivo las dejan NULL. `name` (NOT NULL) NO cambia.

-- 1. Columnas bancarias (todas nullable, encadenadas AFTER currency)
ALTER TABLE `cash_registers`
  ADD COLUMN `bank_name` varchar(100) NULL AFTER `currency`,
  ADD COLUMN `account_holder` varchar(120) NULL AFTER `bank_name`,
  ADD COLUMN `tax_id` varchar(20) NULL AFTER `account_holder`,
  ADD COLUMN `cbu_cvu` varchar(34) NULL AFTER `tax_id`,
  ADD COLUMN `account_alias` varchar(60) NULL AFTER `cbu_cvu`,
  ADD COLUMN `account_number` varchar(50) NULL AFTER `account_alias`;

-- 2. Seed idempotente del centro de costo 'Retiros' (AR, D-09). INSERT ... SELECT
-- ... FROM DUAL WHERE NOT EXISTS keyed en (name, country) para que una re-corrida
-- nunca duplique. Seleccionar FROM DUAL (no desde cost_centers) evita el error 1093
-- (leer y escribir la misma tabla en un INSERT...SELECT).
INSERT INTO `cost_centers` (`name`, `country`, `is_active`)
SELECT 'Retiros', 'AR', true FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `cost_centers` cc
  WHERE cc.`name` = 'Retiros' AND cc.`country` = 'AR'
);
