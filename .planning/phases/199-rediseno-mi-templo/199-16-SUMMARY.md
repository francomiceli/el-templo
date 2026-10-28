---
phase: 199-rediseno-mi-templo
plan: 16
subsystem: app-check-in-week
tags: [check-in, week-strip, evaluation, mi-templo, d-07, d-09, d-14, d-15]
requires: [199-15]
provides:
  - utils/check-in-summary.ts (nextUnanswered, answeredCount, answerLabel, summaryParts, weekDots, sessionsThisWeek, dotAriaLabel)
  - CheckInPanel.vue (registro del día, una pregunta por vez, colapsa a una línea)
  - WeekStrip.vue (Tu semana compacta)
  - GeneralContent/EvaluationRequest en superficie clara, evaluación solo si es accionable
affects: [199-20, 199-21]
key-files:
  created:
    - el-templo-app/src/modules/progression/utils/check-in-summary.ts
    - el-templo-app/src/modules/progression/utils/__tests__/check-in-summary.test.ts
    - el-templo-app/src/modules/progression/components/CheckInPanel.vue
    - el-templo-app/src/modules/progression/components/WeekStrip.vue
  modified:
    - el-templo-app/src/modules/progression/components/GeneralContent.vue
    - el-templo-app/src/modules/progression/components/EvaluationRequest.vue
    - el-templo-app/src/modules/progression/pages/MiTemplo.vue
requirements-completed: [D-07, D-09, D-14, D-15]
completed: 2026-10-15
---

# Phase 199 Plan 16: Registro del día compacto y Tu semana sin RPE Summary

El Registro del día muestra una pregunta por vez ("n de 3") y colapsa a una línea con tick verde y "editar"; Tu semana es una fila con el número de sesiones, 7 puntos L-D y el total. Sale el RPE y el gráfico de esfuerzo, y la evaluación de nivel solo aparece si es "Listo para evaluación" o "Solicitud pendiente".

## Commits (worktree `et-199-mi-templo`, rama `feat/199-mi-templo-rediseno`)

- Task 1: `a7719b06b` feat(199-16): helpers puros, CheckInPanel de una pregunta por vez y WeekStrip compacto (D-07, D-09)
- Task 2: `73153f01f` feat(199-16): registro del día compacto 1 de 3 y Tu semana sin RPE con evaluación solo si aplica (D-07, D-09)

(Dos commits, uno por task; el plan hablaba de un único commit al final. Prettier/eslint de lint-staged pasaron en ambos.)

## Qué se hizo

- **`check-in-summary.ts`** (puro): `nextUnanswered`, `answeredCount`, `answerLabel` (9 etiquetas + zona en minúscula "Molestia leve (hombros)", la zona solo en leve/moderada), `summaryParts` (orden de `ordered`, omite sin responder), `weekDots` (7 puntos L-D con `addDaysStr`), `sessionsThisWeek` (fechas únicas dentro de la semana) y `dotAriaLabel` ("lunes 12: entrenaste", "jueves 15 (hoy): no entrenaste").
- **`CheckInPanel.vue`**:
  - Props `questions` (ya ordenadas) y `answers`.
  - Estado colapsado y pregunta actual derivados de los DATOS del día (`answers` del store, zona de la sede por construcción) y no de un flag local (L42). El único estado local que sobrevive es `editing`, que se apaga al terminar la tercera pregunta y muere con el remonte de la página.
  - Auxiliar "n de N" = respondidas + 1 (o índice + 1 al editar).
  - Molestia leve/moderada: paso "¿Dónde?" en la misma card con 5 botones (alto 44, 2 filas por `flex-wrap`) y "Volver" (área >= 44). Nada se guarda hasta elegir la zona: el payload es el mismo que antes (`submitCheckIn(type, value, bodyArea)`).
  - Editar: recorre las 3 desde la primera con la respuesta actual marcada (`aria-pressed`, relleno terracota).
  - `submitting` deshabilita los botones y bloquea el doble envío (T-199-44).
  - Sin `rgba` en `color:`; la transición de los botones solo corre bajo `prefers-reduced-motion: no-preference` (L38).
- **`WeekStrip.vue`**: card blanca con título, número grande, "sesiones / esta semana", 7 puntos (entrenado relleno terracota, hoy borde 2 px `#2c2318`) y pie "N sesiones en total" / "en El Templo" (singular "1 sesión"). Los puntos son `<li>` con `aria-label`.
- **`GeneralContent.vue`**: sin `RpeTrendChart`, sin la card "Tendencia de Esfuerzo" y sin la prop `rpeTrend`. La raíz es directamente `<EvaluationRequest v-if="evaluation && (evaluation.eligible || evaluation.pendingRequest)">`, así que si no aplica no deja ni un div vacío (no suma el gap de 16 px de la pila).
- **`EvaluationRequest.vue`**: se eliminó el estado "no elegible" y la prop `averageRpe`. Card blanca radio 16, título Montserrat 700 15, texto `#6b6459`, botón `<button>` terracota 48 px radio 12. "Solicitud pendiente" conserva su precedencia sobre "eligible", como antes.
- **`MiTemplo.vue`**: `CheckInPanel` y `WeekStrip` reemplazan la fila horizontal de `CheckInCard` y a `WeeklySummaryCard`; ambos se ocultan con `todayCard.kind === 'sin-plan-nunca'` (y `total-label="templo"` en `sin-plan-vencio`). Se desestructura `completedDates` de `useWeekData()`. Se quitaron `fetchWeeklySummary()`, `checkInsRowRef`, `scrollCheckIns` y los estilos `.mi-templo__check-ins*`, `__section-title`, `.scroll-arrow`.

## Verificación

