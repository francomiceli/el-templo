---
phase: 116-refresh-tokens-auth
plan: 05
subsystem: auth
tags:
  [refresh-tokens, integration-tests, vitest, mysql, rotation, reuse-detection]

# Dependency graph
requires:
  - phase: 116-02
    provides: "endpoints /auth/refresh + /auth/logout, login/register/change-password/delete-account extendidos, migración 0125 aplicada"
  - phase: 116-01
    provides: "RefreshTokenService (rotate/revoke/revokeAllForUser) + schema refresh_tokens"
provides:
  - "Suite de integración test/auth/refresh-tokens.test.ts (6 flujos) verde contra eltemplo_test"
  - "refresh_tokens en TABLES_TO_CLEAN para aislamiento inter-test"
  - "Garantía reproducible (pnpm test) de rotación, reuse detection, revocación y acceso dual"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Verificación de estado DB del refresh via sha256(plano) → query por token_hash (el plano nunca está en DB)"
    - "Reuse-detection-aware test ordering: probar el par nuevo ANTES de rotar tokens revocados (rotar un revocado revoca la familia)"
    - "registerUser helper para fixtures (genera dni/phone únicos por Phase 111 phone-block)"

key-files:
  created:
    - el-templo-api/test/auth/refresh-tokens.test.ts
  modified:
    - el-templo-api/test/helpers.ts

key-decisions:
  - "Task 2 (tdd) se commiteó como un único test(...): la implementación es upstream (Plans 01/02); este plan es verificación end-to-end, no agrega comportamiento de producción"
  - "Fixtures via registerUser (no inject raw) — /auth/register exige dni/phone únicos (Phase 111 phone-block)"
  - "El test DB auto-provisiona migración 0125 desde src/db/migrations/*.sql en cada worker fresco (setup.ts); no requirió aplicar migración manualmente"

requirements-completed: [Req14]

# Metrics
duration: 16min
completed: 2026-05-25
---

# Phase 116 Plan 05: API Integration Tests Summary

**Suite de integración `test/auth/refresh-tokens.test.ts` (6 flujos: refresh+rotación, reuse detection, logout idempotente, change-password, delete-account, acceso dual) verde contra `eltemplo_test`, más `refresh_tokens` agregado a `TABLES_TO_CLEAN` — el cierre verificable del lado API de la fase (Req 14).**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-05-25T20:46:15Z
- **Completed:** 2026-05-25T21:03:07Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- `schema.refreshTokens` agregado a `TABLES_TO_CLEAN` en `test/helpers.ts` (leaf FK→users, junto a `memberLogins`, respetando el orden FK-aware) — aislamiento inter-test.
- Suite `test/auth/refresh-tokens.test.ts` con 6 `it`s cubriendo los flujos críticos:
  - **Refresh + rotación (Req 2,6):** verifica en DB que el refresh viejo queda `revoked_at != null` + `replaced_by_id` apuntando exactamente al `id` del nuevo, que el nuevo no está revocado y expira en `now+30d ± holgura` (sliding), y que el access nuevo pasa `/auth/me`.
  - **Reuse detection (Req 3):** rotar A→B, reusar A → 401, y la familia completa del user queda revocada (0 filas activas).
  - **Logout idempotente (Req 4, D-04):** logout → 200, refresh posterior → 401, segundo logout → 200, logout de token inexistente → 200 (no leak).
  - **Change-password (Req 12, D-01):** revoca TODOS los refresh y emite un par nuevo para el device actual; el par nuevo funciona, B y el viejo de A quedan revocados.
  - **Delete-account (D-05):** tras el soft-delete, ningún refresh del user puede rotarse y no quedan filas activas.
  - **Acceso dual (Req 8):** `token` legacy (7d) y `accessToken` (30m) ambos pasan `/auth/me`.
- `pnpm test` completo verde: **89 archivos, 1279 tests pass, 1 skipped, 2 todo, 0 failed**.

## Task Commits

1. **Task 1: refresh_tokens en TABLES_TO_CLEAN** — `1498a8ca` (test)
2. **Task 2: suite de integración (6 flujos)** — `c45ea9ce` (test)

_Task 2 está marcado `tdd="true"`, pero la implementación de producción es upstream (Plans 01/02) — este plan es verificación end-to-end. Por eso es un único `test(...)` commit (no hay par RED test→GREEN feat: el comportamiento ya existe y la suite lo prueba verde de entrada tras corregir el setup del fixture)._

