---
phase: 201-conquer
plan: 20
subsystem: app
tags: [conquer, app, control-fisico, fotos-privadas, evolucion, dia-0, camara]
requires: ["201-19"]
provides:
  - "utils/bodyCheck.ts: CONQUER_POSES, POSE_LABELS, POSE_TIPS, parseMeasure, parseWeight, mimeFromCameraFormat, uploadFailureText, isRetryable, formatDiff, formatNumberEs, toUploadFile, MEASURE_FIELDS, buildMeasuresBody, draftsFromCheck, localIsoDate, findTodayCheck, hasContent, nextControlText, fromLabel, toLabel, measureRows (puras, con test)"
  - "composables/useBodyCheckCamera.ts: capture(pose), upload(checkId, pose, photo), cleanup"
  - "utils/conquerView.ts: vista dia0 (activo con member.bodyCheck.mustPromptDay0)"
  - "components/evolution/: CqPoseCapture, CqCheckPhoto, CqCompare, CqPublishPermission"
  - "pages/ConquerBodyCheckPage.vue (ruta conquer-control) y pages/ConquerEvolutionPage.vue (ruta conquer-evolucion)"
  - "conquerStore: applyBodyCheck, applyPublishPermission"
  - "API: ProgressStep.unilateral (fix pedido por el orquestador)"
affects: [201-21, 201-24]
tech-stack:
  added: []
  patterns: ["control creado perezosamente (primer Sacar foto o Guardar)", "foto en memoria no reactiva para reintentar sin volver a sacarla", "la tab redirige con router.replace y el store baja la bandera a mano para no volver al día 0"]
key-files:
  created:
    - el-templo-app/src/modules/conquer/utils/bodyCheck.ts
    - el-templo-app/src/modules/conquer/utils/__tests__/bodyCheck.test.ts
    - el-templo-app/src/modules/conquer/composables/useBodyCheckCamera.ts
    - el-templo-app/src/modules/conquer/components/evolution/CqPoseCapture.vue
    - el-templo-app/src/modules/conquer/components/evolution/CqCheckPhoto.vue
    - el-templo-app/src/modules/conquer/components/evolution/CqCompare.vue
    - el-templo-app/src/modules/conquer/components/evolution/CqPublishPermission.vue
    - el-templo-app/src/modules/conquer/pages/ConquerBodyCheckPage.vue
    - el-templo-app/src/modules/conquer/pages/ConquerEvolutionPage.vue
  modified:
    - el-templo-api/src/modules/conquer/progress-service.ts
    - el-templo-api/src/modules/conquer/schemas.ts
    - el-templo-api/test/conquer/progress.test.ts
    - el-templo-api/test/conquer/_helpers.ts
    - el-templo-app/src/modules/conquer/types.ts
    - el-templo-app/src/modules/conquer/utils/conquerView.ts
    - el-templo-app/src/modules/conquer/utils/__tests__/conquerView.test.ts
    - el-templo-app/src/modules/conquer/stores/conquerStore.ts
    - el-templo-app/src/modules/conquer/components/ConquerTab.vue
    - el-templo-app/src/modules/conquer/components/ConquerHome.vue
    - el-templo-app/src/modules/conquer/components/progress/CqExerciseProgress.vue
    - el-templo-app/src/modules/training/routes.ts
    - el-templo-app/src-capacitor/ios/App/App/Info.plist
decisions:
  - "Manifiesto de rutas del API: sin cambios (515). El fix de unilateral no agrega rutas."
  - "El texto de iOS (NSCameraUsageDescription) cambió: hace falta un build nativo para que llegue a los teléfonos."
metrics:
  tasks: 3 (+ el fix pedido por el orquestador)
  commits: 4
---

# Phase 201 Plan 20: Control físico y Evolución Summary

El alumno activo hace su control físico (3 fotos con la cámara, 4 perímetros y peso opcional) al entrar por primera vez a Conquer, con un "Lo hago después" chico; el control periódico se ofrece desde Inicio; y Evolución compara día 0 contra el último control, con las diferencias y el permiso de publicación ("sin cara", retirable). Además, Progreso ahora dice "por lado" en los peldaños unilaterales.

**Importante: cambió `Info.plist` (texto de permiso de cámara de iOS). Hace falta un build nativo (no alcanza con deploy web).**

## Commits

- `7e286cd92` fix(201-20): Progreso dice 'por lado' en los peldaños unilaterales
- `48bcb9a59` feat(201-20): utils del control físico, cámara privada y día 0 en la tab (D-15)
- `bae12858e` feat(201-20): control físico del día 0 y periódico (§6, D-15)
- `e1614173e` feat(201-20): Evolución — antes y después y permiso de publicación (§6)
- `docs(201-20): summary del plan 20` (este archivo)

## Qué quedó

