---
phase: 154-alumnos-de-templo-ficaci-n-accesos
verified: 2026-07-04T20:24:49Z
status: human_needed
score: 12/12 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Confirmar la decisión de negocio de WR-04 (normalización del recargo en renovaciones)"
    expected: "Con la regla OFF, una renovación de un socio cuyo priceTypeApplied heredado es 'credit_card' debe normalizar a 'regular' y recobrar priceRegular (comportamiento fijado en 6cb6860b). Confirmar que esta es la decisión de negocio deseada (vs. conservar la herencia)."
    why_human: "Es un cambio de lógica de negocio (no solo un fix técnico) señalado explícitamente en 154-REVIEW.md — afecta cuánto se cobra a socios existentes en la próxima renovación si una instalación apaga la regla. Requiere confirmación del owner del producto, no verificable por grep."
---

# Phase 154: Alumnos (de-Templo-ficación + accesos) Verification Report

**Phase Goal:** La página de Alumnos prioriza crear alumno y cobrar desde la fila, con precios por medio de pago configurables, "avatar" renombrado a un concepto neutro y niveles griegos gateados como superficie Templo. End state: "Crear alumno" es la acción prominente; "Registrar cobro" es acción directa en la fila; el recargo por medio de pago pasa a config (default sin recargo; El Templo activa la suya); "Avatar" se llama "Categoría" en toda la UI conservando el mecanismo; niveles griegos gateados como Templo consistente con el gating de Entrenamiento.
**Verified:** 2026-07-04T20:24:49Z
**Status:** human_needed
**Re-verification:** No — initial verification (verificado contra el estado ACTUAL del codebase, post-fixes WR-01..WR-04)

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                                                       | Status                                               | Evidence                                                                                                                                                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | "Crear alumno" es la acción primaria prominente del header de Alumnos; secundarias degradadas                                                                               | VERIFIED                                             | `AlumnosPage.vue:37-46` botón "Crear alumno" `color="primary" unelevated` sin `dense`; export (22-24) y "Nuevo en Prueba" (25-36) son `flat/outline dense`                                                                                                                                                                              |
| 2   | Cada fila tiene botón de cobro junto al lápiz que navega a `/cobros?memberId={id}`                                                                                          | VERIFIED                                             | `AlumnosPage.vue:287-297` botón `icon="payments"` → `registerPayment` (823-825) → `router.push({ path: '/cobros', query: { memberId: String(member.id) } })`; lápiz en 298-300                                                                                                                                                          |
| 3   | CobrosPage consume `?memberId=`, preselecciona socio y entra al paso Socio                                                                                                  | VERIFIED                                             | `CobrosPage.vue:1632-1655` `applyMemberDeepLink()`: `route.query.memberId` → `membersApi.getMember` → `selectedMember`, `currentStep.value = 1`; llamado desde `onMounted` (1657-1660)                                                                                                                                                  |
| 4   | memberId inexistente muestra aviso y cae a flujo normal (no rompe)                                                                                                          | VERIFIED                                             | `CobrosPage.vue:1646-1654` catch → `$q.notify negative` + continúa (no throw sin catch)                                                                                                                                                                                                                                                 |
| 5   | La regla de recargo por tarjeta vive en `system_settings`, default OFF, endpoints GET(staff)/PUT(owner)                                                                     | VERIFIED                                             | `settings/service.ts` `getCardSurchargeEnabled` retorna `false` si no hay fila; `settings/routes.ts` GET staff-gated (`ALL_STAFF_ROLES`, post-WR-01), PUT owner-gated (`OWNER_ROLES`→403); migración `0166` deja El Templo en ON (`WHERE NOT EXISTS`)                                                                                   |
| 6   | Con la regla OFF, el cobro server-side (assignPlan/changePlanNow/changePlanAfterCurrent/coach PoS) no aplica priceCreditCard, y lo persistido queda normalizado a 'regular' | VERIFIED                                             | `subscriptions/service.ts:4276-4288` `resolvePriceType`; cableado en `assignPlan:1052`, `changePlanNow:2813`, `changePlanAfterCurrent:3238`; persistido en `2944`/`3662`(renewal)/etc.; tests `coach-load-pricing-gate.test.ts` (ON/OFF/persistencia)                                                                                   |
| 7   | El preview de precio (`getPricingPreview`) no diverge del cobro real cuando la regla está OFF                                                                               | VERIFIED (WR-02 fix)                                 | `subscriptions/service.ts:3945-3946` `resolvedPriceType = await this.resolvePriceType(priceType)` antes de `getBasePrice`; test `lifecycle.test.ts:988-1006` (OFF→priceRegular) y `1008-1026`(ON→priceCreditCard)                                                                                                                       |
| 8   | Las renovaciones no perpetúan indefinidamente un recargo heredado cuando la regla pasa a OFF                                                                                | VERIFIED (WR-04 fix, human_needed sobre la decisión) | `subscriptions/service.ts:3534-3551` normaliza `renewalPriceType` vía `resolvePriceType` (solo si no hay override); persistido en línea 3662; tests `subscriptions/renewal.test.ts:423-464` (OFF normaliza) y `468-511` (ON conserva)                                                                                                   |
| 9   | El monto de CobrosPage no queda stale si la regla resuelve después de elegir plan+tarjeta                                                                                   | VERIFIED (WR-03 fix)                                 | `CobrosPage.vue:1325` watch incluye `cardSurchargeEnabled` como dependencia                                                                                                                                                                                                                                                             |
| 10  | UI del admin (CobrosPage/AssignPlanDialog/PlanFormDialog) no ofrece/aplica "Tarjeta" cuando la regla está OFF, sin tocar el estado persistido                               | VERIFIED                                             | `CobrosPage.vue:1264-1265` `getBasePriceFor` gateado; `AssignPlanDialog.vue:1230-1236` opción `credit_card` condicionada + `getBasePrice()` local degrada (1448-1461); `PlanFormDialog.vue:98` campo bajo `v-if="cardSurchargeEnabled"`, `form.priceCreditCard` (317/488/547) intacto                                                   |
| 11  | "Avatar" se llama "Categoría" en toda la UI de Alumnos (columna, filtro, ficha), mecanismo intacto                                                                          | VERIFIED                                             | `AlumnosPage.vue:154`(filtro label "Categoría"), `500`("Sin categoría"), `575`(columna "Categoría"); `AlumnoDetailPage.vue:89`(tooltip "Categoría: ..."); `filters.avatarType`/`props.row.avatarType`/`avatarFilterOptions` (mecanismo) sin cambios de forma                                                                            |
| 12  | Niveles griegos (columna/filtro/badge/subtítulo/export) gateados por `TEMPLO_GREEK_LEVELS`, on por defecto en El Templo                                                     | VERIFIED                                             | `templo-config.ts:34` `TEMPLO_GREEK_LEVELS = TEMPLO_ENABLED`; `AlumnosPage.vue` filtro (114), `visibleColumns` (614-615), export `includeGreekLevel` (791); `AlumnoDetailPage.vue` badge (34) y subtítulo (49); API `members/routes.ts:256-266` respeta `includeGreekLevel` (default true); tests `members.test.ts:1588-1607` (3 casos) |

