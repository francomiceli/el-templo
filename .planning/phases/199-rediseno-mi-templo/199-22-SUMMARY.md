---
phase: 199-rediseno-mi-templo
plan: 22
subsystem: app/progression (card de hoy de Mi Templo)
tags: [gap-closure, today-card, uat-D3, uat-D4, uat-D5, uat-D11, C1, C2]
requires: [199-21]
provides:
  - "resolveTodayCard sin kinds `descanso` ni `plan-programado`, con `presencial-proxima`"
  - "formatNextClassTitle exportada"
key-files:
  modified:
    - el-templo-app/src/modules/progression/utils/today-card.ts
    - el-templo-app/src/modules/progression/utils/__tests__/today-card.test.ts
    - el-templo-app/src/modules/progression/pages/MiTemplo.vue
metrics:
  tasks: 2
  commits: 2
  tests-app: "today-card.test.ts 100/100"
completed: 2026-10-15
---

# Phase 199 Plan 22: La card de hoy nunca dice que descanses

Gap closure de UAT D3, D4, D5 y D11 con las confirmaciones C1 y C2 de Franco: `resolveTodayCard` ya no devuelve nunca "Hoy descansás"; el presencial sin clase hoy ve su próxima clase ("Lunes 19 · 19:00") o "Reservá tu clase"; la clase de hoy ya pasada sin asistencia se ignora; el plan programado se trata como plan activo; y todo el copy visible dice "clase", no "turno".

## Commits (solo en el worktree `et-199-mi-templo`, sin push)

| Task | Commit      | Contenido                                                                               |
| ---- | ----------- | --------------------------------------------------------------------------------------- |
| 1    | `6b4249ae4` | `fix(199-22)`: today-card.ts reescrito, MiTemplo.vue sin entradas muertas, test compila |
| 2    | `b3589a2b7` | `test(199-22)`: 100 casos + matriz anti "descans"/"turno"                               |

## Qué cambió

- **today-card.ts**
  - `TodayCardKind`: fuera `descanso` y `plan-programado`; entra `presencial-proxima`.
  - `TodayCardInput`: se borran `tomorrowRoute` y `weekLoaded`.
  - Se borran `planProgramado`, `descansoOnline`, `descansoPresencial`, `tomorrowMeta`, `addDays` y la variante "Tu turno fue" / "Tu clase ya pasó" / "Mis turnos".
  - Nuevos: `formatNextClassTitle` (exportada, `Intl` en UTC, primera letra en mayúscula, fecha inválida → solo la hora) y `presencialProxima`.
  - Precedencia nueva: `canTrain = hasPlan || hasScheduled`. Sin `canTrain`: `cargando` / `online-libre` con "Ver planes" / `sin-plan-vencio` / `sin-plan-nunca`. Luego `completada`. Virtual: programa → `online-programa` siempre; sin programa → `online-libre` sin "Ver planes". Presencial: (D5) `missedToday` → clase ignorada; a) clase vigente → `presencial-turno`, b) `bookingsLoading` → `cargando`, c) lista de espera → `presencial-sin-turno`, d) `nextBooking` → `presencial-proxima`, e) `presencial-sin-turno` ("Reservá tu clase").
  - `withExtraPrograms` envuelve también `presencial-proxima` y `presencial-sin-turno`.
  - Docblock reescrito.
- **MiTemplo.vue**: se saca `tomorrowRoute`/`weekLoaded` del input. Borrado tras `grep` (nada más lo usaba): `tomorrowStr`, `tomorrowRoute`, `weekLoaded`, `weekError`, la 2.ª instancia `useWeekData` (`nextWeekSessions`/`fetchNextWeekSessions`), `nextWeekDates`, `weekDatesFrom` (inlineada en `currentWeekDates`) y la carga de la semana siguiente los domingos. `loadWeeks()` ahora solo trae la semana actual. Comentarios con "turno"/"descansás" actualizados.
- **TodayCard.vue**: sin tocar (diff vacío). `TodayCardModel` sin campos nuevos.

## Verificaciones

