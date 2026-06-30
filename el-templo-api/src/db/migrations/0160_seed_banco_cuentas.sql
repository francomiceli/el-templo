-- Phase 146-02 (CAJA-03) — seed de cuentas banco reales: Galicia + Mercado Pago (ARS).
-- Hasta ahora solo existia una caja banco ARS generica ('Banco ARS', 0154). Gestion
-- necesita imputar una transferencia a la cuenta banco concreta al validar, asi que
-- sembramos las dos cuentas reales (branch_id NULL, currency ARS, opening_balance 0).
--
-- cutoff_date es NOT NULL: copiamos el valor global existente via MIN(cutoff_date) de
-- cash_registers (todas las cajas comparten el mismo cutoff global por convencion del
-- seed 0154). Se materializa en un derived table con agregacion para evitar el error
-- 1093 de MySQL (referenciar la tabla destino en un subquery del propio INSERT).
--
-- Idempotente por nombre: el guard NOT EXISTS usa un derived table con LIMIT 1 (que
-- fuerza materializacion en MySQL 8 y evita 1093) — una segunda corrida no duplica.
--
-- NUNCA usar punto y coma dentro de comentarios SQL (el runner primero splittea por el
-- separador de statements y recien despues strippea los comentarios de linea).
--
-- Estas migraciones viajan a prod en el merge, asi que Galicia y Mercado Pago apareceran
-- tambien en prod (son cuentas reales, aceptable).

INSERT INTO `cash_registers`
  (`name`, `type`, `branch_id`, `currency`, `opening_balance`, `cutoff_date`, `is_active`)
SELECT 'Galicia', 'banco', NULL, 'ARS', 0, src.cutoff, true
FROM (SELECT MIN(`cutoff_date`) AS cutoff FROM `cash_registers`) AS src
WHERE NOT EXISTS (
  SELECT 1
    FROM (SELECT `id` FROM `cash_registers` WHERE `name` = 'Galicia' LIMIT 1) AS existing
);

INSERT INTO `cash_registers`
  (`name`, `type`, `branch_id`, `currency`, `opening_balance`, `cutoff_date`, `is_active`)
SELECT 'Mercado Pago', 'banco', NULL, 'ARS', 0, src.cutoff, true
FROM (SELECT MIN(`cutoff_date`) AS cutoff FROM `cash_registers`) AS src
WHERE NOT EXISTS (
  SELECT 1
    FROM (SELECT `id` FROM `cash_registers` WHERE `name` = 'Mercado Pago' LIMIT 1) AS existing
);
