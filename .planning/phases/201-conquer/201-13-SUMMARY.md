---
phase: 201-conquer
plan: 13
subsystem: api
tags: [conquer, publicacion, galeria, fotos-privadas, admin]
requires: ["201-12"]
provides:
  - "member-service.ts: setPublishPermission"
  - "body-check-service.ts: listChecksForAdmin, getPhotoUrlForAdmin, assertCanViewPhotos, PhotoActor (y export de toView, toComparable, requireOwnActiveMember)"
  - "gallery-service.ts: buildGallery, GalleryItem, GalleryResponse"
  - "4 rutas: PUT /api/members/conquer/publish-permission y GET /api/admin/conquer/{members/:userId/body-checks, members/:userId/body-checks/:checkId/photos/:pose/url, gallery}"
affects: [201-14, 201-20, 201-22]
tech-stack:
  added: []
  patterns: ["variantes admin = chequeo de rol + servicio del alumno con el userId del path (sin duplicar)", "galería en 2 queries con el filtro de contenido en SQL"]
key-files:
  created:
    - el-templo-api/src/modules/conquer/gallery-service.ts
    - el-templo-api/test/conquer/publish.test.ts
    - el-templo-api/test/conquer/body-checks-admin.test.ts
    - el-templo-api/test/conquer/gallery.test.ts
  modified:
    - el-templo-api/src/modules/conquer/body-check-service.ts
    - el-templo-api/src/modules/conquer/member-service.ts
    - el-templo-api/src/modules/conquer/schemas.ts
    - el-templo-api/src/modules/conquer/member-routes.ts
    - el-templo-api/src/modules/conquer/admin-routes.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
decisions:
  - "Manifiesto y ENTRADAS_BASELINE: 503 -> 507 (+4, templo-module)."
  - "listChecksForAdmin y getPhotoUrlForAdmin delegan en listChecks y getPhotoUrl: el control se busca por (checkId, userId del path, tenant), así el cross-ID es 404 sin código nuevo."
  - "El permiso de publicación NO restringe quién ve (A19): solo alimenta el filtro 'autorizados'."
metrics:
  tasks: 2
  commits: 2
---

# Phase 201 Plan 13: Publicación, controles en el admin y galería Summary

El alumno activo activa o retira su permiso de publicación (con "sin cara"), owner y admin ven los controles de un alumno con el comparador y piden la URL firmada de cada foto (de a una, 300 s), y la galería lista a los alumnos con su antes y después filtrable por autorizados.

## Commits

- `61af766b6` feat(201-13): permiso de publicación, controles del alumno en el admin y galería (§6)
- `44c884dec` test(201-13): permiso de publicación, fotos en el admin y galería
- `docs(201-13): summary del plan 13` (este archivo)

## Contratos JSON (los usan 201-20 y 201-22)

### `PUT /api/members/conquer/publish-permission` (alumno)

Body `{ "enabled": boolean, "noFace": boolean }` (ambos obligatorios, sin claves extra; falta uno o tipo mal: 400). Respuesta 200 `{ "enabled", "noFace", "changedAt": "<ISO>" }`. Alumno no activo (sin fila, `pedido`): 409 `{ error, code: "CONQUER_NO_ACTIVO" }` y no escribe nada. Retirar = `enabled: false`. `publish_changed_at = NOW()` lo pone el servidor. `GET /state` ya trae `member.publishEnabled` y `member.publishNoFace` (201-05). El `userId` sale del token (un `userId` en el body se descarta).

### `GET /api/admin/conquer/members/:userId/body-checks` (owner/admin)

Mismo cuerpo que el del alumno (`BodyChecksList`): `{ checks: BodyCheckView[] (más nuevo primero), compare: CheckComparison | null, due: { nextDueDate, due, overdue } }`. `checks` incluye también el control de HOY aunque esté vacío (mismo `listChecks`). Errores: 403 (rol), 404 (alumno sin fila en `conquer_members` del gimnasio, incluye alumnos de otro gimnasio), 400 (`userId` no entero >= 1).

### `GET /api/admin/conquer/members/:userId/body-checks/:checkId/photos/:pose/url` (owner/admin)

200 `{ url, expiresIn: 300 }` (firmada, la misma de la ruta del alumno). Orden: 403 (rol) -> 404 (control que no es de ESE alumno / de otro gimnasio / inexistente) -> 503 `CONQUER_FOTOS_NO_DISPONIBLES` (sin bucket privado) -> 404 (pose sin foto). 400 por `pose` fuera de `frente|perfil|espalda` o ids no enteros.

### `GET /api/admin/conquer/gallery?authorized=true|false` (owner/admin)

Sin el parámetro = todos; `true` = solo `publish_enabled`; `false` = solo los que no. Valor que no es booleano: 400. Respuesta `{ items: GalleryItem[] }` ordenada por apellido, nombre, id:

```json
{ "userId": 7, "firstName": "…", "lastName": "…", "level": "toro",
  "publishEnabled": true, "publishNoFace": true, "publishChangedAt": "<ISO> | null",
  "day0": BodyCheckView | null, "last": BodyCheckView | null, "compare": CheckComparison | null }
```

