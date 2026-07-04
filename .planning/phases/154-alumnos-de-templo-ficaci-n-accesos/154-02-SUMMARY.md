---
phase: 154-alumnos-de-templo-ficaci-n-accesos
plan: 02
subsystem: api
tags: [fastify, drizzle, pricing, security, export, exceljs, system-settings]

# Dependency graph
requires:
  - phase: 154-01
    provides: "Módulo settings con PRICING_SETTINGS_KEYS.cardSurcharge + SettingsService.getCardSurchargeEnabled (default OFF)"
provides:
  - "Gate server-side del recargo por tarjeta en el punto único (subscriptions/service.resolvePriceType): credit_card→regular cuando la regla está OFF, antes de calcular el monto y antes de persistir"
  - "Cobertura del gate on/off/default en el flujo coach PoS (mismo code path que assignPlan del admin)"
  - "Param includeGreekLevel en GET /api/admin/members/export que gatea la columna Nivel server-side (default true, retrocompatible)"
affects: [154-03-ui-config, 154-04-ui-cobro, 154-05-ui-alumnos]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Normalización del priceType en el punto de resolución (no dentro de getBasePrice, que queda sync) → un solo cambio cubre coach PoS + admin"
    - "Columna condicional de exceljs vía spread en sheet.columns (exceljs ignora la key de row sin columna → addRow no cambia)"

key-files:
  created:
    - el-templo-api/test/finance/coach-load-pricing-gate.test.ts
  modified:
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/src/modules/members/schemas.ts
    - el-templo-api/test/members/members.test.ts

key-decisions:
  - "resolvePriceType REUSA SettingsService (plan 01) — no reimplementa el select inline (DRY: un solo lector de la key en el backend)"
  - "Normalizar en la resolución del priceType (3 call sites) en vez de gatear dentro de getBasePrice: el valor normalizado se usa para el monto Y para lo que se persiste → nunca queda credit_card con monto regular (D-04/T-154-05)"
  - "includeGreekLevel: undefined = true (default incluye la columna) — retrocompatible; el flag Templo vive front-only en templo-config.ts, la API solo respeta el param (constraint SaaS, sin Templo-ismo nuevo en core)"

patterns-established:
  - "Gate de precio server-side: el cliente puede mandar priceTypeApplied credit_card, pero la API lo normaliza según la regla — la seguridad real vive en la API (149 D-04)"

requirements-completed: [ALUM-03, ALUM-05]

# Metrics
duration: ~20min
completed: 2026-07-04
---

# Phase 154 Plan 02: Gate server-side del recargo por tarjeta + gating del export Excel Summary

**Normalización server-side `credit_card`→`regular` cuando la regla `pricing.card_surcharge_enabled` está OFF, en el punto único (`resolvePriceType` reusando `SettingsService`), cubriendo coach PoS 148 + admin `assignPlan` con un solo cambio y dejando el `priceTypeApplied` persistido consistente; más un param `includeGreekLevel` que gatea la columna Nivel del export Excel.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-04
- **Tasks:** 2
- **Files modified:** 5 (1 creado, 4 modificados)

## Accomplishments

- Cierre del bypass del cliente (PATTERNS hallazgo 2): aunque la UI esconda "Tarjeta", un `priceTypeApplied: "credit_card"` mandado a mano ya no aplica el recargo cuando la regla está OFF. La normalización ocurre en `subscriptions/service.ts`, el punto único server-side (D-04).
- Un solo cambio cubre ambos flujos: coach PoS de la fase 148 (`coach-load-routes` mapea `card`→`credit_card` y llama `assignPlan`) y el admin `AssignPlanDialog` (que manda `priceTypeApplied` directo). Ambos terminan en `assignPlan`/`changePlanNow`/`changePlanAfterCurrent`, los tres normalizados.
- Sin drift persistido (T-154-05): la variable normalizada se usa TANTO para `getBasePrice` COMO para lo que se graba en la subscription → nunca queda `credit_card` con monto regular.
- `getBasePrice` queda intacto (switch puro, sync): la normalización vive en `resolvePriceType` (async), el punto correcto.
- Export Excel de Alumnos gateable server-side: `includeGreekLevel=false` omite la columna Nivel; default (sin param) la mantiene (retrocompatible). El admin pasará el valor del flag Templo desde AlumnosPage (plan 05).

## Task Commits

