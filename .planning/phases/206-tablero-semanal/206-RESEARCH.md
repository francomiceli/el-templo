# Phase 206: Tablero semanal de gerencia - Research

**Researched:** 2026-11-03
**Domain:** agregación por sede sobre cálculos existentes (Fastify + Drizzle/MySQL), fotos semanales con un job, pantalla densa en Quasar
**Confidence:** HIGH en la arquitectura y el reuso (todo verificado en el código del worktree); MEDIUM en dos puntos de negocio que hay que confirmar con Franco (ver Open Questions)

> **Cambio de decisión incorporado (Franco, 2026-11-03, vía orquestador):** el margen de congelamiento de Renovaciones (D-09) y Embudo (D-10) pasa de "una semana" a **4 días**. Hay **dos congelamientos por semana W**: el **bloque principal** (Caja, Deuda, Alumnos, "Vencen la semana que viene") se congela en el cierre del domingo (corrida lunes 00:05 AR), y el **bloque tardío** (Renovaciones + Embudo) se congela al terminar el jueves siguiente (corrida viernes 00:05 AR). De lunes a jueves, esos dos bloques de la semana que cerró se ven en vivo con marca "provisorio". Este documento ya está escrito con esa regla.

## Summary

Las cinco fuentes existen y se pueden reusar sin copiar reglas de negocio, pero **ninguna agrupa por sede** y casi todos sus helpers son `private` o funciones de módulo no exportadas. La forma limpia (DRY y sin tocar el comportamiento de las pantallas de origen) es **agregar a cada servicio de origen UN método público nuevo "por sede"**, que reusa sus propios helpers privados desde adentro de la clase: `ReportsService.getTrialSessionTalliesByBranch` y `ReportsService.getDebtTotalsByMemberBranch`, `RenewalsService.computeKpisByMemberBranch`, `TransactionService.getIncomeByMemberBranch` y `AnalyticsService.countActivePayingMembersByBranch`. Cada uno hace una sola pasada sobre el tenant (sin N llamadas por sede) y devuelve un mapa `branchId → números`. El módulo nuevo `weekly-board` solo orquesta: arma columnas, fotos, totales y comparaciones.

La diferencia entre `subscriptions.branch_id` y `users.branch_id` (D-12) es chica en la práctica pero real: el job `reassign-multibranch` y la edición admin sincronizan la sede de las subs **vivas**, no las vencidas. Por eso, para Renovaciones y Deuda, agrupar por `users.branch_id` requiere sumar esa columna al SELECT (con `users` ya joineado) y agrupar en JS, no cambiar el filtro de la pantalla de origen. Hay un hallazgo que corrige a la CONTEXT: **los alumnos online viven en la sede virtual** (`subscriptions/service.ts:2233-2237`, "online_* categories live on the virtual branch by design"), así que con D-15 (virtuales fuera de las columnas) el Total AR **no** va a coincidir con el total de Caja AR: le falta lo de Online. D-14 dice que los totales del país coinciden, y eso solo es cierto si se excluye Online de los dos lados.

Las fotos van en una tabla con columnas tipadas por métrica, guardando **conteos crudos** (no porcentajes) para poder recalcular los % del Total sin promediar porcentajes. Los leads van en su propia tabla y **no se congelan con la foto**, porque Nacho los carga en la reunión del lunes, justo después del cierre (ver Open Question 1, que contradice al mensaje del orquestador). El job corre **cada hora al minuto 5 (hora AR)** y cierra "lo que esté vencido y falte": así cubre el lunes 00:05 y el viernes 00:05 con una sola regla, y se recupera solo si un deploy o un reinicio le hace perder la corrida exacta.

**Recomendación principal:** un método "por sede" por servicio de origen + un servicio `weekly-board` que lee la foto si existe y si no calcula en vivo + una tabla de fotos con dos sellos (`main_closed_at`, `late_closed_at`) + una tabla de leads + un job horario idempotente. Toda la matemática (totales, % y sus deltas) va en el API, donde la cubren los tests de integración. La UI solo dibuja.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Cálculo de cada métrica (embudo, renovaciones, cobrado, deuda, activos) | API (servicios de origen) | Database | Las reglas viven en `reports`/`renewals`/`finance`/`analytics`; el Tablero solo las llama |
| Armado de la matriz, totales por país, % y deltas | API (`modules/weekly-board`) | — | Testeable en integración; los tests del admin no corren en CI |
| Alcance por rol/sede/país | API (`attachCountryScope` + `listBranchesForScope`) | Admin (solo oculta nav) | El gate real es el API (patrón del repo) |
| Fotos semanales congeladas | Database (tabla nueva) + job API | — | Persistencia + cron `node-cron` con barrido por tenant |
| Leads manuales | API (PUT) + Database | Admin (celda editable) | Escritura con `requireBranchAccess` |
| Selector de semana, render de la tabla, ▲▼ | Browser (Quasar) | — | Presentación pura |
| Menú y landing | Browser (`templo-config.ts`, `routes.ts`) | — | Configuración del admin |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Ubicación y acceso
- **D-01:** Sección propia `/tablero`, primera entrada del menú para owner, admin y gestion. Nada de pestaña dentro de Reportes ni dentro de Oficina (fase 205).
- **D-02:** admin_sede ve el mismo Tablero con una sola columna, la de su sede (forzado server-side con el mismo mecanismo de alcance por sede que ya usan Reportes/Caja: `enforceBranchScope` / `enforcedBranchIds`). Sin Total ni otras sedes.
- **D-03:** Landing: owner y admin aterrizan en `/tablero` (hoy `/alumnos`). **gestion sigue aterrizando en `/cobros`** (lo usa para cobrar todo el día) y admin_sede sigue en `/caja`. ⚠️ Decidido por el orquestador, revisar con Franco.

#### Leads (Kommo)
- **D-04:** Leads = **carga manual** por sede y por semana, editable desde el mismo Tablero (celda editable en la fila "Leads"). Lo cargan owner/admin/gestion; admin_sede solo la de su sede. Sin integración con Kommo. Cuando los leads vivan en el admin (proyecto aparte), el número pasa a contarse solo.
- **D-05:** Sin leads cargados, la celda muestra "—" y % Reserva también "—" (no 0 %).

#### Semanas y cierre
- **D-06:** Semana = lunes a domingo en hora de Argentina. Usar el mismo helper de semanas que Renovaciones y Sesiones de prueba (`getWeekRange`, `el-templo-admin/src/utils/renewals-week.ts`), NO las semanas ISO de Analíticas.
- **D-07:** Selector de semana: por defecto la semana en curso, con semanas anteriores.
- **D-08:** **Cierre automático** el domingo a la noche (job; correrlo el lunes 00:05 AR cubre el domingo entero). El cierre guarda una **foto por sede** de la semana que terminó. Las semanas cerradas se leen de la foto y no cambian más. La semana en curso se calcula en vivo.
- **D-09:** **Margen de renovación tardía:** el bloque Renovaciones de una semana se congela recién en el cierre siguiente (una semana después). Dato de prod (2026-11-03, n=1812 vencimientos): de los que vuelven dentro de 90 días, el 85 % ya volvió al día 5, el 88 % al 7, el 91 % al 14. Con el margen, el vencimiento de un domingo tiene 7 días y el de un lunes 13. Mientras no está congelado, el bloque se ve en vivo con una marca de "provisorio".
  - **ENMIENDA (Franco, 2026-11-03, vía orquestador):** el margen pasa a **4 días**. Los bloques Renovaciones y Embudo de la semana W se congelan al terminar el jueves siguiente (corrida viernes 00:05 AR). Lo que vence el domingo tiene hasta el jueves. Diferencia aceptada: la regla "renovó" usa ventana de 5 días, así que la foto del jueves puede no contar como "renovó" a quien vence el domingo y renueva el viernes (día 5).
- **D-10:** El bloque Embudo tiene el mismo problema ("Compraron" = de las pruebas de la semana, cuántas terminaron en compra, aunque compren días después), así que **se congela con el mismo margen que Renovaciones**. ⚠️ Decidido por el orquestador (Nacho solo pidió margen para renovaciones), revisar con Franco. (Con la enmienda: mismo margen de 4 días.)
- **D-11:** Semanas pasadas sin foto (todas las anteriores al deploy): Embudo, Renovaciones y Cobrado se calculan en vivo (las APIs de origen aceptan rango de fechas); Alumnos activos y Deuda muestran "—" porque no hay historia ni forma de pedirlos "a tal fecha". No reconstruir historia en esta fase.

#### Sede de cada número (Nacho, punto 4)
- **D-12:** Regla general: **la sede asignada del alumno** (`users.branch_id`). Verificado: es la "sede asignada por asistencia" que pidió Nacho. El job mensual `jobs/reassign-multibranch.ts` la recalcula para los planes multisucursal según dónde más asistió; en planes de una sede, es la sede del plan. Se usa para Cobrado, Renovaciones, Deuda (incluidas las deudas sueltas sin membresía, punto 5) y Alumnos activos.
- **D-13:** Excepción, el **Embudo**: cuenta en la sede de la clase de prueba (en la práctica, la primera sede donde quedó radicada la persona). Es la misma regla que ya usa Sesiones de prueba.
- **D-14:** Consecuencia aceptada: **Cobrado por sede no coincide con Caja por sede** (Caja usa la sede del cobro: un alumno de una sede que paga en otra cuenta distinto). Los totales del país sí coinciden. La pantalla lo aclara con una nota corta en la fila.
- **D-15:** Las columnas son las sedes **activas y no virtuales** del tenant (`branches.is_active`, `branches.is_virtual`), con los nombres de la app. **Nunca hardcodear sedes ni cantidad de sedes.** Las sedes virtuales (Online) quedan afuera de las columnas.

#### Moneda (Nacho, punto 3)
- **D-16:** El **Total** suma solo las sedes de Argentina, en pesos. Las sedes de otros países (hoy Barcelona) van en un grupo aparte, en su moneda (euros), sin convertir. Resolver país/moneda desde `branches.country`, no por nombre de sede.

