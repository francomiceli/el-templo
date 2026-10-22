---
phase: 201-conquer
plan: 16
subsystem: app
tags: [conquer, app, types, api-client, store, brand, scss]
requires: ["201-15"]
provides:
  - "modules/conquer/types.ts: espejo exacto de los JSON-schemas de respuesta del API"
  - "composables/useConquerApi.ts: cliente tipado de las 16 rutas del alumno + cleanup(), ConquerApiError, isConquerCanceled"
  - "stores/conquerStore.ts: useConquerStore (state, loading, error, requesting, view, loadState, requestUnlock, applyState, cleanup)"
  - "utils/conquerView.ts y utils/format.ts (puras, con tests)"
  - "styles/conquer.scss: tokens --cq-* y utilidades bajo .cq-root + Cormorant 600/700"
  - "components/brand: CqSky, CqSun, CqCloudButton, CqTemple, CqGreek, CqLevelIcon, CqPageHeader"
  - "public/conquer/portada.jpg"
affects: [201-17, 201-18, 201-19, 201-20]
tech-stack:
  added: []
  patterns: ["ConquerApiError con message apto para el socio y detail para el log", "AbortController por llamada en un Set", "submarca solo bajo .cq-root con variables --cq-*"]
key-files:
  created:
    - el-templo-app/src/modules/conquer/types.ts
    - el-templo-app/src/modules/conquer/composables/useConquerApi.ts
    - el-templo-app/src/modules/conquer/stores/conquerStore.ts
    - el-templo-app/src/modules/conquer/utils/conquerView.ts
    - el-templo-app/src/modules/conquer/utils/format.ts
    - el-templo-app/src/modules/conquer/utils/__tests__/conquerView.test.ts
    - el-templo-app/src/modules/conquer/utils/__tests__/format.test.ts
    - el-templo-app/src/modules/conquer/styles/conquer.scss
    - el-templo-app/src/modules/conquer/components/brand/CqSky.vue
    - el-templo-app/src/modules/conquer/components/brand/CqSun.vue
    - el-templo-app/src/modules/conquer/components/brand/CqCloudButton.vue
    - el-templo-app/src/modules/conquer/components/brand/CqTemple.vue
    - el-templo-app/src/modules/conquer/components/brand/CqGreek.vue
    - el-templo-app/src/modules/conquer/components/brand/CqLevelIcon.vue
    - el-templo-app/src/modules/conquer/components/brand/CqPageHeader.vue
    - el-templo-app/public/conquer/portada.jpg
  modified: []
decisions:
  - "Los mensajes de error al socio: solo el `error` de las respuestas con `code` CONQUER_... (copy en español del servicio); todo lo demás (400 de Ajv en inglés, 5xx, sin red) va con el texto fijo de la acción."
  - "CqSky es la raíz de las pantallas: trae la clase .cq-root, importa conquer.scss y define los márgenes --cq-pad-*."
---

# Phase 201 Plan 16: Base del app de Conquer Summary

Capa de datos tipada (tipos, cliente de las 16 rutas del alumno, store, utils puras con tests) y la submarca de Nacho (tokens `--cq-*` solo bajo `.cq-root`, Cormorant 600/700 del paquete instalado, 7 componentes de marca, portada) para que 201-17..20 armen las pantallas.

## Commits

- `feat(201-16): datos de Conquer en el app (tipos, cliente, store, utils)`
- `feat(201-16): submarca de Conquer — tokens, fuentes, sol, nubes, columnas, letras griegas e íconos (D-09)`
- `docs(201-16): summary del plan 16` (este archivo)

## API pública para 201-17..20

