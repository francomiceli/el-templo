---
phase: 164
slug: pantalla-tv-de-sucursal-plani-viva-por-bloque-con-timer-por
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-24
---

# Phase 164 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Formaliza la sección "Validation Architecture" de `164-RESEARCH.md`.

---

## Test Infrastructure

| Property               | Value                                                                                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Framework**          | vitest (API — `el-templo-api/vitest.config.ts`, forks, DB real `eltemplo_test_<POOL_ID>`). Admin: **NINGUNO** (sin test runner ni typecheck en CI) — toda la lógica derivable vive en el API |
| **Config file**        | `el-templo-api/vitest.config.ts` + `test/setup.ts` + `test/setup-global.ts`                                                                                                                  |
| **Quick run command**  | `cd el-templo-api && pnpm vitest run test/tv/<archivo>.test.ts`                                                                                                                              |
| **Full suite command** | `cd el-templo-api && pnpm test` — **solo en CI** (regla del proyecto C-11)                                                                                                                   |
| **Estimated runtime**  | ~30-60 s por archivo de test/tv (DB real)                                                                                                                                                    |

---

## Sampling Rate

- **After every task commit:** `pnpm vitest run test/tv/<archivo relevante>` + `npx tsc --noEmit` (API) + `npx vue-tsc --noEmit` (admin — CI NO typechequea frontends) + `npx tsc -p tsconfig.tv.json --noEmit` (kiosco ES2015)
- **After every plan wave:** suite completa en CI al pushear a staging (nunca local)
- **Before `/gsd:verify-work`:** CI verde + checkpoint humano D-20 en TV real (plan 164-13)
- **Max feedback latency:** ~120 s (vitest run de un archivo contra MySQL real)

---

## Per-Task Verification Map

