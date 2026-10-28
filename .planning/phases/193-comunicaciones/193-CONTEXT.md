# Phase 193: Comunicaciones - Context

**Gathered:** 2026-09-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Una sección única del admin, **"Comunicaciones"**, que reemplaza a "Notificaciones" y gobierna todo lo que El Templo le dice al socio y al profe, con un **destino común** (sección de la app o WhatsApp de ventas). Cuatro pestañas:

1. **Notificaciones push** (lo existente) con selector de destino en lugar del input libre de ruta.
2. **Avisos en la app**: entidad nueva de avisos pop-up (título, mensaje, botón, destino, vigencia, frecuencia por socio, alcance, métricas). Los pop-ups existentes de calificación de clase, propuestas de mejora y vencimiento de plan pasan a ser **avisos de sistema** dentro de la misma entidad.
3. **Tarjetas de Mi Templo**: las 4 tarjetas fijas del carrusel premium (mejoras, referidos, upsell, programa) con copy editable, más tarjetas libres creadas desde el editor de avisos.
4. **Avisos en TV**: texto que el profe dispara desde el control o que reemplaza la pantalla de flexibilidad inicial/final.

Más el **número de WhatsApp de ventas por país** configurable en `tenant_settings` (hoy hardcodeado en la app).

**Fase FUERA de v6.1**: rama `feat/193-comunicaciones` (worktree `~/projects/et-193`) desde `origin/master` `7c273a15`, staging-first, sin esperar al tren 182-186. Migraciones numeran **desde 0216** (prod en 0215); v6.1 renumera sus 0216/0217 locales al pushear. Toca las 3 apps → bump **minor** de la app + builds de tiendas.

</domain>

<decisions>
## Implementation Decisions

### Destino común (push, avisos, tarjetas)

- **D-01:** El destino es un valor con dos tipos: `sección de la app` o `WhatsApp de ventas`. La **lista de secciones es curada en código y compartida** (definida una vez en la API, consumida por admin y app, validada server-side). Set inicial: Mi Templo, Reservas, Programas, Referidos, Proponer mejora, Mi plan, Volver. Agregar una sección es un cambio de código chico.
- **D-02:** Para WhatsApp de ventas el **texto pre-cargado es editable por notificación/aviso/tarjeta**, con un **default global** si se deja vacío. Mismo campo en los tres lugares.
- **D-03:** La app abre WhatsApp **directo** al tocar la push (ruta interna nueva tipo `/contacto-ventas?text=` que salta a WhatsApp y deja la app en Mi Templo por detrás). Si el salto automático se bloquea (algunos Android desde una push), esa pantalla muestra un botón de respaldo.
- **D-04:** **Compatibilidad con app vieja:** el payload de la push lleva la ruta nueva **y** un fallback; la app vieja ignora el campo nuevo y aterriza en **Mi Templo** sin error. Nunca un 404.
- **D-05:** El input de texto libre "Ruta de destino" desaparece de plantillas y de envío a segmento; en su lugar va el selector de destino. La API rechaza rutas fuera de la lista.

### Arbitraje de pop-ups en la app

