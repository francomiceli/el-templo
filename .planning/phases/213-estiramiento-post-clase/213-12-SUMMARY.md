---
phase: 213-estiramiento-post-clase
plan: 12
subsystem: app-push
tags: [push, deep-link, login, capacitor, vitest]
requires: ["213-06", "213-10", "213-11"]
provides:
  - decideTapNavigation (pura) y applyTapNavigation en boot/push-notifications.ts
  - Destino del push guardado cuando no hay sesion o el guard termina en login
affects: [boot/push-notifications.ts, todos los pushes de la app]
tech-stack:
  added: []
  patterns: ["modelo boot/deep-links.ts (pendingRoute + /login)", "decision pura + ejecutor con router inyectable"]
key-files:
  created:
    - el-templo-app/src/boot/__tests__/push-tap.test.ts
  modified:
    - el-templo-app/src/boot/push-notifications.ts
    - el-templo-app/src/boot/__tests__/push-destination.test.ts
decisions:
  - "LoginPage.vue NO se toca: el camino post-login ya llega al player (traza abajo)"
  - "applyTapNavigation exportada (router y setPendingRoute inyectados) para testear los caminos sin Capacitor"
  - "/mi-templo no se guarda como destino pendiente (es donde se aterriza), tampoco en la rama 'termina en login'"
metrics:
  tasks: 2
  commits: 2
  completed: 2026-11-11
requirements: [SC-6, D-12]
---

# Phase 213 Plan 12: Deep link del push con la app cerrada y sin sesion Summary

Arreglo del destino perdido al tocar un push: `handleTapNavigation` ahora decide con una funcion pura (`decideTapNavigation`) y espera de verdad `router.push` (el `try/catch` anterior era codigo muerto); sin sesion guarda el destino y va al login, y con sesion que termina en login (sesion vencida) tambien lo guarda.

## Tareas

| Tarea | Commit | Resultado |
| ----- | ------ | --------- |
| 1 RED | `eb0989cd0` | `push-tap.test.ts` (13 casos), falla: funciones inexistentes |
| 1 GREEN | `55e3fa8b1` | `decideTapNavigation` + `applyTapNavigation` + `handleTapNavigation` corregido |
| 2 | sin commit de codigo | Traza verificada, no hace falta cambiar `LoginPage.vue` |

## Que cambio (push-notifications.ts)

- `decideTapNavigation({ isAuthenticated, route })` pura: sin sesion -> `{ kind: 'login', pendingRoute }` (`null` si es `/mi-templo`); con sesion -> `{ kind: 'navigate', route }`; ruta vacia/espacios -> `/mi-templo`.
- `applyTapNavigation({ route, isAuthenticated, router, setPendingRoute })`: login -> guarda destino + `await router.push('/login')`; navigate -> `await router.push(route)`, si `currentRoute.name === 'login'` guarda el destino; si rechaza, `log.error` + guarda el destino. Nunca lanza.
- `handleTapNavigation` queda: `resolveTapRoute` (sin cambios), reporte `/notifications/:id/opened` (sin cambios), `void applyTapNavigation(...)` con `useAuthStore().isAuthenticated`.
- Con sesion y app abierta, el comportamiento para TODOS los destinos (class_reminder, novedades, conquer, reservas, whatsapp_sales, estirar) es el mismo de antes: un `router.push(route)` con la ruta de `resolveTapRoute`. La unica diferencia es la red de seguridad cuando el guard termina en login.

## Traza "toque sin sesion -> login -> player" (Tarea 2)

