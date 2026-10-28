---
phase: 180
slug: campa-as-etapa-2-magic-links-por-sede-selector-de-audiencias
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-22
updated: 2026-08-22
---

# Phase 180 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Framework (API)**    | vitest (integración real contra MySQL `eltemplo_test`), config `el-templo-api/vitest.config.ts`                                                                                       |
| **Framework (app)**    | vitest, config `el-templo-app/vitest.config.ts` (`globals: true`, `environment: 'node'`, alias `src` → `./src`); 7 tests existentes, todos de utils/stores **sin montar componentes** |
| **Framework (admin)**  | sin batería de tests; la red es `vue-tsc --noEmit` (CI NO typechequea frontends)                                                                                                      |
| **Quick run (API)**    | `cd el-templo-api && pnpm exec vitest run --no-file-parallelism test/<archivo>.test.ts` (foreground, timeout amplio)                                                                  |
| **Quick run (app)**    | `cd el-templo-app && pnpm test -- <substring>` (`pnpm test` = `vitest run`, sin watch)                                                                                                |
| **Full suite command** | CI (no correr suite completa local — regla del proyecto)                                                                                                                              |
| **Estimated runtime**  | API ~30–90 s por archivo · app < 5 s · `vue-tsc` ~20–40 s                                                                                                                             |
| **Prohibido**          | `run_in_background` para tests y loops de espera con `pgrep` (se matchean a sí mismos y cuelgan al ejecutor)                                                                          |

**Atajos usados en la tabla de abajo:**

- `API$` = `cd /home/franco/projects/et-180/el-templo-api &&`
- `APP$` = `cd /home/franco/projects/et-180/el-templo-app &&`
- `ADM$` = `cd /home/franco/projects/et-180/el-templo-admin &&`

---

## Sampling Rate

