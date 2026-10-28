---
phase: 202-conquer-tutoriales-correcciones
plan: 13
subsystem: app
tags: [conquer, app, corrections, video, inicio]
requires:
  - phase: 202-conquer-tutoriales-correcciones
    provides: cliente/store/utils de correcciones (202-11) y CqVideoSheet (202-12)
provides:
  - pantalla Correcciones del alumno (ruta conquer-correcciones) con dos grupos, cupos y detalle con videos bajo demanda
  - composable useConquerCorrections (carga, marca de vistas una vez por carga, URL firmada bajo demanda, applyCreated)
  - acceso Correcciones en Inicio con contador de respuestas nuevas
affects: [202-14, 202-15]
key-files:
  created:
    - el-templo-app/src/modules/conquer/composables/useConquerCorrections.ts
    - el-templo-app/src/modules/conquer/pages/ConquerCorrectionsPage.vue
    - el-templo-app/src/modules/conquer/components/corrections/CqCorrectionCard.vue
    - el-templo-app/src/modules/conquer/components/corrections/CqCorrectionSheet.vue
  modified:
    - el-templo-app/src/modules/training/routes.ts
    - el-templo-app/src/modules/conquer/components/ConquerHome.vue
    - el-templo-app/src/modules/conquer/styles/conquer.scss
    - el-templo-app/src/modules/conquer/utils/corrections.ts
    - el-templo-app/src/modules/conquer/utils/__tests__/corrections.test.ts
key-decisions:
  - "markSeen devuelve el contador nuevo (o null) y la PANTALLA lo vuelca al store con applyCorrectionCounts"
  - "El detalle recibe videoUrl como prop (la función del composable de la pantalla): el padre sigue siendo dueño de la única instancia de la API"
  - "Fechas en día LOCAL del alumno (localDayOf), no el día UTC del instante ISO"
duration: 45min
completed: 2026-10-27
---

# Phase 202 Plan 13: Pantalla de correcciones del alumno Summary

**Pantalla `Correcciones` en Conquer (cupos, "Esperando respuesta" y "Respondidas" con chip "Nueva"), detalle con los videos del alumno y del coach pedidos al tocarlos y mostrados en `CqVideoSheet`, y acceso desde Inicio con el contador de respuestas sin ver que baja al abrir la pantalla.**

## Commits

| Tarea | Commit | Mensaje |
| ----- | ------ | ------- |
| 1 | `b7f47f499` | feat(202-13): pantalla de correcciones del alumno (D-26, DA-47) |
| 2 | `1847ea303` | feat(202-13): acceso a Correcciones con contador en Inicio de Conquer (D-29, DA-46) |

## Qué quedó

- **Ruta** `training/conquer/correcciones`, nombre `conquer-correcciones`, junto a las demás de Conquer.
- **`useConquerCorrections()`** → `{ data, loading, error, load, markSeen, videoUrl, applyCreated, cleanup }`, sin `onUnmounted`. No notifica ni guarda/loguea URLs firmadas.
- **`ConquerCorrectionsPage`**: `CqScreen` + `CqPageHeader` con vuelta a la tab; UNA `CqPortico` (kicker, texto con `limits.maxSeconds`, "Te quedan {n} de {pendingMax}"); los dos grupos con su vacío, un solo vacío "Todavía no mandaste ningún video." si no hay nada; error de carga con "Reintentar". Carga en frío: `loadState()` si no hay estado y `router.replace` a la tab si la vista es `bloqueado`/`pedido`.
- **`CqCorrectionCard`** (props `item`, emit `open`, es un `<button>` con toda la card tocable) y **`CqCorrectionSheet`** (`q-dialog` con raíz `.cq-root`): "Tu video" + "Ver video" (o "Tu coach borró el video después de corregirlo."), comentario, y "Respuesta de tu coach" con texto y "Ver video del coach".
- **Inicio**: fila `Correcciones` tras "Evolución" con chip `{n} nueva/nuevas` y `aria-label` "Correcciones, {n} respuesta(s) nueva(s)"; sin contador si es 0 o `member.corrections` no vino.
- **`.cq-chip--nueva`** en `conquer.scss` (crema + filete dorado, solo tokens, sin rojo ni verde).

## Desvíos del plan

