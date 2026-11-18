# Phase 215: Regalar Aura - Context

**Gathered:** 2026-11-17
**Status:** Discuss cerrado. Se planifica cuando la fase 214 esté ejecutada

<domain>
## Phase Boundary

Una persona le da Aura a otra como reconocimiento: los alumnos a un compañero de la clase a la que
fueron, y los profes a sus alumnos del día. Quien recibe se entera por push y por una bandeja de
notificaciones nueva, que además guarda todos los avisos que la app manda de ahora en más.

Fuera del milestone v6.1. Depende de la fase 214, que todavía no está en master: por ahora los documentos
viven en la rama `feat/comunidad-anotados-aura` (worktree `et-comunidad`). La rama, el worktree y los
números de migración de la 215 se definen al planificar.

**No entra:** la pestaña Comunidad con el movimiento público de regalos. Es la fase 216 (ver Deferred).

</domain>

<decisions>
## Implementation Decisions

### Quién regala y a quién

- **D-01:** Regalan **alumnos y profes**. Matías en la reunión: "el Nach te dio 10 puntos porque…" y "que
  todos lo puedan regalar".
- **D-02:** **Alumno:** un regalo por cada clase a la que asiste, a **un solo compañero** que también
  asistió a esa clase. Franco: "1 punto por clase (si paga más clases, tiene más puntos para regalar)".
  No hay tope semanal de regalos: quien va a más clases regala más.
- **D-03:** **Profe:** una vez por día a cada persona que fue su alumno ese día, **sin tope de cantidad**.
  Franco lo mantuvo aun con la advertencia de que puede volverse un extra automático por venir a clase.
- **D-04:** **No se le regala al profe.** El regalo del alumno es solo para compañeros.
- **D-05:** Un alumno no puede regalarle a la misma persona **más de 2 veces por semana**.
- **D-06:** **Sin tope de lo que una persona recibe.** Franco eligió "sin tope" sabiendo que alguien muy
  querido puede sumar hasta 19 puntos en una clase de 20.
- **D-07:** Quien se ocultó de la lista de anotados (214) **no participa**: no aparece entre las caras,
  así que no recibe, y como no ve a los demás tampoco regala. Franco no eligió la variante "recibe solo
  del profe", así que tampoco recibe del profe. Vuelve a participar cuando se hace visible.
- **D-08:** Regala quien tiene la **asistencia registrada** en esa clase, y solo a quien también la tiene.
  Una reserva sin asistencia no alcanza. (Criterio mío, informado a Franco sin objeción.)

### De dónde salen y cuánto valen

- **D-09:** Los puntos salen de un **cupo aparte**: regalar no le descuenta Aura a quien regala. No choca
  con la 214 (el Aura que se muestra es todo lo ganado y no baja).
- **D-10:** El regalo de un alumno vale **1 punto**.
- **D-11:** El regalo de un profe vale **2 puntos, editable desde el admin**.
- **D-12:** El regalo de una clase se puede dar **hasta el final del día siguiente**. Después se pierde.
- **D-13:** Lo recibido suma al Aura de la persona como cualquier otro movimiento y aparece en su detalle
  privado (214). No cuenta para el tope del día de 5 entre clase y app (214, D-64): es un extra, como
  estirar. (Lectura mía.)

### Cómo se regala

- **D-14:** El alumno regala **desde Mi Templo, después de la clase**: la card de hoy ofrece dar Aura a un
  compañero (como hoy ofrece "Estirar") y abre las caras de quienes asistieron.
- **D-15:** El profe regala desde el **panel de asistencia del admin**, donde ya marca quién vino.
  (Supuesto mío, informado a Franco sin objeción.)
- **D-16:** El regalo lleva un **motivo elegido de una lista**: "Buena técnica", "Constancia", "Buena
  energía" y "Me ayudó". Sin texto libre, para que no haya nada que moderar.

### Cómo se entera quien recibe

- **D-17:** Franco: "notificación push + bandeja de notificaciones entre ícono de perfil e ícono de
  desloguearse". Le llega una push y el aviso queda en una **bandeja de notificaciones nueva**, en la
  barra de arriba, entre el acceso al perfil y cerrar sesión.
- **D-18:** La bandeja guarda **todos los avisos que la app manda por push de ahora en más** (no solo
  regalos), con marca de sin leer.
- **D-19:** El aviso dice quién regaló y el motivo. (Supuesto mío: Franco no lo dijo con esas palabras,
  pero en la 216 imagina los regalos a la vista con nombre.)

### Cuidar que no se abuse

- **D-20:** El staff puede **anular un regalo** desde el admin, y el punto se descuenta. (Criterio mío,
  informado sin objeción.)
- **D-21:** Medición de las primeras 4 semanas: regalos por semana y qué porcentaje de quienes asisten
  regala. (Criterio mío, informado sin objeción.)
- **D-22:** Los textos de la 215 **no prometen que el regalo es privado**: la 216 los va a mostrar en la
  pestaña Comunidad.

### Claude's Discretion

- Quién cuenta como "el profe" de una clase (grilla de profes, suplencias, quien marca la asistencia).
- Qué pasa con un regalo si después se anula la asistencia de quien lo dio o de quien lo recibió.
- Cuánto tiempo guarda la bandeja cada aviso, cómo se marca leído y a qué pantalla lleva tocar cada uno.
- Categoría de preferencias para la push de regalos (si se puede silenciar aparte).
- Cómo entran en la barra de arriba el selector de nivel (solo en Entrenar, de la 214), el perfil, la
  campana y cerrar sesión: el UI-SPEC de la 214 ya marcó que a 360 y 390 px la barra se desborda.
