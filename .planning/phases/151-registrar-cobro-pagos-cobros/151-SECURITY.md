---
phase: 151
slug: registrar-cobro-pagos-cobros
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-03
---

# Phase 151 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary                                          | Description                                                                                                                                      | Data Crossing                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| PoS client → coach-load API                       | Untrusted body (`bankAccountId`, `paymentMethod`, `amount`) crosses aquí; JWT establece rol                                                      | Datos financieros de cobro                 |
| coach-load route → subscriptions service          | `cashRegisterIdOverride` es trusted-internal: SOLO se setea después de `assertChosenBankAccount`; ningún otro caller lo puebla desde body crudo  | ID de caja destino de imputación           |
| admin SPA → coach-load / cash-register create API | La UI envía `bankAccountId` y oculta el botón de alta rápida; los checks autoritativos son server-side                                           | `bankAccountId`, payload de alta de cuenta |
| operator (admin SPA) → API                        | `branchId` (sucursalId) elegido por el operador se persiste como `branch_id` en subscription Y charge — campo de atribución financiera/membresía | `branchId`                                 |
| browser route → admin SPA                         | Rename /pagos→/cobros, landing por rol, fallback role-denied; sin superficie server nueva                                                        | Navegación                                 |

---

## Threat Register

| Threat ID    | Category              | Component                                      | Disposition | Mitigation                                                                                                                                                                                                                                                                                           | Status |
| ------------ | --------------------- | ---------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| T-151-01     | Tampering/IDOR        | `bankAccountId` en los 3 POST bodies           | mitigate    | `assertChosenBankAccount` (banco+active+currency → 400) `cash-register-service.ts:166-187`; guard compartido `validateBankAccountForCharge` `coach-load-routes.ts:346-369` en los 4 paths (settle :486, renew :547, misc :617, alta :724); matriz de rechazo testeada `coach-load.test.ts:1084-1276` | closed |
| T-151-02     | Elevation             | GET /coach-load/bank-accounts                  | mitigate    | Bajo `onRequest` FINANCE_LOAD_ROLES `coach-load-routes.ts:247-258, 913-936`; respuesta lean `{id,name,currency}` sin saldos `cash-register-service.ts:133-152`; coach sigue 403 en `/cash-registers` admin (testeado :1313-1341)                                                                     | closed |
| T-151-03     | Tampering             | Invariante server-derived v5.3                 | mitigate    | `additionalProperties:false` retenido en los 3 schemas `coach-load-routes.ts:120, 144, 171`; `cashRegisterId`/`validationStatus`/`recordedBy` siguen rechazados/derivados; solo `bankAccountId` es nuevo y validado server-side                                                                      | closed |
| T-151-11-p01 | Tampering             | `cashRegisterIdOverride`                       | mitigate    | Solo en inputs internos `types.ts:300, 359`, consumido `service.ts:1171, 3579`; único writer es la ruta coach-load POST-validación (:565, :806); en ningún body schema de ruta                                                                                                                       | closed |
| T-151-07     | Elevation             | Acceso ruta /cobros                            | mitigate    | `meta.allowedRoles: PAGOS_ROLES` sin cambios `routes.ts:118`; redirect /pagos→/cobros :122; autoridad real = FINANCE_LOAD_ROLES en API (149 D-04)                                                                                                                                                    | closed |
| T-151-04     | Elevation             | Quick-create "+ Nueva cuenta"                  | mitigate    | `canCreateBankAccount` = owner\|admin `CobrosPage.vue:908-910` en cada affordance (:514, :528, :547, :657); gate real = ADMIN_ROLES en la ruta de alta (fase 150)                                                                                                                                    | closed |
| T-151-09-p04 | Tampering/IDOR        | `selectedBankAccountId` en confirm payload     | mitigate    | Re-validado server-side por `assertChosenBankAccount`; id ajeno/tampereado → 400 (testeado)                                                                                                                                                                                                          | closed |
| T-151-10-p04 | Business-logic        | Finalizar transfer/card sin cuenta             | mitigate    | UI bloquea (`canConfirm` `CobrosPage.vue:981`, `primaryActionDisabled` :1045); server rechaza independientemente → 400 `coach-load-routes.ts:361-369` (testeado)                                                                                                                                     | closed |
| T-151-09-p05 | Repudiation/Tampering | Atribución `branchId` en subscription + charge | mitigate    | Selector de Sede editable restaurado para TODA alta `CobrosPage.vue:329-343` (fix CR-01, plan 151-05); sede visible read-only en `CobroResumen.vue:25-30`; `requireBranchAccess` preHandler server-side `coach-load-routes.ts:702`                                                                   | closed |
| T-151-05     | Tampering             | `bankAccountId` reenviado por composable       | accept      | Valor cliente untrusted by design; `assertChosenBankAccount` server-side es la autoridad                                                                                                                                                                                                             | closed |
| T-151-06     | Info disclosure       | Respuesta listBankAccounts                     | accept      | Solo `{id,name,currency}`, sin saldos; gated server-side; shape exacto asertado en test                                                                                                                                                                                                              | closed |
| T-151-08     | Tampering             | Payload de cobro armado en cliente (p03)       | accept      | El wizard reenvía los mismos campos que la página vieja; derivación/validación server-side autoritativa                                                                                                                                                                                              | closed |
| T-151-10-p05 | Tampering             | Payload de cobro armado en cliente (p05)       | accept      | Sin campo nuevo en body; `branchId` solo vuelve a ser visible/editable (diseño fase 148)                                                                                                                                                                                                             | closed |
| T-151-11-p05 | Elevation             | Fallback router role-denied (/cobros)          | accept      | Redirect client-side only `index.ts:53-59`; gate FINANCE_LOAD_ROLES en API es la autoridad                                                                                                                                                                                                           | closed |
| T-151-SC     | Supply chain          | Package installs (×5 planes)                   | accept      | Verificado por git: ningún `package.json`/`pnpm-lock` tocado en los commits de la fase (`30e79f51..2841889b`); sin dependencias nuevas                                                                                                                                                               | closed |

_Status: open · closed_
_Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)_

**Nota de IDs:** los planes 151-04 y 151-05 reusaron los IDs T-151-09/10/11 para amenazas distintas; se distinguen con sufijo `-p04`/`-p05`.

---

## Accepted Risks Log

| Risk ID   | Threat Ref              | Rationale                                                                                 | Accepted By                | Date       |
| --------- | ----------------------- | ----------------------------------------------------------------------------------------- | -------------------------- | ---------- |
| AR-151-01 | T-151-05                | El cliente nunca es autoridad; validación server-side completa existe y está testeada     | plan 151-02 (gsd)          | 2026-07-03 |
| AR-151-02 | T-151-06                | Respuesta lean sin datos sensibles, endpoint gated por rol                                | plan 151-02 (gsd)          | 2026-07-03 |
| AR-151-03 | T-151-08 / T-151-10-p05 | El wizard no agrega campos al body; derivación server-side autoritativa (invariante v5.3) | planes 151-03/151-05 (gsd) | 2026-07-03 |
| AR-151-04 | T-151-11-p05            | Routing client-side no otorga acceso; API gate es la autoridad (149 D-04)                 | plan 151-05 (gsd)          | 2026-07-03 |
| AR-151-05 | T-151-SC                | Sin dependencias nuevas en toda la fase (git-verificado)                                  | planes 151-01..05 (gsd)    | 2026-07-03 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By                      |
| ---------- | ------------- | ------ | ---- | --------------------------- |
| 2026-07-03 | 15            | 15     | 0    | gsd-security-auditor (opus) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-03
