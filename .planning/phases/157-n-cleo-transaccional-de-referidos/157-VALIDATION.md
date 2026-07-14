---
phase: 157
slug: n-cleo-transaccional-de-referidos
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-10
---

# Phase 157 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Materializa la sección `## Validation Architecture` de `157-RESEARCH.md`.

---

## Test Infrastructure

| Property               | Value                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------- |
| **Framework**          | vitest ^4.0.18 (integración contra MySQL real `eltemplo_test_<POOL_ID>`)               |
| **Config file**        | `el-templo-api/vitest.config.ts` + `test/setup.ts` (aplica migraciones al provisionar) |
| **Quick run command**  | `cd el-templo-api && pnpm vitest run test/referrals/<archivo tocado>`                  |
| **Full suite command** | `cd el-templo-api && pnpm test` — **corre en CI, NO local** (convención del repo)      |
| **Estimated runtime**  | ~60s por archivo de test local (MySQL real, ~500ms/test)                               |

---

## Sampling Rate

- **After every task commit:** `pnpm vitest run test/referrals/<archivo tocado>` + `npx tsc --noEmit`
- **After every plan wave:** `pnpm vitest run test/referrals/ test/auth/register.test.ts test/subscriptions/` (solo los archivos tocados por la wave; suite completo queda para CI)
- **Before `/gsd:verify-work`:** suite completo verde en CI (push a staging)
- **Max feedback latency:** ~120 seconds

---

## Per-Task Verification Map

| Task ID   | Plan | Wave | Requirement                          | Threat Ref   | Secure Behavior                                                                                                     | Test Type      | Automated Command                                                                             | File Exists         | Status     |
| --------- | ---- | ---- | ------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------- | ------------------- | ---------- |
| 157-01-\* | 01   | 1    | REF-01, REF-04, AURA-02, DESC-04     | T-157-01/02  | `referrals.referredId` UNIQUE + check auto-referido a nivel DB                                                      | integration    | `pnpm vitest run test/referrals/code-generation.test.ts`                                      | ❌ W0               | ⬜ pending |
| 157-02-\* | 02   | 2    | REF-01, DESC-02/03/04/05, AURA-01/02 | T-157-05/06  | Descuento server-side no-discrecional; anotación sin inflar saldo                                                   | integration    | `pnpm vitest run test/referrals/discount-computation.test.ts`                                 | ❌ W0               | ⬜ pending |
| 157-03-\* | 03   | 3    | REF-02, REF-03, REF-04               | T-157-01..04 | `referredBy` nunca del body en flujos admin; código inválido = ignore silencioso, registro nunca bloquea            | integration    | `pnpm vitest run test/referrals/anti-fraud.test.ts test/auth/register.test.ts`                | ❌ W0 / ✅ extender | ⬜ pending |
| 157-04-\* | 04   | 3    | DESC-01, DESC-02/03, AURA-01         | T-157-07..10 | Cualificación solo con `pricePaid > 0`; el cobro que cualifica ya descuenta (D-21); idempotencia por subscriptionId | integration    | `pnpm vitest run test/referrals/qualification.test.ts test/referrals/discount-charge.test.ts` | ❌ W0               | ⬜ pending |
| 157-05-\* | 05   | 4    | REF-02, REF-03 (UI)                  | T-157-01     | El badge `?ref` es optimista; server valida; el alta nunca se bloquea por atribución                                | manual + build | `npx quasar build` (app + admin) + checkpoint visual                                          | —                   | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `el-templo-api/test/referrals/code-generation.test.ts` — REF-01 (unicidad, formato `PREFIJO-XXXX`, generación eager al alta)
- [ ] `el-templo-api/test/referrals/anti-fraud.test.ts` — REF-04 (auto-referido, doble referidor, dedup DNI)
- [ ] `el-templo-api/test/referrals/qualification.test.ts` — DESC-01 (`pricePaid > 0` cualifica; plan bonificado 0 NO cualifica; **el cobro que cualifica ya refleja el descuento del payer si su referidor está activo — D-21**)
- [ ] `el-templo-api/test/referrals/discount-computation.test.ts` — DESC-02/03/04/05 (simétrico, suspende/reactiva por cobertura de la contraparte, tope, 4 charge-paths + preview)
- [ ] `el-templo-api/test/referrals/aura-annotation.test.ts` — AURA-01 (balance gastable intacto, idempotencia por cobro/subscriptionId)
- [ ] Fixtures: reusar `el-templo-api/test/subscriptions/_helpers.ts` (createPlan/createMember/assignPlan/recordPayment)
- [ ] Framework install: ninguno (vitest ya presente)

---

## Manual-Only Verifications

| Behavior                                                | Requirement | Why Manual                            | Test Instructions                                                                                             |
| ------------------------------------------------------- | ----------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Badge de referido visible al abrir `/register?ref=CODE` | REF-02 (UI) | Render visual (no hay e2e de browser) | Abrir la app con `?ref=` válido → badge amber sobre la card; con código inválido → sin badge, registro normal |
| Campo "¿Quién lo trajo?" en alta admin                  | REF-03 (UI) | Render visual + UX de búsqueda        | Alta de alumno en admin → buscar socio en el selector, crear, verificar vínculo en DB                         |
