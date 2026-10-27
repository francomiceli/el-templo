---
phase: 202-conquer-tutoriales-correcciones
plan: 03
subsystem: api
tags: [conquer, corrections, video, r2, fastify, drizzle]
requires:
  - phase: 202-conquer-tutoriales-correcciones
    provides: tablas conquer_corrections (202-01), video-rules.ts y private-media.ts con claves y remove (202-02)
provides:
  - GET /api/members/conquer/corrections (lista, objetivos y topes)
  - POST /api/members/conquer/corrections/upload-url (URL firmada al bucket privado)
  - POST /api/members/conquer/corrections (HEAD, tope en tx con lock, alta)
  - loadCorrectionRows, toCorrectionView, callVideoStore, listCorrectionTargets (reusables por el coach)
affects: [202-04, 202-05, 202-06, 202-11]
tech-stack:
  added: []
  patterns:
    - "Rutas de un submódulo en archivo propio: registerXRoutes(fastify) llamado con una línea desde member-routes"
    - "Validaciones de valores en el servicio (no enum/maxLength en el JSON-schema) para que queden detrás de 409/503"
key-files:
  created:
    - el-templo-api/src/modules/conquer/correction-service.ts
    - el-templo-api/src/modules/conquer/correction-schemas.ts
    - el-templo-api/src/modules/conquer/correction-routes.ts
    - el-templo-api/test/conquer/corrections-member.test.ts
  modified:
    - el-templo-api/src/modules/conquer/member-routes.ts
    - el-templo-api/test/conquer/_helpers.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
key-decisions:
  - "Un HEAD invalido (vacio, pesado, tipo) y el tope perdido en la tx borran el objeto con removeQuietly (best-effort, log.warn con el NOMBRE del error): la respuesta es la del error de negocio y no un 503"
  - "Una clave repetida que gana el UNIQUE en una carrera es 409 YA_USADO y NO borra el objeto (pertenece a la otra corrección)"
  - "GET usa loadMemberContext (409 si no es activo); upload-url usa una lectura liviana del estado de conquer_members (sin cargar el catálogo)"
requirements-completed: [D-26, D-27, D-29, D-08]
duration: 70min
completed: 2026-10-27
---

# Phase 202 Plan 03: API del alumno para correcciones con video Summary

**Tres rutas del alumno (lista + objetivos + topes, URL firmada y alta) con tipo, tamaño, duración, objetivo y tope de 3 hechos cumplir por el servidor, y los helpers de lectura que reusa el coach.**

## Commits

| Tarea | Commit | Mensaje |
| ----- | ------ | ------- |
| 1 | `e3e58ba52` | feat(202-03): el alumno manda su video de corrección (lista, URL firmada y alta, D-26, DA-41, DA-42) |
| 2 | `915a0f87b` | test(202-03): correcciones del alumno: objetivos, subida, tope, validación y aislamiento |

## Contratos JSON exactos (para 202-11)

Todas bajo `/api/members/conquer`, auth del alumno, `moduleScope("templo-training")`. Errores de negocio salen
`{ error, code }` (los 400 de Ajv NO traen `code`).

### `GET /corrections` -> 200

```json
{
  "items": [CorrectionView],
  "targets": [CorrectionTarget],
  "limits": { "pending": 0, "pendingMax": 3, "maxSeconds": 30, "maxBytes": 104857600, "commentMax": 500 }
}
```

- `items`: las 50 más nuevas (`created_at` DESC, `id` DESC), de todos los estados.
- `limits.pending` = pendientes REALES (query aparte, no sale de `items`).
- No toca storage: anda sin bucket. 409 `CONQUER_NO_ACTIVO` si el socio no tiene Conquer activo.

```ts
CorrectionTarget = {
  key: string            // "escalon:{exerciseId}:{step}" | "combo:{comboKey}"
  kind: "escalon" | "combo"
  exerciseId: number | null
  step: "e1" | "e2" | "e3" | "hold" | null
  comboKey: string | null          // plancha|front|vertical|dominadas|push|pull
  group: string                    // nombre del ejercicio | "Combos"
  label: string                    // "Escalón 2 · {peldaño actual}" | "Hold final" | "Combo Push"
}
CorrectionView = {
  id: number
  kind: "escalon" | "combo"
  targetLabel: string              // "{ejercicio} · {Escalón N} · {peldaño guardado}" | "Combo {label}"
  comment: string | null
  durationSec: number
  createdAt: string                // ISO
  status: "pendiente" | "respondida"
  videoDeleted: boolean            // video_deleted_at no NULL
  reply: { text: string | null; hasVideo: boolean; videoSeconds: number | null; repliedAt: string } | null
  replyUnseen: boolean             // respondida y reply_seen_at NULL
}
```

