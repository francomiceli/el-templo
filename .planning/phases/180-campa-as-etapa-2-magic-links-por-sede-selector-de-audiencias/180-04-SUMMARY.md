---
phase: 180-campa-as-etapa-2-magic-links-por-sede-selector-de-audiencias
plan: 04
subsystem: campaigns
tags: [campaigns, audience, tenancy, mysql-migration, vitest]
status: completed

# Dependency graph
requires:
  - phase: 180-01
    provides: "Worktree et-180 con node_modules + .env local operativos"
provides:
  - "campaigns.segment (varchar(32), default 'freemium_elegibles') + migración 0210"
  - "AudienceService.resolveAudience/countAudience parametrizado por los 5 segmentos de D-12"
  - "CAMPAIGN_SEGMENTS/CampaignSegment (campaigns/types.ts) — lista cerrada, nunca interpolada en SQL"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dispatcher cerrado segmento->condiciones (Record<CampaignSegment, () => SQL[]>) — el segmento nunca se interpola en un sql template, un valor desconocido lanza BadRequestError antes de correr query"
    - "El lint de tenancy (CON-06) juzga por STATEMENT: tenantWhere(u, ctx) tiene que aparecer literal en el MISMO .where(...) que hace .from(u), no detrás de una función que lo devuelve ya compuesto — buildConditions() devuelve solo el array de negocio, nunca el and(tenantWhere...) final"
    - "countAudience usa COUNT(*) en SQL sobre el mismo where que resolveAudience, nunca .length (Pitfall 8 / T-180-17)"

key-files:
  created:
    - el-templo-api/src/db/migrations/0210_campaigns_segment.sql
    - el-templo-api/src/modules/campaigns/audience-service.ts
  modified:
    - el-templo-api/src/db/schema/campaigns.ts
    - el-templo-api/src/modules/campaigns/types.ts
    - el-templo-api/src/modules/campaigns/service.ts
    - el-templo-api/test/campaigns-audience.test.ts

key-decisions:
  - "Número de migración: 0210 (Task 1, checkpoint humano resuelto por el orquestador antes de este agente — aprobado explícito 'aprobado 0210'). Más alta en el worktree local era 0209."
  - "CampaignService.listEligible() se conserva como facade que delega en AudienceService.resolveAudience(ctx, 'freemium_elegibles', country) — cero llamadores rotos, docblock original movido/adaptado a freemiumElegiblesConditions()"
  - "buildConditions() (privado de AudienceService) devuelve SOLO el array de condiciones de negocio, NUNCA compone tenantWhere — el and(tenantWhere(u, ctx), ...conditions) va inline y literal en cada uno de los dos call sites (resolveAudience/countAudience) porque el lint de tenancy analiza el statement, no el valor de retorno de una función auxiliar (ver Deviations)"
  - "Exenciones tenant-safe una por función-de-condiciones (globalInvariants, freemiumElegiblesConditions, bajasConditions, etc.), pegadas al `return [...]` completo — mismo patrón que el `const conditions = [...]` original de service.ts, en vez de una exención por cada línea sql individual"

requirements-completed: [AUD-01, AUD-02]

# Metrics
duration: ~70min
completed: 2026-08-23
---

# Fase 180 Plan 04: Columna `campaigns.segment` + `AudienceService` con los 5 segmentos Summary

**`campaigns` ahora persiste a qué segmento le habla (mig 0210) y un `AudienceService` nuevo resuelve/cuenta los 5 segmentos de D-12 (freemium_elegibles, bajas, prueba_no_convertida, alerta_ausente, referidos_pendientes) con tenancy correcta y `COUNT(*)` real para el preview.**

## Performance

- **Duration:** ~70 min (Tasks 2, 3 y 4; el Task 1 —checkpoint del número de migración— fue resuelto por el orquestador antes de este agente)
- **Completed:** 2026-08-23
- **Tasks:** 3/3 ejecutados (Task 1 ya venía resuelto)
- **Files modified:** 6 (2 nuevos, 4 modificados)

## Accomplishments

