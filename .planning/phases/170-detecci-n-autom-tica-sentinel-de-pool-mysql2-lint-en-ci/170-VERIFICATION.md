---
phase: 170-detecci-n-autom-tica-sentinel-de-pool-mysql2-lint-en-ci
verified: 2026-07-28T23:50:00Z
status: gaps_found
score: 2/4 must-haves verified (ROADMAP Success Criteria)
overrides_applied: 0
gaps:
  - truth: "El lint de CI deja el build rojo ante un `sql\`\\`` o `.from(<gym-owned>)` nuevo sin `tenant_id` ni anotación fuera de la allowlist (ROADMAP Success Criterion #4, CON-06)"
    status: failed
    reason: >
      tableOfExpression (src/db/scripts/lint-tenant.ts) solo resuelve namespace.prop
      (schema.users), identificadores ligados por import nombrado, y el primer argumento
      de alias(...) inline. NO resuelve un alias de variable local a una tabla de schema
      (patrón real y vivo del repo: `const u = schema.users; ... .from(u)`). Reproducido
      en vivo por este verificador: un archivo NUEVO con ese patrón sobre una tabla
      gym-owned sin tenant_id produce 0 unlistedViolations y `pnpm lint:tenant` sale 0
      (verde) — contradice literalmente el contrato citado en el propio ci.yml ("Un
      acceso nuevo a una tabla gym-owned sin tenant_id ni anotación /* tenant-safe: */
      deja el build ROJO"). Es el mismo Critical (CR-01) que documentó 170-REVIEW.md,
      con evidencia viva YA MERGEADA a staging en src/modules/campaigns/service.ts
      (accesos sin scope a `users` y `branches` — las dos tablas ancla de la fase 166 —
      invisibles al gate y ausentes de tenant-lint-allowlist.json). El review es del
      mismo día que el merge a staging (566b880c en cc885e51) pero LLEGÓ DESPUÉS del
      merge: el fix nunca se hizo, a diferencia del punto ciego de imports profundos que
      sí se resolvió antes de pushear (commit d8fa4986, plan 08).
    artifacts:
      - path: "el-templo-api/src/db/scripts/lint-tenant.ts"
        issue: "tableOfExpression (~línea 732-751) no resuelve alias de variable local; ver también WR-01 (TABLE_METHODS sin innerJoin/leftJoin/rightJoin/fullJoin), que agrava el mismo caso vivo"
      - path: "el-templo-api/src/modules/campaigns/service.ts"
        issue: "Accesos reales sin tenant_id a users, subscriptions, branches y campaign_unsubscribes (líneas 65-108), invisibles al lint y ausentes de la allowlist (verificado: solo hay entradas para bookings, campaigns, campaign_events, campaign_sends, user_status_history)"
      - path: "el-templo-api/tenant-lint-allowlist.json"
        issue: "423 entradas, ninguna para (campaigns/service.ts, users|subscriptions|branches|campaign_unsubscribes) — el par no fue detectado, no por decisión de scope"
    missing:
      - "Resolver alias locales de asignación simple en collectSchemaBindings/tableOfExpression (fix concreto ya propuesto en 170-REVIEW.md CR-01)"
      - "Agregar innerJoin/leftJoin/rightJoin/fullJoin a TABLE_METHODS (WR-01) en el mismo movimiento — mismo caso vivo (branches vía innerJoin en campaigns/service.ts:107)"
      - "Re-baselinear tenant-lint-allowlist.json con los pares nuevos que destape el fix, ANTES de dar por cerrado el criterio 4 (mismo procedimiento que d8fa4986) — D-16 congela el baseline one-shot sin regenerador, así que hacerlo después es la puerta trasera que el propio diseño prohíbe"
      - "Sumar un caso de fixture (alias de variable local) a con-06-lint.test.ts que falle hasta que el fix exista"
deferred: []
human_verification:
  - test: "Confirmar en GitHub Actions que el step \"Tenant lint (CON-06)\" y el job api-test corrieron en verde tras el merge a staging (commit 566b880c, push ya realizado según handoff)"
    expected: "Step Tenant lint (CON-06) en verde con --base resuelto correctamente (github.event.before); job api-test verde; cero migraciones aplicadas por el deploy"
    why_human: "gh no está instalado localmente y no hay forma de consultar el estado de un run de CI del runner real desde este entorno"
  - test: "Leer los logs de pm2 del API de staging tras 2-3 días de uso real del staff y responder las tres preguntas de la sección \"Ventana de observación en staging\" de 170-INVENTORY.md (¿violación no inventariada? ¿algún falso positivo? ¿el volumen de log.error es manejable, es decir la dedup de D-01 funciona en producción real?)"
    expected: "Cero falsos positivos ruidosos recurrentes; el volumen de log.error distintos es del orden de los ~1.852 fingerprints del inventario de suite, no del tráfico bruto; ningún camino de staging se rompió; el ruido no llegó a Sentry"
    why_human: "Es un juicio sobre tráfico real y patrones observados en producción/staging a lo largo de días — no se puede simular ni asertar desde el código. Requiere SSH con OK explícito de Franco (170-08-SUMMARY.md deja esta tarea explícitamente pendiente — Task 3 del plan 08)"
---

# Fase 170: Detección automática — sentinel de pool mysql2 + lint en CI — Verification Report

**Phase Goal:** El sistema se avisa solo cuando alguien escribe una query sin tenant. Interceptor a nivel pool que detecta SQL sobre tabla gym-owned sin `tenant_id` (throw en test/dev para módulos migrados, `log.error` + métrica en prod) y lint estático con allowlist decreciente que rompe el build ante accesos nuevos sin scope ni anotación.
**Verified:** 2026-07-28
**Status:** gaps_found
**Re-verification:** No — verificación inicial

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria, CON-05/CON-06)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Una query deliberada sin `tenant_id` sobre una tabla de un módulo ya migrado hace **throw** en test/dev; la misma query sobre un módulo aún no migrado solo advierte (CON-05) | ✓ VERIFIED | `installSentinel` implementa la matriz severidad × strict (`src/db/sentinel/install.ts`). `test/unit/sentinel-install.test.ts` (24/24 passed) y `test/tenancy/con-05-sentinel.test.ts` (12/12 passed) cubren el throw con SQL en el mensaje, el silencio no-strict y el modo inventario. `TENANT_STRICT_MODULES` arranca vacía (D-06) y es inyectable por parámetro (D-07), confirmado en `test/db/tenant-tables.test.ts`. |
| 2 | En staging/prod el sentinel emite `log.error` + métrica sin romper ningún camino, y tras la ventana de observación queda cerrada la lista de excepciones (CON-05) | ⚠ PARCIAL / NEEDS HUMAN | El mecanismo (dedup por fingerprint, nunca throw en `mode: "log"`, resumen periódico con `.unref()`, exclusión de `params` del log) está implementado y testeado (`sentinel-install.test.ts`). El inventario determinístico de suite (170-INVENTORY.md: 1.852 statements, 86 tablas, 0 throws, 0 falsos positivos del parser) demuestra la mitad "sin romper ningún camino". La cláusula "tras la ventana de observación... queda cerrada" está **explícitamente pendiente**: Task 3 del plan 08 no se ejecutó (170-08-SUMMARY.md: "Task 3 — Ventana de observación — Pendiente"), requiere 2-3 días reales de staging + SSH con OK de Franco. No es un defecto de código; es un hito operativo con el tiempo como bloqueante. |
| 3 | Las exenciones `/* tenant-safe: <motivo> */` son grepeables y su inventario completo cabe en una sola búsqueda revisable, cada una con motivo (CON-05) | ✓ VERIFIED | `pnpm lint:tenant` emite el inventario de las 10 exenciones ancladas en una sola pasada (verificado en vivo). `con-06-lint.test.ts` (37/37 passed) cubre motivo vacío = no exime, prosa/comentario `//` o JSDoc = no exime, y anclaje real al call site vía AST. |
| 4 | El lint de CI deja el build **rojo** ante un `sql\`\`` o `.from(<gym-owned>)` nuevo sin `tenant_id` ni anotación fuera de la allowlist (demostrado con un caso de prueba); la allowlist arranca completa y solo puede achicarse (CON-06) | ✗ **FAILED** | **Reproducido en vivo por este verificador**: un archivo nuevo (`const holidaysAlias = schema.holidays; ... .from(holidaysAlias)`) sobre una tabla gym-owned sin `tenant_id` deja `pnpm lint:tenant` en **exit 0** (verde), con `unlistedViolations: 0`. Es el Critical CR-01 de `170-REVIEW.md`, con evidencia viva ya mergeada a staging en `campaigns/service.ts` (accesos reales a `users`/`branches`/`subscriptions`/`campaign_unsubscribes` sin `tenant_id`, ausentes de las 423 entradas de la allowlist). El otro punto ciego de la misma clase (imports profundos) SÍ se cerró antes del push (`d8fa4986`); este NO. |