- **After every task commit:** Run typecheck (`tsc --noEmit` / `vue-tsc --noEmit`) + vitest del archivo de test tocado
- **After every plan wave:** typecheck de las 3 apps tocadas + tests de los módulos tocados
- **Before `/gsd:verify-work`:** CI verde (la suite completa corre en CI, no local)
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID   | Plan   | Wave | Req / D-ID            | Threat Ref           | Test Type               | Automated Command                                                                                                                                                                                                             | Status     |
| --------- | ------ | ---- | --------------------- | -------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 180-01-T1 | 180-01 | 1    | GOV-01                | T-180-05             | checkpoint (bloqueante) | manual/checkpoint — verificar base real (tren v6.0) y crear worktree `et-180`                                                                                                                                                 | ⬜ pending |
| 180-01-T2 | 180-01 | 1    | ML-01 / D-01,D-02     | T-180-01..04         | typecheck (tdd)         | `API$ pnpm exec tsc --noEmit`                                                                                                                                                                                                 | ⬜ pending |
| 180-01-T3 | 180-01 | 1    | ML-01 / D-01,D-02     | T-180-01,02,03,06    | unit                    | `API$ pnpm exec vitest run --no-file-parallelism test/campaign-token.test.ts`                                                                                                                                                 | ⬜ pending |
| 180-02-T1 | 180-02 | 2    | RES-01 / D-17         | T-180-08,09          | typecheck (tdd)         | `API$ pnpm exec tsc --noEmit`                                                                                                                                                                                                 | ⬜ pending |
| 180-02-T2 | 180-02 | 2    | RES-01                | T-180-07             | integration             | `API$ pnpm exec vitest run --no-file-parallelism test/scheduling-member-branches.test.ts`                                                                                                                                     | ⬜ pending |
| 180-03-T1 | 180-03 | 2    | NOT-01 / D-24         | T-180-11,12          | typecheck               | `API$ pnpm exec tsc --noEmit`                                                                                                                                                                                                 | ⬜ pending |
| 180-03-T2 | 180-03 | 2    | NOT-01 / D-24         | T-180-13             | typecheck (tdd)         | `API$ pnpm exec tsc --noEmit`                                                                                                                                                                                                 | ⬜ pending |
| 180-03-T3 | 180-03 | 2    | NOT-01 / D-24         | T-180-10,11,12,13    | integration (tdd)       | `API$ pnpm exec vitest run --no-file-parallelism test/scheduling-trial-reminder.test.ts`                                                                                                                                      | ⬜ pending |
| 180-04-T1 | 180-04 | 2    | AUD-01                | T-180-18             | checkpoint (bloqueante) | manual/checkpoint — número de migración contra la base real                                                                                                                                                                   | ⬜ pending |
| 180-04-T2 | 180-04 | 2    | AUD-01 / D-11,D-14    | T-180-18             | migración+typecheck     | `API$ pnpm db:migrate && pnpm exec tsc --noEmit`                                                                                                                                                                              | ⬜ pending |
| 180-04-T3 | 180-04 | 2    | AUD-02 / D-15,D-22    | T-180-14,15,16,17    | typecheck+tenancy (tdd) | `API$ pnpm exec tsc --noEmit && pnpm lint:tenant`                                                                                                                                                                             | ⬜ pending |
| 180-04-T4 | 180-04 | 2    | AUD-02 / D-15,D-22    | T-180-15,16,17       | integration             | `API$ pnpm exec vitest run --no-file-parallelism test/campaigns-audience.test.ts`                                                                                                                                             | ⬜ pending |
| 180-05-T1 | 180-05 | 3    | RES-02, RES-01        | —                    | typecheck               | `APP$ pnpm exec vue-tsc --noEmit`                                                                                                                                                                                             | ⬜ pending |
| 180-05-T2 | 180-05 | 3    | RES-02 / D-07         | T-180-20,21          | typecheck               | `APP$ pnpm exec vue-tsc --noEmit`                                                                                                                                                                                             | ⬜ pending |
| 180-05-T3 | 180-05 | 3    | RES-02 / D-08,09,17   | T-180-19             | typecheck+suite app     | `APP$ pnpm exec vue-tsc --noEmit && pnpm test`                                                                                                                                                                                | ⬜ pending |
| 180-06-T1 | 180-06 | 3    | AUD-03 / D-13         | T-180-28             | typecheck               | `API$ pnpm exec tsc --noEmit`                                                                                                                                                                                                 | ⬜ pending |
| 180-06-T2 | 180-06 | 3    | ML-01 / D-01,02,05,21 | T-180-22,24,25,26,29 | typecheck+tenancy (tdd) | `API$ pnpm exec tsc --noEmit && pnpm lint:tenant`                                                                                                                                                                             | ⬜ pending |
| 180-06-T3 | 180-06 | 3    | ML-01, ML-04 / D-02   | T-180-23,25,27,28    | integration+tenancy     | `API$ pnpm exec vitest run --no-file-parallelism test/campaigns-magic-link.test.ts test/tenancy/iso-01-manifiesto.test.ts test/tenancy/iso-03-campaigns.test.ts && pnpm lint:tenant`                                          | ⬜ pending |
| 180-07-T1 | 180-07 | 4    | RES-04 / D-16         | T-180-30,33          | unit (tdd)              | `APP$ pnpm test -- calendar-link`                                                                                                                                                                                             | ⬜ pending |
| 180-07-T2 | 180-07 | 4    | RES-03 / D-16         | —                    | typecheck               | `APP$ pnpm exec vue-tsc --noEmit`                                                                                                                                                                                             | ⬜ pending |
| 180-07-T3 | 180-07 | 4    | RES-04 / D-10,19,20   | T-180-31,32          | typecheck+suite app     | `APP$ pnpm exec vue-tsc --noEmit && pnpm test`                                                                                                                                                                                | ⬜ pending |
| 180-08-T1 | 180-08 | 4    | AUD-02                | T-180-34             | typecheck               | `API$ pnpm exec tsc --noEmit`                                                                                                                                                                                                 | ⬜ pending |
| 180-08-T2 | 180-08 | 4    | ML-01, AUD-03 / D-02  | T-180-35,37,39       | typecheck+tenancy (tdd) | `API$ pnpm exec tsc --noEmit && pnpm lint:tenant`                                                                                                                                                                             | ⬜ pending |
| 180-08-T3 | 180-08 | 4    | AUD-02, AUD-03        | T-180-36,38          | integration             | `API$ pnpm exec vitest run --no-file-parallelism test/campaigns-send.test.ts test/campaigns-audience.test.ts`                                                                                                                 | ⬜ pending |
| 180-09-T1 | 180-09 | 5    | RES-01                | T-180-41             | typecheck+tenancy       | `API$ pnpm exec tsc --noEmit && pnpm lint:tenant`                                                                                                                                                                             | ⬜ pending |
| 180-09-T2 | 180-09 | 5    | ML-01 / D-10,14,23    | T-180-40,42,43       | typecheck               | `API$ pnpm exec tsc --noEmit`                                                                                                                                                                                                 | ⬜ pending |
| 180-09-T3 | 180-09 | 5    | ML-01, RES-01         | T-180-40,41,43       | unit (render)           | `API$ pnpm exec vitest run --no-file-parallelism test/campaigns-template.test.ts`                                                                                                                                             | ⬜ pending |
| 180-10-T1 | 180-10 | 4    | RES-05 / D-23         | T-180-46,48          | typecheck+tenancy       | `API$ pnpm exec tsc --noEmit && pnpm lint:tenant`                                                                                                                                                                             | ⬜ pending |
| 180-10-T2 | 180-10 | 4    | RES-05 / D-23         | T-180-48             | typecheck (tdd)         | `API$ pnpm exec tsc --noEmit`                                                                                                                                                                                                 | ⬜ pending |
| 180-10-T3 | 180-10 | 4    | RES-05                | T-180-44,45,46,47    | integration+tenancy     | `API$ pnpm exec vitest run --no-file-parallelism test/scheduling-label-descriptions.test.ts test/tenancy/iso-01-manifiesto.test.ts && pnpm lint:tenant`                                                                       | ⬜ pending |
| 180-11-T1 | 180-11 | 5    | ML-02 / D-04,05,21    | T-180-49,51,53,54    | unit (tdd)              | `APP$ pnpm exec vue-tsc --noEmit && pnpm test -- useMagicLink`                                                                                                                                                                | ⬜ pending |
| 180-11-T2 | 180-11 | 5    | ML-02 / D-04,21       | T-180-52             | unit (tdd)              | `APP$ pnpm exec vue-tsc --noEmit && pnpm test -- router-guard`                                                                                                                                                                | ⬜ pending |
| 180-11-T3 | 180-11 | 5    | ML-02, ML-04 / D-05   | T-180-50,51          | typecheck+suite app     | `APP$ pnpm exec vue-tsc --noEmit && pnpm test`                                                                                                                                                                                | ⬜ pending |
| 180-11-T4 | 180-11 | 5    | AUD-03 / D-13         | —                    | typecheck+suite app     | `APP$ pnpm exec vue-tsc --noEmit && pnpm test`                                                                                                                                                                                | ⬜ pending |
| 180-12-T1 | 180-12 | 6    | ML-03 / D-01,21       | T-180-55,56,57,58    | typecheck               | `APP$ pnpm exec vue-tsc --noEmit`                                                                                                                                                                                             | ⬜ pending |
| 180-12-T2 | 180-12 | 6    | ML-03                 | T-180-55             | unit                    | `APP$ pnpm test -- deep-links`                                                                                                                                                                                                | ⬜ pending |
| 180-13-T1 | 180-13 | 5    | RES-05 / D-18         | T-180-59,60          | typecheck               | `APP$ pnpm exec vue-tsc --noEmit`                                                                                                                                                                                             | ⬜ pending |
| 180-13-T2 | 180-13 | 5    | RES-05 / D-18         | T-180-61             | typecheck+suite app     | `APP$ pnpm exec vue-tsc --noEmit && pnpm test`                                                                                                                                                                                | ⬜ pending |
| 180-14-T1 | 180-14 | 5    | AUD-02                | T-180-62             | typecheck               | `ADM$ pnpm exec vue-tsc --noEmit`                                                                                                                                                                                             | ⬜ pending |
| 180-14-T2 | 180-14 | 5    | AUD-02 / D-14         | T-180-63,64          | typecheck               | `ADM$ pnpm exec vue-tsc --noEmit`                                                                                                                                                                                             | ⬜ pending |
| 180-15-T1 | 180-15 | 5    | RES-05                | T-180-66             | typecheck               | `ADM$ pnpm exec vue-tsc --noEmit`                                                                                                                                                                                             | ⬜ pending |
| 180-15-T2 | 180-15 | 5    | RES-05 / D-18         | T-180-65,67          | typecheck               | `ADM$ pnpm exec vue-tsc --noEmit`                                                                                                                                                                                             | ⬜ pending |
| 180-16-T1 | 180-16 | 7    | GOV-01                | T-180-69,70          | gate 3 apps             | `cd /home/franco/projects/et-180 && pnpm --dir el-templo-api exec tsc --noEmit && pnpm --dir el-templo-api lint:tenant && pnpm --dir el-templo-app exec vue-tsc --noEmit && pnpm --dir el-templo-admin exec vue-tsc --noEmit` | ⬜ pending |
| 180-16-T2 | 180-16 | 7    | GOV-01                | T-180-68             | checkpoint (bloqueante) | manual/checkpoint — `curl -I https://app.eltemplo.org/r/trial` (SPA fallback de nginx; pedir aprobación antes de SSH)                                                                                                         | ⬜ pending |
| 180-16-T3 | 180-16 | 7    | GOV-01                | T-180-71             | checkpoint (bloqueante) | manual/checkpoint — UAT del flujo completo (email → click → sesión → reserva), con y sin app instalada                                                                                                                        | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

