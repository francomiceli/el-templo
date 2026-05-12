# Phase 114: Reporte tabular de sesiones de prueba - Context

**Gathered:** 2026-05-12
**Status:** Ready for planning
**Source:** Discusión interactiva con el usuario (2026-05-12). Decisiones lockeadas en ROADMAP entry + esta CONTEXT.md.

<domain>
## Phase Boundary

Reemplazar la planilla manual de Google Sheets (`.docs/Sesiones de Prueba - SP - Base de datos.csv`, 3500+ filas históricas mantenidas a mano por una persona) por un reporte tabular en el módulo Reportes del admin (`el-templo-admin`), alimentado automáticamente con la data que ya capturamos en DB (bookings is_trial=1, attendance, subscriptions, branches) más tres campos nuevos: estado del lead, comentarios, y admin que creó el lead.

**Out of scope:** tracking de coach por horario (Profe 1/Profe 2 del CSV original), backfill de campo "Gestiona" para trials históricas, reportes admin nuevos no relacionados con trials, agregar columnas Rep./Asistió post rep./Asistencia Final del CSV original.

**Disparador:** Hoy una persona mantiene a mano la planilla. Toda la data ya vive en DB salvo 3 campos blandos (estado del lead, comentarios, "Gestiona"). Esta fase cierra el gap.

</domain>

<decisions>
## Implementation Decisions

### Scope del reporte (locked)

- **D-01:** Columnas del reporte (11, en este orden): `Lead, Fecha, Hora, Sucursal, Asistió, Estado del Lead, Gestiona, Comentarios, Turno, Periodo, Semana`.
- **D-02:** Columnas explícitamente descartadas del CSV original: `Rep.`, `Asistió post rep.`, `Asistencia Final` (vacías en la práctica), `Profe 1`, `Profe 2` (no trackeamos coach por clase).
- **D-03:** Una fila del reporte = una trial booking (no agrupada por user). Si un user tiene múltiples trial bookings (caso raro hoy: `bookings.is_trial=1` permite reactivar bookings canceladas en mismo slot — ver `trials-service.ts:177-209`), cada booking es una fila.

### Cómo se computa cada columna (locked)

- **D-04: Lead** = `users.first_name || ' ' || users.last_name` (TRIM para evitar espacios extras si alguno es NULL).
- **D-05: Fecha** = `bookings.booking_date` formato `DD/MM/YYYY` en la UI; ISO `YYYY-MM-DD` en la API.
- **D-06: Hora** = `schedules.start_time` formato `HH:MM` (sin segundos).
- **D-07: Sucursal** = `branches.name` (incluye virtual branches; ej. "Templo Online" si aplica — actualmente no aplica a trials presenciales).
- **D-08: Asistió** auto-derivado:
  - `Sí` si existe row en `attendance` para `(member_id, schedule_id, session_date=booking_date)` con `status='confirmado'`.
  - `No` si `booking_date < CURDATE()` y NO existe attendance row para ese trío.
  - `(vacío)` si `booking_date >= CURDATE()` (la sesión aún no ocurrió).
- **D-09: Estado del Lead** = `users.lead_status` (nuevo campo enum). Si NULL, fallback derivado: `cerrado` si `users.converted_at IS NOT NULL`, sino `en_seguimiento`. UI siempre muestra string en español ("En seguimiento" / "Cerrado" / "Perdido").
- **D-10: Gestiona** = `users.created_by` (nuevo campo nullable FK → users.id). Trials históricas anteriores al cambio quedan NULL → UI muestra `—`. NO se hace backfill.
- **D-11: Comentarios** = `users.lead_notes` (nuevo campo TEXT nullable). Si el lead se convierte (`converted_at` se setea), un hook prefija el nombre del plan vendido al inicio de `lead_notes` SOLO si el campo está vacío (NULL o `""`). Editable por el admin después.
- **D-12: Turno** derivado de hora: `< 12:00` → "Mañana", `>= 12:00` → "Tarde".
- **D-13: Periodo** derivado: `YYYY-MM` de `booking_date`.
- **D-14: Semana** derivado: rango ISO lunes→domingo del `booking_date`, formato `YYYY-MM-DD — YYYY-MM-DD` (replica el CSV).

