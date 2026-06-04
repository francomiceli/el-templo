# Phase 121: Vencimiento — Churn de no renovación + Tasa de renovación - Context

**Gathered:** 2026-06-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Reemplaza las métricas frágiles de churn/retención por un par **person-based** correcto, construido sobre un único **motor de cohorte por `end_date ∈ [from,to)`** (reutilizando la fundación de la Fase 120). Backend-only (servicios + endpoints + tests; sin migración prevista).

**En scope:**

- **Bloque 1 Churn (CHURN-01..06):** churn como personas distintas vencidas en `[from,to)` sin sub nueva dentro de la ventana; ventana libre + vista multi-N comparativa; churn maduro (solo vencidos hace ≥ventana); renovación anticipada y cambio de duración cuentan como retención; pausa no cuenta como vencida; serie histórica por cohorte de vencimiento con marca de provisorios; abierto por los breakdowns estándar.
- **Bloque 2 Renovación (RENOV-01..04):** renovados ÷ vencidos sobre la MISMA cohorte; corte renovación/reactivación configurable (default 15d); número vivo (no fuerza renov%+churn%=100); ordenable/comparable por segmento.

**Fuera de scope:** UI del admin (fase posterior); LTV (Fase 122); Frecuencia + Funnel (Fase 123); reactivación como métrica propia (futuro); eliminación física de las métricas viejas del API (ver D-09 — se retiran en la fase de UI).
</domain>

<decisions>
## Implementation Decisions

### Cohorte de vencimiento (CHURN-01, base de B1 y B2)

- **D-01:** La cohorte de "vencidos en `[from,to)`" = personas distintas con una suscripción cuyo **`endDate` cae en `[from,to)`** (vencimiento natural por fecha de fin). **Nunca** por `updatedAt`/`cancelledAt` — eso es exactamente lo que reemplaza la métrica vieja (`churnedMembers` `service.ts:329-358` usa `updatedAt` y se deja de usar).
- **D-02:** La **baja voluntaria a mitad de período es rara** en la práctica (el patrón real es "deja de ir antes del endDate y no renueva"), así que **no se modela como evento aparte**. Si existe una fila `cancelled` cuyo `endDate` cae en el rango, entra por el mismo predicado de `endDate` que cualquier otra. No hay lógica especial de cancelación temprana.
- **D-03:** Una suscripción **en pausa** (`status='paused'`) cuyo `endDate` cae en el rango se **excluye de la cohorte mientras esté pausada** (no venció de verdad); entra recién cuando se reanuda y vence. Matchea CHURN-04 ("una sub en pausa no cuenta como vencida"). NO se corre el `endDate` efectivo por la duración de la pausa (se descartó por complejidad).
- **D-04:** **Persona con varios vencimientos dentro del rango** → su churn se evalúa sobre su **ÚLTIMO vencimiento del rango**. Los anteriores fueron renovados (por eso hay uno posterior); el último refleja el estado actual. Esto garantiza el conteo de "personas distintas" (CHURN-01).

### Predicado de retención / "renovó" (CHURN-04, RENOV-01)

- **D-05:** Una persona cuya sub venció en `E` **retuvo (no churneó)** si existe **otra suscripción** (fila distinta de la que venció) que **arranca a más tardar en `E + ventana`** y da continuidad. **Cambio de plan y cambio de duración (mensual↔largo) cuentan como renovación** (CHURN-04). La detección se hace sobre filas de `subscriptions` (no sobre pagos) — coherente con el motor de cohorte; el planner confirma el SQL exacto.
- **D-06:** La **renovación anticipada** (paga el próximo bloque antes de que venza el actual, generando cobertura solapada/continua) **cuenta sin tope de cuán antes** — cualquier sub posterior que dé continuidad y comience a más tardar en `E + ventana` cuenta como retención, sin importar cuántos días antes de `E` se pagó.

### Ventana única churn/renovación (CHURN-02/03, RENOV-02/03)

