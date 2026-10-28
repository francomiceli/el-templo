---
phase: 203-carga-sin-parpadeos
plan: 06
subsystem: app-pages
status: complete
completed: 2026-10-28
requirements: [SC-4, SC-3, D-15, D-17]
commits: [64dcc46a9, 628845e3b, f91e70711]
key-files:
  created:
    - el-templo-app/src/utils/reservas-initial-load.ts
    - el-templo-app/src/utils/__tests__/reservas-initial-load.test.ts
  modified:
    - el-templo-app/src/pages/ReservasPage.vue
---

# Phase 203 Plan 06: Reservas multi-sede pide /weekly una sola vez (SUMMARY)

`ReservasPage` ya no duplica `/members/scheduling/weekly` al abrir en multi-sede (R-1), y el socio sin plan (no virtual) reusa el trial-eligibility que trae la carga completa del store en lugar de pedirlo dos veces.

## Qué quedó

- `utils/reservas-initial-load.ts`: `needsExplicitGridLoad(prev, next)` = `prev === next` (docblock en español). Test de 5 casos (5->5, null->null, null->5, 3->5, 5->null).
- `ReservasPage.vue`:
  - `onMounted` (multi-sede): `prevBranch` antes del bloque `isMultiBranch`; el `loadGrid()` final pasó a `if (needsExplicitGridLoad(prevBranch, selectedBranchId.value)) loadGrid()`. Si la sede cambia, pide el watch (una vez); si no cambió o `getBranches` falló, pide a mano (una vez).
  - Comentario en `watch(selectedBranchId, ...)` aclarando que es el único que pide al cambiar la sede.
  - Trial sin duplicar: `trialFromStore = userStore.trialEligibilityLoaded && userStore.profile?.branchIsVirtual !== true` tras el `await userStore.loadSubscription()`; en el `Promise.all` se usa `applyStoreTrialEligibility()` (copia `userStore.trialEligibility`) si `trialFromStore`, y `loadTrialEligibility()` si no. Las llamadas tras reservar/cancelar la prueba (`await loadTrialEligibility()` x2) no se tocaron.
- No se tocó `loading`, ni el orden de `loadSubscription`/`loadEspecialPass`/`loadPartnerBenefit`.
- Verificado contra el `return` real del store (`useUserStore.ts:943-944`): `trialEligibility` y `trialEligibilityLoaded` se exponen; `TrialEligibility` es el mismo tipo (`useSchedulingApi`) y el store hace fail-open a `null` igual que la página. La página nunca muta `trialEligibility.value` por campo (solo lo reasigna), así que compartir la referencia del store es seguro.

## Commits

- `64dcc46a9` feat(203-06): helper needsExplicitGridLoad para no pedir la grilla dos veces
- `628845e3b` perf(203-06): Reservas multi-sede pide la grilla una sola vez (R-1)
- `f91e70711` perf(203-06): Reservas reusa trial-eligibility del store tras loadSubscription

## Tests escritos, pendientes de correr (D-17)

- `el-templo-app/src/utils/__tests__/reservas-initial-load.test.ts` (5 casos). No se corrió vitest. Sí se corrió prettier (sin cambios) y eslint (`-c ./eslint.config.js`, sin hallazgos) sobre los 3 archivos tocados.
- No hay tests de `ReservasPage` (no existe suite de la página); el cambio de orquestación en `onMounted` queda cubierto solo por el helper puro y por grep.

## Deviations from Plan

1. **Semana de regalo (`confirmPartnerReserve`, ~:2169): helper NO aplicado, se conserva `await loadGrid()` incondicional.** Decisión conservadora que el propio plan autoriza. Motivo: ahí el `watch` dispara en cuanto se asigna la sede, antes de que lleguen `loadPartnerBenefit()` y la suscripción nueva; el `await loadGrid()` posterior es el que corre con el estado ya actualizado (y el que queda dentro del `try` del flujo, con el `finally` del diálogo). Aplicar el helper lo dejaría dependiendo del watch no esperado. Costo: en ese flujo, que es de una sola vez por socio y no está en la línea base de "apertura de socio", sigue habiendo hasta 2 `/weekly` si la sede cambia.
2. Punto 5 (trial-eligibility) **sí se aplicó**; el código coincidía con la descripción del plan (ningún otro consumidor de `trialEligibility` entre el `loadSubscription` y el `Promise.all`).
3. Dos commits para `ReservasPage.vue` más un commit previo del helper (el plan pedía los dos de `ReservasPage`; el helper salió en su propio commit `feat`).

## Riesgos a mirar antes del plan 07

- **Socio con `subscriptionLoading === true` al entrar a Reservas** (boot todavía cargando) o con suscripción ya cargada: no entra al `if`, `trialFromStore` queda en `false` y la página sigue pidiendo trial-eligibility (hasta 2 por apertura en ese caso: el del boot/store y el de la página). Para bajarlo hay que hacer que Reservas lea del store con `ensureMemberState()` (planes de pantalla), no solo en el camino "sin plan".
- `trialEligibilityLoaded` puede ser `true` por una carga anterior aunque la `loadSubscription()` forzada haya sido cancelada por un logout/vencida; en ese borde se reusa el valor previo del store (inocuo: el mismo socio, y el logout destruye la página).
- La página copia `userStore.trialEligibility` una sola vez al montar; si el store lo refresca después (p. ej. al volver de segundo plano), la página no se entera. Es igual que antes (la página nunca observaba cambios externos), pero los planes de pantalla no deberían asumir que Reservas lo sigue.
- `needsExplicitGridLoad` depende de que el `watch` use el flush por defecto (dispara tras el cambio, una vez). Si alguien le agrega `immediate: true` al watch, volvería el duplicado: el docblock y el comentario del watch lo advierten.
- El hook de pre-commit corrió sin `node_modules` propios (symlinks prestados); prettier y eslint se corrieron a mano sobre los archivos tocados y pasaron.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-203-17 (aceptado): cambio local de orquestación, el server sigue validando sede y fechas.

## Self-Check: PASSED

- Archivos existen; commits `64dcc46a9`, `628845e3b` y `f91e70711` en `git log`.
- `grep -c 'await loadTrialEligibility()'` en ReservasPage = 2; `trialFromStore` presente; `if (needsExplicitGridLoad(prevBranch, selectedBranchId.value)) loadGrid()` presente (1 línea).
- Sin `any` ni `console.*` en lo tocado.