- Dónde se edita el valor del regalo del profe dentro de Ajustes del admin.
- Los usuarios que vienen por Wellhub siguen las reglas de la 214: aparecen entre las caras y pueden
  recibir, pero no ven la lista y por eso no regalan.

</decisions>

<canonical_refs>
## Canonical References

**Los agentes que sigan DEBEN leer esto antes de planificar o implementar.**

### Fase 214 (base de todo)

- `.planning/phases/214-comunidad-anotados-aura/214-CONTEXT.md` — Escala de Aura (una clase = 5), Aura
  ganada como número visible (D-02), visibilidad y ocultos (D-05 a D-09), sin etiquetas (D-52), Aura
  visible para el staff (D-58), tope del día (D-64), detalle privado (D-57), y la sección "Fase
  siguiente: regalar Aura entre personas".
- `.planning/phases/214-comunidad-anotados-aura/214-UI-SPEC.md` — Lenguaje visual: hoja con caras en
  grilla, ficha clara de Aura, celebración, barra de arriba y su desborde a 360 px.
- `.planning/phases/214-comunidad-anotados-aura/214-*-PLAN.md` — Qué deja construido la 214: montos en
  constantes, Aura ganada, rutas de anotados, visibilidad, fotos y detalle de movimientos.

### Investigación previa

- `.planning/phases/214-comunidad-anotados-aura/214-AURA-VALORES-RESEARCH.md` §2 y §8 — Cómo resuelven
  el regalo entre personas Bonusly, HeyTaco, KudosNow y Peloton, con fuentes.
- `.planning/phases/214-comunidad-anotados-aura/214-BRIEF.md` — Extracto de la reunión del 2026-11-16.

### Precedentes en el código

- `.planning/phases/213-estiramiento-post-clase/213-CONTEXT.md` — Oferta en la card de hoy después de la
  clase y push asociada: el mismo momento que usa D-14.

### Discusión

- `.planning/phases/215-regalar-aura/215-DISCUSSION-LOG.md` — Opciones presentadas y respuestas literales
  de Franco. Solo auditoría.

</canonical_refs>

<code_context>
## Existing Code Insights

Verificado el 2026-11-17 sobre el worktree `et-comunidad`. La 214 todavía no está ejecutada: lo que ella
agrega figura en sus planes, no en el código.

### Reusable Assets

- `el-templo-api/src/db/schema/aura-transactions.ts:22` y `el-templo-api/src/modules/aura/types.ts:11` —
  La fuente `social` ya existe en el enum de Aura, sin uso. `aura_config` la tiene sembrada en 5.
- `el-templo-admin/src/components/SlotAttendancePanel.vue` — Panel donde el profe marca la asistencia de
  su clase. Lugar natural para D-15.
- `el-templo-app/src/modules/progression/pages/MiTemplo.vue` y la card de hoy — Ya ofrece "Estirar"
  después de la clase (fase 213). Precedente de D-14.
- `el-templo-api/src/db/schema/notifications.ts` — `deviceTokens` (:96), `notificationTemplates` (:123),
  `notificationPreferences` (:185), `pendingNotifications` (:220).

### Established Patterns

- **No hay bandeja de notificaciones.** `pending_notifications` se purga a las 24 horas y la app no tiene
  ninguna pantalla de avisos. D-17 y D-18 son tabla, rutas y pantalla nuevas.
- **Barra de arriba:** `el-templo-app/src/layouts/MainLayout.vue:24-29` tiene hoy el acceso al perfil y
  cerrar sesión. En escritorio no hay barra de arriba.
- **Gates de tenancy, fast-json-stringify y migraciones a mano:** las mismas reglas que en la 214
  (`214-PATTERNS.md`).
- **Unique del ledger de Aura:** no protege filas con `reference_id` NULL. Cada regalo necesita su propia
  referencia para no duplicarse.

### Integration Points

- El regalo se apoya en la asistencia registrada (`attendance`) para saber quién fue a cada clase.
- La lista de quienes asistieron respeta las reglas de visibilidad de la 214.
- El movimiento de regalo entra en el detalle privado de Aura de la 214 con un texto por motivo.

</code_context>

<specifics>
## Specific Ideas

- Matías: "el Nach te dio 10 puntos porque tenés alta burra" (sic), y que todos puedan regalar.
- Franco sobre el aviso: push y bandeja "entre ícono de perfil e ícono de desloguearse".
- Franco sobre el regalo del profe: "2, editable desde admin".
- Motivos aprobados por Franco: "Buena técnica", "Constancia", "Buena energía", "Me ayudó".

</specifics>

<deferred>
## Deferred Ideas

### Fase 216: pestaña Comunidad

Idea de Franco del 2026-11-17, para preparar el 2026-11-18: "la pestaña de comunidad, hoy me la imagino
conteniendo las novedades al tope y abajo, dentro de la misma card: tal persona dio tanto aura a tal
alumno (y la aclaración de la sede al lado), o el Profe Fran dio x aura a tal otra, y así".

A definir ahí:

- Que los regalos pasan a ser públicos, y cómo aparece quien se ocultó de las listas.
- La navegación: pestaña nueva en la barra de abajo y Novedades saliendo de Mi Templo.
- Qué más vive en esa pestaña.
- Si los regalos hechos durante la 215 aparecen después en el movimiento público.

</deferred>

---

*Phase: 215-regalar-aura*
*Context gathered: 2026-11-17*
