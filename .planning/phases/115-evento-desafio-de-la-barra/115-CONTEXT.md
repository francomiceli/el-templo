# Phase 115: Evento Desafío de la Barra - Context

**Gathered:** 2026-05-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Flujo end-to-end del desafío "aguantar ≥1:30 colgado de una barra" durante la ventana 23/05 12:00 ART → 25/05 12:00 ART: card como primer slide del carrusel premium en `MiTemplo.vue` (forzado visible a todos durante la ventana) → pantalla explicativa → cronómetro ascendente operado por el staff → captura de foto con `@capacitor/camera` → pantalla de resultado con foto compuesta sobre marco placeholder → share vía `@capacitor/share`. Persistencia de intento único en 3 columnas nuevas de `users`, endpoint POST con UPDATE condicional para single-attempt atómico. Versión bump minor y builds nativos firmados deployados a Play Store + App Store antes del 23/05.

</domain>

<spec_lock>

## Requirements (locked via SPEC.md)

**12 requirements are locked.** See `115-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `115-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**

- Schema migration: 3 columnas en `users` (`bar_challenge_completed`, `bar_challenge_seconds`, `bar_challenge_attempted_at`).
- Endpoint backend: `POST /api/me/bar-challenge/result` con single-attempt enforcement (409). **Override en esta discusión:** el path final será `POST /api/bar-challenge/result` (ver D-08).
- Frontend: nueva ruta `/desafio-barra` (explicación), `/desafio-barra/timer`, `/desafio-barra/resultado`.
- Componente `BarChallengeCard.vue` con 2 estados, insertado como primer slide del carrusel durante ventana.
- Override de visibilidad del carrusel durante ventana (a todos).
- Cronómetro ascendente con estado visual de logro al pasar 1:30 (sin haptic, sin sonido).
- Captura de foto via `@capacitor/camera` (con install aprobado en execute-phase).
- Composición foto + marco placeholder via canvas.
- Share via `@capacitor/share` (con install aprobado en execute-phase).
- Marco placeholder commit en repo, reemplazable post-evento.
- Bump minor de versión + builds nativos firmados + deploy a Play Store + App Store.
- KeepAwake activado en pantalla del timer.

**Out of scope (from SPEC.md):**

- Descuento físico, su monto, su forma de canje — fuera de la app.
- Verificación automática de etiqueta en redes — manual.
- Backend de tracking del canje.
- Guardado de la foto en el server.
- Múltiples intentos por usuario.
- Feature flag remoto / backend-driven event toggles.
- Endpoint genérico de desafíos / tabla `challenge_attempts`.
- Sonido o vibración al pasar 1:30.
- Marco final con diseño profesional.
- Confirmación previa al botón "Comenzar".
- Notificaciones push del evento.
- Persistencia del estado del timer/foto contra refresh (decisión D-09).

</spec_lock>

<decisions>
## Implementation Decisions

### Estructura frontend

- **D-01:** Módulo dedicado `el-templo-app/src/modules/bar-challenge/` con subcarpetas `pages/`, `components/`, `composables/`, `stores/`. Sigue la convención del proyecto (training, progression, programs, goal-plan). Aislamiento limpio, fácil de borrar post-evento.
- **D-02:** Ubicación de archivos esperada:
  - `pages/Explicacion.vue`, `pages/Timer.vue`, `pages/Resultado.vue` (3 rutas del SPEC).
  - `components/BarChallengeCard.vue` (slide del carrusel, 2 estados).
  - `composables/useBarChallengeWindow.ts` (lógica de ventana de fecha).
  - `composables/useImageComposer.ts` (composición foto + marco).
  - `stores/useBarChallengeStore.ts` (Pinia setup store).
- **D-03:** Rutas registradas en `el-templo-app/src/router/routes.ts` como children de `MainLayout`, lazy-loaded:
  - `desafio-barra` → `Explicacion.vue`
  - `desafio-barra/timer` → `Timer.vue`
  - `desafio-barra/resultado` → `Resultado.vue`

### Ventana de fecha + override de visibilidad