### Schema DB (locked)

- **D-15:** `users.lead_status` ENUM('en_seguimiento','cerrado','perdido') NULL — default NULL para staff/freemium/activo/inactivo; al crear un trial (POST /admin/members/trial) se setea explícitamente a `'en_seguimiento'`.
- **D-16:** `users.lead_notes` TEXT NULL.
- **D-17:** `users.created_by` INT NULL, FK → `users.id` con `ON DELETE SET NULL` (si se elimina un admin, los leads que creó conservan referencia NULL en vez de fallar). Nota: en este proyecto los users no se eliminan en producción (deletedAt soft delete), pero la FK debe ser robusta.
- **D-18:** Index: `idx_users_lead_status` sobre `lead_status` (filtro frecuente). `idx_users_created_by` sobre `created_by` (filtro "leads creados por admin X"). No agregar index sobre `lead_notes` (TEXT, no se filtra por contenido).
- **D-19:** Migración via Drizzle: editar `el-templo-api/src/db/schema/users.ts` + `pnpm db:generate` para generar SQL, commit el archivo SQL generado en `el-templo-api/src/db/migrations/` (siguiendo convención de proyecto). Aplicar con `pnpm db:migrate`. No usar `drizzle-kit migrate` (CLAUDE.md).
- **D-20:** La migración NO hace backfill de `lead_status` ni `created_by` para users existentes. Razón: leads históricos están en planilla manual fuera del sistema; no tenemos forma confiable de mapear "quién gestionó al lead X" sin trabajo manual del equipo. Mostrar `—` en UI es aceptable.

### Endpoint del reporte (locked)

- **D-21:** `GET /api/admin/reports/trial-sessions` — paginado, devuelve filas y metadata.
- **D-22:** Querystring filters: `branchId?`, `dateFrom?` (ISO date, sobre `booking_date`), `dateTo?` (idem), `leadStatus?` (enum, multi-value `?leadStatus=en_seguimiento&leadStatus=perdido`), `attended?` (`true`|`false`|`pending`), `shift?` (`TM`|`TT`), `gestionaUserId?` (int, filtra por `users.created_by`), `daysWithoutConvertingMin?` (int — incluye solo leads NO convertidos donde `DATEDIFF(CURDATE(), booking_date) >= N`), `search?` (busca en `users.first_name + last_name`), `page?` (default 1), `limit?` (default 50, max 200).
- **D-23:** Response shape:
  ```json
  {
    "rows": [
      {
        "bookingId": 123,
        "userId": 456,
        "lead": "Antonino Flor",
        "bookingDate": "2026-05-04",
        "startTime": "08:00",
        "branchId": 2,
        "branchName": "Alem",
        "attended": "no",
        "leadStatus": "perdido",
        "leadStatusEffective": "perdido",
        "createdBy": { "userId": 7, "name": "Mica" },
        "leadNotes": "No respondió más.",
        "shift": "TM",
        "period": "2026-05",
        "weekRange": "2026-05-04 — 2026-05-10",
        "daysSinceTrial": 8,
        "converted": false
      }
    ],
    "total": 86,
    "page": 1,
    "limit": 50
  }
  ```
- **D-24:** Country scope: replica el patrón de `ReportsService.getTrialConversionReport` (líneas 741-808 de `reports/service.ts`). Filtra `branches.country = request.country OR branches.is_virtual = 1`. Owner puede pasar `?country=` para override.
- **D-25:** Role guard: `CAJA_ROLES` (gestion/admin/owner — replica `reports/routes.ts:47-56`).
- **D-26:** Export CSV: endpoint hermano `GET /api/admin/reports/trial-sessions/export` con los mismos filtros, devuelve CSV (no Excel — el CSV es el formato actual del equipo). Header en español. Sin paginación (descarga todo lo que matchee los filtros, hasta un cap razonable de 10.000 filas). Usar exceljs si conviene, o un CSV streaming manual.

### Edición del lead (locked)

