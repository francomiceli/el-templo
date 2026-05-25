# Phase 116: Refresh Tokens Auth — Specification

**Created:** 2026-05-14
**Ambiguity score:** 0.136 (gate: ≤ 0.20)
**Requirements:** 14 locked

## Goal

Reemplazar el JWT único de 7 días por un esquema **access token (JWT, 30 min) + refresh token opaco (30 días con sliding expiration)** con rotación obligatoria y reuse detection, de manera que un usuario activo nunca sea desloguado mientras use la app, manteniendo backwards-compatibility con apps viejas en Play Store via campo `token` legacy en el response de login/register.

## Background

**Estado actual del codebase:**

- API (`el-templo-api/src/plugins/auth.ts:28`): JWT firmado con `JWT_EXPIRES_IN=7d`. Sin refresh token, sin endpoint `/auth/refresh`, sin endpoint `/auth/logout`, sin tabla `refresh_tokens`. El verificador usa `request.jwtVerify()` de `@fastify/jwt` y tira 401 al expirar.
- API (`el-templo-api/src/modules/auth/routes.ts:271,384`): `/auth/register` y `/auth/login` retornan `{ token, user, ... }`. El `token` es el único JWT emitido.
- Member app (`el-templo-app/src/composables/useTokenStorage.ts`): guarda key `authToken` en Capacitor Preferences (native) o localStorage (web).
- Member app (`el-templo-app/src/boot/axios.ts:62-74`): interceptor de 401 borra el token y redirige a `/login`. No hay reintento.
- Member app (`el-templo-app/src/boot/auth.ts:35-38`): si `/auth/me` falla al boot, clear + remove token. Cualquier error transitorio desloguea.
- Admin (`el-templo-admin/src/boot/axios.ts:11`): mismo patrón pero key `adminToken` en localStorage (web-only, sin Capacitor).
- Búsqueda confirma: **cero ocurrencias** de `refreshToken`/`refresh_token` en API o frontends.

**Trigger:** usuarios reportan logout recurrente de la app de miembros. Causa raíz: el JWT vence a los 7 días sin mecanismo de renovación; cualquier 401 (incluido por expiración) desloguea sin retry. La app está en Play Store con base instalada, por lo que cualquier cambio en el contrato de auth debe ser backwards-compatible.

**Delta primario:** introducir nueva tabla `refresh_tokens`, dos endpoints nuevos (`/auth/refresh`, `/auth/logout`), refactor del interceptor de axios en ambos frontends con lock compartido, y extender el response de login/register para incluir `accessToken` + `refreshToken` sin remover el campo `token` legacy.

## Requirements

1. **Tabla refresh_tokens**: Existe una tabla `refresh_tokens` que persiste cada refresh emitido en hash, ligado al user, con expiración, revocación y trazabilidad de rotación.
   - Current: no existe ninguna tabla de sesiones/refresh tokens.
   - Target: tabla `refresh_tokens` con columnas mínimas `id`, `user_id` (FK users), `token_hash` (string, único, sha256 del token plano), `expires_at`, `revoked_at` (nullable), `replaced_by_id` (FK self, nullable, para rotación), `created_at`. Index en `token_hash` y `user_id`.
   - Acceptance: migración Drizzle aplicada en eltemplo_test; query directa contra MySQL muestra la tabla con columnas e indexes esperados; el token plano nunca se persiste, solo el hash.

2. **Endpoint POST /auth/refresh**: Permite al cliente canjear un refresh válido por un access nuevo + refresh rotado.
   - Current: no existe.
   - Target: endpoint `POST /auth/refresh` que recibe `{ refreshToken }` en body, valida (existe, no revocado, no expirado), rota (genera uno nuevo, marca el viejo como `revoked_at=now` y `replaced_by_id=nuevo_id`), extiende `expires_at` 30d desde ahora (sliding), y responde `{ accessToken, refreshToken }`.
   - Acceptance: integration test que (a) loguea un user, (b) llama `/auth/refresh` con el refresh recibido, (c) verifica que devuelve un access+refresh nuevos, el refresh viejo queda revocado, y el access nuevo verifica contra `/auth/me`.

