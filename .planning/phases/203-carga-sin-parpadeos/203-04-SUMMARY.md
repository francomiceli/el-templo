---
phase: 203-carga-sin-parpadeos
plan: 04
subsystem: app-store
status: complete
completed: 2026-10-28
requirements: [SC-4, D-06, D-15, D-01, D-07, D-17]
commits: [f135f6164, 6c6e97529]
key-files:
  created:
    - el-templo-app/src/utils/share-in-flight.ts
    - el-templo-app/src/utils/__tests__/share-in-flight.test.ts
    - el-templo-app/src/stores/__tests__/user-store-member-state.test.ts
  modified:
    - el-templo-app/src/stores/useUserStore.ts
    - el-templo-app/src/stores/__tests__/user-store-plan-state-loading.test.ts
    - el-templo-app/src/stores/__tests__/user-store-plan-unseen.test.ts
    - el-templo-app/src/boot/auth.ts
    - el-templo-app/src/boot/__tests__/auth.test.ts
---

# Phase 203 Plan 04: useUserStore dueño único del estado del socio (SUMMARY)

`useUserStore` pide suscripción, plan-status, trial-eligibility, my-progress, current-program y enrollments en paralelo (6 GET), con promesa compartida de vigencia máxima 15 s, y expone banderas "cargó / falló" para que las pantallas no dibujen "no tiene" cuando es "no sé". El boot usa `ensureMemberState()`.

## Qué quedó

- `utils/share-in-flight.ts`: `shareInFlight(fn, { maxInFlightMs? })` → `{ run, reset, isInFlight, waitInFlight }`. Generaliza `runRefresh` de `boot/axios.ts`. Con `maxInFlightMs`, una corrida colgada deja de compartirse y su `finally` tardío no suelta a la nueva (se compara con la promesa actual).
- `useUserStore`:
  - `doLoadMemberState('initial' | 'refresh')` con `Promise.allSettled`. `initial` = las 6; `refresh` = my-progress + current-program/enrollments siempre, y suscripción + plan-status + trial solo si no hay plan activo (documentado en el docblock).
  - `loadMemberState`, `ensureMemberState({ maxAgeMs?, force? })`, `forceFullLoad` privada (sin carga en vuelo arranca en el mismo tick; con carga en vuelo espera con `waitInFlight` y encadena una carga `initial` completa; dos force simultáneos comparten la encadenada; un logout en el medio la cancela).
  - `loadSubscription()` = `ensureMemberState({ force: true })` (docblock nombra `ReservasPage.vue:2171` y `ActivarInvitacionPage.vue:290`). La cadena en fila se eliminó.
  - Constantes exportadas `MEMBER_STATE_MAX_AGE_MS` y `MEMBER_LOAD_MAX_IN_FLIGHT_MS` (15 s las dos).
  - Estado nuevo: `myProgress` (objeto completo) + `myProgressLoaded`, `trialEligibility` + `trialEligibilityLoaded` + `trialEligible`, `memberStateLoaded`, `subscriptionFailed`, `planStatusFailed`, `myProgressFailed`, `currentProgramFailed`, `programFailed`.
  - Fallas: un error de red conserva el último dato bueno y marca la bandera; el éxito posterior la limpia. 404 y 204 de la suscripción = "no tiene" (`subscriptionFailed` false). `loadPlanStatus` ya no pone `planStatus = null` en el `catch`.
  - Trial: sede virtual no se pide (`branchIsVirtual === true`); usa `api` directo, fail-open a null.
  - Logout (`clearProfile`): `memberGeneration++`, `memberLoad.reset()` y reseteo de todo lo nuevo. Toda escritura de las fetch va por `isCurrent()` (generación + `memberLoadSeq`), así una carga vencida o de un socio anterior no escribe nada (T-203-11).
  - Pelotita de Planes: `planUpdateClearSeq` + `clearSeqAtStart` en `loadPlanStatus`. Una respuesta que salió antes del `clearPlanUpdateUnseen()` se escribe con `hasUnseenPlanUpdate: false` (el resto de los campos sí se actualiza); un pedido posterior refleja al server.
- `boot/auth.ts`: `void userStore.ensureMemberState()` en lugar de `loadSubscription()`. `retryProfileLoad()` igual.
- `loadPlanStatus`, `fetchCurrentProgram` y `fetchProgramEnrollmentStatus` siguen exportadas y usables sin argumento (parámetro opcional `isCurrent`, por defecto "misma generación").

## Tests escritos, pendientes de correr cuando haya node_modules (D-17)

No se corrió nada (sin vitest, lint, vue-tsc ni build). Verificación por grep/estructura/`git diff`: las aserciones grep del plan dan OK.