- `campaigns.segment` (varchar(32), soft-enum, default `'freemium_elegibles'`) + migración `0210_campaigns_segment.sql` aplicada localmente y verificada físicamente (`DESCRIBE campaigns` muestra la columna; `_migrations` la registra).
- `AudienceService` (`audience-service.ts`, 316 líneas) con `resolveAudience`/`countAudience` parametrizados por los 5 segmentos:
  - `freemium_elegibles` — movido tal cual desde `CampaignService.listEligible` (diff cero de criterio).
  - `bajas` — `status='inactivo'` + al menos una suscripción `price_type_applied<>'zero'` (D-22).
  - `prueba_no_convertida` — booking `is_trial` en `confirmado`/`qr_escaneado`/`no_show` y ninguna suscripción.
  - `alerta_ausente` — `member_profiles.segment IN ('alerta','ausente')`.
  - `referidos_pendientes` — `referrals.status='pending'` (con la regla de frescura D-10, igual que freemium).
- Las invariantes D-15 (email no nulo + `NOT EXISTS` de `campaign_unsubscribes` con su propio `tenantId`, mina M3) se componen UNA vez en `globalInvariants()` y se aplican a los 5.
- `countAudience` usa `COUNT(*)` en SQL — nunca `.length` — sobre el mismo `where` que `resolveAudience` (Pitfall 8 / T-180-17).
- `segment` es clave de un `Record<CampaignSegment, ...>` cerrado, nunca interpolado en un `sql` template; un valor desconocido lanza `BadRequestError` (T-180-14, con test).
- `CampaignService.listEligible(ctx, country)` se conserva como facade delegando en `AudienceService.resolveAudience(ctx, 'freemium_elegibles', country)` — ningún llamador existente se rompió.
- Batería `campaigns-audience.test.ts` extendida de 7 a 27 tests: un caso incluido + uno excluido por cada uno de los 4 segmentos nuevos, el D-22 explícito, las invariantes D-15 sobre `bajas`/`referidos_pendientes`, `countAudience === resolveAudience(...).length` para los 5 segmentos, y el segmento desconocido lanzando `BadRequestError`.

## Task Commits

Ejecutados dentro del worktree `/home/franco/projects/et-180` (rama `feat/180-campanas-etapa-2`):

1. **Task 2: Columna `campaigns.segment` + migración 0210** - `376e7942` (feat)
2. **Task 3: `AudienceService` con los 5 segmentos de D-12** - `f856f423` (feat)
3. **Task 4: Batería de audiencia extendida a los 5 segmentos** - `4e73c362` (test)

**Plan metadata:** pendiente — este SUMMARY se escribe en el checkout principal y NO se commitea (lo commitea el orquestador junto con STATE.md/ROADMAP.md).

## Files Created/Modified

- `el-templo-api/src/db/migrations/0210_campaigns_segment.sql` (nuevo) - `ALTER TABLE campaigns ADD COLUMN segment VARCHAR(32) NOT NULL DEFAULT 'freemium_elegibles'`
- `el-templo-api/src/db/schema/campaigns.ts` - columna `segment` en la tabla `campaigns`, soft-enum varchar (misma convención que `status`/`country`)
- `el-templo-api/src/modules/campaigns/types.ts` - `CAMPAIGN_SEGMENTS`/`CampaignSegment` (lista cerrada, hogar de los tipos públicos del módulo)
- `el-templo-api/src/modules/campaigns/audience-service.ts` (nuevo) - `AudienceService` completo: `globalInvariants`, `FRESHNESS`, 5 funciones de condiciones por segmento, `SEGMENT_BUILDERS` (dispatcher cerrado), `resolveAudience`/`countAudience`
- `el-templo-api/src/modules/campaigns/service.ts` - `listEligible` reescrito como facade sobre `AudienceService`
- `el-templo-api/test/campaigns-audience.test.ts` - 7 `describe` (1 original + 6 nuevos), 27 tests (baseline 7)

## Decisions Made

