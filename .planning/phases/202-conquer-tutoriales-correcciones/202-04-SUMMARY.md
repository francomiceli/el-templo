---
phase: 202-conquer-tutoriales-correcciones
plan: 04
subsystem: api
tags: [conquer, corrections, video, r2, fastify, drizzle]
requires:
  - phase: 202-conquer-tutoriales-correcciones
    provides: correction-service.ts, correction-schemas.ts y correction-routes.ts del alumno (202-03), private-media con presignGet/head (202-02)
provides:
  - GET /api/members/conquer/corrections/:id/video-url?who=alumno|coach
  - POST /api/members/conquer/corrections/seen
  - member.corrections { pending, unseenReplies } en GET /state
  - resolveCorrectionVideo (reusable por el coach en 202-05)
affects: [202-05, 202-11, 202-12]
tech-stack:
  added: []
  patterns:
    - "Video ausente (clave NULL o objeto vencido) es 200 available false, nunca un error"
    - "Contadores con UNA query: COUNT(CASE WHEN ...) por columna"
key-files:
  created:
    - el-templo-api/test/conquer/corrections-video.test.ts
  modified:
    - el-templo-api/src/modules/conquer/correction-service.ts
    - el-templo-api/src/modules/conquer/correction-schemas.ts
    - el-templo-api/src/modules/conquer/correction-routes.ts
    - el-templo-api/src/modules/conquer/member-service.ts
    - el-templo-api/src/modules/conquer/schemas.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
key-decisions:
  - "who se valida en el servicio, DETRAS del 409 y del 404: un no activo con who invalido recibe 409, una corrección inexistente con who invalido recibe 404"
  - "markRepliesSeen también exige alumno activo (409) igual que el resto de las rutas del alumno"
requirements-completed: [D-26, D-27, D-28, D-29]
duration: 35min
completed: 2026-10-27
---

# Phase 202 Plan 04: Videos, respuestas vistas y contador de correcciones (API del alumno) Summary

**El alumno pide la URL firmada de 300 s de su video o del video del coach (un video borrado o vencido vuelve como `available: false`, sin error), marca sus respuestas como vistas y `GET /state` trae el contador de Inicio.**

## Commits

| Tarea | Commit | Mensaje |
| ----- | ------ | ------- |
| 1 | `1b779850b` | feat(202-04): el alumno ve sus videos y respuestas, y el contador de correcciones en el estado (DA-44, DA-46) |
| 2 | `76aac6c8f` | test(202-04): videos de la corrección, video ausente, respuestas vistas y contador del estado |

## Contratos JSON exactos (para 202-11 y 202-12)

Bajo `/api/members/conquer`, auth del alumno, `moduleScope("templo-training")`. Errores de negocio salen `{ error, code }`;
los 400 de Ajv (id no entero, falta `who`) NO traen `code`.

### `GET /corrections/:id/video-url?who=alumno|coach` -> 200

```ts
{ available: boolean; url: string | null; expiresIn: number | null }
// disponible:  { available: true,  url: "<firmada>", expiresIn: 300 }
// ausente:     { available: false, url: null,        expiresIn: null }
```

Orden: 409 `CONQUER_NO_ACTIVO` -> 404 "Corrección no encontrada" (inexistente, de otro alumno o de otro gimnasio: indistinguibles)
-> 400 `CONQUER_VIDEO_QUIEN_INVALIDO` ("Elegí si querés ver tu video o el del coach") -> storage. `who` es obligatorio (sin él, 400 de Ajv).

- `available: false` cuando: la clave es NULL (`video_key` tras borrado, o `reply_video_key` si el coach respondió solo con texto o la
  corrección sigue pendiente) -> NO toca el storage, anda aun sin bucket; o el `HEAD` da `null` (el objeto venció a los 60 días).
- Con clave y sin bucket privado: 503 `CONQUER_VIDEOS_NO_DISPONIBLES`. Si `head`/`presignGet` fallan: el mismo 503 (el log lleva
  `{ correctionId, errName }`, nunca clave ni URL).
- La URL es de 5 minutos (`PRIVATE_GET_EXPIRES_SEC`) y el store firma con `ResponseCacheControl: "no-store"`.

### `POST /corrections/seen` (sin body, se tolera `{}`) -> 200 `{ "unseenReplies": 0 }`

