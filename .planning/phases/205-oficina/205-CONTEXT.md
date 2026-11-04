# Phase 205: Oficina — central de temas de gestión - Context

**Gathered:** 2026-11-03 (sesión autónoma: Franco pidió pensar, planificar y ejecutar sin pausas)
**Status:** Ready for execution
**Worktree:** `/home/franco/projects/et-oficina`, rama `feat/oficina`, base `origin/master` `9b5f64784`

<domain>
## Phase Boundary

Una sección nueva del admin, **Oficina** (`/oficina`), visible para `owner`, `admin` y `gestion`, que concentra los **temas de gestión** del templo en un solo lugar y permite que el staff de gerencia converse sobre ellos.

Qué es un tema: algo que la gerencia está atendiendo. Tiene título, contexto, un vínculo opcional a una cosa del sistema (socio, jornada, evento Wellhub, horario), responsables opcionales (varios), un estado binario (abierto / cerrado) más "dormido hasta fecha", y un hilo de comentarios cortos con menciones.

Dos orígenes:
- **manual**: lo crea una persona desde Oficina o desde la ficha del socio.
- **sistema**: lo abre un job desde señales que hoy se pierden (webhook Wellhub con error, jornada de staff sin cerrar de un día anterior, clase de mañana sin profe). El sistema también los cierra solo cuando la condición desaparece.

Lo que NO es: no es un Jira (sin columnas, sin prioridades formales, sin sprints), no es un chat (sin threads ni reacciones), no es un mapa ni un juego. No migra los seguimientos existentes (renovaciones, pruebas, deudas): siguen donde están, Oficina los enlaza por socio.

Alcance: `el-templo-api` + `el-templo-admin`. La app de alumnos NO se toca. Sin bump de versión (admin web-only).

Por qué ahora: la gerencia no tiene centro de operaciones. El admin tiene nueve superficies de pendientes dispersas (Reportes x7, Deudas, Jornadas) y tres seguimientos a mano (renovaciones, pruebas, deudas), ninguno con conversación entre personas. Dos señales no se ven en ningún lado: `wellhub_events.status='error'` y jornadas abiertas de días anteriores fuera del dashboard de check-in.

</domain>

<decisions>
## Implementation Decisions (tomadas por el orquestador, Franco no estaba)

### Modelo
- **D-01** Cinco tablas gym-owned nuevas (módulo `office`, strict desde el nacimiento): `office_topics`, `office_topic_assignees` (responsables, varios por tema: UNIQUE `(tenant_id, topic_id, user_id)`, CASCADE con el tema y el usuario), `office_topic_events`, `office_topic_reads`, `office_mentions`. Migración **0320** a mano (renumerada desde la 0316 porque master ocupó 0317-0319 antes de que esta saliera del local). `office_topics` NO tiene `assignee_id`.
- **D-02** `status` ∈ `abierto | dormido | cerrado`. `origin` ∈ `manual | sistema`. Columnas varchar (no `mysqlEnum`) con uniones TS, igual que `conquer_alerts`.
- **D-03** Vínculo polimórfico opcional: `target_kind` ∈ `socio | jornada | wellhub_evento | horario | caja | sede | tablero` (`caja`, `sede` y `tablero` los crea solo el job, D-23/D-24/D-25; la API manual sigue aceptando solo `socio`), `target_id`, `target_label` (texto congelado al crear, para no joinear cuatro tablas al listar). `branch_id` opcional.
- **D-04** Los temas del sistema llevan `source_key` único por tenant (`wellhub_event:<id>`, `staff_shift:<id>`, `clase_sin_profe:<scheduleId>:<YYYY-MM-DD>`). Si el staff cerró a mano un tema del sistema, el job NO lo reabre aunque la condición siga (la unique lo impide y es deseado).
- **D-05** El hilo es la tabla de eventos. `type` ∈ `creado | comentario | asignado | tomado | desasignado | dormido | cerrado | reabierto | editado | sistema`. `actor_id` NULL = sistema. No se escribe en `audit_log` (los eventos son el log).
- **D-06** Menciones explícitas: el cliente manda `mentionUserIds` junto al texto (el texto lleva `@Nombre Apellido` plano). El servidor filtra los ids a staff activo del tenant y crea una fila en `office_mentions` por (evento, usuario).
- **D-07** "Visto" por persona: `office_topic_reads (topic_id, user_id, last_seen_at)`. **Cualquier acción propia sobre un tema cuenta como vista** (crear, comentar, asignar, cerrar: se upsertea la lectura del actor con el mismo timestamp del evento). Así un comentario propio nunca aparece como "nuevo" para uno mismo.
- **D-08** Badge del menú = menciones sin leer en temas no cerrados + temas donde soy uno de los responsables, no cerrados, con actividad posterior a mi última vista (o nunca vistos).
- **D-09** Dormido: `snoozed_until` (YYYY-MM-DD, tiene que ser > hoy). Se despierta solo cuando `snoozed_until <= hoy` (hoy en la tz de la sede del tema, o la de la primera sede activa del tenant si el tema no tiene sede). Lo despiertan el job cada 30 min y, de forma perezosa, el listado. Al despertar: status `abierto` + evento `reabierto` con payload `{ auto: true }`.
- **D-10** Roles: `OFFICE_ROLES = owner | admin | gestion` en API y admin. `admin_sede` y `recepcion` quedan afuera en v1 (gestión central). Fácil de abrir después.