- **D-06:** Sigue rigiendo **un solo pop-up automático por apertura**. Cuando compiten el mismo día, el **orden es fijo en el servidor: vencimiento de plan > aviso vigente > calificación de clase > propuesta de mejora**. El editor del admin **advierte explícitamente ese orden** (texto fijo visible en la pestaña de avisos).
- **D-07:** La app deja de decidir por su cuenta: un **endpoint único "qué pop-up toca hoy"** aplica prioridad, frecuencia, alcance y vigencia y devuelve a lo sumo un aviso. Los 4 diálogos globales de `MainLayout.vue` pasan a alimentarse de ahí (el de permiso push queda fuera de esta lógica).
- **D-08:** **Calificación de clase = aviso de sistema con cadencia editable.** Default: **ventana móvil de 7 días desde la última vez que se pidió**, guardada server-side. Se sigue pidiendo solo la última clase elegible dentro de las 48 h y es salteable (fase 143, D-P1..P4 intactos).
- **D-09:** **Propuesta de mejora = aviso de sistema editable** (texto, frecuencia y destino "Proponer mejora"). Reemplaza la lógica actual de 14 días de re-prompt local + 30 días de silencio server-side por la frecuencia de la entidad de avisos.
- **D-10:** **Vencimiento de plan = aviso de sistema con solo texto y botón/WhatsApp editables.** Su regla de disparo (≤3 días, diario, supresión por cobertura, fase 144) queda **fija en código**.
- **D-11:** Frecuencias por socio de un aviso: **una vez / cada N días / cada apertura**. "Mostrado", "cerró" y "tocó el botón" se registran **server-side por socio** (eso alimenta la frecuencia y las métricas). Los avisos de sistema no se borran; pueden desactivarse (salvo vencimiento, ver D-10).

### Editor de avisos y alcance

- **D-12:** **Solo texto en v1**: título, mensaje, texto del botón, destino. Sin imagen.
- **D-13:** Alcance: **sede, país y segmento de comportamiento** (los mismos `optima/regular/alerta/ausente` de las push). Vacío = todos.
- **D-14:** Vigencia desde/hasta opcional y estado (borrador/activo/pausado, forma exacta a criterio del planner). Fuera de vigencia no se muestra.
- **D-15:** **Tarjetas del carrusel de Mi Templo:** (a) las 4 fijas (mejoras, referidos, upsell, programa) pasan a tener **copy editable** (título, texto, botón, destino) como avisos de sistema con ubicación `tarjeta`; sus reglas de visibilidad (`showUpsellBadge`, `showProgramCta`, etc.) siguen en código. (b) **Tarjetas libres:** cualquier aviso creado por el admin con ubicación `tarjeta` se suma al carrusel, con el mismo editor, destino, alcance (D-13) y vigencia (D-14) que los pop-ups, pero sin frecuencia (el carrusel se ve en cada apertura). Las libres van después de las fijas visibles; orden entre libres a criterio del planner (ej. campo de orden o fecha de creación).
- **D-16:** El editor muestra una **vista previa simple inline** del pop-up, la tarjeta o la placa de TV con el estilo real.

### Métricas

- **D-17:** Por aviso se muestran **socios únicos**: alcanzados, cerraron, tocaron el botón. Como **columnas en la lista** de avisos (igual que enviadas/abiertas en plantillas push). Sin pantalla de detalle ni evolución por día.
- **D-18:** Botón **"ver socios"** por aviso: lista con nombre y teléfono de quienes tocaron el botón, con el patrón de link a WhatsApp de las bandejas actuales (`TrialSessionsReport.vue`).
- **D-19:** Las tarjetas (fijas y libres) miden **solo clics** en el botón.

### Número de ventas y tenancy

- **D-20:** El número de WhatsApp de ventas pasa a **`tenant_settings`, uno por país del tenant**, editable desde Comunicaciones. La API lo resuelve por la sede del socio y lo manda junto con el destino.
- **D-21:** La app **prefiere el número del servidor y cae al hardcode AR/ES actual** de `utils/whatsapp.ts` si no lo recibe (app vieja o tenant sin número). Las pantallas que ya usan `buildWhatsAppUrl` (Reservas, Volver, vencimiento) pasan a la misma fuente.
- **D-22:** Los avisos de sistema nacen por **migración para los tenants existentes** (con el copy actual hardcodeado) **y en el wizard de alta de tenant** (fase 182) para los nuevos. Nunca hay que "inicializar".
- **D-23:** Comunicaciones es **core para todos los tenants**. Solo la pestaña **Avisos en TV se gatea por el módulo que hoy gatea las rutas del TV** (no existe un módulo "tv" propio: `MODULE_NAMES` = templo-training/gamification/marketing/onboarding; el planner verifica cuál cubre `modules/tv` y usa ese).

