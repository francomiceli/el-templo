---
phase: 203-carga-sin-parpadeos
plan: 13
subsystem: app-progression-mi-templo
status: complete
completed: 2026-10-28
requirements: [SC-2, D-01, D-02, D-03, D-07, D-16, D-17]
commits: [5ec01b755, d856baca9, d6d5df131]
key-files:
  created:
    - el-templo-app/src/modules/progression/utils/mi-templo-slots.ts
    - el-templo-app/src/modules/progression/utils/__tests__/mi-templo-slots.test.ts
  modified:
    - el-templo-app/src/modules/progression/pages/MiTemplo.vue
    - el-templo-app/src/modules/progression/components/WeekStrip.vue
---

# Phase 203 Plan 13: Mi Templo reserva el lugar de sus cards y ya no se tapa entera (SUMMARY)

Mi Templo deja de reemplazarse por el loader "Cargando tu progreso..." y por la pantalla de error. Las cards de abajo de la card de hoy reservan su lugar con `CardSkeleton` solo si la última vez tuvieron contenido (D-02), "Para vos" espera tarjetas + estado del socio + perfil, y el flag "tuvo contenido" se escribe únicamente tras una respuesta buena.

## Qué quedó

### Task 1 (`5ec01b755`): `resolveMiTemploSlots` pura + test
- `mi-templo-slots.ts`: función pura (sin stores/axios/boot) que usa `resolveSlot` con `reserve: 'if-had-content'` para novedades, checkIn, sponsors, weekStrip y evaluation (siempre `hasContent` booleano explícito) y devuelve `records`. Para vos: `i.deadlinePassed ? 'content' : resolveSlot({ reserve: 'always', settled, hasContent: true })` (excepción a D-07 documentada en el código; la tabla de `resolveSlot` no se tocó).
- `records` (Pitfall 6): novedades/sponsors solo con `loaded && ok === true`; checkIn solo con `settled && ok === true` y la card de hoy resuelta en un kind que no sea `cargando` ni `neutral`; evaluation solo con `statsLoaded && statsOk === true`; weekStrip solo con la semana respondida y la card de hoy resuelta (no `cargando`/`neutral`). Exporta además `MI_TEMPLO_CARD_KEYS` para iterar sin `Object.entries`/casts.
- Test: 35 casos `it(` (>= 16), incluidos "error de novedades no registra flag" y los tres de Para vos (skeleton / content settled / content con tope).

### Task 3 (`d856baca9`): WeekStrip con total opcional
- `totalSessions: number | null`. La fila `.week-strip__total` sigue renderizándose (sin `v-if`, mismo alto) con `visibility: hidden` y `aria-hidden` cuando es null.

### Task 2 (`d6d5df131`): MiTemplo
- Borrados el bloque del loader, el bloque de error + "Reintentar", sus estilos y el import de `TemploLoader`. `.mi-templo__content` se renderiza siempre. El toast de `fetchStats` no se tocó (`useProgressionApi.ts` sin cambios; `Notify.create` sigue en 3).
- `slots = computed(resolveMiTemploSlots(...))` con solo booleanos/conteos; `watch(() => slots.value.records)` -> `cardFlags.record(card, has)` iterando `MI_TEMPLO_CARD_KEYS` (sin `any`).
- Esqueletos con constantes de alto documentadas con su cálculo: `NOVEDADES_SKELETON_PX` 97, `CHECKIN_SKELETON_PX` 140, `SPONSORS_SKELETON_PX` 156, `WEEKSTRIP_SKELETON_PX` 144, `EVALUATION_SKELETON_PX` 110, `FOR_YOU_SKELETON_PX` 150. Radio 16 (las cards reales son de 16, el default de `CardSkeleton` es 20).
- Para vos: dos `CardSkeleton inline` con clase `.for-you__skeleton` (mismo `flex-basis` que una card del riel; gana por especificidad al `flex: 0 0 auto` de `CardSkeleton`, plan 07).
- Orden de componentes sin cambios (TodayCard < NovedadesCard < CheckInPanel < SponsorsCarousel < WeekStrip < GeneralContent < for-you < DailyQuote, verificado con grep).
- Riesgo del plan 11 (ProgramCtaCard sin bandera de carga): cubierto por `memberStateLoaded` en `paraVosSettled` (`doLoadMemberState` espera my-progress con `allSettled` antes de subirlo), así que el riel no parpadea al llegar my-progress.

## Tests escritos SIN correr (D-17) — los corre el orquestador

1. `el-templo-app/src/modules/progression/utils/__tests__/mi-templo-slots.test.ts` (NUEVO, 35 casos)

