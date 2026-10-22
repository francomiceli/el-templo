---
phase: 201-conquer
plan: 11
subsystem: api
tags: [conquer, ficha, recortes, paso-de-nivel, admin]
requires: ["201-10"]
provides:
  - "cuts-service.ts: applyCut, parseCutBody, CutBody, CutRequestBody"
  - "level-service.ts: confirmLevelUp, LevelUpBody"
  - "ficha-service.ts: buildFicha, correctStep, FichaResponse"
  - "board-service.ts: loadBoardRows(db, ctx, userIds?), buildBoardMembers, BoardRow (exportados)"
  - "activation-service.ts: lockActiveMember, requireActiveMember, ActiveMemberRow"
  - "alerts-service.ts: resolveAlertsByCoach, assertAlertOfMember"
  - "GET /api/admin/conquer/members/:userId, PUT .../members/:userId/steps/:exerciseId/:step, POST .../members/:userId/recortes, POST .../members/:userId/level-up"
  - "test/conquer/_helpers.ts: FichaBody, getFichaRaw, fetchFicha, postCutRaw, postLevelUpRaw, putFichaStepRaw, patchConquerStep"
affects: [201-22]
tech-stack:
  added: []
  patterns: ["servicios que mutan devuelven void y la ruta responde con buildFicha", "acciones del coach: requireActiveMember (404/409) antes del contexto, lockActiveMember (FOR UPDATE) primero en la tx"]
key-files:
  created:
    - el-templo-api/src/modules/conquer/cuts-service.ts
    - el-templo-api/src/modules/conquer/level-service.ts
    - el-templo-api/src/modules/conquer/ficha-service.ts
    - el-templo-api/test/conquer/recortes.test.ts
    - el-templo-api/test/conquer/level-up.test.ts
    - el-templo-api/test/conquer/ficha.test.ts
  modified:
    - el-templo-api/src/modules/conquer/board-service.ts
    - el-templo-api/src/modules/conquer/activation-service.ts
    - el-templo-api/src/modules/conquer/alerts-service.ts
    - el-templo-api/src/modules/conquer/schemas.ts
    - el-templo-api/src/modules/conquer/admin-routes.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - el-templo-api/test/conquer/_helpers.ts
decisions:
  - "Manifiesto y ENTRADAS_BASELINE: 493 -> 497 (+4, templo-module)."
  - "El body de /recortes es plano en el JSON-schema (no oneOf) y parseCutBody exige exerciseId y step para bajar_escalon (400 CONQUER_CORTE_INVALIDO)."
  - "Aceptar un recorte y cerrar la alerta es una sola transaccion: si la accion falla (409) la alerta sigue abierta."
metrics:
  tasks: 2
  commits: 3
---

# Phase 201 Plan 11: Recortes, paso de nivel y ficha del alumno Summary

El coach acepta el recorte que propone la app de a un paso (Toro etapas 1 a 5 y despues bajar un escalon; Ternero y Novillo bajan un escalon), puede deshacer la ultima etapa, confirma el paso de nivel con un toque sin tocar las progresiones, y tiene la ficha del alumno con Progreso, alertas, propuesta de recorte y correccion de progresiones. Todo detras del guard unico `canManageConquer` (D-08).

## Commits

- `dc640c716` feat(201-11): recortes, paso de nivel y ficha del alumno (§5.1, §2.2, §7.2)
- `59d4bdb6d` feat(201-11): rutas de ficha, recortes y paso de nivel
- `a7372d5e2` test(201-11): recortes, paso de nivel y ficha
- `docs(201-11): summary del plan 11` (este archivo)

## Contratos JSON (los usa el admin en 201-22)

Todas las rutas con 403 para roles sin permiso (en `onRequest`, antes de validar el body), 401 sin token, 404 para alumno ajeno o sin fila, 409 `CONQUER_NO_ACTIVO` si todavia es un pedido. Errores de negocio salen como `{ error, code }`.

### `FichaResponse` (respuesta de las 4 rutas, 200)

```json
{
  "member": {
    "userId": 1, "status": "activo", "level": "novillo", "daysCount": 3,
    "incReps": 1, "incS": 2, "coachUserId": 9,
    "activatedAt": "ISO", "activationDate": "YYYY-MM-DD", "levelSince": "YYYY-MM-DD", "cutStage": 0,
    "firstName": "Ana", "lastName": "Gomez", "email": "a@b.com | null"
  },
  "progress": { "...ProgressResponse de GET /progress (201-08/10), identico al que ve el alumno..." },
  "alerts": [ { "id": 5, "kind": "molestia", "severity": "rojo", "label": "Molestia", "status": "abierta", "createdAt": "ISO", "detail": {}, "proposal": { "kind": "bajar_escalon", "label": "..." } } ],
  "cutProposal": { "kind": "etapa", "stage": 3, "label": "Sábado: se saca" },
  "levelUp": { "to": "toro", "validDays": [4] }
}
```

