# Phase 203: Carga sin parpadeos - Research

**Researched:** 2026-10-23
**Domain:** Estados de carga en Vue 3 + Pinia (Quasar/Capacitor), pedidos de arranque, nginx 1.18 (HTTP/2 + access_log)
**Confidence:** HIGH (código y server verificados con herramientas; ver tags por afirmación)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Regla general: qué se ve mientras carga
- **D-01:** Mientras una card o sección espera sus datos se muestra un **esqueleto (skeleton) que reserva su lugar final**. Cuando llega el dato, la card se rellena sin mover nada. Nunca se usa un default que se lea como respuesta (`?? false`, `!x`, lista vacía → "no hay…", "Sin suscripción activa", "Hola, Atleta!").
- **D-02:** Para las cards que pueden terminar vacías (Novedades, patrocinadores, check-in pendiente, etc.), se reserva lugar con esqueleto **solo si la última vez esa card tuvo contenido**. Ese flag por card y por socio se guarda en el teléfono (Preferences/localStorage, con try/catch). Si la última vez estuvo vacía, no se reserva lugar. El salto queda solo para el caso raro de que el contenido cambie de una vez a la otra.
- **D-03:** **No** se muestra el último dato conocido guardado en el teléfono: no hay stale-while-revalidate de contenido. Lo único que se persiste es el flag "tuvo contenido" de D-02, nunca el contenido.
- **D-04:** **Planes aparece completa de una vez.** Los pedidos (planes, catálogo Por Objetivos, my-progress y la suscripción si falta) salen en paralelo. Mientras tanto se ven los esqueletos de las cards y la página se dibuja cuando están todos. Nunca aparece "No hay planes disponibles" antes de tiempo, ni cambia el orden de las secciones.

#### Mi Templo: qué espera a qué
- **D-05:** La **card de hoy queda en esqueleto hasta tener todos los datos que deciden su estado**: turnos, semana/rutina, progreso, plan y perfil. Así desaparecen los estados intermedios (nombre de la actividad → nombre de la rutina; "Elegí día, horario y sede" → "Próxima: X"; `onlineLibre` → `online-programa`). Para que no tarde más, `/sessions/weekly` deja de pedirse después del `Promise.all` y sale en paralelo.
- **D-06:** La card sale **completa, con sus acciones secundarias definitivas** ("Clase de prueba gratis", "Tus programas"). Para acortar la cadena, `plan-status` y `trial-eligibility` se piden en paralelo con la suscripción, no después.
- **D-07:** **Tope ante fallo o lentitud.** Si un pedido del que depende una card falla o tarda más que un tope (alrededor de 6–8 s; el valor exacto lo decide el planner), la card sale del esqueleto mostrando **solo lo que sabe con certeza**, sin inventar estados (nada de "No tenés plan" si la suscripción no llegó). Cuando el pedido llega después, la card se completa sola. Esto aplica a toda card con esqueleto, no solo a Mi Templo.

#### Red lenta / perfil tardío
- **D-08:** Cuando el perfil no llegó (el boot dejó de esperarlo a los 8 s, `boot/auth.ts`, fix 1.8.5), **todo lo que depende del perfil queda en esqueleto** hasta que llega por el reintento del router (`retryProfileLoad`): saludo, card de hoy, presencial/virtual, zona horaria de la sede. Nunca se adivina presencial o virtual, y nunca se calcula "hoy" con `DEFAULT_BRANCH_TZ` como si fuera dato real.
- **D-09:** La misma regla resuelve el resto del área, a criterio de Claude:
  - Entrenar no pide `/sessions/weekly` con un `view` decidido antes de que lleguen suscripción, programa e inscripciones, o lo vuelve a pedir cuando llegan (`useWeekData.ts:69-97`).
  - `TrainingIndex` no elige entre la vidriera y Entrenar antes de tiempo.
  - Perfil no muestra "Sin suscripcion activa" mientras la suscripción no llegó.

#### HTTP/2 y access_log de la API
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

### Deferred Ideas (OUT OF SCOPE)
- **Mostrar el último dato conocido al abrir** (stale-while-revalidate de perfil, catálogo, etc.): se evaluó y se descartó por ahora (D-03). Si después de la fase la apertura sigue sintiéndose lenta, puede ser una fase propia.
- **Endpoint agregado para Mi Templo** (un solo pedido que devuelva todo lo de la pantalla): no se discutió. Es un cambio de API, fuera del alcance si la paralelización + HTTP/2 alcanzan.
- Reviewed Todos (not folded): "Rollout de datos v5.1 — poblar milestone_exercise_id" (no relacionado).
</user_constraints>

<phase_requirements>
## Phase Requirements

No hay REQ-IDs formales. Los requisitos son los 6 success criteria del ROADMAP (`.planning/ROADMAP.md:490-497`) + D-01..D-13.

| ID | Descripción | Qué de esta investigación lo habilita |
|----|-------------|----------------------------------------|
| SC-1 | Planes completa de una vez, pedidos en paralelo, nunca "No hay planes" ni regulares antes que Por Objetivos | §Patrón 3 (vista pura `resolvePlanesView`), §Inventario C-1 |
| SC-2 | Mi Templo sin estados intermedios ni saltos | §Patrón 2 (entradas "cargando" en `resolveTodayCard`), §Patrón 4 (flag "tuvo contenido"), §Patrón 5 (`/sessions/weekly` sin `view`), §Inventario C-2..C-7, C-11 |
| SC-3 | Entrenar/Perfil/Reservas misma regla; `/sessions/weekly` sin params adivinados | §Patrón 5 (el server ya resuelve el `view` por defecto igual que el cliente), §Inventario C-8..C-10 |
| SC-4 | Sin duplicados my-progress/current-program/enrollments; < 18 pedidos con plan activo | §Patrón 1 (dueño único en `useUserStore` + promesa compartida + frescura), §Pitfall 3 (D-06 suma 2 pedidos para todos) |
| SC-5 | API sirve HTTP/2 + app igual en iOS/Android | §HTTP/2: **la API YA negocia h2 hoy**; Android no lo usa nunca (HttpURLConnection = solo HTTP/1.1) |
| SC-6 | UAT con red limitada sin parpadeos | §Validation Architecture (interceptor de latencia con jitter solo en dev + throttling de DevTools + checklist de pantallas) |
</phase_requirements>

## Summary

**La premisa de D-10 no se cumple: la API ya sirve HTTP/2 hoy.** Desde esta máquina (sin SSH), `curl --http2` contra `https://api.eltemplo.org/health` y `https://api-staging.eltemplo.org/health` devuelve `HTTP/2 200`, y `openssl s_client -alpn h2,http/1.1` informa `ALPN protocol: h2` para los dos. El server corre `nginx/1.18.0 (Ubuntu)` (header `Server`). En nginx < 1.25.1 el parámetro `http2` del `listen` "configura el puerto", no un vhost: como `eltemplo.org` y `www` ya tienen `listen 443 ssl http2;` en la misma IP:443, **todos** los vhosts de ese socket ofrecen h2 por ALPN, incluida la API, aunque su archivo diga `listen 443 ssl;` [VERIFIED: curl/openssl contra prod y staging 2026-10-23 + CITED: nginx.org listen]. Además, **el Android de la app nunca va a hablar h2**: CapacitorHttp 8.2.0 usa `HttpURLConnection` de la plataforma, y la implementación de AOSP (`com.squareup.okhttp.HttpsHandler`) fija `setProtocols(HTTP_1_1_ONLY)` con el comentario "Disable SPDY / HTTP/2.0" [VERIFIED: código fuente AOSP + código del plugin en node_modules]. iOS (URLSession.shared) ofrece h2 por ALPN de forma automática, así que **iOS ya usa h2 hoy** [CITED: Apple Developer Forums, DTS].

Consecuencia para el plan: agregar `http2` a los `listen` de la API no cambia nada en la práctica (deja explícito lo que ya pasa). El "antes/después" de HTTP/2 que buscaba D-10 no se puede medir porque no hay un "antes". Lo que sí tiene valor en el plan 1 es lo mismo que D-12/D-13 piden: traer la config viva al repo, prender el access_log permanente con `$server_protocol` + `$request_time` + `$http_user_agent` y el script de verificación. Ese log da la **línea base** real para la fase: qué protocolo usa cada plataforma, pedidos por apertura y latencias. Hay que avisarle a Franco antes de planificar (ver Open Question 1). Tampoco existe la "cola de ~6 conexiones" del HALLAZGOS: en iOS todo va multiplexado sobre una conexión h2, y en Android CapacitorHttp usa `Executors.newCachedThreadPool()` (sin tope) con un pool de 5 conexiones ociosas (keep-alive de 5 min). El costo real en Android es un handshake TCP+TLS por cada pedido simultáneo de más, y en las dos plataformas pesan las **cadenas en fila** (RTT × profundidad). Por eso la palanca principal es aplanar las cascadas y sacar duplicados.

