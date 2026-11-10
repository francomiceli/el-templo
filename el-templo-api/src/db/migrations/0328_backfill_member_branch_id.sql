-- 0328_backfill_member_branch_id.sql
-- Fase 207 (D-14, DI-07, DI-08): backfill de la sede del alumno en los cobros
-- historicos.
--
-- Mejor dato disponible = la sede ACTUAL del socio (users.branch_id): el cobro
-- viejo no guardaba la sede de ese momento. Desde 0327 los cobros nuevos la
-- guardan como snapshot.
--
-- Idempotente: solo toca filas con socio y sin snapshot (member_branch_id IS
-- NULL), asi que re-ejecutarla es un no-op. Solo dentro del mismo gimnasio
-- (u.tenant_id = ft.tenant_id). Los egresos y movimientos sin socio quedan NULL.
--
-- updated_at tiene ON UPDATE CURRENT_TIMESTAMP: la asignacion explicita
-- ft.updated_at = ft.updated_at lo preserva, sin eso el backfill sellaria todo
-- el ledger con la fecha del deploy.

UPDATE `financial_transactions` ft JOIN `users` u ON u.id = ft.member_id AND u.tenant_id = ft.tenant_id SET ft.member_branch_id = u.branch_id, ft.updated_at = ft.updated_at WHERE ft.member_id IS NOT NULL AND ft.member_branch_id IS NULL;