#### Métricas (reusar los cálculos que ya existen)
- **D-17 Embudo:** Reservas, Asistieron y Compraron = `computeTrialSessionKpis` de Reportes › Sesiones de prueba, con el rango de la semana y por sede de la clase. % Reserva = reservas / leads, % Asistencia = asistieron / reservas, % Cierre = compraron / asistieron, % Conversión total = compraron / reservas. Se descarta el embudo de Analíticas (solo gente nueva con 21 días).
- **D-18 Renovaciones:** Vencimientos, Renovaron, No renueva, Volvió tarde y Sin contactar = `computeKpis` de Reportes › Renovaciones (ventana de 5 días, tipo de actividad "membresía", el mismo default de esa pantalla). % Renovación = renovó / (renovó + no renueva + volvió tarde), la misma fórmula. "Sin contactar" en rojo si > 0. **Vencen la semana que viene** = Vencimientos del rango de la semana siguiente.
- **D-19 Caja:** Cobrado en la semana = la misma definición de "plata firme" de Caja (ingresos no anulados, validados, sin `cash_transfer` ni `expense`; `buildRevenueConditions` / `firmMoneyConditions`), agrupado por sede del alumno (D-12) y por moneda.
- **D-20 Deuda:** Deuda cobrable, Deuda de más de 10 días (tramos 11-15 + 15+) e Incobrable = la misma lógica de Deudas › Por deuda (`getOutstandingBalances`: `computeBucketOB`, estado `effectiveDebtStatusSQL`), agrupada por sede del alumno. Es la foto del momento: en la semana en curso, la de hoy; en las cerradas, la del cierre.
- **D-21 Alumnos:** Alumnos activos = la misma definición de Analíticas (`activePayingNonEspecialMemberExists`), por sede del alumno. Variación = activos de la semana − activos de la foto de la semana anterior.
- **D-22 Comparación:** cada celda muestra a su lado la semana anterior de esa misma sede con ▲▼. Además, las columnas Total, Semana anterior (Total de la semana previa) y ▲▼, igual que la planilla. El ▲▼ de los porcentajes es en puntos porcentuales.
- **D-23 Coincidencia:** para la misma semana y sede, cada número coincide con su pantalla de origen, con dos excepciones documentadas: Cobrado por sede (D-14) y las semanas congeladas (D-08/D-09), que pueden diferir de lo que hoy muestran las pantallas en vivo.

### Claude's Discretion
- Forma del almacenamiento (una tabla de fotos por semana/sede con columnas por métrica vs. JSON), nombres de tablas y del módulo API (sugerido `weekly-board` o `tablero`).
- Si el endpoint arma todas las sedes en una sola llamada con queries agrupadas por sede (preferido: evitar N llamadas por sede y N+1) o reusa los servicios por sede.
- Diseño visual dentro de la paleta de la marca (cálida, sin azul), tabla densa tipo planilla, filas agrupadas por bloque. Español rioplatense en la UI.
- Cómo marcar "provisorio" y "sin foto".

### Deferred Ideas (OUT OF SCOPE)
- Salir de Kommo: leads, bandeja de WhatsApp/IG, plantillas, embudo por etapas y recordatorios dentro del admin. Proyecto aparte.
- Fase 2 mensual: mix de planes y ocupación por franja.
- Reconstruir la historia de alumnos activos y deuda para semanas anteriores al deploy.
- Metas por sede para medir el desvío contra objetivo (Nacho eligió solo contra la semana anterior).
- (También fuera según CONTEXT §Phase Boundary: columna "qué hacemos", exportar a Excel, tocar los cálculos o pantallas de origen salvo extraer helpers sin cambiar su comportamiento.)
</user_constraints>

<phase_requirements>
## Phase Requirements

Sin IDs formales. Se mapean los criterios de éxito 1-8 del ROADMAP (Phase 206) y las D-xx.

| ID | Descripción | Qué lo habilita en esta investigación |
|----|-------------|----------------------------------------|
| SC-1 | `/tablero` en el menú para owner/admin/gestion (inicio de owner/admin); admin_sede ve solo su columna | §Admin: NAV_MODEL, `landingForRole`; §Alcance: `listBranchesForScope` + `CAJA_ROLES` (D-01..D-03) |
| SC-2 | Selector de semana lunes-domingo AR, default en curso | §Semanas: `getWeekRange` admin + `mondayOf(todayInTz(AR))` en el API (D-06, D-07) |
| SC-3 | Columnas por sede AR + Total AR en pesos + Semana anterior + ▲▼; Barcelona aparte en euros | §Columnas y moneda (D-15, D-16, D-22) |
| SC-4 | Bloques Embudo, Renovaciones, Caja, Alumnos | §Métricas, un método "por sede" por fuente (D-17..D-21) |
| SC-5 | Coinciden con las pantallas de origen | Reuso de helpers privados desde adentro de cada servicio + test de igualdad por sede (D-23) |
| SC-6 | Cierre automático; bloque tardío congelado después del margen | §Job y §Esquema de la foto (D-08..D-11 + enmienda de 4 días) |
| SC-7 | Leads manuales por sede y semana | §Leads: tabla + `PUT` con `requireBranchAccess` (D-04, D-05) |
| SC-8 | Tests: armado por sede, cierre, margen, leads, roles, aislamiento por tenant | §Validation Architecture |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- API: logger Pino (`request.log`, `app.log`, `pino` en jobs). Nunca `console.log`. Frontend: `createLogger()` de `src/utils/logger.ts`.
- Sin `any`. `catch (err: unknown)` + `instanceof Error`.
- Rutas nuevas del API llevan tests de integración en `el-templo-api/test/` (MySQL real, `test/helpers.ts`).
- Schema en `el-templo-api/src/db/schema/`. Migración **escrita a mano** (`db:generate` está roto, skill db-migrations, FA-03). Aplicar con `pnpm db:migrate`. **Nunca `drizzle-kit migrate`.** Sin `db:push` en trabajo commiteado.
- Sin env vars nuevas previstas. Si aparece una, va al `.env.example`.
- Husky + lint-staged (Prettier). Si falla el commit, commit nuevo, no amend.
- Patrones: facade para servicios complejos, Pinia composition (`defineStore` con `setup`), composables con `cleanup()` y sin `onUnmounted` adentro.
- Revisión en plan mode: DRY agresivo, tests de más antes que de menos, "engineered enough", más edge cases, explícito antes que ingenioso.
- Ejecución GSD: planes **secuenciales** (el worktree es compartido), ejecutores sonnet, tests solo en foreground (sin `run_in_background` ni loops con `pgrep`), sin commitear docs en el checkout principal.
- Memoria del usuario: no instalar dependencias sin preguntar (esta fase no necesita ninguna), `git add` por ruta explícita, sin `;` en comentarios SQL, no hardcodear ids de `users` en tests, no correr la suite local (CI), sí typecheck (`pnpm exec tsc --noEmit` en el API y `vue-tsc` local en el admin, porque CI no typechequea los frontends), no bumpear versión en fases GSD, sedes nunca por nombre fijo.

## Standard Stack

No hay dependencias nuevas. Todo sale del stack ya instalado.

### Core (ya en el repo)
| Pieza | Dónde | Para qué |
|-------|-------|----------|
| Fastify + `attachCountryScope` + `requireBranchAccess`/`enforcedBranchIds` | `src/modules/shared/country-scope.ts:132`, `branch-access.ts:259/338` | Auth y alcance |
| Drizzle ORM (mysql2) + `tenantWhere`/`tenantValues`/`forEachActiveTenant` | `src/modules/shared/tenant.ts:149/170/248` | Queries con tenant y barrido por gimnasio |
| `node-cron` con `{ timezone: "America/Argentina/Buenos_Aires" }` | patrón en `src/jobs/reassign-multibranch.ts` (final del archivo) | Job |
| `listBranchesForScope` | `src/modules/shared/branch-list.ts:44` | Columnas visibles por rol (D-02, D-15, D-16) |
| Quasar 2.16 / Vue 3.5 / Pinia 3 | `el-templo-admin/package.json` | UI |
| `q-markup-table` + `q-popup-edit` | ya usados en `OrigenAltasReport.vue:92`, `PorDeudaTab.vue` | Tabla densa y celda editable |

**Installation:** ninguna.

## Package Legitimacy Audit

No aplica: la fase no instala paquetes externos. **Packages removed:** ninguno. **Packages flagged:** ninguno.

## Inventario de las fuentes (con evidencia)

### 1. Embudo: Sesiones de prueba
- `computeTrialSessionKpis(rows)`: función de módulo **no exportada**, `reports/service.ts:196-236`. Cuenta `reservations` (excluye `sessionStatus === "reagendada"`), `attended`, `purchased` (`"ganada"`), y los % usan **solo sesiones cuya clase ya terminó** (`occurred`): `attendanceRate = attended/occurred`, `closeRate = purchasedAttended/attended`, `totalConversionRate = purchasedOccurred/occurred`.
- `getTrialSessionsReport(ctx, filters)`: `reports/service.ts:2191`. Trae todo lo que matchea los filtros de SQL hasta `TRIAL_SESSIONS_FETCH_CAP = 5000` (`:94`), deriva filas (`buildTrialSessionRows`, `:2758`) y saca los KPIs sobre `allRows` (`:2241`).
- La sede es la **de la clase**: `JOIN branches br ON br.id = s.branch_id` (`:2347`), y cada fila trae `branch_id`. Filtros de fecha sobre `b.booking_date` (`:2600-2605`). El filtro de país incluye las virtuales: `(br.country = X OR br.is_virtual = 1)` (`:2593`).
- **Agrupar en una sola pasada:** método público nuevo dentro de `ReportsService`, que llama a `buildTrialSessionsConditions({dateFrom, dateTo})` + `fetchTrialSessionRawRows` + `buildTrialSessionRows` una vez para todo el tenant, agrupa `allRows` por `branchId` y cuenta cada grupo. Sin N llamadas.
- **Extracción necesaria (sin cambio de comportamiento):** para recalcular los % del Total y de la semana anterior hacen falta los conteos crudos (`occurred`, `purchasedOccurred`, `purchasedAttended`), que `TrialSessionKpis` no expone (`reports/types.ts:389-404`). Hay que partir `computeTrialSessionKpis` en `tallyTrialSessions(rows) → TrialSessionTally` (exportada) + `kpisFromTally(tally) → TrialSessionKpis`. `computeTrialSessionKpis` queda como `kpisFromTally(tallyTrialSessions(rows))`. El endpoint de origen sigue devolviendo exactamente lo mismo.
- ⚠️ **Fórmulas de D-17 vs la pantalla de origen:** D-17 escribe "% Asistencia = asistieron / reservas" y "% Cierre = compraron / asistieron", pero la pantalla de origen usa `occurred` como denominador y `purchasedAttended` como numerador del cierre. Como D-23 exige coincidencia con la pantalla, **usar las fórmulas de `computeTrialSessionKpis` tal cual** (vía `kpisFromTally`). En una semana cerrada, `occurred == reservations`, así que % Asistencia queda igual. La única que difiere en la práctica es % Cierre (compraron sin asistir no cuentan). % Reserva = reservas / leads es la única fórmula nueva.