### Avisos en TV

- **D-24:** Entidad aparte de los avisos de app: **título + cuerpo**, sedes (vacío = todas), **activo/inactivo manual** (sin fechas), y **modo**: `reemplaza flexibilidad inicial` | `reemplaza flexibilidad final` | `manual`.
- **D-25:** Modo manual: con un aviso activo para la sede aparece un **botón AVISO grande en la tira de bloques del control** del profe (`TvControlPage`, control ciego, fase 164 D-13). Al tocarlo, el TV muestra el aviso **a pantalla completa, en cualquier momento**, sobre el velo crema (día) o charcoal (noche); el bloque en curso queda detrás.
- **D-26:** El aviso queda en pantalla **hasta que el profe avance** a otro bloque o vuelva. Sin timer.
- **D-27:** Estilo **cápsula/frase** (Cinzel, oro, velo) de las pantallas de transición actuales. Sin imagen. Tiene que funcionar en el browser viejo del TV (fase 164 D-20/D-24: página estática ES2015, CSS conservador).
- **D-28:** Modo reemplazo: en la pantalla de flexibilidad inicial o final, el texto del aviso ocupa el lugar de la cápsula o de la frase.
- **D-29:** Permisos: **crear, editar y activar avisos de TV es del admin**; el coach **solo los dispara** desde el control.

### Permisos y menú

- **D-30:** Editan Comunicaciones **dueño y admin** (`DUENO_ROLES` = `['admin','owner']`, mismos roles que hoy tiene `/notificaciones`). Coaches no ven la sección.
- **D-31:** La entrada **reemplaza a "Notificaciones" en la categoría Configuración** del menú (`templo-config.ts`), mismo lugar, nuevo nombre e ícono. Ruta `/comunicaciones` con **redirect desde `/notificaciones`**.

### Claude's Discretion

- **Destinos no disponibles para el socio** (programas sin plan, referidos apagados para el tenant, sesión vencida): el aviso se muestra igual y el botón cae en **Mi Templo**. Sin lógica de ocultamiento en v1.
- Forma exacta de las tablas (una entidad `avisos` con `placement` pop-up|tarjeta y `kind` sistema|custom, tabla de eventos por socio, tabla de avisos de TV), nombres de campos, y cómo se modela el "destino" (JSON vs columnas).
- Estados del aviso (borrador/activo/pausado vs. activo + vigencia) y semántica exacta de "cada apertura".
- Cómo viaja el destino en el payload FCM manteniendo el fallback de D-04 (ej. `route` = fallback para app vieja + `destination` nuevo).
- Mecanismo por el que la pantalla del TV recibe el aviso (nuevo tipo de "pantalla" en `tv_class_state` + el texto en el poll, o id resuelto por la API).
- Copy de la advertencia de prioridad (D-06) y default global del texto de WhatsApp (D-02).
- Si el número de ventas por país se edita en la pestaña de avisos o en un bloque "Ajustes" dentro de Comunicaciones.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Decisiones previas que esta fase respeta

- `.planning/phases/143-profesor-por-clase-puntuaci-n-post-clase-presencial/143-CONTEXT.md` — calificación: estrellas 1-5, salteable, una vez por clase, ventana 48 h, solo la última clase, sin profe asignado no se pide. La 193 solo agrega la cadencia editable (D-08).
- `.planning/phases/144-notificaciones-y-bloqueo-de-vencimiento-de-membres-a-plan/144-CONTEXT.md` — pop-up de vencimiento: ≤3 días, diario, supresión por cobertura (`covered-until`), botón WhatsApp vía `buildWhatsAppUrl`. La 193 solo hace editable texto y botón (D-10).
- `.planning/phases/164-pantalla-tv-de-sucursal-plani-viva-por-bloque-con-timer-por-/164-CONTEXT.md` — TV: control ciego con botones grandes (D-13), estado único por sede (D-04), pantalla estática ES2015 compatible con browser viejo (D-20/D-24), limpieza al fin del día (D-07).
- `.planning/ROADMAP.md` § "Phase 193" — objetivo, criterios de éxito y reglas duras (migraciones desde 0216, manifiesto de rutas fail-closed, `tenantWhere`).

