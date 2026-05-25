# Phase 116: Refresh Tokens Auth - Context

**Gathered:** 2026-05-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Reemplazar el JWT único de 7 días por un esquema **access token (JWT, 30 min) + refresh token opaco (30 días con sliding expiration)** con rotación obligatoria y reuse detection, manteniendo backwards-compatibility con apps viejas en Play Store via campo `token` legacy. Cubre API (Fastify) + member app (Quasar/Capacitor) + admin (Quasar web).

</domain>

<spec_lock>

## Requirements (locked via SPEC.md)

**14 requirements are locked.** See `116-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `116-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**

- Tabla `refresh_tokens` (schema Drizzle + migración SQL commiteada).
- Endpoints `POST /auth/refresh` y `POST /auth/logout`.
- Extensión del response de `/auth/login` y `/auth/register` con `accessToken` + `refreshToken` (campo `token` legacy se mantiene).
- Revocación de refresh tokens al cambiar password.
- Refactor del interceptor de axios en member app + admin con lock compartido y retry.
- Refactor del boot de auth para hacer refresh silencioso si el access expiró.
- Migración soft de storage (lectura del key `authToken` legacy al boot, usado como `accessToken` hasta que expire).
- Tests de integración para refresh, rotación, reuse detection, revocación, y race condition del lock.

**Out of scope (from SPEC.md):**

- Pantalla "Sesiones activas" / gestión multi-device (data model multi-sesión sí, UI no).
- Force update infra (`X-App-Version`, minimum version check).
- Audit log de sesiones (`last_used_at`, `ip`, `user_agent`).
- Rate limiting en `/auth/refresh`.
- Borrado del campo `token` legacy (se mantiene indefinidamente).
- Sliding expiration en el access token (access fijo 30m).
- Secure storage nativo (Keystore/Keychain) — se usa Capacitor Preferences como hoy.
- SSO / login social / biometría.
- Reset de password por email.

</spec_lock>

<decisions>
## Implementation Decisions

Estas decisiones resuelven los 3 "Notes for Planner" del SPEC + un hallazgo nuevo (soft-delete). Las 4 áreas grises fueron discutidas con el usuario.

### Revocación en change-password (Req 12)

- **D-01:** `POST /me/change-password` revoca TODOS los refresh tokens del user **excepto que** emite un par nuevo (access + refresh) para la sesión actual, que lo recibe en el response. Resultado: cambiar password mantiene logueado el device actual y desloguea todos los demás. El endpoint extiende su response con `{ accessToken, refreshToken }`. El cliente (app + admin) debe guardar ese par nuevo al recibir el response del change-password.
- **NOTA de path:** el endpoint real es `POST /me/change-password` (`auth/routes.ts:534`), NO `/auth/change-password` como dice el SPEC. El planner debe usar el path real.

### Lock del interceptor (Req 9 + Req 10)

- **D-02:** Lock anti-refresh-storm implementado **por-app** (cada app su propia copia, mismo algoritmo ~40 LOC). NO se crea package compartido ni se copia un módulo idéntico cross-repo. Razón: no existe infra de código compartido (no hay pnpm-workspace, packages/, ni cross-imports), y un shared package para 40 LOC es over-engineering. Las apps difieren en storage (Capacitor vs localStorage) de todos modos.
- Patrón del lock: Promise compartida en module scope (no por-request); el primer 401 dispara un único `/auth/refresh`, los requests concurrentes encolan y reusan el resultado, reintento único tras refresh exitoso. `/auth/refresh` whitelisteado para no entrar en loop (un 401 del propio refresh → clearAuth + redirect).

### Migración soft del storage (Req 13)

- **D-03:** Al boot/lectura de token: si existe `accessToken` nuevo, usarlo; si NO existe pero sí `authToken` legacy, usarlo como access (sigue válido hasta 7d). Las keys nuevas (`accessToken` + `refreshToken`) se escriben y `authToken` se borra recién en el **primer refresh exitoso o re-login** (cleanup diferido, no eager). Impacto: cero deslogueos al actualizar la app. Admin usa keys `adminAccessToken` + `adminRefreshToken`, lee `adminToken` legacy igual.

### /auth/logout (Req 4)

- **D-04:** `/auth/logout` recibe el refresh token a revocar en el **body** (`{ refreshToken }`), consistente con `/auth/refresh`. Idempotente: 200 aunque ya esté revocado/inválido. NO lee del header (evita mezclar semántica con el access token del `Authorization: Bearer`).

### Revocación en delete-account (hallazgo nuevo)

- **D-05:** `POST /me/delete-account` hace **soft-delete** (anonimiza PII + setea `deletedAt`, `auth/routes.ts:586` — NO borra la fila), así que el FK `ON DELETE CASCADE` no se dispara. Se agrega **revocación explícita** dentro del handler de delete-account: `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL` (mismo patrón que change-password). El FK `ON DELETE CASCADE` se incluye igual en el schema como defensa futura por si hubiera hard-deletes.