### `types.ts`
Uniones: `Level`, `StepKey`, `CountedStep` (e1|e2|e3), `Mode`, `Unit`, `Estado`, `ComboKey`, `Pose`, `ConquerStatus`. Interfaces: `ConquerStateResponse` (`member: ConquerMemberState | null`, con `home: HomeView` y `bodyCheck: BodyCheckSummary` siempre presentes en `activo`), `PlanWeek`, `PlanDayView`, `HomeView`, `TodayResponse`, `TodayExercise`, `TodayStep`, `TodayRung`, `ComboView`, `ComboRung`, `SaturdayView`, `SaveSessionBody` (+ `SaveSessionExercise`, `ComboEntry`), `SaveSessionResponse`, `ChangeStepBody`, `CalibrationProposal`, `ProgressResponse` (+ `SubirItem`, `ComboSubirItem`, `ProgressDay/Exercise/Step`), `SubirComboResponse`, `BodyCheckView`, `CheckComparison`, `CheckMeasure`, `BodyChecksResponse`, `UpsertBodyCheckBody`, `PhotoUploadResponse`, `PhotoUrlResponse`, `PublishPermission`, `PublishPermissionBody`, `Lighting`.

### `useConquerApi()`
`getState`, `requestUnlock`, `getToday(day?)`, `saveSession(body)`, `changeStep(exerciseId, step, body)`, `getProgress`, `subirStep(exerciseId, step: CountedStep)`, `resolveCalibration(exerciseId, accept)`, `subirCombo(comboKey)`, `upsertBodyCheck(body)`, `listBodyChecks`, `requestPhotoUpload(checkId, pose, contentType)`, `confirmPhoto(checkId, pose, key)`, `getPhotoUrl(checkId, pose)`, `skipDay0`, `setPublishPermission(body)`, `cleanup()`.

- Rutas relativas a `api` (que YA trae `/api`): `/members/conquer/...`.
- Errores: lanza `ConquerApiError` (`message` apto para el Notify, `status`, `code`, `detail` técnico, getter `isExpected` = 4xx con respuesta). Un abort por `cleanup()` se re-lanza como cancelación de axios: se reconoce con `isConquerCanceled(err)` y la vista lo ignora.
- La subida real del archivo a `uploadUrl` (PUT con el mismo `Content-Type`) NO está acá: la hace 201-20 con un axios pelado (sin el header de auth de `api`).

### `useConquerStore`
`state`, `loading`, `error` (texto fijo "No pudimos cargar Conquer. Probá de nuevo." en la carga; en `requestUnlock` el `message` del `ConquerApiError`), `requesting` (bloquea el doble toque, T-201-58), `view` (computed de `resolveConquerView`), `loadState()`, `requestUnlock(): Promise<boolean>`, `applyState(next)`, `cleanup()`. La vista decide el `Notify` con `error`. Solo la última carga aplica su respuesta (`loadSeq`). Los 4xx no se mandan a Sentry.

### Utils
- `resolveConquerView(state)` -> `'cargando' | 'bloqueado' | 'pedido' | 'inicio'` (tipo `ConquerView`).
- `format.ts`: `GREEK_STEP`, `LEVEL_INFO` (`name`, `kicker`, `text`), `unitText(value, unit, unilateral)`, `estadoChip(estado | null)` -> `{ label, tone }` (tipos `EstadoChip`, `EstadoTone`), `effortHint(level, step)`, `failureHint(brazosRectos)`.

