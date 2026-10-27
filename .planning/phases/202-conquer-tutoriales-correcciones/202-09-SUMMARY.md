---
phase: 202-conquer-tutoriales-correcciones
plan: 09
subsystem: admin
tags: [conquer, corrections, video, admin, quasar, vue]
requires:
  - phase: 202-conquer-tutoriales-correcciones
    provides: rutas del coach de correcciones (202-05), respuesta del coach (202-06)
provides:
  - Pestaña Correcciones en Conquer (admin) con contador y deep link ?tab=correcciones
  - ConquerCorrectionDialog (detalle, borrado del video del alumno) con hueco para 202-10
  - ConquerCorrectionVideo (URL firmada, "Video no disponible", "Volver a cargar")
  - Pelotita de Conquer en el menú = pedidos + correcciones pendientes
affects: [202-10, 202-15]
tech-stack:
  added: []
  patterns:
    - "El diálogo no guarda la corrección: la recibe por prop y emite changed con la versión del API"
key-files:
  created:
    - el-templo-admin/src/components/conquer/ConquerCorrections.vue
    - el-templo-admin/src/components/conquer/ConquerCorrectionDialog.vue
    - el-templo-admin/src/components/conquer/ConquerCorrectionVideo.vue
  modified:
    - el-templo-admin/src/types/conquer.ts
    - el-templo-admin/src/composables/useConquerAdminApi.ts
    - el-templo-admin/src/stores/useAdminStore.ts
    - el-templo-admin/src/config/templo-config.ts
    - el-templo-admin/src/layouts/AdminLayout.vue
    - el-templo-admin/src/pages/ConquerPage.vue
    - el-templo-admin/src/utils/conquer-format.ts
key-decisions:
  - "durationText ('0:24') vive en utils/conquer-format.ts (lo usan la lista, el diálogo y 202-10) en vez de duplicarse"
  - "Sin tests: el admin no tiene vitest, por eso no hay mutantes que razonar"
requirements-completed: [D-26, D-28, D-29, D-08, D-12]
completed: 2026-10-27
---

# Phase 202 Plan 09: Bandeja de correcciones del coach (admin) Summary

**Pestaña Correcciones en el admin de Conquer: lista de pendientes/respondidas con contador, detalle con el video firmado del alumno y borrado confirmado, y la pelotita del menú que suma pedidos más correcciones.**

## Commits

| Tarea | Commit | Mensaje |
| ----- | ------ | ------- |
| 1 | `61c84a9ff` | feat(202-09): contador de correcciones en el menú y cliente de la bandeja (DA-46) |
| 2 | `2be4f6baf` | feat(202-09): bandeja de correcciones en el admin: lista, video y borrado del video del alumno (D-26, D-28) |

## Lo que quedó

- Tipos (`types/conquer.ts`): `CorrectionStatus`, `CorrectionVideoWho`, `CorrectionReply`, `AdminCorrection`, `AdminCorrectionsResponse`, `CorrectionVideoUrl`.
- Cliente (`useConquerAdminApi`): `listCorrections(status)` (devuelve el array `items`), `countCorrections()`, `getCorrectionVideoUrl(id, who)`, `deleteCorrectionVideo(id)` (devuelve la `AdminCorrection` completa).
- Store: `conquerCorrectionsCount` y `fetchConquerCorrectionsCount()` (catch silencioso). `NavBadge` `'conquer'` reemplaza a `'conquer-requests'` (borrado del tipo, del `switch` y de los comentarios, sin usos colgados). `AdminLayout` pide los dos contadores en `onMounted` y en `watch(route.path)`.
- `ConquerPage`: tab `correcciones` (ícono `ondemand_video`, `q-badge` del contador) después de Pedidos; `'correcciones'` en `TAB_NAMES`; `onMounted` pide también el contador.

## Para 202-10 (props y emits)

