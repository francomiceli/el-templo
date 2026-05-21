# Phase 115: Evento Desafío de la Barra — Specification

**Created:** 2026-05-21
**Ambiguity score:** 0.11 (gate: ≤ 0.20)
**Requirements:** 12 locked

## Goal

Habilitar un desafío single-attempt de aguantar ≥1:30 colgado de una barra, accesible como primer slide del carrusel premium de `MiTemplo.vue` durante la ventana del evento (23/05 12:00 ART → 25/05 12:00 ART). Usuarios escanean QR físico → entran a la app (registro Templo Online existente) → abren el desafío → el staff opera un cronómetro ascendente + captura una foto con la cámara nativa → al finalizar, comparten la foto compuesta con un marco de marca vía share nativo para reclamar (manualmente, fuera de app) un descuento físico.

## Background

Hoy `MiTemplo.vue` (líneas 36-57) renderiza un carrusel "premium" con 2 slides (`UpsellBadge` + `ProgramCtaCard`) que sólo se muestra cuando `showUpsellBadge` es verdadero — es decir, usuarios sin programa vinculado (mayormente Templo Online + trial). Miembros presenciales con plan vinculado ven `ProgramProgressCard` y nunca llegan al carrusel.

El registro como Templo Online ya es self-serve vía `/register` (no requiere aprobación de admin). El plugin `html5-qrcode` (vía `getUserMedia`) ya está en producción en `CheckInPage.vue`, pero la decisión para esta fase es usar `@capacitor/camera` (no instalado) por mejor UX al sacar la foto fullscreen.

No existe ningún módulo de "desafíos" ni "eventos" en el codebase. El esquema `users` tiene 35 columnas hoy (Drizzle en `el-templo-api/src/db/schema/users.ts`). Capacitor Haptics ya está instalado (`@capacitor/haptics`), Share y Camera **no**.

Disparador: evento de marketing presencial el domingo 24/05/2026. El QR físico promociona la app y el desafío engancha leads que después conviertan a miembros presenciales o Templo Online. El descuento es físico, se reclama mostrando la foto compartida (con el handle de El Templo etiquetado) ante el staff del local — la verificación de etiqueta y la entrega del descuento están fuera de la app.

## Requirements

1. **Migration de schema users**: 3 columnas nuevas nullable para registrar el intento.
   - Current: `users` no tiene ninguna columna relacionada al desafío.
   - Target: Migration agrega `bar_challenge_completed` BOOL NULL, `bar_challenge_seconds` INT NULL, `bar_challenge_attempted_at` TIMESTAMP NULL. NULL en las 3 = no participó.
   - Acceptance: Migration corre en local + staging vía `pnpm db:migrate` sin error; query `DESCRIBE users` confirma las 3 columnas con tipos correctos y default NULL.

2. **Endpoint backend para registrar el intento**: PATCH del resultado del desafío del usuario autenticado.
   - Current: no existe endpoint relacionado al desafío.
   - Target: `POST /api/me/bar-challenge/result` (autenticado, member token), body `{ secondsHeld: number }`, calcula `completed = secondsHeld >= 90`, persiste los 3 campos + `attempted_at = NOW()`. Retorna 409 si ya hay un intento registrado (idempotencia / single-attempt enforcement).
   - Acceptance: Integration test cubre 3 casos — (a) intento nuevo con 90s → completed=true persistido, (b) intento nuevo con 47s → completed=false persistido, (c) segundo intento del mismo usuario → 409. Auth middleware rechaza request sin token con 401.

3. **Visibilidad forzada del carrusel durante ventana del evento**: el carrusel premium se muestra a TODOS los usuarios autenticados de la app durante 23/05 12:00 ART → 25/05 12:00 ART (UTC-3, equivalente a 23/05 15:00 UTC → 25/05 15:00 UTC).
   - Current: `MiTemplo.vue` muestra el carrusel sólo cuando `showUpsellBadge=true` (Templo Online + trial + sin programa).
   - Target: Durante la ventana, override fuerza el carrusel visible para todos. Fuera de la ventana, comportamiento actual sin cambios. Constante `BAR_CHALLENGE_WINDOW = { start: '2026-05-23T15:00:00Z', end: '2026-05-25T15:00:00Z' }` en frontend.
   - Acceptance: En staging, alterando reloj del dispositivo a 24/05 12:00 ART → un miembro presencial con plan vinculado ve el carrusel; con reloj a 26/05 cualquier hora → el mismo usuario no lo ve.

