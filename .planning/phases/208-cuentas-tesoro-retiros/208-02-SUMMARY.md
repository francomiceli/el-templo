---
phase: 208-cuentas-tesoro-retiros
plan: 02
subsystem: api-finance
tags: [usd, tesoro, saldos, tenancy, resolver-efectivo]
requires: ["208-01"]
provides:
  - "Altas de cuenta banco y caja de efectivo con ARS/EUR/USD (ACCOUNT_CURRENCY_SCHEMA + defensa en el service)"
  - "resolveCashRegister (rama cash) filtra por moneda: una sede puede tener caja ARS y USD"
  - "CajaSaldoRow.isTreasury en Saldos"
  - "createTreasury + POST /api/admin/finance/cash-registers/treasury (owner-only)"
  - "Excel de Saldos: Tipo 'Tesoro' para is_treasury, Central sigue 'Efectivo'"
affects: [208-03, 208-04, 208-08, 209]
key-files:
  created:
    - el-templo-api/test/finance/cuentas-usd-tesoro.test.ts
  modified:
    - el-templo-api/src/modules/finance/cash-register-service.ts
    - el-templo-api/src/modules/finance/schemas.ts
    - el-templo-api/src/modules/finance/routes.ts
    - el-templo-api/src/modules/finance/types.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - el-templo-api/test/tenancy/iso-03-finance-cajas.test.ts
    - el-templo-api/test/tenancy/iso-03-cobertura.test.ts
decisions:
  - "Unicidad del Tesoro validada en el service con tenantWhere (un Tesoro por gimnasio y moneda ACTIVO), sin UNIQUE"
  - "assertTreasuryShape como red del invariante is_treasury => efectivo y sin sede"
metrics:
  tasks: 3
  completed: 2026-11-11
---

# Phase 208 Plan 02: USD y Tesoro en la API

USD habilitado en las altas de cuentas, resolver del cobro en efectivo por moneda, `isTreasury` en Saldos y alta de Tesoro owner-only con saldo de apertura exacto, con sus gates de tenancy.

## Commits

- `306cc7bd3` feat(208-02): cuentas en USD y caja de efectivo del cobro por moneda
- `fdbcbb823` feat(208-02): alta de Tesoro owner-only y tipo Tesoro en el Excel de Saldos
- `f73d302a6` test(208-02): cuentas en USD, Tesoro, invariantes y scope owner-only

## Que se hizo

- `createBankAccountSchema` y `createEfectivoCajaSchema` usan `ACCOUNT_CURRENCY_SCHEMA`. Cambio de comportamiento: la caja de efectivo ya no acepta cualquier codigo de 3 letras (solo afecta valores invalidos). `createBankAccount`/`createEfectivoCaja` repiten la validacion con `isSupportedAccountCurrency`.
- `resolveCashRegister` rama `cash`: filtra por moneda con `orderBy(id)`. Si no hay caja en esa moneda, una segunda busqueda sin moneda elige el mensaje (`Moneda inconsistente...` vs `No existe caja efectivo...`), textos intactos.
- `CajaSaldoRow.isTreasury` (types, `listActiveCajasWithBalance`, `createEfectivoCaja`). Central y el resto: false.
- `createTreasury` + `assertTreasuryShape` + `createTreasurySchema` + ruta `POST /cash-registers/treasury` (403 para no-owner). Scope de listados heredado sin cambios (branch_id NULL = owner-only).
- Excel de Saldos: columna Tipo = "Tesoro" si `isTreasury`.
- Gates de tenancy: manifiesto (555 entradas), describe ISO-03 con aislamiento + control, `CASOS_BASELINE` 51.

## Verificacion

- `npx tsc --noEmit` (api): 0. `pnpm lint:tenant`: DISCREPANCIAS 0. `pnpm typecheck:tests`: 18 (preexistentes, ninguna en archivos del plan).
- Tests con DB, en foreground y de a un archivo: `iso-03-cobertura` 8/8, `iso-01-manifiesto` 13/13, `iso-03-finance-cajas` 55/55, `cuentas-usd-tesoro` 17/17, `cash-balances` 8/8 (regresion de Saldos).

## Decisiones del ejecutor / desviaciones

1. **Campo extra en el body del Tesoro: 201, no 400.** El plan esperaba 400 por `additionalProperties:false`, pero Fastify/Ajv corre con `removeAdditional`: el campo se descarta. El test afirma lo que importa: un `branchId` en el body no llega al INSERT (el Tesoro nace sin sede).
2. **Central del test con saldo de apertura 1000:** `registerMovement` rechaza dejar una caja en negativo; la Central de prueba (creada en el test, no la sembrada por 0154) arranca con 1000 para poder trasladar 100,50 al Tesoro.
3. **ISO-03 del gimnasio 2:** el fixture solo tiene admin y coach; el caso crea un owner del gimnasio 2 con `createStaffUser(role "owner", tenantId TENANT_DOS)` dentro del `it`.
4. Prettier (lint-staged) reformateo parte de `iso-03-finance-cajas.test.ts` mas alla del bloque nuevo; sin cambios de logica.
5. Los tests de Saldos aceptan 250,75 o 750,75 para la caja ARS de la sede (apertura, con o sin el cobro de 500 de otro `it`): lo que se afirma es que no se mezcla con la USD.
6. Una corrida de `cash-balances` quedo cortada por la sesion (exit 137) y se repitio completa: 8/8.

## Para los planes siguientes

- `CajaSaldoRow` ahora exige `isTreasury`: cualquier constructor nuevo de ese tipo debe pasarlo.
- Fastify recorta campos extra en bodies (no 400): los tests de "campo extra" deben afirmar que no se persiste.
- `registerMovement` no deja una caja de efectivo en negativo: los tests de traslados/retiros hacia Tesoro o Central necesitan saldo de apertura en el origen.
- Los Tesoros activos sobreviven entre archivos del worker (`cash_registers` no se limpia): desactivarlos en `beforeAll` y al final.
- `resolveCashRegister` ya resuelve por moneda: el retiro con destino (208-04+) puede asumir una caja de efectivo de sede por (sede, moneda).
- Admin: el selector de monedas debe ofrecer USD y el alta de Tesoro llama a `POST /cash-registers/treasury` (body `{ name, currency, openingBalance? }`, respuesta `{ caja }`).
- Pendiente fuera de alcance: selectores de moneda del admin y agrupaciones por moneda en Reportes/Tablero/Analiticas (DI-02) no se tocaron en este plan (solo API de cuentas y Saldos).

## Self-Check: PASSED

Commits 306cc7bd3, fdbcbb823 y f73d302a6 existen; archivos creados/modificados presentes; tsc 0, lint:tenant 0.
