---
phase: 154-alumnos-de-templo-ficaci-n-accesos
plan: 04
subsystem: admin
tags: [quasar, vue3, deep-link, pricing, feature-flag, pos]

# Dependency graph
requires:
  - phase: 154-01
    provides: endpoints GET (staff) / PUT (owner) /api/admin/settings/pricing/card-surcharge
  - phase: 154-03
    provides: composable usePricingSettingsApi (getCardSurchargeEnabled)
provides:
  - "CobrosPage consume ?memberId= (deep-link) + preselecciona el socio en el paso Socio"
  - "getBasePriceFor gateado por la regla de recargo (no aplica priceCreditCard con la regla OFF)"
  - "AssignPlanDialog no ofrece la opción credit_card con la regla OFF; getBasePrice degrada a regular"
  - "PlanFormDialog esconde el campo precio Tarjeta con la regla OFF (form state intacto)"
affects: [154-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deep-link por query param con useRoute + onMounted (analog HorariosPage), fallback toast + flujo normal"
    - "Gate de UI por setting server-side con default conservador OFF (no cobrar/ofrecer recargo no confirmado)"
    - "Helper buildMemberOption compartido por typeahead y prefill del deep-link (DRY)"

key-files:
  created: []
  modified:
    - el-templo-admin/src/pages/CobrosPage.vue
    - el-templo-admin/src/components/AssignPlanDialog.vue
    - el-templo-admin/src/components/PlanFormDialog.vue

key-decisions:
  - "Default conservador OFF ante error de carga de la regla: nunca aplicar/ofrecer un recargo que no se pudo confirmar (documentado en las 3 superficies)"
  - "Resolución id→socio del deep-link vía membersApi.getMember(id) (fetch directo, no searchMembers por string)"
  - "buildMemberOption extraído del map de onMemberSearch y reusado en el prefill del deep-link (refactor DRY de bajo riesgo)"

requirements-completed: [ALUM-02, ALUM-03]

# Metrics
duration: ~10min
completed: 2026-07-04
---

# Phase 154 Plan 04: UI de cobro (deep-link) + gating del recargo por tarjeta Summary

**Las tres superficies de precio-por-medio del admin (CobrosPage, AssignPlanDialog, PlanFormDialog) dejan de ofrecer/aplicar el recargo por tarjeta cuando la regla está OFF, y CobrosPage preselecciona el socio al llegar por `?memberId=` con fallback a toast si el id no existe.**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-07-04
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- **ALUM-02 (deep-link de cobro):** CobrosPage aprende a consumir `?memberId={id}` — resuelve el socio con `membersApi.getMember`, lo preselecciona (`selectedMember`) y entra directo al paso Socio del wizard. Un id inexistente/ajeno cae en `$q.notify` + flujo normal (no rompe la página; el fetch ya está scoped server-side). Habilita el botón de cobro en la fila del plan 05.
- **ALUM-03 (gating de la UI del recargo):** con la regla OFF —
  - CobrosPage: `getBasePriceFor` ignora `priceCreditCard` y usa `priceRegular`/`priceZero`.
  - AssignPlanDialog: la opción "Tarjeta" no aparece en el selector de tipo de precio, y `getBasePrice` degrada `credit_card`→regular por consistencia.
  - PlanFormDialog: el campo de precio "Tarjeta" se esconde (`v-if`), sin tocar el valor persistido (`form.priceCreditCard`, D-04).
- Cada superficie carga la regla vía `usePricingSettingsApi.getCardSurchargeEnabled()` (CobrosPage en `onMounted`; los dialogs al abrirse) con **default conservador OFF** ante error.

## Task Commits

1. **Task 1: CobrosPage — consumir ?memberId= (ALUM-02) + gatear getBasePriceFor (ALUM-03)** - `1288e1f0` (feat)
2. **Task 2: AssignPlanDialog (opción credit_card condicional) + PlanFormDialog (campo Tarjeta condicional)** - `8db5f6a4` (feat)

## Files Created/Modified

- `el-templo-admin/src/pages/CobrosPage.vue` - import `useRoute` + `usePricingSettingsApi` + `onMounted`; ref `cardSurchargeEnabled`; `getBasePriceFor` gateado; helper `buildMemberOption` compartido por typeahead y deep-link; `applyMemberDeepLink()` (prefill + paso Socio + toast en error) y `loadCardSurchargeRule()` invocados desde `onMounted`.
- `el-templo-admin/src/components/AssignPlanDialog.vue` - ref `cardSurchargeEnabled` + `loadCardSurchargeRule()` cargado al abrir el dialog; `priceTypeOptions` empuja `credit_card` solo con la regla ON; `getBasePrice` degrada `credit_card`→regular con la regla OFF.
- `el-templo-admin/src/components/PlanFormDialog.vue` - ref `cardSurchargeEnabled` + `loadCardSurchargeRule()` al abrir; `div` del `q-input` "Tarjeta" bajo `v-if="cardSurchargeEnabled"`; form state (`form.priceCreditCard`) intacto.

## Decisions Made

- **Default conservador OFF ante fallo de carga de la regla:** las tres superficies tratan un error de `getCardSurchargeEnabled()` como OFF, para nunca aplicar ni ofrecer un recargo que no se pudo confirmar (documentado en cada archivo). La defensa real sigue siendo server-side (plan 02); la UI solo se mantiene consistente.
- **Resolución del deep-link vía `membersApi.getMember(id)`** (fetch por id directo) en vez de `searchMembers` por string — más preciso y ya scoped por rol/sucursal en el server.
- **`buildMemberOption` extraído del `map` de `onMemberSearch`** y reusado por el prefill del deep-link: refactor DRY de bajo riesgo (agrega un fallback `#${id}` para nombres vacíos, sin cambio de comportamiento observable).

## Deviations from Plan

None - plan executed exactly as written.

(Higiene, no desviación de scope: el pre-commit de lint-staged reformateó una expresión de `getBasePrice` en AssignPlanDialog — sin cambio de comportamiento.)

## Issues Encountered

None.

## User Setup Required

None - consume endpoints y el composable ya existentes (planes 01/03).

## Next Phase Readiness

- El **plan 05** puede cablear el botón de cobro en la fila de AlumnosPage a `/cobros?memberId={id}` — CobrosPage ya lo consume end-to-end.
- Sin blockers.

## Self-Check: PASSED

- Archivos modificados presentes; `grep` de `useRoute`/`onMounted`/`memberId`/`getCardSurchargeEnabled` en CobrosPage y `getCardSurchargeEnabled` en ambos dialogs, OK.
- Commits `1288e1f0`, `8db5f6a4` presentes en git log.
- `pnpm lint` verde (0 errores; 9 warnings pre-existentes en archivos ajenos + 2 pre-existentes en CobrosPage no introducidos por este plan).

---

_Phase: 154-alumnos-de-templo-ficaci-n-accesos_
_Completed: 2026-07-04_
