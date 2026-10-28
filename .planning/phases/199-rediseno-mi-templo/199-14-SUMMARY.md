---
phase: 199-rediseno-mi-templo
plan: 14
subsystem: app-today-card-logic
tags: [today-card, plan-status, pure-function, d-01, d-03, d-04, d-05]
requires: [199-05, 199-12, 199-13]
provides:
  - resolveTodayCard(input) → TodayCardModel (pura, 10 gates) + formatDayKicker / formatLongDate / shortBranchName
  - useUserStore: loadPlanStatus (fail-open), planStatus, subscriptionLoaded, memberHasActivePlan, planStateLoading
  - types/plan-status.ts (MemberPlanStatus)
affects: [199-15, 199-16, 199-20]
key-files:
  created:
    - el-templo-app/src/modules/progression/utils/today-card.ts
    - el-templo-app/src/modules/progression/utils/__tests__/today-card.test.ts
    - el-templo-app/src/types/plan-status.ts
  modified:
    - el-templo-app/src/stores/useUserStore.ts
requirements-completed: [D-01, D-03, D-04, D-05]
completed: 2026-10-15
---

# Phase 199 Plan 14: lógica de la card de hoy y estado de plan del socio Summary

`resolveTodayCard(input)` decide, sin tocar stores ni reloj, el contenido de la card de hoy para los 10 gates (cargando, presencial con/sin turno, descanso presencial/online, completada, online con programa/libre, sin plan nunca/venció, plan programado). El user store ahora expone el estado de plan (`hadPlan`, `lastPlan`, programada) y un `planStateLoading` para que ningún gate de "sin plan" se decida mientras algo carga.

## Commits (worktree `et-199-mi-templo`, rama `feat/199-mi-templo-rediseno`)

- Task 1: `84f249bd0` feat(199-14): lógica pura de la card de hoy por gate + estado de plan del socio (D-03, D-05)
- Task 2: `3d12cd1be` test(199-14): un caso por gate de la card de hoy, precedencias, carga y respaldo de plan-status

(Dos commits en vez del único del plan, por la regla de commits atómicos por task.)

## Qué se hizo

- **`today-card.ts`** (puro; docblock con la precedencia): gate 0 `hasPlan` (activa/pausada o `planStatus.hasActivePlan`) + `planLoading` → `cargando` (kicker del día, sin textos ni acciones). Gate 1 sin plan: programada → `plan-programado`; sede virtual → `online-libre` con "Ver planes"; `hadPlan` → `sin-plan-vencio`; si no → `sin-plan-nunca` (incluye `planStatus` null, fail-open). Con plan: `completada` → virtual (con programa: domingo o semana cargada sin sesión → `descanso` online; si no `online-programa`; sin programa → `online-libre` todos los días) → presencial (reserva → `presencial-turno`; domingo o semana cargada sin sesión → `descanso`; si no `presencial-sin-turno`, con variante lista de espera). `tertiary` "Tus programas" para presenciales con add-ons.
- **`useUserStore`**: `loadPlanStatus()` (`planStatusLoading` sincrónico antes del `await`, error → `planStatus = null` + `log.warn`, nunca lanza), `subscriptionLoaded` (se prende en el `finally` de `loadSubscription`), `memberHasActivePlan`, `planStateLoading`; `clearProfile()` limpia todo (T-199-39). `hasActiveSubscription` no se tocó.
- **`types/plan-status.ts`**: `MemberPlanStatus`, reexportado por el store.

## Verificación

- `npx vue-tsc --noEmit`: 18 errores totales (límite 18, el de `displayName` en `MainLayout.vue` es preexistente); 0 en `today-card*`, `useUserStore`, `plan-status`.
- `pnpm lint`: 0 errores (2 warnings preexistentes en `boot/axios.ts` y `useSessionPlayer.ts`).
- Greps de aceptación Task 1: `new Date()`/`Date.now()` = 0; los 14 copys exigidos ≥ 1; `me/plan-status` = 1; `subscriptionLoaded.value = true` = 1; `planStateLoading|memberHasActivePlan` = 4; `'cargando'` = 2; `planLoading` = 3; `hasActivePlan` ≥ 1.
- Greps de aceptación Task 2: `it(` = 73 (≥ 24), `cargando` = 10, `planLoading: true` = 7, `hasActivePlan: true` = 4, `isVirtual: true` = 20 (≥ 5).
- **Tests de app corridos** (excepción al plan "no correr vitest local", por indicación del orquestador; CI no corre vitest de la app), foreground y solo este archivo: `src/modules/progression/utils/__tests__/today-card.test.ts` → 73/73 (también después de que lint-staged/prettier reformateó).
- **Mutantes** (cada uno aplicado, corrido, restaurado; `git diff` limpio al final):
  1. apagar el gate `cargando` (`if (false && input.planLoading)`) → fallan 4 tests;
  2. quitar la guarda `weekLoaded` de "sin sesión hoy" → fallan 3;
  3. quitar el respaldo `planStatus.hasActivePlan` → fallan 3;
  4. apagar el gate `plan-programado` (L34) → fallan 4;
  5. anular la detección de "clase pasada sin asistencia" (L35) → falla 1;
  6. `online-libre` con plan en domingo → `descanso` → falla 1.
     Los 6 detectados.