1. **`markSeen` no es `Promise<void>`** sino `Promise<CorrectionsSeenResponse | null>` (compatible hacia atrás): la pantalla necesita el `unseenReplies` nuevo para llamar a `store.applyCorrectionCounts({ pending: limits.pending, unseenReplies })` (lo exige el verify de la tarea 2 en la página). Corre una sola vez por carga (`seenForLoad === loadSeq`), solo si hay alguna `replyUnseen`, es silencioso y NO toca `data` (los "Nueva" se conservan).
2. **`CqCorrectionSheet` recibe una tercera prop `videoUrl`** (`(id, who) => Promise<CorrectionVideoUrl | null>`, es `corr.videoUrl` de la página). El plan listaba solo `modelValue` e `item`, pero la hoja debe contener `CqVideoSheet` (verify) y pedir las URLs; así no abre una segunda instancia de `useConquerApi()`.
3. **`videoUrl` re-lanza el `ConquerApiError`** en fallos reales (503 sin bucket) y devuelve `null` solo si se abortó con `cleanup()`; el detalle lo atrapa y lo muestra en un `Notify` negativo con el `error` en español (el texto fijo "No pudimos abrir el video. Probá de nuevo." si no era un `ConquerApiError`).
4. **Util nueva `localDayOf(iso)`** en `utils/corrections.ts` (+ 3 casos con `it.each` en `corrections.test.ts`): `createdAt`/`repliedAt` son instantes ISO UTC y `shortDate` espera `YYYY-MM-DD`; pasarle el ISO crudo daba `NaN/10`, y cortar los 10 primeros caracteres daba el día UTC (a la noche argentina, el día siguiente). Archivos fuera de la lista del plan, pero el plan pedía `shortDate`.
5. Textos con el tope del API: "hasta {maxSeconds} segundos" y "de {pendingMax}" salen de `limits` (el plan los daba literales 30 y 3).
6. "Video no disponible": se usa el texto fijo de `CqVideoSheet` también para borrado/vencido (el plan lo pide así). No se tocó `CqVideoSheet`: su `log.warn('tutorial video failed')` sigue diciendo "tutorial" aunque ahora lo use también correcciones.
7. Los estilos de la pantalla, la card y la hoja están scoped en sus componentes (molde de `CqVideoSheet`/`CqSaveSheet`), no en `conquer.scss`; ahí solo entró `.cq-chip--nueva`.

## Ambigüedades nuevas (opción más simple)

- Cold open con `loadState()` fallido (estado sigue en `null`): se muestra `store.error` (o "No pudimos cargar Conquer. Probá de nuevo.") con "Reintentar", sin pedir correcciones.
- El chip "Esperando respuesta" usa `cq-chip--rango` (arena), "Nueva respuesta" `cq-chip--nueva` (dorado) y "Respondida" `cq-chip--hecha` (el mismo tono que ya usa Inicio para "Hecha").
- `pending` que se vuelca al store tras `seen` es `data.limits.pending` (fresco, recién cargado), no el viejo `member.corrections.pending`.
- Cerrar el detalle (o abortar) descarta la URL firmada: vive solo en el estado local de la hoja (T-201-156).

## Mutantes razonados (único código con test: `localDayOf`)

Aplicados sobre copias en el scratchpad (`/tmp/claude-1000/-home-franco-projects-el-templo/4c66ed10-5ff0-4f38-96d3-db3556e53b39/scratchpad/m13/`), con un script `node --no-warnings` que replica los `expect`; sin mutar daba "TODO OK" (con `TZ=America/Argentina/Buenos_Aires` y con `TZ=UTC`). Producción intacta (`git status` limpio).

| # | Mutante | Resultado local | `expect` de CI que lo atrapa |
| - | ------- | --------------- | ---------------------------- |
| 1 | sin cero a la izquierda (`padStart` -> `toString`) | `2026-1-5` | `corrections.test.ts` l.166-167 `toBe('2026-01-05')` |
| 2 | sin el chequeo de fecha inválida | `NaN-NaN-NaN` | `corrections.test.ts` l.170-171 `toBe('')` (ambos casos del `it.each`) |
| 3 | mes sin `+ 1` | `2026-09-26`, `2026-00-05` | l.160-163 `toBe('2026-10-26')` y l.167 |

**Mutante que NO se atrapa (honesto):** `getUTC*` en vez de `get*`. CI corre en UTC, donde el día local y el UTC coinciden, así que ningún `expect` lo distingue; el test existe igual como red de regresión de formato. La diferencia de zona se mira a ojo en el UAT (ver abajo). El resto del plan es UI sin tests de componentes (el app no tiene `@vue/test-utils`).

## Gates

`pnpm lint` 0 errores (2 warnings preexistentes ajenos en `boot/axios.ts` y `useSessionPlayer.ts`); `vue-tsc` filtrado por `src/modules/conquer` y `modules/training` vacío (se verificó que `vue-tsc` corre: solo imprime el error preexistente de `boot/__tests__`); prettier OK en todos los archivos propios; greps de higiene (`console.*`, `any`, `v-html`, CDN, `font-family` literal, hex/rgba) vacíos; los dos verify del plan dan OK. Tests escritos y NO corridos.

## Trampas para 202-14 (mandar video + permiso iOS)

