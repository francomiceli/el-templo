---
phase: 201-conquer
plan: 14
subsystem: api
tags: [conquer, catalogo, escaleras, plantillas, settings, admin]
requires: ["201-13"]
provides:
  - "catalog-admin-service.ts: getCatalogForAdmin, createRung, updateRung, reorderRungs, updateExercise, updateTemplateDay, slugifyRungName (y tipos CatalogAdminView, LadderAdminView, RungAdminView, ExerciseAdminView)"
  - "settings.ts: saveConquerSettings, ConquerSettingsPatch, ConquerSettingName"
  - "8 rutas de admin bajo /api/admin/conquer: GET /catalog, POST /ladders/:ladderId/rungs, PUT /rungs/:rungId, PUT /ladders/:ladderId/order, PUT /exercises/:exerciseId, PUT /template-days/:id, GET /settings, PUT /settings"
affects: [201-23]
tech-stack:
  added: []
  patterns: ["mutaciones en tx con FOR UPDATE primero y vista actualizada como respuesta", "reordenar con posiciones temporales 1000 + i", "validación estructural en el servicio (detrás del 404) con code CONQUER_CATALOGO_INVALIDO"]
key-files:
  created:
    - el-templo-api/src/modules/conquer/catalog-admin-service.ts
    - el-templo-api/test/conquer/catalog-admin.test.ts
    - el-templo-api/test/conquer/settings.test.ts
  modified:
    - el-templo-api/src/modules/conquer/settings.ts
    - el-templo-api/src/modules/conquer/schemas.ts
    - el-templo-api/src/modules/conquer/admin-routes.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
decisions:
  - "Manifiesto y ENTRADAS_BASELINE: 507 -> 515 (+8, templo-module). Total de la fase en el API: 37 rutas."
  - "Las mutaciones de peldaños devuelven la escalera completa (LadderAdminView), la de ejercicio el ExerciseAdminView y la de plantilla el TemplateDayView: el admin reemplaza su estado con la respuesta."
  - "Un peldaño desactivado se puede reactivar siempre; un peldaño usado por alumnos (inUse) SÍ se puede desactivar (el plan solo prohíbe los de la tabla de arranque): el motor ya cae al activo más cercano."
---

# Phase 201 Plan 14: Edición del catálogo y de los parámetros desde el admin Summary

Owner y admin editan por API, sin deploy, todo lo que Nacho valida en la prueba: escaleras y peldaños (renombrar, brazos rectos, unilateral, agregar al final, desactivar, reordenar), tabla de arranque y zonas de cada ejercicio, las plantillas de 2, 3 y 4 días y los tres parámetros `conquer.*`. El catálogo no queda inconsistente: no hay DELETE de peldaños, no se desactiva uno usado en la tabla de arranque ni el último activo, y un ejercicio aparece una sola vez por plantilla.

## Commits

- `1ae343c03` feat(201-14): edición del catálogo y de los parámetros de Conquer desde el admin (D-14)
- `0dd5576d0` test(201-14): edición del catálogo y parámetros de Conquer
- `docs(201-14): summary del plan 14` (este archivo)

## Contratos JSON para el admin (201-23)

Todas bajo `/api/admin/conquer`, guard de plugin `canManageConquer` (owner/admin; el resto 403 antes de validar). Errores de negocio: `{ error, code }`.

### `GET /catalog`

```json
{ "ladders": [ { "id", "code", "name", "sortOrder", "isActive",
    "rungs": [ { "id", "code", "name", "position", "brazosRectos", "unilateral", "isActive", "inUse" } ] } ],
  "exercises": [ { "id", "code", "name", "ladderId", "ladderCode", "unit": "reps|s",
    "muscles": [ { "zone", "role": "principal|secundario" } ],
    "startSteps": [ { "step": "e1|e2|e3|hold", "rung": "<code del peldaño>", "mode": "completa|negativa|hold" } ],
    "sortOrder", "isActive" } ],
  "templateDays": [ { "id", "daysCount", "dayKey", "label", "sortOrder", "finisherText", "exerciseCodes": [3], "openingComboKey": "string|null" } ],
  "zones": [ { "slug", "label" } ] }
```

Peldaños por `position` ascendente (0 = el más difícil). `inUse` = algún escalón de algún alumno apunta al peldaño. `zones` = las 15 del mapa con su nombre en español. La semilla trae 8 escaleras, 12 ejercicios y 9 plantillas (4 + 3 + 2 días).

### Peldaños (las tres devuelven la escalera completa, `LadderAdminView`)