### 2. Renovaciones
- `RENEWAL_FOLLOWUP_WINDOW_DAYS = 5` (`renewals/service.ts:82`). `computeKpis(rows)` (`:328-394`, no exportada): `total`, `renovo`, `volvioTarde`, `noRenovo`, `sinContactar` (en_proceso con 0 mensajes), `renewalRate = renovo/(renovo+noRenovo+volvioTarde)`.
- `listRenewals` (`:411`) → `fetchExpiringRows` (`:458`) → `fetchNextSubCandidates` (`:573`) → `deriveRow` (`:245`). El rango tiene un tope de 93 días (`RENEWAL_MAX_RANGE_DAYS`, `:109`) que solo aplica `listRenewals`.
- **Filtra y agrupa por `subscriptions.branch_id`** (`:472-474`, `:496`). `users` ya está joineado (`:517-523`), así que sumar `memberBranchId: schema.users.branchId` al SELECT no cambia nada de lo que ve la pantalla (es un campo interno de `ExpiringRow`, `:142-167`, que `deriveRow` no copia).
- "renovó" depende de `nextSub.startDate <= end+5` **o** `registeredOn <= end+5` (`:262-271`). No depende de "hoy", así que una foto es reproducible.
- **Método nuevo:** `RenewalsService.computeKpisByMemberBranch(ctx, { dateFrom, dateTo, activityType: "membresia" })`. Hace `fetchExpiringRows` sin `branchId`/`country`, `fetchNextSubCandidates`, `deriveRow(e, next, null, WINDOW)` (sin `fetchLastNotes`: los KPIs no lo usan) y después agrupa por `e.memberBranchId` (alinear por índice `eRows[i] ↔ rows[i]`) y corre `computeKpis` por grupo.
- **Rango combinado:** el endpoint necesita W, W-1 y W+1 (para "Vencen la semana que viene"). Conviene **un solo fetch** de `[W-1 lunes, W+1 domingo]` (21 días) y repartir las filas por semana según `endDate` en JS.
- **`subscriptions.branch_id` vs `users.branch_id`:** `reassign-multibranch.ts` (cabecera, líneas 1-24) reasigna `users.branch_id` de los planes multisucursal y "sincroniza subscriptions.branch_id de las subs vivas". Las subs **vencidas** (que es justo lo que mira Renovaciones: `EXPIRING_STATUSES = active/paused/expired/completed`, `:127`) conservan la sede vieja. En planes de una sede, las dos columnas coinciden. Conclusión: la diferencia se limita a multisucursal y a cambios de sede posteriores al vencimiento. Es chica, pero existe, y por eso el Renovaciones del Tablero por sede puede diferir algunas filas de la pantalla Renovaciones filtrada por sede. **Es una tercera excepción de D-23** que hay que documentar (o aceptar como consecuencia de D-12).

### 3. Caja: Cobrado
- `buildRevenueConditions(ctx, filters)` (`finance/transaction-service.ts:2488-2529`, private): tenant + `direction='inflow'` + `firmMoneyConditions()` (`finance/firm-money.ts:31`) + `kind NOT IN ('cash_transfer','expense')` + rango sobre `transaction_date`.
- `getIncomeByBranch` (`:2667`) agrupa por `financial_transactions.branch_id` (sede del cobro) y moneda, con `INNER JOIN branches` sobre `ft.branch_id`.
- **Método nuevo:** `TransactionService.getIncomeByMemberBranch(ctx, { dateFrom, dateTo })`, con las mismas `conds` y el mismo `INNER JOIN branches` (así el universo es idéntico al de Caja), más un `LEFT JOIN users ON users.id = ft.member_id` con `tenantWhere(users)` **en el ON**. `GROUP BY users.branch_id, ft.branch_id, ft.currency` con **columnas planas** en el select, y en JS `memberBranchId ?? cobroBranchId`.
  - ⚠️ No usar `sql\`COALESCE(${users.branchId}, ${ft.branchId})\`` dentro de `.select()`: Drizzle lo renderiza sin calificar → `` `branch_id` `` ambiguo → 500 (FA-01).
  - ⚠️ No joinear `transaction_links`: es la causa del doble conteo que arregló `42cce5f9b` en origin/master ("un pago de deuda que cancela deudas de dos suscripciones tiene dos transaction_links"). Agrupar sobre `financial_transactions` directo.
  - `member_id` es nullable (`schema/financial-transactions.ts:32`). Ingreso sin alumno → cae en la sede del cobro (fallback). [ASSUMED: regla razonable, no la pidió Nacho]

### 4. Deuda
- `getOutstandingBalances` (`reports/service.ts:1476-1669`). Universo: `balances` + LEFT JOIN `subscriptions`/`plans`/`branches`/`users`/`debt_management`. Para no-owner, el país filtra por `branches.country` de la **sub**, así que las `debt_balance` (sin sub) quedan afuera (`:1459-1464`).
- **Cobrable** = `statusTotals.cobrable[cur]`: `amount > 0` y estado efectivo `'activa'` (`:1621-1666`). **Incobrable** = `statusTotals.incobrable[cur]`. **Más de 10 días** = `bucketTotals['11-15'] + ['15+']` sobre el set default `status='activa'` (`PorDeudaTab.vue:461` default `status: 'activa'`; buckets en `:409-414`).
- Edad: `computeAgeInDaysOB(debtCreationDateOB(balances.createdAt))` (`:291-309`), bucket `computeBucketOB` (`:312-317`). Ojo: la edad usa `new Date(); setHours(0)` en **hora del servidor** y `createdAt.toISOString().slice(0,10)` (UTC). Para coincidir con la pantalla hay que reusar esas mismas funciones, no reescribirlas.
- **Método nuevo:** `ReportsService.getDebtTotalsByMemberBranch(ctx)`. Usa `buildOutstandingScope(ctx).tenantFilter` como primer término del WHERE, `LEFT JOIN users ON users.id = balances.member_id` (tenant en el ON), `LEFT JOIN debt_management` (tenant en el ON, `:1351-1357`) y `amount > 0`. Proyecta `amount`, `currency`, `createdAt`, `dmStatus` (columna plana) y `users.branchId`. En JS: `status = dmStatus ?? 'activa'` (el mismo fallback de `:1434`), bucket con `computeBucketOB(computeAgeInDaysOB(debtCreationDateOB(createdAt)))`, y se acumula por `(memberBranchId, currency)`. Así entran las deudas sueltas en la sede del alumno (D-12, punto 5 de Nacho).
- Para no dejar dos fuentes de la regla "estado efectivo", el plan puede extraer `effectiveDebtStatus(dmStatus: string | null)` en JS al lado de `effectiveDebtStatusSQL` y usarlo en `:1434` y en el método nuevo.

### 5. Alumnos activos
- `countActiveMembersBreakdown` (`analytics/service.ts:305-363`, private): `paying = COUNT(*) FROM users INNER JOIN branches ON branches.id = users.branch_id WHERE tenant AND role='member' AND activePayingNonEspecialMemberExists(users.id, ctx)`. Es el número del KPI (`:261-264`).
- `activePayingNonEspecialMemberExists` (`shared/active-member.ts`), apoyado en `membershipInEffectSql` (`shared/membership.ts:57-63`), usa `CURDATE()` (zona horaria del **servidor MySQL**).
- **Método nuevo:** `AnalyticsService.countActivePayingMembersByBranch(ctx)` con la misma condición y `GROUP BY users.branch_id` (columna plana, segura: el comentario de `:312-315` advierte contra GROUP BY sobre un CASE con subqueries, no contra GROUP BY por columna). El EXISTS va en `.where()`, donde Drizzle califica bien.

### 6. Helpers compartidos que faltan (crear una sola vez)
- **Moneda por país:** no hay helper compartido. Hoy está copiado en `referral-partners/service.ts:1382`, `subscriptions/service.ts:1122`, `finance/coach-load-routes.ts:1242`. Crear `shared/currency.ts` con `currencyForCountry(country): "ARS" | "EUR"` (`"ES" → EUR`, resto → ARS). Migrar las copias es opcional y queda fuera del alcance mínimo (se puede anotar como deuda).
- **Semana del Tablero en el API:** `mondayOf` (`shared/week-dates.ts:96`) + `addDays` (`shared/date-utils.ts:15`) + `todayInTz` (`date-utils.ts:155`). Crear `modules/weekly-board/week.ts` con `BOARD_TZ = "America/Argentina/Buenos_Aires"` (espejo de `RENEWALS_TZ`, admin `utils/renewals-week.ts:13`), `currentWeekStart(now)`, `weekRange(weekStart)` y las funciones puras de cierre (ver §Job).

## Architecture Patterns

### System Architecture Diagram

