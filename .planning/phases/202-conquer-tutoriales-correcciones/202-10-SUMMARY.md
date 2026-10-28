---
phase: 202-conquer-tutoriales-correcciones
plan: 10
subsystem: admin
tags: [conquer, corrections, video, admin, quasar, vue]
requires:
  - phase: 202-conquer-tutoriales-correcciones
    provides: POST reply-upload-url y reply (202-06), useConquerVideoUpload (202-08), bandeja y diálogo (202-09)
provides:
  - ConquerCorrectionReply.vue (texto + video de 30 s del coach)
  - requestReplyUpload / replyCorrection en useConquerAdminApi
  - Tipos ReplyUploadUrl y ReplyCorrectionBody
affects: [202-15]
tech-stack:
  added: []
  patterns:
    - "El formulario emite replied con la AdminCorrection del API y el diálogo la reenvía como changed (la bandeja solo reemplaza)"
key-files:
  created:
    - el-templo-admin/src/components/conquer/ConquerCorrectionReply.vue
  modified:
    - el-templo-admin/src/types/conquer.ts
    - el-templo-admin/src/composables/useConquerAdminApi.ts
    - el-templo-admin/src/composables/useConquerVideoUpload.ts
    - el-templo-admin/src/components/conquer/ConquerCorrectionDialog.vue
    - el-templo-admin/src/components/conquer/ConquerCorrections.vue
key-decisions:
  - "ReplyUploadUrl es un alias de TutorialUploadUrl (forma idéntica)"
  - "useConquerVideoUpload expone checkDuration para validar al ELEGIR el archivo sin convertir"
  - "El 409 de ya respondida se resuelve dentro del formulario: relee las respondidas y emite replied con la fresca"
requirements-completed: [D-26, D-27, D-29]
completed: 2026-10-27
---

# Phase 202 Plan 10: Respuesta del coach en el admin Summary

**El coach responde una corrección pendiente desde el diálogo con texto (1000), con un video propio de hasta 30 s (convertido a MP4 en el navegador) o con los dos; la respuesta es final y la fila pasa a Respondidas bajando el contador.**

## Commits

| Tarea | Commit | Mensaje |
| ----- | ------ | ------- |
| 1 | `0e8cefff2` | feat(202-10): formulario de respuesta del coach con texto y video de 30 s (D-26, DA-43, DA-52) |
| 2 | `faf87f61a` | feat(202-10): respuesta del coach en la bandeja de correcciones (D-26) |

## Lo que quedó

- `ConquerCorrectionReply.vue` (props `{ correction }`; emits `replied: [AdminCorrection]` y `busy: [boolean]`):
  `q-input textarea` con `counter` + `maxlength=1000` + `autogrow`; bloque de video con "Elegir video" (`accept` mp4/mov),
  nombre + duración + "Quitar"; "Responder" deshabilitado sin texto con contenido ni video. Flujo con video:
  `prepareMp4(file, { maxBytes: 100 MB, maxSeconds: 30 })` → `requestReplyUpload(id, 'video/mp4')` → `putToBucket` →
  `replyCorrection(id, { text, key, durationSec })`. Sin video: `replyCorrection(id, { text })`. Sin lógica de subida propia.
  Progreso "Convirtiendo… N%" / "Subiendo… N%" / "Enviando…". `data-test`: `conquer-correction-reply`, `conquer-reply-text`,
  `conquer-reply-video`, `conquer-reply-send` (más `-pick`, `-remove`, `-file`, `-progress`).
- Al elegir el archivo se valida la duración (sin `Notify`, el error queda en rojo bajo el bloque de video) y se vuelve a
  validar dentro de `prepareMp4`. `durationSec` sale de `prepared.seconds` (entero 1..30, lo que exige el API).
- `ConquerCorrectionDialog.vue`: el gancho `<!-- 202-10 -->` quedó reemplazado por `<ConquerCorrectionReply v-if="correction.canReply">`;
  `onReplied` emite `changed`. `ConquerCorrections.onChanged` (202-09) ya sacaba la fila de Pendientes y refrescaba
  `fetchConquerCorrectionsCount()`: no hizo falta cambiarlo (solo su docblock). Al pasar a `respondida` el diálogo muestra
  el bloque "Respondida por …" con texto y `ConquerCorrectionVideo who="coach"` (ya existía en 202-09).
- Cliente: `requestReplyUpload(id, contentType)` y `replyCorrection(id, body)` (errores como `ConquerApiError`).

## Deviations from Plan

**1. [Rule 3 - DRY] `checkDuration` expuesto en `useConquerVideoUpload`** (archivo de 202-08, fuera de `files_modified`).
El plan pide validar la duración al elegir "vía el composable", pero el composable solo la leía dentro de `prepareMp4`
(que además convierte el `.mov`). Se agregó `checkDuration` al `return` (era una función interna): cambio de una línea, mismo
comportamiento para los tutoriales.

