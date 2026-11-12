# Phase 213: Estiramiento post-clase - Context

**Gathered:** 2026-11-11 (spec con datos de producción + lectura de las 16 decisiones con Franco)
**Status:** Ready for planning

<domain>
## Phase Boundary

Después de la clase presencial, la app de alumnos de El Templo ofrece una sesión corta de estiramiento (5 a 8 min) armada a partir de la movilidad de la sesión de ese día, y un push automático la abre directo.

**Dentro:**
- Lista curada de estiramientos (`stretch_catalog`) y regla pura de selección.
- Oferta del día por alumno (`stretch_offers`): elegibilidad, rutina congelada, embudo y grupo de control.
- Player de estiramiento sobre una abstracción extraída de `FreeBlockPlayer`.
- Botón "Estirar" en la card principal de Mi Templo (`TodayCard`).
- Push `¿Estiraste?` dentro del cron de notificaciones, con tope, silencio y deep link.
- +5 AURA una vez por día.
- Tests y checklist de UAT.

**Fuera (no hacer):**
- Crear ejercicios nuevos o exigir video: la lista usa solo ejercicios que ya existen; el video se suma después (D-01).
- Tocar `DayPlayer`, `POST /sessions/complete`, `completed_sessions`, racha, RPE o `post_session_soreness`.
- Flag por gimnasio y lectura de flags en runtime en la app (D-13).
- Variantes por nivel, días ROM, actividades especiales y Open Gym.
- Prender `FREE_BLOCKS_ENABLED` o cambiar el comportamiento de Libre: se refactoriza sin cambiarlo.
- Migrar `GoalPlanSession.vue` a la abstracción nueva.
- Pantalla de admin para editar la lista curada (se corrige por migración).
- Bump de versión de la app (nunca dentro de una fase).

**Fuente de verdad:** `213-SPEC.md` en esta carpeta (hallazgos con datos, opciones evaluadas y tabla de referencia) y `consultas/` (SQL usado, catálogo y `regla_simulacion.py`).
</domain>

<decisions>
## Implementation Decisions

Todas cerradas con Franco el 2026-11-11. No reabrir; lo marcado "interpretación" es lectura del orquestador sobre una respuesta en texto libre.

### Selección
- **D-01:** La sesión del día aporta las **familias**; los ejercicios salen de una **lista curada**. Solo ejercicios que ya existen en `exercises`. Que tengan video o no, no importa: la regla no mira el video.
- **D-02:** La lista vive en una tabla nueva `stretch_catalog` (gimnasio, ejercicio, familia, orden, lados, base, activo). Carga inicial por migración con los 20 ejercicios de `213-SPEC.md` §4.1.
- **D-03:** Familias del día = las de la movilidad prescrita, más un complemento de tren superior (TS) cuando hay un bloque de empuje o tracción y nadie aportó TS. **La movilidad prescrita manda** (Franco: siempre corresponde a lo trabajado ese día; de eso se encarga el profe): define las familias y su orden, sus ejercicios van primero si están en la lista, y TS entra último sin desplazar a ninguna. Supuesto de arranque: cuentan 9 rutas (HS, HSPU, PHS, OAPU, PLPU, MU, OAP, OAR, BL); FL, FLR, PL y DS quedan afuera hasta que un profe diga. Constante de una línea.
- **D-04:** La familia `PL` de la base cuenta como columna (FL).
- **D-05:** Dosis fija para todos los niveles: 5 estiramientos, 45 s por lado, 10 s de transición, entre 5 y 8 min. Rotación determinística por `(semana + índice del día)`. Misma rutina para todos los que fueron a esa clase.
- **D-06:** Regular, combos **y técnica**: card + push. ROM: no se ofrece.

### Player y recompensa
- **D-07:** Player nuevo (`StretchPlayer`), sobre una abstracción extraída de `FreeBlockPlayer` (`useSingleBlockPlayer`) que **también pasa a usar `FreeBlockPlayer`**. Primero tests de caracterización de `FreeBlockPlayer`, después la extracción.
- **D-08:** +5 AURA, una vez por día local, fuente nueva `stretch`. Solo si marcó todos los estiramientos y pasaron al menos 3 min reales (duración calculada en el servidor).

