---
phase: 179
slug: referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-22
updated: 2026-08-22
---

# Phase 179 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Framework**          | vitest ^4.0.18 (el-templo-api, integración contra MySQL real `eltemplo_test_<POOL_ID>`); vitest también en `el-templo-app` (tests unitarios) |
| **Config file**        | `el-templo-api/vitest.config.ts` · `el-templo-app/vitest.config.ts`                                                                          |
| **Quick run command**  | `pnpm --dir /home/franco/projects/et-179/el-templo-api exec vitest run test/referral-partners --no-watch`                                    |
| **Full suite command** | `pnpm --dir el-templo-api test` (regla del repo: la suite completa corre en CI, no local)                                                    |
| **Typecheck**          | API: `tsc --noEmit` · admin/app: `vue-tsc --noEmit -p tsconfig.json` (**CI no typechequea los frontends**)                                   |
| **Gates de tenancy**   | `lint:tenant`, `db:verify-uniques`, `test/tenancy`, `test/db/tenant-tables.test.ts`                                                          |
| **Estimated runtime**  | ~60-90 s el módulo; ~5 min el barrido de módulos tocados                                                                                     |

> **Regla dura:** tests SOLO en foreground con timeout amplio. Prohibido `run_in_background` y loops de espera con `pgrep` (se matchean a sí mismos y cuelgan al ejecutor).

---

## Sampling Rate

- **After every task commit:** typecheck del app tocada + `vitest run test/referral-partners`
- **After every plan:** worktree limpio + typecheck + tests de los módulos tocados + `lint:tenant`
- **Before `/gsd:verify-work`:** plan 179-17 Task 1 (verificación integral de las 3 apps + gates)
- **Max feedback latency:** 120 s

---

## Per-Task Verification Map

