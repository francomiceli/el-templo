---
phase: 199-rediseno-mi-templo
plan: 03
subsystem: api-sponsors
tags: [sponsors, routes, tenancy, manifest, r2]
requires: [199-02]
provides:
  - plugin admin /api/admin/sponsors (7 rutas, guard único isTemploPlatformAdmin)
  - plugin socio /api/members/sponsors (feed + eventos)
  - BlogImageService.generateUploadUrl con prefijo configurable
  - manifiesto ISO-01 con 472 entradas
affects: [199-04, 199-05]
key-files:
  created:
    - el-templo-api/src/modules/sponsors/admin-routes.ts
    - el-templo-api/src/modules/sponsors/member-routes.ts
    - el-templo-api/src/modules/sponsors/index.ts
  modified:
    - el-templo-api/src/app.ts
    - el-templo-api/src/modules/blog/image-service.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
key-decisions:
  - "Guard único en hook onRequest del plugin admin: authenticate, attachCountryScope, assertTenant, isTemploPlatformAdmin (403)"
  - "R2 se chequea DESPUÉS del guard (503 solo para quien ya es admin de El Templo)"
requirements-completed: [D-18, D-19, D-21, D-24, D-25, D-26]
completed: 2026-10-15
---

# Phase 199 Plan 03: Rutas de patrocinadores y manifiesto Summary

Las 9 rutas HTTP de patrocinadores (7 admin solo El Templo, 2 del socio con `userId` del token), logo en R2 bajo `sponsors/logos/` reutilizando `BlogImageService` con prefijo, y manifiesto fail-closed pasando de 463 a 472 entradas.

## Commits (worktree `et-199-mi-templo`, rama `feat/199-mi-templo-rediseno`)

- Task 1: `54304529e` feat(199-03): rutas admin (solo El Templo) y del socio de patrocinadores + logo en R2 bajo sponsors/logos
- Task 2: `cf2050275` test(199-03): manifiesto de tenancy con las 9 rutas de patrocinadores (463 -> 472)

## Resultados de verificación

- `npx tsc --noEmit` (el-templo-api): 0 errores tras cada task y al final.
- `pnpm lint:tenant`: exit 0, `DISCREPANCIAS: 0` (final sobre el árbol commiteado).
- Task 1 greps: `prefix: "/api/admin/sponsors"` = 1, `prefix: "/api/members/sponsors"` = 1, `isTemploPlatformAdmin(` en admin-routes = 1, `SPONSOR_LOGO_PREFIX` = 2 (import + uso), literal `"sponsors/logos"` en admin-routes = 0, `new SettingsService(fastify.db, fastify.log)` en admin-routes = 1, `prefix = "blog/images"` en image-service = 1, `request.user.userId` en member-routes = 2, `request.body.userId|request.params.userId` = 0. PASS.
- Task 2 greps: 7 claves `/api/admin/sponsors`, 2 `/api/members/sponsors`, `ENTRADAS_BASELINE = 472` = 1, `463 -> 472` = 1; el texto del `it` ("las 472 entradas") actualizado. PASS.
- `pnpm typecheck:tests`: 0 líneas que mencionen `tenant-manifest` o `iso-01-manifiesto`. El comando sigue en sus 14 discrepancias de base (preexistentes; incluye aviso de entradas obsoletas en `attendance.test.ts` y `lifecycle.test.ts`, no tocadas).
- ISO-03: `grep -c sponsors` en los 4 `iso-03-cobertura*.test.ts` = 0 en todos; esos archivos no se tocaron.
- No se corrió vitest (corre en CI). Worktree limpio al terminar.

## Deviations from Plan

1. **[Menor] Guard del plugin con `assertTenant` dentro del hook.** Si `assertTenant` tira (sin scope) lo hace fuera de un try/catch, igual que en el molde `novedades-routes`; el error handler global lo mapea. Sin cambio funcional respecto de lo pedido.
2. **[Menor] `GET/PUT /settings` y `/logo-upload-url`** llaman a `assertTenant` solo por contrato de scope (el ctx no se usa en el handler); el guard real ya corrió en el hook.
3. **[Menor] Orden en manifiesto:** bloque admin entre `settings` y `staff-attendance`; bloque socio entre `scheduling` y `subscription` (orden alfabético por prefijo).
4. Motivos de las 4 rutas CRUD adaptados por verbo (los de PUT/POST agregan la validación del partner con `tenantWhere`, DELETE la cascada de vistas).

No se encontraron bugs reales en código previo.

## Dudas abiertas (no bloqueantes)

- **Rutas estáticas vs paramétricas:** `PUT /settings` coexiste con `PUT /:id` (id es integer, `settings` nunca matchea y find-my-way prioriza estáticas). Conviene un test en el plan 04 que lo confirme.
- **403 por rol:** el hook corre `attachCountryScope` antes del guard de rol, igual que el molde de referral-partners; un admin de otro tenant llega al 403 sin tocar datos.
- **Tests de las rutas** (403 por rol/tenant, 503 sin R2 después del guard, userId del token, validaciones del service) son del plan 04.
- El 503 de `/logo-upload-url` devuelve `{ error }` sin `message`, igual que el endpoint de blog.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del threat_model. T-199-10 (guard único), T-199-11 (userId del token, schemas con `additionalProperties: false`), T-199-12 (extensiones limitadas, prefijo fijo, 15 min, 503 sin R2) y T-199-13 (9 rutas clasificadas) implementados.

## Self-Check: PASSED

- Archivos existen: `admin-routes.ts`, `member-routes.ts`, `index.ts`.
- Commits `54304529e` y `cf2050275` presentes en `git log`; `git status --porcelain` vacío en el worktree.
