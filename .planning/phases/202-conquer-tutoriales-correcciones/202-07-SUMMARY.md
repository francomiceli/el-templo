---
phase: 202-conquer-tutoriales-correcciones
plan: 07
subsystem: api
tags: [conquer, tutorials, video, r2, fastify, drizzle, admin]
requires:
  - phase: 202-conquer-tutoriales-correcciones
    provides: tabla conquer_tutorials (202-01), video-rules.ts (202-02)
provides:
  - GET /api/members/conquer/tutorials
  - GET, POST upload-url, PUT y DELETE (ejercicio y combo) de /api/admin/conquer/tutorials
  - VideoService.presignPutForKey / headObject / deleteObject (aditivos)
  - tutorialMediaResolver (espiable) y mockTutorialMedia en test/conquer/_helpers.ts
affects: [202-08, 202-11]
tech-stack:
  added: []
  patterns:
    - "Subida directa al bucket PUBLICO reusando VideoService con claves propias (tenant + uuid)"
    - "Reemplazo = upsert por UNIQUE + borrado best-effort del objeto anterior"
key-files:
  created:
    - el-templo-api/src/modules/conquer/tutorial-media.ts
    - el-templo-api/src/modules/conquer/tutorial-service.ts
    - el-templo-api/src/modules/conquer/tutorial-schemas.ts
    - el-templo-api/src/modules/conquer/tutorial-routes.ts
    - el-templo-api/test/conquer/tutorials.test.ts
    - el-templo-api/test/unit/conquer-tutorial-media.test.ts
  modified:
    - el-templo-api/src/modules/admin/video-service.ts
    - el-templo-api/src/modules/conquer/member-routes.ts
    - el-templo-api/src/modules/conquer/admin-routes.ts
    - el-templo-api/test/conquer/_helpers.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
key-decisions:
  - "Deteccion de 'no existe' en VideoService: helper PRIVADO local (isObjectMissingError) replicado de private-media.ts, no exportado: admin no debe importar del modulo conquer y no se tocan lineas de private-media"
  - "La vista del coach trae url nullable tambien en exercises (superset del plan): una fila existente sin R2_PUBLIC_URL sigue visible y borrable"
  - "El 404 de ejercicio lleva code CONQUER_EJERCICIO_NO_ENCONTRADO (el plan no lo definia)"
duration: 40min
completed: 2026-10-27
---

# Phase 202 Plan 07: API de tutoriales en video Summary

**El owner/admin sube un video MP4 (hasta 200 MB) por ejercicio del catalogo y uno por cada uno de los 6 combos al bucket publico, reusando la subida de Ejercicios; reemplazar deja una sola fila y borra el objeto anterior, y el alumno lee todas las URLs con una sola ruta.**

## Commits

| Task | Commit | Mensaje |
| ---- | ------ | ------- |
| 1 | `93c35affb` | feat(202-07): tutoriales de Conquer sobre la subida publica de video-service (D-25, DA-48) |
| 2 | `e898fc355` | feat(202-07): rutas de tutoriales para el alumno y el admin (D-25, DA-49) |
| 3 | `9ebd868ee` | test(202-07): tutoriales: subida, reemplazo, borrado, vista del alumno y aislamiento |
| extra | `070e58c1c` | test(202-07): unitarios de la clave de tutorial, el resolver publico y VideoService por clave |

## Contratos JSON (para 202-08 admin y 202-11 app)

Todas las rutas del admin: guard `canManageConquer` en `onRequest` (solo owner y admin; el resto 403 aun con body invalido).
Todos los errores de negocio salen `{ error, code }` (en espanol). Los 400 de Ajv (campo faltante, tipo, `maxLength`) NO traen `code`.

### `GET /api/members/conquer/tutorials` (app, DA-49)

Pide sesion; NO exige Conquer activo (un socio comun recibe 200). Sin modulo `templo-training` en el gimnasio: 404.

```json
{
  "exercises": [{ "exerciseId": 12, "url": "https://pub.example/conquer/tutorials/1/ejercicio-12-<uuid>.mp4" }],
  "combos":    [{ "comboKey": "push", "url": "https://pub.example/conquer/tutorials/1/combo-push-<uuid>.mp4" }]
}
```