### Temas automáticos (job `office-auto-topics`, cada 30 min, por tenant)
- **D-11** Wellhub con error: `wellhub_events.status='error'` de los últimos 7 días, `tenant_id = ctx`. Título "Webhook de Wellhub con error (<event_type>)", body = `error` recortado a 500. Se cierra solo (evento `sistema`, "Wellhub lo reprocesó bien") cuando el evento deja de estar en `error`.
- **D-12** Jornada sin cerrar: `staff_shifts.checked_out_at IS NULL` y `shift_date < hoy` en la tz de la sede (la misma regla `staleOpen` del dashboard de check-in). Título "Jornada sin cerrar: <Nombre> en <Sede> (<fecha>)". Se cierra solo cuando aparece `checked_out_at`.
- **D-13** Clase de mañana sin profe: para cada sede activa, mañana en su tz, cada `schedules` activo de ese día (no borrado, sin `schedule_exceptions` para esa fecha) cuyo profe no resuelve: `coach_user_id` NULL y sin change-point en `class_coach_assignments` para (sede, día, franja) con `week_start_date <= lunes de mañana`. Título "Clase sin profe mañana: <Actividad> <HH:MM> en <Sede>". Se cierra solo cuando el profe resuelve o cuando la fecha ya pasó ("pasó la fecha").
- **D-14** "Cobro rechazado" NO existe como dato (no hay pasarela: los cobros son manuales). Queda afuera. Documentado para Franco.
- **D-23** Arqueo con diferencia (decidido con el dueño): `cash_counts` de cajas de efectivo activas, solo los últimos 30 días. **Cualquier `difference != 0`** abre tema (`difference` = contado − esperado; el esperado sale del saldo del ledger y un arqueo NO lo modifica, así que una diferencia que nadie ajusta se repite arqueo tras arqueo: un episodio puede durar varios arqueos). **A lo sumo un tema abierto por caja.** Episodio = racha de arqueos con diferencia después del último arqueo en 0; `source_key = arqueo_dif:<cashRegisterId>:<cashCountId del arqueo que abre el episodio>` (si la racha arrancó antes de la ventana de 30 días se usa el arqueo que realmente la abrió, para que la key no cambie y un tema cerrado a mano no se reabra). Título "Arqueo con diferencia: <Caja> (<+/-$monto>)" en la moneda de la caja; body = fecha/hora (tz de la sede de la caja), quién contó, esperado, contado, diferencia y la nota recortada a 500. Vínculo `target_kind='caja'` (label = nombre de la caja), `branch_id` = sede de la caja. Un arqueo posterior con diferencia dentro del mismo episodio NO abre otro tema: agrega un evento `sistema` "Nuevo arqueo (<fecha>): diferencia <monto>" una sola vez por arqueo (idempotente por `payload.cashCountId`) y sube `last_activity_at`. Se cierra solo ("El último arqueo dio sin diferencia") cuando el último arqueo da 0, o ("más de 30 días") cuando el último arqueo salió de la ventana. Cerrado a mano no se reabre ese episodio; uno nuevo arranca con un arqueo con diferencia posterior a uno en 0. En el admin el vínculo lleva a `/caja?tab=retiros` (ahí viven los arqueos).
- **D-24** Wellhub: clases de mañana sin publicar. Por sede activa con `branches.wellhub_gym_id` (y solo si Wellhub está configurado, igual que el cron de sync): los horarios que el sync DEBERÍA publicar mañana (tz de la sede) y no tienen fila en `wellhub_slots(schedule_id, session_date)`. La elegibilidad es la del sync y vive en un helper compartido (`wellhub/eligibility.ts`, usado por `WellhubSyncService.syncSlots` y por el detector): actividad activa + `wellhub_enabled` + no especial, horario activo, sin `schedule_exceptions` ni feriado del país de la sede. Solo cuentan los horarios creados hace más de 2 h (para no ganarle al sync de 30 min). UN tema por sede y fecha, `source_key = wellhub_sin_publicar:<branchId>:<YYYY-MM-DD>`; título "Wellhub: N clases de mañana sin publicar en <Sede>" (singular con N=1), body = lista "<Actividad> HH:MM" (máx 20 líneas + "y N más"). Si la cantidad cambia entre corridas se reescribe título y body del mismo tema (sin evento, sin tocar `last_activity_at`); al pasar a ser "de hoy" el título dice "de hoy" y solo cuentan las clases que todavía no empezaron. Se cierra solo ("Wellhub ya tiene todas las clases publicadas") o al pasar la fecha ("Pasó la fecha"). Vínculo `target_kind='sede'` (id = sede, label = nombre real de la sede), `branch_id` = esa sede; en el admin lleva a `/horarios` (el reporte Wellhub de Reportes es de visitas de socios, no de publicación).
- **D-25** Tablero: leads sin cargar (fase 206, `weekly_board_leads`). Desde el **martes** de la semana W+1 (en `BOARD_TZ`, la zona fija de Argentina del Tablero; el lunes es la reunión de carga y no se avisa), si alguna sede que carga leads no tiene fila en `weekly_board_leads` para la semana W (la que terminó). "Sedes que cargan leads" = sedes activas y físicas (no virtuales) del gimnasio (`weekly-board/leads-branches.ts`, la misma regla que `saveLeads`); la lista es del gimnasio entero, sin recorte por país ni rol (un tema de Oficina es del gimnasio, aunque el Tablero de un admin muestre solo su país). UN tema agregado por semana, `source_key = tablero_leads:<lunes de W YYYY-MM-DD>`; título "Tablero: faltan los leads de la semana del dd/mm (N sedes)" (singular "1 sede"), body = nombres reales de las sedes faltantes, una por línea (máx 20 + "y N más"). Si N cambia entre corridas se reescribe título y body (sin evento, sin tocar `last_activity_at`, igual que D-24). Se cierra solo ("Ya están cargados los leads de todas las sedes") o cuando W deja de ser editable según `isLeadsEditableWeek`, es decir el lunes de W+2 ("Se cerró la ventana de carga de esa semana"); si el gimnasio se queda sin sedes que carguen leads, el tema abierto se cierra también. Cerrado a mano no se reabre (unique del `source_key`). Vínculo `target_kind='tablero'`, `branch_id` NULL, label "Semana del dd/mm"; `target_id` no es el id de ninguna tabla: `createSystemTopic` exige kind+id juntos, así que va el lunes de W como número `YYYYMMDD` (neutro, único por semana, no choca con ids de socio porque el filtro siempre lleva kind). En el admin lleva a `/tablero` (icono `dashboard`) **solo si el rol está en `TABLERO_ROLES`** (owner/admin): `gestion` ve el tema, pero sin link (chip no clickeable), porque el Tablero lo rebota con 403.

