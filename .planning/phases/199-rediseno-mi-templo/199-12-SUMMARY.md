---
phase: 199-rediseno-mi-templo
plan: 12
subsystem: app-checkin-fab
tags: [check-in-window, today-booking-store, fab, d-04, d-06]
requires: [199-11, 199-06]
provides:
  - utils/check-in-window.ts (ventana ±20 min espejo del server, categoría de asistencia, helpers de semana y hora)
  - useTodayBookingStore (turno de hoy, próximo turno, ventana, asistencia por categoría, reloj)
  - fetchMyBookings / MyBookingsResponse exportadas desde useSchedulingApi.ts (URL en un solo lugar)
  - FAB QR extendido "Marcar asistencia" solo dentro de la ventana
affects: [199-13, 199-14, 199-15, 199-20]
key-files:
  created:
    - el-templo-app/src/utils/check-in-window.ts
    - el-templo-app/src/utils/__tests__/check-in-window.test.ts
    - el-templo-app/src/stores/useTodayBookingStore.ts
    - el-templo-app/src/stores/__tests__/today-booking-store.test.ts
  modified:
    - el-templo-app/src/types/scheduling.ts
    - el-templo-app/src/composables/useMagicLink.ts
    - el-templo-app/src/composables/useSchedulingApi.ts
    - el-templo-app/src/layouts/MainLayout.vue
    - el-templo-app/src/pages/CheckInPage.vue
requirements-completed: [D-04, D-06]
completed: 2026-10-15
---

# Phase 199 Plan 12: botón QR condicional y turno de hoy en la app Summary

El botón QR flotante solo aparece dentro de la ventana ±20 min de una reserva `reservado` de hoy (misma regla que el server), extendido con "Marcar asistencia", y la asistencia ya marcada se evalúa por categoría igual que el server. El turno de hoy vive en un store compartido que usarán las cards de los planes 14-15.

## Commits (worktree `et-199-mi-templo`, rama `feat/199-mi-templo-rediseno`)

- Task 1: `247462cb8` feat(199-12): util de ventana de check-in ±20 min, MyBookingRecord y branchTimezone del magic link
- Task 2: `37a6f3f63` feat(199-12): useTodayBookingStore con turno de hoy, ventana ±20 min y asistencia por categoría
- Task 3: `6354501ee` feat(199-12): botón QR solo en la ventana ±20 min del turno, extendido con "Marcar asistencia"

## Qué se hizo

- **`check-in-window.ts`** (puro, `now` inyectado): `CHECK_IN_WINDOW_MS`, `classStartUtc`, `checkInWindowState`, `minutesUntil`, `formatHHMM`, `formatTimeInTz`, `addDaysStr`, `weekStartsFor`, `activityKindKey`, `REGULAR_KIND`; re-exporta `DEFAULT_BRANCH_TZ` de `tz.ts` (no se redeclara). Espejo de `attendance/service.ts` líneas 124 (`windowMs`) y 156 (`Math.abs(now - classTime) <= windowMs`): borde inclusivo en ambos lados, referencia = inicio de la clase en la zona de la sede de la clase (`branchTimezone` de la reserva), con fallback a la del perfil. `activityKindKey` es espejo de `sameActivityKindSql`.
- **`MyBookingRecord`** (campos opcionales) en `types/scheduling.ts`; `useMagicLink` copia `branchTimezone` al perfil.
- **`fetchMyBookings` / `MyBookingsResponse`** extraídos a nivel de módulo en `useSchedulingApi.ts`; `getMyBookings` del composable delega (mismo comportamiento). La URL `/members/scheduling/my-bookings` queda escrita una sola vez en `src/` (fuera de tests).
- **`useTodayBookingStore`** (Pinia setup): carga semana actual + siguiente en paralelo (fail-open, `generation` descarta respuestas viejas), `todayBooking`, `todayWaitlist`, `nextBooking`, `windowState`, `minutesToStart`, `windowBooking`, `fabVisible`, `attendanceMarkedAt`, `attendanceMarkedFor(kind)`, `markAttendanceDone()`, `startClock` (idempotente), `stopClock`, `reset`. El flag local es una lista de claves `fecha-de-sede|categoría`, así que no esconde otra categoría ni sobrevive al cambio de día de la sede.
- **`MainLayout`**: carga + `startClock()` al autenticarse, `reset()` al desloguear (para el reloj), `load()` al entrar a `/mi-templo` o `/reservas`, `onUnmounted(stopClock)`; `showCheckInFab` suma `todayBookingStore.fabVisible`; FAB extendido (terra, 56 px, label visible, sin tooltip) con entrada `fabIn` y pulso solo bajo `prefers-reduced-motion: no-preference`; `formattedDate` ahora sale de `todayBookingStore.todayStr`.
- **`CheckInPage`**: tras éxito, y ante "Ya registraste asistencia", `markAttendanceDone()` y luego `load()`.