- **D-04:** Composable `useBarChallengeWindow()` en `src/modules/bar-challenge/composables/`. Exporta `{ start, end, isActive: ComputedRef<boolean>, isBeforeWindow, isAfterWindow }`. `BAR_CHALLENGE_WINDOW = { start: '2026-05-23T15:00:00Z', end: '2026-05-25T15:00:00Z' }` hardcoded dentro del composable.
- **D-05:** Override del carrusel en `MiTemplo.vue` mediante computed local: `showPremiumCarousel = computed(() => showUpsellBadge.value || barChallengeWindow.isActive.value)`. `BarChallengeCard` insertado como primer `<div class="premium-carousel__slide">` cuando `barChallengeWindow.isActive` es true. Lógica del desafío queda aislada en el composable; `MiTemplo.vue` solo lo consume.
- **D-06:** Testing del override en staging vía query param: `useBarChallengeWindow` lee `route.query['bar-challenge-force']` y devuelve `isActive=true` si está presente, sin importar fecha. Se mantiene en el código post-evento (costo cero). No log warning — staging es el caso esperado.

### Estado del intento (timer + foto)

- **D-07:** Pinia store dedicado `useBarChallengeStore` (setup store). Estado: `startTimestamp: Ref<number | null>`, `secondsHeld: Ref<number>`, `isRunning: Ref<boolean>`, `photoBase64: Ref<string | null>`, `attemptResult: Ref<{ completed: boolean; seconds: number } | null>`. Acciones: `start()`, `tick()`, `setPhoto(base64)`, `finalize()`, `submit()`, `reset()`. Vive en memoria, sobrevive navegación entre las 3 rutas del desafío.
- **D-08:** Estado sólo en memoria. **No** persistir en sessionStorage/localStorage. Si el staff hace refresh accidental durante `/timer`, el store resetea y el flujo arranca de nuevo desde 0. Riesgo aceptado — staff entrenado, evento corto, evita complejidad innecesaria.
- **D-09:** Cronómetro implementado con `setInterval` a 100ms refrescando UI, pero la **fuente de verdad es `Date.now() - startTimestamp`**. El interval solo dispara recálculo; `secondsHeld = Math.floor((Date.now() - startTimestamp) / 1000)`. Robusto contra throttling del SO mientras la cámara nativa está abierta — al volver, el cronómetro refleja tiempo real. `KeepAwake.keepAwake()` en `onMounted` de `Timer.vue`, `KeepAwake.allowSleep()` en cleanup.
- **D-10:** Submit del POST con reintento automático: backoff 1s/3s/9s (3 reintentos totales). Si los 3 fallan, push del payload a `bar-challenge-pending-submit` en sessionStorage; al próximo `GET /me` se reintenta una vez más. La pantalla `/resultado` avanza optimistic — muestra el número aguantado y la foto/share sin esperar al backend; si el POST sigue fallando, banner discreto "No se pudo guardar el intento, se está reintentando". Decisión vinculada al criterio del evento: el staff valida con la foto, no con el backend.

### Endpoint API

- **D-11:** Módulo nuevo `el-templo-api/src/modules/bar-challenge/` con `routes.ts`, `service.ts`, y tests en `el-templo-api/test/bar-challenge.test.ts`. Mounting en `el-templo-api/src/app.ts` con `prefix: "/api/bar-challenge"`. Aislamiento limpio, fácil de borrar post-evento.
- **D-12:** Path final: `POST /api/bar-challenge/result` (no `/api/me/bar-challenge/result` como decía el SPEC). El SPEC se actualiza implícitamente — `userId` sale de `request.user`, no de la URL.
- **D-13:** Body validado con zod inline: `{ secondsHeld: z.number().int().min(0).max(600) }`. Bound máximo 600s (10min) — más que eso no es físicamente realista colgado de una barra. 400 con mensaje claro si fail.
- **D-14:** Single-attempt enforcement vía UPDATE condicional atómico: `UPDATE users SET bar_challenge_completed=?, bar_challenge_seconds=?, bar_challenge_attempted_at=NOW() WHERE id=? AND bar_challenge_attempted_at IS NULL`. Si `affectedRows === 0`, devolver 409 con `{ error: "already_attempted", message: "Ya registraste tu intento" }`. Evita race condition de SELECT+UPDATE separados.
- **D-15:** Exposición en `GET /me` (`el-templo-api/src/modules/auth/routes.ts`): siempre devolver los 3 campos del schema (`barChallengeCompleted`, `barChallengeSeconds`, `barChallengeAttemptedAt`), independientemente de la ventana. Frontend lee del `userStore.profile` para decidir el estado de `BarChallengeCard`. Migration tiene que ir antes que este cambio de endpoint en el orden de ejecución.