### Reglas del repo

- `CLAUDE.md` — estándares (logger, sin `any`, tests de integración obligatorios para rutas nuevas, migraciones SQL a mano junto al schema).
- `.claude/skills/el-templo-change-control/SKILL.md` §3 — restricción de numeración de migraciones; staging-first.
- `.claude/skills/el-templo-db-migrations/SKILL.md` — runner custom, sin `;` en comentarios SQL.
- Memoria `reference_gates_tenancy_ruta_job_nueva` — toda ruta nueva dispara 3 gates de tenancy (manifiesto, lint CON-06, batería ISO).

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `el-templo-admin/src/pages/NotificacionesPage.vue` — dos tabs (plantillas / envío a segmento) con `route` como input libre (líneas 138, 215). Base de la pestaña Push; el selector de destino reemplaza esos inputs.
- `el-templo-api/src/db/schema/notifications.ts` — `notification_templates` (`route`, `sentCount`, `openedCount`), `pending_notifications`, `notification_preferences`, `device_tokens`. `openedCount` es el precedente del patrón "contador en columna de la lista".
- `el-templo-api/src/modules/notifications/routes.ts` — `PUT /notifications/admin/templates/:id` (línea ~305) y `POST /notifications/admin/send-segment` (línea ~431): donde entra la validación del destino contra la lista curada.
- `el-templo-app/src/boot/push-notifications.ts:42-63` — `handleTapNavigation(route)` hace `router.push(route)` y reporta `/notifications/:id/opened`. Punto para leer el destino nuevo con fallback (D-03/D-04). `useNotificationStore.pendingRoute` + `MiTemplo.vue:416` resuelven el tap pre-login.
- `el-templo-app/src/utils/whatsapp.ts` — `WHATSAPP_NUMBERS` (AR/ES) y `buildWhatsAppUrl(country, text)`. Pasa a preferir el número del servidor (D-21). Usado en `ReservasPage.vue`, `VolverPage.vue` y el pop-up de vencimiento.
- `el-templo-app/src/layouts/MainLayout.vue:139-164` — los 4 diálogos globales: `PushPermissionDialog`, `ImprovementPromptDialog`, `RatingPromptDialog`, `PlanExpiryDialog`. `RatingPromptDialog.vue:109-115` ya cede el turno si mejoras va a mostrarse: precedente de "uno por apertura" que pasa al servidor (D-07).
- `el-templo-api/src/modules/ratings/service.ts:310-399` (`getPendingRating`, `RATING_WINDOW_MS` 48 h) y `el-templo-api/src/modules/improvement-proposals/service.ts:64-85` (`prompt-status`, 30 días) — lógica de elegibilidad que el endpoint único (D-07) orquesta.
- `el-templo-app/src/modules/progression/pages/MiTemplo.vue:24-46` — carrusel premium con `ImprovementCtaCard`, `ReferralCtaCard`, `UpsellBadge`, `ProgramCtaCard` (copy hardcodeado en cada componente).
- `el-templo-admin/src/pages/TvControlPage.vue:83-151` — tira `inicio → bloques → final`, handlers `onFlexInicio`/`onFlexFinal` (líneas ~885/893, con confirmación). Ahí entra el botón AVISO.
- `el-templo-admin/src/pages/TvScreenPage.vue` + `el-templo-admin/src/tv/render.ts` (`paintCapsula`, `paintQuote`) + `tv/poll.ts` — render de los velos crema/charcoal; cápsulas en `tv/capsulas.ts`, frases en `utils/pdf/quotes.ts` (estáticas).
- `el-templo-api/src/db/schema/tv.ts:115-168` — `tv_class_state`, una fila por sede; `modules/tv/control-routes.ts:112` (POST estado absoluto); poll GET cada 750 ms.
- `el-templo-admin/src/components/reports/TrialSessionsReport.vue:733-775` — patrón de link `wa.me` + `window.open` antes del `await` (evita bloqueo de pop-ups). Reusar en "ver socios" (D-18). Hay 6 copias del helper `whatsappUrl` en el admin: oportunidad de un util compartido.
- `el-templo-api/src/db/schema/tenants.ts:73-85` — `tenant_settings` KV por tenant, para el número de ventas por país (D-20).
- `el-templo-admin/src/config/templo-config.ts:280-284` — entrada de menú Notificaciones (categoría Configuración, `DUENO_ROLES`); `router/routes.ts:245-247` (`allowedRoles: ['admin','owner']`).

