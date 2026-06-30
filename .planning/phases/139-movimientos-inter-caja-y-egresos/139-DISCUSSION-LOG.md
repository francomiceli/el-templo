# Phase 139: Movimientos inter-caja y egresos - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-24
**Phase:** 139-Movimientos inter-caja y egresos
**Areas discussed:** Movimiento 1 vs 2 filas, Reconciliación contado≠esperado, Egreso sin socio (memberId), Alcance UI

---

## Movimiento: ¿1 fila o 2 (doble entrada)?

| Option                  | Description                                                                                                            | Selected |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------- |
| 2 filas (doble entrada) | Asiento contable: outflow en origen + inflow en destino, linkeadas. Reusa ledger + getBalance de 138 sin schema nuevo. | ✓        |
| 1 fila (origen+destino) | Una fila con 2 columnas de caja. Agrega schema, bifurca getBalance, rompe uniformidad.                                 |          |

**User's choice:** 2 filas (doble entrada).
**Notes:** Resuelve la discrepancia ROADMAP ("una sola fila") vs ARCHITECTURE ("dos filas linkeadas"). El "una sola fila" del ROADMAP era simplificación del texto; la invariante real (una operación atómica, neto 0) se cumple con 2 filas. Reusa transaction_links (target_kind='transaction'), el getBalance con signo de 138, sin schema nuevo en el ledger. Actualizar criterio MOV-01 del ROADMAP. Egreso sigue siendo 1 fila (sin destino).

---

## Reconciliación: contado ≠ esperado

| Option                                      | Description                                                                                                      | Selected |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------- |
| Saldo = lo contado, diferencia con rastro   | La caja muestra la plata real; faltante/sobrante queda como reconciliación explícita (monto+motivo+autor+fecha). | ✓        |
| Saldo = lo esperado, diferencia como alerta | La caja sigue en lo esperado; la diferencia se flaguea y se cuadra aparte. Arrastra saldo fantasma.              |          |

**User's choice:** Saldo = lo contado, diferencia con rastro.
**Notes:** El número de la caja debe ser la plata real. La diferencia se registra explícitamente (eso es "no silencioso" del brief) con rastro y corrige el saldo de origen. Reusa la AuditAction 'reconciliation' ya existente. Sin saldo fantasma acumulándose.

---

## Egreso sin socio (memberId) — técnico

| Option                        | Description                                                                                | Selected            |
| ----------------------------- | ------------------------------------------------------------------------------------------ | ------------------- |
| memberId nullable             | Egreso/movimiento sin socio → NULL. Honesto, sin usuario falso. Auditar JOINs de reportes. | ✓ (decisión Claude) |
| Usuario sentinel ('Gimnasio') | Socio falso para colgar egresos; no toca NOT NULL pero ensucia listas/conteos de socios.   |                     |

**User's choice:** Franco respondió "no sé qué es esto" → decisión técnica delegada a Claude. Elegido: memberId nullable.
**Notes:** Pura plomería interna sin impacto en lo que ve el usuario. Franco preguntó "¿estás comparando pagos con egresos?" — se aclaró el modelo de los 3 tipos (pago=entra/tiene socio; egreso=sale/sin socio; movimiento=cambia de caja/neto 0), todos en el mismo libro (financial_transactions). Franco confirmó que el modelo le cierra. memberId nullable = modelo honesto; auditar blast radius de JOINs (los egresos/movimientos ya quedan fuera de métricas de socios por su kind).

---

## Alcance UI de 139

| Option              | Description                                                                            | Selected |
| ------------------- | -------------------------------------------------------------------------------------- | -------- |
| Backend-only        | Servicio/endpoints movimiento+egreso+anular+reconciliación+guard moneda. UI → 140/141. | ✓        |
| Backend + UI mínima | Además, pantalla mínima para registrar movimiento/egreso en 139.                       |          |

**User's choice:** Sí (modelo claro) y backend-only.
**Notes:** Mismo patrón que 137/138. Historial de movimientos/egresos vive en 141; formularios en 140/141. El riesgo de 139 es el modelo (doble entrada, reconciliación, void atómico del par), no la pantalla.

## Claude's Discretion

- Modelado exacto de la reconciliación (campo discrepancy/expected/counted en la fila vs fila adjustment separada).
- Cómo se linkean las 2 filas del movimiento.
- REST shape de los endpoints.
- Reconciliación obligatoria siempre vs solo cuando hay diferencia.
- Estructura del guard igual-moneda.

## Deferred Ideas

- Categoría de egresos (proveedor/sueldo) → post-v1.
- Conversión FX / movimiento cross-moneda → descartado v1.
- UI movimiento/egreso + historial → 140/141.
- Materialización del saldo → diferido (heredado 138).