- `utils/__tests__/share-in-flight.test.ts` (12 casos, nuevo): dedupe, args de la primera llamada, rechazo, reset, vigencia vencida, vieja tardía no suelta a la nueva, `waitInFlight` (resuelve al terminar, al vencer, sin carga, nunca rechaza), sin `maxInFlightMs`.
- `stores/__tests__/user-store-member-state.test.ts` (29 casos, nuevo): paralelo, un pedido por endpoint, sede virtual, force encadena carga completa, dos force comparten, `loadSubscription` con refresh en vuelo, `loadSubscription` en el mismo tick, logout cancela la encadenada, frescura/`maxAgeMs`, refresco con y sin plan activo, `memberStateLoaded`, 404/204/error de suscripción, conserva suscripción previa, my-progress (204, falla conserva, primera carga), enrollments/`programFailed`, `planStatusFailed`, `trialEligible`, logout a mitad de carga, carga colgada vence, force que esperaba la colgada, vieja tardía no pisa.
- `stores/__tests__/user-store-plan-unseen.test.ts` (ampliado: 3 originales intactos + 4 nuevos): respuesta tardía no reabre la pelotita, pedido posterior sí, vía `ensureMemberState`, `clearProfile` reinicia.
- `stores/__tests__/user-store-plan-state-loading.test.ts` (ajustado): el caso 1 ahora afirma D-15 (plan-status en paralelo; con plan-status en `deferred` pendiente `planStateLoading` sigue true) y se sumó un caso "tras await loadSubscription() el plan-status ya vino"; `mockApi` ahora espera `routes.planStatus`. El caso 2 (`subscriptionLoading === true` síncrono tras `loadSubscription()`) NO se tocó y revisado a mano sigue válido con `forceFullLoad`: sin carga en vuelo llama `memberLoad.run('initial')` en el mismo tick y `fetchSubscription` prende el flag antes de su primer `await`.
- `boot/__tests__/auth.test.ts` (ajustado): `ensureMemberState` en el mock plano; el caso "/auth/me OK" afirma `ensureMemberState` una vez y `loadSubscription` ninguna.

## Deviations from Plan

Ninguna de fondo; el plan se ejecutó como estaba escrito. Matices:

1. **[Decisión conservadora] 404 dentro del `catch` de `fetchSubscription`** asigna `subscription.value = null` (el plan lo pide: 404 = "no tiene"). Es la única asignación a vacío dentro de un `catch` y es intencional.
2. **[Rule 2 - hardening] `clearProfile` también resetea `subscriptionLoading`**: como una carga vieja ya no escribe en su `finally` (guard de generación), sin esto un logout a mitad de carga dejaba el flag en true.
3. **Test de la pelotita "clearProfile reinicia la secuencia"** es de higiene: no discrimina a un `planUpdateClearSeq` sin reiniciar (una respuesta vieja ya se descarta por generación). Se dejó porque el plan lo pide y documenta el contrato.
4. `loadPlanStatus` / `fetchCurrentProgram` / `fetchProgramEnrollmentStatus` aceptan un parámetro opcional `isCurrent`; sin argumento se comportan como antes.

## Riesgos a mirar antes del plan 05 (y de los planes de pantalla)

- **Ventana con pedidos duplicados hasta el plan 11:** el arranque pide plan-status dos veces (boot + `MainLayout.vue:246`) y `MiTemplo.vue` sigue con `loadPlanStatus()` (línea 325) y `fetchCurrentProgram()` (413). Esperado por el plan; la línea base de 19 pedidos no baja del todo hasta migrar las pantallas.
- **`loadSubscription()` ahora es una carga completa (6 GET) y `force`:** los llamadores de pantalla que lo disparan al montar (`MiTemplo.vue:408` si no hay plan activo, `TrainingIndex.vue:45` y `ProfilePage.vue:259` si no hay suscripción) hoy hacen 6 pedidos en lugar de 3, y si el boot sigue en vuelo y `subscriptionLoading` ya es false esperan y encadenan otra carga. Un socio sin suscripción (204) las dispara en cada montaje. Se corrige al migrarlos a `ensureMemberState()` (planes siguientes).
- `fetchCurrentProgram` con respuesta 204/body null de enrollments cae al `catch` (TypeError en `list.data.enrollments`) y marca `currentProgramFailed`; es el comportamiento previo (antes reseteaba), no se endureció.
- `catch` de suscripción: cualquier error que no sea 404 (incluido 401/5xx) marca `subscriptionFailed`; las pantallas del socio deben tratarlo como "no sé".
- Hook de pre-commit sin node_modules: los dos commits entraron sin lint/prettier. Revisar formato (prettier, líneas > 100 solo en títulos de `it`) cuando haya node_modules.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno (sin superficie nueva: mismos endpoints autenticados que antes; T-203-11 mitigado con generación + `reset()`).

## Self-Check: PASSED

- Archivos creados y modificados existen (`git status` limpio salvo este SUMMARY).
- Commits `f135f6164` y `6c6e97529` presentes en `git log`.
- Sin `any`, sin `console.*`, sin `Promise.resolve().then` ni cadena `await fetchCurrentProgram()` en `useUserStore.ts`.