1. El boot `auth` corre antes que `push-notifications` (orden de boot); `isAuthenticated` (`stores/useAuthStore.ts:38`) ya refleja el boot optimista.
2. El toque llega a `notificationActionPerformed` / `pushNotificationActionPerformed` -> `handleTapNavigation` (`boot/push-notifications.ts:~150-175`) -> `resolveTapRoute` da `/training/estirar?from=push` -> `applyTapNavigation` (`push-notifications.ts:76`) guarda `setPendingRoute(...)` y `router.push('/login')`.
3. Login: `LoginPage.vue:226` hace `router.push('/')`; `router/routes.ts:54-56` (`home`) redirige a `/mi-templo`.
4. `MiTemplo.vue:604-607` hace `consumePendingRoute()` al montar y, si no es `/mi-templo`, `router.push(pendingRoute)` -> player `training/estirar?from=push` (el player registra `push_opened`/`started` por `?from=push`, plan 10).
5. Ramas `activar-invitacion` (`LoginPage.vue:210`) y `onboarding` (`LoginPage.vue:213`): el destino sigue guardado en el store de notificaciones (en memoria) y se consume cuando Mi Templo monte despues; no se pierde.
6. `router/guards.ts:77` sigue mandando a login sin guardar para navegacion directa: no se toco (el push ya guarda antes). Navegar al destino despues de login pasa por los guards de siempre (T-213-36).

## Verificacion

- Corridas: `vitest run src/boot` -> 4 archivos, 44 tests verdes (push-tap 13, push-destination existente 100% verde, deep-links, auth). Mutaciones de sanidad: (a) quitar `setPendingRoute` en la rama login -> 2 tests rojos; (b) quitar la deteccion "termina en login" -> 1 test rojo; ambas restauradas con `cp`.
- `pnpm lint` app: 0 errores (2 warnings preexistentes en archivos no tocados).
- `vue-tsc --noEmit`: 21 errores = baseline; cero en push-notifications / push-tap / push-destination / LoginPage.
- Tests puros (node) cubren: app abierta/cerrada con sesion, sin sesion -> login -> destino, sesion vencida (guard a login), push al login que rechaza, router no listo, ruta vacia, y que los destinos existentes (reservas, referidos, estirar, whatsapp_sales con/sin texto, fallback) resuelvan la misma ruta que `resolveTapRoute`.
- NO corrido (requiere telefono): que el plugin nativo retenga el toque en arranque en frio y lo entregue al listener una vez registrado; queda en el checklist del plan 13.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Bloqueante] `push-destination.test.ts` fallaba al importar el store de auth**
- **Found during:** Task 1 GREEN
- **Issue:** `useAuthStore` importa `boot/axios` (alias que vitest no resuelve) al cargar `push-notifications.ts`.
- **Fix:** se agrego `vi.mock('src/stores/useAuthStore', ...)` en `push-destination.test.ts`; aserciones intactas.
- **Commit:** `55e3fa8b1`

**2. [Extra al plan] `applyTapNavigation` exportada**
- El plan pedia solo `decideTapNavigation` pura; se extrajo ademas el ejecutor con router inyectable para poder testear los caminos pedidos por el orquestador (app abierta/cerrada con sesion, sin sesion, guard a login, destino invalido) sin plugins ni deps nuevas.

## Decisiones tomadas en ejecucion

- `LoginPage.vue` sin cambios (la traza muestra que `/` -> `/mi-templo` -> `consumePendingRoute`).
- En la rama "con sesion y termina en login" no se guarda `/mi-templo` (inutil), consistente con `decideTapNavigation`.
- Un destino invalido no puede llegar vacio: `resolveTapRoute` ya cae a `/mi-templo`, y `decideTapNavigation` lo vuelve a normalizar.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-213-36 (sin sesion siempre a `/login`, destino usado solo tras autenticarse y por los guards) y T-213-37 (`resolveTapRoute` intacto) mitigados.

## Para planes siguientes

- Plan 13 (checklist del telefono): probar con app matada y SIN sesion y con app matada CON sesion; confirmar que el plugin entrega el toque en arranque en frio. Si no lo entrega, es limitacion nativa fuera de este plan.
- En tests de boot que importen `push-notifications.ts`, mockear `src/stores/useAuthStore`.

## Self-Check: PASSED

- `eb0989cd0` y `55e3fa8b1` existen; archivos creados/modificados presentes.
