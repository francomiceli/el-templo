---
phase: 215-regalar-aura
plan: 19
subsystem: app-notifications-bell
tags: [app, campana, barra, riel, contador]
requires: ["215-18"]
provides:
  - "Campana con badge en la barra de celular, ítem Notificaciones en el riel de escritorio y contador al día"
affects: [215-24]
tech-stack:
  added: []
  patterns:
    [
      un solo listener de visibilitychange para todos los refrescos del layout,
      badge compartido entre barra y riel,
    ]
key-files:
  created:
    - el-templo-app/src/components/NotificationCountBadge.vue
    - el-templo-app/src/components/NotificationBell.vue
  modified:
    - el-templo-app/src/layouts/MainLayout.vue
    - el-templo-app/src/boot/push-notifications.ts
key-decisions:
  - "El número se pide desde el onVisibilityChange que ya existía en MainLayout, sin sumar un segundo listener"
  - "La push con la app abierta solo refresca el número si hay sesión"
requirements-completed: [SC-6, D-17, D-18]
duration: 20 min
completed: 2026-11-18
---

# Fase 215 Plan 19: campana en la barra y en el riel Summary

La barra de arriba del celular tiene la campana entre perfil y salir (D-17), con badge de sin leer ("9+" desde 10); el riel de escritorio tiene el ítem "Notificaciones" entre "Mi Perfil" y "Salir". El número se mantiene al día en cada momento que pide el UI-SPEC.

## Tareas

| Tarea | Commit      | Asunto                                                              |
| ----- | ----------- | ------------------------------------------------------------------- |
| 1     | `8c822fd6e` | feat(215-19): campana y badge de notificaciones                     |
| 2     | `16d98d171` | feat(215-19): campana en la barra y en el riel, con contador al día |

## Qué quedó

- `NotificationCountBadge.vue`: prop `count` y `placement` (`bar`: top 4 / right 4; `rail`: top 8 / left 38). 18 de alto, fondo `#fbf8f3`, aro `$pd-btn-b`, número Montserrat 700 11 `$pd-terra-ink` con `tabular-nums`, `aria-hidden`, sin animación. Con `badgeText` en null no dibuja nada.
- `NotificationBell.vue`: `q-btn flat round`, ícono `notifications` o `notifications_none`, `aria-label` con `bellAriaLabel`, `aria-current="page"` y fondo `rgba(255,255,255,.2)` en la ruta `notifications`, tooltip "Notificaciones", foco visible con aro blanco. Al tocar va a `{ name: 'notifications' }` salvo que ya esté ahí.
- `MainLayout.vue`: la campana entre perfil y salir (solo autenticado); los tres con la clase `.bar-btn-44` (44×44, `flex-shrink: 0`) y el selector de nivel también sin encogerse; `hideTitleForLevelSelector` pasa a menos de 460 px; ítem del riel con `to="/notificaciones"`, `--active` y `aria-current`; al autenticar `refreshCount()`, al salir `reset()`, y `refreshCount()` en el `onVisibilityChange` existente.
- `push-notifications.ts`: `refreshInboxCount()` se llama en `pushNotificationReceived` (Android) y en `notificationReceived` (iOS) sin mostrar nada (D-29).

## Control posterior

- `pnpm lint` (app): 0 errores (2 warnings previos ajenos).
- `vue-tsc` app: 20 errores (base 20); ninguno en los archivos tocados.
- Los greps de verificación de las dos tareas dan OK.
- API y admin no tocados. Sin migración, bump, instalaciones ni push. Prettier sobre las rutas tocadas.

## Desvíos respecto del plan

Ninguno de fondo. El plan pedía "registrar y quitar el listener en el ciclo de vida del layout": ya existía uno (`onVisibilityChange`, con alta en `onMounted` y baja en `onUnmounted`), así que se sumó la llamada ahí en vez de crear un segundo.

## Decisiones propias

Anotadas en `215-DECISIONES-AUTONOMAS.md`: refresco por push solo con sesión, y un único control de "volver a primer plano".

## Pendiente para el UAT del plan 24

Ver la barra a 360, 390 y 412 px en Mi Templo y en Entrenar con el nivel más largo (sin recorte del logo ni del selector, título oculto bajo 460 px), la posición del badge sobre el botón (el contenido de `q-btn` se pasó a `position: static` para que el badge se ancle al botón y no al ícono), el riel de escritorio con el ítem y su badge, y que la campana se resalte dentro de `/notificaciones`. Nada se vio renderizado.

## Lecciones para los planes siguientes

- El contador vive en `useNotificationsInboxStore` y `MainLayout` es quien lo pide al iniciar sesión, al volver a primer plano y quien lo resetea en el logout; las pantallas solo lo actualizan al tocar un aviso o marcar todo.
- `NotificationCountBadge` no tiene lugar propio de posición fuera de `bar` y `rail`: para otro contenedor, agregar un `placement` nuevo.
- Prettier reformatea el `q-btn` largo de la barra en varias líneas: correrlo sobre las rutas tocadas antes de commitear.

## Self-Check: PASSED

Commits `8c822fd6e` y `16d98d171` y los cuatro archivos verificados.