**Cobertura:** 45 tasks · 41 con comando automático · 4 checkpoints humanos bloqueantes (180-01-T1, 180-04-T1, 180-16-T2, 180-16-T3), ninguno consecutivo con otro sin verificación automática salvo el par de cierre 180-16-T2/T3, precedido por el gate automático 180-16-T1.

---

## Wave Structure (fuente: frontmatter `wave` de cada plan)

| Wave | Plans                                  | Autónomos                            |
| ---- | -------------------------------------- | ------------------------------------ |
| 1    | 180-01                                 | no (checkpoint de base/worktree)     |
| 2    | 180-02, 180-03, 180-04                 | sí, sí, no (checkpoint de migración) |
| 3    | 180-05, 180-06                         | sí, sí                               |
| 4    | 180-07, 180-08, 180-10                 | sí, sí, sí                           |
| 5    | 180-09, 180-11, 180-13, 180-14, 180-15 | sí ×5                                |
| 6    | 180-12                                 | sí                                   |
| 7    | 180-16                                 | no (2 checkpoints de cierre)         |

Invariantes verificadas: cada plan cumple `wave >= max(wave de sus depends_on) + 1` y ningún par de planes de la misma wave comparte archivos en `files_modified`.

---

## Wave 0 Requirements

- [x] Batería existente `el-templo-api/test/` de campaigns confirmada como base de fixtures (helpers de auth en `test/helpers.ts`; nunca hardcodear ids de `users` — resolver `admin@test.com`)
- [x] Batería existente `el-templo-app/test/` (7 archivos, `vitest.config.ts` con `environment: 'node'` y alias `src`) confirmada como base para `useMagicLink.test.ts`, `router-guard.test.ts`, `calendar-link.test.ts` y `deep-links.test.ts` — **no hace falta montar infra nueva**
- [x] `el-templo-admin` sin batería: su red es `vue-tsc --noEmit` (documentado, no es un MISSING)

