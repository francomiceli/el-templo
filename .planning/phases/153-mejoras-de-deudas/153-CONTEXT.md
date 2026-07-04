# Phase 153: Mejoras de Deudas - Context

**Gathered:** 2026-07-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Mejoras a la vista de Deudas del admin (`DeudasPage.vue`, dentro de Finanzas post-149): cada deuda muestra fecha de registro (DEUDA-01), motivo reutilizando el campo `misc_reason` de v5.3 — verificado: existe como enum `sin_plan`/`otro` solo en cobros sueltos, NO se duplica (DEUDA-02), y el plan+período asociado (DEUDA-03); la pantalla suma la cohorte de socios con plan vencido sin renovar (DEUDA-04). Requirements: DEUDA-01..04.

NO incluye: acciones de cobro desde la fila (fase 154, ALUM-02), reglas de precio por medio de pago (fase 154), cambios al PoS de Cobros (fase 151, ejecutada), cambios al motor de validación, ni analytics de churn (fase 121, ya existe).

**Arrastrado de fases previas (no re-decidir):** 149 D-04 la seguridad real vive en la API y la UI solo esconde; constraint SaaS transversal sin Templo-ismos nuevos en core; 152: migraciones a mano (`db:generate` roto por drift), columnas byte-for-byte con la migración, "dinero firme" = helper canónico; 151: el PoS se llama "Cobros" en `/cobros`.

</domain>

<decisions>
## Implementation Decisions

### Estructura de la pantalla (granularidad)

- **D-01: DeudasPage pasa a 3 tabs — "Por socio" / "Por deuda" / "Vencidos".** "Por socio" es la tabla agregada actual (nombre, teléfono, total a cobrar por moneda) y queda **sin cambios de columnas**: es la vista de cobro rápido en la puerta. "Por deuda" es la lista detallada con una fila por deuda. El usuario pidió explícitamente tener ambas listas.
- **D-02: El tab "Por deuda" reusa/adapta `DeudasReport.vue`** (hoy en Reportes), que ya tiene fila por deuda con Miembro, Teléfono, Plan/Concepto, Sucursal, Monto, Antigüedad (días + bucket), Fecha devengo, Moneda, totales por antigüedad y export Excel. **El reporte SALE de Reportes** (se muda, no se comparte): una sola casa para deudas, con su export y totales incluidos.
- **D-03: Tab default = "Por socio"** (el uso más frecuente sigue siendo cobrar).

### No-renovaciones (DEUDA-04)

- **D-04: Los vencidos van en el tercer tab "Vencidos"**, no mezclados con las deudas: no son deudas reales (no hay monto a cobrar) y no contaminan la vista de cobro. Ya existe un predicado "vencido sin renovar" reusable en analytics (fase 121, `analytics/service.ts` ~513-613).
- **D-05: Ventana fija de 60 días** — vencido sin renovar = plan con `end_date` en los últimos 60 días y sin plan activo hoy. Más atrás es churn histórico y vive en Analíticas. Sin selector de ventana.
- **D-06: La fila del vencido NO muestra monto** — es un lead de renovación, no una deuda. Columnas: nombre, teléfono, plan vencido, fecha de vencimiento, días transcurridos.
- **D-07: Socio con deuda Y plan vencido aparece en ambos tabs** — sin lógica de exclusión; cada tab responde su propia pregunta.

### Motivo, fecha y período por deuda (DEUDA-01/02/03)

- **D-08: Motivo derivado del origen, SIN campo nuevo ni backfill.** Deuda de cuota → "Cuota {plan}" + período; deuda de cobro suelto → el `misc_reason` de v5.3 de la transacción que la originó ("Sin plan"/"Otro") + su nota. Cumple el mandato del roadmap de reutilizar sin duplicar.
- **D-09: Período del plan como rango de fechas del ciclo** — "Cuota Full — 01/06 al 30/06" (start/end de la subscription). Exacto siempre, incluso con ciclos que no calzan en mes calendario.
- **D-10: "Fecha desde que se registró" = fecha de carga en el sistema** (cuándo se registró la deuda), lectura literal del pedido de Nacho. La antigüedad/devengo que ya calcula el reporte se conserva como está en el tab "Por deuda".
- **D-11: La nota libre va en tooltip/detalle de la fila**, no como columna; la columna lleva el motivo corto estructurado.

