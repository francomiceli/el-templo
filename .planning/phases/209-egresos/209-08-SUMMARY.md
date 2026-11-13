---
phase: 209-egresos
plan: 08
subsystem: finance
tags: [egresos, pagos, rutas, ajv, permisos, tenancy, iso-01, iso-03]
requires: [209-05, 209-06, 209-07]
provides:
  - POST /expense-records/:id/payments (registrar pago)
  - POST /expense-records/:id/payments/:paymentId/void (anular pago)
  - registerExpensePaymentSchema y voidExpensePaymentSchema
  - casos ISO-03 de los dos pagos
affects: [209-09, 209-10, 209-11]
tech-stack:
  added: []
  patterns: [rutas de pagos en registerExpenseRoutes con el paymentService ya instanciado, pais por id con byIdCountry]
key-files:
  created:
    - el-templo-api/test/finance/egresos-pagos-rutas.test.ts
  modified:
    - el-templo-api/src/modules/finance/expense-schemas.ts
    - el-templo-api/src/modules/finance/expense-routes.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - el-templo-api/test/tenancy/iso-03-cobertura.test.ts
    - el-templo-api/test/tenancy/iso-03-finance-egresos.test.ts
decisions:
  - Los pagos se siembran en el beforeEach de la bateria ISO-03 (no beforeAll), igual que los gastos de 209-07
  - El control de anular gasto propio de 209-07 pasa a anular un gasto propio NUEVO sin pagos (el gasto sembrado ya tiene un pago vigente)
metrics:
  tasks: 2
  completed: 2026-11-11
---

# Phase 209 Plan 08: Rutas de pagos de gastos Summary

Dos rutas HTTP para pagar un gasto y anular un pago (DI-13), con los permisos de DI-14 (cargar pago: owner, admin, gestion; anular: owner, admin), sus gates de tenancy (manifiesto ISO-01 y bateria ISO-03) y 23 casos HTTP que prueban que gestion paga desde un banco sin ver su saldo y que el pago se lee en Caja como cualquier egreso.

## Que se hizo

1. **Task 1** (`64e4e0a8f`): `registerExpensePaymentSchema` y `voidExpensePaymentSchema` en `expense-schemas.ts`, las dos rutas en `registerExpenseRoutes`, las 2 claves del manifiesto, `ENTRADAS_BASELINE` y `CASOS_BASELINE` sumados, y 2 `describe` con 2 `it` cada uno en `iso-03-finance-egresos.test.ts`.
2. **Task 2** (`85211c584`): `test/finance/egresos-pagos-rutas.test.ts` (23 `it`).

## Rutas creadas

Todas bajo `/api/admin/finance`. El hook del plugin deja pasar a `admin_sede` y `recepcion`; el handler responde 403 `{ error: "Acceso denegado", message }`. `coach` lo corta el hook del plugin. Sin `enforceCajaScope` (DI-07).

| Metodo | URL | Roles | Respuesta |
|---|---|---|---|
| POST | `/expense-records/:id/payments` | owner, admin, gestion | `{ record, payment }`: 201 si creo, 200 si la `idempotencyKey` ya existia; 404 gasto inexistente, ajeno o de otro pais; 409 clave de otro gasto; 400 el resto (cuenta ajena = "Cuenta no encontrada") |
| POST | `/expense-records/:id/payments/:paymentId/void` | owner, admin | `{ record }` (detalle del gasto): 400 sin motivo o pago ya anulado; 404 gasto o pago inexistente |

Mensajes 403: "No tenés permiso para Egresos" (pagar) y "Solo owner y admin pueden anular en Egresos" (anular). `?country=` se declara en los dos querystrings. La ruta de pago NO devuelve saldos de cuentas.

