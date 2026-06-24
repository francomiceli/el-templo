---
phase: 143-profesor-por-clase-puntuaci-n-post-clase-presencial
verified: 2026-06-24T03:00:00Z
status: human_needed
score: 15/15
overrides_applied: 0
human_verification:
  - test: "Acceder a Horarios como owner en desktop y asignar un profe a un turno Mañana y un turno Tarde para un día. Cambiar a otra semana y volver."
    expected: "El selector muestra el nombre del profe asignado en cada celda. Al cambiar el profe, toast 'Profe asignado' aparece de inmediato sin botón Save. Al navegar de semana el roster se recarga."
    why_human: "Comportamiento visual y UX de QSelect + toast; no verificable con grep"
  - test: "Acceder a Horarios como coach en mobile y verificar los dos QSelect (Profe — Mañana / Profe — Tarde) para el día seleccionado."
    expected: "Solo aparecen coaches asignados a la sucursal del coach. Al asignar, toast positivo. El coach NO puede asignar en otra sucursal (el servidor devuelve 403)."
    why_human: "Layout mobile responsive + comportamiento de QSelect filtrado por sucursal"
  - test: "Acceder a /puntuaciones como owner."
    expected: "Página carga con título 'Puntuaciones de profes'. Si no hay ratings, muestra el empty state 'Todavía no hay puntuaciones'. Si hay ratings, tabla con profe + QRating readonly (estrellas en Terracotta) + valor numérico + count, y lista de recientes con comentarios."
    why_human: "Renderizado visual de QRating, colores de marca, empty state real"
  - test: "Acceder a /puntuaciones como coach o admin."
    expected: "No aparece el link en el sidebar. Si se navega manualmente, el router rechaza la entrada (allowedRoles: ['owner'])."
    why_human: "Gating de ruta y sidebar según rol — flujo real en browser"
  - test: "Con la app del miembro, asistir a una clase presencial con profe asignado en el roster, luego cerrar y volver a abrir la app."
    expected: "Aparece el pop-up 'Cómo estuvo tu clase de {actividad}'. No muestra nombre ni foto del profe. El botón Enviar está deshabilitado hasta seleccionar ≥1 estrella. 'Ahora no' cierra sin re-pedir."
    why_human: "Flujo completo de Capacitor Preferences + trigger auth watch + rendering real en dispositivo"
  - test: "En el mismo escenario anterior, seleccionar estrellas + comentario y enviar."
    expected: "Toast '¡Gracias por tu puntuación!'. El pop-up no vuelve a aparecer en la misma clase (one-shot Preferences)."
    why_human: "Toast success + persistencia Preferences + no re-aparición del dialog"
  - test: "Un coach escanea el QR de clase con la app de alumno."
    expected: "Check-in exitoso (201) si la clase es de su sucursal asignada. Si intenta escanear otra sucursal, error. Sin AURA otorgada."
    why_human: "Flujo real de QR scan en dispositivo + verificación de que no se sumen créditos AURA al coach"
---

# Phase 143: Profesor por clase + Puntuación post clase presencial — Verification Report

