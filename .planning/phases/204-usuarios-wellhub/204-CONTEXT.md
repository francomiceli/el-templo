# Phase 204: Usuarios Wellhub como tipo de usuario - Context

**Gathered:** 2026-10-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Que quien usa Wellhub sea un dato visible y medible en El Templo, sin llenar el admin de controles nuevos:

- El staff lo distingue en el listado de alumnos, la ficha, Cobros y Horarios.
- Las métricas lo cuentan dentro de los totales y lo muestran como una categoría más donde ya hay categorías.
- Hay un reporte Wellhub por sede y mes.
- Desde la ficha se puede convertir a un Wellhub en socio y unir una ficha duplicada.
- Una reserva o visita Wellhub nunca toca el plan de un socio.

Alcance: `el-templo-api` + `el-templo-admin`. La app de alumnos (`el-templo-app`) NO se toca.

Disparador: piloto Wellhub en Moreno en producción (gym 856836, 2026-10-27). El primer usuario real (Palladino, user 4053) era un ex-alumno vinculado por email y quedó `inactivo` sin ninguna señal de Wellhub.

</domain>

<decisions>
## Implementation Decisions

### Ya decidido en julio (integración Wellhub, NO re-litigar)
- El visitante Wellhub es un usuario real (`users.status='wellhub'` + `users.gympass_id` único). Si el email ya existe, se vincula a ese usuario poniéndole `gympass_id`.
- La reserva Wellhub es un booking real con `source='wellhub'`, y el cupo es compartido con los socios.
- La visita Wellhub es `attendance.source='wellhub'` y NO consume classesRemaining, AURA ni completed_sessions.
- El visitante Wellhub está FUERA del pipeline de leads/pruebas: sin seguimientos ni campañas de prueba.
- Solo se publica la actividad General (`activities.wellhub_enabled`, mig 0295).

### Identidad y etiqueta
- **D-01:** El estado de la persona NO cambia por usar Wellhub. Un ex-alumno vinculado sigue `inactivo` y se ve **"Inactivo · Wellhub"**. Un visitante nuevo tiene estado `wellhub`, con label "Wellhub", color propio y entrada en todos los mapas de estado del admin (hoy el badge sale vacío).
- **D-02:** La etiqueta "Wellhub" sale de `gympass_id` y es **permanente**. En la ficha se ve la **última visita Wellhub**.
- **D-03:** Regla única de visibilidad de la etiqueta: **se ve siempre que la persona NO sea socio activo**. Un socio activo, sea convertido o socio que también usa Wellhub, se ve solo "Activo", sin marca. Si a un convertido se le vence el plan y queda inactivo, la etiqueta vuelve a verse.
- **D-04:** La conversión (asociarse al templo) **se hace desde la ficha del alumno** y queda registrada como evento (fecha, sede, plan/suscripción) para el reporte, aunque después no se muestre ninguna marca.
- **D-05:** Ex-alumno que entra por Wellhub con OTRO email, lo que genera un usuario duplicado: en la ficha del Wellhub nuevo, el staff puede **"Unir con alumno existente"**. El `gympass_id`, las reservas, las visitas y las filas Wellhub (`wellhub_bookings`, etc.) pasan a la ficha vieja y el duplicado se da de baja.
- **D-06:** El visitante Wellhub sin plan **NO accede a la app** de El Templo (igual que hoy). Al convertirlo, recibe acceso (ver D-17).

### Operación del staff
- **D-07:** Listado de alumnos: **toggle "Solo Wellhub"** al lado de "Solo deudores", combinable con el select Estado, que NO cambia ni suma opciones. El toggle muestra:
  - (a) a quienes tienen la etiqueta Wellhub visible (D-03: `gympass_id` y no socio activo);
  - (b) **además** a socios activos que tuvieron una visita o reserva Wellhub en los últimos 30 días.
  El filtro tiene que funcionar en el API (hoy `status=wellhub` da 400).