- `alerts` = las MISMAS del tablero (guardadas `abierta`/`vista` con `id`, mas derivadas con `id: null`), solo de ese alumno. Las `resuelta` no salen.
- `cutProposal` = `cutProposal(level, cutStage)`: `{ kind: "etapa", stage, label }` (Toro con `cut_stage < 5`) o `{ kind: "bajar_escalon", label }` (`stage` ausente).
- `levelUp.to` null = Toro (sin nivel siguiente), `validDays` `[]`; Ternero `[3, 4]`, Novillo `[4]`.

### Rutas

| Ruta | Body | Notas |
|---|---|---|
| `GET /api/admin/conquer/members/:userId` | - | `FichaResponse` |
| `PUT .../members/:userId/steps/:exerciseId/:step` | `{ rungId, mode }` | reusa `changeStep` (since = hoy, E1 vuelve a calibrar). 400 `CONQUER_PELDANO_INVALIDO`, 400 `CONQUER_MODO_INVALIDO` (hold con otro modo), 404 escalon ajeno |
| `POST .../members/:userId/recortes` | ver abajo | `FichaResponse` |
| `POST .../members/:userId/level-up` | `{ daysCount }` | `FichaResponse` |

El incremento (`incReps`/`incS`) se edita con el `PUT /members/:userId` de 201-06 (la ficha lo muestra en `member`).

### Body de `/recortes` (plano, `additionalProperties: false`)

```json
{ "action": "aplicar_etapa", "alertId": 12 }
{ "action": "deshacer_etapa" }
{ "action": "bajar_escalon", "exerciseId": 4, "step": "e1", "alertId": 12 }
```

| Caso | Respuesta |
|---|---|
| `aplicar_etapa` que no es Toro con `cut_stage < 5`, o `deshacer_etapa` con `cut_stage = 0` | 409 `CONQUER_SIN_ETAPA` |
| `bajar_escalon` sin peldaño mas facil activo | 409 `CONQUER_PISO_ESCALERA` |
| `bajar_escalon` sin `exerciseId` o sin `step` | 400 `CONQUER_CORTE_INVALIDO` |
| `alertId` que no es una `molestia`/`caida` de ESE alumno (inexistente, ajena o de otro tipo) | 404 `CONQUER_ALERTA_NO_ENCONTRADA`, no se aplica nada |
| `action` desconocida, `alertId` < 1, `step` fuera de e1/e2/e3/hold | 400 (JSON-schema) |

Con `alertId` valido y accion OK, la alerta queda `resuelta` con `resolved_by = request.user.userId` (NUNCA NULL). `deshacer_etapa` ignora `alertId`.

### `POST .../level-up`

| Caso | Respuesta |
|---|---|
| Toro (sin nivel siguiente) | 409 `CONQUER_NIVEL_MAXIMO` (aun con `daysCount` invalido) |
| `daysCount` no valido para el nivel NUEVO (A14) | 400 `CONQUER_DIAS_INVALIDOS` |
| OK | `level` nuevo, `days_count`, `level_since = hoy` (zona de la sede), escalones nuevos con `ensureStepsForPlan` (los existentes NO se tocan, A13), todas las `paso_nivel` abiertas/vistas del alumno -> `resuelta` con `resolved_by = actor` |

## Gates corridos

- Pre-flight `node_modules`: OK.
- `npx tsc --noEmit`: OK tras cada tarea y tras los mutantes revertidos.
- `pnpm lint:tenant`: `DISCREPANCIAS: 0` (nada en `tenant-lint-allowlist.json`).
- `pnpm typecheck:tests | grep -E "test/(conquer|unit/conquer|migrations/0290)"`: vacio (el comando completo falla por deuda ajena preexistente: attendance, check-ins, analytics, unit/combos-generator, etc.).
- `node --no-warnings test/conquer/oracle-check.mjs`: ORACULO OK, SEMILLA OK, MOTOR OK (14785 casos), REGLAS OK (modulos puros sin tocar).
- `prettier --write/--check` sobre todo lo tocado; higiene (`console.*`, `any`, fechas literales, `userId: <numero>`) sin hallazgos.
- Los dos `verify` automaticos del plan: OK.
- Vitest NO se corrio (regla de la fase): `recortes`, `level-up`, `ficha`, `board` y el manifiesto corren en CI.

## Mutantes razonados

Cada mutante se aplico sobre produccion, `tsc` compilo y se revirtio con `git checkout -- <ruta absoluta>` (arbol limpio, verificado). Citas = archivo y linea del `expect` que falla.

