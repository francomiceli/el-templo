# Analíticas vs Reportes — Análisis profundo + Propuesta de reorganización

**Fecha:** 2026-04-29
**Contexto:** v4.8 (Modelo Financiero) recién terminada (Phase 109). v4.9 (Refactor Splits) en cola.
**Autor:** Análisis técnico para decisión de reorganización — no ejecutar código todavía.

---

## TL;DR ejecutivo

1. **Hay un solapamiento real pero acotado** — sólo la sub-tab **Finanzas de Analíticas** y la tab **Deudas de Reportes** miden lo mismo (deuda total). El resto (Miembros, Asistencia, Programas, Vencimientos, Inactivos, Cobros, Accesos, Conversión) son **complementarios**, no duplicados.
2. **Hay un bug de divergencia financiera real**: `FinancialAnalytics.totalOutstanding` calcula deuda como `expectedRevenue - collectedRevenue` leyendo de `subscriptions.pricePaid` (modelo viejo, semántica cambiada en v4.8); el tab Deudas usa `SUM(balances.amount > 0)` (modelo nuevo). Los números **van a discrepar siempre** post-Phase 109.
3. **Diferencia conceptual clara**: Analíticas = dashboard agregado/visual (charts, trends, KPIs); Reportes = listas accionables exportables a Excel (tablas, filtros, contacto WhatsApp). Esto _justifica_ mantener las dos páginas.
4. **Recomendación:** **Opción B — Reparar y consolidar, mantener dos páginas.** Arreglar la deuda en Analíticas/Finanzas alineándola con `balances` (1-2h), redactar el rol de cada página explícitamente en su subtítulo, y mover las 3 cards "Programas" desde Analíticas hacia un dashboard de Programas dedicado. Cambio de bajo riesgo, pequeño costo, alto valor de claridad.
5. **NO recomiendo unificar todo** (Opción C): perdés la separación útil entre "ver tendencias" y "actuar sobre listas", y hacés un page-monstruo de ~10 tabs que ya está pidiendo a gritos splitear (v4.9).

---

## 1. Inventario exhaustivo

### 1.1 `AnaliticasPage.vue` (559 LOC) — `/analiticas` — `isAdminRole` (admin + owner)

Filtros globales: `country` (owner-only), `branchId`, `dateFrom`, `dateTo` (con presets: este mes, mes anterior, últimos 3 meses, este año, custom).

#### 1.1.1 KPI cards (siempre visibles, encima de los tabs)

| Widget                | Texto humano                                                                                              | Endpoint               | Service method                                                     | Tablas                                        | Export? |
| --------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------ | --------------------------------------------- | ------- |
| Card "Activos"        | Cantidad de miembros con `users.status='activo'` y `role='member'`                                        | `GET /admin/analytics` | `analytics.service.ts::getActiveMembersKpi` → `countActiveMembers` | `users`, `branches`                           | No      |
| Card "Ingresos"       | Suma de inflows reales del período (financial_transactions kind plan_charge+debt_settlement, no anulados) | `GET /admin/analytics` | `analytics.service.ts::getMonthlyRevenueKpi` → `sumRevenue`        | `financial_transactions`, `users`, `branches` | No      |
| Card "Asistencia/día" | Promedio de check-ins por día del período                                                                 | `GET /admin/analytics` | `analytics.service.ts::getDailyAttendanceKpi` → `computeDailyAvg`  | `attendance`, `branches`                      | No      |

Cada card incluye **trend vs período anterior** (computado con `computePriorPeriod` shared, comparando contra ventana inmediatamente anterior de igual longitud).

#### 1.1.2 Tab "Miembros" (`MiembrosTab.vue`, 315 LOC)

| Widget                                  | Texto humano                                                                             | Endpoint                       | Service method         | Tablas                                                     | Export? |
| --------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------ | ---------------------- | ---------------------------------------------------------- | ------- |
| Card "Nuevos"                           | `users` con `role=member` creados en el período                                          | `GET /admin/analytics/members` | `countNewMembers`      | `users`, `branches`                                        | No      |
| Card "Bajas"                            | `subscriptions` con `status='cancelled'` y `updatedAt` en el período                     | id.                            | `countChurnedMembers`  | `subscriptions`, `branches`                                | No      |
| Card "Tasa de retención"                | % de subs cuyo `endDate` cae en el período y el usuario tiene otra sub `active`/`paused` | id.                            | `computeRetentionRate` | `subscriptions`, `branches`                                | No      |
| Bar chart "Nuevos vs Bajas"             | Idem cards en formato visual                                                             | id.                            | (mismos counts)        | id.                                                        | No      |
| Doughnut "Distribución por plan"        | Conteo de subs activas/pausadas por plan                                                 | id.                            | `getPlanDistribution`  | `subscriptions`, `subscription_plans`, `branches`          | No      |
| Tabla "Miembros que requieren atención" | Top 20 con sub `active` y `endDate` en próximos 7 días                                   | id.                            | `getAttentionList`     | `subscriptions`, `users`, `branches`, `subscription_plans` | No      |

> Acciones embebidas: "Extender" (dialog **deshabilitado, "próximamente"**) y "Contactar" (WhatsApp deep link).

#### 1.1.3 Tab "Asistencia" (`AsistenciaTab.vue`, 328 LOC)