No hay test de componente de `MiTemplo.vue` ni de `WeekStrip.vue` (no existían; sin vitest no se agregaron). Verificado por grep que ningún test existente referencia el loader/error de la página. Prettier y eslint pasaron sobre los 4 archivos; `vue-tsc` no se corrió.

## Deviations from Plan

**1. [Diseño] Total de WeekStrip = `progressionStore.stats?.totalSessions ?? null`, no `statsOk ? ... : null`.** `statsOk` refleja la ÚLTIMA respuesta: con el literal del plan, un refresco fallido con stats buenas ocultaría un total que ya se estaba mostrando (parpadeo que la fase quiere evitar). `stats` es null mientras no hay dato (D-07 se cumple: nunca "0") y conserva el último dato bueno tras un refresco fallido.

**2. [Diseño] Texto de relleno "0" en WeekStrip cuando el total es null (el plan decía texto vacío).** Un `.week-strip__total-num` vacío no tiene línea y la fila encogería de ~51 a ~42 px; con "0" oculto (`visibility: hidden` + `aria-hidden`) conserva el alto exacto.

**3. [Diseño] `watch` de records con `immediate: true` y sin `deep`.** `records` es un objeto nuevo en cada recálculo, así que `deep` sobra; `immediate` registra los flags si las fuentes ya respondieron antes de montar (vuelta a Mi Templo). `record()` ignora valores iguales, no hay bucle con `cardFlags.map`.

**4. [Diseño] Alto del esqueleto de Novedades = 97 (con la barra de 3 px de la rotación).** Con una sola novedad la card mide 94 (no hay barra): como máximo 3 px de salto en ese caso. Los altos de Check-in, Semana, Evaluación y Para vos son medidos de los estilos pero estimados sin renderizar (sin build/dispositivo, D-17): hay que confirmarlos en el UAT del plan 17 (C-5, C-6, C-11). Evaluación usa el alto de "Listo para evaluación" (110); "Solicitud pendiente" mide ~74.

**5. [Alcance] `weekStrip` se registra con `week.loaded` aun si la semana falló.** El flag depende de si el socio tiene plan (kind de la card de hoy), no del contenido de la semana, así que un fallo de `/sessions/weekly` no lo afecta.

Sin otros cambios. Sin bugs nuevos fuera de alcance salvo lo que figura en Riesgos.

## Riesgos antes del plan 14

- **Altos de esqueleto estimados** (ver desviación 4): un error de unos px produce un salto pequeño al resolverse. Confirmar en el UAT con el dispositivo.
- **Semana fallida**: si `/sessions/weekly` falla, `weekLoaded` queda true (fail-open) y `WeekStrip` se dibuja con 0 días entrenados y "0 sesiones esta semana" (el encabezado cuenta `completedDates`). El total ya no se inventa, pero el conteo semanal sí puede mostrar 0 tras un fallo. No era del plan; si molesta, hay que pasar `weekError` al input de slots y degradar.
- **`progressionStore.loading`/`error` siguen existiendo** y los usa `SessionSummaryPage.vue`; `error` sigue sin limpiarse al empezar `fetchStats`. Mi Templo ya no los lee, pero si el plan 14 toca otra pantalla que los lee, aplica el mismo problema.
- **`records.checkIn` y `records.weekStrip` esperan a que la card de hoy salga de `cargando`/`neutral`**: si por un fallo la card queda en `neutral` (D-18), esos dos flags no se actualizan esa visita (conservador a propósito).
- **Hidratación del flag**: si `cardFlags.hydrate` no terminó cuando se escribe un record, `record()` solo actualiza memoria y no persiste (comportamiento del store del plan 07); el boot lo hidrata antes del primer frame, así que no debería ocurrir.
- Tipado y tests sin correr (D-17): primera corrida real en el orquestador (`vue-tsc` y vitest sobre `mi-templo-slots.test.ts`).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-203-29 mitigado (solo booleanos por card, la función pura recibe conteos, nunca contenido). T-203-30 mitigado (`records` solo con `ok === true` y fuente resuelta; test dedicado para novedades, sponsors, check-in y evaluación).

## Self-Check: PASSED

- Commits `5ec01b755`, `d856baca9`, `d6d5df131` presentes en `feat/203-carga-sin-parpadeos`; nada commiteado en el checkout principal; `.planning/STATE.md` y `ROADMAP.md` sin tocar.
- Greps de `<verify>` de las tres tareas OK; sin `any` ni `console.*`; `Notify.create` en `useProgressionApi.ts` sin cambios.
