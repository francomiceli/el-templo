---
phase: 202-conquer-tutoriales-correcciones
plan: 14
subsystem: app
tags: [conquer, app, corrections, video-upload, capacitor, ios]
requires:
  - phase: 202-conquer-tutoriales-correcciones
    provides: cliente/utils de correcciones (202-11) y pantalla de correcciones (202-13)
provides:
  - useCorrectionUpload (readVideoDuration + send con CapacitorWebFetch)
  - CqCorrectionSendSheet (hoja de envío)
  - botón "Mandar un video" en Correcciones
  - NSMicrophoneUsageDescription en Info.plist (requiere build nativo de iOS)
affects: [202-15]
key-files:
  created:
    - el-templo-app/src/modules/conquer/composables/useCorrectionUpload.ts
    - el-templo-app/src/modules/conquer/components/corrections/CqCorrectionSendSheet.vue
  modified:
    - el-templo-app/src/modules/conquer/pages/ConquerCorrectionsPage.vue
    - el-templo-app/src-capacitor/ios/App/App/Info.plist
key-decisions:
  - "La hoja es dueña del composable de subida y expone cleanup() con defineExpose; la página lo llama en onBeforeUnmount"
  - "Mientras guarda (fase saving) no se puede cerrar ni cancelar: abortar ahí podría dejar la corrección creada en el API sin que el app lo sepa"
duration: 40min
completed: 2026-10-27
---

# Phase 202 Plan 14: Mandar el video de corrección desde el app Summary

**Hoja de envío (escalón, grabar o elegir, comentario) que lee la duración, valida tipo/peso/30 s antes de subir, sube el video directo al bucket privado con `window.CapacitorWebFetch` (sin base64 por el puente) y da de alta la corrección; más el permiso de micrófono de iOS.**

## Commits

| Tarea | Commit | Mensaje |
| ----- | ------ | ------- |
| 1a | `b9d7a1b47` | feat(202-14): subida del video de corrección sin pasar por el puente nativo (DA-51) |
| 1b | `611c084ba` | feat(202-14): permiso de micrófono de iOS para grabar video (DA-50, requiere build nativo) |
| 2 | `9984a59d6` | feat(202-14): el alumno graba o elige un video de 30 s y lo manda a su coach (D-26, DA-50) |

## Qué quedó

- **`useCorrectionUpload()`** → `{ phase, send, cleanup }`, sin `onUnmounted`. `send({ target, comment, file, durationSec })` hace `videoMimeOf` + `checkVideo` -> offline -> `requestCorrectionUpload(mime)` -> PUT -> `createCorrection` y devuelve `{ ok: true, correction }` o `{ ok: false, kind: 'invalid' | 'tope' | 'storage' | 'offline' | 'cancelled' | 'api', message }`. Nunca tira. 409 `CONQUER_CORRECCIONES_TOPE` -> `tope`; 503 -> `storage` con el `error` del API (trae code `CONQUER_VIDEOS_NO_DISPONIBLES`, por eso `ConquerApiError.message` ya es el copy en español); PUT que falla -> "No pudimos subir el video. Revisá tu conexión y probá de nuevo.". Loguea solo `{ status }` o `{ cause: 'timeout' | 'network' }`.
- **`readVideoDuration(file, timeoutMs = 10000)`**: `<video>` creado en JS (`preload = 'metadata'`, `muted`, `playsInline`, `src`, `load()`); `null` en error, timeout o duración no finita; siempre `removeAttribute('src')` + `revokeObjectURL`.
- **Subida (DA-51)**: `(window as WindowWithWebFetch).CapacitorWebFetch ?? window.fetch`, enlazado a `window`, `PUT` con `Content-Type` = MIME firmado, `body: file`, `AbortController` de `PUT_TIMEOUT_MS = 300000`. Comentario largo con el porqué y el requisito de CORS. `useBodyCheckCamera.ts` y `capacitor.config.ts` sin tocar.
- **`CqCorrectionSendSheet`**: `q-dialog` con raíz `.cq-root`, `<select class="cq-select">` nativo con `<optgroup>`, dos botones de 44 px (grabar con `capture="environment"`, galería), validación al elegir (la duración se lee ahí; error bajo los botones, texto sólido, sin guardar el archivo), comentario con `maxlength` y contador, "Mandar a mi coach" con `:loading`. Texto de estado "Subiendo video…" / "Guardando…". `persistent` mientras trabaja; cerrar subiendo pide confirmación inline y llama `cleanup()`. Arranca limpia cada vez que se abre.
- **Página**: `CqButton` "Mandar un video" (`on-night`) en el pórtico; con 0 cupos queda deshabilitado y se lee "Ya tenés {pendingMax} videos esperando respuesta."; sin `targets` no hay botón y se lee "Cuando tengas tu plan vas a poder mandar videos.". `sent` -> `applyCreated(item)` + `applyCorrectionCounts({ pending: limits.pending (ya +1), unseenReplies del store })`.
- **Info.plist**: `NSMicrophoneUsageDescription` nuevo; cámara y galería nombran los videos. El plist parsea (`plistlib`).

## Desvíos del plan

1. `conquer.scss` (en `files_modified`) NO se tocó: los estilos de la hoja van scoped en el componente, como `CqCorrectionSheet`/`CqSaveSheet` y la lección de 202-12/13 (un `.cq-root .x` anidado no alcanza a la raíz del diálogo teletransportado). La clase `.cq-field` del textarea y `.cq-select` salen de `conquer.scss` ya existentes.
2. La hoja expone `cleanup()` (`defineExpose`) y la página lo llama; el composable de subida vive en la hoja, no en la página.
3. Durante la fase `saving` el botón "Cerrar" no se muestra (y la hoja es `persistent`): ver decisiones.
4. El segundo verify del plan compara `git diff origin/staging` en `src/css` y `package.json`: se comparó contra el commit previo al plan (`76f7e3998`), por la lección 202-12 (el merge de master mete cambios ajenos). Resultado vacío.

