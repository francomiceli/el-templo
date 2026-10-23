# Phase 203: Carga sin parpadeos - Context

**Gathered:** 2026-10-23
**Status:** Ready for planning

<domain>
## Phase Boundary

La app de socios (`el-templo-app`) deja de mostrar contenido equivocado mientras llegan sus datos. Hoy "todavía no sé" se dibuja como "no": defaults como `?? false`, `!x`, lista vacía o `loading = ref(false)`. Además, las cards aparecen de golpe y empujan el resto. La fase cubre:

- **Pantallas:** Mi Templo, Planes, Entrenar, Perfil, Reservas y el arranque (boot / MainLayout).
- **Arranque:** quitar los pedidos repetidos y pedir en paralelo lo que hoy va en fila.
- **HTTP/2:** activarlo en el vhost de la API, con un access_log permanente para medir.

Fuera de la fase: features nuevas, cambios de diseño o del orden de las cards de Mi Templo (fase 199), cambios en la API salvo que un endpoint lo exija para paralelizar, y el admin.

Origen: reporte de Franco del 2026-10-23 ("durante un milisegundo un texto dice una cosa y luego la correcta"; en Planes se ven los regulares arriba y después aparece "Por Objetivos"). La evidencia completa está en `203-HALLAZGOS.md`.

</domain>

<decisions>
## Implementation Decisions

### Regla general: qué se ve mientras carga
- **D-01:** Mientras una card o sección espera sus datos se muestra un **esqueleto (skeleton) que reserva su lugar final**. Cuando llega el dato, la card se rellena sin mover nada. Nunca se usa un default que se lea como respuesta (`?? false`, `!x`, lista vacía → "no hay…", "Sin suscripción activa", "Hola, Atleta!").
- **D-02:** Para las cards que pueden terminar vacías (Novedades, patrocinadores, check-in pendiente, etc.), se reserva lugar con esqueleto **solo si la última vez esa card tuvo contenido**. Ese flag por card y por socio se guarda en el teléfono (Preferences/localStorage, con try/catch). Si la última vez estuvo vacía, no se reserva lugar. El salto queda solo para el caso raro de que el contenido cambie de una vez a la otra.
- **D-03:** **No** se muestra el último dato conocido guardado en el teléfono: no hay stale-while-revalidate de contenido. Lo único que se persiste es el flag "tuvo contenido" de D-02, nunca el contenido.
- **D-04:** **Planes aparece completa de una vez.** Los pedidos (planes, catálogo Por Objetivos, my-progress y la suscripción si falta) salen en paralelo. Mientras tanto se ven los esqueletos de las cards y la página se dibuja cuando están todos. Nunca aparece "No hay planes disponibles" antes de tiempo, ni cambia el orden de las secciones.

### Mi Templo: qué espera a qué
- **D-05:** La **card de hoy queda en esqueleto hasta tener todos los datos que deciden su estado**: turnos, semana/rutina, progreso, plan y perfil. Así desaparecen los estados intermedios (nombre de la actividad → nombre de la rutina; "Elegí día, horario y sede" → "Próxima: X"; `onlineLibre` → `online-programa`). Para que no tarde más, `/sessions/weekly` deja de pedirse después del `Promise.all` y sale en paralelo.
- **D-06:** La card sale **completa, con sus acciones secundarias definitivas** ("Clase de prueba gratis", "Tus programas"). Para acortar la cadena, `plan-status` y `trial-eligibility` se piden en paralelo con la suscripción, no después.
- **D-07:** **Tope ante fallo o lentitud.** Si un pedido del que depende una card falla o tarda más que un tope (alrededor de 6–8 s; el valor exacto lo decide el planner), la card sale del esqueleto mostrando **solo lo que sabe con certeza**, sin inventar estados (nada de "No tenés plan" si la suscripción no llegó). Cuando el pedido llega después, la card se completa sola. Esto aplica a toda card con esqueleto, no solo a Mi Templo.

### Red lenta / perfil tardío
- **D-08:** Cuando el perfil no llegó (el boot dejó de esperarlo a los 8 s, `boot/auth.ts`, fix 1.8.5), **todo lo que depende del perfil queda en esqueleto** hasta que llega por el reintento del router (`retryProfileLoad`): saludo, card de hoy, presencial/virtual, zona horaria de la sede. Nunca se adivina presencial o virtual, y nunca se calcula "hoy" con `DEFAULT_BRANCH_TZ` como si fuera dato real.
- **D-09:** La misma regla resuelve el resto del área, a criterio de Claude:
  - Entrenar no pide `/sessions/weekly` con un `view` decidido antes de que lleguen suscripción, programa e inscripciones, o lo vuelve a pedir cuando llegan (`useWeekData.ts:69-97`).
  - `TrainingIndex` no elige entre la vidriera y Entrenar antes de tiempo.
  - Perfil no muestra "Sin suscripcion activa" mientras la suscripción no llegó.

