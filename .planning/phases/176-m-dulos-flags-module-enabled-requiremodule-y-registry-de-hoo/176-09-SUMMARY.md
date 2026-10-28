---
phase: 176-m-dulos-flags-module-enabled-requiremodule-y-registry-de-hoo
plan: 09
subsystem: api
tags: [drizzle, mysql, pricing, hooks, multi-tenancy, vitest]

# Dependency graph
requires:
  - "resolvePlanPrice/readModuleColumns (el-templo-api/src/modules/subscriptions/pricing.ts) — 176-08"
  - "pricingAdjustHandler (el-templo-api/src/modules/aura/pricing-benefits.ts) — 176-08"
provides:
  - "changePlanAfterCurrent delegando boarding pass + AURA al filter pricing.adjust (supports: exclusiveBenefits+discounts)"
  - "changePlanNow delegando boarding pass al filter pricing.adjust, SIN AURA (supports: exclusiveBenefits, discounts:false)"
affects: [176-10, 176-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Razón de override persistida derivada de resolved.exclusive/resolved.applied[0].benefit, no de una relectura de moduleInput — evita que el core re-nombre 'boarding pass'"
    - "El neto contra el crédito remanente (proration) se calcula DESPUÉS de resolvePlanPrice, fuera de la función core — la proration en sí NO cruza al filter"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/test/subscriptions/pricing-golden.test.ts

key-decisions:
  - "changePlanNow: supports: { exclusiveBenefits: true, discounts: false } — única aparición de esa combinación exacta en el archivo (verificado por grep)"
  - "changePlanAfterCurrent: supports: { exclusiveBenefits: true, discounts: true }, sin prorate (ese método no lo tiene), simétrico a assignPlan (176-08)"
  - "El override CORE de changePlanNow sigue sin netearse contra el crédito remanente (comportamiento preexistente, no tocado)"
  - "Se agregó UN caso golden nuevo (razón persistida con boarding pass) — el golden previo no afirmaba priceOverrideReason para ningún caso de changePlanNow"

requirements-completed: [MOD-02]

# Metrics
duration: ~2h
completed: 2026-08-21
---

# Phase 176 Plan 09: Convertir changePlanAfterCurrent y changePlanNow a resolvePlanPrice Summary

**Los dos métodos de escritura restantes (`changePlanAfterCurrent` simétrico, `changePlanNow` asimétrico — boarding sí, AURA no) delegan boarding pass/AURA al filter `pricing.adjust`, con golden diff-cero y un caso nuevo que ahora afirma byte a byte la razón persistida con "(boarding pass)".**

## Performance

- **Duration:** ~2h (incluye reintentos por el flake de DB compartida con `et-analytics-scope`)
- **Completed:** 2026-08-21
- **Tasks:** 2/2
- **Files modified:** 2 (`service.ts`, `pricing-golden.test.ts`)

## Accomplishments

- `changePlanAfterCurrent` (Task 1): reemplazado el `if/else if/else` de precio por una llamada a `resolvePlanPrice` (`callSite: "change-after-current"`, `commit: true`, `supports: { exclusiveBenefits: true, discounts: true }`, sin `prorate` — ese método no lo tiene), simétrico a `assignPlan` (176-08).
- `changePlanNow` (Task 2): reemplazado el `if/else if/else` por `resolvePlanPrice` con `supports: { exclusiveBenefits: true, discounts: false }` (asimetría preservada: NUNCA soportó AURA). El neto contra el crédito remanente de la sub vigente se calcula DESPUÉS del filter, en el core (`Math.max(0, resolved.price - proration.remainingValue)`), igual que antes.
- Las dos razones persistidas (`priceOverrideReason` de `changePlanNow`) se arman desde `resolved.exclusive`/`resolved.applied[0]?.benefit` — no de una relectura de `moduleInput` — para que el core no vuelva a nombrar "boarding pass" pero el string byte a byte de siempre sobreviva.
- Borrado en ambos métodos: `this.auraService`, `AURA_DISCOUNT_TIERS`, `input.auraSpend`, `input.boardingPass`, y el `UPDATE users.boardingPassUsed` (ahora una sola escritura, la del handler `pricingAdjustHandler`).
- Bloques de referidos posteriores en ambos métodos: intactos, byte a byte, con sus guards de categoría (`planCategory !== "especial"`).

## Task Commits

1. **Task 1: convertir `changePlanAfterCurrent`** — `85430a3c` (feat)
2. **Task 2: convertir `changePlanNow` + caso golden de la razón boarding pass** — `08825071` (feat)

Ambos commits atómicos en `et-176` (`feat/176-modulos`), staged por ruta (`git add <path>`, nunca `-A`/`.`).

## Files Modified

- `el-templo-api/src/modules/subscriptions/service.ts` — los dos métodos delegan al módulo vía `resolvePlanPrice`/`readModuleColumns`.
- `el-templo-api/test/subscriptions/pricing-golden.test.ts` — un caso nuevo (`"boardingPass — razón persistida byte a byte con '(boarding pass)'"`), agregado ANTES del refactor conceptualmente (mismo patrón del docblock del archivo), sin tocar ningún literal existente.

## Verificación (6 puntos, todos confirmados)

1. **`pnpm exec tsc --noEmit`** → exit 0, sin errores. Confirmado en 4 puntos distintos de la ejecución (tras Task 1, tras Task 2, tras el revert/reapply para separar commits, y en el estado final).
2. **`git diff test/subscriptions/pricing-golden.test.ts`** → NO vacío, pero el ÚNICO cambio es el caso nuevo agregado (ver abajo). Ningún literal `toBe(N)`/`toBe("...")` preexistente fue tocado — confirmado leyendo el diff completo (`git diff` muestra únicamente un bloque `it(...)` insertado entre los dos casos de boarding pass de `changePlanNow`).
3. **`pnpm exec vitest run test/subscriptions --no-file-parallelism --hookTimeout=250000`** → VERDE. Corrido 3 veces en total (una vez tras Task 1+2 combinados, y una vez más tras la separación de commits para confirmar el estado final byte a byte): **29/29 archivos, 293/293 tests** verdes las dos últimas veces (292 antes de agregar el caso nuevo). El golden específico: **32/32 tests** (31 preexistentes + 1 nuevo).
4. **Grep-ables:**
   - `changePlanAfterCurrent`: 0 apariciones de `auraService`/`AURA_DISCOUNT_TIERS`/`input.auraSpend`/`input.boardingPass` dentro del cuerpo del método (confirmado con `awk` acotado a las líneas del método).
   - `changePlanNow`: 0 apariciones de `input.boardingPass`/`auraService` dentro del cuerpo del método.
   - `grep -n "supports: { exclusiveBenefits: true, discounts: false }" service.ts` → **exactamente 1 match**, línea 3834 (dentro de `changePlanNow`). `discounts: true` aparece 2 veces (línea 1793 `assignPlan`, línea 4404 `changePlanAfterCurrent`).
5. **`test/tenancy/`** → **NO convergió, pendiente por contención documentada**. Ver sección dedicada abajo.
6. **`git status --porcelain`** → limpio. **`git diff --stat 5d0b3b43..HEAD`** → solo `service.ts` (221 líneas +141/-120 acumulado) y `pricing-golden.test.ts` (+40 líneas, el caso nuevo). Ningún otro archivo tocado.

## El diff-cero del golden

`git diff test/subscriptions/pricing-golden.test.ts` contra el HEAD anterior a este plan **no está vacío**, pero la diferencia es EXCLUSIVAMENTE la inserción de un caso nuevo:

```
it("boardingPass — razón persistida byte a byte con '(boarding pass)'", async () => {
  ...
  expect(res.body.priceOverrideReason).toBe(
    "Cambio de plan (boarding pass): credito $5000 (15/30 dias)",
  );
});
```

**Por qué se agregó:** revisando `test/subscriptions/pricing-golden.test.ts` línea por línea antes de tocar `service.ts`, ninguno de los tres casos existentes de `describe("changePlanNow", ...)` (`base`, `boardingPass — consume el pase...`, `referral`) afirma `res.body.priceOverrideReason`. El plan exige, si el golden no afirma hoy la razón con `(boarding pass)`, agregar UN caso que lo haga con el string exacto — así el refactor queda protegido contra que alguien rompa el texto persistido sin que ningún test lo note. El literal `"Cambio de plan (boarding pass): credito $5000 (15/30 dias)"` se derivó leyendo `calculateProration` (rama "unlimited plan — prorate by remaining days", `remainingDetail: \`${daysRemaining}/${totalDays} dias\``) para el fixture del test (plan A: `durationDays=30`, `priceRegular=10000`, `startDate = hoy-15`→`totalDays=30`, `daysRemaining=15`, `remainingValue = round(15/30 \* 10000) = 5000`) — corrí el test contra el código YA refactorizado (que preserva el string exacto de antes del refactor) para confirmar el valor real antes de fijarlo como literal.

**Ningún literal preexistente fue tocado.** Confirmado inspeccionando el diff completo: el único hunk es una inserción pura entre dos `it()` existentes, sin modificar una sola línea de los casos previos.

## `test/tenancy/` — pendiente por contención de infraestructura (NO por regresión)

Intenté correr `test/tenancy` completo primero (36 archivos). El primer intento avanzó limpio durante ~8 minutos (decenas de archivos verdes, incluido `mod-02-hooks.test.ts` con 6/6 tests pasando — el archivo más directamente relacionado con el mecanismo de hooks que usa este plan) y terminó con exit code 144 sin una sola aserción roja — consistente con un timeout/kill de infraestructura del runner de background, no con un fallo de test.

Reduje el alcance a los dos archivos más relevantes (`mod-01-guard.test.ts` + `mod-02-hooks.test.ts`) y reintenté **4 veces**. Las 4 corridas fallaron en `test/setup.ts` (`provisionWorkerDB`) ANTES de llegar a ejecutar un solo `it()` real, con errores rotativos del flake documentado en el prompt (`Unknown database 'eltemplo_test_1'`, `Cannot read properties of undefined (reading 'dbPool')`, `Unknown column 'description' in 'field list'`) — todos síntomas de la contención con la sesión paralela `et-analytics-scope` compartiendo la misma DB por-worker, exactamente como estaba anticipado. Ninguno de los 4 intentos llegó a una aserción de mi código.

**No toqué `test/setup.ts` ni el código de servicio para "arreglar" esto** (regla explícita del prompt). Dejo esto anotado como pendiente por contención — el orquestador ya conoce el flake. Evidencia indirecta de que el mecanismo de hooks sigue sano: `mod-02-hooks.test.ts` pasó 6/6 en el intento previo (parcial) del suite completo, y `test/subscriptions` (293/293, incluye pricing-golden con las 3 rutas de escritura convertidas) corrió verde de punta a punta sin un solo reintento fallido en su última corrida.

## Confirmación: una sola escritura de `boardingPassUsed`

Grep de `boardingPassUsed: true` (el UPDATE) en `service.ts` tras este plan: la única escritura que queda en el archivo de servicio es la del handler `pricingAdjustHandler` (`aura/pricing-benefits.ts`, ya existente desde 176-08) — ninguno de los dos métodos de este plan escribe la columna directamente. `changePlanAfterCurrent` y `changePlanNow` solo LEEN el resultado vía `readModuleColumns(resolved).boardingPassUsed` para persistirlo en la fila de la nueva `subscription` (columna de trazabilidad, no el flag one-shot del user).

## Deviations from Plan

### Auto-fixed Issues

Ninguna — el plan se ejecutó tal cual estaba escrito, incluidas las decisiones locked byte a byte.

### Documented, no-fix (scope boundary / flake conocido)

**1. `test/tenancy` no convergió por contención de DB compartida**

- **Found during:** verificación final (punto 5 del checklist)
- **Issue:** 4 intentos + 1 corrida completa parcial fallaron en el setup de infraestructura del test (provisioning de la DB por-worker), nunca en una aserción de mi código.
- **Fix:** Ninguno — es exactamente el flake anticipado en el prompt (sesión paralela `et-analytics-scope`). No se tocó `test/setup.ts`.
- **Evidence of health:** `mod-02-hooks.test.ts` (6/6) pasó en la corrida parcial completa; `test/subscriptions` (293/293) pasó limpio.

---

**Total deviations:** 0 fixes de código. 1 item documentado sin fix (flake de infraestructura, fuera de mi control).

## Next Phase Readiness

- Los 3 métodos de escritura de pricing (`assignPlan` 176-08, `changePlanAfterCurrent` y `changePlanNow` 176-09) delegan la parte Templo al filter `pricing.adjust`. `renewSubscription` y `getChangePlanPreview` siguen sin tocarse, tal como exige el plan.
- El worktree `et-176` queda limpio (`git status --short` vacío), 2 commits nuevos sobre `5d0b3b43`, listo para 176-10.
- `test/tenancy/` completo queda pendiente de una corrida limpia (sin contención) — no bloquea este plan, pero el orquestador debería reintentarlo cuando la sesión paralela libere la DB.

---

_Phase: 176-m-dulos-flags-module-enabled-requiremodule-y-registry-de-hoo_
_Completed: 2026-08-21_