```
 Admin /tablero (TableroPage)                          node-cron  "5 * * * *" (AR)
   │ GET /api/admin/weekly-board?weekStart=YYYY-MM-DD      │
   │ PUT /api/admin/weekly-board/leads                     ▼
   ▼                                              jobs/weekly-board-close.ts
 authenticate → CAJA_ROLES → attachCountryScope        │ forEachActiveTenant(ctx)
   │                                                   │ dueClosures(todayAR) ── puro
   ▼                                                   ▼
 WeeklyBoardService.getBoard(ctx, scope, weekStart)   WeeklyBoardService.closeDue(ctx, now)
   │ 1. columnas = listBranchesForScope(scope) ∖ virtuales     │ calcula con el MISMO
   │ 2. por semana W y W-1:                                    │ BoardCalculator y escribe
   │      ¿foto con main_closed_at / late_closed_at?           │ weekly_board_snapshots
   │        sí → lee la foto                                   │ (INSERT faltantes / UPDATE
   │        no → BoardCalculator.live(ctx, rango) ─────┐       │  bloque tardío IS NULL)
   │ 3. leads = weekly_board_leads (W y W-1)           │       │
   │ 4. grupos por país (AR/ES), Total por grupo,      │       │
   │    % desde conteos sumados, flags provisorio/     │       │
   │    sin foto/en curso                              │       │
   ▼                                                   ▼       ▼
 JSON matriz ──► UI dibuja      BoardCalculator (una pasada por fuente, todo el tenant)
                                 ├─ ReportsService.getTrialSessionTalliesByBranch   (sede de la clase)
                                 ├─ RenewalsService.computeKpisByMemberBranch       (users.branch_id)
                                 ├─ TransactionService.getIncomeByMemberBranch       (users.branch_id ?? sede del cobro)
                                 ├─ ReportsService.getDebtTotalsByMemberBranch       (users.branch_id, foto de "ahora")
                                 └─ AnalyticsService.countActivePayingMembersByBranch(users.branch_id, foto de "ahora")
```

### Recommended Project Structure
```
el-templo-api/src/
├── db/schema/weekly-board.ts           # weekly_board_snapshots + weekly_board_leads
├── db/migrations/0319_weekly_board.sql # a mano (confirmar número al planificar)
├── modules/weekly-board/
│   ├── index.ts / routes.ts / schemas.ts / types.ts
│   ├── week.ts                         # BOARD_TZ, semanas, dueClosures (puro)
│   ├── calculator.ts                   # BoardCalculator: llama a los 5 métodos "por sede"
│   └── service.ts                      # WeeklyBoardService (facade): getBoard, upsertLeads, closeDue
├── modules/shared/currency.ts          # currencyForCountry
└── jobs/weekly-board-close.ts
el-templo-admin/src/
├── pages/TableroPage.vue
├── components/tablero/ (TableroMatrix.vue, TableroWeekSelector.vue, TableroCell.vue)
├── composables/useWeeklyBoardApi.ts
├── types/weekly-board.ts
└── utils/weekly-board-format.ts        # delta ▲▼, formato de % y moneda (puro)
```

### Pattern 1: método "por sede" dentro del servicio de origen (DRY sin abrir helpers privados)
**Qué:** cada servicio de origen suma UN método público que reusa sus helpers privados y devuelve `Map<branchId, …>`.
**Por qué:** los helpers (`buildRevenueConditions`, `fetchExpiringRows`, `buildOutstandingScope`, `computeKpis`, `computeTrialSessionKpis`) son privados o de módulo. Exportarlos sueltos dispersa la regla. Un método por sede mantiene la regla en su archivo y el test de coincidencia la protege.
```ts
// renewals/service.ts (esquema; dentro de RenewalsService)
async computeKpisByMemberBranch(
  ctx: TenantContext,
  range: { dateFrom: string; dateTo: string },
): Promise<Map<number, RenewalKpis>> {
  const eRows = await this.fetchExpiringRows(ctx, { ...range, activityType: "membresia" });
  if (eRows.length === 0) return new Map();
  const candidates = await this.fetchNextSubCandidates(ctx, [...new Set(eRows.map((r) => r.userId))]);
  const byBranch = new Map<number, RenewalRow[]>();
  eRows.forEach((e) => {
    const row = deriveRow(e, pickNextSubscription(candidates, e), null, RENEWAL_FOLLOWUP_WINDOW_DAYS);
    const key = e.memberBranchId; // nuevo campo del SELECT: schema.users.branchId
    byBranch.set(key, [...(byBranch.get(key) ?? []), row]);
  });
  return new Map([...byBranch].map(([b, rows]) => [b, computeKpis(rows)]));
}
```
(El nombre del filtro `activityType` y la forma de `RenewalListFilters` hay que confirmarlos en `renewals/types.ts`. `fetchExpiringRows` hoy pide `RenewalListFilters` completo.)

### Pattern 2: foto con dos sellos y lectura "foto si hay, si no en vivo"
- El **read path decide por la presencia de la foto** (`main_closed_at` / `late_closed_at` NOT NULL), **no por la fecha**. La fecha solo elige la etiqueta cuando falta la foto ("en curso" / "provisorio" / "sin foto"). Así el GET es determinista en tests: se siembra una foto y se verifica que gana sobre los datos vivos.
- Estados por bloque y semana W, con T = hoy AR:
  - W = semana en curso → todo en vivo, etiqueta "en curso".
  - W = semana pasada: bloque principal desde la foto (desde el lunes 00:05). Bloque tardío: si hay `late_closed_at` → foto; si no y T < viernes de W+1 → en vivo + "provisorio".
  - W más vieja sin foto → D-11: Embudo, Renovaciones, Cobrado y "Vencen la semana que viene" en vivo con marca "sin foto"; Deuda y Activos "—".
- **Variación de activos** = activos(W) − activos(foto W-1). Si W-1 no tiene foto → "—".

### Pattern 3: alcance por rol con la fuente canónica de sedes
- `listBranchesForScope(db, request.scope, request.query.country, "weekly-board")` (`shared/branch-list.ts:44-90`) ya resuelve owner (todas, o por `?country=`), admin/gestion (su país + virtuales), admin_sede (`user_branches`, **sin** virtuales). El Tablero filtra `!isVirtual`. Así se cumplen D-02, D-15 y D-16 sin escribir reglas nuevas.
- Defensa en profundidad para admin_sede: filtrar también los mapas por sede de los cálculos con `enforcedBranchIds(scope)` (`branch-access.ts:338`). Con `country === null` en un no-owner, responder 403 (patrón WR-05 de `reports/routes.ts:372-382`).
- No usar `enforceBranchScope` en el GET: ese preHandler inyecta un único `branchId` en la query y está pensado para endpoints de una sede. El Tablero es multi-columna; el alcance sale de la lista de sedes. Sí usar `requireBranchAccess({ from: "body.branchId" })` en el `PUT` de leads (`branch-access.ts:259`).
- ⚠️ **Owner sin toggle:** en el resto de los reportes, el owner sin `?country=` queda en el país de su sede (`country-scope.ts:220-229`) y `request.scope.country` vale "AR". El Tablero **no** tiene que pasarle `scope.country` a los cálculos: para el owner, los métodos "por sede" corren tenant-wide y la lista de columnas trae AR + ES (D-16). Para admin/gestion, las columnas se limitan a su país, y entonces un admin AR **no ve el grupo Barcelona** (ver Open Question 2).

### Anti-Patterns to Avoid
- **Llamar `listRenewals`/`getTrialSessionsReport`/`getOutstandingBalances` una vez por sede:** N×(4-6 queries) y además Renovaciones y Deuda filtran por la sede de la sub, no la del alumno.
- **Promediar porcentajes para el Total:** recalcular desde los conteos sumados (por eso la foto guarda conteos crudos).
- **Fragmentos `sql` con columnas interpoladas dentro de `.select()` en queries con JOIN** (FA-01): proyectar columnas planas y combinar en JS.
- **Pasar `scope.country` del owner** a los cálculos del Tablero (escondería Barcelona).
- **Decidir "congelado" por fecha en el read path:** hace que el GET dependa del día de la semana en que corre CI.
- **`affectedRows` para saber si se insertó la foto** (FOUND_ROWS, memoria `reference_mysql2_found_rows`): usar `INSERT … ON DUPLICATE KEY UPDATE` con la regla en el SQL (`late_closed_at = COALESCE(late_closed_at, VALUES(late_closed_at))`) o un `UPDATE … WHERE late_closed_at IS NULL`, y releer.

## Esquema propuesto (Claude's Discretion: columnas tipadas, no JSON)

**Por qué columnas y no JSON:** tipos fuertes en Drizzle, `mysqlEnum`/JSON sin ambigüedades, se pueden consultar y son baratas. El costo de agregar una métrica después (ALTER ADD COLUMN) es bajo y explícito.

### `weekly_board_snapshots` (gym-owned, nace strict)
| Columna | Tipo | Bloque | Nota |
|---------|------|--------|------|
| `id` | int PK AI | — | |
| `tenant_id` | int NOT NULL DEFAULT 1 FK tenants | — | `tenantIdColumn()` |
| `week_start` | date NOT NULL | — | lunes AR |
| `branch_id` | int NOT NULL FK branches | — | |
| `currency` | varchar(3) NOT NULL | — | moneda de la sede al cierre (`currencyForCountry`) |
| `cobrado` | bigint NULL | principal | en `currency`. bigint por inflación (`amount` es int en origen) |
| `deuda_cobrable`, `deuda_mas_10`, `deuda_incobrable` | bigint NULL | principal | en `currency` |
| `activos` | int NULL | principal | |
| `vencen_semana_siguiente` | int NULL | principal | Vencimientos de W+1 al cierre |
| `main_closed_at` | timestamp NULL | principal | sello |
| `reservas`, `reservas_ocurridas`, `asistieron`, `compraron`, `compraron_ocurridas`, `compraron_asistieron` | int NULL | tardío | conteos crudos (`TrialSessionTally`) |
| `vencimientos`, `renovaron`, `no_renueva`, `volvio_tarde`, `sin_contactar` | int NULL | tardío | `computeKpis` |
| `late_closed_at` | timestamp NULL | tardío | sello |
| `created_at`, `updated_at` | timestamp | — | |
| **UNIQUE** `uq_weekly_board_snapshots_tenant_week_branch` (`tenant_id`, `week_start`, `branch_id`) | | | todo UNIQUE empieza por `tenant_id` (con-01 / 0196) |

- Una fila por sede **activa y física** al cierre, aunque esté todo en 0 (así se distingue "0" de "sin foto").
- Montos en otras monedas para la misma sede (por ejemplo, un alumno AR que pagó en EUR): no se guardan en la foto, se loguean con `log.warn`. En vivo, la API los devuelve en un mapa aparte (`otherCurrencies`) para que la celda muestre una marca. [ASSUMED: caso raro, confirmar si alcanza]
- Leads **no** van en la foto (ver la tabla siguiente y Open Question 1).

