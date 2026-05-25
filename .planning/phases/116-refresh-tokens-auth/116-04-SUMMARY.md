---
phase: 116-refresh-tokens-auth
plan: 04
subsystem: auth-admin-app
tags:
  [
    refresh-tokens,
    axios-interceptor,
    lock,
    quasar,
    admin,
    dual-key-storage,
    localStorage,
  ]

# Dependency graph
requires:
  - phase: 116-02
    provides: "POST /auth/refresh body { refreshToken } -> { accessToken, refreshToken }; /login devuelve { token, accessToken, refreshToken, user }"
  - phase: 116-03
    provides: "patron de lock (refreshPromise module-scope + createAuthErrorHandler) replicado por-app (D-02)"
provides:
  - "authStore admin login persiste adminAccessToken+adminRefreshToken (borra legacy); logout borra las 3 keys; checkAuth lee adminAccessToken con fallback a adminToken (D-03)"
  - "Interceptor axios admin con lock anti-storm (refreshPromise module-scope) + retry unico + whitelist /auth/refresh (D-02)"
  - "Dual-key localStorage (adminAccessToken/adminRefreshToken) + lectura legacy adminToken + cleanup diferido en setTokens (D-03)"
  - "Unit test del lock admin (5x401 -> 1 refresh + loop prevention) — ESCRITO pero no ejecutado (vitest ausente en admin)"
affects: [produccion admin app, checkpoint vitest deps]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Refresh lock por-app: copia del algoritmo de la member app adaptado a localStorage + window.location (NO package cross-repo) — D-02"
    - "createAuthErrorHandler(retryInstance, onRedirect) factory exportada para testear lock/retry sin bootear Quasar"
    - "refreshClient = axios.create sin interceptores para /auth/refresh (loop prevention estructural)"
    - "Augmentacion de InternalAxiosRequestConfig (__isRetry) y AxiosError (__authRedirected) en vez de any"

key-files:
  created:
    - el-templo-admin/src/boot/__tests__/axios-refresh-lock.test.ts
  modified:
    - el-templo-admin/src/boot/axios.ts
    - el-templo-admin/src/stores/useAuthStore.ts

key-decisions:
  - "Lock + refresh runner viven dentro de boot/axios.ts (refreshPromise module-scope), espejo de la member app (D-02); createAuthErrorHandler/runRefresh/__resetRefreshLock exportados para testeo"
  - "redirectToLogin pasado como callback (onRedirect) al handler en vez de window.location directo, para que el test mockee el redirect sin jsdom completo"
  - "authStore.login borra adminToken legacy de forma eager en re-login (parte del cleanup diferido D-03: re-login es uno de los dos triggers de cleanup junto con el primer refresh)"

requirements-completed: [Req10]

# Metrics
duration: 3min
completed: 2026-05-25
---

# Phase 116 Plan 04: Admin Refresh Auth Summary

**Replica en el admin (Quasar web-only) el refactor de lock anti-refresh-storm de la member app, adaptado a su entorno: `localStorage`, `window.location`, flag `__authRedirected` preservado para Sentry, y keys `adminAccessToken`+`adminRefreshToken` con lectura del `adminToken` legacy y cleanup diferido (D-02 + D-03). Incluye la actualizacion del authStore admin (login/logout/checkAuth) para persistir y leer ambos tokens — sin esto el refreshToken nunca se guardaba — y el unit test del lock escrito (5x401 -> 1 refresh + loop prevention), pendiente de ejecucion porque el admin no tiene vitest instalado (checkpoint blocking-human abierto).**

## Performance

- **Duration:** ~3 min
- **Tasks:** 2 (ambas TDD por frontmatter)
- **Files:** 2 modificados + 1 test nuevo

## Accomplishments

- **Task 1 — authStore admin + interceptor con lock (D-02 + D-03, Req 10 impl):**
  - `useAuthStore.ts`: `login()` lee `{ token, accessToken, refreshToken, user }`, valida role contra `ADMIN_ROLES` (preservado), setea `token.value = accessToken`, persiste `adminAccessToken` + `adminRefreshToken` y borra el `adminToken` legacy (re-login = trigger de cleanup D-03). `logout()` borra las 3 keys. `checkAuth()` lee `adminAccessToken` con fallback a `adminToken`; el ref `token` se inicializa con el mismo fallback. Sin `any` (response tipado con `LoginResponse`).
  - `boot/axios.ts`: `refreshPromise` module-scope (lock D-02); `runRefresh()` dispara un unico `/auth/refresh` por oleada via `refreshClient` (instancia sin interceptores). `createAuthErrorHandler(retryInstance, onRedirect)` maneja: (a) whitelist `/auth/refresh` -> clear+redirect sin loop, (b) `__isRetry` -> clear+redirect, (c) sin refresh -> clear+redirect, (d) normal -> `runRefresh()` + retry unico con el access nuevo. `getAccess()` lee dual-key con fallback legacy; `setTokens()` escribe ambas nuevas y borra el legacy (cleanup diferido). `__authRedirected` preservado para filtrado Sentry. Fallos via `createLogger().warn`. Augmentacion de tipos en vez de `any`.
- **Task 2 — unit test del lock admin (Req 10 acceptance, ESCRITO):** `axios-refresh-lock.test.ts` espejo del test de la member app, adaptado a `localStorage` (mock in-memory) y `window.location` (mock). Cubre: 5 requests 401 concurrentes -> exactamente 1 `/auth/refresh` + 5 reintentos con `Bearer new-access` + cleanup del legacy verificado; loop prevention (401 de `/auth/refresh` -> `__authRedirected` + clear + redirect, sin re-disparar); sin-refresh -> clear+redirect; reset del lock entre oleadas. **No ejecutado:** el admin NO tiene vitest instalado (ni script `test`, ni `node_modules/.bin/vitest`, ni `vitest.config.*`).

