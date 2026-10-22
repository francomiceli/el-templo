---
phase: 201-conquer
plan: 09
subsystem: api
tags: [conquer, alerts, board, semaforo, molestia, caida, paso-nivel]
requires: ["201-08"]
provides:
  - "alerts-service.ts: evaluateAfterSave, summarizeWeeks, deriveTimeAlerts, updateAlertStatus (ademas de upsertEventAlert/autoResolveEventAlert)"
  - "board-service.ts: buildBoard, toBoardAlert, tipos BoardAlert/BoardMember/BoardResponse"
  - "alert-view.ts: getBoardAlert (respuesta del PATCH)"
  - "body-check-content.ts: checkHasContent, checkHasContentSql (lo reusa 201-12)"
  - "GET /api/admin/conquer/members"
  - "PATCH /api/admin/conquer/alerts/:id"
  - "test/conquer/_helpers.ts: insertConquerAlert, insertBodyCheckRow, fetchBoard, getBoardRaw, boardMember, patchAlert"
affects: [201-10, 201-11, 201-12, 201-21]
tech-stack:
  added: []
  patterns: ["alertas por evento dentro de la tx del guardado con dedupe + auto-resolucion", "derivadas por tiempo calculadas al leer (sin cron)", "tablero en 4 queries fijas con inArray"]
key-files:
  created:
    - el-templo-api/src/modules/conquer/board-service.ts
    - el-templo-api/src/modules/conquer/alert-view.ts
    - el-templo-api/src/modules/conquer/body-check-content.ts
    - el-templo-api/test/conquer/alerts.test.ts
    - el-templo-api/test/conquer/board.test.ts
  modified:
    - el-templo-api/src/modules/conquer/alerts-service.ts
    - el-templo-api/src/modules/conquer/session-service.ts
    - el-templo-api/src/modules/conquer/schemas.ts
    - el-templo-api/src/modules/conquer/admin-routes.ts
    - el-templo-api/test/conquer/_helpers.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
decisions:
  - "Manifiesto y ENTRADAS_BASELINE: 490 -> 492 (+2, templo-module)."
  - "updateAlertStatus devuelve void y la ruta responde con getBoardAlert (mismo patron que 201-08)."
metrics:
  tasks: 2
  commits: 4
---

# Phase 201 Plan 09: Alertas del coach y tablero Summary

Alertas de molestia, caida y paso de nivel al guardar (dedupe, auto-resolucion y reapertura solo de las del sistema), alertas derivadas por tiempo sin cron (inactivo, control vencido, control dia 0 pendiente) y tablero con semaforo en 4 queries fijas para owner/admin (S12-6, S12-7).

## Commits

- `feat(201-09): alertas de Conquer (molestia, caída, paso de nivel, derivadas) y tablero (S12-6, S12-7)`
- `feat(201-09): rutas del tablero y de alertas`
- `test(201-09): alertas y tablero de Conquer`
- `docs(201-09): summary del plan 09` (este archivo)

## Contratos JSON (los usa el admin en 201-11 y 201-21)

### `GET /api/admin/conquer/members` -> `BoardResponse`

```json
{
  "counts": { "rojo": 1, "amarillo": 2, "verde": 0, "ok": 27, "total": 30 },
  "members": [
    {
      "userId": 12, "firstName": "Ana", "lastName": "Perez",
      "level": "toro", "daysCount": 4, "cutStage": 0,
      "lastSessionDate": "YYYY-MM-DD | null",
      "light": "rojo | amarillo | verde | ok",
      "alerts": [
        { "id": 7, "kind": "molestia", "severity": "rojo", "label": "Molestia",
          "status": "abierta | vista", "createdAt": "ISO",
          "detail": { "pain": 4, "date": "YYYY-MM-DD", "dayKey": "plancha" },
          "proposal": { "kind": "etapa", "stage": 1, "label": "Sábado: drops de 10 a 6" } },
        { "id": null, "kind": "inactivo", "severity": "amarillo", "label": "Inactivo",
          "status": null, "createdAt": null,
          "detail": { "lastSessionDate": "YYYY-MM-DD | null", "days": 9 },
          "proposal": null }
      ]
    }
  ]
}
```

