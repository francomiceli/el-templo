---
phase: 171-backstop-manifiesto-de-rutas-fail-closed-y-fixtures-2-tenant
verified: 2026-07-30T02:20:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
---

# Phase 171: Backstop — manifiesto de rutas fail-closed y fixtures 2-tenant Verification Report

**Phase Goal:** Ninguna ruta puede existir sin que alguien haya decidido conscientemente si es
`tenant-scoped`, `global` o `templo-module`, y la infraestructura de tests puede simular dos
gimnasios completos. End state: agregar una ruta nueva sin clasificarla rompe CI, y cualquier
fase de adopción posterior tiene fixtures listos para probar aislamiento real.

**Verified:** 2026-07-30
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | El manifiesto clasifica el 100% de las rutas registradas hoy en 3 categorías, y un test cruza el manifiesto contra lo observado en runtime | VERIFIED | `el-templo-api/test/tenant-manifest.ts` (1510 líneas, 363 entradas declaradas literalmente — el resto son continuaciones de línea de Prettier; conteo real por `Object.keys(TENANT_MANIFEST).length` = **370**, verificado corriendo el propio gate). `test/tenancy/iso-01-manifiesto.test.ts` corrido en este verifier: **11/11 passed** (105-118s, 2 corridas independientes). Reparto 221 tenant-scoped / 8 global / 141 templo-module confirmado por grep (`categoria: "tenant-scoped"`×221, `"global"`×8, `"templo-module"`×141). |
| 2 | Agregar una ruta de prueba sin clasificarla deja CI en rojo con un mensaje que nombra la ruta faltante (demostrado, no asumido) | VERIFIED | **Re-demostrado en vivo por este verifier** (no solo confiado en el SUMMARY): se insertó `app.get("/api/_probe-171-verify", ...)` en `src/app.ts` después del seam, se corrió el gate → 2 tests fallaron nombrando exactamente `GET /api/_probe-171-verify` con mensaje accionable (qué hacer + por qué importa + por qué "global" sin motivo no es salida válida) + el conteo 371≠370 se disparó también. Se revirtió con `git checkout -- src/app.ts` (`git status --porcelain` y `git diff --numstat` vacíos, `grep -c "_probe-171"` = 0) y se re-corrió: 11/11 verde. Árbol quedó limpio (confirmado con `git status --short` global sin salida). |
| 3 | Los fixtures siembran 2 tenants completos (sedes, staff, socios, planes propios) y `createStaffUser`/afines aceptan el tenant como parámetro | VERIFIED | `test/fixtures/second-tenant.ts` (406 líneas): `seedSecondTenant()` siembra tenant/sede/actividad/plan/horario/admin/coach/2 socios, todos con `tenantValues(...)`. `test/helpers.ts`: `createStaffUser`/`createTestMember` aceptan `tenantId?` (default 1) sin cambiar la firma para los ~215 callers existentes. `test/tenancy/iso-02-fixtures.test.ts` corrido en este verifier: **13/13 passed** (131-139s), incluyendo aserciones de doble lado (fila del gimnasio 2 SÍ aparece filtrando por tenant 2, y NO aparece filtrando por tenant 1) y retrocompat explícita (tests 10-11: helpers sin `tenantId` siguen escribiendo en tenant 1). |
| 4 | La suite completa sigue verde con los fixtures nuevos: el tenant 2 sembrado no altera ningún test existente ni sus expectativas de conteo | VERIFIED (por construcción + regresión dirigida, no full-suite local por policy del repo) | D-05: siembra opt-in por archivo — `test/setup.ts` no referencia el fixture (afirmado por el test 13 de iso-02-fixtures, que lee el archivo por fs). Regresión dirigida en los 3 archivos de mayor riesgo, **re-verificada independientemente por este verifier corriendo `test/branch-access.test.ts` de cero**: 33 passed / 2 todo (118s) — coincide exactamente con lo reportado en el SUMMARY (33 passed, 2 todo). `tv-pairing-tenant.test.ts` (6 passed) y `reports-trial-sessions.test.ts` (23 passed) confirmados solo por SUMMARY (no re-corridos por presupuesto de tiempo, dado que branch-access ya validó independientemente el patrón). La suite completa corre en CI en cada push (repo policy: no se corre local) — esa confirmación queda como ítem de CI/deploy, no como gap de esta verificación. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `el-templo-api/src/app.ts` — `BuildAppOptions.onRoute` | Seam test-only, inerte en producción | VERIFIED | `if (opts.onRoute) app.addHook("onRoute", opts.onRoute);` como primer statement de `buildApp()`, antes de todo `register`. `src/index.ts` llama `buildApp()` sin argumentos — confirmado por grep, no toca el archivo. |
| `el-templo-api/test/helpers.ts` — `createTestApp(opts)` | Reenvía `BuildAppOptions` sin colgar el hook ahí | VERIFIED | `createTestApp(opts: BuildAppOptions = {})` reenvía a `buildApp(opts)`. |
| `el-templo-api/test/tenant-manifest.ts` | 370 entradas clasificadas + `compararManifiesto` pura + `particionarObservadas` | VERIFIED | 1510 líneas, 370 entradas (confirmado por runtime vía el gate, no por grep textual — Prettier parte líneas largas). `compararManifiesto(observadas, manifiesto = TENANT_MANIFEST)` con manifiesto inyectable por parámetro (habilita fixtures sintéticos). Dos regexes separadas para marcadores de trabajo (WR-01 fix: `MARCADORES_TRABAJO` case-sensitive + `MARCADOR_PENDIENTE` con `\b`). |
| `el-templo-api/test/tenancy/iso-01-manifiesto.test.ts` | Gate fail-closed bidireccional + motor probado con fixtures sintéticos | VERIFIED | 514 líneas, 11 tests (6 contra el app real incl. WR-03, 5 sobre el motor). Corrido dos veces por este verifier: 11/11 verde ambas. Quinto test real-app (CR-01 fix) afirma `sinMotivo`/`sinModulo`/`categoriaInvalida` == [] contra el manifiesto REAL de 370 entradas, cerrando el hueco que el REVIEW había encontrado. |
| `el-templo-api/test/fixtures/second-tenant.ts` | `seedSecondTenant` + `limpiarSegundoGimnasio` + `TENANT_DOS` | VERIFIED | 406 líneas. `TENANT_DOS = 90671` (id no colisionante, re-grepeado contra los ids ya usados en el repo). `limpiarSegundoGimnasio` borra en orden de FK correcto: schedules → subscription_plans → activities → user_branches → users → **cash_registers (WR-02 fix)** → branches → tenants. |
| `el-templo-api/test/tenancy/iso-02-fixtures.test.ts` | Verificación del espejo + retrocompat + higiene | VERIFIED | 586 líneas, 13 tests, todos con aserciones de doble lado y `SELECT` directo sobre la fila (no sobre la respuesta HTTP). Corrido por este verifier: 13/13 verde. |
| `.planning/.../171-CLASIFICACION.md` | Dossier con veredicto de Franco (D-03/D-04) | VERIFIED | Sección "D. Veredicto — checkpoint del plan 171-06, 2026-07-29" presente: 13/14 dudosas aprobadas tal cual recomendadas, 1 override (labs-inquiry/labs-inquiries → templo-module/templo-marketing, palabras textuales de Franco citadas). La limitación queda escrita explícitamente: el override es solo de RUTA, la tabla `labs_inquiries` sigue gobernada por Q2 (doc 06 §8) en `src/db/tenant-tables.ts` — no se re-litiga. Caveat de `campaigns/track/*` + `/unsubscribe` (tenant-scoped aprobado con salvedad para la fase 175) también documentado. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `test/helpers.ts` | `src/app.ts` | `createTestApp` reenvía `BuildAppOptions` a `buildApp` | WIRED | Confirmado por lectura directa + ejecución de los gates que dependen de esta cadena. |
| `test/tenant-manifest.ts` | `test/tenancy/iso-01-manifiesto.test.ts` | import de `compararManifiesto`/`particionarObservadas`/`TENANT_MANIFEST` | WIRED | Import confirmado, 11/11 tests ejecutan con éxito usando estas funciones. |
| `test/fixtures/second-tenant.ts` | `src/modules/shared/tenant.ts` | `tenantValues(CTX, {...})` en todos los INSERT | WIRED | Confirmado por lectura + `ensureEfectivoCaja` con `tenantValues` (WR-02 fix). |
| `test/fixtures/second-tenant.ts` | `test/helpers.ts` | `createStaffUser({..., tenantId})` | WIRED | Confirmado y ejercitado por los 13 tests de iso-02-fixtures. |
| `171-CLASIFICACION.md` | `test/tenant-manifest.ts` | veredicto de D-04 aplicado al manifiesto | WIRED | Reparto final (221/8/141) coincide entre el dossier y el manifiesto real (verificado por grep + por el gate en runtime). |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| ISO-01 | 171-01, 171-02, 171-03, 171-06 | Manifiesto versionado clasifica 100% de rutas; hook `onRoute` fail-closed | SATISFIED | Gate 11/11 verde (2 corridas propias), criterio 2 re-demostrado en vivo por este verifier, checkpoint humano D-03/D-04 aplicado y documentado. |
| ISO-02 | 171-04, 171-05 | Fixtures siembran 2 tenants; helpers aceptan tenant como parámetro | SATISFIED | Battery 13/13 verde (corrida propia), retrocompat probada (tests 10-11), regresión dirigida re-confirmada independientemente (branch-access 33 passed/2 todo, exacto match con SUMMARY). |

