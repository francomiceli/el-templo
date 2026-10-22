---
phase: 201-conquer
plan: 12
subsystem: api
tags: [conquer, control-fisico, fotos-privadas, r2, dia-0]
requires: ["201-11"]
provides:
  - "private-media.ts: privateMediaResolver (fail-closed), PhotoStorageUnavailableError, privateCheckPhotoKey, isOwnPhotoKey, CONQUER_POSES, POSE_COLUMN, PHOTO_CONTENT_TYPES, PHOTO_MAX_BYTES"
  - "body-check-rules.ts: checkDue, compareChecks, defaultComparePair"
  - "body-check-service.ts: upsertTodayCheck, requestPhotoUpload, confirmPhoto, getPhotoUrl, listChecks, skipDay0, bodyCheckSummary"
  - "6 rutas del alumno bajo /api/members/conquer/body-checks y member.bodyCheck en GET /state"
  - "test/conquer/_helpers.ts: mockPrivateMedia"
affects: [201-14, 201-20]
tech-stack:
  added: []
  patterns: ["resolver de storage que tira 503 (fail-closed) en vez de devolver null", "404 (propiedad) antes que 503 (storage) antes que 409/400 (estado)"]
key-files:
  created:
    - el-templo-api/src/modules/conquer/private-media.ts
    - el-templo-api/src/modules/conquer/body-check-rules.ts
    - el-templo-api/src/modules/conquer/body-check-service.ts
    - el-templo-api/test/unit/conquer-private-media.test.ts
    - el-templo-api/test/unit/conquer-body-check-rules.test.ts
    - el-templo-api/test/conquer/body-checks.test.ts
  modified:
    - el-templo-api/src/modules/conquer/member-service.ts
    - el-templo-api/src/modules/conquer/member-routes.ts
    - el-templo-api/src/modules/conquer/schemas.ts
    - el-templo-api/.env.example
    - .github/workflows/deploy.yml
    - .github/workflows/deploy-staging.yml
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - el-templo-api/test/conquer/_helpers.ts
decisions:
  - "Manifiesto y ENTRADAS_BASELINE: 497 -> 503 (+6, templo-module)."
  - "El resolver tira PhotoStorageUnavailableError (503, CONQUER_FOTOS_NO_DISPONIBLES) y no devuelve null: el codigo de las rutas no tiene rama 'sin storage' que se pueda olvidar."
  - "upload-url no persiste nada: devuelve la clave y confirm la valida (regex anclada + HEAD) y recien ahi la guarda en la columna de la pose."
metrics:
  tasks: 3
  commits: 3
---

# Phase 201 Plan 12: Control fisico del alumno (fotos privadas y dia 0) Summary

El alumno activo registra su control fisico (3 fotos en un bucket R2 privado con URLs firmadas, 4 perimetros y peso, todo opcional), puede decir "Lo hago despues" con el dia 0, ve el comparador dia 0 vs ultimo, y `GET /state` le dice al app cuando pedir el dia 0 y cuando el control esta vencido. Sin `R2_PRIVATE_BUCKET_NAME` las fotos responden 503 y no existe codigo que use el bucket publico.

## Commits

- `9dea1c7cc` feat(201-12): tienda privada de fotos sin fallback + reglas del control fisico + env
- `879f8b817` feat(201-12): control fisico del alumno con fotos privadas y dia 0 (§6, D-15)
- `f1882785e` test(201-12): control fisico, fotos privadas y dia 0
- `docs(201-12): summary del plan 12` (este archivo)

## Contratos JSON (los usa el app en 201-20)

Todas las rutas son del alumno (`request.user.userId`), requieren token (401) y modulo `templo-training`. Los errores de negocio salen `{ error, code }`.

### `BodyCheckView` (nunca lleva claves ni URLs)

```json
{ "id": 7, "checkDate": "YYYY-MM-DD", "kind": "dia0" | "periodico",
  "photos": { "frente": true, "perfil": false, "espalda": false },
  "armCm": 31.5 | null, "chestCm": null, "shouldersCm": null, "waistCm": null, "weightKg": 70.5 | null }
```

Los numeros son `number` (el servicio convierte los `decimal`), con 1 decimal.

### `member.bodyCheck` en `GET /state` (solo si `status = activo`)

```json
{ "hasDay0": false, "day0Skipped": false, "mustPromptDay0": true, "day0Pending": false,
  "lastCheckDate": null, "nextDueDate": null, "due": false, "overdue": false }
```

- Todo se calcula SOLO sobre controles CON contenido (foto confirmada o alguna medida).
- `mustPromptDay0 = !hasDay0 && !day0Skipped` (el app muestra el control del dia 0). `day0Pending = !hasDay0 && day0Skipped` (aviso fijo en Inicio, D-15).
- `lastCheckDate` = ultimo control con contenido. `nextDueDate = last + 28`, `due = today >= nextDueDate`, `overdue = dias desde last > 42`. Sin ningun control: `nextDueDate null`, `due false`, `overdue false` (lo cubre el dia 0).
- Se calcula con UNA query mas a `conquer_body_checks`; no hay otro `loadMemberContext`.