### `weekly_board_leads` (gym-owned, nace strict)
| Columna | Tipo |
|---------|------|
| `id` int PK AI, `tenant_id` (tenantIdColumn), `branch_id` int NOT NULL FK branches, `week_start` date NOT NULL, `leads` int NOT NULL (≥ 0, validado por AJV), `updated_by` int NULL FK users ON DELETE SET NULL, `created_at`, `updated_at` |
| **UNIQUE** (`tenant_id`, `branch_id`, `week_start`) |

- `PUT /api/admin/weekly-board/leads` con body `{ branchId, weekStart, leads: number | null }`. `null` borra la fila → "—" (D-05). Validar que `weekStart` sea lunes, que no sea futuro y que la sede no sea virtual. Ventana editable recomendada: **semana en curso y semana pasada** (o sin límite para owner). Decisión de Franco, ver Open Question 1.
- Upsert con `INSERT … ON DUPLICATE KEY UPDATE leads = VALUES(leads), updated_by = VALUES(updated_by)` y releer la fila (no confiar en `affectedRows`).

### Número de migración
- `origin/master` termina en `0318_deactivate_caja_efectivo_chapadmalal.sql` (verificado con `git ls-tree origin/master`). `feat/oficina` agrega `0316_oficina_temas.sql`. El tren `feat/v6.1-gimnasio` ocupa 0302-0314. **Siguiente libre: `0319_weekly_board.sql`.** Reconfirmar al planificar contra `origin/master`, `origin/staging`, `feat/oficina` y el tren.
- Precedente de estilo: `0316_oficina_temas.sql` en `feat/oficina` (header sin `;` en los comentarios, `--> statement-breakpoint` entre CREATE, FK `fk_<tabla>_tenant`, cero datos).

### Los 5 conteos fijos + 3 gates (números verificados en este worktree, base `origin/master`)
| # | Archivo | Valor hoy | Con +2 tablas |
|---|---------|-----------|---------------|
| 1 | `src/db/tenant-tables.ts` `GYM_OWNED_TABLES` (+ `TENANT_STRICT_MODULES["weekly-board"]`) | — | sumar 2 |
| 2 | `test/db/tenant-tables.test.ts:139/144` (`GYM_OWNED_TABLES.length`, `schemaTables.size`) + título del `it` + `MODULOS_DECLARADOS` | 121 / 126 | 123 / 128 |
| 3 | `test/migrations/0192-0195-tenant-columns.test.ts:191` `gymOwnedChecked` | 121 | 123 |
| 4 | `test/migrations/0196-tenant-unique-contracts.test.ts:649-655` Test 10 (título, mensaje y `toBe`) | 121 | 123 |
| 5 | `test/tenant-manifest.ts` + `test/tenancy/iso-01-manifiesto.test.ts:421` `ENTRADAS_BASELINE` (+ título del `it`) | 542 | 544 (GET + PUT) |
| G2 | `test/tenancy/con-04-crons-per-tenant.test.ts:291` `JOBS_ESPERADOS` + "Test 6 … 11 jobs" + comentarios | 11 | 12 (`weekly-board-close.ts`) |
| G3 | `con-06-lint` / `pnpm --dir el-templo-api lint:tenant`: `tenantWhere`/`tenantValues` en cada statement; **nunca** sumar a la allowlist | — | — |
| + | `test/helpers.ts` `TABLES_TO_CLEAN` (hijas antes que `users`/`branches`) y `test/fixtures/second-tenant.ts` `limpiarSegundoGimnasio` | — | sumar las 2 |

- ISO-03 (gate 4 de la memoria) **no aplica**: `/api/admin/weekly-board` no está entre los 8 prefijos cubiertos. Igual conviene un test de aislamiento propio (SC-8).
- ⚠️ **Conflictos de merge seguros:** `feat/oficina` mueve los mismos números (121→125, 126→130, 542→550, 11→12 jobs; verificado con `git diff origin/master...feat/oficina`) y el tren v6.1 también. Quien mergee segundo tiene que **sumar los deltas**, no elegir un lado. También chocan `NAV_MODEL` (Oficina se agrega primera en "Gestión") y `routes.ts`.

## Job de cierre

### Diseño recomendado
- Archivo `src/jobs/weekly-board-close.ts`. Cron **`"5 * * * *"` con `{ timezone: "America/Argentina/Buenos_Aires" }`**. Cuerpo: `forEachActiveTenant(db, log, "weekly-board-close", ctx => service.closeDue(ctx, now))` y `now` inyectable (patrón `runOfficeAutoTopics(db, now)` de `feat/oficina`).
- **Por qué horario y no dos crons (lun/vie 00:05):** una sola regla ("cerrar lo vencido que falte") cubre los dos congelamientos y se recupera solo si un deploy o un reinicio (PM2, `instances: 1`, `el-templo-api/ecosystem.config.cjs:10`) coincide con las 00:05. El costo de las corridas que no hacen nada es 1 SELECT por tenant. Se explica en una línea, como pide la memoria `feedback_cambios_infra_simples`.
- **`dueClosures(todayAR)` puro** (en `week.ts`, con unit tests sin DB):
  - `lastWeek = addDays(mondayOf(todayAR), -7)`.
  - **Principal:** `lastWeek` si falta `main_closed_at` (cualquier día de la semana en curso). Semanas más viejas no se completan: una foto de deuda/activos tomada tarde mentiría (D-11).
  - **Tardío:** para `W ∈ {lastWeek, lastWeek-7}`, si `todayAR >= addDays(W, 11)` (viernes de W+1) y falta `late_closed_at`. Con la enmienda: W+7 = lunes siguiente, +4 = viernes.
- **Escritura idempotente:** por (tenant, W) se calcula con el MISMO `BoardCalculator` del read path, después:
  - Principal: `INSERT … (cols principal, main_closed_at=NOW()) ON DUPLICATE KEY UPDATE` solo si `main_closed_at IS NULL`. En MySQL: `col = IF(main_closed_at IS NULL, VALUES(col), col)`, con `main_closed_at` actualizado **último** en la lista, porque MySQL evalúa los SET de izquierda a derecha. O dos pasos explícitos: INSERT de las filas que faltan + `UPDATE … WHERE main_closed_at IS NULL`. **Recomendado: dos pasos explícitos** (más legible, y evita la trampa del orden de evaluación).
  - Tardío: `UPDATE … SET … , late_closed_at = NOW() WHERE tenant AND week_start = W AND late_closed_at IS NULL`. Antes, INSERT de las filas de sede que falten (si el principal no corrió).
  - Re-correr no cambia nada (test explícito).
- **"Foto tardía":** si `main_closed_at` cae después del lunes de W+1, la UI lo marca ("foto tomada el …"). Pasa en el primer deploy si sale un miércoles.
- Registrar en `src/index.ts` (`startWeeklyBoardCloseJob(app.db)`), al lado de los demás.

### Semántica temporal de las fotos (documentarla en la UI y en el SUMMARY)
- Foto principal a las **00:05 del lunes**: `CURDATE()` ya es lunes (UTC 03:05 también es lunes), así que un alumno cuya sub vence el **domingo** ya no cuenta como activo, y la edad de la deuda ya sumó un día. Es "la foto al cierre". Aceptable, pero hay que escribirlo.
- Foto tardía del viernes: el **5.º día** de la ventana "renovó" de un vencimiento del domingo es el viernes, que **no** está cubierto. Diferencia aceptada por Franco: la pantalla Renovaciones en vivo puede mostrar después un "renovó" más.
- Barcelona: las fechas (`booking_date`, `end_date`, `transaction_date`) son fechas locales de la sede. Se cortan por fecha, no por instante, así que la semana AR aplica igual. A las 00:05 AR del lunes, en España son las 04:05 del lunes: su domingo ya terminó.

## Semanas y zona horaria
- Admin: `getWeekRange(offset, now)` (`utils/renewals-week.ts:33`) → `getMondayInTz(RENEWALS_TZ)`. Selector: presets "Esta semana" (0) y "Semana pasada" (-1), más una lista de las últimas N semanas (12 recomendado) con etiqueta "Semana del dd/mm al dd/mm". Sincronizar `?semana=YYYY-MM-DD` en la URL (patrón `syncQuery` de `RenovacionesTab.vue:493-503`).
- API: validar `weekStart` (formato + que sea lunes: `mondayOf(weekStart) === weekStart`) y que no sea futuro (`<= currentWeekStart(now)`).
- ⚠️ Tests: `todayStr()`/`dateOffsetStr()` de `test/helpers.ts:86-94` usan **UTC** (`toISOString`). Para cualquier fecha comparada contra la semana AR usar `todayInTz("America/Argentina/Buenos_Aires")` + `addDays` (memoria `reference_test_shifts_utc_vs_tz_sede`: rompen entre las 21 y las 24 AR).

## Columnas, moneda y país (D-15, D-16)
- Columnas = `listBranchesForScope` (`is_active = true`, filtro por rol) ∖ `isVirtual`. Ordenadas por nombre (lo hace la helper). Nombre = `branches.name` corto, como en el resto del admin (`appBranchName` es solo para la app de alumnos, `shared/app-branch-name.ts`).
- Grupos por `branches.country`: un grupo por país presente, cada uno con su Total en `currencyForCountry(country)`. El grupo AR primero. Nunca nombres fijos.
- ⚠️ **Online / sedes virtuales:** los alumnos online tienen `users.branch_id` = sede virtual (`subscriptions/service.ts:2233-2237`, y la auto-migración desde la virtual en `:2709-2721`). Sus cobros, renovaciones, deudas y activos quedan **fuera** de las columnas por D-15, y el Total AR del Tablero da **menos** que Caja AR. Hay que decidirlo (Open Question 3). Default recomendado: respetar D-15 y reemplazar la nota de D-14 por "Total AR = sedes físicas, sin Online".

