---
phase: 116-refresh-tokens-auth
plan: 03
subsystem: auth-member-app
tags:
  [
    refresh-tokens,
    axios-interceptor,
    lock,
    quasar,
    capacitor,
    dual-key-storage,
    silent-refresh,
  ]

# Dependency graph
requires:
  - phase: 116-02
    provides: "POST /auth/refresh body { refreshToken } -> { accessToken, refreshToken }; /login y /register devuelven { token, accessToken, refreshToken, user }"
provides:
  - "useTokenStorage dual-key (accessToken+refreshToken) con lectura legacy authToken como access + cleanup diferido (D-03)"
  - "Interceptor axios con lock anti-storm (refreshPromise module-scope) + retry unico + whitelist /auth/refresh (D-02)"
  - "authStore login/register persisten accessToken+refreshToken via setTokens; logout via clearTokens"
  - "boot/auth.ts refresh silencioso si el access expiro antes de /auth/me (Req 11); legacy va directo a /auth/me"
  - "Unit tests: storage dual-key (8) + lock de concurrencia 5x401->1 refresh + loop prevention (4)"
affects: [116-05 admin (mismo patron lock), produccion member app]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Refresh lock por-app: Promise compartida module-scope (NO per-request, NO package cross-repo) — D-02"
    - "createAuthErrorHandler factory exportada para testear lock/retry sin bootear Quasar"
    - "refreshClient = axios.create sin interceptores para /auth/refresh (loop prevention estructural)"
    - "Augmentacion de InternalAxiosRequestConfig (__isRetry/__authRedirected) en vez de any"
    - "isJwtExpired fail-closed solo cuando hay refresh disponible (token corrupto se refresca, legacy se respeta)"

key-files:
  created:
    - el-templo-app/src/composables/__tests__/useTokenStorage.test.ts
    - el-templo-app/src/boot/__tests__/axios-refresh-lock.test.ts
  modified:
    - el-templo-app/src/composables/useTokenStorage.ts
    - el-templo-app/src/boot/axios.ts
    - el-templo-app/src/stores/useAuthStore.ts
    - el-templo-app/src/boot/auth.ts

key-decisions:
  - "Lock + refresh runner viven dentro de boot/axios.ts (module-scope refreshPromise) en vez de un archivo refresh-lock.ts separado — el patron es ~40 LOC y vive donde se usa; createAuthErrorHandler se exporta para testeo (D-02 discrecion del executor)"
  - "vitest config del app es environment:node con solo alias src — el test del lock mockea axios.create, useTokenStorage y logger e importa createAuthErrorHandler/runRefresh directo (no bootea Quasar); el import de boot/axios resuelve OK porque boot() no se ejecuta al importar"
  - "isJwtExpired decodifica base64url manualmente (atob + URI-decode, disponible en WebView donde corre el boot); fail-closed (trata como expirado) solo si ya hay refresh disponible, para no desloguear por token corrupto ni tocar el legacy"

requirements-completed: [Req9, Req11, Req13]

# Metrics
duration: 5min
completed: 2026-05-25
---

# Phase 116 Plan 03: Member App Refresh Auth Summary

**Refactor de la capa de auth de la member app (Quasar/Capacitor) para que un usuario activo nunca sea desloguado: storage dual-key con migracion soft del `authToken` legacy, interceptor de axios con lock anti-refresh-storm + retry unico, `authStore` que persiste el par `accessToken`+`refreshToken`, y boot con refresh silencioso si el access expiro — con unit tests del lock (5x401 concurrentes -> 1 `/auth/refresh`) y del storage en verde.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-25T20:30:13Z
- **Completed:** 2026-05-25T20:35:00Z
- **Tasks:** 3 (2 TDD + 1 código)
- **Files:** 4 modificados + 2 tests nuevos

## Accomplishments