- Solo alumnos `activo` con nivel y dias. Orden: rojo, amarillo, verde, ok y despues apellido (es), nombre, id.
- `alerts`: primero las guardadas (por `created_at`), despues las derivadas. `light` = `worstLight` de todas. Las `resuelta` NO salen.
- `proposal` solo en `molestia` y `caida`: `{ kind: "etapa", stage, label }` (Toro, etapas 1-5) o `{ kind: "bajar_escalon", label }` (Ternero/Novillo, o Toro tras la etapa 5). Se calcula al leer con `cutProposal(level, cutStage)`.
- `detail` por tipo: `molestia {pain,date,dayKey}`, `caida {exerciseId,exerciseName,values:[a,b,c]}`, `paso_nivel {from,to,weeks}`, `tope_escalera {exerciseId,exerciseName,step,rungName}`, `inactivo {lastSessionDate,days}`, `control_vencido {lastCheckDate,days}`, `control_dia0_pendiente {}`.
- Sin alumnos activos: `{ counts: all 0, members: [] }` (y NO hace queries 2-4).
- Errores: 401 sin token, 403 para cualquier rol que no sea owner/admin (guard en `onRequest`).

### `PATCH /api/admin/conquer/alerts/:id` body `{ "status": "vista" | "resuelta" }` -> `BoardAlert`

Igual que un elemento de `alerts` pero `status` puede ser `"resuelta"` (el tablero nunca lo trae).

| Codigo | Status | Cuando |
|---|---|---|
| `CONQUER_ALERTA_NO_ENCONTRADA` | 404 | la alerta no existe o es de otro gimnasio |
| `CONQUER_ALERTA_RESUELTA` | 409 | resuelta -> vista |
| (sin code) | 400 | status invalido, sin body, id < 1 o no numerico |
| (sin code) | 403 / 401 | rol sin permiso / sin token |

`resuelta` guarda `resolved_by` (del token) y `resolved_at = NOW()`. Repetir el mismo estado es un 200 sin cambios.

## Reglas implementadas

- **Molestia** (`evaluatePain`): `pain >= 4` -> alerta `molestia:<fecha>:<dia>`; si el re-guardado baja de 4 se auto-resuelve esa misma clave.
- **Caida** (`evaluateFalls`): `caidaE1(selectReales(E1 de la fila de hoy))` por ejercicio del dia -> `caida:<ejercicioId>:<fecha>`; si deja de cumplirse, auto-resuelve. Cambiar de peldaño reinicia la cuenta (por `selectReales`).
- **Paso de nivel** (`evaluateLevelUp`): una query de sesiones desde `level_since` (si es null, desde `activation_date`), `summarizeWeeks` (dias DISTINTOS del plan sin sabado + maxima molestia de todas las sesiones de la semana) y `levelUpStreak(..., daysCount, 4, lunes actual) >= 4` -> `paso_nivel:<nivel>:<level_since>`. Toro: nunca.
- **Derivadas** (`deriveTimeAlerts`, pura): inactivo `>= 7` dias (desde la ultima sesion o la activacion), control vencido `> 42`, dia 0 pendiente `!hasDay0 && day0Skipped`.
- **Control vacio** (`body-check-content.ts`): sin fotos ni medidas no cuenta como dia 0 ni como ultimo control; `checkHasContentSql()` es el gemelo SQL.
- `evaluateAfterSave` corre en la misma tx que el guardado, despues de `syncTopeAlerts`.

## Gates corridos

- Pre-flight `node_modules`: OK.
- `npx tsc --noEmit`: OK tras cada tarea.
- `pnpm lint:tenant`: `DISCREPANCIAS: 0` tras cada tarea.
- `pnpm typecheck:tests | grep -E "test/(conquer|unit/conquer|migrations/0290)"`: vacio.
- `node --no-warnings test/conquer/oracle-check.mjs`: ORACULO OK, SEMILLA OK, MOTOR OK (14785 casos), REGLAS OK (`rules.ts` y `calendar.ts` no se tocaron).
- `prettier --check` sobre todo lo tocado: OK.
- Higiene (`console.*`, `any`, fechas literales, `userId: <numero>`, `map(async`, <= 6 `await` en `board-service.ts`) y los dos `verify` automaticos del plan: OK.
- Vitest NO se corrio (regla de la fase): `alerts.test.ts`, `board.test.ts` y el manifiesto corren en CI.

## Mutantes razonados

Cada mutante se aplico, `tsc` compilo y se revirtio con `git checkout -- <ruta>` (arbol limpio despues).

1. `evaluatePain` con `pain > PAIN_ALERT_MIN`: falla `alerts.test.ts:107` (Toro con molestia 4 espera una alerta `molestia` abierta y el alumno rojo).
2. `evaluatePain` sin la rama `autoResolveEventAlert`: falla `alerts.test.ts:183` (`status: "resuelta", resolvedBy: null` tras re-guardar con 2) y el `light` "ok" siguiente.
3. `deriveTimeAlerts` con `> INACTIVE_DAYS` en vez de `>=`: falla el caso "ultima sesion hace 7 dias justos" (`alerts.test.ts:559`, espera `["inactivo"]`). El caso de 7 dias ya estaba en el `it.each`.
4. `compareMembers` sin `LIGHT_ORDER`: falla `board.test.ts:141` (los rojos son los apellidos 28 y 29, quedarian al final) y el `toEqual` de `light`.
5. `loadCheckSummaries` sin `checkHasContentSql()`: falla `alerts.test.ts:602` (un control vacio de ayer resetearia el vencido) y el caso "un dia 0 VACIO no cuenta".
6. `evaluateLevelUp` con limite de molestia `PAIN_ALERT_MIN + 1`: falla el caso `alerts.test.ts:410` (molestia 4 en una de las semanas no debe dar paso de nivel).
7. (Razonado, no aplicado porque `lint:tenant` lo frena antes) quitar `tenantWhere` de `updateAlertStatus`/`getBoardAlert`: falla `alerts.test.ts:743` (alerta del gimnasio 2 -> 404 y sin cambios) y el 404 del admin del gimnasio 2.