### Composición foto + marco

- **D-16:** Canvas 1080x1920 (formato IG stories / vertical), foto en `cover` (crop center). El marco fue diseñado a esa resolución; la foto se escala con la mayor dimensión y se crop al centro. Garantiza zero letterbox y look consistente.
- **D-17:** Asset placeholder generado durante execute-phase por Claude. Proceso: levantar el logo SVG existente del proyecto, usar utility de Node (preferentemente `sharp` o `canvas` si ya están disponibles — sino script ad-hoc) para componer PNG 1080x1920 con borde + logo arriba + texto "Desafío de la Barra" abajo. Commit del PNG resultante. Reemplazable post-evento si diseño profesional lo refina (path conservado).
- **D-18:** Path del marco: `el-templo-app/public/desafio-barra/marco-placeholder.png`. Self-hosted en `public/` (cumple feedback de memoria: no CDN externos para assets de producción). Fetch desde el composable como `/desafio-barra/marco-placeholder.png`.
- **D-19:** Composable `useImageComposer()` en `src/modules/bar-challenge/composables/`. Expone `composeWithFrame(photoBase64: string, framePath: string): Promise<Blob>`. Implementación: crear `<canvas>` 1080x1920 offscreen, dibujar imagen escalada cover-centered, dibujar marco encima al tamaño completo del canvas, exportar con `canvas.toBlob(blob => ..., 'image/jpeg', 0.85)`. Testeable en aislamiento (criterio del SPEC pide test manual de smoke).

### Claude's Discretion

- Detalles internos de cleanup del store (`onUnmounted` en `Timer.vue` para llamar `store.reset()` si el usuario abandona sin finalizar): planner decide la mecánica exacta basado en el patrón ya usado en `sessionPlayerStore`.
- Estilos visuales del cambio "logrado" al pasar 1:30 (color, texto exacto): UI decisions del planner; el SPEC define el QUÉ ("texto pasa de 'Aguantá' a '¡Lo lograste! Seguí aguantando' y color de éxito"), el planner escoge tokens existentes del design system.
- Manejo del permiso de cámara denegado: UI clara con fallback (timer + resultado siguen funcionando sin foto/share) — el SPEC ya lockea este criterio en Acceptance; planner decide layout exacto.
- Manejo del fallback si `Share.share` con files falla en algún SO (descarga del JPEG): patrón estándar Capacitor; planner decide implementación.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase spec

- `.planning/phases/115-evento-desafio-de-la-barra/115-SPEC.md` — Locked requirements (12), boundaries, constraints, and acceptance criteria. MUST read before planning.

### Project conventions

- `CLAUDE.md` (project root) — TypeScript no-any, logger over console, integration tests for API routes, `_migrations` table as migration source of truth, Husky/lint-staged pre-commit.
- `.planning/codebase/CONVENTIONS.md` — Pinia composition stores, composables expose `cleanup()`, error monitoring via Sentry.
- `.planning/codebase/STRUCTURE.md` — Module organization in `el-templo-app/src/modules/`.
- `.planning/PROJECT.md` — Current milestone context (v4.85), monorepo structure.

### Existing code (read for grounding)

- `el-templo-app/src/modules/progression/pages/MiTemplo.vue` lines 36-57 — Current carousel implementation (`UpsellBadge` + `ProgramCtaCard`); D-05 modifies this.
- `el-templo-app/src/router/routes.ts` — Where new routes go (children of `MainLayout`).
- `el-templo-api/src/modules/auth/routes.ts` lines 410-490 — `GET /me` shape; D-15 adds 3 fields to the select.
- `el-templo-api/src/db/schema/users.ts` — Drizzle schema for users; migration adds 3 nullable columns.
- `el-templo-api/src/app.ts` — Where new module mounts (`prefix: "/api/bar-challenge"`).

### Feedback / memory (operational constraints)