### Established Patterns

- Segmentos de comportamiento `optima/regular/alerta/ausente` ya resueltos server-side para envío a segmento: reusar para el alcance (D-13).
- Cooldowns hoy en `Preferences` de Capacitor (rating, mejoras): la 193 los lleva al servidor (D-11); mantener la key local solo como cache opcional.
- TV: "control ciego", escritura absoluta de estado, timestamp de inicio y conteo local; nada de websockets.
- Contadores como columnas de la lista (plantillas push): mismo patrón para avisos (D-17).
- Toda ruta nueva: manifiesto fail-closed + `tenantWhere` + test de integración en `el-templo-api/test/`.

### Integration Points

- Payload FCM (`pending_notifications.route` → data de la push) y `handleTapNavigation` en la app.
- Perfil del socio (`userStore.profile`) o endpoint de config: transporte del número de ventas por país (D-20/D-21).
- `MainLayout.vue`: reemplazo de la decisión local por el endpoint "qué pop-up toca hoy".
- Wizard de alta de tenant (fase 182, en rama v6.1 sin push): el alta de avisos de sistema para tenants nuevos (D-22) se implementa en la 193 como función reutilizable; el wizard la llama cuando v6.1 se integre. Coordinar con el tren.
- Nav del admin (`templo-config.ts`) y router (`routes.ts`): nueva ruta `/comunicaciones` + redirect.

</code_context>

<specifics>
## Specific Ideas

- "Al tocar la notificación se abra el WhatsApp de ventas" fue el pedido original; todo el destino común nace de ahí.
- La calificación "aparece menos": una vez por semana, "y el resto de los días mostrarles estos mensajes personalizados".
- Franco quiere que la calificación quede definida "como un tipo de aviso específico que se muestra con regularidad", no como excepción hardcodeada.
- Advertir a los admins del orden de prioridad de los pop-ups en el propio editor.
- Placa de TV con la estética de las cápsulas y frases (Cinzel/oro sobre velo), como la placa de inauguración de Alberti pero solo texto.

</specifics>

<deferred>
## Deferred Ideas

- Imagen en avisos pop-up (subida a R2) y placa gráfica en avisos de TV.
- Filtros de alcance por estado del socio (lead, sesión de prueba, vencido, freemium).
- Vigencia por fechas y timer de duración en avisos de TV.
- Detalle de métricas con evolución por día.
- Umbral de versiones de app para habilitar destino WhatsApp.
- Ocultar avisos cuyo destino no está disponible para el socio (v1: fallback a Mi Templo).

### Reviewed Todos (not folded)

- `v51-milestone-data-rollout.md` — match por palabras clave genéricas (prod, fase, plan); es el rollout de datos de v5.1, sin relación con Comunicaciones.

</deferred>

---

_Phase: 193-comunicaciones_
_Context gathered: 2026-09-02_