### Admin
- **D-15** Ítem "Oficina" en la categoría **Gerencia** del menú (después de Tablero; la categoría se muestra a `gestion` aunque no vea Tablero), icono `forum`, con badge (clave `oficina`). Rutas `/oficina` y `/oficina/:topicId`.
- **D-16** Pantalla única, dos columnas en escritorio (lista izquierda, detalle derecha, patrón `row no-wrap` de Cobros). En móvil (`$q.screen.lt.md`) la lista ocupa todo y al tocar un tema el detalle reemplaza la lista con botón volver.
- **D-17** Filtros: vista (`Abiertos` por defecto, `Míos`, `Dormidos`, `Cerrados`), origen (`Todos` / `Manuales` / `Del sistema`), búsqueda por texto. Lista ordenada por `lastActivityAt` desc. Punto de "nuevo" cuando `unseen`.
- **D-18** Detalle: título, chips de estado/origen, vínculo clickeable (socio → `/alumnos/:id`, jornada → `/check-in`, horario → `/horarios`), responsables (select múltiple de staff con chips), acciones `Tomar` (me suma al conjunto) / `Soltar` (me saca), `Dormir hasta…` (q-date en popup), `Cerrar` / `Reabrir`, `Editar`. Línea de tiempo: comentarios como burbujas con iniciales, eventos no-comentario como líneas discretas. Compositor con menciones `@` (menú de staff al tipear `@`).
- **D-19** Polling de 60 s con `visibilitychange`, igual que Renovaciones. Sin websockets.
- **D-20** Ficha del socio: pestaña "Oficina" (gateada por rol) con los temas vinculados a ese socio y botón "Nuevo tema" que abre el diálogo con el socio ya vinculado.
- **D-21** Util nuevo `relativeTime(iso, now)` ("recién", "hace 5 min", "hace 2 h", "ayer", "hace 3 días", fecha corta) con test unitario.
- **D-22** Paleta de marca: solo `color="primary"` / clases `bg-*` de Quasar, sin hex, sin azul.

