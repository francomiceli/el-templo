---
phase: 193-comunicaciones
plan: 01
subsystem: api
tags: [communications, whatsapp, tenant-settings, drizzle, vitest, tenancy]

# Dependency graph
requires: []
provides:
  - "APP_SECTIONS: lista curada de 7 secciones de la app (destino común, D-01), definida en `el-templo-api/src/modules/communications/destinations.ts` y espejada en admin/app con test de sincronía"
  - "validateDestination / validateWhatsAppText: validación server-side del destino y del texto de WhatsApp editable (D-02, D-05)"
  - "resolveDestinationRoute / fallbackRouteFor: resolución fail-closed a ruta interna, nunca 404 (D-04)"
  - "sales-number.ts: getSalesNumber/setSalesNumber/resolveSalesNumberForUser sobre tenant_settings, por país y por tenant (D-20/D-21)"
affects: [193-04, 193-05, 193-06, 193-08, 193-09, 193-14]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Módulo puro (sin db/request) para tipos+validación compartidos, con espejos manuales en admin/app + test de sincronía por regex (no hay paquete de tipos compartido en el repo)"
    - "tenant_settings como KV por-país (whatsapp.sales_number.<AR|ES>), mismo mecanismo que module.*.enabled"
    - "Lectura fail-closed de un valor persistido: un dato corrupto en base nunca se propaga a la UI/URL, se descarta (null) en el punto de lectura, no solo en escritura"

key-files:
  created:
    - el-templo-api/src/modules/communications/destinations.ts
    - el-templo-api/src/modules/communications/index.ts
    - el-templo-api/src/modules/communications/sales-number.ts
    - el-templo-api/test/communications/destinations.test.ts
    - el-templo-api/test/communications/destinations-sync.test.ts
    - el-templo-api/test/communications/sales-number.test.ts
    - el-templo-admin/src/config/destinations.ts
    - el-templo-app/src/config/destinations.ts
  modified:
    - el-templo-api/src/modules/shared/country-scope.ts

key-decisions:
  - "resolveBranchCountry (country-scope.ts) se exportó (era privada) para que sales-number.ts la reuse en vez de duplicar la query DRY — único consumidor nuevo"
  - "El test de sincronía importa APP_SECTIONS directo de la API (misma tsconfig) y solo usa readFileSync+regex para los dos espejos de admin/app (paquetes separados)"

patterns-established:
  - "Espejo de config entre las 3 apps sin paquete compartido: duplicar el archivo con un docblock que apunta al test de sincronía que lo protege"

requirements-completed: [COM-01]

# Metrics
duration: ~35min
completed: 2026-09-02
---

# Phase 193 Plan 01: Cimiento de destinos y número de ventas Summary

**Lista curada de 7 destinos (app_section | whatsapp_sales) con validación server-side fail-closed, espejada en admin/app con test de sincronía, más el número de WhatsApp de ventas por país persistido en `tenant_settings` con aislamiento por tenant verificado.**

## Performance

- **Duration:** ~35 min
- **Started:** ~2026-09-02T13:00 (hora AR)
- **Completed:** 2026-09-02T13:22-03:00
- **Tasks:** 3/3
- **Files modified:** 9 (8 nuevos + 1 modificado)

## Accomplishments

- `destinations.ts`: `APP_SECTIONS` (7 secciones), `Destination`/`DestinationType`, `validateDestination`, `validateWhatsAppText`, `resolveDestinationRoute`/`fallbackRouteFor` fail-closed (D-01, D-02, D-03, D-04)
- Espejos tipados en `el-templo-admin` y `el-templo-app` (sin validación, D-05) + `destinations-sync.test.ts` que rompe si divergen
- `sales-number.ts`: número de WhatsApp de ventas por país en `tenant_settings`, validado (`SALES_NUMBER_PATTERN`, solo dígitos), aislado por tenant, con lectura fail-closed ante un valor corrupto (D-20/D-21)
- 36 tests nuevos (24 + 6 + 6), todos verdes; `tsc --noEmit` en 0; `lint:tenant` en 0 (DISCREPANCIAS: 0); lint de admin y app en 0 errores

## Task Commits

Each task was committed atomically:

1. **Task 1: Lista curada de destinos en la API** - `cb8b2997` (feat)
2. **Task 2: Espejos de la lista en admin y app + test de sincronía** - `de6ab502` (feat)
3. **Task 3: Número de WhatsApp de ventas en tenant_settings** - `4f9f237c` (feat)

**Plan metadata:** Este SUMMARY se escribe en el checkout principal sin commitear (lo commitea el orquestador).

## Files Created/Modified