3. **Reuse detection**: Si un refresh ya rotado vuelve a usarse, se interpreta como robo y se revoca toda la familia.
   - Current: no aplica.
   - Target: si llega un `refreshToken` cuyo `revoked_at` no es null, se revocan todos los refresh tokens del mismo `user_id` (incluyendo descendientes vía `replaced_by_id`) y se responde 401.
   - Acceptance: integration test que (a) loguea, (b) rota una vez, (c) intenta usar el refresh original (ya rotado) → API responde 401 y query muestra todos los refresh del user con `revoked_at` seteado.

4. **Endpoint POST /auth/logout**: Cliente puede revocar explícitamente su refresh actual.
   - Current: no existe — cliente sólo borra el token de storage local.
   - Target: endpoint `POST /auth/logout` que recibe `{ refreshToken }` (o lee del header) y marca ese refresh como `revoked_at=now`. Responde 200 incluso si el token ya estaba revocado/inválido (idempotente, no leak).
   - Acceptance: integration test que loguea + logout + intenta refresh con ese token → 401.

5. **Access token corto**: Los JWT de access duran 30 minutos.
   - Current: `JWT_EXPIRES_IN=7d` para el único token emitido.
   - Target: se introduce variable `JWT_ACCESS_EXPIRES_IN=30m`. El access nuevo (`accessToken`) se firma con esta duración. El campo `token` legacy sigue firmándose con `JWT_EXPIRES_IN=7d` para apps viejas.
   - Acceptance: unit test que firma un access y verifica `exp - iat === 1800` segundos. Verifica también que `token` legacy mantiene 7d.

6. **Refresh token sliding 30d**: Cada uso del refresh extiende su expiración a 30 días desde el momento de uso.
   - Current: no aplica.
   - Target: en cada `/auth/refresh`, el nuevo refresh tiene `expires_at = now() + 30d`. Un usuario que usa la app diariamente nunca pierde la sesión; un usuario inactivo 30+ días debe re-loguear.
   - Acceptance: integration test que (a) crea refresh con `expires_at` cercano, (b) rota, (c) verifica que el nuevo tiene `expires_at ≈ now + 30d`.

7. **Response de login/register extendido y backwards-compatible**: `POST /auth/login` y `POST /auth/register` devuelven `accessToken` y `refreshToken` además de `token` legacy.
   - Current: response devuelve `{ token, user, ... }`.
   - Target: response devuelve `{ token, accessToken, refreshToken, user, ... }`. `token` sigue siendo JWT de 7d (clientes viejos lo siguen leyendo). `accessToken` es el JWT de 30m. `refreshToken` es opaco (no JWT — genera con `crypto.randomBytes(32).toString('base64url')`), persistido hasheado.
   - Acceptance: integration test contra `/auth/login` verifica los tres campos presentes, el `token` legacy verifica contra `/auth/me`, y el `accessToken` también. Refresh token verifica contra `/auth/refresh`.

8. **Verificación dual de access en endpoints protegidos**: Cualquier JWT firmado por la API (legacy de 7d o nuevo de 30m) sigue siendo aceptado en endpoints protegidos.
   - Current: `fastify.authenticate` acepta cualquier JWT válido firmado con `JWT_SECRET`.
   - Target: sin cambio (el comportamiento existente ya cubre ambos casos porque `@fastify/jwt` verifica solo firma + expiración, no metadata adicional).
   - Acceptance: integration test loguea via flow legacy (lee `token`) y via flow nuevo (lee `accessToken`), llama `/auth/me` con cada uno, ambos responden 200.

