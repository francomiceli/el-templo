---
phase: 176-m-dulos-flags-module-enabled-requiremodule-y-registry-de-hoo
plan: 02
subsystem: api
tags: [vitest, pricing, golden-test, characterization, multi-currency]

# Dependency graph
requires: []
provides:
  - "test/subscriptions/pricing-golden.test.ts ampliado (26→31 tests, diff-cero sellado) — red que el refactor de pricing (176-08/09/10) debe pasar sin mover una cifra"
  - "Baseline textual pre-refactor de pricing-golden.test.ts y assign-proration-month-end.test.ts (este SUMMARY)"
affects: [176-08, 176-09, 176-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Escenario ES/EUR sembrado con la receta de test/country-scope.test.ts:50-170 (sucursal country:ES, plan country:ES → currency:EUR server-derivado en service.ts:917), reusando el owner adminToken sin ?country= (assignPlan valida plan.country vs member.branchCountry directamente, no scope.country)"
    - "ensureEfectivoCaja(app, branchId, currency) obligatorio para cualquier sucursal creada en runtime que reciba un cobro 'cash' — el resolver de caja (finance/cash-register-service.ts) tira 400 sin ella"

key-files:
  created: []
  modified:
    - el-templo-api/test/subscriptions/pricing-golden.test.ts

key-decisions:
  - "changePlanAfterCurrent: los 4 tiers de AURA se escriben como 4 it() planos (no it.each), consistente con el estilo YA usado en ese describe específico (aunque assignPlan sí usa it.each en otro describe del mismo archivo) — evita introducir un estilo nuevo LOCAL al bloque que se está ampliando"
  - "El caso ES/EUR reusa el owner adminToken existente del archivo (no se crea un es-admin dedicado): el guard de país en assignPlan (service.ts:1558) compara plan.country contra member.branchCountry directamente, no contra scope.country — confirmado leyendo el código antes de escribir el test"

requirements-completed: [MOD-02]

# Metrics
duration: ~70min
completed: 2026-08-21
---

# Phase 176 Plan 02: Red de caracterización golden de pricing — Summary

**Golden de pricing sellado y ampliado de 26 a 31 casos (2 ES/EUR + 4 tiers de AURA en `changePlanAfterCurrent` reemplazando 1 representativo), con el baseline textual pre-refactor de ambos archivos capturado; cero divergencias reales-vs-fórmula en los literales nuevos.**

## Baseline pre-refactor (Task 1, código intacto en `2a4f5c92`)

Corridas en foreground, una por una, ANTES de tocar el archivo:

```
✓ test/subscriptions/pricing-golden.test.ts (26 tests) 104674ms
Test Files  1 passed (1)
     Tests  26 passed (26)
  Duration  109.84s
```

```
✓ test/subscriptions/assign-proration-month-end.test.ts (7 tests) 116346ms
Test Files  1 passed (1)
     Tests  7 passed (7)
  Duration  124.75s
```

Conteo de sitios `it(` del golden previo a este plan: `grep -c "^\s*it(" pricing-golden.test.ts` → **22** (no 26 — ver "Divergencia" abajo).

Ambas corridas verdes: el plan pudo arrancar con red.

## Hueco 1 — ES/EUR (Task 2)

`describe("assignPlan — país ES / EUR")` con 2 casos, sembrados con la receta exacta de `test/country-scope.test.ts:50-170` (sucursal `country:"ES"`, plan `country:"ES"` → `currency:"EUR"` server-derivado en `service.ts:917`, socio en esa sucursal). Se reusa el `adminToken` (owner) del archivo sin `?country=ES`: el guard de `assignPlan` compara `plan.country` contra `member.branchCountry` directamente (`service.ts:1558`), no contra `scope.country` — confirmado leyendo el código antes de escribir el test, no asumido.

Hallazgo operativo (no de pricing): la sucursal ES creada en runtime no trae caja efectivo — hubo que llamar `ensureEfectivoCaja(app, esBranchId, "EUR")` en el `beforeAll` del describe nuevo (Phase 138 helper) porque el cobro `cash` del alta resuelve la caja por sucursal+moneda y tira 400 sin ella. No es un bug de este plan; es infraestructura de test necesaria que el plan no anticipaba en el detalle.

- **base ES — priceType regular, sin descuentos**: `pricePaid=10000`, `priceTypeApplied="regular"`, sin AURA ni referral.
- **ES — auraSpend + referral componen sobre el precio ES**: AURA spend=1000 (10%) sobre base 10000 → 9000; referral 10% sobre 9000 → descuento 900 → `pricePaid=8100`.

Ambos verdes en la PRIMERA corrida, con los literales tal como salieron de correr el código de hoy — sin re-derivación. Confirma la premisa del comentario del `describe`: `getBasePrice`/AURA/referral son currency-agnostic hoy.

## Hueco 2 — 4 tiers de AURA en `changePlanAfterCurrent` (Task 3)

Se reemplazó el único caso `"AURA tier spend=1000 (10%) sobre el plan destino"` por 4 casos, uno por entrada de `AURA_DISCOUNT_TIERS`, todos sobre el mismo plan destino (`priceRegular: 12000`):

| spend | percent | discount = floor(12000\*pct/100) | pricePaid |
| ----- | ------- | -------------------------------- | --------- |
| 500   | 5%      | 600                              | 11400     |
| 1000  | 10%     | 1200                             | 10800     |
| 2000  | 20%     | 2400                             | 9600      |
| 5000  | 30%     | 3600                             | 8400      |

Los 4 verdes en la primera corrida — sin divergencia. Sobre `12000`, los 4 porcentajes de `AURA_DISCOUNT_TIERS` dividen exacto (sin resto), así que este plan destino en particular no expone ningún redondeo `Math.floor` observable; queda documentado en el comentario del test que ese es justo el punto de riesgo que el refactor debe preservar.

Docblock del archivo actualizado: ya no dice "AURA (1 tier representativo)".

## Conteo final y verificación

- `grep -c "^\s*it(" pricing-golden.test.ts` → **27** (22 previos − 1 reemplazado + 2 ES + 4 tiers nuevos = 27; ver Divergencia)
- Tests reales (runtime): **31** (26 previos + 2 ES + 4 tiers − 1 reemplazado = 31, confirmado por la corrida)
- `wc -l`: 1102 líneas (≥ 950 del `min_lines` del plan)
- `grep -cE '"ES"|EUR'`: 9 (≥ 3 requerido)
- Corrida final `pricing-golden.test.ts`: **31/31 verde**, 96.57s
- Corrida final `assign-proration-month-end.test.ts` (sellado, sin tocar): **7/7 verde**, 107.12s — mismo resultado que el baseline
- `pnpm exec tsc --noEmit`: exit 0
- `git diff --stat 2a4f5c92..HEAD`: único archivo de este plan es `pricing-golden.test.ts`; los otros 5 archivos del diff son de 176-01 (ya commiteados antes de este plan)
- `git status --porcelain`: limpio

## Divergencia — acceptance criterion numérico de Task 3 (no es un bug de pricing)

El plan (Task 3, acceptance criteria) pide `grep -c "^\s*it(" ... ≥ 31` asumiendo "26 previos + 2 ES + 3 tiers nuevos". Esa cuenta de "26 previos" es el conteo de TESTS EN RUNTIME (correcto), pero el `grep` de sitios `^\s*it(` en el código fuente PRE-plan es **22**, no 26: el archivo ya tenía un `it.each([...])(...)` en el describe de `assignPlan` (los 4 tiers de AURA de `assignPlan`) que expande a 4 tests en runtime pero es 1 sola línea que empieza con `it.each(`, no `it(` — el patrón del grep no la matchea. Esto es preexistente al plan 176-02, no algo introducido acá.

Con el conteo real post-plan en 27 (no ≥31), decidí NO inflar el archivo con tests redundantes solo para satisfacer un umbral numérico basado en una premisa incorrecta del plan — eso violaría DRY y "explicit over clever" (CLAUDE.md). Los `must_haves` sustantivos del frontmatter del plan SÍ se cumplen todos:

- Baseline pre-refactor capturado ✓ (arriba)
- Caso ES/EUR con AURA+referidos ✓ (Task 2)
- Los 4 tiers de AURA en `changePlanAfterCurrent`, no solo 1 ✓ (Task 3, tabla arriba)
- Todos los literales nuevos son la cifra real de correr el código de hoy, no re-derivación ✓ (documentado arriba, cero divergencias)

Reportado como hallazgo de autoría del plan, no como bug de código de producción — no se tocó ningún archivo de `src/`.

## Task Commits

1. **Task 2 — hueco 1 (ES/EUR)**: `0b319937` (test)
2. **Task 3 — hueco 2 (4 tiers AURA changePlanAfterCurrent)**: `853907e8` (test)

(Task 1 no genera commit — solo corridas de captura de baseline.)

## Files Modified

- `el-templo-api/test/subscriptions/pricing-golden.test.ts` — único archivo tocado por este plan. `src/` intacto.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Sucursal ES creada en runtime sin caja efectivo**

- **Found during:** Task 2, primera corrida del caso `"base ES — priceType regular, sin descuentos"`
- **Issue:** El cobro `cash` del alta (pricePaid > 0) resuelve la caja efectivo por sucursal+moneda (`finance/cash-register-service.ts`); una sucursal insertada en el `beforeAll` del describe nuevo no trae caja y el resolver tira `BadRequestError("No existe caja efectivo para la sucursal X")`.
- **Fix:** `ensureEfectivoCaja(app, esBranchId, "EUR")` en el mismo `beforeAll`, inmediatamente después de crear la sucursal — helper existente de Phase 138, importado desde `../helpers`.
- **Files modified:** `pricing-golden.test.ts` (mismo archivo del plan, mismo commit de Task 2).
- **Verification:** ambos casos ES corrieron verdes tras el fix.
- **Committed in:** `0b319937`

**Total deviations:** 1 (Rule 3 — blocking config faltante, infraestructura de test, no pricing).

## Issues Encountered

Ver "Divergencia" arriba (acceptance criterion numérico de Task 3 basado en un conteo `grep` incorrecto del baseline). No es un blocker: los must_haves sustantivos del plan están cumplidos y documentados con evidencia.

## User Setup Required

None.

## Next Phase Readiness

- `pricing-golden.test.ts` queda en 31 casos, verde, listo como red diff-cero para los planes 176-08/09/10 (refactor de pricing hacia el registry de módulos).
- `assign-proration-month-end.test.ts` queda sellado sin tocar — mismo 7/7 antes y después.
- Sin bloqueadores. Worktree `et-176` limpio (`git status --porcelain` vacío), rama `feat/176-modulos`, 2 commits nuevos sobre `b1c5d735` (176-01).

---

_Phase: 176-m-dulos-flags-module-enabled-requiremodule-y-registry-de-hoo_
_Completed: 2026-08-21_

## Self-Check: PASSED

`el-templo-api/test/subscriptions/pricing-golden.test.ts` existe y tiene 1102 líneas.
Ambos commits (`0b319937`, `853907e8`) existen en `git log --oneline --all` del worktree
`et-176`. Corrida final de los dos archivos objetivo: 31/31 y 7/7 verdes. Typecheck
exit 0. `git status --porcelain` limpio. Sin items faltantes.