- `pnpm install` of `@capacitor/camera` and `@capacitor/share` requires **explicit user approval** before execute-phase runs the install. Plan-phase MUST include a confirmation gate.
- Migration SQL files MUST be committed alongside schema changes.
- Staging-first deploy strictly enforced before production builds.
- Versioning: feature = minor bump (`package.json` + `Info.plist` + `build.gradle`).
- No CDN dependencies for static assets — `marco-placeholder.png` lives in `el-templo-app/public/`.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`@capacitor/haptics`** ya instalado, pero la decisión de D-06 del SPEC es no usar haptic — no se invoca en esta fase.
- **`KeepAwake`** plugin ya instalado y usado en otras pantallas — invocar en `onMounted` de `Timer.vue`, cleanup en unmount.
- **Logger via `createLogger()` en `el-templo-app/src/utils/logger.ts`** — usar en lugar de `console.*` (CLAUDE.md). En `useBarChallengeStore`, `useImageComposer`, y submit retry logic.
- **Patrón de carrusel premium en `MiTemplo.vue` lines 36-57** — dots indicators + horizontal scroll + `onPremiumScroll` handler para detectar slide activo. D-05 reutiliza la estructura, solo inserta una slide nueva al inicio.
- **Patrón Pinia composition store** — referencia: `el-templo-app/src/modules/training/stores/sessionPlayerStore.ts` para shape del store del timer (estado reactivo + acciones + cleanup pattern).

### Established Patterns

- **Módulos verticales en `src/modules/`** — convención respetada por D-01 (`src/modules/bar-challenge/`).
- **Rutas children de `MainLayout` con lazy import** — D-03 sigue el patrón existente (`pages/CheckInPage.vue`, `pages/ReservasPage.vue`).
- **Auth middleware via `{ onRequest: [fastify.authenticate] }`** en routes.ts — endpoint nuevo lo usa igual.
- **Test de integración API contra MySQL real (`eltemplo_test`)** — el-templo-api/test/ — bar-challenge.test.ts cubre los 4 casos del SPEC (200×2, 409, 401).
- **Migration SQL files manualmente committeados** en `el-templo-api/src/db/migrations/` (numeradas, ej. `0101_*.sql`, `0102_*.sql`) — D-11 sigue el patrón.
- **Single-attempt vía UPDATE condicional** (no SELECT+UPDATE) — patrón ya usado en otras partes del API para idempotencia atómica.

### Integration Points

- **`MiTemplo.vue` line 36-57**: D-05 modifica el `v-else-if="showUpsellBadge"` para usar el computed `showPremiumCarousel` y agregar primera slide condicional con `BarChallengeCard`.
- **`useUserStore`**: el `profile` que ya carga desde `GET /me` se extiende automáticamente con los 3 campos nuevos (D-15) — sin cambios en el store, solo el endpoint devuelve más data y el frontend lee `userStore.profile.barChallengeAttemptedAt`.
- **`el-templo-api/src/db/schema/users.ts`**: migration agrega 3 columnas nullable; Drizzle schema TS también se extiende. Tipo TS se regenera vía `pnpm db:generate`.
- **`el-templo-api/src/app.ts`**: registrar `register(barChallengeRoutes, { prefix: "/api/bar-challenge" })`.

</code_context>

<specifics>
## Specific Ideas

- **Banner discreto post-submit fallido** (D-10): "No se pudo guardar el intento, se está reintentando". No bloqueante, no rojo agresivo — gris/amarillo y arriba del contenido en `/resultado`.
- **Mensaje motivacional placeholder** (lockeado por SPEC R8): "Aguantaste Xs. La barra te está esperando. Vení a entrenar."
- **Texto del estado lograste** (lockeado por SPEC R6): "¡Lo lograste! Seguí aguantando".
- **Query param de testing** (`?bar-challenge-force=1`): se mantiene en el código post-evento. Costo cero, utilidad para debugging futuro.

</specifics>

<deferred>
## Deferred Ideas

- **Marco con diseño profesional**: post-evento si el equipo de diseño produce un PNG final, reemplazar el placeholder en `el-templo-app/public/desafio-barra/marco-placeholder.png`. Path conservado para no romper referencias.
- **Endpoint genérico de desafíos / tabla `challenge_attempts`**: out of scope explícito del SPEC. Si en el futuro hay más desafíos, refactor con extracción del schema y endpoint genérico.
- **Sonido/vibración al pasar 1:30**: explícitamente out of scope (sólo visual). Si UX feedback post-evento sugiere agregar, fase nueva.
- **Notificaciones push del evento**: out of scope. Si futuras campañas requieren, integrar con el sistema de push existente.
- **Backend feature flag para el evento**: hoy hardcoded en frontend (constraint del SPEC). Si en el futuro se necesita cambiar fechas sin rebuild, agregar feature flag service. No es urgente.

</deferred>

---

_Phase: 115-evento-desafio-de-la-barra_
_Context gathered: 2026-05-21_
