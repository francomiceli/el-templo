---
phase: 202-conquer-tutoriales-correcciones
plan: 11
subsystem: app
tags: [conquer, app, pinia, corrections, tutorials, video-validation]
requires:
  - phase: 202-conquer-tutoriales-correcciones
    provides: rutas del alumno de correcciones (202-03, 202-04) y GET /tutorials (202-07)
provides:
  - tipos del app para correcciones, tutoriales y member.corrections
  - 6 funciones nuevas en useConquerApi
  - store con tutoriales (carga única) y contadores de correcciones
  - utils puras videoFile.ts y corrections.ts con tests
affects: [202-12, 202-13, 202-14]
key-files:
  created:
    - el-templo-app/src/modules/conquer/utils/videoFile.ts
    - el-templo-app/src/modules/conquer/utils/corrections.ts
    - el-templo-app/src/modules/conquer/utils/__tests__/videoFile.test.ts
    - el-templo-app/src/modules/conquer/utils/__tests__/corrections.test.ts
  modified:
    - el-templo-app/src/modules/conquer/types.ts
    - el-templo-app/src/modules/conquer/composables/useConquerApi.ts
    - el-templo-app/src/modules/conquer/stores/conquerStore.ts
    - el-templo-app/src/modules/conquer/utils/__tests__/conquerView.test.ts
key-decisions:
  - "loadTutorials comparte el pedido en vuelo y, si falla, se reintenta en la próxima llamada (no queda marcado como cargado)"
  - "Las URLs firmadas de video no se guardan en el store ni se loguean (T-201-153)"
duration: 35min
completed: 2026-10-27
---

# Phase 202 Plan 11: Capa de datos del app para tutoriales y correcciones Summary

**Tipos, cliente y store del app para las 6 rutas del alumno nuevas, más dos utils puras con test: validación del video (tipo MP4/MOV por MIME o extensión, 100 MB, 30,5 s) y agrupado/rótulos de correcciones.**

## Commits

| Tarea | Commit | Mensaje |
| ----- | ------ | ------- |
| 1 | `850636e8a` | feat(202-11): datos de tutoriales y correcciones en el app (DA-46, DA-49) |
| 2 | `e23b0d526` | feat(202-11): validación del video y rótulos de correcciones, puros y con test (DA-40, DA-47) |

## Firmas exactas (para 202-12..14)

### `types.ts` (nuevos)

`CorrectionCounts { pending; unseenReplies }`, `CorrectionKind = 'escalon' | 'combo'`, `CorrectionStatus = 'pendiente' | 'respondida'`,
`CorrectionVideoWho = 'alumno' | 'coach'`, `CorrectionTarget { key, kind, exerciseId, step, comboKey, group, label }`,
`CorrectionReply { text, hasVideo, videoSeconds, repliedAt }`, `CorrectionView` (id, kind, targetLabel, comment, durationSec, createdAt, status,
videoDeleted, reply, replyUnseen), `CorrectionLimits { pending, pendingMax, maxSeconds, maxBytes, commentMax }`, `CorrectionsResponse { items,
targets, limits }`, `CorrectionUploadResponse { uploadUrl, key, contentType, expiresIn, maxBytes }`, `CreateCorrectionBody { exerciseId?, step?,
comboKey?, comment?, key, durationSec }`, `CorrectionVideoUrl { available, url, expiresIn }`, `CorrectionsSeenResponse { unseenReplies }`,
`MemberTutorials { exercises: {exerciseId, url}[]; combos: {comboKey, url}[] }`. `ConquerMemberState.corrections?: CorrectionCounts`.

Dos tipos extra que el plan no nombraba: `CorrectionStatus` y `CorrectionsSeenResponse`.

### `useConquerApi()` (nuevos)

`getCorrections(): Promise<CorrectionsResponse>`, `requestCorrectionUpload(contentType: string): Promise<CorrectionUploadResponse>`,
`createCorrection(body: CreateCorrectionBody): Promise<CorrectionView>`, `getCorrectionVideoUrl(id: number, who: CorrectionVideoWho):
Promise<CorrectionVideoUrl>`, `markCorrectionsSeen(): Promise<CorrectionsSeenResponse>`, `getTutorials(): Promise<MemberTutorials>`.
Textos de error fijos: "No pudimos cargar tus correcciones", "No pudimos preparar la subida del video", "No pudimos mandar tu video",
"No pudimos abrir el video", "No pudimos guardar que viste las respuestas", "No pudimos cargar los tutoriales" (todos con "Probá de nuevo.").