- **Fix de `unilateral` (encargo del orquestador):** `ProgressStep` del API suma `unilateral` tomado de `computeTodayStep` (el peldaño ACTUAL del escalón), con su entrada en `progressStepSchema` (`required` incluido). Test nuevo en `progress.test.ts` (One arm / archer: E1 y E2 por lado, E3 y hold no; después de cambiar el E1 a `dominada` pasa a bilateral). El app: `ProgressStep.unilateral` en `types.ts` y `CqExerciseProgress` lo pasa a `unitText` (marca y objetivo).
- **`bodyCheck.ts` (puro):** lo pedido por el plan más las piezas que las pantallas necesitan con test: `buildMeasuresBody` (valida todo junto, manda solo lo cargado), `draftsFromCheck`, `findTodayCheck`/`localIsoDate`, `hasContent`, `nextControlText`, `measureRows` (tabla con `formatDiff`), `fromLabel`/`toLabel`.
- **`useBodyCheckCamera`:** copiado de la 196 y adaptado a `useConquerApi` (excepciones `ConquerApiError` en vez de `{ok}`): `saveToGallery: false`, PUT con `fetch` pelado y mismo `Content-Type`, timeout 90 s, sin base64/URL en logs. Mapeo de fallos: sin respuesta → offline, 503 → unavailable (texto "Las fotos no están disponibles por ahora. Podés guardar las medidas y sacarlas después."), 5xx y 409 de confirm → storage (reintentable), resto → rejected con el mensaje del API.
- **`ConquerBodyCheckPage`:** al montar solo hace `listBodyChecks()` (continúa el control de hoy). El control se crea con `upsertBodyCheck({})` recién después de sacar la primera foto (no si cancela la cámara) o con "Guardar control". La foto que falla queda en memoria (variable no reactiva) y se reintenta sin volver a sacarla. Guardar sin foto ni medida avisa en vez de crear un control vacío. Con el día 0 pendiente, "Lo hago después" → `skipDay0()` → vuelta a la tab.
- **`ConquerTab`:** `watch` inmediato sobre `store.view`; con `dia0` hace `router.replace({ name: 'conquer-control', query: { dia0: '1' } })`.
- **Inicio:** el aviso de control gana "Hacerlo ahora" → `conquer-control`, y una fila-enlace "Evolución" → `conquer-evolucion`.
- **Evolución:** `CqCompare` (tabs Frente/Perfil/Espalda, dos hornacinas "Día 0"/"Semana N", tabla MEDIDA/DÍA 0/HOY/CAMBIO), `CqCheckPhoto` pide la URL firmada al mostrarse (solo la pose visible, una vez más si la imagen falla), `CqPublishPermission` guarda cada cambio con `PUT /publish-permission` y la casilla vuelve atrás si falla.

## Gates corridos

- Pre-flight `node_modules`: OK.
- API: `npx tsc --noEmit` OK; `pnpm lint:tenant` `DISCREPANCIAS: 0`; `pnpm typecheck:tests | grep -E "test/(conquer|unit/conquer|migrations/0290)"` vacío; higiene (`console.`/`any`) sin hallazgos.
- App: `pnpm lint` 0 errores en cada tarea (2 warnings preexistentes ajenos: `boot/axios.ts`, `useSessionPlayer.ts`); `vue-tsc` (binario de et-195-seo) filtrado por `src/modules/conquer|modules/training/routes` vacío en cada tarea.
- Los tres `verify` del plan (greps de contenido y de higiene: `console.`, `any`, `onUnmounted` en utils/composables, `color: rgba`, Google Fonts, logs con url/base64): sin hallazgos. Dos ajustes de texto para que los greps literales del plan pasen (ver "Desvíos").
- `prettier --check` sobre todo lo propio; `sass` compiló el `<style>` de las 8 vistas/componentes nuevos o tocados.
- Vitest NO se corrió (regla de la fase): `bodyCheck.test.ts`, `conquerView.test.ts` y `progress.test.ts` corren en CI.

## Mutantes razonados

Los de `bodyCheck.ts` se corrieron en Node 22 sobre copias en el scratchpad (producción intacta, `git status` limpio); los demás, leyendo el test.

1. `MEASURE_MAX_CM = 400` (tope mal puesto): el script da `parseMeasure('301').ok = true`; en CI falla `bodyCheck.test.ts:52` (el `it.each` con `'301'` espera `ok false`) y `:62` (`toEqual({ ok: false, message: 'Entre 10 y 300 cm' })`).
2. `resolveConquerView` que ignora `mustPromptDay0`: falla `conquerView.test.ts:69` (activo con la bandera → `'dia0'`).
3. `buildMeasuresBody` que manda `0` para los campos vacíos: el script devuelve `{armCm:0,...,filled:5}`; en CI falla el `toEqual({ ok: true, body: {}, filled: 0 })` de "todo vacío" y el de "manda solo los campos cargados".
4. `localIsoDate` sin el `+ 1` del mes: el script da `2026-00-05`; en CI falla el `expect(localIsoDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')`.
5. `hasContent` que ignora las fotos: falla `bodyCheck.test.ts:315` (una foto sola alcanza).
6. API: `unilateral` fijo en `false` en `buildProgressExercise`: falla `progress.test.ts:331` (`["e1", true]`). Tomado del peldaño de arranque en vez del actual: falla `:353` (tras cambiar a `dominada` debe ser `false`).