Schemas: `paidOn` con `pattern ^\d{4}-\d{2}-\d{2}$` (el calendario lo valida el service), `cashRegisterId` entero >= 1, `paymentMethod` enum `EXPENSE_PAYMENT_METHODS`, `amount` entero 1..`MAX_MONEY`, `fxRate` como en 209-07 (unico decimal, > 0), `reference` <= 100, `notes` <= 2000, `idempotencyKey` 1-64, `additionalProperties: false`. Anular: `reason` 1-500; `id` y `paymentId` enteros >= 1.

## Baselines de tenancy (209-10 les vuelve a sumar)

| Gate | Anterior | Nuevo | Donde |
|---|---|---|---|
| `ENTRADAS_BASELINE` (ISO-01) | 563 | **565** (+2) | `test/tenancy/iso-01-manifiesto.test.ts`, mas el titulo del `it` ("las 565 entradas") |
| `CASOS_BASELINE` (ISO-03) | 59 | **61** (+2) | `test/tenancy/iso-03-cobertura.test.ts` |

Los dos numeros se releyeron del codigo antes de sumar (563 y 59). Los comentarios de fecha de ambos quedaron actualizados. `grep -c "expense-records" test/tenant-manifest.ts` = 8.

## Verificacion

| Corrida | Resultado |
|---|---|
| `iso-01-manifiesto` + `iso-03-cobertura` | 13 + 8 = 21 pasan |
| `iso-03-finance-egresos` (1a corrida) | 18 pasan, 1 falla (desviacion 1) |
| `iso-03-finance-egresos` (tras el arreglo) | 19 pasan |
| `egresos-pagos-rutas` + `egresos-rutas` | 23 + 29 = 52 pasan |
| `egresos-pagos-rutas` con mutacion (ver abajo) | 21 pasan, 2 fallan (los esperados) |

Gates finales: `npx tsc --noEmit` = 0; `npm run -s lint:tenant` = `DISCREPANCIAS: 0`; `npm run -s typecheck:tests` = `DISCREPANCIAS: 18`; ningun `403` en `iso-03-finance-egresos.test.ts` (grep = 0).

Mutacion sobre `expense-routes.ts` (restaurado con `git checkout -- <archivo>`, `git status` limpio): la anulacion de pago con `EXPENSES_ROLES` en vez de `EXPENSES_VOID_ROLES`, y `registerPayment` con `{ country: null }` en vez de `byIdCountry(request)`. Fallan exactamente "gestion recibe el rechazo por rol y el pago sigue vigente" y "gestion de Argentina no puede pagar un gasto de España del owner"; los otros 21 pasan. No se hizo mutacion de la bateria ISO-03 (cada corrida tarda unos 4 minutos); sus afirmaciones leen la DB con `tenantWhere` (pagos, ledger, saldo del banco ajeno y `voidedAt` del pago y del ledger).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] El control "anular gasto propio sin pagos" de 209-07 dejo de ser valido**
- **Found during:** Task 1 (1a corrida de la bateria).
- **Issue:** la siembra de esta tarea registra un pago en el gasto del gimnasio 2, asi que anularlo da 409 ("El gasto tiene pagos vigentes"), que es la conducta correcta del service.
- **Fix:** el control crea un gasto propio nuevo (sin pagos) y lo anula. El aislamiento del mismo `describe` no cambia.
- **Files modified:** `el-templo-api/test/tenancy/iso-03-finance-egresos.test.ts`.
- **Commit:** `64e4e0a8f`.

### Otras desviaciones menores

- El plan pedia que los pagos se registren en `beforeAll`; se hace en `beforeEach`, porque el `beforeEach` de 209-07 ya limpia y resiembra los gastos y los pagos cuelgan de ellos (y los `it` de escritura los mutan).
- La bateria suma un `it` de precondicion (el pago de cada gimnasio nacio en su gimnasio y el banco de cada uno egreso exactamente el importe sembrado). No cuenta para `CASOS_BASELINE`.
- El test HTTP tiene 23 `it` (el plan pedia >= 11): ademas de lo pedido cubre 409 por clave de otro gasto, importe en cero y sobre el tope, anular sin motivo, anular dos veces, sin token (401), el saldo del banco que vuelve al anular, y los tres roles sin permiso por separado.

