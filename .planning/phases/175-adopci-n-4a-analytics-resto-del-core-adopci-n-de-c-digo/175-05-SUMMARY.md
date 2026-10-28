---
phase: 175-adopci-n-4a-analytics-resto-del-core-adopci-n-de-c-digo
plan: 05
subsystem: api
tags: [tenancy, wellhub, drizzle, tenant-lint, sentinel]

requires:
  - phase: 174.1-adopci-n-3a
    provides: bookings/subscriptions ya strict (TENANT_STRICT_MODULES)
provides:
  - wellhub/service.ts checkin flow (attendance) scopeado por tenant con ctx real
  - wellhub_bookings scopeado donde hay ctx resuelto; lookups pre-scope (eventId/bookingNumber) con exención tenant-safe real (embebida en SQL, no solo comentario TS)
  - wellhub/sync-service.ts (wellhub_classes/wellhub_slots) scopeado por tenant; crons/reconciliación anotados
  - fix de un bug pre-existente en expireDeadPendings: la exención "tenant-safe" solo vivía como comentario TS, invisible al sentinel de runtime sobre bookings (ya strict) — ahora está también embebida en el fragmento sql
affects: [175.1-switch-strict-wellhub]

tech-stack:
  added: []
  patterns:
    - "Exención tenant-safe real = comentario TS (ancla el lint estático) + el MISMO tag EMBEBIDO dentro de un fragmento sql (lo que ve el sentinel de runtime) — un comentario TS solo no alcanza si la tabla ya es strict."
    - "ctx derivado de una fila ya leída (anchor derivado): pushSlotOccupancy deriva TenantContext de branches.tenantId tras el JOIN, sin necesitar ctx en el call path del bus de eventos."

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/wellhub/service.ts
    - el-templo-api/src/modules/wellhub/sync-service.ts
    - el-templo-api/tenant-lint-allowlist.json

key-decisions:
  - "Los 7 entries de wellhub en tenant-lint-allowlist.json se removieron TODOS (no solo los que quedaron 100% compliant): las tablas que siguen con excepciones pre-scope legítimas (M8: eventId/bookingNumber/gympass_id, crons cross-tenant) ya no necesitan la entrada porque D-14 solo cuenta como 'live' un acceso sin exención real — con exención embebida, sale del allowlist y pasa a la cuenta de exenciones (D-12), mismo patrón que 175-01/02/03 dejaron para campaigns/notifications."
  - "pushSlotOccupancy (sin ctx, disparado por el bus de occupancy-events) no threadea ctx desde el caller: deriva un TenantContext real de branches.tenantId leído en el mismo JOIN, y usa ese ctx para el UPDATE final — más seguro que dejarlo como exención pura, porque el UPDATE sí queda scopeado de verdad."

requirements-completed: [ADO-06]

duration: ~50min
completed: 2026-08-14
---

# Phase 175 Plan 05: Wellhub tenancy adoption Summary

**Checkin flow (attendance) y wellhub_bookings/classes/slots de wellhub scopeados con tenantWhere/tenantValues; se corrigió además un bug real donde una exención "tenant-safe" solo vivía como comentario TS y el sentinel de runtime la ignoraba sobre `bookings` (ya strict), tirando TenantSentinelError en `expireDeadPendings`.**

## Performance

- **Duration:** ~50 min
- **Tasks:** 3 (2 commits de código — Task 3 no generó cambios propios, ver abajo)
- **Files modified:** 3 (`wellhub/service.ts`, `wellhub/sync-service.ts`, `tenant-lint-allowlist.json`)

## Accomplishments

- `wellhub/service.ts`: `attendance` (existingToday, recheck dentro de la tx, insert) scopeado con `tenantWhere`/`tenantValues` usando el `ctx` ya resuelto por `resolverTenant` — igual que `bookings` del mismo bloque.
- `wellhub_bookings`: lookup/update por `bookingNumber` y update por PK en `handleBookingRequested`/`handleBookingCanceled` pasan a `tenantWhere` donde `ctx` ya está resuelto; el INSERT pasa a `tenantValues`.
- Pre-scope M8 (`eventId` de `wellhub_events`, `bookingNumber` en `handleBookingCanceled`) quedan con exención `tenant-safe` REAL: comentario TS (ancla el lint estático) + el mismo tag embebido en el fragmento `sql` (lo que ve el sentinel de runtime), siguiendo el molde de `gympass_id`.
- `wellhub/sync-service.ts`: `wellhub_classes`/`wellhub_slots` scopeados con `tenantWhere`/`tenantValues` en `ensureClasses`/`syncSlots` (ctx derivado de `branch.tenantId`, threadeado desde `syncAllBranches`).
- `syncAllBranches` (SELECT `branches` cross-tenant por diseño) y `expireDeadPendings` (reconciliación de pendings, cross-tenant por diseño) quedan anotados `tenant-safe`.
- **Bug real corregido:** `expireDeadPendings` ya tenía comentarios TS de exención `tenant-safe` (174.1-05) pero NUNCA los tuvo embebidos en el SQL — como `bookings` es tabla STRICT desde 173/174, el sentinel de runtime tiraba `TenantSentinelError` en cada corrida real (test/dev). Se agregó el tag embebido en los 3 accesos a `bookings`/`wellhub_bookings` de ese método, siguiendo el molde exacto de `subscriptions/service.ts#autoExpireDueSubscriptions` (174-06).
- `pushSlotOccupancy` (sin ctx, disparado por el bus de occupancy-events): se agregó `branches.tenantId` al SELECT ya existente y se deriva un `TenantContext` real para el UPDATE final, en vez de dejarlo como exención pura.
- `tenant-lint-allowlist.json`: las 7 entradas de wellhub (`service.ts`: attendance/wellhub_bookings/wellhub_events; `sync-service.ts`: branches/wellhub_bookings/wellhub_classes/wellhub_slots) se removieron. Allowlist: 181 → 174.