9. **Interceptor con lock compartido (member app)**: El interceptor de axios reintenta una sola vez tras refresh exitoso, con un lock que evita múltiples refreshes concurrentes.
   - Current: `el-templo-app/src/boot/axios.ts:60-77` borra y redirige al primer 401.
   - Target: en 401, si hay refresh disponible, encolar el request original, disparar un solo `/auth/refresh` por lock compartido (Promise compartida), actualizar tokens en storage, reintentar todos los requests encolados. Si refresh falla (401 o error de red persistente tras un retry con backoff), recién ahí ejecutar `clearAuth` + `redirect /login`.
   - Acceptance: unit test del interceptor con 5 requests en paralelo que reciben 401 simultáneamente — solo 1 llamada a `/auth/refresh` se dispara, todos los requests se reintentan con el access nuevo.

10. **Interceptor con lock compartido (admin)**: Mismo comportamiento que requisito 9 pero en `el-templo-admin/src/boot/axios.ts`.
    - Current: `el-templo-admin/src/boot/axios.ts:30-43` (estructura equivalente al app, web-only, key `adminToken`).
    - Target: misma lógica de lock + retry. Storage en localStorage. Keys: `adminAccessToken` + `adminRefreshToken` (mantener `adminToken` legacy mientras el admin viejo siga deployado, aunque admin se redeploya inmediato).
    - Acceptance: mismo test unit que requisito 9 pero ejecutado contra el bundle del admin.

11. **Boot resiliente al refresh (member app)**: Si el access guardado expiró al abrir la app, se hace refresh silencioso antes de llamar `/auth/me`.
    - Current: `boot/auth.ts:18-39` llama `/auth/me` directo; falla → borra todo.
    - Target: leer access + refresh; si access existe pero expiró (decodificar `exp` del JWT) y hay refresh válido, hacer `/auth/refresh` primero, después `/auth/me`. Si refresh falla, ahí sí limpiar.
    - Acceptance: manual test — login, esperar >30 min con app cerrada, reabrir → no pide re-login.

12. **Revocación al cambiar password**: `/auth/change-password` revoca todos los refresh tokens del user excepto la sesión actual (opcional: incluyéndola).
    - Current: `el-templo-api/src/modules/auth/routes.ts` tiene `change-password` que no toca tokens existentes (porque no existían).
    - Target: tras hash exitoso de la nueva password, ejecutar `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL` (revocando todo). El cliente actual recibe el nuevo par via el response del change-password (extender el endpoint para devolver `{ accessToken, refreshToken }` opcional) o re-loguea explícitamente.
    - Acceptance: integration test que loguea desde dos sesiones (A y B), cambia password desde A, intenta refresh desde B → 401.

13. **Storage en cliente**: Refresh token guardado en Capacitor Preferences (native) o localStorage (web), mismo storage que access.
    - Current: solo un token, key `authToken` en Preferences/localStorage.
    - Target: dos keys: `accessToken` y `refreshToken`. Si se encuentra el viejo `authToken` al boot, leerlo como `accessToken` (migración soft, sin perder usuarios al deployar). En el admin: `adminAccessToken` + `adminRefreshToken`.
    - Acceptance: manual test post-deploy — usuario con app vieja (que tiene `authToken`) abre app nueva, la app lee el `authToken` legacy y lo usa hasta que expire, después /auth/me dispara refresh fallido y obliga re-login (impacto: una vez por usuario).

14. **Tests de integración mínimos**: La fase incluye tests automáticos contra eltemplo_test que cubren los flujos críticos.
    - Current: existen tests de `/auth/login` y `/auth/register` en `el-templo-api/test/`.
    - Target: tests nuevos para `/auth/refresh` (happy path, rotación, reuse detection, expirado, revocado), `/auth/logout` (revoca, idempotente), `change-password` (revoca todo), y unit test del lock del interceptor.
    - Acceptance: `pnpm test` pasa con los tests nuevos verdes; coverage muestra los nuevos files de auth tocados.

## Boundaries

**In scope:**

