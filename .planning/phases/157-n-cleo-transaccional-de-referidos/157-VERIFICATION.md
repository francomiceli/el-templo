---
phase: 157-n-cleo-transaccional-de-referidos
verified: 2026-07-10T22:28:38Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
---

# Phase 157: Núcleo transaccional de referidos Verification Report

**Phase Goal:** El sistema de referidos funciona end-to-end del lado de la plata: se atribuye quién trajo a quién (por ambos canales), el primer pago del referido activa el vínculo, y el descuento simétrico condicional se aplica solo en cada cobro. End state: un socio con vínculos qualified y contraparte activa paga menos su cuota automáticamente, con anotación interna en AURA y sin poder administrar ese crédito.
**Verified:** 2026-07-10T22:28:38Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| #   | Truth                                                                                                                                                                            | Status     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Un socio nuevo con `?ref=CODE` queda vinculado a su referidor; recepción puede atribuir el referidor al alta (ambos canales escriben `users.referredBy`)                         | ✓ VERIFIED | `auth/routes.ts:283-315` (self_service, `resolveReferralCode` server-side, `UPDATE users SET referredBy` + `INSERT referrals(status='pending', attributionChannel='self_service')`); `members/service.ts:708-770` (assisted, `referredBy` persistido en el insert de user + `INSERT referrals(...attributionChannel:'assisted', createdBy)`); ordering confirmado: `members/routes.ts:640` (`createMember`) se ejecuta antes de `assignPlan` en `:667` |
| 2   | El sistema rechaza auto-referido y doble-referidor, y respeta el dedup por DNI                                                                                                   | ✓ VERIFIED | Guard `referrerId !== newUserId` en ambos canales (`auth/routes.ts:293`, `members/service.ts:750`); `referred_id UNIQUE` a nivel DB en `0176_referrals_core.sql` + schema `referrals.ts:40-43`; dedup DNI reusado sin reconstrucción (fase 148), test explícito `anti-fraud.test.ts` caso (e) → 409                                                                                                                                                    |
| 3   | El primer pago del referido marca el vínculo `qualified`                                                                                                                         | ✓ VERIFIED | `qualifyReferralOnCharge` (`subscriptions/service.ts:404`) gateado por `pricePaid>0` (D-20), invocado ANTES del cómputo del descuento en las 4 charge-paths (`:1354`, `:3105`, `:3603`, `:3943`); delega en `ReferralService.qualifyFirstPayment` (`UPDATE ... WHERE status='pending'`, idempotente)                                                                                                                                                   |
| 4   | Al cobrar la cuota de cualquiera de las dos partes, el descuento simétrico se calcula y aplica automáticamente solo si ambos están activos, acumulando por vínculo hasta el tope | ✓ VERIFIED | `computeReferralDiscountPercent` (`referrals/service.ts:157-188`) usa SOLO `deriveCoveredUntil` de la contraparte (nunca `users.status`), `Math.min(activos*pct, cap)`; cableado en las 4 charge-paths + `getPricingPreview` (`:4413-4428`, read-only, preview parity); tests `discount-computation.test.ts` (0/10/40-cap/vencido/bidireccional) y `discount-charge.test.ts` (simetría, composición con auraSpend)                                     |
| 5   | Cada descuento aplicado deja una anotación `sourceType:"referral"` sin alterar el saldo AURA gastable del socio                                                                  | ✓ VERIFIED | `recordReferralCredit` (`referrals/service.ts:216-240`): INSERT en `referral_credits` (idempotente por `subscriptionId` UNIQUE) + INSERT directo en `aura_transactions` `amount=0 sourceType='referral'` (nunca `AuraService.award/spend`); test `aura-annotation.test.ts` asserta balance idéntico antes/después + idempotencia                                                                                                                       |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact                                                                        | Expected                                                                                                                                           | Status     | Details                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/db/schema/referrals.ts`                                      | Modelo del vínculo (status/attributionChannel enums, referredId UNIQUE)                                                                            | ✓ VERIFIED | Existe, enums a module scope, `referredId.unique()`, self-FK `createdBy` con `AnyMySqlColumn`                                                                                                                                                                                          |
| `el-templo-api/src/db/schema/referral-credits.ts`                               | Registro auditable append-only                                                                                                                     | ✓ VERIFIED | `uniqueIndex("unique_referral_credit_sub").on(subscriptionId)` presente                                                                                                                                                                                                                |
| `el-templo-api/src/db/migrations/0176_referrals_core.sql`                       | CREATE TABLE x2 + ALTER + seeds idempotentes                                                                                                       | ✓ VERIFIED | Aplicada limpia; enums byte-for-byte con el schema; 0 `;` en comentarios; siguiente número libre tras 0175 sin conflicto                                                                                                                                                               |
| `el-templo-api/src/modules/referrals/service.ts`                                | 6 métodos: generateReferralCode, resolveReferralCode, getReferralConfig, computeReferralDiscountPercent, qualifyFirstPayment, recordReferralCredit | ✓ VERIFIED | Los 6 presentes y funcionales, 278 líneas, sin `any`, sin `console.*`                                                                                                                                                                                                                  |
| `el-templo-api/src/scripts/backfill-referral-codes.ts`                          | Script one-shot idempotente, fuera de pipeline                                                                                                     | ✓ VERIFIED | Dry-run por defecto + `--apply`; no referenciado en `package.json` ni `run-migrations.ts`; usa `console.*` consistente con el precedente `backfill-historical-payments.ts` (script standalone fuera de contexto Fastify, no viola CLAUDE.md que aplica a rutas API)                    |
| `el-templo-api/src/modules/subscriptions/service.ts` (4 charge-paths + preview) | Hook de cobro cableado                                                                                                                             | ✓ VERIFIED | `qualifyReferralOnCharge`/`computePriceWithReferralDiscount`/`recordReferralCreditOnCharge` presentes en `assignPlan`, `changePlanNow`, `changePlanAfterCurrent`, `renewSubscription`; `getPricingPreview` solo llama `computeReferralDiscountPercent` (read-only, sin flip ni credit) |
| `el-templo-app/src/pages/RegisterPage.vue`                                      | Captura `?ref` + badge                                                                                                                             | ✓ VERIFIED | `refCode` computed de `route.query.ref`, payload `ref: refCode.value`, badge condicional reusando `.promo-badge` (icono `group_add`, copy exacto)                                                                                                                                      |
| `el-templo-admin/src/components/MemberFormDialog.vue`                           | Picker "¿Quién lo trajo?" create-only                                                                                                              | ✓ VERIFIED | `onReferrerSearch` debounced, `searchMembers`, envía `referredBy` en el submit                                                                                                                                                                                                         |

### Key Link Verification

| From                                 | To                                                             | Via                                 | Status  | Details                                                        |
| ------------------------------------ | -------------------------------------------------------------- | ----------------------------------- | ------- | -------------------------------------------------------------- |
| `schema/index.ts`                    | `referrals.ts` + `referral-credits.ts`                         | `export *`                          | ✓ WIRED | Confirmado en el diff (`+2` líneas en index.ts)                |
| `auth/routes.ts /register`           | `ReferralService.resolveReferralCode` + `generateReferralCode` | resolución server-side + eager code | ✓ WIRED | `:283-328`, nunca lee referrer crudo del body                  |
| `members/service.ts createMember`    | `referrals` insert (assisted) antes de `assignPlan`            | ordering                            | ✓ WIRED | `createMember` (`routes.ts:640`) precede `assignPlan` (`:667`) |
| `subscriptions/service.ts` (4 paths) | `ReferralService.computeReferralDiscountPercent`               | helper compartido                   | ✓ WIRED | 4 invocaciones confirmadas por grep + lectura de código        |
| `subscriptions/service.ts`           | `recordReferralCreditOnCharge`                                 | tras `recordAssignmentCharge`       | ✓ WIRED | 4 invocaciones (`:1719`, `:3344`, `:3731`, `:4221`)            |
| `RegisterPage.vue`                   | `authStore.register({ ref })`                                  | payload POST /register              | ✓ WIRED | `ref: refCode.value ?? undefined` en el payload                |
| `MemberFormDialog.vue`               | `membersApi.searchMembers` + submit `referredBy`               | `onReferrerSearch` debounced        | ✓ WIRED | Confirmado por grep + lectura                                  |

### Behavioral Spot-Checks

| Behavior                                                    | Command                                               | Result                                                                                                                                               | Status                                                                     |
| ----------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Typecheck completo del API con todo el código de la fase    | `cd el-templo-api && npx tsc --noEmit`                | exit 0, sin output                                                                                                                                   | ✓ PASS                                                                     |
| Migración 0176 no colisiona con el tope real de migraciones | `ls el-templo-api/src/db/migrations/ \| sort \| tail` | `0176_referrals_core.sql` sigue a `0175_mogotes_capacity_16.sql`                                                                                     | ✓ PASS                                                                     |
| Suite de tests dedicada de referidos (7 archivos)           | `ls el-templo-api/test/referrals/`                    | code-generation, anti-fraud, aura-annotation, backfill-codes, discount-charge, discount-computation, qualification — los 5 de Wave 0 + 2 adicionales | ✓ PASS (existencia; contenido sustantivo leído directamente, no solo grep) |

Nota: no se re-corrió el suite completo de vitest (instrucción explícita del encargo — ya corrido verde por los ejecutores; correr en CI). Se verificó `tsc --noEmit` limpio y se leyó el contenido real de los archivos de test (no solo greps) para confirmar que las aserciones cubren los casos declarados (tope 40%, contraparte vencida, bidireccionalidad, idempotencia de `recordReferralCredit`, dedup DNI 409).

### Requirements Coverage

| Requirement | Source Plan | Description                                               | Status      | Evidence                                                                            |
| ----------- | ----------- | --------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------- |
| REF-01      | 01, 02, 03  | Código único de referido, compartible vía `?ref=CODE`     | ✓ SATISFIED | Columna `users.referralCode` UNIQUE + `generateReferralCode` eager en ambos canales |
| REF-02      | 03, 05      | Registro self-service con `?ref=CODE` atribuye            | ✓ SATISFIED | `auth/routes.ts` + `RegisterPage.vue`                                               |
| REF-03      | 03, 05      | Alta asistida atribuye "¿Quién lo trajo?"                 | ✓ SATISFIED | `members/service.ts` + `MemberFormDialog.vue`                                       |
| REF-04      | 01, 03      | Auto-referido impedido, a lo sumo un referidor, dedup DNI | ✓ SATISFIED | UNIQUE `referred_id` + guards + dedup DNI reusado                                   |
| DESC-01     | 04          | Primer pago flippea a `qualified`                         | ✓ SATISFIED | `qualifyReferralOnCharge` gateado `pricePaid>0`                                     |
| DESC-02     | 02, 04      | Descuento simétrico a ambas partes                        | ✓ SATISFIED | `computeReferralDiscountPercent` bidireccional, cableado en las 4 paths             |
| DESC-03     | 02, 04      | Evaluado en cada cobro; suspende/reactiva por cobertura   | ✓ SATISFIED | `deriveCoveredUntil` de la contraparte por cargo, sin persistencia de "activo"      |
| DESC-04     | 01, 02      | Acumula con tope configurable                             | ✓ SATISFIED | `Math.min(activos*pct, cap)`, `system_settings['referral.max_percent_cap']`         |
| DESC-05     | 02, 04      | No-discrecional, server-side                              | ✓ SATISFIED | Sin input del cliente en el cómputo; verificado en las 4 charge-paths               |
| AURA-01     | 02, 04      | Anotación `sourceType:"referral"` sin inflar saldo        | ✓ SATISFIED | `recordReferralCredit` INSERT directo `amount=0`, nunca `award/spend`               |
| AURA-02     | 01, 02      | Magnitud parametrizada en `aura_config`                   | ✓ SATISFIED | Seed `aura_config['referral']=10` + `getReferralConfig` con fallback                |

No hay requisitos huérfanos: los 11 REQ-IDs inline del ROADMAP están cubiertos por al menos un plan y verificados en código.

### Anti-Patterns Found

| File                                                   | Line   | Pattern                  | Severity | Impact                                                                                                                                                                                                                                    |
| ------------------------------------------------------ | ------ | ------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/scripts/backfill-referral-codes.ts` | 44-131 | `console.log/warn/error` | ℹ️ Info  | Script CLI standalone fuera del contexto Fastify — mismo patrón que el precedente `backfill-historical-payments.ts` (21 usos). No es una ruta API; CLAUDE.md apunta a "API: usar Pino" en el contexto de request handling. No bloqueante. |

No se encontraron `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` reales (un falso positivo de grep por la subcadena "XXXX" dentro de "PREFIJO-XXXX", que es documentación del formato del código, no un marcador de deuda).

### Human Verification Required

Ninguno pendiente para esta verificación. El único checkpoint humano de la fase (157-05 Task 3 — verificación visual del badge de `RegisterPage` y el picker de `MemberFormDialog`) ya fue ejecutado y **aprobado por el operador** durante la ejecución del plan (ver `157-05-SUMMARY.md`, "Checkpoint visual aprobado"). La UAT final en staging queda pendiente como parte del ciclo normal de despliegue (hecho de entorno conocido, no un gap de esta fase).

### Gaps Summary

Ninguno. Los 5 success criteria del ROADMAP están verificados en código real (no solo en SUMMARY.md): schema+migración aplicada, servicio de dominio completo y testeado, ambos canales de atribución cableados con antifraude, hook de cobro presente en las 4 charge-paths + preview parity, y anotación AURA sin inflar saldo. `tsc --noEmit` limpio. Sin deuda técnica sin resolver introducida por la fase.

---

_Verified: 2026-07-10T22:28:38Z_
_Verifier: Claude (gsd-verifier)_
