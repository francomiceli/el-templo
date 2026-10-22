---
phase: 201-conquer
plan: 10
subsystem: api
tags: [conquer, combos, toro, sabado, subir, niveles]
requires: ["201-09"]
provides:
  - "combos.ts: COMBO_KEYS, COMBOS, COMBO_LADDER_CODE, DEFAULT_COMBO_RUNG_CODE, SATURDAY_WARMUP, SATURDAY_DAY_KEY, SATURDAY_LABEL, isComboKey (sin imports)"
  - "combo-service.ts: buildComboView, comboSubirState, subirCombo, planComboWrites, applyComboStateWrites, loadComboSessions, buildComboSubirItems, comboAvailable, currentComboRung"
  - "opening / saturday en GET /today; sabado al final del plan de Toro; comboSubir en GET /progress"
  - "PUT /sessions con opening / push / pull (exercises opcional)"
  - "POST /api/members/conquer/combos/:comboKey/subir"
  - "test/conquer/_helpers.ts: combos en insertConquerSession, setComboState, readComboState, patchConquerMember, postComboSubir, saturdayBody, ComboBody"
affects: [201-11, 201-12, 201-18]
tech-stack:
  added: []
  patterns: ["combo_state con FOR UPDATE como primer statement de la tx del guardado", "racha D-14 con recencia (termina en la semana en curso o la anterior)"]
key-files:
  created:
    - el-templo-api/src/modules/conquer/combos.ts
    - el-templo-api/src/modules/conquer/combo-service.ts
    - el-templo-api/test/conquer/levels.test.ts
    - el-templo-api/test/conquer/combos.test.ts
  modified:
    - el-templo-api/src/modules/conquer/today-service.ts
    - el-templo-api/src/modules/conquer/session-service.ts
    - el-templo-api/src/modules/conquer/progress-service.ts
    - el-templo-api/src/modules/conquer/schemas.ts
    - el-templo-api/src/modules/conquer/member-routes.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - el-templo-api/test/conquer/_helpers.ts
    - el-templo-api/test/conquer/today-session.test.ts
decisions:
  - "Manifiesto y ENTRADAS_BASELINE: 492 -> 493 (+1, templo-module)."
  - "La racha de Subir del combo tiene que terminar en la semana en curso o en la anterior; la semana en curso solo cuenta si ya esta cumplida (no corta la racha mientras se completa)."
  - "Cuenta para la racha solo la sesion con el peldaño vigente y fecha >= combo_state.since (o activation_date)."
metrics:
  tasks: 3
  commits: 4
---

# Phase 201 Plan 10: Combos de Toro Summary

Combo de apertura en Hoy y Sabado de combos (push y pull, objetivo 13) para Toro, guardado de la progresion de arranque y las series completadas por combo, regla de Subir con N semanas seguidas (D-14) y los recortes 1 a 5 aplicados. Ternero y Novillo no los ven ni los pueden guardar (S12-3).

## Commits

- `285acf0ba` feat(201-10): combos de Toro — apertura, sábado y regla de subida (§3, D-14)
- `2af391d23` feat(201-10): guardar combos de Toro y subir la progresión de arranque
- `479b47a6b` test(201-10): niveles sin combos y combos de Toro (S12-3, D-14)
- `docs(201-10): summary del plan 10` (este archivo)

## Contratos JSON (los usa el app en 201-18)

### `ComboView`

```json
{
  "comboKey": "plancha | front | vertical | dominadas | push | pull",
  "label": "Plancha", "press": "Press de plancha", "push": "Push-up en plancha", "hold": "Hold de plancha",
  "rungs": [{ "id": 1, "code": "full", "name": "full", "position": 0 }],
  "rungId": 3, "rungName": "straddle",
  "target": 3, "value": 3,
  "maxSeries": null, "drops": null,
  "subir": { "ready": false, "toRungName": null }
}
```

- `rungs`: peldaños ACTIVOS de Palanca, de más difícil (position 0) a más fácil. `rungId`/`rungName` = `combo_state[comboKey]` o `straddle` (si el guardado quedó inactivo, vuelve al default).
- `value` = series guardadas hoy, o `target` (D-18). `maxSeries`/`drops` solo en el sábado (3 + 10; 3 + 6 con el recorte 1; 2 + 6 con el 2).
- `subir.ready = true` con `toRungName = null` significa tope de la escalera: sin botón, POST responde 409 `CONQUER_TOPE_ESCALERA` (y avisa al coach).

### `GET /today` (campos nuevos)