| Widget                           | Texto humano                                                                                      | Endpoint                          | Service method        | Tablas                                            | Export? |
| -------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------- | --------------------- | ------------------------------------------------- | ------- |
| Line chart "Asistencias por día" | Conteo `attendance` por día                                                                       | `GET /admin/analytics/attendance` | `getDailyCheckins`    | `attendance`, `branches`                          | No      |
| Card "Tasa de no-show"           | % bookings con `status='no_show'` sobre `confirmed`+`no_show`                                     | id.                               | `getNoShowRate`       | `bookings`, `schedules`, `branches`               | No      |
| Heatmap "Horas pico"             | Ocupación promedio por (hora × día semana), normalizada a `branches.maxCapacity`                  | id.                               | `getPeakHoursHeatmap` | `attendance`, `branches`                          | No      |
| Tabla "Ocupación por clase"      | Por schedule activo: bookings reservado/qr_escaneado/confirmado, dividido por semanas y capacidad | id.                               | `getSlotOccupancy`    | `bookings`, `schedules`, `activities`, `branches` | No      |

> ⚠️ Sutileza: `getNoShowRate` filtra por `bookings.status IN ('confirmed', 'no_show')` pero el resto del codebase usa `confirmado` (en español). Posible bug — verificar en terreno.

#### 1.1.4 Tab "Finanzas" (`FinanzasTab.vue`, 200 LOC)

| Widget                          | Texto humano                                                      | Endpoint                         | Service method                                          | Tablas                                              | Export? |
| ------------------------------- | ----------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------- | --------------------------------------------------- | ------- |
| Bar chart "Ingresos por mes"    | Inflows agrupados por mes (`DATE_FORMAT %Y-%m`)                   | `GET /admin/analytics/financial` | `getRevenueTrend`                                       | `financial_transactions`, `users`, `branches`       | No      |
| Stat list "Ingresos por método" | Inflows segmentados por `payment_method ∈ {cash, transfer, card}` | id.                              | `getRevenueByMethod`                                    | id.                                                 | No      |
| Bar chart "Ingresos por sede"   | Inflows por `financial_transactions.branchId`                     | id.                              | `getRevenueByBranch`                                    | `financial_transactions`, `branches`                | No      |
| Card "Deuda pendiente"          | `max(0, expectedRevenue − collectedRevenue)`                      | id.                              | `getExpectedRevenue` (legacy) − `sumRevenue` (post-109) | `subscriptions.pricePaid`, `financial_transactions` | No      |
| Card "Tasa de cobro"            | `collectedRevenue / expectedRevenue × 100`                        | id.                              | id.                                                     | id.                                                 | No      |

> 🔴 **AQUÍ está la divergencia post-Phase 109**. Detallado en §4.

#### 1.1.5 Tab "Programas" (inline en AnaliticasPage)

| Widget                       | Texto humano                        | Endpoint                        | Service method                      | Tablas                | Export? |
| ---------------------------- | ----------------------------------- | ------------------------------- | ----------------------------------- | --------------------- | ------- |
| Card "Total Inscripciones"   | Conteo total de program_enrollments | `GET /admin/programs/analytics` | `programs.service.ts::getAnalytics` | `program_enrollments` | No      |
| Card "Inscripciones Activas" | Idem con `status='active'`          | id.                             | id.                                 | id.                   | No      |
| Card "Completados"           | Idem con `status='completed'`       | id.                             | id.                                 | id.                   | No      |

> 💡 Esto **no es analytics del gimnasio en sentido estricto** — es un mini-dashboard del módulo Programas (Arete). No usa los filtros globales (country/branch/date). Está acá por conveniencia, no por diseño.

---

### 1.2 `ReportesPage.vue` (1480 LOC) — `/reportes` — `isCajaRole` (gestion + admin + owner)

Filtros globales: `country` (owner-only) + `branchId`. Cada tab tiene además sus filtros propios (date range + tab-specific).

#### 1.2.1 Tab "Accesos"

Filtros: dateRange (presets), search libre, source (qr/manual).

| Widget                     | Texto humano                                                                | Endpoint                    | Service method                     | Tablas                                                       | Export?             |
| -------------------------- | --------------------------------------------------------------------------- | --------------------------- | ---------------------------------- | ------------------------------------------------------------ | ------------------- |
| Tabla paginada (20/50/100) | Cada check-in: fecha/hora, miembro, sede, fuente, turno (schedule asociado) | `GET /admin/reports/access` | `reports.service.ts::getAccessLog` | `attendance`, `users`, `branches`, `schedules`, `activities` | ✅ `/access/export` |

#### 1.2.2 Tab "Cobros"

Filtros: dateRange, search libre, paymentMethod.

| Widget                                   | Texto humano                                                                    | Endpoint                     | Service method     | Tablas                                                                                                          | Export?              |
| ---------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------- | -------------------- |
| Tabla paginada con badge ANULADO/Vigente | Cada cobro real: fecha, miembro, plan, monto+moneda, método, recorder, voidedAt | `GET /admin/reports/charges` | `getChargeHistory` | `financial_transactions`, `transaction_links`, `subscriptions`, `subscription_plans`, `users` (m+r), `branches` | ✅ `/charges/export` |

> Filtra `kind IN ('plan_charge','debt_settlement') AND direction='inflow' AND voidedAt IS NULL`. **Mismo concepto que "Ingresos" KPI/charts en Analíticas**, pero como lista row-level vs agregado.

#### 1.2.3 Tab "Vencimientos"

Filtros: `daysWindow` (1-365, default 7), `includeExpired` (toggle).