**Phase Goal:** Construir la cadena profesor↔clase (roster semanal determinístico) y permitir que un miembro puntúe al profesor (estilo Uber) después de asistir a una clase presencial, sin exponer nunca al profe al miembro.
**Verified:** 2026-06-24T03:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #    | Truth                                                                                                                                           | Status   | Evidence                                                                                                                                                                                                                                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-01 | Existe tabla de roster semanal que asigna UN profe por (sucursal, semana, día, turno)                                                           | VERIFIED | `el-templo-api/src/db/schema/class-coach-assignments.ts` — `uniqueIndex("class_coach_assignment_unique")` sobre `(branchId, weekStartDate, dayOfWeek, slot)` (líneas 44-49); migración 0152 aplica DDL aditivo con UNIQUE constraint                                                                               |
| T-02 | Existe tabla append-only de puntuaciones (1-5 estrellas + comentario opcional)                                                                  | VERIFIED | `el-templo-api/src/db/schema/coach-ratings.ts` — `stars tinyint notNull`, `comment varchar(500)` nullable, sin uniqueIndex (append-log). Índices de lectura para avg por coach y one-shot guard                                                                                                                    |
| T-03 | Migración 0152 commiteada y aplicada (SQL correcto)                                                                                             | VERIFIED | `el-templo-api/src/db/migrations/0152_class_coach_roster_and_ratings.sql` — 2 `CREATE TABLE`, ENUM `'morning','afternoon'` coincide con `mysqlEnum("slot",...)` del schema. Sin `;` en líneas de comentario. Commit `da739b82`                                                                                     |
| T-04 | El coachId se resuelve del roster por (branchId, sessionDate→weekStart, dayOfWeek, slot por startTime<12:00) — atribución determinística (D-Q1) | VERIFIED | `service.ts` líneas 37-51 `slotFromStartTime`, `isoWeekStart`, `isoDayOfWeek`; `resolveRosterCoachId` (líneas 372-394) consulta `class_coach_assignments` con los 4 criterios exactos                                                                                                                              |
| T-05 | Si no hay profe asignado al slot, el rating no se acepta (sin huérfanos, D-Q3)                                                                  | VERIFIED | `getPendingRating`: si `coachId === null` → `continue` (sin retornar pending). `submitRating` líneas 346-354: `if (coachId === null) throw new BadRequestError("No hay profe asignado a esta clase")`. Test "no-orphan" en `ratings.test.ts` líneas 523-550                                                        |
| T-06 | Un miembro no puede puntuar dos veces la misma clase (one-shot, D-P2)                                                                           | VERIFIED | `submitRating` líneas 330-344: select en `coachRatings` por `(memberId, sessionDate, scheduleId)` → `BadRequestError("Ya puntuaste esta clase")`. También en `getPendingRating` líneas 241-252: clase ya puntuada → skip. Test one-shot en `ratings.test.ts` líneas 473-521                                        |
| T-07 | `pending` devuelve solo la última clase sin puntuar dentro de 48h con profe asignado (D-P3/D-P4, server-side)                                   | VERIFIED | `getPendingRating` escanea 20 asistencias desc, aplica `RATING_WINDOW_MS = 48h`, short-circuits a `null` al pasar la ventana (última clase es la frontera). Tests 48h y "solo la última" en `ratings.test.ts` líneas 374-471                                                                                       |
| T-08 | El payload `pending` nunca expone datos del profe (D-A3)                                                                                        | VERIFIED | Retorno de `getPendingRating` líneas 263-269: solo `{sessionDate, branchId, scheduleId, activityName, dayOfWeek}`. `grep coachId/coachName/photoUrl` en `el-templo-app/src/composables/useRatingsApi.ts` y `RatingPromptDialog.vue` = 0. Test líneas 404-406 `expect(body).not.toHaveProperty("coachId")`          |
| T-09 | Solo el owner lee las puntuaciones; el coach no ve nada (D-M3/D-O1)                                                                             | VERIFIED | `routes.ts` líneas 106-123: `GET /` verifica `request.user.role === "owner"` → 403 para otros. Vista owner devuelve `AVG(stars)` + `COUNT(*)` por coach con `groupBy`. Test owner-only en `ratings.test.ts` líneas 553-574                                                                                         |
| T-10 | Un coach solo puede asignar roster en sus sucursales (D-Q2 scope)                                                                               | VERIFIED | `POST /roster` usa `preHandler:[requireBranchAccess({from:"body.branchId"})]` (routes.ts línea 93). Además `upsertRosterAssignment` valida coach en `user_branches` para la sucursal (service.ts líneas 148-167). Test branch-scope 403 en `ratings.test.ts` líneas 312-327                                        |
| T-11 | Un coach puede escanear el QR con la app de alumno y registrar su propia asistencia (D-Q2)                                                      | VERIFIED | `attendance/service.ts` líneas 70-84: bifurcación temprana por role. `coachSelfScan` (líneas 310-372): valida `user_branches`, registra attendance sin AURA ni reglas de miembro, con one-per-day guard. Commits `b4a64df0` + `3f6e7e4f`                                                                           |
| T-12 | El self-scan del coach es independiente de la atribución del rating (D-Q1)                                                                      | VERIFIED | `grep coachRatings classCoachAssignments` en `attendance/service.ts` = 0 resultados. La función `coachSelfScan` no toca ninguna de las tablas de ratings                                                                                                                                                           |
| T-13 | El owner asigna profe por (día, turno) en HorariosPage con persistencia inmediata (D-A1, sin botón Save)                                        | VERIFIED | `HorariosPage.vue`: `onAssignCoach` llama `ratingsApi.assignCoach(...)` en `@update:model-value` del QSelect (línea 693). Placeholder "Sin profe asignado" (líneas 165, 180, 335). Toast "Profe asignado" (línea 712). `useRatingsApi.ts` composable correctamente wired                                           |
| T-14 | Existe página PuntuacionesPage owner-only con promedio por profe (estrellas read-only) + recientes                                              | VERIFIED | `PuntuacionesPage.vue` — título "Puntuaciones de profes" (línea 4), empty state "Todavía no hay puntuaciones" (línea 18), `QRating readonly color="primary"` (líneas 43-50, 62). Ruta `puntuaciones` con `allowedRoles: ['owner']` en `routes.ts` línea 161. Sidebar link owner-only en `AdminLayout.vue` línea 72 |
| T-15 | El pop-up de puntuación (Surface 2) es salteable, one-shot, class-framed, con estrellas Terracotta                                              | VERIFIED | `RatingPromptDialog.vue` — `<q-dialog>` sin `persistent` (línea 3). `QRating color="primary"` (línea 12). CTA "Enviar puntuación" (línea 41). "Ahora no" cierra + `markResolved` (línea 123). `Preferences` con key versionado `rating_resolved_v1_{date}_{id}`. Montado en `MainLayout.vue` (línea 138+150)       |