### HTTP/2 y access_log de la API
- **D-10:** **HTTP/2 va primero, solo, antes de tocar la app**, para tener un antes/después limpio y saber cuánto aporta.
- **D-11:** El orden es **staging primero (`api-staging.eltemplo.org`) → prod (`api.eltemplo.org`)**. La verificación es **automática, con un script que Franco no necesita correr a mano en la app**. El script comprueba que se negocia `h2` (ALPN), que un cliente HTTP/1.1 sigue funcionando y que los endpoints clave responden igual: `/health`, `/auth/me` y los de Mi Templo con un usuario de prueba de staging. Si pasa en staging, se aplica en prod y se corre el mismo script contra prod.
- **D-12:** Los archivos del repo (`deploy/nginx/api-staging.eltemplo.org`, `deploy/nginx/api.eltemplo.org`) son **plantillas pre-certbot desactualizadas**: solo tienen `listen 80`, sin el bloque 443 de certbot ni el `access_log off` que hay en el server. Primero hay que traer la config viva del server al repo (lectura por SSH con OK), commitearla tal cual y recién después aplicar el cambio. Así el diff de HTTP/2 + log queda limpio y el repo vuelve a reflejar la realidad. En el server se aplica a mano. **Cada SSH, cada cambio de config y cada `nginx -t && reload` llevan el OK de Franco en el momento** (gate del playbook de debugging). No hay deploy automático de nginx.
- **D-13:** **El access_log de la API queda prendido en forma permanente**, en staging y prod. Lleva el protocolo (`$server_protocol`) y el tiempo de respuesta (`$request_time`, y si sirve `$upstream_response_time`), con un `log_format` propio. **Se excluye el sondeo de la TV** (`/api/admin/tv/control/screen`, ~85% del volumen, ~350k/día) con un `map` + `access_log ... if=`. Usa la rotación existente de `/var/log/nginx/*.log` (diaria, comprimida, 14 días). Antes de aplicarlo hay que verificar el espacio libre en disco. Además de medir HTTP/2, deja registro de los 400 de check-in que hoy no ven ni Sentry ni nginx (Triage 4 del playbook).

### Claude's Discretion
- **Pedidos repetidos:** qué store o composable es la fuente única para sacarlos. Hoy my-progress, current-program y enrollments se piden dos veces al arrancar (`useUserStore.ts:454-457` y `MiTemplo.vue:413`), y `/weekly` dos veces en Reservas multi-sede. Patrón sugerido: deduplicar la promesa en vuelo.
- **Esqueletos:** el componente concreto (`q-skeleton` como en `TodayCard.vue`, o un wrapper reutilizable) y el alto que reserva cada card.
- **Tope:** el valor exacto de D-07 y cómo se comparte entre cards.
- **Planes de ejecución:** cómo se reparte la fase. Como guía: HTTP/2 + log primero; después arranque/duplicados, Planes, Mi Templo, Entrenar/Perfil/Reservas; al final el UAT.
- **`progressionStore.loading`:** arranca en `false` (`stores/progressionStore.ts:54`) y produce contenido → loader → contenido. Se corrige con la misma regla.
- **CTA de Entrenar:** "Empezar" → "Continuar" (`semanaCta.ts:130`) viene de Preferences locales, no de HTTP. Se corrige si es barato; si no, se documenta.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Evidencia de la fase
- `.planning/phases/203-carga-sin-parpadeos/203-HALLAZGOS.md`: métricas del server (tráfico plano, latencias p50 11 ms / p90 30 ms, API sin HTTP/2, CapacitorHttp), inventario de pedidos BEFORE `f6a4c9ae7` vs NOW `ab4342b27` por arranque y por pantalla, los 10 candidatos de parpadeo con archivo:línea y las palancas.