1. **Gancho en la pantalla**: dentro de la `CqPortico` de `ConquerCorrectionsPage.vue`, justo después de "Te quedan {n} de {pendingMax}", hay `<!-- 202-14: botón "Mandar video" -->`. Es la única pieza oscura: el botón va con `CqButton variant="on-night"`, deshabilitado si `slots === 0` (`slots` ya está calculado en la página con `remainingSlots`). La hoja de envío es un componente nuevo con raíz `.cq-root` propia y estilos scoped (molde `CqCorrectionSheet`/`CqVideoSheet`).
2. **Tras crear, usar `corr.applyCreated(view)`** (ya suma la corrección arriba de la lista y `limits.pending + 1`) **y además** `store.applyCorrectionCounts({ pending: pending + 1, unseenReplies })` con el `unseenReplies` actual de `member.corrections`: `applyCreated` NO toca el store, y `applyCorrectionCounts` no toca la lista. Son dos pasos, los dos hacen falta para que Inicio y la pantalla coincidan sin releer.
3. **El selector de objetivos** viene en `corr.data.value.targets`; `targetGroups(targets)` agrupa para el `<select>` NATIVO `.cq-select` (los `q-select` se teletransportan y pierden los tokens). Armar el body volviendo al `CorrectionTarget` por `key`: `exerciseId` + `step` o `comboKey`, nunca ambos.
4. **Un q-dialog dentro de la pantalla ya convive con otro**: el detalle abre `CqVideoSheet` apilado y anda; pero la hoja de envío con `persistent` durante la subida debe impedir cerrar con el botón atrás de Android mientras sube.
5. **`corr.markSeen` ya corrió** al pintar la lista; mandar un video no debe volver a llamarlo. Si 202-14 recarga con `corr.load()`, ojo: `load()` incrementa `loadSeq` y `markSeen` volvería a poder correr (solo si hay `replyUnseen` en lo recargado, lo normal es que no).
6. **El cupo se re-valida en el API**: el 409 `CONQUER_CORRECCIONES_TOPE` puede llegar igual; mostrar su `error` en un Notify (el cliente ya deja pasar el copy de los `code` `CONQUER_*`).
7. Subida: `requestCorrectionUpload(mime)` con el MIME de `videoMimeOf`, PUT con `window.CapacitorWebFetch` y EXACTO ese `Content-Type`, sin auth, sin CapacitorHttp ni base64; `durationSec` entero de `checkVideo(...).seconds`. La duración se lee en la pantalla con un `<video>` + `URL.createObjectURL` (acordate de `URL.revokeObjectURL`).
8. **Permiso iOS (hecho concreto)**: `el-templo-app/src-capacitor/ios/App/App/Info.plist` hoy tiene `NSCameraUsageDescription` (dice QR, Desafío de la Barra y fotos del control físico: hay que sumar "videos de tus correcciones de Conquer") y `NSPhotoLibraryUsageDescription`, pero **NO tiene `NSMicrophoneUsageDescription`**. Grabar un video con audio desde la cámara (o `<input type="file" accept="video/*" capture>`) en iOS sin esa clave cierra la app: agregarla en el plist (texto en español). En Android el manifest tiene `CAMERA` pero no `RECORD_AUDIO`/`READ_MEDIA_VIDEO`: revisar si el selector del sistema lo necesita. Hay que dejar anotado que cambian `Info.plist`/manifest, o sea requiere build nativo nuevo (sin `cap sync` en esta cadena).
9. `CqCorrectionSheet` y `CqCorrectionCard` ya quedaron como están: el item nuevo que entra por `applyCreated` aparece en "Esperando respuesta" con su chip y se puede abrir (el detalle pide su video con `who=alumno`).

## Para mirar a ojo en el UAT (202-15)

- Inicio con una respuesta sin ver: fila "Correcciones" con chip "1 nueva" pegado al chevron; con 2, "2 nuevas"; a 390 px el chip y el chevron no se pisan. Al abrir la pantalla y volver con la flecha, el chip ya no está (sin recargar).
- En la pantalla: la tarjeta de la respuesta nueva dice "Nueva respuesta" (dorado) y sigue diciéndolo mientras se queda en la pantalla; al salir y volver pasa a "Respondida".
- Zona horaria: un video mandado a las 22-23 h argentinas debe mostrar el día de ESE día, no el siguiente.
- "Ver video" abre la hoja con spinner y luego reproduce en línea (iPhone sin pantalla completa forzada); con el objeto vencido/borrado dice "Video no disponible"; sin bucket privado configurado en staging sale un Notify con el copy del 503 y la hoja se cierra.
- Un video borrado por el coach: el detalle dice "Tu coach borró el video después de corregirlo." y no ofrece "Ver video".
- Texto de respuesta largo (1000 caracteres) y con saltos de línea: respeta los saltos y no desborda a 390 px; título del detalle (`targetLabel`) largo.
- Hoja de detalle sobre el video: cerrar el video con el botón atrás de Android deja el detalle abierto; cerrar el detalle descarta todo.
- Abrir la pantalla en frío (recarga con la ruta `/training/conquer/correcciones`) con un alumno activo y con uno no activo (debe volver a la tab).
- Vacíos: alumno sin envíos (un solo "Todavía no mandaste ningún video."), solo pendientes y solo respondidas.
- Borde: salir de la pantalla antes de que termine el `seen` aborta la llamada y el contador de Inicio puede quedar viejo hasta releer el estado.

## Known Stubs

El hueco `<!-- 202-14: botón "Mandar video" -->` en la `CqPortico` es intencional (lo resuelve 202-14); no hay datos de mentira.

## Self-Check: PASSED

- Archivos nuevos y modificados presentes; commits `b7f47f499` y `1847ea303` en `git log`.
