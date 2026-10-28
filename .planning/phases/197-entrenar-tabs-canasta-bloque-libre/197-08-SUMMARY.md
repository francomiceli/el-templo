---
phase: 197-entrenar-tabs-canasta-bloque-libre
plan: 08
subsystem: api-sessions
tags: [bloque-libre, aura, cierre, tenancy, manifiesto]
requires: ["197-07"]
provides:
  - POST /api/sessions/free-blocks/complete
  - FreeBlocksService.complete, CompleteFreeBlockInput, CompleteFreeBlockResult
  - completeFreeBlockSchema, completeFreeBlockResponse, CompleteFreeBlockBody
affects: [197-09, 197-14]
key-files:
  created:
    - el-templo-api/test/sessions/free-blocks-complete.test.ts
  modified:
    - el-templo-api/src/modules/sessions/free-blocks-service.ts
    - el-templo-api/src/modules/sessions/free-blocks-routes.ts
    - el-templo-api/src/modules/sessions/schemas.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
requirements: [D-12, D-13, D-14]
---

# Fase 197 Plan 08: Cierre del bloque libre y AURA del día — Summary

`POST /api/sessions/free-blocks/complete` guarda el bloque libre en `extra_blocks_completed` con la duración calculada en el servidor y acredita +5 AURA (`extra_block` / `extra_block_day` / YYYYMMDD local) solo si dura >= 600 s y es el primer cobro del día en la zona de la sede. "Seguir entrenando" (`completionId`) actualiza la misma fila.

## Qué se hizo

- `FreeBlocksService.complete`: `getOne` (404 si no es elegible), ejercicios filtrados a los main del bloque sin duplicados, alta con `tenantValues` o continuación con `tenantWhere` + `userId` + mismo `sourceBlockId`. AURA vía `awardDailyAura` (captura el duplicado con `isDuplicateKeyError`, `log.info`; otro error `log.warn`; en ambos el bloque queda guardado con `auraAwarded: false`). Responde los 4 campos; `auraAvailableToday` se recalcula al final.
- El servicio recibe `AuraService` y `FastifyBaseLogger` (4.º y 5.º parámetro del constructor); la ruta los instancia.
- Ruta POST en el mismo plugin, body cerrado (`additionalProperties: false`, `maxItems: 50`, `blockId` con pattern), manifiesto ISO-01 475 -> 476.
- Batería `free-blocks-complete.test.ts` (9 `it`, corre en CI): guarda, 10' sí, <10' no (cupo intacto), primero sí/segundo no, candado del unique con ledger previo, Seguir entrenando, zona de la sede (02:30 UTC), validaciones (futuro, -5 h, fecha rota, bloque inexistente, GP, completionId de otro socio y de otro bloque, campo extra) y gate.

## Commits

- `8097a81b4` feat(197-08): POST /sessions/free-blocks/complete con AURA del día (D-12/D-13)
- `6d233afa6` test(197-08): cierre del bloque libre y AURA del día

## Verificación (estática)

- Ambos `<verify>` del plan imprimen `OK`. `node --experimental-strip-types --check` sobre los archivos .ts tocados: rc=0. Sin `console.`/`any`, sin `??` mezclado con `||`/`&&`. Sin node_modules: tipos y tests quedan para CI.

## Desvíos/decisiones

- **AURA y flag no son atómicos**: `AuraService.award` abre su propia transacción y no acepta `tx` (fuera de `files_modified`). El flag `aura_awarded` se escribe con un UPDATE justo después. Si ese UPDATE fallara, se loguea `error` y se informa el cobro igual: el unique impide un segundo cobro, solo `auraAvailableToday` quedaría en `true` ese día. Si se quiere atomicidad real, agregar un `tx` opcional a `award` (cambio en el módulo aura).
- **Ventana de 4 h también en "Seguir entrenando"**: con `completionId` no se usa `startedAt` del body (la duración parte de `fila.startedAt`), pero si la fila tiene más de 4 h se responde 400 `"startedAt invalido"`. Sin esto una fila vieja podía cobrar AURA con una duración enorme. `startedAt` solo se valida en el alta.
- `startedAt` futuro (hasta +60 s) se acota a "ahora" (duración 0).
- La AURA de una continuación usa `fila.localDate` (el día del alta), no el de hoy; `auraAvailableToday` de la respuesta es el de hoy.
- Si la fila ya tenía `auraAwarded`, la continuación responde `auraAwarded: false` (no es un cobro nuevo).
- `level` opcional en el body (para `resolveMember`, igual que los GET); no está en el contrato del método `complete`.
- El test fuerza `branches.timezone` de la sede 1 a Buenos Aires en `beforeEach` (otro archivo la cambia a Madrid) y re-siembra `aura_config.extra_block = 5`. En el caso de zona horaria se crea un socio nuevo con el reloj ya movido (el token del `beforeEach` vence a los 30 min).
- Trailer de commits: `Claude Opus 5.5` según el orquestador.

## Bugs encontrados

Ninguno en código previo.

## Para el orquestador / planes siguientes

- 197-09 (invariantes) puede asumir: cierre no escribe `completed_sessions`, racha, programa ni notificación; está verificado por grep en servicio y rutas.
- CI debería confirmar: (a) que `onDuplicateKeyUpdate` sobre `aura_config` con `tenantValues` compile y funcione; (b) que el 400 de Ajv (`additionalProperties`) devuelva 400 y no 500 con el `errorResponseSchema`; (c) que `exercisesCompleted` (json) se lea como array en el SELECT.

## Self-Check: PASSED

Archivo de test presente y commits `8097a81b4` y `6d233afa6` en el log de `feat/197-entrenar`.
