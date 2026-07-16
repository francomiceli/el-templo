---
phase: 164-reprogramaci-n-y-reporte
verified: 2026-07-16T03:06:13Z
status: human_needed
score: 12/12 must-haves verified
overrides_applied: 0
---

# Phase 164: Reprogramación y reporte Verification Report

**Phase Goal:** Gestión puede reprogramar una sesión de prueba en un solo paso desde el admin (cancela turno viejo + crea el nuevo en la misma transacción, con validaciones y reset de estado de la fase 163), y el reporte de Sesiones de Prueba muestra el contador de reprogramaciones por lead (derivado de bookings canceladas, retroactivo) y el origen del estado (auto/manual) con filtro.
**Verified:** 2026-07-16T03:06:13Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Gestión reprograma una prueba en un solo paso: turno viejo cancelado + nuevo creado en la MISMA tx DB | ✓ VERIFIED | `trials-service.ts:862-922` — un único `this.db.transaction` con soft-cancel (867-871), reset de lead (874-880) y create/reactivate (888-921). |
| 2 | Reprogramar dispara el reset Perdido → En seguimiento con source 'auto' (reuso del snippet de 163) | ✓ VERIFIED | `trials-service.ts:874-880` `tx.update(schema.users).set({leadStatus:'en_seguimiento', leadStatusSource:'auto'})`, idéntico al de `bookTrial`. Test `dispara el reset Perdido → En seguimiento con source 'auto' (pisa un manual)` verde. |
| 3 | La regla una-prueba-por-vida NO bloquea la reprogramación (vieja cancelada in-tx) | ✓ VERIFIED | Test `permite reprogramar dos veces seguidas (la vieja se cancela in-tx)` verde. |
| 4 | El endpoint valida slot existente, fecha válida y coherencia sede↔schedule igual que `bookTrial`, y NO clobbera un lead ya convertido (CR-01 fix) | ✓ VERIFIED | `trials-service.ts:801` (404 slot), `820-825` (409 si `status !== 'prueba'`), `830-839` (409 coherencia sede), `847-859` (400 fecha pasada / día-de-semana, WR-03 fix). Tests 404/409-cross-branch/409-convertido/400 todos verdes (6/6). |
| 5 | El endpoint exige ALL_STAFF_ROLES y respeta country/branch-scope | ✓ VERIFIED | Hook `onRequest` del plugin (heredado) + `preHandler: [requireBranchAccess({from:"body.branchId"})]` agregado en `routes.ts:630` (WR-01 fix). |
| 6 | Botón "Reprogramar" por fila en `SesionesDePruebaDialog.vue`, junto a "quitar" (flujo viejo intacto) | ✓ VERIFIED | `SesionesDePruebaDialog.vue:128-132` botón `event_repeat` → `openReschedule`; `confirmRemoveTrial`/`removeTrial` (quitar) sin cambios de comportamiento. |
| 7 | El picker de fecha+slot llama a `POST /trials/:bookingId/reschedule` y refresca la lista | ✓ VERIFIED | `RescheduleTrialDialog.vue` usa `useSchedulingApi.rescheduleTrial`; `onRescheduled()` en `SesionesDePruebaDialog.vue:320-323` llama `load()`. `loadSlots` refetchea la grilla de la semana de la fecha elegida (WR-04 fix, `RescheduleTrialDialog.vue:203-224`). |
| 8 | Cada fila del reporte trae `reschedules` (COUNT de bookings de prueba canceladas del lead, retroactivo, sin schema nuevo) | ✓ VERIFIED | `service.ts:1561-1563` subquery correlacionada `rc.member_id=u.id AND rc.is_trial=1 AND rc.booking_status='cancelado'`, alias explícito (seguro vs. gotcha Drizzle). Tests `reschedules counts cancelled trial bookings of the lead (retroactive)` verde. |
| 9 | Cada fila trae `leadStatusSource` ('auto'\|'manual'\|null); null tratado como automático | ✓ VERIFIED | `service.ts:1559,1928` SELECT + `mapTrialSessionRow`. Test `exposes leadStatusSource per row (manual + null preserved)` verde. |
| 10 | El endpoint filtra por `leadStatusSource=auto\|manual`; auto incluye NULL | ✓ VERIFIED | `service.ts:1783-1786` rama `auto` → `(col='auto' OR col IS NULL)`, bindeado con `${...}`. Test `filters by leadStatusSource; auto includes NULL rows` verde. `routes.ts:753,899,941` passthrough sin owner-strip; `TrialSessionsQuery` tipado (IN-01 fix). |
| 11 | El CSV exporta "Reprogramaciones" y "Origen estado" al final | ✓ VERIFIED | `service.ts:1656-1657` últimas entradas de `headers`; test de CSV header actualizado y verde. |
| 12 | El reporte UI muestra columna "Reprogramaciones", indicador discreto manual, y filtro por origen | ✓ VERIFIED | `TrialSessionsReport.vue:689-691` columna, `195-200` ícono+tooltip "Estado puesto a mano" solo si `leadStatusSource==='manual'`, `60` select `filters.leadStatusSource`, `705` pasado a `buildServerFilters`. |