## Verificación

- `npx vue-tsc --noEmit`: 18 errores totales (límite 18). Ninguno en archivos de este plan, salvo el error preexistente `displayName` en `MainLayout.vue(320,39)` (línea previa, ahora desplazada).
- `pnpm lint`: 0 errores (2 warnings preexistentes en `boot/axios.ts` y `useSessionPlayer.ts`).
- Greps de aceptación (todos OK): `CHECK_IN_WINDOW_MS = 20 * 60 * 1000`=1, `attendance/service.ts`≥1, `new Date()`/`Date.now()` en el util = 0, zona default literal en el util = 0, `branchTimezone` en useMagicLink = 2, URL de my-bookings fuera de tests = 1 (en `useSchedulingApi.ts`), `fetchMyBookings(` en el store = 2, `activityKindKey(` en el store = 3, `getDay()/getHours()` = 0, `function reset|startClock|stopClock` = 3, `weekStartsFor(` = 1, `fabVisible` en MainLayout = 1, `todayBookingStore.reset()` = 1, `markAttendanceDone()` en CheckInPage = 2, `formatGreetingDate(todayBookingStore.todayStr)` = 1, `prefers-reduced-motion` = 1.
- Tests de app corridos de a uno, en foreground (excepción a la regla del plan, que decía no correrlos):
  - `src/utils/__tests__/check-in-window.test.ts`: 26/26.
  - `src/stores/__tests__/today-booking-store.test.ts`: 25/25 (a la primera corrida falló 1: el test de "respuesta en vuelo" guardaba un solo resolver y `load()` pide dos semanas; arreglado en el test).
  - Mutante: reemplazar `activityKindKey(b) === kind` por `true` en `attendanceMarkedFor` hace fallar los 2 tests de "otra categoría" / "otra línea"; restaurado.
- `useMagicLink` no tiene test propio. No se corrió `pnpm build`.

## Deviations from Plan

1. **[Menor] Tests de app corridos localmente** por indicación del orquestador (el plan decía no correrlos); solo los 2 archivos creados.
2. **[Menor] Criterio `grep -c 'label="Marcar asistencia"' MainLayout.vue` = 1 da 2**: `aria-label="Marcar asistencia"` contiene la subcadena. El FAB tiene un solo `label` y un solo `aria-label`, como pide el plan.
3. **[Menor] `color="primary"` quitado del FAB.** Quasar pinta `.bg-primary` con `!important` y pisaría el fondo `#96593a` del sketch; el fondo, color y sombra se declaran en `.check-in-fab--extended`. El `right` pasa de 24 a 16 px solo para el FAB extendido (solo se muestra en mobile).
4. **[Menor] `load()` refresca `now`** al empezar (además del reloj de 30 s) para que la card de hoy no use una hora vieja si la app volvió de segundo plano.
5. **Tip `qr-checkin`**: no se movió. Anclado a `right: 16px` con la flecha a 28 px del borde derecho, sigue apuntando dentro del FAB más ancho (el FAB mide ~190 px y arranca en `right: 16px`). Falta confirmarlo a ojo en el UAT/capturas.

## Bugs reales encontrados

Ninguno en código previo.

## Dudas abiertas (no bloqueantes)

- `MainLayout` llama a `todayBookingStore.load()` para cualquier rol autenticado (coach/admin incluidos). Si `my-bookings` responde 403/vacío para ellos, el store queda en `[]` y solo loguea un `warn` (fail-open), pero es una request extra por sesión. Si molesta, restringir a `role === 'member'`.
- `fabVisible` ya no se activa por la ruta sola: en `/reservas` y `/mi-templo` el FAB aparece/desaparece cuando el reloj de 30 s cruza la ventana (hasta 30 s de desfase, irrelevante frente a ±20 min). El plan 20 debe reservar el espacio inferior solo cuando aparece (L28); este plan no tocó el layout salvo el FAB.
- Una clase vista como `after` (más de 20 min pasados) con status todavía `reservado` queda como `todayBooking` si es la última del día; las cards de los planes 14-15 deben decidir cómo mostrarla.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del threat_model. T-199-35 aceptado (la ventana es solo UI; el server sigue validando). T-199-36 mitigado: el store hace `reset()` (reservas, flags y reloj) al desloguear.

## Self-Check: PASSED

- Archivos creados existen; commits `247462cb8`, `37a6f3f63`, `6354501ee` presentes en el worktree; `git status --porcelain` vacío.
