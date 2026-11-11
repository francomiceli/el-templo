---
phase: 213-estiramiento-post-clase
plan: 11
subsystem: app
tags: [vue, today-card, stretch, mi-templo, card-seen]
requires:
  - phase: 213
    provides: useStretchStore con cardInput/load/markCardSeen/reset (plan 09), ruta stretch-player (plan 10)
provides:
  - withStretch puro y campo stretch en TodayCardInput (Estirar como principal tras la clase)
  - matriz de tests estado x stretch.status con contador e invariantes de alto fijo
  - cableado en MiTemplo.vue (dato, card_seen) y MainLayout.vue (refresco y reset)
affects: [213-12 deep link en frio, 213-13 UAT]
tech-stack:
  added: []
  patterns: [funcion pura aplicada ultima sobre el modelo ya compuesto, refresco colgado de los puntos existentes sin intervalos nuevos]
key-files:
  created: []
  modified:
    - el-templo-app/src/modules/progression/utils/today-card.ts
    - el-templo-app/src/modules/progression/utils/__tests__/today-card.test.ts
    - el-templo-app/src/modules/progression/pages/MiTemplo.vue
    - el-templo-app/src/layouts/MainLayout.vue
key-decisions:
  - "withStretch se aplica ULTIMA: resolveTodayCard = withStretch(withExtraPrograms(withLibreLink(base)))"
  - "Elegible solo con asistencia registrada, windowState distinto de before/open y kind presencial-turno o completada; cualquier otro caso o `none` devuelve el modelo intacto"
  - "available: primary 'Estirar' -> { name: 'stretch-player' } y el primary anterior baja a secondary (desplaza a Libre y a Tus programas)"
  - "done: primary y secondary intactos; la linea de estado pasa a 'Clase y estiramiento hechos' (pill si habia, si no meta)"
requirements-completed: [SC-2, SC-7, D-09, D-15]
completed: 2026-11-11
---

# Phase 213 Plan 11: Card de Mi Templo con "Estirar" Summary

**`withStretch` puro aplicado último sobre la card de hoy ("Estirar" toma el botón principal tras la clase, "Clase y estiramiento hechos" al terminar), con matriz de 396 evaluaciones y cableado fail-open en Mi Templo y MainLayout (`card_seen` una vez por día, refresco sin intervalos nuevos).**

## Accomplishments

- **`today-card.ts`**: `TodayCardInput.stretch` (`none | available | done` + `minutes`) y `withStretch(model, input)`. Docblock de cabecera actualizado con la regla D-09 y la prioridad del secondary. Ningún caso existente cambió su resultado esperado (los tests viejos no se tocaron; solo se agregó `stretch: none` al `baseInput`).
- **Tests** (`today-card.test.ts`, 203 en total, 13 nuevos): casos puntuales de `<behavior>` con `toEqual` y una matriz de 33 escenarios x Libre x "Tus programas" x {none, available, done} = 396 evaluaciones, con `expect(evaluated).toBe(33 * 2 * 2 * 3)`, contador de elegibles (40) e invariantes de alto fijo en toda la matriz (8 claves, `pill === null || meta === null`, un solo secondary). Los escenarios declaran a mano si son elegibles (no se recalcula la regla en el test).
- **`MiTemplo.vue`**: `stretch: stretchStore.cardInput` en el input de la card; `void stretchStore.load()` en `onMounted` sin `await`; `watch` sobre `primary.label` que llama `markCardSeen()` cuando es "Estirar" (idempotente por día en el store).
- **`MainLayout.vue`**: `refreshStretch()` (solo con `attendanceMarkedAt !== null` y estado distinto de `done`), llamada al volver a primer plano y en el cambio de zona; `watch` de `attendanceMarkedAt` (null a valor) para la primera consulta; `stretchStore.reset()` junto a `todayBookingStore.reset()` al desloguear. Sin `setInterval` ni timers nuevos.

## Task Commits

