---
phase: 170-detecci-n-autom-tica-sentinel-de-pool-mysql2-lint-en-ci
verified: 2026-07-29T15:05:00Z
status: human_needed
score: 3/4 must-haves verified (ROADMAP Success Criteria); el 4º es operativo, no de código
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 2/4
  gaps_closed:
    - "Criterio 4 (CON-06): el lint deja el build rojo ante un acceso nuevo sin tenant_id por alias de variable local o por join — el caso exacto que la verificación inicial reprodujo en VERDE ahora sale exit 1, reproducido en vivo por este verificador"
  gaps_remaining: []
  regressions: []
gaps: []
deferred: []
human_verification:
  - test: >
      Pushear la rama a staging y confirmar en GitHub Actions el comportamiento ESPERADO
      del step "Tenant lint (CON-06)": ROJO una sola vez en el push que lleva el
      re-baseline (gate D-14 de entradas ganadas — la base del evento, origin/staging,
      todavía tiene la allowlist de 423 entradas), y VERDE en el push siguiente. Franco ya
      aceptó ese rojo único en el checkpoint del plan 10 (2026-07-29). Confirmar también
      job api-test verde y cero migraciones aplicadas por el deploy.
    expected: "Un solo run rojo (D-14, entradas 423→501), el siguiente verde; api-test verde; deploy de staging no bloqueado (deploy-staging.yml no depende de ci.yml)"
    why_human: "gh no está instalado localmente y el push a staging es un gate humano por acción (skill el-templo-change-control, sección 5) — nada fue pusheado aún"
  - test: >
      Tras 2-3 días de uso real del staff en staging, leer los logs de pm2 del API (con
      SSH y OK explícito de Franco) y responder las tres preguntas de la sección "Ventana
      de observación en staging" de 170-INVENTORY.md (¿violación no inventariada? ¿algún
      falso positivo? ¿el volumen de log.error es manejable — la dedup de D-01 funciona
      con tráfico real?). Con eso, dar por cerrada la lista de excepciones.
    expected: "Cero falsos positivos ruidosos recurrentes; volumen de log.error del orden de los fingerprints del inventario de suite, no del tráfico bruto; ningún camino de staging roto; el ruido no llegó a Sentry"
    why_human: "Depende del paso del tiempo y de tráfico humano real — no se puede simular ni asertar desde el código (Task 3 del plan 08, explícitamente pendiente)"
---

# Fase 170: Detección automática — sentinel de pool mysql2 + lint en CI — Verification Report

**Phase Goal:** El sistema se avisa solo cuando alguien escribe una query sin tenant. El sentinel a nivel pool observa el SQL real y el lint observa el código fuente; juntos convierten "olvidarse del tenant" en un error visible. End state: la red de detección armada y silenciosa en prod antes de la adopción módulo a módulo.
**Verified:** 2026-07-29
**Status:** human_needed
**Re-verification:** Sí — tras el cierre de gaps (planes 170-09 y 170-10, checkpoint aprobado por Franco el 2026-07-29)

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria, CON-05/CON-06)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Query deliberada sin `tenant_id` sobre módulo migrado hace **throw** en test/dev; sobre módulo no migrado solo advierte, cubierto por tests (CON-05) | ✓ VERIFIED (regresión) | Verificado en la corrida inicial (105/105 tests de la fase, corridos por el verificador). Chequeo de regresión: `git diff --name-only 8888b011~1 HEAD -- el-templo-api` muestra que los planes 09/10 solo tocaron `lint-tenant.ts`, la allowlist y 3 archivos de test del lint — `tenant-tables.ts`, `sentinel/analyze.ts`, `sentinel/install.ts` y `plugins/database.ts` intactos. Wiring re-confirmado por grep: `installSentinel(pool, ...)` en `database.ts:55`, `dbSentinel` decorado en `:61`. |
| 2 | En staging/prod el sentinel emite `log.error` + métrica sin romper caminos; tras la ventana de observación la lista de excepciones queda cerrada (CON-05) | ? NEEDS HUMAN | El mecanismo está implementado, testeado y sin cambios desde la verificación inicial. La cláusula "tras la ventana de observación" sigue siendo operativa: **nada fue pusheado aún** (el push es gate humano) y la ventana exige 2-3 días de tráfico real. No es un gap de código. |
| 3 | Exenciones `/* tenant-safe: <motivo> */` grepeables, inventario completo en una búsqueda, cada una con motivo (CON-05) | ✓ VERIFIED | `grep -rn "tenant-safe:" src/ scripts/` devuelve el inventario completo (22 líneas) en una sola pasada. La batería `con-06-lint.test.ts` (38/38, corrida por este verificador) cubre motivo vacío = no exime, prosa/`//`/JSDoc = no exime, anclaje real al call site. |
| 4 | El lint de CI deja el build **rojo** ante un `sql``` o `.from(<gym-owned>)` nuevo sin `tenant_id` ni anotación fuera de la allowlist (demostrado); la allowlist arranca completa y solo puede achicarse (CON-06) | ✓ **VERIFIED (gap cerrado)** | **Sonda A re-ejecutada por este verificador — el caso EXACTO que en la verificación inicial salió VERDE**: archivo nuevo `src/modules/__verify_scratch_alias.ts` con `const holidaysAlias = schema.holidays; ... .from(holidaysAlias)` → `pnpm lint:tenant` **exit 1**, `__verify_scratch_alias.ts — holidays` nombrado en `unlistedViolations`; borrada la sonda → exit 0. **Sonda B (WR-01)**: join a `routes` dentro de `fill-future-bookings.ts` (archivo cuyo par del `from`, `holidays`, YA está tolerado) → **exit 1** con solo el par del join listado; revertida → exit 0. Repo limpio: exit 0, `DISCREPANCIAS: 0`, 501 entradas. Batería 38/38 sin tocar el test en el plan 10 (`git diff 90ca1b59 HEAD -- con-06-lint.test.ts` vacío). Ratchet D-14 intacto (verificado en la corrida inicial, sin cambios en `ci.yml`). |

