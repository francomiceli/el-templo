---
phase: 206-tablero-semanal
reviewed: 2026-11-03T00:00:00Z
depth: deep
files_reviewed: 48
files_reviewed_list:
  - el-templo-api/src/modules/weekly-board/week.ts
  - el-templo-api/src/modules/weekly-board/service.ts
  - el-templo-api/src/modules/weekly-board/calculator.ts
  - el-templo-api/src/modules/weekly-board/matrix.ts
  - el-templo-api/src/modules/weekly-board/routes.ts
  - el-templo-api/src/modules/weekly-board/schemas.ts
  - el-templo-api/src/modules/weekly-board/types.ts
  - el-templo-api/src/modules/weekly-board/index.ts
  - el-templo-api/src/jobs/weekly-board-close.ts
  - el-templo-api/src/db/migrations/0319_weekly_board.sql
  - el-templo-api/src/db/schema/weekly-board.ts
  - el-templo-api/src/db/tenant-tables.ts
  - el-templo-api/src/modules/reports/service.ts
  - el-templo-api/src/modules/reports/types.ts
  - el-templo-api/src/modules/renewals/service.ts
  - el-templo-api/src/modules/analytics/service.ts
  - el-templo-api/src/modules/finance/transaction-service.ts
  - el-templo-api/src/modules/shared/currency.ts
  - el-templo-api/test/weekly-board/week.test.ts
  - el-templo-api/test/weekly-board/matrix.test.ts
  - el-templo-api/test/weekly-board/weekly-board-routes.test.ts
  - el-templo-api/test/weekly-board/weekly-board-access.test.ts
  - el-templo-api/test/weekly-board/by-branch-caja-alumnos.test.ts
  - el-templo-api/test/weekly-board/by-branch-embudo-renovaciones.test.ts
  - el-templo-api/test/jobs/weekly-board-close.test.ts
  - el-templo-api/test/migrations/0319-weekly-board.test.ts
  - el-templo-api/test/fixtures/weekly-board.ts
  - el-templo-api/test/helpers.ts
  - el-templo-api/test/fixtures/second-tenant.ts
  - el-templo-api/test/tenant-manifest.ts
  - el-templo-api/test/db/tenant-tables.test.ts
  - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
  - el-templo-api/test/tenancy/con-04-crons-per-tenant.test.ts
  - el-templo-admin/src/pages/TableroPage.vue
  - el-templo-admin/src/components/tablero/TableroMatrix.vue
  - el-templo-admin/src/components/tablero/TableroCell.vue
  - el-templo-admin/src/components/tablero/TableroLeadsCell.vue
  - el-templo-admin/src/components/tablero/TableroWeekSelector.vue
  - el-templo-admin/src/composables/useWeeklyBoardApi.ts
  - el-templo-admin/src/types/weekly-board.ts
  - el-templo-admin/src/utils/weekly-board-format.ts
  - el-templo-admin/src/config/templo-config.ts
  - el-templo-admin/src/router/routes.ts
findings:
  critical: 1
  warning: 3
  info: 5
  total: 9
status: issues_found
---

# Phase 206: Code Review Report

**Reviewed:** 2026-11-03
**Depth:** deep
**Files Reviewed:** 48 (source + tests, `.planning` excluded)
**Status:** issues_found

## Summary

Se leyó el diff completo `17aad07d0..HEAD` de `el-templo-api` y `el-templo-admin`.
Verificado sin ejecutar vitest (no hay MySQL ni se corren tests locales):

- `pnpm lint:tenant` (`tsx src/db/scripts/lint-tenant.ts`): DISCREPANCIAS 0.
- `tsc --noEmit` de la API: limpio. `tsc -p tsconfig.test-check.json`: sin errores en archivos del Tablero (los 2 de `test/progression/weekly-summary.test.ts` son previos).
- `vue-tsc --noEmit` del admin: sin errores en archivos del Tablero (los de `session-pdf-builder.ts` son previos).
- Los 5 conteos fijos de tenancy (tenant-tables x2, 0192-0195, 0196, manifest + baseline ISO-01) y el job en CON-04 están actualizados y son coherentes con el código.

