---
phase: 204-usuarios-wellhub
plan: 11
subsystem: api
tags: [wellhub, reports, access-log, tenancy, tests]
requires: ["204-10"]
provides:
  - "GET /api/admin/reports/wellhub?month=YYYY-MM&branchId= (WellhubReportService.getReport)"
  - "GET /api/admin/reports/access?source=wellhub trae visitas validadas y a mano"
  - "ACCESS_SOURCE_LABELS (reports/service.ts) usado por el xlsx del log de accesos"
affects: [204-16]
key-files:
  created:
    - el-templo-api/src/modules/reports/wellhub-report-service.ts
    - el-templo-api/test/reports/wellhub-report.test.ts
  modified:
    - el-templo-api/src/modules/reports/routes.ts
    - el-templo-api/src/modules/reports/schemas.ts
    - el-templo-api/src/modules/reports/service.ts
    - el-templo-api/src/modules/reports/types.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
metrics:
  tasks: 2
  files: 8
  completed: 2026-10-27
---

# Phase 204 Plan 11: Reporte Wellhub y categoria Wellhub en el log de accesos Summary

Un solo reporte Wellhub por sede y mes (D-16) con la tasa Wellhub -> socio visible (D-22), y "Wellhub" como una categoria mas del filtro de fuente del log de accesos (D-14). Nada se corrio localmente (sin node_modules): verificacion por grep y lectura de codigo.

## Commits

- `e336220a3` feat(204-11): reporte Wellhub por sede y mes y categoria Wellhub en el log de accesos (D-14/D-16/D-22)
- `f2934b8a2` refactor(204-11): mapa de etiquetas de fuente del log de accesos vive en reports/service
- `56ff90ab4` test(204-11): tests del reporte Wellhub y del filtro Wellhub del log de accesos, manifiesto +1 (481 -> 482)

## Lo hecho

- **Log de accesos (D-14):** el enum de querystring `source` pasa a `qr|manual|wellhub` (en `accessReportSchema`, que tambien usa el export). `AccessReportFilters.source` = `Exclude<AccessReportSource, "wellhub_manual">`; se agrego el tipo `AccessReportSource` (4 valores) en `reports/types.ts`. En `buildAccessConditions`, `source=wellhub` se expande con `inArray(schema.attendance.source, [...WELLHUB_ATTENDANCE_SOURCES])`; el resto sigue con `eq`. El enum de respuesta ya traia los 4 valores (plan 06). El xlsx de `/access/export` escribia la fuente cruda (`qr`/`manual`): ahora usa `ACCESS_SOURCE_LABELS` (`QR`, `Manual`, `Wellhub`, `Wellhub (a mano)`).
- **`WellhubReportService.getReport`** (`reports/wellhub-report-service.ts`, docblock en espanol con AISLAMIENTO / MES / A5 / TASA). Todo SQL crudo con `tenant_id = ctx.tenantId` inline en cada tabla (20 apariciones), nombres via `users`, sede via `branches`:
  1. Items 1/2/3: una query de visitas por persona (`SUM(CASE ...)` por `wellhub` y `wellhub_manual`) sobre `attendance.session_date` en `[primer dia, primer dia del mes siguiente)`. Totales, unicos y `visitsPerPerson` (1 decimal, 0 si no hay gente) se arman en JS desde esas filas.
  2. Clasificacion A5 con dos queries de apoyo: socios (alguna visita del mes cubierta por una suscripcion de plan real vigente ese dia: `notTrialPlanSql("s")`, estados `active/paused/expired/completed/changed`) y ex-alumnos (suscripcion de plan real, no `scheduled`, que arranco antes de la primera visita del mes). Prioridad socio > ex_alumno > nuevo.
  3. Item 4: reservas por estado desde `wellhub_bookings` JOIN `wellhub_slots` (`session_date` del mes) JOIN `schedules` (sede); `pending` ignorado. No-shows desde `bookings` con `isWellhubBookingRawSql("b")`, `booking_status = 'no_show'` y `booking_date` del mes. Conversiones desde `wellhub_conversions` (`local_date` del mes) con usuario, plan y sede; `ratePct = unique > 0 ? round(count / unique * 100) : 0`.
  4. Alcance igual que `/access`: `branchId`, y sin `branchId` el `country` del actor; ademas se pasa `enforcedBranchIds(request.scope)` (ver desvios).
  5. `month` por defecto = mes actual (`todayInTz(DEFAULT_TENANT_TIMEZONE)`); formato invalido -> `BadRequestError("Mes inválido, usá AAAA-MM")` (valida tambien el rango 01-12, que el pattern del schema no cubre).
- **Ruta `GET /wellhub`** con `wellhubReportSchema` (query `month` pattern `^\d{4}-\d{2}$`, `branchId` integer; respuesta 200 con todos los campos, mas 400/401/403/500) y los mismos dos preHandlers que `/access`. `assertTenant(request.scope, "reports.wellhub")`.
- **Tests** (`test/reports/wellhub-report.test.ts`, 6 `it`): los 6 pedidos. Mes y fechas con `branchToday`; fixtures de `wellhub-personas.ts`. Cubren validadas 4 / a mano 1, unicos 3 (1/1/1) con `visitsPerPerson` 1.7 y orden del listado, reservas por estado (con un slot del mes siguiente y un no-show de reserva propia que no deben contar), conversion con `ratePct` 33 y plan/fecha/sede, corte de mes por fecha local (ultimo dia incluido, dia previo y siguiente excluidos, con `checkedInAt` en un mes UTC distinto), 400 por mes invalido (13 y formato roto), y el filtro `source=wellhub|manual|qr|sin filtro` del log de accesos.
- **Manifiesto:** `"GET /api/admin/reports/wellhub": tenant-scoped`; `ENTRADAS_BASELINE` 481 -> 482 (constante, titulo del `it` y bloque de historia).

