---
phase: 197-entrenar-tabs-canasta-bloque-libre
plan: 12
subsystem: app-semana
tags: [semana, composable, componentes, d-03, d-18]
requires: ["197-11"]
provides:
  - useTrainingWeek (carga de cualquier semana, hoy de la sede, selección, progreso, nivel)
  - components/semana/ WeekHeader, WeekDayStrip, SemanaHero, SemanaTab
  - DayPlayer abre días de otras semanas
affects: [197-13, 197-19]
key-files:
  created:
    - el-templo-app/src/modules/training/composables/useTrainingWeek.ts
    - el-templo-app/src/modules/training/components/semana/WeekHeader.vue
    - el-templo-app/src/modules/training/components/semana/WeekDayStrip.vue
    - el-templo-app/src/modules/training/components/semana/SemanaHero.vue
    - el-templo-app/src/modules/training/components/semana/SemanaTab.vue
  modified:
    - el-templo-app/src/modules/training/pages/DayPlayer.vue
requirements: [D-03, D-18]
---

# Fase 197 Plan 12: Semana, mitad de arriba — Summary

Composable de semana y los cuatro componentes de la mitad de arriba de Semana (rótulo con flechas, tira de 7 días, título + CTA con los 6 estados), más el fix para que el player abra días de otras semanas.

## Qué se hizo

1. **`useTrainingWeek()`**: contrato completo del plan. "Hoy" con `todayInTz(profile.branchTimezone ?? DEFAULT_BRANCH_TZ)`. `days` es un computed (fechas de `weekDatesFrom(monday)` + `useWeekData().sessions`); `dayOfWeek` sale del índice (sin parsear fechas). Tras cada carga llena `weekStore.setWeekDays` y `selectDate`. Selección por defecto: hoy, si no el primer día con sesión, si no el lunes. `hasProgress` sale de `sessionPlayerStore.loadProgress(dayId)` del día elegido. Watcher de `activeLevel` (ignora `null -> nivel`) recarga conservando el día elegido. `cleanup()` corta el watcher e invalida cargas en vuelo.
2. **`DayPlayer.vue`**: `loadWeekDataIfEmpty` y el watcher de `activeLevel` piden `getWeekDates(new Date(dateParam.value + 'T00:00:00'))` (expresión literal en los dos lugares).
3. **`WeekHeader`**: rótulo `pd-label-11` de alto 24, flechas 44x44 con margen -10 (no suman alto), `aria-label`, `disabled` según `canPrev`/`canNext`.
4. **`WeekDayStrip`**: grilla de 7, elegido con borde terracota sin relleno, hoy con borde de tinta, punto salvia en completados, punteado en sin plani/domingo, `aria-pressed` y `aria-label` con la fecha larga.
5. **`SemanaHero`**: kicker, `<h1>` 28 px con `line-clamp: 3`, chip "Hecha", CTA 56 px con `primary` / `secondary` / `unavailable` (sin opacidad), link "¿Te quedaste con ganas? Sumá un bloque libre", hint. "Hacerla igual" de un día completado pide confirmación con `$q.dialog` (T-197-32). Tiene un `<slot />` entre la fila título+CTA y el link, para el área de bloques de 197-13.
6. **`SemanaTab`**: presentacional (props/emits del contrato). Con `interactive=false` no emite nada y pone `inert`. Reenvía un slot por defecto con `{ day, gender }` al hero.

## Commits

- `03ed9df0e` feat(197-12): useTrainingWeek (cualquier semana, hoy de la sede) + DayPlayer abre días de otras semanas
- `e73e08df5` feat(197-12): Semana — rótulo, tira de días y título + CTA (D-03)

## Verificación (estática)

Los dos `<verify>` imprimen `OK`. Greps de higiene (console, any, `color: rgba`, `onUnmounted`, `v-html`, mezcla `??` con `||`/`&&`, "turno") sin salida; ninguna línea pasa de 100 columnas. Sin `node_modules`: typecheck, lint y build quedan para CI (el CI no typechequea el app: conviene un `vue-tsc` local antes del push).

## Desvíos/decisiones

- **Carga en serie** (cola de promesas + contador): `useWeekData` comparte refs entre llamadas, así que una respuesta lenta de una semana vieja pisaría a la nueva. La navegación rápida salta las cargas superpuestas; `loading` queda en `true` hasta que termina la última.
- **`monday` cambia al instante** al navegar, y `days` se recalcula con el mapa de sesiones vacío mientras carga (`useWeekData` lo limpia al empezar). EntrenarView (197-19) debería mostrar un estado de carga con `loading` para que no parpadee "Sin plani".
- **`state` del día**: completed si está en `completedDates`, si no rest para el domingo, si no today/past/future. (`getDateState` evalúa el domingo antes que completed; se siguió el plan.)
- **`select()` ignora fechas fuera de la semana cargada.**
- **Slot** en `SemanaHero` y `SemanaTab` (con `{ day, gender }`) para que 197-13 monte chips, figura y lista sin tocar la estructura. La prop `gender` de `SemanaTab` solo viaja por el slot.
- **`summary` sin argumento** (contrato): quien escucha usa su `selectedDate`.
- El token `$pd-ink-2` es `#5f584d`, no el `#6b6459` del sketch (se reusa el token del repo).
- `inert` se pone con `:inert="interactive ? undefined : true"` (Vue renderiza `inert="true"`; `false` quedaría como atributo presente).
- Trailer de commits: `Claude Opus 5.5` según el orquestador.

## Bugs encontrados

Ninguno.

## Para el orquestador

- Los componentes todavía no están montados en ninguna pantalla (197-19).
- El watcher de `activeLevel` del composable se crea en el `setup` de quien lo use; `cleanup()` hay que llamarlo desde `onUnmounted` del componente que lo monta.

## Known Stubs

Ninguno. El slot del área de bloques queda vacío a propósito hasta 197-13.

## Self-Check: PASSED

Los 5 archivos creados existen y los commits `03ed9df0e` y `e73e08df5` están en `feat/197-entrenar`.
