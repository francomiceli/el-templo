---
phase: 202-conquer-tutoriales-correcciones
plan: 08
subsystem: admin
tags: [conquer, tutorials, video, admin, vue, pinia, ffmpeg]
requires:
  - phase: 202-conquer-tutoriales-correcciones
    provides: rutas /api/admin/conquer/tutorials (202-07)
provides:
  - useConquerVideoUpload (prepareMp4 + putToBucket) reusable por la respuesta del coach (202-10)
  - useConquerTutorialsStore (vista compartida Catalogo/Ajustes)
  - ConquerTutorialUpload.vue (subir/ver/reemplazar/borrar)
  - utils/videoDuration.ts (getVideoDuration extraida de useVideoUpload)
affects: [202-10, 202-15]
tech-stack:
  added: []
  patterns:
    - "Composable de video sin Notify: devuelve el mensaje en espanol y la vista notifica"
    - "Las mutaciones devuelven la vista completa y el store la reemplaza con apply()"
key-files:
  created:
    - el-templo-admin/src/utils/videoDuration.ts
    - el-templo-admin/src/composables/useConquerVideoUpload.ts
    - el-templo-admin/src/stores/useConquerTutorialsStore.ts
    - el-templo-admin/src/components/conquer/ConquerTutorialUpload.vue
  modified:
    - el-templo-admin/src/types/conquer.ts
    - el-templo-admin/src/composables/useConquerAdminApi.ts
    - el-templo-admin/src/composables/useVideoUpload.ts
    - el-templo-admin/src/components/conquer/ConquerExerciseEditor.vue
    - el-templo-admin/src/components/conquer/ConquerCatalog.vue
    - el-templo-admin/src/components/conquer/ConquerSettings.vue
key-decisions:
  - "La subida no depende de uploadsEnabled (DA-48): anda tambien en staging"
  - "Sin tope de duracion en tutoriales: prepareMp4 no lee la duracion si no hay maxSeconds"
duration: 35min
completed: 2026-10-27
---

# Phase 202 Plan 08: Admin de tutoriales en video Summary

**Owner/admin suben, ven, reemplazan y borran el video "como se hace" de cada ejercicio (Catalogo) y de los 6 combos (Ajustes); un .mov se convierte a MP4 en el navegador con progreso de conversion y de subida.**

## Commits

| Task | Commit | Mensaje |
| ---- | ------ | ------- |
| 1 | `56042375a` | feat(202-08): datos y subida de video reusable para tutoriales en el admin (D-25, DA-52) |
| 2 | `9c01d161f` | feat(202-08): tutoriales en el Catalogo y en Ajustes de combos del admin (D-25) |

## API para los proximos planes

### `useConquerVideoUpload()` (`composables/useConquerVideoUpload.ts`, para 202-10)

- `phase: Ref<'idle' | 'converting' | 'uploading'>`, `percent: Ref<number>`.
- `prepareMp4(file, { maxBytes, maxSeconds? }): Promise<{ ok: true; file; seconds: number | null } | { ok: false; message }>`.
  Orden: peso original -> tipo (mp4/mov) -> duracion (SOLO con `maxSeconds`; ilegible o `> max + 0.5` es `ok:false`;
  `seconds` = entero 1..maxSeconds) -> conversion con `transcodeToMp4` si no es MP4 -> peso del MP4. La duracion se lee
  ANTES de convertir (un video largo se rechaza sin gastar ffmpeg). Sin `maxSeconds`, `seconds` es `null`.
- `putToBucket(uploadUrl, file)`: `axios.put` pelado con `Content-Type: video/mp4`; tira `Error('No pudimos subir el video. Proba de nuevo')`
  (copy ya en espanol, con tildes en el codigo) y loguea SOLO el status, nunca la URL.
- `reset()` / `cleanup()` (iguales): vuelven a `idle`/0. `prepareMp4` y `putToBucket` ya llaman `reset()` en su `finally`.
  Entre `prepareMp4` y `putToBucket` `phase` esta en `idle`: la vista debe llevar su propio flag `busy` (como hace `ConquerTutorialUpload`).

### Store `useConquerTutorialsStore` (id `conquerTutorials`)

`view`, `loading`, `load()` (silencioso; el log lo hace `useConquerAdminApi.call`), `apply(view)`, `exerciseUrl(id)`, `comboTutorial(key)` -> `{ label, url } | null`.

### Cliente `useConquerAdminApi`