| Task ID   | Plan | Wave | Requirement                                          | Threat Ref   | Secure Behavior                                                                               | Test Type                | Automated Command                                                                          | File Exists | Status     |
| --------- | ---- | ---- | ---------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------ | ----------- | ---------- |
| 164-01-\* | 01   | 1    | D-03/D-04 (schema, fsp:3)                            | T-164-01..   | token hash sha256, nunca plaintext en DB                                                      | integration              | `pnpm vitest run test/tv/tv-device-poll.test.ts` (round-trip ms)                           | ❌ W0       | ⬜ pending |
| 164-02-\* | 02   | 1    | D-16/D-17/D-18 (TimerSpec)                           | —            | N/A (lógica pura)                                                                             | unit                     | `pnpm vitest run test/tv/tv-timer-spec.test.ts` (+ emite `timer-vectors.json`)             | ❌ W0       | ⬜ pending |
| 164-03-\* | 03   | 2    | D-01/D-02/D-03 (pairing RFC 8628)                    | T-164-\*     | `user_code` sin `device_code` NO devuelve token; claim único (409); solo owner/coach          | integration              | `pnpm vitest run test/tv/tv-pairing.test.ts`                                               | ❌ W0       | ⬜ pending |
| 164-04-\* | 04   | 2    | D-20/D-22/D-24 (pipeline kiosco)                     | T-164-SC     | cero deps nuevas; exit 1 si falla build                                                       | build                    | `node el-templo-admin/scripts/build-tv.mjs` + `npx tsc -p tsconfig.tv.json --noEmit`       | n/a         | ⬜ pending |
| 164-05-\* | 05   | 3    | D-06..D-09/D-14/D-15/D-23 (roster/class-day/service) | T-164-20..24 | branch_id SIEMPRE de la fila del device; payload sin PII; idle sin mensaje de error           | integration              | `pnpm vitest run test/tv/tv-class-day.test.ts` (ROM sábado, TZ Europe/Madrid, no aprobada) | ❌ W0       | ⬜ pending |
| 164-06-\* | 06   | 3    | D-20/D-24 (CSS compat + diag)                        | —            | N/A                                                                                           | build + manual `?diag=1` | `npx tsc -p tsconfig.tv.json --noEmit`                                                     | n/a         | ⬜ pending |
| 164-07-\* | 07   | 3    | D-16/D-17/D-19 (timer TV + selftest)                 | —            | N/A                                                                                           | golden vectors           | `/tv/?selftest=1` corre `timer-vectors.json` contra `phaseAt()`                            | ❌ W0       | ⬜ pending |
| 164-08-\* | 08   | 4    | D-03/D-04/D-05/D-07/D-09 (poll)                      | T-164-20..23 | token revocado ⇒ 401; expire-on-read por `class_date` en TZ sede; `last_seen_at` en cada poll | integration              | `pnpm vitest run test/tv/tv-device-poll.test.ts`                                           | ❌ W0       | ⬜ pending |
| 164-09-\* | 09   | 3    | D-01/D-05 (TvDevicesPage)                            | —            | menú solo roles habilitados                                                                   | typecheck                | `npx vue-tsc --noEmit`                                                                     | n/a         | ⬜ pending |
| 164-10-\* | 10   | 5    | D-10..D-15/D-17 (control writes)                     | T-164-\*     | `canAccessBranch`; last-write-wins; cambio de nivel NO resetea timer, bloque SÍ               | integration              | `pnpm vitest run test/tv/tv-control.test.ts`                                               | ❌ W0       | ⬜ pending |
| 164-11-\* | 11   | 5    | D-06/D-08/D-22 (runtime kiosco)                      | —            | reload solo en reposo                                                                         | manual/selftest          | `/tv/?selftest=1` + `?diag=1`                                                              | n/a         | ⬜ pending |
| 164-12-\* | 12   | 6    | D-13/D-18/D-19 (botonera)                            | —            | sin control "saltar ronda" (gate explícito)                                                   | typecheck                | `npx vue-tsc --noEmit`                                                                     | n/a         | ⬜ pending |
| 164-13-\* | 13   | 7    | D-20/D-21 (runbook + hardware)                       | —            | —                                                                                             | **manual-only**          | `checkpoint:human-verify` en TV real contra staging                                        | —           | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `el-templo-api/test/tv/tv-pairing.test.ts` — stubs D-01/D-02/D-03 + RFC 8628 split
- [ ] `el-templo-api/test/tv/tv-device-poll.test.ts` — D-03/D-04/D-05/D-07, round-trip fsp:3, `serverNow`
- [ ] `el-templo-api/test/tv/tv-control.test.ts` — D-10/D-11/D-12/D-15/D-17
- [ ] `el-templo-api/test/tv/tv-class-day.test.ts` — ROM/sábado (D-23), TZ ES vs AR, sin sesión aprobada (D-09)
- [ ] `el-templo-api/test/tv/tv-timer-spec.test.ts` — unit puro; **emite `test/tv/__fixtures__/timer-vectors.json`**
- [ ] `el-templo-api/test/helpers.ts` — agregar tablas nuevas a `TABLES_TO_CLEAN`
- [ ] Fixture helper de sesión aprobada multi-nivel de un día
- [ ] Self-test del kiosco `/tv/?selftest=1` (único mecanismo automático sobre hardware real)
- [ ] Framework install: **ninguno** (no se agrega vitest al admin — dispararía C-08)

---

## Manual-Only Verifications

| Behavior                                        | Requirement | Why Manual                                                              | Test Instructions                                                                                                                                    |
| ----------------------------------------------- | ----------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| La página carga y renderiza en el TV real       | D-20/D-24   | Sin hardware disponible para agentes; browsers de smart TV no emulables | Plan 164-13: abrir `https://admin.eltemplo.org/tv/` en el TV de una sede contra staging, verificar con `?diag=1`, checkpoint:human-verify BLOQUEANTE |
| Cambio de `version.txt` recarga solo en reposo  | D-22        | Requiere deploy real + observación del kiosco                           | Deploy a staging con el TV abierto en reposo; confirmar reload; repetir con bloque activo y confirmar que NO recarga                                 |
| Beeps audibles tras activarlos desde el celular | D-19        | Política de autoplay depende del browser del TV                         | Activar sonido desde el control en clase de prueba; documentar resultado en el runbook                                                               |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (verificado por gsd-plan-checker)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-24