**Score:** 12/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `el-templo-api/src/modules/scheduling/trials-service.ts` | `rescheduleTrial(input)` transaccional | ✓ VERIFIED | Línea 767, tx única 862-922, guards CR-01/WR-03 presentes. |
| `el-templo-api/src/modules/scheduling/schemas.ts` | `rescheduleTrialSchema` | ✓ VERIFIED | Línea 582, params+body+response 200/400/404/409. |
| `el-templo-api/src/modules/scheduling/routes.ts` | `POST /trials/:bookingId/reschedule` | ✓ VERIFIED | Línea 613-641, `handleServiceError`, `requireBranchAccess` preHandler (línea 630). |
| `el-templo-api/test/scheduling/reschedule-trial.test.ts` | Tests de integración | ✓ VERIFIED | 6/6 verde (incluye el caso `ganado`/CR-01), corrido en esta verificación. |
| `el-templo-api/src/modules/reports/service.ts` | COUNT correlacionado + `lead_status_source` + filtro + CSV | ✓ VERIFIED | Líneas 1559-1563 (SELECT), 1783-1786 (filtro), 1656-1657 (CSV), 1928 (map). |
| `el-templo-api/src/modules/reports/types.ts` | `reschedules`/`leadStatusSource` en row/filters | ✓ VERIFIED | Confirmado por grep + tsc limpio. |
| `el-templo-api/src/modules/reports/schemas.ts` | querystring + row props | ✓ VERIFIED | Confirmado por grep + tsc limpio. |
| `el-templo-api/src/modules/reports/routes.ts` | passthrough `leadStatusSource` | ✓ VERIFIED | Líneas 753/899/941; `TrialSessionsQuery` incluye el campo (IN-01 fix). |
| `el-templo-api/test/reports-trial-sessions.test.ts` | tests count+source+filtro | ✓ VERIFIED | 19/19 verde (3 nuevos + CSV header actualizado), corrido en esta verificación. |
| `el-templo-admin/src/composables/useSchedulingApi.ts` | cliente `rescheduleTrial` | ✓ VERIFIED | Línea 409 + registrado en `return{}` (línea 558). |
| `el-templo-admin/src/components/scheduling/RescheduleTrialDialog.vue` | picker fecha+slot | ✓ VERIFIED | Existe; `q-date` normalizado, select de slots, `$q.notify`, refetch de grilla por semana de la fecha elegida (WR-04). |
| `el-templo-admin/src/components/scheduling/SesionesDePruebaDialog.vue` | acción Reprogramar por fila | ✓ VERIFIED | Botón `event_repeat` línea 128, `openReschedule`/`onRescheduled` wired. |
| `el-templo-admin/src/composables/useReportsApi.ts` | `reschedules`/`leadStatusSource` client types | ✓ VERIFIED | Líneas 41/74/76. |
| `el-templo-admin/src/components/reports/TrialSessionsReport.vue` | columna+indicador+filtro | ✓ VERIFIED | Líneas 60/195-200/260/689-691/705. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `routes.ts POST /trials/:bookingId/reschedule` | `trialService.rescheduleTrial` | handler call | ✓ WIRED | `routes.ts:634` |
| `trials-service.ts rescheduleTrial` | `schema.users leadStatusSource='auto'` | reset dentro de la tx | ✓ WIRED | `trials-service.ts:874-880` |
| `SesionesDePruebaDialog.vue` botón Reprogramar | `RescheduleTrialDialog.vue` | apertura del diálogo por fila | ✓ WIRED | `openReschedule` → `showRescheduleDialog=true` (líneas 128-132, 313-317) |
| `RescheduleTrialDialog.vue` submit | `useSchedulingApi.rescheduleTrial` | cliente API → POST reschedule | ✓ WIRED | confirmado por grep + composición del diálogo |
| `service.ts getTrialSessionsReport` SELECT | bookings canceladas del member | correlated COUNT subquery aliaseada | ✓ WIRED | `service.ts:1561-1563` |
| `routes.ts buildTrialSessionsFilters` | `service.ts buildTrialSessionsConditions` | `filters.leadStatusSource` | ✓ WIRED | `routes.ts:941` → `service.ts:1783-1786` |
| `TrialSessionsReport.vue` select de origen | `buildServerFilters` → backend `leadStatusSource` | filtro server-side | ✓ WIRED | `TrialSessionsReport.vue:60,705` |
| `TrialSessionsReport.vue` columna Reprogramaciones | `row.reschedules` | field binding | ✓ WIRED | `TrialSessionsReport.vue:689-691` |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Backend typecheck limpio (api) | `cd el-templo-api && pnpm tsc --noEmit` | sin output, exit 0 | ✓ PASS |
| Tests de reschedule (incl. CR-01/WR-03 fixes) | `pnpm vitest run test/scheduling/reschedule-trial.test.ts` | 6/6 verde (~56s) | ✓ PASS |
| Tests de reporte (count/source/filtro/CSV) | `pnpm vitest run test/reports-trial-sessions.test.ts` | 19/19 verde (~76s), incl. el test antes-flaky `attended filter` | ✓ PASS |
| Lint admin (sustituto de vue-tsc, ausente del toolchain) | `pnpm exec eslint -c ./eslint.config.js <6 archivos tocados>` | exit 0, sin warnings | ✓ PASS |
| Debt markers en archivos tocados | `grep -nE "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER\|console\.(log\|warn\|error)"` sobre los 12 archivos | sin matches | ✓ PASS |