**Score:** 12/12 truths verified

### Required Artifacts

| Artifact                                                               | Expected                                  | Status   | Details                                                                                   |
| ---------------------------------------------------------------------- | ----------------------------------------- | -------- | ----------------------------------------------------------------------------------------- |
| `el-templo-api/src/modules/settings/keys.ts`                           | Key canónica única                        | VERIFIED | `PRICING_SETTINGS_KEYS.cardSurcharge === "pricing.card_surcharge_enabled"`                |
| `el-templo-api/src/modules/settings/service.ts`                        | Read/upsert default OFF                   | VERIFIED | `getCardSurchargeEnabled`/`setCardSurchargeEnabled` implementados sobre `system_settings` |
| `el-templo-api/src/modules/settings/routes.ts`                         | GET staff / PUT owner                     | VERIFIED | Hook staff-gate (post WR-01) + preHandler owner-gate en PUT                               |
| `el-templo-api/src/app.ts`                                             | Registro del plugin                       | VERIFIED | `import`(44) + `register`(237) con prefix `/api/admin/settings`                           |
| `el-templo-api/src/db/migrations/0166_seed_pricing_card_surcharge.sql` | Seed idempotente ON                       | VERIFIED | `INSERT ... WHERE NOT EXISTS`, sin `;` en comentarios, numeración 0166 (siguiente a 0165) |
| `el-templo-api/test/settings/pricing-setting.test.ts`                  | CRUD + guard owner + guard staff          | VERIFIED | 6 casos (a-f) incl. rechazo de token member (WR-01)                                       |
| `el-templo-api/src/modules/subscriptions/service.ts`                   | `resolvePriceType` en punto único         | VERIFIED | Definido + 3 call sites resolutivos + preview + renewal (post WR-02/WR-04)                |
| `el-templo-api/test/finance/coach-load-pricing-gate.test.ts`           | Gate ON/OFF coach PoS                     | VERIFIED | 4 tests: ON/OFF/persistencia/ausente-default-OFF                                          |
| `el-templo-api/src/modules/members/routes.ts` + `schemas.ts`           | `includeGreekLevel` en export             | VERIFIED | Param tipado, condiciona `sheet.columns`, default `!== false`                             |
| `el-templo-admin/src/config/templo-config.ts`                          | Flag + nav item                           | VERIFIED | `TEMPLO_GREEK_LEVELS` (34) + nav `/configuracion/precios` (159)                           |
| `el-templo-admin/src/composables/usePricingSettingsApi.ts`             | Composable tipado                         | VERIFIED | `getCardSurchargeEnabled`/`setCardSurchargeEnabled`, sin `onUnmounted`, `cleanup()`       |
| `el-templo-admin/src/pages/ConfiguracionPreciosPage.vue`               | Toggle owner-only                         | VERIFIED | `q-toggle` bindeado, `onMounted` carga, `onToggle` persiste + revierte en error           |
| `el-templo-admin/src/router/routes.ts`                                 | Ruta owner-only                           | VERIFIED | `configuracion/precios` con `meta.allowedRoles: ['owner']`                                |
| `el-templo-admin/src/pages/CobrosPage.vue`                             | Deep-link + gate                          | VERIFIED | `applyMemberDeepLink` + `getBasePriceFor` gateado + watch con `cardSurchargeEnabled`      |
| `el-templo-admin/src/components/AssignPlanDialog.vue`                  | Opción condicional                        | VERIFIED | `priceTypeOptions` + `getBasePrice()` local gateados                                      |
| `el-templo-admin/src/components/PlanFormDialog.vue`                    | Campo condicional                         | VERIFIED | `v-if="cardSurchargeEnabled"`, form state intacto                                         |
| `el-templo-admin/src/pages/AlumnosPage.vue`                            | Header, fila, renames, gating, export     | VERIFIED | Todo confirmado (ver truths 1,2,11,12)                                                    |
| `el-templo-admin/src/pages/AlumnoDetailPage.vue`                       | Labels + gating                           | VERIFIED | Confirmado (ver truths 11,12)                                                             |
| `el-templo-admin/src/types/member.ts`                                  | `includeGreekLevel` en `MemberListParams` | VERIFIED | Línea 247                                                                                 |

