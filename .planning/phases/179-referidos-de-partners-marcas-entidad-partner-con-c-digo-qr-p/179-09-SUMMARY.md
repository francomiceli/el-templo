---
phase: 179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p
plan: 09
subsystem: api
tags: [fastify, drizzle, tenancy, referral-partners, finance, transactions]

# Dependency graph
requires:
  - phase: 179-05
    provides: "qualifyAndCommission (flip idempotente + comisión con onDuplicateKeyUpdate por subscription_id), PartnerReferralService constructor DI"
provides:
  - "voidPendingCommissionsForSubscription(runner, ctx, subscriptionId, reason): void guardado por status='pending', acepta DbInstance|TxHandle para correr dentro de la tx del void del cobro (D-14)"
  - "revokePartnerLink(ctx, referredId, revokedBy): vínculo -> revoked + void en cascada de TODAS sus comisiones pending, filtrado por partner_referral_id"
  - "assignPartnerToMember: asignación retroactiva de partner (D-15), espejo de assignReferrerToMember con 404/409 visibles"
  - "Cascada en TransactionService._void: el subLink de suscripción se resuelve SIEMPRE (no solo con keepMembershipActive=false) y dispara el void de comisiones dentro de la MISMA tx, sin try/catch (atomicidad, T-179-36)"
  - "POST y DELETE /api/admin/members/:userId/partner-referral (retroactiva + revocación), manifiesto ISO-01 actualizado (376 -> 378)"
  - "14 tests de integración contra MySQL real (4 void-comisiones + 10 admin-assign-partner)"
affects: [179-14]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El void de comisiones en cascada corre DENTRO de la tx del void del cobro SIN try/catch — a diferencia del best-effort de qualifyPartnerOnCharge (subscriptions/service.ts). Se sigue la convención del resto de _void (applyDelta/_cancelSubscription/auditLog.write tampoco atrapan): un fallo hace rollback de TODO el void junto, en vez de dejar el cobro anulado con una comisión viva (T-179-36)."
    - "voidPendingCommissionsForSubscription se filtra por subscription_id (un cargo puntual); revokePartnerLink se filtra por partner_referral_id (TODO el vínculo) — mismo verbo de UPDATE guardado, distinta clave según el disparador."
    - "assignPartnerToMember es espejo estructural de assignReferrerToMember (fase 173) pero con 404/409 VISIBLES en vez de degradación silenciosa: la retroactiva ES la operación, un partner inválido o un doble origen no pueden fallar en silencio."
key-files:
  created:
    - el-templo-api/test/referral-partners/void-comisiones.test.ts
    - el-templo-api/test/referral-partners/admin-assign-partner.test.ts
  modified:
    - el-templo-api/src/modules/referral-partners/service.ts
    - el-templo-api/src/modules/finance/transaction-service.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/src/modules/referral-partners/schemas.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts

key-decisions:
  - "revokePartnerLink voidea por partner_referral_id, no por subscription_id: el vínculo entero pierde vigencia, no un cargo puntual — distinto de voidPendingCommissionsForSubscription, que la cascada del void de un cobro solo conoce el subscriptionId."
  - "El void en cascada de transaction-service.ts corre SIEMPRE que haya un subLink de suscripción, independientemente de keepMembershipActive: la membresía puede seguir activa (anulación por corrección de medio de pago) pero ese cobro puntual ya no confirmó la venta."
  - "Sin try/catch en el void en cascada dentro de _void (a diferencia de subscriptions/service.ts): la atomicidad es la garantía que pide T-179-36 — un fallo debe abortar TODO el void, no dejar una comisión viva colgando de un cobro ya anulado."

requirements-completed: [D-12, D-14, D-15]

# Metrics
duration: ~55min
completed: 2026-08-23
---

# Phase 179 Plan 09: Ciclo de vida de la comisión — void en cascada y asignación retroactiva de partner Summary

**Void automático de comisiones `pending` al anular el cobro (dentro de la misma tx, sin try/catch) o al revocar el vínculo del socio, más asignación retroactiva de partner desde la ficha del alumno con 404/409 visibles y comisión inmediata si el socio ya pagó.**

## Performance

- **Duration:** ~55 min (dominado por las corridas de vitest con `MAX_TEST_WORKERS=1`, secuenciales por diseño para no correr contra la DB compartida)
- **Tasks:** 3/3
- **Files modified:** 6 (4 modificados en src/test-infra, 2 tests nuevos)

## Accomplishments