**Score:** 3/4 verificadas contra el codebase; la restante (criterio 2, cláusula de la ventana de observación) es un hito operativo que requiere push + días de tráfico real, no código faltante.

### Cierre del gap de la verificación anterior (CR-01 + WR-01)

Verificado directamente en el motor, no en los SUMMARYs:

- `TABLE_METHODS` (`lint-tenant.ts:511-520`) ahora incluye `innerJoin`, `leftJoin`, `rightJoin`, `fullJoin`.
- `SchemaBindings.locals` (`:653`) + segundo pase de `collectSchemaBindings` (`:750-761`) resuelven `const u = schema.users` y `const o = alias(schema.X, ...)`; `tableOfExpression` consulta `locals` (`:878`).
- El resolver de inicializadores está ACOTADO a tres formas y el docblock (`:678-696`) explica por qué no reusa el fallback genérico (un par inventado entraría al baseline que D-16 congela) y la limitación asumida (mapa por archivo, sin scopes — sobre-reporta en colisión de nombres, fail-closed en cadenas al revés).
- El `it` de regresión con `ALIAS LOCAL` en el nombre ancla las tablas de `campaigns/service.ts` sobre `REAL_RESULT` — pasó en la batería 38/38.

### Auditoría del re-baseline de la allowlist (verificada por este verificador contra `git show`)

| Chequeo | Resultado |
|---------|-----------|
| Entradas | 423 → **501** (+78) |
| Entradas perdidas vs revisión anterior (`d8fa4986`) | **0** (comparación de conjuntos) |
| Entradas bajo `test/` | 0 |
| Duplicados | 0 |
| Orden estable por (file, table) | ✓ |
| `note` y `scope` verbatim | ✓ (byte-idénticos; solo `generated` y `entries` cambiaron) |
| Pares de `campaigns/service.ts` (la evidencia viva del gap) | `users`, `branches`, `subscriptions`, `campaign_unsubscribes` + `attendance` — los 5 presentes |
| Regenerador commiteado (puerta trasera D-16) | No existe — árbol limpio, ningún script auxiliar en el repo |

### Behavioral Spot-Checks (todos re-ejecutados por este verificador)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Lint verde sobre el repo actual | `pnpm lint:tenant` | exit 0, `DISCREPANCIAS: 0`, 501 entradas, 429 archivos | ✓ PASS |
| **Sonda A: alias de variable local (el caso que antes pasaba en VERDE)** | archivo nuevo + `pnpm lint:tenant` | **exit 1**, par `__verify_scratch_alias.ts — holidays` nombrado; borrada → exit 0 | ✓ PASS (antes: FAIL) |
| **Sonda B: join nuevo en archivo ya listado (WR-01)** | `.innerJoin(routes, ...)` en `fill-future-bookings.ts` + `pnpm lint:tenant` | **exit 1**, solo el par del join (`routes`) listado; revertida con `git checkout` → exit 0 | ✓ PASS (nuevo) |
| Typecheck del API | `pnpm exec tsc --noEmit` | exit 0 | ✓ PASS |
| Batería CON-06 entera | `vitest run test/tenancy/con-06-lint.test.ts --hookTimeout=250000` | **38/38 passed** (134s), incluido "el repo real con el baseline del plan 07 sale 0" (el `it` que el plan 09 dejó rojo, verde solo por el re-baseline) | ✓ PASS |
| Árbol limpio tras las sondas | `git status --porcelain` | vacío | ✓ PASS |

