---
phase: 202-conquer-tutoriales-correcciones
plan: 06
subsystem: api
tags: [conquer, corrections, video, r2, fastify, drizzle, admin]
requires:
  - phase: 202-conquer-tutoriales-correcciones
    provides: AdminCorrectionView / loadAdminCorrection (202-05), claves y checkUploadedVideo (202-02), CorrectionUploadResult (202-03)
provides:
  - POST /api/admin/conquer/corrections/:id/reply-upload-url
  - POST /api/admin/conquer/corrections/:id/reply
  - confirmCorrectionVideo (confirmacion HEAD compartida alumno y coach)
  - mockVideoStore en test/conquer/_helpers.ts
affects: [202-09, 202-10]
tech-stack:
  added: []
  patterns:
    - "Una sola confirmacion de video (HEAD + tipo/tamano + remove) para alumno y coach"
    - "Respuesta final: FOR UPDATE de la correccion + UPDATE con WHERE status = 'pendiente' en la misma tx"
key-files:
  created:
    - el-templo-api/test/conquer/corrections-reply.test.ts
  modified:
    - el-templo-api/src/modules/conquer/correction-admin-service.ts
    - el-templo-api/src/modules/conquer/correction-service.ts
    - el-templo-api/src/modules/conquer/correction-schemas.ts
    - el-templo-api/src/modules/conquer/correction-routes.ts
    - el-templo-api/test/conquer/_helpers.ts
    - el-templo-api/test/conquer/corrections-admin.test.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
key-decisions:
  - "confirmUploadedVideo (privado, por userId) pasa a confirmCorrectionVideo(fastify, store, key, info) exportado; removeQuietly recibe el mismo info"
  - "El coach que pierde la carrera NO borra su objeto: su clave pudo ser la misma que la del ganador (se confia en la regla de 60 dias)"
  - "key vacia ('') se trata como ausente; sin key, durationSec se ignora"
duration: 35min
completed: 2026-10-27
---

# Phase 202 Plan 06: Respuesta del coach a una correccion Summary

**El coach responde una correccion pendiente con texto, con un video propio de hasta 30 s o con los dos: URL firmada atada a (gimnasio, alumno, correccion), confirmacion HEAD compartida con el alumno y escritura final dentro de una tx con la fila bloqueada.**

## Commits

| Task | Commit | Mensaje |
| ---- | ------ | ------- |
| 1 | `85a2a6277` | feat(202-06): el coach responde con texto y/o video de 30 s (D-26, DA-43) |
| 2 | `be619ebf6` | test(202-06): respuesta del coach: texto, video, validacion, concurrencia y aislamiento |

## Contratos JSON (para 202-10)

Ambas rutas: guard `canManageConquer` en `onRequest` (owner/admin; el resto 403 aun con body invalido), `:id` entero.

### `POST /api/admin/conquer/corrections/:id/reply-upload-url`

Body `{ contentType: string }` (`video/mp4` o `video/quicktime`; el valor lo valida el servicio).
200 (mismo contrato que la del alumno, `CorrectionUploadResult`):
`{ uploadUrl, key, contentType, expiresIn: 600, maxBytes: 104857600 }`. La `key` es
`private/conquer-corrections/{tenant}/{alumno}/coach-{correctionId}-{uuid}.{mp4|mov}`. El navegador del admin
hace `PUT uploadUrl` con `Content-Type: contentType` y luego llama a `/reply` con esa `key`.

Orden de errores: 404 (no es del gimnasio) -> 409 `CONQUER_CORRECCION_RESPONDIDA` ("Esta correccion ya tiene respuesta")
-> 503 `CONQUER_VIDEOS_NO_DISPONIBLES` (sin bucket o el SDK falla) -> 400 `CONQUER_VIDEO_TIPO_INVALIDO`.
Body sin `contentType` o de otro tipo JSON: 400 de Ajv (sin `code`).

### `POST /api/admin/conquer/corrections/:id/reply`

Body plano `{ text?: string | null, key?: string | null, durationSec?: number | null }`.
200: `AdminCorrectionView` completa (la de 202-05) ya con `status: "respondida"`, `canReply: false`,
`repliedByName` = nombre de pila del actor y `reply: { text, hasVideo, videoSeconds, repliedAt }`. No trae claves.
El admin reemplaza su item con esa respuesta.

Orden de errores (todos `{ error, code }` salvo Ajv):
404 -> 409 `CONQUER_CORRECCION_RESPONDIDA` -> 400 `CONQUER_RESPUESTA_LARGA` (texto > 1000 tras recortar) ->
400 `CONQUER_RESPUESTA_VACIA` ("Escribi una respuesta o subi un video": sin texto ni key) ->
(si hay key) 400 `CONQUER_VIDEO_DURACION` (entero 1..30; ausente tambien) -> 503 `CONQUER_VIDEOS_NO_DISPONIBLES` ->
400 `CONQUER_VIDEO_CLAVE_INVALIDA` -> 409 `CONQUER_VIDEO_NO_SUBIDO` (HEAD null) -> 400 `CONQUER_VIDEO_INVALIDO`
(vacio/pesado/tipo; borra el objeto) -> tx: 409 `CONQUER_CORRECCION_RESPONDIDA` si otro coach gano la carrera.
Solo texto no toca el storage (funciona sin bucket). Efectos en la fila: `status='respondida'`, `reply_text`,
`reply_video_key`, `reply_video_seconds`, `replied_by` = actor, `replied_at = NOW()`, `reply_seen_at = NULL`.
El video del alumno NO se toca. Textos y errores de Ajv (p. ej. `text` no string): 400 sin `code`.

