---
phase: 214-comunidad-anotados-aura
plan: 29
subsystem: admin-fotos-datos
tags: [admin, fotos, aura, badge, D-31, D-45, D-46, D-69]
requires: ["214-28"]
provides:
  - "useProfilePhotosApi: listQueue, approve, reject(reason), remove (tipos ProfilePhotoQueue, ProfilePhotoQueueItem, PhotoRejectionReason)"
  - "adminStore.photoReviewCount y fetchPhotoReviewCount (pending + reported, o items.length si falta counts)"
  - "NavBadge 'fotos' y case 'fotos' en badgeCount de AdminLayout"
  - "AURA_AMOUNTS.profilePhoto = 5 en el admin (espejo de la API)"
affects: ["214-30"]
key-files:
  created:
    - el-templo-admin/src/config/aura-amounts.ts
    - el-templo-admin/src/composables/useProfilePhotosApi.ts
  modified:
    - el-templo-admin/src/stores/useAdminStore.ts
    - el-templo-admin/src/config/templo-config.ts
    - el-templo-admin/src/layouts/AdminLayout.vue
metrics:
  tasks: 2
  completed: 2026-11-18
---

# Phase 214 Plan 29: Datos del admin para revisar fotos Summary

El admin tiene el cliente tipado de la cola de fotos (lista con `counts`, aprobar, rechazar con motivo, quitar), el contador `photoReviewCount` en el store y la pelotita `fotos` cableada en `badgeCount`. El contador se refresca al montar el layout y en cada cambio de ruta, para todo el staff (`ALL_STAFF_ROLES`, igual que `MEMBER_ROLES` de la API). El ítem del menú y la página quedan para el plan 30.

## Commits

- `45ba99c58` feat(214-29): datos del admin para revisar fotos
- `6c555beaf` feat(214-29): pelotita de fotos por revisar

## Verificación

- `pnpm lint` (admin): 0 errores, 8 warnings previos ajenos.
- vue-tsc (admin): 36 errores, igual a la línea de base; ninguno en los archivos tocados.
- Greps del plan en verde. Sin tests (el admin no tiene vitest en local; el plan no pedía tests).

## Deviations from Plan

None - plan executed exactly as written.

## Decisiones propias

- Se agregó un `canSeePhotoReview` en `AdminLayout.vue` (computed sobre `ALL_STAFF_ROLES`) para la condición de roles: los otros contadores tienen la suya y el plan pedía "para los roles de `ALL_STAFF_ROLES`".
- `fetchPhotoReviewCount` instancia `useProfilePhotosApi()` dentro de la acción (el composable no guarda estado), y en fallo deja 0 como `fetchConquerRequestsCount`. Es el comportamiento que pidió el plan, aunque `fetchOficinaBadge` conserva el valor previo: un fallo transitorio apaga la pelotita hasta el siguiente refresco.
- El cliente no usa logger: no captura errores, los propaga a quien llama (404 foto ya procesada, 503 sin almacenamiento) para que la página del plan 30 los traduzca.
- Se agregó `ProfilePhotoOrigin` y `ProfilePhotoStatus` como tipos con nombre y los tipos de respuesta de aprobar y rechazar.

## Known Stubs

Ninguno. La pelotita no se ve hasta que el plan 30 agregue el ítem del menú con `badge: 'fotos'`.

## Threat Flags

Ninguno. T-214-29-01: la UI no decide permisos; el servidor exige `MEMBER_ROLES` y acota al `admin_sede`.

## Self-Check: PASSED
