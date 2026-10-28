---
phase: 180-campa-as-etapa-2-magic-links-por-sede-selector-de-audiencias
plan: 10
subsystem: api
tags: [drizzle, fastify, tenant-settings, scheduling, tenancy]

# Dependency graph
requires:
  - phase: 180-02
    provides: "GET /members/scheduling/branches con address+mapsUrl (no consumido directamente por este plan, pero mismo módulo scheduling)"
  - phase: 159-06
    provides: "deriveActivityLabel() y DERIVED_CLASS_LABEL — fuente única de la etiqueta visible Combos/Técnica"
provides:
  - "label-descriptions.ts: KV de descripciones por etiqueta derivada en tenant_settings (sin tabla/migración nueva)"
  - "activityDescription en el payload de getWeeklyGrid, coherente con la etiqueta MOSTRADA (D-23)"
  - "GET/PUT /api/admin/scheduling/class-label-descriptions (copy editable por el admin)"
  - "test/scheduling-label-descriptions.test.ts: test de coherencia que previene el bug de Pitfall 9"
affects: [180-13, ReservasPage-bottom-sheet]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "KV por tenant en tenant_settings con namespace de settingKey (class_label_description.*), mismo idioma que module-flags.ts y settings/service.ts"
    - "Carga UNA vez por llamada (fuera del loop de slots), igual que modeByDay/bookingCountMap/holidayDates"

key-files:
  created:
    - el-templo-api/src/modules/scheduling/label-descriptions.ts
    - el-templo-api/test/scheduling-label-descriptions.test.ts
  modified:
    - el-templo-api/src/modules/scheduling/service.ts
    - el-templo-api/src/modules/scheduling/types.ts
    - el-templo-api/src/modules/scheduling/routes.ts
    - el-templo-api/src/modules/scheduling/schemas.ts
    - el-templo-api/src/modules/scheduling/derived-label.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts

key-decisions:
  - "Descripciones derivadas en tenant_settings (KV), NO tabla nueva — decisión de arquitectura ya tomada en la planificación, no re-litigada"
  - "activityDescription se agregó solo a WeeklySlotView (no a ScheduleSlot base) para no tocar getScheduleSlot() y sus 7 call sites, fuera del scope de este plan"
  - "El enum cerrado de `mode` en el PUT admin se deriva de DERIVED_LABEL_DESCRIPTION_KEYS (label-descriptions.ts), que a su vez deriva de DERIVED_CLASS_LABEL — una sola fuente para los 3 lugares (service, schema, test)"

patterns-established:
  - "cleanAllTestData NO limpia tenant_settings — cada suite que escribe ahí limpia su propio namespace de settingKey en beforeEach (mismo precedente que test/fixtures/module-flags.ts)"

requirements-completed: [RES-05]

# Metrics
duration: ~25min
completed: 2026-08-23
---

# Phase 180 Plan 10: Descripción coherente con la etiqueta derivada (Pitfall 9) Summary

**KV `tenant_settings` para las descripciones de Combos/Técnica + `activityDescription` en `getWeeklyGrid` resuelto en el mismo punto donde se deriva la etiqueta, así el server nunca muestra la descripción de "General" bajo un título que dice "Combos".**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-23T23:03:00-03:00 (aprox., lectura de contexto)
- **Completed:** 2026-08-23T23:23:17-03:00
- **Tasks:** 3/3
- **Files modified:** 9 (2 creados, 7 modificados)

## Accomplishments

- KV por tenant (`class_label_description.combos` / `class_label_description.tecnica`) sin tabla ni migración nueva, con claves derivadas de `DERIVED_CLASS_LABEL` (una sola fuente).
- `getWeeklyGrid` ahora resuelve `activityDescription` en el MISMO punto donde deriva `activityName` — "hubo relabel" se decide comparando el resultado de `deriveActivityLabel` contra `row.activityName`, sin reimplementar la regla en un segundo lugar.
- Dos rutas admin nuevas (`GET`/`PUT /api/admin/scheduling/class-label-descriptions`) con el mismo guard admin/coach + `assertTenant` del resto del bloque, `mode` validado por `enum` cerrado (nunca interpolado en SQL, T-180-44).
- Los 3 gates de tenancy pagados: manifiesto (+2 entradas, `ENTRADAS_BASELINE` 371→373), lint:tenant en 0 discrepancias, sin tocar el allowlist.
- Test de coherencia (`test/scheduling-label-descriptions.test.ts`, 9 casos) que reproduce exactamente el bug de Pitfall 9 y afirma que NO ocurre: un slot "Combos" nunca hereda la descripción de "General".

## Task Commits

1. **Task 1: KV de descripciones por etiqueta derivada** - `4323ec72` (feat)
2. **Task 2: activityDescription coherente en el payload del slot** - `10ce8d90` (feat)
3. **Task 3: Rutas admin + los 3 gates + test de coherencia** - `fd1f7189` (test)

_Nota: Task 2 tiene `tdd="true"` en el plan, pero el plan mismo separa la implementación (Task 2) de la escritura del test que cubre sus 5 comportamientos (Task 3) — no es un ciclo RED/GREEN de dos commits, es la estructura explícita del plan. Se siguió tal cual está escrita._

**Plan metadata:** (pendiente — no se commiteó, ver instrucciones de ejecución)

## Files Created/Modified