## Admin (UI)
- **Menú (D-01):** `NAV_MODEL` (`config/templo-config.ts:281`). Hoy la primera categoría es "Entrenamiento" (`templo: true`, ítems `trainingOnly`). Para que Tablero sea "la primera entrada" para owner/admin/gestion, agregar **una categoría nueva al tope** (por ejemplo `header: 'Gerencia'`, ítem `{ path: '/tablero', label: 'Tablero', icon: 'dashboard', roles: TABLERO_ROLES }`, sin `templo`, porque es genérico). Alternativa: primer ítem de "Gestión", pero ahí choca con Oficina (`feat/oficina` agrega Oficina primera de Gestión). Confirmar con Franco (Open Question 5). `isNavCategoryVisible` evita headers vacíos.
- `TABLERO_ROLES: AdminRole[] = ['gestion', 'admin', 'owner', 'admin_sede']` en `templo-config.ts`, espejo del API (`CAJA_ROLES`, `permissions.ts:102-105`: `gestion`, `admin_sede`, `admin`, `owner`). En el API, definir `WEEKLY_BOARD_ROLES = CAJA_ROLES` con docblock.
- **Rutas:** `{ path: 'tablero', component: () => import('pages/TableroPage.vue'), meta: { allowedRoles: TABLERO_ROLES } }`. El guard está en `router/index.ts:56-58`.
- **Landing (D-03):** en `landingForRole` (`router/routes.ts:28-53`), cambiar la rama `DUENO_ROLES → '/alumnos'` por `'/tablero'`. **No mover** la rama del coach con `canAccessTraining` (Fran sigue en `/sessions`). gestion → `/cobros` y admin_sede → `/caja` sin cambios. Actualizar el docblock (`:19-27`).
- **Analogía visual:** `OrigenAltasReport.vue:92-158` (`q-markup-table flat dense`, números a la derecha, tooltips de nota en el `th`). Celda editable de leads: `q-popup-edit` como en `PorDeudaTab.vue`. Composable: patrón `useRenewalsApi.ts` (refs `loading`/`error`, `extractError`, `cleanup()` expuesto, sin `onUnmounted`). No hace falta store de Pinia (estado local de la página, como Renovaciones).
- **Paleta** (memoria `reference_brand_palette`): Marble Cream `#F2EDE5` de fondo, bordes Warm Stone `#D9CFC1`, acento Terracotta `#96593a` (AA sobre cream), texto Deep Charcoal `#3D3732`, captions Olive Stone `#8A8472`. ▲ success `#3b7249`, ▼ error `#b34a4a`. "Sin contactar > 0" en `#b34a4a`. "Provisorio" con chip warning `#7d6520` + tooltip, "Sin foto" con chip info `#6b6459`. **Nada de azul** (no usar `color="primary"` si mapea a azul, ni `blue-*`). El ▲ de "Deuda" e "Incobrable" es malo: definir por métrica si "subir es bueno" (`higherIsBetter`) para colorear bien.
- Formato: `formatPrice(amount, currency)` (`utils/format-price.ts:21`). Los % con 0 decimales y el delta en "pp".
- Recordatorio: CI **no** typechequea el admin (memoria `reference_ci_no_typecheck_frontends`). El ejecutor tiene que correr `vue-tsc` local y `pnpm lint` del admin. Los `src/utils/__tests__` del admin no tienen script de test en `package.json`, así que la lógica testeable va en el API.

## Contrato de respuesta sugerido (GET)
```ts
interface WeeklyBoardResponse {
  weekStart: string; weekEnd: string; previousWeekStart: string;
  isCurrentWeek: boolean;
  groups: Array<{
    country: "AR" | "ES"; currency: "ARS" | "EUR";
    branches: Array<{ id: number; name: string }>;
  }>;
  blocks: {
    // estado por semana y bloque: "en_curso" | "provisorio" | "congelado" | "sin_foto"
    main: { current: BlockState; previous: BlockState; capturedAt: string | null };
    late: { current: BlockState; previous: BlockState; capturedAt: string | null };
  };
  // celdas: por métrica → por branchId y por grupo (total) → { value, previous }
  metrics: Record<WeeklyBoardMetricKey, {
    byBranch: Record<number, { value: number | null; previous: number | null }>;
    totalByCountry: Record<string, { value: number | null; previous: number | null }>;
    unit: "count" | "money" | "pct";
  }>;
  leadsEditable: Record<number, boolean>; // por sede, según rol y ventana
}
```
Los `%` vienen ya calculados desde los conteos (`null` cuando el denominador es 0 o faltan leads). La UI calcula el ▲▼ como `value - previous` con un util puro.

## Don't Hand-Roll

| Problema | No construir | Usar |
|----------|--------------|------|
| Qué sedes ve cada rol | filtros por rol a mano | `listBranchesForScope` (`shared/branch-list.ts:44`) |
| Permiso de escritura por sede | chequeos ad hoc | `requireBranchAccess({ from: "body.branchId" })` |
| "Plata firme" | `voided_at IS NULL AND …` inline | `buildRevenueConditions` / `firmMoneyConditions` (dentro de `TransactionService`) |
| Estado de renovación | otra regla de "renovó" | `deriveRow` + `computeKpis` (dentro de `RenewalsService`) |
| Embudo de prueba | otro conteo de reservas | `fetchTrialSessionRawRows` + `buildTrialSessionRows` + `tallyTrialSessions` |
| Antigüedad/tramo/estado de deuda | DATEDIFF en SQL | `computeAgeInDaysOB`/`debtCreationDateOB`/`computeBucketOB` + `dmStatus ?? 'activa'` |
| Alumno activo | `users.status = 'activo'` | `activePayingNonEspecialMemberExists(users.id, ctx)` |
| Barrido de jobs por tenant | loop propio | `forEachActiveTenant` |
| Lunes de la semana / sumar días | aritmética de Date local | `mondayOf`, `addDays`, `todayInTz` (API); `getWeekRange` (admin) |
| Moneda por país | otro ternario más | `shared/currency.ts` nuevo, una sola vez |

**Key insight:** el valor del Tablero es que "coincide con la pantalla de origen". Cualquier reimplementación (aunque sea "la misma regla") abre una deriva silenciosa que nadie va a notar en la reunión del lunes.

## Runtime State Inventory

No es una fase de rename/migración. Solo agrega tablas y un job. Igual hay estado de runtime a tener en cuenta:
- **Stored data:** nada existente que migrar. Las tablas nacen vacías y la historia previa queda "sin foto" (D-11).
- **Live service config:** ninguno.
- **OS-registered state:** el cron vive dentro del proceso PM2 de la API (prod y staging, cada uno contra su DB). No hay nada que registrar en el SO. Verificado: `ecosystem.config.cjs:10` `instances: 1`, así que no hay doble ejecución.
- **Secrets/env vars:** ninguno nuevo.
- **Build artifacts:** ninguno.

## Common Pitfalls

### Pitfall 1: columnas sin calificar en `.select()` con JOIN (FA-01)
**Qué pasa:** `sql\`COALESCE(${users.branchId}, ${ft.branchId})\`` en `.select()` se renderiza como `` `branch_id` `` desnudo → ambiguo → 500, o una correlación que siempre da FALSE. **Cómo evitarlo:** columnas planas en el select y combinar en JS. Verificar con `query.toSQL().sql` en el test.

### Pitfall 2: doble conteo por `transaction_links`
**Qué pasa:** joinear links repite el cobro (fix `42cce5f9b` en origin/master, Alberti oct-2026: 9.014.000 vs 8.885.500). **Cómo evitarlo:** agregar sobre `financial_transactions` sin links.

### Pitfall 3: `users.branch_id` es actual, no histórico
**Qué pasa:** una semana vieja sin foto calculada en vivo atribuye a la sede **de hoy** del alumno. Un multisucursal reasignado el día 1 "mueve" sus números históricos. **Cómo evitarlo:** es la razón de las fotos. Documentar que "sin foto" puede diferir.

### Pitfall 4: UTC vs AR en tests y en "hoy"
**Qué pasa:** `toISOString().slice(0,10)` da el día siguiente entre las 21 y las 24 AR. **Cómo evitarlo:** `todayInTz(BOARD_TZ)` en el servicio y en los tests. No usar `todayStr()` de helpers para la semana.

### Pitfall 5: fake timers
**Qué pasa:** `vi.setSystemTime` absoluto con `shouldAdvanceTime` retrocede el reloj en runners lentos (memoria `reference_fake_timers_salto_relativo`). **Cómo evitarlo:** no usar fake timers. Inyectar `now: Date` en `closeDue`/`dueClosures` y probar `dueClosures` como función pura.

### Pitfall 6: tests con fechas fijas
**Qué pasa:** una fecha fija conviviendo con ventanas relativas rompe el día menos pensado (memoria `reference_test_arpu_dependiente_del_calendario`). **Cómo evitarlo:** las semanas se derivan de `currentWeekStart(new Date())` (W-1, W-2) y las fixtures de esas semanas con `addDays`. Para `dueClosures`, fechas fijas **sí** sirven: es puro y no lee la DB.

### Pitfall 7: read path dependiente del día de la semana
**Qué pasa:** si "congelado" se decide por fecha, el mismo test da verde de viernes a domingo y rojo de lunes a jueves. **Cómo evitarlo:** el read path decide por presencia de la foto. La fecha solo elige la etiqueta, y el test de etiqueta calcula lo esperado con `dueClosures(todayAR)`.

### Pitfall 8: FOUND_ROWS en la idempotencia
**Qué pasa:** `affectedRows` = 1 en un `ON DUPLICATE KEY UPDATE` que no cambió nada. **Cómo evitarlo:** la regla va en el WHERE (`… IS NULL`) y después se relee. Nunca decidir "ya cerré" por `affectedRows`.

### Pitfall 9: sentinel de tenancy en los tests
**Qué pasa:** las queries directas de un test a tablas strict sin `tenantWhere` fallan con `TenantSentinelError` en CI. **Cómo evitarlo:** `const TEMPLO_CTX = { tenantId: TENANT_TEMPLO }` y `tenantWhere(tabla, TEMPLO_CTX)` en lecturas y updates del test (memoria `reference_gates_tenancy_ruta_job_nueva`).

### Pitfall 10: los conteos fijos de tenancy y su merge
Ver la tabla de los 5 conteos. `tsc` y `lint:tenant` no los detectan: solo rompen en CI con MySQL. Al mergear con `feat/oficina` o con el tren, sumar los deltas.

### Pitfall 11: `TRIAL_SESSIONS_FETCH_CAP = 5000`
Para 14 días de un tenant sobra, pero el método nuevo tiene que hacer el mismo `log.warn` si toca el tope (patrón de `:2204-2212`).

### Pitfall 12: cambio de sede del alumno entre el lunes y el viernes
La foto principal (lunes) y la tardía (viernes) de la misma W pueden atribuir a un alumno a sedes distintas si lo cambiaron en el medio. Raro, pero aceptable: documentarlo.