### Componentes de marca (`components/brand/`)
| Componente | Props | Notas |
|---|---|---|
| `CqSky` | (ninguna) + slot | Raíz de pantalla: `<div class="cq-root cq-sky">`, importa `conquer.scss`, flex columna con `gap: 16px` y padding `--cq-pad-*` (22/24/22). Con ella de raíz no hace falta nada más para que existan los tokens. |
| `CqSun` | `big: string`, `small: string`, `title?: string`, `caps?: string` + slot (ícono) | Cabecera con sol, montañas y nubes. Sangra hasta los bordes de `CqSky`. Con slot se vuelve "tall" (286 px). `title`/`caps` son los textos sobre el sol (prototipo `hero`). |
| `CqCloudButton` | `label: string`, `loading?`, `disabled?`, `ghost?`, `plain?`; emite `click`; slot debajo del botón | Es el pie de nubes completo (`.cq-foot`) con el botón (`.cq-cta`, 54 px). `loading` deshabilita y pone `aria-busy`. Slot: `<div class="cq-sub">` de ayuda o un segundo `<button class="cq-cta cq-cta--ghost">`. |
| `CqTemple` | `filled: number` (0..3, se recorta), `label?: string` | `role="img"`; sin `label` dice "N de 3 series hechas". |
| `CqGreek` | `step: StepKey` | Letra en círculo dorado, `aria-hidden`. |
| `CqLevelIcon` | `level: Level`, `size: number` | SVG de `bull()`; hereda `currentColor`; "papel" con `--cq-paper` (default `--cq-sky2`; `CqSun` lo pone en crema). |
| `CqPageHeader` | `title: string`, `subtitle?: string`, `backTo?: RouteLocationRaw`, `backLabel?: string` (default "Volver"); emite `back` | Con `backTo` el botón es un `router-link`; sin `backTo` es un `<button>` que emite `back`. Meandro debajo. |

### Utilidades de `conquer.scss` (todas descendientes de `.cq-root`)
`cq-display`, `cq-ital`, `cq-caps`, `cq-sub`, `cq-num`, `cq-rule`, `cq-row`, `cq-grow`, `cq-card` (+ `cq-card--sel`), `cq-toast`, `cq-link`, `cq-chip` (+ `--rango|--techo|--bajo|--subir`), `cq-cta` (+ `--ghost`), `cq-small` (+ `--fill`), `cq-foot` (+ `--plain`), `cq-meander`, `cq-enter` (entrada animada solo con `prefers-reduced-motion: no-preference`). Variables: `--cq-sky1..3`, `--cq-deep`, `--cq-gold`, `--cq-gold-hi`, `--cq-sun`, `--cq-cream`, `--cq-muted`, `--cq-cloud/2/3`, `--cq-ink`, `--cq-ink2`, `--cq-glass`, `--cq-hair`, `--cq-hair2`, `--cq-display`, `--cq-body`, `--cq-subir-bg/ink`, `--cq-pad-x/top/bottom`.

La portada es `/conquer/portada.jpg` (780x975, 73 KB), extraída del base64 `COVER` del prototipo con un script `python3 -I` en el scratchpad (no commiteado).

## Gates corridos

- Pre-flight `node_modules`: OK.
- App: `pnpm lint` 0 errores (2 warnings preexistentes ajenos: `boot/axios.ts`, `useSessionPlayer.ts`), tras cada tarea. `vue-tsc` (binario de et-195-seo) filtrado por `src/modules/conquer`: vacío tras cada tarea.
- Los dos `verify` del plan (greps de funciones, `defineStore('conquer'`, `por lado`, ausencia de `console.`/`any`/`onUnmounted`/Google Fonts/`@fontsource/jost`, nada de `cq-` en `app.scss`/`_brand.scss`, JPEG válido con bytes `FF D8`, sin `color: rgba`): OK.
- `sass` (binario del app) compiló `conquer.scss` y el `<style>` de cada uno de los 7 componentes sin errores.
- `prettier --write` sobre rutas explícitas de los archivos nuevos.
- Vitest NO se corrió (regla de la fase): `conquerView.test.ts` y `format.test.ts` corren en CI.

## Mutantes razonados

`format.ts` solo importa tipos, así que se corrieron en Node 22 sobre copias en el scratchpad con un script que replica los `expect`; producción quedó intacta.

1. `unitText` sin el caso unilateral: el script da `4 reps != 4 por lado`; en CI falla `format.test.ts:34` (`'4 por lado'`), `:35` y `:36`.
2. `effortHint` de Novillo E3 devuelve "Dejá 1 rep": el script da `Dejá 1 rep != Al fallo`; falla `format.test.ts:66` (`['novillo', 'e3', 'Al fallo']`).
3. `effortHint` del hold de Ternero devuelve "Al fallo": falla `format.test.ts:63` (`'Cortá antes del fallo'`).
4. (Razonado) `resolveConquerView` que mande `pedido` a `bloqueado`: falla `conquerView.test.ts:20` (`['pedido', 'pedido']`). Si `activo` no diera `inicio`, falla la fila siguiente del mismo `it.each`.

