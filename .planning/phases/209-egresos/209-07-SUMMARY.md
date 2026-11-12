---
phase: 209-egresos
plan: 07
subsystem: finance
tags: [egresos, rutas, ajv, permisos, tenancy, iso-01, iso-03]
requires: [209-03, 209-04, 209-05, 209-06]
provides:
  - registerExpenseRoutes (6 rutas de gasto en el plugin finance)
  - expense-schemas.ts (schemas Ajv de Egresos)
  - bateria ISO-03 de Egresos (iso-03-finance-egresos.test.ts)
affects: [209-08, 209-10, 209-11]
tech-stack:
  added: []
  patterns: [rutas registradas dentro del plugin finance con guard de rol por handler, pais del scope con byIdCountry null para owner]
key-files:
  created:
    - el-templo-api/src/modules/finance/expense-schemas.ts
    - el-templo-api/src/modules/finance/expense-routes.ts
    - el-templo-api/test/tenancy/iso-03-finance-egresos.test.ts
    - el-templo-api/test/finance/egresos-rutas.test.ts
  modified:
    - el-templo-api/src/modules/finance/routes.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - el-templo-api/test/tenancy/iso-03-cobertura.test.ts
    - el-templo-api/test/fixtures/finance-gimnasio-dos.ts
decisions:
  - byIdCountry es null solo para el owner; un no-owner sin pais resoluble falla cerrado con 400 (nunca queda como "cualquier pais")
  - La bateria ISO-03 siembra los gastos en beforeEach (no beforeAll) para que cada it parta de filas propias y las escrituras no se contaminen entre casos
metrics:
  tasks: 3
  completed: 2026-11-11
---

# Phase 209 Plan 07: Rutas del gasto y gates de tenancy Summary

Seis rutas HTTP del gasto bajo `/api/admin/finance/expense-records`, con schemas Ajv de importes enteros, permisos por handler (`EXPENSES_ROLES` / `EXPENSES_VOID_ROLES`), pais tomado del scope, idempotencia del alta (201/200), y los dos gates de tenancy (manifiesto ISO-01 y bateria ISO-03) subidos y verdes.

## Que se hizo

1. **Task 1** (`d9bdd67e1`): `expense-schemas.ts`, `expense-routes.ts`, una llamada `registerExpenseRoutes(...)` al final de `financeRoutes` (con su import) y las 6 claves del manifiesto.
2. **Task 2** (`70de726f3`): `iso-03-finance-egresos.test.ts` (6 describe x 2 it + un describe de precondiciones de 2 it), `ARCHIVOS_BATERIA` y `CASOS_BASELINE` en `iso-03-cobertura`, y la limpieza de Egresos al principio de `limpiarFinanzasDeLaBateria`.
3. **Task 3** (`b9e8a52e5`): `egresos-rutas.test.ts` (29 casos HTTP).

## Rutas creadas

Todas bajo `/api/admin/finance`. El hook del plugin las deja pasar a cualquier rol de lectura de finance (incluidos `admin_sede` y `recepcion`); cada handler chequea su set y responde 403 `{ error: "Acceso denegado", message }`. `coach` ya lo corta el hook del plugin.

| Metodo | URL | Roles | Respuesta |
|---|---|---|---|
| GET | `/expense-records/form-options` | owner, admin, gestion | `ExpenseFormOptions` (cuentas SIN saldos, destinos, rubros) |
| GET | `/expense-records` | owner, admin, gestion | `PaginatedResult` con `rows` |
| POST | `/expense-records` | owner, admin, gestion | `{ record }`, 201 si creo, 200 si la `idempotencyKey` ya existia |
| GET | `/expense-records/:id` | owner, admin, gestion | `{ record }` (detalle con pagos e historial) |
| PATCH | `/expense-records/:id` | owner, admin, gestion | `{ record }` |
| POST | `/expense-records/:id/void` | owner, admin | `{ record }`, 409 con pagos vigentes, 400 sin motivo o ya anulado |

Mensajes 403: "No tenés permiso para Egresos" y "Solo owner y admin pueden anular en Egresos". Las rutas NO usan `enforceCajaScope` (el docblock lo dice sin nombrarlo: el criterio del plan es un grep del texto).

Pais: `resolveCountry(request)` = `scope.country` si es AR/ES, si no 400 "No se pudo determinar el país". El owner lo elige con `?country=` (lo lee el hook del plugin; se declara en todos los querystrings). Por id (`byIdCountry`): `null` para el owner, el del scope para el resto (gasto de otro pais = 404).

## Baselines de tenancy (los planes 209-08 y 209-10 les vuelven a sumar)