## Deviations from Plan

- **[Rule 2 - alcance] `branchIds` de admin_sede.** El plan decia "branch-scoped like /access". `/access` solo pasa `country`; un `admin_sede` con varias sedes que omite `branchId` veria todo su pais (`enforceBranchScope` solo inyecta cuando hay una). Para el reporte se pasa `enforcedBranchIds(request.scope) ?? undefined` y el servicio acota con `IN (...)` (array vacio = no ve nada). No cambia el comportamiento de `/access`.
- **[Ubicacion] Mapa de etiquetas en `reports/service.ts`, no en `types.ts` ni inline en una funcion.** El plan hablaba del "label de la `Fuente` ~:654 de service.ts", pero el xlsx se arma en `routes.ts` (`/access/export`), no en el servicio. El mapa `ACCESS_SOURCE_LABELS` se exporta de `service.ts` (de ahi lo importa la ruta) para que haya un solo sitio. Cambio visible: el xlsx ahora dice `QR`/`Manual` en vez de `qr`/`manual`.
- **[Test] Slot del mes siguiente en otra actividad.** `wellhub_classes` es unica por `(sede, actividad)` y `insertWellhubSlot` crea una clase por llamada: el segundo slot va con otra actividad/horario.
- **Archivos fuera de `files_modified`:** ninguno. `reports/types.ts` y `reports/service.ts` estaban en la lista.
- Co-Authored-By con `Claude Sonnet 5.5`.

## `kind = 'otro'` de las conversiones (nota del plan 08)

`freemium`/`prueba` -> `activo` con `gympass_id` y actividad Wellhub se guarda como `kind = 'otro'`. Decision: **no se fuerza a nuevo ni a ex-alumno**. En el reporte la conversion cuenta en el total y en la tasa (es una conversion real) y aparece en `conversions.items` con `kind: "otro"` tal cual; el campo `kind` es un string libre, asi que la pantalla (plan 16) decide la etiqueta (sugerido "Otro"). Los conteos nuevos / ex-alumnos / socios del ítem 3 clasifican a las *personas que visitaron*, no a las conversiones, asi que no se mezclan.

## Bugs / observaciones no anticipadas

- El xlsx del log de accesos exportaba la fuente cruda (`qr`/`manual`), distinto de lo que decia el plan. Ahora lleva etiquetas.
- El `pattern` del querystring `^\d{4}-\d{2}$` deja pasar `2026-13`; por eso el servicio revalida el rango 01-12 (el test cubre ambos 400).
- Un cobro en el mismo mes que la primera visita se clasifica `nuevo` si la suscripcion arranca despues de la visita, y `socio` si arranca antes o el mismo dia que alguna visita: es la regla A5 literal, pero hace que una persona que visita y se asocia el mismo dia cuente como socio y no como nuevo.

## Known Stubs

Ninguno. La pantalla del reporte llega en el plan 16.

## Dudas para Franco

1. **Tasa:** `conversiones del mes / personas unicas del mes` no es una cohorte (una conversion del mes puede ser de alguien que visito el mes anterior, y entonces puede superar 100 %). Se dejo la definicion del plan; si se prefiere por cohorte hay que cambiarla.
2. **Estados de suscripcion que cuentan como "cubierta":** `active/paused/expired/completed/changed` (se excluyen `cancelled` y `scheduled`). Una suscripcion `cancelled` que cubria la fecha no hace socio a nadie. Conservador; para ex-alumno si cuenta cualquier suscripcion real no `scheduled` que arranco antes.
3. **Mes por defecto** usa la tz por defecto del gimnasio (`DEFAULT_TENANT_TIMEZONE`), no la de la sede elegida; en el limite de dos dias del mes puede diferir de la tz de una sede de otro pais (Espana). Los limites del mes de los datos si usan fechas locales.
4. **Sin ejecutar:** ni tests ni typecheck corrieron. Puntos de riesgo en CI: (a) las queries crudas usan `db.execute` y leen `[filas]` como en `conversion.ts`; (b) `GROUP BY a.member_id, u.first_name, u.last_name` con `ONLY_FULL_GROUP_BY`; (c) el test de socio fija `start_date` al primer dia del mes por UPDATE directo para no depender de la hora UTC/local del alta; (d) el test del xlsx (etiquetas) no se escribio: solo se probo el filtro del JSON.
5. Prettier no se pudo confirmar (el orquestador formatea al final).

## Self-Check: PASSED

- `e336220a3`, `f2934b8a2`, `56ff90ab4`: FOUND
- `wellhub-report-service.ts` y `wellhub-report.test.ts` existen; 6 `it(` en el test; `"GET /api/admin/reports/wellhub"` en `tenant-manifest.ts`; `ENTRADAS_BASELINE = 482`
- Sin `any`, sin `console.*`, sin `DATE_FORMAT(` de timestamps en el servicio nuevo