`getTutorials()`, `requestTutorialUpload(input, contentType)`, `confirmTutorial(input, key)`, `deleteTutorial(input)`.
Tipos nuevos en `types/conquer.ts`: `TutorialTarget`, `TutorialTargetInput`, `AdminTutorials`, `TutorialUploadUrl`.
`AdminTutorials.exercises[].url` es `string | null` (superset del contrato del plan, como manda el API de 202-07).

### `ConquerTutorialUpload.vue`

Props `{ target: TutorialTargetInput; name: string; url: string | null; storageReady: boolean; hideStorageNotice?: boolean }`.
Hace todo el flujo y llama `store.apply(view)`; el padre solo le pasa la URL que lee del store.

## Desvios del plan

1. **`hideStorageNotice` (prop extra)**: Ajustes tiene 6 filas; en vez de 6 banners "El almacenamiento de videos no esta configurado" muestra UNO arriba de la card y las filas lo ocultan. En el editor de ejercicio el aviso sale dentro del componente.
2. **Carga fallida de tutoriales**: si `store.load()` falla (`view` null) ni el editor ni Ajustes renderizan el componente (que diria "no configurado" por error): muestran "No pudimos cargar los tutoriales." con "Reintentar".
3. **`$q.notify` (useQuasar) en el componente** en vez de importar `Notify` (patron de los vecinos de `components/conquer`). El composable no notifica (el plan lo pedia).
4. **Duplicacion minima**: `useConquerVideoUpload` tiene su propio `isAcceptedVideo` (mp4/quicktime/extension) porque el plan solo permite cambiar en `useVideoUpload.ts` la extraccion de `getVideoDuration`; `isAcceptedType` ahi es privado. Si se quiere DRY total, exportarlo en un plan aparte.
5. **Comentario del componente** evita escribir el nombre de la constante de ambiente de Ejercicios porque el `verify` hace `! grep -n` sin filtrar comentarios (trampa 8 de 202-02).
6. **Catalogo y Ajustes**: `load()` y `store.load()` corren en paralelo (`Promise.all`) en `onMounted` y en el cambio de `reloadToken`.

## Verificacion

- `pnpm lint` del admin: 0 errores (8 warnings preexistentes ajenos). `vue-tsc` filtrado por `src/components/conquer`, `useConquer*`, `useVideoUpload`, `videoDuration`, `types/conquer`, stores: sin salida (los 63 renglones restantes son preexistentes ajenos).
- `prettier --check` de todos los archivos del plan: OK. `package.json` intacto. Greps de higiene (`console.*`, `any`) vacios. Sin `primary`/`info`.
- Admin sin vitest: sin tests ni mutantes en este plan (UI + composables). Nada corrido contra R2 real.
- `useVideoUpload` (Ejercicios): solo cambia el `import` y se quita la funcion privada; el cuerpo queda identico.

## Para mirar a ojo en el UAT (202-15)

1. Subir un `.mp4` y un `.mov` en Catalogo > Ejercicios (expandir un ejercicio, al final "Video tutorial") y en Ajustes > "Tutoriales de combos": el `.mov` debe mostrar "Convirtiendo... N%" y luego "Subiendo... N%". Ojo con `.mov` de iPhone HEVC: ffmpeg.wasm tarda y puede ser pesado en equipos lentos.
2. Reemplazar (el video nuevo aparece sin recargar) y borrar (dialogo "¿Borrar el tutorial de {nombre}? ..."; vuelve a "Sin video tutorial").
3. Subir en STAGING depende del CORS del bucket publico para PUT desde el origen del admin de staging (lo habilita Franco; no es del ejecutor). Si falla, el toast dice "No pudimos subir el video. Probá de nuevo" y en consola hay un error de red.
4. Sin `R2_PUBLIC_URL`/cliente R2 (`storageReady: false`): botones deshabilitados y banner. Caso borde: una fila existente con URL nula (sin base publica) aparece como "Sin video" y no se puede borrar desde la UI hasta que haya base publica.
5. Con el mismo archivo elegido dos veces seguidas (tras un error) el input se limpia, asi que dispara de nuevo.
6. El `<video>` queda a 320 px maximo con fondo negro (hex literal en `scoped`); revisar a ojo en el expansion-item.

## Known Stubs

Ninguno.

## Self-Check: PASSED

- Archivos creados presentes; commits `56042375a` y `9c01d161f` en `git log`.