**Preservación de comportamiento de los refactors: OK.**
`computeTrialSessionKpis` = `kpisFromTally(tallyTrialSessions(rows))` devuelve exactamente los mismos 7 campos y fórmulas que la versión anterior (se comparó con `git show 17aad07d0`). `computeKpis` de Renovaciones usa `renewalRateFrom` con la misma fórmula; `ExpiringRow.memberBranchId` no se copia a `RenewalRow` (la respuesta pública no cambia). `effectiveDebtStatus(dmStatus)` equivale al `?? "activa"` anterior. Los cambios en `analytics/service.ts` fuera del método nuevo son solo reformateo Prettier.

**SQL/Drizzle:** `getIncomeByMemberBranch`, `getDebtTotalsByMemberBranch`, `countActivePayingMembersByBranch` y `computeKpisByMemberBranch` seleccionan columnas planas (sin FA-01), todo `GROUP BY` es válido bajo ONLY_FULL_GROUP_BY (las columnas del SELECT están en el GROUP BY), cada statement sobre tablas strict lleva `tenantWhere`/`tenantValues`, los LEFT JOIN llevan el tenant en el `ON`, el cierre usa una transacción y el no-op de `onDuplicateKeyUpdate` (`branch_id = branch_id`) es válido.

**Acceso:** CAJA_ROLES cubre owner/admin/gestion/admin_sede; coach y recepción reciben 403; el fail-closed WR-05 está bien ubicado; el PUT pasa por `requireBranchAccess` (AJV corre antes del preHandler); sedes de otro gimnasio dan 403 por la Regla 0. El GET filtra columnas por rol sin pasar `scope.country` a los cálculos.

**Contrato API/admin:** los tipos del admin son espejo exacto de `weekly-board/types.ts` y `week.ts`. El composable expone `cleanup()` y la página lo llama en `onUnmounted`.

Hay **un blocker** que hace fallar un test nuevo y devuelve 500 en producción.

## Critical Issues

### CR-01: `isMonday` lanza `RangeError` con mes/día inexistente: el GET y el PUT devuelven 500 y un test nuevo falla

**File:** `el-templo-api/src/modules/weekly-board/week.ts:70-75` (consumidores: `service.ts:~150` `getBoard`, `service.ts:~485` `upsertLeads`)
**Issue:** El round-trip `addDays(date, 0) !== date` solo detecta días que "se deslizan" (`2026-02-30` pasa a `2026-03-02`). Con un mes 13 o día/mes 00, `new Date("2026-13-01T12:00:00Z")` es `Invalid Date` y `addDays` termina en `toISOString()`, que **lanza** `RangeError: Invalid time value` (verificado en Node: `2026-13-01`, `2026-00-10` y `2026-11-00` lanzan). El pattern de AJV (`^\d{4}-\d{2}-\d{2}$`) deja pasar esas fechas, la excepción no es un `AppError`, y `handleServiceError` responde 500 y loguea `log.error` (ruido en Sentry).

Consecuencias concretas:
- `test/weekly-board/weekly-board-routes.test.ts:227` (`expect((await getBoard("2026-13-01")).status).toBe(400)`, con el comentario "el pattern de AJV la deja pasar, el servicio la rechaza") **va a fallar en CI**: recibe 500.
- En producción, `GET /api/admin/weekly-board?weekStart=2026-13-45` y `PUT /leads` con ese `weekStart` dan 500 en vez de 400. El admin lo dispara con `?semana=2026-13-45` en la URL (ver WR-01).
- `week.test.ts` no cubre este caso (solo prueba `2026-02-30`), por eso el unit test no lo detecta.

**Fix:**
```ts
export function isMonday(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  // Fecha inexistente (mes 13, día 00): Date inválido, addDays lanzaría RangeError.
  if (Number.isNaN(new Date(`${date}T12:00:00Z`).getTime())) return false;
  // Round-trip: "2026-02-30" se desliza a marzo y deja de coincidir.
  if (addDays(date, 0) !== date) return false;
  return mondayOf(date) === date;
}
```
Agregar a `week.test.ts` (`rechaza formatos inválidos y fechas inexistentes`): `expect(isMonday("2026-13-01")).toBe(false)`, `"2026-00-10"`, `"2026-11-00"`, y un caso de PUT `/leads` con `weekStart: "2026-13-01"` esperando 400.

## Warnings

### WR-01: Un `?semana=` inválido en la URL rompe el render del selector de semana (pantalla en blanco)