| Gate | Anterior | Nuevo | Donde |
|---|---|---|---|
| `ENTRADAS_BASELINE` (ISO-01) | 557 | **563** (+6) | `test/tenancy/iso-01-manifiesto.test.ts`, mas el titulo del `it` ("las 563 entradas") |
| `CASOS_BASELINE` (ISO-03) | 53 | **59** (+6) | `test/tenancy/iso-03-cobertura.test.ts` |

Los dos numeros se releyeron del codigo antes de sumar (coincidian con 557 y 53). Los comentarios de fecha de ambos quedaron actualizados.

`ARCHIVOS_BATERIA` ahora tiene 4 archivos (se agrego `iso-03-finance-egresos.test.ts`). El mensaje "(14 + 13 + 11 = ...)" decia numeros viejos que ya no cuadraban desde antes: se cambio por "cajas + transacciones + coach-load + egresos = N". El titulo del `it` de conteo ya no lleva un numero ("las rutas finance del baseline").

## Verificacion

| Corrida | Resultado |
|---|---|
| `iso-01-manifiesto` (Task 1) | 13 pasan |
| `iso-03-cobertura` + `iso-03-finance-egresos` (Task 2, 1a corrida) | cobertura 8 pasan; egresos 14 fallaron en el `beforeEach` (ver desviacion 1) |
| `iso-03-finance-egresos` (Task 2, tras el arreglo) | 14 pasan |
| `egresos-rutas` + `iso-01-manifiesto` (Task 3, 1a corrida) | iso-01 13 pasan; egresos-rutas 29 pasan pero fallo el `afterAll` (ver desviacion 2) |
| `egresos-rutas` (Task 3, tras el arreglo) | 29 pasan |

`iso-03-cobertura` se corrio una sola vez (8 pasan) y no cambio despues: lo que lee es el texto del archivo de la bateria y su estructura de `describe` no se toco en el arreglo. Gates finales: `npx tsc --noEmit` = 0; `npm run -s lint:tenant` = `DISCREPANCIAS: 0`; `npm run -s typecheck:tests` = `DISCREPANCIAS: 18`; el grep de la bateria (ningun `403` fuera de comentarios) da 0.

Mutaciones sobre `expense-routes.ts` (restaurado con `git checkout -- <archivo>` y `git status` limpio): cambiar el set de la ruta de anulacion a `EXPENSES_ROLES` y hacer que `byIdCountry` devuelva siempre `null` hace fallar exactamente los dos casos esperados ("gestion NO puede anular" y "el owner crea un gasto de Espana ... gestion de Argentina no lo ve"); los otros 27 pasan. No se hizo mutacion de la bateria ISO-03 (cada corrida tarda unos 4 minutos); sus afirmaciones ya fallaron con datos reales en la 1a corrida por la siembra (desviacion 1), lo que confirma que ejercen la ruta y la DB.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Sede de El Templo del fixture no es una sede operativa**
- **Found during:** Task 2 (1a corrida de la bateria).
- **Issue:** `templo.branchId` (de `sembrarFinanzasTemplo`) es la primera sede no virtual del Templo, que en la DB de test puede no ser un destino valido de un reparto: el alta del gasto de El Templo dio 400 "Hay una sede en el reparto que no es un destino valido". Peor: el caso de "sede ajena" habria pasado por la razon equivocada.
- **Fix:** la bateria resuelve `sedeTemploId` con `listOperationalBranches(app.db, { tenantId: TENANT_TEMPLO }, "AR")` y la usa para el gasto ajeno, el caso de la sede ajena y las comparaciones de opciones. No se toco el fixture compartido.
- **Files modified:** `el-templo-api/test/tenancy/iso-03-finance-egresos.test.ts`.
- **Commit:** `70de726f3` (el arreglo entro en el mismo commit, que se hizo despues).

**2. [Rule 1 - Bug] `afterAll` de `egresos-rutas` no borraba el staff**
- **Found during:** Task 3 (1a corrida).
- **Issue:** el borrado de las sedes propias fallaba con `ER_ROW_IS_REFERENCED_2` (`users.branch_id`): los usuarios de prueba cuelgan de la sede AR.
- **Fix:** `createStaffUser` devuelve el id; se guardan y el `afterAll` borra `user_branches` y `users` propios antes de las sedes.
- **Files modified:** `el-templo-api/test/finance/egresos-rutas.test.ts`.
- **Commit:** `b9e8a52e5`.

### Otras desviaciones menores

