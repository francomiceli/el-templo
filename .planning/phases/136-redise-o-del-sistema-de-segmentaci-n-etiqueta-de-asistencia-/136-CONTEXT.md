# Phase 136: Rediseño del sistema de segmentación — etiqueta de Asistencia + Antigüedad - Context

**Gathered:** 2026-06-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Reemplazar el "segmento" de asistencia actual del miembro por una etiqueta de **Asistencia** basada 100% en el % de uso de la membresía, y agregar una **dimensión nueva de Antigüedad**. La etiqueta de Asistencia REEMPLAZA al segmento (`nuevo`/`espartano`/`intermitente`/`en_riesgo`/`digital_warrior`/`ghost`) en todo el admin (Alumnos, Analytics, Notificaciones, Horarios). La Antigüedad es información nueva, se calcula al vuelo y se muestra **solo en Horarios**.

**Etiqueta de Asistencia** (% de uso de membresía sobre ventana móvil de 28 días — reutiliza la lógica de % que ya existe en `segmentation/service.ts`):

- **Óptima:** ≥ 75%
- **Regular:** 50–74%
- **Alerta:** 1–49% (requiere observación)
- **Ausente:** 0% (detona seguimiento)

**Etiqueta de Antigüedad** (derivada de `users.createdAt`):

- **Nuevo:** 0–1 mes
- **1–3 meses**
- **3–6 meses**
- **+6 meses**

**En scope:** motor de segmentación reescrito a las 4 bandas de %; enum DB + migración con recálculo limpio; antigüedad calculada al vuelo en los endpoints de Horarios; preservación de las notis push (reconectadas a los nuevos estados); propagación del nuevo enum a analytics/notificaciones/members/app/frontend; tests.

**Fuera de scope:** rediseño del copy/estrategia de las notis push (se preservan tal cual); mostrar Antigüedad fuera de Horarios; nuevas métricas de analytics más allá de adaptar las existentes.
</domain>

<decisions>
## Implementation Decisions

### Etiqueta de Asistencia (reemplaza el segmento)

- **D-01:** Las 4 bandas reemplazan el enum `member_segment` en TODO el admin. Valores nuevos: `optima`, `regular`, `alerta`, `ausente`. Desaparecen `nuevo`, `espartano`, `intermitente`, `en_riesgo`, `digital_warrior`, `ghost`, el "golden case" de frecuencia y la lógica de inactividad por semanas (ghost/en_riesgo por tiempo) — todo colapsa a las 4 bandas de % de asistencia.
- **D-02:** Ventana de cálculo = **móvil de 28 días** (la que ya usa el motor: `attendanceCount / (classesPerWeek × 28/7) × 100`). Reutilizar esa lógica existente.
- **D-03:** Cortes **75 / 50 / 1 fijos en código** (constantes), NO configurables vía `system_settings`. Se eliminan/ignoran los settings `espartano_pct`/`intermitente_pct` y derivados que ya no apliquen.
- **D-04:** `>100%` (asiste más de lo que su plan permite) sigue siendo **Óptima** (criterio ≥75).

### Antigüedad (dimensión nueva)

- **D-05:** Se muestra **SOLO en Horarios** (`SlotDetailDialog`), como chip por alumno. No se agrega a Alumnos/detalle/analytics en esta fase.
- **D-06:** Se **calcula al vuelo** desde `users.createdAt` en los endpoints de slot (`getSlotAttendance` / `getSlotDetail`). NO se persiste, NO necesita columna ni enum ni cron. Bordes: `[0,1)`=Nuevo, `[1,3)`=1–3m, `[3,6)`=3–6m, `[6,∞)`=+6m (meses).

### Comportamiento del primer mes (interacción Antigüedad × Asistencia)

- **D-07:** Durante el primer mes (Antigüedad = Nuevo) **NO se muestra la etiqueta de Asistencia** — solo el chip de Antigüedad. Un recién inscripto no tiene historia suficiente y no debe caer injustamente en Alerta/Ausente. Implicación en el motor: para miembros con < 1 mes de antigüedad, el estado de Asistencia queda **NULL / sin calcular** (la columna `segment` es nullable; analytics ya maneja `sinSegmento`). La Asistencia empieza a calcularse al cumplir el mes.

### Miembro sin plan activo

- **D-08:** Sin plan activo (sin `classesPerWeek`) → **sin etiqueta de Asistencia** (no hay denominador para el %). En el contexto de Horarios es además irrelevante: un miembro sin plan no reserva ni asiste a clases, así que no aparece en la lista del slot. En Alumnos/analytics se muestra como sin segmento.

