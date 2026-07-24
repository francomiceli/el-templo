# Phase 164: Pantalla TV de sucursal — plani viva por bloque - Context

**Gathered:** 2026-07-24
**Status:** Ready for planning

<domain>
## Phase Boundary

El TV de cada sede muestra el bloque en curso de la sesión del día (lista del nivel elegido + timer por formato + video del ejercicio + segundero siempre visible) con la estética del PDF, controlado por el profe desde su celular vía la API (polling con device token). Reemplaza el flujo de PNGs descargados. Ruta pública `/tv` en el-templo-admin + página de control coach en el admin + módulo nuevo en el-templo-api. Sin apps nuevas, sin migraciones de sesiones (sí tablas nuevas de TV).

</domain>

<spec_lock>

## Diseño (locked via 164-UI-SPEC.md)

El diseño visual y la arquitectura de alto nivel están CERRADOS en `164-UI-SPEC.md` (mockup v8 validado por Franco 2026-07-24). Downstream agents MUST leer ese archivo antes de planificar — las decisiones de su sección "Decisiones ya tomadas (no reabrir)" son inamovibles:

1. Estética = PDF (mármol/Cinzel/navy+oro) — la paleta "sin azul" del rebrand NO aplica.
2. Layout v8: 2 columnas 45/55; izquierda lista+timer apilados, derecha video a columna completa.
3. PYROS/INITIUM usa la misma grilla (titula PYROS, lista "TODOS LOS NIVELES", selector de nivel deshabilitado).
4. Polling con `timerStartedAt` (timestamp) + params — el tiempo NO viaja por la red; el TV calcula localmente. Sin WebSockets.
5. Vive en el admin (ruta pública `/tv`), no en la app de socios, no es app nueva.
6. Una sola lista por vez (el profe elige nivel α/Δ/Σ/☉), no grilla 2×2.

Las 6 decisiones que el UI-SPEC dejó "abiertas para discuss-phase" quedaron TODAS resueltas abajo.

</spec_lock>

<decisions>
## Implementation Decisions

### Vinculación y seguridad del dispositivo

- **D-01:** Pueden vincular un TV el **Dueño y los coaches** (cargar el pairing code en el admin y elegir sede).
- **D-02:** El pairing code que muestra el TV sin vincular **no expira: queda fijo hasta que se use**.
- **D-03:** El device token **no expira nunca** (kiosco sin teclado no puede re-loguearse solo) pero es **revocable**: fila en tabla de dispositivos desactivable desde el admin.
- **D-04:** Se permiten **varios TVs por sede**: cada TV es una fila de dispositivo, el estado de clase es único por sede y todos lo espejan.
- **D-05:** La pantalla de vinculación del admin lista los dispositivos con **"visto hace X"** (`last_seen_at` actualizado con cada poll) y botón revocar.

### Pantalla de reposo y ciclo de vida del estado

- **D-06:** Fuera de clase el TV muestra **reposo: reloj gigante HH:MM:SS (Cinzel) + logo + la frase/quote** (las mismas quotes que usa hoy el PDF de planis). Sin "próxima clase" en v1.
- **D-07:** El estado de clase se **limpia automáticamente al fin del día** (TZ de la sede) — el TV amanece siempre en reposo. Además el profe tiene botón manual **"terminar clase"** en el control. (Franco eligió primero "solo manual", pero al ver el borde del día siguiente pidió limpieza automática.)
- **D-08:** Después del **último bloque**, el TV muestra una **pantalla de cierre** con logo + reloj + frase (quotes del PDF), y queda ahí hasta que el profe termine la clase (→ reposo).

### Fallback sin sesión aprobada

- **D-09:** Si la sesión del día no existe o no está aprobada (hoy 404 en `/sessions/daily`), el TV muestra **reposo sin ningún mensaje de error** — los socios nunca ven cocina interna.
- **D-10:** El **control remoto del profe sí avisa explícitamente**: "la sesión de hoy no está aprobada", con los controles deshabilitados.

### Control remoto del profe

- **D-11:** El control arranca en la **sede asignada del profe (branch_id) con selector** para cambiar de sede.
- **D-12:** Concurrencia: **última escritura gana**, sin locks ni avisos.
- **D-13:** El control es **ciego: solo botones, GRANDES** (agilidad en medio de una clase — pedido literal de Franco), organizados en secciones **BLOQUES / NIVELES / EJERCICIO / TIMER**. Sin espejo/preview del estado del TV.

