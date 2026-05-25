# Phase 116: Refresh Tokens Auth - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-25
**Phase:** 116-refresh-tokens-auth
**Areas discussed:** Revocación en change-password, Lock del interceptor compartido, Migración soft del storage, Forma de /auth/logout + delete-account

---

## Revocación en change-password

| Option                               | Description                                                                            | Selected |
| ------------------------------------ | -------------------------------------------------------------------------------------- | -------- |
| Devolver par nuevo, sesión sobrevive | Revoca todos los refresh y emite un par nuevo para la sesión actual; mejor UX          | ✓        |
| Forzar re-login en todos             | Revoca todos incluido el actual, sin par nuevo; más simple, desloguea el device actual |          |

**User's choice:** Devolver par nuevo, sesión sobrevive.
**Notes:** El endpoint `/me/change-password` extiende su response con `{ accessToken, refreshToken }`; el cliente lo guarda. Path real es `/me/change-password`, no `/auth/change-password` como dice el SPEC.

---

## Lock del interceptor compartido

| Option                   | Description                                                       | Selected |
| ------------------------ | ----------------------------------------------------------------- | -------- |
| Por-app, mismo patrón    | Cada app su copia del lock (~40 LOC), cero infra nueva            | ✓        |
| Crear package compartido | pnpm workspace + build + versionado; over-engineering para 40 LOC |          |
| Copiar literal el módulo | DRY manual frágil, sincronización a mano                          |          |

**User's choice:** Por-app, mismo patrón (pidió explicación corta + hacer lo recomendado).
**Notes:** No existe infra de código compartido (sin pnpm-workspace, packages/, ni cross-imports). Las apps difieren en storage. Se explicó el problema del refresh-storm y el rol del lock.

---

## Migración soft del storage

| Option                            | Description                                                      | Selected |
| --------------------------------- | ---------------------------------------------------------------- | -------- |
| Leer authToken legacy como access | Cleanup diferido al primer refresh exitoso; cero deslogueos      | ✓        |
| Migrar authToken en el boot       | Cleanup eager; pierde el valor antes de confirmar el flujo nuevo |          |
| Ignorar el legacy                 | Deslogueo masivo al actualizar                                   |          |

**User's choice:** Leer authToken legacy como access.
**Notes:** Req 13 del SPEC. Admin usa keys `adminAccessToken` + `adminRefreshToken`, lee `adminToken` legacy igual.

---

## Forma de /auth/logout

| Option                    | Description                              | Selected |
| ------------------------- | ---------------------------------------- | -------- |
| Del body { refreshToken } | Consistente con /auth/refresh, explícito | ✓        |
| Del header Authorization  | Mezcla semántica con el access Bearer    |          |

**User's choice:** Del body { refreshToken }.

---

## Revocación en delete-account

| Option                | Description                                            | Selected |
| --------------------- | ------------------------------------------------------ | -------- |
| FK cascade automático | Solo si delete-account borra la fila                   |          |
| Revocación explícita  | UPDATE refresh_tokens + FK cascade como defensa futura | ✓        |

**User's choice:** Revocación explícita.
**Notes:** Hallazgo: delete-account hace soft-delete (anonimiza PII + setea deletedAt en `auth/routes.ts:586`), así que el FK cascade no se dispara. El usuario primero eligió "FK cascade" pero al surgir el hallazgo cambió a revocación explícita.

---

## Claude's Discretion

- Estructura interna / nombre del módulo del lock dentro de cada app.
- Nombres exactos de columnas del schema (dentro de las mínimas del Req 1).

## Deferred Ideas

- UI de "Sesiones activas" / gestión multi-device.
- Force update infra (`X-App-Version`).
- Audit log de sesiones (`last_used_at`, `ip`, `user_agent`).
- Rate limiting en `/auth/refresh`.