### `useConquerStore()` (nuevos)

`tutorials: Ref<MemberTutorials | null>`, `loadTutorials(): Promise<void>`, `exerciseTutorialUrl(exerciseId: number): string | null`,
`comboTutorialUrl(comboKey: ComboKey): string | null`, `applyCorrectionCounts(counts: CorrectionCounts): void`.

### `utils/videoFile.ts`

`VIDEO_MAX_SECONDS = 30`, `VIDEO_DURATION_TOLERANCE = 0.5`, `VIDEO_MAX_BYTES`, `type VideoMime = 'video/mp4' | 'video/quicktime'`,
`type VideoCheckReason = 'tipo' | 'vacio' | 'pesado' | 'duracion' | 'largo'`, `type VideoCheck`, `videoMimeOf({ type, name }): VideoMime | null`,
`checkVideo({ mime, size, durationSec }): VideoCheck`, `videoSeconds(d): number`, `formatSeconds(s): string`.

### `utils/corrections.ts`

`groupCorrections(items): { pending, answered }`, `correctionChip(item): { label, tone: 'espera' | 'nueva' | 'hecha' }`,
`remainingSlots(limits: Pick<CorrectionLimits, 'pending' | 'pendingMax'>): number`, `targetGroups(targets): { group, options: { key, label }[] }[]`
(tipos exportados `GroupedCorrections`, `CorrectionChip`, `CorrectionChipTone`, `TargetGroup`).

## Mutantes razonados (aplicados de verdad sobre copias en el scratchpad, producción intacta)

Cada mutante se corrió con `node --no-warnings` sobre un script que replica los `expect` (los `.ts` puros corren por type-stripping de Node 22); el
script sin mutar daba "TODO OK" y cada mutante falló donde se dice. Los `expect` de CI que los atrapan:

| # | Mutante | Resultado local | `expect` de CI que lo atrapa |
| - | ------- | --------------- | ---------------------------- |
| 1 | tolerancia 0 (`> VIDEO_MAX_SECONDS`) | falla 30,5 | `videoFile.test.ts` l.95 `[30.5, 30]` -> l.101 `toEqual({ ok: true, seconds })` |
| 2 | sin fallback por extensión (`return null` si `type` vacío) | falla `.MOV` y `.m4v` con type vacío | `videoFile.test.ts` l.27 (`IMG_1.MOV`) y las filas `.mov`/`.m4v`/`.mp4` -> l.37 `toBe(esperado)` |
| 3 | `correctionChip` ignora `replyUnseen` | falla "Nueva respuesta" | `corrections.test.ts` l.77 -> l.82 `toEqual({ label, tone })` |
| 4 | respondidas ordenadas por `createdAt` en vez de `repliedAt` | falla el orden | `corrections.test.ts` l.42 `toEqual([3, 4])` (las fechas de alta están cruzadas a propósito) |
| 5 | tope de peso `>=` en vez de `>` | falla 100 MB exactos | `videoFile.test.ts` l.76 `toEqual({ ok: true, seconds: 12 })` |
| 6 | `remainingSlots` sin `Math.max(0, ...)` | falla 5 de 3 | `corrections.test.ts` l.91 `[5, 3, 0]` -> l.93 `toBe(esperado)` |

## Gates

`pnpm lint` (0 errores; 2 warnings preexistentes ajenos en `boot/axios.ts` y `useSessionPlayer.ts`), `vue-tsc` filtrado por `src/modules/conquer` y
`modules/training` vacío, prettier OK sobre los 8 archivos, greps de higiene (`console.`, `any`, `Notify`) vacíos, `conquerView.ts` y `ConquerTab.vue`
sin cambios. Tests escritos y NO corridos (regla del proyecto).

## Desvíos del plan

- Ninguno de contenido. `conquerView.test.ts`: el fixture `activeWith` suma `corrections: { pending: 0, unseenReplies: 0 }` para que refleje el
  contrato real (el plan lo permitía "solo donde un test lo necesite"; es una línea y no cambia ningún caso).
- `checkVideo` trata una duración negativa como `duracion` (ilegible); el plan solo mencionaba null/NaN/Infinity. Con test.
- `videoMimeOf` normaliza `type` con `trim().toLowerCase()`; un `type` informado de otro formato (p. ej. `video/webm`) devuelve `null` aunque la
  extensión sea `.mp4` (el fallback por extensión es solo para `type` vacío). Con test.

## Ambigüedades nuevas (opción más simple adoptada)