1. `applyStage` sin el chequeo de `cutProposal` (suma 1 a cualquier nivel): falla `recortes.test.ts:224` (Ternero/Novillo `aplicar_etapa` tiene que ser 409 `CONQUER_SIN_ETAPA`) y `:180` (la sexta etapa de Toro).
2. `lowerStep` con `"harder"` en vez de `"easier"` (`easierPosition`): falla `recortes.test.ts:257` (de tuck tiene que bajar a lean) y `:288` (adv_tuck con tuck inactivo tiene que caer en lean).
3. `confirmLevelUp` que reinicia los escalones existentes (`since = hoy`, calibracion pendiente): falla `level-up.test.ts:143` (`despues.get(clave)` igual a `previo` para cada escalon previo) y `:146` (E1 de Planche press conserva `calibration "resuelta"`).
4. `applyCut` que no resuelve la alerta con `alertId`: falla `recortes.test.ts:140` (estado `resuelta`) y `:330` (caida, `resolvedBy` = admin).
5. `buildFicha` con `loadBoardRows(db, ctx)` sin `userIds` (toma el primer alumno del gimnasio): falla `ficha.test.ts` en la comparacion de la ficha de `otro` (`alerts` solo `tope_escalera`) y en `alerts` de la ficha de `m` (ids molestia+paso_nivel), sin importar el orden de las filas.
6. `resolveAlertsByCoach` con `resolvedBy: null` (la 201-08 la reabriria): falla `recortes.test.ts:141`, `level-up.test.ts:135` y `:251`.

## Desvios del plan

- Los servicios `applyCut` y `confirmLevelUp` devuelven `void` y la ruta responde con `buildFicha` (leccion de 201-08, evita ciclos de imports); el contrato HTTP es el del plan (`FichaResponse`).
- `loadBoardRows` ademas se exporta junto con `buildBoardMembers` (queries 2 a 4 y armado en memoria extraidos de `buildBoard`): la ficha reusa ambos sin duplicar. `buildBoard` y su test de "4 queries fijas" siguen valiendo igual.
- Helpers nuevos fuera de `files_modified` (DRY): `lockActiveMember` / `requireActiveMember` en `activation-service.ts` (404 sin fila, 409 `CONQUER_NO_ACTIVO`; `updateMember` ahora usa `lockActiveMember`, mismo comportamiento) y `resolveAlertsByCoach` / `assertAlertOfMember` en `alerts-service.ts`.
- Body de `/recortes` plano en lugar de `oneOf`: con `removeAdditional` de Ajv un `oneOf` con `additionalProperties:false` borra en silencio las claves de las otras ramas. Los campos por accion los valida `parseCutBody` (400 `CONQUER_CORTE_INVALIDO`).
- `correctStep` (ficha-service) envuelve `changeStep` con `requireActiveMember` para que un alumno ajeno o sin fila sea 404 (el `changeStep` solo, via `loadMemberContext`, daria 409).

Ambiguedades nuevas (opcion mas simple):

- El plan decia "(2) Toro con 3 dias -> 400" y "(3) Toro -> 409 CONQUER_NIVEL_MAXIMO": son contradictorios para un alumno Toro. Se interpreto (2) como "pasar a Toro con 3 dias" (Novillo con `daysCount: 3` o 5 -> 400) y Toro siempre 409, aun con dias invalidos (se chequea el nivel maximo primero).
- Aceptar un recorte NO limpia `combo_state` ni reinicia nada mas que `cut_stage` o el escalon elegido; pasar de nivel NO resetea `cut_stage` (A13 solo habla de progresiones).
- `bajar_escalon` funciona sobre cualquiera de los 4 escalones (e1, e2, e3, hold) del alumno; solo el E1 vuelve a calibrar (`applyRungChange`).
- Dos admins distintos en los tests (el que activa y el que acepta) para que `resolved_by` no se confunda con `activated_by`.

## Trampas / notas para los planes siguientes

- 201-22 (admin): la respuesta de las tres acciones es la ficha completa: reemplazar el estado de la pantalla con ella, no recomponer. Mostrar `cutProposal.label` en el boton de aceptar; si `kind === "bajar_escalon"` el coach elige el ejercicio/escalon (la alerta de molestia trae `detail`; la de caida trae `exerciseId`) y manda `alertId`.
- `alerts` de la ficha usa los `id` de las alertas guardadas (null = derivada, no se puede resolver desde la ficha).
- `lockActiveMember` hace `FOR UPDATE` y NO se puede llamar despues de `loadMemberContext` en la misma request si este puede escribir (`ensureStepsForPlan`): armar el contexto ANTES de la tx (lo hace `applyCut`).
- Fastify: el body de `/recortes` descarta claves extra (no hay 400 por campo de mas).
- Tests: `patchConquerStep` pisa peldaño/calibracion/since de un escalon directo; `fetchFicha`/`postCutRaw`/`postLevelUpRaw`/`putFichaStepRaw` en `_helpers.ts`. Si un test desactiva un peldaño del catalogo lo restaura en `finally` (ver `recortes.test.ts`).
- Manifiesto: 497 entradas tras 201-11.

## Known Stubs

Ninguno.

## Self-Check: PASSED

Archivos creados existen (`cuts-service.ts`, `level-service.ts`, `ficha-service.ts`, `recortes.test.ts`, `level-up.test.ts`, `ficha.test.ts`); commits `dc640c716`, `59d4bdb6d` y `a7372d5e2` en `git log`.
