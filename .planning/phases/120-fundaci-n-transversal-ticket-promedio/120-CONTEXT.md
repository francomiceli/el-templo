# Phase 120: Fundación transversal + Ticket promedio - Context

**Gathered:** 2026-06-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Entrega la **capa de fundación** de las métricas de gestión v5.0 + el **Bloque 6 (Ticket promedio)** que estrena esa fundación. Backend-only (servicios + endpoints + tests + migración chica).

**En scope:**

- Mecanismo `duration_tier` (monthly | long_term) consumible por todas las métricas para el breakdown corto/largo plazo (FUND-01).
- Helpers transversales reutilizados por los 6 bloques: estructura uniforme nominal + % + n (FUND-02); motor de breakdowns comparables por sucursal/país/duración/nombre de plan, lado a lado (FUND-03); aislamiento de moneda ARS/EUR (FUND-04); cohortes que respetan el rango `[from,to)` del panel + vista semanal/mensual (FUND-05).
- Bloque 6 Ticket: promedio ponderado de `price_paid` por plan/global (TICKET-01/02), descuento vs precio de lista (TICKET-03), aislamiento por moneda + cortes (TICKET-04).

**Fuera de scope:** UI del admin (fase de frontend posterior); los otros 5 bloques (fases 121-123).
</domain>

<decisions>
## Implementation Decisions

### duration_tier (FUND-01)

- **D-01:** `duration_tier` se **deriva de `subscription_plans.durationDays`**, NO se agrega columna. Regla: `durationDays ≤ 1` → **excluido** (one-off, no es membresía recurrente: "Clase unica", "Sesión de Prueba"); `2 ≤ durationDays ≤ 31` → **monthly**; `durationDays > 31` → **long_term**. Robusto a cambios de nombre, sin migración. Validado contra los planes reales (duraciones existentes: 1 / 30 / 120 / 180 / 240 días — el umbral 31 las separa sin ambigüedad; los planes `other` de 30d como programas online y packs caen correctamente en monthly).
- **D-02:** Implementar la derivación como helper centralizado (un solo lugar) para que los 6 bloques la consuman idéntica. El umbral (1, 31) debe quedar como constante nombrada, no mágico.

### Ticket — universo de cobros (TICKET-01/02)

- **D-03:** El ticket promedio se calcula sobre cobros **`price_paid > 0`** (precio realmente pagado). Los cobros de $0 (promos gratis, sesiones de prueba, becas al 100%) se **excluyen del promedio** pero se reporta **al lado el conteo/% de membresías colocadas a $0** (no se pierde la señal de regalos). Esto evita que el promedio se hunda con captación.
- **D-04:** Filtro técnico del universo de cobros = el canonical revenue filter ya establecido en la fase 105: `kind = 'plan_charge'` AND `direction = 'inflow'` AND `voided_at IS NULL`. Universo = nuevas + renovaciones, por fecha de cobro (`transaction_date`), respetando el rango del panel. Ticket global = suma total ÷ cantidad de cobros (ponderado por volumen, NO promedio de promedios). Aislado por moneda.

### Descuento — base de precio (TICKET-03)

- **D-05:** **Snapshot a futuro.** No existe snapshot histórico del precio de lista (verificado: `subscriptions` tiene `price_paid`/`price_type_applied`/`price_override_amount` pero NO `priceRegular`; `financial_transactions` solo tiene `amount`). Se agrega una **columna nueva** para capturar el `priceRegular` vigente del plan en cada **cobro nuevo** de membresía (capturada en assign/change/renew dentro de `SubscriptionService`; ubicación probable: `subscriptions`). El descuento histórico usa el `priceRegular` actual con **disclaimer**; lo nuevo queda fiel. Mostrar **mediana junto al promedio** para amortiguar outliers (ej. beca 90% off).
- **D-06:** Esta decisión agrega una **migración chica** a la fase (la columna de snapshot) — es la única migración de esta fase (duration_tier NO migra).

### Claude's Discretion

- Forma exacta del contrato de salida de los helpers (shape del JSON nominal+%+n y de los breakdowns lado a lado), ubicación de los helpers dentro de `el-templo-api/src/modules/analytics/`, y si el motor de breakdowns extiende el `scope.ts`/`applyScope` existente o es un módulo nuevo. El planner decide respetando los patrones del módulo.
- Nombre exacto y ubicación de la columna de snapshot de precio (D-05) — `subscriptions` vs `financial_transactions`; el planner elige según dónde nace el cobro.
- Vista semanal/mensual por defecto y cómo se agrupan los planes en los breakdowns más allá de duration_tier.
  </decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spec de negocio (fuente de verdad)