### Migración de datos

- **D-09:** **Recalcular en limpio.** La migración altera el enum y deja el estado vacío (NULL); un recálculo one-shot + el cron nocturno repueblan con la lógica nueva. NO se hace mapeo aproximado viejo→nuevo (mezclaría taxonomías de criterios distintos). El enum nuevo debe coincidir exactamente con `mysqlEnum("member_segment", [...])` en la migración (ver [[reference_drizzle_enum_column_name]]).

### Notificaciones push (PRESERVAR)

- **D-10:** Se **mantienen las 5 notis push tal cual** (mismo copy, mismos `template_key`, misma categoría). Solo se **reconecta el disparador** a los nuevos estados, sin tocar `TEMPLATE_SEEDS`:
  - `Alerta` (baja asistencia) ← antes `en_riesgo` → `segment_transition_en_riesgo` ("Tu práctica te espera")
  - `Ausente` (0%) ← antes `ghost` → `segment_transition_ghost` ("El Templo no cierra") + reintento mensual (`ghost_monthly_reattempt`, reusando `ghost_reattempt_count`/`last_ghost_reattempt_at`)
  - recuperación a `Óptima`/`Regular` (desde Alerta/Ausente) → `segment_transition_recovery` ("¡Bienvenido de vuelta!")
  - `Óptima` ← antes `espartano` → `segment_transition_espartano` ("¡Semana increíble!")
- **D-11:** El **cron nocturno de recálculo (3 AM)** se mantiene activo (mantiene las etiquetas al día). Solo se reescribe `getTransitionTemplateKey` y el motor que invoca. Verificado en prod 2026-06-22: las notis están vivas y dispararon hoy (en_riesgo×9, espartano×3, ghost×1, recovery×1 enviadas).

### Claude's Discretion

- Nombres internos de los template keys: se conservan los actuales (`segment_transition_en_riesgo`, etc.) para no re-seedear; el `template_key` es un identificador, lo que importa es el copy. Renombrar es opcional y de bajo valor.
- Mapeo display (labels/colors) de los 4 nuevos estados en el frontend (probable: Óptima=green, Regular=amber, Alerta=orange, Ausente=red/grey).
  </decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Motor de segmentación (a reescribir)

- `el-templo-api/src/modules/segmentation/service.ts` — `calculateSegment` (lógica de prioridad actual), `getThresholds`, `calculateAndUpdate` (cooldown), `recordLogin`. Reutilizar el cálculo de % de asistencia en ventana de 28 días (steps 8–11).
- `el-templo-api/src/modules/segmentation/types.ts` — `MemberSegment`, `SEGMENT_SETTINGS_KEYS`, `SEGMENT_DEFAULTS`, `SEGMENT_LABELS/COLORS/VALUES`.

### DB / enum + migración

- `el-templo-api/src/db/schema/member-profiles.ts:40-47` — `memberSegmentEnum`. El 1er arg de `mysqlEnum` ES el nombre físico de columna (`member_segment`); debe coincidir con la migración.
- `el-templo-api/src/db/migrations/0057_behavioral_segmentation.sql` y `0064_rename_nuevo_guerrero.sql` — historia del enum actual.

### Analytics (propagar nuevo enum)

- `el-templo-api/src/modules/analytics/engagement-service.ts` — `SEGMENT_KEYS`, `countActiveBySegment`, `getEngagementNominalList` (worklist de seguimiento, hoy `en_riesgo`+`ghost` → pasa a `alerta`+`ausente`).
- `el-templo-api/src/modules/analytics/types.ts` — `SegmentCounts`, `EngagementMember.segment`.
- `el-templo-api/src/modules/analytics/schemas.ts` — enums de validación request/response (líneas ~126, 269, 288).

### Notificaciones (reconectar disparadores, preservar copy)

- `el-templo-api/src/modules/notifications/types.ts:52-117` — `SEGMENT_TRANSITION_TEMPLATES` (reconectar) + `TEMPLATE_SEEDS` (NO tocar el copy).
- `el-templo-api/src/jobs/notification-cron.ts` — `getTransitionTemplateKey` (líneas 39-67) + batch recalc 3AM (líneas 203-417). Reusar `ghost_reattempt_count`/`last_ghost_reattempt_at` para el reintento mensual de Ausente.
- `el-templo-api/src/modules/notifications/routes.ts` — `sendSegmentSchema` (targeting por segmento, enum a actualizar).

### Members + app + frontend