- `opening: ComboView | null`: Toro, día con `opening_combo_key`, y `openingTarget` no null (null con el recorte 5).
- `saturday: { warmup, push: ComboView, pull: ComboView } | null`: solo `?day=sabado`; ahí `exercises: []`, `finisher: ""`, `label: "Sábado"`, `opening: null`.
- `plan` de Toro termina con `{ dayKey: "sabado", label: "Sábado", done }` salvo recorte >= 3. `nextDayKey` pasa a `sabado` con los 4 días hechos; `weekComplete` recién con el sábado. Aplica también a `home.plan` de `GET /state`.
- `?day=sabado` sin sábado habilitado (Ternero, Novillo, Toro con recorte >= 3) -> 400 `CONQUER_DIA_INVALIDO`.

### `PUT /sessions` (body nuevo)

```json
{ "dayKey": "plancha", "pain": 0, "exercises": [ ... ], "opening": { "rungId": 3, "series": 4 } }
{ "dayKey": "sabado",  "pain": 0, "push": { "rungId": 3, "series": 13 }, "pull": { "rungId": 3, "series": 12 } }
```

| Caso | Respuesta |
|---|---|
| `opening` / `push` / `pull` en Ternero o Novillo | 409 `CONQUER_SIN_COMBOS` |
| `push` o `pull` en un día normal; `opening` el sábado, o con recorte 5, o en un día sin combo | 409 `CONQUER_SIN_COMBOS` |
| sábado sin `push` o sin `pull` | 400 `CONQUER_COMBO_INVALIDO` |
| sábado con `exercises`; día normal sin `exercises` | 400 `CONQUER_EJERCICIOS_INVALIDOS` |
| `rungId` que no es un peldaño activo de Palanca | 400 `CONQUER_PELDANO_INVALIDO` |
| `series` fuera de 0-10 (`opening`) o 0-13 (`push`/`pull`) | 400 (JSON-schema) |

- `opening` es OPCIONAL en el API: sin él `combo_*` queda NULL y esa semana no cuenta para Subir. Re-guardar el mismo día PISA las columnas de combo (con NULL si no vino).
- Se guardan `combo_target` = `openingTarget` del día o `push_target`/`pull_target` = `saturdayPlan.target`. El sábado no escribe marcas, ni calibración, ni caída; sí molestia (`evaluatePain`).
- `combo_state[comboKey] = { rungId, since: hoy }` si el peldaño difiere del vigente (o no hay estado). Mismo peldaño no toca `since`.

### `POST /api/members/conquer/combos/:comboKey/subir` -> `{ combo: ComboView }`

| Codigo | Status | Cuando |
|---|---|---|
| `CONQUER_SIN_COMBOS` | 409 | no es Toro, o el combo no existe por el recorte (apertura con 5, push/pull con >= 3) |
| `CONQUER_NO_TOCA_SUBIR` | 409 | `!ready`, o doble toque |
| `CONQUER_TOPE_ESCALERA` | 409 | ya en el peldaño más difícil (alerta `tope_escalera`, dedupe `tope:combo:<comboKey>:<rungId>`, `detail` con `exerciseName: "Combo <label>"`, `comboKey`, `step: "combo"`, `rungName`) |
| (sin code) | 400 / 401 / 404 | comboKey inválido / sin token / gimnasio sin el módulo |
| `CONQUER_NO_ACTIVO` | 409 | alumno sin Conquer activo |

### `GET /progress`: `comboSubir: { comboKey, label, fromRungName, toRungName | null }[]` (solo Toro, solo combos listos).

## Regla de Subir (D-14)

`comboSubirState(mctx, comboKey, sessions)`:
1. Historial del combo: apertura = sesiones cuyo `day_key` tiene ese `opening_combo_key`; `push`/`pull` = columnas `push_*`/`pull_*`.
2. Solo filas con el peldaño vigente y fecha >= `since` (de `combo_state`, o `activation_date`).
3. Por semana calendario: `hit` = alguna fila con `series >= target` (de la fila). La semana en curso solo entra si ya está cumplida.
4. `comboSubirReady(semanas, comboWeeksN)` Y la última semana >= semana anterior (la racha no puede haber terminado hace más).
5. `ready` -> `toRungName` = peldaño activo más difícil que el vigente (null = tope).

`loadComboSessions` trae sesiones desde `comboWeeksN` semanas antes del lunes actual hasta hoy: UNA query para todos los combos (Hoy y Progreso).

## Gates corridos

- Pre-flight `node_modules`: OK.
- `npx tsc --noEmit`: OK tras cada tarea.
- `pnpm lint:tenant`: `DISCREPANCIAS: 0` tras cada tarea.
- `pnpm typecheck:tests | grep -E "test/(conquer|unit/conquer|migrations/0290)"`: vacío.
- `node --no-warnings test/conquer/oracle-check.mjs`: ORACULO OK, SEMILLA OK, MOTOR OK (14785 casos), REGLAS OK (`rules.ts` y `calendar.ts` no se tocaron).
- `prettier --write` sobre todo lo tocado; higiene (`console.*`, `any`, fechas literales, `userId: <numero>`) sin hallazgos; `combos.ts` sin `import`.
- Los tres `verify` automáticos del plan: OK.
- Vitest NO se corrió (regla de la fase): `levels.test.ts`, `combos.test.ts`, el manifiesto y `today-session.test.ts` corren en CI.