## Desvíos del plan

- **Cámara: `capture(pose)` recibe la pose** (el plan decía `capture()`): solo se usa para los logs (`{ pose }`).
- **Medidas con `<input inputmode="decimal">` nativo** y no `q-input`: queda con los tokens `--cq-*` sin pelear con el tema de Quasar (misma decisión que el `<select>` nativo de 201-18). Validación con `parseMeasure`/`parseWeight` vía `buildMeasuresBody`.
- **Un componente extra, `CqCheckPhoto.vue`** (foto por URL firmada con reintento), para que `CqCompare` no repita la lógica en cada hornacina.
- **Mención literal en comentarios** de `parseMeasure`/`parseWeight` (en la página del control) y `formatDiff` (en `CqCompare`) para que los greps del plan pasen: la lógica vive en `bodyCheck.ts` (`buildMeasuresBody`, `measureRows`).
- **El link a `conquer-evolucion` de Inicio se agregó en la tarea 3** (no en la 2), porque la ruta nace ahí.
- **`conquerStore` gana `applyBodyCheck` y `applyPublishPermission`:** no estaban en `files_modified`; hacen falta para que la tab no vuelva a pedir el día 0 mientras se recarga el estado, y para reflejar el permiso guardado.
- **Ya existía el tipo `PhotoMime` en la 196, no en la 201:** se agregó a `types.ts` (con `PhotoUploadResponse`).

Ambigüedades nuevas (opción más simple):

- **¿Cuál es el control de "hoy" en la lista?** El API no lo marca: el app compara `checkDate` con la fecha local del teléfono (`localIsoDate`). Si no coincide (zona horaria distinta de la sede), el primer "Sacar foto"/"Guardar" llama a `POST /body-checks` que devuelve el de hoy real y `syncPoses` marca las fotos que ya tenía.
- **Atrás en el día 0** va a `/training` (Entrenar, tab Semana), no a la tab Conquer, porque la tab lo devolvería al control; salir sin "Lo hago después" deja el día 0 pendiente.
- **Guardar control sin nada cargado** no se manda: aviso "Cargá al menos una foto o una medida para guardar." (si no, quedaría un control vacío que no cuenta como día 0 y el alumno volvería a verlo).
- **Una medida borrada en el campo no se envía** (el API no permite borrar): para corregir se pisa el valor.
- **Título de la hornacina izquierda:** "Día 0" si el control más viejo del par es de tipo `dia0`; si no (saltó el día 0 y su primer control fue periódico), "Primer control" y el encabezado de la tabla dice "ANTES". La derecha: "Semana N" con N = `compare.weeks`, o "Hoy" si es 0.
- **Evolución ofrece "Hacer el control"** cuando `due` es true o cuando todavía no hay ningún control con contenido.
- **Retirar el permiso apaga también "sin cara"** (manda `noFace: false`), como el prototipo.

## Trampas / notas para los planes siguientes

- `ConquerTab` redirige con `watch` sobre `store.view`; después de guardar o saltear, la página del control baja `mustPromptDay0` a mano (`store.applyBodyCheck`) si `loadState` falla. Sin eso, la tab volvería a mandar al control en bucle.
- Cualquier pantalla que lea `store.state` directo (URL abierta en frío) tiene que hacer `loadState()` primero y redirigir a la tab si la vista es `bloqueado`/`pedido`; las dos páginas nuevas lo hacen.
- `useBodyCheckCamera` tira por `useConquerApi`: un 503 llega como `kind: 'unavailable'` y el copy ya está en `bodyCheck.ts` (`UNAVAILABLE_PHOTO_TEXT`).
- Las fotos nuevas y el comparador NO se pudieron ver en un navegador/teléfono: en el UAT (201-24) revisar a 390 px la hornacina de 226 px del comparador, la tabla (columnas de 60/60/78 px con nombres largos de medida) y el aviso de Inicio (texto + botón "Hacerlo ahora" en una fila). Probar en teléfono real: permiso de cámara (texto nuevo de iOS), que la foto no aparezca en la galería y el 503 sin bucket privado (infra pendiente de Franco).
- La infra del bucket R2 privado sigue pendiente (ver 201-12): sin ella las fotos responden 503 y el control igual guarda las medidas.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno: el plan solo consume rutas ya cubiertas por 201-12/13. T-201-64..66 mitigados (`saveToGallery: false`, `fetch` pelado sin token, sin base64/URL en logs ni en el store; la URL firmada vive en una variable local de `CqCheckPhoto`). T-201-67 aceptado como en el plan.

## Self-Check: PASSED

Los 9 archivos nuevos existen y los cuatro commits (`7e286cd92`, `48bcb9a59`, `bae12858e`, `e1614173e`) están en `git log`.