- `el-templo-api/src/modules/members/service.ts` — filtro + subquery `segment`.
- `el-templo-app/src/stores/useUserStore.ts` — `MemberSegment` type + `UserProfile.segment`.
- `el-templo-admin/src/types/member.ts` — `MemberSegment`, `SEGMENT_LABELS/COLORS/DESCRIPTIONS`, `SEGMENT_PRIORITY`.
- `el-templo-admin/src/types/analytics.ts` — `SegmentCounts`, `EngagementMember`.
- `el-templo-admin/src/pages/AlumnosPage.vue` (filtro + columna), `AlumnoDetailPage.vue` (card segmento), `NotificacionesPage.vue` (targeting), `components/scheduling/MemberTags.vue` (chips en Horarios).

### Endpoints de Horarios (antigüedad + asistencia al vuelo)

- `el-templo-api/src/modules/attendance/service.ts` — `getSlotAttendance` (ya hace leftJoin con `member_profiles` para `segment`; agregar antigüedad desde `users.createdAt`).
- `el-templo-api/src/modules/scheduling/service.ts` — `getSlotDetail` (bookings, ídem).

### Tests

- `el-templo-api/test/segmentation/segmentation.test.ts`, `test/segmentation/golden-case.test.ts` (este último probablemente se elimina — desaparece el golden case), `test/analytics/engagement.test.ts`, `test/notifications.test.ts`.

### Memorias relevantes

- [[reference_drizzle_enum_column_name]] — drift `mysqlEnum` 1er-arg vs columna (auditar schema↔migración).
  </canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **Cálculo de % de asistencia (28d):** `segmentation/service.ts` steps 8–11 ya computan `expectedClasses = classesPerWeek × (windowDays/7)` y `attendancePct`. Es la base de las 4 bandas — se conserva, se cambian solo los cortes y los nombres de estado.
- **`MemberTags.vue`** (creado en el trabajo previo de esta conversación): ya renderiza chips por alumno en Horarios. Se adapta para mostrar Antigüedad + Asistencia (en vez de segmento + avatar).
- **Infra de thresholds (`system_settings`)**: existe pero D-03 decide cortes fijos → se simplifica/elimina la parte de % configurable.
- **`ghost_reattempt_count` / `last_ghost_reattempt_at`** en `member_profiles`: se reusan para el reintento mensual de Ausente.

### Established Patterns

- Motor de segmentación con cooldown de 1h + recálculo on-login + batch nocturno. Se mantiene la arquitectura; cambia la función de clasificación.
- Enum Drizzle: 1er arg = nombre de columna física; migración debe coincidir (memoria [[reference_drizzle_enum_column_name]]).

### Integration Points

- `member_profiles.segment` es la fuente única consumida por analytics, members service, app y frontend. Cambiar el enum se propaga a todos.
- Horarios consume `segment` vía los endpoints de slot (ya expuesto) + sumará antigüedad calculada al vuelo.

### Trabajo previo ya aplicado (sin commitear) en esta conversación

- Badge **QR/Manual removido** de la lista de asistencia en `SlotDetailDialog.vue` (decidido fuera de scope del dato). Incluir/commitear con esta fase.
  </code_context>

<specifics>
## Specific Ideas

- Las dos etiquetas que el usuario quiere ver por alumno en Horarios son **Antigüedad** + **Asistencia**. Reemplazan conceptualmente al par segmento+avatar que se mostraba antes.
- **Abierto/confirmar (menor):** ¿se mantiene también el chip de **avatar (A–K)** en Horarios junto a las dos etiquetas nuevas, o se quita? Default propuesto: mantenerlo (info ortogonal ya implementada), pero confirmable sin bloquear el plan.
- Verificación en prod (2026-06-22): notis de segmento confirmadas activas vía query a `pending_notifications` JOIN `notification_templates`.
  </specifics>

<deferred>
## Deferred Ideas

- **Rediseño del copy/estrategia de las notis push** con la nueva taxonomía (ej. mensajes específicos para "Alerta" vs "Ausente"): fuera de scope — se preservan tal cual y se repiensan en una fase aparte.
- **Antigüedad en Alumnos / detalle / analytics** (filtro, columna, breakdown): diferido; en esta fase solo Horarios.
- **Cortes configurables vía settings:** descartado por ahora (D-03 = fijos); si en el futuro se quiere tunear, reintroducir sobre la infra de `system_settings` existente.

</deferred>

---

_Phase: 136-redise-o-del-sistema-de-segmentaci-n-etiqueta-de-asistencia_
_Context gathered: 2026-06-22_
