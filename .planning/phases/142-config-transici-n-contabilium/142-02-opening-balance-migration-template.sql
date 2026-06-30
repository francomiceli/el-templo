-- opening-balance-migration-template.sql
-- ============================================================================
-- TEMPLATE (MIG-02 / Fase 142 / D-09). NO ES UNA MIGRACION TRACKEADA.
-- Este archivo vive en .docs/modulo-contable/ y NUNCA debe estar bajo
-- src/db/migrations/ -- si estuviera ahi, el runner lo ejecutaria en el proximo
-- deploy con los valores placeholder (<CONTEO> / <YYYY-MM-DD>) y pisaria los
-- saldos (hoy en 0) o sembraria una fecha de corte incorrecta.
-- ============================================================================
--
-- AL GO-LIVE (instrucciones para el operador):
--   1. Copiar este archivo a src/db/migrations/NNNN_load_opening_balances.sql
--      (NNNN = el siguiente numero libre de migracion).
--   2. Reemplazar cada <CONTEO> por el conteo fisico real de esa caja (entero).
--   3. Reemplazar cada <YYYY-MM-DD> por la fecha de corte (go-live) de esa caja.
--   4. Reemplazar cada <ID> por el id real de la caja (ver tabla cash_registers).
--   5. Borrar las cajas que no apliquen y agregar las que falten (una UPDATE c/u).
--   6. Correr con: pnpm db:migrate  (NUNCA drizzle-kit migrate).
--   7. Commitear el SQL completado junto al cambio.
--
-- REGLAS DE MIGRACION (CLAUDE.md + memoria del proyecto):
--   - NUNCA un punto y coma dentro de una linea de comentario '--' -- el runner
--     splittea por punto y coma ANTES de strippear los comentarios, asi que un
--     punto y coma dentro de un comentario rompe la migracion.
--   - Los valores son ENTEROS (convencion de la app -- ver opening_balance int).
--   - cutoff_date es PER-CAJA (Fase 138) -- puede diferir entre cajas si Franco
--     hace un corte escalonado en vez de un corte limpio unico.
--   - Esto SOLO carga el conteo fisico de apertura. NO hay backfill historico: las
--     transacciones previas a cutoff_date quedan excluidas del saldo firme (138).
--
-- Cajas tipicas (ajustar a la realidad de cash_registers al go-live):
--   efectivo + branch_id = X     -> caja de efectivo de la sucursal X
--   efectivo + branch_id = NULL  -> caja de efectivo central
--   banco    + branch_id = NULL  -> caja banco POR MONEDA (una ARS, una EUR)
-- ============================================================================

-- Caja efectivo sucursal <NOMBRE> (id <ID>):
UPDATE `cash_registers` SET `opening_balance` = <CONTEO>, `cutoff_date` = '<YYYY-MM-DD>' WHERE `id` = <ID>;

-- Caja efectivo central (id <ID>):
UPDATE `cash_registers` SET `opening_balance` = <CONTEO>, `cutoff_date` = '<YYYY-MM-DD>' WHERE `id` = <ID>;

-- Caja banco ARS (id <ID>):
UPDATE `cash_registers` SET `opening_balance` = <CONTEO>, `cutoff_date` = '<YYYY-MM-DD>' WHERE `id` = <ID>;

-- Caja banco EUR (id <ID>):
UPDATE `cash_registers` SET `opening_balance` = <CONTEO>, `cutoff_date` = '<YYYY-MM-DD>' WHERE `id` = <ID>;