- **D-27:** Nuevo endpoint `PATCH /api/admin/leads/:userId` body `{ leadStatus?: enum, leadNotes?: string | null }` para editar campos.
- **D-28:** Validaciones: `userId` debe existir y tener `status='prueba'` (un user activo/freemium/inactivo no es lead — devolver 409 con mensaje claro). `leadStatus` debe ser uno de los 3 valores válidos. `leadNotes` permite string vacío (`""` → guardar NULL) o cualquier texto hasta 2000 chars.
- **D-29:** Country/branch scope: usar `requireBranchAccess` sobre `users.branchId` del lead — un admin solo puede editar leads de su scope.
- **D-30:** Audit log: no se agrega tabla de audit log nueva en esta fase. Si fuera necesario auditar cambios de lead_status (ej. "quién marcó como perdido"), se puede agregar después como columna adicional o tabla aparte — fuera de scope.

### Hooks de auto-asignación (locked)

- **D-31:** En `POST /admin/members/trial` (members service `createTrialMember`): pasar `request.user.userId` como `createdBy` al insert del nuevo user. Inicializar `lead_status = 'en_seguimiento'`.
- **D-32:** En `SubscriptionService.create*` (revisar: ¿cuál método se llama desde `assignPlan`? probablemente `subscriptions/service.ts` tiene una función entrypoint): después de insertar la subscription y setear `converted_at` (Phase 102-07 ya hace esto si el user tenía trial booking), agregar:
  - Set `users.lead_status = 'cerrado'` (override del enum manual).
  - Si `users.lead_notes IS NULL OR users.lead_notes = ''`, set `lead_notes = '${plan.name}'`. Si ya tiene contenido, NO sobreescribir.
- **D-33:** Ambos hooks corren en la misma transacción del create-subscription para mantener atomicidad. Si la transacción rolea, los cambios de lead_status/lead_notes también revierten.
- **D-34:** Si el admin manualmente cambia `lead_status` a `cerrado` desde la UI (sin que el lead haya convertido), NO se hace nada con `lead_notes` automáticamente. El hook solo aplica al evento de creación de subscription.

### UI del admin (locked)

- **D-35:** Nueva sección/sub-página en el módulo Reportes del admin: tab o nav item llamado "Sesiones de Prueba". Tabla con las 11 columnas (D-01), filtros arriba, paginación abajo, botón "Exportar CSV". Replica visual del estilo de otros reportes existentes (`ReportesPage.vue` o equivalente).
- **D-36:** Filtros UI: select de sede (poblada vía endpoint existente de branches), date range picker, multi-select de Estado del Lead, select Asistió (Sí/No/Pendiente), select Turno (Mañana/Tarde), select Gestiona (poblada con admins/gestion/owner del sistema), input numérico "Días sin convertir ≥ N". Buscador de texto libre arriba.
- **D-37:** En la tabla, `Estado del Lead` y `Comentarios` son inline-editables: click sobre el chip de estado → dropdown con los 3 valores. Click sobre comentario → textarea expandible. Save automático en blur via `PATCH /api/admin/leads/:userId`. Mostrar spinner pequeño durante el save, toast de éxito/error.
- **D-38:** En la ficha del lead (`AlumnoDetailPage.vue` cuando el user tiene `status='prueba'`): mostrar bloque "Datos de Lead" con select de Estado + textarea de Comentarios + label "Gestiona: {nombre}" (read-only, set al crear). Solo visible para users en `prueba`.
- **D-39:** Mostrar columna "Gestiona" como nombre + apellido del admin (`first_name`). Si NULL, mostrar `—`.

### Filtros y casos borde (locked)

- **D-40:** Filtro "Días sin convertir ≥ N": solo aplica a leads NO convertidos (`converted_at IS NULL`). Calcula `DATEDIFF(CURDATE(), MIN(bookings.booking_date WHERE is_trial=1))`. Útil para "mostrame leads que hicieron prueba hace más de 7 días y no convirtieron".
- **D-41:** Si el user no tiene ninguna trial booking (caso teórico: alguien con `status='prueba'` pero sin booking), NO aparece en el reporte. El reporte es booking-driven, no user-driven.
- **D-42:** Si el user tiene múltiples trial bookings (cancelado+reactivado, o caso futuro de "rep"), TODAS aparecen como filas separadas. Cada fila tiene su `bookingDate` y `attended` propios, pero comparten `leadStatus`, `leadNotes`, `gestiona` (porque esos son a nivel user).
- **D-43:** Bookings con `status='cancelado'`: SE EXCLUYEN del reporte por default. Aún no decidimos si queremos un filtro `includeCancelled=true` — fuera de scope inicial.