- El plan pedia sembrar los gastos de la bateria en `beforeAll`; se hace en `beforeEach` (decision de diseno: el molde de las otras baterias limpia y resiembra por caso, y los `it` de escritura mutan filas).
- La bateria suma un `describe` de "precondiciones" (2 `it`, sin clave de ruta) siguiendo el molde de `iso-03-finance-cajas`; no cuenta para `CASOS_BASELINE`.
- La bateria agrega una prueba extra de aislamiento: la misma `idempotencyKey` que usa el gasto de El Templo crea un gasto nuevo en el gimnasio 2 (la unique es por gimnasio) y nunca devuelve el ajeno.

## Decisiones del ejecutor

- **Ruta de `/:id` y `form-options`:** la estatica se registra antes que `/:id`, como pedia el plan.
- **`byIdCountry` falla cerrado:** un no-owner cuyo `scope.country` es `null` (corrupcion de datos) recibe 400 en vez de `null` (que significaria "cualquier pais"). El plan solo decia `null` para owner y el pais del scope para el resto; esto es la misma regla con el caso borde resuelto del lado seguro.
- **`destination`:** llega como string (`^(\d+|casa_matriz)$`) y la ruta lo convierte a numero o `"casa_matriz"` antes de llamar a `list`.
- **Esquemas de respuesta:** solo se declaran los de error (400/401/403/404/409/500); la respuesta 200 no se serializa por schema, igual que la mayoria de las rutas de finance.
- **Staff de `egresos-rutas.test.ts`:** se borra en el `afterAll` (el precedente `withdrawals-destino` los deja).

## Para los planes siguientes

- **209-08 (pagos):** registrar rutas nuevas en `expense-routes.ts` (misma funcion `registerExpenseRoutes`, ya recibe `transactionService` y `cashRegisterService`; el `paymentService` ya esta instanciado ahi y se pasa `recordService`). Hay que sumar sus claves al manifiesto, `ENTRADAS_BASELINE` (hoy 563) y `CASOS_BASELINE` (hoy 59) con sus `describe` en `iso-03-finance-egresos.test.ts`, y actualizar el comentario de fecha. Para el helper `denyUnlessRole(request, reply, roles, message)`: devuelve `true` si ya respondio 403 (hay que cortar con `return reply`).
- **209-10 (Resumen):** igual: sus rutas van en este archivo o en uno nuevo registrado desde `financeRoutes`; sumar `ENTRADAS_BASELINE` y `CASOS_BASELINE`. Si crea un archivo de bateria nuevo hay que agregarlo a `ARCHIVOS_BATERIA`.
- **Fixture:** `limpiarFinanzasDeLaBateria` ya borra pagos, reparto y gastos antes que rubros y cajas (gimnasio 2 entero, Templo solo con concepto que empieza con `MARCA_ISO03`). Si una siembra futura crea gastos del Templo, el concepto tiene que empezar con `ISO03`.
- **Evidencia en la bateria:** los gastos se leen de la DB con `tenantWhere(schema.expenseRecords, { tenantId })` (la tabla no esta en la union `TablaStrict` del fixture). Las tablas hijas (`expense_payments`, `expense_allocations`) se borran con `inArray(expenseRecordId, ids)`.
- **El `403` no se puede escribir en la bateria**, ni en comentarios (el gate busca por texto). Los rechazos por rol van en `egresos-rutas.test.ts` (o el archivo que corresponda a pagos).
- **Respuestas:** alta/detalle/edicion/anulacion devuelven `{ record }`; el listado es el `PaginatedResult` directo (`rows`, no `items`). Mensaje 404 comun: "Gasto no encontrado" (igual para ajeno e inexistente).
- **Cuentas sin saldos:** `form-options.accounts` solo trae `id, name, type, currency, branchId, branchName, isTreasury, cutoffDate`; el test de `egresos-rutas` falla si aparece cualquier otra clave.
- **Entorno:** el harness mando algunas corridas de vitest a segundo plano a los 180 s; se esperaron con un unico `tail --pid=<pid> -f /dev/null`, sin polling.

## Known Stubs

None.

## Threat Flags

None. T-209-24 (rol por handler, 403 probado por rol y por ruta), T-209-25 (assertTenant + tenantWhere, 404 indistinguible, bateria ISO-03, pais del scope), T-209-26 (Ajv `integer` + `MAX_MONEY`, decimales y tope probados) y T-209-27 (idempotencia 200 con el mismo gasto) quedan mitigados.

## Self-Check: PASSED

- Archivos creados verificados en disco y `git status` limpio tras los commits de codigo.
- Commits `d9bdd67e1`, `70de726f3` y `b9e8a52e5` existen en la rama.