**File:** `el-templo-admin/src/pages/TableroPage.vue:~108-112` y `el-templo-admin/src/components/tablero/TableroWeekSelector.vue:~20-30`
**Issue:** `weekStart` acepta cualquier string que cumpla `^\d{4}-\d{2}-\d{2}$`. Con `?semana=2026-13-45`, `TableroWeekSelector` ejecuta `getWeekRange(0, new Date("2026-13-45T12:00:00Z"))`; `new Date(...)` es inválido, `todayInTz` devuelve `"Invalid Date"`, `getMondayInTz` arma un `Date` inválido y `toISOString()` lanza `RangeError` dentro de un `computed` en render. El resto de la página queda sin dibujar. Además el pedido llega al API y, hasta arreglar CR-01, da 500.
**Fix:** validar en la página que sea una fecha real antes de usarla, y caer a la semana en curso si no lo es:
```ts
const weekStart = computed(() => {
  const raw = route.query.semana;
  if (typeof raw !== 'string' || !ISO_DATE.test(raw)) return currentWeek;
  return Number.isNaN(new Date(`${raw}T12:00:00Z`).getTime()) ? currentWeek : raw;
});
```
(Opcional: exigir que sea lunes con `getUTCDay() === 1`; si no, el API ya responde 400 y el banner con "Reintentar" lo cubre.)

### WR-02: `sumActivosFoto` devuelve 0 (no null) si la foto existe pero no tiene filas del grupo, y la variación del Total queda inflada

**File:** `el-templo-api/src/modules/weekly-board/matrix.ts:~205-216`
**Issue:** `if (foto.size === 0) return null` mira el mapa entero, que contiene las filas de **todas** las sedes de la foto (todos los países, virtuales incluidas). Si la foto existe pero ninguna sede del grupo está en ella (grupo cuyas sedes se dieron de alta después del último cierre, o un grupo ES cuando la foto solo tiene filas AR), el bucle no suma nada y devuelve `0`. Entonces `variacionActivos` del Total = activos completos − 0, es decir un "+300" falso en vez de "—" (D-21 pide null sin foto). El test "variación del Total: una sede dada de alta después de la foto aporta sus activos completos" (matrix.test.ts:707) fija como deseado el caso parcial, pero no el caso "ninguna sede del grupo en la foto".
**Fix:** devolver null si ninguna de las `branchIds` tiene entrada en la foto:
```ts
function sumActivosFoto(branchIds: number[], foto: Map<number, number | null>): number | null {
  const present = branchIds.filter((id) => foto.has(id));
  if (present.length === 0) return null;
  let total = 0;
  for (const id of present) {
    const value = foto.get(id) ?? null;
    if (value === null) return null;
    total += value;
  }
  return total;
}
```
y un test en `matrix.test.ts` con `fotoPrev: [[SEDE_ES, 50]]` sobre el grupo AR esperando `null`.

### WR-03: Foto "congelada" parcial se presenta como cerrada y sub-reporta el Total sin aviso

**File:** `el-templo-api/src/modules/weekly-board/service.ts:~170-190` (`mainRowsOf`/`stateOf`) y `matrix.ts:~160-170` (`sumBranchValues`)
**Issue:** El estado del bloque es `congelado` si **alguna** fila tiene el sello, pero `closeDue` considera cerrada la semana solo si **todas** las sedes activas lo tienen. Mientras hay sellos parciales (sede dada de alta a mitad de semana, sede reactivada, corrida que murió antes de completar una sede nueva), el Tablero muestra "Cerrada" y, para las sedes sin fila, "—" en la columna; el Total congelado las ignora por diseño ("sede nueva"), de modo que el Total queda por debajo de la suma real durante hasta una hora sin ningún indicador. El caso es raro y se autocorrige con el cron horario, pero lo que se vea en esa ventana se lee en la reunión del lunes.
**Fix:** o bien exponer en `blocks.<main|late>` un flag `partial: true` cuando alguna sede visible no tiene sello y mostrar el chip "Cierre incompleto" en el admin, o bien tratar el bloque como `provisorio` (en vivo) si faltan sedes visibles con sello. Mínimo aceptable: documentar la ventana en la nota de la pantalla.

## Info

### IN-01: `leads: ""` se coerciona a `null` y borra la carga

**File:** `el-templo-api/src/modules/weekly-board/schemas.ts:~33`
**Issue:** Con el AJV por defecto de Fastify (`coerceTypes`), `type: ["integer", "null"]` convierte `""` en `null`, y `upsertLeads` interpreta `null` como "borrar". Un cliente que mande el string vacío borra sin querer. El admin siempre manda `null` o un entero, así que no se dispara hoy.
**Fix:** si se quiere estricto, declarar `leads` con `oneOf: [{ type: "integer", minimum: 0, maximum: 100000 }, { type: "null" }]` y verificarlo con un test de `leads: ""` esperando 400, o rechazar en la ruta `typeof request.body.leads === "string"`.

