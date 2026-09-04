-- 0221_rename_sur_mario_bravo.sql
-- Pedido a Franco (2026-09-04): la sede "Sur" (code MOGOTES, Mario Bravo 618)
-- pasa a llamarse "Mario Bravo". Mismo patron que 0208 (Mogotes -> Sur):
-- branches.name es puramente de display, ninguna logica decide por el nombre
-- (todo va por id/code/country), asi que aplica en vivo en admin, metricas,
-- TV, exports y app (el shim app-branch-name antepone "El Templo" al nombre
-- que venga de la DB, no mapea por nombre).
--
-- Match por code, no por name. Sin tenant_id en el WHERE: MOGOTES es un code
-- unico de El Templo. Cambio de dato de prod via migracion, nunca via seed.
-- Idempotente.

UPDATE branches SET name = 'Mario Bravo' WHERE code = 'MOGOTES';
