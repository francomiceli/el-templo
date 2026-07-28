---
phase: 170
slug: detecci-n-autom-tica-sentinel-de-pool-mysql2-lint-en-ci
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-28
---

# Phase 170 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Framework**          | Vitest 4.0.18                                                                                                                     |
| **Config file**        | `el-templo-api/vitest.config.ts`                                                                                                  |
| **Quick run command**  | `cd /home/franco/projects/et-170-deteccion/el-templo-api && pnpm exec vitest run <archivo>`                                       |
| **Full suite command** | `cd /home/franco/projects/et-170-deteccion/el-templo-api && pnpm test` (solo en CI, salvo la corrida de inventario del plan 08)   |
| **Estimated runtime**  | ~100 s por archivo suelto (el `setupFiles` provisiona la base per-worker, ~96 s — hallazgo 169-07); suite completa varios minutos |

Notas que condicionan el diseño de los tests:
`globals: true`; `include: ["test/**/*.test.ts"]`; `setupFiles: ["test/setup.ts"]` provisiona
`eltemplo_test_<VITEST_POOL_ID>` para TODO archivo (incluidos los "unitarios");
`pool: "forks"` con `isolate: false` (un timer colgado se acumula entre archivos —
mitigado con `.unref()` + `stop()`); `NODE_ENV: "test"`, `LOG_LEVEL: "silent"`.

---

## Wave Serialization (lección de la fase 169)

Las 8 waves son **una por plan a propósito**: los 8 planes comparten un único worktree
(`/home/franco/projects/et-170-deteccion`) y sus tests son MySQL-backed. Dos archivos de
vitest en paralelo revientan el timeout de 120 s del provisioning por worker (hallazgo
169-07), y dos ejecutores editando el mismo worktree se pisan el estado de git. Las
dependencias lógicas reales están anotadas en cada plan; el `depends_on` suma además al
predecesor inmediato como dependencia operativa.

---

## Sampling Rate

- **After every task commit:** `pnpm exec tsc --noEmit` (obligatorio, skill build-and-run) +
  el archivo de test que toca la tarea (o el chequeo `node -e` / `tsx -e` declarado en el task)
- **After every plan wave:** `pnpm exec vitest run test/unit/ test/tenancy/ test/db/tenant-tables.test.ts`
- **Before `/gsd:verify-work`:** suite completa verde **en CI** (memoria del repo: no correr
  el suite completo local) + `pnpm lint:tenant` en 0 + las tres sondas del plan 07 registradas
- **Max feedback latency:** ~120 s (un archivo de test suelto, incluido el provisioning)

---

## Per-Task Verification Map