## Desvíos del plan

Ninguno de fondo. Ambigüedades nuevas (opción más simple):

- **Mensaje de error al socio.** El plan decía "errores re-lanzados con el `error` del API". Pero el 400 de validación de Fastify trae `error: "Bad Request"` (inglés) y los 404/500 genéricos traen `error: "No encontrado"`/`"Error del servidor"`. Decisión: el `error` del API llega al Notify solo cuando la respuesta trae `code` que empieza con `CONQUER_` (son los 409/400 de negocio con copy en español); cualquier otro fallo usa el texto fijo de la acción (T-201-56). El detalle técnico queda en `ConquerApiError.detail` y el store lo manda a `createLogger`.
- `unitText` con segundos y unilateral devuelve "6 s por lado" (el plan solo definía "4 por lado" para reps).
- `estadoChip` acepta `Estado | null` (el hold viene con `estado: null`) y lo muestra neutro "Sin datos".
- `CqSky` es la raíz con `.cq-root` e importa `conquer.scss` (así las pantallas no tienen que acordarse); `CqSun` sumó `title`/`caps` opcionales y `CqPageHeader` el evento `back` cuando no hay `backTo`; `CqCloudButton` trae también `ghost` y `plain` y un slot. Todo es superset del contrato del plan.
- El verde del chip SUBIR es `#bfe3b4` con texto `#14301a` (el prototipo no define verde); los demás tonos usan solo la paleta cálida.
- `store.requestUnlock()` devuelve `Promise<boolean>` y expone `applyState` y `cleanup` (no pedidos, útiles para 201-17/20).
- `Record<string, unknown>` no hizo falta: ningún contrato del alumno trae objetos libres.

## Trampas / notas para los planes siguientes

- Usar `CqSky` como raíz de CADA pantalla; las pantallas con `CqSun` + `CqCloudButton` dependen de que `--cq-pad-*` estén definidos en un ancestro (los define `.cq-root`). Si una pantalla no usa `CqSky`, igual necesita `.cq-root` en un ancestro.
- `CqCloudButton` ES el pie (`.cq-foot`). Para una pantalla con dos botones: uno como `CqCloudButton` y el segundo dentro de su slot como `<button class="cq-cta cq-cta--ghost">`. No envolverlo en otro `.cq-foot`.
- Los hijos directos de `CqSky` quedan separados por `gap: 16px` y las secciones largas necesitan `cq-grow` para empujar el pie abajo.
- Los `@font-face` de Cormorant 600/700 se registran globalmente al cargar el chunk de Conquer. En el UAT (201-24) mirar que los títulos de El Templo en Cormorant (`.text-elegance` usa 400/italic) no cambien de peso después de abrir la tab. El paquete `@fontsource/cormorant-garamond` no trae subset griego: las letras Α Β Γ Ω caen a `Georgia, serif` (mirar cómo se ven en el celular).
- `CqLevelIcon` usa `fill` por `style` con `var(--cq-paper, var(--cq-sky2))`; para otro fondo claro definir `--cq-paper` en el contenedor.
- El store no muestra `Notify`: las vistas deben observar `error` (o el `false` de `requestUnlock`) y notificar. Un abort (`cleanup()`) no setea error.
- Trampa de la 197: si 201-17 monta `BodyFigure` hacerlo con `v-if` ya visible.

## Known Stubs

Ninguno (las pantallas que consumen esta base llegan en 201-17..20).

## Self-Check: PASSED

Los 16 archivos creados existen y los commits `feat(201-16)` (datos y submarca) están en `git log`.