**Score:** 2/4 verificadas sin reservas, 1 pendiente por naturaleza operativa (no código), 1 **FALLIDA** con evidencia reproducible.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `el-templo-api/src/db/tenant-tables.ts` | `TENANT_STRICT_MODULES` + `isStrictTable` + `strictTablesSet`, arranca vacía | ✓ VERIFIED | Confirmado por lectura directa (líneas 510-538) + `test/db/tenant-tables.test.ts` (gates de forma, D-05/D-06) |
| `el-templo-api/src/db/sentinel/analyze.ts` | `analyzeSql` + `fingerprint`, recorte de proyección | ✓ VERIFIED | Importa `GYM_OWNED_TABLES` (no duplica la lista); `test/unit/sentinel-analyze.test.ts` 32/32 passed |
| `el-templo-api/src/db/sentinel/install.ts` | `installSentinel`, wrap query/execute/getConnection, severidad, dedup, resumen | ✓ VERIFIED | Importa `analyzeSql`/`fingerprint`; `test/unit/sentinel-install.test.ts` 24/24 passed |
| `el-templo-api/src/db/scripts/lint-tenant.ts` | Motor AST + CLI + allowlist + ratchet | ⚠️ VERIFIED CON GAP | Sustantivo, wired, tests verdes (37/37 en `con-06-lint.test.ts`) — pero con el punto ciego CR-01 documentado arriba, que rompe la garantía central del artefacto |
| `el-templo-api/tenant-lint-allowlist.json` | Baseline one-shot, 423 entradas | ✓ VERIFIED (con nota) | Ordenada, sin duplicados (confirmado por 170-REVIEW.md); incompleta respecto de los pares que CR-01 no detecta |
| `el-templo-api/src/plugins/database.ts` | `installSentinel` antes de `drizzle(pool)`, decorate `dbSentinel`, `stop()` en `onClose` | ✓ VERIFIED | Confirmado por grep directo: `installSentinel(pool, ...)` en línea 55, `fastify.decorate("dbSentinel", sentinel)` en línea 61 |
| `.github/workflows/ci.yml` | `fetch-depth: 0` + step bloqueante `lint:tenant --base=...` | ✓ VERIFIED | Step presente (línea 64), `LINT_BASE` resuelve PR vs push (línea 70), `fetch-depth: 0` en el job `api-check` |
| `test/tenancy/con-05-sentinel.test.ts`, `con-06-lint.test.ts`, `sentinel-analyze.test.ts`, `sentinel-install.test.ts`, `tenant-tables.test.ts` | Baterías de la fase | ✓ VERIFIED | Corridos directamente por este verificador (no confiando en el SUMMARY): 49 + 56 = 105 tests pasados en las 4 suites de la fase; `tsc --noEmit` limpio |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `test/db/tenant-tables.test.ts` | `tenant-tables.ts` | `isStrictTable`/`TENANT_STRICT_MODULES` | ✓ WIRED | Import confirmado |
| `sentinel/analyze.ts` | `tenant-tables.ts` | `GYM_OWNED_TABLES` | ✓ WIRED | `import { GYM_OWNED_TABLES } from "../tenant-tables"` (línea 85) |
| `sentinel/install.ts` | `sentinel/analyze.ts` | `analyzeSql`, `fingerprint` | ✓ WIRED | `import { analyzeSql, fingerprint } from "./analyze"` (línea 101) |
| `lint-tenant.ts` | `tenant-tables.ts` | `isStrictTable`/`TENANT_STRICT_MODULES` | ✓ WIRED | Confirmado por grep, coherencia strict/allowlist (D-15) |
| `plugins/database.ts` | `sentinel/install.ts` | `installSentinel(pool, ...)` antes de `drizzle(pool)` | ✓ WIRED | Confirmado por grep directo |
| `.github/workflows/ci.yml` | `package.json` | `pnpm lint:tenant --base=$LINT_BASE` | ✓ WIRED | Script `lint:tenant` presente en `package.json`; step presente en `ci.yml` |
| `lint-tenant.ts` (lint) | AST del código fuente real | `tableOfExpression`/`collectSchemaBindings` | ⚠️ PARTIAL | Resuelve `schema.X`, imports nombrados y `alias(schema.X, ...)` inline; **NO resuelve alias de variable local** — el mismo camino de acceso que el resto del sistema (Drizzle, sentinel) sí ve sin problema |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Lint estático sale verde sobre el repo actual | `pnpm lint:tenant` (el-templo-api) | `DISCREPANCIAS: 0`, 423 entradas, 429 archivos analizados | ✓ PASS |
| **Un acceso NUEVO sin tenant_id, con alias de variable local, deja el build rojo** (SC #4) | Archivo temporal `src/modules/campaigns/__verify_scratch_alias.ts` con `const holidaysAlias = schema.holidays; ... .from(holidaysAlias)` sin filtro, + `pnpm lint:tenant` | `unlistedViolations: 0`, `DISCREPANCIAS: 0` (exit 0, verde) — el acceso nuevo NO fue detectado | ✗ **FAIL** (evidencia directa de CR-01; archivo de prueba borrado tras la verificación, worktree limpio) |
| `tsc --noEmit` sobre el API | `pnpm exec tsc --noEmit` | Sin salida (limpio) | ✓ PASS |
| Batería unitaria del sentinel | `vitest run test/unit/sentinel-analyze.test.ts test/unit/sentinel-install.test.ts --hookTimeout=250000` | 2 archivos, 56/56 tests passed | ✓ PASS |
| Batería de integración (SQL real + lint) | `vitest run test/tenancy/con-05-sentinel.test.ts test/tenancy/con-06-lint.test.ts --hookTimeout=250000` | 2 archivos, 49/49 tests passed | ✓ PASS |

Nota: se usó `--hookTimeout` elevado por línea de comandos (no se tocó `vitest.config.ts`), igual que documenta 170-08-SUMMARY.md — el límite de 120s por defecto es del entorno local (WSL2 + MySQL compartido), no del código de la fase.

### Probe Execution

No aplica — la fase no declara probes (`scripts/*/tests/probe-*.sh`); el mecanismo de verificación de esta fase es el propio `pnpm lint:tenant` (cubierto arriba en Behavioral Spot-Checks) y la batería de Vitest.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| CON-05 | 170-01, 02, 04, 06, 08 | Sentinel de pool mysql2 detecta SQL sin `tenant_id`: throw test/dev para módulos migrados, prod = `log.error` + métrica; exenciones grepeables | ✓ SATISFIED (mecanismo) / NEEDS HUMAN (cierre de la ventana de observación) | Ver truths #1-#3 arriba |
| CON-06 | 170-01, 03, 05, 07 | Lint estático en CI falla ante `sql` `` / `.from()` sobre gym-owned sin `tenant_id` ni anotación (allowlist decreciente por módulo) | ✗ **BLOCKED** | CR-01: alias de variable local no resuelto, contradice el criterio 4 con evidencia reproducible |

**Cobertura de REQ-IDs:** 24/24 mapeados en REQUIREMENTS.md; CON-05 y CON-06 son las únicas asignadas a esta fase — 0 huérfanas.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `el-templo-api/src/db/scripts/lint-tenant.ts` | ~732-751 | Resolución incompleta de alias (CR-01, del review) | 🛑 Blocker | Rompe la garantía central del gate para un patrón real y vivo del repo |
| `el-templo-api/src/db/scripts/lint-tenant.ts:478` | `TABLE_METHODS` sin joins (WR-01, del review) | ⚠️ Warning | Un join nuevo a otra tabla gym-owned en un archivo ya "cubierto" por el `from()` no genera su propio par — deuda silenciosa |
| `el-templo-api/src/db/sentinel/analyze.ts:135-137` | `STARTS_WITH_SELECT` no matchea CTEs (WR-02, del review) | ⚠️ Warning | Latente — 0 usos de `.with(`/CTE en `src/` hoy; sin caso vivo |
| `.github/workflows/ci.yml` + `lint-tenant.ts:1459-1471` | `resolveBaseRef` no cae a merge-base ante `event.before` irresoluble por force-push (WR-03) | ⚠️ Warning | Exit 2 (error interno) en vez de rojo por deuda tras un force-push — hint de diagnóstico equivocado |
| `el-templo-api/src/db/scripts/lint-tenant.ts:489-511` | `isCompliantText` matchea `tenant_id` por substring, incluidos comentarios internos (WR-04) | ⚠️ Warning | Latente — sin caso vivo encontrado; riesgo si alguien escribe un comentario con "tenant_id" en un statement multi-línea |
| `el-templo-api/src/db/sentinel/install.ts:526-539` | `installSentinel` no idempotente sobre el pool (IN-01) | ℹ️ Info | Latente — solo se llama una vez hoy |
| `el-templo-api/src/db/sentinel/install.ts:302,306-308` | `SENTINEL_INVENTORY=1` sin gate de entorno (IN-02) | ℹ️ Info | Riesgo operativo si se deja prendida en prod por error |
| `el-templo-api/src/db/scripts/lint-tenant.ts:805-859` | `db.execute("string")` y `sql.raw(...)` fuera del alcance estático (IN-03) | ℹ️ Info | Documentado como limitación asumida; sin caso vivo peligroso hoy |
| `el-templo-api/test/tenancy/con-05-sentinel.test.ts:403-428` | Test con estado compartido dependiente del orden (IN-04) | ℹ️ Info | Frágil ante `--shuffle`/`.only`, no afecta el resultado actual |

No se encontraron `TBD`/`FIXME`/`XXX` sin referencia en los archivos tocados por la fase (los únicos matches de "TODO" son la palabra española "TODOS"/"TODO el archivo", no marcadores de deuda).

## Deferred Items

Ninguno — se revisaron las fases 171-176 del ROADMAP (manifiesto/fixtures, adopción módulo a módulo, cierre) y ninguna declara alcance sobre arreglar la resolución de alias del motor AST del lint. El gap de CR-01 no está cubierto por trabajo futuro planeado; es una responsabilidad de esta fase.

## Human Verification Required

### 1. CI de staging en verde tras el push

**Test:** Confirmar en GitHub Actions que el step "Tenant lint (CON-06)" y el job `api-test` corrieron en verde para el merge `566b880c` a `origin/staging`.
**Expected:** Step Tenant lint (CON-06) verde, `LINT_BASE` resuelto sin error, job `api-test` verde, cero migraciones aplicadas.
**Why human:** `gh` no está instalado en este entorno; no hay forma de consultar el runner real desde acá.

### 2. Ventana de observación de 2-3 días en staging

**Test:** Tras 2-3 días de uso real del staff, leer los logs de pm2 del API de staging (con SSH y OK explícito de Franco) y responder las tres preguntas de la sección "Ventana de observación en staging" de `170-INVENTORY.md`.
**Expected:** Sin falsos positivos ruidosos recurrentes; volumen de `log.error` del orden de los ~1.852 fingerprints del inventario de suite (no del tráfico bruto); ningún camino de staging roto; el ruido no llegó a Sentry.
**Why human:** Depende del paso del tiempo y de tráfico real de personas — no se puede simular ni asertar desde el código. Explícitamente dejado pendiente en `170-08-SUMMARY.md` (Task 3 del plan 08).

## Gaps Summary

La fase construyó correctamente el 90% de la infraestructura de detección: el sentinel de pool (CON-05) está sólidamente implementado, cableado por debajo de Drizzle, testeado (105/105 tests de la fase pasan localmente, corridos por este verificador) y con un inventario determinístico honesto de 1.852 statements de deuda sobre 86 tablas. El diseño de dedup, severidad por entorno y exenciones grepeables está todo presente y probado.

Sin embargo, el **criterio 4 del ROADMAP (CON-06) — la promesa central del lint de "romper el build ante un acceso nuevo sin scope"— falla de forma reproducible** para un patrón de código real y ya existente en el repo (alias de variable local a una tabla de `schema`). Este verificador reprodujo el fallo de forma independiente: un archivo nuevo con ese patrón deja el lint en verde. La propia `170-REVIEW.md` de la fase encontró y documentó este defecto como Critical (CR-01) el mismo día del merge a staging, pero **la corrección llegó después del merge y nunca se aplicó** — a diferencia del punto ciego gemelo (imports profundos), que sí se arregló antes de pushear. El código ya está en `origin/staging` con este agujero vivo y con evidencia concreta y no hipotética (`campaigns/service.ts` toca `users` y `branches` — las dos tablas ancla de la fase 166 — sin que el gate se entere).

Dado que D-16 congela la allowlist como baseline one-shot sin regenerador, cuanto más tiempo pase el código sin este fix en producción, más caro será el re-baseline eventual (cada archivo nuevo con este patrón agranda la deuda invisible). Se recomienda una fase de cierre de gaps antes de continuar con la fase 171, o al menos un plan corto que aplique el fix de CR-01 + WR-01 y re-baselinee la allowlist con el mismo procedimiento ya usado en el commit `d8fa4986`.

---

_Verified: 2026-07-28_
_Verifier: Claude (gsd-verifier)_