- **Migración 0210 confirmada:** el checkpoint humano del Task 1 (resuelto antes de este agente) aprobó explícitamente `0210` — verificado de nuevo al arrancar este agente (`ls .../migrations/*.sql | sort | tail -5` mostraba `0209` como techo local).
- **`buildConditions()` NO arma el `and(tenantWhere(...), ...)` final:** el diseño original (un `buildWhere` privado devolviendo el `where` compuesto, usado como `.where(where)` en ambos métodos públicos) pasó `tsc` pero **rompió `pnpm lint:tenant`** con 19 discrepancias (`users`, `subscriptions`, `bookings`, `branches`, `member_profiles`, `referrals` sin exención reconocida). El lint de tenancy (`CON-06`) analiza el TEXTO LITERAL del statement que contiene el acceso a la tabla — un `tenantWhere(u, ctx)` llamado dentro de OTRO método, referenciado después como variable (`where`), no cuenta como presente en el statement `.select()...from()...where(where)`. Se corrigió separando la responsabilidad: `buildConditions()` (privado) devuelve solo el array de condiciones de negocio; `resolveAudience`/`countAudience` escriben `and(tenantWhere(u, ctx), ...conditions)` literal e inline en su propio `.where(...)`. Documentado como deviation (Rule 1 — bug bloqueante encontrado en verificación, corregido inline).
- **Exenciones `tenant-safe` por función completa, no por línea:** siguiendo el patrón que ya usaba `service.ts` (un solo comentario antes de `const conditions = [`), cada función de condiciones (`globalInvariants`, `freemiumElegiblesConditions`, `bajasConditions`, `pruebaNoConvertidaConditions`, `alertaAusenteConditions`, `referidosPendientesConditions`) lleva UNA exención pegada a su `return [...]`, cubriendo todos los `sql` internos. La constante módulo-level `FRESHNESS` (usada por dos segmentos) necesitó su propia exención independiente, con el mismo motivo que `goal-plans/routes.ts:488` (fragmento de condición que no ejecuta query propia).
- **Test helpers extendidos, no duplicados:** `seedActiveSubscription`/`seedTrialBooking` ganaron parámetros opcionales con defaults que preservan el comportamiento anterior byte a byte (los call sites existentes del bloque D-08 no cambiaron). `createUserWithStatus`/`seedMemberProfile`/`seedReferral` son helpers NUEVOS y locales al archivo de test (no se tocó `test/helpers.ts`, fuera del alcance declarado en `files_modified` del plan).

## Deviations from Plan

**1. [Rule 1 - Bug bloqueante] `buildWhere` original rompía `pnpm lint:tenant` (19 discrepancias)**

- **Found during:** Task 3, al correr `pnpm lint:tenant` tras el primer borrador de `audience-service.ts`
- **Issue:** la primera versión componía `and(tenantWhere(u, ctx), ...conditions)` dentro de un método privado `buildWhere` y lo pasaba como variable `where` a `.where(where)` en `resolveAudience`/`countAudience`. El lint de tenancy (`CON-06`) juzga por STATEMENT literal — el `tenantWhere(` no aparecía en el texto de la statement que hacía `.from(u).innerJoin(br)...where(where)`, así que TODOS los accesos a `users`/`subscriptions`/`bookings`/`branches`/`member_profiles`/`referrals` en `audience-service.ts` salieron como violaciones no listadas (19 discrepancias, exit 1)
- **Fix:** se separó la responsabilidad — `buildConditions()` devuelve solo el array de condiciones de negocio (sin `tenantWhere`); cada uno de los dos métodos públicos escribe `and(tenantWhere(u, ctx), ...conditions)` literal e inline en su propio `.where(...)`. Se consolidaron las exenciones `tenant-safe` una por función-de-condiciones completa (pegadas al `return [...]`) en vez de por línea individual, más una exención dedicada para la constante `FRESHNESS` a nivel de módulo
- **Files modified:** `el-templo-api/src/modules/campaigns/audience-service.ts`
- **Verificación:** `pnpm lint:tenant` pasó de 19 discrepancias a 0 (exit code 0); `tsc --noEmit` se mantuvo verde durante todo el proceso; `git diff --name-only` confirma que `tenant-lint-allowlist.json` nunca se tocó
- **Commit:** incluido en `f856f423` (no generó un commit separado — se corrigió antes del commit del Task 3)

**2. [Rule 3 - trap conocido] `;` dentro de un comentario `--` en el borrador inicial de la migración 0210**

- **Found during:** Task 2, verificación explícita del acceptance criteria (`grep -n ";" ... | grep "^[0-9]*:--"`) antes de aplicar `db:migrate`
- **Issue:** la primera redacción del header de la migración tenía `(fase 119); D-11/D-12` — el `;` cae dentro de una línea de comentario `--`, lo que el runner (`splitSqlStatements`) usaría como separador de statement ANTES de limpiar comentarios, partiendo el archivo mal (Hard Rule 2 del skill de migraciones)
- **Fix:** se reemplazó el `;` por `--` (guion doble) en la prosa del comentario, sin cambiar el significado
- **Files modified:** `el-templo-api/src/db/migrations/0210_campaigns_segment.sql`
- **Verificación:** el grep de verificación pasó a no devolver nada; `pnpm db:migrate` aplicó el archivo sin error

