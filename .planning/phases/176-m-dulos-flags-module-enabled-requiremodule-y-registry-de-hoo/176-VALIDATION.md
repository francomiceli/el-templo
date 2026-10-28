---
phase: 176
slug: m-dulos-flags-module-enabled-requiremodule-y-registry-de-hoo
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-20
updated: 2026-08-20
---

# Phase 176 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Framework**          | vitest (integration contra MySQL real, DB `eltemplo_test`)                                                   |
| **Config file**        | `el-templo-api/vitest.config.ts`                                                                             |
| **Typecheck**          | `cd el-templo-api && pnpm exec tsc --noEmit` (~30-60 s) — ⚠️ `include: ["src/**/*"]`: **NO cubre `test/`**   |
| **Quick run command**  | `cd el-templo-api && pnpm exec vitest run <archivo> --hookTimeout=250000` (foreground, ~120-250 s)           |
| **Full suite command** | `cd el-templo-api && pnpm test` — **solo en CI**. Regla del proyecto: la suite completa NO se corre en local |
| **Estimated runtime**  | archivo puntual ~120-250 s (incluye ~96 s de provisioning del worker) · suite completa ~600 s (en CI)        |

---

## Sampling Rate

- **After every task commit:** `pnpm exec tsc --noEmit` + `pnpm exec vitest run` sobre los archivos de test tocados por la task
- **After every plan wave:** typecheck + los tests del área de la wave
- **Before `/gsd:verify-work`:** typecheck 0, lint 0 y verdes los tests del radio de impacto de la fase (176-11 Task 3). **La suite completa la corre CI en el push a staging**, no la máquina local
- **Max feedback latency:** ≤ 300 s (archivo de test puntual, provisioning incluido)

---

## Per-Task Verification Map

> Todos los comandos se corren desde `/home/franco/projects/et-176/el-templo-api` (salvo los de `.github/`
> y `.docs/`, desde la raíz del worktree) y en foreground con `--hookTimeout=250000`.
> `vitest*` = `pnpm exec vitest run`; `tsc` = `pnpm exec tsc --noEmit`; `eslint` = `pnpm exec eslint`.

| Task ID   | Plan   | Wave | Requirement | Comando automatizado                                                                                             | Status     |
| --------- | ------ | ---- | ----------- | ---------------------------------------------------------------------------------------------------------------- | ---------- |
| 176-01 T1 | 176-01 | 1    | MOD-01      | `git rev-parse` (rama + base `2a4f5c92`) + `ls src/db/migrations \| cut -c1-4 \| sort \| uniq -d` = 0            | ⬜ pending |
| 176-01 T2 | 176-01 | 1    | MOD-01      | `tsc`                                                                                                            | ⬜ pending |
| 176-01 T3 | 176-01 | 1    | MOD-01      | `vitest test/tenancy/mod-01-flags.test.ts`                                                                       | ⬜ pending |
| 176-02 T1 | 176-02 | 2    | MOD-02      | `vitest test/subscriptions/pricing-golden.test.ts test/subscriptions/assign-proration-month-end.test.ts`         | ⬜ pending |
| 176-02 T2 | 176-02 | 2    | MOD-02      | `vitest test/subscriptions/pricing-golden.test.ts`                                                               | ⬜ pending |
| 176-02 T3 | 176-02 | 2    | MOD-02      | `vitest test/subscriptions/pricing-golden.test.ts`                                                               | ⬜ pending |
| 176-03 T1 | 176-03 | 2    | MOD-01      | `tsc` + `eslint src/modules/shared/module-registry.ts`                                                           | ⬜ pending |
| 176-03 T2 | 176-03 | 2    | MOD-01      | `tsc` + `vitest test/tenancy/iso-01-manifiesto.test.ts`                                                          | ⬜ pending |
| 176-03 T3 | 176-03 | 2    | MOD-01      | `vitest --no-file-parallelism test/tenancy/mod-01-guard.test.ts`                                                 | ⬜ pending |
| 176-04 T1 | 176-04 | 3    | MOD-01      | `tsc` + `eslint src/modules-boot.ts src/modules/aura/module.ts`                                                  | ⬜ pending |
| 176-04 T2 | 176-04 | 3    | MOD-01      | `tsc` + `vitest test/tenancy/iso-01-manifiesto.test.ts`                                                          | ⬜ pending |
| 176-04 T3 | 176-04 | 3    | MOD-01      | `vitest --no-file-parallelism test/tenancy/mod-01-guard.test.ts`                                                 | ⬜ pending |
| 176-05 T1 | 176-05 | 4    | MOD-01      | `vitest test/tenancy/iso-01-manifiesto.test.ts`                                                                  | ⬜ pending |
| 176-05 T2 | 176-05 | 4    | MOD-01      | `vitest test/tenancy/iso-01-manifiesto.test.ts` (test 6 — cobertura 141/141)                                     | ⬜ pending |
| 176-05 T3 | 176-05 | 4    | MOD-01      | `vitest test/tenancy/{iso-01-manifiesto,mod-01-guard,mod-01-flags}.test.ts` (test 7 — contención)                | ⬜ pending |
| 176-06 T1 | 176-06 | 4    | MOD-02      | `tsc` + `eslint src/modules/shared/hooks.ts`                                                                     | ⬜ pending |
| 176-06 T2 | 176-06 | 4    | MOD-02      | `tsc` + `vitest test/tenancy/iso-01-manifiesto.test.ts`                                                          | ⬜ pending |
| 176-06 T3 | 176-06 | 4    | MOD-02      | `vitest --no-file-parallelism test/tenancy/mod-02-hooks.test.ts`                                                 | ⬜ pending |
| 176-07 T1 | 176-07 | 5    | MOD-02      | `tsc` + `eslint src/modules/aura/streak-reward.ts src/modules/aura/module.ts`                                    | ⬜ pending |
| 176-07 T2 | 176-07 | 5    | MOD-02      | `tsc` + `vitest test/streaks/streak-service.test.ts`                                                             | ⬜ pending |
| 176-07 T3 | 176-07 | 5    | MOD-02      | `vitest --no-file-parallelism test/streaks/streak-service.test.ts test/tenancy/mod-02-hooks.test.ts`             | ⬜ pending |
| 176-08 T1 | 176-08 | 6    | MOD-02      | `tsc` + `eslint src/modules/subscriptions/pricing.ts`                                                            | ⬜ pending |
| 176-08 T2 | 176-08 | 6    | MOD-02      | `tsc` + `eslint src/modules/aura/pricing-benefits.ts src/modules/aura/module.ts`                                 | ⬜ pending |
| 176-08 T3 | 176-08 | 6    | MOD-02      | `tsc` + `vitest test/subscriptions/pricing-golden.test.ts test/subscriptions/assign-proration-month-end.test.ts` | ⬜ pending |
| 176-09 T1 | 176-09 | 7    | MOD-02      | `tsc` + `vitest test/subscriptions/pricing-golden.test.ts`                                                       | ⬜ pending |
| 176-09 T2 | 176-09 | 7    | MOD-02      | `tsc` + `vitest test/subscriptions`                                                                              | ⬜ pending |
| 176-10 T1 | 176-10 | 8    | MOD-02      | `tsc` + `vitest test/subscriptions`                                                                              | ⬜ pending |
| 176-10 T2 | 176-10 | 8    | MOD-02      | Gate de conteo: `tsc` deja **exactamente 16 `TS2554`** y cero errores de otro código (rojo por diseño)           | ⬜ pending |
| 176-10 T3 | 176-10 | 8    | MOD-02      | `tsc` + `eslint src/` + `vitest` sobre los 9 archivos de test que instancian `SubscriptionService`               | ⬜ pending |
| 176-10 T4 | 176-10 | 8    | MOD-02      | `vitest --no-file-parallelism test/tenancy/mod-02-pricing-module-off.test.ts`                                    | ⬜ pending |
| 176-11 T1 | 176-11 | 9    | MOD-01/02   | `vitest --no-file-parallelism test/auth/enabled-modules.test.ts`                                                 | ⬜ pending |
| 176-11 T2 | 176-11 | 9    | MOD-01      | `grep -c "api/blog/posts"` = 1 en los dos workflows + `grep -n "id: smoke-test"`                                 | ⬜ pending |
| 176-11 T3 | 176-11 | 9    | MOD-01/02   | `tsc` + `eslint src/` + `vitest --no-file-parallelism test/tenancy` + `vitest` del radio de impacto              | ⬜ pending |