Del lado de la app, el código ya tiene casi todas las piezas: `resolveTodayCard` es puro y ya tiene el kind `cargando` con `planLoading`/`bookingsLoading`; `planStateLoading` + `subscriptionLoaded` separan "no tiene" de "no llegó"; `useTipsSeenStorage` es el patrón para el flag D-02; `runRefresh` (boot/axios.ts) es el patrón de promesa compartida; `user-store-plan-state-loading.test.ts` es el patrón de test con `deferred()`. Un hallazgo que destraba D-05/D-09: **el server ya resuelve el `view` por defecto con la misma matriz que `useWeekData.ts:69-97`** (puntero de programa → `program`; presencial → `templo`; si no, la primera inscripción). Si el cliente omite `view`, `/sessions/weekly` puede salir apenas hay perfil (tz + nivel), en paralelo con todo, sin esperar suscripción ni inscripciones [VERIFIED: `el-templo-api/src/modules/sessions/session-view.ts:108-260`].

**Primary recommendation:** Plan 1 = config viva de nginx al repo + access_log permanente + `http2` explícito (no cambia comportamiento) + script `deploy/verify-api-http.sh`. Después: dueño único de los datos del socio en `useUserStore` (en paralelo y con promesa compartida), y cada pantalla resuelve su vista con una **función pura** que recibe flags "llegó / no llegó / venció el tope" y se testea en Vitest (entorno node, sin montar componentes).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Decidir qué se dibuja mientras carga (esqueleto / vacío / contenido) | Browser / Client (funciones puras en `utils/`) | — | Es lógica de presentación. Tiene que ser pura para testearla en node (Vitest sin DOM) |
| Estado de carga por fuente (`loaded`, en vuelo, error) | Browser / Client (stores Pinia) | — | Los stores ya son la fuente (`subscriptionLoaded`, `tarjetasLoaded`, `loaded`) |
| Sacar duplicados / paralelizar | Browser / Client (`useUserStore` como dueño único) | — | Los endpoints son independientes. No hace falta cambiar la API (CONTEXT: "cambios en la API salvo que un endpoint lo exija") |
| Resolver el `view` de `/sessions/weekly` | API / Backend (ya lo hace) | Client (deja de adivinarlo) | `resolveSessionView` ya tiene la matriz por defecto |
| Flag "tuvo contenido" (D-02) | Client storage (Preferences/localStorage) | — | Persiste en el teléfono, por socio |
| Tope D-07 | Browser / Client (timer de UI) | — | CapacitorHttp **ignora** el `timeout` de axios: el tope no puede depender de que el pedido falle |
| HTTP/2 + access_log | nginx (server EC2, a mano con OK) | Repo `deploy/nginx/` (espejo) | No hay deploy automático de nginx (D-12) |
| Verificación h2/h1.1 | Script local (`deploy/`) | — | Pedidos HTTPS públicos, sin SSH |

## HTTP/2: lo que hay hoy (incógnita prioritaria 1 y 2)

### Estado verificado (2026-10-23, desde WSL, sin SSH)

| Prueba | api.eltemplo.org | api-staging.eltemplo.org |
|--------|------------------|--------------------------|
| `curl --http2 -w '%{http_version}' /health` | `2` / 200 | `2` / 200 |
| `openssl s_client -alpn h2,http/1.1` | `ALPN protocol: h2`, TLSv1.3 | `ALPN protocol: h2` |
| `curl --http1.1 /health` | `1.1` / 200 | (igual) |
| Header `Server` | `nginx/1.18.0 (Ubuntu)` | `nginx/1.18.0 (Ubuntu)` |
| IP | 54.21.0.171 (mismo host para api, staging, web, app, admin) | idem |

[VERIFIED: curl 7.81 / OpenSSL 3.0.2 locales]