## Ambigüedades nuevas (opción más simple)

- Elegir un archivo inválido deja la hoja SIN archivo (descarta también uno válido anterior): un solo estado, sin "volver al anterior".
- Si el `send` devuelve `invalid` (no debería: ya se validó al elegir) el mensaje va también bajo los botones.
- `cancelled` (el alumno canceló a propósito) no muestra Notify.
- `tope` y el resto de fallos van a un Notify negativo con el `message`; la hoja queda abierta con el formulario intacto para reintentar (no se pierde el video elegido).
- Offline se detecta con `navigator.onLine === false` antes de pedir la URL y con `ConquerApiError.status === null`.

## Tests y mutantes

Sin tests nuevos: el plan no pide (el composable depende de `window.CapacitorWebFetch`, `URL.createObjectURL` y `<video>`, y el app no tiene `@vue/test-utils`; la lógica pura de validación ya está en `videoFile.test.ts`, 202-11). Mutantes: no aplican. Los mutantes que habría que mirar a ojo en el UAT: PUT sin el `Content-Type` firmado (el bucket responde 403), `CapacitorWebFetch` reemplazado por `fetch` común (en teléfono real se ve como lentitud/cierre por memoria con un video grande), y `revokeObjectURL` omitido (fuga, no se ve).

## Gates

`pnpm lint` 0 errores (2 warnings preexistentes ajenos: `boot/axios.ts`, `useSessionPlayer.ts`); `vue-tsc` filtrado por `src/modules/conquer` y `modules/training` vacío; prettier OK; greps de higiene (`console.*`, `any`, `v-html`, CDN, hex/rgba, `onUnmounted`) vacíos; `plistlib` OK. Los dos verify del plan dan OK (el segundo con el ajuste 4).

## Para 202-15 (barrido final + UAT)

**Requisitos de build nativo**
- Cambió `Info.plist` (micrófono + textos de cámara/galería) -> hace falta `cap sync` + build de iOS nuevo; sin él, en iOS grabar con audio cierra la app. Android: sin cambios en el manifest (la app de cámara del sistema graba el audio); verificar en un Android real que "Grabar video" abre la cámara de video y "Elegir de la galería" el selector, sin pedir permisos extra.
- El resto se puede probar con el web del app.

**Requisitos de infraestructura (Franco)**
- Bucket R2 privado creado + `R2_PRIVATE_BUCKET_NAME` y las 4 `R2_*` del bucket de videos en el entorno (en workflows y servidor). Sin ellos el envío da el 503 en español y el resto de Conquer anda.
- **CORS del bucket privado para PUT** desde `capacitor://localhost` (iOS), `https://localhost` (Android) y los dominios web del app (staging y prod), con header `Content-Type` permitido. Es obligatorio por DA-51: `CapacitorWebFetch` es un fetch del WebView, no pasa por el puente nativo. Sin CORS el PUT falla y el alumno ve "No pudimos subir el video...".
- Confirmar en el teléfono que `window.CapacitorWebFetch` existe (con `CapacitorHttp.enabled: true`); si no existiera cae a `window.fetch` parchado y el video pasaría a base64 por el puente (memoria).

**Para mirar a ojo / en teléfono real**
- Grabar en iPhone y en Android; elegir de la galería; video de 40 s rechazado con el mensaje "El video dura 40 s: el máximo es 30 s..."; video 4K pesado (>100 MB) rechazado; un `.mov` de iPhone (QuickTime) aceptado y subido; Android que entrega `File.type` vacío con `.mp4`.
- Video de ~30,0x s grabado con la cámara pasa (tolerancia 0,5 s) y se guarda como 30.
- Que `readVideoDuration` responda en iOS con `.mov` HEVC (si el WebView no decodifica, da `null` y el mensaje es "No pudimos leer el video"; evaluar si molesta).
- "Subiendo video…" visible durante la subida con datos móviles; cortar la señal a mitad (mensaje de conexión, hoja intacta, reintento); cerrar subiendo -> confirmación -> "Sí, cancelar" corta; el botón atrás de Android no cierra la hoja mientras sube.
- Tope: con 3 pendientes el botón está deshabilitado con su leyenda; carrera (otro dispositivo) devuelve el 409 en un Notify.
- Tras mandar: aparece en "Esperando respuesta" con su chip, el cupo baja ("Te quedan 2 de 3"), y al volver a Inicio el contador de Correcciones coincide sin recargar.
- A 390 px: la hoja entra sin scroll horizontal, los dos botones de video se acomodan (uno al lado del otro o apilados), el `<select>` nativo muestra los grupos por ejercicio y "Combos" (para Espartano), el teclado no tapa el textarea y el botón "Mandar a mi coach" queda a la vista (área segura inferior en iPhone).
- Alumno sin plan (`targets` vacío): se lee "Cuando tengas tu plan vas a poder mandar videos." y no hay botón.
- El permiso: en iOS, la primera vez que graba aparecen los diálogos de cámara y micrófono con los textos nuevos.

## Known Stubs

Ninguno (el hueco `<!-- 202-14 -->` de la página quedó resuelto).

## Self-Check: PASSED

- Archivos creados y modificados presentes; commits `b9d7a1b47`, `611c084ba` y el de la tarea 2 en `git log`.