### Roles y acciones

- **D-12: Tabs por rol.** El profe (coach) ve SOLO "Por socio" (proyección mínima como hoy — el endpoint coach fue diseñado a propósito para no exponer más detalle financiero). "Por deuda" y "Vencidos" son gestión del negocio → solo gestion/admin/owner. La restricción se aplica **en la API** (149 D-04), la UI solo esconde tabs. Nota: Deudas la ven coach+gestion+admin+owner vía override Templo (`templo-config.ts:51` DEUDAS_ROLES).
- **D-13: Pantalla solo lectura.** Sin acciones por fila — Nacho textual: "es solo para ver, pero sirve para ocuparse del negocio". El cobro directo desde la fila llega en la fase 154 (ALUM-02, en Alumnos).

### Claude's Discretion

- Diseño exacto de tabs (labels finales, íconos) y del tooltip/detalle de la nota.
- Si el tab "Por deuda" conserva los filtros actuales del reporte (sucursal, moneda, búsqueda) tal cual o los adapta al layout de la página.
- Diseño de la API para los datos nuevos: extender el endpoint admin existente de outstanding-balances (reports) vs endpoint nuevo para vencidos; el endpoint coach (`/admin/coach/outstanding-balances`) NO gana campos nuevos (D-12).
- Orden default de cada tab (sugerencia: deudas más viejas primero en "Por deuda"; vencimiento más reciente primero en "Vencidos").
- Cómo resolver la ruta/redirect de Reportes al quitar el reporte de deudas (que no queden links rotos).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño del milestone (fuente de verdad)

- `.docs/saas-multitenancy/Correcciones El Templo.md` — doc crudo de Nacho, §DEUDAS: "No parece tener mucho valor por sí solo. Me parece atractivo que también traiga a todas las personas que se les venció el plan. Es solo para ver, pero sirve para ocuparse del negocio." + a incorporar: 1. fecha desde que se registra, 2. motivo, 3. al pago de qué está asociado (plan? de qué mes?).
- `.docs/saas-multitenancy/01-analisis-correcciones-admin.md` — mapa image21 → `DeudasPage.vue`; §3 Finanzas.

### Superficie a modificar (admin)

- `el-templo-admin/src/pages/DeudasPage.vue` — página actual (113 líneas): tabla agregada por socio+moneda vía `useCoachApi.getOutstandingBalances`; gana los 3 tabs (D-01).
- `el-templo-admin/src/components/DeudasReport.vue` — reporte detallado por deuda en Reportes (364 líneas): se MUDA al tab "Por deuda" (D-02) con export Excel y totales por antigüedad.
- `el-templo-admin/src/pages/ReportesPage.vue` — pierde el `DeudasReport` (D-02).
- `el-templo-admin/src/config/templo-config.ts` — `DEUDAS_ROLES = ['coach','gestion','admin','owner']` (~línea 51, override Templo); el gating por tab (D-12) se monta sobre esto.

### API y schema (motor financiero)

- `el-templo-api/src/modules/coach/service.ts` — `getOutstandingBalances`: proyección mínima coach-scoped sobre `balances` (amount > 0); NO gana campos (D-12).
- `el-templo-api/src/modules/reports/service.ts` — outstanding-balances detallado del reporte (aging, conceptLabel, effectiveDate): base de datos del tab "Por deuda".
- `el-templo-api/src/db/schema/balances.ts` — fila por (member, targetKind subscription|debt_balance, targetId, currency); la granularidad por deuda YA existe acá; `createdAt` disponible para D-10.
- `el-templo-api/src/db/schema/financial-transactions.ts` — `miscReason` enum `sin_plan`/`otro` (fase 145, solo `advance_payment`) + `notes`: fuente del motivo derivado (D-08).
- `el-templo-api/src/modules/analytics/service.ts` — predicado "vencido sin renovar" (~513-613, fase 121): reusable para el tab Vencidos (D-04/D-05).
- `el-templo-api/src/db/schema/subscriptions.ts` — `start_date`/`end_date` del ciclo para el período (D-09) y el corte de 60 días (D-05). OJO dato sucio histórico: ~4260 subs con ventana invertida (`end_date < start_date`), todas `cancelled` — el predicado de vencidos debe excluirlas.

