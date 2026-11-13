---
phase: 207-centavos-sede-alumno
plan: 09
subsystem: admin-money
tags: [money, formatPrice, parser, MoneyInput, es-AR]
requires: ["207-08"]
provides:
  - "el-templo-admin/src/utils/money.ts: roundMoney, toCents, fromCents, sumMoney, moneyEquals, compareMoney, fractionDigitsFor, formatMoneyNumber, parseMoneyInput, MONEY_PARSE_MESSAGES"
  - "formatPrice (admin y app) con decimales solo si el importe no es entero"
  - "el-templo-admin/src/components/MoneyInput.vue (v-model number | null)"
affects: [207-10, 207-11]
key-files:
  created:
    - el-templo-admin/src/utils/money.ts
    - el-templo-admin/src/utils/__tests__/money.test.ts
    - el-templo-admin/src/components/MoneyInput.vue
    - el-templo-app/test/format-price.test.ts
  modified:
    - el-templo-admin/src/utils/format-price.ts
    - el-templo-admin/src/utils/extract-error.ts
    - el-templo-admin/src/utils/__tests__/extract-error.test.ts
    - el-templo-admin/src/pages/AlumnosPage.vue
    - el-templo-app/src/utils/format-price.ts
decisions:
  - "Con centavos se muestran SIEMPRE 2 decimales (1.234,50), no min 0/max 2 (1.234,5): lo fija el plan y su test"
  - "'1.500' = mil quinientos (convención es-AR); '1.50' = uno con cincuenta; '1234.567' = invalid; '10.5555' = too_many_decimals"
  - "El texto del input se interpreta en MoneyInput con un lastEmitted para distinguir el eco del propio emit de un cambio externo"
metrics:
  tasks: 3
  completed: 2026-11-10
---

# Phase 207 Plan 09: base del admin para centavos

`utils/money.ts` (duplicado deliberado del helper del API, misma semántica de redondeo simétrico y sin `-0`), parser/formato es-AR, regla de decimales en `formatPrice` (admin y app) y el componente `MoneyInput`, sin uso todavía (lo adoptan 207-10 y 207-11).

## Commits

- `0e2cb1f91` test(207-09): parser, formato y aritmética de importes del admin
- `e0511fc83` feat(207-09): utils/money.ts del admin (centavos, parser y formato es-AR)
- `b23d6a244` feat(207-09): formatPrice y formateos sueltos del admin con centavos
- `798119aa3` feat(207-09): formatPrice de la app sincronizado con el del admin
- `ae39082df` test(207-09): formatPrice de la app y total de cobros activos con centavos
- `fc48b2b30` feat(207-09): componente MoneyInput para importes es-AR con centavos
- `5411b0ab3` style(207-09): prettier en money.test.ts

## Verificación

| Gate | Antes | Después |
|------|-------|---------|
| vue-tsc admin (`error TS`) | 27 | 27 |
| vue-tsc app (`error TS`) | 21 | 21 |
| eslint de los archivos tocados (admin) | - | sin errores |
| prettier de los archivos nuevos | - | ok |

Tests (todos foreground):

- `el-templo-admin/src/utils/__tests__/money.test.ts`: 43/43.
- `el-templo-admin/src/utils/__tests__/extract-error.test.ts`: 9/9 (3 nuevos: total entero, total con centavos, otro error).
- `el-templo-app/test/format-price.test.ts`: 6/6.

Vía de ejecución de los tests del admin: el admin no tiene `vitest` en su `node_modules`, así que `cd el-templo-admin && npx vitest` no existe. Funcionó la vía 1 del plan, usando el vitest de la app con `--root`: `cd el-templo-app && npx vitest run --root ../el-templo-admin src/utils/__tests__/money.test.ts`.

## Cambios por archivo

- `money.ts`: contrato completo de las interfaces. Parser: ignora espacios, `$` y `€`; con coma es el decimal (una sola, parte entera vacía o con puntos de miles mal agrupados -> invalid, 3+ decimales -> too_many_decimals); sin coma: entero, miles (`^\d{1,3}(\.\d{3})+$`), decimal con punto (1-2 dígitos), 4+ decimales -> too_many_decimals, el resto invalid. `fractionDigitsFor` decide sobre el importe redondeado a centavos.
- `format-price.ts` (admin y app): redondea con `roundMoney` y usa `fractionDigitsFor` para min y max en los tres caminos (ARS, EUR, fallback). La app lleva `toCents/roundMoney/fractionDigitsFor` privados (sin `;`).
- `extract-error.ts`: `Intl.NumberFormat` del mensaje de cobros activos con `fractionDigitsFor`.
- `AlumnosPage.vue`: `formattedTotalDebt` usa `formatMoneyNumber(t.amount)`.
- `MoneyInput.vue`: contrato de las interfaces (`inheritAttrs: false`, `v-bind="$attrs"`, `inputmode="decimal"`, reescritura formateada al perder foco, watch de cambios externos, rules del padre con el número parseado, `validate`/`resetValidation` expuestos).

## Desviaciones

1. **[Rule 3 - blocking] `@ts-expect-error` en `money.test.ts`.** El admin no declara `vitest`, así que cada archivo de test del admin suma 1 `TS2307` a la línea base (ya está dentro de los 27 en los tests existentes). Para NO sumar a la línea base, el test nuevo silencia ese único import con `// @ts-expect-error` (comentado) y usa bucles `for` en lugar de `it.each` (los callbacks de `it.each` quedaban con `any` implícito). Si algún día se agrega `vitest` al admin, hay que quitar ese comentario (el propio vue-tsc lo marcará).
2. **Formato con centavos: exactamente 2 decimales**, no "min 0, max 2" de la lección 2 del prompt: el plan (lección de formato) y su test (`1.234,50`) lo fijan así. Cambiarlo es una línea de `fractionDigitsFor` si se prefiere otra cosa.
3. **Tests extra** no previstos: 3 casos de `parseActiveTransactionsBlock` en `extract-error.test.ts` (no había cobertura de ese mensaje).
4. Commit `style(207-09)` aparte: el hook de lint-staged no formateó `money.test.ts` en el commit del test (prettier lo reformateó una lista larga).

## Bugs encontrados

Ninguno fuera del plan. Nota sobre `roundMoney`: usa `Math.round(abs * 100)`, igual que el API, así que `roundMoney(1.005)` da `1.00` (1.005*100 = 100.49999999999999). Es la misma semántica que el API y no afecta a los importes de 2 decimales (el parser solo produce valores de 2 decimales).

## Limitaciones conocidas de MoneyInput

- No hay test de componente (el admin no tiene runner ni `@vue/test-utils`): cubierto por vue-tsc + eslint y por los tests de las utilidades que usa.
- Si el texto tipeado es inválido (emite `null`) y el padre resetea a `null` desde afuera, el texto inválido queda (no hay cambio de valor que dispare el watch). Los diálogos que recrean el componente al abrir no lo sufren.

## Known Stubs

Ninguno. `MoneyInput` está sin uso a propósito hasta 207-10/207-11.

## Self-Check: PASSED
