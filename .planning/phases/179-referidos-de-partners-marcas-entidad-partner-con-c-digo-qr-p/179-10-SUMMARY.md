---
phase: 179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p
plan: 10
subsystem: api
tags: [fastify, drizzle, tenancy, referral-partners, finance, reportes]

# Dependency graph
requires:
  - phase: 179-09
    provides: "voidPendingCommissionsForSubscription, revokePartnerLink, assignPartnerToMember, ciclo de vida completo pending->qualified->void/settled de partner_commissions"
provides:
  - "settlePendingCommissions(ctx, partnerId, settledBy): liquidación batch por partner (D-16), UPDATE guardado status='pending' + partner_id + tenantWhere, devuelve { count, totalAmount, currency } desde affectedRows, idempotente"
  - "listConversions(ctx, filters): reporte de conversiones por partner, una query con JOINs a users/referral_partners/partner_commissions, sin N+1"
  - "listBenefitsWithoutConversion(ctx, filters): reporte de seguimiento manual (D-08 reescrita) con motivo derivado (semana_sin_conversion / beneficio_vencido_sin_uso), sin tocar users.lead_status"
  - "ConversionRow / BenefitWithoutConversionRow en types.ts (shapes documentados abajo para 179-13)"
  - "GET /api/admin/referral-partners/conversions, GET /api/admin/referral-partners/benefits-without-conversion, POST /api/admin/referral-partners/:id/settle — manifiesto ISO-01 actualizado (380 -> 383)"
  - "10 tests de integración contra MySQL real (6 liquidación + 4 reportes)"
affects: [179-13]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "settlePendingCommissions lee el SUM(amount) de las pending ANTES del UPDATE (es el único momento en que esa suma es observable — después del UPDATE esas filas ya no matchean status='pending') y usa affectedRows del UPDATE guardado como count, no una segunda lectura que podría desincronizarse bajo carrera."
    - "listBenefitsWithoutConversion computa el CASE del motivo con un ELSE simple en vez de duplicar el predicado completo: los dos motivos son mutuamente excluyentes por benefitStatus (consumed vs pending), así que basta con una condición reducida en el SELECT una vez que el WHERE ya filtró a las filas que matchean uno de los dos."
    - "El chequeo interior de /settle contra FINANCE_VOID_ROLES es defensivo, no funcional hoy: el guard onRequest del plugin (MEMBER_LIFECYCLE_ROLES) es el que decide el acceso real a las 3 rutas nuevas. Documentado explícitamente en el docblock de la ruta para que quede claro que no hay un 403 diferenciado escribible hoy."
key-files:
  created:
    - el-templo-api/test/referral-partners/liquidacion.test.ts
    - el-templo-api/test/referral-partners/reportes.test.ts
  modified:
    - el-templo-api/src/modules/referral-partners/service.ts
    - el-templo-api/src/modules/referral-partners/admin-routes.ts
    - el-templo-api/src/modules/referral-partners/schemas.ts
    - el-templo-api/src/modules/referral-partners/types.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts

key-decisions:
  - "GET /conversions y GET /benefits-without-conversion se registraron ANTES de GET /:id en el plugin, aunque find-my-way prioriza rutas estáticas sobre paramétricas por diseño — se prefirió ser explícito en el orden en vez de depender de esa garantía implícita, con un test dedicado que ejercita ambas rutas por HTTP."
  - "settlePendingCommissions no filtra el UPDATE con una condición que dependa del resultado del SELECT previo (ej. una lista de ids): usa el mismo predicado (tenantWhere + partner_id + status='pending') en las dos queries, así que el UPDATE es correcto incluso si el estado cambió entre el SELECT del total y el UPDATE (el total podría quedar levemente desincronizado bajo una carrera extrema, pero el UPDATE nunca toca una fila que no sea pending de ese partner — la garantía de aislamiento, T-179-43, no depende del SELECT previo)."
  - "El reporte de conversiones asume 0-o-1 comisión por vínculo (LEFT JOIN directo, sin pre-agregación por partner_referral_id) porque la garantía de negocio (flip pending->qualified ocurre una sola vez, comisión idempotente por subscription_id) lo sostiene hoy — documentado en el docblock de ConversionRow para que quede explícito qué pasaría si esa garantía cambiara."