Solo entran los que tienen URL (sin video o sin `R2_PUBLIC_URL` no aparecen: el app NO muestra boton). `exercises` por
`exerciseId` ascendente; `combos` en el orden de `COMBO_KEYS` (`plancha, front, vertical, dominadas, push, pull`) y solo
los cargados. `exerciseId` es el `conquer_exercises.id` (el mismo que trae `GET /today` en cada ejercicio); `comboKey` el de
`ComboView`. El app lo carga UNA vez en el store y arma un `Map`.

### `GET /api/admin/conquer/tutorials` (admin, vista base)

```json
{
  "storageReady": true,
  "exercises": [{ "exerciseId": 12, "url": "https://..." }],
  "combos": [
    { "comboKey": "plancha", "label": "Plancha", "url": null },
    { "comboKey": "front", "label": "Front", "url": "https://..." }
  ]
}
```

- `storageReady` = hay cliente R2 Y `R2_PUBLIC_URL`. Si es `false` el admin NO ofrece subir (la subida daria 503) y avisa.
- `exercises` trae SOLO los ejercicios que ya tienen tutorial (no el catalogo): el admin cruza con su catalogo por `exerciseId`.
  `url` puede ser `null` si hay fila pero falta `R2_PUBLIC_URL` (la fila existe y se puede borrar).
- `combos` SIEMPRE los 6, en el orden de `COMBO_KEYS`, con `label` (`COMBOS[k].label`: Plancha, Front, Vertical, Dominadas, Push, Pull) y `url: null` si no tiene video.

La **misma forma** (`AdminTutorialsView`) devuelven el `PUT` y los dos `DELETE`: el admin REEMPLAZA su estado con esa respuesta.

### `POST /api/admin/conquer/tutorials/upload-url`

Body plano: `{ target: "ejercicio" | "combo", exerciseId?: integer | null, comboKey?: string | null, contentType: string }`.
Requeridos por el schema: `target`, `contentType`. `ejercicio` usa `exerciseId`, `combo` usa `comboKey` (el otro campo se ignora).

200: `{ uploadUrl, key, contentType: "video/mp4", expiresIn: 900, maxBytes: 209715200 }`.
El admin hace `PUT uploadUrl` con `Content-Type: video/mp4` (OBLIGATORIO: la firma lo fija) y despues llama al `PUT /tutorials`
con esa `key`. Orden de errores: 400 `CONQUER_TUTORIAL_OBJETIVO_INVALIDO` -> 404 `CONQUER_EJERCICIO_NO_ENCONTRADO` ("Ejercicio no encontrado") ->
503 `CONQUER_TUTORIALES_NO_DISPONIBLES` ("Los videos tutoriales no están disponibles por ahora") ->
400 `CONQUER_TUTORIAL_TIPO_INVALIDO` ("Subí el tutorial en MP4"). Nada se escribe en la base.

### `PUT /api/admin/conquer/tutorials` (confirma el video)

Body plano: `{ target, exerciseId?, comboKey?, key: string (1..255) }`. 200: `AdminTutorialsView` (con el tutorial ya guardado).
Orden de errores: objetivo 400 -> ejercicio 404 -> storage 503 -> clave 400 `CONQUER_VIDEO_CLAVE_INVALIDA`
("El video no corresponde a este tutorial") -> HEAD: 409 `CONQUER_VIDEO_NO_SUBIDO` ("Todavía no se subió el video") /
400 `CONQUER_VIDEO_INVALIDO` ("El video pesa más de 200 MB o no es MP4"; el servidor BORRA el objeto subido) -> upsert.
Si ya habia tutorial con otra clave, el objeto anterior se borra (best-effort: si falla, 200 igual y queda huerfano).
Un HEAD que falla (red/403) da 503 y no toca nada.

### `DELETE /api/admin/conquer/tutorials/exercise/:exerciseId` y `.../combo/:comboKey`