| Task ID   | Plan | Wave | Requirement | Threat Ref     | Secure Behavior                                                           | Test Type         | Automated Command                                                   | File Exists   | Status     |
| --------- | ---- | ---- | ----------- | -------------- | ------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------- | ------------- | ---------- |
| 170-01-01 | 01   | 1    | CON-05/06   | T-170-SC       | Worktree sobre origin/master, lockfile intacto (cero installs)            | cli               | `git rev-parse` + `git status --porcelain pnpm-lock.yaml` (en plan) | n/a           | ⬜ pending |
| 170-01-02 | 01   | 1    | CON-05/06   | T-170-01       | Lista strict canónica, vacía, sin duplicar GYM_OWNED_TABLES               | tsc + grep        | `pnpm exec tsc --noEmit` + greps de export                          | ⬜            | ⬜ pending |
| 170-01-03 | 01   | 1    | CON-05/06   | T-170-04       | Gates fail-closed sobre la lista strict                                   | unit              | `pnpm exec vitest run test/db/tenant-tables.test.ts`                | ✅ (extiende) | ⬜ pending |
| 170-02-01 | 02   | 2    | CON-05      | T-170-01/03    | Recorte de proyección: el trap de Pitfall 2 se clasifica mal si falta     | tsc + grep        | `pnpm exec tsc --noEmit` + grep sin `console.`                      | ⬜            | ⬜ pending |
| 170-02-02 | 02   | 2    | CON-05      | T-170-01/04    | 14 casos + 11 formas de no-DML + exención en SQL                          | unit (sin DB)     | `pnpm exec vitest run test/unit/sentinel-analyze.test.ts`           | ⬜ Wave 0     | ⬜ pending |
| 170-03-01 | 03   | 3    | CON-06      | T-170-04       | Mapa de 92 tablas por AST (el regex resuelve 21)                          | cli (`tsx -e`)    | `tsx -e` que verifica tamaño del mapa y `tvPairings`                | n/a           | ⬜ pending |
| 170-03-02 | 03   | 3    | CON-06      | T-170-01/06/12 | Detección de accesos + cumplimiento + anclaje AST, sin ejecutar el código | integration       | `pnpm exec vitest run test/tenancy/con-06-lint.test.ts`             | ⬜ Wave 0     | ⬜ pending |
| 170-03-03 | 03   | 3    | CON-06      | T-170-09       | 4 aceptaciones + 2 rechazos de prosa (hallazgo 169-09)                    | integration       | `pnpm exec vitest run test/tenancy/con-06-lint.test.ts`             | ⬜ Wave 0     | ⬜ pending |
| 170-04-01 | 04   | 4    | CON-05      | T-170-01/02/14 | Wrap de query + execute + getConnection; severidad por entorno            | tsc + grep        | `pnpm exec tsc --noEmit` + grep sin `Proxy`/`console.`              | ⬜            | ⬜ pending |
| 170-04-02 | 04   | 4    | CON-05      | T-170-07/13    | Timer con `unref` + `stop`; resumen por `log.info`                        | tsc + grep        | greps de `unref()` y `clearInterval`                                | ⬜            | ⬜ pending |
| 170-04-03 | 04   | 4    | CON-05      | T-170-01/02/07 | Dedup por fingerprint, silencio no-strict, sin `params` en logs           | unit (sin DB)     | `pnpm exec vitest run test/unit/sentinel-install.test.ts`           | ⬜ Wave 0     | ⬜ pending |
| 170-05-01 | 05   | 5    | CON-06      | T-170-05/17    | Allowlist fail-closed + gates stale y coherencia strict                   | tsc + node        | `pnpm exec tsc --noEmit` + `node -e` sobre el JSON                  | ⬜            | ⬜ pending |
| 170-05-02 | 05   | 5    | CON-06      | T-170-04/16    | Ratchet fail-closed contra la base; exit codes 0/1/2                      | cli               | `pnpm lint:tenant` + `--base` inválida → 2                          | n/a           | ⬜ pending |
| 170-05-03 | 05   | 5    | CON-06      | T-170-05/17    | Cuatro gates y tres exit codes congelados por tests                       | integration       | `pnpm exec vitest run test/tenancy/con-06-lint.test.ts`             | ⬜ Wave 0     | ⬜ pending |
| 170-06-01 | 06   | 6    | CON-05      | T-170-19/07/08 | `installSentinel` antes de `drizzle(pool)`; `stop()` en onClose           | source assertion  | `node -e` que compara índices en `plugins/database.ts`              | n/a           | ⬜ pending |
| 170-06-02 | 06   | 6    | CON-05      | T-170-01/18    | Transacción vigilada (Pitfall 1) + trap de proyección con SQL real        | integration       | `pnpm exec vitest run test/tenancy/con-05-sentinel.test.ts`         | ⬜ Wave 0     | ⬜ pending |
| 170-06-03 | 06   | 6    | CON-05      | T-170-08/19    | Guards: orden del cableado, `.iterator(`, segundo pool                    | integration       | `pnpm exec vitest run test/tenancy/con-05-sentinel.test.ts`         | ⬜ Wave 0     | ⬜ pending |
| 170-07-01 | 07   | 7    | CON-06      | T-170-05/15    | Baseline one-shot sin `test/**` ni duplicados; lint en 0                  | cli + node        | `pnpm lint:tenant` + `node -e` sobre la allowlist                   | n/a           | ⬜ pending |
| 170-07-02 | 07   | 7    | CON-06      | T-170-04       | `fetch-depth: 0` + step bloqueante (sin advisory)                         | config assertion  | parseo YAML de `ci.yml` con `python3`                               | n/a           | ⬜ pending |
| 170-07-03 | 07   | 7    | CON-06      | T-170-01/04/05 | Rojo demostrado en vivo: acceso nuevo, allowlist ganada, base irresoluble | cli               | sondas + `git status` limpio + `pnpm lint:tenant` en 0              | n/a           | ⬜ pending |
| 170-08-01 | 08   | 8    | CON-05      | T-170-07/22    | Inventario determinístico; la suite con el flag TERMINA sola              | full suite + doc  | `SENTINEL_INVENTORY=1 pnpm test` + grep en `170-INVENTORY.md`       | n/a           | ⬜ pending |
| 170-08-02 | 08   | 8    | CON-05      | T-170-21       | Staging-first con OK explícito; cero migraciones; CI verde                | cli (gate humano) | `git status` limpio + diff sin migraciones + tsc + lint             | n/a           | ⬜ pending |
| 170-08-03 | 08   | 8    | CON-05      | T-170-02/13/18 | Ventana de observación cerrada y escrita                                  | manual + doc      | grep de la sección en `170-INVENTORY.md`                            | n/a           | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

Archivos de test que NO existen y que crean los propios planes de esta fase (cada uno dentro
del plan que introduce el comportamiento que prueba — no hay tarea que dependa de un test
inexistente de otro plan):

- [ ] `test/unit/sentinel-analyze.test.ts` — plan 02, task 2 (parser puro, CON-05)
- [ ] `test/unit/sentinel-install.test.ts` — plan 04, task 3 (wrap y severidad, CON-05)
- [ ] `test/tenancy/con-05-sentinel.test.ts` — plan 06, tasks 2 y 3 (SQL real de Drizzle + guards, CON-05)
- [ ] `test/tenancy/con-06-lint.test.ts` — plan 03, task 3 (motor) y plan 05, task 3 (gates del ratchet, CON-06)
- [ ] `test/tenancy/__fixtures__/lint/` — plan 03, task 3 (fixtures fuera del alcance del lint real)
- [ ] Extensión de `test/db/tenant-tables.test.ts` — plan 01, task 3 (gates de forma de la lista strict)

Framework install: **no hace falta** — Vitest ya está configurado.

---

## Manual-Only Verifications

| Behavior                                                                 | Requirement | Why Manual                                                                                        | Test Instructions                                                                       |
| ------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| El sentinel emite en staging sin romper ningún camino del staff          | CON-05      | Requiere tráfico real de personas durante 2-3 días (criterio 2 del ROADMAP, D-04)                 | Plan 08, task 3: leer los logs de pm2 del API de staging y responder las tres preguntas |
| La lista de excepciones queda cerrada (sin falsos positivos recurrentes) | CON-05      | Es un juicio sobre patrones observados, no una aserción                                           | Plan 08, task 3: sección "Ventana de observacion en staging" de `170-INVENTORY.md`      |
| El step de CI corre y rompe el build en el runner real                   | CON-06      | El comportamiento del runner (fetch-depth, `github.event.before`) no se puede ejecutar localmente | Plan 08, task 2: revisar el run de CI del push a staging, step `Tenant lint (CON-06)`   |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (cada test lo crea el plan que lo usa)
- [x] No watch-mode flags (todo es `vitest run`)
- [x] Feedback latency < 120 s por archivo de test
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