Manifiesto: 525 -> 527 (`ENTRADAS_BASELINE`, titulo y comentario del 2026-10-27, plan 202-06).

## Mutantes razonados (aplicados, leidos contra el test, revertidos; `git status` limpio)

Lineas de `el-templo-api/test/conquer/corrections-reply.test.ts`.

1. **Sin el chequeo de `pendiente` dentro de la tx** (`lockPendingCorrection`, quitar el `throw alreadyRepliedError()`):
   el UPDATE sigue con `WHERE status='pendiente'`, asi que el perdedor no escribe pero responde 200 con la vista del
   ganador. Falla `expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409])` (l.913): daria `[200, 200]`. La carrera es
   determinista: el `head` mock tiene una barrera que suelta cuando llegaron las dos peticiones, o sea las dos ya pasaron el
   chequeo temprano de `pendiente` y solo las separa el `FOR UPDATE`.
2. **Aceptar la clave del alumno como respuesta** (`isCorrectionReplyKey(...) && !isOwnCorrectionVideoKey(...)` en el guard):
   fallan los casos `it.each(CASOS)` "clave del ALUMNO" (l.658) y "texto valido + clave invalida", en
   `expect(res.statusCode).toBe(400)` (l.707): el HEAD mock existe, daria 200.
3. **No resetear `reply_seen_at`** (quitar `replySeenAt: null` del SET): el caso se detecta con el test agregado
   "responder deja la respuesta como NO vista aunque la fila trajera un reply_seen_at" (l.455): inserta la pendiente con
   `replySeenAt` no nulo y afirma `replySeenAt` NULL (l.462) y `unseenReplies` 1. Sin ese test el mutante sobrevive, porque
   una pendiente normal ya tiene `reply_seen_at` NULL.
4. **Sin filtro de tenant en la lectura** (`loadCorrectionRows`: quitar `tenantWhere(c, ctx)` y el de la join a `users`):
   el admin del gimnasio 2 deja de recibir 404; falla `expect(subida.statusCode).toBe(404)` (l.1048) y los de `reply`.
   **Mutante equivalente (documentado, no atrapable):** el `tenantWhere` del UPDATE y el del `SELECT ... FOR UPDATE` de la
   tx. El plan esperaba que el test de aislamiento los matara, pero el 404 sale ANTES (`loadAdminCorrection`) y los ids son
   unicos globalmente, asi que sacarlos no cambia ningun resultado observable. Quedan como defensa en profundidad y para
   `lint:tenant`.

## Deviations from Plan

### Auto-fixed / ajustes

**1. [Rule 3 - DRY, regla de 202-05] `mockVideoStore` movido a `_helpers.ts`**
- **Found during:** Task 2. La leccion de 202-05 pide mover (no duplicar) el helper local de `corrections-admin.test.ts` si otro plan lo necesita.
- **Fix:** `mockVideoStore` + `VideoStoreSpies` exportados desde `test/conquer/_helpers.ts`, ahora con espia de `presignPut` (y `overrides.presignPut`); `corrections-admin.test.ts` lo importa (se quito su import ya sin uso de `PrivateMediaStore`/`mockPrivateMedia`). Archivos fuera de `files_modified`: `_helpers.ts` y `corrections-admin.test.ts`.
- **Commit:** `be619ebf6`

**2. [Plan] `confirmCorrectionVideo`:** la confirmacion existia como `confirmUploadedVideo` privada con `userId`; se exporto con `info: VideoStoreInfo` (`{ correctionId?, userId? }`) y `removeQuietly` recibe el mismo `info` (loguea ids, nunca la clave). `checkUploadedVideo(` queda llamado en un solo lugar. Comportamiento del alumno idéntico.

**3. [Decision] Perdedor de la carrera no borra su objeto:** el plan no lo definia. Borrar podria destruir el video del ganador si ambos usaron la misma clave. El objeto huerfano lo vence la regla de 60 dias (DA-38).

**4. [Ambiguedad nueva, opcion simple]** `key: ""` se trata como ausente; el schema Ajv del body de `/reply` permite `text/key/durationSec` nulos; `key` con `maxLength: 255`.

Fuera de eso, el plan se ejecuto como estaba escrito.

## Gates

`npx tsc --noEmit` OK, `pnpm lint:tenant` DISCREPANCIAS 0, `pnpm typecheck:tests` sin errores en archivos del plan (la deuda
preexistente ajena sigue: 11 nuevos / 1 empeorado en `attendance`, `combos-generator`, `analytics`, etc., no tocados aca),
`prettier --check` OK, greps de higiene vacios. Tests escritos, NO corridos (regla del proyecto: corren en CI).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno nuevo: las 2 rutas estan en el modelo de amenazas del plan (T-201-136..139) y en el manifiesto.

## Self-Check: PASSED