- **D-08:** Export xlsx: la columna Estado muestra "Wellhub" (hoy vacía). Para la etiqueta, una columna o un sufijo; el planner elige lo más simple.
- **D-09:** Cobros: el Wellhub aparece en el buscador **con badge Wellhub**, y **al seleccionarlo sale un aviso que lo manda a su ficha para convertirlo**. No se cobra desde Cobros sin pasar por la conversión.
- **D-10:** Horarios: **chip "Wellhub" junto al nombre** en la lista de la clase, **desde la reserva** (antes del check-in), según el origen de la reserva o visita. Por eso también marca al socio activo que reservó por Wellhub. Sin contador adicional en el resumen del horario.
- **D-11:** Reserva Wellhub en Horarios: el staff **NO puede cancelarla**. Se gestiona desde Wellhub: botón deshabilitado con texto del tipo "Se gestiona desde la app de Wellhub", y el API también lo rechaza. El staff **SÍ puede marcarle asistencia a mano** (ver D-19).
- **D-12:** Campaña `bajas`: el ex-alumno inactivo con `gympass_id` **sale de la audiencia**. Ya viene, así que la recuperación se hace en persona o desde su ficha.

### Métricas y reporte
- **D-13:** **Wellhub SUMA a los totales.** Principio rector de Franco: *Wellhub es un dato más; NO llenar las páginas de botones ni toggles de Wellhub; solo donde ya se muestran varias categorías, agregar Wellhub como una más.* Donde hay un número solo, sigue siendo el total. **No se agregan switches "incluir Wellhub".**
- **D-14:** Ejemplos a aplicar: el log de accesos con filtro de fuente (hoy QR/Manual, y las visitas Wellhub salen como "Manual") suma la categoría "Wellhub". Lo mismo en cualquier desglose existente por fuente, segmento o tipo. El planner/researcher identifica qué pantallas ya tienen categorías. Las métricas de número único (check-ins diarios, heatmap, promedio, no-show rate, socios únicos) quedan como total, que incluye Wellhub.
- **D-15:** Embudo de conversión: Wellhub entra como **un origen más** del embudo, con su propia tasa a socio. NO entra al pipeline de leads/pruebas ni a sus seguimientos o campañas.
- **D-16:** **Un único reporte Wellhub** dentro de Reportes, por sede y mes, con:
  1. visitas validadas por Wellhub (check-ins que pasaron por su app, para controlar contra la liquidación de Wellhub);
  2. presentes a mano (visitas Wellhub marcadas por el staff, que Wellhub no ve ni paga);
  3. personas y frecuencia (únicos, nuevos vs ex-alumnos vs socios, visitas por persona);
  4. reservas, cancelaciones, no-shows y conversiones a socio (fecha + plan).

### Socio activo que usa Wellhub
- **D-18:** **Se permite, separado del plan.** Una reserva o visita Wellhub de un socio activo:
  - no le descuenta clases si es no-show (hoy `el-templo-api/src/jobs/mark-no-shows.ts` descuenta sin mirar `source`: BUG);
  - no consume su límite diario ni semanal (hoy `attendance/service.ts` cuenta la asistencia Wellhub como regular y puede bloquear su check-in propio: BUG).
  Su visita propia del día sigue disponible.

### Conversión y ficha (Franco: "andá con lo recomendado y más completo")
- **D-17:** "Asociar al templo" en la ficha del Wellhub (CTA visible cuando la etiqueta está visible) **reusa el alta de membresía o cobro existente** del admin, sin flujo paralelo. Al confirmarse el primer plan pago:
  - el estado pasa a `activo` (ya ocurre en `subscriptions/service.ts:~7294`);
  - se registra el evento de conversión: usuario, sede, suscripción/plan, fecha y si era nuevo o ex-alumno;
  - **el alumno recibe acceso a la app** con el mecanismo existente de alta de acceso o invitación. El researcher verifica cuál: invitaciones de la fase 194, set/reset password. Si no hay uno que encaje, mostrar "Enviar acceso a la app" en la ficha como acción explícita.
  - El aviso de Cobros (D-09) lleva a este mismo CTA.