### Contexto de fases previas (dependencias directas)

- `.planning/phases/149-nav-por-categor-as-rbac/149-CONTEXT.md` — D-04 (gating frontend + API consistente).
- `.planning/phases/152-reorganizaci-n-de-caja-egresos-configurables/152-CONTEXT.md` — patrones de migración/tests del tren v5.4 (esta fase probablemente NO necesita migración: todo es derivado de datos existentes).

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `DeudasReport.vue` — el tab "Por deuda" casi completo: columnas, aging buckets, export Excel, "Cargar más". Se muda, no se reescribe.
- Endpoint de reports outstanding-balances (con `conceptLabel`, `effectiveDate`, `ageInDays`, bucket) — ya devuelve casi todo lo de DEUDA-01/03; verificar si `conceptLabel` incluye el período (D-09) y el motivo de cobros sueltos (D-08).
- Predicado "vencido sin renovar" de analytics (fase 121) — base SQL del tab Vencidos.
- Patrón de tabs de `CajaPage.vue` (`CAJA_TABS`, fase 152) — referencia directa para los 3 tabs de Deudas.
- `buildMemberNameSearchCondition` (`modules/shared/member-search.ts`) — búsqueda por nombre ya compartida entre coach y reports.

### Established Patterns

- **La seguridad real vive en la API** (149 D-04): el tab-gating de D-12 requiere que los endpoints de "Por deuda"/"Vencidos" tengan guard gestion/admin/owner (coach → 403), no solo esconder el tab.
- **Scope por rol existente**: coach → branchIds, gestion/admin → country, owner → todo (espejo de `attachCountryScope`); el tab Vencidos debe respetar el mismo scoping.
- **Tests de integración obligatorios** para rutas nuevas/modificadas (`el-templo-api/test/`): al menos — vencidos dentro/fuera de ventana 60d, exclusión de subs con ventana invertida, socio con deuda+vencido en ambos, coach 403 en endpoints nuevos, motivo derivado por cada origen (cuota vs suelto sin_plan vs suelto otro).
- **Sin migración esperada**: todos los datos (fecha, motivo, plan, período, vencidos) son derivables de `balances`+`financial_transactions`+`subscriptions`; si el planner encuentra que falta un dato, preferir derivarlo antes que agregar columnas.

### Integration Points

- `DeudasPage.vue` — estructura de 3 tabs + gating por rol (esconde tabs para coach).
- `ReportesPage.vue` — remoción del tab/sección de deudas sin dejar links rotos.
- `modules/reports/` o `modules/finance/` routes — datos enriquecidos de "Por deuda" (motivo/período) + endpoint de vencidos con guard de rol.
- `modules/coach/service.ts` — queda intacto (proyección mínima del profe).

</code_context>

<specifics>
## Specific Ideas

- El usuario pidió explícitamente **ambas listas** (agregada y por deuda): "de alguna forma me gustaría tener ambas listas... tal vez se puedan armar dos tabs" — resuelto con los 3 tabs (D-01/D-04).
- Nacho sobre Deudas: "Es solo para ver, pero sirve para ocuparse del negocio" — motiva D-13 (solo lectura) y el espíritu de DEUDA-04 (gestión desde una sola pantalla).
- Nacho ítem 3: "Al pago de qué está asociado esa deuda (plan? de qué mes?)" — D-09 responde con plan + rango de fechas del ciclo.

</specifics>

<deferred>
## Deferred Ideas

- **Botón de WhatsApp en la fila de Vencidos** (contactar para renovar) — ofrecido y no elegido; si Nacho lo pide tras usar el tab, es un agregado chico sobre D-06 (el teléfono ya está en la fila).
- **Registrar cobro desde la fila** — ya roadmapped en fase 154 (ALUM-02), no se adelanta acá (D-13).

### Reviewed Todos (not folded)

- `v51-milestone-data-rollout.md` (Rollout de datos v5.1 — poblar `milestone_exercise_id`) — revisado y NO incorporado por quinta vez (149, 150, 151, 152, 153): rollout de datos del sistema de entrenamiento, sin relación con Deudas (match débil por keywords genéricas).

</deferred>

---

_Phase: 153-Mejoras de Deudas_
_Context gathered: 2026-07-04_