- **D-07:** **Un único parámetro "ventana de renovación", configurable, default 15 días**, define ambos: churn@ventana (sin sub nueva dentro de la ventana = churneó) y "renovado" (sub nueva dentro de la ventana). El **multi-N del churn (ej. 5/10/15) es solo vista comparativa**; el churn "oficial" que aparea con la tasa de renovación usa esta misma ventana. Así **churn% + renov% = 100 solo cuando `en_gracia = 0`** (RENOV-03: número vivo).
- **D-08:** **Churn maduro:** solo entran al cálculo (numerador Y denominador) las personas cuyo vencimiento ocurrió **hace ≥ ventana** días. Las que siguen en la ventana de gracia se excluyen hasta madurar (CHURN-03). La **serie histórica** (CHURN-05) marca como **provisorios** los períodos cuya cohorte aún no maduró. **Reactivación tras la ventana:** una vez churneada, **queda churneada** — no se revierte si la persona vuelve más tarde (volver después de la ventana = reactivación, métrica futura fuera de alcance).

### Migración de las métricas viejas (impacto en admin)

- **D-09:** Las métricas viejas (`churnedMembers` por `updatedAt`, `retentionRate` `service.ts:360-426`, `renewalRate` 7/14/30 `service.ts:676-721`) **coexisten (deprecadas)** durante esta fase: se agregan los endpoints nuevos person-based al lado y se dejan las viejas funcionando para **no romper el dashboard admin actual** que las consume. Se **retiran físicamente en la fase de UI del admin**, cuando las tarjetas se reconecten a los endpoints nuevos. ⚠️ **Desvío consciente del Success Criterion #1 del ROADMAP** ("la métrica vieja `churnedMembers` queda eliminada"): a nivel código en 121 queda deprecada-pero-presente; la eliminación literal se satisface a nivel milestone (fase UI). El planner debe marcar las viejas como deprecadas (comentario/anotación) y dejar el nuevo endpoint como reemplazo canónico.

### Claude's Discretion

- Forma exacta del shape de salida de churn (multi-N lado a lado, marca de provisorios) y de renovación, reusando los helpers nominal+%+n de la Fase 120.
- Valores por defecto del set multi-N comparativo (ej. 5/10/15) y nombre exacto del parámetro de ventana en el querystring.
- Si el motor de cohorte por `end_date` se extrae como helper compartido reutilizable por B1 y B2 (probable) o se inlinea — el planner decide respetando los patrones de `analytics/`.
- Granularidad exacta de la serie histórica (mes a mes por cohorte de vencimiento, per CHURN-05) y cómo se computa el `en_gracia` para el "número vivo" de renovación.
- Detección de "sub nueva/continuidad" por filas de `subscriptions` (startDate de una sub posterior) vs. señales de pago — se prefiere filas; el planner confirma contra el modelo real de renovación de `SubscriptionService`.
  </decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spec de negocio (fuente de verdad)