- Solo alumnos `activo` con al menos un control CON contenido (`checkHasContentSql`); un día 0 vacío no cuenta.
- `day0` = el control con contenido MÁS VIEJO (el "antes"; es el día 0 real si lo hizo). `last` = el MÁS NUEVO, y `null` si el alumno tiene un solo control. `compare` = `compareChecks(day0, last)` o `null` con menos de 2 (el mismo par que `defaultComparePair`).
- Nunca lleva claves de storage ni URLs (solo `photos: { frente, perfil, espalda }` booleanos): las URLs se piden de a una por la ruta de fotos.
- 2 queries (alumnos ⨝ users; controles de esos alumnos con `inArray`), sin N+1.

## Gates corridos

- Pre-flight `node_modules`: OK.
- `npx tsc --noEmit`: OK tras cada tarea y tras cada mutante revertido.
- `pnpm lint:tenant`: `DISCREPANCIAS: 0` (nada en `tenant-lint-allowlist.json`).
- `pnpm typecheck:tests | grep -E "test/(conquer|unit/conquer|migrations/0290)"`: vacío.
- Los dos `verify` automáticos del plan: `V1_OK` y `V2_OK`.
- Higiene (`console.*`, `any`, `map(async`, fechas literales, `userId: <numero>`): sin hallazgos.
- `prettier --write/--check` sobre todo lo tocado (incluido `test/tenant-manifest.ts`: la ruta larga de fotos queda en formato partido).
- Vitest NO se corrió (regla de la fase): los tres tests nuevos y el manifiesto corren en CI.

## Mutantes razonados

Cada uno se aplicó sobre producción, `tsc` compiló y se revirtió con `git checkout -- <ruta>` (árbol limpio verificado).

1. `findOwnCheck` sin `eq(userId)` (cross-ID): falla `body-checks-admin.test.ts:359` (`control de OTRO alumno … 404`: recibiría 200) y `:360` (`presignGet` no debía llamarse); también el equivalente del alumno en `body-checks.test.ts`.
2. Galería sin el filtro `publish_enabled`: fallan `gallery.test.ts:207` (`authorized=true` incluiría a B), `:217` (`authorized=false` incluiría a A) y `:233` (retirar el permiso).
3. Galería sin `checkHasContentSql()`: fallan `gallery.test.ts:246` (solo un día 0 vacío: esperaba `[]`) y `:265` (el día 0 vacío contaría como `day0`).
4. `CONQUER_MANAGER_ROLES` con `coach`: fallan los `it.each` de roles en `gallery.test.ts:313`, `body-checks-admin.test.ts:263` y `:446` (esperan 403). Nota honesta: `canViewConquerPhotos` es el mismo helper que `canManageConquer` (alias), así que ningún test puede distinguir el chequeo explícito de la ruta del guard del plugin mientras coincidan (D-08, comentado en la ruta).
5. `setPublishPermission` sin `publish_changed_at = NOW()`: falla `publish.test.ts:134` (`publishChangedAt` no puede ser null tras activar).

## Desvíos del plan

- Ninguno de fondo. `toView`, `toComparable` y `requireOwnActiveMember` pasaron a `export` en `body-check-service.ts` para reusarlas (no duplicar) desde la galería y el permiso.
- `getPhotoUrlForAdmin` no hace una query extra a `conquer_members`: el control se busca por (checkId, userId, tenant) y eso ya cubre "alumno y control" con 404. `listChecksForAdmin` sí valida la fila en `conquer_members` (si no, devolvería una lista vacía para cualquier usuario).
- El chequeo de rol está en la ruta (`canViewConquerPhotos(request.user)` explícito, 403 `{ error }`) y también en los servicios (`assertCanViewPhotos`, 403) para que el contrato `actor` del plan se cumpla si se reusan fuera de la ruta.

Ambigüedades nuevas (opción más simple):

- `day0`/`last` de la galería: más viejo y más nuevo con contenido, no por `kind` (igual que el comparador de 201-12). Con un solo control, `last = null`.
- `authorized=false` = solo los NO autorizados.
- La galería incluye solo `status = activo` (un pedido pendiente con controles no aparece).
- `changedAt` sale del re-read de la fila (`toISOString()` del `datetime`, igual que `requestedAt`).

## Trampas / notas para los planes siguientes

- 201-22 (admin): el "comparador" de la ficha puede usar `GET …/members/:userId/body-checks` tal cual (mismo shape que el del alumno); las fotos se piden de a una con la ruta `…/photos/:pose/url` y duran 5 min (no cachearlas).
- 201-20 (app): el interruptor de publicación manda SIEMPRE los dos campos (`enabled` y `noFace`).
- Un `userId` extra en el body del alumno se descarta (Fastify `removeAdditional`), no da 400.
- `createConquerStaff(app, "owner" | "gestion" | "admin_sede")` sirve para los tests de roles; el rol sin permiso recibe 403 del `onRequest` del plugin aun sin bucket ni alumno.
- Manifiesto: 507 entradas tras 201-13.

## Known Stubs

Ninguno.

## Self-Check: PASSED

Archivos creados existen (`gallery-service.ts`, `publish.test.ts`, `body-checks-admin.test.ts`, `gallery.test.ts`); commits `61af766b6` y `44c884dec` en `git log`.
