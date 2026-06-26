-- Phase 148-01 (ALTA-06 / W-1) — created_member_id on the ledger
-- Hand-written (db:generate hits the pre-existing sessions.goal_plan_type interactive
-- drift, same as 0154/0158/0161, and meta/_journal.json is stale). Next sequential
-- number on this branch is 0162 (last applied 0160 + 0161). NEVER drizzle-kit
-- push/migrate -- the _migrations table is the source of truth.
--
-- A SQL comment must never contain a statement separator char -- the runner splits
-- raw statements first and only then strips line comments.
--
-- created_member_id = el alumno que ESTA carga creó vía createMinimalMember (PoS profe).
-- NULLABLE (nullable FK to users.id) -- toda carga sobre un socio preexistente y todo
-- histórico queda NULL. El cascade en void (148-03) lo lee para desactivar la membresía
-- y dejar al alumno inactivo cuando se anula una carga de alumno-nuevo. El id se graba
-- DENTRO de la misma tx del charge (transactionService.create) -- nunca con un UPDATE
-- desacoplado, para no dejar un alumno activo huérfano ante un crash.

ALTER TABLE `financial_transactions`
  ADD COLUMN `created_member_id` int NULL AFTER `idempotency_key`;

ALTER TABLE `financial_transactions`
  ADD CONSTRAINT `fk_financial_tx_created_member`
  FOREIGN KEY (`created_member_id`) REFERENCES `users`(`id`);