409 `CONQUER_NO_ACTIVO` si no es activo. UPDATE `reply_seen_at = NOW()` solo de las filas del alumno del token, del gimnasio, con
`status = 'respondida'` y `reply_seen_at IS NULL`. Idempotente y no pisa la fecha de las ya vistas. Las pendientes no se tocan.

### `member.corrections` en `GET /state` (y `POST /unlock-request`, mismo schema)

```ts
member.corrections: { pending: number; unseenReplies: number }
```

Solo cuando `status = activo` (si no, `member` es `null`). `pending` = correcciones `pendiente` del alumno; `unseenReplies` =
`respondida` con `reply_seen_at` NULL. Una sola query extra (`correctionCounts`), sin segundo `loadMemberContext`.

## Helpers para 202-05 (`correction-service.ts`)

```ts
resolveCorrectionVideo(fastify, key: string | null, info: { correctionId: number }): Promise<CorrectionVideoUrl>
getMemberCorrectionVideoUrl(fastify, ctx, userId, correctionId, who: string): Promise<CorrectionVideoUrl>
markRepliesSeen(db, ctx, userId): Promise<{ unseenReplies: 0 }>
correctionCounts(db, ctx, userId): Promise<{ pending: number; unseenReplies: number }>
interface CorrectionVideoUrl { available: boolean; url: string | null; expiresIn: number | null }
interface CorrectionCounts { pending: number; unseenReplies: number }
```

`correction-schemas.ts` exporta `correctionVideoUrlSchema`, `correctionsSeenSchema` y `correctionCountsSchema`. `schemas.ts` importa
`correctionCountsSchema` de `correction-schemas.ts` (que NO importa de `schemas.ts`: sin ciclo). `member-service.ts` importa
`correction-service.ts`: ese grafo no vuelve a `member-service` (verificado, `tsc` limpio).

## Manifiesto y tenancy

- `ENTRADAS_BASELINE`: **519 -> 521** (`GET .../corrections/:id/video-url` y `POST .../corrections/seen`, `templo-module` /
  `templo-training`), título del `it` y comentario fechado 2026-10-27.
- Tenancy sin cambios: 116 gym-owned / 121 schema (sin tablas ni migraciones).

## Tests (escritos, NO corridos: regla del proyecto)

`corrections-video.test.ts` cubre: video del alumno presente (URL de 300 s, `head` y `presignGet` llamados con la clave), video del
coach, ambos `who` sobre la misma corrección, objeto vencido (`head` -> null), `video_key` NULL con y sin bucket (no toca storage),
coach sin `reply_video_key` y corrección pendiente, `it.each` de `who` inválido (4 valores), `who` inválido antes del 503, 404 antes
del 400, falta `who` / id no entero, 503 sin bucket, 503 cuando el storage falla sin filtrar clave ni mensaje, corrección de otro
alumno (404 sin firmar nada, indistinguible de una inexistente), alumno del gimnasio 2 con Conquer activo en SU gimnasio (404),
gimnasio sin módulo (404), `member.corrections` (2 pendientes + 1 sin ver con ruido de otro alumno y una ya vista, ceros, `pedido`
sin `member`), `seen` (solo las del alumno, la pendiente y la de otro sin marca, idempotente y sin pisar la fecha vieja, sin
respuestas, ruta propia sin body y con `{}`, gimnasio 2 no toca el 1), 409 en las 2 rutas (`it.each` sin fila / en pedido), 409 antes
del 400 y 401 en las 2 rutas.

No hubo asserts de objeto exacto sobre `member` en tests existentes (solo `toMatchObject`), así que no se ajustó ninguno.

## Mutantes razonados (aplicados de verdad, `git checkout --` de archivos ya commiteados, `git diff` limpio)