</decisions>

<api_contract>
## Contrato de la API (prefijo `/api/admin/office`, roles OFFICE_ROLES, 403 "Acceso denegado" para el resto)

Tipos compartidos (copiar al composable del admin):
```ts
type OfficeTopicStatus = 'abierto' | 'dormido' | 'cerrado';
type OfficeTopicOrigin = 'manual' | 'sistema';
type OfficeTargetKind = 'socio' | 'jornada' | 'wellhub_evento' | 'horario';
type OfficeEventType = 'creado' | 'comentario' | 'asignado' | 'tomado' | 'desasignado' | 'dormido' | 'cerrado' | 'reabierto' | 'editado' | 'sistema';
interface OfficePerson { id: number; firstName: string | null; lastName: string | null }
interface OfficeEvent { id: number; type: OfficeEventType; body: string | null; payload: Record<string, unknown> | null; actor: OfficePerson | null; createdAt: string }
interface OfficeTopicListItem {
  id: number; title: string; status: OfficeTopicStatus; origin: OfficeTopicOrigin;
  targetKind: OfficeTargetKind | null; targetId: number | null; targetLabel: string | null;
  branchId: number | null; branchName: string | null;
  assignees: OfficePerson[]; /* ordenados por nombre */ createdBy: OfficePerson | null;
  snoozedUntil: string | null; lastActivityAt: string; createdAt: string; closedAt: string | null;
  commentCount: number;
  lastEvent: { type: OfficeEventType; body: string | null; actorFirstName: string | null; createdAt: string } | null;
  unseen: boolean;
}
interface OfficeTopicDetail extends OfficeTopicListItem { body: string | null; events: OfficeEvent[] }
interface OfficeStaff { id: number; firstName: string | null; lastName: string | null; role: string }
interface OfficeBadge { count: number; mentions: number; assigned: number }
```