| Check                                                     | Resultado                                                                                                                                                            |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx vitest run .../today-card.test.ts`                   | 100/100 verde                                                                                                                                                        |
| `vue-tsc --noEmit`                                        | 18 errores totales (todos preexistentes), 0 en archivos del plan                                                                                                     |
| `pnpm lint`                                               | 0 errores, 2 warnings preexistentes (`boot/axios.ts`, `useSessionPlayer.ts`)                                                                                         |
| greps de aceptación Task 1                                | `descans` = 0; literales "turno" salvo ids = 0; `TodayCard.vue` "turno" = 0 y diff vacío; textos viejos = 0; `Date.now()/new Date()` = 0; modelo sin campos visuales |
| Aserciones negativas con `'descanso'`/`'plan-programado'` | solo en la matriz (líneas ~1040-1042 del test, `expect(String(m.kind)).not.toBe(...)`)                                                                               |
| Worktree                                                  | limpio                                                                                                                                                               |

Contadores del test: `presencial-proxima` 10, `formatNextClassTitle` 12, "Lunes 19 · 19:00" 5, "Elegí día, horario y sede" 2, `/turno/i` 1, `/descans/i` 1, `hasScheduledPlan: true` 6, `windowState: 'after'` 5.

## Mutantes (sobre today-card.ts, restaurado con `git checkout` tras commitear)

| Mutante                                                  | Tests que fallan |
| -------------------------------------------------------- | ---------------- |
| M1 (D5) `missedToday` siempre false                      | 4                |
| M2 (D3) `if (false && input.nextBooking)`                | 8                |
| M3 (D3 online) virtual+programa domingo → `onlineLibre`  | 3                |
| M4 (D4) `canTrain = hasPlan`                             | 9                |
| M5 (D11) `'Tu clase: '` → `'Tu turno: '`                 | 4                |
| M6 (C1) título sin mayúscula inicial                     | 6                |
| M7 (C2) sin-turno con secundario "Ver la sesión"         | 4                |
| M8 (precedencia) `nextBooking` antes que lista de espera | 1                |

Los 8 mueren; no hizo falta test adicional.

## Decisiones [discreción]

1. La lista de espera de HOY gana sobre una clase futura (como pedía el plan): meta "Estás en lista de espera · HH:MM" bajo el título "Reservá tu clase".
2. `presencial-sin-turno` conserva el chip de `checkInMessage` (el plan no lo mencionaba; se mantuvo el comportamiento previo).
3. La matriz recorre 5376 combinaciones; el segundo `it` extra asegura que un presencial sin clase vigente nunca ve "Entrenar" ni "Ver la sesión".

## Deviations from Plan

Ninguna de fondo. Detalles menores:

- Task 1: para que el test compile se sacaron `tomorrowRoute`/`weekLoaded` con regex en el mismo commit; Prettier reformateó el test.
- Task 2: el contador de `windowState: 'after'` ≥ 3 obligó a escribir el literal explícito en cada caso D5 (`PASADA` quedó sin `windowState`).
- `weekError` también se borró de `MiTemplo.vue` (solo alimentaba `weekLoaded`).

## Bugs reales / dudas abiertas (no bloqueantes)

- El ejemplo de C1 dice "Lunes 20" pero el 20/10/2026 es martes; los tests usan "Lunes 19" (fecha coherente), como anticipaba el plan.
- Con `weekLoaded` fuera, ya no hay guarda de "semana no cargada" en el presencial: no hace falta, porque la ruta de hoy solo se usa como título cuando hay clase de hoy.
- Al domingo ya no se pide la semana siguiente: un request menos en Mi Templo (los domingos).
- `TodayCard.vue` sigue pintando cualquier modelo sin cambios; 199-30 mapeará ícono/estilo por `kind` y deberá contemplar `presencial-proxima`.

## Known Stubs

Ninguno.

## Self-Check: PASSED

- `6b4249ae4` y `b3589a2b7` presentes en `feat/199-mi-templo-rediseno`; archivos modificados verificados; worktree limpio.