- `PartnerReferralService.voidPendingCommissionsForSubscription(runner, ctx, subscriptionId, reason)`: UPDATE guardado (`status='pending'` en su propia cláusula WHERE) a `status='void'` + `voidedAt` + `voidReason`. Acepta `DbInstance | TxHandle` para poder correr dentro de la transacción ajena del void del cobro. Las `settled` quedan afuera por construcción (D-14, histórico).
- `PartnerReferralService.revokePartnerLink(ctx, referredId, revokedBy)`: `NotFoundError` si el socio no tiene vínculo; pasa el vínculo a `status='revoked'` y voidea TODAS sus comisiones `pending` (filtro por `partner_referral_id`, no por `subscription_id` — el vínculo entero pierde vigencia). Devuelve `{ voidedCommissions: number }`.
- `PartnerReferralService.assignPartnerToMember`: espejo estructural de `assignReferrerToMember` (fase 173). 404 si el partner no existe/está inactivo/es de otro tenant; 409 (D-12) si `findOriginForMember` ya tiene un origen (mensaje distingue socio vs. partner); mismo umbral que el cobro (`pricePaid > 0` acotado al tenant) para nacer `qualified` con `qualifiedAt = new Date()` (nunca la fecha del pago viejo); comisión inmediata sobre la suscripción pagada más reciente con el mismo INSERT idempotente (`onDuplicateKeyUpdate` por `subscription_id`); catch de `ER_DUP_ENTRY` → `ConflictError` (carrera de dos admins).
- `TransactionService._void` (finance/transaction-service.ts): el `subLink` de suscripción ahora se resuelve **siempre** (antes solo dentro del bloque `keepMembershipActive === false`), y el void de comisiones corre en esa misma transacción, derivando el tenant por lectura-por-PK de la suscripción (`tenant-safe`, DENY con `log.warn` si no resuelve). **Deliberadamente sin try/catch**, a diferencia del best-effort de `qualifyPartnerOnCharge`: sigue la convención del resto de `_void` (nada ahí atrapa errores) para que un fallo haga rollback de TODO el void, no que deje una comisión viva colgando de un cobro anulado (mitigación de T-179-36).
- Rutas admin en `members/routes.ts`, calcadas de `POST /:userId/referrals`: `POST /api/admin/members/:userId/partner-referral` (201, body `{partnerId}`) y `DELETE /api/admin/members/:userId/partner-referral` (200). Mismo guard (`assertReferralTargetInScope`, `MEMBER_LIFECYCLE_ROLES`, `assertTenant`, `handleServiceError`).
- Manifiesto ISO-01: 2 entradas nuevas tenant-scoped, `ENTRADAS_BASELINE` 376 → 378, docblock actualizado con la nota del bump.
- 14 tests de integración contra MySQL real, 0 regresiones en el resto de la suite tocada.

## Task Commits

Cada task se commiteó atómicamente en el worktree `et-179` (rama `feat/179-referidos-partners`):

1. **Task 1: Métodos de void y de asignación retroactiva en el servicio** - `b263a0ea` (feat)
2. **Task 2: Cascada en voidInTx + rutas admin de la retroactiva y la revocación + manifiesto** - `1569a9b1` (feat)
3. **Task 3: Tests de void en cascada y de asignación retroactiva** - `fa94a6e7` (test)

Commit adicional (comentario, sin cambio de comportamiento — aclara que `voidPendingCommissionsForSubscription` opera sobre la tabla `partnerCommissions`): `05e8c5cf` (docs)

_Nota: el commit de metadatos de docs (STATE/ROADMAP/SUMMARY) lo maneja el orquestador, no este ejecutor — y en este caso explícitamente lo dejo fuera de mi alcance por instrucción del prompt._

## Response shape de las 2 rutas nuevas (para 179-14, admin las consume)

**`POST /api/admin/members/:userId/partner-referral`** — body `{ partnerId: integer }`, 201:

```json
{
  "status": "pending" | "qualified",
  "partnerId": number,
  "referredId": number,
  "commissionId": number | null
}
```

`commissionId` es `null` cuando nace `pending`, o cuando nace `qualified` pero el partner tiene `commissionType='none'`/`commissionValue<=0`.

**`DELETE /api/admin/members/:userId/partner-referral`** — sin body, 200:

```json
{ "voidedCommissions": number }
```

Errores (ambas rutas): 404 `NotFoundError` (partner inexistente/inactivo/otro tenant en el POST; socio sin vínculo en el DELETE; socio de otro país para un admin no-owner), 409 `ConflictError` (doble origen en el POST), 403 (rol fuera de `MEMBER_LIFECYCLE_ROLES`), 401 (sin token). Shape estándar de `handleServiceError`: `{ error: string, message: string }`.

## Files Created/Modified

- `el-templo-api/src/modules/referral-partners/service.ts` - `voidPendingCommissionsForSubscription`, `revokePartnerLink`, `assignPartnerToMember` (+265 líneas)
- `el-templo-api/src/modules/finance/transaction-service.ts` - `_void` resuelve el `subLink` siempre y cuelga el void en cascada de comisiones, sin try/catch
- `el-templo-api/src/modules/members/routes.ts` - rutas `POST`/`DELETE /:userId/partner-referral`
- `el-templo-api/src/modules/referral-partners/schemas.ts` - `assignPartnerToMemberBodySchema`
- `el-templo-api/test/tenant-manifest.ts` - 2 entradas nuevas tenant-scoped
- `el-templo-api/test/tenancy/iso-01-manifiesto.test.ts` - baseline 376 → 378 + nota de docblock
- `el-templo-api/test/referral-partners/void-comisiones.test.ts` (nuevo) - 4 tests
- `el-templo-api/test/referral-partners/admin-assign-partner.test.ts` (nuevo) - 10 tests

