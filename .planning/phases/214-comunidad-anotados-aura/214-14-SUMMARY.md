---
phase: 214-comunidad-anotados-aura
plan: 14
subsystem: members
tags: [profile-photo, r2, member-photos, D-30, D-33, D-34, D-43, D-45, D-50, D-63]
requires: ["214-13"]
provides:
  - "requestProfilePhotoUpload, confirmProfilePhoto, removeCommunityPhoto, reportProfilePhoto, resolveCommunityPhotos"
  - "4 rutas del alumno bajo /api/members (profile-photo/upload-url, confirm, DELETE, profile-photos/:photoId/report)"
  - "RATE_LIMITS.photoReport (20/min por IP)"
affects: ["214-15"]
key-files:
  created:
    - el-templo-api/src/modules/members/profile-photo-service.ts
    - el-templo-api/src/modules/members/profile-photo-schemas.ts
    - el-templo-api/src/modules/members/profile-photo-routes.ts
    - el-templo-api/test/members/profile-photo.test.ts
  modified:
    - el-templo-api/src/modules/shared/rate-limits.ts
    - el-templo-api/src/app.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
decisions:
  - "Confirmar una clave que ya tiene fila no pendiente (aprobada, rechazada, etc.) responde 409 FOTO_PERFIL_YA_PROCESADA: el schema de respuesta solo admite status pendiente"
  - "Los errores con código se serializan como { error: mensaje, code } con un sendPhotoError local (handleServiceError no serializa el code)"
  - "El dueño puede reportar su propia foto (el plan no lo prohíbe): solo entra a la cola del staff"
  - "resolveCommunityPhotos sin storage devuelve Map vacío con un único warn por proceso"
metrics:
  tasks: 3
  completed: 2026-11-18
---

# Phase 214 Plan 14: foto propia del alumno Summary

Circuito del alumno para su foto de perfil: pedir URL de subida aceptando las normas (`acceptedRules: true` obligatorio), subir directo al bucket privado, confirmar con HEAD (queda `pendiente`), quitar la foto propia y la de ficha (D-63), reportar la foto de otro socio (un reporte por persona) y `resolveCommunityPhotos` de solo lectura, siempre con URL firmada.

## Commits

- `db4b744fb` feat(214-14): servicio de foto propia del alumno
- `3139707a0` feat(214-14): rutas de foto propia del alumno (D-30, D-34, D-45, D-50)
- `f2b4d53a6` test(214-14): circuito de foto propia del alumno

## Verificación

- `npx tsc --noEmit` (API): 0. `pnpm lint:tenant`: DISCREPANCIAS 0.
- `pnpm typecheck:tests`: sigue en rojo por deuda ajena (14 nuevos y 2 empeorados en archivos que este plan no toca); 0 errores en `profile-photo.test.ts`, `tenant-manifest.ts` e `iso-01-manifiesto.test.ts`.
- `ENTRADAS_BASELINE`: 577 -> 581 (valor real verificado: 576 claves `METODO /` más `OPTIONS *`). Título del `it` y línea de historia actualizados.
- `profile-photo.test.ts` (30 `it`): escrito, queda para CI (`test/setup.ts` se cuelga en local).

## Deviations from Plan

- La confirmación idempotente: si la clave ya tiene fila y no está `pendiente`, 409 `FOTO_PERFIL_YA_PROCESADA` (el plan solo decía "no duplicar"; el schema de respuesta fija `status: pendiente`).
- `sendPhotoError` local en las rutas (el plan citaba `handleServiceError`, que descarta el `code`, y el test 3 afirma `FOTO_PERFIL_NO_DISPONIBLE`). Los errores sin código siguen por `handleServiceError`.
- Tests extra respecto del listado: aprobada existente + subida nueva, DELETE sin fotos, DELETE sin storage, reporte de foto de ficha, `photoId` inexistente/inválido, pendiente que no tapa a la aprobada, aislamiento con el gimnasio 2 en `resolveCommunityPhotos`.

## Notas para los planes siguientes

- Plan 15: `removeCommunityPhoto(fastify, ctx, userId, removedBy)` acepta `removedBy = null` (borrado de cuenta) y no falla sin storage; `resolveCommunityPhotos(fastify, ctx, userIds, { expiresSec })` devuelve `Map<userId, { url, photoId }>`; la foto reportada sigue `aprobada`, `reporter_ids`/`report_count` quedan listos para la cola.
- `test/members/profile-photo.test.ts` usa `ALTER TABLE users AUTO_INCREMENT = 54321` (vía `app.dbPool.query`) para el barrido del id; si el sentinel de tenancy lo objeta en CI, reemplazarlo por un id grande sembrado a mano.
- La app debe recortar y recodificar el JPEG (canvas, ~480 px) antes de subir: el servidor no recodifica, así que EXIF/GPS dependen de eso (D-39, T-214-14-09).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno.

## Self-Check: PASSED

Los 3 commits y los 4 archivos nuevos existen.