Rutas (8):
1. `GET /topics?view=abiertos|mios|dormidos|cerrados|todos&origin=manual|sistema&q=&targetKind=&targetId=&limit=` → `{ topics: OfficeTopicListItem[] }`. `view` default `abiertos`. `mios` = temas con status ≠ cerrado donde estoy entre los responsables. `limit` default 200, máx 500. Antes de listar despierta los dormidos vencidos (D-09).
2. `POST /topics` body `{ title, body?, targetKind?, targetId?, targetLabel?, branchId?, assigneeIds?: number[] (máx 20, se deduplica), mentionUserIds? }` → 201 `{ topic: OfficeTopicDetail }`. `title` 1..160, `body` ≤ 4000. Si `targetKind='socio'` y falta `targetLabel`, se resuelve "Nombre Apellido" desde `users` (404 si el socio no es del tenant). `targetKind` y `targetId` van juntos (400 si viene uno solo).
3. `GET /topics/:id` → `{ topic: OfficeTopicDetail }` (eventos ascendentes por fecha). 404 si no existe o es de otro tenant.
4. `PATCH /topics/:id` body `{ title?, body?, assigneeIds?: number[], status?: 'abierto' | 'cerrado', snoozedUntil?: string | null, note? }` → `{ topic: OfficeTopicDetail }`.
   - `assigneeIds` REEMPLAZA el conjunto completo de responsables (`[]` = sin responsables; ausente = no se toca). Se deduplica en el servidor. 400 si algún id AGREGADO no es staff activo del tenant (los que ya eran responsables no se revalidan). "Tomar" no tiene endpoint: el cliente manda el conjunto actual + él mismo. Eventos según viejo vs nuevo: solo el actor se agregó a sí mismo → `tomado`; hay agregados → `asignado`; hay quitados → `desasignado`; payload `{ assigneeIds: number[], assigneeNames: string[] }` (los agregados / los quitados). Sin cambios no hay evento. Al crear con responsables: `tomado` si es solo el actor, si no `asignado` con todos.
   - `status: 'cerrado'` → `closed_at/closed_by`, evento `cerrado` con body = `note`. `status: 'abierto'` desde cerrado o dormido → evento `reabierto`, limpia `snoozed_until` y `closed_*`.
   - `snoozedUntil: 'YYYY-MM-DD'` (> hoy, si no 400) → status `dormido`, evento `dormido` payload `{ until }`. 409 si el tema está cerrado.
   - `title`/`body` → evento `editado` payload `{ fields: [...] }`.
   - Toda mutación actualiza `last_activity_at` y la lectura del actor (D-07).
5. `POST /topics/:id/comments` body `{ body (1..4000), mentionUserIds? }` → 201 `{ topic: OfficeTopicDetail }`. 409 si el tema está cerrado (hay que reabrirlo primero: el admin ofrece "Reabrir y comentar").
6. `POST /topics/:id/seen` → 204. Upsert de lectura + marca leídas mis menciones de ese tema.
7. `GET /badge` → `OfficeBadge` (D-08).
8. `GET /staff` → `{ staff: OfficeStaff[] }`: usuarios del tenant con `role` ∉ {member, tv}, `staff_disabled = false`, orden por nombre.

Errores con `handleServiceError` (`shared/error-handler.ts`): `NotFoundError`, `BadRequestError`, `ConflictError`.
</api_contract>

<open_for_franco>
## Dudas anotadas (no bloquean; decisión conservadora tomada)
1. ¿`admin_sede` tendría que ver Oficina (acotado a su sede)? v1: no.
2. ¿Querés notificación por mail/push al staff cuando lo mencionan? v1: solo badge en el menú (no hay push ni mail al staff en el sistema).
3. El tercer automático (clase sin profe) depende de la resolución del roster; si en la práctica hace ruido, se apaga con un flag en el job.
4. "Cobro rechazado" no existe como dato (D-14). Si querés "cobro observado" como tema, es un detector más.
</open_for_franco>
