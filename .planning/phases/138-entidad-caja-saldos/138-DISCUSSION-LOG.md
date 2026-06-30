# Phase 138: Entidad caja + saldos - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-24
**Phase:** 138-Entidad caja + saldos
**Areas discussed:** De dónde sale la caja de cada pago, Cajas: ¿saldo histórico o de cero?, Alcance UI de 138

---

## De dónde sale la caja de cada pago

| Option                       | Description                                                                                                                       | Selected |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Automática por forma de pago | efectivo→caja sucursal, transferencia/tarjeta→banco moneda, AURA/interno→ninguna. Sin override. Resolver en 138, reusado por 140. | ✓        |
| Automática + override manual | Misma regla por defecto, pero el que carga puede cambiar la caja a mano.                                                          |          |
| Otra lógica                  | La regla propuesta no es la correcta.                                                                                             |          |

**User's choice:** Automática por forma de pago.
**Notes:** Mantiene la carga dead-simple (objetivo del milestone), elimina error humano, la caja es consecuencia de cómo se cobró. El resolver `resolveCashRegister(paymentMethod, branchId, currency)` vive en 138 (lo necesita el backfill y getBalance), reusado por la carga única de 140. Sin override manual en 138.

---

## Cajas: ¿saldo histórico o de cero?

| Option                                  | Description                                                                                                    | Selected |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------- |
| Limpias desde fecha de corte + apertura | Saldo de apertura (conteo físico, o 0) + validados nuevos. Tx viejas etiquetadas con caja solo para historial. | ✓        |
| Backfill completo (toda la historia)    | Saldo = Σ todos los pagos históricos. Efectivo queda inflado (retiros pasados nunca registrados).              |          |
| Arrancar en cero, sin apertura          | Cajas en 0, solo cuentan pagos nuevos. Día 1 no coincide con el efectivo físico ya acumulado.                  |          |

**User's choice:** Limpias desde fecha de corte + apertura.
**Notes:** Tensión clave que reconoció Franco (dueño del gimnasio): backfillear todo el efectivo histórico lo inflaría porque esa plata ya se movió/depositó/gastó y esos retiros nunca se registraron (movimientos/egresos arrancan en 139). Un saldo inflado el día 1 rompe la confianza del libro de caja. Solución: saldo de apertura por caja (conteo físico, default 0, por migración al go-live) + Σ validados desde fecha de corte (única global). Tx históricas se etiquetan con cash_register_id solo para historial, excluidas del saldo.

---

## Alcance UI de 138

| Option                              | Description                                                                                                      | Selected |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------- |
| Backend-only                        | cash_registers + seed + cash_register_id + resolver + getBalance + guard moneda + saldo apertura. Display → 141. | ✓        |
| Backend + vista read-only de saldos | Además del backend, una pantalla mínima de saldo por caja en 138.                                                |          |

**User's choice:** Backend-only.
**Notes:** Mismo patrón que 137. La fase 141 es la casa de reportes (saldo por caja); construir UI en 138 que 141 reemplaza = trabajo tirado. El riesgo de 138 es el modelo de datos (entidad caja, guard de moneda, saldo derivado con corte), no la pantalla. Saldo de apertura se carga por seed/migración; UI para editarlo (si hace falta) = fase 142.

## Claude's Discretion

- Schema del saldo de apertura (columnas `opening_balance`/`opening_date` en `cash_registers` vs tx de apertura).
- Cómo expresa getBalance la fecha de corte en el SUM.
- Estructura de CashRegisterService + dónde vive el resolver.
- Si el seed de efectivo×sucursal incluye Barcelona (EUR) / virtual.
- REST shape de getBalance.

## Deferred Ideas

- Movimientos inter-caja (`cash_transfer`) + egresos (`expense`) → fase 139. NOTA: arquitectura modela movimiento como 2 filas (doble entrada) pero ROADMAP dice 1 fila origen+destino — resolver en discuss-phase 139.
- Vista saldo por caja + bandeja (UI) → fase 141.
- UI editar saldo de apertura → fase 142.
- Materialización del saldo (cache applyDelta) → diferido por performance.
- Override manual de la caja del pago → descartado salvo nueva decisión.
- Carga única dead-simple del profe (reusa resolver) → fase 140.