4. **Slide del desafío como primer ítem del carrusel**: durante la ventana, se inserta una slide nueva como primer elemento (índice 0) del carrusel.
   - Current: Carrusel tiene 2 slides (`UpsellBadge`, `ProgramCtaCard`).
   - Target: Durante la ventana, el orden es `[BarChallengeCard, UpsellBadge, ProgramCtaCard]`. Fuera de la ventana, vuelve a `[UpsellBadge, ProgramCtaCard]`. La card del desafío tiene 2 estados visuales: "no participó" (CTA "Iniciar desafío") y "ya participó" (muestra "Aguantaste Xs" + botón "Compartir foto" si hay foto cacheada).
   - Acceptance: Componente `BarChallengeCard.vue` renderiza ambos estados sin error; primera slide del carrusel es siempre la del desafío durante la ventana.

5. **Pantalla explicativa del desafío**: nueva ruta accesible desde el tap en la card del desafío.
   - Current: no existe ruta ni componente para el desafío.
   - Target: Ruta `/desafio-barra` (lazy-loaded) muestra explicación del desafío (reglas: aguantar ≥1:30, single-attempt, premio físico mostrado a staff) + botón único "Comenzar" que navega a la pantalla del timer. Sin confirmación previa, tap directo arranca el timer.
   - Acceptance: La ruta requiere autenticación (redirige a `/login` si no hay sesión). Botón "Comenzar" navega a `/desafio-barra/timer` y arranca el cronómetro sin diálogo intermedio.

6. **Cronómetro ascendente con estado de logro**: pantalla con timer que cuenta desde 0:00 hacia arriba.
   - Current: no existe ningún componente de timer.
   - Target: Ruta `/desafio-barra/timer` muestra cronómetro ascendente (formato `MM:SS`, tipo grande). Al pasar 1:30 (90s exactos), la pantalla cambia visualmente — texto pasa de "Aguantá" a "¡Lo lograste! Seguí aguantando" y color de éxito, sin vibración ni sonido. El cronómetro sigue corriendo hasta que el staff aprieta "Finalizar". `KeepAwake` activado durante esta pantalla (plugin ya instalado).
   - Acceptance: Test manual — a los 90s exactos el UI cambia visualmente; el cronómetro continúa avanzando sin detenerse hasta tap en "Finalizar".

7. **Captura de foto fullscreen via Capacitor Camera**: botón "Tomar foto" en la pantalla del timer abre la cámara nativa.
   - Current: no hay captura de fotos en la app. `@capacitor/camera` no instalado.
   - Target: Instalar `@capacitor/camera` (requiere aprobación explícita previa al execute-phase). Botón "Tomar foto" en pantalla del timer dispara `Camera.getPhoto({ source: Camera, resultType: 'base64', quality: 80 })`. Foto resultante reemplaza cualquier foto previa (sólo se retiene la última en memoria). El timer NO se pausa durante la captura — sigue corriendo en background; al volver, el timer está en su valor real.
   - Acceptance: En build nativo Android, tap en "Tomar foto" abre la cámara nativa; tras confirmar, el cronómetro refleja el tiempo real transcurrido (no perdido). La foto queda accesible para la pantalla siguiente.

8. **Pantalla de resultado con foto + mensaje + share**: al apretar "Finalizar", el cronómetro se detiene y navega a la pantalla de resultado.
   - Current: no existe pantalla de resultado.
   - Target: Ruta `/desafio-barra/resultado` muestra: (a) segundos aguantados ("Aguantaste 87 segundos"), (b) si ≥90s → mensaje de logro + nota sobre cómo reclamar el premio físico ("Mostrá la foto etiquetando a @eltemplo al staff del local"), (c) si <90s → mensaje motivacional ("Aguantaste Xs. La barra te está esperando. Vení a entrenar."), (d) si hay foto cacheada → botón "Compartir foto", (e) si no hay foto → botón "Sacar foto ahora" como fallback (mismo flujo del paso 7).
   - Acceptance: Tres ramas renderizan correctamente — (a) con foto + completed, (b) con foto + failed, (c) sin foto + cualquier resultado.

