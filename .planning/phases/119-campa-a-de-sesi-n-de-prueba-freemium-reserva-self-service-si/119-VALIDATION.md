---
phase: 119
slug: campa-a-de-sesi-n-de-prueba-freemium-reserva-self-service-si
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-01
---

# Phase 119 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Project rule (MEMORY): el suite de tests corre en **CI tras push a staging**, NO local. Local solo `typecheck`. Las celdas "Automated Command" abajo son los comandos que corre **CI**; el ejecutor corre `pnpm typecheck` / `vue-tsc` local.

---

## Test Infrastructure

| Property                      | Value                                                                                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Framework**                 | Vitest 4.0.18 (API, integración contra MySQL real `eltemplo_test`); `vue-tsc` typecheck (app/admin)                                                              |
| **Config file**               | `el-templo-api/vitest.config.ts` (sequential, 30s timeout)                                                                                                       |
| **Quick run command (local)** | `cd el-templo-api && pnpm typecheck` (member/admin: `npx vue-tsc --noEmit`)                                                                                      |
| **Full suite command (CI)**   | `cd el-templo-api && pnpm test` (corre en CI tras push a staging)                                                                                                |
| **Estimated runtime**         | ~90s suite API en CI                                                                                                                                             |
| **Helpers**                   | `el-templo-api/test/helpers.ts` (`createTestApp`, `getAuthToken`, `createTestMember`, `createTestPlan`, `assignTestPlan`, `createStaffUser`, `cleanAllTestData`) |

> **Convención de nombres de test (flat):** los archivos de test viven directamente bajo `el-templo-api/test/` con nombres planos separados por guiones (p.ej. `test/campaigns-send.test.ts`), NO en subdirectorios. Esta tabla refleja los nombres reales que crean los planes 01/03/04/02.

---

## Sampling Rate

- **After every task commit:** `pnpm typecheck` (API) / `vue-tsc --noEmit` (frontend) — local, rápido.
- **After every plan wave:** push a staging → CI corre el suite completo de integración.
- **Before `/gsd:verify-work`:** suite de CI en verde sobre staging.
- **Max feedback latency:** local typecheck < 30s; CI ~varios min tras push.

---

## Per-Task Verification Map

| Task area                                                                  | Plan  | Wave | Requirement (D)                                | Threat Ref | Secure Behavior                                                        | Test Type            | Automated Command (CI)                                                                                   | File Exists | Status     |
| -------------------------------------------------------------------------- | ----- | ---- | ---------------------------------------------- | ---------- | ---------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------- | ----------- | ---------- |
| Schema branches.address + bookings.source + campaign tables + migración    | 01    | 1    | D-24, D-02, D-12, D-15, D-18                   | —          | Migración aplicada en `_migrations`; sin `;` en comentarios SQL        | migration apply      | `pnpm db:migrate` (idempotente); validada indirectamente por los tests de campaña abajo                  | n/a         | ⬜ pending |
| Email template MJML render (VML/paleta/sin CDN/alt)                        | 01→02 | 1    | D-16, D-23                                     | —          | Sin fuentes por CDN; sin azul; VML para Outlook; alt en imágenes       | integration (render) | `pnpm test -- test/campaigns-template.test.ts`                                                           | ❌ W0       | ⬜ pending |
| MJML + EmailService.sendCampaignBatch + template responsive                | 02    | 1    | D-16, D-23, D-13, D-27                         | —          | Sin fuentes por CDN; imágenes self-host                                | integration (render) | `pnpm test -- test/campaigns-template.test.ts`                                                           | ❌ W0       | ⬜ pending |
| reserve-trial (promoción atómica + booking) + 30d window + cancel guard    | 03    | 2    | D-01, D-02, D-03, D-05, D-06, D-07, D-20, D-26 | T-119-RT   | Revalida elegibilidad server-side; transacción atómica; una-por-vida   | integration          | `pnpm test -- test/scheduling-reserve-trial.test.ts`                                                     | ❌ W0       | ⬜ pending |
| trial-eligibility endpoint                                                 | 03    | 2    | D-08, D-20                                     | T-119-RT   | Requiere sesión autenticada del miembro                                | integration          | `pnpm test -- test/scheduling-trial-eligibility.test.ts`                                                 | ❌ W0       | ⬜ pending |
| HMAC token + tracking pixel/click/unsub                                    | 04    | 2    | D-18, D-21, D-15, D-25                         | T-119-TOK  | Token NO autoriza; sin enumeración/PII; click → app.eltemplo.org       | integration          | `pnpm test -- test/campaign-token.test.ts test/campaigns-tracking.test.ts`                               | ❌ W0       | ⬜ pending |
| Audience query + batch send (idempotente) + create/list/funnel admin       | 04    | 2    | D-08, D-09, D-10, D-11, D-12, D-19             | T-119-SEND | Idempotencia de envío; excluye unsubscribe; admin-only                 | integration          | `pnpm test -- test/campaigns-audience.test.ts test/campaigns-send.test.ts test/campaigns-funnel.test.ts` | ❌ W0       | ⬜ pending |
| ReservasPage 3 estados (modo prueba)                                       | 05    | 3    | D-22, D-06, D-20                               | —          | —                                                                      | typecheck + manual   | `npx vue-tsc --noEmit`                                                                                   | n/a         | ⬜ pending |
| Deep links (App Links/Universal Links + .well-known en app.eltemplo.org)   | 05    | 3    | D-25, D-14                                     | T-119-DL   | `.well-known` (app.eltemplo.org) verifica ownership del dominio        | manual (device)      | —                                                                                                        | n/a         | ⬜ pending |
| Admin "Campañas" (list + funnel + create + send)                           | 06    | 3    | D-18, D-19, D-11                               | T-119-SEND | Acceso owner/admin                                                     | typecheck + manual   | `npx vue-tsc --noEmit`                                                                                   | n/a         | ⬜ pending |
| Prod infra: Resend domain + API key + .well-known reachable + primer envío | 07    | 4    | D-13, D-17, D-25, D-27                         | T-119-SEND | Dominio verificado; API key en prod; `.well-known` en app.eltemplo.org | manual (infra gates) | —                                                                                                        | n/a         | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

