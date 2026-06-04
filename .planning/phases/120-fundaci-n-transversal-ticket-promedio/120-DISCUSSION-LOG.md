# Phase 120: Fundación transversal + Ticket promedio - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-03
**Phase:** 120-Fundación transversal + Ticket promedio
**Areas discussed:** duration_tier, Ticket (universo de cobros), Descuento (base de precio)

---

## duration_tier — cómo se define

| Option                      | Description                                                                          | Selected |
| --------------------------- | ------------------------------------------------------------------------------------ | -------- |
| Derivado de durationDays    | Umbral: ≤1 excluido, 2-31 mensual, >31 largo plazo. Sin migración, inmune al nombre. | ✓        |
| Columna explícita           | Campo monthly\|long_term\|null por plan, migración + backfill + mantener.            |          |
| Híbrido (deriva + override) | Derivado por default + columna nullable de override.                                 |          |

**User's choice:** Derivado de durationDays.
**Notes:** Decisión informada por datos reales (duraciones 1/30/120/180/240). El mapeo del spec (Flex=mensual, resto=largo) no servía porque planes `other` de 30d son mensuales y los de 1d no son membresía. El umbral 31 los separa sin ambigüedad. Elimina la migración que el handoff dejaba abierta.

---

## Ticket — qué cuenta como cobro

| Option           | Description                                                         | Selected |
| ---------------- | ------------------------------------------------------------------- | -------- |
| Excluir los $0   | Promedio solo sobre price_paid > 0; promos/prueba/beca-100% afuera. |          |
| Incluir los $0   | Promedia todo, incluyendo $0 (ARPU efectivo).                       |          |
| Ambos, separados | Ticket sobre pagos >0 + al lado % de membresías a $0.               | ✓        |

**User's choice:** Ambos, separados.
**Notes:** El ticket refleja el precio real (pagos >0) sin perder la señal de cuántos regalos hubo. Filtro técnico del universo = canonical revenue filter de fase 105 (plan_charge, inflow, no anulado), nuevas + renovaciones por fecha de cobro.

---

## Descuento — contra qué precio

| Option                                          | Description                                                                          | Selected |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ | -------- |
| priceRegular actual + mediana, acotado al rango | Compara contra precio actual; aprox para ARS viejo.                                  |          |
| Snapshot a futuro                               | Guardar priceRegular vigente en cada cobro nuevo; histórico usa actual + disclaimer. | ✓        |
| Derivar del override ya guardado                | Usar price_type_applied / price_override_amount.                                     |          |

**User's choice:** Snapshot a futuro.
**Notes:** Verificado que NO existe snapshot histórico (subscriptions solo tiene price_paid/price_type_applied/price_override_amount; financial_transactions solo amount). Se agrega columna nueva (única migración de la fase). Histórico usa actual con disclaimer; mediana para outliers.

---

## Claude's Discretion

- Forma del contrato de salida de los helpers (shape nominal+%+n y breakdowns), ubicación en `analytics/`, y si el motor de breakdowns extiende `scope.ts` o es módulo nuevo.
- Ubicación exacta de la columna de snapshot de precio (`subscriptions` vs `financial_transactions`).
- Vista semanal/mensual por defecto.

## Deferred Ideas

- Recuperar precio de lista histórico para descuentos viejos — imposible (no se guardó).
- Columna explícita `duration_tier` y variante híbrida con override — descartadas por ahora.
- Reactivación, activación temprana, MRR con componentes — fuera del milestone.