9. **Composición foto + marco placeholder via canvas**: la foto compartida se compone con un marco PNG transparente antes del share.
   - Current: no hay composición de imágenes.
   - Target: Asset `el-templo-app/public/desafio-barra/marco-placeholder.png` (PNG transparente 1080x1920, generado en esta fase con logo de El Templo + texto "Desafío de la Barra"). Al apretar "Compartir", se renderiza la foto en un `<canvas>` offscreen, se superpone el marco al mismo tamaño, se exporta a `image/jpeg` blob.
   - Acceptance: Función `composeWithFrame(photoBase64): Promise<Blob>` retorna un blob JPEG válido; visualmente la foto está debajo del marco (test manual de smoke).

10. **Share nativo via Capacitor Share**: el blob compuesto se comparte usando el share sheet nativo del SO.
    - Current: no hay share. `@capacitor/share` no instalado.
    - Target: Instalar `@capacitor/share` (requiere aprobación explícita previa al execute-phase). Botón "Compartir" llama `Share.share({ files: [tempPath], title: 'Desafío de la Barra — El Templo', dialogTitle: 'Compartir tu desafío' })`. Si el SO no soporta share de archivos, fallback a download del JPEG.
    - Acceptance: En build nativo iOS y Android, tap en "Compartir" abre share sheet nativo con la foto compuesta disponible para compartir a Instagram/WhatsApp/etc.

11. **Single-attempt enforcement (frontend + backend)**: una vez registrado el intento, no se puede reintentar.
    - Current: N/A.
    - Target: Frontend lee `user.barChallengeAttemptedAt` (del endpoint `GET /api/me`). Si está seteado, la card del carrusel muestra estado "Ya participaste" y deshabilita el flujo de timer (tap navega directo a resultado cacheado). Backend retorna 409 en segundo intento.
    - Acceptance: Tras un intento exitoso (POST 200), un segundo POST al mismo endpoint retorna 409. Frontend tras refresh muestra card en estado "Ya participaste".

12. **Versión bump y deploy a stores**: bump de versión minor (feature) + builds nativos firmados para Play Store + App Store antes del evento.
    - Current: versión actual del app (revisar `package.json` + `Info.plist` + `build.gradle`).
    - Target: Bump minor de versión, build firmado Android (AAB) + build iOS (IPA), upload a internal testing de Play Store + TestFlight, promote a production con review express si aplica. Deploy en staging primero (memoria: staging-first estricto).
    - Acceptance: AAB e IPA están en producción de las stores antes del 23/05 12:00 ART; instalación desde stores en device físico abre la app con la feature visible durante la ventana.

## Boundaries

**In scope:**

- Schema migration: 3 columnas en `users` (`bar_challenge_completed`, `bar_challenge_seconds`, `bar_challenge_attempted_at`).
- Endpoint backend: `POST /api/me/bar-challenge/result` con single-attempt enforcement (409).
- Frontend: nueva ruta `/desafio-barra` (explicación), `/desafio-barra/timer`, `/desafio-barra/resultado`.
- Componente `BarChallengeCard.vue` con 2 estados (no participó / ya participó), insertado como primer slide del carrusel durante ventana.
- Override de visibilidad del carrusel: durante ventana, visible a todos (no sólo `showUpsellBadge`).
- Cronómetro ascendente con estado visual de logro al pasar 1:30 (sin haptic, sin sonido).
- Captura de foto via `@capacitor/camera` (con install aprobado en execute-phase).
- Composición foto + marco placeholder (PNG transparente generado en la fase) via canvas.
- Share via `@capacitor/share` (con install aprobado en execute-phase).
- Marco placeholder commit en repo, reemplazable post-evento si diseño produce versión final.
- Mensaje motivacional placeholder ("Aguantaste Xs. La barra te está esperando. Vení a entrenar.").
- Constante hardcoded `BAR_CHALLENGE_WINDOW` en frontend (23/05 15:00 UTC → 25/05 15:00 UTC).
- Bump minor de versión + builds nativos firmados + deploy a Play Store production + App Store production.
- KeepAwake activado en pantalla del timer.

**Out of scope:**

