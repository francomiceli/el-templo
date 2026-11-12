---
phase: 209-egresos
plan: 10
subsystem: finance
tags: [egresos, resumen, excel, exceljs, rutas, tenancy, iso-01, iso-03]
requires: [209-07, 209-08, 209-09]
provides:
  - GET /expense-records/summary, /summary/detail y /summary/export
  - ExpenseSummaryService.getExportData
  - buildExpenseSummaryWorkbook (hojas Resumen y Detalle)
  - expenseSummarySchema, expenseSummaryDetailSchema, expenseSummaryExportSchema
  - casos ISO-03 de las tres rutas
affects: [209-11, 209-14, 209-16]
tech-stack:
  added: []
  patterns: [Excel desde el mismo computeMonth que el JSON, rutas estaticas del Resumen registradas antes de /:id]
key-files:
  created:
    - el-templo-api/src/modules/finance/expense-summary-excel.ts
    - el-templo-api/test/finance/expense-summary-rutas.test.ts
  modified:
    - el-templo-api/src/modules/finance/expense-summary-service.ts
    - el-templo-api/src/modules/finance/expense-schemas.ts
    - el-templo-api/src/modules/finance/expense-routes.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - el-templo-api/test/tenancy/iso-03-cobertura.test.ts
    - el-templo-api/test/tenancy/iso-03-finance-egresos.test.ts
decisions:
  - El titulo con mes, pais y moneda va DEBAJO de la tabla de la hoja Resumen, no arriba (styleHeaderRow estila la fila 1)
  - El Total del Excel sale de la columna Total de getSummary, no se vuelve a sumar
  - El gasto de El Templo de la bateria ISO-03 pasa a 7000 (distintivo) y el del gimnasio 2 queda en 5000
metrics:
  tasks: 2
  completed: 2026-11-11
---

# Phase 209 Plan 10: Rutas del Resumen y export a Excel Summary

Tres rutas HTTP para consultar el Resumen mensual de Egresos (por destino, detalle por rubro y concepto) y exportarlo a `.xlsx`, con permisos de Egresos y aislamiento entre gimnasios. El Excel sale del mismo `computeMonth` que el JSON: un test lo lee con `exceljs` y compara celda por celda contra la ruta JSON.

## Que se hizo

1. **Task 1** (`cc0cd0429`): `getExportData` en el service (un solo `computeMonth`; el armado de columnas de `getSummary` se extrajo a `summaryOf` privado y lo comparten), `expense-summary-excel.ts`, 3 schemas, 3 rutas, 3 claves en el manifiesto y `ENTRADAS_BASELINE`.
2. **Task 2** (`1d5a551a4`): 3 `describe` ISO-03 (2 `it` cada uno), `CASOS_BASELINE`, y `test/finance/expense-summary-rutas.test.ts` (18 `it`).

## Rutas creadas

Todas bajo `/api/admin/finance`, dentro de `registerExpenseRoutes`, registradas antes de `/expense-records/:id`. Roles `EXPENSES_ROLES` (owner, admin, gestion); `admin_sede` y `recepcion` reciben 403 del handler y `coach` lo corta el hook del plugin. Pais: el del scope (el owner lo elige con `?country=AR|ES`; un no-owner siempre usa el suyo, aunque mande otro). `month` es obligatorio con formato `AAAA-MM` (si no, 400).

