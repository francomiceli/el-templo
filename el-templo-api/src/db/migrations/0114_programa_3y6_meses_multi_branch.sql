-- PROGRAMA 3 MESES y PROGRAMA 6 MESES pasan a multi-sucursal.
--
-- Background. May 2026 — Mati reportó que ciertos miembros con plan a 6
-- meses no veían el selector de sede en la app del miembro (Nuria
-- Balduzzi, Patricio de la Fuente, Camila Lorenzo). El frontend
-- (ReservasPage.vue) y el backend (booking-service.ts) condicionan el
-- acceso multi-sede a `subscription_plans.multi_branch`. Los planes
-- legacy archivados PROGRAMA 3 MESES (id 7) y PROGRAMA 6 MESES (id 13)
-- tenían multi_branch=0, dejando 149 subscripciones activas (60 + 89)
-- sin acceso multi-sede aunque el negocio sí los considera multi-sucursal.
--
-- Esta migración sólo cambia el flag de los dos planes mencionados;
-- otros planes legacy (FLEX TURNOS MAÑANA, FLEX + TURNOS MAÑANA) quedan
-- como están porque el negocio los considera single-branch.
--
-- Idempotency. _migrations tracker prevents double-run. WHERE multi_branch
-- = 0 hace no-op si la migración ya corrió.
--
-- Note: SQL line comments must NOT contain inline semicolons because
-- run-migrations.ts splits the file on the semicolon BEFORE stripping
-- comments.

UPDATE subscription_plans
SET multi_branch = 1
WHERE id IN (7, 13)
  AND multi_branch = 0;