### Probe Execution

No aplica — esta fase no declara probes (`scripts/*/tests/probe-*.sh`); no es fase de migración/tooling.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|--------------|--------|----------|
| REPRO-01 | 164-01, 164-02 | Reprogramar en un solo paso (backend+UI) | ✓ SATISFIED | `rescheduleTrial` tx única + botón/diálogo admin, cubierto arriba (truths 1-7). |
| REPRO-02 | 164-03, 164-04 | Contador de reprogramaciones por lead en el reporte | ✓ SATISFIED | COUNT correlacionado + columna UI (truths 8, 11, 12). |
| REPRO-03 | 164-03, 164-04 | Origen auto/manual con filtro en el reporte | ✓ SATISFIED | `leadStatusSource` + filtro + indicador UI (truths 9, 10, 12). |

Sin requerimientos huérfanos: REQUIREMENTS.md mapea REPRO-01/02/03 exclusivamente a Phase 164, y las tres aparecen en los `requirements:` de los 4 planes.

### Anti-Patterns Found

Ninguno. Escaneados los 12 archivos modificados por la fase (backend + admin): sin `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`, sin `console.*`, sin retornos vacíos sospechosos ni props hardcodeadas a `[]`/`{}`/`null` fuera de estado inicial legítimo (reactive `filters`).