| Metodo | URL | Query | Respuesta |
|---|---|---|---|
| GET | `/expense-records/summary` | `month` (req), `country` | `ExpenseSummary` JSON: `{ month, country, currency, columns[], incomplete }` |
| GET | `/expense-records/summary/detail` | `month` (req), `destination` (req: id de sede, `casa_matriz` o `total`), `country` | `ExpenseSummaryDetail`: `{ month, country, currency, destination, destinationName, groups[] }`. 404 sede inexistente/ajena/de otro pais o `casa_matriz` en Espana; 400 destino mal formado; sede valida sin movimiento = `groups: []` |
| GET | `/expense-records/summary/export` | `month` (req), `country` | `.xlsx` binario. `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `Content-Disposition: attachment; filename="egresos-resumen-{AR\|ES}-{AAAA-MM}-{YYYY-MM-DD}.xlsx"` |

Mensaje 403: "No tenés permiso para Egresos".

### Excel

- Hoja **"Resumen"**: encabezado `Destino | Pagado en el mes | Costo del mes | De eso, estimado | Pagado de ese costo | Pendiente`; una fila por columna de `summary.columns` en su orden (sedes, sedes inactivas con " (inactiva)", Casa Matriz solo en AR) y al final la fila `Total` en negrita. Dos filas mas abajo, el titulo `Egresos {AAAA-MM} · {Argentina|España} · {ARS|EUR}`.
- Hoja **"Detalle"**: `Destino | Rubro | Concepto | Beneficiario | Mes de imputación | Estimado | Costo del mes | Pendiente | Pagado en el mes`; una fila por gasto y destino con algun valor distinto de cero, ordenadas por destino (orden de columnas), rubro y concepto. "Estimado" = "Sí"/"No". Sumar las filas de un destino da su columna del Resumen (no hay filas del Total).
- Importes: numeros enteros (nunca strings) con `numFmt "#,##0"`.

## Baselines de tenancy

| Gate | Anterior | Nuevo | Donde |
|---|---|---|---|
| `ENTRADAS_BASELINE` (ISO-01) | 565 | **568** (+3) | `test/tenancy/iso-01-manifiesto.test.ts`, mas el titulo del `it` ("las 568 entradas") |
| `CASOS_BASELINE` (ISO-03) | 61 | **64** (+3) | `test/tenancy/iso-03-cobertura.test.ts` |

Los dos numeros se releyeron del codigo antes de sumar (565 y 61). Comentarios de fecha actualizados. `grep -c "expense-records" test/tenant-manifest.ts` = 11. La bateria de Egresos tiene 11 `describe` de ruta (+1 de precondiciones) y ningun `403`.

## Verificacion

| Corrida | Resultado |
|---|---|
| `test/tenancy/iso-01-manifiesto.test.ts` | 13 pasan (~141 s) |
| `test/tenancy/iso-03-cobertura.test.ts` + `test/tenancy/iso-03-finance-egresos.test.ts` | 8 + 25 = 33 pasan (~251 s) |
| `test/finance/expense-summary-rutas.test.ts` | 18 pasan (~168 s) |
| Mutacion: la hoja Resumen con `column.pending` en vez de `column.cost`, y la ruta de export con `EXPENSES_VOID_ROLES` | fallan exactamente "owner, admin y gestion leen las tres rutas (200)" y "la hoja Resumen tiene los mismos numeros que el JSON"; los otros 16 pasan. Restaurado con `git checkout -- <archivos>` |

Gates finales: `npx tsc --noEmit` = 0; `npm run -s lint:tenant` = `DISCREPANCIAS: 0`; `npm run -s typecheck:tests` = `DISCREPANCIAS: 18`. No se hizo mutacion de la bateria ISO-03 (cada corrida tarda ~4 minutos); sus afirmaciones leen contenido real (columnas, importes distintivos 7000 contra 5000, pagos de enero, celdas del xlsx).

## Deviations from Plan

- **El gasto de El Templo de la bateria ISO-03 ahora es de 7000** (antes 5000, igual al del gimnasio 2). El plan preveia ajustarlo y anotarlo: con importes iguales un total que sumara lo ajeno no se podia distinguir. `cuerpoDeAlta` recibe `amount` opcional (default 5000) y el gasto de El Templo usa 7000. Ningun otro caso dependia de 5000.
- **Titulo del Resumen debajo de la tabla, no arriba.** El plan permitia "una fila previa o titulo"; con `styleHeaderRow` (siempre fila 1) un titulo arriba habria dejado el estilo de encabezado sobre el titulo. Queda como ultima fila de la hoja, tras una fila en blanco.
- Detalle de implementacion no pedido por el plan: `getSummary` delega en un `summaryOf(computed)` privado para que `getExportData` arme el Resumen sin volver a llamar a `computeMonth`. `ExpenseExportRow` trae ademas `destinationKey`, `destinationIsActive`, `destinationOrder`, `costCenterId` y `expenseRecordId` (los usa el orden y la marca "(inactiva)" del Detalle).

## Decisiones del ejecutor

- **`destination` del detalle sin `?country=` implicito:** igual que el resto de las rutas, un no-owner usa el pais de su scope y un owner sin `?country=` recibe 400 "No se pudo determinar el país" (regla de 209-07).
- **`expenseSummaryExportSchema = expenseSummarySchema`**: el Excel valida exactamente lo mismo que el JSON.
- **Meses lejanos propios en el test HTTP** (`2024-03` AR, `2024-04` ES): la DB del worker comparte datos, y el Resumen suma todo el gimnasio/pais/mes; asi lo que se afirma no depende de otros archivos.
- **Test de la inyeccion en Excel (T-209-36):** un concepto `=1+1 ...` vuelve del xlsx como string de texto, no como formula (aceptado, probado).

## Para los planes siguientes (admin: 209-11 en adelante) — API completa de Egresos

Todo bajo `/api/admin/finance` con `Authorization: Bearer`. **Errores:** siempre `{ error, message }` con `message` en español; codigos 400/401/403/404/409/500. **Plata:** enteros en la moneda indicada (unico decimal: `fxRate`, hasta 4 decimales, informativo). **Pais:** el owner lo elige con `?country=AR|ES` (en TODAS las rutas de Egresos: las de lista/alta/opciones/Resumen lo exigen para el owner, las "por id" no — el owner ve gastos de cualquier pais por id); el resto usa el suyo. Fechas `YYYY-MM-DD`, meses `YYYY-MM`. `idempotencyKey` (1-64 chars, opcional) en alta de gasto y de pago: repetida devuelve 200 con el mismo registro en vez de 201.

Roles: **operar** = owner, admin, gestion (`EXPENSES_ROLES`); **anular** = owner, admin (`EXPENSES_VOID_ROLES`). `admin_sede` y `recepcion` reciben 403 en todas; `coach` tambien (lo corta el hook).

### Gastos y pagos

| Metodo | URL | Roles | Cuerpo / query | Respuesta |
|---|---|---|---|---|
| GET | `/expense-records/form-options` | operar | `?country` | `ExpenseFormOptions` = `{ country, countryCurrency: "ARS"\|"EUR", expenseCurrencies: ("ARS"\|"USD"\|"EUR")[], today, accounts: [{ id, name, type: "efectivo"\|"banco", currency, branchId, branchName, isTreasury, cutoffDate }], destinations: [{ branchId: number\|null, name }] (null = Casa Matriz), costCenters: [{ id, name }] }`. SIN saldos |
| GET | `/expense-records` | operar | `?country`, `month`, `destination` (id o `casa_matriz`), `costCenterId`, `status` (`pendiente`\|`parcial`\|`pagado`\|`por_pagar`), `q` (<=100), `includeVoided` (bool), `page`, `limit` (1-200, default 50) | `{ rows: ExpenseRecordListItem[], total, page, limit }` (`rows`, no `items`) |
| POST | `/expense-records` | operar | `?country`. Body: `{ concept (1-200), beneficiary?, costCenterId, imputationMonth, amount (int 1..MAX), currency: "ARS"\|"USD"\|"EUR", amountStatus: "confirmado"\|"estimado", fxRate?, receiptLinks?: [{ label?, url }] (<=10), notes? (<=2000), allocations: [{ branchId: int\|null, amount }] (1-50; null = Casa Matriz), idempotencyKey? }` | `{ record: ExpenseRecordDetail }` — 201 creado, 200 si la clave ya existia. España solo EUR; USD solo en Argentina y con `fxRate` obligatorio (`fxRate` solo se acepta en USD). La suma del reparto tiene que dar el importe |
| GET | `/expense-records/:id` | operar | `?country` | `{ record: ExpenseRecordDetail }`. 404 "Gasto no encontrado" (inexistente, ajeno o de otro pais, indistinguibles) |
| PATCH | `/expense-records/:id` | operar | Body con al menos un campo de: `concept, beneficiary, costCenterId, imputationMonth, amount, amountStatus, fxRate, receiptLinks, notes, allocations, reason (<=500)` | `{ record }` |
| POST | `/expense-records/:id/void` | anular | Body `{ reason (1-500) }` | `{ record }`. 409 si tiene pagos vigentes (hay que anularlos antes); 400 sin motivo o ya anulado |
| POST | `/expense-records/:id/payments` | operar | Body `{ paidOn, cashRegisterId, paymentMethod: "cash"\|"transfer"\|"card"\|"cheque"\|"direct_debit", amount (int, en la moneda de la CUENTA), fxRate?, reference? (<=100), notes? (<=2000), idempotencyKey? }` | `{ record, payment }` — 201 creado, 200 si la clave existia; 409 clave de otro gasto; 404 gasto ajeno; 400 el resto (cuenta ajena = "Cuenta no encontrada"). `record` ya trae `paid`, `pending`, `status`, `payments`. No trae saldos |
| POST | `/expense-records/:id/payments/:paymentId/void` | anular | Body `{ reason (1-500) }` | `{ record }` (detalle del gasto). 400 sin motivo o pago ya anulado; 404 gasto o pago inexistente. Un pago NO se anula desde Caja (400): hay que hacerlo aca |

`ExpenseRecordListItem` = `{ id, country, concept, beneficiary, costCenterId, costCenterName, imputationMonth, amount, currency, amountStatus, fxRate, costInCountryCurrency (null si falta el TC), paid, pending, status: "pendiente"|"parcial"|"pagado", overpaid, receiptLinksCount, incomplete, allocations: [{ branchId, branchName, amount, amountInCountryCurrency }], voidedAt, createdAt }`.
`ExpenseRecordDetail` = lo anterior + `{ receiptLinks: [{ label, url }], notes, createdByName, voidReason, voidedByName, payments: ExpensePaymentItem[], history: ExpenseHistoryItem[] }`.
`ExpensePaymentItem` = `{ id, transactionId, paidOn, cashRegisterId, cashRegisterName, paymentMethod, amount, currency (de la cuenta), appliedAmount (en la moneda del gasto), fxRate, amountArs (null en España), reference, notes, createdByName, createdAt, voidedAt, voidReason, voidedByName }`.
`ExpenseHistoryItem` = `{ id, at, actorName, action, reason, payload }`.

### Resumen (este plan)

| Metodo | URL | Roles | Query | Respuesta |
|---|---|---|---|---|
| GET | `/expense-records/summary` | operar | `month` (req), `country` | `{ month, country, currency: "ARS"\|"EUR", columns: [{ key, branchId, name, isActive, paidInMonth, cost, costEstimated, costPaid, pending }], incomplete: { total, estimated, missingFxRate, missingReceipts } }` |
| GET | `/expense-records/summary/detail` | operar | `month` (req), `destination` (req), `country` | `{ month, country, currency, destination, destinationName, groups: [{ costCenterId, costCenterName, cost, pending, paidInMonth, concepts: [{ expenseRecordId, concept, beneficiary, imputationMonth, estimated, cost, pending, paidInMonth }] }] }` |
| GET | `/expense-records/summary/export` | operar | `month` (req), `country` | `.xlsx` (hojas "Resumen" y "Detalle") |

Notas para el admin:
- `columns`: una por destino en este orden — sedes operativas (por nombre), sedes inactivas con reparto ese mes (`isActive: false`: pintar como cerrada), `casa_matriz` (solo AR) y `total` siempre ultima. El `key` de cada columna es lo que se manda como `destination` al detalle. `cost = costPaid + pending` en cada columna.
- El detalle del Total (`destination=total`) suma todos los destinos. Un concepto pagado este mes pero imputado a otro mes aparece con `cost: 0, pending: 0, paidInMonth > 0` y su `imputationMonth` propio.
- Para descargar el Excel hace falta pedir el binario con el token (no sirve un `<a href>` sin header): `responseType: "blob"` en el cliente HTTP y leer el nombre de `Content-Disposition`.
- Importes del Excel y del JSON son los mismos numeros (enteros en la moneda del pais: ARS en AR, EUR en ES; los gastos en USD ya vienen convertidos por su TC).

### Rubros (preexistentes, usados por la pestana Rubros)

Sin cambios en este plan. `GET /cost-centers?country=` (activos; owner, admin, gestion), `GET /cost-centers/all?country=` (`{ centers: [{ id, name, ..., isActive }] }`, owner/admin), `POST /cost-centers` (`{ name, country }` → 201 `{ center }`), `PATCH /cost-centers/:id` (`{ name }`), `POST /cost-centers/:id/deactivate` y `/reactivate` (→ `{ center }`); las de escritura y `/all` son solo owner y admin.

### Otros

- No se modificaron `transaction-service.ts`, `movement-service.ts` ni `cash-register-service.ts`.
- Sin migracion nueva ni dependencias nuevas.
- Entorno: el harness mando a segundo plano las corridas largas de vitest a los 180 s; se esperaron con un unico `tail --pid=<pid> -f /dev/null` sin polling.

## Known Stubs

None.

## Threat Flags

None. T-209-34 (service con `tenantWhere`; ISO-03 lee las celdas del xlsx del gimnasio 2 y no encuentra el concepto, la sede ni el importe de El Templo), T-209-35 (`EXPENSES_ROLES` en las 3 rutas; 403 probado para `admin_sede`, `recepcion` y `coach`, y con mutacion) mitigados; T-209-36 aceptado y probado (un concepto que empieza con `=` vuelve como texto).

## Self-Check: PASSED

- Archivos creados verificados en disco: `expense-summary-excel.ts` y `expense-summary-rutas.test.ts`.
- Commits `cc0cd0429` y `1d5a551a4` existen en la rama; `git status` limpio antes del commit del SUMMARY.