### Reglas del repo
- `CLAUDE.md`: logging con `createLogger()`, sin `any`, `catch (err: unknown)`, composables con `cleanup()`, Pinia composition API.
- `.claude/skills/el-templo-change-control/SKILL.md`: staging-first, `git add` explícito, bump fuera de la fase (bugfix = patch), preguntar antes de push.
- `.claude/skills/el-templo-debugging-playbook/SKILL.md`: gate de SSH (Regla 0), sin deploys manuales de código (Regla 1), Triage 4 (400 de check-in invisibles) y Triage 5 (nginx).
- `.claude/skills/el-templo-build-and-run/SKILL.md`: typecheck de la app con `vue-tsc` local (el CI no typechequea los frontends) y tests de Vitest de la app.

### Infra
- `deploy/nginx/api.eltemplo.org`, `deploy/nginx/api-staging.eltemplo.org`: plantillas pre-certbot desactualizadas (ver D-12). La config viva está en el server: `/etc/nginx/sites-enabled/api.eltemplo.org` con `listen 443 ssl;` (sin http2) y `access_log off;`.
- `el-templo-app/src-capacitor/capacitor.config.ts`: `CapacitorHttp.enabled: true` (cliente nativo).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `modules/progression/components/TodayCard.vue`: el único lugar de la app que ya usa `q-skeleton`. Es la referencia visual de los esqueletos.
- `boot/auth.ts` (`BOOT_NETWORK_TIMEOUT_MS`, boot optimista, `markProfileStale`) + `router/index.ts:37` (`retryProfileLoad`): mecanismo existente de perfil tardío, en el que se apoya D-08.
- `stores/useTodayBookingStore.ts` (`load()` = my-bookings ×2; `todayStr` en la zona de la sede).
- `stores/useUserStore.ts` (`loadSubscription`, `fetchProgramEnrollmentStatus`, `fetchCurrentProgram`, `subscriptionLoading`).
- `modules/progression/utils/today-card.ts`: lógica pura de la card de hoy por gate. Ahí se agregan los estados "cargando" sin tocar el template.

### Established Patterns
- Stores Pinia en composition API (`defineStore` con `setup`). Los composables exponen `cleanup()` y no usan `onUnmounted` adentro.
- Stores fail-open (novedades, sponsors): si fallan, la card no se muestra. D-07 debe convivir con eso: un fallo nunca deja un esqueleto colgado.
- `ProfilePage.vue` ya protege los toggles con `preferencesLoading = ref(true)`. Ese es el patrón correcto a generalizar (loading arranca en true).
- `ReservasPage.vue` mantiene `loading` en true durante toda su cadena y no parpadea. Solo hay que sacarle el `/weekly` duplicado en multi-sede.

### Integration Points
- `layouts/MainLayout.vue:245-261`: pedidos de layout al arrancar (config, prompt, my-bookings ×2).
- `modules/progression/pages/MiTemplo.vue:321` (watch de plan-status / trial-eligibility), `:389-415` (orden de montaje), `:33/:38/:46/:50` (Novedades, CheckIn, Sponsors, WeekStrip).
- `modules/plan/pages/PlanesPage.vue:166` (`loading = ref(false)`), `:239-276` (cadena en fila).
- `modules/training/...`: `TrainingIndex.vue:15/:43`, `EntrenarView.vue:147`, `useWeekData.ts:69-97`, `SemanaTab.vue:214`.
- `pages/ProfilePage.vue:63/:283`.

</code_context>

<specifics>
## Specific Ideas

- El ejemplo de Franco es la prueba de aceptación número uno: en Planes nunca deben verse los planes regulares solos arriba antes de "Planes Por Objetivos".
- El parpadeo no se reproduce en local, porque la API responde en 11 ms. El UAT y la verificación tienen que simular red lenta (throttling o latencia artificial) para que los estados intermedios sean visibles.
- La verificación de HTTP/2 tiene que ser automática: Franco pidió explícitamente no tener que usar la app de staging para probarlo.

</specifics>

<deferred>
## Deferred Ideas

- **Mostrar el último dato conocido al abrir** (stale-while-revalidate de perfil, catálogo, etc.): se evaluó y se descartó por ahora (D-03). Si después de la fase la apertura sigue sintiéndose lenta, puede ser una fase propia.
- **Endpoint agregado para Mi Templo** (un solo pedido que devuelva todo lo de la pantalla): no se discutió. Es un cambio de API, fuera del alcance si la paralelización + HTTP/2 alcanzan.

### Reviewed Todos (not folded)
- "Rollout de datos v5.1 — poblar milestone_exercise_id": coincidencia solo por palabras clave, no está relacionado.

</deferred>

---

*Phase: 203-carga-sin-parpadeos*
*Context gathered: 2026-10-23*