- **Task 1 — `useTokenStorage` dual-key (D-03):** reescrito a `accessToken`+`refreshToken` con helpers privados `readKey/writeKey/deleteKey` (DRY del branch Capacitor/localStorage). `getAccessToken()` cae al `authToken` legacy como fallback; `setTokens()` escribe ambas keys nuevas Y borra el legacy (cleanup diferido, no eager); `clearTokens()` borra las 3; `hasLegacyOnly()` distingue legacy-sin-refresh. Aliases `getToken`/`removeToken` backwards-compat. 8 unit tests verdes.
- **Task 2 — interceptor con lock (D-02, Req 9):** `refreshPromise` compartida en module scope; `runRefresh()` dispara un único `/auth/refresh` por oleada vía `refreshClient` (instancia sin interceptores → no reentra). `createAuthErrorHandler` maneja: (a) whitelist `/auth/refresh` → clear+redirect sin loop, (b) `__isRetry` → clear+redirect, (c) sin refresh/legacy-only → clear+redirect, (d) normal → `runRefresh()` + retry único con el access nuevo. Workaround Android WebView (`data={}`) preservado. Fallos con `createLogger().warn`. Unit test: 5 requests 401 concurrentes → exactamente 1 `/auth/refresh` + 5 reintentos con `Bearer new-access`; loop prevention verde.
- **Task 3 — authStore + boot (BLOCKER + Req 11):** `login()`/`register()` leen `{ accessToken, refreshToken }` y persisten vía `setTokens`, `token.value = accessToken`; `logout()` usa `clearTokens()`. `register()` conserva el return `{ promoApplied }`. Boot: `isJwtExpired()` decodifica el `exp` del access; si expiró y hay refresh → `/auth/refresh` antes de `/auth/me`; en fallo `clearAuth()`+`clearTokens()`. Token legacy (`hasLegacyOnly`) saltea el refresh silencioso y va directo a `/auth/me`.

## Task Commits

1. **Task 1: useTokenStorage dual-key + legacy + cleanup diferido** — `bc5f7c31` (feat)
2. **Task 2: interceptor con lock anti-storm + retry + unit test** — `00d75bcc` (feat)
3. **Task 3: authStore persiste ambos tokens + boot refresh silencioso** — `46ba2027` (feat)

> Nota TDD: el plan marca Tasks 1 y 2 con `tdd="true"`. Se siguió RED→GREEN dentro de cada commit (test escrito primero, fallando contra la impl vieja en Task 1; lock test verde contra la impl nueva en Task 2). Por la naturaleza de commits atómicos por-tarea de este executor, test e implementación quedan en el mismo commit en vez de RED/GREEN separados — el ciclo se ejecutó pero no se materializó en dos commits.

## Files Created/Modified

- `el-templo-app/src/composables/useTokenStorage.ts` — dual-key + lectura legacy + cleanup diferido + aliases.
- `el-templo-app/src/composables/__tests__/useTokenStorage.test.ts` — 8 casos (nuevo).
- `el-templo-app/src/boot/axios.ts` — `refreshPromise` lock, `runRefresh`, `createAuthErrorHandler` (exportados), `refreshClient`, augmentación de config, request interceptor a `getAccessToken`.
- `el-templo-app/src/boot/__tests__/axios-refresh-lock.test.ts` — 4 casos incl. 5x401 concurrentes + loop prevention (nuevo).
- `el-templo-app/src/stores/useAuthStore.ts` — login/register vía `setTokens`, logout vía `clearTokens`.
- `el-templo-app/src/boot/auth.ts` — `isJwtExpired` + refresh silencioso antes de `/auth/me`, fallback legacy.

## Decisions Made

- **Lock dentro de `boot/axios.ts`, no en `refresh-lock.ts` separado.** El PATTERNS.md propuso un archivo `src/auth/refresh-lock.ts`, pero CONTEXT D-02 deja la estructura interna a discreción del executor. El lock es ~40 LOC y vive donde se consume; `createAuthErrorHandler`/`runRefresh` se exportan para testeo sin bootear Quasar.
- **Estrategia de testeo del lock.** `vitest.config.ts` es `environment: node` con sólo alias `src`. El test mockea `axios.create` (cuenta llamadas a `/auth/refresh`), `useTokenStorage` y `logger`, e importa `createAuthErrorHandler`/`runRefresh` directo. Importar `boot/axios.ts` no ejecuta `boot()` (sólo registra el default export), así que `quasar/wrappers` e `import.meta.env` no rompen.
- **`isJwtExpired` decodifica base64url a mano** (`atob` + URI-decode, presente en el WebView/navegador donde corre el boot). Fail-closed (asume expirado) sólo cuando ya hay refresh disponible: un access corrupto se refresca en vez de desloguear; el token legacy se respeta.