## Task Commits

1. **Task 1: Scopear el checkin flow de wellhub/service.ts** - `48d1c703` (feat) — incluye las 3 entradas de allowlist de `service.ts`.
2. **Task 2: Scopear wellhub_classes/wellhub_slots y anotar crons en sync-service.ts** - `fbe94ee6` (feat) — incluye las 4 entradas de allowlist de `sync-service.ts` + el fix del bug de `expireDeadPendings`.
3. **Task 3: Remover del allowlist las entradas de wellhub y verificar el gate** - sin commit propio: las 7 entradas ya quedaron removidas en los commits de Task 1/2 (D-14, "migrar código y achicar la allowlist son el mismo acto"). Verificación final: `pnpm lint:tenant` → `DISCREPANCIAS: 0` sobre el HEAD `fbe94ee6`.

**Plan metadata:** (no se commitea desde este worktree — el orquestador commitea el SUMMARY en la docs branch)

## Files Created/Modified

- `el-templo-api/src/modules/wellhub/service.ts` - checkin flow (attendance) + wellhub_bookings scopeados; eventId/bookingNumber M8 con exención real embebida.
- `el-templo-api/src/modules/wellhub/sync-service.ts` - wellhub_classes/wellhub_slots scopeados; crons/reconciliación anotados; fix del bug de exención no-embebida en expireDeadPendings.
- `el-templo-api/tenant-lint-allowlist.json` - remueve las 7 entradas de wellhub (181 → 174).

## Decisions Made

- Remover TODAS las entradas de allowlist de wellhub, no solo las que quedaron 100% `tenantWhere`-compliant: una vez que un acceso pre-scope tiene su exención `tenant-safe` REAL (comentario TS + tag embebido en SQL), D-14 del lint ya no lo cuenta como debt "vivo" en el sentido que justifique una entrada de allowlist — pasa a la cuenta de exenciones (D-12), igual que 175-01/02/03 dejaron campaigns/notifications sin entradas propias.
- `pushSlotOccupancy` deriva `ctx` real de `branches.tenantId` (ya estaba en el JOIN, solo faltaba proyectarlo) en vez de dejar el UPDATE final como exención pura — más seguro y más simple que inventar un mecanismo de threading de ctx a través del bus de eventos.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Exención `tenant-safe` de `expireDeadPendings` no era efectiva en runtime**

- **Found during:** Task 2 (verificación con `test/wellhub`)
- **Issue:** `expireDeadPendings` (barrido cross-tenant de pendings Wellhub) tenía comentarios TS `/* tenant-safe: ... */` desde la fase 174.1-05, pero NUNCA repetía el tag EMBEBIDO dentro de un fragmento `sql`. El sentinel de runtime (`src/db/sentinel/install.ts`) solo lee el texto SQL final enviado a MySQL — nunca comentarios de fuente TS. Como `bookings` (y desde este plan también sería el caso de otras) es tabla STRICT desde 173/174, cada corrida real de `expireDeadPendings` tiraba `TenantSentinelError` al leer/actualizar `bookings` por PK, y el error se absorbía silenciosamente en `forEachActiveTenant` (aísla errores por tenant, D-03) — `runWellhubSync` devolvía `null` en vez de un summary con `pendingsExpired: 1`.
- **Fix:** Se agregó el mismo tag `tenant-safe` EMBEBIDO en un fragmento `sql` en los 3 accesos de `expireDeadPendings` sobre `bookings`/`wellhub_bookings` (SELECT `dead`, SELECT/UPDATE `booking` por `row.bookingId`/`booking.id`, UPDATE final `wellhub_bookings` por `row.id`), siguiendo el molde exacto de `subscriptions/service.ts#autoExpireDueSubscriptions` (174-06): comentario TS ancla el lint estático, tag embebido en `sql` satisface el sentinel de runtime.
- **Files modified:** `el-templo-api/src/modules/wellhub/sync-service.ts`
- **Verification:** Antes del fix, `test/wellhub/webhook-booking.test.ts > runWellhubSync expira solicitudes pending muertas y libera el cupo` fallaba con `AssertionError: expected undefined to be 1` (síntoma indirecto del `TenantSentinelError` absorbido). Después del fix, el log muestra `"pendingsExpired":1` y el summary llega completo — el test avanza hasta su propia aserción final (que sí es D6 pre-existente, ver abajo).
- **Committed in:** `fbe94ee6` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug real de exención no-efectiva en runtime, pre-existente desde 174.1-05, expuesto por la verificación de este plan).
**Impact on plan:** El fix es exactamente el mismo idioma que el resto del plan (M8/cron cross-tenant con exención embebida) aplicado a un método que ya tenía la intención documentada pero no la implementación efectiva. Sin scope creep — mismo archivo, mismo método que el plan ya listaba como target (interfaces :636/653/666).