## Mutantes razonados

Cada mutante se aplicó, `tsc` compiló y se revirtió con `git checkout -- <ruta>` (árbol limpio después). Citas = archivo y línea del `expect` que falla.

1. `buildOpening` con `openingTarget(...) ?? 3` (arma `opening` para Novillo de 4 días, que comparte las `opening_combo_key` de la plantilla): falla `levels.test.ts:62` (`expect(hoy.opening).toBeNull()` en el caso novillo/4).
2. `comboSubirReady(weeks, 2)` en vez de `comboWeeksN`: falla `combos.test.ts:338` (con `combo_weeks_n = 3` y 2 semanas, `ready` tiene que ser false).
3. `buildPlanWeek` con sábado siempre (ignora `saturdayPlan`): falla `combos.test.ts:741` (recorte 3: el plan tiene que ser solo los 4 días) y `levels.test.ts:64` (Novillo sin `sabado`).
4. `applyComboStateWrites` que conserva el `since` viejo al cambiar de peldaño: falla `combos.test.ts:500` (`since` tiene que ser hoy).
5. `weeklyHits` con `series > target`: falla `combos.test.ts:293` (apertura 3/3 las 2 semanas anteriores tiene que estar lista).
6. `comboSubirState` sin el filtro por peldaño vigente: falla `combos.test.ts:393` (las semanas hechas con half lay no son del combo en straddle).

## Desvíos del plan

- `buildPlanWeek` no cambió su firma obligatoria: `level` y `member` son opcionales en el tipo del contexto (sin ellos no hay sábado), así `test/unit/conquer-today-week.test.ts` sigue compilando y pasando sin tocarlo.
- `invalidDayError` de `today-service.ts` ahora se exporta (lo reusa `session-service.ts`).
- `saveSession` se partió en `resolveSaveDay`, `resolveMatched` y `persistSession` (la función pasaba de 80 líneas). El `FOR UPDATE` de `conquer_members` (combo_state) es el primer statement de la transacción cuando hay combos.
- Test existente tocado: `today-session.test.ts` esperaba el plan de Toro con 4 días; ahora son 5 (sábado al final). No cambia ninguna otra expectativa anterior.
- No se agregó nada a `tenant-lint-allowlist.json`.

Ambigüedades nuevas (opción más simple):

- Primera vez que se guarda un combo sin `combo_state`: se escribe `{ rungId, since: hoy }` aunque sea el peldaño default (`straddle`); como las filas de combo solo nacen por este camino, no se pierde historial real. Los tests que insertan historial directo fijan `combo_state` antes de guardar.
- La semana de una apertura cumplida cuenta con "alguna sesión con `series >= target`" (no "todas").
- `GET /today` del sábado no trae `lighting`; el guardado del sábado devuelve `lighting` vacío (D-13 no define zonas para los combos).
- `ComboView.value` tras `POST subir` es el objetivo (no se relee la sesión de hoy).
- `sessionsCount` de Progreso incluye las sesiones de sábado; `days` solo trae los días de la plantilla.

## Trampas / notas para los planes siguientes

- 201-11 (ficha del admin): `buildProgress` ya trae `comboSubir`; `combo_state`, el `cut_stage` y `saturdayPlan`/`openingTarget` (rules) se resuelven sin tocar el motor.
- 201-12/18 (app): el app manda `opening` SIEMPRE precargado con `ComboView.rungId` y `value`; el sábado manda `push` y `pull` y NO manda `exercises`. Para mostrar Subir usar `subir.ready`; con `toRungName === null` no hay botón.
- Cambiar de recorte (`cut_stage`) no limpia `combo_state` ni sesiones; si el recorte 5 saca la apertura y después se revierte, la cuenta sigue.
- Fastify con `type: ["object","null"]` en la respuesta: lo usan `opening` y `saturday`; si 201-12/18 suman otro campo anidado en `ComboView`, declararlo en `comboViewSchema` (`schemas.ts`) o se descarta en silencio.
- Los tests que quieran un historial de combos con `GET /today` tienen que pasar `activationDate` hacia atrás con `patchConquerMember` (la activación de la fábrica es hoy y filtra el historial anterior).
- Manifiesto: 493 entradas tras 201-10.

## Known Stubs

Ninguno.

## Self-Check: PASSED

Archivos creados existen (`combos.ts`, `combo-service.ts`, `levels.test.ts`, `combos.test.ts`); commits `285acf0ba`, `2af391d23` y `479b47a6b` en `git log`.
