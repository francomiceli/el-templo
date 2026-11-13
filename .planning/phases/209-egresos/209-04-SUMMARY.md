---
phase: 209-egresos
plan: 04
subsystem: finance
tags: [egresos, gasto, edicion, anulacion, listado, audit-log, for-update]
requires: [209-01, 209-02, 209-03]
provides:
  - ExpenseRecordService.update, void y list
  - validaciones de campos compartidas entre alta y edicion (metodos privados)
affects: [209-05, 209-06, 209-07, 209-09]
tech-stack:
  added: []
  patterns: [candado FOR UPDATE sobre el gasto, cambios before/after en audit, filtro de estado en SQL con la misma regla que la funcion pura]
key-files:
  created:
    - el-templo-api/test/finance/expense-records-edicion.test.ts
  modified:
    - el-templo-api/src/modules/finance/expense-record-service.ts
decisions:
  - Sede inactiva ya presente en el reparto guardado se puede reenviar; una sede nueva tiene que ser operativa
  - El rubro solo se revalida si cambia
metrics:
  tasks: 3
  completed: 2026-11-11
---

# Phase 209 Plan 04: Edicion, anulacion y listado del gasto Summary

`ExpenseRecordService` suma `update` (motivo obligatorio para importe, estado y tipo de cambio, reparto reemplazado entero, historial before/after en la misma transaccion), `void` (motivo, 409 con pagos vigentes) y `list` (filtros por mes, destino, rubro, estado con "por pagar", texto, paginado, sin anulados por defecto).

## Que se hizo

1. **Task 1** (`2102bdc74`): validaciones del alta extraidas a privados (`validateConcept`, `validateImputationMonth`, `validateAmount`, `validateAmountStatus`, `validateFx`, `validateAllocationsFor`; el rubro reutiliza `assertUsableCostCenter` y beneficiario/notas `optionalText`) sin cambiar mensajes; `update` con `FOR UPDATE`.
2. **Task 2** (`268aca7d3`): `void` y `list`. El estado se filtra en SQL con `statusFilterSql` (funcion de modulo con comentario que remite a `expenseStatusOf`).
3. **Task 3** (`05207c4ff`): `test/finance/expense-records-edicion.test.ts`, 31 tests.

## Verificacion

| Corrida | Resultado |
|---|---|
| `npx vitest run test/finance/expense-records-alta.test.ts --hookTimeout=540000` (tras extraer validaciones) | 23 tests pasan |
| `npx vitest run test/finance/expense-records-edicion.test.ts --hookTimeout=540000` | 31 tests pasan (~144 s con el provisioning), a la primera |

Gates finales: `npx tsc --noEmit` = 0; `npm run -s lint:tenant` = `DISCREPANCIAS: 0`; `npm run -s typecheck:tests` = `DISCREPANCIAS: 18`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Bloqueante] El lint de tenancy marcaba el listado**
- **Found during:** Task 2
- **Issue:** `lint:tenant` analiza por statement: el EXISTS en SQL crudo y los `conditions.push(...)` por separado que nombraban `expense_records`/`expense_allocations` sin `tenantWhere` en el mismo statement daban 7 discrepancias.
- **Fix:** EXISTS con el query builder de Drizzle (`exists(...)` con su `tenantWhere`) y todas las condiciones en UN solo statement (array con spreads condicionales, `tenantWhere` adentro y tambien inline en los dos `.where`). El filtro de estado salio a `statusFilterSql(status, paid, amountColumn)`. Resultado: 0 discrepancias, sin tocar la allowlist.
- **Files modified:** `expense-record-service.ts`
- **Commit:** `268aca7d3`

### Fuera de plan (adicion)

- El test incluye un armado minimo con pagos insertados a mano (caja propia + ledger propio) para ejercitar en SQL los filtros parcial/pagado, el estado de cada item y las dos guardas con pagos (no confirmado por debajo de lo pagado, 409 al anular). El plan decia que eso se prueba en 209-06 con el service real de pagos; ahi se repite sobre pagos reales. Aviso para 209-06: ya hay cobertura basica, ampliar con pagos de verdad y anulados.

## Decisiones del ejecutor