## Decisions Made

Ver `key-decisions` en el frontmatter. Las dos más relevantes:

1. **Clave de void distinta según el disparador**: `voidPendingCommissionsForSubscription` filtra por `subscription_id` (la cascada del void de un cobro solo conoce ese id), mientras que `revokePartnerLink` filtra por `partner_referral_id` (el vínculo entero pierde vigencia, no un cargo puntual). Mismo verbo de UPDATE guardado, distinta clave.

2. **Sin try/catch en la cascada de `_void`**: se evaluó explícitamente (el plan lo dejaba a criterio, "sólo si eso no compromete la atomicidad") y se decidió NO envolver en try/catch, a diferencia del best-effort de `qualifyPartnerOnCharge`. Razón: el resto de `_void` (`applyDelta`, `_cancelSubscription`, `auditLog.write`) tampoco atrapa errores — es un primitivo atómico por diseño. Envolver el void de comisiones en un catch hubiera significado que un fallo ahí deja el cobro anulado con una comisión `pending` viva, exactamente el escenario que T-179-36 mitiga.

## Deviations from Plan

None - plan ejecutado tal como estaba escrito. Único ajuste menor: un test inicial (`(2) socio con un pago previo...`) comparaba `qualified_at` leído por SQL crudo contra `Date.now()` del proceso de test, lo que resultó frágil por un offset de timezone entre el driver de lectura cruda y el proceso Node (diferencia de ~3h, no relacionado con el código de producción). Se ajustó la aserción para comparar contra la fecha vieja del pago (`oldDate`, nunca leída de vuelta de la base) en vez de contra `Date.now()` — sigue probando exactamente lo que el plan pedía ("qualified_at es reciente y no coincide con la fecha del pago viejo") sin depender de un offset de timezone del driver.

## Issues Encountered

- El primer intento de `seedPlan` en `admin-assign-partner.test.ts` insertaba `planCategory: "regular"` directo con Drizzle, que no es un valor válido del enum físico de la columna (`Data truncated for column 'plan_category'`) — se reemplazó por `createPlan(app, adminToken, {...})` (helper que pasa por la API admin, que sí resuelve la categoría correctamente), mismo patrón que el resto de los tests del módulo.
- La corrida completa de verificación (`test/referral-partners test/finance test/members test/tenancy`, 49 archivos / 731 tests) tomó ~11 minutos totales en 2 tandas con `MAX_TEST_WORKERS=1` (foreground, sin `run_in_background`/`pgrep`) — dominado por el provisioning por worker (~1-2s a ~90s según el archivo), no por lentitud de los tests nuevos en sí (cada test individual corrió en 300-600ms).

## User Setup Required

None - no requiere configuración de servicios externos.

## Next Phase Readiness

- El ciclo de vida completo de la comisión de partner queda cerrado: alta (179-05) → void por anulación o revocación (179-09) → falta liquidación batch (179-10, D-16, no cubierta por este plan).
- Las 2 rutas nuevas (`POST`/`DELETE /api/admin/members/:userId/partner-referral`) están listas para que 179-14 (UI del admin, tab de la ficha del alumno) las consuma — shape de respuesta documentado arriba.
- Sin bloqueos.

---

_Phase: 179-referidos-de-partners-marcas-entidad-partner-con-c-digo-qr-p_
_Completed: 2026-08-23_

## Self-Check: PASSED

- FOUND: `el-templo-api/src/modules/referral-partners/service.ts` (voidPendingCommissionsForSubscription, revokePartnerLink, assignPartnerToMember)
- FOUND: `el-templo-api/src/modules/finance/transaction-service.ts` (cascada en `_void`)
- FOUND: `el-templo-api/src/modules/members/routes.ts` (POST/DELETE `:userId/partner-referral`)
- FOUND: `el-templo-api/test/referral-partners/void-comisiones.test.ts`
- FOUND: `el-templo-api/test/referral-partners/admin-assign-partner.test.ts`
- FOUND: commit `b263a0ea` (Task 1)
- FOUND: commit `1569a9b1` (Task 2)
- FOUND: commit `fa94a6e7` (Task 3)
- FOUND: commit `05e8c5cf` (docs, comentario post-Task 2)
- `git -C /home/franco/projects/et-179 status --porcelain` limpio
- `pnpm --dir /home/franco/projects/et-179/el-templo-api exec tsc --noEmit`: 0 errores
- `pnpm --dir /home/franco/projects/et-179/el-templo-api lint:tenant`: DISCREPANCIAS: 0
- `vitest run test/referral-partners test/finance --no-watch`: 31/31 archivos, 438/438 tests verdes (incluye los 2 archivos nuevos de Task 3)
- `vitest run test/members test/tenancy --no-watch`: 18/18 archivos, 293/293 tests verdes
- Total combinado sin duplicados: 49 archivos únicos, 0 fallidos en las 3 corridas de verificación
- `.planning/STATE.md` y `.planning/ROADMAP.md` sin tocar