### Rutas

| Ruta | Body | Respuesta / errores |
|---|---|---|
| `POST /body-checks` | `{ armCm?, chestCm?, shouldersCm?, waistCm?, weightKg? }` (perimetros 10-300, peso 20-400; `{}` permitido) | 200 `BodyCheckView` del control de HOY (lo crea o lo continua; lo que no viene no se toca). 400 por rango/tipo. 409 `CONQUER_NO_ACTIVO` si no es alumno activo |
| `GET /body-checks` | - | `{ checks: BodyCheckView[] (mas nuevo primero), compare: CheckComparison \| null, due: { nextDueDate, due, overdue } }`. `checks` = controles con contenido + el de hoy aunque este vacio |
| `POST /body-checks/skip-day0` | `{}` | 200 `bodyCheck` (las banderas de arriba). 409 `CONQUER_DIA0_HECHO` si ya hay un dia 0 con contenido. 409 `CONQUER_NO_ACTIVO`. Idempotente (conserva la primera fecha) |
| `POST /body-checks/:checkId/photos/:pose/upload-url` | `{ contentType }` | 200 `{ uploadUrl, key, contentType, expiresIn: 600 }`. 404 control ajeno, 503 `CONQUER_FOTOS_NO_DISPONIBLES`, 400 `CONQUER_FOTO_TIPO_INVALIDO` (solo image/jpeg, png, webp) |
| `POST /body-checks/:checkId/photos/:pose/confirm` | `{ key }` (la que devolvio upload-url) | 200 `BodyCheckView` (SIN la clave). 400 `CONQUER_FOTO_CLAVE_INVALIDA`, 409 `CONQUER_FOTO_NO_SUBIDA` (HEAD no encuentra el objeto), 400 `CONQUER_FOTO_INVALIDA` (>8 MB, vacio o tipo fuera de la lista) |
| `GET /body-checks/:checkId/photos/:pose/url` | - | 200 `{ url, expiresIn: 300 }` (firmada con `no-store`). 404 sin foto |

`pose` es `frente` \| `perfil` \| `espalda` (otra cosa: 400 del JSON-schema). Orden de errores en las tres rutas de fotos: control propio (404) -> storage (503) -> estado (400/409).

### `CheckComparison`

```json
{ "from": { "id": 1, "checkDate": "..." }, "to": { "id": 3, "checkDate": "..." }, "weeks": 4,
  "measures": [ { "key": "arm", "label": "Brazo", "from": 30, "to": 31.5, "diff": 1.5 }, "... chest, shoulders, waist, weight" ] }
```

Siempre trae las 5 medidas (para que el app pinte la fila); `diff` es `to - from` con 1 decimal y `null` si falta alguna de las dos. `weeks` = semanas enteras (valor absoluto). El par es "dia 0 vs el mas reciente" entre los controles con contenido; con menos de 2, `compare = null`.

### Flujo de subida (lo que hace el app)

1. `POST /body-checks` con `{}` (o con medidas) la primera vez que saca una foto o guarda -> `id`.
2. `POST .../upload-url` -> PUT del archivo a `uploadUrl` con el mismo `Content-Type`.
3. `POST .../confirm` con la `key` -> el control con `photos.<pose> = true`.
4. Para ver: `GET .../url` cada vez (dura 5 minutos).

## Gates corridos

- Pre-flight `node_modules`: OK.
- `npx tsc --noEmit`: OK tras cada tarea y tras cada mutante revertido.
- `pnpm lint:tenant`: `DISCREPANCIAS: 0` (nada en `tenant-lint-allowlist.json`).
- `pnpm typecheck:tests | grep -E "test/(conquer|unit/conquer|migrations/0290)"`: vacio (el comando completo sigue con su deuda preexistente ajena, `DISCREPANCIAS: 14`).
- `node --no-warnings test/conquer/oracle-check.mjs`: ORACULO OK, SEMILLA OK, MOTOR OK (14785 casos), REGLAS OK.
- Higiene (`console.*`, `any`, fechas literales y `userId: <numero>` en tests de integracion; `r2Bucket` en `private-media.ts`; claves/URLs/medidas en logs): sin hallazgos. Los literales de fecha de `test/unit/conquer-body-check-rules.test.ts` son legitimos (unitario puro).
- `prettier --write/--check` sobre todo lo tocado.
- Los tres `verify` automaticos del plan: OK (el segundo exigia `mustPromptDay0` en `member-service.ts`: esta en el comentario que documenta la bandera, la logica vive en `body-check-service.ts`).
- Vitest NO se corrio (regla de la fase): `body-checks`, los dos unitarios y el manifiesto corren en CI.

## Mutantes razonados

Cada mutante se aplico sobre produccion, `tsc` compilo y se revirtio con `git checkout -- <ruta>` (arbol limpio, verificado). Citas = archivo y linea del `expect` que falla.