## Code Examples

### Agregado de deuda por sede del alumno (esquema)
```ts
// reports/service.ts, dentro de ReportsService. Reusa buildOutstandingScope y los helpers *OB.
async getDebtTotalsByMemberBranch(ctx: TenantContext): Promise<Map<number, Map<string, DebtTotals>>> {
  const cols = this.buildOutstandingScope(ctx);
  const rows = await this.db
    .select({
      amount: schema.balances.amount,
      currency: schema.balances.currency,
      createdAt: schema.balances.createdAt,
      dmStatus: schema.debtManagement.status,      // plana: nada de sql`` en el select
      memberBranchId: schema.users.branchId,
    })
    .from(schema.balances)
    .leftJoin(schema.users, and(tenantWhere(schema.users, ctx), eq(schema.users.id, schema.balances.memberId)))
    .leftJoin(schema.debtManagement, and(tenantWhere(schema.debtManagement, ctx), eq(schema.debtManagement.balanceId, schema.balances.id)))
    .where(and(cols.tenantFilter, gt(cols.amount, 0)));
  // JS: status = r.dmStatus ?? "activa"; bucket = computeBucketOB(computeAgeInDaysOB(debtCreationDateOB(r.createdAt)))
  // activa → cobrable (+ mas10 si bucket es '11-15' | '15+'); incobrable → incobrable; cobrada → ignorar
}
```

### Ingreso por sede del alumno (esquema)
```ts
// finance/transaction-service.ts, dentro de TransactionService.
const conds = this.buildRevenueConditions(ctx, { dateFrom, dateTo });
const rows = await this.db
  .select({
    memberBranchId: schema.users.branchId,
    cobroBranchId: schema.financialTransactions.branchId,
    currency: schema.financialTransactions.currency,
    total: sql<number>`COALESCE(SUM(${schema.financialTransactions.amount}), 0)`, // agregado sin columnas ambiguas
  })
  .from(schema.financialTransactions)
  .innerJoin(schema.branches, and(tenantWhere(schema.branches, ctx), eq(schema.branches.id, schema.financialTransactions.branchId)))
  .leftJoin(schema.users, and(tenantWhere(schema.users, ctx), eq(schema.users.id, schema.financialTransactions.memberId)))
  .where(and(...conds))
  .groupBy(schema.users.branchId, schema.financialTransactions.branchId, schema.financialTransactions.currency);
// JS: key = r.memberBranchId ?? r.cobroBranchId
```
(Verificar con `.toSQL()` que `SUM(amount)` sale calificado o sin ambigüedad: `amount` existe en `financial_transactions` y no en `users`/`branches`, así que no colisiona. Igual, revisarlo en el test.)

### Cron del job
```ts
// Source: patrón de src/jobs/reassign-multibranch.ts y office-auto-topics.ts (feat/oficina)
cron.schedule("5 * * * *", async () => {
  try { await runWeeklyBoardClose(db); }
  catch (err: unknown) { log.error({ err }, "weekly-board-close failed"); }
}, { timezone: "America/Argentina/Buenos_Aires" });
```

## State of the Art (en este repo)

| Antes | Ahora | Impacto |
|-------|-------|---------|
| Planilla de gerencia cargada a mano | `/tablero` calculado + fotos | Fuente única y comparable |
| Jobs globales | `forEachActiveTenant` obligatorio (fase 169, gate CON-04) | El job nuevo barre por gimnasio |
| Tablas sin tenant | Tablas nuevas nacen strict + 5 conteos fijos | Checklist de la sección de esquema |

**Deprecated/outdated:** `db:generate` (roto, migraciones a mano); paleta navy/bronze (vieja); `users.status` como "activo" (usar el predicado).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Un ingreso sin `member_id` cuenta en la sede del cobro | Fuentes §3 | Cobrado por sede corrido, total igual |
| A2 | Montos en una moneda distinta a la de la sede se excluyen de la celda y se marcan | Esquema | Subconteo raro, visible por la marca |
| A3 | El MySQL de prod corre en UTC, así que `CURDATE()` a las 00:05 AR ya es lunes | Job, semántica | Si corre en AR, la foto del lunes 00:05 sería "domingo" para activos (un día de diferencia en los vencidos del domingo) |
| A4 | El volumen semanal por tenant (pruebas < 5000, vencimientos de unas centenas) entra en una pasada | Fuentes | Tocar el cap → `log.warn` |
| A5 | Ventana editable de leads = semana en curso + semana pasada | Leads | Si Nacho carga más tarde, no puede |
| A6 | Columna "Online" afuera, nota "Total = sedes físicas" | Columnas | Gerencia espera que el Total cierre contra Caja |

## Open Questions

1. **Leads y congelamiento (contradice el mensaje del orquestador).**
   - Sabemos: el orquestador lista "leads" entre lo que se congela el lunes 00:05. Pero Nacho carga los leads de la semana a mano, y lo natural es hacerlo el lunes en la reunión, **después** del cierre.
   - Recomendación: los leads viven en su tabla, no se copian a la foto y se pueden editar en la semana en curso y la anterior. % Reserva se calcula al leer (con las reservas congeladas del bloque tardío). Confirmar con Franco.
2. **Barcelona para admin/gestion.** `listBranchesForScope` limita a admin/gestion a su país. Un admin AR no vería el grupo Barcelona (hoy tampoco ve Barcelona en Reportes). ¿Está bien, o el Tablero tiene que mostrar todos los países a admin/gestion? Recomendación: respetar el alcance existente.
3. **Online (sede virtual) y "los totales coinciden" (D-14).** Online queda afuera por D-15, así que el Total AR ≠ Caja AR. Opciones: (a) aceptar y cambiar la nota; (b) una fila informativa "Online (fuera de columnas)" debajo del Total. Recomendación: (a), y preguntar.
4. **Fórmulas del Embudo (D-17 vs D-23).** Recomendación: usar las de la pantalla de origen (`occurred` como denominador, cierre = compraron con asistencia / asistieron) y corregir la redacción de D-17.
5. **Ubicación en el menú (D-01) vs Oficina.** ¿Categoría nueva "Gerencia" al tope (recomendado) o primer ítem de "Gestión" (choca con Oficina)?
6. **Renovaciones por sede: tercera excepción de D-23.** Agrupar por `users.branch_id` puede diferir algunas filas de Renovaciones filtrada por sede (la pantalla filtra por la sede de la sub). Documentarlo en D-23.

## Environment Availability

Step 2.6: el código no necesita dependencias externas nuevas. Lo que usa el ejecutor ya está en el flujo habitual: MySQL local para `pnpm db:migrate` y los tests puntuales, `pnpm exec tsc --noEmit` y `pnpm lint:tenant` en el API, y `vue-tsc` + `pnpm lint` en el admin. La suite completa corre en CI (convención del repo).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (API), integración contra MySQL real (`eltemplo_test_<POOL_ID>`) |
| Config file | `el-templo-api/vitest.config.ts` (`include: test/**/*.test.ts`) |
| Quick run command | `cd el-templo-api && pnpm exec tsc --noEmit && pnpm lint:tenant` (local); un archivo puntual: `pnpm exec vitest run test/weekly-board/<archivo>.test.ts` (solo si Franco lo habilita; por convención corre en CI) |
| Full suite command | `cd el-templo-api && pnpm test` (CI) |

### Phase Requirements → Test Map
| Req | Comportamiento | Tipo | Archivo |
|-----|----------------|------|---------|
| SC-6 | `dueClosures(today)` para cada día lun..dom, bordes 00:05 y semana W-2 | unit (sin DB) | `test/weekly-board/week.test.ts` ❌ |
| SC-5 | Métodos "por sede" = endpoint de origen filtrado por esa sede (embudo por sede de clase; renovaciones con alumnos de plan de una sede; deuda y activos por `users.branch_id`); la suma AR de cobrado = `getIncomeByBranch` AR **cuando no hay alumnos online** | integración | `test/weekly-board/by-branch-sources.test.ts` ❌ |
| SC-5 | Refactor `tallyTrialSessions`/`kpisFromTally` sin cambio: los tests existentes de `reports-trial-sessions.test.ts` siguen verdes | regresión | existente ✅ |
| SC-3/SC-4 | GET arma columnas = sedes activas físicas (una inactiva y una virtual no aparecen), grupos AR/ES, Total AR solo de AR, % desde conteos sumados, % Reserva "—" sin leads (D-05) | integración | `test/weekly-board/weekly-board-routes.test.ts` ❌ |
| SC-6 | Con foto sembrada, el GET muestra la foto aunque los datos vivos cambien; sin foto en W-1, el bloque tardío sale `provisorio`; semana vieja sin foto → deuda/activos `null`, embudo/renovaciones/cobrado en vivo `sin_foto` | integración | ídem ❌ |
| SC-6 | Job: `closeDue(ctx, now)` crea la principal de W-1 (una fila por sede física, ceros incluidos), no toca la tardía antes del viernes, la cierra con `now` ≥ viernes; re-correr no cambia valores ni sellos; un cambio posterior de datos no altera la foto | integración | `test/jobs/weekly-board-close.test.ts` ❌ |
| SC-6 | Barrido por tenant: el gimnasio 2 recibe sus propias fotos y nunca ve sedes del 1 | integración | ídem ❌ |
| SC-7 | PUT leads: upsert, `null` borra, valida lunes/no futuro/sede virtual 400, idempotente | integración | `weekly-board-routes.test.ts` ❌ |
| SC-1/SC-8 | Roles: coach/recepcion 403; admin_sede ve solo su columna y sin total de otras sedes; admin_sede PUT a otra sede 403; admin AR no ve ES; owner ve AR+ES; sede de otro tenant 403 | integración | ídem ❌ |
| Gates | 5 conteos + ISO-01 (544) + CON-04 (12 jobs) + lint:tenant | CI | existentes (actualizar números) |
| Admin | `vue-tsc` + lint + UAT visual | manual | — |