Orden de `targets`: por día del plan, por ejercicio (sin repetir), e1 e2 e3 hold; después, solo si es Espartano, los 6 combos
en el orden de `COMBO_KEYS`. Un Espartano de 4 días trae 12 ejercicios x 4 + 6 = 54; un Centurión de 3 días, 9 x 4 = 36 sin combos.

### `POST /corrections/upload-url`  body `{ contentType: string }` -> 200

```json
{ "uploadUrl": "https://...", "key": "private/conquer-corrections/1/{userId}/alumno-{uuid}.mp4", "contentType": "video/mp4", "expiresIn": 600, "maxBytes": 104857600 }
```

Orden: 409 `CONQUER_NO_ACTIVO` -> 409 `CONQUER_CORRECCIONES_TOPE` ("Ya tenés 3 videos esperando respuesta") -> 503
`CONQUER_VIDEOS_NO_DISPONIBLES` -> 400 `CONQUER_VIDEO_TIPO_INVALIDO` ("Solo se aceptan videos MP4 o MOV"). El PUT del archivo lleva
EXACTAMENTE el `Content-Type` pedido (la URL lo firma).

### `POST /corrections`  body -> 201 `CorrectionView`

```ts
{ exerciseId?: number | null, step?: string | null, comboKey?: string | null, comment?: string | null,
  key: string /* 1..255 */, durationSec: number /* el servicio exige entero 1..30 */ }
```

El objetivo es EXACTAMENTE uno: `exerciseId` + `step`, o `comboKey`. Códigos, en orden de evaluación:

| Orden | Status | code | Cuándo |
| ----- | ------ | ---- | ------ |
| 1 | 409 | `CONQUER_NO_ACTIVO` | sin Conquer activo |
| 2 | 400 | `CONQUER_CORRECCION_OBJETIVO_INVALIDO` | "Elegí un escalón de tu plan": ninguno, ambos, `step` fuera de e1..hold, ejercicio fuera de su plan, combo inexistente o para no-Espartano |
| 3 | 400 | `CONQUER_CORRECCION_COMENTARIO_LARGO` | comentario recortado > 500 (vacío -> NULL) |
| 4 | 400 | `CONQUER_VIDEO_DURACION` | no entero o fuera de 1..30 |
| 5 | 503 | `CONQUER_VIDEOS_NO_DISPONIBLES` | sin bucket privado o storage caído |
| 6 | 400 | `CONQUER_VIDEO_CLAVE_INVALIDA` | la clave no es `alumno-{uuid}` de ESE gimnasio y alumno |
| 7 | 409 | `CONQUER_VIDEO_YA_USADO` | otra corrección ya usa la clave |
| 8 | 409 | `CONQUER_VIDEO_NO_SUBIDO` | HEAD `null` ("Todavía no se subió el video") |
| 9 | 400 | `CONQUER_VIDEO_INVALIDO` | HEAD vacío, > 100 MB o tipo no MP4/MOV: se BORRA el objeto |
| 10 | 409 | `CONQUER_CORRECCIONES_TOPE` | 3 pendientes (dentro de la tx con lock): se BORRA el objeto |

Body que no es objeto, sin `key` o sin `durationSec`: 400 de Ajv sin `code`. Claves extra (p. ej. `userId`) se descartan.

## Helpers para 202-04..06 (`correction-service.ts`)

```ts
loadCorrectionRows(db, ctx, where: { userId?: number; id?: number; status?: "pendiente"|"respondida"; limit: number; order: "asc"|"desc" }): Promise<CorrectionRow[]>
toCorrectionView(row: CorrectionRow): CorrectionView
callVideoStore<T>(fastify, info: { correctionId?: number; userId?: number }, call: () => Promise<T>): Promise<T>   // tira VideoStorageUnavailableError
listCorrectionTargets(ctx: MemberContext): CorrectionTarget[]
getMemberCorrections(db, ctx, userId): Promise<CorrectionsResponse>
requestCorrectionUpload(fastify, ctx, userId, contentType): Promise<CorrectionUploadResult>
createCorrection(fastify, ctx, userId, body: CreateCorrectionBody): Promise<CorrectionView>
MEMBER_CORRECTIONS_LIMIT = 50
```