### Claude's Discretion

- Estructura interna de los archivos del lock (nombre del módulo, ubicación dentro de cada app) queda a criterio del planner/executor, respetando D-02 (por-app, mismo patrón).
- Nombre exacto de las columnas del schema (dentro de las mínimas que exige Req 1).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase spec (locked requirements)

- `.planning/phases/116-refresh-tokens-auth/116-SPEC.md` — Locked requirements (14), boundaries, acceptance criteria. MUST read before planning.

### Código de auth a modificar (verificado 2026-05-25, post-78-commits)

- `el-templo-api/src/plugins/auth.ts:28` — `JWT_EXPIRES_IN` (default `7d`), firma JWT, decorator `fastify.authenticate` (líneas 37-52, usa `request.jwtVerify()`). Payload: `{ userId, email, role }`.
- `el-templo-api/src/modules/auth/routes.ts` — `POST /register` (línea 35, response con `token` línea 273-288), `POST /login` (línea 293, response línea 390-407), `GET /me` (línea 412), `POST /me/change-password` (línea 534, hoy NO toca tokens), `POST /me/delete-account` (línea 586, soft-delete/anonimiza). NO existen `/auth/refresh` ni `/auth/logout`.
- `el-templo-api/.env.example:13` — `JWT_EXPIRES_IN=7d` (agregar `JWT_ACCESS_EXPIRES_IN=30m`).
- `el-templo-api/src/db/schema/` — `users.ts` (tabla principal). NO existe `refresh_tokens`. Próxima migración: **0125** (la 0124 la tomó bar-challenge).
- `el-templo-app/src/composables/useTokenStorage.ts:4` — key `authToken`, Capacitor Preferences (native) / localStorage (web).
- `el-templo-app/src/boot/axios.ts:60-77` — interceptor 401 actual (limpia + redirige, sin retry).
- `el-templo-app/src/boot/auth.ts` — boot llama `/auth/me` directo (línea 20), falla → limpia (línea 37-38).
- `el-templo-admin/src/boot/axios.ts:11` — key `adminToken`, localStorage (web-only), interceptor 401 líneas 32-47.

### Convenciones del proyecto

- `CLAUDE.md` (root) — logging (Pino/createLogger, nunca console.log), TypeScript sin `any`, tests de integración obligatorios para rutas nuevas, migraciones via `pnpm db:migrate` (runner custom, NUNCA `drizzle-kit migrate`), commitear SQL junto al schema.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `fastify.authenticate` decorator (`auth.ts:37-52`): ya acepta cualquier JWT firmado con `JWT_SECRET` — verifica solo firma + expiración, sin metadata. El access nuevo (30m) y el `token` legacy (7d) verifican ambos sin cambios (Req 8).
- `useTokenStorage.ts`: abstracción Capacitor/localStorage ya existente — extender para dos keys en vez de reescribir.
- Patrón de interceptor de axios ya existe duplicado en app y admin — base para el refactor del lock.

### Established Patterns

- Constructor DI para servicios (Phase 56) — el refresh-token-service debería seguirlo.
- Schema changes via Drizzle + migración SQL commiteada (CLAUDE.md). Migración aplicada con `pnpm db:migrate`.
- Tests de integración contra MySQL real (`eltemplo_test`), ver `test/helpers.ts`.

### Integration Points

- Response de login/register: extender (no reemplazar) con `accessToken` + `refreshToken`, manteniendo `token`.
- change-password y delete-account: insertar revocación de refresh tokens en handlers existentes.
- Boot de ambas apps: insertar refresh silencioso antes de `/auth/me`.

</code_context>

<specifics>
## Specific Ideas

- TTLs lockeados: access 30m (`JWT_ACCESS_EXPIRES_IN=30m`), refresh 30d sliding. `token` legacy sigue 7d.
- Refresh token opaco: `crypto.randomBytes(32).toString('base64url')`, persistido solo como sha256 hash (token plano nunca se persiste).
- 401 por refresh fallido → log nivel `warn`, NO `error` (no spamear Sentry).

</specifics>

<deferred>
## Deferred Ideas

- UI de "Sesiones activas" / gestión multi-device — fase futura (el data model multi-sesión ya queda listo en esta fase).
- Force update infra (`X-App-Version` / minimum version check) — fase aparte si se decide.
- Audit log de sesiones (`last_used_at`, `ip`, `user_agent`) — junto con la UI de sesiones activas.
- Rate limiting en `/auth/refresh` — parte de un hardening global de auth, no asimétrico solo acá.

</deferred>

---

_Phase: 116-refresh-tokens-auth_
_Context gathered: 2026-05-25_