| Widget                              | Texto humano                                                         | Endpoint                      | Service method           | Tablas                                                     | Export?               |
| ----------------------------------- | -------------------------------------------------------------------- | ----------------------------- | ------------------------ | ---------------------------------------------------------- | --------------------- |
| Tabla con chip "Vencido Xd" / "Hoy" | Subs `active`/`paused`/`expired` cuyo `endDate ≤ today + daysWindow` | `GET /admin/reports/expiring` | `getExpiringMemberships` | `subscriptions`, `users`, `branches`, `subscription_plans` | ✅ `/expiring/export` |

> Solapamiento parcial con "Miembros que requieren atención" en Analíticas/Miembros (pero esa tabla está hard-cap a próximos 7 días, top 20, sin paginación, sin export). Detalle en §3.

#### 1.2.4 Tab "Inactivos"

Filtros: `daysThreshold` (1-365, default 14).

| Widget                    | Texto humano                                                                         | Endpoint                      | Service method       | Tablas                                                                   | Export?               |
| ------------------------- | ------------------------------------------------------------------------------------ | ----------------------------- | -------------------- | ------------------------------------------------------------------------ | --------------------- |
| Tabla con WhatsApp action | Miembros con sub `active`/`paused` y `MAX(attendance.checkedInAt)` >= N días o nunca | `GET /admin/reports/inactive` | `getInactiveMembers` | `subscriptions`, `users`, `branches`, `subscription_plans`, `attendance` | ✅ `/inactive/export` |

#### 1.2.5 Tab "Deudas" (Phase 109-04 — `DeudasReport.vue` 364 LOC)

Filtros: branch (de los globales), `currency` (owner-only), search libre.

| Widget                                           | Texto humano                                                                                                         | Endpoint                                  | Service method           | Tablas                                                                 | Export?                           |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------ | ---------------------------------------------------------------------- | --------------------------------- |
| Cards aging buckets (0-30 / 31-60 / 61-90 / 90+) | Totales por antigüedad. Owner ve por moneda.                                                                         | `GET /admin/reports/outstanding-balances` | `getOutstandingBalances` | `balances`, `subscriptions`, `subscription_plans`, `branches`, `users` | ✅ `/outstanding-balances/export` |
| Tabla detallada paginada (50 por página)         | Cada concepto pendiente: miembro, teléfono, plan/concepto, sucursal, monto+moneda, antigüedad, bucket, fecha devengo | id.                                       | id.                      | id.                                                                    | id.                               |

> 🟢 **Fuente de verdad post-Phase 109**: `balances WHERE amount > 0`. Aging clamp en JS para portabilidad.

#### 1.2.6 Tab "Conversión" (Phase 102-07)

Filtros: dateRange (presets propios: 30d, 90d, este mes, desde siempre).

| Widget                   | Texto humano                                                                      | Endpoint                              | Service method             | Tablas                                                                 | Export?      |
| ------------------------ | --------------------------------------------------------------------------------- | ------------------------------------- | -------------------------- | ---------------------------------------------------------------------- | ------------ |
| 4 KPI cards              | Tasa conversión, mediana días a conversión, revenue de convertidos, revenue/trial | `GET /admin/reports/trial-conversion` | `getTrialConversionReport` | `bookings`, `users`, `schedules`, `branches`, `financial_transactions` | No (¡falta!) |
| Breakdown "Por sede"     | Tabla leads/convertidos/% por sede                                                | id.                                   | id.                        | id.                                                                    | No           |
| Breakdown "Por turno"    | TM/TT (mañana/tarde)                                                              | id.                                   | id.                        | id.                                                                    | No           |
| Breakdown "Por horario"  | Por hora del primer trial                                                         | id.                                   | id.                        | id.                                                                    | No           |
| Tabla "Leads pendientes" | Trials no convertidos, ordenados por más antiguos                                 | id.                                   | id.                        | id.                                                                    | No           |

> Tab muy específico — funnel de trial→alumno. Único en Reportes. No tiene contraparte en Analíticas.

---

## 2. Análisis backend — métodos públicos

### 2.1 `el-templo-api/src/modules/analytics/`

**Archivos:** `routes.ts` (120 LOC), `service.ts` (1110 LOC), `schemas.ts` (5.5 KB), `types.ts`. Guard: `ADMIN_ROLES = ['admin','owner']`.

| Método                            | Calcula                                                                              | Fuente                       | Tablas                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------- | -------------------------------------------------------------------- |
| `getKpis(filters)`                | 3 KPIs con trend vs prior period                                                     | mixto                        | `users`, `branches`, `financial_transactions`, `attendance`          |
| `getMemberAnalytics(filters)`     | newMembers + churned + retention + planDistribution + attentionList                  | subscriptions/users          | `users`, `subscriptions`, `subscription_plans`, `branches`           |
| `getAttendanceAnalytics(filters)` | dailyCheckins + heatmap + slotOccupancy + noShowRate                                 | attendance/bookings          | `attendance`, `bookings`, `schedules`, `activities`, `branches`      |
| `getFinancialAnalytics(filters)`  | revenueTrend + revenueByMethod + revenueByBranch + totalOutstanding + collectionRate | **mixto: legacy + post-109** | `financial_transactions` (good) + `subscriptions.pricePaid` (legacy) |

**Helpers privados destacados** (todos read-only, todos aceptan branchId/country/date):

