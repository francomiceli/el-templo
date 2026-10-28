---
phase: 176-m-dulos-flags-module-enabled-requiremodule-y-registry-de-hoo
plan: 10
subsystem: api
tags: [drizzle, mysql, pricing, hooks, multi-tenancy, vitest, module-flags]

# Dependency graph
requires:
  - phase: 176-08
    provides: "resolvePlanPrice/readModuleColumns (subscriptions/pricing.ts), pricingAdjustHandler (aura/pricing-benefits.ts)"
  - phase: 176-09
    provides: "changePlanAfterCurrent/changePlanNow ya convertidos a resolvePlanPrice"
provides:
  - "getPricingPreview convertido a resolvePlanPrice(commit:false, callSite:'preview'), PricingPreview sin cambios de forma"
  - "AssignPlanInput sin auraSpend/boardingPass — moduleInput es el único canal Templo"
  - "SubscriptionService sin AuraService en el constructor (17 call sites de src/ + 11 de test/ actualizados)"
  - "test/tenancy/mod-02-pricing-module-off.test.ts — el tenant sin templo-gamification cobra base sin romper"
affects: [176-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "moduleOutput narrowed por typeof/comparación literal (nunca `as`) con defaults NEUTROS cuando el filter no corrió — Pitfall 5 del plan"
    - "AssignPlanRequestBody (routes.ts, local, NO en types.ts): frontera HTTP que preserva auraSpend/boardingPass para pricingModuleInput sin reintroducirlos en el tipo core"

key-files:
  created:
    - el-templo-api/test/tenancy/mod-02-pricing-module-off.test.ts
  modified:
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/subscriptions/types.ts
    - el-templo-api/src/modules/subscriptions/routes.ts
    - el-templo-api/src/modules/subscriptions/member-routes.ts
    - el-templo-api/src/modules/auth/routes.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/src/modules/finance/routes.ts
    - el-templo-api/src/modules/finance/coach-load-routes.ts
    - el-templo-api/src/modules/scheduling/routes.ts
    - el-templo-api/src/modules/attendance/routes.ts
    - el-templo-api/src/modules/wellhub/routes.ts
    - el-templo-api/src/modules/wellhub/occupancy-listener.ts
    - el-templo-api/src/jobs/mark-no-shows.ts
    - el-templo-api/src/jobs/auto-resume-pauses.ts
    - el-templo-api/src/jobs/wellhub-sync.ts
    - el-templo-api/test/branch-access.test.ts
    - el-templo-api/test/subscriptions/charge-on-assign.test.ts
    - el-templo-api/test/subscriptions/especial-pass-core.test.ts
    - el-templo-api/test/subscriptions/user-status-history.test.ts
    - el-templo-api/test/subscriptions/impute-advance-on-assign.test.ts
    - el-templo-api/test/subscriptions/lifecycle.test.ts
    - el-templo-api/test/finance/validation-state.test.ts
    - el-templo-api/test/finance/validate-caja.test.ts
    - el-templo-api/test/users/user-status-transitions.test.ts

key-decisions:
  - "Task 2 gate: tsc quedó con exactamente 16 TS2554 y 0 de cualquier otro código — confirmado, no hubo que parar"
  - "pricingModuleInput (subscriptions/routes.ts) necesitó un tipo NUEVO no anticipado por el plan: AssignPlanRequestBody = AssignPlanInput & {auraSpend?, boardingPass?}, local a routes.ts (no en types.ts). schemas.ts sigue validando esos 2 campos en runtime; sin este tipo, borrar los campos de AssignPlanInput rompía la lectura de body.auraSpend/body.boardingPass en la ruta con TS2339 (no TS2554) — hubiera arruinado el gate de conteo de la Task 2. Documentado en el diff de la Task 2, no fue un lector 'inesperado' sino el ÚNICO ajuste de tipo necesario fuera del constructor/AssignPlanInput"
  - "attendance/routes.ts (2 call sites) conserva `const auraService = new AuraService(...)` y su import: AttendanceService lo sigue recibiendo por su propio constructor — solo se borró el argumento de la llamada a SubscriptionService"

requirements-completed: [MOD-02]

# Metrics
duration: ~2h
completed: 2026-08-21
---

# Phase 176 Plan 10: Cierre del refactor MOD-02 Summary

**`getPricingPreview` convertido a `resolvePlanPrice(commit:false, callSite:"preview")` con merge neutro, `AssignPlanInput`/constructor de `SubscriptionService` sin AURA, los 28 call sites (17 src + 11 test) actualizados, y el test de módulo OFF (5/5).**

## Performance

- **Duration:** ~2h
- **Completed:** 2026-08-21
- **Tasks:** 4/4
- **Files modified:** 24 modificados + 1 creado (25 total, coincide exacto con `files_modified` del plan)

## Accomplishments

- **Task 1** — `getPricingPreview` (`service.ts`) reemplazado por una llamada a `resolvePlanPrice` con `callSite:"preview"`, `commit:false`, `supports:{exclusiveBenefits:false, discounts:true}`. `PricingPreview` sin cambios de forma: los 6 campos de módulo (`auraBalance`, `boardingPassEligible`, `availableTiers`, `discountType`, `discountAmount`, `auraToSpend`) se leen de `moduleOutput` por `typeof`/comparación literal (nunca `as`), con defaults neutros cuando el filter no corrió. `routes.ts` arma `{ auraSpend: request.query.auraSpend }` solo si viene definido. `AURA_DISCOUNT_TIERS` dejó de importarse en `service.ts` (era su único lector).
- **Task 2** — Borrados `auraSpend?`/`boardingPass?` de `AssignPlanInput` y el 3er parámetro posicional `auraService: AuraService` del constructor de `SubscriptionService`. Plantilla aplicada al call site de `subscriptions/routes.ts`. `tsc` quedó con **exactamente 16 `TS2554`** (gate cumplido, no se paró).
- **Task 3** — Los 16 call sites restantes de `src/` (jobs, attendance, auth, finance, members, scheduling, subscriptions/member-routes, wellhub) y los 11 de `test/` (9 archivos) actualizados: se borra el argumento `auraService` y, donde el `const auraService`/import quedaban sin otro uso, también se borran. `tsc --noEmit` en 0 al cerrar.
- **Task 4** — `test/tenancy/mod-02-pricing-module-off.test.ts` (nuevo): 5 casos sobre `TENANT_TEMPLO` con `templo-gamification` apagado vía `setModuleFlag` — `auraSpend` ignorado (saldo AURA intacto), `boardingPass` ignorado (pase no consumido, ni en la sub ni en `users.boarding_pass_used`), el core (override + referido) sigue funcionando, el preview conserva los 6 campos neutros, y un contraste con el módulo prendido para descartar falsos positivos.

## Task Commits

1. **Task 1: convertir `getPricingPreview` con `commit:false` y merge neutro** — `c53e1ba9` (feat)
2. **Task 2: limpieza del tipo core + constructor sin `AuraService` (gate 16 `TS2554`)** — `f8e02219` (feat)
3. **Task 3: barrido de los 16 call sites de `src/` + 11 de `test/`** — `8caa8e99` (feat)
4. **Task 4: `mod-02-pricing-module-off.test.ts`** — `7d106254` (test)

Todos los commits atómicos en `et-176` (`feat/176-modulos`), staged por ruta (`git add <path>`, nunca `-A`/`.`).

## Files Created/Modified

**Creado:**

- `el-templo-api/test/tenancy/mod-02-pricing-module-off.test.ts` — 5 casos del comportamiento "tenant sin metodología Templo".

**Modificados (core):**

- `el-templo-api/src/modules/subscriptions/service.ts` — `getPricingPreview` vía `resolvePlanPrice`; constructor sin `auraService`; import de `AuraService`/`InsufficientBalanceError` borrado (sin más lectores); `AURA_DISCOUNT_TIERS` fuera del import.
- `el-templo-api/src/modules/subscriptions/types.ts` — `AssignPlanInput` sin `auraSpend`/`boardingPass`.
- `el-templo-api/src/modules/subscriptions/routes.ts` — call site precedente de `SubscriptionService` sin `auraService`; `getPricingPreview` recibe `moduleInput`; nuevo tipo local `AssignPlanRequestBody` para los 2 `Body:` de assign/change-plan.

**Modificados (los 16 call sites restantes de `src/`, por dominio):**

- `subscriptions/member-routes.ts`, `auth/routes.ts`, `members/routes.ts` (×3), `finance/routes.ts`, `finance/coach-load-routes.ts`, `scheduling/routes.ts` (×2), `attendance/routes.ts` (×2, conserva `auraService`/import — usado por `AttendanceService`), `wellhub/routes.ts`, `wellhub/occupancy-listener.ts`, `jobs/mark-no-shows.ts`, `jobs/auto-resume-pauses.ts`, `jobs/wellhub-sync.ts`.

**Modificados (los 11 call sites de `test/`, 9 archivos — lista REAL devuelta por `grep -rn "new SubscriptionService(" test/` antes de tocarlos):**

```
test/branch-access.test.ts:779
test/subscriptions/charge-on-assign.test.ts:20 (comentario del docblock, actualizado igual) + :397 (call site real)
test/subscriptions/lifecycle.test.ts:382 y :484
test/subscriptions/user-status-history.test.ts:76
test/subscriptions/impute-advance-on-assign.test.ts:409
test/subscriptions/especial-pass-core.test.ts:68
test/finance/validation-state.test.ts:162
test/finance/validate-caja.test.ts:186
test/users/user-status-transitions.test.ts:70
```

9 archivos, 10 call sites reales + 1 mención en comentario (11 matches de grep, tal como anticipó el plan). Todos actualizados.

## Decisions Made

- **Task 2 gate cumplido sin parar:** `tsc --noEmit` tras (a) borrar `auraSpend`/`boardingPass` de `AssignPlanInput`, (b) borrar el 3er param del constructor, (c) actualizar el único call site de `subscriptions/routes.ts`, dio **exactamente 16 `TS2554`** y ningún otro código de error. No hubo lectores inesperados de `auraSpend`/`boardingPass` fuera de lo previsto por el plan.
- **Único ajuste de tipo no anticipado literalmente por el plan (pero dentro de su intención):** `pricingModuleInput(body: AssignPlanInput)` en `subscriptions/routes.ts` leía `body.auraSpend`/`body.boardingPass` — al borrar esos campos de `AssignPlanInput`, esa función habría roto con `TS2339` (no `TS2554`), lo que hubiera hecho fallar el gate de conteo de la Task 2. Se resolvió con un tipo local **`AssignPlanRequestBody = AssignPlanInput & { auraSpend?: number; boardingPass?: boolean }`**, declarado en `routes.ts` (no en `types.ts` — el tipo core queda limpio) y usado SOLO como frontera HTTP para los 2 `fastify.post<{ Body: ... }>` de assign/change-plan. `schemas.ts` no se tocó (sigue validando esos 2 campos en runtime); el contrato HTTP es byte-idéntico. Esto se hizo DENTRO de la Task 2, antes de correr el `tsc` del gate — por eso el gate dio 16/16 limpio.
- **`attendance/routes.ts`:** único archivo de `src/` donde `const auraService`/`import { AuraService }` se conservan — lo sigue usando `AttendanceService` en su propio constructor (verificado con `grep -n "auraService" attendance/routes.ts` antes de tocar, en los 2 route-plugins del archivo).
- Se aprovecharon 2 ediciones para corregir comentarios que quedaban desactualizados por el borrado de `auraService` como servicio construido (`jobs/auto-resume-pauses.ts`: "Los seis services" → "Los cinco"; `jobs/wellhub-sync.ts`: "Los 6 que se construyen" → "Los 5") — deviation menor, Rule 1 (doc quedaba factualmente incorrecta tras el cambio).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `especial-pass-core.test.ts`: `createPlan`/`createPlan` con nombre duplicado en Task 4**

- **Found during:** Task 4, primera corrida de `mod-02-pricing-module-off.test.ts`
- **Issue:** El caso 3 (override + referido) creaba dos planes con `createPlan(app, adminToken, { priceRegular: 10000 })` sin `name`, ambos cayendo en el default `basePlan.name = "Plan Flex Mensual"` — el segundo `createPlan` devolvía 409 (`ConflictError`, nombre duplicado) en vez de 201.
- **Fix:** `name: "Plan MOD-02 Override"` y `name: "Plan MOD-02 Referral"` explícitos en cada `createPlan` del caso 3.
- **Files modified:** `test/tenancy/mod-02-pricing-module-off.test.ts`
- **Verification:** re-corrida del archivo, 5/5 verdes.
- **Committed in:** `7d106254` (parte del commit de Task 4 — se corrigió antes de commitear, no quedó rastro en el diff final).

---

**Total deviations:** 1 auto-fix (Rule 1, bug de fixture del test nuevo). 0 deviations de código de producción — el refactor de `service.ts`/`routes.ts`/call sites se ejecutó tal como especifica el plan, incluida la decisión locked de Pitfall 5.

## Issues Encountered

Ninguno relevante. No apareció el flake de DB por-worker (`eltemplo_test_1` envenenada) descrito en el prompt — todas las corridas de test (Task 1, Task 3, Task 4, golden final) fueron limpias en el primer intento salvo el fixture bug ya documentado arriba.

## Verificación (las 6 del prompt, todas confirmadas)

1. **Task 2 gate:** `tsc --noEmit > /tmp/tsc-176-10-t2.txt`, conteo `TS2554` = **16**, conteo de cualquier otro `error TS` = **0**. 12 archivos, 16 líneas (ver detalle abajo).
2. **Cierre Task 3:** `pnpm exec tsc --noEmit` → exit 0. `grep -rn "new SubscriptionService(" src/ | wc -l` = **17**. `grep -rn "new SubscriptionService(" test/ | wc -l` = **11** (mismo número que antes de tocar el barrido — no se agregaron ni borraron llamadas). `grep -rn -A6 "new SubscriptionService(" src/ test/ | grep -c "auraService"` = **0**.
3. **Los 9 archivos de test del `<verify>` de Task 3** → verdes: `branch-access.test.ts` (35 tests, 2 skipped), `charge-on-assign.test.ts` (14), `especial-pass-core.test.ts` (4), `user-status-history.test.ts` (3), `impute-advance-on-assign.test.ts` (6), `lifecycle.test.ts` (29), `validation-state.test.ts` (18), `validate-caja.test.ts` (18), `user-status-transitions.test.ts` (9) — **134 tests, 0 failed** (+2 todo preexistentes, no tocados). Sin flake de DB.
4. `git diff test/subscriptions/pricing-golden.test.ts` → **VACÍO**. `git diff src/modules/subscriptions/schemas.ts` → **VACÍO**. `PricingPreview` (`types.ts`) sin cambios de campos (confirmado con `git diff` acotado a la interface).
5. **Task 4:** `test/tenancy/mod-02-pricing-module-off.test.ts` → **5/5 passed**, sin necesitar la receta de recuperación del flake de DB.
6. `git status --porcelain` → limpio. `git diff --stat 08825071..HEAD` → **25 archivos** (24 modificados + 1 creado), coincide EXACTO con la lista `files_modified` del frontmatter del plan.

### Detalle del gate de la Task 2 (16 `TS2554`, 12 archivos)

```
src/jobs/auto-resume-pauses.ts(103,5)
src/jobs/mark-no-shows.ts(57,5)
src/jobs/wellhub-sync.ts(97,5)
src/modules/attendance/routes.ts(43,5) y (198,5)
src/modules/auth/routes.ts(333,17)
src/modules/finance/coach-load-routes.ts(253,5)
src/modules/finance/routes.ts(112,5)
src/modules/members/routes.ts(717,15), (1038,13) y (1319,9)
src/modules/scheduling/routes.ts(96,5) y (831,5)
src/modules/subscriptions/member-routes.ts(50,5)
src/modules/wellhub/occupancy-listener.ts(35,5)
src/modules/wellhub/routes.ts(43,5)
```

## Threat Flags

Ninguno — no se introdujo superficie nueva. Los 5 STRIDE del threat_model del plan (T-176-26..29, T-176-32) están mitigados: el merge neutro del preview (T-176-26) y la no-consumición del boarding pass con el módulo OFF (T-176-27) están probados por los casos 2 y 4 del test nuevo; el gate de la Task 2 (T-176-28) y el gate de conteo + barrido de `test/` (T-176-29/T-176-32) se ejecutaron literalmente como especifica el plan.

## Known Stubs

Ninguno.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- El core de suscripciones (`assignPlan`, `changePlanNow`, `changePlanAfterCurrent`, `getPricingPreview`) ya no importa `AuraService` en ningún punto de su superficie, ni en `src/` ni en `test/` — MOD-02 queda funcionalmente cerrado.
- `renewSubscription` y `getChangePlanPreview` siguen sin tocarse (fuera de alcance de MOD-02, confirmado en el plan).
- T-176-19 (los crons siguen otorgando AURA con el módulo OFF) sigue `accept` — pendiente de re-registrar en el SUMMARY final de la fase (176-11), tal como anota el threat_model del plan.
- Worktree `et-176` queda limpio (`git status --short` vacío), 4 commits nuevos sobre `08825071`, listo para 176-11.

---

_Phase: 176-m-dulos-flags-module-enabled-requiremodule-y-registry-de-hoo_
_Completed: 2026-08-21_