1. Resolver con `|| fastify.r2Bucket` (volver al fallback del bucket publico): falla `conquer-private-media.test.ts:37` (`expect(attempt).toThrow(PhotoStorageUnavailableError)` con `R2_PRIVATE_BUCKET_NAME` vacio y `r2Bucket: "bucket-publico"`).
2. `requestPhotoUpload` que resuelve el storage ANTES de buscar el control: falla `body-checks.test.ts:549` (`sin bucket privado y control AJENO`: espera 404 y recibiria 503).
3. `isOwnPhotoKey` sin el `checkId` (`[0-9]+` en su lugar): falla `conquer-private-media.test.ts:128` (`otro control` espera `false`) y `body-checks.test.ts:731/735` (`clave de otro control`: 400 y `head` sin llamar; el mutante la acepta y llama al HEAD).
4. `kind` siempre `periodico`: falla `body-checks.test.ts:294` (el primer control con contenido tiene que ser `dia0`).
5. `skipDay0` que mira todas las filas y no solo las con contenido: falla `body-checks.test.ts:997` (un dia 0 VACIO tiene que poder saltearse: 200).
6. `bodyCheckSummary` sin el filtro de contenido: falla `body-checks.test.ts:1115` (un periodico vacio de hoy no resetea el vencido: `overdue true` y `lastCheckDate` = el viejo).
7. `checkDue` con `>=` en vez de `>` para `overdue`: falla `conquer-body-check-rules.test.ts:42` (a 42 dias `overdue` tiene que ser `false`) y el `it.each` de `body-checks.test.ts` (42 dias).

## Desvios del plan

- El resolver TIRA el 503 en vez de devolver `null` y dejar que la ruta decida: es lo que pide el contrato de `<interfaces>` (`resolve(...)` "TIRA"), y evita ramas `store === null` que se puedan olvidar.
- `POST .../upload-url` no valida `contentType` con `enum` en el JSON-schema (lo valida el servicio, 400 `CONQUER_FOTO_TIPO_INVALIDO`): con `enum` el 400 llegaria antes que el 404/503 y rompe el orden de errores del plan.
- `skip-day0` responde las banderas `bodyCheck` actualizadas (el plan no fijaba el cuerpo); es lo que el app necesita sin pedir `/state` de nuevo.
- Los logs de fallas del storage llevan `{ checkId, pose, errName }`: `errName` es solo el NOMBRE de la clase del error del SDK (sin mensaje), para que un 503 no quede sin diagnostico. Nunca claves, URLs ni medidas.
- En `deploy-staging.yml` el archivo usa fin de linea CRLF: la linea nueva se agrego con CRLF para no reescribir las 1015 lineas del archivo.

Ambiguedades nuevas (opcion mas simple):

- `checkDue` sin ningun control: `nextDueDate null`, `due false`, `overdue false` (el pedido de ese caso es el aviso del dia 0, no un vencimiento).
- "Dia 0 vs mas reciente" = el control con contenido MAS VIEJO contra el MAS NUEVO (por fecha, desempate por id), no por `kind`.
- Reemplazar una foto deja el objeto viejo en R2 (nada se borra, como en la 196); solo cambia la clave guardada.
- `POST /body-checks` solo escribe lo que viene: no hay forma de BORRAR una medida (`null`) desde el alumno; para corregir se pisa el valor.
- Las rutas de fotos no exigen alumno `activo` (solo propiedad del control): el control solo se puede crear siendo activo.

## Trampas / notas para los planes siguientes

- 201-14 (admin) / 201-20 (app): `member.bodyCheck` viene solo con `status = activo`. El app crea el control recien al primer "Sacar foto" o "Guardar" (`POST /body-checks` con `{}` alcanza para obtener el `id`).
- La alerta "Control dia 0 pendiente" / "Control fisico vencido" del tablero sigue usando `checkHasContentSql` (201-09): cambia junto con `checkHasContent`, que usa este plan.
- Para tests que necesiten un control con foto: `mockPrivateMedia()` y el flujo `upload-url` -> `confirm`, o `UPDATE` directo de `photo_front_key`. Los controles pasados se insertan con `insertBodyCheckRow` (`empty: true` para uno sin contenido).
- Fuera de Conquer, `fastify.r2` solo existe si estan las 4 variables `R2_*` del bucket de videos; en un entorno sin ellas las fotos responden 503 aunque `R2_PRIVATE_BUCKET_NAME` este puesto (el cliente S3 se comparte).
- Infra pendiente de Franco: crear los dos buckets privados + CORS y cargar los secrets `R2_PRIVATE_BUCKET_NAME` y `STAGING_R2_PRIVATE_BUCKET_NAME` (ver `user_setup` del plan).
- Manifiesto: 503 entradas tras 201-12.

## Known Stubs

Ninguno.

## Self-Check: PASSED

Archivos creados existen (`private-media.ts`, `body-check-rules.ts`, `body-check-service.ts`, `conquer-private-media.test.ts`, `conquer-body-check-rules.test.ts`, `body-checks.test.ts`); commits `9dea1c7cc`, `879f8b817` y `f1882785e` en `git log`.