- `sumRevenue` — usa `financial_transactions` ✅
- `getExpectedRevenue` — usa `subscriptions.pricePaid` ⚠️ (ver §4)
- `getRevenueTrend / getRevenueByMethod / getRevenueByBranch` — todas usan `financial_transactions` ✅

### 2.2 `el-templo-api/src/modules/reports/`

**Archivos:** `routes.ts` (598 LOC), `service.ts` (1300 LOC), `schemas.ts` (12 KB), `types.ts`. Guard: `CAJA_ROLES = ['gestion','admin','owner']`.

| Método                                                                                                          | Calcula                                                     | Tablas                                                                                                    |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `getAccessLog(filters)`                                                                                         | Paginated check-ins                                         | `attendance`, `users`, `branches`, `schedules`, `activities`                                              |
| `getChargeHistory(filters)`                                                                                     | Paginated cobros (FT + transaction_links → subscription)    | `financial_transactions`, `transaction_links`, `subscriptions`, `users`, `branches`, `subscription_plans` |
| `getExpiringMemberships(filters)`                                                                               | Subs por vencer/vencidas en ventana N días                  | `subscriptions`, `users`, `branches`, `subscription_plans`                                                |
| `getInactiveMembers(filters)`                                                                                   | Miembros con sub viva pero >= N días sin asistir            | `subscriptions`, `users`, `branches`, `subscription_plans`, `attendance`                                  |
| `getOutstandingBalances(filters, scope)`                                                                        | **Aging report (Deudas)** desde `balances WHERE amount > 0` | `balances`, `subscriptions`, `subscription_plans`, `branches`, `users`                                    |
| `getTrialConversionReport(filters)`                                                                             | Funnel trial→alumno                                         | `bookings`, `users`, `schedules`, `branches`, `financial_transactions`                                    |
| `exportAccessLog/exportChargeHistory/exportExpiringMemberships/exportInactiveMembers/exportOutstandingBalances` | Mismas queries sin paginación, render Excel via `exceljs`   | id.                                                                                                       |

> El módulo Reports es **decididamente post-Phase 109**: Cobros y Deudas leen del nuevo modelo (`financial_transactions`, `transaction_links`, `balances`). No queda nada legacy en este módulo.

---

## 3. Matriz de overlaps — métricas cruzadas