### Fixtures necesarias (crear `test/fixtures/weekly-board.ts` para no copiar en cada archivo)
- 2 sedes AR físicas + 1 ES + 1 virtual AR + 1 inactiva (todas con code único).
- Embudo: schedule por sede, `bookings is_trial=1` en W-1 con y sin `attendance` confirmado, un lead `converted_at` (ganada) y una reagenda (no cuenta).
- Renovaciones: sub de plan de una sede (≥7 días, no trial, no especial) que vence en W-1 y renueva dentro de 5 días; otra que no; un `renewal_followups` con `manual_status='no_renovo'`; un multisucursal con `users.branch_id` ≠ `subscriptions.branch_id` (prueba D-12).
- Cobrado: `financial_transactions` inflow validado de un alumno de la sede A cobrado en la sede B (prueba D-14), uno anulado y uno pendiente (no cuentan), un `cash_transfer` (no cuenta).
- Deuda: balance de sub `activa` reciente, uno de más de 10 días (`createdAt` −12 días), uno `incobrable`, una `debt_balance` suelta (cuenta en la sede del alumno).
- Activos: alumno con sub paga vigente, uno con solo pase `especial` (no cuenta), uno `bonificada` (no cuenta).
- Usar `seedSecondTenant`/`limpiarSegundoGimnasio`, `createStaffUser` (con `user_branches` para admin_sede) y nunca ids hardcodeados de `users`.

### Sampling Rate
- **Por tarea:** `tsc --noEmit` + `lint:tenant` (API); `vue-tsc` + lint (admin).
- **Por plan:** el orquestador verifica worktree limpio + typecheck + lint (CLAUDE.md, método fase 173).
- **Gate de fase:** CI verde (suite completa) antes de `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `test/fixtures/weekly-board.ts`: fixtures compartidas.
- [ ] `test/weekly-board/week.test.ts`, `by-branch-sources.test.ts`, `weekly-board-routes.test.ts`, `test/jobs/weekly-board-close.test.ts`.
- [ ] `test/migrations/0319-weekly-board.test.ts` (opcional, precedente `0316-oficina-temas.test.ts`): uniques que empiezan por `tenant_id` y FKs.

## Security Domain

| ASVS | Aplica | Control |
|------|--------|---------|
| V2 Authentication | sí | `fastify.authenticate` en `onRequest` del plugin |
| V4 Access Control | sí | `CAJA_ROLES` en el plugin; columnas por `listBranchesForScope`; `requireBranchAccess` en el PUT; filtro extra con `enforcedBranchIds`; tenant siempre desde `scope` (`assertTenant`) |
| V5 Input Validation | sí | AJV/Fastify schema: `weekStart` patrón fecha + validación de lunes en el servicio; `leads` integer 0..100000 o `null`; `branchId` integer. `params` tipados (FA-07: `'3' !== 3`) |
| V3 / V6 | no | sin sesión nueva ni cripto |

| Amenaza | STRIDE | Mitigación |
|---------|--------|------------|
| admin_sede ve otras sedes (agregados = PII indirecta de negocio) | Information disclosure | columnas desde `listBranchesForScope` + filtro `enforcedBranchIds` + test |
| Cross-tenant vía `branchId` ajeno en el PUT | Tampering | `canAccessBranch` resuelve el gimnasio primero; `tenantValues` en el insert |
| Job que mezcla tenants | Information disclosure | `forEachActiveTenant` + `tenantWhere` en cada statement + test con el gimnasio 2 |
| SQL injection en fragmentos | Tampering | solo `sql\`${param}\``, nunca `sql.raw` con input |

## Proposed Plan Breakdown (secuencial: un worktree compartido)

1. **206-01 Esquema:** `schema/weekly-board.ts` + `0319_weekly_board.sql` a mano + `tenant-tables.ts` (gym-owned + módulo strict `weekly-board`) + los 5 conteos + `TABLES_TO_CLEAN` + `limpiarSegundoGimnasio` (+ test de migración opcional). Verifica: `tsc`, `lint:tenant`, `db:migrate` local.
2. **206-02 Helpers de semana y moneda:** `modules/weekly-board/week.ts` (BOARD_TZ, `currentWeekStart`, `weekRange`, `dueClosures` puro) + `shared/currency.ts` + `week.test.ts`.
3. **206-03 Fuentes por sede, parte 1 (Embudo + Renovaciones):** extraer `tallyTrialSessions`/`kpisFromTally` (sin cambio), `ReportsService.getTrialSessionTalliesByBranch`, `RenewalsService.computeKpisByMemberBranch` (sumar `memberBranchId` a `ExpiringRow`) + tests de coincidencia.
4. **206-04 Fuentes por sede, parte 2 (Cobrado + Deuda + Activos):** `TransactionService.getIncomeByMemberBranch`, `ReportsService.getDebtTotalsByMemberBranch` (+ `effectiveDebtStatus` JS compartido), `AnalyticsService.countActivePayingMembersByBranch` + tests de coincidencia (incluye D-14 y la deuda suelta).
5. **206-05 Calculadora + servicio de lectura:** `calculator.ts` (una pasada por fuente para W-1..W+1) + `WeeklyBoardService.getBoard` (foto vs vivo, estados, grupos por país, totales, % desde conteos, variación de activos) + `upsertLeads`.
6. **206-06 Rutas + gates:** plugin `/api/admin/weekly-board` (GET, PUT /leads), schemas AJV, registro en `app.ts`, manifiesto ISO-01 (542→544) + `weekly-board-routes.test.ts` (armado, foto, provisorio, sin foto, leads, roles, tenant).
7. **206-07 Job:** `jobs/weekly-board-close.ts` (cron horario, `closeDue` idempotente en dos pasos), registro en `index.ts`, CON-04 (11→12) + `weekly-board-close.test.ts`.
8. **206-08 Admin, datos:** `types/weekly-board.ts`, `useWeeklyBoardApi.ts` (con `cleanup()`), `utils/weekly-board-format.ts` (delta, pp, `higherIsBetter`).
9. **206-09 Admin, pantalla:** `TableroPage.vue` + `components/tablero/*` (matriz por bloques, selector de semana con `getWeekRange` + `?semana=`, celda de leads con `q-popup-edit`, chips provisorio/sin foto/foto tardía, nota de Cobrado (D-14/Online), "Sin contactar" en rojo).
10. **206-10 Menú + landing:** `TABLERO_ROLES`, categoría al tope en `NAV_MODEL`, ruta `tablero`, `landingForRole` owner/admin → `/tablero` + `vue-tsc`/lint + checklist de UAT (comparar 1 sede contra Sesiones de prueba, Renovaciones, Deudas y Analíticas para la semana pasada).

## Sources

### Primary (HIGH, código leído en este worktree)
- `el-templo-api/src/modules/reports/service.ts` (:94, :196-236, :291-321, :1115-1139, :1147-1236, :1295-1443, :1476-1669, :2191-2251, :2283-2376, :2588-2741)
- `el-templo-api/src/modules/renewals/service.ts` (:82, :109-127, :142-167, :221-394, :411-570); `renewals/routes.ts`
- `el-templo-api/src/modules/finance/transaction-service.ts` (:2488-2529, :2531-2727); `finance/firm-money.ts`
- `el-templo-api/src/modules/analytics/service.ts` (:243-363); `shared/active-member.ts`; `shared/membership.ts:57-63`
- `el-templo-api/src/jobs/reassign-multibranch.ts`; `shared/tenant.ts:248-277`; `shared/branch-access.ts:259-420`; `shared/branch-list.ts`; `shared/country-scope.ts:28-90,96-131,220-297`; `shared/date-utils.ts`; `shared/week-dates.ts:96`; `shared/permissions.ts:80-105`
- `el-templo-api/src/db/schema/branches.ts`, `financial-transactions.ts`, `balances.ts`, `tenant-column.ts`
- `el-templo-api/src/modules/subscriptions/service.ts:2233-2255, 2705-2730` (Online en sede virtual)
- Tests: `test/db/tenant-tables.test.ts:139-145`, `test/migrations/0192-0195-tenant-columns.test.ts:191`, `test/migrations/0196-tenant-unique-contracts.test.ts:630-655`, `test/tenancy/iso-01-manifiesto.test.ts:421`, `test/tenancy/con-04-crons-per-tenant.test.ts:291-310`, `test/helpers.ts:86-94,197,827`
- Admin: `utils/renewals-week.ts`, `router/routes.ts:28-53`, `router/index.ts:56-58`, `config/templo-config.ts:74,133,281-480`, `components/renovaciones/RenovacionesTab.vue:440-520`, `components/reports/TrialSessionsReport.vue:744-750`, `components/reports/OrigenAltasReport.vue:92-158`, `components/deudas/PorDeudaTab.vue:409-498`, `composables/useRenewalsApi.ts`
- Git: `git ls-tree origin/master src/db/migrations` (tope 0318), `git diff origin/master...feat/oficina` (0316, conteos 125/130/550/12, NAV), `git show 42cce5f9b` (doble conteo por links)
- Skills del repo: `el-templo-db-migrations`, `el-templo-failure-archaeology` (FA-01, FA-03, FA-04, FA-07), `el-templo-change-control`
- Memorias: `reference_tabla_gym_owned_nueva_cinco_conteos`, `reference_gates_tenancy_ruta_job_nueva`, `reference_fake_timers_salto_relativo`, `reference_test_shifts_utc_vs_tz_sede`, `reference_test_arpu_dependiente_del_calendario`, `reference_mysql2_found_rows`, `reference_drizzle_select_unqualified_columns`, `reference_brand_palette`
- Negocio: `/home/franco/projects/el-templo/.docs/tablero-semanal-respuestas-fran.md`; `206-CONTEXT.md`; enmienda de 4 días del orquestador

### Secondary / Tertiary
- Ninguna fuente web: la fase es 100 % reuso interno.

## Metadata

**Confidence breakdown:**
- Reuso de cálculos y agrupación por sede: HIGH (líneas verificadas)
- Esquema, conteos de tenancy y número de migración: HIGH (verificados contra origin/master y feat/oficina; reconfirmar al planificar)
- Job y semántica temporal: HIGH en el diseño, MEDIUM en A3 (zona horaria del MySQL de prod)
- Decisiones de negocio abiertas (leads, Online, Barcelona para admin, menú): MEDIUM, necesitan a Franco

**Research date:** 2026-11-03
**Valid until:** 2026-11-17 (repo muy activo: oficina y el tren mueven los mismos conteos y el NAV)