## Desvios del plan

- `getBoardAlert`, y no `updateAlertStatus`, devuelve el `BoardAlert` del PATCH. `updateAlertStatus` devuelve `void` (patron de 201-08). La funcion vive en `alert-view.ts` (archivo nuevo, no estaba en `files_modified`) porque en `board-service.ts` hacia pasar de 6 los `await` que cuenta el gate del plan y en `alerts-service.ts` creaba un import circular (`board-service` importa `deriveTimeAlerts`).
- `toBoardAlert` y los tipos `BoardAlert`/`BoardMember`/`BoardResponse` viven en `board-service.ts` (el plan pedia `cutProposal` ahi). `AlertStatus` y `TimeAlertKind` en `alerts-service.ts`.
- `evaluateAfterSave` recibe `marksAfter` como `ReadonlyMap` (el contrato decia `Map`; es compatible).
- `test/conquer/_helpers.ts` suma tambien `fetchBoard`, `getBoardRaw`, `boardMember`, `patchAlert` y los tipos `Board*Body` (ademas de `insertConquerAlert` e `insertBodyCheckRow`).
- El test de "4 queries fijas" llama `buildBoard(app.db, TEMPLO_CTX)` directo con `vi.spyOn(app.db, "select")` (no por HTTP, para no contar las queries de los hooks de auth).
- Encabezado de manifiesto (`tenant-manifest.ts`): entrada "492 rutas" agregada arriba de la de 487 (201-08 no habia dejado una).

Ambiguedades nuevas (opcion mas simple):

- `PATCH` resuelta -> vista es 409 (una resuelta no se "des-resuelve" por la API); repetir el mismo estado es un 200 idempotente.
- El paso de nivel se auto-resuelve si la racha cae por debajo de 4 (misma regla que molestia y caida); la clave incluye nivel y `level_since`, asi que al subir de nivel nace otra.
- Si `level_since` es null se cuenta desde `activation_date`; si ambas son null, no se evalua.
- El "hoy" de cada alumno del tablero sale de la zona de su sede (leftJoin a `branches` en la query 1; sin sede, la del gimnasio por defecto). `activationDate` null -> no hay "inactivo" por activacion.
- Una sola semana parcial al inicio (`level_since` a mitad de semana) no cuenta como completa: simple y conservador.
- El detalle de las derivadas (`days`, `lastSessionDate`, `lastCheckDate`) lo arma `board-service.ts`; `deriveTimeAlerts` sigue devolviendo solo los tipos.

## Trampas / notas para los planes siguientes

- `Promise.all` de las queries 2-4 del tablero comparte la conexion del pool: son independientes, no hay tx.
- Fechas de `MAX(date)` en SQL crudo: mysql2 las devolveria como `Date`; usar `DATE_FORMAT(MAX(col), '%Y-%m-%d')` (como hace el tablero).
- `checkHasContentSql()` (201-12 la reusa para `bodyCheck` de `GET /state`) y `checkHasContent` deben cambiar juntas.
- 201-10 (aceptar recorte / paso de nivel): `cut_stage` y el cambio de nivel (`level` + `level_since`) generan claves de alerta nuevas; para cerrar la alerta usar `updateAlertStatus(..., "resuelta")` (guarda `resolved_by`, asi el sistema no la reabre).
- 201-11 (ficha): `toBoardAlert`/`getBoardAlert` y `buildProgress` sirven tal cual; `summarizeWeeks` es exportada y pura si se necesita la racha.
- Los roles `coach`/`recepcion` reciben 403 en el `onRequest` aunque el gimnasio no tenga el modulo (ver 201-05).
- Manifiesto: 492 entradas tras 201-09.

## Known Stubs

Ninguno.

## Self-Check: PASSED

Archivos creados existen (`board-service.ts`, `alert-view.ts`, `body-check-content.ts`, `alerts.test.ts`, `board.test.ts`); commits `3021b0167`, `100d4cf43` y `d2cea3ad7` en `git log`.