### IN-02: `currentWeek` de `TableroPage` se calcula una sola vez

**File:** `el-templo-admin/src/pages/TableroPage.vue:~96`
**Issue:** `const currentWeek = weekOptions(1)[0]!.value` queda congelada mientras la pestaña esté abierta. Si la pantalla se deja abierta de un domingo a un lunes, "Esta semana" sigue apuntando a la semana vieja (el API sí avanza a la nueva) y `onWeekChange` compara contra una constante vieja.
**Fix:** hacerlo un `computed` que dependa de un `ref(Date.now())` refrescado al volver el foco, o recalcularlo en `load()`.

### IN-03: Los avisos de moneda para sedes sin columna muestran "Sede N"

**File:** `el-templo-admin/src/pages/TableroPage.vue:~150-157` (`branchName`)
**Issue:** `branchName` solo busca en `group.branches`; las sedes virtuales (Online) no están ahí, así que el aviso dice "Sede 123". Dato correcto, texto poco útil.
**Fix:** usar `group.online?.branchIds.includes(id) ? 'Online' : ...`.

### IN-04: El Cobrado por sede del alumno descarta, sin avisar, ingresos de alumnos cuya sede no es columna

**File:** `el-templo-api/src/modules/finance/transaction-service.ts:~2783-2800` y `calculator.ts` `computeWeekFlows`
**Issue:** `getIncomeByMemberBranch` agrupa por `users.branch_id`; si el alumno quedó en una sede inactiva (o, para admin_sede, en otra sede), esa plata no aparece en ninguna columna ni en el Total, y no hay `BoardWarning`. La suma del Total no coincide con Caja y nada lo explica fuera de la nota genérica de D-14/D-25. Es consecuencia aceptada del diseño, pero conviene sumar un `warnings` "cobrado en sedes no mostradas" para el owner, o dejarlo escrito en la nota de la fila.
**Fix:** en `computeWeekFlows`, sumar los montos de `income` cuyo `branchId` no esté en `branches` y emitir un `BoardWarning` agregado (solo para roles sin alcance forzado).

### IN-05: D-03 (landing de owner/admin en `/tablero`) sigue marcado "revisar con Franco"

**File:** `el-templo-admin/src/router/routes.ts:~38-42`
**Issue:** El cambio de landing de `/alumnos` a `/tablero` lo decidió el orquestador sin Franco (CONTEXT D-03). Queda como un cambio de comportamiento visible para todos los owner/admin al entrar; los comentarios de `router/index.ts` (líneas ~63-65 y ~72) todavía dicen "dueño owner/admin → /alumnos". No es un bug, pero conviene confirmarlo antes de pasar a master y actualizar esos comentarios.
**Fix:** confirmar con Franco; actualizar los comentarios de `router/index.ts`.

---

_Reviewed: 2026-11-03_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_


---

## Estado de los hallazgos (orquestador, 2026-11-03)

- **CR-01:** corregido en `8811232d7` (`isMonday` descarta fechas con Date inválido antes del round-trip; casos 2026-13-01, 2026-00-10, 2026-11-00 y 2026-13-45 en `week.test.ts`).
- **WR-01:** corregido en `8811232d7` (`TableroPage.vue` valida `?semana=`: fecha real, lunes y no futura; si no, semana en curso).
- **WR-02:** corregido en `8811232d7` (`sumActivosFoto` devuelve null si ninguna sede del grupo está en la foto; test en `matrix.test.ts`).
- **WR-03:** no se cambia. Con la transacción de `closeDue` (fix del revisor de planes), una semana no puede quedar sellada a medias por una caída. El único caso parcial es una sede dada de alta después del cierre, que el job sella en la corrida siguiente con sus valores de ese momento (casi ceros), y la regla de lectura "alguna sede con foto = congelado" es la que mantiene congeladas las semanas viejas cuando aparece una sede nueva.
- **Info:** quedan anotados para la UAT (leads "" borra, `currentWeek` fijo si la pestaña queda abierta el lunes, advertencias de moneda de Online con "Sede N", cobrado de alumnos de sedes no visibles, comentarios de `router/index.ts` que dicen `/alumnos`).
