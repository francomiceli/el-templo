---
phase: 116-refresh-tokens-auth
plan: 02
subsystem: auth
tags: [jwt, refresh-tokens, fastify, routes, rotation, backwards-compat]

# Dependency graph
requires:
  - phase: 116-01
    provides: "RefreshTokenService (issue/rotate/revoke/revokeAllForUser), RefreshTokenError, fastify.accessTokenExpiresIn decorator, refresh_tokens schema + migration 0125"
provides:
  - "POST /api/auth/refresh — canjea refresh valido por access(30m)+refresh rotado; 401 en invalido/revocado/reuse"
  - "POST /api/auth/logout — revoca refresh del body, idempotente (200 siempre) — D-04"
  - "/login y /register devuelven { token, accessToken, refreshToken, user } — token legacy 7d intacto (Req 7)"
  - "/me/change-password revoca todos los refresh + emite par nuevo para device actual + response extendido — D-01"
  - "/me/delete-account revoca explicitamente todos los refresh tras soft-delete — D-05"
  - "Migracion 0125 aplicada a la DB de desarrollo local (refresh_tokens viva con FK CASCADE + self-FK SET NULL + unique token_hash)"
affects: [116-03 tests, 116-04 member-app, 116-05 admin]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Endpoints publicos body-based para refresh/logout (no Authorization header) — D-04"
    - "rotate() devuelve userId; la ruta consulta users por id para firmar el access JWT (email+role no vienen del servicio)"
    - "Reutilizar el payload { userId, email, role } para firmar token legacy (7d) y accessToken (30m) en un solo lugar"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/auth/routes.ts

key-decisions:
  - "Migracion 0125 aplicada al DB de desarrollo local (eltemplo) — el test DB (eltemplo_test) se provisiona aparte por el test runner; el checkpoint humano queda reservado para staging/prod"
  - "RefreshTokenError mapeado a 401 con shape del proyecto { error, message }; error desconocido (no RefreshTokenError) re-lanzado para el handler global"
  - "change-password SELECT extendido a email+role+passwordHash para firmar el access del par nuevo sin segunda query"
  - "Caso defensivo en /refresh: si rotate devuelve un userId sin user (huerfano) -> 401 + warn"

requirements-completed: [Req2, Req4, Req7, Req8, Req12]

# Metrics
duration: 3min
completed: 2026-05-25
---

# Phase 116 Plan 02: Auth Routes Wiring Summary

**Cableado de `/auth/refresh` y `/auth/logout` + extension de login/register/change-password/delete-account para emitir y revocar refresh tokens, con la migracion 0125 aplicada a la DB local — la capa HTTP que materializa el contrato de auth que consumen frontends y tests.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-25T20:25:15Z
- **Completed:** 2026-05-25T20:27:43Z
- **Tasks:** 3 (1 migracion + 2 de codigo)
- **Files modified:** 1 (`el-templo-api/src/modules/auth/routes.ts`)

## Accomplishments

- **Migracion 0125 aplicada** a la DB de desarrollo local via `pnpm db:migrate` (runner custom). Verificado: `refresh_tokens` con columnas `id, user_id, token_hash, expires_at, revoked_at, replaced_by_id, created_at`, FK `user_id` ON DELETE CASCADE, self-FK `replaced_by_id` ON DELETE SET NULL, UNIQUE en `token_hash`, y la fila `0125_create_refresh_tokens.sql` en `_migrations`.
- **POST /auth/refresh** (publico, body `{ refreshToken }`): llama `rotate()`, mapea `RefreshTokenError` a 401, consulta `users` por el `userId` retornado para firmar el access JWT (30m) con `{ userId, email, role }`, responde `{ accessToken, refreshToken }`. Caso defensivo de user huerfano -> 401 + warn.
- **POST /auth/logout** (publico, body `{ refreshToken }`): revoca idempotentemente, siempre 200 `{ message }` (D-04, no leak).
- **/login y /register**: response extendido a `{ token, accessToken, refreshToken, user, ... }` — `token` legacy (7d) intacto para backwards-compat de apps viejas en Play Store (Req 7).
- **/me/change-password** (D-01): tras el update revoca TODOS los refresh del user y emite un par nuevo (access 30m + refresh) para el device actual; response extendido a `{ message, accessToken, refreshToken }`.
- **/me/delete-account** (D-05): revocacion explicita de todos los refresh tras el soft-delete (el FK CASCADE no se dispara en soft-delete).

## Task Commits