- `npx vue-tsc --noEmit`: 18 errores totales (límite 18, el de `displayName` en `MainLayout.vue` es preexistente); 0 en `check-in-summary`, `CheckInPanel`, `WeekStrip`, `GeneralContent`, `EvaluationRequest`, `MiTemplo`.
- `pnpm lint`: 0 errores (2 warnings preexistentes en `boot/axios.ts` y `useSessionPlayer.ts`).
- Greps de aceptación Task 1: `height: 44px` = 3, `BODY_AREA_OPTIONS` = 2, " de " = 4, `editar` = 1, `color: rgba(` = 0 en ambos, `#3b7249` = 1 en `CheckInPanel`, `#96593a` = 2 en `WeekStrip`.
- Greps de aceptación Task 2: `RpeTrendChart|Tendencia de Esfuerzo` = 0, `eligible ||` = 1, `color: rgba(` en `EvaluationRequest` = 0, `<CheckInPanel` = 1, `<WeekStrip` = 1, `CheckInCard|WeeklySummaryCard|scrollCheckIns` = 0 en MiTemplo.
- **Tests de app corridos**: `npx vitest run src/modules/progression/utils/__tests__/check-in-summary.test.ts` -> 24 tests, todos verdes. Cubre orden y siguiente pregunta (incluida una respondida más adelante), las 9 etiquetas más zona, `summaryParts`, puntos de una semana con hoy jueves y entrenados lunes/martes, cruce de fin de mes, y sesiones que no cuentan otra semana ni duplicadas. No existen tests previos del Registro del día ni de Tu semana (ni `@vue/test-utils`), así que no hay tests de componente; no se corrió ningún otro.

## Deviations from Plan

1. **[Interpretación] `CheckInPanel` recibe una prop `save` (función que devuelve `Promise<boolean>`) en vez de emitir `submit`.** El `emit` no puede devolver si el guardado funcionó, y L41 exige no avanzar si falla. `submitCheckIn` ya devuelve `boolean` (la actualización optimista del store solo ocurre si tuvo éxito), así que `MiTemplo.handleCheckInSubmit` ahora retorna ese booleano. Si falla, el panel se queda en la misma pregunta, muestra "No pudimos guardar tu respuesta. Probá de nuevo." (`role="alert"`) y permite reintentar. Mismo endpoint, mismo payload, misma idempotencia. El key_link del plan ("via emit submit") cambia a "via prop save".
2. **[Menor] Dos commits** (uno por task).
3. **[Menor] Extras en los helpers:** `answeredCount` y `dotAriaLabel` (el plan no los listaba) para el "n de 3" y los `aria-label` de los puntos. `weekDots` devuelve exactamente `{letter, date, trained, isToday}`.
4. **[Menor] Botón "Volver" en el paso de zona**, no pedido: sin él, un toque equivocado en "Leve" obliga a elegir una zona falsa.
5. **[Menor] El título "Registro del día" aparece también en el paso de zona**, con el mismo "n de 3".

## RPE (L41)

Quitar el RPE de la UI no toca ningún payload. El Registro del día solo manda `{questionType, value, bodyArea}` a `POST /check-ins` (energy/soreness/sleep) y el módulo `check-ins` de la API no menciona RPE. El RPE salía de `WeeklySummaryCard` (RPE prom) y de `rpeTrend`/`averageRpeLast2Weeks` (gráfico y mensaje "no elegible"), que son solo lectura. El store (`weeklySummary`, `rpeTrend`) y `fetchWeeklySummary` siguen existiendo, solo que Mi Templo ya no los llama (el store `progressionStore.weeklySummary*` queda sin consumidor en la página).

## Bugs reales encontrados

Ninguno nuevo en código previo. Se previno uno latente: el `CheckInCard` viejo seteaba `submitting = true` y `editing = false` ANTES de saber si el guardado funcionó, y solo se desbloqueaba cuando cambiaba `props.answer`. Si `submitCheckIn` fallaba, la card quedaba con los botones deshabilitados con un loader para siempre. El panel nuevo resetea `submitting` en `finally`.

## Dudas abiertas (no bloqueantes)

- `orderedCheckIns` sigue rotando por `Math.floor(Date.now() / 86400000)` (día UTC del teléfono), no por la zona de la sede. Solo cambia el orden de las dos preguntas no-soreness cerca de medianoche UTC, no lo que se guarda; si el orden cambiara con el panel abierto a medianoche UTC, el "n de 3" podría reordenarse. No se tocó (fuera de alcance, `orderedCheckIns` estaba "no se toca" en la práctica por alimentar `checkInMessage`).
- `completedDates` viene de `/sessions/weekly`; se asume que trae las fechas completadas de la semana pedida (la API devuelve `completedRows`). Los tests de `sessionsThisWeek` filtran por semana, así que aunque traiga de más no sobrecuenta.
- Quedan huérfanos `CheckInCard.vue`, `WeeklySummaryCard.vue`, `RpeTrendChart.vue` (sin importadores en `src`). El plan 20 decide su borrado.
- Validación visual (capturas, `contrast.py`, alto real de las cards) pendiente del plan 21. El colapso/expansión cambia el alto de la card por diseño (no hay animación de alto, así que no hay salto intermedio, pero sí un salto único al responder la tercera pregunta).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del threat_model. T-199-43 aceptado (mismas opciones y endpoint). T-199-44 mitigado (`submitting` deshabilita botones y `choose` retorna si ya hay un envío en curso).

## Self-Check: PASSED

- Archivos creados existen y commits `a7719b06b` y `73153f01f` presentes en el worktree; `git status --porcelain` del worktree vacío; nada commiteado ni tocado en `/home/franco/projects/el-templo` salvo este SUMMARY sin commitear.