- `POST /ladders/:ladderId/rungs` body `{ name (1-60), brazosRectos, unilateral }` (los tres obligatorios) -> 201. Va al final (el más fácil, `position = max + 1` contando también los desactivados). `code` = slug ASCII del nombre, único en la escalera (`beta`, `beta_2`…).
- `PUT /rungs/:rungId` body con al menos uno de `{ name, brazosRectos, unilateral, isActive }` -> 200. `isActive: false` -> 409 `CONQUER_PELDANO_EN_ARRANQUE` si algún ejercicio de su escalera lo tiene en `start_steps`, o 409 `CONQUER_ESCALERA_VACIA` si es el último activo. El `code` nunca cambia.
- `PUT /ladders/:ladderId/order` body `{ rungIds: number[] }` (TODOS los peldaños de la escalera, sin repetir; índice 0 = el más difícil) -> 200. Lista incompleta, repetida o con ids ajenos: 400 `CONQUER_CATALOGO_INVALIDO`.
- 404: `CONQUER_ESCALERA_NO_ENCONTRADA` / `CONQUER_PELDANO_NO_ENCONTRADO` (inexistente o de otro gimnasio).

### `PUT /exercises/:exerciseId` -> `ExerciseAdminView`

Body con al menos uno de `{ name (1-80), startSteps, muscles }`. `unit` y `ladderId` se descartan. `startSteps`: exactamente 4 (e1, e2, e3, hold, sin repetir), `rung` = `code` de un peldaño ACTIVO de la escalera del ejercicio, `mode` válido, `hold` con modo `hold`; se guarda ordenado e1..hold. `muscles`: zonas de `zones`, rol principal|secundario, sin pares repetidos, al menos una principal (la misma zona como principal y secundaria es válida). Todo inválido: 400 `CONQUER_CATALOGO_INVALIDO` con el detalle en `error`. 404 `CONQUER_EJERCICIO_NO_ENCONTRADO`.

### `PUT /template-days/:id` -> `TemplateDayView`

Body con al menos uno de `{ label (1-40), finisherText (1-200), exerciseCodes }`. `exerciseCodes`: 3 distintos, de ejercicios activos (400 si no). Un ejercicio que ya está en OTRO día con el mismo `daysCount`: 409 `CONQUER_EJERCICIO_REPETIDO` (el mismo ejercicio en una plantilla de otra cantidad de días es válido). 404 `CONQUER_PLANTILLA_NO_ENCONTRADA`. Los alumnos reciben los escalones del ejercicio nuevo en su próximo `GET /today` (creación perezosa).

### `GET /settings` y `PUT /settings` -> `{ settings, ranges }`

```json
{ "settings": { "startOffset": { "ternero": 2, "novillo": 1, "toro": 0 }, "comboWeeksN": 2 },
  "ranges": { "startOffsetTernero": {"min":0,"max":4}, "startOffsetNovillo": {"min":0,"max":4}, "comboWeeksN": {"min":1,"max":8} } }
```

`PUT` body `{ startOffsetTernero?, startOffsetNovillo?, comboWeeksN? }` (al menos uno, enteros dentro del rango; fuera de rango o no entero: 400 de Ajv, sin `code`). Upsert por clave en `tenant_settings`; las claves extra se descartan. `saveConquerSettings` valida el patch ENTERO antes de escribir (400 `CONQUER_PARAMETRO_INVALIDO` si se usa fuera de la ruta). Los alumnos ya activos no cambian: los parámetros se aplican al crear escalones nuevos y al evaluar Subir de los combos.

## Gates corridos

- Pre-flight `node_modules`: OK.
- `npx tsc --noEmit`: OK (tras cada tarea y tras cada mutante revertido).
- `pnpm lint:tenant`: `DISCREPANCIAS: 0`.
- `pnpm typecheck:tests | grep -E "test/(conquer|unit/conquer|migrations/0290)"`: vacío.
- Los greps del `verify` de ambas tareas (6 funciones, `saveConquerSettings`, 8 entradas del manifiesto, sin DELETE de peldaños, sin `any`/`console`, `it.each`, `afterEach`, `test_`, `clearConquerSettings`): OK.
- Higiene (`console.*`, `any`, `userId: <número>`, fechas literales, `map(async`) sobre los dos tests: sin hallazgos.
- `prettier --write` sobre todo lo tocado.
- Vitest NO se corrió (regla de la fase); ambos tests y el manifiesto (515) corren en CI.

## Mutantes razonados

Cada uno se aplicó sobre producción, `tsc` compiló, y se revirtió con `git checkout -- <ruta>` (`git status` sin cambios en `src`).