### Qué sesión y qué nivel

- **D-14:** El TV muestra **siempre la plani regular del día** (la misma que ve un socio). Sin selector de sesión en v1 (especiales/Aura quedan afuera).
- **D-15:** El nivel arranca en **α** al iniciar la clase y **persiste al cambiar de bloque** (cambiar de bloque no resetea el nivel elegido; sí resetea el timer y el ejercicio al primero).

### Timer

- **D-16:** **Sin cuenta previa**: iniciar arranca TRABAJO al instante; el profe avisa a viva voz.
- **D-17:** La pausa **congela y reanuda exacto donde quedó** (el TV muestra estado PAUSA). Requiere `pausedAt`/tiempo acumulado de pausa en el estado — compatible con la regla del timestamp.
- **D-18:** **Sin saltar/ajustar rondas en v1**: solo iniciar/pausar/reset. Si algo se desfasa, se resetea el bloque.
- **D-19:** Beeps (WebAudio) **OFF por default**; el profe los activa desde el celular. Nota: el autoplay de audio requiere gesture o configuración del kiosco — con OFF default el problema se reduce.

### Kiosco y operación

- **D-20 (RESTRICCIÓN DURA):** La pantalla `/tv` **tiene que funcionar sí o sí en el browser que traiga el TV** (smart TV nativo — Tizen/WebOS/etc.). El desarrollo asume compatibilidad amplia: CSS conservador con fallbacks (⚠ el mockup v8 usa container queries `cqw` — hace falta fallback), video H.264 básico, WebAudio como mejora opcional, nada que dependa de flags de Chrome.
- **D-21:** La fase incluye un **runbook corto de setup del kiosco** en el repo (URL `/tv`, fullscreen, evitar sleep de pantalla, beeps, cómo re-vincular).
- **D-22:** **Auto-reload por versión**: el poll del TV incluye la versión del frontend; al detectar una nueva, `location.reload()` en un momento seguro (en reposo — nunca en medio de un bloque).

### Post-research (respondidas por Franco 2026-07-24 sobre OQ del RESEARCH.md)

- **D-23:** El TV **soporta el modo ROM de los sábados**: sesión ROM con sus roles (ROM_LOWER/CORE/UPPER) y selector reducido a 2 niveles (BÁSICO/AVANZADO). No queda en reposo los sábados.
- **D-24:** TVs de las sedes: **todos posteriores a 2020** (marca desconocida) → piso asumido ≈ Chromium 68 (webOS 5.0). Sigue sin alcanzar para el SPA ni para `cqw`: **`/tv` va como página estática autocontenida (ES2015) fuera del SPA**, según la recomendación del RESEARCH.md, con `?diag=1` para diagnóstico en el TV.

### Claude's Discretion

- Naming/estructura exacta de las tablas nuevas (p. ej. `tv_devices`, `tv_class_state`) y forma del pairing code (largo/alfabeto legible en TV).
- Intervalo exacto de polling dentro del rango 2-3s acordado en el UI-SPEC.
- Rollout: sin flag ni piloto formal — la pantalla queda disponible y funciona donde haya un TV vinculado (área "Rollout y piloto" ofrecida y no seleccionada por Franco).
- Detalle técnico del contrato de estado (nombres de campos), respetando la regla de oro del timestamp.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño y assets (fuente de verdad visual)

- `.planning/phases/164-pantalla-tv-de-sucursal-plani-viva-por-bloque-con-timer-por-/164-UI-SPEC.md` — Diseño cerrado v8: tokens, layout, timers por formato, arquitectura. Locked — MUST read antes de planificar.
- `.planning/phases/164-pantalla-tv-de-sucursal-plani-viva-por-bloque-con-timer-por-/164-tv-mockup-template.html` — Template del mockup con placeholders `__CINZEL_*__`, `__NUNITO_*__`, `__MARBLE__`, `__LOGO__`, `__VIDEO__`.
- `el-templo-admin/src/utils/pdf/pdf-assets.ts` — Fuentes Cinzel/NunitoSans, mármol y logo en base64 (rellenan los placeholders del template).
- `el-templo-admin/src/utils/pdf/session-pdf-builder.ts` — Tokens de la estética PDF (BG_CREAM, NAVY, GOLD, SAND, BORDER_MUTED) y las quotes/frases que reusa el reposo y la pantalla de cierre (D-06/D-08).