| #   | Métrica                                            | ¿Analíticas?                                                                               | ¿Reportes?                                                                                              | ¿Mismo cálculo?                                            | ¿Mismas tablas?                                                                                                     | ¿Mismos filtros?                                                             | Diagnóstico                                                                                                                       |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Ingresos del período (total)**                   | ✅ KPI "Ingresos" + chart "Ingresos por mes"                                               | ⚠️ implícito en lista "Cobros" (suma manualmente en Excel)                                              | Sí (mismo SQL: `financial_transactions` filtros idénticos) | Sí                                                                                                                  | Sí                                                                           | **Misma intención, formato distinto.** Analytics = agregado/visual, Reports = lista row-level. Complementarios.                   |
| 2   | **Ingresos por método (cash/transfer/card)**       | ✅ Stat list FinanzasTab                                                                   | ⚠️ filtro `paymentMethod` en Cobros (lista)                                                             | Sí                                                         | Sí                                                                                                                  | Sí                                                                           | id.                                                                                                                               |
| 3   | **Ingresos por sede**                              | ✅ Bar chart FinanzasTab                                                                   | ⚠️ implícito en lista (filtro `branchId`)                                                               | Sí                                                         | Sí                                                                                                                  | Sí                                                                           | id.                                                                                                                               |
| 4   | **Deuda pendiente total**                          | ✅ Card "Deuda pendiente" en FinanzasTab                                                   | ✅ Cards aging-buckets en Deudas tab                                                                    | **NO — divergente**                                        | **NO** (Analytics: `subscriptions.pricePaid − financial_transactions inflows`; Reports: `SUM(balances.amount > 0)`) | No (Analytics filtra por dateRange; Deudas no — la deuda es snapshot al hoy) | 🔴 **Conflicto activo. Misma intención, cálculos divergentes y semánticamente incompatibles post-Phase 109.** Ver §4.             |
| 5   | **Tasa de cobro**                                  | ✅ Card "Tasa de cobro" en FinanzasTab                                                     | ❌ no                                                                                                   | —                                                          | —                                                                                                                   | —                                                                            | Única en Analytics. ⚠️ Mismo problema que #4 — depende de `expectedRevenue` legacy.                                               |
| 6   | **Miembros activos**                               | ✅ KPI "Activos"                                                                           | ❌ no (filtros dependen de tener sub viva, pero no hay card)                                            | —                                                          | —                                                                                                                   | —                                                                            | Única en Analytics.                                                                                                               |
| 7   | **Asistencias por día**                            | ✅ Line chart AsistenciaTab + KPI "Asistencia/día"                                         | ⚠️ implícito (lista "Accesos" se puede agrupar en Excel)                                                | Sí (mismas tablas)                                         | Sí                                                                                                                  | Sí                                                                           | Misma intención, formato distinto. Complementarios.                                                                               |
| 8   | **Heatmap horas pico**                             | ✅ AsistenciaTab                                                                           | ❌ no                                                                                                   | —                                                          | —                                                                                                                   | —                                                                            | Única en Analytics — visualización pura.                                                                                          |
| 9   | **Ocupación por clase**                            | ✅ AsistenciaTab tabla                                                                     | ❌ no                                                                                                   | —                                                          | —                                                                                                                   | —                                                                            | Única en Analytics.                                                                                                               |
| 10  | **Tasa no-show**                                   | ✅ AsistenciaTab                                                                           | ❌ no                                                                                                   | —                                                          | —                                                                                                                   | —                                                                            | Única en Analytics. ⚠️ Posible bug: filtra `bookings.status IN ('confirmed','no_show')`, pero schema usa `confirmado` en español. |
| 11  | **Nuevos miembros**                                | ✅ MiembrosTab                                                                             | ❌ no                                                                                                   | —                                                          | —                                                                                                                   | —                                                                            | Única en Analytics.                                                                                                               |
| 12  | **Bajas / churn**                                  | ✅ MiembrosTab                                                                             | ❌ no                                                                                                   | —                                                          | —                                                                                                                   | —                                                                            | Única en Analytics.                                                                                                               |
| 13  | **Retención**                                      | ✅ MiembrosTab                                                                             | ❌ no                                                                                                   | —                                                          | —                                                                                                                   | —                                                                            | Única en Analytics.                                                                                                               |
| 14  | **Distribución por plan**                          | ✅ MiembrosTab donut                                                                       | ❌ no                                                                                                   | —                                                          | —                                                                                                                   | —                                                                            | Única en Analytics.                                                                                                               |
| 15  | **Membresías por vencer (lista accionable)**       | ⚠️ "Miembros que requieren atención" (top 20, ventana fija 7d, sin export, sin paginación) | ✅ Tab "Vencimientos" (ventana configurable, includeExpired toggle, full table, export Excel, WhatsApp) | Parcial (Analytics es subset hardcoded)                    | Sí (`subscriptions`, `users`, `branches`, `subscription_plans`)                                                     | No (Reports es configurable)                                                 | **Misma intención, Reports es estrictamente superior.** Analytics es preview reducido.                                            |
| 16  | **Inactivos (no asisten hace N días)**             | ❌ no                                                                                      | ✅ Tab "Inactivos"                                                                                      | —                                                          | —                                                                                                                   | —                                                                            | Única en Reports.                                                                                                                 |
| 17  | **Lista de cobros (row-level)**                    | ❌ no                                                                                      | ✅ Tab "Cobros"                                                                                         | —                                                          | —                                                                                                                   | —                                                                            | Única en Reports.                                                                                                                 |
| 18  | **Lista de accesos (row-level)**                   | ❌ no                                                                                      | ✅ Tab "Accesos"                                                                                        | —                                                          | —                                                                                                                   | —                                                                            | Única en Reports.                                                                                                                 |
| 19  | **Aging de deudas (buckets 0-30/31-60/61-90/90+)** | ❌ no                                                                                      | ✅ Tab "Deudas"                                                                                         | —                                                          | —                                                                                                                   | —                                                                            | Única en Reports.                                                                                                                 |
| 20  | **Funnel trial→alumno**                            | ❌ no                                                                                      | ✅ Tab "Conversión"                                                                                     | —                                                          | —                                                                                                                   | —                                                                            | Única en Reports.                                                                                                                 |
| 21  | **Programas: total/activos/completados**           | ✅ Tab "Programas" en Analiticas                                                           | ❌ no                                                                                                   | —                                                          | —                                                                                                                   | —                                                                            | Única en Analytics — pero **fuera de scope** del módulo (es del módulo Programas, ver §6).                                        |

**Síntesis:**