`CorrectionRow` (una sola query con join a `users`, `conquer_members`, `conquer_exercises`, `conquer_rungs` y `users` del coach, TODOS con
`tenantWhere`): `id, userId, firstName, lastName, level, exerciseName, exerciseId, step, comboKey, rungName, comment, videoKey, videoSeconds,
videoDeletedAt, status, replyText, replyVideoKey, replyVideoSeconds, repliedAt, repliedByFirstName, replySeenAt, createdAt`.
`firstName`/`lastName` son `string | null` (`users` los admite NULL) y `level` es `Level | null`. Las fechas son `Date`.

## Manifiesto de rutas y tenancy

- `ENTRADAS_BASELINE` (`test/tenancy/iso-01-manifiesto.test.ts`): **516 -> 519** (3 rutas `templo-module` / `templo-training`), título
  del `it` ("exactamente las 519 entradas") y comentario fechado 2026-10-26 actualizados.
- Tenancy sin cambios: 116 gym-owned / 121 en schema (este plan no agrega tablas ni migraciones).

## Tests (escritos, NO corridos: regla del proyecto)

`corrections-member.test.ts` cubre: GET (Espartano 54 objetivos con combos / Centurión sin combos / etiquetas / orden / respondida con
`replyUnseen` / video borrado / combo / `limits.pending` / tope de 50, todo sin mockear storage), upload-url (mp4 y mov, `it.each` de tipos
inválidos, 503 sin bucket, storage que falla sin filtrar claves), alta (escalón E2 con `rung_id`, combo, comentario recortado y vacío, `.mov`,
`userId` del body descartado), objetivos inválidos (`describe.each` de 7 casos + ejercicio ajeno + combo para Centurión + validación antes del
503), duración (`it.each` 0, 31, 12.5, -3, 3600 y bordes 1, 30), comentario 501/500, HEAD (`null`, `it.each` de 4 HEAD inválidos que afirman
`remove`, 100 MB exactos, HEAD que falla), claves (`it.each` de 6 claves ajenas/mal formadas, misma clave dos veces), tope (409 en upload-url y
POST con borrado, 2+1 pasa, carrera de dos POST con `Promise.all`), no activo (`it.each` sin fila / en pedido, 3 rutas), aislamiento
(mismo gimnasio, tope por alumno, gimnasio 2 sin módulo = 404 y con módulo = 409 sin filas ajenas) y 401 / cuerpos inválidos.

## Mutantes razonados (aplicados de verdad, compilaban, revertidos con `cp` y `diff` limpio)

| # | Archivo | Mutante | Lo atrapa |
| - | ------- | ------- | --------- |
| 1 | `correction-service.ts` l.643 | sin `removeQuietly` en el HEAD inválido | `corrections-member.test.ts` l.888-889 `expect(remove).toHaveBeenCalledTimes(1)` / `toHaveBeenCalledWith(key)` en el `it.each` de HEAD inválidos (4 casos fallan) |
| 2 | `correction-service.ts` l.672 | sin `lockActiveMember` al abrir la tx (conteo sin serializar) | l.1104 `[201, 409]` y l.1112 `toHaveLength(3)` del caso de dos POST a la vez: dos tx cuentan 2 y las dos insertan (4 pendientes). Con el lock, la 2ª tx espera al commit de la 1ª; como el `FOR UPDATE` es una lectura con bloqueo no abre el snapshot de REPEATABLE READ, y el `count` posterior (primera lectura consistente) ve las 3. OJO: sin lock la carrera es probabilística, el test puede pasar por suerte en una corrida; con lock es determinista |
| 3 | `correction-service.ts` l.230 | combos para todos los niveles (`if (true)`) | l.309 `expect(body.targets.some(kind === "combo")).toBe(false)` del Centurión; también `toHaveLength(codes.size * 4)` y el 400 del combo para novillo |
| 4 | `correction-service.ts` l.389 | `loadCorrectionRows` sin filtro `userId` | l.1172 `expect(listaA.items...).toEqual([deA])` (veía la corrección de B) y `listaB.items` `toHaveLength(1)` |
| 5 | `correction-service.ts` l.683 | tope `>` en vez de `>=` | l.1067 `expect(res.statusCode).toBe(409)` del test "con 3 pendientes, POST es 409 TOPE" (l.1054): da 201 y no 409 |

## Desvíos del plan

- **Ninguno de contenido.** Notas menores:
- `getMemberCorrections(db, ctx, userId)` recibe `db`, no `fastify` (el plan no fijaba la firma; no usa storage).
- `upload-url` NO usa `loadMemberContext` (cargaría catálogo y podría escribir escalones): hace una lectura liviana de `conquer_members.status`
  y devuelve el mismo 409 `CONQUER_NO_ACTIVO` con el mismo copy que `history-loader` (quedó una segunda copia del mensaje de 3 líneas; no
  exporté `noActivoError` para no tocar archivos fuera de `files_modified`).