- Descuento físico, su monto, su forma de canje — manejado por el staff fuera de la app.
- Verificación automática de etiqueta en Instagram/redes — manual por el staff al recibir al usuario en el local.
- Backend de tracking de canje del descuento — no necesario, todo manual.
- Guardado de la foto en el server — la foto vive sólo en el dispositivo del usuario (en memoria + lo que el SO guarde post-share).
- Múltiples intentos del mismo usuario — single-attempt enforced.
- Feature flag remoto / backend-driven event toggles — hardcode en frontend, requeriría deploy nuevo para cambiar fechas.
- Endpoint genérico de desafíos / eventos / tabla `challenge_attempts` — overkill para one-shot.
- Tracking de coach que asistió al evento, geolocation del local — no necesario.
- Sonido o vibración al pasar 1:30 — sólo cambio visual.
- iOS/Android UAT con devices reales por QA team — el usuario hace UAT manual antes de release.
- Marco final con diseño profesional — placeholder con logo + texto, reemplazable.
- Confirmación previa antes del botón "Comenzar" — arranca directo.
- Notificaciones push relacionadas con el evento — no se envían.
- Soporte para el desafío post-evento (después de 25/05 12:00 ART) — el slide desaparece del carrusel y las rutas siguen accesibles pero el slide ya no se renderiza; usuarios que entren por URL directa ven la pantalla normal (no se bloquea).

## Constraints

- **Timing crítico**: 4 días hasta el evento. Spec → plan → execute → review nativos en stores. Play Store internal testing → production puede tardar 24-48h; App Store review 24-72h. Toda decisión que extienda el cronograma es bloqueante.
- **Dependencias nuevas a instalar**: `@capacitor/camera` y `@capacitor/share`. Requieren aprobación explícita previa al `pnpm install` (memoria del usuario: nunca instalar sin pedir). Plan-phase debe incluir un step explícito de confirmación antes del install.
- **Rebuild nativo necesario**: instalar plugins de Capacitor requiere `npx cap sync` + rebuild de Android (Android Studio) e iOS (Xcode). No es un cambio frontend puro.
- **Permisos del SO**: la app tiene que solicitar permiso de cámara al usuario la primera vez. Manejar el caso de "permiso denegado" con UI clara (la foto deja de funcionar pero el timer y resultado siguen).
- **Zona horaria**: ventana del evento en Argentina (UTC-3). Constante en UTC para evitar ambigüedad de timezone del dispositivo.
- **Staging-first estricto**: deploy a staging antes de producción (memoria del usuario).
- **Versionado**: feature = minor bump (memoria del usuario).
- **Single-attempt al nivel de DB**: query del POST endpoint valida atomicidad — UPDATE condicional `WHERE bar_challenge_attempted_at IS NULL` en lugar de SELECT + UPDATE separados.
- **Migration tracking**: vía `_migrations` table del project (no `drizzle-kit migrate`).
- **Self-host del marco**: el PNG del marco vive en `el-templo-app/public/` (no CDN externo — memoria del usuario sobre no-CDN).

## Acceptance Criteria