- **D-20:** Ficha del visitante Wellhub (sin plan): mantiene las pestañas que aplican (asistencias, reservas, datos) y agrega **arriba una card "Wellhub"** con: ID de Wellhub, vinculado desde, última visita, visitas del mes y totales, sedes visitadas, próxima reserva Wellhub y el CTA "Asociar al templo". Las pestañas o acciones que solo tienen sentido con plan no deben romper ni confundir ("Sin plan" está bien). El historial de asistencias y reservas muestra el origen "Wellhub" con label (hoy `sourceLabels['wellhub']` no existe y sale un badge vacío).

### Claude's Discretion (Franco no lo discutió: ir con lo recomendado)
- **D-19 Presente a mano:** cuando el staff marca presente a una reserva Wellhub, la visita **cuenta como visita Wellhub con marca "a mano"**: va al ítem 2 del reporte y NO al 1. Confirma la reserva, así que el job no la convierte en no-show, y no toca el plan del socio. Modelado (columna o valor de `source`): lo decide el planner. Preferir lo explícito y lo que no rompa los conteos existentes.
- **D-21 Unir duplicados (detalle de D-05):**
  - Solo roles admin/owner.
  - Solo cuando la ficha a absorber es un Wellhub "puro": estado `wellhub`, sin suscripciones ni pagos. Nunca se fusionan dos fichas con historia propia.
  - Transaccional, con registro de auditoría.
  - El duplicado se da de baja con el soft-delete existente (`deletedAt`).
  - No hay "deshacer" en UI.
  - Si la ficha destino ya tiene `gympass_id` distinto, se rechaza con un mensaje claro.
- Nombres, colores y textos exactos de badges y chips: dentro de la paleta de marca (cálida, sin azul) y del sistema de badges existente (`useStatusBadge`).
- Cómo se calcula "última visita" y "sedes visitadas" (query vs columna cacheada): lo decide el planner, priorizando lo simple.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Inventario de la fase (mapa del código con file:line)
- `.planning/phases/204-usuarios-wellhub/204-INVENTARIO.md`: cómo trata hoy el sistema a los Wellhub en admin, listados, audiencias, métricas, Horarios y app, y las brechas. **Punto de partida obligatorio.**

### Integración Wellhub existente
- `el-templo-api/src/modules/wellhub/`: service (webhook, alta y vinculación de visitante), sync-service, config y client.
- `el-templo-api/src/db/schema/wellhub.ts`: tablas `wellhub_classes`, `wellhub_slots`, `wellhub_bookings` y `wellhub_events`.
- `el-templo-api/src/db/migrations/0186_*.sql`: `gympass_id`, status `wellhub`, `attendance_source` wellhub y `branches.wellhub_gym_id`.
- `el-templo-api/test/wellhub/`: tests existentes de webhook, booking y sync, como patrón para los nuevos.

### Bugs a corregir
- `el-templo-api/src/jobs/mark-no-shows.ts:~150-200`: descuenta clases sin mirar `bookings.source`.
- `el-templo-api/src/modules/attendance/service.ts:~229,~1393`: límite diario y semanal.