- `ESPECIFICACION-METRICAS-GESTION.md` — §1 "Churn de no renovación" + §2 "Tasa de renovación": fórmulas, ventana, churn maduro, número vivo.
- `BRIEF-METRICAS-GESTION.md` — inventario de métricas actuales + caveats que estos bloques resuelven.
- `METRICAS_GESTION_HANDOFF_2026-06-02.md` — hallazgos de código verificados (líneas exactas de churn/retención/renovación), tabla "Reemplaza vs agrega", decisiones abiertas (la #3 `renewalRate` 7/14/30 y la #5 edge multi-vencimiento se resuelven en este CONTEXT).

### Planning

- `.planning/REQUIREMENTS.md` — CHURN-01..06 + RENOV-01..04 (requirements de esta fase).
- `.planning/ROADMAP.md` §"Phase 121" — goal, success criteria, riesgos.

### Fundación de la Fase 120 (se reutiliza, NO se reimplementa)

- `.planning/phases/120-fundaci-n-transversal-ticket-promedio/120-CONTEXT.md` — decisiones de fundación (duration_tier derivado, breakdowns, cohortes [from,to), nominal+%+n).
- `el-templo-api/src/modules/analytics/breakdowns.ts` — motor de breakdowns (compone `applyScope`); abrir churn/renov por duración/plan/sucursal/país.
- `el-templo-api/src/modules/analytics/cohorts.ts` — rango half-open `[from,to)` + bucket semanal/mensual (insumo de la serie histórica).
- `el-templo-api/src/modules/analytics/metric-shape.ts` — nominal+%+n + median.
- `el-templo-api/src/modules/analytics/duration-tier.ts` — `deriveDurationTier` para el corte corto/largo plazo.

### Código a reemplazar / reusar como patrón

- `el-templo-api/src/modules/analytics/service.ts:329-358` (`countChurnedMembers`, viejo, por `updatedAt`), `:360-426` (`retentionRate`), `:676-721` (`getRenewalRate` 7/14/30 con `activeMemberExists` + `applyScope`) — patrón de estructura; quedan deprecados (D-09).
- `el-templo-api/src/db/schema/subscriptions.ts` — `status` enum (`active|paused|cancelled`), `endDate` (nullable), `startDate`, `pausedAt`/`pauseEndDate`, `cancelledAt`, `userId`, `planId`. "Una activa/pausada por miembro" (varias canceladas permitidas).
  </canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- Toda la fundación de la Fase 120 en `el-templo-api/src/modules/analytics/` (breakdowns, cohorts, metric-shape, duration-tier) — el churn y la renovación son consumidores nuevos de esos primitivos.
- `applyScope` (`analytics/scope.ts`) — filtrado por sucursal/país; ambos endpoints lo componen vía el motor de breakdowns.
- `activeMemberExists` (usado en `getRenewalRate`) — patrón de detección de sub vigente; sirve de referencia para el predicado de retención (D-05), aunque el nuevo es person-based sobre la cohorte de vencimiento.

### Established Patterns

- Servicios de analytics con constructor DI (fase 56); endpoints registrados en `analytics/routes.ts` con guard de scope/ADMIN.
- Aislamiento de moneda y nominal+%+n ya estandarizados en la Fase 120 — reusar.
- Tests de integración contra MySQL real en `el-templo-api/test/analytics/` (corren en CI, no localmente). **Atención al helper de inserción de usuarios:** usar el campo real `passwordHash` (columna `password_hash`, notNull) o `registerUser` — un insert crudo con `password` rompe en CI (lección de la Fase 120, `breakdowns-cohorts.test.ts`).

### Integration Points

- El motor de cohorte por `end_date ∈ [from,to)` es el corazón compartido de B1 (churn) y B2 (renovación) — probablemente un helper común que ambos endpoints consumen.
- Los endpoints nuevos se registran en `analytics/routes.ts`; las métricas viejas (D-09) siguen en `service.ts` deprecadas hasta la fase de UI.
  </code_context>

<specifics>
## Specific Ideas

- **Default de la ventana = 15 días** (unifica el corte renovación/reactivación con el churn "oficial").
- **Multi-N comparativo** (ej. churn@5 / @10 / @15 lado a lado) es vista de exploración; el número que aparea con renovación usa la ventana oficial (15d).
- **churn% + renov% = 100 solo cuando `en_gracia = 0`** — el "número vivo" de renovación lo expone tal cual, sin forzar la suma.
- La serie histórica de churn marca **provisorios** los meses cuya cohorte aún no maduró (≥ ventana días).
  </specifics>

<deferred>
## Deferred Ideas

- **Eliminación física de las métricas viejas** del API (`churnedMembers`, `retentionRate`, `renewalRate` 7/14/30) → fase de UI del admin (cuando se reconecten las tarjetas). Ver D-09.
- **Reactivación como métrica propia** (quien vuelve después del corte de la ventana) → futuro (REQUIREMENTS Future).
- **Ajuste del `endDate` efectivo por la duración de la pausa** → descartado por ahora (D-03 excluye pausadas en vez de correr la fecha); reconsiderar solo si aparece un caso real que lo justifique.
- **LTV / Kaplan-Meier** (usa el churn de esta fase) → Fase 122.

### Reviewed Todos (not folded)

None — no pending todos matched this phase.
</deferred>

---

_Phase: 121-Vencimiento — Churn de no renovación + Tasa de renovación_
_Context gathered: 2026-06-03_