1. **Task 1: Gate server-side del precio en el punto único + test on/off** - `3f67add8` (feat)
2. **Task 2: Gate de la columna Nivel del export Excel (includeGreekLevel)** - `ca24f9b5` (feat)

## Files Created/Modified

- `el-templo-api/src/modules/subscriptions/service.ts` - Helper privado `resolvePriceType(priceType): Promise<PriceType>` que reusa `SettingsService.getCardSurchargeEnabled()`; si `credit_card` y la regla OFF → `regular`. Aplicado en los 3 call sites de resolución (`assignPlan` ~1047, `changePlanNow` ~2807, `changePlanAfterCurrent` ~3229). `getBasePrice` sin cambios.
- `el-templo-api/test/finance/coach-load-pricing-gate.test.ts` - (nuevo) Integración del gate vía `coach-load/alta` con `paymentMethod:"card"`: ON→`priceCreditCard`, OFF→`priceRegular`, `priceTypeApplied` persistido `"regular"` cuando OFF, y default (key ausente) = OFF. Siembra la setting por caso (helpers limpian `systemSettings`).
- `el-templo-api/src/modules/members/routes.ts` - Param `includeGreekLevel?: boolean` en el `Querystring` genérico del `/export`; `sheet.columns` construye la columna Nivel condicionalmente vía spread; `undefined !== false` → default true.
- `el-templo-api/src/modules/members/schemas.ts` - `includeGreekLevel: { type: "boolean" }` en `exportMembersSchema.querystring.properties`.
- `el-templo-api/test/members/members.test.ts` - 3 casos nuevos en el describe "Member export": `includeGreekLevel=false` omite "Nivel", `=true` lo incluye, sin param lo incluye. Parsea el buffer xlsx con exceljs y asserta sobre el header row.

## Decisions Made

- **Normalizar en la resolución del priceType, no en `getBasePrice`** (que es sync y se llama en 4 sitios): el punto correcto es donde se resuelve `priceTypeApplied`, así el valor normalizado alimenta tanto el monto como la persistencia. Evita el drift `credit_card` con monto regular (T-154-05).
- **`resolvePriceType` reusa `SettingsService`** (plan 01) en vez de un select inline: un solo lector de la key canónica en todo el backend (DRY). Se referencia `PRICING_SETTINGS_KEYS.cardSurcharge` en el log de traza.
- **`includeGreekLevel` default true (undefined tratado como true):** retrocompatible con cualquier llamador que no pase el param; sin constante Templo nueva en la API (el flag de superficie vive front-only en `templo-config.ts`, constraint SaaS).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. `tsc --noEmit` verde tras cada task; el pre-commit (prettier) reformateó archivos sin cambios de scope.

## Threat Mitigations Applied

- **T-154-04 (Tampering, assignPlan priceTypeApplied del cliente):** mitigado — normalización server-side `credit_card`→`regular` cuando la regla OFF, en el punto único; test cubre OFF no aplica recargo.
- **T-154-05 (Tampering, precio persistido):** mitigado — el priceType se normaliza ANTES de persistir; test asserta `priceTypeApplied === "regular"` cuando OFF.
- **T-154-06 (Info Disclosure, columna Nivel del export):** disposición `accept` — el param solo omite una columna de superficie (no dato sensible).

## User Setup Required

None - sin configuración de servicios externos. La regla ya viaja ON para El Templo por la migración 0166 del plan 01; el comportamiento actual en prod no cambia (la tarjeta sigue aplicando recargo mientras la regla esté ON).

## Next Phase Readiness

- El gate server-side está listo; los planes 03/04 (UI de Configuración owner-only + esconder la opción de tarjeta en `PlanFormDialog`/`AssignPlanDialog`/`CobrosPage`) solo esconden — la seguridad ya vive en la API.
- El plan 05 (AlumnosPage) pasará `includeGreekLevel=<valor del flag Templo>` al export.
- Sin blockers.

## Self-Check: PASSED

- Archivo creado verificado presente: `test/finance/coach-load-pricing-gate.test.ts`.
- Commits `3f67add8`, `ca24f9b5` presentes en git log.
- `tsc --noEmit` verde; greps de acceptance OK (`resolvePriceType` x6, `PRICING_SETTINGS_KEYS` x2, `console.` sin aumento, `includeGreekLevel` en schema+routes).

---

_Phase: 154-alumnos-de-templo-ficaci-n-accesos_
_Completed: 2026-07-04_
