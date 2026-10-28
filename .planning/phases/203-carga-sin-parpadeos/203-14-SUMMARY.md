---
phase: 203-carga-sin-parpadeos
plan: 14
subsystem: app-entrenar-perfil
status: complete
completed: 2026-10-28
requirements: [SC-3, D-01, D-07, D-08, D-09, D-17]
commits: [75da3b6b1, 386500b09]
key-files:
  created:
    - el-templo-app/src/modules/training/utils/training-index-view.ts
    - el-templo-app/src/modules/training/utils/__tests__/training-index-view.test.ts
    - el-templo-app/src/utils/profile-subscription-view.ts
    - el-templo-app/src/utils/__tests__/profile-subscription-view.test.ts
  modified:
    - el-templo-app/src/modules/training/pages/TrainingIndex.vue
    - el-templo-app/src/pages/ProfilePage.vue
---

# Phase 203 Plan 14: Entrenar y Perfil no deciden "sin plan" antes de tiempo (SUMMARY)

Entrenar ya no elige entre la vidriera y EntrenarView con datos a medias (C-8), y la fila "Tu plan" de Perfil ya no dice "Sin plan activo" mientras la suscripción no llegó ni cuando falló por red (C-9). Perfil no dibuja "Atleta", iniciales ni sede vacía sin perfil (D-08).

## Qué quedó

### Task 1 (`75da3b6b1`): vistas puras + tests
- `resolveTrainingIndexView({ profileLoaded, memberStateLoaded, subscriptionFailed, programFailed, canEnterTraining, deadlinePassed })` -> `'loading' | 'vidriera' | 'entrenar'`. Precedencia en el docblock: perfil (espera siempre) -> estado del socio (espera hasta el tope; vencido, 'entrenar') -> todo llegado y entra -> fallas (`subscriptionFailed`/`programFailed`: 'entrenar' al instante) -> vidriera solo con todo llegado y sin fallas.
- `resolveProfileSubscriptionView({ subscriptionLoaded, subscriptionFailed, hasActivePlan, deadlinePassed })` -> `'skeleton' | 'content' | 'none' | 'unknown'`.
- Ambas puras (sin stores/axios). Tests: 15 casos en `training-index-view.test.ts` y 9 en `profile-subscription-view.test.ts`, incluidos "sin perfil con tope vencido -> loading", `programFailed`/`subscriptionFailed` sin tope -> 'entrenar', `subscriptionFailed` sin tope -> 'unknown', y barridos exhaustivos de que una falla nunca da 'vidriera' / 'none'.

### Task 2 (`386500b09`): páginas
- `TrainingIndex.vue`: `view = computed(resolveTrainingIndexView(...))`; banner de primera vez, loader, vidriera y EntrenarView salen de `view`. `onMounted`: `deadline.start()` + `void ensureMemberState({ maxAgeMs: MEMBER_STATE_MAX_AGE_MS })` (sin `force`, sin `await`); `onBeforeUnmount(deadline.cleanup)`. Ya no usa `subscriptionLoading` ni `loadSubscription()`.
- `ProfilePage.vue`: la fila "Tu plan" (sigue siendo `router-link to="/planes"`, con "Ver en Planes" y chevron) se ramifica por `subscriptionView`: esqueleto / nombre del plan / "Sin plan activo" (muted) / "No pudimos cargar tu plan" (muted). Con `profile === null`: `q-skeleton` en avatar (círculo 64 px), nombre, email y valor de Sede. `onMounted` sin `async`: `deadline.start()`, `void ensureMemberState(...)` y `void loadPreferences()` en el mismo tick (en paralelo). `TemploLoader` sigue importado (toggles de notificaciones).
- Prettier y eslint pasaron sobre los 6 archivos. Todos los greps del plan (Task 1 y 2) y los criterios de aceptación verificados (`to="/planes"` = 1, `await` en `onMounted` = 0, `q-skeleton` = 5).

## Tests escritos SIN correr (D-17) — los corre el orquestador

1. `el-templo-app/src/modules/training/utils/__tests__/training-index-view.test.ts` (NUEVO, 15 casos)
2. `el-templo-app/src/utils/__tests__/profile-subscription-view.test.ts` (NUEVO, 9 casos)

No hay test de componente de `TrainingIndex.vue` ni de `ProfilePage.vue` (no existían; sin vitest no se agregaron). `vue-tsc` no se corrió: ojo con las dos páginas (template de Perfil con `userStore.profile?.email` y `userStore.subscription?.planName`).

## Deviations from Plan

**1. [Diseño] Se eliminó el fallback `'Atleta'` también de las iniciales.** El grep de aceptación prohíbe `fullName || 'Atleta'`; además, con perfil cargado `fullName` nunca es vacío (cae al email), así que el fallback era código muerto. `initials` ahora usa `userStore.fullName` directo y solo se dibuja con perfil.

**2. [Diseño] Alturas de los esqueletos de Perfil estimadas** (nombre 28 px, email 20 px, valores de fila 22 px, avatar 64 px = el diámetro de `.profile-head__avatar`). Sin build/dispositivo (D-17): confirmar en el UAT del plan 17 que el encabezado y las filas no saltan al llegar el perfil.

**3. [Diseño] El encabezado de Perfil se separa en dos `<header>` (`v-if` perfil nulo / `v-else`)** en lugar de poner `q-skeleton` dentro de `h1`/`p` (un `div` dentro de `h1`/`p` es HTML inválido). El esqueleto lleva `aria-busy="true"`.

**4. [Diseño] `FirstVisitTipBanner` se muestra con `view !== 'loading'`** (incluye la vidriera, igual que antes: antes se mostraba siempre que no cargaba la suscripción).

Sin otros cambios. Sin bugs nuevos fuera de alcance salvo lo que figura en Riesgos.

## Riesgos antes del plan 15

- `memberStateLoaded` sube cuando las SEIS fuentes terminaron (`allSettled`): Entrenar espera a la más lenta (incluidos plan-status y trial) hasta el tope, aunque suscripción + programa ya hayan llegado. Es lo que pide la regla (D-09), pero si el UAT muestra loader largo en Entrenar habría que mirar `subscriptionLoaded`/`myProgressLoaded` por separado (el plan no lo pidió).
- Con `memberStateLoaded` ya true y datos frescos (vuelta a la pestaña dentro de 15 s) `ensureMemberState` no pide nada y la vista sale directa; con un refresco en vuelo la vista NO vuelve a 'loading' (`memberStateLoaded` no baja), correcto para no parpadear.
- Un socio con `programFailed` y sin plan presencial ve EntrenarView aunque en realidad no tenga plan (T-203-32, aceptado): el server gatea `/sessions/weekly`; EntrenarView debería mostrar su propio estado de error/vacío ahí (plan 15/16 si toca Entrenar).
- Quedan llamadores de `loadSubscription()` (carga COMPLETA de 6 GET con force) fuera de este plan: `ReservasPage.vue:2172` y `:2327`, `ReservasPageLegacy.vue:778`, `ActivarInvitacionPage.vue:290`. Los de Reservas/Activar son explícitos de datos frescos (tras una compra o alta), pero conviene revisarlos en el plan de Reservas.
- Perfil: `hasActiveSubscription` (active|paused) decide 'content'; un plan `pending`/`expired` conocido se muestra como "Sin plan activo" (igual que antes).

## Self-Check: PASSED

- Archivos creados y modificados existen; commits `75da3b6b1` y `386500b09` en `feat/203-carga-sin-parpadeos`.