**2. [Rule 1/2 - correctitud] Diálogo no se cierra mientras se envía.** Se agregó el emit `busy` del formulario y `replying`/`busy`
en el diálogo (cierre, X y "Cerrar" deshabilitados, y "Borrar video del alumno" deshabilitado). Sin eso, cerrar el diálogo en
medio de la conversión/subida desmontaba el formulario y el `replied` se perdía: la respuesta quedaba guardada pero la
bandeja y el contador no se enteraban. Amplía el contrato de emits del plan (un emit extra).

**3. [Decisión] El 409 se resuelve en el formulario**, no en el diálogo: `Notify` con el `error` del API y relectura con
`listCorrections('respondida')` (busca por id) para emitir `replied` con la versión fresca. Si no estuviera entre las 50
más recientes (no debería: la acaba de responder otro), no emite y el formulario queda visible; el siguiente intento
vuelve a dar 409 con el mismo mensaje. Alternativa descartada: endpoint `GET /corrections/:id` (no existe, sería API nuevo).

**4. [Ambigüedad nueva, opción simple]** Con video, si el texto está vacío se manda `text: null`; sin video se manda el
texto recortado. El tope de 100 MB y el tipo se validan al enviar (en `prepareMp4`), no al elegir (solo la duración se
valida al elegir, como pide el plan).

Fuera de eso, el plan se ejecutó como estaba escrito.

## Gates

`pnpm lint` del admin: 0 errores (8 warnings preexistentes ajenos: `CobrosPage`, `session-pdf-builder`, `env.d.ts`).
`vue-tsc` filtrado por `src/(components|composables|types|pages)/.*Conquer` y `conquer.ts`: sin salida.
`prettier --check` OK en los 5 archivos (se formateó solo `useConquerAdminApi.ts`; el diff son solo las líneas nuevas).
Greps de higiene vacíos. El admin no tiene vitest: no hay tests ni mutantes que razonar.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno nuevo. T-201-150: la duración se lee al elegir y en `prepareMp4`, el API valida 1..30. T-201-151: ni el formulario ni
el composable loguean `uploadUrl` ni `key` (`replyCorrection` loguea solo `correctionId` y `withVideo`).

## Para mirar a ojo en el UAT (202-15)

1. Responder solo con texto: "Respuesta enviada", la fila sale de Pendientes, baja la pelotita del menú y el diálogo pasa a
   "Respondida por {nombre}" con el texto. Contador `N/1000` y que no deje pasar de 1000.
2. Responder solo con video: un `.mov` de ~25 s (se convierte: ver "Convirtiendo… N%" y luego "Subiendo… N%") y un `.mp4`.
   Confirmar que el alumno lo ve en el teléfono (plan de app).
3. Video de 40 s: se rechaza al ELEGIR con el mensaje "El video dura 40 s: el máximo es 30 s" en rojo bajo el bloque, sin
   Notify, y "Responder" queda deshabilitado (sin texto).
4. Video + texto juntos; "Quitar" devuelve el botón "Elegir video".
5. Mientras convierte/sube, el diálogo no se cierra (X, Cerrar, Esc y click afuera) ni se puede borrar el video del alumno.
6. Dos coaches a la vez (dos pestañas): el segundo ve el mensaje del API ("Esta corrección ya tiene respuesta") y el diálogo
   pasa a mostrar la respuesta del primero.
7. Sin bucket R2 privado configurado (hoy no existe en staging): responder con video da el 503 del API en un Notify; con
   solo texto anda igual. El PUT desde el admin de STAGING necesita el CORS del bucket privado (lo habilita Franco).
8. En un `.mov` HEVC (iPhone) `getVideoDuration` puede fallar en Chrome de escritorio: debería salir "No pudimos leer la
   duración del video" en el bloque de video, sin romper el formulario.

## Trampas para los planes de app y 202-11..14

- `ConquerCorrectionReply` y el bloque de respuesta mostrada del diálogo comparten `data-test="conquer-correction-reply"`
  (el nombre lo fijó el plan para el formulario y 202-09 ya lo usaba en la vista): nunca coexisten (pendiente = formulario,
  respondida = vista), pero un selector por ese `data-test` hay que acotarlo por contexto.
- La respuesta del coach llega al alumno con `reply_seen_at = NULL` (202-06): el app lo cuenta en `unseenReplies` hasta que
  llame a `POST /corrections/seen`.
- El PUT del video del coach va con `Content-Type: video/mp4` y la `key` lleva el prefijo `coach-`; el app pide su URL con
  `who=coach` (minúsculas).
- `useConquerVideoUpload` es solo del admin (usa `transcodeToMp4` del admin): no está en el app.

## Self-Check: PASSED