| Plan   | Wave | Decisión                 | Comportamiento verificado                                           | Threat Ref             | Test Type            | Automated Command                                                                                                                 | File Exists | Status     |
| ------ | ---- | ------------------------ | ------------------------------------------------------------------- | ---------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------- |
| 179-01 | 1    | D-11/D-12/D-20           | Tablas con tenant_id, uniques correctas, gates de tenancy verdes    | T-179-01..04           | integration          | `vitest run test/db/tenant-tables.test.ts test/tenancy/con-01-uniques-cross-tenant.test.ts` + `lint:tenant` + `db:verify-uniques` | ❌ → crea   | ⬜ pending |
| 179-02 | 2    | D-03/D-13                | CRUD tenancy-native, unicidad cruzada de códigos, resolver 4 ramas  | T-179-05..09           | integration          | `vitest run test/referral-partners --no-watch`                                                                                    | ❌ → crea   | ⬜ pending |
| 179-03 | 3    | D-03/D-20                | CRUD por HTTP, RBAC 403/401, `additionalProperties`, aislamiento    | T-179-10..13           | integration          | `vitest run test/referral-partners test/tenancy/iso-01-manifiesto.test.ts`                                                        | ❌ → crea   | ⬜ pending |
| 179-04 | 4    | D-02/D-03/D-07/D-12      | Atribución en el alta, TTL 30d, degradación graceful, back-compat   | T-179-14..18           | integration          | `vitest run test/referral-partners test/auth --no-watch`                                                                          | ❌ → crea   | ⬜ pending |
| 179-05 | 5    | D-11/D-13/D-17           | Flip + comisión en 4 charge-paths, idempotencia, monedas, `paquete` | T-179-19..23           | integration          | `vitest run test/referral-partners --no-watch`                                                                                    | ❌ → crea   | ⬜ pending |
| 179-06 | 6    | D-09/D-10/D-20           | One-shot, gana-el-mayor, saldo AURA intacto, `perdio_vs_aura`       | T-179-24..27           | integration          | `vitest run test/referral-partners --no-watch`                                                                                    | ❌ → crea   | ⬜ pending |
| 179-07 | 7    | D-09/D-10                | Descuento en cambio/renovación + paridad exacta preview↔cobro       | T-179-28..30           | integration          | `vitest run test/referral-partners test/referrals --no-watch`                                                                     | ❌ → crea   | ⬜ pending |
| 179-08 | 8    | D-05/D-06/D-07/D-18/D-19 | Semana 7d/3 clases/bonificada, vencimiento, sin doble gratis        | T-179-31..35           | integration          | `vitest run test/referral-partners test/scheduling --no-watch`                                                                    | ❌ → crea   | ⬜ pending |
| 179-09 | 9    | D-12/D-14/D-15           | Void en cascada, `settled` intactas, retroactiva 404/409, carrera   | T-179-36..40           | integration          | `vitest run test/referral-partners test/finance --no-watch`                                                                       | ❌ → crea   | ⬜ pending |
| 179-10 | 10   | D-08/D-13/D-16           | Liquidación batch idempotente, gate económico, 2 reportes           | T-179-41..45           | integration          | `vitest run test/referral-partners --no-watch`                                                                                    | ❌ → crea   | ⬜ pending |
| 179-11 | 11   | D-13/D-20                | Página /partners con CRUD, RBAC de ruta, código inmutable           | T-179-46..48           | build+types          | `vue-tsc --noEmit` + `lint` + `build` (admin)                                                                                     | n/a         | ⬜ pending |
| 179-12 | 12   | D-01/D-04/D-20           | URLs de tienda configurables + 2 PNG sin dependencias nuevas        | T-179-49..51           | integration + build  | `vitest run test/referral-partners/store-urls.test.ts` + `vue-tsc`/`build` admin                                                  | ❌ → crea   | ⬜ pending |
| 179-13 | 13   | D-08/D-16/D-20           | Tabs de conversiones y liquidación, confirmación informada          | T-179-52..54           | build+types          | `vue-tsc --noEmit` + `lint` + `build` (admin)                                                                                     | n/a         | ⬜ pending |
| 179-14 | 14   | D-09/D-14/D-15           | Retroactiva y revocación en la ficha, línea de descuento en el PoS  | T-179-55..57           | build+types          | `vue-tsc --noEmit` + `lint` + `build` (admin)                                                                                     | n/a         | ⬜ pending |
| 179-15 | 15   | D-01/D-02/D-03           | Campo unificado de código, normalización, back-compat del payload   | T-179-58..60           | unit+build           | `vitest run test/signup-code.test.ts` + `vue-tsc`/`lint` (app)                                                                    | ❌ → crea   | ⬜ pending |
| 179-16 | 16   | D-05/D-06/D-07/D-19      | Estado de semana en la grilla, activación, vencimiento, bump        | T-179-61..63           | build+types          | `vue-tsc --noEmit` + `lint` + `vitest run` + `build` (app)                                                                        | n/a         | ⬜ pending |
| 179-17 | 17   | D-01/D-04/D-13/D-20      | Verificación integral + UAT humano en AR y ES                       | T-179-64..66, T-179-SC | integration + manual | Task 1 automatizada; Tasks 2-3 checkpoints humanos                                                                                | n/a         | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `el-templo-api/test/referral-partners/` — carpeta nueva del módulo, creada en el plan 179-02 junto con `_helpers.ts` (`insertPartner`, `insertPartnerLink`, `partnerLinkRow`, `partnerCommissionRows`, `nextCode`)
- [ ] Las 3 tablas nuevas agregadas a la limpieza de datos de test (orden de FK: comisiones → vínculos → partners)
- [ ] Conteos hardcodeados de `test/db/tenant-tables.test.ts` bumpeados (88→91 / 92→95) — plan 179-01
- [ ] `ENTRADAS_BASELINE` de `test/tenancy/iso-01-manifiesto.test.ts` bumpeado por cada plan que agrega rutas: 179-03 (+4), 179-08 (+2), 179-09 (+2), 179-10 (+3), 179-12 (+2) = **+13** sobre el valor vigente (370 al 2026-08-22 → 383)
- [ ] Framework: **no hace falta instalar nada** — vitest ya está configurado en API y app

---

## Manual-Only Verifications

| Behavior                                      | Decisión  | Why Manual                                                                     | Test Instructions                                                        |
| --------------------------------------------- | --------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| QRs escanean a las tiendas correctas          | D-01/D-04 | Requiere dispositivo físico y el Apple ID numérico, que no está en el repo     | Plan 179-17 Task 2: descargar PNGs del admin y escanear en Android e iOS |
| Código legible a tamaño de impresión          | D-01/D-04 | Juicio visual sobre el arte impreso                                            | Plan 179-17 Task 2, paso 3                                               |
| UAT del flujo completo en ambas monedas       | D-13      | Datos reales de sedes AR y ES + criterio de negocio                            | Plan 179-17 Task 3, 10 pasos por país                                    |
| Decisión de shipping (staging/master, builds) | —         | Gate humano del proyecto: nunca pushear ni deployar sin autorización explícita | Plan 179-17 Task 3, sección de decisión                                  |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or son checkpoints humanos declarados (plan 179-17)
- [x] Sampling continuity: ningún plan tiene 3 tareas seguidas sin verificación automatizada
- [x] Wave 0 cubre las referencias MISSING (carpeta de tests + fixtures + conteos de gates)
- [x] No watch-mode flags (`--no-watch` explícito en todos los comandos)
- [x] Feedback latency < 120 s
- [x] `nyquist_compliant: true`

**Approval:** listo para ejecución