`ConquerCorrectionDialog.vue`:
- props `{ modelValue: boolean; correction: AdminCorrection | null }`.
- emits `update:modelValue` y `changed: [AdminCorrection]`.
- El hueco para el formulario de respuesta es el comentario `<!-- 202-10: respuesta del coach -->`, dentro del `q-card-section` principal, DESPUÉS del bloque de la respuesta ya dada (`v-if="correction.reply"`) y antes de `q-card-actions`. Mostrarlo con `v-if="correction.canReply"`.
- Tras responder, el formulario debe emitir `changed` con la `AdminCorrectionView` que devuelve `POST .../reply`. `ConquerCorrections.onChanged` reemplaza la fila, la saca de la lista de Pendientes (cambió de estado), actualiza `selected` (el diálogo pasa a mostrar la respuesta) y llama a `fetchConquerCorrectionsCount()`. No hay que tocar `ConquerCorrections`.
- `q-card-actions` tiene `align="between"` con "Borrar video del alumno" a la izquierda y "Cerrar" a la derecha (con `q-space` en el medio).
- `ConquerCorrectionVideo` (props `correctionId`, `who: 'alumno' | 'coach'`) ya sirve para el video del coach (se muestra solo si `reply.hasVideo`). Se remonta por `:key`: el del alumno depende de `correction.videoDeleted`; el del coach, de `correction.id`.
- `durationText(seconds)` y `agoText/daysSince` están en `utils/conquer-format.ts`.

## Deviations from Plan

**1. [Rule 3 - consistencia/DRY] `durationText` agregado a `utils/conquer-format.ts`**
- El plan no lista ese archivo en `files_modified`; la duración "0:24" se usa en la lista, en el diálogo y la va a usar 202-10, así que va en el util compartido en vez de definirla dos veces en componentes.
- Commit `2be4f6baf`.

**Ambigüedades resueltas con la opción más simple (sin consultar):**
- `ConquerCorrectionVideo` muestra "Volver a cargar" cuando falla la petición de la URL (incluido el 503, con el texto del API) y cuando falla el `<video>`; NO lo muestra cuando el API dice `available: false` (no hay nada que recargar).
- Si el coach cambia el toggle, la lista se vacía antes de cargar (evita ver unos instantes la lista del otro estado), y una carga vieja se descarta con un token.
- Cuando `videoDeleted`, el diálogo muestra debajo "Video borrado hace N días." además del "Video no disponible" del reproductor.
- El borrado usa `$q.dialog` (como `ConquerAlertActions`); el botón "Borrar video del alumno" queda con `:loading` mientras corre el DELETE.

Sin tests ni mutantes: el admin no tiene vitest y los dos gates del plan son lint + vue-tsc.

## Gates

- `pnpm lint` del admin: 0 errores (8 warnings preexistentes ajenos: `CobrosPage.vue`, `session-pdf-builder.ts`, `env.d.ts`).
- `vue-tsc` filtrado por componentes/páginas/utils/composables/types/stores/config/layouts de Conquer: vacío (único error preexistente ajeno: `session-pdf-builder.ts`).
- Higiene: sin `console.*`, sin `any`, sin `color="primary|info"` en los tres componentes nuevos. Prettier aplicado (`semi: true`).

## Issues Encountered

Ninguno.

## A mirar a ojo en el UAT (202-15)

- Con una corrección real (necesita bucket privado con CORS): reproducción del video del alumno en Safari y Chrome (`playsinline`, `preload="metadata"`), y que "Volver a cargar" ande cuando la URL de 5 minutos venció con el diálogo abierto.
- Borrar el video: confirmación con el nombre del alumno, el reproductor pasa a "Video no disponible", aparece "Video borrado hace…" y el chip "Video borrado" en la fila; la corrección sigue en Pendientes.
- Contador: la pelotita del menú suma pedidos + correcciones y la del tab Correcciones baja al responder o al cambiar de ruta (el menú se refresca al navegar).
- El link del nombre en la fila navega a la ficha (`conquer-alumno`) sin abrir el diálogo.
- Sin bucket (`R2_PRIVATE_BUCKET_NAME`): el reproductor muestra "Los videos no están disponibles por ahora" (texto del API) con "Volver a cargar".

## Known Stubs

El hueco `<!-- 202-10: respuesta del coach -->` es intencional: el formulario de respuesta lo agrega 202-10.

## Self-Check: PASSED

- Los tres componentes existen, y están los commits `61c84a9ff` y `2be4f6baf`.