- `el-templo-api/src/modules/scheduling/label-descriptions.ts` - KV de descripciones derivadas: `DERIVED_LABEL_DESCRIPTION_KEYS`, `getDerivedLabelDescriptions`, `setDerivedLabelDescription`
- `el-templo-api/src/modules/scheduling/service.ts` - `getWeeklyGrid` suma `description` al select, carga `derivedDescriptions` una vez, calcula `activityDescription` coherente con la etiqueta mostrada
- `el-templo-api/src/modules/scheduling/types.ts` - `activityDescription: string | null` en `WeeklySlotView`
- `el-templo-api/src/modules/scheduling/routes.ts` - `GET`/`PUT /class-label-descriptions` en el bloque admin
- `el-templo-api/src/modules/scheduling/schemas.ts` - `weeklySlotViewSchema` suma `activityDescription` (o fast-json-stringify lo strippea); `classLabelDescriptionsSchema` / `updateClassLabelDescriptionSchema` nuevos, con `mode` como `enum` derivado del KV
- `el-templo-api/src/modules/scheduling/derived-label.ts` - docblock: nuevo consumidor documentado
- `el-templo-api/test/scheduling-label-descriptions.test.ts` - 9 tests: 5 comportamientos de coherencia (Combos/Técnica/General/especial/sin-descripción) + 4 de las rutas admin (GET vacío, PUT+GET, PUT vacío borra, PUT con mode inválido → 400)
- `el-templo-api/test/tenant-manifest.ts` - 2 entradas nuevas `tenant-scoped`
- `el-templo-api/test/tenancy/iso-01-manifiesto.test.ts` - `ENTRADAS_BASELINE` 371→373 + título del `it` + changelog del docblock

## Decisions Made

- `activityDescription` se agregó únicamente a `WeeklySlotView` (no a `ScheduleSlot`), porque `getScheduleSlot()` (privado, 7 call sites: `getSlotDetail`, `toggleSchedule`, etc.) construye `ScheduleSlot` directamente y no está en el `<action>` de ningún task de este plan — ampliar `ScheduleSlot` hubiera obligado a tocar esos 7 sitios sin necesidad, scope creep fuera de lo pedido.
- Enum cerrado de `mode` en el PUT admin (`DERIVED_LABEL_MODES` en `schemas.ts`) se construye con `Object.keys(DERIVED_LABEL_DESCRIPTION_KEYS)`, que a su vez viene de `Object.keys(DERIVED_CLASS_LABEL)` — una sola fuente encadenada (`derived-label.ts` → `label-descriptions.ts` → `schemas.ts`), consistente con lo que pide el plan (T-180-44).

## Deviations from Plan

Ninguna que requiera Rule 1-4 — todo el trabajo cayó dentro del `<action>` de cada task. Dos notas de implementación, no deviaciones:

**1. Nota — `cleanAllTestData` no limpia `tenant_settings`**

- **Encontrado en:** Task 3, al escribir el test de las rutas admin.
- **Detalle:** `tenant_settings` es un KV compartido con `module.*.enabled` (fase 176); `cleanAllTestData` deliberadamente no lo trunca (mismo motivo que documenta `test/fixtures/module-flags.ts`). Sin limpieza propia, la descripción de "combos" cargada en un test seguía viva en el siguiente (3 tests fallaban por contaminación cross-test).
- **Fix:** `beforeEach` del archivo nuevo borra `class_label_description.%` con `like(tenantSettings.settingKey, ...)`, mismo patrón que `clearModuleFlags`. No se tocó `helpers.ts` (scope de test propio, no infraestructura compartida).
- **Archivos:** `test/scheduling-label-descriptions.test.ts`.
- **Verificación:** los 9 tests pasan en `--no-file-parallelism`.

**2. Nota — grep literal del acceptance criteria de Task 2 no calza exacto**

- El criterio pide `grep -c "getDerivedLabelDescriptions" service.ts == 1`. El archivo tiene 2 líneas que matchean: la línea de `import` y la línea del call site (`await getDerivedLabelDescriptions(this.db, ctx)`, una sola vez, ANTES del loop de slots). El invariante real que el criterio protege — "una sola carga por llamada, fuera del loop" — está verificado por inspección: hay exactamente UN call site, no uno por slot. No se buscó una forma artificial (p. ej. `import * as`) de forzar el grep a dar 1, para no sacrificar el estilo de import nombrado consistente con el resto del módulo.

**Total deviations:** 0 (Rule 1-4). 2 notas documentadas.
**Impact on plan:** Ninguno — el comportamiento pedido está implementado y verificado; las notas son aclaraciones de ejecución, no cambios de alcance.

## Issues Encountered

Ninguno más allá de lo documentado en Deviations.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `WeeklySlotView.activityDescription` está disponible tanto para el admin (`GET /schedules/weekly`) como para el socio (`GET /members/scheduling/weekly`, que hace spread de `result.slots`) — el bottom sheet de actividad de la app (plan 180-13, D-18/RES-05) puede consumirlo directo, sin resolver nada del lado del cliente.
- El copy de Combos/Técnica hoy está vacío en todos los tenants (nadie llamó al PUT admin fuera de los tests) — es esperado, D-18 dice explícitamente que el contenido lo cargan los dueños vía admin, sin seed.
- Sin bloqueos para los planes siguientes de la fase 180.

---

_Phase: 180-campa-as-etapa-2-magic-links-por-sede-selector-de-audiencias_
_Plan: 10_
_Completed: 2026-08-23_