_Existing infrastructure covers all phase requirements (vitest API + MySQL test DB + vitest app ya montados)._

---

## Manual-Only Verifications

| Behavior                                               | Requirement    | Why Manual                                        | Test Instructions                                                                                           |
| ------------------------------------------------------ | -------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| SPA fallback nginx de `/r/trial` en `app.eltemplo.org` | GOV-01 / ML-02 | Config de servidor, no verificable desde el repo  | `curl -I https://app.eltemplo.org/r/trial` → 200 con index.html (pedir aprobación antes de SSH) — 180-16-T2 |
| Render del email (CTA único, tabla de sedes, WhatsApp) | ML-01          | Render MJML en clientes reales                    | Enviar a casilla de prueba y revisar en Gmail móvil/desktop — 180-16-T3                                     |
| Flujo canje → ReservasPage en dispositivo              | ML-02, ML-03   | Deep link + estado de auth real                   | Abrir link desde email en teléfono con y sin app instalada — 180-16-T3                                      |
| Número de migración libre en la base real              | AUD-01         | Depende del estado de `_migrations` en la base    | 180-04-T1 (checkpoint bloqueante)                                                                           |
| Base del worktree con el tren v6.0 adentro             | GOV-01         | Depende del estado de `origin/master` al arrancar | 180-01-T1 (checkpoint bloqueante)                                                                           |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (41/45; los 4 restantes son checkpoints humanos bloqueantes, listados arriba)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (no hay `<automated>MISSING`: toda la infra de tests ya existe)
- [x] No watch-mode flags (`pnpm test` = `vitest run`; API con `vitest run --no-file-parallelism`)
- [x] Feedback latency < 120s (typecheck ~20–40 s, test de un archivo API ~30–90 s, test de app < 5 s)
- [x] `nyquist_compliant: true` set in frontmatter
- [x] Las dos piezas sensibles a seguridad del cliente (reemplazo de sesión D-04 y bypass del guard D-21) tienen test de comportamiento, no solo typecheck (180-11-T1/T2)

**Approval:** approved 2026-08-22