### Key Link Verification

| From                           | To                                           | Via                                 | Status | Details                                                                                 |
| ------------------------------ | -------------------------------------------- | ----------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| `app.ts`                       | `settingsRoutes`                             | `app.register(prefix)`              | WIRED  | Import + register confirmados                                                           |
| `subscriptions/service.ts`     | `PRICING_SETTINGS_KEYS`                      | `import`                            | WIRED  | Import línea 62, usado en `resolvePriceType`                                            |
| `members/routes.ts`            | `sheet.columns` Nivel                        | `includeGreekLevel` condicional     | WIRED  | Confirmado con 3 tests de export                                                        |
| `AlumnosPage.vue`              | `/cobros?memberId=`                          | `router.push` en fila               | WIRED  | `registerPayment` confirmado                                                            |
| `AlumnosPage.vue`              | `TEMPLO_GREEK_LEVELS`                        | import + gate columna/filtro/export | WIRED  | 3 usos confirmados                                                                      |
| `ConfiguracionPreciosPage.vue` | `/api/admin/settings/pricing/card-surcharge` | `usePricingSettingsApi`             | WIRED  | `getCardSurchargeEnabled`/`setCardSurchargeEnabled` invocados en `onMounted`/`onToggle` |
| `CobrosPage.vue`               | `route.query.memberId`                       | `useRoute` + `onMounted`            | WIRED  | Confirmado, con fallback de error                                                       |

### Behavioral Spot-Checks / Gates Ejecutados

| Check                                                                        | Command                                                                 | Result                                                                                                                                                       | Status |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| API type-check                                                               | `cd el-templo-api && pnpm exec tsc --noEmit`                            | Sin salida (verde)                                                                                                                                           | PASS   |
| Admin lint                                                                   | `cd el-templo-admin && pnpm lint`                                       | 0 errors, 9 warnings (todos pre-existentes, no de esta fase — 2 en CobrosPage.vue trazados por `git blame` a commits `ad1b5bf41`/`64ab3eb0b` de fase previa) | PASS   |
| Commits de fixes existen en el repo                                          | `git log --oneline \| grep -E "2a90cb2c\|c9423a18\|a1357207\|6cb6860b"` | Los 4 commits existen con mensajes `fix(154): ... (WR-0N)`                                                                                                   | PASS   |
| Anti-pattern scan (TODO/FIXME/XXX/console/any) en los 18 archivos de la fase | grep                                                                    | Sin coincidencias reales (solo comentarios inocuos con la palabra "any" en prosa)                                                                            | PASS   |