## Deviations from Plan

1. **[Rule 3 - estructura] `MemberPlanStatus` vive en `src/types/plan-status.ts`**, no definido en `useUserStore.ts`. L36 pide que el util no importe stores; el plan tipaba `planStatus: MemberPlanStatus` y el interface estaba pensado en el store. El store lo reexporta (`export type { MemberPlanStatus }`), así que el contrato del plan se mantiene.
2. **[Menor] Dos commits** (uno por task) en vez de uno.
3. **[Menor] Tests de app corridos localmente** por indicación del orquestador.
4. **[Interpretación L34] `plan-programado`** (el plan lo definía pero el copy no estaba en D-05): kicker "Tu plan", título "Arranca el {d de mes}" (de `subscription.startDate` si está `scheduled`, si no `planStatus.scheduledStartDate`; sin fecha: "Tu plan ya está programado"), meta = nombre del plan o, cuando solo hay plan-status, "Ya renovaste: te avisamos cuando arranque." (texto mío, a confirmar en UAT), primario "Ver planes". Cubierto con 6 tests.
5. **[Interpretación L35] Clase de hoy con ventana ya pasada y sin asistencia** (`windowState === 'after'`): sigue siendo `presencial-turno` pero con meta "Tu turno fue: 19:00 · Alem", chip "Tu clase ya pasó" y secundario "Mis turnos" (no "Cambiar turno"). La card nunca ofrece "Marcar asistencia"; el QR sigue dependiendo solo de `fabVisible`. Con asistencia marcada, aunque la ventana haya pasado, queda el copy normal con el chip de asistencia.
6. **[Menor] Chip de ventana**: si hay `attendanceMarkedAt` no se muestra además el chip "Tu clase empieza en N min" (el sketch solo muestra el de asistencia).
7. **[Menor] `hhmm`**: la hora de reserva/lista de espera/próximo turno se recorta a `HH:MM` por si la API devuelve `HH:MM:SS`.
8. **[Menor] `formatLongDate` tolera timestamps ISO** (toma `YYYY-MM-DD`) y fechas inválidas devuelven el texto original (no explota).

## Bugs reales encontrados

Ninguno en código previo.

## Dudas abiertas (no bloqueantes, para el UAT / plan 15)

- **Plan 15 debe disparar `loadSubscription` y `loadPlanStatus`**: `planStateLoading` queda `true` hasta que `planStatusLoaded` sea true cuando no hay suscripción activa. Si Mi Templo (o la hoja de patrocinadores) no llama a `loadPlanStatus`, la card se queda en `cargando` para socios sin plan. Está documentado en el docblock del computed.
- **Interpretaciones de L33** a confirmar en UAT: online sin plan ve "Entrenar" (no "Arrancá/Renová", que son presenciales); online con programa ve "Hoy descansás" domingo/sin sesión; `paused` cuenta como plan activo.
- **Copy de `plan-programado`** (deviation 4) y de la clase pasada (deviation 5): validar con Franco.
- El descanso presencial no muestra chip de `checkInMessage` (el plan solo lo pide en la variante online); si se quiere uniformar, es una línea.
- `to: '/planes'` y `/reservas` se asumen como rutas existentes (las usa el plan); la vista del plan 15 debería usarlas tal cual.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del threat_model. T-199-39 mitigado (`clearProfile()` limpia `planStatus` y flags). T-199-40 mitigado (fail-open; `cargando` mientras algo carga, nunca un gate equivocado).

## Self-Check: PASSED

- Archivos creados existen; commits `84f249bd0` y `3d12cd1be` presentes en el worktree; `git status --porcelain` del worktree vacío; nada commiteado ni tocado en `/home/franco/projects/el-templo`.
