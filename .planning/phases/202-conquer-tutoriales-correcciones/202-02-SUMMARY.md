---
phase: 202-conquer-tutoriales-correcciones
plan: 02
subsystem: api
tags: [conquer, r2, video, storage, pure-module]
requires:
  - phase: 202-conquer-tutoriales-correcciones
    provides: tablas conquer_corrections y conquer_tutorials (202-01)
provides:
  - video-rules.ts, módulo puro con topes y reglas de video y texto (DA-39, DA-40, DA-42, DA-43)
  - private-media.ts con claves de corrección, 503 propio de videos, remove y resolve(fastify, purpose)
  - mockPrivateMedia con remove
affects: [202-03, 202-04, 202-05, 202-06, 202-07]
tech-stack:
  added: []
  patterns:
    - "resolve(fastify, 'videos') fail-closed: nunca r2Bucket"
key-files:
  created:
    - el-templo-api/src/modules/conquer/video-rules.ts
    - el-templo-api/test/unit/conquer-video-rules.test.ts
  modified:
    - el-templo-api/src/modules/conquer/private-media.ts
    - el-templo-api/test/unit/conquer-private-media.test.ts
    - el-templo-api/test/conquer/_helpers.ts
key-decisions:
  - "isVideoContentType usa hasOwnProperty para que 'constructor' o '__proto__' no pasen como tipo"
  - "remove re-tira todo error que no sea 'no existe'; quien llama lo convierte en 503 sin loguear la clave"
duration: 25min
completed: 2026-10-26
---

# Phase 202 Plan 02: Reglas de video y almacenamiento privado de videos Summary

**Módulo puro `video-rules.ts` con todos los topes de video/texto de Conquer y `private-media.ts` ampliado con claves `private/conquer-corrections/...`, borrado de objetos y un 503 propio para videos, sin tocar el flujo de fotos.**

## Commits

| Task | Commit | Mensaje |
| ---- | ------ | ------- |
| 1 | `f616c90bb` | feat(202-02): reglas de video de Conquer en un módulo puro (DA-39, DA-40, DA-42, DA-43) |
| 2 | `6f9dc1146` | feat(202-02): almacenamiento privado de videos de correcciones (claves, borrado y 503 propio, DA-38) |

## Contratos exactos

`el-templo-api/src/modules/conquer/video-rules.ts` (cero imports):

```ts
CORRECTION_VIDEO_MAX_SECONDS = 30
CORRECTION_VIDEO_MAX_BYTES   = 100 * 1024 * 1024   // 104857600
CORRECTION_PENDING_MAX       = 3
CORRECTION_COMMENT_MAX       = 500
CORRECTION_REPLY_MAX         = 1000
TUTORIAL_VIDEO_MAX_BYTES     = 200 * 1024 * 1024   // 209715200
TUTORIAL_CONTENT_TYPE        = "video/mp4"
VIDEO_EXTENSION_BY_CONTENT_TYPE = { "video/mp4": "mp4", "video/quicktime": "mov" } as const
type VideoContentType = keyof typeof VIDEO_EXTENSION_BY_CONTENT_TYPE
VIDEO_CONTENT_TYPES: VideoContentType[]            // ["video/mp4", "video/quicktime"]
isVideoContentType(value: string): value is VideoContentType
type UploadedVideoCheck = "ok" | "vacio" | "pesado" | "tipo"
checkUploadedVideo(head: { contentLength: number; contentType: string },
                   maxBytes: number, allowed: readonly string[]): UploadedVideoCheck
isValidVideoSeconds(value: unknown): value is number      // entero 1..30
type NormalizedText = { ok: true; value: string | null } | { ok: false }
normalizeText(value: unknown, max: number): NormalizedText
STEP_LABELS = { e1: "Escalón 1", e2: "Escalón 2", e3: "Escalón 3", hold: "Hold final" } as const
```

`el-templo-api/src/modules/conquer/private-media.ts` (lo nuevo):

```ts
CORRECTION_KEY_PREFIX = "private/conquer-corrections"
privateCorrectionVideoKey({ tenantId, userId, contentType: VideoContentType }): string
  // private/conquer-corrections/{tenant}/{user}/alumno-{uuid}.{mp4|mov}
privateCorrectionReplyKey({ tenantId, userId, correctionId, contentType }): string
  // private/conquer-corrections/{tenant}/{user}/coach-{correctionId}-{uuid}.{mp4|mov}
isOwnCorrectionVideoKey(key, tenantId, userId): boolean
isCorrectionReplyKey(key, tenantId, userId, correctionId): boolean
class VideoStorageUnavailableError extends AppError  // 503, CONQUER_VIDEOS_NO_DISPONIBLES,
                                                      // "Los videos no están disponibles por ahora"
type PrivateMediaPurpose = "fotos" | "videos"
privateMediaResolver.resolve(fastify, purpose: PrivateMediaPurpose = "fotos"): PrivateMediaStore
PrivateMediaStore.remove(key: string): Promise<void>   // DeleteObjectCommand, "no existe" ignorado
```

`mockPrivateMedia(overrides)` ahora trae `remove: async () => undefined` por defecto (pasar `remove: vi.fn(...)` para
afirmar el borrado). El `head` por defecto sigue siendo una foto JPG de 1 KB: los tests de video deben pisarlo con
`head: async () => ({ contentLength: ..., contentType: "video/mp4" })`.

## Desvíos del plan

Ninguno de fondo. Detalles:

- `isVideoContentType` usa `Object.prototype.hasOwnProperty.call` (no `in`) para no aceptar claves del prototipo.
- El docblock de `video-rules.ts` evita escribir literalmente las palabras `enum`/`namespace`/`class` porque el verify del
  plan hace `! grep -E "\benum\b|\bnamespace\b|\bclass\b"` sobre el archivo SIN filtrar comentarios.
- Tests extra a los pedidos: `remove` (manda `DeleteObjectCommand` al bucket privado, `it.each` de NotFound/NoSuchKey/404
  ignorados, otro error re-tirado), prefijos comunes (tenant 1 vs 11, alumno 7 vs 77, corrección 3 vs 33 vs 333), clave con
  prefijo delante y tipos no enteros.
- `prettier --write` con rutas explícitas sobre `private-media.ts` y su test (el pre-commit no corre en este worktree): el
  diff de `private-media.ts` solo contiene lo propio del plan.

## Mutantes razonados

Los tests de CI no se corren localmente. Los de `video-rules.ts` se verificaron además con un `node --no-warnings` sobre el
módulo (cada mutante hizo fallar el chequeo); los de `private-media.ts` (con imports del SDK) se razonan leyendo el test.
Todos revertidos con `cp` desde el scratchpad y `diff` limpio.

| # | Archivo | Mutante | Lo atrapa |
| - | ------- | ------- | --------- |
| 1 | `video-rules.ts` l.65 | `> maxBytes` a `>= maxBytes` | `conquer-video-rules.test.ts` "exactamente el tope es ok y un byte mas es pesado" (`toBe("ok")` con `contentLength: MAX`); node: falló |
| 2 | `video-rules.ts` `isValidVideoSeconds` | sin `Number.isInteger` | `it.each` de `isValidVideoSeconds` caso `[12.5, false]`; node: falló |
| 3 | `video-rules.ts` `normalizeText` | sin `trim()` | `it.each` de `normalizeText` casos `"   "`, `"\n\t "` (`value: null`) y "el largo se mide despues de recortar" (` ${"x"*500} `); node: falló |
| 4 | `private-media.ts` | regex de `isOwnCorrectionVideoKey` sin `^` | `conquer-private-media.test.ts` l.373 caso "con prefijo delante (sin ancla de inicio)" (`x/${good}` debe dar `false`) |
| 5 | `private-media.ts` | `resolve(..., "videos")` tira el error de fotos | l.200 `expect(attempt).toThrow(VideoStorageUnavailableError)` y l.215 |
| 6 | `private-media.ts` | `CORRECTION_KEY_PREFIX = "private/conquer/corrections"` | l.290 "el de correcciones NO empieza con el de fotos": `toBe("private/conquer-corrections")` y `startsWith(...)` `false` |
| 7 | `private-media.ts` | `remove` sin `isObjectMissing` (tira siempre) | `it.each` l.269 "un %s no es error" (`resolves.toBeUndefined()`) |

## Gates

`npx tsc --noEmit` OK, `pnpm lint:tenant` OK (exit 0), `pnpm typecheck:tests` filtrado por `test/(conquer|unit/conquer)` sin
salida, greps de higiene vacíos, `body-check-service.ts` intacto. Tests NO corridos (regla del proyecto).

## Trampas para los próximos ejecutores

1. `resolve(fastify)` SIN segundo argumento sigue siendo fotos: las rutas de video (202-03..07) DEBEN pasar `"videos"`, o el
   503 que sale es `CONQUER_FOTOS_NO_DISPONIBLES` ("Las fotos no están disponibles").
2. El tipo de `head` del `mockPrivateMedia` por defecto es `image/jpeg`: para video hay que pisar `head`, o `checkUploadedVideo`
   da `"tipo"`.
3. `checkUploadedVideo` recibe `allowed` como lista: correcciones `VIDEO_CONTENT_TYPES`, tutoriales `[TUTORIAL_CONTENT_TYPE]`
   con `TUTORIAL_VIDEO_MAX_BYTES`. El orden de resultado es vacio, pesado, tipo.
4. `isValidVideoSeconds` NO redondea: el redondeo (`Math.min(30, Math.max(1, Math.round(d)))`) es del cliente (DA-40). El API
   rechaza 12.5 y 31.
5. `normalizeText` mide el largo DESPUÉS de recortar y devuelve `value: null` para vacío/`null`/`undefined`: la ruta decide si
   "al menos texto o video" (DA-43) con ese `null`.
6. `isCorrectionReplyKey` y `isOwnCorrectionVideoKey` son disjuntas: validar la clave de la RESPUESTA con la primera y la del
   ALUMNO con la segunda (con tenant, alumno y, para respuestas, el id de la corrección; ambos prefijos ancladas con `^`).
7. `remove` re-tira cualquier error que no sea "no existe": las rutas (DA-45) lo envuelven en `try/catch` y devuelven 503
   `VideoStorageUnavailableError` SIN loguear la clave (y sin tocar la fila).
8. `private-media.ts` ahora importa de `./video-rules` (`VIDEO_EXTENSION_BY_CONTENT_TYPE`, tipo `VideoContentType`).
9. Sin cambios de tenancy ni de manifiesto de rutas en este plan: siguen en lo que dejó 202-01 (116 gym-owned / 121 schema;
   `ENTRADAS_BASELINE` = 516).

## Known Stubs

Ninguno.

## Self-Check: PASSED

- `video-rules.ts`, `conquer-video-rules.test.ts`, `private-media.ts`, `conquer-private-media.test.ts`, `_helpers.ts`: presentes.
- Commits `f616c90bb` y `6f9dc1146`: presentes en `git log`.