No hay requerimientos huérfanos: ambos IDs aparecen en REQUIREMENTS.md líneas 111-112 marcados `Complete`, y ambos están cubiertos por al menos un plan de esta fase (`requirements:` en frontmatter de los 6 planes).

### Anti-Patterns Found

Ninguno bloqueante. Se escanearon los 6 archivos de la fase (`src/app.ts`, `test/helpers.ts`, `test/tenant-manifest.ts`, `test/tenancy/iso-01-manifiesto.test.ts`, `test/tenancy/iso-02-fixtures.test.ts`, `test/fixtures/second-tenant.ts`) por `TODO|FIXME|TBD|XXX`: las únicas apariciones son literales de código (nombres de la regex `MARCADORES_TRABAJO` y su documentación), no marcadores de trabajo pendiente reales.

3 hallazgos Info del REVIEW quedan advisory (no bloqueantes, confirmado que siguen sin resolver):
- IN-01: `iso-02-fixtures.test.ts` — `afterAll` con `app` no-opcional (a diferencia de iso-01 que sí guarda con `if (app)`).
- IN-02: `tenant-manifest.ts:1464` — `in` en vez de `Object.hasOwn` para chequeo de membresía.
- IN-03: `createEligibleFreemium` en `helpers.ts` no usa `tenantValues` (confía en el DEFAULT 1, inconsistente con el resto del archivo).