### Card
- **D-09:** El botón principal de `TodayCard` pasa a ser **"Estirar"** mientras la oferta esté disponible; el principal anterior baja a `secondary`. Sin `kind` nuevo. Aparece con asistencia registrada y clase terminada, el mismo día. Después de estirar, el principal vuelve al anterior y la línea de estado dice "Clase y estiramiento hechos".

### Push
- **D-10:** Sale a fin de clase + 60 min, con tope a las 21:30 hora de la sede. Silencio de 21:30 a 08:00; si cae después, se adelanta a las 21:30 siempre que queden 15 min desde el fin; si no, no se manda. Nunca a la mañana siguiente. Disparador: la asistencia, con ventana `fin + offset ≤ ahora < fin + 120 min`.
- **D-11:** Máximo 3 en 7 días y pausa de 14 días tras 4 seguidos sin abrir. No se manda si ya empezó o completó, si no tiene token, si tiene la categoría apagada, si la plantilla está apagada o si ya hubo oferta ese día. Se guarda el motivo.
- **D-12:** Categoría `entrenamiento`. Texto inicial: título "¿Estiraste?", cuerpo "6 minutos para aflojar lo que trabajaste hoy. Tocá y arrancamos." **Editable desde Comunicaciones** (ya existe para plantillas de sistema): sembrar en `TEMPLATE_SEEDS` y no pasar `titleOverride` ni `bodyOverride`. Deep link por el campo `route` de la plantilla: `/training/estirar?from=push`. La oferta vale hasta el fin del día local.

### Infraestructura y medición
- **D-13:** Sin flag nuevo. El Templo lo tiene siempre prendido; los otros gimnasios usan otra app (Kaia). Interpretación: las rutas van en el plugin de sesiones (ya bajo `moduleScope(app, "templo-training", …)`) y el job saltea a los gimnasios sin `templo-training`. El push se apaga desde Comunicaciones.
- **D-14:** El envío es una función más en el tick de `notification-cron.ts`, con la lógica en un módulo propio. Sin `cron.schedule` nuevo.
- **D-15:** Una tabla `stretch_offers`, una fila por alumno y día: oferta, dedupe del push, completado y embudo. Unique `(tenant_id, user_id, local_date)`. No usar `pending_notifications.booking_id`.
- **D-16:** Grupos fijos por `crc32('stretch-v1:' + user_id) % 100`: 0-19 solo card, 20-59 push a +30 min, 60-99 push a +60 min (tope 21:30). Métrica: completados cada 100 asistencias elegibles, por grupo.

### Sin kinesiólogo
- Franco decidió no esperar la firma. La lista de 20 y la tabla de referencia de `213-SPEC.md` §4.1 son la verdad fija de los tests tal como están. El UAT incluye que un profe haga una rutina completa en el teléfono.

### Claude's Discretion
- Nombres exactos de archivos, columnas y endpoints, respetando los del SPEC cuando no haya motivo para cambiarlos.
- Forma del reloj por ejercicio del player (ver "Specific Ideas"): decidirlo con un sketch antes del plan de interfaz.
- Si `stretch` viaja en la respuesta que ya alimenta `useTodayBookingStore` o en una consulta propia, siempre que la card no parpadee (fase 203).
- Cómo se detecta "push abierto" (la página con `from=push`) y cómo se reconcilia `push_sent_at` contra `pending_notifications` antes de la purga de 24 h.
- Corte y cantidad de planes.
</decisions>

<canonical_refs>
## Canonical References

### Spec y evidencia
- `213-SPEC.md` — hallazgos de Fase 1, decisiones con opciones, lista curada, tabla de referencia, casos de test (§5.2), prueba en teléfono (§5.3), umbrales de apagado (§5.4).
- `consultas/regla_simulacion.py` — implementación de referencia de la regla; reproduce la tabla con `consultas/13_sesiones_de_referencia.tsv`.
- `consultas/12_catalogo_movilidad_completo.tsv` — catálogo `MOVILIDAD` con ids, familia y dificultad.