_33 tasks · 33 con `<automated>` verify · Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [x] **Baseline golden de pricing** — `test/subscriptions/pricing-golden.test.ts` (26 casos) se corre y se sella ANTES de tocar la cadena de pricing → **176-02 Task 1** (wave 2, antes de la primera conversión, que es 176-08 en wave 6)
- [x] **Gate de cobertura del guard** — extensión de `test/tenancy/iso-01-manifiesto.test.ts` (familia existente) → **176-05** (tests 6 y 7: cobertura 141/141 y no-derrame)
- [x] **Comportamiento del guard** — `test/tenancy/mod-01-guard.test.ts` creado en **176-03 Task 3** y extendido a los otros 3 módulos en **176-04 Task 3**
- [x] **Semántica de los hooks** — `test/tenancy/mod-02-hooks.test.ts` creado en **176-06 Task 3** (bloqueante vs best-effort), antes del primer emisor real (176-07)
- [x] **Camino "módulo apagado"** — `test/tenancy/mod-02-pricing-module-off.test.ts` creado en **176-10 Task 4**

_Ningún `<automated>` de la fase quedó en `MISSING`: la infraestructura existente (familia `tenancy/`, golden de pricing, fixtures `module-flags.ts` y `second-tenant.ts`) cubre todo. Ver RESEARCH.md §Validation Architecture para el protocolo diff-cero de 3 pasos._

---

## Manual-Only Verifications

| Behavior                                                   | Requirement | Why Manual                                                                | Test Instructions                                                                                       |
| ---------------------------------------------------------- | ----------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Smoke post-deploy de ruta templo (flags ON en prod)        | MOD-01      | Depende del deploy real y del seed 0207 aplicado                          | Tras deploy a staging, pegar a una ruta `templo-module` autenticada y verificar 200 (no 404)            |
| "Cero cambio para el Templo" en las 4 superficies + el PoS | MOD-01/02   | Verificación visual del admin y del PoS; CI no typechequea los frontends  | 176-11 Task 3 `<how-to-verify>`: recorrer training/AURA/marketing/onboarding y el selector AURA del PoS |
| Suite completa                                             | MOD-01/02   | Regla del proyecto: no se corre en local, la corre CI (~600 s) en el push | Push a staging → CI verde antes de promocionar                                                          |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (33/33)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags (todo `vitest run`, foreground, `--hookTimeout=250000`)
- [x] Feedback latency < 300 s por task (suite completa delegada a CI)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending _(la firma Franco en el checkpoint de 176-11 Task 3)_
