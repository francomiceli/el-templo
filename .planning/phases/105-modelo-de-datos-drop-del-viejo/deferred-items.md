# Phase 105 — Deferred Items

Items detectados durante spec/plan/execute de Phase 105 que se mueven fuera del scope. Cada uno con criterio explícito para retomarlo.

## 1. Reconciliation cron de cache `balances`

**Qué es:** Job nocturno (cron) que recalcula desde cero los saldos pendientes desde `financial_transactions` + `transaction_links` y los compara contra la tabla `balances` cacheada. Si hay diff, loggea alerta (o auto-corrige).

**Por qué se difiere:** La cache `balances` se mantiene en la misma DB transaction que el `create`/`void` de transacciones (ver Phase 105 SPEC requirement #8). Si el service layer es el único writer y los tests cubren los invariantes, la cache es "correcta por construcción". El job es un seguro de redundancia, no un mecanismo crítico.

**Decidido en:** Phase 105 spec round 2 (2026-04-27).

**Criterio para retomar:**

- Aparece evidencia de drift entre cache y datos crudos en producción (un saldo dudoso, una caja torcida sin causa explicable, etc.).
- Se permite escritura a `balances` desde fuera del service layer (e.g., un script de migración futuro, un endpoint admin de override).
- Se introduce concurrencia que potencialmente compete por la misma row de balances (raro, pero posible si admins de distintas sucursales cobran al mismo miembro simultáneamente).

**Sugerencia de implementación cuando toque:**

- Phase de v4.9 (o sub-fase) con scope: cron diario que SELECTea todos los `member_id, target_kind, target_id` con transacciones, recalcula `Σ(allocated_amount * direction_sign)`, compara contra `balances.amount`, escribe diffs a un log de auditoría (`balance_drift_log` o similar).
- No corregir automáticamente sin alertar — el drift implica un bug que debe diagnosticarse.

---

## 2. (Reservado para items que surjan durante plan/execute)

_Agregar acá según vayan apareciendo._