requirements-completed: [D-08, D-13, D-16, D-20]

# Metrics
duration: ~65min
completed: 2026-08-23
---

# Phase 179 Plan 10: Liquidación batch de comisiones y reportes de conversiones/beneficios sin conversión Summary

**Liquidación batch por partner (D-16, un botón "Liquidar" marca todas las `pending` como `settled` en un acto, idempotente y auditable), más los dos reportes de negocio que faltaban para que la página de Partners sea operable: conversiones por partner y beneficios de partner sin conversión (D-08 reescrita, reemplaza al funnel de leads v5.8).**

## Performance

- **Duration:** ~65 min
- **Tasks:** 3/3
- **Files modified:** 8 (4 en src/, 2 en test-infra, 2 tests nuevos)

## Accomplishments

- `PartnerReferralService.settlePendingCommissions(ctx, partnerId, settledBy)`: `NotFoundError` si el partner no es del tenant; lee el `SUM(amount)` de las `pending` de ese partner (único momento en que esa suma es observable), después `UPDATE partner_commissions SET status='settled', settled_at=NOW(), settled_by=? WHERE tenantWhere AND partner_id=? AND status='pending'`; devuelve `{ count, totalAmount, currency }` con `count` = `affectedRows` real. Idempotente por construcción: una segunda llamada no encuentra `pending` (`count: 0`).
- `PartnerReferralService.listConversions(ctx, filters)`: una sola query con JOINs a `users` (nombre del socio), `referral_partners` (nombre/código) y `partner_commissions` (LEFT JOIN, estado/monto). Filtros `partnerId`/`status`/`dateFrom`/`dateTo`/`branchId`.
- `PartnerReferralService.listBenefitsWithoutConversion(ctx, filters)`: una query con `CASE` que deriva `motivo` — `semana_sin_conversion` (`free_pass` consumido hace más de 7 días, `BENEFIT_WITHOUT_CONVERSION_GRACE_DAYS`, y vínculo nunca `qualified`) o `beneficio_vencido_sin_uso` (`pending` con `benefit_expires_at` vencido). Reemplaza la idea original de mandar al funnel de leads: el docblock cita textualmente por qué (`expire-lost-leads.ts` exige `status='prueba'` + booking `is_trial`, incompatible con el consumidor de semana de partner).
- Rutas admin: `GET /api/admin/referral-partners/conversions`, `GET /api/admin/referral-partners/benefits-without-conversion` (registradas antes de `GET /:id`), `POST /api/admin/referral-partners/:id/settle` (200, `{ count, totalAmount, currency }`) con el chequeo interior defensivo contra `FINANCE_VOID_ROLES` documentado.
- Manifiesto ISO-01: 3 entradas nuevas tenant-scoped, `ENTRADAS_BASELINE` 380 → 383.
- 10 tests de integración contra MySQL real, 0 regresiones en el resto del módulo (`test/referral-partners` completo: 15 archivos / 119 tests verdes) ni en `test/tenancy` (23 archivos / 245 tests verdes combinado).

## Task Commits

Cada task se commiteó atómicamente en el worktree `et-179` (rama `feat/179-referidos-partners`):

1. **Task 1: settlePendingCommissions + los dos reportes en el servicio** - `6cd77142` (feat)
2. **Task 2: Rutas admin de liquidación y reportes + manifiesto** - `af68ceaa` (feat)
3. **Task 3: Tests de liquidación y de los dos reportes** - `0100ab15` (test)

## Shapes para 179-13 (el admin los consume)

**`POST /api/admin/referral-partners/:id/settle`** — sin body, 200:

```json
{ "count": number, "totalAmount": number, "currency": "ARS" | "EUR" }
```

Errores: 404 `NotFoundError` (partner inexistente/otro tenant), 403 (rol fuera de `MEMBER_LIFECYCLE_ROLES`), 401 (sin token).

**`GET /api/admin/referral-partners/conversions`** — querystring `partnerId?`, `status?` (`pending`|`qualified`|`revoked`), `dateFrom?`, `dateTo?`, `branchId?`, 200, array de `ConversionRow`:

```ts
interface ConversionRow {
  linkId: number;
  referredId: number;
  referredName: string;
  partnerId: number;
  partnerName: string;
  partnerCode: string;
  status: "pending" | "qualified" | "revoked";
  benefitType: "discount_percent" | "free_pass";
  benefitStatus: "pending" | "consumed" | "expired";
  qualifiedAt: Date | null;
  createdAt: Date;
  commissionId: number | null;
  commissionStatus: "pending" | "settled" | "void" | null;
  commissionAmount: number | null;
  commissionCurrency: "ARS" | "EUR" | null;
}
```

**`GET /api/admin/referral-partners/benefits-without-conversion`** — querystring `partnerId?`, `branchId?`, 200, array de `BenefitWithoutConversionRow`:

```ts
interface BenefitWithoutConversionRow {
  linkId: number;
  referredId: number;
  referredName: string;
  referredPhone: string | null;
  partnerId: number;
  partnerName: string;
  benefitType: "discount_percent" | "free_pass";
  benefitStatus: "pending" | "consumed" | "expired";
  motivo: "semana_sin_conversion" | "beneficio_vencido_sin_uso";
  fechaRelevante: Date; // consumo o vencimiento, según motivo
}
```

## Files Created/Modified

- `el-templo-api/src/modules/referral-partners/service.ts` - `settlePendingCommissions`, `listConversions`, `listBenefitsWithoutConversion`, `BENEFIT_WITHOUT_CONVERSION_GRACE_DAYS` (+330 líneas)
- `el-templo-api/src/modules/referral-partners/admin-routes.ts` - 3 rutas nuevas, `FINANCE_VOID_ROLES` importado
- `el-templo-api/src/modules/referral-partners/schemas.ts` - `listConversionsQuerySchema`, `listBenefitsWithoutConversionQuerySchema`, `settlePartnerCommissionsParamsSchema`
- `el-templo-api/src/modules/referral-partners/types.ts` - `ConversionRow`, `BenefitWithoutConversionRow`
- `el-templo-api/test/tenant-manifest.ts` - 3 entradas nuevas tenant-scoped
- `el-templo-api/test/tenancy/iso-01-manifiesto.test.ts` - baseline 380 → 383 + nota de docblock
- `el-templo-api/test/referral-partners/liquidacion.test.ts` (nuevo) - 6 tests
- `el-templo-api/test/referral-partners/reportes.test.ts` (nuevo) - 4 tests

## Decisions Made

Ver `key-decisions` en el frontmatter. La más relevante para quien retome:

1. **Orden explícito de rutas en el plugin**: `GET /conversions` y `GET /benefits-without-conversion` se declararon antes de `GET /:id` a propósito, con un test (`reportes.test.ts` (1)) que las ejercita ambas por HTTP real — no se confió únicamente en que find-my-way prioriza rutas estáticas.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug de test, no de producción] `settled_at` no es un objeto `Date` en filas leídas por `app.db.execute(sql\`...\`)`**

- **Encontrado durante:** Task 3, primer intento de `liquidacion.test.ts` test (2)
- **Problema:** `afterSecond[0]?.settled_at?.getTime()` lanzaba `TypeError: settled_at?.getTime is not a function` — el driver devuelve el campo `TIMESTAMP` en un shape que no expone `.getTime()` para esta lectura cruda.
- **Fix:** comparación directa con `toEqual(settledAtFirst)` en vez de `.getTime()` — sigue probando exactamente lo que el plan pedía (idempotencia: `settled_at` no cambia en la segunda llamada) sin depender del shape del driver.
- **Archivos:** `el-templo-api/test/referral-partners/liquidacion.test.ts`
- **Commit:** `0100ab15`

**2. [Rule 1 - Bug de test] Orden de limpieza del segundo gimnasio en 2 tests nuevos**