## Decisiones del ejecutor

- **Sin saldos en la respuesta:** `{ record, payment }` no trae saldos de cuenta; el test afirma que el cuerpo no contiene `firmeBalance` y que `form-options.accounts` no tiene claves de saldo.
- **Bancos separados por grupo en el test HTTP:** cada grupo de casos usa su propio banco con apertura 500000, asi los saldos se afirman como literales sin pisarse entre `it`.
- **Fecha de los pagos HTTP:** `countryToday(app.db, CTX, "AR")` (la misma que usa el service); en la bateria ISO-03, la fecha fija `2026-01-15` (pasada, posterior al corte 2020-01-01 de las cuentas sembradas).
- **Owner sin `?country=` en rutas por id:** se prueba pagando y anulando como owner sin el query; `byIdCountry` devuelve `null` y funciona.

## Para los planes siguientes

- **209-09/209-10:** `registerExpenseRoutes` ahora tiene 8 rutas; las nuevas siguen el mismo patron (`denyUnlessRole` + `assertTenant` + `byIdCountry`/`resolveCountry`). Sumar a `ENTRADAS_BASELINE` (hoy **565**) y `CASOS_BASELINE` (hoy **61**) con sus `describe` de 2 `it` en `iso-03-finance-egresos.test.ts`; el titulo del `it` de ISO-01 lleva el numero.
- **Fixture de la bateria:** los pagos y el ledger de la bateria los borra `cleanAllTestData` (borrado global con FK apagadas) en el `beforeEach`; `limpiarFinanzasDeLaBateria` ya borra pagos, reparto y gastos. No hizo falta tocar `test/fixtures/finance-gimnasio-dos.ts`.
- **Limpieza en tests con pagos:** pagos -> ledger por `cash_register_id` -> `audit_log` con `target_kind='transaction'` de ese ledger -> reparto -> gastos -> `audit_log` con `target_kind='expense_record'` -> cajas -> rubros -> `user_branches` y `users` propios -> sedes (el `afterAll` de `egresos-pagos-rutas.test.ts` es un molde).
- **Respuestas para el admin (209-11):** registrar pago = 201/200 con `{ record, payment }` (el `record` ya trae `paid`, `pending`, `status` y `payments`); anular = `{ record }`. Errores como `{ error, message }` con el mensaje en español. El 409 del alta de pago es "clave de idempotencia de otro gasto".
- **Caja:** el pago aparece en `GET /movements-history?cashRegisterId=` como `kind: "expense"`, `direction: "outflow"`, con `costCenterName` del rubro y sin `responsibleName`; no aparece en `GET /withdrawals`. Anularlo desde Caja da 400 (guarda de 209-06): hay que anularlo desde Egresos.
- **No modificados:** `transaction-service.ts`, `movement-service.ts` y `cash-register-service.ts` (diff vacio en esta rama durante el plan).
- **Entorno:** el harness mando todas las corridas de vitest a segundo plano a los 180 s; se esperaron con un unico `tail --pid=<pid> -f /dev/null` cada una, sin polling.

## Known Stubs

None.

## Threat Flags

None. T-209-28 (pagar un gasto o una cuenta ajenos: 404 y 400 indistinguibles de los inexistentes, ISO-03 con evidencia en DB), T-209-29 (anular pagos solo owner y admin, rechazo para gestion probado y con mutacion) y T-209-30 (la ruta no devuelve saldos; Saldos por caja sigue owner-only para bancos sin sede, probado con gestion) quedan mitigados.

## Self-Check: PASSED

- Archivos verificados en disco: `egresos-pagos-rutas.test.ts` y los modificados; `git status` limpio tras los commits de codigo.
- Commits `64e4e0a8f` y `85211c584` existen en la rama.
