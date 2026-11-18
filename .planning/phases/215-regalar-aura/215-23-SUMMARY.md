---
phase: 215-regalar-aura
plan: 23
type: execute
subsystem: admin-regalos-aura-page
tags: [admin, regalo, anulacion, medicion, ajustes]
requires: ["215-22"]
provides:
  - "Pagina Regalos de Aura del admin (Pantallas 6b y 6c del UI-SPEC)"
affects: [215-24]
tech-stack:
  added: []
  patterns:
    [
      contador de pedidos que descarta respuestas viejas,
      recarga silenciosa tras anular,
      fechas de la clase sin conversion de zona,
    ]
key-files:
  created:
    - el-templo-admin/src/pages/RegalosAuraPage.vue
  modified:
    - el-templo-admin/src/router/routes.ts
    - el-templo-admin/src/config/templo-config.ts
    - .planning/phases/215-regalar-aura/215-DECISIONES-AUTONOMAS.md
key-decisions:
  - "admin_sede no tiene Todas en el selector de sede"
  - "404 sin code muestra aviso de modulo no disponible"
  - "Si falla leer el valor del profe no se ofrece editarlo"
requirements-completed: [SC-3, SC-7, D-11, D-20, D-21]
duration: 20 min
completed: 2026-11-18
---

# Fase 215 Plan 23: pagina Regalos de Aura en el admin Summary

El staff tiene `/alumnos/regalos` (Gestion, debajo de Fotos): el dueño y el admin editan el valor del regalo del profe (1 a 10), todos ven la medicion de 4 semanas y la lista filtrable, y se puede anular un regalo con confirmacion.

## Tareas

| Tarea | Commit      | Asunto                                                             |
| ----- | ----------- | ------------------------------------------------------------------ |
| 1     | `32ea0a574` | feat(215-23): ruta y menu de Regalos de Aura                       |
| 2     | `e2d27e7e5` | feat(215-23): pagina Regalos de Aura (valor, medicion y anulacion) |

## Que quedo

- Ruta `alumnos/regalos` antes de `alumnos/:userId` (roles admin, owner, admin_sede) e item "Regalos de Aura" (`volunteer_activism`) en Gestion debajo de "Fotos".
- `RegalosAuraPage.vue`: tarjeta de ajustes (editable para owner y admin, texto de solo lectura para admin_sede), medicion con las semanas de `weeks` ("10/11 al 16/11", porcentaje redondeado), filtros (sede, 7/30/90 dias, mostrar anulados) que recargan lista y medicion, tabla de 25 por pagina (en celular, una card por regalo) y dialogo de anulacion con los textos del UI-SPEC.
- Fecha de la clase: "Lun 17/11 · 18:00" se arma del `sessionDate` y `startTime` tal como vienen (ya son hora de la sede), sin pasar por `Date` con zona; con `startTime` null queda solo "Lun 17/11".
- Anular: 204 notifica el descuento y recarga lista y medicion sin parpadeo de skeleton; 409 avisa "ya estaba anulado" y recarga; otro error avisa y deja la fila.

## Control posterior

- `pnpm lint` (admin): 0 errores (8 warnings previos ajenos).
- `vue-tsc` admin: 36 errores (base 36); ninguno en `RegalosAuraPage.vue`, `routes.ts` ni `templo-config.ts`.
- API y app no tocadas. Sin migracion, bump, instalaciones ni push. Prettier sobre las rutas tocadas. El `.tsv` de `consultas/` sigue sin trackear.

## Desvios respecto del plan

- La ruta lleva `meta.allowedRoles` solo con `admin`, `owner` y `admin_sede` (el plan decia "si el router los usa": lo usa, y los profes no deben entrar).
- En el Task 1 se creo una pagina minima para que el commit compilara, y se completo en el Task 2 (el plan lo preveia).

## Decisiones propias

Tres filas en `215-DECISIONES-AUTONOMAS.md` (sin "Todas" para admin_sede; 404 sin code como "no disponible"; sin edicion si falla leer el valor).

## Pendiente para el UAT del plan 24

Ver la pagina a 360 px y en escritorio (nada se vio renderizado), en especial el input de 120 px con el sufijo "de Aura"; probar con dueño (editar y guardar), admin_sede (solo lectura, solo sus sedes) y anular un regalo de alumno y uno de profe; ver que el menu marque "Alumnos" y "Regalos de Aura" juntos por el prefijo (conocido, no se toco `AdminLayout.vue`).

## Lecciones para los planes siguientes

- `giversPct` ya viene en porcentaje; la pagina solo lo redondea. `weeks` trae la semana actual primero y se muestra en ese orden.
- El orden de la tabla se hace en el cliente (fecha y hora descendente, empate por id); la lista no depende del orden del servidor.
- `startTime` puede ser null y `voidedByName` tambien (anulacion por deshacer asistencia): ambos casos tienen texto propio.
- Los textos con `v-model.number` de `q-input type="number"` dan `''` al vaciar el campo: la validacion exige `typeof number`.

## Self-Check: PASSED

Commits `32ea0a574` y `e2d27e7e5` y los tres archivos de codigo verificados.