- `el-templo-api/src/modules/communications/destinations.ts` - fuente de verdad de destinos (D-01/D-02/D-04)
- `el-templo-api/src/modules/communications/index.ts` - barrel público del módulo
- `el-templo-api/src/modules/communications/sales-number.ts` - número de ventas por país en `tenant_settings` (D-20/D-21)
- `el-templo-api/test/communications/destinations.test.ts` - 24 tests unitarios sin DB
- `el-templo-api/test/communications/destinations-sync.test.ts` - 6 tests, sincronía API↔admin↔app
- `el-templo-api/test/communications/sales-number.test.ts` - 6 tests de integración contra MySQL (round-trip, formato inválido, corrupción, aislamiento, resolución por sede)
- `el-templo-admin/src/config/destinations.ts` - espejo tipado (estilo admin: `;` + comillas simples)
- `el-templo-app/src/config/destinations.ts` - espejo tipado (estilo app: sin `;`)
- `el-templo-api/src/modules/shared/country-scope.ts` - `resolveBranchCountry` pasó de privada a exportada (deviation, ver abajo)

## Decisions Made

- El test de sincronía compara el array importado directo de la API (no hace falta regex: mismo tsconfig/vitest) contra los dos espejos leídos con `readFileSync` + regex, ya que `el-templo-admin`/`el-templo-app` son paquetes separados sin path de import válido desde `el-templo-api`.
- `validateWhatsAppText` cuenta saltos de línea con `text.split("\n").length - 1` y rechaza > 3 (acepta hasta 3), interpretación literal de "más de 3 veces" del plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Exportó `resolveBranchCountry` (era una función privada de `country-scope.ts`)**

- **Found during:** Task 3 (número de ventas por país)
- **Issue:** El `read_first` de la Task 3 apunta a `resolveBranchCountry` como la función a reusar para resolver el país de la sede del socio, pero la función era `async function` sin `export` — no podía importarse desde `modules/communications/sales-number.ts`.
- **Fix:** Se agregó `export` a la firma y un comentario explicando el porqué (Fase 193, COM-01/D-20), preservando DRY en vez de duplicar la query `users` ⋈ `branches` dentro de `sales-number.ts` (regla del proyecto: "DRY: Flag repetition aggressively"). El archivo sigue sin estar en el barrel `modules/shared/index.ts`, mismo criterio que `tenant.ts`/`country-scope.ts` (imports por path directo).
- **Files modified:** `el-templo-api/src/modules/shared/country-scope.ts` (1 línea + comentario)
- **Verification:** `tsc --noEmit` en 0, test (e)/(e-bis) de `sales-number.test.ts` ejercitan la función exportada con un socio real (`createTestMember`, branch default país AR) y pasan en verde.
- **Committed in:** `4f9f237c` (Task 3 commit)

---

**Total deviations:** 1 auto-fijado (Rule 3, blocking mínimo — una palabra clave `export`)
**Impact on plan:** Sin impacto en scope ni en el objetivo del plan. Ningún archivo fuera de `files_modified` de la fase (Fase 193) fue tocado salvo este ajuste puntual en un módulo compartido preexistente (`shared/`).

## Issues Encountered

Ninguno. Los 3 vitest runs contra MySQL real tardaron ~110-130s por archivo (provisión del DB de test), dentro del `--hookTimeout=300000` indicado en las reglas duras del prompt. Una primera invocación de `vitest run` (Task 1) superó el timeout por defecto de 120s del propio harness de Bash del ejecutor (no de vitest) y quedó corriendo en background automáticamente; se recuperó el resultado leyendo el archivo de output persistido — no fue necesario reintentar. Para las siguientes corridas se pasó `timeout` explícito de 590000ms a la herramienta Bash y no volvió a ocurrir.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `APP_SECTIONS`, `validateDestination`, `resolveDestinationRoute`/`fallbackRouteFor` y `sales-number.ts` quedan listos como cimiento puro (sin rutas HTTP) para los planes 04 (push), 05 (avisos en la app), 06 (tarjetas), 08/09 (editor admin) y 14 (avisos TV), que son los que exponen el selector de destino y el ajuste del número de ventas en Comunicaciones.
- Nada bloquea el plan 02: worktree limpio, `feat/193-comunicaciones` con 3 commits nuevos sobre `origin/master` `7c273a15`.
- Deuda anotada (no bloqueante): `sales-number.ts` no tiene todavía consumidor de ruta HTTP — lo agrega el plan que exponga el bloque "Ajustes" de Comunicaciones (a definir cuál según CONTEXT.md, sección "Claude's Discretion").

---

_Phase: 193-comunicaciones_
_Completed: 2026-09-02_
