# Phase 143: Profesor por clase + Puntuación post clase presencial - Context

**Gathered:** 2026-06-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Construir la cadena **profesor↔clase** que hoy NO existe en el sistema y permitir que un miembro puntúe al profesor (estilo Uber) después de asistir a una clase **presencial**.

El modelo central tiene tres piezas, deliberadamente desacopladas:

1. **Roster semanal (fuente de atribución del puntaje):** los owners asignan, semana a semana, **un** profe por combinación `(sucursal, día de semana, turno mañana/tarde)` desde el admin de Horarios. Esta asignación es **determinística** y es la única fuente de "quién es el profe de esta clase" a efectos del rating. NO es un titular fijo recurrente ni una asignación solo a nivel sucursal.
2. **QR self-scan del profe (asistencia del propio profe, independiente del rating):** el profe escanea el QR de la clase con **su propia app de alumno** (`el-templo-app`) para registrar su propia asistencia, **validado contra su sucursal asignada** (`user_branches`). Entra en esta fase, pero NO es lo que atribuye el puntaje (eso sale del roster).
3. **Puntuación del miembro (pop-up estilo Uber):** al volver a la app tras una clase presencial completada, el miembro ve un pop-up que le pide puntuar **la clase** (actividad/día), atribuido internamente al profe del roster. El miembro **nunca ve nada del profe** (ni nombre ni foto).

**En scope:**

- Modelo de datos del roster semanal (profe por sucursal/día/turno) + UI de asignación en el admin de Horarios.
- QR self-scan del profe vía la app de alumno, validado contra su sucursal asignada.
- Pop-up de puntuación en la app del miembro (estrellas 1–5 + comentario opcional), disparado tras clase presencial completada.
- Persistencia de las puntuaciones por profe/instancia.
- Vista simple en admin para el owner (promedio por profe + puntajes/comentarios recientes).
- Tests.

**Fuera de scope (ver `<deferred>`):**

- Reporte completo de puntuaciones para owners (tendencias, filtros, export).
- Co-dictado (varios profes por clase) — v1 es un solo profe por turno.
- Mostrar el profe al miembro (de antemano o al puntuar) — explícitamente descartado.
- Reutilizar el RPE online de `completed_sessions`.

**Revisión de una decisión del ROADMAP:** el entry pre-discuss del ROADMAP (línea 3585) decía "la app del miembro muestra el profe de cada clase". El discuss-phase lo **revirtió**: el miembro **nunca** ve al profe. El pop-up se arma alrededor de la **clase** (actividad/día), no del profe. Esta decisión (D-A3) prevalece.
</domain>

<decisions>
## Implementation Decisions

### Mecánica de puntuación

- **D-M1:** Escala = **estrellas 1–5**.
- **D-M2:** **Comentario de texto libre opcional, siempre** (en todos los casos, no solo en puntaje bajo).
- **D-M3:** Solo el **owner** ve las puntuaciones individuales. El **profe NO ve nada** — ni puntajes individuales ni su propio promedio.

### Comportamiento del pop-up

- **D-P1:** El pop-up es **salteable** (el miembro puede cerrarlo sin puntuar).
- **D-P2:** **Una sola vez:** si lo saltea, esa clase **NO se vuelve a pedir**.
- **D-P3:** La oportunidad de puntuar **caduca a las 48 hs**.
- **D-P4:** Si hay varias clases sin puntuar, **solo se pide la última**; las anteriores se descartan. **No hay cola** de pendientes.

### Asignación + identidad del profe

- **D-A1:** Modelo = **roster semanal**. El owner asigna **un** profe por `(sucursal, día de semana, turno mañana/tarde)`, decidido semana a semana. NO es titular fijo recurrente ni asignación solo a nivel sucursal. El turno mañana/tarde se **deriva por `startTime < 12:00`** (igual criterio que `ReservasPage` `morningSlots`/`afternoonSlots`).
- **D-A2:** **Un solo profe por clase/turno** (sin co-dictado en v1).
- **D-A3:** Al miembro **NO se le muestra nada del profe** (ni foto ni nombre). El miembro solo puntúa la clase de su última asistencia presencial. El pop-up se construye alrededor de la **clase** (actividad/día), no del profe.

### Casos borde del QR / fallback

- **D-Q1:** "El profe de la clase" para **atribuir el puntaje** sale de la **asignación semanal del owner (roster)**. Es determinístico y **NO depende** de que el profe escanee.
- **D-Q2:** El **QR self-scan del profe SÍ entra** en esta fase: el profe usa **su app de alumno** (`el-templo-app`, flujo de `CheckInPage`) para registrar su **propia asistencia**, validada contra su **sucursal asignada** (`user_branches`). Es **independiente** de la atribución del rating (que viene del roster).
- **D-Q3:** Si el owner **no asignó** profe a ese turno/día, **no se muestra el pop-up** (sin profe asignado no hay a quién puntuar; se evitan puntajes huérfanos).

### Vista del owner

- **D-O1:** En esta fase el owner ve una **vista simple** en admin: **promedio por profe** + **lista de puntajes/comentarios recientes**. El reporte completo (tendencias, filtros por fecha/sucursal, export Excel/PDF) se **difiere** a otra fase.

### Claude's Discretion

- Estructura exacta de la tabla del roster (p.ej. `class_coach_assignments` con `(branchId, dayOfWeek, slot 'morning'|'afternoon', weekStartDate, coachId)`) y cómo se modela "semana a semana" (clave por semana vs. snapshot). Elegir el modelo más simple que soporte cambiar el profe cada semana sin perder histórico para atribuir ratings pasados.
- Forma de persistir la puntuación (p.ej. `coach_ratings` con `coachId`, `memberId`, `scheduleId`/`branchId`+`activityId`, `sessionDate`, `stars`, `comment`, `createdAt`).
- Cómo se determina "clase presencial completada" para disparar el pop-up (probable: registro en `attendance` con `status` de asistido + `source` qr/manual para esa `sessionDate`).
- Mapeo de la atribución: cómo se resuelve, en el momento de puntuar, el `coachId` del roster a partir de `(branchId, sessionDate→dayOfWeek, turno derivado de startTime)`.
</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Fuente de verdad del diseño