## Files Created/Modified

- `el-templo-api/test/auth/refresh-tokens.test.ts` — suite de integración (6 `it`s) + tipos locales para narrowing de bodies (sin `any`), `hashToken` para verificación de estado DB.
- `el-templo-api/test/helpers.ts` — `schema.refreshTokens` agregado a `TABLES_TO_CLEAN`.

## Decisions Made

- Fixtures via `registerUser` helper en lugar de `app.inject` crudo: `/auth/register` bloquea phones duplicados (Phase 111, last-10 normalizado) y `registerUser` ya genera dni/phone únicos por llamada.
- Verificación de estado DB por `token_hash = sha256(plano)` (el plano nunca se persiste), asertando `revoked_at`, `replaced_by_id` y `expires_at`.
- El test DB auto-provisiona la migración 0125 desde `src/db/migrations/*.sql` en cada worker fresco (`test/setup.ts` la corre al crear `eltemplo_test_<pool>`), así que no hizo falta aplicar la migración a mano (el critical-constraint de "aplicar 0125 a eltemplo_test" quedó satisfecho automáticamente).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test bug] Fixture de registro fallaba con 400**

- **Found during:** Task 2 (primera corrida)
- **Issue:** El `registerSession` inicial usaba `app.inject` crudo sin `dni`/`phone`, que `/auth/register` rechaza (400) por el phone-block de Phase 111.
- **Fix:** Refactor a `registerUser` helper (genera dni/phone únicos).
- **Files modified:** `el-templo-api/test/auth/refresh-tokens.test.ts`
- **Commit:** `c45ea9ce`

**2. [Rule 1 - Test ordering] El par nuevo de change-password se invalidaba antes de probarse**

- **Found during:** Task 2 (segunda corrida)
- **Issue:** El test probaba primero rotar los refresh viejos/revocados de A y B; rotar un token revocado dispara reuse-detection, que revoca la familia COMPLETA del user (comportamiento de producción correcto), invalidando el par nuevo emitido por change-password antes de poder asertarlo (401 inesperado).
- **Fix:** Reordenar — asertar el par nuevo (200 + `/me`) PRIMERO, luego probar que los viejos están revocados (401). Documentado en comentario inline.
- **Files modified:** `el-templo-api/test/auth/refresh-tokens.test.ts`
- **Commit:** `c45ea9ce`

Ambos fueron bugs en la lógica del test, no en el código de producción. El código de Plans 01/02 se comportó correctamente en todos los flujos.

## Threat Model Coverage

- **T-116-19 (Spoofing/Replay):** mitigado — test asserta 401 + familia revocada al reusar un refresh rotado.
- **T-116-20 (Repudiation/rotación trazable):** mitigado — test verifica `replaced_by_id` + `revoked_at` en DB.
- **T-116-21 (Information Disclosure/logout):** mitigado — test asserta 200 idempotente incluso para token inexistente (no leak, D-04).
- **T-116-22 (Tampering/aislamiento inter-test):** mitigado — `refresh_tokens` en `TABLES_TO_CLEAN`.
- **T-116-SC (npm installs):** mitigado — NO se agregó ni actualizó ninguna dependencia (vitest/argon2/drizzle ya presentes).

No hay superficie de seguridad nueva fuera del threat model.

## Known Stubs

Ninguno. La suite ejercita los endpoints reales contra la tabla viva `refresh_tokens` en `eltemplo_test`.

## User Setup Required

Ninguno para tests. (Pendiente independiente de fases previas: migración 0125 en staging+prod via `pnpm db:migrate` — checkpoint humano, ver blockers de Plan 116-02.)

## Next Phase Readiness

- Lado API de la fase 116 cerrado y verificable (`pnpm test` verde). Frontends (Plans 03/04) ya consumen el contrato probado.
- Pendiente operativo: correr migración 0125 en staging y producción (checkpoint humano estándar).

## Self-Check: PASSED

- Files: `el-templo-api/test/auth/refresh-tokens.test.ts` FOUND; `el-templo-api/test/helpers.ts` contiene `schema.refreshTokens` FOUND.
- Commits: `1498a8ca` FOUND, `c45ea9ce` FOUND en git log.
- `pnpm test` exits 0 (89 files, 1279 passed, 0 failed).

---

_Phase: 116-refresh-tokens-auth_
_Completed: 2026-05-25_