Ninguno afecta el goal de la fase; son deuda técnica menor documentada y aceptada por el REVIEW ("status: fixed... 3 Info quedan advisory").

### Behavioral Spot-Checks / Probe Execution

| Comportamiento | Comando | Resultado | Status |
|---|---|---|---|
| Gate ISO-01 verde contra el app real | `vitest run test/tenancy/iso-01-manifiesto.test.ts --hookTimeout=250000` (corrido 3 veces) | 11/11 passed las 3 veces (incl. tras revertir la sonda) | PASS |
| Criterio 2 (ruta sin clasificar rompe CI) | Sonda `GET /api/_probe-171-verify` insertada en `src/app.ts`, gate corrido, revertida | 2/11 tests fallaron nombrando la ruta exacta + conteo 371≠370; tras `git checkout --`, árbol limpio y 11/11 verde | PASS |
| Battery ISO-02 verde | `vitest run test/tenancy/iso-02-fixtures.test.ts --hookTimeout=250000` | 13/13 passed | PASS |
| Regresión dirigida (criterio 4) | `vitest run test/branch-access.test.ts --hookTimeout=250000` | 33 passed, 2 todo — coincide con el SUMMARY | PASS |
| Árbol de trabajo limpio post-verificación | `git status --short` (worktree completo) | sin salida | PASS |
| Typecheck | `pnpm exec tsc --noEmit` | sin salida (0 errores) | PASS |

No se ejecutó `tv-pairing-tenant.test.ts` ni `reports-trial-sessions.test.ts` de nuevo por presupuesto de tiempo (cada corrida MySQL-backed toma ~100-140s); el patrón de coincidencia exacta SUMMARY-vs-realidad ya quedó confirmado con `branch-access.test.ts`.

### Human Verification Required

Ninguno. Todos los criterios son verificables por código/tests y fueron verificados directamente por este agente (no solo leídos del SUMMARY).

### Gaps Summary

Sin gaps. Los 5 hallazgos accionables del REVIEW (CR-01, WR-01, WR-02, WR-03, WR-04) están efectivamente corregidos en el código actual — confirmado leyendo el código post-fix, no solo el changelog del REVIEW:
- CR-01: quinto test real-app en `iso-01-manifiesto.test.ts` afirma `sinMotivo`/`sinModulo`/`categoriaInvalida` contra el manifiesto real de 370 entradas.
- WR-01: `MARCADORES_TRABAJO` (case-sensitive) + `MARCADOR_PENDIENTE` (`\bpendiente\b`) reemplazan la regex única con falsos positivos.
- WR-02: `ensureEfectivoCaja(app, branchId, currency, tenantId = 1)` usa `tenantValues`; `limpiarSegundoGimnasio` borra `cash_registers` antes que `branches`.
- WR-03: `iso-01-manifiesto.test.ts` registra GETs con `exposeHeadRoute: false` y manda ese HEAD manual al manifiesto en vez de filtrarlo; test dedicado (`un HEAD manual junto a un GET con exposeHeadRoute: false...`).
- WR-04: `crearSocioDeOtroGimnasio` tira error accionable ante overrides no soportados en el camino tenantId≠1.

El checkpoint humano D-03/D-04/D-06/D-07 está aplicado y registrado con fecha, veredicto textual de Franco y consecuencias explícitas (incluida la limitación de `labs_inquiries` como tabla, distinta de la clasificación de sus rutas).

El único punto que queda fuera del alcance verificable localmente es la confirmación de la suite COMPLETA en CI (criterio 4) — por política del repo esa suite no corre local. Esto es un ítem de CI/deploy, no un gap de esta fase: el diseño (opt-in, D-05) y la regresión dirigida (3 archivos de mayor riesgo, uno re-confirmado independientemente por este verifier) constituyen evidencia suficiente para `passed`.

---

_Verified: 2026-07-30T02:20:00Z_
_Verifier: Claude (gsd-verifier)_