### Claude's Discretion

- Naming exacto de la ruta admin de UI (`/reportes/sesiones-de-prueba` o `/reportes/trials`) — alinear con el slug existente del módulo Reportes.
- Estilo visual de los chips de estado del lead — usar `q-chip` Quasar con colores: en_seguimiento=blue-grey, cerrado=positive (verde), perdido=negative (rojo).
- Implementación interna de la query SQL del reporte (un solo SELECT con LEFT JOIN a attendance vs subqueries) — preferir un solo SELECT con LEFT JOIN para performance.
- Tests de integración: cubrir creación de trial con `createdBy` poblado, hook de conversión que setea lead_status='cerrado', filtros del reporte (sede, fecha, estado, días sin convertir), PATCH del endpoint de edit, scope country/branch correcto. NO testear UI Quasar en CI (no hay e2e setup hoy).
- Versionado de plans: bump `el-templo-app/package.json` no aplica (esta fase NO toca app, solo admin + api). Si el admin tiene versionado independiente, seguir convención.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Backend — Schema

- `el-templo-api/src/db/schema/users.ts` — donde se agregan `lead_status`, `lead_notes`, `created_by`. Convención existente: `userStatusEnum`, `documentTypeEnum`, etc. Patrón Drizzle mysqlTable.
- `el-templo-api/src/db/schema/bookings.ts` — referencia para JOINs en query del reporte (`is_trial`, `member_id`, `schedule_id`, `booking_date`, `status`).
- `el-templo-api/src/db/schema/attendance.ts` — JOIN para columna `Asistió`. Trio (member_id, schedule_id, session_date).
- `el-templo-api/src/db/schema/schedules.ts` — JOIN para `Hora` (`start_time`) y `branch_id` → branches.
- `el-templo-api/src/db/schema/branches.ts` — `name`, `country`, `is_virtual` para country scope.
- `el-templo-api/src/db/schema/subscriptions.ts` y `subscription-plans.ts` — para obtener nombre del plan en hook de conversión.

### Backend — Módulo Reports (Phase 102-07)

- `el-templo-api/src/modules/reports/service.ts:728-1010` (`getTrialConversionReport`) — patrón a replicar: country scope, breakdowns, conversion logic. NUEVA función `getTrialSessionsReport` (paginada, fila-por-fila).
- `el-templo-api/src/modules/reports/routes.ts:41-56` — addHook que valida CAJA_ROLES + attachCountryScope. Replicar en el nuevo endpoint.
- `el-templo-api/src/modules/reports/routes.ts:60-120` — patrón de endpoint paginado (ver `/access`).
- `el-templo-api/src/modules/reports/types.ts` — agregar `TrialSessionsFilters`, `TrialSessionsReport`, `TrialSessionsRow`.
- `el-templo-api/src/modules/reports/schemas.ts` — agregar `trialSessionsReportSchema`, `trialSessionsExportSchema` (Zod/JSON schema para Fastify).

### Backend — Módulo Members

- `el-templo-api/src/modules/members/routes.ts:587-615` (`POST /admin/members/trial`) — agregar `createdBy: request.user.userId` al body que se pasa al service.
- `el-templo-api/src/modules/members/service.ts` `createTrialMember` — aceptar `createdBy` y guardarlo + setear `lead_status='en_seguimiento'`.
- `el-templo-api/src/modules/members/schemas.ts` `createTrialMemberSchema` — NO debe aceptar `createdBy` desde el cliente (siempre desde `request.user.userId`).
- `el-templo-api/src/modules/members/service.ts` (PATCH `/admin/members/:userId`) — verificar que NO toca `lead_status` ni `lead_notes` desde el endpoint genérico de update (esos van por el endpoint nuevo de leads).

### Backend — Módulo Subscriptions (hook de conversión)

