---
phase: 193-comunicaciones
plan: 03
subsystem: api
tags: [communications, avisos, seed, migration, drizzle, vitest, tenancy]

# Dependency graph
requires: ["193-01", "193-02"]
provides:
  - "SYSTEM_AVISOS (el-templo-api/src/modules/communications/system-avisos.ts): catálogo de los 7 avisos de sistema con el copy literal hoy hardcodeado en la app (rating_prompt, improvement_prompt, plan_expiry, card_improvement, card_referral, card_upsell, card_program)"
  - "seedSystemAvisos(db, ctx): función idempotente que siembra los codes faltantes de un tenant sin pisar copy editado — la que el wizard de alta de tenant de la fase 182 llamará para tenants nuevos (D-22)"
  - "migración 0217_seed_system_avisos.sql aplicada en local, idempotente, siembra los 7 avisos para TODOS los tenants existentes sin ids hardcodeados"
  - "limpiarSegundoGimnasio (test/fixtures/second-tenant.ts) ahora limpia aviso_events/avisos/tv_avisos scopeados al segundo gimnasio — evita romper futuros tests de la fase que siembren avisos para ese tenant"
affects: [193-04, 193-05, 193-06, 193-08, 193-09, 193-14, 193-17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Catálogo puro + seed idempotente por tenant (mismo molde que TEMPLATE_SEEDS/seedTemplates de notifications): lee los codes existentes con tenantWhere, inserta solo los faltantes con tenantValues, nunca hace UPDATE"
    - "Migración de datos con SELECT ... FROM tenants + WHERE NOT EXISTS correlacionado por (tenant_id, code) — nunca IDs de tenant hardcodeados, cubre altas futuras hasta el momento en que corre"
    - "avisos/aviso_events/tv_avisos tratadas como dato semilla estable (mismo criterio que branches/activities), NO en TABLES_TO_CLEAN — cada test que necesita partir de cero llama seedSystemAvisos explícitamente, igual que notification_templates/seedTemplates"

key-files:
  created:
    - el-templo-api/src/modules/communications/system-avisos.ts
    - el-templo-api/src/db/migrations/0217_seed_system_avisos.sql
    - el-templo-api/test/communications/system-avisos.test.ts
  modified:
    - el-templo-api/src/modules/communications/index.ts
    - el-templo-api/test/fixtures/second-tenant.ts

key-decisions:
  - "avisos/aviso_events/tv_avisos NO se agregaron a TABLES_TO_CLEAN (test/helpers.ts): agregarlas hubiera borrado el catálogo sembrado por la migración 0217 en cada beforeEach, rompiendo el caso (a) 'tras la migración, El Templo tiene los 7 codes'. Se las trata como dato semilla estable (igual que branches/activities, sembradas una vez por el provisioning del DB de test), no como scratch pad por test — mismo criterio que notification_templates es la EXCEPCIÓN documentada, no el default."
  - "El riesgo de FK real (un tenant temporal como el del fixture seedSecondTenant queda con avisos huérfanos y el DELETE FROM tenants final revienta con ER_ROW_IS_REFERENCED_2) se resolvió acotado: limpiarSegundoGimnasio ahora borra aviso_events/avisos/tv_avisos SOLO para TENANT_DOS, sin tocar el catálogo global de El Templo."
  - "Para tarjetas (placement='tarjeta') se usó frequencyType: 'every_open' (la columna es NOT NULL): D-15b dice que las tarjetas no llevan frecuencia porque el carrusel se ve en cada apertura — 'every_open' es el valor semánticamente equivalente que exige el schema."
  - "El body de rating_prompt usa el helper text del diálogo actual ('Tu opinión es anónima y nos ayuda a mejorar las clases.') como copy base, porque el título real de la app es class-framed y dinámico (con el nombre de la actividad) y ese armado sigue en la app — el catálogo guarda el copy base, no la interpolación."

patterns-established:
  - "Data-migration con SELECT FROM tenants + WHERE NOT EXISTS correlacionado: precedente reusable para cualquier siembra futura de config por-tenant sobre tenants existentes."

requirements-completed: [COM-02, COM-03]

# Metrics
duration: ~65min
completed: 2026-09-02
---

# Phase 193 Plan 03: Avisos de sistema Summary

**Catálogo de los 7 avisos de sistema (rating_prompt, improvement_prompt, plan_expiry, y las 4 tarjetas fijas del carrusel) con el copy literal hoy hardcodeado en la app, `seedSystemAvisos()` idempotente reutilizable para altas de tenant, y migración 0217 que los siembra para todos los gimnasios existentes.**

## Performance

- **Duration:** ~65 min
- **Tasks:** 3/3
- **Files modified:** 5 (3 nuevos + 2 modificados)

## Accomplishments

- `system-avisos.ts`: `SYSTEM_AVISO_CODES`/`SystemAvisoCode`, `SYSTEM_AVISOS` (7 seeds, copy verificado contra `RatingPromptDialog.vue`, `ImprovementPromptDialog.vue`, `PlanExpiryDialog.vue`, `ImprovementCtaCard.vue`, `ReferralCtaCard.vue`, `UpsellBadge.vue`, `ProgramCtaCard.vue`), `seedSystemAvisos(db, ctx)` idempotente vía `tenantWhere`/`tenantValues`
- `0217_seed_system_avisos.sql`: 7 `INSERT INTO avisos SELECT ... FROM tenants WHERE NOT EXISTS (...)`, cero ids hardcodeados, cero `;` en comentarios, aplicada en local contra 11 tenants existentes (77 filas), idempotente al re-correr (`pnpm db:migrate` → "No new migrations to apply")
- `test/communications/system-avisos.test.ts`: 5 tests (a)-(e) — catálogo post-migración, idempotencia sobre el mismo tenant, aislamiento con `seedSecondTenant`, respeto por copy editado a mano, `sort_order` 1..4 de tarjetas sin repetidos. Los 5 en verde.
- Deviation: `limpiarSegundoGimnasio` (fixture compartido de la fase 171) ahora limpia `aviso_events`/`avisos`/`tv_avisos` scopeados al segundo gimnasio, para que los planes 04-17 (que van a crear avisos custom/eventos sobre ese fixture) no dejen filas huérfanas que rompan el `DELETE FROM tenants` final.
- Verificación: `tsc --noEmit` 0, `pnpm lint:tenant` DISCREPANCIAS: 0, `vitest run test/communications/` (los 4 archivos de la fase) 41/41 verde.

## Task Commits

Each task was committed atomically on `feat/193-comunicaciones` en el worktree `~/projects/et-193`:

1. **Task 1: Catálogo de avisos de sistema + seedSystemAvisos()** - `38fe27ef` (feat)
2. **Task 2: Migración de datos 0217 para los tenants existentes** - `83701873` (feat)
3. **Task 3: [BLOCKING] Aplicar 0217 + test de idempotencia y aislamiento** - `ad93696e` (test)

**Plan metadata:** Este SUMMARY se escribe en el checkout principal sin commitear (lo commitea el orquestador). Worktree `et-193` limpio (`git status --short` vacío) al terminar.

## Files Created/Modified

- `el-templo-api/src/modules/communications/system-avisos.ts` - catálogo + seed idempotente (D-08/D-09/D-10/D-15a/D-22)
- `el-templo-api/src/modules/communications/index.ts` - re-exporta `SYSTEM_AVISO_CODES`/`SYSTEM_AVISOS`/`seedSystemAvisos`/tipos
- `el-templo-api/src/db/migrations/0217_seed_system_avisos.sql` - migración de datos, aplicada en local
- `el-templo-api/test/communications/system-avisos.test.ts` - 5 tests de integración (a)-(e)
- `el-templo-api/test/fixtures/second-tenant.ts` - `limpiarSegundoGimnasio` limpia avisos del segundo gimnasio (deviation)

## Decisions Made

Ver `key-decisions` en el frontmatter (no agregar avisos a `TABLES_TO_CLEAN`, limpieza acotada en el fixture del segundo gimnasio, `every_open` para tarjetas, copy base de `rating_prompt`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `limpiarSegundoGimnasio` no limpiaba `aviso_events`/`avisos`/`tv_avisos` del segundo gimnasio**

- **Found during:** Task 3, al diseñar el caso (c) del test (usa `seedSecondTenant`/`seedSystemAvisos` sobre el gimnasio 2)
- **Issue:** El fixture compartido `test/fixtures/second-tenant.ts` (fase 171) es anterior a la tabla `avisos` (fase 193 plan 02) y su función de limpieza no la conocía. Como `avisos`/`tv_avisos` tienen FK a `tenants` sin cascade, un test que siembre avisos para el gimnasio 2 y no los limpie deja el `DELETE FROM tenants WHERE id = TENANT_DOS` final roto con `ER_ROW_IS_REFERENCED_2` — la misma bomba FK latente que ya documentaba el archivo para `cash_registers`/`tenant_settings`/`audit_log`. Sin este fix, cualquier plan de la fase 193 que usara el segundo gimnasio con avisos (04 en adelante) hubiera pisado esta misma trampa.
- **Fix:** Se agregaron 3 `DELETE ... WHERE tenant_id = ${TENANT_DOS}` (`aviso_events`, `avisos`, `tv_avisos`) antes del `DELETE FROM user_branches` existente — `aviso_events` primero porque también tiene FK a `users`, que se borra más abajo en la misma función.
- **Files modified:** `el-templo-api/test/fixtures/second-tenant.ts`
- **Verification:** el caso (c) de `system-avisos.test.ts` llama `limpiarSegundoGimnasio` explícitamente al final y pasa en verde; `pnpm exec vitest run test/communications/sales-number.test.ts` (otro consumidor del mismo fixture) sigue en verde tras el cambio.
- **Committed in:** `ad93696e` (Task 3 commit)

---

**Total deviations:** 1 auto-fijada (Rule 2, funcionalidad de limpieza faltante en un fixture compartido)
**Impact on plan:** Sin impacto en el objetivo del plan. El fix es puramente defensivo para planes futuros de la misma fase; no cambia el comportamiento de ningún test existente (verificado corriendo el resto de `test/communications/`).

## Issues Encountered

Ninguno bloqueante. Un ajuste de diseño no trivial durante Task 3: la primera versión del test agregaba `avisos`/`aviso_events`/`tv_avisos` a `TABLES_TO_CLEAN` global (para evitar la misma bomba FK), pero eso borraba el catálogo sembrado por la migración 0217 en el primer `beforeEach`, invalidando el caso (a) ("tras la migración..."). Se revirtió esa adición y se acotó la limpieza al fixture del segundo gimnasio únicamente (ver deviation arriba) — `avisos` queda como dato semilla estable igual que `branches`/`activities`, no reseteado por test. Documentado en el docblock del propio archivo de test para que los planes 04-17 no repitan el mismo experimento.

`vitest run` tardó ~60-97s por corrida (provisión del DB de test), dentro del `--hookTimeout=300000` indicado en las reglas duras — corrido siempre en foreground con `timeout: 590000` en la herramienta Bash.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `SYSTEM_AVISOS`, `seedSystemAvisos` y la migración 0217 quedan listos como cimiento para los planes que exponen el endpoint "qué pop-up toca hoy" (D-07), el CRUD admin del editor de avisos, el carrusel de tarjetas de Mi Templo, y el wizard de alta de tenant de la fase 182 (que llamará `seedSystemAvisos` cuando v6.1 se integre).
- Nada bloquea el plan 04: worktree limpio, `feat/193-comunicaciones` con 9 commits nuevos sobre `origin/master` `7c273a15` (3 de la 01 + 3 de la 02 + 3 de esta).
- **Nota para planes 04-17 (Claude's Discretion, ver `193-03-SUMMARY.md`):** `avisos`/`aviso_events`/`tv_avisos` NO están en `TABLES_TO_CLEAN` — cualquier test que necesite partir de cero para El Templo debe consultar el estado actual o limpiar explícitamente lo que creó, igual que `notification_templates`. Si un plan futuro usa `seedSecondTenant` junto con avisos, `limpiarSegundoGimnasio` ya los limpia (este plan lo resolvió).
- **Retiro del test A/B de copy de la tarjeta de referidos** (anotado a pedido del `<output>` del plan): `card_referral` fija la variante A de `COPIES` (`ReferralCtaCard.vue`) como el copy editable único. El componente sigue calculando la variante por paridad de `user.id` hoy — ese cálculo se retira recién cuando la app deje de renderizar copy hardcodeado y empiece a consumir el aviso editable (plan 193-15, según el mapa de patrones). Hasta entonces, el copy sembrado (variante A) es la referencia editable, sin efecto todavía sobre lo que ve el socio. Se decide en el UAT del plan 17.

---

## Self-Check: PASSED

- `el-templo-api/src/modules/communications/system-avisos.ts` — FOUND
- `el-templo-api/src/db/migrations/0217_seed_system_avisos.sql` — FOUND
- `el-templo-api/test/communications/system-avisos.test.ts` — FOUND
- Commit `38fe27ef` — FOUND
- Commit `83701873` — FOUND
- Commit `ad93696e` — FOUND
- `.planning/phases/193-comunicaciones/193-03-SUMMARY.md` — FOUND

_Phase: 193-comunicaciones_
_Completed: 2026-09-02_