200: `AdminTutorialsView`. Idempotente: sin fila, 200 SIN tocar el storage (funciona aunque `storageReady` sea false).
Con fila: primero borra el objeto (si falla: 503 `CONQUER_TUTORIALES_NO_DISPONIBLES` y la fila QUEDA, se puede reintentar) y despues la fila.
`:comboKey` fuera de `COMBO_KEYS` -> 400 `CONQUER_TUTORIAL_OBJETIVO_INVALIDO`; `:exerciseId` no entero -> 400 de Ajv (sin `code`);
ejercicio que no es del gimnasio -> 404.

## Manifiesto y tenancy

- Manifiesto de rutas: `ENTRADAS_BASELINE` 527 -> **533** (+6, todas `templo-module / templo-training`; titulo del `it` y linea de fecha actualizados).
- Tenancy: sin tablas nuevas, se mantiene **116 gym-owned / 121 schema**.
- `lint:tenant`: sin entradas nuevas en la allowlist.

## Desvios del plan

1. **`exercises[].url` nullable en la vista del coach** (el plan decia `{ exerciseId, url }`): sin `R2_PUBLIC_URL` el coach igual ve que existe la fila y puede borrarla. La vista del alumno sigue filtrando los nulos.
2. **Code `CONQUER_EJERCICIO_NO_ENCONTRADO`** en el 404 de ejercicio (el plan solo daba el texto).
3. **Deteccion de "no existe" en `VideoService`**: helper local privado `isObjectMissingError` (replica la logica de `private-media.ts`). Se eligio replicar y no exportar: `admin/` no debe importar de `conquer/` y asi `private-media.ts` no cambia. `video-service.ts` solo suma lineas (70 agregadas, 0 borradas; `HeadObjectCommand` es una linea nueva dentro del import).
4. **Test unitario extra** `test/unit/conquer-tutorial-media.test.ts` (no estaba en el plan): regex de `isTutorialKey` (1 vs 11, 3 vs 33, traversal, mov, sufijo), `ready`/`resolve` y `headObject`/`deleteObject` de `VideoService` con doble de S3.
5. `tutorial-schemas.ts`: el comentario evita escribir literalmente `oneOf` porque el `verify` del plan hace `! grep -n "oneOf"` sin filtrar comentarios (trampa 8 de 202-02).
6. `deleteTutorial(fastify, ctx, target, ref)`: `ref` es `number` (ejercicio) o `string` (combo); la ruta pasa el literal `"ejercicio"`/`"combo"`.

## Mutantes razonados

Tests de CI NO corridos (regla del proyecto). Cada mutante se aplico sobre `tutorial-service.ts` (copia en scratchpad, restaurada con `cp`, `git diff` limpio al final) y se razono contra el `expect` del test. Dos mutantes (M1, M3) quedaron ademas con error de `tsc` por el narrowing (artefacto de la mutacion, no una defensa del test); M4 lo atrapa ademas `lint:tenant` (confirmado: 1 violacion no listada).

| # | Mutante | Lo atrapa |
| - | ------- | --------- |
| M1 | No borrar la clave anterior al reemplazar (`if (previousKey !== null && ...)` -> `if (false)`) | `tutorials.test.ts` l.606-607 (`remove` `toHaveBeenCalledTimes(1)` y `toHaveBeenCalledWith(vieja)`) y el de combos (l.623) |
| M2 | Aceptar `video/quicktime` (en `requestTutorialUpload` y en el HEAD) | l.302-307 (400 `TIPO_INVALIDO` + `presignPut` no llamado) y el `it.each` "video/quicktime" l.728-759 (400 `VIDEO_INVALIDO`, `remove` con la clave nueva, sin fila) |
| M3 | Vista del alumno sin filtrar la URL nula (`url ?? ""`) | l.544-559 "sin R2_PUBLIC_URL" (`toEqual({ exercises: [], combos: [] }`)) |
| M4 | `loadTutorialRows` sin `tenantWhere` (la lectura mezcla gimnasios) | l.1237-1255 "cada gimnasio ve solo SUS tutoriales" (`socio2.combos`/`admin2View` verian tambien el `push` del gimnasio 1) |
| M5 | `DELETE` de la fila sin `tenantWhere` | l.1299-1302 "DELETE del combo desde el 2 borra SOLO el del 2" (`readRows()` ya no tendria `[key1]`) |

