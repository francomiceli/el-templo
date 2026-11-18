---
phase: 214-comunidad-anotados-aura
plan: 30
subsystem: admin-fotos-pantalla
tags: [admin, fotos, aura, router, menu, D-31, D-32, D-45, D-46, D-63, D-69]
requires: ["214-29"]
provides:
  - "FotosPerfilPage.vue: Pantalla 7 (cola de fotos pendientes y reportadas, aprobar, mantener, rechazar con motivo, quitar)"
  - "Ruta /alumnos/fotos (antes de alumnos/:userId) e ítem Fotos en Gestión con la pelotita 'fotos'"
affects: ["214-31"]
key-files:
  created:
    - el-templo-admin/src/pages/FotosPerfilPage.vue
  modified:
    - el-templo-admin/src/router/routes.ts
    - el-templo-admin/src/config/templo-config.ts
metrics:
  tasks: 2
  completed: 2026-11-18
---

# Phase 214 Plan 30: Página de revisión de fotos del admin Summary

El staff tiene la pantalla para revisar fotos de perfil: una grilla con las reportadas primero y las pendientes después. Cada card muestra foto (que se amplía a 480), nombre completo, "Ver ficha", sede, fecha y estado. Las pendientes se aprueban sin diálogo o se rechazan eligiendo uno de los cuatro motivos; las reportadas se mantienen sin diálogo o se quitan con diálogo. El ítem "Fotos" quedó en Gestión, debajo de "Alumnos", con su pelotita.

## Commits

- `f9f8ad456` feat(214-30): página de revisión de fotos (D-31, D-32)
- `8447f6a00` feat(214-30): ítem Fotos en Gestión

## Verificación

- `pnpm lint` (admin): 0 errores, 8 warnings previos ajenos.
- vue-tsc (admin): 36 errores, igual a la línea de base; ninguno en `FotosPerfilPage`, `router/routes` ni `templo-config`.
- Greps de textos exactos del UI-SPEC en verde (12 textos). Sin tests (el admin no tiene vitest en local; el plan no pedía tests). La página nunca se vio renderizada.

## Deviations from Plan

None - plan executed exactly as written.

## Decisiones propias

- "Reportada" se decide por `status === 'aprobada'` (la cola solo trae aprobadas si tienen reportes) y "Pendiente" por `status === 'pendiente'`. El orden dentro de cada grupo es el del servidor.
- Las fechas ("Subida el 17/11 a las 18:04", "Último reporte: 17/11 18:04") se formatean con `Intl` en la zona de la sede de la foto (`BranchOption.timezone`) y caen en `America/Argentina/Buenos_Aires` si no se conoce.
- Si `getBranches()` falla, la cola se sigue pudiendo revisar y cada card dice "Sin sede" (warning en el logger). Una foto sin `branchId` también dice "Sin sede".
- Un fallo distinto de 404 o 503 en una acción avisa con notify negativo ("No pudimos aprobar/rechazar/quitar la foto.") y deja la card. Tras un 404 se recarga la cola y se refresca la pelotita.
- Cada card tiene un estado "ocupado" propio (deshabilita sus botones mientras va la acción) y los diálogos quedan `persistent` mientras guardan.
- La foto sin nombre ni apellido se muestra como "Alumno #id".

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-214-30-01: la ruta lleva `allowedRoles` (los mismos que la ficha) y el servidor exige `MEMBER_ROLES` y acota al `admin_sede`. T-214-30-02 aceptado: el apellido completo lo ve solo el staff.

## Pendiente para el UAT

- En el menú, `q-item :to="/alumnos"` hace coincidencia por prefijo: estando en `/alumnos/fotos` es probable que "Alumnos" también aparezca resaltado junto a "Fotos". No se tocó `AdminLayout.vue` (fuera de los archivos del plan); si molesta, agregar `exact` al ítem de Alumnos.
- Ver la grilla a 360 px y los diálogos renderizados, y probar con `admin_sede` que solo ve las fotos de sus sedes.

## Self-Check: PASSED
