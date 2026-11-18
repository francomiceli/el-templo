---
phase: 215-regalar-aura
plan: 18
subsystem: app-notifications-screen
tags: [app, bandeja, pantalla, avatar]
requires: ["215-17"]
provides:
  - "Pantalla Notificaciones (/notificaciones) y MemberAvatar en 32 y 40"
affects: [215-19, 215-24]
tech-stack:
  added: []
  patterns:
    [
      requestSeq contra respuestas tardías,
      actualización optimista con vuelta atrás,
    ]
key-files:
  created:
    - el-templo-app/src/pages/NotificationsPage.vue
  modified:
    - el-templo-app/src/components/MemberAvatar.vue
    - el-templo-app/src/router/routes.ts
key-decisions:
  - "Con un regalo cuyo dato ya no existe (gift null) la fila usa el círculo genérico con ícono de campana"
  - "La página entera (no solo la lista) lleva el fondo claro del UI-SPEC"
requirements-completed: [SC-6, D-17, D-18, D-19, D-22]
duration: 25 min
completed: 2026-11-18
---

# Fase 215 Plan 18: pantalla Notificaciones Summary

La app tiene su pantalla de Notificaciones en `/notificaciones` (nombre `notifications`): avisos agrupados por día con hora, cara o ícono, título, bajada, punto de sin leer y pastilla de regalo. La campana que lleva hasta ahí es el plan 19.

## Tareas

| Tarea | Commit      | Asunto                                      |
| ----- | ----------- | ------------------------------------------- |
| 1     | `f191397c2` | feat(215-18): MemberAvatar en 32 y 40       |
| 2     | `505189dec` | feat(215-18): pantalla Notificaciones (035) |

## Qué quedó

- `MemberAvatar.vue`: tamaños 32 y 40 con iniciales Montserrat 700 13 (`member-avatar__initials--label`). Las insignias `review` y `camera` no se dibujan en esos tamaños (documentado en la prop). Los usos de la 214 no cambian.
- `NotificationsPage.vue`: encabezado con volver (`router.back()` si `history.state.back` existe, si no `/mi-templo`) y "Marcar todo como leído" solo con algún sin leer; una `<section>` por día con su `<ul>`; fila-botón con avatar del alumno, círculo dorado con "✦" del profe o círculo con `iconForKind`; pastilla "✦ +N" o "Anulado"; fondo `#fffaf0` y punto para sin leer.
- Tocar un aviso: lo marca leído al momento, resta 1 al contador, llama `markRead` sin esperar (si falla, queda leído en pantalla y `refreshCount()` corrige el número) y navega con `resolveTapRoute(tapData(item))`. Abrir la pantalla solo pide la primera página y `refreshCount()`: no marca nada.
- "Marcar todo": optimista; si falla restaura el `readAt` previo de cada fila, vuelve a pedir el número y avisa "No pudimos marcar las notificaciones. Probá de nuevo.".
- Estados: cargando (6 filas de esqueleto, `aria-busy`), vacío, error con "Reintentar" (`role="alert"`) y error en "Ver más" (filas intactas, notify negative). "Ver más" lleva el foco a la primera fila nueva. `requestSeq` descarta respuestas tardías y `cleanup()` se llama al desmontar. Sin `v-html`.

## Control posterior

- `pnpm lint` (app): 0 errores (2 warnings previos ajenos).
- `vue-tsc` app: 20 errores (base 20); el único que toca `routes.ts` es el previo de `ErrorNotFound.vue`. Ninguno en `NotificationsPage.vue` ni `MemberAvatar.vue`.
- API, admin y dependencias no tocados. Sin migración, bump ni push. Prettier verificado sobre las tres rutas.

## Desvíos respecto del plan

Ninguno de fondo. El botón "Ver más" y el de "Reintentar" comparten la clase `notif__btn`; el de error tiene tope de 280 px de ancho para que no quede a pantalla completa.

## Decisiones propias

- Fila de regalo con `gift` null (borrado o ajeno): círculo genérico con el ícono `notifications`, sin pastilla.
- El fondo claro `$pd-light-surface` va en toda la página y la lista se centra a 630 px.
- El texto de la bajada omite el separador " · " si el cuerpo viene vacío.

## Pendiente para el UAT del plan 24

Ver renderizado, a 360, 390 y 412 px y en escritorio: encabezado con el link largo, filas con avatar y pastilla (el título y la bajada a dos renglones con la pastilla y el punto a la derecha), el aro dorado del círculo del profe, los esqueletos, el estado vacío y el de error, el foco tras "Ver más" y el aterrizaje desde un aviso de regalo a `/mi-templo?aura=detalle`. Nada de esto se vio renderizado.

## Lecciones para los planes siguientes

- El plan 19 (campana) navega a `{ name: 'notifications' }` o `/notificaciones`; el layout autenticado ya la sirve. La pantalla pide `refreshCount()` al montar, así que la campana no necesita llamarla otra vez al volver.
- `MemberAvatar` 32 y 40 sirven para la card de regalo (plan 20): no dibujan insignia.
- `router.back()` depende de `history.state.back`; para otra pantalla con volver conviene copiar `goBack()` de `NotificationsPage.vue`.

## Self-Check: PASSED

Commits `f191397c2` y `505189dec` y el archivo `NotificationsPage.vue` verificados.