- [ ] Migration agrega 3 columnas a `users` (`bar_challenge_completed`, `bar_challenge_seconds`, `bar_challenge_attempted_at`), todas NULL por default; corre en local + staging sin error vía `pnpm db:migrate`.
- [ ] `POST /api/me/bar-challenge/result` con `secondsHeld=90` retorna 200 y persiste `completed=true, seconds=90, attempted_at=NOW()`.
- [ ] `POST /api/me/bar-challenge/result` con `secondsHeld=47` retorna 200 y persiste `completed=false, seconds=47`.
- [ ] Segundo POST al mismo endpoint para el mismo usuario retorna 409 con mensaje claro.
- [ ] POST sin token retorna 401.
- [ ] Integration test cubre los 4 casos anteriores y pasa en CI.
- [ ] Durante ventana (23/05 15:00 UTC → 25/05 15:00 UTC), el carrusel premium se muestra a TODOS los usuarios autenticados, no sólo `showUpsellBadge`.
- [ ] Fuera de ventana, comportamiento del carrusel es idéntico al actual (regression check).
- [ ] Durante ventana, primera slide del carrusel es `BarChallengeCard` con CTA "Iniciar desafío"; tras intento, cambia a estado "Ya participaste — Aguantaste Xs" con botón "Compartir foto" si hay foto cacheada.
- [ ] Tap en "Iniciar desafío" navega a `/desafio-barra` (pantalla explicativa).
- [ ] Botón "Comenzar" en pantalla explicativa navega a `/desafio-barra/timer` y arranca el cronómetro automáticamente, sin confirmación previa.
- [ ] Cronómetro arranca en 0:00 y cuenta hacia arriba en formato MM:SS.
- [ ] A los 90s exactos, UI cambia color y texto a estado "lograste"; cronómetro NO se detiene.
- [ ] Botón "Tomar foto" en pantalla del timer abre cámara Capacitor; al volver, cronómetro refleja tiempo real transcurrido.
- [ ] Botón "Finalizar" detiene cronómetro y navega a `/desafio-barra/resultado`.
- [ ] Pantalla de resultado muestra "Aguantaste X segundos" + mensaje (logro o motivacional según ≥90s o <90s) + botón compartir/sacar foto según haya o no.
- [ ] Composición foto + marco placeholder produce JPEG válido visible en preview antes del share.
- [ ] Botón "Compartir" abre share sheet nativo en device Android e iOS con la foto compuesta lista para compartir.
- [ ] Si el usuario no sacó foto durante el timer, el botón fallback "Sacar foto ahora" en pantalla de resultado funciona y produce share válido.
- [ ] `@capacitor/camera` y `@capacitor/share` instalados con commit que registra los version locks; install NO ocurre sin confirmación explícita en plan-phase / execute-phase.
- [ ] AAB firmado de Android está en Play Store producción antes del 23/05 12:00 ART; IPA firmado está en App Store producción antes del 23/05 12:00 ART.
- [ ] Versión bump minor reflejada en `package.json` + `Info.plist` + `build.gradle`.
- [ ] `KeepAwake` activo durante pantalla del timer; se desactiva al navegar fuera.
- [ ] Permiso de cámara denegado por el SO no rompe el flujo del desafío (timer + resultado siguen funcionando, sólo desaparece la posibilidad de foto/share).

## Ambiguity Report

| Dimension           | Score | Min   | Status | Notes                                        |
| ------------------- | ----- | ----- | ------ | -------------------------------------------- |
| Goal Clarity        | 0.92  | 0.75  | ✓      | Flujo end-to-end claro y measurable          |
| Boundary Clarity    | 0.90  | 0.70  | ✓      | In/out lists explícitos                      |
| Constraint Clarity  | 0.85  | 0.65  | ✓      | Timing, deps, timezone, versionado lockeados |
| Acceptance Criteria | 0.85  | 0.70  | ✓      | 24 criterios pass/fail                       |
| **Ambiguity**       | 0.11  | ≤0.20 | ✓      | Gate passed cómodamente                      |

## Interview Log

| Round | Perspective | Question summary                              | Decision locked                                                                    |
| ----- | ----------- | --------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1     | Researcher  | Camera/Share approach (Capacitor vs Web APIs) | Capacitor plugins, fullscreen native UX (requiere install explícito)               |
| 1     | Researcher  | Visibilidad del carrusel                      | Forzar carrusel para todos durante la ventana                                      |
| 1     | Researcher  | Storage del intento                           | 3 columnas nullable en `users` (completed bool, seconds int, attempted_at)         |
| 2     | Simplifier  | Comportamiento del timer al llegar a 1:30     | Timer ascendente desde 0, sigue corriendo al pasar 90s, staff para con "Finalizar" |
| 2     | Simplifier  | Foto opcional / fallback                      | Botón "Sacar foto ahora" en pantalla final si no se sacó durante                   |
| 2     | Simplifier  | Configuración de fecha del evento             | Hardcoded en frontend, ventana 48h en UTC (23/05 15:00 → 25/05 15:00)              |
| 3     | Seed Closer | Marco para la foto compartida                 | Placeholder básico generado en la fase (logo + texto), committeado en repo         |
| 3     | Seed Closer | Confirmación previa al botón "Comenzar"       | Arranca directo, sin diálogo de confirmación                                       |
| 3     | Seed Closer | Feedback al pasar 1:30                        | Sólo cambio visual, sin vibración, sin sonido                                      |
| 3     | Seed Closer | Copy del mensaje al no superar 1:30           | "Aguantaste Xs. La barra te está esperando. Vení a entrenar."                      |

---

_Phase: 115-evento-desafio-de-la-barra_
_Spec created: 2026-05-21_
_Next step: /gsd:discuss-phase 115 — implementation decisions (estructura de archivos, store, composables, endpoint shape, etc.)_
