---
phase: 214-comunidad-anotados-aura
plan: 15
subsystem: members
tags: [profile-photo, review-queue, aura, D-30, D-31, D-32, D-43, D-46, D-63, D-69]
requires: ["214-14"]
provides:
  - "listPhotoReviewQueue, approveProfilePhoto, rejectProfilePhoto, getOwnPhotoState, PHOTO_REJECTION_PUSH_BODY"
  - "4 rutas del staff bajo /api/admin/members (GET /profile-photos, POST approve, POST reject, DELETE por /:userId)"
  - "GET /auth/me con photoUrl y photo { url, status, pendingUrl, rejectionReason }"
  - "borrar la cuenta quita las fotos y borra los objetos"
affects: ["214-16"]
key-files:
  created:
    - el-templo-api/test/members/profile-photo-admin.test.ts
    - el-templo-api/test/members/_profile-photo-helpers.ts
  modified:
    - el-templo-api/src/modules/members/profile-photo-service.ts
    - el-templo-api/src/modules/members/profile-photo-schemas.ts
    - el-templo-api/src/modules/members/profile-photo-routes.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/src/modules/auth/routes.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - el-templo-api/test/tenancy/iso-03-members-ficha.test.ts
    - el-templo-api/test/tenancy/iso-03-cobertura-members.test.ts
decisions:
  - "La cola devuelve `counts` sobre el conjunto completo (no sobre el tope de 100) con dos consultas `count()`"
  - "La cola solo resuelve el storage si hay filas: con la cola vacia responde 200 aunque R2 no este configurado; con filas y sin storage, 503 FOTO_PERFIL_NO_DISPONIBLE"
  - "Aprobar una pendiente tambien deja en cero los reportes de la fila (no tiene) y no toca otras aprobadas reportadas de origen ficha"
  - "`sendPhotoError` se exporta desde profile-photo-routes.ts y se reusa en el plugin del admin (mismo formato { error, code })"
metrics:
  tasks: 3
  completed: 2026-11-18
---

# Phase 214 Plan 15: revision de fotos por el staff Summary

Circuito del staff completo: cola de revision (pendientes y aprobadas reportadas, reportadas primero, acotada por sede para `admin_sede`), aprobar con 5 puntos una sola vez en la vida (candado = unique del ledger con `reference_id = userId`), rechazar con motivo y aviso push en `anuncios`, quitar la foto visible, `/me` con la foto firmada y su estado, y limpieza de fotos al borrar la cuenta.

## Commits

- `dfc81ff9f` feat(214-15): revision de fotos por el staff (D-31, D-32, D-46) y Aura al aprobar (D-30)
- `e3fa5df0c` feat(214-15): /me con la foto y fotos quitadas al borrar la cuenta
- `c1b0f458b` test(214-15): revision de fotos, /me e ISO-03 de members

## Verificacion

- `npx tsc --noEmit` (API): 0. `pnpm lint:tenant`: DISCREPANCIAS 0 (la primera version del servicio dio 5 por armar el `where` con una variable `scope`: el linter exige `tenantWhere` literal dentro de cada `.where`).
- `pnpm typecheck:tests`: 18 discrepancias de base, identicas antes y despues de los tests nuevos (diff de la salida vacio); 0 errores en `profile-photo-admin.test.ts`, `_profile-photo-helpers.ts`, `iso-03-members-ficha.test.ts`, `iso-03-cobertura-members.test.ts`, `tenant-manifest.ts`, `iso-01-manifiesto.test.ts`. Los 2 "empeorados" (`analytics.test.ts` 2->4, `members.test.ts` 4->5) son los mismos que registro el plan 14, en archivos que este plan no toca.
- Manifiesto: `ENTRADAS_BASELINE` 581 -> 585 (conteo real de claves en el manifiesto: 585). ISO-03 members: `CASOS_BASELINE` 38 -> 42.
- Tests de integracion (`profile-photo-admin.test.ts`, 22 `it`, y los 8 `it` nuevos de ISO-03): escritos, no corridos (quedan para CI: `test/setup.ts` se cuelga en local). Extraccion de claves de `describe` verificada a mano con la misma regex del gate de cobertura.

## Deviations from Plan

- Servicio de rutas: el plan decia resolver el socio en cada handler. Approve y reject lo resuelven dentro del servicio (`assertLiveMember`, 404 indistinguible) y solo `DELETE` lo hace en el handler, antes de llamar a `removeCommunityPhoto`, que no valida existencia. El orden (socio antes de storage) se mantiene.
- Se creo `test/members/_profile-photo-helpers.ts` (fabricas compartidas por el test del staff y por ISO-03) en vez de duplicar `seedPhoto` y compañia; el test del plan 14 no se toco.
- `removeCommunityPhoto` ahora usa un `tryResolveStore` interno comun con los nuevos metodos (refactor sin cambio de comportamiento).

## Decisiones propias

- Acotado por sede: solo `admin_sede` (profes, recepcion y gestion aprueban en todo el gimnasio, como pide el plan). Queda anotado para Franco.
- El rechazo avisa en `anuncios`: si el alumno la tiene apagada o no tiene token de dispositivo, no se encola; se entera al abrir Perfil (`photo.status = rechazada` y `rejectionReason`). Queda anotado para Franco.
- El staff se entera de los reportes por `counts.reported` (sin push al staff).
- `/me`: `status` es `rechazada` si la fila de origen `alumno` mas reciente esta rechazada (aunque siga visible una aprobada anterior); `pendiente` gana sobre todo.

## Notas para los planes siguientes

- Plan de UI del admin: la cola y el badge salen de `GET /api/admin/members/profile-photos` (`items[].url` firmada 2 h, `counts.pending`/`counts.reported`). Los textos del rechazo estan en `PHOTO_REJECTION_PUSH_BODY` (`profile-photo-service.ts`).
- Plan de UI de la app: Perfil lee `GET /auth/me` -> `photo { url, status, pendingUrl, rejectionReason }` y `photoUrl`. `rejectionReason` es el codigo (`sin_cara`, `no_es_propia`, `contenido`, `otro`): la app arma la etiqueta ("Motivo: {etiqueta}.").
- Si en CI falla `profile-photo-admin.test.ts`: mirar primero el push (necesita token de dispositivo via `NotificationService.registerToken` y categoria `anuncios` activa), el orden de las dos reportadas (mismo `uploaded_at`, se compara como conjunto) y la sede B del caso `admin_sede` (queda sembrada, igual que en `admin-sede-scope.test.ts`).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. Las 4 rutas nuevas estan en el manifiesto como `tenant-scoped` y cubiertas por ISO-03.

## Self-Check: PASSED

Los 3 commits y los 2 archivos nuevos existen.