### Requirements Coverage

| Requirement | Source Plan                    | Description                                         | Status    | Evidence                                                                                                                                                                               |
| ----------- | ------------------------------ | --------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ALUM-01     | 154-05                         | "Crear alumno" acción prominente                    | SATISFIED | Truth 1                                                                                                                                                                                |
| ALUM-02     | 154-04, 154-05                 | Cobro directo en la fila                            | SATISFIED | Truths 2, 3, 4                                                                                                                                                                         |
| ALUM-03     | 154-01, 154-02, 154-03, 154-04 | Reglas de precio configurables, default sin recargo | SATISFIED | Truths 5, 6, 7, 9, 10; WR-04 (truth 8) satisfecho técnicamente pero con decisión de negocio a confirmar (human_needed)                                                                 |
| ALUM-04     | 154-05                         | Avatar → concepto neutro                            | SATISFIED | Truth 11 (REQUIREMENTS.md menciona "segmento"/categoría — el plan optó explícitamente por "Categoría" para evitar colisión con `member_segment`, decisión documentada en CONTEXT D-06) |
| ALUM-05     | 154-02, 154-03, 154-05         | Niveles griegos gateados como Templo                | SATISFIED | Truth 12                                                                                                                                                                               |

No hay requirements huérfanos: los 5 IDs de REQUIREMENTS.md (líneas 60-64, 122-126) coinciden 1:1 con los `requirements:` declarados en los 5 planes.

### Anti-Patterns Found

Ninguno bloqueante. Los 3 hallazgos "Info" del code review (`154-REVIEW.md`) quedan sin resolver por diseño (no bloquean el goal, son mejoras incrementales):

| File                                    | Line      | Pattern                                                                                                                               | Severity | Impact                                                                                                                           |
| --------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `CobrosPage.vue`                        | 1633-1645 | `applyMemberDeepLink` no llama `resetChargeFields()` (solo `resetAltaFields()`), a diferencia de `onMemberSelected`                   | ℹ️ Info  | Hoy inocuo (corre en mount con form prístino); riesgo latente si se agrega estado a charge-fields en el futuro                   |
| `test/settings/pricing-setting.test.ts` | 113, 132  | Re-declara el literal `"pricing.card_surcharge_enabled"` en vez de importar `PRICING_SETTINGS_KEYS`                                   | ℹ️ Info  | Un rename del key pasaría tsc y solo rompería estos 2 asserts                                                                    |
| `CobrosPage.vue`                        | 1626-1657 | El query param `?memberId=` no se limpia tras consumirse; el prefill dispara el guard de "abandonar" sin interacción real del usuario | ℹ️ Info  | UX menor: refresh re-preselecciona; salir inmediatamente tras el deep-link puede mostrar el diálogo de abandono innecesariamente |

### Human Verification Required

### 1. Confirmar la decisión de negocio de WR-04 (normalización del recargo en renovaciones)

**Test:** Revisar el comportamiento fijado en `subscriptions/service.ts:3534-3551` (commit `6cb6860b`): con la regla de recargo OFF, un socio cuyo `priceTypeApplied` heredado es `credit_card` renueva normalizado a `regular`, recobrando `priceRegular` del plan vigente (en vez de perpetuar el precio con recargo).
**Expected:** Confirmar que esta es la decisión de negocio deseada para una instalación white-label que apaga la regla después de tener socios con recargo activo. La alternativa (conservar la herencia) fue descartada por el reviewer pero no estaba en el alcance original de ALUM-03/D-03 — es una consecuencia no contemplada en el CONTEXT original de la fase.
**Why human:** Es un cambio de lógica de negocio explícitamente señalado en `154-REVIEW.md` como algo que "requiere confirmar la decisión de negocio... antes de la fase de verificación" — no es verificable por grep/tsc, y afecta directamente cuánto se le cobra a un socio existente.

### Gaps Summary

No hay gaps que bloqueen el goal. Los 12 must-haves derivados del goal (ROADMAP + los 5 PLAN frontmatter must_haves consolidados) están VERIFIED contra el codebase actual, incluyendo los 4 warnings del code review (WR-01..WR-04), todos con fix commiteado y cobertura de test. El único ítem que impide `status: passed` es la confirmación humana de la decisión de negocio de WR-04, que el propio reviewer marcó como pendiente de confirmar antes de esta fase de verificación.

---

_Verified: 2026-07-04T20:24:49Z_
_Verifier: Claude (gsd-verifier)_
