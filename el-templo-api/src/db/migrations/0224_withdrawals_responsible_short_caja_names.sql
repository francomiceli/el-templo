-- 0224_withdrawals_responsible_short_caja_names.sql
-- Feedback caja/cobros 2026-09-07 (Martin). Hand-written (db:generate roto).
--
-- 1) financial_transactions.responsible_name: responsable de un retiro de
--    caja (quien se llevo la plata). Texto libre, NULL para todo lo que no
--    sea un retiro. POST /withdrawals lo exige, el resto de los create paths
--    lo deja NULL. Column name byte-for-byte con el schema drizzle.
--
-- 2) Nombres cortos de caja: cash_registers.name fue una foto del nombre de
--    la sede al sembrar (0154, "Efectivo El Templo Alem"). Los renombres de
--    sedes 0208 y 0221 nunca tocaron las cajas, asi que prod muestra
--    "Efectivo El Templo Mogotes" para Mario Bravo. Pedido: la caja efectivo
--    de una sede se llama como la sede ("Alem"). Efectivo Central y las
--    cuentas banco no cambian. Match por branch_id (no por name). Idempotente.
--    Regla a futuro: una migracion que renombre una sede debe renombrar
--    tambien su caja efectivo.

ALTER TABLE financial_transactions ADD COLUMN responsible_name VARCHAR(120) NULL;
--> statement-breakpoint
UPDATE cash_registers cr
JOIN branches b ON b.id = cr.branch_id
SET cr.name = b.name
WHERE cr.type = 'efectivo' AND cr.branch_id IS NOT NULL AND cr.name <> b.name;
