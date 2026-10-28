---
phase: 199-rediseno-mi-templo
plan: 02
subsystem: api-sponsors
tags: [sponsors, service, wcag, settings, tenancy]
requires: [199-01]
provides:
  - SponsorsService (CRUD admin + métricas, límite por país, feed y eventos del socio)
  - contrastRatio / MIN_TEXT_CONTRAST (WCAG 2.x) en el server
  - TEMPLO_TENANT_ID + isTemploPlatformAdmin (guard "solo El Templo")
  - SettingsService.get/setSponsorsMaxActivePerCountry (system_settings)
  - schemas/tipos de sponsors (create/update/evento/settings/logo + respuestas)
affects: [199-03, 199-04, 199-05]
tech-stack:
  added: []
  patterns: [servicio molde novedades-service, tabla exenta + vistas gym-owned]
key-files:
  created:
    - el-templo-api/src/modules/shared/platform.ts
    - el-templo-api/src/modules/sponsors/contrast.ts
    - el-templo-api/src/modules/sponsors/schemas.ts
    - el-templo-api/src/modules/sponsors/service.ts
  modified:
    - el-templo-api/src/modules/shared/app-branch-name.ts
    - el-templo-api/src/modules/settings/keys.ts
    - el-templo-api/src/modules/settings/service.ts
key-decisions:
  - "visibleForCountry es la única condición de visibilidad (feed y eventos)"
  - "En update, el límite se chequea solo en los países donde la marca 'entra' (todos si estaba inactiva, solo los agregados si ya estaba activa)"
  - "Fechas de vigencia validadas como fecha real de calendario (el pattern solo valida la forma)"
requirements-completed: [D-18, D-19, D-20, D-21, D-24, D-25]
completed: 2026-10-15
---

# Phase 199 Plan 02: Contratos y SponsorsService Summary

Servicio de dominio de patrocinadores con todas las reglas server-side: contraste WCAG >= 4.5, prefijo de logo en el R2 propio, límite de activas por país (system_settings, default 6), feed segmentado por país y vigencia en la zona de la sede, `redeemCode` solo con plan activo (misma regla que `autoExpireSubscriptions`) y eventos idempotentes que conservan la primera marca de tiempo.

## Commits (worktree `et-199-mi-templo`, rama `feat/199-mi-templo-rediseno`)

- Task 1: `848aae34b` feat(199-02): contratos de patrocinadores — guard de plataforma, contraste WCAG, límite en system_settings y schemas
- Task 2: `db86fe83e` feat(199-02): SponsorsService — CRUD con métricas, límite por país, feed del socio y eventos idempotentes

## Resultados de verificación

- Task 1: `npx tsc --noEmit` = 0. Greps de aceptación: `sponsors.max_active_per_country` en keys = 1, `additionalProperties: false` = 6 (>= 6), get/set del límite en settings/service = 2, `from "./platform"` en app-branch-name = 1, `TEMPLO_TENANT_ID = 1` y `TODO(tren 182)` en platform.ts presentes, `0.04045` y `MIN_TEXT_CONTRAST = 4.5` en contrast.ts = 1 cada uno. PASS.
- Task 2: `npx tsc --noEmit` = 0; `pnpm lint:tenant` exit 0 con `DISCREPANCIAS: 0` (repetido sobre el árbol final commiteado). Greps: `visibleForCountry(` 3, `tenantValues(ctx` 1, `tenantWhere(sponsorViews, ctx)` 3, `TEMPLO_TENANT_ID` 3, `groupBy(` 1, `onDuplicateKeyUpdate` 1, `isNull(` 4, `assertOwnLogoUrl(` 3, `process.env.R2_PUBLIC_URL` 1, `SPONSOR_LOGO_PREFIX` 2, `toISOString().split("T")[0]` 1, `subscriptions.endDate` 2, `console.` 0, `any` 0; `autoExpire` solo aparece en comentarios (no se llama al sweep). PASS.
- No se corrió vitest (corre en CI). Worktree limpio al terminar.

## Deviations from Plan

1. **[Rule 2 - validación] Fechas de vigencia reales.** El `pattern` del schema solo valida la forma (`2026-13-45` pasaría y MySQL daría 500). `validateBrand` suma `isRealDate` (roundtrip por `Date`) -> 400 "La fecha de vigencia no es válida". Sin test aún: el plan 04 debería cubrirlo.
2. **[Rule 2 - validación] Campos de texto vacíos tras trim.** `validateBrand` rechaza `name/category/benefit/detail` que quedan vacíos después del trim (el schema deja pasar `"   "`).
3. **[Refinamiento] Límite en update.** El plan decía "antes estaba inactivo o cambiaron los países -> `assertWithinLimit(paísesNuevos)`". Implementado más fino: si la marca ya estaba activa solo se chequean los países agregados; así editar una marca vieja no se traba cuando se bajó el límite después (coherente con "bajar el límite no desactiva nada").
4. **[Menor] Constantes del rango 1..50** (`SPONSORS_MIN/MAX_MAX_ACTIVE`) quedaron privadas en `settings/service.ts`; solo `SPONSORS_DEFAULT_MAX_ACTIVE` se exporta, como pedía el plan. `getSponsorsMaxActivePerCountry` exige `^\d+$` (rechaza "6.5", "abc", "") además del rango.
5. **[Menor] `unsupported country`.** `getMemberContext` mapea cualquier país distinto de ES a AR (mismo criterio que `prompt-service.getMemberScopeInfo`). Si algún día hay sedes de un tercer país, verían las marcas de AR; hoy solo existen AR y ES.
6. En `hasActivePlan` se mantuvo `sql\`... >= ${todayUtc}\``tal cual el plan (misma forma que`autoExpireSubscriptions`).

No se encontraron bugs reales en código previo.

## Dudas abiertas (no bloqueantes)

- **Carrera de límite (D-24):** el chequeo del límite y el insert/update no son atómicos; dos admins activando a la vez podrían superar el límite por 1. Documentado en el docblock del service; aceptado (alta manual, equipo único). Si se quiere estricto, sería un lock o una transacción con `SELECT ... FOR UPDATE`.
- **`partnerId` (duda de 199-01):** se aplicó la mitigación T-199-08 tal cual (`assertPartnerExists` con `tenantWhere(referralPartners, ctx)` en create y update, solo cuando viene `partnerId` no nulo). Como `sponsor_brands` es de plataforma y el partner es del tenant 1, hoy es coherente (solo El Templo administra); cuando entre la fase 182 convendría revisar si `partner_id` debe ser solo informativo.
- `redeemCode` se conserva en la fila si la marca pasa de `code` a `carnet` (no se anula); al socio nunca viaja para `carnet`. El admin lo ve.
- Los tests de esto (limite, vigencia, canje con `active` vencida, logo, cross-tenant) son del plan 04.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del threat_model. T-199-04 (guard en una función, a cablear en rutas del plan 03), T-199-05, T-199-06, T-199-07, T-199-08 y T-199-09 implementados en el service como mitigación.

## Self-Check: PASSED

- Archivos existen: `platform.ts`, `contrast.ts`, `schemas.ts`, `service.ts`.
- Commits `848aae34b` y `db86fe83e` presentes; `git status --porcelain` vacío en el worktree.