- **Duplicación pura: 0 ítems.**
- **Conflicto activo (mismo nombre, cálculo divergente): 1 ítem (#4 deuda + #5 tasa cobro derivada).**
- **Solapamiento parcial (preview vs lista completa): 1 ítem (#15 vencimientos).**
- **Mismo dato, formato distinto (agregado vs lista) — complementarios: 4 ítems (#1, #2, #3, #7).**
- **Únicos en Analytics: 9 ítems** (KPIs visuales, charts, members analytics, asistencia analytics, programas).
- **Únicos en Reports: 5 ítems** (listas accionables y aging).

---

## 4. Foco especial — Modelo financiero pre vs post Phase 109

Phase 109 introdujo:

- `financial_transactions` (ledger) — `kind ∈ {plan_charge, debt_settlement, refund, adjustment, advance_payment}`, `direction ∈ {inflow, outflow}`, `voided_at`.
- `transaction_links` (pivot) — vincula transacciones a `subscription` o `debt_balance`.
- `balances` (cache) — `target_kind + target_id + currency`, signed `amount` (`>0` = debe, `<0` = a favor, `=0` = saldado).

### 4.1 Estado actual del módulo Analytics

#### ✅ Migrado a financial_transactions

- `sumRevenue` (line 973-1010) — usa `financial_transactions` con kind/direction/voided correctos.
- `getRevenueTrend` (781-828) — id.
- `getRevenueByMethod` (830-879) — id.
- `getRevenueByBranch` (881-924) — id.

> Las cards/charts de "Ingresos" en FinanzasTab y el KPI son **correctos y consistentes** con la tab Cobros de Reports.

#### 🔴 Aún en modelo viejo

- `getExpectedRevenue` (line 930-967) — suma `subscriptions.pricePaid` para subs cuyo período se solapa con el rango.

```sql
-- analytics/service.ts L930-967
SELECT COALESCE(SUM(subscriptions.pricePaid), 0)
FROM subscriptions [JOIN branches]
WHERE startDate <= :dateTo
  AND (endDate >= :dateFrom OR endDate IS NULL)
  AND status IN ('active','paused','expired','completed','changed')
  AND pricePaid > 0
```

Pero según el doc `v48-financial-model-analysis.md`:

> "El campo `pricePaid` deja de significar 'lo que cobramos' y pasa a significar 'precio acordado del plan'."

Y derivado:

```typescript
// analytics/service.ts L149-153
const totalOutstanding = Math.max(0, expectedRevenue - collectedRevenue);
const collectionRate =
  expectedRevenue > 0
    ? Math.round((collectedRevenue / expectedRevenue) * 1000) / 10
    : 100;
```

### 4.2 ¿Por qué van a discrepar siempre?

1. **Universo distinto:** Analytics calcula deuda "del período" (subs activas en el rango); Reports/Deudas calcula deuda "al día de hoy" (cualquier balance > 0).
2. **Definición distinta:** `pricePaid − inflows` ignora descuentos legítimos (AURA credits, boarding pass, `priceOverrideAmount`); `balances` los respeta porque se construye desde `transaction_links.allocated_amount`.
3. **Saldos a favor:** `balances` permite `amount < 0` (a favor); Analytics no los modela.
4. **Refunds:** `financial_transactions` admite `kind='refund'` y los descuenta; Analytics suma todo `inflow` sin distinguir.
5. **Adjustments:** `kind='adjustment'` (con `direction` cualquiera) afecta `balances` pero no `pricePaid`.
6. **Ajuste de moneda:** Analytics no segrega monedas (suma cross-currency); Reports/Deudas explicitó D-06: "NEVER sum amounts across different currencies".

**Riesgo concreto:** un cobro `kind='debt_settlement'` reduce `balances` (deuda baja) pero no toca `subscriptions.pricePaid`. Por lo tanto Analytics seguirá mostrando la deuda como "pendiente" hasta que el período cambie. **El owner ve dos números distintos para la misma cosa, sin manera de saber cuál creer.**

### 4.3 Otros métodos legacy en Analytics

- `countChurnedMembers` (305-334): asume que `subscriptions.status='cancelled'` con `updatedAt` en período ≈ baja. Razonable pero frágil — depende de la semántica del status que Phase 109 no tocó. **No es un bug**, sólo es fragil.
- `computeRetentionRate` (336-402): mismo nivel de fragilidad que el de churn. OK por ahora.
- `getAttentionList` (442-508): identifica subs por vencer. **Consistente** con la lógica de Reports/Vencimientos pero usa criterios distintos (hardcoded 7 días, sólo `status='active'` mientras Reports admite `paused/expired`).

> Conclusión: Analytics sólo tiene **un único bug post-109 real (deuda + tasa cobro)**. El resto es coherente.

---

## 5. Análisis de UX

### 5.1 Quién ve cada página

- `/analiticas` — visible para `isAdminRole = ['admin','owner']`.
- `/reportes` — visible para `isCajaRole = ['gestion','admin','owner']`.

> **Implicación clave:** la recepción/gestión (rol `gestion`) **NO ve Analíticas**. Sólo ve Reportes. Esto coincide con la separación funcional: gestión vive en operación diaria (cobrar, llamar morosos, marcar accesos), no en métricas de dashboard.

### 5.2 Iconos y nombres en sidebar

```
Analíticas → icon "analytics"   (solo admin/owner)
Reportes   → icon "summarize"   (gestion/admin/owner)
```

Están **lado a lado** en el menú principal, lo cual contribuye a la confusión: el ícono y el nombre no transmiten qué hacer en cada uno.

### 5.3 Inferencia de uso

Sin telemetría, hipótesis razonables:

- **Owner**: usa ambas. Analíticas para revisar tendencias mensuales (¿cuánto facturé?, ¿estamos creciendo?, ¿quién renueva?). Reportes para acciones tácticas (exportar Excel para el contador, contactar morosos, ver inactivos).
- **Admin de sucursal**: idem, sesgado a Reportes (operación) más que a Analíticas (estratégico).
- **Gestion (recepción)**: sólo Reportes. Su día a día son llamadas/cobros.

### 5.4 Complejidad relativa

| Métrica                           | Analíticas                   | Reportes                  |
| --------------------------------- | ---------------------------- | ------------------------- |
| LOC frontend                      | 559                          | 1480                      |
| Sub-tabs                          | 4                            | 6                         |
| Endpoints consumidos              | 4 (analytics) + 1 (programs) | 6 (reports)               |
| Tablas SQL tocadas                | 8                            | 12+                       |
| Charts                            | 5                            | 0                         |
| Tablas con paginación server-side | 0                            | 2 (accesos, cobros)       |
| Exportes Excel                    | 0                            | 5                         |
| WhatsApp deep links               | 1 (en attentionList)         | 4 (en cada tab con phone) |

> Reportes es **3× más grande**, **mucho más operativo**, y **el único con export Excel**. Esto refuerza la dicotomía: **Analytics = visualización; Reports = operación**.

---

## 6. Propuesta concreta — TRES opciones

### Opción A — Quick fix mínimo (status quo + bugfix)

**Qué:** Sólo arreglar el bug del cálculo de deuda en Analíticas/Finanzas. Que ambas páginas usen `balances` como fuente de verdad para "deuda total".

**Cambios:**

1. Reemplazar `getExpectedRevenue` y la cuenta derivada en `analytics/service.ts::getFinancialAnalytics` por una llamada equivalente a `SUM(balances.amount) WHERE amount > 0`, segmentado por moneda.
2. Renombrar la card de "Tasa de cobro" a algo que no requiera `expectedRevenue` — opciones: borrarla, o calcularla como `inflows / (inflows + balances_pendientes_inicio_periodo)` (más complejo).
3. Idealmente: borrar la card "Tasa de cobro" si no hay forma limpia post-109 — es la métrica más rota.

**Estructura final:** sin cambios — sigue todo donde está.

**Costo:** S (~1-2h Claude). 1 archivo backend + 1-2 tests.
**Riesgo:** bajo. El número que se mostraba era sospechoso ya, alinear con `balances` aumenta la confianza.
**Pega:** no resuelve la confusión conceptual entre las dos páginas — sólo apaga el incendio numérico.

**A quién le sirve:** owner pragmático que quiere "que dejen de mostrar números distintos para la misma cosa", sin tener tiempo de re-arquitecturar.

---

### Opción B — Reparar y consolidar (recomendada)

**Qué:** Arreglar el bug + clarificar el rol de cada página + sacar lo que está fuera de lugar.

**Estructura final:**

```
/analiticas (admin + owner)
├── Subtítulo: "Tendencias y métricas — para entender el negocio"
├── KPIs (Activos, Ingresos, Asistencia/día) — sin cambios
├── Tab Miembros — sin cambios
├── Tab Asistencia — sin cambios
└── Tab Finanzas — corregido:
    ├── Charts: revenueTrend, byMethod, byBranch — sin cambios
    └── Cards: "Deuda total al día de hoy" + "Saldo a favor (si > 0)"
        — leen de balances, no de pricePaid. Owner ve por moneda.
        — link explícito: "Ver detalle en Reportes → Deudas"
    └── (Eliminada) Tab "Programas" — se mueve a un dashboard propio del módulo Programas

/reportes (gestion + admin + owner)
├── Subtítulo: "Listas operativas — para actuar (contactar, cobrar, exportar)"
└── Tabs: Accesos / Cobros / Vencimientos / Inactivos / Deudas / Conversión — sin cambios
```

**Cambios:**

1. **Backend:** corregir `analytics/service.ts::getFinancialAnalytics` para que `totalOutstanding` lea de `balances` (idealmente reusando un helper compartido con `reports/service.ts::getOutstandingBalances` para evitar duplicación). Eliminar `getExpectedRevenue` y `collectionRate` (o aceptar que `collectionRate` se vuelva un nice-to-have computado de otra forma).
2. **Frontend Analiticas:** subtítulo nuevo, link cruzado en card "Deuda" hacia `/reportes` con query param para abrir tab Deudas. Reemplazar card "Tasa de cobro" por algo derivable post-109 o eliminarla.
3. **Frontend Reportes:** subtítulo nuevo. Sin cambios estructurales.
4. **Mover Programas:** la mini-card de Programas no pertenece a Analíticas global. Crear `ProgramasPage.vue` (o usar la existente si ya hay) con esos 3 cards + listado de inscripciones. El path `/programas` ya existe en sidebar.
5. **(Opcional) cross-link inverso:** desde `/reportes/cobros` agregar un botoncito "Ver tendencia →" que abra `/analiticas` con el tab Finanzas y el rango actual.

**Costo:** M (~4-6h Claude). 1-2 archivos backend, 2-3 frontend, ~3-4 tests nuevos, smoke testing manual.
**Riesgo:** medio-bajo. El número de deuda va a CAMBIAR para el usuario (lo cual es bueno: era erróneo). Comunicarlo en un release note. Tests existentes de analytics pueden romperse — esperable y deseable.
**Pega:** requiere alinear FE+BE+tests; no es atómico.

**A quién le sirve:** **owner que quiere claridad conceptual sin disrupción mayor**. El usuario de este proyecto encaja perfectamente.

---

### Opción C — Unificar todo en una sola página "Métricas"

**Qué:** Borrar la separación. Una página única `/metricas` con sub-secciones por área (Miembros / Asistencia / Finanzas / Operación), y dentro de cada una "vista visual" + "vista lista", expandible.

**Estructura final:**

```
/metricas (gestion + admin + owner — RBAC granular por sección)
├── Filtros globales: country / branch / dateRange
├── Sección Miembros
│   ├── KPIs + charts (ex Analytics/Miembros)
│   └── Tab Lista accionable (ex Reports/Vencimientos + Reports/Inactivos)
├── Sección Asistencia
│   ├── KPIs + charts (ex Analytics/Asistencia)
│   └── Tab Lista accesos (ex Reports/Accesos) — con export
├── Sección Finanzas
│   ├── KPIs + charts (ex Analytics/Finanzas + balances integrado)
│   ├── Tab Cobros (ex Reports/Cobros)
│   └── Tab Deudas (ex Reports/Deudas)
└── Sección Funnel
    └── Tab Conversión
```

**Cambios:** masivos. Reescribir 1 página de 2000+ LOC consolidada, RBAC complejo (gestion no debe ver KPI ingresos, owner sí), borrar las 2 páginas actuales y los items de menu. Probable que `useReportsApi` y `useAnalyticsApi` haya que fusionarlas.

**Costo:** L (~12-20h Claude, varias rondas). 4-6 archivos frontend grandes, 0-1 backend (si fusionamos endpoints), 8-10 tests, refactor RBAC, regression testing exhaustivo.
**Riesgo:** alto.

- Test fixtures rotos a granel.
- RBAC granular es la fuente más común de bugs de seguridad — gestion viendo cosas que no debería.
- La página resultante choca con la intención de v4.9 (split de archivos largos): vamos a partir un archivo de 2000 LOC en otro de 2500 LOC más amplio.
- Cambio de URL `/analiticas` y `/reportes` → `/metricas` rompe bookmarks del owner.

**Plan de migración:**

- Fase 1: backend — endpoint unificado `/admin/metrics` con sub-recursos.
- Fase 2: frontend — nueva página `/metricas` paralela, mantener `/analiticas` y `/reportes` como deprecated 1 sprint.
- Fase 3: redirects y borrar las viejas.

**A quién le sirve:** un **rediseño de producto** completo — owner que quiere "una sola pantalla" filosóficamente, dispuesto a 2-3 sprints de refactor + risk de regresión, y que valora mucho la unicidad por encima de la separación operativo/estratégico. **No es el caso de este proyecto.**

---

## 7. Recomendación final

### → **Opción B (Reparar y consolidar, mantener dos páginas)**

**Razones:**

1. **No hay duplicación real, sólo divergencia financiera puntual.** El análisis muestra 0 métricas idénticas, 1 conflicto activo (deuda) y 1 solapamiento parcial (vencimientos donde Reports >> Analytics). No justifica unificar.

2. **La separación "agregado/visual vs lista/operativo" es buena ingeniería.** Replica patrones estándar (Stripe, Shopify): un dashboard con charts/KPIs y una sección de "operations / reports" con tablas exportables. Mezclar cosas inflates la complejidad sin valor real.

3. **Los roles están alineados con esa separación.** `gestion` no ve Analíticas — esto es deliberado y útil. La opción C lo rompe y obliga a RBAC granular dentro de una página.

4. **El bug financiero es independiente de la decisión arquitectural.** Hay que arreglarlo ya, sea cual sea la opción que elija el usuario. Opción A lo hace y nada más; Opción B lo hace y además limpia.

5. **Engineered enough.** El usuario explicitó esta preferencia. Opción C es over-engineering disfrazado de simplificación. Opción A es under-engineering (dejar la confusión conceptual sin resolver). Opción B es el punto medio.

6. **v4.8 recién terminada, v4.9 (refactor splits) en cola.** El momento de hacer un mega-refactor de UI no es ahora. Opción C extendería la deuda técnica que v4.9 va a atacar; Opción B se mete bien en el flujo.

7. **El usuario es owner-operador con equipo chico** (no SaaS), y trabaja diariamente con el sistema. Cambios de URL/IA disruptivos como Opción C tienen costo real en su día a día. Opción B respeta la mental map existente.

8. **Costo/beneficio:**
   - A: 2h, soluciona el bug, no soluciona la confusión.
   - **B: 4-6h, soluciona el bug Y la confusión Y mueve Programas a su lugar.**
   - C: 12-20h + riesgo de regresión, soluciona la confusión vía nuclear option.

### Pasos sugeridos para implementar Opción B

1. **Phase B-1 (1-2h):** Backend — extraer un helper `computeOutstandingTotal(filters)` en `shared/finance/` (o en `reports/service.ts` y exportar) que `analytics/service.ts::getFinancialAnalytics` consume. Eliminar `getExpectedRevenue` y la card de "Tasa de cobro" (o redefinirla). Tests.
2. **Phase B-2 (1h):** Frontend Analíticas — actualizar `FinanzasTab.vue`: card nueva "Deuda al hoy" con link cruzado, eliminar card "Tasa de cobro". Subtítulo de la página clarificado.
3. **Phase B-3 (1h):** Frontend Reportes — subtítulo clarificado.
4. **Phase B-4 (1-2h):** Mover Programas — verificar si existe ya `/programas`; mover los 3 cards al final de esa página o crear sección "Resumen" en su top.
5. **Phase B-5 (30min):** Release note al owner explicando que el número de deuda en Analíticas ahora coincide con Deudas en Reportes, y que era inconsistente antes (transparencia).

Total: ~5h Claude bien aprovechadas. Cero ruido en tests existentes salvo los del cálculo de deuda (que estaban midiendo lo viejo y son los que queremos cambiar).

---

## Apéndice — Notas de descubrimiento

- **Bug menor latente:** `analytics/service.ts::getNoShowRate` filtra `bookings.status IN ('confirmed','no_show')`, pero el resto del codebase parece usar `'confirmado'` (español). Validar antes de tocar Finanzas — si el chart "Tasa de no-show" siempre muestra 0%, esto explica por qué.
- **Tab "Vencimientos" en Reports vs "Atención" en Analytics:** la lógica de la tabla "atención" en MiembrosTab debería derivarse del mismo endpoint `/admin/reports/expiring`, con `daysWindow=7&limit=20`, en vez de tener su propia query. Una segunda DRY-fix opcional para Phase B-extra.
- **Doble fuente de truth para `Programas`:** las cards en AnaliticasPage no usan los filtros globales (country/branch). Esto delata que ese tab vive en la página equivocada. Moverlo es ortogonal pero limpia.
- **`useAnalyticsApi` y `useReportsApi` son completamente independientes.** Si en el futuro se decide unificar (Opción C), el costo de refactor de composables suma al estimado.
- **Phase 109 fue muy prolija con Reports** (todos los métodos consumen el modelo nuevo); fue _casi_ prolija con Analytics (4/5 métodos migrados, sólo `getExpectedRevenue` quedó atrás). El gap es chico y arreglable.