1. Task 1 RED: `40a9bf2ea` test(213-11): tests en rojo de withStretch en la card de hoy (7 fallaban, 196 pasaban)
2. Task 1 GREEN: `52b03636f` feat(213-11): withStretch en la card de hoy
3. Task 2: `9b23cce99` feat(213-11): cablear el estiramiento en Mi Templo y MainLayout

## Verificación

- `vitest today-card.test.ts`: 203/203. `vitest src/modules/progression`: 7 archivos, 358/358.
- Mutaciones de sanidad (copia en scratchpad, restaurada con `cp`): quitar el chequeo de `windowState` (2 tests fallan), quitar el chequeo de asistencia (2 fallan), `secondary: model.secondary` en vez del primary anterior (5 fallan). Cambiar el orden de composición (`withStretch` antes de `withExtraPrograms`) sobrevive: es un mutante equivalente, porque con `available` el secondary ya queda ocupado por el primary anterior y con `done` no se toca.
- `pnpm lint` app: 0 errores (2 warnings preexistentes). `vue-tsc --noEmit`: 21 errores = baseline, ninguno en `today-card.ts`, `MiTemplo.vue` ni los tests (el de `MainLayout.vue` `displayName` es preexistente, solo cambió de línea).
- Sin `setInterval` en el diff.
- No corrido: prueba visual en navegador de la card (la cubre el UAT del plan 13).

## Decisiones del ejecutor

- **`done` usa la misma elegibilidad que `available`** (asistencia, ventana no before/open, kind turno/completada). Conservador: fuera de eso la card queda como hoy.
- **Línea de estado de `completada` con `done`:** la pill "Completada · 40 min · RPE 7" se reemplaza por "Clase y estiramiento hechos" (así lo dice el plan). Se pierde el detalle de minutos/RPE mientras el estiramiento esté hecho.
- **Rama `meta` de `done` sin pill previa:** hoy ningún estado elegible llega sin pill (un `presencial-turno` con asistencia y `completada` siempre la traen), así que esa rama no es alcanzable desde `resolveTodayCard` y la matriz solo la cubre condicionalmente. Se dejó implementada por el contrato del plan; `withStretch` no se exporta para probarla aislada.
- **MainLayout sin watcher de ruta para el estiramiento:** MiTemplo se remonta en cada navegación (no hay `keep-alive`) y ya carga al montar, así que refrescar también en el cambio de ruta duplicaría el pedido. Los puntos cubiertos son: montar Mi Templo, volver a primer plano, cambio de zona, asistencia recién registrada y tras completar (`applyCompletion` del plan 09).
- **`load()` en `onMounted` de MiTemplo es incondicional** (como pide el plan): la asistencia puede no estar cargada todavía al montar. Es un solo GET por montaje y fail-open; el store conserva el dato del mismo día, sin parpadeo.
- Reloj de la card: `withStretch` no usa `minutes` (la card solo dice "Estirar"); queda disponible en el input por si el diseño lo pide.

## Deviations from Plan

None - plan executed exactly as written (salvo el type-narrowing `as const` en el escenario de plan programado del test, para que `vue-tsc` no marcara el test).

## Known Stubs

None.

## Threat Flags

None. T-213-33 (matriz + función pura última + tests viejos intactos), T-213-34 (fail-open a `none`) y T-213-35 (sin intervalos, refresco solo con asistencia y sin `done`) mitigados.

## Para los planes siguientes

- Plan 12 (deep link en frío): la card y el store ya están cableados; el store descarta un dato de otro día y `reset()` limpia todo.
- Plan 13 (UAT): mirar que la card no parpadee al entrar con oferta ya cargada, que "Estirar" no aparezca durante la clase aunque haya asistencia, y la línea "Clase y estiramiento hechos" al volver del player.

## Self-Check: PASSED

- `213-11-SUMMARY.md` existe; commits `40a9bf2ea`, `52b03636f`, `9b23cce99` presentes en `feat/estiramiento-post-clase`.