**Por qué pasa:** el doc de nginx dice que el parámetro `http2` del `listen` "configures the port to accept HTTP/2 connections" [CITED: nginx.org/en/docs/http/ngx_http_core_module.html#listen]. En 1.18 el ALPN se negocia por socket (IP:443) antes de conocer el vhost. Los archivos `deploy/nginx/eltemplo.org`, `www-redirect.eltemplo.org` y `web-staging.eltemplo.org` del repo tienen `listen 443 ssl http2;` y `listen [::]:443 ssl http2;` [VERIFIED: repo]. Por eso el 443 entero ofrece h2: API, frontends, staging y `academy.eltemplo.org` (cliente externo, mismo server según la memoria del EC2 playbook).

### Sintaxis para nginx 1.18

- `http2 on;` **no existe** en 1.18: apareció en 1.25.1 [CITED: nginx.org/en/docs/http/ngx_http_v2_module.html]. Con esa directiva, `nginx -t` falla con "unknown directive". **Usar `listen 443 ssl http2;` y `listen [::]:443 ssl http2;`** (en 1.25.1+ queda deprecado, pero funciona).
- La versión ya se sabe por el header `Server`, así que el plan no necesita ramificar la sintaxis. Igual conviene confirmarla con `nginx -v` en la lectura con OK de D-12.
- Agregar `http2` a la API no cambia el comportamiento (el socket ya lo tiene), pero sirve: (a) documenta la intención y (b) si algún día se borran los vhosts de la web, la API no pierde h2 en silencio.
- Riesgos de h2 (Rapid Reset CVE-2023-44487, `http2_max_concurrent_streams` 128 por defecto, headers grandes vía `large_client_header_buffers` desde 1.19.7): **la exposición ya existe hoy** porque el socket ya habla h2. El cambio no agrega riesgo nuevo. El JWT del header `Authorization` está muy por debajo de los límites por defecto [ASSUMED: tamaño típico del JWT de la app < 1 KB].
- Certbot: `certbot renew` no reescribe los `listen` (solo `certbot --nginx install` toca los bloques). Editar a mano una línea `# managed by Certbot` es seguro [ASSUMED].

### Qué usa cada plataforma de la app

| Plataforma | Cliente real | ¿h2? | Conexiones | Fuente |
|------------|-------------|------|------------|--------|
| iOS | `URLSession.shared` (`CapacitorUrlRequest.getUrlSession`, sin `disableRedirects`) | **Sí, automático por ALPN** (ya hoy) | 1 conexión multiplexada; `httpMaximumConnectionsPerHost` = 6 solo aplica a HTTP/1.1. El `invalidateAndCancel()` que el plugin llama sobre la sesión compartida no tiene efecto | [VERIFIED: `@capacitor/ios` 8.2.0 `HttpRequestHandler.swift:219-221`, `CapacitorUrlRequest.swift:218-224`] + [CITED: Apple DTS en developer.apple.com/forums/thread/94907] |
| Android | `HttpURLConnection` de la plataforma (`url.openConnection()`, `HttpRequestHandler.java:107`) | **No, nunca**: AOSP `HttpsHandler` → `okHttpClient.setProtocols(HTTP_1_1_ONLY)` "Disable SPDY / HTTP/2.0" | Sin tope por host: `Executors.newCachedThreadPool()` (`CapacitorHttp.java:28`), un hilo por pedido. Pool `ConfigAwareConnectionPool`: 5 ociosas, keep-alive 5 min. Cada pedido simultáneo por encima de las ociosas = handshake TCP+TLS nuevo | [VERIFIED: `@capacitor/android` 8.2.0 + AOSP external/okhttp] |
| Web (PWA `app.eltemplo.org`) | XHR del navegador | Sí | multiplexado | [VERIFIED: los frontends ya responden h2] |

Detalle de Android: `buildResponse` lee el body hasta el final con try-with-resources (`readStreamAsString`) y después llama a `connection.disconnect()`. Con el stream ya cerrado, okhttp devolvió la conexión al pool, así que el keep-alive funciona [ASSUMED: semántica de okhttp 2.x `disconnect()` después de liberar el stream; confianza MEDIUM].

**Timeouts (relevante para D-07):** el XHR parchado de Capacitor (`native-bridge.js:673-679`) **no pasa** `timeout` al nativo, solo url/method/data/headers/dataType. En iOS el default queda en 600 s (`HttpRequestHandler.swift:204`). En Android `setConnectTimeout`/`setReadTimeout` no se llaman → 0 = sin límite. El `timeout: 10000` de axios (`boot/axios.ts:31`) **no corre en nativo**, y `abort()` solo dispara el evento en JS mientras el pedido nativo sigue [VERIFIED: código del plugin]. Esto confirma la memoria "CapacitorHttp ignora el timeout" y obliga a que el tope D-07 sea **de UI** (un timer), nunca "esperar a que axios falle".

**¿Sigue valiendo el plan 1?** Sí, pero redefinido: se mide (log), se sincroniza el repo con el server y se deja h2 explícito. La mejora de la fase para Android sale de **menos pedidos simultáneos** (menos handshakes) y **cadenas más cortas**. Para iOS sale de cadenas más cortas. No se recomienda apagar CapacitorHttp para que Android use el stack de la WebView (que sí habla h2): cambia CORS, cookies y el fix de `Content-Type`, y es otra fase [ASSUMED].

## Standard Stack

### Core (ya instalado, no se agrega nada)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Quasar `QSkeleton` | quasar ^2.16.0 | Esqueletos (ya usado en `TodayCard.vue:7-10` con `dark animation="none"`) | Componente nativo del framework, sin dependencia nueva [VERIFIED: repo] |
| Pinia (composition) | ^3.0.4 | Flags de carga por fuente | Patrón del repo (CLAUDE.md) |
| Vitest | ^4.0.18, `environment: 'node'` | Tests de funciones puras y stores | `el-templo-app/vitest.config.ts`, 59 archivos de test [VERIFIED: repo] |
| `@capacitor/preferences` | ^8.0.0 | Flag D-02 en nativo | Patrón dual-path de `useTipsSeenStorage.ts` |
| nginx | 1.18.0 (Ubuntu) | `listen ... http2`, `log_format`, `map`, `access_log if=` | `if=` existe desde 1.7.0 [ASSUMED: versión exacta del parámetro; disponible en 1.18 con seguridad] |
| curl 7.81 (+nghttp2 1.43) / OpenSSL 3.0.2 / jq 1.6 | locales | Script de verificación | [VERIFIED: `command -v`] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Funciones puras + Vitest node | `@vue/test-utils` + `happy-dom` para montar componentes | Prueba el template real, pero **instala dependencias** (pide OK de Franco, memoria `no_auto_install_deps`). El repo ya separa la lógica de los templates (`today-card.ts`, `semanaCta.ts`): alcanza con eso |
| Interceptor de latencia propio (solo dev) | MSW / mock server | Dependencia nueva. Un interceptor de axios de 15 líneas con `import.meta.env.DEV` alcanza |
| `localStorage` síncrono para D-02 | Preferences (async) | Ver Patrón 4. Recomendado: Preferences en nativo, **precargado una vez** junto a `hydrateSelection` |

**Installation:** ninguna. La fase no instala paquetes.

## Package Legitimacy Audit

La fase **no instala paquetes externos**. No se corrió slopcheck porque no hay nada que verificar.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| — | — | — | — | — | — | Sin paquetes nuevos |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
(Si el planner decide sumar `@vue/test-utils`/`happy-dom`, hay que correr el gate y pedir OK a Franco.)

## Architecture Patterns

### System Architecture Diagram (arranque → Mi Templo, socio con plan)

```
HOY (cascadas)                                         PROPUESTO
──────────────                                         ─────────
boot/auth: /auth/me (≤8 s, BootTimeout)                boot/auth: /auth/me
   │                                                      │
   ├─► loadSubscription ─► subscription                   ├─► userStore.loadMemberState()   (Promise.allSettled, promesa compartida)
   │        └─► my-progress ─► current-program+enroll.    │      ├─ subscription
   │                (3 RTT en fila)                       │      ├─ my-progress  (guarda el objeto completo)
   │                                                      │      ├─ current-program + enrollments
MainLayout: config, prompt, my-bookings×2                 │      └─ [plan-status + trial: ver Pitfall 3]
   │                                                      │
MiTemplo onMounted:                                       MainLayout: config, prompt, my-bookings×2 (sin cambio)
   stats, check-ins, tarjetas, novedades, sponsors        │
   ├─(sin plan) loadSubscription ─► …                     MiTemplo onMounted (sin esperar nada):
   ├─ my-progress + current-program + enroll.  ◄─ DUP     stats, check-ins, tarjetas, novedades, sponsors,
   └─► (después) /sessions/weekly  (view adivinado)       /sessions/weekly SIN view (apenas hay perfil: tz + nivel)
         watch(subLoaded) ─► plan-status, trial           ensureMemberState({ maxAgeMs }) ─► reusa la promesa del boot
                                                          │
                                                          ▼
                                       resolveTodayCard({ …, weekLoading, programLoading,
                                                          profileLoading, statsLoading, deadlinePassed })
                                       = 'cargando' (esqueleto) hasta tener todo, o hasta el tope D-07
```

### Recommended Project Structure (archivos nuevos sugeridos)
```
el-templo-app/src/
├── utils/share-in-flight.ts            # promesa compartida (patrón runRefresh)
├── utils/load-deadline.ts              # constante LOAD_DEADLINE_MS + helpers puros
├── composables/useLoadDeadline.ts      # timer de UI con cleanup() (patrón useLiveClock)
├── composables/useCardHadContentStorage.ts  # flag D-02 dual-path (patrón useTipsSeenStorage)
├── modules/plan/utils/planes-view.ts   # resolvePlanesView() pura
├── modules/progression/utils/today-card.ts  # + entradas de carga (ya existe)
└── (tests en __tests__/ junto a cada uno)
deploy/
├── nginx/api.eltemplo.org              # reemplazado por la config viva (D-12), después + http2 + log
├── nginx/api-staging.eltemplo.org      # idem
├── nginx/conf.d/eltemplo-api-log.conf  # log_format + map (contexto http)
└── verify-api-http.sh                  # script D-11
```

### Pattern 1: Dueño único + promesa compartida + frescura (duplicados del arranque)

**What:** `useUserStore` es la única fuente de suscripción, my-progress, current-program y enrollments. Pide los 4 **en paralelo** y comparte la promesa en vuelo.

**Por qué no alcanza con deduplicar la promesa en vuelo:** hoy el boot pide my-progress **después** de que llega la suscripción (`useUserStore.ts:453-457`), y Mi Templo lo pide **al montar** (`MiTemplo.vue:413`). Como son momentos distintos, a veces los dos pedidos se solapan y a veces no. Hacen falta las dos cosas: (a) paralelizar el boot para que salgan todos juntos al principio y (b) que Mi Templo llame a `ensureMemberState({ maxAgeMs })`, que reusa la promesa en vuelo **o** un resultado de hace menos de N segundos. Así se conserva la recarga al volver a Mi Templo, que hoy refresca todo en cada montaje.

**Cambios concretos:**
- `fetchProgramEnrollmentStatus` guarda el objeto completo (`myProgress: MemberEnrollmentProgress | null` + `myProgressLoaded`). `MiTemplo.loadProgramProgress` (`:281`) y `PlanesPage` (`:265-273`) leen del store en vez de llamar a `useProgramsApi().getMyProgress()`.
- `subscriptionLoading` hoy baja **antes** de que lleguen my-progress e inscripciones (el `finally` está en `:446-451` y los `await` vienen después). Agregar `memberStateLoaded` (las 4 fuentes resueltas por primera vez, con el mismo criterio que `planStateLoading`: un refresco no vuelve a la carga). `TrainingIndex` y `useWeekData` lo usan.
- `onProgramChanged` (`MiTemplo.vue:295-300`) fuerza el refresco (`force: true`).
- Reservas multi-sede (`ReservasPage.vue:2364-2371`): asignar `selectedBranchId` dispara el `watch` (`:2293`) **y además** se llama `loadGrid()` a mano → dos `/weekly`. Fix explícito: llamar a `loadGrid()` solo si el valor no cambió (si cambió, el watch ya lo pide). Ojo: `getSignal()` (`useSchedulingApi.ts:111-114`) pisa el `AbortController` anterior **sin abortarlo**, así que hoy los dos pedidos terminan.

```ts
// Source: patrón de runRefresh() en el-templo-app/src/boot/axios.ts:79-127
export function shareInFlight<T>(fn: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null
  return () => {
    if (inFlight) return inFlight
    inFlight = fn().finally(() => {
      inFlight = null
    })
    return inFlight
  }
}
```

### Pattern 2: "Todavía no sé" como entrada explícita de la función pura

**What:** `resolveTodayCard` ya devuelve `cargando` con `planLoading` (`today-card.ts:330`) y `bookingsLoading` (`:356`). Hay que sumar las entradas que faltan para D-05/D-06/D-08 en vez de defaults que se leen como respuesta:

| Entrada nueva | Hoy (default que miente) | Fuente |
|---------------|--------------------------|--------|
| `profileLoading` | `isVirtual = profile?.branchIsVirtual ?? false` (`MiTemplo.vue:240`), tz `DEFAULT_BRANCH_TZ` (`useTodayBookingStore.ts:65`) | `userStore.profile === null` con sesión |
| `weekLoading` | `todayRoute` null → nombre de la actividad (`today-card.ts:362`) y "Elegí día…" (`:393`) | `useWeekData().loading` + "ya cargó una vez" |
| `programLoading` | `program` null → `onlineLibre` (`:485`); `hasExtraPrograms` false | `myProgressLoaded` + `memberStateLoaded` |
| `trialLoading` | `trialEligible = ref(false)` (`MiTemplo.vue:182`) | solo cuenta si no hay plan |
| `statsLoading` | `todaySession` null → `completada` nunca / `todayCompleted` false | `progressionStore` "cargó una vez" |
| `deadlinePassed` | — | `useLoadDeadline` (D-07) |

**Regla del tope:** con `deadlinePassed` en true, cada "loading" que **no** decide la existencia del plan deja de bloquear y el gate usa solo lo que sabe. Lo que sí decide si hay plan (suscripción + plan-status) **nunca** cae a "sin plan" por el tope (D-07: nada de "No tenés plan" si la suscripción no llegó). Para eso hace falta un modelo "neutral" nuevo (ver Open Question 3).

**Test:** se extiende `today-card.test.ts` (143 casos, fixture `baseInput()`). Un caso por entrada: "con X cargando → `cargando`" y "con X cargando + tope vencido → modelo sin el dato de X, nunca un gate de sin plan".

### Pattern 3: Vista de página pura (Planes, TrainingIndex, Perfil)

```ts
// modules/plan/utils/planes-view.ts — un solo lugar decide qué se dibuja
export type PlanesView = 'skeleton' | 'content' | 'empty' | 'error'
export function resolvePlanesView(i: {
  plansLoaded: boolean; plansFailed: boolean; plansCount: number
  catalogLoaded: boolean; memberStateLoaded: boolean; deadlinePassed: boolean
}): PlanesView {
  const allIn = i.plansLoaded && i.catalogLoaded && i.memberStateLoaded
  if (!allIn && !i.deadlinePassed) return 'skeleton'
  if (i.plansFailed) return 'error'          // un fallo NUNCA se dibuja como "No hay planes"
  if (!i.plansLoaded) return 'skeleton'      // sin planes no hay página (la sección central)
  return i.plansCount === 0 ? 'empty' : 'content'
}
```
- Hoy `PlanesPage.vue:166` arranca con `loading = ref(false)`, el `v-if` de "No hay planes" está en `:9`, el `onMounted` en `:239` **espera** `loadSubscription` (la cadena entera de 4 pedidos) antes de prender `loading`, y catálogo y my-progress van en fila después. El fix: `Promise.allSettled([ensureMemberState(), plans, catalog])` y una sola vista.
- Mismo esquema en `TrainingIndex.vue`: hoy el `v-if` de `:7` usa `subscriptionLoading`, que baja antes de que lleguen las inscripciones, y la vidriera de `:15` aparece un instante para un socio solo online. El gate pasa a `memberStateLoaded`.
- `ProfilePage.vue:26/63`: `v-if subscriptionLoading` → `v-else-if subscription` → `v-else` "Sin suscripcion activa". En el primer frame (antes del `onMounted` `:283`) `subscriptionLoading` es false. Gate: `!subscriptionLoaded || subscriptionLoading` → loader/esqueleto.

### Pattern 4: Flag "tuvo contenido" (D-02)

```ts
// composables/useCardHadContentStorage.ts — mismo dual-path y try/catch que useTipsSeenStorage.ts
// Una sola clave JSON por socio: eltemplo.cardHadContent:<userId> → { novedades: true, sponsors: false, … }
```
- **Async vs. primer frame:** `Preferences.get` es async (pasa por el bridge). Si se lee al montar la card, el primer frame no sabe si reservar lugar y aparece el salto que se quería evitar. Recomendación: **precargar el mapa una vez en el boot**, junto a `hydrateSelection()` (que el boot ya espera en `boot/auth.ts:189`), y en el camino optimista sin perfil usar `authStore.user.id`, que sale del token. Lectura síncrona desde un ref del store después de eso. Costo: 1 lectura de Preferences en el arranque.
- Se escribe cuando la fuente resolvió (`loaded`): `true` si hubo ítems, `false` si vino vacía. **Nunca** se escribe tras un error (fail-open → no se sabe).
- Cards: Novedades (`MiTemplo.vue:33`, store sin `loaded`), Sponsors (`:46`, store sin `loaded`), CheckInPanel (`:37`, `checkInState`), tarjetas libres de "Para vos" (`avisosStore.tarjetasLoaded` ya existe), ProgramCtaCard (`showProgramCta` `:218`).
- Hay que agregar `loaded` a `useNovedadesStore` y `useSponsorsStore` (hoy solo tienen `loading` y una generación). `reset()` en logout lo baja.

### Pattern 5: `/sessions/weekly` sin `view` (destraba D-05 y D-09)

`resolveSessionView` (`el-templo-api/src/modules/sessions/session-view.ts:220-260`), sin `view`: puntero `currentProgramEnrollmentId` activo → `program`; si no, presencial (por **grupo** `PRESENCIAL_GROUP_CATEGORIES`, que incluye paquete) → `templo`; si no, la primera inscripción activa. Es la misma matriz que el cliente arma en `useWeekData.ts:83-95`, con dos diferencias a favor del server:
1. Con el puntero vencido, el `view=program` explícito da **403**, y el default cae a templo o a la primera inscripción.
2. El cliente decide "presencial" con `planCategory === 'presencial'` (`useUserStore.ts:258-263`) y el server por grupo. Un socio de paquete hoy manda sin `view` y el server lo resuelve igual.

→ **Recomendación:** que `useWeekData` deje de mandar `view` siempre. `/sessions/weekly` depende entonces solo del perfil (tz para `weekStart` y `selectedLevel` hidratado) y sale en el mismo tick que el resto del montaje. Elegir programa en la hoja hace PUT (`setCurrentProgramId`, `useUserStore.ts:561-577`) y recién después vuelve a pedir la semana, así que el puntero del server ya está actualizado. Confianza HIGH en el código; conviene que el planner sume un test de API que fije "sin `view` = mismo resultado que el `view` explícito" si no existe [ASSUMED: que no exista ya un test así].

### Pattern 6: Tope compartido (D-07)

```ts
// composables/useLoadDeadline.ts — patrón useLiveClock: sin onUnmounted adentro, expone cleanup()
export function useLoadDeadline(ms = LOAD_DEADLINE_MS) {
  const passed = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null
  function start(): void { cleanup(); passed.value = false; timer = setTimeout(() => (passed.value = true), ms) }
  function cleanup(): void { if (timer !== null) { clearTimeout(timer); timer = null } }
  return { passed, start, cleanup }
}
```
- Uno por página (Mi Templo, Planes, Entrenar, Perfil). Arranca en `onMounted` y la página llama a `cleanup()` en `onUnmounted`. Las cards reciben `passed` por input de la función pura. Cuando el dato llega después del tope, la función vuelve sola al modelo completo (D-07 "se completa sola").
- **Valor recomendado: 6000 ms.** El boot ya pudo haber esperado hasta 8 s (`BOOT_NETWORK_TIMEOUT_MS`, `boot/auth.ts:89`), así que el peor caso visible ya es 8 + 6. Una constante única en `utils/load-deadline.ts`.
- Tests con fake timers (`vi.useFakeTimers`, `vi.advanceTimersByTime`). Ojo con la memoria "Fake timers: saltos relativos a `Date.now()`".

### Pattern 7: Perfil tardío (D-08)

- "Perfil no llegó" = `authStore.isAuthenticated && userStore.profile === null`. `profileStale` solo indica que hay que reintentar. Lo que importa es `profile`, que en los dos caminos optimistas de `boot/auth.ts` (`:162-166` y `:207-215`) queda en null.
- Dependen del perfil: saludo `MainLayout.vue:336-340` ("Atleta"), `isVirtual` (`MiTemplo.vue:240`), `tz` (`useTodayBookingStore.ts:65`; `useTrainingWeek.ts` también usa `DEFAULT_BRANCH_TZ`), `weekStart` de Mi Templo y `selectedLevel` (que `retryProfileLoad` hidrata recién en `useUserStore.ts:400`).
- `todayBookingStore.load()` corre en MainLayout (`:261`) con la tz por defecto si no hay perfil. Cuando llega el perfil por `retryProfileLoad`, hay que volver a cargar si la tz cambió, o tratar `loaded` como falso hasta que haya perfil.
- `retryProfileLoad` solo se dispara en una navegación (`router/index.ts:37`). Si el primer reintento también falla y el socio no navega, el esqueleto dura hasta el tope D-07. El planner puede sumar un reintento en `visibilitychange` (MainLayout ya tiene el handler en `:289-293`) [discreción].

### Anti-Patterns to Avoid
- **`loading = ref(false)` como estado inicial de algo que se pide al montar:** el primer frame dibuja el vacío. Hay que usar el "cargó por primera vez" (`*Loaded`), como `subscriptionLoaded` y `planStateLoading`.
- **El loader de página de Mi Templo (`MiTemplo.vue:4`, `progressionStore.loading`):** tapa la página entera, card de hoy incluida, mientras llega `/progression/stats`, y se vuelve a prender en cada visita (`useProgressionApi.ts:25-28`). Con D-01 se reemplaza por esqueletos en lo que depende de stats (WeekStrip `totalSessions`, GeneralContent, `todayCompleted`). El estado de error de página (`:10`) también tapa todo; con D-07 un fallo de stats no debería borrar la pantalla (ver Open Question 4).
- **Decidir con `subscriptionLoading` cosas que dependen de las inscripciones** (TrainingIndex): baja antes de tiempo.
- **Confiar en el timeout de axios en nativo:** no corre (ver HTTP/2 §Timeouts).
- **Leer Preferences al montar la card para decidir el esqueleto:** el primer frame llega antes que la lectura.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Esqueletos | Divs grises con animación propia | `q-skeleton` (como `TodayCard.vue:7-10`) | Consistencia visual, `dark`, `animation="none"` ya elegidos |
| Promesa compartida | Un mutex o cola nueva | El patrón `runRefresh` (`boot/axios.ts:79-127`) generalizado en `shareInFlight` | Ya está probado en `axios-refresh-lock.test.ts` |
| Storage dual nativo/web | Otra capa de storage | El patrón de `useTipsSeenStorage.ts` | Mismo try/catch y `log.warn`, por socio |
| Tests de orden de resolución | Montar la app o Playwright | `deferred()` de `user-store-plan-state-loading.test.ts:17-24` + funciones puras | Corre en node en ms, sin dependencias |
| Verificar ALPN | Parsear TLS a mano | `openssl s_client -alpn` + `curl -w '%{http_version}'` | Herramientas estándar ya instaladas |
| Excluir la TV del log | Filtrar después con `grep -v` | `map $request_uri $api_loggable` + `access_log … if=` | Nunca se escribe → no ocupa disco |

**Key insight:** casi todo existe en el repo. El trabajo es aplicar la misma disciplina (`*Loaded` + función pura + tope) en las ~10 superficies del inventario, no inventar infraestructura.

## Inventario de candidatos (re-verificado contra `ab4342b27`)

Todas las líneas del HALLAZGOS coinciden con el código actual, salvo corrimientos de 1-2 líneas que se anotan. [VERIFIED: grep]

| # | Pantalla | Archivo:línea (actual) | Fix recomendado |
|---|----------|------------------------|-----------------|
| C-1 | Planes vacío + regulares antes que Por Objetivos | `PlanesPage.vue:166` (loading false), `:9` (empty), `:37-39` (Por Objetivos), `:239-276` (cadena) | Patrón 3 + `allSettled` |
| C-2 | Título actividad → rutina; "Elegí…" → "Próxima" | `today-card.ts:362`, `:393`; `MiTemplo.vue:413-415` | Patrón 2 (`weekLoading`) + Patrón 5 |
| C-3 | Virtual `onlineLibre` → `online-programa` | `MiTemplo.vue:337`, `today-card.ts:485` | Patrón 2 (`programLoading`) |
| C-4 | "Clase de prueba gratis" / "Tus programas" tardíos | `MiTemplo.vue:182`, `:321-328`; `today-card.ts:280`, `:414` | Patrón 2 + Pitfall 3 |
| C-5 | Saltos Novedades/Sponsors/CheckIn/WeekStrip/ProgramCta | `MiTemplo.vue:33`, `:46`, `:37`, `:48-54`, `:218` | Patrón 4 |
| C-6 | Loader de página contenido→loader→contenido | `progressionStore.ts:54`, `MiTemplo.vue:4`, `useProgressionApi.ts:25-46` | Esqueletos por card, sin loader de página |
| C-7 | Red lenta: "Atleta", presencial para virtual, tz por defecto | `MainLayout.vue:336-340`, `MiTemplo.vue:240`, `useTodayBookingStore.ts:65` | Patrón 7 |
| C-8 | Entrenar `view` adivinado + vidriera un instante | `useWeekData.ts:69-97`, `TrainingIndex.vue:7`, `:15`, `:39-41` | Patrón 5 + `memberStateLoaded` |
| C-9 | Perfil "Sin suscripcion activa" | `ProfilePage.vue:26`, `:63-67`, `:283-285` | Patrón 3 |
| C-10 | CTA Empezar → Continuar | `semanaCta.ts:130`, `useTrainingWeek.ts` (`hasProgress = ref(false)`) | Barato: `hasProgress: boolean \| null` y el label no se pinta hasta que `refreshProgress` resuelve (lectura local, ms) |
| **C-11 (nuevo)** | "Para vos": texto de respaldo → texto del admin | `ReferralCtaCard.vue:33-41`, `UpsellBadge.vue:25-37` (`FALLBACK_*` hasta que llega `/communications/me/tarjetas`) | Esqueleto del riel hasta `tarjetasLoaded` (o el tope). Solo se nota si el admin editó el copy [ASSUMED: que hoy difiere] |
| (revisado, sin acción) | PermissionBanner | `PermissionBanner.vue:34-36` arranca con `'prompt'` | **No parpadea:** `boot/push-notifications.ts` es async y Quasar lo espera antes de montar. El estado se sabe antes del primer render [VERIFIED: código] |
| R-1 | Reservas multi-sede `/weekly` ×2 | `ReservasPage.vue:2293` (watch) + `:2366-2371` | Patrón 1 (último punto) |

## Common Pitfalls

### Pitfall 1: Medir HTTP/2 que ya está prendido
**What goes wrong:** el plan 1 promete un antes/después de h2 que no existe. El script "pasa" en staging antes de tocar nada.
**How to avoid:** redefinir el plan 1 (ver Summary) y decírselo a Franco. Que el script **corra primero sin cambios** y deje constancia de que ya da h2.
**Warning signs:** `curl --http2 … → 2` antes del cambio.

### Pitfall 2: `http2 on;` en nginx 1.18
**What goes wrong:** `nginx -t` falla con "unknown directive http2".
**How to avoid:** `listen 443 ssl http2;` + `listen [::]:443 ssl http2;`. Siempre `sudo nginx -t` antes del `reload`, con OK de Franco. El reload afecta a los 10 vhosts, incluido `academy.eltemplo.org` (cliente externo).

### Pitfall 3: D-06 en paralelo para todos rompe el SC-4 por poco
**What goes wrong:** pedir plan-status y trial-eligibility en paralelo con la suscripción **para todos** suma 2 pedidos a cada socio con plan, que hoy no los pide. La cuenta queda en 18 − 3 duplicados + 2 = **17**, sin margen respecto de "< 18". A eso se suma el POST `/notifications/token` de cada arranque y el `/auth/refresh` cuando el token venció.
**How to avoid (recomendado):** pedirlos en paralelo **solo si el socio no tenía plan activo la última vez**. Es un hint por socio en el mismo storage de D-02. La primera vez, o si el hint dice que tenía plan, se piden después de la suscripción **solo** si llega sin plan (hoy ya es así). La card no parpadea en ningún caso porque espera en esqueleto (Patrón 2). Alternativa: aceptar los 17. Decisión de Franco (Open Question 2).

### Pitfall 4: Esqueleto colgado
**What goes wrong:** un store fail-open (novedades, sponsors) que nunca marca `loaded` tras un error deja el esqueleto para siempre, o el perfil nunca llega.
**How to avoid:** `loaded = true` en el `finally` (como `subscriptionLoaded`) + el tope D-07 en todas las cards. Test: "falla → sale del esqueleto y no muestra contenido inventado".

### Pitfall 5: El dedupe se come un refresco legítimo
**What goes wrong:** `ensureMemberState` con frescura reusa datos viejos después de que el socio cambió de programa o renovó.
**How to avoid:** `force: true` en `onProgramChanged`, en la renovación y al volver de Planes o Reservas si corresponde. `maxAgeMs` corto (≈10-30 s) pensado solo para el arranque.

### Pitfall 6: El flag D-02 se escribe tras un error
**What goes wrong:** un error de red escribe "estuvo vacía" y la próxima apertura la card salta.
**How to avoid:** solo se escribe en respuesta 2xx.

### Pitfall 7: La tz por defecto calcula la semana equivocada
**What goes wrong:** sin perfil, `weekStartsFor(todayInTz(DEFAULT_BRANCH_TZ))` pide la semana o los turnos equivocados (sede en Barcelona, domingo a la noche).
**How to avoid:** no pedir `/sessions/weekly` de Mi Templo hasta tener perfil, y recargar `todayBookingStore` cuando el perfil llega con otra tz (Patrón 7). Memoria relacionada: "UTC vs `todayInTz(sede)` rompe de noche".

### Pitfall 8: Formato del log que rompe los greps del playbook
**What goes wrong:** el Triage 4/5 del playbook usa `awk '{print $4, $9}'` (posiciones del formato `combined`). Un `log_format` con otro orden lo rompe.
**How to avoid:** arrancar el `log_format` con el prefijo exacto de `combined` y agregar los campos nuevos **al final**. Usar un archivo aparte (`/var/log/nginx/api.access.log`, que entra en el glob de logrotate `*.log`) y actualizar el comando del playbook para que apunte a ese archivo.

### Pitfall 9: Tests de la app que nadie corre
**What goes wrong:** el CI **no corre** los Vitest de la app (`app-check` = lint advisory + audit + build, `.github/workflows/ci.yml:141-170`) y tampoco typechequea (memoria `reference_ci_no_typecheck_frontends`). Un test roto pasa verde.
**How to avoid:** el ejecutor corre `pnpm exec vitest run <archivo>` angosto después de cada plan. El worktree **no tiene `node_modules`** (ver Environment).

## Code Examples

### Config nginx propuesta (sobre la config viva que se trae en D-12)
```nginx
# deploy/nginx/conf.d/eltemplo-api-log.conf → /etc/nginx/conf.d/ (contexto http, incluido por nginx.conf de Ubuntu)
# Prefijo idéntico a "combined" (no rompe los awk del playbook) + campos nuevos al final.
log_format api_timed '$remote_addr - $remote_user [$time_local] "$request" '
                     '$status $body_bytes_sent "$http_referer" "$http_user_agent" '
                     'proto=$server_protocol rt=$request_time urt=$upstream_response_time '
                     'uct=$upstream_connect_time host=$host';

# Sondeo de la TV (~350k/día) fuera del log. $request_uri incluye ?branchId=…; el regex es prefijo.
map $request_uri $api_loggable {
    ~^/api/admin/tv/control/screen  0;
    default                         1;
}
```
```nginx
# En el server block 443 de api.eltemplo.org (y api-staging con su archivo propio)
listen 443 ssl http2;          # nginx 1.18: http2 va en listen (http2 on; es ≥1.25.1)
listen [::]:443 ssl http2;
access_log /var/log/nginx/api.access.log api_timed if=$api_loggable;   # reemplaza "access_log off;"
```
[CITED: nginx.org core/log module docs; sintaxis `if=` ASSUMED disponible en 1.18 (existe desde 1.7.0)]

> Antes de escribir esto hay que resolver dónde está hoy el `access_log off`. El HALLAZGOS cuenta 410–430k/día en `/var/log/nginx/access.log` con un 85% de TV que va a `api.eltemplo.org`, pero dice que ese vhost tiene `access_log off`. Las dos cosas no pueden ser ciertas a la vez para el mismo bloque. Lo aclara `sudo nginx -T` en la lectura de D-12 (Open Question 5).

### Comandos de lectura con OK (D-12), en un solo SSH
```bash
ssh -i ~/.ssh/eltemplo-key.pem ubuntu@54.21.0.171 '
  nginx -v 2>&1; lsb_release -ds;
  sudo cat /etc/nginx/sites-enabled/api.eltemplo.org /etc/nginx/sites-enabled/api-staging.eltemplo.org;
  sudo grep -rn "listen.*443\|access_log" /etc/nginx/sites-enabled/ /etc/nginx/nginx.conf;
  cat /etc/logrotate.d/nginx; df -h /var/log; ls -la /var/log/nginx/ | head -30'
```
(Mostrarle a Franco el comando exacto y esperar el OK, Regla 0 del playbook. No commitear nada que tenga secretos: los configs de nginx no deberían tenerlos, pero hay que revisarlos.)

### Script de verificación (D-11), esqueleto
```bash
#!/usr/bin/env bash
# deploy/verify-api-http.sh — uso: VERIFY_API_EMAIL=… VERIFY_API_PASSWORD=… deploy/verify-api-http.sh https://api-staging.eltemplo.org
# Credenciales SOLO por env (o `read -s` si faltan). Nunca en el repo.
set -euo pipefail
BASE="${1:?uso: $0 https://api-staging.eltemplo.org}"; HOST="${BASE#https://}"
: "${VERIFY_API_EMAIL:?falta VERIFY_API_EMAIL}"
if [ -z "${VERIFY_API_PASSWORD:-}" ]; then read -rsp "Password de ${VERIFY_API_EMAIL}: " VERIFY_API_PASSWORD; echo; fi
fail=0; ok(){ echo "OK   $*"; }; ko(){ echo "FAIL $*"; fail=1; }

alpn=$(openssl s_client -connect "$HOST:443" -servername "$HOST" -alpn h2,http/1.1 </dev/null 2>/dev/null | awk -F': ' '/ALPN protocol/{print $2}')
[ "$alpn" = "h2" ] && ok "ALPN h2" || ko "ALPN=$alpn"
[ "$(curl -s --http2   -o /dev/null -w '%{http_version} %{http_code}' "$BASE/health")" = "2 200" ]   && ok "h2 /health"   || ko "h2 /health"
[ "$(curl -s --http1.1 -o /dev/null -w '%{http_version} %{http_code}' "$BASE/health")" = "1.1 200" ] && ok "h1.1 /health" || ko "h1.1 /health"

LOGIN=$(curl -s --http1.1 -H 'Content-Type: application/json' \
  -d "$(jq -n --arg e "$VERIFY_API_EMAIL" --arg p "$VERIFY_API_PASSWORD" '{email:$e,password:$p}')" "$BASE/api/auth/login")
TOKEN=$(jq -r '.accessToken // empty' <<<"$LOGIN"); REFRESH=$(jq -r '.refreshToken // empty' <<<"$LOGIN")
[ -n "$TOKEN" ] || { ko "login"; exit 1; }

WEEK=$(date -d "$(( $(date +%u) - 1 )) days ago" +%F)   # lunes de esta semana (en la tz de la máquina)
for path in /api/auth/me /api/members/subscription/me/subscription /api/members/programs/my-progress \
            /api/members/me/current-program /api/members/me/enrollments /api/progression/stats \
            /api/check-ins/today /api/communications/me/novedades /api/members/sponsors \
            /api/communications/me/tarjetas "/api/sessions/weekly?weekStart=$WEEK" \
            "/api/members/scheduling/my-bookings?weekStart=$WEEK"; do
  probe() {  # $1 = --http2 | --http1.1 → "status claves-ordenadas"
    local out code keys
    out=$(curl -s "$1" -H "Authorization: Bearer $TOKEN" -w '\n%{http_code}' "$BASE$path")
    code=$(tail -n1 <<<"$out")
    keys=$(sed '$d' <<<"$out" | jq -cS 'if type=="object" then keys else type end' 2>/dev/null || echo nojson)
    echo "$code $keys"
  }
  r2=$(probe --http2); r1=$(probe --http1.1)
  [ "$r2" = "$r1" ] && [[ "$r2" =~ ^(200|204) ]] && ok "$path ($r2)" || ko "$path h2=[$r2] h1=[$r1]"
done
# Revocar el refresh token emitido por este login (POST /auth/logout es público, body-based)
[ -n "$REFRESH" ] && curl -s --http1.1 -o /dev/null -H 'Content-Type: application/json' -d "{\"refreshToken\":\"$REFRESH\"}" "$BASE/api/auth/logout"
exit $fail
```
- Compara **status + set de claves** con h2 y con h1.1, no el body entero: hay campos que dependen del momento, como el `timestamp` de `/health`.
- El login no tiene rate limit (`@fastify/rate-limit` con `global: false`, solo rutas opt-in: `app.ts:160-165`) [VERIFIED]. El logout final evita dejar refresh tokens vivos.
- Usuario de staging y de prod: Open Question 6. `lunes actual` aproximado: si cae en otra semana por tz, el endpoint igual responde 200.

### Interceptor de latencia solo en dev (para reproducir parpadeos, SC-6)
```ts
// boot/axios.ts — import.meta.env.DEV es false en `quasar build` → Vite lo elimina del bundle de prod
const DEV_LATENCY_MS = import.meta.env.DEV ? Number(import.meta.env.VITE_DEV_LATENCY_MS ?? 0) : 0
if (DEV_LATENCY_MS > 0) {
  api.interceptors.request.use(async (config) => {
    // Jitter 0.5x–1.5x: cambia el ORDEN de llegada entre pedidos, que es lo que destapa las carreras.
    await new Promise((r) => setTimeout(r, DEV_LATENCY_MS * (0.5 + Math.random())))
    return config
  })
}
```
Hay que sumar `VITE_DEV_LATENCY_MS` (comentado) a `el-templo-app/.env.example` (regla de CLAUDE.md). Con el mismo guard se puede contar pedidos (`log.debug` con URL y número de orden) para el SC-4.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `listen 443 ssl http2;` | `listen 443 ssl;` + `http2 on;` | nginx 1.25.1 | **No aplica**: el server está en 1.18.0 |
| `http2_max_field_size`/`_header_size`/`_idle_timeout` | `large_client_header_buffers`/`keepalive_timeout` | nginx 1.19.7 | En 1.18 las viejas siguen valiendo. No hace falta tocarlas |
| Loader de página global | Esqueletos que reservan el lugar final | — | D-01 |

**Deprecated/outdated:**
- La afirmación del HALLAZGOS "La API no tiene HTTP/2" y "límite de ~6 conexiones → cola": **incorrecta** para ambas plataformas (ver §HTTP/2). Actualizar el HALLAZGOS o anotarlo en el plan 1.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `disconnect()` después de leer el body hasta el final no cierra el socket en el okhttp de Android (keep-alive efectivo) | HTTP/2 | Si cierra, cada pedido de Android paga TLS → reducir pedidos pesa todavía más. No cambia el plan |
| A2 | `access_log … if=` disponible en 1.18 (desde 1.7.0) | Code Examples | `nginx -t` lo detecta antes del reload |
| A3 | Certbot no reescribe los `listen` editados en `renew` | HTTP/2 | Bajo. Se revisa en la próxima renovación |
| A4 | JWT del header < límites de h2 | HTTP/2 | Nulo: h2 ya está activo hoy y la app anda |
| A5 | El copy del admin en tarjetas difiere del fallback (C-11 visible) | Inventario | Si no difiere, el fix igual es inocuo |
| A6 | No existe un test de API que fije "sin `view` = view explícito" | Patrón 5 | Si existe, se reusa |
| A7 | Apagar CapacitorHttp para tener h2 en Android cambia CORS/cookies/Content-Type | HTTP/2 | Fuera de alcance de todos modos |

## Open Questions

1. **D-10 sin "antes": ¿cómo sigue el plan 1?** (bloquea el orden de los planes)
   - What we know: la API ya negocia h2 (iOS ya lo usa). Android nunca lo va a usar con CapacitorHttp.
   - Recommendation: el plan 1 = sincronizar el config + log permanente + `http2` explícito + script, y medir 1-2 días de línea base (protocolo por User-Agent, pedidos por apertura, `rt`) **antes** de tocar la app. Franco tiene que saberlo antes de aprobar los planes (la memoria `no_bloquear_cadena` dice avanzar con la recomendada y dejar la duda por escrito).
2. **D-06 vs. SC-4 (Pitfall 3):** ¿plan-status + trial en paralelo para todos (17 pedidos, sin margen) o solo con el hint "sin plan la última vez"? Recomendado: el hint.
3. **Qué muestra la card de hoy después del tope sin perfil o sin suscripción.** D-07 prohíbe inventar estados y la discusión descartó "error con reintentar". Recomendado: un kind `neutral` (kicker "Hoy", título con la fecha de la sede si se sabe, sin pill, primary "Entrenar" → `/training`, que tiene su propio gate). El planner lo fija y Franco lo valida en el UAT.
4. **Error de `/progression/stats`:** hoy reemplaza la página entera por error + "Reintentar" + toast. Con D-07 debería degradar solo WeekStrip/GeneralContent. ¿Se mantiene el toast? Recomendado: sin pantalla de error completa, con el toast.
5. **¿Dónde está hoy el `access_log off` y de dónde salen las líneas de la TV en `access.log`?** Lo resuelve la lectura de D-12 (`nginx -T` / `grep access_log`).
6. **Usuarios de prueba para el script:** ¿cuál en staging y cuál en prod? (¿la cuenta de Franco?) Las credenciales van por env y nunca se commitean.
7. **`node_modules` en el worktree:** `el-templo-app/node_modules` no existe en `et-202-carga`. Para correr los Vitest de la app (que el CI no corre) hace falta `pnpm install --frozen-lockfile` con OK de Franco. La memoria `no_auto_install_deps` y la nota de la 197 ("no instalar node_modules en un worktree nuevo solo para typecheck") lo piden explícito.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| curl con nghttp2 | Script h2 | ✓ | 7.81.0 / nghttp2 1.43.0 | — |
| openssl | ALPN | ✓ | 3.0.2 | `curl -v` ("ALPN, server accepted to use h2") |
| jq | Script | ✓ | 1.6 | — |
| nginx en el server | HTTP/2 + log | ✓ (remoto) | 1.18.0 (Ubuntu) | — (cambios a mano con OK) |
| `el-templo-app/node_modules` (worktree) | Vitest de la app, lint | ✗ | — | `pnpm install --frozen-lockfile` **con OK de Franco** |
| vitest | Tests | ✓ en el checkout principal (`/home/franco/projects/el-templo/el-templo-app/node_modules/.bin/vitest`) | ^4.0.18 | Ídem arriba |
| vue-tsc | Typecheck de la app | ✗ (no es devDependency de `el-templo-app`; `npx vue-tsc` lo bajaría del registry) | — | `tsc` no entiende `.vue`; pedir OK o confiar en el lint + build |
| SSH al EC2 | D-12/D-13 | ✓ (llave `~/.ssh/eltemplo-key.pem` según memoria) | — | **Gate: OK de Franco cada vez** |

**Missing dependencies with no fallback:** ninguna que bloquee la investigación. Sin OK para `pnpm install` los tests de la app no corren localmente, y el CI tampoco los corre.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.18 (entorno `node`, `globals: true`, alias `src`) |
| Config file | `el-templo-app/vitest.config.ts` |
| Quick run command | `cd el-templo-app && pnpm exec vitest run src/modules/progression/utils/__tests__/today-card.test.ts` |
| Full suite command | `cd el-templo-app && pnpm test` (suite chica, sin DB). **El CI no la corre** |
| Infra/nginx | `deploy/verify-api-http.sh <base>` (sin SSH) |

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|-------------|
| SC-5 | ALPN h2, h1.1 sigue, endpoints iguales | script | `VERIFY_API_EMAIL=… deploy/verify-api-http.sh https://api-staging.eltemplo.org` (después prod) | ❌ Wave 0 |
| SC-5 | Log con protocolo, sin TV | manual con OK (SSH) | `tail /var/log/nginx/api.access.log` → `proto=HTTP/2.0` (iOS) y `HTTP/1.1` (Android UA); `grep -c control/screen` = 0 | — |
| SC-4 | Sin duplicados: llamar a `loadMemberState` + `ensureMemberState` a la vez → 1 pedido por endpoint | unit (store + `deferred`) | `vitest run src/stores/__tests__/user-store-member-state.test.ts` | ❌ Wave 0 |
| SC-4 | Los 4 pedidos salen en paralelo (todos en vuelo antes de resolver el primero) | unit | ídem | ❌ |
| SC-4 | Reservas multi-sede: 1 `/weekly` | unit (función extraída) o conteo dev | `vitest run …reservas-initial-load.test.ts` o conteo con `VITE_DEV_LATENCY_MS` | ❌ |
| SC-4 | Total < 18 al abrir con plan | manual/dev + prod log | DevTools Network (XHR) en `quasar dev` + el log nuevo (pedidos por IP+UA en los 30 s posteriores a `/auth/me`) | — |
| SC-1 | Planes: skeleton hasta las 3 fuentes; error ≠ vacío; nunca vacío antes de tiempo | unit (pura) | `vitest run src/modules/plan/utils/__tests__/planes-view.test.ts` | ❌ |
| SC-2 | Card de hoy `cargando` con cada `*Loading`; tope → sin gates de "sin plan" | unit (pura) | `vitest run …/today-card.test.ts` (extender) | ✅ extender |
| SC-2 | Flag D-02: escribe en 2xx, nunca en error; hidrata síncrono | unit | `vitest run src/composables/__tests__/useCardHadContentStorage.test.ts` | ❌ |
| SC-2 | Stores novedades/sponsors marcan `loaded` incluso con error | unit | `vitest run src/stores/__tests__/novedades-store.test.ts sponsors-store.test.ts` | ✅ extender |
| SC-2/3 | Tope D-07 (fake timers): `passed` a los N ms, `cleanup()` lo corta | unit | `vitest run src/composables/__tests__/useLoadDeadline.test.ts` | ❌ |
| SC-3 | `useWeekData` nunca manda `view` | unit (mock `api.get`) | `vitest run src/modules/training/composables/__tests__/useWeekData.test.ts` | ❌ |
| SC-3 | TrainingIndex/Perfil: vista pura no decide antes de `memberStateLoaded`/`subscriptionLoaded` | unit (pura) | `vitest run …training-index-view.test.ts` | ❌ |
| SC-3 | CTA no pinta "Empezar" con `hasProgress` null | unit | `vitest run …/semanaCta.test.ts` (extender) | ✅ extender |
| SC-6 | Ninguna pantalla del inventario parpadea | manual (UAT teléfono) | Red limitada (iOS: Network Link Conditioner "3G"/"Edge"; Android: opciones de desarrollador o hotspot limitado) + `quasar dev` con `VITE_DEV_LATENCY_MS=800` y DevTools "Slow 4G" | `203-UAT.md` ❌ |

### Sampling Rate
- **Per task commit:** el test angosto del archivo tocado (`vitest run <archivo>`) + `pnpm lint` en la app.
- **Per wave merge:** `pnpm test` completo de la app (corre en segundos, sin DB).
- **Phase gate:** suite de la app verde + script h2 verde en staging y prod + UAT en teléfono con red limitada (checklist C-1…C-11, R-1).

### Wave 0 Gaps
- [ ] `deploy/verify-api-http.sh` — SC-5
- [ ] `src/utils/share-in-flight.ts` + test — SC-4
- [ ] `src/stores/__tests__/user-store-member-state.test.ts` (reusa `deferred()`) — SC-4
- [ ] `src/composables/useLoadDeadline.ts` + test — D-07
- [ ] `src/composables/useCardHadContentStorage.ts` + test — D-02
- [ ] `src/modules/plan/utils/planes-view.ts` + test — SC-1
- [ ] Interceptor `VITE_DEV_LATENCY_MS` + `.env.example` — SC-6
- [ ] OK de Franco para `pnpm install --frozen-lockfile` en `el-templo-app` del worktree

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | parcial (script) | Credenciales de prueba solo por env o `read -s`. Logout al final para revocar el refresh token |
| V3 Session Management | no | Sin cambios en tokens |
| V4 Access Control | no | `/sessions/weekly` sin `view` sigue pasando por `resolveSessionView` (403/404 del server) |
| V5 Input Validation | no | Sin inputs nuevos |
| V7 Logging | **sí** | access_log nuevo: **no** loguear `Authorization` (el `log_format` propuesto no lo incluye). `$request` incluye la query string: revisar que ningún endpoint del socio lleve tokens en la query (magic links usan otra ruta) [ASSUMED] |
| V14 Config | sí | `nginx -t` antes del reload. El config del repo sin secretos |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Credenciales del usuario de prueba en el repo o el historial de shell | Information disclosure | Env/`read -s`. No escribirlas en `.planning/` ni en chat |
| Log con PII (IP + UA + rutas) | Information disclosure | Rotación de 14 días existente. Sin headers de auth en el formato |
| Reload de nginx roto tira 10 vhosts (incluido el cliente externo academy) | Denial of service | `nginx -t && reload` con OK, staging primero |
| Interceptor de latencia filtrado a prod | Tampering/DoS | Guard `import.meta.env.DEV` (Vite lo elimina del build) |

Nota aparte (fuera de la fase): `deploy/.credentials` está **trackeado en git** aunque figura en `.gitignore` y contiene una clave `DB_PASSWORD_PROD` [VERIFIED: `git ls-files`]. Coincide con el pendiente "CRÍTICO: rotar password MySQL de prod" de la memoria. No tocarlo en esta fase, solo recordarlo.

## Project Constraints (from CLAUDE.md)

- Logging: `createLogger()` en la app, nunca `console.*`. En el interceptor de dev también.
- TypeScript sin `any`. `catch (err: unknown)` + `instanceof Error`.
- Stores Pinia composition (`defineStore` + `setup`). Composables con `cleanup()`, **sin `onUnmounted` adentro** (aplica a `useLoadDeadline`).
- Env var nueva → `.env.example` (`VITE_DEV_LATENCY_MS`).
- Sin rutas de API nuevas (si se agregara alguna, test de integración en `el-templo-api/test/`).
- Pre-commit Husky + lint-staged. Si falla, commit nuevo (no amend). `git add` explícito, nunca `-A` (memoria).
- Staging-first estricto; preguntar antes de push; **SSH y cada cambio de nginx con OK de Franco** (Regla 0 del playbook). Sin deploys manuales de frontend.
- Bump de versión **fuera** de la fase (bugfix = patch).
- Ejecutores sonnet en secuencia, tests en foreground (CLAUDE.md §fase 173).
- No correr los tests del **API** localmente (CI). Los de la **app** no corren en CI → angostos y locales (con `node_modules`).

## Sources

### Primary (HIGH confidence)
- Pruebas propias 2026-10-23: `curl --http2/--http1.1`, `openssl s_client -alpn` contra `api.eltemplo.org`, `api-staging.eltemplo.org`, `eltemplo.org`, `app.eltemplo.org`, `admin.eltemplo.org`
- `@capacitor/android` 8.2.0: `CapacitorHttp.java`, `util/HttpRequestHandler.java`, `util/CapacitorHttpUrlConnection.java`, `assets/native-bridge.js` (checkout principal, `src-capacitor/node_modules`)
- `@capacitor/ios` 8.2.0: `HttpRequestHandler.swift`, `CapacitorUrlRequest.swift`
- AOSP okhttp: https://android.googlesource.com/platform/external/okhttp/+/refs/heads/main/android/src/main/java/com/squareup/okhttp/HttpsHandler.java (`HTTP_1_1_ONLY`) y `ConfigAwareConnectionPool.java` (5 ociosas, 5 min)
- nginx: https://nginx.org/en/docs/http/ngx_http_v2_module.html (`http2` 1.25.1, defaults) y https://nginx.org/en/docs/http/ngx_http_core_module.html#listen (`http2` "configures the port", deprecado)
- Código del repo (rama `feat/203-carga-sin-parpadeos` @ `78d561173`, código = `ab4342b27`): archivos citados con línea; `el-templo-api/src/modules/sessions/session-view.ts`, `routes.ts`, `app.ts`

### Secondary (MEDIUM confidence)
- Apple Developer Forums (DTS): https://developer.apple.com/forums/thread/94907 (URLSession usa h2 automáticamente), https://developer.apple.com/forums/thread/73565 (`httpMaximumConnectionsPerHost` 6, HTTP/1.1)

### Tertiary (LOW confidence)
- Semántica de `disconnect()` en okhttp 2.x de Android (A1), por conocimiento previo

## Metadata

**Confidence breakdown:**
- HTTP/2 / plataformas: HIGH (probado contra el server + código de los plugins + AOSP)
- Sintaxis nginx: HIGH (versión del header + docs oficiales). La ubicación del `access_log off` actual: LOW (Open Question 5)
- Arquitectura de la app: HIGH (código leído y líneas verificadas)
- Pitfalls: HIGH/MEDIUM

**Research date:** 2026-10-23
**Valid until:** 2026-11-22 (estable). Re-verificar las líneas si se mergea algo en `el-templo-app/src` antes de ejecutar