- **Encontrado durante:** Task 3, tests de aislamiento de tenant (liquidación y conversiones)
- **Problema:** ambos tests llamaban `limpiarSegundoGimnasio(app)` directo tras insertar un `referral_partners` que referencia `branches` del gimnasio 2, sin `cleanAllTestData(app)` antes — el `DELETE FROM branches` chocaba con el FK (`ER_ROW_IS_REFERENCED_2`), porque el fixture `second-tenant.ts` (fase 171) no conoce las tablas de partners (fase 179, posterior).
- **Fix:** se agregó `await cleanAllTestData(app);` antes de `limpiarSegundoGimnasio(app)` en los dos tests — es el orden documentado en el propio docblock de `second-tenant.ts` (`cleanAllTestData` vacía `referral_partners`/`partner_referrals` sin filtro de tenant, recién después se puede borrar el gimnasio 2 sin chocar contra el FK).
- **Archivos:** `el-templo-api/test/referral-partners/liquidacion.test.ts`, `el-templo-api/test/referral-partners/reportes.test.ts`
- **Commit:** `0100ab15`

**3. [Rule 1 - Trivial] El docblock de `listBenefitsWithoutConversion` mencionaba literalmente `users.lead_status`**

- **Encontrado durante:** verificación de la acceptance criteria del plan (`grep -c "lead_status\|leadStatus" service.ts` debe dar 0)
- **Problema:** el docblock explicaba, correctamente, que el método NO escribe `users.lead_status` — pero al nombrar la columna literalmente hacía que el grep mecánico de la acceptance criteria (pensado para atrapar una escritura real) diera un falso positivo.
- **Fix:** reescrito sin nombrar la columna, mismo significado ("no escribe ninguna columna de estado del funnel de leads v5.8").
- **Archivos:** `el-templo-api/src/modules/referral-partners/service.ts`
- **Commit:** `0100ab15`

## Issues Encountered

- El primer archivo de tests intentaba correr en background/con timeouts implícitos del tooling; se corrió siempre en foreground con `MAX_TEST_WORKERS=1` y `--hookTimeout=400000`, esperando la finalización real (sin `pgrep`/loops de polling agresivos) — ~110-125s por corrida completa del módulo, dominado por el provisioning por worker, no por los tests nuevos (300-700ms cada uno).

## User Setup Required

None - no requiere configuración de servicios externos.

## Next Phase Readiness

- La superficie de negocio del módulo queda cerrada: alta (179-05) → void/revocación (179-09) → liquidación batch + reportes (179-10, este plan). El backend de `referral-partners` está completo para que el admin (179-13/179-14) consuma las 3 rutas nuevas — shapes documentados arriba.
- Sin bloqueos.

---

_Phase: 179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p_
_Completed: 2026-08-23_

## Self-Check: PASSED

- FOUND: `el-templo-api/src/modules/referral-partners/service.ts` (settlePendingCommissions, listConversions, listBenefitsWithoutConversion)
- FOUND: `el-templo-api/src/modules/referral-partners/admin-routes.ts` (GET /conversions, GET /benefits-without-conversion, POST /:id/settle)
- FOUND: `el-templo-api/src/modules/referral-partners/schemas.ts` (listConversionsQuerySchema, listBenefitsWithoutConversionQuerySchema, settlePartnerCommissionsParamsSchema)
- FOUND: `el-templo-api/src/modules/referral-partners/types.ts` (ConversionRow, BenefitWithoutConversionRow)
- FOUND: `el-templo-api/test/referral-partners/liquidacion.test.ts`
- FOUND: `el-templo-api/test/referral-partners/reportes.test.ts`
- FOUND: commit `6cd77142` (Task 1)
- FOUND: commit `af68ceaa` (Task 2)
- FOUND: commit `0100ab15` (Task 3)
- `git -C /home/franco/projects/et-179 status --porcelain` limpio
- `pnpm --dir /home/franco/projects/et-179/el-templo-api exec tsc --noEmit`: 0 errores
- `pnpm --dir /home/franco/projects/et-179/el-templo-api lint:tenant`: DISCREPANCIAS: 0
- `vitest run test/referral-partners test/tenancy --no-watch`: 23/23 archivos, 245/245 tests verdes (incluye los 2 archivos nuevos de Task 3, 10 tests)
- `.planning/STATE.md` y `.planning/ROADMAP.md` sin tocar