| # | Archivo | Mutante | Lo atrapa |
| - | ------- | ------- | --------- |
| 1 | `correction-service.ts` l.803 | `if (false)` en lugar de `if (head === null)` (se firma sin mirar el HEAD) | `corrections-video.test.ts` l.250-264, "el objeto ya no existe": `toEqual({ available: false, ... })` (l.257-261) y `expect(store.presignGet).not.toHaveBeenCalled()` (l.264) |
| 2 | `correction-service.ts` l.859 | `markRepliesSeen` sin `eq(userId, userId)` | l.550 `expect((await readCorrection(respondidaB)).replySeenAt).toBeNull()` y l.551 (`unseenReplies` de B sigue en 1): marcaría las del otro alumno |
| 3 | `schemas.ts` l.124 | sin `corrections: correctionCountsSchema` en `memberStateSchema` | l.494 `toEqual({ pending: 2, unseenReplies: 1 })` y l.502: el serializador borra la clave, queda `undefined` |
| 4 | `correction-service.ts` l.837 | `who=coach` lee `row.videoKey` | l.218-219 (la URL del coach debe contener `replyKey` y no `claveAlumno`), l.244-245, y los casos "coach sin `reply_video_key`" / "pendiente" (`available` false, `head` sin llamar) |
| 5 | `correction-service.ts` l.861 | quita `isNull(replySeenAt)` del UPDATE | l.580 `expect((await readCorrection(yaVista)).replySeenAt).toEqual(antes)`: la respuesta vista hace 3 días pasaría a `NOW()` (determinista, no depende del redondeo al segundo) |

## Desvíos del plan

- Ninguno de contenido.
- `markRepliesSeen` y `getMemberCorrectionVideoUrl` reusan `assertActive` (privada de 202-03, mismo archivo) en lugar de `loadMemberContext`:
  no carga catálogo ni puede escribir escalones.
- Para probar el aislamiento entre gimnasios con el módulo prendido, el test inserta DIRECTO una fila `conquer_members` `activo` del
  gimnasio 2 (`tenantValues({ tenantId: TENANT_DOS }, ...)`); sin eso un alumno del gimnasio 2 recibe 409 antes de llegar al 404.
- El plan fechaba el comentario del manifiesto 2026-10-23; se usó la fecha real (2026-10-27).

## Ambigüedades nuevas (opción más simple adoptada)

1. `POST /corrections/seen` para un no activo es 409 (como el resto de las rutas del alumno), no 200 vacío.
2. `GET video-url` de una corrección pendiente con `who=coach` es 200 `available: false` (no 404 ni 409).

## Trampas para los próximos ejecutores

1. **`resolveCorrectionVideo` es el único lugar que firma videos de corrección**: 202-05 lo reusa para el coach con `video_key` del
   alumno y `reply_video_key`; el coach NO pasa por `getMemberCorrectionVideoUrl` (filtra por `userId` del token). Pasar siempre
   `{ correctionId }` como `info`.
2. `resolveCorrectionVideo` llama `privateMediaResolver.resolve(fastify, "videos")` DESPUÉS del chequeo de clave NULL: con clave NULL
   anda sin bucket (y el test lo exige). No mover el `resolve` arriba.
3. `who` se compara por igualdad estricta (`alumno` / `coach`, minúsculas). El app (202-11/12) debe mandar exactamente esas dos.
4. El app NO debe tratar `available: false` como error: es "ya no está disponible" (D-28). Un 503 sí es error de red/servicio.
5. `member.corrections` existe solo con `status = activo`; el app debe leerlo con `member?.corrections` y el store debería actualizarlo
   tras `POST /corrections/seen` (poner `unseenReplies` en 0) y tras crear una corrección (`pending + 1`) o releer `GET /state`.
6. Mock de video en tests: `mockPrivateMedia({ head: vi.fn(...), presignGet: vi.fn(...) })` y pisar `head` (el default es `image/jpeg`).
   `vi.stubEnv("R2_PRIVATE_BUCKET_NAME", "")` sin mock da el 503 de videos.
7. `insertConquerCorrection(app, userId, { videoKey: null, videoDeletedAt: new Date() })` para el video borrado; con
   `status: "respondida"` hay que pasar también `replyText` o `replyVideoKey` y `repliedAt`.
8. Manifiesto de rutas hoy: **521**. Tenancy: 116 gym-owned / 121 schema.

## Known Stubs

Ninguno.

## Self-Check: PASSED

- Archivos creados/modificados presentes; commits `1b779850b` y `76aac6c8f` en `git log`.
- Gates: `npx tsc --noEmit` OK, `pnpm lint:tenant` rc 0 (DISCREPANCIAS 0), `pnpm typecheck:tests` filtrado sin salida, higiene (`any`,
  `console`) vacía, prettier OK sobre los archivos propios. Tests escritos y NO corridos.