- Tabla `refresh_tokens` (schema Drizzle + migración SQL committeada).
- Endpoints `POST /auth/refresh` y `POST /auth/logout`.
- Extensión del response de `/auth/login` y `/auth/register` con `accessToken` + `refreshToken` (campo `token` legacy se mantiene).
- Revocación de refresh tokens al cambiar password.
- Refactor del interceptor de axios en member app + admin con lock compartido y retry.
- Refactor del boot de auth para hacer refresh silencioso si el access expiró.
- Migración soft de storage (lectura del key `authToken` legacy al boot, usado como `accessToken` hasta que expire).
- Tests de integración para los flujos de refresh, rotación, reuse detection, revocación, y race condition del lock.

**Out of scope:**

- **Pantalla "Sesiones activas" / gestión multi-device** — la fase implementa multi-sesión a nivel data model y endpoints, pero no UI de listado/revoke. Defer a fase futura si se prioriza.
- **Force update infra (`X-App-Version`, minimum version check)** — no necesaria porque mantenemos `token` legacy indefinidamente. Defer a fase aparte si se decide implementar.
- **Audit log de sesiones (`last_used_at`, `ip`, `user_agent`)** — el schema deliberadamente NO incluye estas columnas en esta fase para mantener el alcance acotado. Se agregarán cuando se planifique la UI de sesiones activas.
- **Rate limiting en `/auth/refresh`** — no hay rate limiting general en la API hoy; agregarlo solo para refresh es asimétrico. Defer a una fase de hardening global de auth.
- **Borrado del campo `token` legacy** — se mantiene indefinidamente (costo: 1 línea de código). Si en el futuro se hace un refactor mayor de auth, se limpia ahí.
- **Sliding expiration en el access token** — el access expira en 30m fijos; no se extiende por actividad. La extensión por actividad ocurre en el refresh.
- **Secure storage nativo (Keystore/Keychain)** — usamos Capacitor Preferences como hoy. No tratamos datos financieros/salud sensibles que justifiquen complejidad nativa adicional.
- **SSO / login social / biometría** — no relacionado con esta fase.
- **Reset de password (link en email)** — si existe el flow, no se modifica para revocar sesiones. Se acota a `change-password`. Si surge necesidad, fase aparte.

## Constraints

- **Backwards compatibility**: el response de `/auth/login` y `/auth/register` DEBE seguir incluyendo el campo `token` (JWT de 7d) para no romper apps viejas en Play Store. El campo se mantiene indefinidamente.
- **Stack**: API en Fastify + Drizzle + MySQL; member app en Quasar + Vue 3 + Capacitor; admin en Quasar + Vue 3 web. Sin nuevas dependencias native (no plugins de secure storage).
- **Drizzle**: schema + migración SQL committeados juntos. Migración aplicada via `pnpm db:migrate` (runner custom, NO `drizzle-kit migrate`).
- **Logging**: `request.log` (Pino) en API, `createLogger()` en frontends. Nunca `console.log`.
- **TypeScript**: no `any`. Errores con `catch (err: unknown)` + `instanceof Error`.
- **Pino + Sentry**: errores 401 por refresh fallido no deben spamear Sentry — log a nivel `warn`, no `error`.
- **Loop infinito**: el cliente NO debe disparar `/auth/refresh` en respuesta a un 401 del propio `/auth/refresh` (whitelist explícita del endpoint en el interceptor).
- **Mantener `token` legacy compatible con `accessToken`**: ambos deben verificar contra `/auth/me` sin código adicional (mismo `JWT_SECRET`, mismo verifier).
- **Migración suave de storage**: al boot, si solo existe `authToken` (legacy) y no `accessToken`, leerlo como access. Borrar `authToken` cuando se establezca el primer par nuevo via refresh exitoso o relogin.

## Acceptance Criteria