- `el-templo-api/src/modules/subscriptions/service.ts` — buscar el método que setea `users.converted_at` (Phase 102-07). Inyectar set de `lead_status='cerrado'` + prefijo de `lead_notes` en la misma transacción.
- `el-templo-api/src/db/schema/users.ts:96-98` — comentario fase 102-07 sobre `converted_at`.

### Frontend Admin

- `el-templo-admin/src/pages/ReportesPage.vue` o similar (el módulo Reportes actual) — referencia para el tab/sub-página nueva.
- `el-templo-admin/src/pages/AlumnoDetailPage.vue` — agregar bloque "Datos de Lead" (select Estado + textarea Comentarios) cuando `user.status === 'prueba'`. Ver banner "Completar y convertir" agregado en commit d9624738.
- `el-templo-admin/src/composables/useMembersApi.ts` — agregar `updateLeadStatus`, `updateLeadNotes` (PATCH `/api/admin/leads/:userId`).
- `el-templo-admin/src/types/member.ts` — agregar campos `leadStatus`, `leadNotes`, `createdBy` al tipo Member.

### Convenciones del proyecto

- `CLAUDE.md` (project root) — Logging via Pino/createLogger (no console.log), TypeScript estricto (no `any`), tests integración con MySQL real (`eltemplo_test` DB), migraciones via `pnpm db:generate` + commit del SQL + `pnpm db:migrate`. Husky/lint-staged en commit.
- `feedback_no_semicolon_in_sql_comments.md` (user memory): nunca usar `;` dentro de comentarios SQL en migraciones — el runner del proyecto splittea por `;` antes de strippear `--`.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`ReportsService.getTrialConversionReport`** — patrón completo de country scope, branch filter, breakdowns. Replicar shape de filtros y SQL building.
- **`POST /admin/members/trial`** + `createTrialMember` — endpoint actual al que solo hay que pasarle `createdBy` extra (sin tocar el shape del request body desde el cliente).
- **`Phase 102-07 conversion hook`** — ya setea `users.converted_at` cuando se crea la primera subscription para un user que tenía trial. Esta fase agrega 2 líneas más a ese hook (lead_status + lead_notes).
- **`CAJA_ROLES + attachCountryScope`** — pattern de guardado role + country scope que todo endpoint de reports usa.
- **`requireBranchAccess`** — para el endpoint de edit lead, validar que el admin tiene scope sobre el branch del lead.

### Constraints

- No tocar `bookings` schema (la columna `created_by` se mueve a `users`, no a bookings — ver D-10).
- No agregar tabla de audit log nueva.
- No hacer backfill de leads históricos.
- No tocar el flow de `cancelTrialBooking` ni `bookTrial` más allá de pasarle `createdBy` al user en el momento de creación.
- Migración con sintaxis MySQL compatible — no usar features de MariaDB/Postgres.
- Tests deben correr en CI (`pnpm test`) sin requerir setup externo más allá del MySQL test DB ya configurado.

### Pitfalls / Landmines

- **Drizzle `mysqlEnum` para lead_status**: cuidado con el nombre del enum a nivel SQL — Drizzle genera `ENUM('a','b','c')` inline. Verificar que el migration SQL generado no tenga `;` en comentarios (feedback_no_semicolon_in_sql_comments).
- **FK self-referencing en users.created_by**: Drizzle MySQL soporta self-ref pero requiere `mysqlTable.references(() => users.id)` con cuidado de orden de declaración. Ver patrón en `subscriptions.ts` u otras tablas self-ref si existen.
- **Hook de conversión**: el método de crear subscription en `subscriptions/service.ts` puede ser invocado desde múltiples lugares (admin assign-plan, member upgrade, etc.). Asegurar que TODOS los entrypoints pasen por la lógica del hook, no solo uno.
- **Filtro "días sin convertir ≥ N"** + paginación: debe aplicarse a nivel SQL (WHERE), no a nivel JS post-fetch, para que la paginación cuente bien.
- **Country scope para Templo Online (virtual branch)**: incluir `is_virtual=1` en el filtro de branches (replicar línea 775 de reports/service.ts).
- **Inline edit en tabla**: si el usuario edita comentario muy largo (> 1000 chars), la textarea inline puede romper layout. Limitar visualmente a 2 líneas con expansión via click; el textarea modal puede tener más espacio.