### Code Review Follow-up (164-REVIEW.md)

Deep review encontró 1 blocker (CR-01) + 4 warnings (WR-01..04) + 1 info (IN-01). Todos verificados como corregidos en el código actual (no solo declarados en el REVIEW):

- **CR-01** (blocker, converted-member reset clobber) — guard `status !== 'prueba'` presente (`trials-service.ts:820-825`) + reactivate lookup scopeado a `isTrial=true` (`trials-service.ts:896`). Test dedicado verde.
- **WR-01** (missing branch-scope preHandler) — `requireBranchAccess({from:"body.branchId"})` presente en la ruta (`routes.ts:630`). Nota: el gap idéntico en `POST /trials` (`bookTrial`) es preexistente a esta fase y queda fuera de scope (documentado, no bloqueante).
- **WR-02** (missing `ganado` test) — test `rechaza (409) reprogramar la prueba de un convertido y deja 'ganado' intacto` presente y verde.
- **WR-03** (no date/weekday validation) — validación not-past + `dayOfWeek` presente (`trials-service.ts:847-859`).
- **WR-04** (stale weekly-grid) — `loadSlots` refetchea por la semana de la fecha elegida (`RescheduleTrialDialog.vue:203-224`).
- **IN-01** (`TrialSessionsQuery` type gap) — `leadStatusSource` presente en el generic de ruta (`routes.ts:753`).

### Human Verification Required

Los siguientes ítems fueron deliberadamente diferidos por los planes 164-02 y 164-04 a verificación visual de UAT de milestone (no verificables por grep/tsc/tests):

### 1. Flujo de reprogramación end-to-end (visual)

**Test:** Abrir "Sesiones de Prueba" del día en el admin → click "Reprogramar" en una fila → elegir fecha + turno en el picker → confirmar.
**Expected:** Notificación positiva ("Sesión de prueba reprogramada"); la fila se mueve al nuevo turno; el flujo "quitar" sigue funcionando sin cambios.
**Why human:** Comportamiento visual/interactivo de un diálogo Quasar (picker, notificaciones, refresco de lista) — no verificable de forma confiable con grep estático.

### 2. Reporte de Sesiones de Prueba — columna, indicador y filtro (visual)

**Test:** Abrir el reporte de Sesiones de Prueba → ver la columna "Reprogramaciones" con conteos → ubicar un lead con estado puesto a mano y verificar el ícono/tooltip "Estado puesto a mano" → usar el select "Origen" (Automático/Manual) y confirmar que filtra correctamente (Automático incluye históricos sin origen registrado).
**Expected:** Columna con conteos correctos, ícono discreto solo en leads `manual`, filtro funcional con el server-side query param.
**Why human:** Verificación visual de UI (tooltip, ícono discreto, resultado del filtro en la tabla) — requiere inspección ocular del render.

### Gaps Summary

Sin gaps. Los 12 must-haves derivados de ROADMAP + PLAN frontmatter están verificados en código con evidencia directa (grep de líneas concretas + tests corridos en esta verificación, no solo confiando en los SUMMARYs). Los 6 hallazgos del code review (1 blocker + 4 warnings + 1 info) están confirmados como corregidos en el código post-review, con commits identificables (`00378351`, `e260afde`, `39e1b153`, `10bc4520`, `b4220d30`, `daf071da`) y cobertura de test para el caso crítico (CR-01/`ganado`). El único cabo suelto documentado es el gap preexistente de `POST /trials` (bookTrial) sin `requireBranchAccess`, explícitamente fuera de scope de esta fase (WR-01 nota) y no bloqueante para el goal de 164. Status `human_needed` únicamente por los 2 ítems de verificación visual diferidos a UAT de milestone — no reflejan incertidumbre sobre el código.

---

_Verified: 2026-07-16T03:06:13Z_
_Verifier: Claude (gsd-verifier)_