- `ESPECIFICACION-METRICAS-GESTION.md` — spec de los 6 bloques; §"Reglas transversales" (FUND) y §6 "Ticket promedio" + §5 bucket de duración por flag. Define fórmulas y cortes.
- `BRIEF-METRICAS-GESTION.md` — inventario de métricas actuales + caveats que estos bloques resuelven.
- `METRICAS_GESTION_HANDOFF_2026-06-02.md` — estructura de fases, hallazgos de código verificados (líneas exactas de churn/retención/ARPU), apéndice B (tablas/datos fuente por bloque).

### Planning

- `.planning/REQUIREMENTS.md` — FUND-01..05 + TICKET-01..04 (requirements de esta fase) + reglas transversales + decisiones abiertas.
- `.planning/ROADMAP.md` §"v5.0 Phase Details" → "Phase 120" — goal, success criteria, riesgos.

### Modelo financiero (de donde sale el universo de cobros)

- Canonical revenue filter de la fase 105 (`kind='plan_charge' AND direction='inflow' AND voided_at IS NULL`) — ver decisiones de fase 105 en `.planning/STATE.md` (Accumulated Context) y `el-templo-api/src/modules/finance/` + `financial-transactions` schema.
  </canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `el-templo-api/src/modules/analytics/scope.ts` — `applyScope` (filtrado por sucursal/país/rol). El motor de breakdowns (FUND-03) probablemente lo extiende o se apoya en él.
- `el-templo-api/src/modules/analytics/service.ts` — métricas actuales; churn viejo (`churnedMembers` ~329-358) y retención (`retentionRate` ~360-426, `renewalRate` ~676-721) viven acá (se reemplazan/formalizan en fase 121, no en 120, pero sirven de patrón de estructura).
- `el-templo-api/src/modules/analytics/advanced-finance-service.ts` — ARPU actual (caveat #5; el ticket NO debe reusar su denominador snapshot).
- `el-templo-api/src/modules/finance/` + `financial-transactions` schema — fuente de los cobros para el ticket (`amount`, `kind`, `transaction_date`, `voided_at`).
- `subscription_plans` schema — `planTier`, `durationDays` (insumo de duration_tier), `priceRegular` (base del descuento), `country`, `currency`.

### Established Patterns

- Aislamiento de moneda: las métricas financieras ya se parten ARS/EUR en el módulo (no mezclar). Reusar el patrón.
- Constructor DI para servicios (fase 56). El servicio de fundación/ticket se inyecta donde corresponda.
- Migraciones manuales SQL (no `drizzle-kit generate`) por el runner custom; **nunca `;` dentro de comentarios SQL**.

### Integration Points

- La captura del snapshot de precio (D-05) engancha en `SubscriptionService` (assign/change/renew) — donde nace el cobro de membresía.
- Los endpoints de la fundación/ticket se registran en `analytics/routes.ts` con el guard de scope existente.
  </code_context>

<specifics>
## Specific Ideas

- **Datos reales de planes (verificados en DB local):** duraciones existentes = 1 / 30 / 120 / 180 / 240 días. Flex/Flex+ (30d, tier `flex`) = monthly; Foundation/Foundation+ (120d), Performance (240d), Foundation Online (180d) = long_term; programas online y packs (`other`, 30d) = monthly; Clase única / Sesión de Prueba (1d) = excluidos. El enum `planTier` (`flex|foundation|performance|other`) NO sirve para el tier de duración (por eso se deriva de días).
- El ticket debe mostrar siempre n al lado del promedio (regla transversal) y la mediana junto al promedio para outliers.
  </specifics>

<deferred>
## Deferred Ideas

- **Recuperar el precio de lista histórico** para descuentos de cobros viejos: imposible (no se guardó). Solo mejora hacia adelante vía el snapshot D-05.
- **Columna explícita `duration_tier`**: descartada por ahora (derivación por días alcanza). Reconsiderar solo si aparece un plan cuya duración no refleje su intención de tier.
- **Override manual de duration_tier** (variante híbrida): no necesario con los datos actuales.
- Reactivación, activación temprana, MRR con componentes — fuera del milestone (ya en REQUIREMENTS Future).

### Reviewed Todos (not folded)

None — no pending todos matched this phase.
</deferred>

---

_Phase: 120-Fundación transversal + Ticket promedio_
_Context gathered: 2026-06-03_