Nota: `--hookTimeout` elevado por línea de comandos, igual que en la verificación inicial (límite del entorno WSL2 local, no del repo). `vitest.config.ts` no fue tocado.

### Probe Execution

No aplica — la fase no declara probes (`scripts/*/tests/probe-*.sh`); el mecanismo verificable es `pnpm lint:tenant` + la batería de Vitest, cubiertos arriba.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CON-05 | 170-01, 02, 04, 06, 08 | Sentinel de pool mysql2: throw test/dev para módulos migrados, prod = `log.error` + métrica; exenciones grepeables | ✓ SATISFIED (mecanismo) / NEEDS HUMAN (cierre de la ventana de observación) | Truths #1-#3 |
| CON-06 | 170-01, 03, 05, 07, 09, 10 | Lint estático en CI falla ante acceso gym-owned sin `tenant_id` ni anotación; allowlist decreciente | ✓ **SATISFIED** (antes BLOCKED) | Truth #4: sondas A y B en rojo, repo en verde, ratchet intacto, batería 38/38 |

**Cobertura de REQ-IDs:** CON-05 y CON-06 son las únicas asignadas a esta fase en REQUIREMENTS.md; ambas declaradas en los planes — 0 huérfanas.

### Anti-Patterns Found

El Blocker de la verificación inicial (resolución incompleta de alias, CR-01) y el Warning WR-01 (joins fuera de `TABLE_METHODS`) están **cerrados y verificados**. Quedan los hallazgos advisory del REVIEW, sin cambios y sin caso vivo, ninguno bloqueante para el goal de la fase:

| File | Pattern | Severity | Estado |
|------|---------|----------|--------|
| `sentinel/analyze.ts:135-137` | `STARTS_WITH_SELECT` ciego a CTEs (WR-02) | ⚠️ Warning | Latente — 0 usos de `.with(` en `src/` |
| `ci.yml` + `lint-tenant.ts` | `resolveBaseRef` sin fallback a merge-base tras force-push (WR-03) | ⚠️ Warning | Latente |
| `lint-tenant.ts` | `isCompliantText` matchea `tenant_id` por substring, comentarios incluidos (WR-04) | ⚠️ Warning | Latente, documentado en los SUMMARYs 09/10 como deuda conocida |
| `sentinel/install.ts` | no idempotente / `SENTINEL_INVENTORY` sin gate de entorno (IN-01/IN-02) | ℹ️ Info | Sin cambios |

Sin `TBD`/`FIXME`/`XXX` sin referencia en los archivos tocados por los planes 09/10.

## Human Verification Required

### 1. Push a staging + rojo único esperado del gate D-14

**Test:** Pushear a staging (gate humano, por su propio turno) y confirmar en GitHub Actions: el step "Tenant lint (CON-06)" en ROJO **una sola vez** en el push del re-baseline (base = tip actual de staging, que aún tiene las 423 entradas), verde en el siguiente; `api-test` verde; cero migraciones.
**Expected:** Exactamente un run rojo por el ratchet (D-14 detectando 423→501 — comportamiento correcto, aceptado por Franco en el checkpoint del plan 10), el deploy de staging no bloqueado.
**Why human:** `gh` no está instalado localmente y el push requiere OK explícito por acción.

### 2. Ventana de observación de 2-3 días en staging

**Test:** Tras 2-3 días de uso real del staff, leer los logs de pm2 (SSH con OK de Franco) y responder las tres preguntas de "Ventana de observación en staging" de `170-INVENTORY.md`; con eso cerrar la lista de excepciones.
**Expected:** Cero falsos positivos ruidosos recurrentes; volumen de `log.error` acotado por la dedup de D-01; ningún camino roto; nada en Sentry.
**Why human:** Depende de tiempo y tráfico humano real.

## Gaps Summary

Ninguno. El único criterio FALLIDO de la verificación inicial (criterio 4, CON-06) quedó cerrado y fue **re-verificado con la sonda exacta que lo había refutado**: el mismo archivo con alias de variable local que antes dejaba el lint en verde ahora produce exit 1 con el par nombrado, y el caso complementario del join (WR-01) también. El re-baseline de la allowlist (423→501) fue auditado contra `git show`: cero entradas perdidas, cero bajo `test/`, `note`/`scope` byte-idénticos, sin regenerador commiteado — D-16 y el ratchet D-14 intactos. La batería CON-06 pasa entera (38/38) sin que el plan 10 tocara el archivo de test, y el árbol quedó limpio tras las sondas.

Lo que resta no es código: el push a staging (con su rojo único de ratchet, ya aceptado) y la ventana de observación de 2-3 días que cierra la cláusula operativa del criterio 2. Por eso el status es `human_needed` y no `passed`.

---

_Verified: 2026-07-29_
_Verifier: Claude (gsd-verifier) — re-verificación tras cierre de gaps_