- [ ] Manual test golden path: login con un user de prueba, cerrar app, esperar >30 min, reabrir — no pide re-login.
- [ ] Manual test sliding refresh: login, dejar app abierta usándola normalmente por >24h — no pide re-login.
- [ ] Manual test expiración refresh: login, no abrir la app por 31 días (simular con clock skew en test) — pide re-login.
- [ ] Manual test password change: login en device A + device B, cambiar password en A, abrir app en B — pide re-login.
- [ ] Manual test app vieja compat: instalar versión actual (con `authToken` solo), deployar API nueva, abrir app — sigue logueado hasta que el `authToken` expire (7d), luego pide re-login (impacto esperado: una vez).
- [ ] Integration test happy path: `pnpm test` en `el-templo-api/test/` cubre login → /auth/refresh → /auth/me con access nuevo, todo verde.
- [ ] Integration test rotación: refresh viejo queda `revoked_at` seteado y `replaced_by_id` apunta al nuevo, verificado con query directa.
- [ ] Integration test reuse detection: usar refresh ya rotado → 401 + toda la familia del user revocada.
- [ ] Integration test logout: `/auth/logout` revoca el refresh y siguiente refresh con ese token → 401.
- [ ] Unit test interceptor (member app): 5 requests paralelos con 401 disparan exactamente 1 `/auth/refresh` (mock contado), todos se reintentan con el access nuevo.
- [ ] Unit test interceptor (admin): mismo test que arriba contra el bundle de admin.
- [ ] Unit test loop prevention: 401 desde `/auth/refresh` no dispara otro refresh — el cliente limpia y redirige.
- [ ] Tabla `refresh_tokens` creada via migración Drizzle commiteada en `el-templo-api/src/db/migrations/`.
- [ ] CI verde: lint, type-check, integration tests pasan.

## Ambiguity Report

| Dimension           | Score     | Min   | Status | Notes                                                            |
| ------------------- | --------- | ----- | ------ | ---------------------------------------------------------------- |
| Goal Clarity        | 0.90      | 0.75  | ✓      | Goal preciso (30m access + 30d sliding refresh con rotación).    |
| Boundary Clarity    | 0.90      | 0.70  | ✓      | In/out scope listas explícitas; 8 ítems out-of-scope con razón.  |
| Constraint Clarity  | 0.82      | 0.65  | ✓      | TTLs y storage lockeados; rate limiting deferido explícitamente. |
| Acceptance Criteria | 0.80      | 0.70  | ✓      | 14 criterios pass/fail. Cobertura manual + integration + unit.   |
| **Ambiguity**       | **0.136** | ≤0.20 | ✓      | Gate pasado en Ronda 3.                                          |

### Interview Summary

**Ronda 1 (Researcher + Boundary):** Confirmado que la fase cubre member app + admin, multi-sesión por user, y discusión extensa de backwards-compatibility — usuario llegó a la conclusión correcta de que mantener `token` legacy indefinidamente tiene costo técnico trivial (~1 LOC) y elimina riesgo de romper apps viejas en Play Store.

**Ronda 2 (Constraints):** Lockeo de TTLs: access 30m, refresh 30d con sliding expiration. Done = manual test (login + esperar 24h cerrada + reabrir) + tests automáticos verdes.

**Ronda 3 (Boundary Keeper):** Storage en Capacitor Preferences (sin secure storage extra), revocación en password change + logout explícito, out-of-scope explícito: UI de sesiones activas, force update infra, audit log, rate limiting deferido a fase separada.

### Notes for Planner

- La migración soft del key de storage (`authToken` → `accessToken`) es crítica para no deslogear a todos los usuarios al deployar. Tests manuales deben cubrir este caso.
- El lock compartido del interceptor es el bug clásico de refresh tokens. Implementar como Promise compartida en module scope, no por-request. Asegurar que `/auth/refresh` está whitelisteado para no entrar en loop.
- `change-password` actualmente no devuelve tokens. Decidir en plan-phase si lo extendemos para devolver el par nuevo o si forzamos re-login.
- El admin no tiene Capacitor, solo web — el patrón es más simple ahí. Compartir la lógica del lock entre app+admin via un módulo común tipo `auth/refresh-lock.ts` puede ser razonable si no agrega coupling cross-app.