- **Sedes del reparto en la edicion:** destinos validos = sedes operativas del pais mas las sedes que el reparto guardado ya tenia (permite corregir un gasto viejo cuya sede hoy esta inactiva). Una sede nueva tiene que ser operativa. Casa Matriz sigue la regla del alta (`casaMatrizAllowed`).
- **Rubro:** solo se valida (`assertUsableCostCenter`) si viene Y es distinto del guardado; un gasto viejo con rubro hoy inactivo se puede seguir editando sin tocar el rubro.
- **Sin cambios efectivos:** compara por valor normalizado (concepto recortado, beneficiario vacio = null, links normalizados, reparto ordenado por sede). Si nada cambia no escribe ni audit, y el motivo no se exige. Un motivo enviado sin cambios se ignora.
- **Orden de chequeos en `update`:** gasto inexistente/otro pais (404), anulado (400), validacion de campos presentes, motivo, reparto obligatorio si cambia el importe, reparto valido, no bajar de lo pagado. Con importe cambiado sin motivo y sin reparto sale primero el del motivo.
- **Lectura de lo pagado:** solo cuando cambia importe o estado y el estado final es `confirmado` (en cualquier otro caso no puede violarse la regla). Un gasto `estimado` si puede quedar por debajo de lo pagado (`overpaid` lo marca).
- **Lecturas auxiliares dentro de la transaccion:** rubro y sedes operativas se leen con `this.db` (otra conexion) mientras el gasto esta bloqueado: son tablas distintas, sin riesgo de deadlock.
- **`receipt_links`:** sin links se guarda `null` (igual que el alta); el before/after del audit usa `[]` en ese caso.
- **`void`:** `voided_at` con `new Date()` (no `NOW()`), igual que el resto del codigo. Payload del audit `{ concept, amount }` y `reason`.
- **`list` con `q` de menos de 2 caracteres:** se ignora (no filtra).
- **Pais:** `update` y `void` aceptan `opts.country` como `getDetail` (404 si el gasto es de otro pais). `list` filtra por `country` obligatorio.

## Para los planes siguientes

En `el-templo-api/src/modules/finance/expense-record-service.ts`:

- `update(ctx, id, input: UpdateExpenseRecordInput, adminId, opts?: { country?: ExpenseCountry | null }): Promise<ExpenseRecordDetail>`
- `void(ctx, id, reason: string, adminId, opts?: { country? }): Promise<ExpenseRecordDetail>` (400 sin motivo o ya anulado, 409 `ConflictError("El gasto tiene pagos vigentes: anulalos primero")`, 404)
- `list(ctx, filters: ExpenseListFilters): Promise<PaginatedResult<ExpenseRecordListItem>>` (`{ rows, total, page, limit }`; limit 1-200 default 50)
- Eventos de audit nuevos: `expense_record_update` (`payload: { changes: { campo: { before, after } }, allocations?: { before, after } }`, `reason` o null) y `expense_record_voided` (`reason`, `payload: { concept, amount }`).
- Campos que aparecen en `changes`: `concept`, `beneficiary`, `imputationMonth`, `costCenterId`, `amount`, `amountStatus`, `fxRate`, `receiptLinks`, `notes`.
- Para 209-05/06 (pagos): el candado es `tx.select().from(expenseRecords).where(tenantWhere + id).limit(1).for("update")` y el gasto va PRIMERO (el alta de pagos tiene que tomar el mismo orden). La regla "no bajar de lo pagado" lee `SUM(applied_amount)` de pagos con `voided_at IS NULL` dentro de esa tx.
- Lint de tenancy: el analizador mira cada STATEMENT. Para consultas con filtros condicionales, armar el array de condiciones en un solo statement con `tenantWhere` adentro (ver `list`), no con varios `conditions.push` sueltos.
- Limpieza en tests: pagos -> ledger propio -> reparto -> gastos -> audit propio -> caja -> rubros -> sedes (ver `afterAll` del archivo nuevo).

## Known Stubs

None.

## Threat Flags

None. T-209-11 (motivo + `expense_record_update` con before/after en la misma tx), T-209-12 y T-209-13 (candado + chequeo de pagado / 409, probados con pagos insertados y por rehacerse con el service de pagos en 209-06) y T-209-14 (`escapeLikeTerm`, probado con `%` literal) quedan mitigados.

## Self-Check: PASSED

- Archivos creados y modificados verificados en disco.
- Commits `2102bdc74`, `268aca7d3` y `05207c4ff` existen en la rama.
