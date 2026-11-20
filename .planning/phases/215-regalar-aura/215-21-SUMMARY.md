---
phase: 215-regalar-aura
plan: 21
type: execute
subsystem: app-gift-offer-in-today-card
tags: [app, card-de-hoy, regalo, mi-templo, deep-link]
requires: ["215-20"]
provides:
  - "Fila de regalo today-card__gift en la card de hoy (Pantalla 1 del UI-SPEC)"
  - "Mi Templo conecta store, card y GiveAuraSheet; ?aura=detalle abre el detalle de Aura"
affects: [215-24]
tech-stack:
  added: []
  patterns:
    [
      fila condicional que no reserva lugar (fail-open),
      textos armados por el padre con gift-view.ts,
      parametro de URL consumido con router.replace,
    ]
key-files:
  created: []
  modified:
    - el-templo-app/src/modules/progression/components/TodayCard.vue
    - el-templo-app/src/modules/progression/pages/MiTemplo.vue
    - el-templo-app/src/components/MiTemploHeader.vue
    - el-templo-app/src/layouts/MainLayout.vue
key-decisions:
  - "El detalle por enlace espera al perfil antes de abrir y limpiar el parametro"
  - "Mi Templo recarga los regalos solo con stale (no tambien con given)"
requirements-completed:
  [SC-1, SC-4, SC-5, D-02, D-07, D-12, D-13, D-14, D-17, D-19]
duration: 20 min
completed: 2026-11-18
---

# Fase 215 Plan 21: oferta de regalo en la card de hoy Summary

La card de hoy de Mi Templo ofrece el regalo de Aura despues de la clase, abre la hoja del plan 20 con la clase que vence antes y el aviso de un regalo (`/mi-templo?aura=detalle`) abre el detalle de Aura.

## Tareas

| Tarea | Commit      | Asunto                                                             |
| ----- | ----------- | ------------------------------------------------------------------ |
| 1     | `902d1ad4e` | feat(215-21): oferta de regalo en la card de hoy                   |
| 2     | `05a9cc5db` | feat(215-21): regalo en Mi Templo y detalle de Aura desde el aviso |

## Que quedo

- `TodayCard.vue`: prop opcional `gift` (`offer` con `help` y `ariaLabel`, o `given` con `text` y `receiver`) y evento `open-gift`. La quinta fila va despues de `today-card__actions`, solo con `gift` no nulo y `model.kind` distinto de `neutral` (el esqueleto `cargando` es otra rama). `offer`: boton dorado de 48 con filete de 2 px (mismo degradé de `pd-aura-frame` en `border-box`), chispa `aria-hidden`, texto `$pd-aura-deep`, `scale(.97)` solo con movimiento permitido, foco `$pd-cream-2`; ayuda de hasta 2 renglones. `given`: fila no interactiva con `MemberAvatar` 32. La fila de acciones, el alto fijo y `resolveTodayCard` no se tocaron.
- `MiTemplo.vue`: `giftsStore.load()` al montar; computed `todayGift` (textos de `gift-view.ts` con el "hoy" de la sede: zona del perfil o `DEFAULT_BRANCH_TZ`, reloj de `todayBookingStore.now`); computed `giftToGive` (`cardState.first`); una sola `GiveAuraSheet` que recarga con `stale`.
- `MiTemploHeader.vue`: watch inmediato sobre `route.query.aura` y la existencia del perfil. Con valor exacto `detalle`: abre el detalle si `auraValue` no es null y siempre limpia el parametro con `router.replace` (conserva ruta, resto de la consulta y hash).
- `MainLayout.vue`: `giftsStore.reset()` en el logout; `load()` cuando `attendanceMarkedAt` pasa de null a valor y en el watch de `route.path === '/mi-templo'`. Sin intervalos nuevos.

## Control posterior

- `pnpm lint` (app): 0 errores (2 warnings previos ajenos).
- `vue-tsc` app: 20 errores (base 20); ninguno en los archivos tocados.
- El bloque de estilos de `TodayCard` se compilo con `sass` suelto (sin errores).
- API y admin no tocados. Sin migracion, bump, instalaciones ni push. Prettier sobre las rutas tocadas.

## Desvios respecto del plan

- No se escucha `@given` en la hoja: ya emite `stale` junto con `given`, y escuchar los dos pedia lo mismo dos veces (leccion del plan 20).
- El watch del encabezado espera al perfil antes de actuar (el plan decia abrir y limpiar siempre). Sin perfil no se sabe si el modulo esta prendido; limpiar antes perdia el aviso.

## Decisiones propias

Dos filas en `215-DECISIONES-AUTONOMAS.md` (espera del perfil y una sola recarga).

## Pendiente para el UAT del plan 24

Ver la card con un regalo, con dos regalos y con "Le diste Aura" a 360, 390 y 412 px (nada se vio renderizado); probar el toque de una push de regalo con la app cerrada (perfil aun cargando) y con el modulo apagado.

## Lecciones para los planes siguientes

- Al volver a Mi Templo por navegacion se piden los regalos dos veces (montaje de la pagina y watch de `route.path`); el store descarta la respuesta vieja con `generation`, no hay doble efecto.
- `TodayCard.vue` ahora importa `src/css/premium-card` (solo variables y mixins, sin reglas sueltas): los tokens de Aura ya estan disponibles en esa card.
- Un `export type` no hace falta para el tipo de la prop: el padre devuelve la forma estructural.

## Self-Check: PASSED

Commits `902d1ad4e` y `05a9cc5db` y los cuatro archivos verificados.