### API (rutas relativas a `el-templo-api/`, verificadas en `origin/master` `9954fa235`; revisar líneas)
- `src/modules/sessions/routes.ts:73-154` — `GET /sessions/daily`: fecha → semana → nivel → `day_id`.
- `src/modules/shared/week-dates.ts:23` — ancla de semana (lunes 2026-02-23), `dateToWeekNumber`, `dateToDayName`.
- `src/modules/sessions/pipeline/utils/mobility-routes.ts` — `ROUTE_TO_MOBILITY_ROUTES` y grupos de rutas.
- `src/modules/sessions/service.ts:507-527` — movilidad guardada con `exercise_type='mobility'`.
- `src/modules/shared/exercise-video-fallback.ts` — video de otra fila con el mismo nombre.
- `src/modules/attendance/service.ts:1408-1450` — espejo `presencial-YYYY-MM-DD` con `session_level`.
- `src/modules/shared/date-utils.ts:144` — `buildClassDateTime` (fin de clase = fecha + `end_time` + zona de la sede).
- `src/jobs/notification-cron.ts:259-405` — patrón `class_reminder`; `:285-299` dedupe por `booking_id` sin plantilla.
- `src/modules/notifications/service.ts:369-482` — `queueNotification` (devuelve -1 sin token, categoría apagada o plantilla apagada); `:688` `processQueue`; `:977` purga a 24 h.
- `src/modules/notifications/routes.ts:602-611` — edición completa de plantillas de sistema.
- `src/modules/notifications/types.ts` — `TEMPLATE_SEEDS`.
- `src/modules/sessions/free-blocks-service.ts:380-507` — completado de bloque libre (modelo a copiar: duración en servidor, AURA una vez).
- `src/modules/aura/daily-award.ts` — `awardOncePerLocalDay`; migración `0285_aura_source_extra_block.sql` como modelo de fuente nueva.
- `src/app.ts:211` — plugin de sesiones bajo `templo-training`; `src/modules/shared/module-flags.ts` — `enabledModulesFor`.
- `src/modules/shared/tenant.ts:248` — `forEachActiveTenant`.

### App (rutas relativas a `el-templo-app/src/`)
- `modules/progression/utils/today-card.ts` — encabezado de reglas (`:1-67`), `presencial-turno` (`:418-450`), `withLibreLink` y `withExtraPrograms` (`:488-541`); tests en `utils/__tests__/today-card.test.ts`.
- `modules/training/pages/FreeBlockPlayer.vue` — origen de la abstracción.
- `modules/training/composables/useSessionPlayer.ts`, `useWakeLock.ts`, `components/BlockProgressionView.vue`, `components/player/CountdownOverlay.vue`.
- `modules/training/utils/blockTimer.ts` — `TimerSpec` (`work_rest`, `interval`, `countdown`, `countup`).
- `modules/training/routes.ts` — rutas del módulo.
- `boot/push-notifications.ts:22-98` — `resolveTapRoute` y `handleTapNavigation`.
- `stores/useTodayBookingStore.ts` — asistencia de hoy y su refresco.

### Admin
- `el-templo-admin/src/config/rule-triggers.ts:160+` — `SYSTEM_TEMPLATE_TRIGGER_DESCRIPTIONS`.

### Reglas del repo
- `CLAUDE.md` — sin `any`, logger, tests de integración por ruta nueva, migraciones a mano.
- Skills `el-templo-db-migrations` y `el-templo-change-control`.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- El patrón completo de `class_reminder` para el barrido por gimnasio y el encolado.
- `extra_blocks_completed` y su servicio como modelo de completado que no toca racha ni `completed_sessions`.
- `aviso_events` como modelo de marcas `first_at` idempotentes.
- `BlockProgressionView` ya se usa desde tres páginas (`DayPlayer`, `FreeBlockPlayer`, `GoalPlanSession`).
- El rol de bloque `STRETCHING` ya existe en la app (`blockMeta.ts`, `roleLabels.ts`).

### Established Patterns
- Stores Pinia con `setup`; composables con `cleanup()` y sin `onUnmounted` adentro.
- Funciones puras con tests de tabla (`today-card.ts`).
- Servicios con `tenantWhere` / `tenantValues`.
- Ejecución: planes secuenciales con `gsd-executor` en sonnet; el orquestador verifica después de cada plan.