### Reglas del repo
- `CLAUDE.md`: tests de integración obligatorios para rutas nuevas, sin `any` y logger.
- `.claude/skills/el-templo-db-migrations/SKILL.md`: migraciones a mano, numeración y trampa de `;` en comentarios. **La próxima migración se numera después de la más alta en origin/master Y en staging:** staging tiene hasta 0297. Verificar contra `origin/staging` antes de numerar. 0295/0296 ya existen.
- `.claude/skills/el-templo-change-control/SKILL.md`: no pushear sin OK.
- Tenancy: toda tabla nueva gym-owned lleva `tenant_id` + los 5 conteos fijos (memoria `reference_tabla_gym_owned_nueva_cinco_conteos`). Una ruta o job nuevo dispara los 3 gates de tenancy (memoria `reference_gates_tenancy_ruta_job_nueva`).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `el-templo-admin/src/composables/useStatusBadge.ts`: mapa único de estados (label y color). Sumar `wellhub` acá y en el tipo `UserStatus` (`el-templo-admin/src/types/member.ts:102`, `useMembersApi.ts:55,82`).
- `el-templo-admin/src/pages/AlumnosPage.vue`: ya tiene el toggle "Solo deudores", que es el patrón a copiar para "Solo Wellhub".
- `el-templo-admin/src/types/attendance.ts:29` `sourceLabels`: sumar `wellhub`.
- `el-templo-admin/src/components/SlotAttendancePanel.vue:56` ya pinta el source, pero no se usa en ninguna parte. Puede servir de referencia para el chip en `SlotDetailDialog.vue`.
- El alta de membresía y los cobros del admin (`RegisterPaymentDialog.vue` y el flujo de "Cargar membresía") se reusan para la conversión (D-17).

### Established Patterns
- Estado efectivo calculado en SQL (`el-templo-api/src/modules/members/service.ts:288-301`).
- Schemas Fastify con enums de status: `members/schemas.ts:28,84,212,716,754`. Sumar `wellhub` donde corresponda.
- Audiencias de campañas: `el-templo-api/src/modules/campaigns/audience-service.ts:138` (`bajas`).
- Log de accesos: `el-templo-api/src/modules/reports/service.ts:371` + `el-templo-api/src/modules/reports/schemas.ts:48` + `el-templo-admin/src/pages/ReportesPage.vue:957,1051`.
- Embudo: `el-templo-api/src/modules/analytics/funnel-service.ts:119-149`.

### Integration Points
- Roster de Horarios: `GET slot attendance` (`el-templo-api/src/modules/attendance/service.ts:570-815`, schema `attendance/schemas.ts:114`) tiene que exponer el `source` de la RESERVA, no solo el de la asistencia. También el detalle de reservas del slot (`el-templo-api/src/modules/scheduling/service.ts:479-640`).
- Cancelación de reservas por staff: `booking-service.ts` (adminRemove), que tiene que rechazar las `source='wellhub'`.
- Conversión: `subscriptions/service.ts:~7294-7304` es donde el estado pasa a `activo`, y es el punto para registrar el evento.
- Webhook de check-in Wellhub (`modules/wellhub/service.ts`): el origen de la visita "validada".

</code_context>

<specifics>
## Specific Ideas

- Franco: "que Wellhub sea un dato más, pero que no llenes todas las páginas de botones y toggles relacionados a Wellhub; sólo donde se muestran varias categorías, agregar Wellhub como una más". El único control nuevo explícitamente pedido es el toggle "Solo Wellhub" del listado de alumnos.
- Caso real para tests y UAT: un ex-alumno inactivo vinculado por email (como Palladino), un visitante nuevo y un socio activo que reserva por Wellhub. Los tests cubren los tres.
- La migración de datos de prod se hace por migraciones, no a mano (memoria `feedback_prod_data_via_migrations`), si hace falta backfill del evento de conversión. Hoy no hay conversiones históricas: el piloto arrancó 2026-10-27.

</specifics>

<deferred>
## Deferred Ideas

- Acceso limitado a la app para visitantes Wellhub sin plan (ver horarios o rutina como canal de conversión). Franco: "no por ahora".
- Aviso automático de "posible duplicado" por nombre o teléfono. Por ahora la unión es manual (D-05).
- Activar Wellhub en las otras 5 sedes: migración aparte cuando Wellhub las configure. No es parte de esta fase.

</deferred>

---

*Phase: 204-usuarios-wellhub*
*Context gathered: 2026-10-27*