1. `reorderRungs` sin las posiciones temporales (`1000 + index` -> `index`): reordenar `[c, a, b]` desde a=0, b=1, c=2 intenta poner c=0 mientras a sigue en 0 y rompe el UNIQUE (tenant, escalera, posición) -> 500: falla `catalog-admin.test.ts:533` (`statusCode` 200) y los `expect` de posiciones siguientes.
2. `updateRung` sin `assertNotInStartSteps`: desactivar `straddle` de Palanca daría 200: falla `catalog-admin.test.ts:676` (409) y `:677` (`CONQUER_PELDANO_EN_ARRANQUE`).
3. `updateTemplateDay` sin el chequeo de repetidos (`taken.has(code) && false`): `mixto` con `planche_hold` daría 200: falla `catalog-admin.test.ts:950` (409) y `:951`.
4. `saveConquerSettings` con el rango ensanchado (`min - 100` / `max + 100`): los tests de ruta NO lo atrapan (Ajv frena antes con los mismos rangos), por eso se agregó el `describe` "validación propia del servicio" que llama al servicio directo: fallan `settings.test.ts:302-307` (`comboWeeksN = 9`, `= 0`, `-1`, `5`) con `rejects.toMatchObject({ statusCode: 400 })`.
5. `validateStartSteps` sin la regla "hold con modo hold" (`&& false`): falla el `it.each` "el hold con modo completa" de `catalog-admin.test.ts` (~línea 792, `statusCode` 400 y `code`).
6. `uniqueRungCode` sin sufijo (devuelve siempre `base`): el segundo "Beta" choca con el UNIQUE de `code` -> 500: falla `catalog-admin.test.ts:497` (`second.statusCode` 201) y el `toEqual` de `beta_2`.

Nota honesta: los guards de rol (403) los atrapa el `onRequest` del plugin, no hay chequeo adicional por ruta; si alguien abre `CONQUER_MANAGER_ROLES` a un rol, los `it.each` de roles de ambos tests fallan para ese rol.

## Desvíos del plan

Ninguno de fondo. Detalles de implementación:

- Las mutaciones devuelven la vista actualizada (el plan no fijaba el tipo de retorno): `LadderAdminView` para las 3 de peldaños, `ExerciseAdminView`, `TemplateDayView`. Lo arma `getCatalogForAdmin` (4 + 1 queries) después de la tx; es una operación rara del admin, se prefirió reusar a duplicar un builder.
- La estructura de `startSteps` y `muscles` NO está en el JSON-schema del body (solo tipos): la valida el servicio, así un id ajeno recibe 404 antes que 400 y los errores traen `code` (lección 201-12).
- Agregados fuera de la lista literal del plan: 404 con `code` propio (`CONQUER_ESCALERA_NO_ENCONTRADA`, `CONQUER_PELDANO_NO_ENCONTRADO`, `CONQUER_EJERCICIO_NO_ENCONTRADO`, `CONQUER_PLANTILLA_NO_ENCONTRADA`) y `CONQUER_PARAMETRO_INVALIDO` en el servicio de settings.

Ambigüedades nuevas (opción más simple):

- `position` de un peldaño nuevo = máximo + 1 contando también los desactivados (evita chocar con el UNIQUE y no reutiliza un lugar histórico).
- Un peldaño usado por escalones de alumnos (`inUse`) se puede desactivar: el plan solo prohíbe los de la tabla de arranque. El motor ya resuelve el activo más cercano (`resolveStartRung`, `neighborRung`). Si Nacho quiere bloquearlo, es una línea en `updateRung` usando `loadRungsInUse`.
- Reordenar con una lista que incluye peldaños desactivados es lo esperado (la lista debe ser TODOS los peldaños de la escalera, activos o no).
- Un ejercicio desactivado (`is_active = false`) no se acepta en una plantilla (400); ninguna ruta lo desactiva todavía (no hay edición de `isActive` de ejercicio ni de escalera: fuera del alcance del plan).
- En la semilla, el comentario de `catalog-service.ts` dice "15 días" de plantilla; son 9 (4 + 3 + 2). No se tocó.

## Trampas / notas para los planes siguientes

- 201-23 (UI del admin): reemplazar el estado local con la respuesta de cada PUT/POST; `inUse` y `isActive` sirven para deshabilitar el botón de desactivar con el motivo (arranque / último activo vienen en el 409). La lista de reordenar tiene que mandar TODOS los ids, también los desactivados.
- Los cambios de plantilla no tocan los escalones de alumnos que ya existen: solo se crean los faltantes al próximo `loadMemberContext`.
- Tests que modifiquen el catálogo: `catalog-admin.test.ts` ya tiene `snapshotCatalog`/`restoreCatalog` (foto en `beforeAll`, restauración de peldaños/ejercicios/plantillas en `afterEach`, borra escaleras y peldaños de más). Si otro test edita el catálogo, copiar ese patrón.
- El gimnasio 2 puede tener catálogo propio (`tenantValues({ tenantId: TENANT_DOS }, ...)`); hay que borrarlo en `afterEach` antes de `limpiarSegundoGimnasio` (FK a `tenants`).
- Ajv: `maxLength`/`minProperties` del body dan 400 SIN `code`; solo las validaciones del servicio traen `{ error, code }`.
- Manifiesto: 515 entradas tras 201-14.

## Known Stubs

Ninguno.

## Self-Check: PASSED

Archivos creados existen (`catalog-admin-service.ts`, `catalog-admin.test.ts`, `settings.test.ts`); commits `1ae343c03` y `0dd5576d0` en `git log`.