- Para cumplir el `! grep oneOf` del verify, el comentario de `correction-schemas.ts` no nombra esa palabra (lección 8 de 202-02).
- Fecha del comentario del manifiesto: 2026-10-26 (hoy) y no 2026-10-23 como decía el texto del plan.
- `prettier --write` solo sobre rutas explícitas de archivos nuevos o míos (`_helpers.ts` quedó con diff solo de lo propio).

## Ambigüedades nuevas (opción más simple adoptada)

1. Si `remove` falla al limpiar un HEAD inválido o el tope, NO se convierte en 503: se loguea `warn` y se responde el error de negocio; el
   objeto lo vence la regla de 60 días (T-201-128 ya lo acepta). El 503 por `remove` sigue reservado al borrado explícito de 202-04 (DA-45).
2. Duración no entera (12.5) es 400, como dice DA-40 (el cliente redondea); el schema declara `number`, no `integer`, para que el 400 traiga `code`.

## Trampas para los próximos ejecutores

1. **`firstName`/`lastName` de `CorrectionRow` son `string | null`**. 202-05 tiene que armar el nombre con `?? ""` (como el tablero).
2. `toCorrectionView` es la vista del ALUMNO. No expone claves de video ni nombre del coach; 202-05 arma su vista con la misma fila.
3. `loadCorrectionRows` con `{ id }` NO filtra por alumno salvo que se pase `userId`: las rutas del alumno de 202-04 (video-url, seen) DEBEN
   pasar `userId` junto con `id`, o un alumno podría pedir la corrección de otro (404 si no vuelve fila).
4. `callVideoStore` loguea `{ correctionId | userId, errName }`: para `presignGet`/`head`/`remove` de 202-04..06 pasar `{ correctionId }`.
   `privateMediaResolver.resolve(fastify, "videos")` se llama FUERA de `callVideoStore` (tira el 503 por sí mismo).
5. El INSERT de la corrección es la única escritura del plan: lleva `status: "pendiente" as const`; `reply_*`, `replied_*` y `reply_seen_at`
   quedan NULL. 202-05 (responder) tiene que setear `status = "respondida"` en la MISMA update que `reply_*`, con `WHERE status = 'pendiente'`
   (una respuesta, final: DA-43) para que dos coaches a la vez no pisen.
6. Contar pendientes: `countPending` (lectura) y el conteo dentro de `insertCorrection` (con lock). Si 202-04 necesita el contador de Inicio
   (`member.corrections = { pending, unseenReplies }`), hacerlo con UNA query más en `getConquerState`, sin otro `loadMemberContext`.
7. Helpers de test nuevos en `_helpers.ts`: `CONQUER_CORRECTIONS_URL`, `insertConquerCorrection(app, userId, overrides)` (escalón E1 del plan por
   defecto con su `rungId`; con `comboKey` va sin escalón; `videoKey: null` + `videoDeletedAt` para el borrado) y `postCorrectionRaw(app, token, body)`
   (OJO: lleva `app` primero). Para claves válidas sin pasar por upload-url: `privateCorrectionVideoKey({ tenantId: 1, userId, contentType })`.
8. Los tests de video mockean con `mockPrivateMedia({ head: async () => ({ contentLength, contentType: "video/mp4" }), remove: vi.fn<PrivateMediaStore["remove"]>(...) })`;
   el `head` por defecto del mock es JPG y da 400 `CONQUER_VIDEO_INVALIDO`.
9. Un gimnasio con `templo-training` prendido pero sin fila `conquer_members` recibe 409 `CONQUER_NO_ACTIVO` (no 404) en estas rutas; sin el
   módulo, 404 del guard.
10. Manifiesto de rutas hoy: **519**. Tenancy: 116 gym-owned / 121 schema. Siguiente número libre de migración: ninguno usado por este plan.

## Known Stubs

Ninguno.

## Self-Check: PASSED

- `correction-service.ts`, `correction-schemas.ts`, `correction-routes.ts`, `corrections-member.test.ts`: presentes.
- Commits `e3e58ba52` y `915a0f87b`: presentes en `git log`.
- Gates: `npx tsc --noEmit` OK, `pnpm lint:tenant` (rc 0, DISCREPANCIAS 0), `pnpm typecheck:tests` filtrado sin salida, higiene (`any`, `console`) vacía, `schemas.ts` sin cambios, prettier OK.