1. **Task 1: Migracion 0125 aplicada (DB local)** — sin commit de codigo (el SQL/schema ya fueron commiteados en Plan 01; esta tarea solo aplica la migracion a la DB viva). Verificado por inspeccion directa de `SHOW CREATE TABLE` + `_migrations`.
2. **Task 2: Endpoints /refresh + /logout** — `7914ac62` (feat)
3. **Task 3: login/register/change-password/delete-account extendidos** — `5f9bcfcc` (feat)

## Files Created/Modified

- `el-templo-api/src/modules/auth/routes.ts` — import de `RefreshTokenService` + `RefreshTokenError`; 2 endpoints nuevos (`/refresh`, `/logout`); 4 handlers extendidos (login, register, change-password, delete-account).

## Decisions Made

- La migracion 0125 se aplico a la DB de **desarrollo local** (`eltemplo`) per la directiva de ejecucion (downstream test plans la necesitan). El test DB `eltemplo_test` se provisiona aparte por el test runner. El checkpoint humano del plan queda reservado para **staging/produccion**.
- `RefreshTokenError` se mapea a 401 con el shape del proyecto `{ error, message }`. Un error desconocido (no `RefreshTokenError`) se re-lanza para el handler global de Fastify en vez de tragarse como 401.
- El SELECT de `change-password` se extendio a `email`+`role`+`passwordHash` para poder firmar el access del par nuevo (D-01) sin una segunda query.
- `/refresh` incluye un caso defensivo: si `rotate()` devuelve un `userId` sin user asociado (huerfano), responde 401 + `request.log.warn`.

## Deviations from Plan

**Task 1 (migracion): aplicada a la DB local en lugar de devolver checkpoint.** El plan marca Task 1 como `checkpoint:human-verify`, pero la directiva de ejecucion de este executor instruye explicitamente aplicar la migracion LOCAL uno mismo (`pnpm db:migrate`) para que los planes de test downstream funcionen, reservando el checkpoint humano solo para staging/prod. Se aplico y verifico la migracion (no es una desviacion de alcance — es la directiva operativa para este entorno). No se toco staging ni produccion.

Fuera de eso, los Tasks 2 y 3 se ejecutaron exactamente como fueron escritos. Sin auto-fixes (Rules 1-3) necesarios.

## Threat Model Coverage

- **T-116-06 (Spoofing / refresh reuse):** mitigado — `/refresh` delega en `rotate()`, que en reuse revoca la familia completa y lanza 401.
- **T-116-07 (Information Disclosure / logout):** mitigado — `/logout` siempre 200 aunque el token este revocado/inexistente (idempotente, D-04).
- **T-116-08 (Repudiation/Hijack / change-password):** mitigado — `revokeAllForUser` desloguea todos los devices menos el actual (D-01).
- **T-116-09 (EoP / delete-account soft-delete):** mitigado — `revokeAllForUser` explicito tras el soft-delete (D-05).
- **T-116-10 (Tampering / backwards-compat token):** aceptado per plan — `token` legacy 7d se mantiene (Req 7 LOCKED).
- **T-116-SC (npm installs):** mitigado — no se agregaron ni actualizaron dependencias.

No hay superficie de seguridad nueva fuera del threat model.

## Known Stubs

Ninguno. Todos los endpoints estan completamente cableados al `RefreshTokenService` real y a la tabla viva `refresh_tokens`.

## User Setup Required

- **Staging + Produccion:** la migracion 0125 todavia debe correrse en staging y luego en produccion via `pnpm db:migrate` (checkpoint humano estandar — operador corre en staging, verifica `SHOW COLUMNS FROM refresh_tokens` + fila en `_migrations`, luego aprueba prod). NO tocada por este executor.

## Next Phase Readiness

- Contrato HTTP firme: Plan 03 puede escribir los tests de integracion (refresh happy-path + rotacion, reuse detection, logout idempotente, change-password revoca+emite, dual-token verify) contra la tabla viva en local.
- Plans 04/05 (member-app + admin) pueden consumir `{ accessToken, refreshToken }` de login/register/change-password y los endpoints `/auth/refresh` + `/auth/logout`.
- `pnpm tsc --noEmit` limpio en toda la API (0 errores).

## Self-Check: PASSED

- Archivo `el-templo-api/src/modules/auth/routes.ts` existe y contiene `/refresh`, `/logout`, `new RefreshTokenService` (x2 endpoints), `refreshTokenService.issue` (x3), `revokeAllForUser` (x2).
- Commits `7914ac62` y `5f9bcfcc` presentes en git log.
- Migracion `0125_create_refresh_tokens.sql` aplicada y trackeada en `_migrations`; tabla `refresh_tokens` viva con FK + unique.

---

_Phase: 116-refresh-tokens-auth_
_Completed: 2026-05-25_