## Issues Encountered

Ninguno bloqueante. Ver "Known pre-existing test failures" abajo — documentado, no corregido (fuera de scope explícito de este plan).

## Known pre-existing test failures (D6, NO corregidas)

`pnpm exec vitest run --no-file-parallelism test/wellhub` corre 29 tests: **24 passed, 5 failed** (consistente en 2 corridas). Los 5 fallos son **100% código de TEST** (aserciones propias de los archivos de test, NO del código de `service.ts`/`sync-service.ts` que este plan tocó) — todos son `TenantSentinelError` porque el test lee `bookings`/`subscriptions` (tablas ya STRICT desde 173/174) con `.select()`/`.where(eq(...))` crudo, sin `tenantWhere`. Coincide exactamente con la categoría D6 anticipada en las instrucciones ("rojos pre-existentes por helpers de fixture con SQL crudo sobre tablas ya strict subscriptions/bookings, desde 174.1 — verdes en el suite completo"):

1. `webhook-booking.test.ts > booking-requested feliz...` — falla en `test/wellhub/webhook-booking.test.ts:358` (`app.db.select().from(schema.bookings).where(eq(schema.bookings.memberId, ...))`, sin ctx).
2. `webhook-booking.test.ts > booking-canceled cancela el booking...` — falla en `:514` (mismo patrón sobre `bookings`).
3. `webhook-booking.test.ts > checkin de un visitante con reserva de HOY...` — falla en `:632` (mismo patrón sobre `bookings`).
4. `webhook-booking.test.ts > runWellhubSync expira solicitudes pending muertas...` — falla en `:886` (mismo patrón sobre `bookings`; ANTES del fix de Rule 1 fallaba antes, en la aserción de `summary?.pendingsExpired`, con el `TenantSentinelError` absorbido más arriba en la cadena — el fix de este plan hizo que el test avance más lejos, hasta esta aserción propia que sigue siendo D6).
5. `webhook-checkin.test.ts > checkin feliz...` — falla en `:322` (`app.db.select().from(schema.subscriptions)` sin ctx).

Ninguno de los 5 traza a `wellhub/service.ts` ni `wellhub/sync-service.ts` (los 2 archivos de código de este plan) — todos son líneas propias de los archivos `test/wellhub/*.test.ts`, que quedaron sin tocar (`git status` lo confirma). No se modificaron por estar fuera de scope de este plan (fixtures de test, no código de wellhub).

## User Setup Required

None.

## Next Phase Readiness

- `wellhub` (checkin flow, wellhub_bookings/classes/slots, crons de sync) queda con el patrón de tenancy completo: `tenantWhere`/`tenantValues` donde hay ctx, exención `tenant-safe` real (comentario TS + tag embebido) donde es pre-scope M8 o barrido cross-tenant genuino.
- `tenant-lint-allowlist.json` sin deuda de wellhub (0 entradas).
- El switch a `TENANT_STRICT_MODULES` para wellhub queda para 175.1 (fuera de scope de este plan, tal como especifica 175-CONTEXT.md).
- Los 5 fallos D6 de `test/wellhub` (fixtures de test sobre `bookings`/`subscriptions` ya strict) quedan como deuda de test-infra pre-existente desde 174.1 — no bloquean este plan, pero conviene que algún plan de limpieza de fixtures los cierre antes del switch de 175.1 (para que `test/wellhub` sea confiable en corridas parciales).

---

_Phase: 175-adopci-n-4a-analytics-resto-del-core-adopci-n-de-c-digo_
_Completed: 2026-08-14_