### Trampas conocidas
- **Migraciones:** master está en 0326; `feat/egresos-rendiciones` ya usa 0327-0329 y el tren v6.1 tiene las suyas. Numerar al ejecutar mirando master, staging, egresos y el tren. Sin `;` dentro de comentarios SQL.
- **Conteos de gates:** los de hoy en master son tablas 129 / 5 / 134, ISO-01 554 y 13 jobs; verificarlos al ejecutar porque otras ramas los mueven. Tabla nueva = 5 conteos; ruta nueva = entrada en `TENANT_MANIFEST` (categoría `templo-module`).
- **Enums de Drizzle:** el primer argumento de `mysqlEnum` es el nombre de la columna física (`booking_status`, `attendance_source`, `notification_status`).
- **`exercises` tiene varias filas por nombre:** la lista referencia una fila; el video se resuelve por nombre.
- **`exercise_type` del bloque STRETCHING es `'main'`:** para leer la movilidad de un día de técnica hay que mirar el rol del bloque.
- **`mark-no-shows` corre al día siguiente:** no sirve como señal.
- **Zona horaria:** las clases y `session_date` son hora de la sede; hay una sede en `Europe/Madrid`. Nunca asumir UTC−3.
- **Tests con reloj:** saltos relativos a `Date.now()`, sin fechas fijas ni ids de `users` hardcodeados. Los tests de integración los corre CI; local solo typecheck (`vue-tsc` de app y admin no corre en CI).
- **Toque de push con la app cerrada y sin sesión:** hoy el destino se pierde (`handleTapNavigation` navega directo).
- **`FreeBlockPlayer` no tiene tests y está apagado por flag de build:** una regresión no se ve en prod.
- **Deploy:** staging-first; push solo con OK de Franco; si un push falla en CI, el siguiente lleva `// deploy:` en cada componente.
</code_context>

<specifics>
## Specific Ideas

- **Reloj por ejercicio:** el player actual marca cada ejercicio con un toque y solo tiene reloj de bloque. Un estiramiento de 45 s por lado necesita que el alumno vea el tiempo. Probar con un sketch si `TimerSpec` `interval` alcanza o hace falta un reloj por ejercicio. Es el punto con más incertidumbre de la fase.
- **Pantalla final:** corta, "Listo. X minutos de estiramiento", y vuelta a Mi Templo. Sin RPE ni notas.
- **Textos:** hablar de "aflojar", "soltar", "bajar un cambio", "ganar rango". Nunca "menos dolor", "evitá lesiones" ni "recuperate más rápido".
- **Sin video:** la ficha muestra el `VideoPlaceholder` de siempre.
- **Corte tentativo de planes** (no vinculante): esquema y carga de la lista → regla pura con la tabla de referencia → oferta y elegibilidad → rutas y AURA → push → tests de caracterización y extracción de `useSingleBlockPlayer` → sketch del reloj y `StretchPlayer` → card → deep link en frío → admin y checklist de UAT con la consulta de medición a 4 semanas.
</specifics>

<deferred>
## Deferred Ideas

- Filmar los 10 ejercicios de la lista que hoy no tienen video.
- Pantalla de admin para que un profe edite la lista curada.
- Push a la noche para las clases de la mañana.
- Variantes por nivel.
- Corregir el dedupe de `class_reminder` para que filtre por plantilla.
- Lectura de flags por gimnasio en la app.
- Medir permanencia o asistencia con un grupo sin la feature.
</deferred>

## Enmienda 2026-11-12 (reabre D-05 y D-08)

Decisiones de Franco al ver el sketch del reloj:

- **Sin lados y sin marcado.** El alumno pasa de un ejercicio a otro a mano y es libre de hacerlos.
- **Minutero que solo avanza.** No hay cuenta regresiva ni duración objetivo.
- **Dosis por ejercicio** en lugar de los 45 s por lado de D-05: la de la plani del día si el estiramiento está en esa plani. Si no está, dosis base (20 s isométrico, 10 repeticiones si no).
- **Botón "Terminar" siempre disponible.** De D-08 queda solo el piso de 3 minutos medidos por el servidor para el AURA.
- **Dos clases el mismo día no existe**, no se contempla.
- **Player:** teléfono 1 de `sketch-reloj/minutero.html` (video arriba, minutero chico).

La regla de selección no cambió: sigue usando los lados solo para decidir cuántos estiramientos entran. Implementado en los planes 213-14 y 213-15.