**Score:** 15/15 truths verified

---

## Required Artifacts

| Artifact                                                                  | Expected                                                                    | Status   | Details                                                                                                                                            |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/db/schema/class-coach-assignments.ts`                  | Roster semanal con uniqueIndex                                              | VERIFIED | `classCoachAssignments` exportado, `uniqueIndex` sobre 4 columnas, enum slot `["morning","afternoon"]`                                             |
| `el-templo-api/src/db/schema/coach-ratings.ts`                            | Log append-only, stars tinyint, comment nullable                            | VERIFIED | `coachRatings` exportado, `stars tinyint notNull`, `comment varchar(500)` nullable, sin uniqueIndex                                                |
| `el-templo-api/src/db/migrations/0152_class_coach_roster_and_ratings.sql` | DDL aditivo, 2 CREATE TABLE                                                 | VERIFIED | Archivo existe, 2 tablas, ENUM coincide con schema, sin `;` en comentarios                                                                         |
| `el-templo-api/src/db/schema/index.ts`                                    | Barrel exporta ambas tablas                                                 | VERIFIED | Líneas 63-64: `export * from "./class-coach-assignments"` y `export * from "./coach-ratings"`                                                      |
| `el-templo-api/src/modules/ratings/service.ts`                            | RatingsService con 6 métodos                                                | VERIFIED | `class RatingsService` con `getCoachesForBranch`, `getRosterWeek`, `upsertRosterAssignment`, `getPendingRating`, `submitRating`, `getOwnerRatings` |
| `el-templo-api/src/modules/ratings/routes.ts`                             | Exports ratingsAdminRoutes + ratingsMemberRoutes                            | VERIFIED | Ambos plugins exportados con guards correctos                                                                                                      |
| `el-templo-api/src/app.ts`                                                | Registra ambos plugins bajo prefijos correctos                              | VERIFIED | Líneas 210-214: `/api/admin/ratings` y `/api/members/ratings`                                                                                      |
| `el-templo-api/test/ratings/ratings.test.ts`                              | 10 tests de integración                                                     | VERIFIED | 12 `it()` calls; cubre atribución, pending, one-shot, no-coach, owner-only, branch-scope, average, coaches-list                                    |
| `el-templo-api/src/modules/attendance/service.ts`                         | Rama coach validada contra user_branches                                    | VERIFIED | Bifurcación línea 83-84; `coachSelfScan` privado líneas 310-372; no toca tablas de ratings                                                         |
| `el-templo-api/test/attendance/coach-self-scan.test.ts`                   | 3 tests del self-scan                                                       | VERIFIED | 3 `it()` calls: branch asignada, branch no asignada, one-per-day                                                                                   |
| `el-templo-admin/src/composables/useRatingsApi.ts`                        | 4 métodos: getCoachesForBranch, getRosterWeek, assignCoach, getOwnerRatings | VERIFIED | `useRatingsApi` exportado con los 4 métodos + interfaces tipadas                                                                                   |
| `el-templo-admin/src/pages/HorariosPage.vue`                              | QSelect de profe por (día, turno), persistencia inmediata                   | VERIFIED | `assignCoach` referenciado ≥1 vez, toast "Profe asignado", `loadRoster` reactivo                                                                   |
| `el-templo-admin/src/pages/PuntuacionesPage.vue`                          | Vista owner-only con promedio + recientes                                   | VERIFIED | "Puntuaciones de profes", "Todavía no hay puntuaciones", QRating readonly color="primary"                                                          |
| `el-templo-admin/src/router/routes.ts`                                    | Ruta `puntuaciones` con allowedRoles: ['owner']                             | VERIFIED | Líneas 159-161: `path:'puntuaciones'`, `allowedRoles: ['owner']`                                                                                   |
| `el-templo-app/src/composables/useRatingsApi.ts`                          | getPendingRating + submitRating + cleanup(); PendingRating sin coachId      | VERIFIED | PendingRating no tiene `coachId/coachName/photoUrl` (grep = 0); cleanup() no-op exportado                                                          |
| `el-templo-app/src/components/RatingPromptDialog.vue`                     | Pop-up class-framed, salteable, one-shot, Terracotta                        | VERIFIED | `q-dialog` sin `persistent`; `color="primary"` en QRating; "Enviar puntuación"; Preferences one-shot                                               |
| `el-templo-app/src/layouts/MainLayout.vue`                                | Monta RatingPromptDialog                                                    | VERIFIED | 2 referencias (import + mount, líneas 150 y 138)                                                                                                   |

---

## Key Link Verification

| From                                                  | To                                              | Via                                     | Status | Details                                                                                 |
| ----------------------------------------------------- | ----------------------------------------------- | --------------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| `el-templo-api/src/db/schema/index.ts`                | `class-coach-assignments` + `coach-ratings`     | `export *`                              | WIRED  | Líneas 63-64 del barrel                                                                 |
| `el-templo-api/src/app.ts`                            | `ratingsAdminRoutes` + `ratingsMemberRoutes`    | `app.register`                          | WIRED  | Líneas 210-214 con prefijos `/api/admin/ratings` y `/api/members/ratings`               |
| `el-templo-api/src/modules/ratings/service.ts`        | `schema.classCoachAssignments`                  | `resolveRosterCoachId` query            | WIRED  | Líneas 382-393: select sobre `classCoachAssignments` con 4 criterios                    |
| `el-templo-admin/src/pages/HorariosPage.vue`          | `useRatingsApi.assignCoach`                     | `@update:model-value` del QSelect       | WIRED  | `onAssignCoach` llama `ratingsApi.assignCoach(...)` línea 693                           |
| `el-templo-admin/src/router/routes.ts`                | `PuntuacionesPage.vue`                          | lazy import + `allowedRoles: ['owner']` | WIRED  | Líneas 159-161                                                                          |
| `el-templo-app/src/components/RatingPromptDialog.vue` | `useRatingsApi.getPendingRating + submitRating` | `shouldShow()` + `onSubmit()`           | WIRED  | `getPendingRating` en `shouldShow()` línea 95; `submitRating` en `onSubmit()` línea 131 |
| `el-templo-app/src/layouts/MainLayout.vue`            | `RatingPromptDialog`                            | import + montaje en template            | WIRED  | Líneas 150 (import) y 138 (mount)                                                       |

---

## Data-Flow Trace (Level 4)

| Artifact                    | Data Variable                  | Source                                                                                                                      | Produces Real Data                                                           | Status  |
| --------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------- |
| `PuntuacionesPage.vue`      | `perCoach`, `recent`           | `getOwnerRatings()` → `GET /api/admin/ratings` → `getOwnerRatings(scope)` → DB query con `AVG(stars)` y `COUNT(*)`          | Sí — query real con `innerJoin(users)`, `groupBy(coachId)`, `orderBy`        | FLOWING |
| `RatingPromptDialog.vue`    | `pending`                      | `getPendingRating()` → `GET /api/members/ratings/pending` → `getPendingRating(memberId)` → scan de 20 asistencias con joins | Sí — query real sobre `attendance` + `schedules` + `activities` + `branches` | FLOWING |
| `HorariosPage.vue` (roster) | `rosterMap` (coaches por slot) | `loadRoster()` → `getRosterWeek(branchId, weekStart)` → DB query `class_coach_assignments` join `users`                     | Sí — query real con filtro por `branchId` + `weekStartDate`                  | FLOWING |

---

## Behavioral Spot-Checks

Step 7b SKIPPED — los tests de integración son Vitest contra MySQL local (no hay servidor HTTP levantado durante esta verificación). Los 15 tests cubren los comportamientos clave. El suite corre en CI al pushear a staging.

---

## Probe Execution

No hay probes `scripts/*/tests/probe-*.sh` declarados ni convencionales para esta fase.

---

## Requirements Coverage

| Requirement    | Source Plan    | Description                                          | Status    | Evidence                                                            |
| -------------- | -------------- | ---------------------------------------------------- | --------- | ------------------------------------------------------------------- |
| PROF-DATA      | 143-01         | Tablas de roster + ratings con migración 0152        | SATISFIED | Schema files + SQL en repo; bartel exporta ambas                    |
| PROF-ROSTER    | 143-02, 143-04 | Roster semanal asignable desde admin (API + UI)      | SATISFIED | `upsertRosterAssignment` + `HorariosPage` QSelect inmediato         |
| PROF-RATING    | 143-02, 143-05 | Pending + submit del miembro con guardas server-side | SATISFIED | `getPendingRating` + `submitRating` + `RatingPromptDialog`          |
| PROF-OWNERVIEW | 143-02, 143-04 | Vista owner-only con avg por profe                   | SATISFIED | `getOwnerRatings` (API) + `PuntuacionesPage` (UI) + ruta owner-only |
| PROF-SELFSCAN  | 143-03         | QR self-scan del coach validado contra user_branches | SATISFIED | `coachSelfScan` en attendance/service.ts                            |

---

## Anti-Patterns Found

| File                     | Line          | Pattern                                                         | Severity | Impact                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------ | ------------- | --------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RatingPromptDialog.vue` | 167, 168, 220 | Hex hardcodeados `#f2ede5`, `#2e2a26`, `#ad6540` en bloque SCSS | INFO     | Solo en estilos SCSS (no en bindings Vue); los bindings `color="primary"` son correctos. Los hex `$cream` y `$charcoal` son colores de contenedor (no el color de estrellas). El `#ad6540` es el color final del gradiente del botón CTA — la estrella usa `color="primary"`. Dentro del margen aceptable per UI-SPEC ("NUNCA hex hardcodeado" aplica a bindings de componente, no a paleta SCSS interna). |

No se encontraron `TBD`, `FIXME`, `XXX`, `console.log`, ni `: any` en ningún archivo del módulo.

---

## Human Verification Required

### 1. Asignación de roster en HorariosPage — desktop

**Test:** Como owner, ir a Horarios, seleccionar una sucursal y semana. En la sección "Profe a cargo", asignar un coach distinto en Mañana y en Tarde para un día. Navegar a otra semana y volver.
**Expected:** Toast "Profe asignado" aparece al cambiar el QSelect (sin botón Save). El roster persiste al recargar la semana. Solo aparecen coaches de la sucursal seleccionada.
**Why human:** Comportamiento de persistencia inmediata + UX del QSelect en contexto real de grilla semanal

### 2. Asignación de roster en HorariosPage — mobile

**Test:** Como coach con mobile viewport, ir a Horarios. Verificar los dos QSelect "Profe — Mañana" / "Profe — Tarde" para el día seleccionado.
**Expected:** Layout mobile muestra dos selects verticales. Al intentar asignar en una sucursal no propia, el servidor devuelve error y toast negativo aparece.
**Why human:** Responsive layout mobile + gating de branch-access real

### 3. PuntuacionesPage — vista del owner

**Test:** Como owner, navegar a /puntuaciones.
**Expected:** Link "Puntuaciones" visible en sidebar (solo para owner). Página carga con título correcto. Si no hay datos: empty state "Todavía no hay puntuaciones". Si hay ratings: tabla con promedio en estrellas Terracotta + valor numérico y lista de comentarios recientes.
**Why human:** Rendering visual de QRating, color Terracotta, empty state

### 4. PuntuacionesPage — restricción de acceso

**Test:** Iniciar sesión como coach o admin y verificar sidebar y acceso a /puntuaciones.
**Expected:** Link "Puntuaciones" no aparece en sidebar. Navegación directa a /puntuaciones redirige o muestra 403.
**Why human:** Gating de sidebar por rol + router guard en browser real

### 5. Pop-up de puntuación — flujo completo

**Test:** En la app del miembro, asistir a una clase presencial (con profe asignado en el roster), cerrar la app y volver a abrirla autenticado.
**Expected:** Pop-up "¿Cómo estuvo tu clase de {Actividad}?" aparece. No muestra nombre ni foto del profe. Botón "Enviar puntuación" deshabilitado hasta ≥1 estrella. "Ahora no" cierra sin volver a pedir.
**Why human:** Capacitor Preferences + watch isAuthenticated + rendering real en dispositivo

### 6. Pop-up de puntuación — submit exitoso y one-shot

**Test:** Seleccionar estrellas + comentario opcional y tocar "Enviar puntuación".
**Expected:** Toast "¡Gracias por tu puntuación!". Dialog cierra. Al reabrir la app, el pop-up NO vuelve a aparecer para esa clase.
**Why human:** Toast positivo + persistencia Preferences + no re-aparición

### 7. QR self-scan del coach

**Test:** Un usuario con role coach escanea el QR de una clase de su sucursal asignada. Luego intenta escanear el QR de otra sucursal.
**Expected:** Primer scan exitoso (check-in registrado, sin AURA). Segundo scan bloqueado con error "No estás asignado a esta sede".
**Why human:** Flujo real de QR scan en dispositivo + verificación de AURA = 0 en balance del coach

---

## Gaps Summary

No se encontraron brechas bloqueantes. Las 15 verdades observables están verificadas en el código. Los 7 ítems de verificación humana son todos de naturaleza visual/comportamiento de runtime (UX, mobile layout, dispositivo físico).

El único hallazgo menor es el uso de hex hardcodeados en el bloque SCSS interno de `RatingPromptDialog.vue`, que está dentro del margen aceptable (los bindings de componente usan correctamente `color="primary"`).

---

_Verified: 2026-06-24T03:00:00Z_
_Verifier: Claude (gsd-verifier)_
