# Phase 162: Superficie — member app y reporte de reparto - Context

**Gathered:** 2026-07-14
**Status:** Ready for planning
**Source:** Decisiones tomadas por el usuario durante discuss-phase 161 + REQUIREMENTS v5.7 (no hubo discuss-phase 162 dedicado — el usuario pidió encadenar plan+ejecución directamente).

<domain>
## Phase Boundary

Superficie del pase "Actividades con Aura" sobre el núcleo de la fase 161 (ya ejecutado en esta rama): (1) la grilla de reservas del member app muestra las actividades especiales con distintivo y estado según el acceso del usuario, con contador de clases restantes del pase (x/2) y mensaje informativo para quien no lo tiene; (2) el externo-solo-pase puede ver y reservar SOLO las especiales desde la app (el backend ya lo enforcea — GATE-04); (3) el admin obtiene el reporte de asistencias por actividad especial por mes separando socio/externo (insumo del reparto manual a profes, sin montos) y el contador de suscripciones especiales activas ("Especiales") diferido desde D-11 de la fase 161.

NO incluye: pago in-app (sin gateway), reparto con montos, notificaciones push.

</domain>

<decisions>
## Implementation Decisions

### Heredadas de la fase 161 (LOCKED — decididas por el usuario)

- **D-01 (naming):** en toda superficie visible el término es **"Especiales" / "Planes especiales"** y la marca del producto es **"Actividades con Aura"**. NUNCA "pases" en UI (jerga interna de docs).
- **D-02 (APP-03):** el usuario sin pase que intenta reservar una especial recibe un mensaje claro de qué es y cómo conseguirlo — **informativo, sin pago in-app** (la venta es por gestión/PoS).
- **D-03 (contador):** el usuario con pase ve cuántas clases especiales le quedan del período (2/2, 1/2, 0/2). Fuente: `classesRemaining` de la suscripción de categoría `especial` (el backend ya la expone como sub en paralelo).
- **D-04 (REP-01):** reporte admin de asistencias por actividad especial por mes, separando origen **socio** (tenía presencial activo / plan `requiresPresencial`) vs **externo**, SIN montos calculados — la regla de reparto es de Nacho.
- **D-05 (contador "Especiales" en analíticas):** línea/solapa propia con las suscripciones especiales activas separadas socio/externo — residual de D-11 de fase 161 (la exclusión de métricas ya se implementó en 161-04).
- **D-06 (externo en la app):** el externo con solo pase tiene `userStatus='activo'` y debe poder usar la app para reservar especiales. El gate actual todo-o-nada de la grilla (`hasPresencialPlan` en `useUserStore`) debe refinarse: externo-solo-pase ve la grilla limitada a especiales (el backend ya rechaza regulares — GATE-04); socio presencial sin pase ve las especiales con estado "requiere plan especial" y NO pierde nada de su vista actual.
- **D-07 (bypass staff):** ya implementado en 161 (API + admin). No duplicar en el member app: el member NUNCA bypasea.

### Claude's Discretion

- Diseño exacto del distintivo/badge en la grilla y el estado visual (usar patrones existentes de `ReservasPage.vue` y la paleta de marca — cálida, SIN azul, `quasar.variables.scss` fuente de verdad).
- Ubicación del contador x/2 en la app (chip en la grilla, card en Mi Templo, o ambos).
- Ubicación del reporte REP-01 en el admin (tab en Analíticas vs Reportes — consistente con el nav de v5.4: Analíticas/Reportes viven en Finanzas) y si lleva export (los reportes existentes reusan export Excel — seguí el patrón si es barato).
- Forma de exponer los datos: endpoints nuevos vs extender `WeeklySlotView` (que ya expone... verificar — el plan 161-05 expuso `isSpecial` en `getScheduleSlotRaw`; la grilla `getWeeklyGrid`/`WeeklySlotView` puede necesitar el flag también).
- Copy exacto de los mensajes (tono consistente con la app; español rioplatense como el resto).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Núcleo ya construido (fase 161, esta misma rama)