### Module Dependencies

- `members` → llama a `users` schema.
- `subscriptions/service` → tiene el hook de conversion.
- `reports` → consume `bookings`, `attendance`, `schedules`, `branches`, `users`, `subscriptions`, `subscription_plans`.
- `admin/leads` (nuevo) → endpoint nuevo, módulo nuevo (o agregar a `members/routes.ts` si conviene). Decisión técnica: crear un sub-router `admin/leads` dentro del módulo `members` (mismo dominio: lead = user con status='prueba').

</code_context>

<specifics>

## Specific Ideas

### Ejemplo concreto: fila del reporte para "Antonino Flor"

CSV original (fila 3506 de la planilla histórica):

```
Antonino Flor,4/05/2026,8:00,Alem,No,No,,Perdido,,,Mica,No respondió más.,,Turno Mañana,2026-05,2026-05-04 — 2026-05-10
```

Fila equivalente en el nuevo reporte:

- Lead: "Antonino Flor" (de users.first_name + last_name)
- Fecha: 04/05/2026 (de bookings.booking_date)
- Hora: 08:00 (de schedules.start_time)
- Sucursal: Alem (de branches.name)
- Asistió: No (no hay attendance row para ese trío + booking_date < CURDATE)
- Estado del Lead: Perdido (de users.lead_status, seteado manualmente por admin)
- Gestiona: Mica (de users.created_by → users.first_name del admin)
- Comentarios: "No respondió más." (de users.lead_notes)
- Turno: Mañana (8:00 < 12:00)
- Periodo: 2026-05 (de booking_date)
- Semana: 2026-05-04 — 2026-05-10 (ISO week de booking_date)

### Ejemplo de hook de conversión

Lead "Lagos Rosario" hace trial el 4/05, admin le asigna plan "Flex Basic" el 6/05:

1. `assignPlan` corre, crea subscription.
2. Phase 102-07 hook detecta `is_trial=1` en bookings del user → setea `converted_at = NOW()`.
3. **NUEVO hook 114**: setea `lead_status = 'cerrado'`.
4. **NUEVO hook 114**: `lead_notes` está NULL → setea `lead_notes = 'Flex Basic'`.
5. Si el admin después edita el comentario a "Flex Basic - le encantó" desde la UI, ese override persiste.

</specifics>

<deferred>

## Deferred Ideas

- **Rep. y reprogramación**: el CSV original tiene columnas Rep./Asistió post rep. para "reprogramó la prueba y vino la 2da vez". Modelo formal de "reprogramación" (campo `bookings.rescheduled_from_booking_id`) queda fuera. Si en el futuro se reagregan, se modelan como otra fase.
- **Tracking de coach por horario** (Profe 1/Profe 2 del CSV): requiere agregar `schedules.primary_coach_user_id` + secondary, o tabla many-to-many. Pertenece a una fase de scheduling separada (no priority hoy).
- **Backfill de leads históricos**: poblar `users.created_by` y `users.lead_status` para users históricos via match contra el CSV original. Frágil (typos, formatos de nombre, gente sin user en DB). Aceptable mostrar `—` en histórico.
- **Audit log de cambios de lead_status**: trackear "quién cambió a X cuándo". Fuera de scope; agregar como columna `lead_status_updated_at` y `lead_status_updated_by` si se necesita después.
- **Auto-marcar como "perdido" tras N días**: cron job que setea `lead_status='perdido'` automáticamente si pasaron 30 días desde el trial sin convertir. El usuario eligió enum manual con default `en_seguimiento` — no quiere auto-marking. Filtro "días sin convertir ≥ N" en el reporte cumple el caso de uso de "encontrar leads para revisar".
- **Templo Online y trials online**: hoy las trials son presenciales. Si en el futuro se agregan trials para planes online (freemium), el reporte ya soporta virtual branches via D-24.
- **Excel export** además de CSV: el equipo usa Google Sheets, importa CSV sin problema. Sin necesidad de XLSX por ahora.

</deferred>

---

_Phase: 114-reporte-tabular-de-sesiones-de-prueba_
_Context gathered: 2026-05-12 via conversación interactiva con el usuario (autonomous planning)_