### Backend y patrones existentes

- `el-templo-api/src/modules/sessions/routes.ts` — `GET /sessions/daily` (auth de usuario, 404 sin sesión aprobada); la resolución de dayId/level candidates ya está resuelta ahí. El TV necesita una variante con device token.
- `el-templo-api/src/modules/shared/qr-token.ts` — Patrón HMAC stateless existente. NO se replica para el TV (D-03 exige revocación por fila), pero es la referencia de cómo se hacen tokens sin sesión en el proyecto.
- `el-templo-api/src/modules/shared/video-url.ts` — `assembleVideoUrl()`: prefija `exercises.video_url` (keys `exercises/<id>.mp4`) con `R2_PUBLIC_URL` (worker público de R2).

### Frontend

- `el-templo-admin/src/router/routes.ts:32` — Patrón `meta: { public: true }` ya existente para rutas sin login (la ruta `/tv` lo usa).
- `el-templo-app/src/components/` → `VideoPlaceholder.vue` — El `<video autoplay loop muted playsinline>` que el TV replica, incluido el placeholder para ejercicios sin video.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- Assets del PDF (fuentes/mármol/logo base64 en `pdf-assets.ts`): se reutilizan tal cual para la estética del TV.
- `formatParams` estructurados de `session_blocks` (tabata work/rest/rounds, emom intervalSeconds/totalMinutes, etc.): alimentan los timers sin schema nuevo.
- Infra de videos: 202 ejercicios con mp4 (~1.6MB) servidos por worker público de R2, sin auth — el TV los consume directo.

### Established Patterns

- Rutas públicas del admin vía `meta: { public: true }` (ya usado por login).
- Tokens sin sesión: HMAC stateless (`qr-token.ts`) — el TV usa en cambio token persistido en tabla por el requisito de revocación (D-03).
- Módulos API con tests de integración en `el-templo-api/test/` contra MySQL real (obligatorio para las rutas nuevas).

### Integration Points

- API: módulo nuevo (dispositivos TV + estado de clase por sede + variante de sesión diaria por device token).
- Admin: ruta pública `/tv` (kiosco) + página de control en la sección coach + pantalla de vinculación/monitoreo de dispositivos.
- El celular y el TV nunca se conectan directo: ambos hablan con la API (escritura auth coach / lectura device token).

</code_context>

<specifics>
## Specific Ideas

- "Botones grandes, es importante que sean grandes ya que necesitan agilidad para manejarlo en el medio de una clase; separadores tipo: BLOQUES, NIVELES, EJERCICIO, TIMER" — pedido literal de Franco para el control remoto (D-13).
- "Necesitamos que funcione sí o sí en lo que traiga el TV" — la compatibilidad con el browser nativo del smart TV es restricción de diseño, no un nice-to-have (D-20).
- En reposo y cierre "mantener la quote también" — las frases que hoy usa el PDF acompañan al reloj y al logo (D-06/D-08).
- Vinculación "estilo Netflix": el TV muestra código corto, el staff lo carga en el admin (del UI-SPEC).

</specifics>

<deferred>
## Deferred Ideas

- **Selector de sesión en el control** (clases especiales / actividades Aura en el TV) — descartado para v1 (D-14); candidato si duele en la práctica.
- **"Próxima clase" en la pantalla de reposo** — requiere leer la grilla de horarios de la sede; quedó afuera de v1 (D-06).
- **Saltar/ajustar rondas del timer** — descartado para v1 (D-18).
- **Aviso al profe "el TV no responde hace X" durante la clase** — solo monitoreo pasivo en la pantalla de vinculación en v1 (D-05).
- **Upgrade de polling a SSE** — ya previsto en el UI-SPEC como cambio de transporte sin tocar el contrato.

### Reviewed Todos (not folded)

- "Rollout de datos v5.1 — poblar milestone_exercise_id" (`v51-milestone-data-rollout.md`) — falso positivo del matcher (score 0.6 por palabras genéricas); sin relación con esta fase.

</deferred>

---

_Phase: 164-pantalla-tv-de-sucursal-plani-viva-por-bloque-con-timer-por-_
_Context gathered: 2026-07-24_