Plan 01 crea los scaffolds de test (RED) que las Waves 1-2 ponen GREEN. **Nombres flat reales** (coinciden 1:1 con los planes ejecutables):

- [ ] `test/scheduling-reserve-trial.test.ts` — reserva self-service + promoción atómica + guards (Plan 03)
- [ ] `test/scheduling-trial-eligibility.test.ts` — endpoint de elegibilidad (Plan 03)
- [ ] `test/campaign-token.test.ts` — token HMAC firma/valida; no autoriza (Plan 04)
- [ ] `test/campaigns-audience.test.ts` — audiencia D-08/09/10 (Plan 04)
- [ ] `test/campaigns-tracking.test.ts` — pixel/click/unsubscribe; click → app.eltemplo.org (Plan 04)
- [ ] `test/campaigns-send.test.ts` — create draft + envío idempotente (Resend mockeado) (Plan 04)
- [ ] `test/campaigns-funnel.test.ts` — funnel por campaña (Plan 04)
- [ ] `test/campaigns-template.test.ts` — render del template MJML compilado: VML/roundrect, paleta cálida sin azul, sin `@font-face`/CDN de fuentes, `alt` en imágenes (GREEN en Plan 02)
- [ ] `test/helpers.ts` — extender con `createEligibleFreemium` + `createTestCampaign`/`createTestSend` + 4 tablas de campaña en `TABLES_TO_CLEAN`

> El schema (Plan 01) se valida vía `pnpm db:migrate` (aplica 0132/0133/0134 en `_migrations`) y, transitivamente, por los tests de campaña/scheduling que corren contra esas tablas en MySQL real. No hay un `schema.test.ts` dedicado.

---

## Manual-Only Verifications

| Behavior                                        | Requirement | Why Manual                                    | Test Instructions                                                                                                                                                                                           |
| ----------------------------------------------- | ----------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Render del email cross-cliente                  | D-16        | No automatizable sin servicio tipo Litmus     | Enviar a casillas de prueba (Gmail, Apple Mail iOS, Outlook desktop, dark mode) y verificar layout/imágenes/botones                                                                                         |
| Deep link abre la app en la pantalla de reserva | D-25        | Requiere dispositivo físico con app instalada | En Android/iOS con la app instalada, tocar el link del email (`app.eltemplo.org/r/trial`) → abre app en modo prueba; sin app nativa → cae a la web app en `app.eltemplo.org` (NO a la landing eltemplo.org) |
| Asistencia a la trial vía coach check-in        | D-01, D-18  | Flujo operativo del coach en sede             | Coach hace check-in del freemium en 'prueba'; verificar que el funnel marca "asistió"                                                                                                                       |
| Verificación de dominio en Resend + envío real  | D-17        | Acción de infra/DNS                           | Verificar `send.eltemplo.org` en Resend, setear API key prod, enviar campaña de prueba                                                                                                                      |

---

## Validation Sign-Off

- [x] Todas las tareas tienen verificación `<automated>` (CI) o dependencia de Wave 0, o están en Manual-Only con justificación
- [x] Continuidad de sampling: typecheck local tras cada commit; suite CI por wave
- [x] Wave 0 cubre las referencias MISSING (8 scaffolds en Plan 01, incl. `campaigns-template.test.ts`)
- [x] Paths de test alineados flat 1:1 con los planes ejecutables (01/02/03/04)
- [x] Sin flags watch-mode
- [x] `nyquist_compliant: true`

**Approval:** approved 2026-06-01
</content>