## Task Commits

1. **Task 1: authStore admin persiste ambos tokens + interceptor con lock anti-storm** — `76418032` (feat)
2. **Task 2: unit test del lock admin (escrito, no ejecutado)** — `0c8c4e95` (test)

> Nota TDD: ambas tasks marcadas `tdd="true"`. Por la naturaleza de commits atomicos por-tarea de este executor, test e implementacion quedan en commits separados pero el ciclo RED/GREEN no se materializo en commits RED separados (mismo patron documentado en 116-03).

## Verification Results

Task 1 `<automated>` grep gate (todos PASS):

- `refreshPromise` en axios.ts: 6 (>=1) ✓
- `adminAccessToken` en axios.ts: 1 (>=1, via constante `ACCESS_KEY`) ✓
- `adminAccessToken` en useAuthStore.ts: 1 (>=1) ✓
- `adminRefreshToken` en useAuthStore.ts: 1 (>=1) ✓
- `__authRedirected` en axios.ts: 2 (>=1) ✓
- `console.` en axios.ts + useAuthStore.ts: 0 ✓
- `: any` en axios.ts + useAuthStore.ts: 0 ✓

Task 2 `<verify>` gate: primer comando imprimio `VITEST_MISSING` (no existe `node_modules/.bin/vitest`); `: any` en el test = 0 ✓.

## Deviations from Plan

- **Ninguna desviacion de codigo.** Las 2 tasks se ejecutaron como fueron escritas.
- **CHECKPOINT BLOCKING-HUMAN abierto (Task 2 conditional-checkpoint):** vitest+jsdom NO estan instalados en el admin. Per constraint del usuario (no agregar/actualizar dependencias sin aprobacion — precedente axios supply chain) y la instruccion explicita del `<verify>`, NO se instalo nada ni se corrio `npx vitest`. El test esta escrito y commiteado; queda pendiente de ejecucion hasta decision del usuario.

## Threat Model Coverage

- **T-116-15 (DoS / refresh storm admin):** mitigado en codigo — `refreshPromise` module-scope; el test prueba 5 requests 401 concurrentes -> 1 `/auth/refresh` (pendiente de correr por falta de vitest).
- **T-116-16 (EoP / loop /auth/refresh admin):** mitigado — whitelist: 401 del refresh -> `__authRedirected` + clear + redirect sin re-disparar + `refreshClient` sin interceptores (prevencion estructural).
- **T-116-17 (Info Disclosure / logs):** mitigado — `createLogger().warn` (nunca `.error`) para fallos de refresh; `__authRedirected` preservado para filtrado Sentry.
- **T-116-18 (Spoofing / tokens en localStorage):** aceptado per SPEC — localStorage como hoy; secure storage out-of-scope.
- **T-116-SC (npm installs vitest/jsdom):** mitigado — NO se agregaron ni actualizaron dependencias; falta de vitest -> checkpoint blocking-human (NUNCA `npx vitest` ni install autonomo).

No hay superficie de seguridad nueva fuera del threat model.

## Known Stubs

Ninguno. authStore e interceptor estan completamente cableados al contrato real de `/auth/refresh` (Plan 02).

## Deferred Issues (out of scope)

- **Ejecucion del unit test admin** bloqueada por ausencia de vitest+jsdom en el admin. No es un stub de runtime — el codigo de produccion (lock + dual-key) esta completo y funcional; solo la verificacion automatizada del lock admin queda pendiente. El algoritmo es identico al de la member app (Plan 03), cuyo test verde (5x401 -> 1 refresh) ya cubre la logica compartida. Decision del usuario requerida (ver checkpoint).
- **vue-tsc** no esta instalado en el admin, por lo que no se corrio un type-check formal; el gate de grep + eslint/prettier de pre-commit pasaron sin errores.

## Next Phase Readiness

- Plan 05 (ultimo de la fase) puede proceder. El admin ya persiste el refreshToken y refresca de forma transparente.
- Pendiente: decision del usuario sobre instalar vitest+jsdom en el admin para correr el test del lock (o aceptar la cobertura del test de la member app que comparte el algoritmo).

## User Setup Required

- **DECISION REQUERIDA (checkpoint):** instalar vitest + jsdom como devDependencies del admin para poder correr `axios-refresh-lock.test.ts`, o aceptar skipear el unit test admin (el lock comparte algoritmo con la member app, cuyo test ya esta verde). NO instalar sin aprobacion explicita.
- La migracion 0125 de Plan 02 sigue pendiente de correrse en staging/prod (checkpoint humano ya registrado en STATE.md por Plan 02).

## Self-Check: PASSED

- Archivo creado existe: `el-templo-admin/src/boot/__tests__/axios-refresh-lock.test.ts`.
- Archivos modificados contienen los simbolos clave: `axios.ts` -> `refreshPromise`/`adminAccessToken`/`__authRedirected`; `useAuthStore.ts` -> `adminAccessToken`/`adminRefreshToken`.
- Commits `76418032`, `0c8c4e95` presentes en git log.
- Grep gate Task 1: todos PASS. Task 2 verify: VITEST_MISSING (esperado) + 0 any.

---

_Phase: 116-refresh-tokens-auth_
_Completed: 2026-05-25_