- `.planning/phases/161-n-cleo-actividades-gateadas-pase-mensual-y-enforcement/161-CONTEXT.md` — decisiones D-01..D-14 del producto.
- `.planning/phases/161-n-cleo-actividades-gateadas-pase-mensual-y-enforcement/161-01-SUMMARY.md` … `161-06-SUMMARY.md` — qué existe: schema 0179, planes seed, contratos (`PassRequiredError` code `PASS_REQUIRED`, `categoryGroup`, `pickSubscriptionForActivity`), gating en `reserve()`, consumo ruteado, exclusión de métricas.
- `.planning/phases/161-n-cleo-actividades-gateadas-pase-mensual-y-enforcement/161-RESEARCH.md` — mapa técnico con file:line.

### Fuente de negocio y planning

- `.docs/actividades-aura/WhatsApp Ptt 2026-07-13 at 14.42.43.txt` — audio de Nacho sobre el reparto por asistencia real (contexto de REP-01).
- `.planning/ROADMAP.md` §"v5.7 (Actividades con Aura)" — fase 162, success criteria.
- `.planning/REQUIREMENTS.md` — APP-01..03, REP-01.

### Reglas del repo

- `.claude/skills/el-templo-change-control/SKILL.md` — git add explícito, staging-first, no push sin OK.
- Memoria del repo: CI NO typechequea frontends — correr `vue-tsc` local en el-templo-app y el-templo-admin.

</canonical_refs>

<code_context>

## Existing Code Insights

- `el-templo-app/src/pages/ReservasPage.vue` (~2089 líneas) — grilla semanal; gate de página por `canReservePresencial` (useUserStore: `hasPresencialPlan`, `hasPresencialReservationAccess`); manejo de códigos de error tipados (patrón `COVERAGE_EXPIRED` → `showCoverageDialog`) reutilizable para `PASS_REQUIRED`.
- `el-templo-app/src/stores/useUserStore.ts:180-201` — capabilities derivadas de las subs; agregar noción de "tiene plan especial activo" y "solo-especial".
- `el-templo-api/src/modules/scheduling/service.ts` — `getWeeklyGrid`/`WeeklySlotView` (~:299-319): probablemente falte exponer `isSpecial` por slot (161-05 solo lo expuso en `getScheduleSlotRaw`).
- La sub especial viaja por los mismos endpoints de suscripciones que presencial+online (multi-sub) — verificar qué expone `GET /members/me`/subscripciones al app.
- `attendance` ya registra asistencia con `scheduleId` → actividad; REP-01 se deriva con JOIN attendance→schedules→activities (`is_special`) + sub del member al momento (socio/externo vía plan `requiresPresencial` o categoría de su otra sub).
- Admin analytics: tab de Analíticas existente (patrón reciente: tab "Referidos A/B" agregado en v5.5) como análogo para la solapa/contador "Especiales".

</code_context>

<specifics>
## Specific Ideas

- El contador y los estados deben ser autoexplicativos para un socio que no sabe qué es "Actividades con Aura" — el mensaje informativo (APP-03) es la pieza de marketing interna: qué es, precio ($10.000 socios / $20.000 externos), y que se compra en recepción/con su profe.
- Éxito observable (ROADMAP): "un usuario abre la grilla, distingue las actividades especiales, ve cuántas clases del pase le quedan (o el mensaje de cómo conseguirlo), y el admin exporta/consulta las asistencias del mes separadas por origen socio/externo".

</specifics>

<deferred>
## Deferred Ideas

- Reparto con montos por profe (REP-F1), compra in-app (APP-F1), notificaciones push de lanzamiento — fuera del milestone.

</deferred>

---

_Phase: 162-Superficie — member app y reporte de reparto_
_Context gathered: 2026-07-14 (derivado de discuss-phase 161 por pedido del usuario de encadenar sin discusión dedicada)_
