---
phase: 194-invitaciones
plan: 07
subsystem: api
tags: [invitations, business-days, tenant_settings, settings-routes, tenancy]
requires:
  - phase: 194-05
    provides: plan Invitación y helpers de plan
provides:
  - addBusinessDays / loadHolidaySet / businessDaysHorizon (D-15, D-26d)
  - getInvitationSettings / setInvitationSettings / getDiscountCapAmount (parámetros del programa)
  - GET/PUT /api/admin/settings/invitations
affects: [194-08, 194-09, 194-10, 194-18, admin-settings-ui]
tech-stack:
  patterns: [KV por tenant con defaults en código y validación en escritura y lectura (molde sales-number)]
key-files:
  created:
    - el-templo-api/src/modules/shared/business-days.ts
    - el-templo-api/src/modules/referrals/invitation-settings.ts
    - el-templo-api/test/shared/business-days.test.ts
    - el-templo-api/test/invitations/settings.test.ts
  modified:
    - el-templo-api/src/modules/settings/routes.ts
    - el-templo-api/src/modules/shared/permissions.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
key-decisions:
  - "Parámetros nuevos en tenant_settings; aura_config.referral y system_settings.referral.max_percent_cap NO se mudan y se exponen de solo lectura"
  - "PUT habilitado a gestion/admin/owner (D-10c), GET a cualquier staff"
  - "getInvitationSettings recibe el logger como 3er parámetro porque ReferralService lo exige en el constructor"
requirements-completed: [D-15, D-26, D-10c, D-09, D-13, D-10, D-11, D-12, SC-1, SC-3]
duration: ~40min
completed: 2026-10-06
---

# Phase 194 Plan 07: Días hábiles y parámetros del programa Summary

**Cálculo determinístico de N días hábiles (lun-sáb, feriados por país, el día de activación no cuenta) y parámetros del programa de Invitaciones configurables en `tenant_settings` con API GET/PUT para el admin.**

## Commits

- `0bf93543b` feat(194-07): addBusinessDays puro + loader de feriados (Task 1)
- `5e3715b6d` feat(194-07): parámetros en tenant_settings + GET/PUT /api/admin/settings/invitations (Task 2)

## Dónde vive cada parámetro y por qué

| Parámetro | Dónde | Default / rango |
|---|---|---|
| Cupo mensual | `tenant_settings` `invitations.monthly_quota` | 2 (1..10) |
| Vigencia en días hábiles | `invitations.access_business_days` | 10 (1..30) |
| Ventana de reinvitación (días) | `invitations.reinvite_window_days` | 90 (0..365) |
| Inactividad de ex socio (meses) | `invitations.ex_member_inactivity_months` | 6 (0..36) |
| Ventana de compra tardía (días) | `invitations.late_purchase_window_days` | 30 (0..180) |
| % del invitado | `invitations.invitee_percent` | 10 (0..50) |
| Tope en dinero por país (D-10c) | `invitations.discount_cap_amount.AR` / `.ES` | sin fila = sin tope; entero 1..100.000.000; PUT con `null` borra la fila |
| % por invitado activo | `aura_config['referral'].default_amount` (existente, solo lectura) | 10 |
| Tope % acumulable (D-09) | `system_settings['referral.max_percent_cap']` (existente, solo lectura) | 40 |

Los dos existentes son globales (no por gimnasio): escribirlos desde un tenant sería cross-tenant, por eso la API no los edita (T-194-24). Se leen reusando `ReferralService.getReferralConfig()` (DRY).
El prefijo `invitations.` está en un único literal (`INVITATION_SETTINGS_PREFIX`); las keys se arman con `invitationSettingKey(name)` / `discountCapKey(country)`.

## Tests

- `test/shared/business-days.test.ts`: 13 verdes (11 puros + 2 de integración del loader).
- `test/invitations/settings.test.ts`: 27 verdes (servicio, HTTP, roles, rangos, valor corrupto, aislamiento 2-tenant por servicio y por HTTP).
- `test/tenancy/iso-01-manifiesto.test.ts`: 13 verdes con `ENTRADAS_BASELINE` 447 -> 449.
- Gates: `tsc --noEmit` 0, `lint:tenant` DISCREPANCIAS 0, `typecheck:tests` sin errores en los archivos tocados.

## Deviations from Plan

### Ajustes (sin cambio de alcance)

**1. `getInvitationSettings(db, ctx, log)` lleva logger como 3er parámetro.**
El plan decía `(db, ctx)`. `ReferralService` exige un `FastifyBaseLogger` en el constructor y se reusa `getReferralConfig()` según el plan (DRY). Los consumidores de 194-08+ deben pasar `this.log` / `request.log`.

**2. `additionalProperties: false` en Fastify descarta (no rechaza) claves desconocidas.**
El ajv por defecto de Fastify usa `removeAdditional: true`, así que un body con claves extra responde 200 y la clave ignorada nunca llega al servicio ni se persiste (incluido un `tenantId` en el body). El test lo fija. El servicio, llamado directo, SÍ rechaza claves desconocidas con 400.

**3. Mismo alcance de rutas que el plan, sin caso ISO-03.**
`/api/admin/settings` no está en ningún prefijo vigilado; el aislamiento 2-tenant se prueba en el propio test (servicio + HTTP con el admin del gimnasio 2).

## Allowlist de copy

No aplica (sin copy visible nueva en este plan).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del threat model del plan (T-194-21..24 cubiertos: preHandler de roles, schema + validación previa + lectura fail-closed, tenantWhere/tenantValues + test de aislamiento, globales solo lectura).

## Notas para planes siguientes

- Consumir `loadHolidaySet(db, ctx, country, start, addDays(start, businessDaysHorizon(n)))` y luego `addBusinessDays(start, n, set)`; `n` sale de `getInvitationSettings(...).accessBusinessDays`.
- El país de los feriados es el de la SEDE del invitado, no el del socio que invita.
- El tope en dinero: `getDiscountCapAmount(db, ctx, country)` devuelve `null` si no hay tope.

## Self-Check: PASSED

- Archivos creados verificados en disco; ambos commits existen en `git log`.