---

**Total deviations:** 2. La primera (lint de tenancy) fue la de mayor impacto — un bug real de diseño detectado por la propia batería de verificación del plan antes de commitear, exactamente el tipo de hallazgo que el research de la fase anticipaba con el patrón `goal-plans/routes.ts:488`. Ninguna deviation tocó el alcance del plan ni requirió decisión arquitectural (Rule 4).

## Issues Encountered

None sobre el criterio de negocio de los 5 segmentos — ambos hallazgos fueron de infraestructura de verificación (lint de tenancy, sintaxis de migración), corregidos dentro del mismo task antes de commitear.

## Verification

- `pnpm db:migrate` aplicado localmente; `_migrations` muestra `0210_campaigns_segment.sql`; `DESCRIBE campaigns` confirma la columna física `segment varchar(32) NOT NULL DEFAULT 'freemium_elegibles'`.
- `pnpm exec tsc --noEmit` → exit 0 (corrido después de cada task y al cierre del plan).
- `pnpm lint:tenant` → **DISCREPANCIAS: 0** (corrido después de cada task desde el Task 3 en adelante; `tenant-lint-allowlist.json` nunca se tocó).
- `pnpm exec vitest run --no-file-parallelism test/campaigns-audience.test.ts` → **27/27 tests verdes** (106.99s), baseline 7 → 27.
- `git diff --name-only 271a40b4..HEAD` (los 3 commits de este plan, base = fin de 180-03) lista exactamente los 6 archivos de `files_modified` del plan (con el nombre real de la migración, `0210`, en vez del placeholder `02XX`) — **no** incluye `test/tenant-manifest.ts` ni `iso-01-manifiesto.test.ts` (no se agregó ninguna ruta).
- Acceptance criteria de los 3 tasks verificados con los greps/comandos exactos que pide el plan (ver comandos citados arriba en la ejecución de este agente).

## User Setup Required

None — no se instaló ningún paquete nuevo, no hay variables de entorno nuevas. La migración `0210` queda aplicada en la base local del worktree; falta aplicarla en staging/prod cuando este plan se integre (fuera del alcance de este agente).

## Next Phase Readiness

- `AudienceService` está listo para que un plan siguiente de la fase (ej. UI del admin para elegir segmento + preview de conteo, D-11/D-14) lo consuma vía `resolveAudience`/`countAudience`.
- `CAMPAIGN_SEGMENTS`/`CampaignSegment` (en `campaigns/types.ts`) son el contrato de validación que cualquier ruta nueva debe usar para el body del selector de segmento (enum cerrado, `additionalProperties: false`, per el patrón documentado en `180-PATTERNS.md`).
- `campaigns.segment` existe en el schema y en la base local, con default que preserva las campañas ya creadas — el próximo plan que persista el segmento elegido en `create()`/`send()` no necesita backfill.
- Sin bloqueos. El worktree `et-180` sigue con `node_modules`/`.env` local operativos.

---

_Phase: 180-campa-as-etapa-2-magic-links-por-sede-selector-de-audiencias_
_Completed: 2026-08-23_

## Self-Check: PASSED

- FOUND: el-templo-api/src/db/migrations/0210_campaigns_segment.sql (worktree et-180)
- FOUND: el-templo-api/src/modules/campaigns/audience-service.ts (worktree et-180)
- FOUND: el-templo-api/src/db/schema/campaigns.ts modificado (worktree et-180)
- FOUND: el-templo-api/src/modules/campaigns/types.ts modificado (worktree et-180)
- FOUND: el-templo-api/src/modules/campaigns/service.ts modificado (worktree et-180)
- FOUND: el-templo-api/test/campaigns-audience.test.ts modificado (worktree et-180)
- FOUND: commit 376e7942 (feat, Task 2)
- FOUND: commit f856f423 (feat, Task 3)
- FOUND: commit 4e73c362 (test, Task 4)
- FOUND: este SUMMARY.md en el checkout principal