Unitarios (`conquer-tutorial-media.test.ts`): regex de `isTutorialKey` sin `^` o sin `$` lo atrapan los casos "prefijo delante"/"sufijo detras"; `ready` sin chequear la base publica lo atrapa `R2_PUBLIC_URL = ""` / `"///"`.

## Gates

`npx tsc --noEmit` OK, `pnpm lint:tenant` OK (DISCREPANCIAS 0), `pnpm typecheck:tests` filtrado por `test/(conquer|unit/conquer|migrations/029)` sin salida,
greps de higiene (`any`, `console.`) vacios, `git diff` de `video-service.ts` sin lineas borradas, prettier solo sobre rutas explicitas. Tests NO corridos.

## Trampas para los proximos ejecutores (202-08..14)

1. **Content-Type de la subida**: el `PUT` a `uploadUrl` DEBE llevar `Content-Type: video/mp4` (firmado). Es el bucket publico de Ejercicios: el CORS del admin ya esta (lo usa Ejercicios), no hace falta nada de Franco para tutoriales.
2. **El admin debe mandar MP4**: el API rechaza `.mov`/otro tipo. El admin lo convierte con `transcodeToMp4` (202-08) ANTES de pedir la URL (`contentType` tiene que ser `video/mp4`, y el archivo real tambien: el HEAD mira el tipo guardado en R2).
3. **El `PUT /tutorials` devuelve la vista completa**: el admin reemplaza su estado; no hace falta releer `GET`.
4. **Reemplazar no pisa el objeto**: cada subida tiene clave nueva (uuid). Si el admin sube y NO confirma, el objeto queda huerfano en el bucket (sin fila); es aceptable (no hay job de limpieza).
5. **`assembleVideoUrl` lee `R2_PUBLIC_URL` crudo** (sin sacar barras finales), mientras `storageReady`/`ready` usa `getR2PublicBase()` (normalizada). Si la variable de prod termina en `/`, las URLs saldrian con `//`: es el comportamiento heredado de Ejercicios, no se toco.
6. **Mock de tests**: `mockTutorialMedia({ ready?, unavailable?, head?, remove?, presignPut? })` devuelve `{ head, presignPut, remove }` (espias). `unavailable: true` hace que `resolve` tire el 503 y `ready` de false. Para cambiar de mock dentro de un test: `vi.restoreAllMocks()` y volver a llamar. Restaurar siempre en `afterEach` y `vi.unstubAllEnvs()` (los tests ponen `R2_PUBLIC_URL`).
7. **Gimnasio sin catalogo**: `conquer_exercises` solo esta sembrado en el tenant 1; en el gimnasio 2 cualquier `exerciseId` da 404. Para un tutorial de combo en el gimnasio 2 hay que prender el modulo con `setModuleFlag(app, TENANT_DOS, "templo-training", true)`.
8. **Orden de roles/modulo**: el `onRequest` de rol corre antes que el guard de modulo: un rol sin permiso recibe 403 aun en un gimnasio sin el modulo; para probar el 404 cross-tenant usar owner/admin (`gym2.adminToken`).
9. **Carrera de dos `PUT` simultaneos al mismo objetivo**: el upsert evita filas duplicadas (UNIQUE), pero la lectura de la clave anterior no es atomica; en el peor caso queda un objeto huerfano. No se agrego tx/lock (el uso es de un coach, pocas veces).
10. **Sin R2 en CI**: nada de esto se prueba contra R2 real; el 503 de produccion sin `R2_BUCKET_NAME`/credenciales sale de `tutorialMediaResolver.resolve` (sin `fastify.r2`).

## Known Stubs

Ninguno.

## Self-Check: PASSED

- Archivos creados/modificados presentes (ver `key-files`); commits `93c35affb`, `e898fc355`, `9ebd868ee`, `070e58c1c` en `git log`.