- `BRIEF-PUNTUACION-PROFES.md` (raíz del repo) — diseño completo del feature.
- `.planning/ROADMAP.md` → Phase 143 entry (decisiones + estado del código verificado). **Ojo:** el punto "la app muestra el profe" fue revertido en discuss (ver D-A3).

### Horarios / schedules (roster del profe)

- `el-templo-api/src/db/schema/schedules.ts` — **sin `coachId`**; columnas `(branchId, activityId, dayOfWeek, startTime, endTime)`. El turno mañana/tarde se deriva por `startTime < 12:00`.
- `el-templo-admin/src/pages/HorariosPage.vue` — gestión de horarios; **acá va la UI del roster semanal** de profes por `(sucursal, día, turno)`.

### Asistencia (clase presencial completada + QR)

- `el-templo-api/src/db/schema/attendance.ts` — registra al **miembro** (`memberId`, `branchId`, `scheduleId`, `sessionDate`, `checkedInAt`, `status`, `source` qr/manual); **SIN profe**. Base para detectar "clase presencial completada" que dispara el pop-up.
- `el-templo-app/src/pages/CheckInPage.vue` — escaneo del QR de clase. El profe usaría **este mismo flujo/app** para su self-scan. `POST /api/members/attendance/check-in`.
- `el-templo-app/src/pages/ReservasPage.vue` — pantalla de reservas del miembro; ya distingue `morningSlots` (<12:00) / `afternoonSlots` (mismo criterio de turno a reutilizar).

### Usuarios / coach (identidad y validación de sucursal)

- `el-templo-api/src/db/schema/users.ts` — role `coach` existe; `firstName`/`lastName`/`photoUrl`/`phone`; **SIN `bio`**.
- `el-templo-api/src/db/schema/user-branches.ts` — junction **coach↔sucursales**. Candidato para **validar el QR self-scan del profe** contra su(s) sucursal(es) asignada(s).

### NO reutilizar

- `completed_sessions.rpe` (`el-templo-app/.../SessionSummary.vue`) es **solo online** y NO se reutiliza para esta fase.

### Drizzle (al crear enums/columnas)

- [[reference_drizzle_enum_column_name]] — el 1er arg de `mysqlEnum` ES el nombre físico de columna; debe coincidir con la migración o CI falla.
- [[reference_drizzle_select_unqualified_columns]] — prefijar columnas (`tabla.col`) en `.select()` para no romper subqueries correlacionadas.

### Recordatorios de proceso (memorias)

- Commitear los **SQL de migración** junto al cambio de schema.
- Cambios de datos en prod **vía migración**, no re-seed.
- Stagear por ruta; **nunca `git add -A`/`.`**.
  </canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **Derivación de turno mañana/tarde:** `ReservasPage.vue` ya parte slots por `startTime < 12:00` en `morningSlots`/`afternoonSlots`. El roster reutiliza exactamente este criterio para la dimensión "turno".
- **Flujo de check-in por QR:** `CheckInPage.vue` + `POST /api/members/attendance/check-in` ya existen; el self-scan del profe se monta sobre este flujo (el profe es un usuario con role `coach` usando la app de alumno).
- **`user_branches`:** junction coach↔sucursal ya existe; es la base para validar el self-scan contra la sucursal asignada.
- **`attendance`:** ya registra asistencia presencial del miembro con `source` qr/manual y `sessionDate`; es la señal para "clase presencial completada" que dispara el pop-up.

### Established Patterns

- Schemas Drizzle por dominio en `el-templo-api/src/db/schema/`; migración generada con `pnpm db:generate` y aplicada con `pnpm db:migrate` (runner custom, `_migrations` = fuente de verdad).
- Stores Pinia composition API; logger vía `createLogger()`; sin `console.log`; sin `any`.

### Integration Points

- **Roster** vive junto a `schedules` (admin Horarios) pero es una entidad nueva: `schedules` no tiene `coachId`, así que el roster NO modifica `schedules`, lo complementa con asignación semanal.
- **Atribución del rating:** se resuelve `(branchId, sessionDate→dayOfWeek, turno por startTime) → coachId` contra el roster vigente esa semana. Por eso el roster necesita poder atribuir asignaciones **pasadas** (no solo la semana actual).
- **App del miembro:** el pop-up consume "clase presencial completada" desde `attendance`, pero **no** expone datos del profe (D-A3).

### Tres flujos desacoplados (no confundir)

1. **Roster (owner asigna)** → fuente de atribución del puntaje. Determinístico.
2. **QR self-scan (profe marca su asistencia)** → dato de asistencia del profe, validado vs. sucursal. Independiente del rating.
3. **Pop-up (miembro puntúa)** → estrellas 1–5 + comentario, atribuido al profe del roster, sin mostrar al profe.
   </code_context>

<deferred>
## Deferred Ideas

- **Reporte completo de puntuaciones para owners** (tendencias, filtros por fecha/sucursal, export Excel/PDF) — probablemente su propia fase.
- **Co-dictado** (varios profes por clase) — diferido; v1 es un solo profe por turno.
- **Mostrar el profe al miembro** de antemano / titular por horario — explícitamente **descartado** (el alumno nunca ve al profe).

</deferred>

---

_Phase: 143-profesor-por-clase-puntuaci-n-post-clase-presencial_
_Context gathered: 2026-06-23_