1. `loadTutorials` concurrente: dos llamadas simultáneas comparten el mismo pedido (evita doble GET si dos pantallas lo piden juntas).
2. Si `getTutorials` falla, `tutorials` queda `null` y la próxima llamada a `loadTutorials` reintenta (no se "marca" como cargado). Un 4xx va a
   `log.warn`, el resto a `log.error`; nunca toca `error` ni notifica.
3. `groupCorrections` ordena una respondida sin `reply` (no debería pasar) por su fecha de alta, en vez de romper.

## Trampas para 202-12..14

1. **`tutorials === null` significa "todavía no cargó o falló"**: ambos casos dan `null` de las dos funciones de URL = sin botón. Las pantallas
   tienen que llamar `store.loadTutorials()` al montarse (idempotente) y NO esperar un `error`. `exerciseTutorialUrl` recibe el
   `conquer_exercises.id` que trae `TodayExercise.exerciseId` (el mismo que `GET /today`), no un id de rutina.
2. **Los tutoriales no exigen Conquer activo en el API**, pero el store solo guarda las URLs: las URLs del bucket PÚBLICO sí pueden quedar en el
   store (T-201-153 aplica solo a las firmadas de correcciones, que NO se guardan: pedirlas al abrir con `getCorrectionVideoUrl` y descartarlas).
3. **`getCorrectionVideoUrl` devuelve `available: false` sin error**: mostrar "Este video ya no está disponible" (D-28), no un Notify de error.
   `who` va en minúsculas: `'alumno'` | `'coach'`.
4. **El store NO notifica**: las vistas observan el `ConquerApiError` que re-lanza el cliente (`err.message` apto para el Notify). Las funciones
   nuevas del cliente están en el composable, no en el store: 202-12/13 las llaman con su propia instancia de `useConquerApi()` y deben llamar
   `api.cleanup()` al desmontarse.
5. **Contadores**: tras `createCorrection` OK llamar `store.applyCorrectionCounts({ pending: pending + 1, unseenReplies })` (o releer
   `loadState()`), y tras `markCorrectionsSeen` OK `applyCorrectionCounts({ pending, unseenReplies: 0 })`. `applyCorrectionCounts` no hace nada si
   no hay `member` (alumno no activo). `member.corrections` es opcional: leerlo con `member?.corrections ?? { pending: 0, unseenReplies: 0 }`.
6. **Subida del video**: `requestCorrectionUpload(mime)` pide con el MIME de `videoMimeOf` y el PUT lleva EXACTAMENTE ese `Content-Type` (la URL lo
   firma); el PUT va con `window.CapacitorWebFetch` (DA-51), sin auth y sin base64. `createCorrection` lleva `durationSec` ya entero (1..30) que sale de
   `checkVideo(...).seconds`; el API rechaza no enteros.
7. **`checkVideo` necesita `durationSec` ya leído**: leerlo (metadata de un `<video>` con `URL.createObjectURL`) es de la pantalla, no de la util;
   si no se puede leer pasar `null` y sale `duracion`.
8. **Opciones del selector**: `targetGroups(items.targets)` da `{ group, options: [{ key, label }] }`; para armar el body hay que volver al
   `CorrectionTarget` por `key` (`targets.find(t => t.key === key)`) y mandar `exerciseId` + `step` o `comboKey` (nunca ambos).
9. `remainingSlots(limits)` y `limits.pendingMax` (3) vienen del API; el botón "Mandar video" se deshabilita con 0 cupos, pero el 409
   `CONQUER_CORRECCIONES_TOPE` igual puede llegar (carrera): mostrar su `error`.
10. `ConquerApiError.message` solo trae el `error` del API cuando el `code` empieza con `CONQUER_`; si no, va el texto fijo de la acción.

## Para mirar a ojo en el UAT

- Que `loadTutorials` no dispare más de un GET al navegar entre Hoy, Sábado y Progreso (pestaña Network).
- Que un teléfono Android que entrega `File.type` vacío igual acepte un `.mp4`/`.mov`.
- Que un video de ~30,0x s grabado con la cámara del teléfono pase (la tolerancia 0,5 s existe por eso) y que el mensaje de "largo" diga un entero
  coherente.
- Que el contador de Inicio cambie en el momento (sin releer) tras mandar un video y tras abrir las respuestas.

## Known Stubs

Ninguno.

## Self-Check: PASSED

- Los 4 archivos nuevos y los 4 modificados presentes; commits `850636e8a` y `e23b0d526` en `git log`.