## Deviations from Plan

- **Tests TDD en el mismo commit que la implementación** (no RED/GREEN en commits separados) — ver nota arriba. El ciclo se siguió; el formato de commit atómico por-tarea de este executor los une.
- **Sin archivo `refresh-lock.ts` separado** — decisión de estructura amparada por D-02 (discreción del executor). No es desviación de alcance.

Fuera de eso, los 3 tasks se ejecutaron como fueron escritos. Sin auto-fixes (Rules 1-3) necesarios sobre código existente; el único bug introducido y corregido en el acto fue un trailing-comma en el error-handler del request interceptor (pre-commit).

## Threat Model Coverage

- **T-116-11 (DoS / refresh storm):** mitigado — `refreshPromise` module-scope; unit test prueba 5 requests 401 concurrentes → exactamente 1 `/auth/refresh`.
- **T-116-12 (EoP / loop /auth/refresh):** mitigado — whitelist: 401 del propio refresh → clear+redirect sin re-disparar (test de loop prevention verde) + `refreshClient` sin interceptores (prevención estructural).
- **T-116-13 (Info Disclosure / logs):** mitigado — `createLogger().warn` (nunca `.error`) para fallos de refresh; no spamea Sentry.
- **T-116-14 (Spoofing / tokens en storage):** aceptado per SPEC — Capacitor Preferences/localStorage como hoy; secure storage nativo out-of-scope.
- **T-116-SC (npm installs):** mitigado — no se agregaron ni actualizaron dependencias (axios/vitest ya presentes).

No hay superficie de seguridad nueva fuera del threat model.

## Known Stubs

Ninguno. Storage, interceptor, authStore y boot están completamente cableados al contrato real de `/auth/refresh` (Plan 02).

## Deferred Issues (out of scope)

`vue-tsc -p .quasar/tsconfig.json` reporta 14 errores PRE-EXISTENTES en archivos no tocados por este plan (`MainLayout.vue`, `OnboardingQuestion.vue`, `ChangePasswordPage.vue`, `ProfilePage.vue`, `test/level-selection-storage.test.ts`, `test/user-store-level-selection.test.ts`). Verificado por stash: 15 errores antes de mis cambios, 14 después (mis 4 archivos = 0 errores; mis cambios redujeron el conteo, no lo aumentaron). Fuera de alcance — candidato a un plan de housekeeping futuro.

## User Setup Required

Ninguno para este plan (cambios sólo en member app, sin migraciones ni env nuevas). La migración 0125 de Plan 02 sigue pendiente de correrse en staging/prod (checkpoint humano ya registrado en STATE.md por Plan 02).

## Next Phase Readiness

- Plan 05 (admin) puede copiar el mismo patrón de lock (`refreshPromise` module-scope + `createAuthErrorHandler`) adaptando storage a `localStorage` (`adminAccessToken`/`adminRefreshToken`, lee `adminToken` legacy) y redirect a `window.location.href` (D-02, copia por-app, sin package compartido).
- Suite de tests del member app verde: 81/81 (8 files), incl. los 12 nuevos de este plan.

## Self-Check: PASSED

- Archivos creados existen: `useTokenStorage.test.ts`, `axios-refresh-lock.test.ts`.
- Archivos modificados contienen los símbolos clave: `useTokenStorage.ts`→`refreshToken`/`setTokens`; `axios.ts`→`refreshPromise`; `useAuthStore.ts`→`setTokens`; `auth.ts`→`/auth/refresh`.
- Commits `bc5f7c31`, `00d75bcc`, `46ba2027` presentes en git log.
- Tests: 81/81 verdes (incl. 5x401→1 refresh y loop prevention).

---

_Phase: 116-refresh-tokens-auth_
_Completed: 2026-05-25_
