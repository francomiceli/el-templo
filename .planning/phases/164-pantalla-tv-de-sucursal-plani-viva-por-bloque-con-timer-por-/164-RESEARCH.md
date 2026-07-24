# Phase 164: Pantalla TV de sucursal — Research

**Researched:** 2026-07-24
**Domain:** Kiosk web page on native smart-TV browsers + Fastify/Drizzle device-auth module + Quasar admin control surface
**Confidence:** HIGH on codebase facts, HIGH on TV engine matrix, MEDIUM on real-world TV behavior (no hardware available to probe)

---

<user_constraints>

## User Constraints (from 164-CONTEXT.md)

### Locked Decisions

**Diseño (locked via 164-UI-SPEC.md)** — inamovibles:

1. Estética = PDF (mármol/Cinzel/navy+oro) — la paleta "sin azul" del rebrand NO aplica.
2. Layout v8: 2 columnas 45/55; izquierda lista+timer apilados, derecha video a columna completa.
3. PYROS/INITIUM usa la misma grilla (titula PYROS, lista "TODOS LOS NIVELES", selector de nivel deshabilitado).
4. Polling con `timerStartedAt` (timestamp) + params — el tiempo NO viaja por la red; el TV calcula localmente. Sin WebSockets.
5. Vive en el admin (ruta pública `/tv`), no en la app de socios, no es app nueva.
6. Una sola lista por vez (el profe elige nivel α/Δ/Σ/☉), no grilla 2×2.

**Vinculación y seguridad del dispositivo**

- **D-01:** Pueden vincular un TV el **Dueño y los coaches** (cargar el pairing code en el admin y elegir sede).
- **D-02:** El pairing code que muestra el TV sin vincular **no expira: queda fijo hasta que se use**.
- **D-03:** El device token **no expira nunca** (kiosco sin teclado no puede re-loguearse solo) pero es **revocable**: fila en tabla de dispositivos desactivable desde el admin.
- **D-04:** Se permiten **varios TVs por sede**: cada TV es una fila de dispositivo, el estado de clase es único por sede y todos lo espejan.
- **D-05:** La pantalla de vinculación del admin lista los dispositivos con **"visto hace X"** (`last_seen_at` actualizado con cada poll) y botón revocar.

**Pantalla de reposo y ciclo de vida del estado**

- **D-06:** Fuera de clase el TV muestra **reposo: reloj gigante HH:MM:SS (Cinzel) + logo + la frase/quote** (las mismas quotes que usa hoy el PDF de planis). Sin "próxima clase" en v1.
- **D-07:** El estado de clase se **limpia automáticamente al fin del día** (TZ de la sede) — el TV amanece siempre en reposo. Además el profe tiene botón manual **"terminar clase"** en el control.
- **D-08:** Después del **último bloque**, el TV muestra una **pantalla de cierre** con logo + reloj + frase (quotes del PDF), y queda ahí hasta que el profe termine la clase (→ reposo).

**Fallback sin sesión aprobada**

- **D-09:** Si la sesión del día no existe o no está aprobada (hoy 404 en `/sessions/daily`), el TV muestra **reposo sin ningún mensaje de error** — los socios nunca ven cocina interna.
- **D-10:** El **control remoto del profe sí avisa explícitamente**: "la sesión de hoy no está aprobada", con los controles deshabilitados.

**Control remoto del profe**

- **D-11:** El control arranca en la **sede asignada del profe (branch_id) con selector** para cambiar de sede.
- **D-12:** Concurrencia: **última escritura gana**, sin locks ni avisos.
- **D-13:** El control es **ciego: solo botones, GRANDES** (agilidad en medio de una clase — pedido literal de Franco), organizados en secciones **BLOQUES / NIVELES / EJERCICIO / TIMER**. Sin espejo/preview del estado del TV.

**Qué sesión y qué nivel**

- **D-14:** El TV muestra **siempre la plani regular del día** (la misma que ve un socio). Sin selector de sesión en v1 (especiales/Aura quedan afuera).
- **D-15:** El nivel arranca en **α** al iniciar la clase y **persiste al cambiar de bloque** (cambiar de bloque no resetea el nivel elegido; sí resetea el timer y el ejercicio al primero).

**Timer**

- **D-16:** **Sin cuenta previa**: iniciar arranca TRABAJO al instante; el profe avisa a viva voz.
- **D-17:** La pausa **congela y reanuda exacto donde quedó** (el TV muestra estado PAUSA). Requiere `pausedAt`/tiempo acumulado de pausa en el estado — compatible con la regla del timestamp.
- **D-18:** **Sin saltar/ajustar rondas en v1**: solo iniciar/pausar/reset. Si algo se desfasa, se resetea el bloque.
- **D-19:** Beeps (WebAudio) **OFF por default**; el profe los activa desde el celular.

**Kiosco y operación**

- **D-20 (RESTRICCIÓN DURA):** La pantalla `/tv` **tiene que funcionar sí o sí en el browser que traiga el TV** (smart TV nativo — Tizen/WebOS/etc.). CSS conservador con fallbacks (⚠ el mockup v8 usa container queries `cqw` — hace falta fallback), video H.264 básico, WebAudio como mejora opcional, nada que dependa de flags de Chrome.
- **D-21:** La fase incluye un **runbook corto de setup del kiosco** en el repo (URL `/tv`, fullscreen, evitar sleep de pantalla, beeps, cómo re-vincular).
- **D-22:** **Auto-reload por versión**: el poll del TV incluye la versión del frontend; al detectar una nueva, `location.reload()` en un momento seguro (en reposo — nunca en medio de un bloque).

### Claude's Discretion

- Naming/estructura exacta de las tablas nuevas (p. ej. `tv_devices`, `tv_class_state`) y forma del pairing code (largo/alfabeto legible en TV).
- Intervalo exacto de polling dentro del rango 2-3s acordado en el UI-SPEC.
- Rollout: sin flag ni piloto formal — la pantalla queda disponible y funciona donde haya un TV vinculado.
- Detalle técnico del contrato de estado (nombres de campos), respetando la regla de oro del timestamp.

### Deferred Ideas (OUT OF SCOPE)

- **Selector de sesión en el control** (clases especiales / actividades Aura en el TV) — descartado para v1 (D-14).
- **"Próxima clase" en la pantalla de reposo** — requiere leer la grilla de horarios de la sede; afuera de v1 (D-06).
- **Saltar/ajustar rondas del timer** — descartado para v1 (D-18).
- **Aviso al profe "el TV no responde hace X" durante la clase** — solo monitoreo pasivo en la pantalla de vinculación (D-05).
- **Upgrade de polling a SSE** — previsto como cambio de transporte sin tocar el contrato.

</user_constraints>

---

## Project Constraints (from CLAUDE.md + skills del repo)

Directivas accionables que el planner DEBE respetar (misma autoridad que las decisiones locked):

| #    | Directiva                                                                                                                                      | Fuente                                                 | Impacto en esta fase                                                                                        |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| C-01 | **API:** logging con Pino (`request.log`, `app.log`). Nunca `console.log`.                                                                     | CLAUDE.md                                              | Módulo `tv` usa `request.log`                                                                               |
| C-02 | **Frontends:** `createLogger()` de `src/utils/logger.ts`. Nunca `console.*`.                                                                   | CLAUDE.md                                              | Aplica a la página de control (Vue). La página `/tv` standalone NO tiene acceso a ese util — ver Pitfall 12 |
| C-03 | **Sin `any`.** `unknown` + narrowing; `catch (err: unknown)` + `instanceof Error`.                                                             | CLAUDE.md                                              | Todo el módulo API + control page                                                                           |
| C-04 | **Rutas API nuevas ⇒ tests de integración** en `el-templo-api/test/` contra MySQL real.                                                        | CLAUDE.md                                              | Obligatorio para las ~8 rutas nuevas                                                                        |
| C-05 | **Migraciones a mano**, numeradas = máx + 1, commiteadas en el MISMO commit que el schema `.ts`. **Nunca `drizzle-kit migrate` ni `db:push`.** | skill `el-templo-db-migrations`                        | Migración **0189** (ver Runtime State Inventory)                                                            |
| C-06 | **Nunca `;` dentro de un comentario `--`** en un `.sql` (rompe el runner Y todo el test suite).                                                | skill db-migrations (incidente 0119, repetido en 0188) | Header de 0189                                                                                              |
| C-07 | **`mysqlEnum("primer_arg", …)` = nombre físico de columna**, debe matchear el SQL byte a byte.                                                 | skill db-migrations (incidentes 0138/0139, 0188)       | `tv_class_state.timer_status`, `phase`                                                                      |
| C-08 | **Nunca instalar/actualizar dependencias sin pedir permiso.**                                                                                  | skill change-control §6                                | Ver "Standard Stack": recomendación = **cero deps nuevas**                                                  |
| C-09 | **`git add` siempre por ruta explícita.** Nunca `-A` ni `.`.                                                                                   | skill change-control §4                                | Ejecución                                                                                                   |
| C-10 | **Staging-first estricto**; el trabajo de fase vive en rama local, no se pushea sin OK.                                                        | skill change-control §1                                | Ejecución                                                                                                   |
| C-11 | **No correr el suite completo local** — corre en CI. Typecheck local sí.                                                                       | skill change-control §10                               | Verificación                                                                                                |
| C-12 | **Sin CDN en producción** (self-host de fuentes/assets).                                                                                       | skill change-control §9                                | Fuentes Cinzel/Nunito del TV: self-host obligatorio                                                         |
| C-13 | Nueva env var ⇒ actualizar el `.env.example` correspondiente.                                                                                  | CLAUDE.md                                              | Solo si se agrega alguna (la recomendación es que NO haga falta)                                            |
| C-14 | **Stores Pinia** = composition API (`defineStore` + setup). **Composables** exponen `cleanup()`, sin `onUnmounted` adentro.                    | CLAUDE.md                                              | `useTvControlApi.ts` / composable de la página de control                                                   |

---

## Summary

Esta fase es, en realidad, **tres piezas con perfiles de riesgo muy distintos**, y el mayor riesgo NO está donde parece:

1. **Backend (riesgo bajo, todo precedente).** Un módulo `tv` nuevo con dos tablas (`tv_devices`, `tv_class_state`), auth por device token opaco, y una variante de la resolución de sesión del día. Cada pieza tiene un patrón exacto ya en el repo: token opaco + sha256 en DB = `auth/refresh-token-service.ts` (fase 116); guard de rol a nivel plugin = `modules/coach/routes.ts`; batch de sesiones multi-nivel de un día = `admin/service.ts::getDaySessionDetails`; TZ por sede = `shared/date-utils.ts` (`todayInTz`); expire-on-read en vez de cron = patrón ya usado en `subscriptions/service.ts`.

2. **Página `/tv` (riesgo ALTO — el corazón de la fase).** D-20 choca de frente con dos hechos verificados del repo: (a) `el-templo-admin/quasar.config.js` compila con `target.browser = ['es2022','firefox115','chrome115','safari14']`, es decir **Chrome 115+**, mientras que el TV más nuevo del mercado (Tizen 10 / webOS 26, 2026) trae Chromium 130-132 pero un TV de 2022 trae Chromium 85-87 y uno de 2019 trae Chromium 63; (b) el mockup v8 usa **container queries (`cqw`, `container-type`)**, soportadas recién desde Chromium 105 (= Tizen 9 / 2025, webOS 25 / 2025) y **`aspect-ratio`**, desde Chromium 88. Meter `/tv` como ruta Vue del SPA del admin significa que el TV tiene que parsear y ejecutar todo el bundle de Quasar+Vue compilado a ES2022 — en un TV de 2019-2022 eso es pantalla en blanco, sin error visible. **Recomendación primaria: `/tv` NO es una ruta Vue — es una página estática autocontenida en `el-templo-admin/public/tv/index.html`,** generada por un script de build que compila TypeScript con `tsc --target es2015 --lib es2015,dom` (TypeScript ya es devDep del admin: cero dependencias nuevas) e inlinea CSS+JS. Esto elimina el piso de compatibilidad del framework y hace que el piso sea el que nosotros elijamos (recomendado: **Chromium 53**, = webOS 4.x/2018 y Tizen 5.0/2019 hacia arriba).

3. **Control del profe (riesgo bajo).** Página Vue normal en el admin, botones grandes, escribe estado vía API. Único detalle no obvio: para mandar índices absolutos sin "espejo" (D-13) conviene que **cada write devuelva el estado nuevo completo**, y que el control cargue una vez el "contexto de clase" (cantidad de bloques, cuántos ejercicios por bloque×nivel).

Además hay **dos huecos de dominio que ni el UI-SPEC ni el CONTEXT cubren** y que el planner tiene que resolver antes de escribir tareas:

- **Sábado = día ROM.** Verificado en la migración `0080_rom_mode_day_modes.sql`: `day_modes` viene seedeada con `(6,'rom')`. Los sábados la sesión no tiene bloques NUCLEUS/DEUTEROS/EPIKOS sino `ROM_LOWER/ROM_CORE/ROM_UPPER` y **solo dos niveles** (alfa=BÁSICO, delta=AVANZADO). El selector α/Δ/Σ/☉ del UI-SPEC no aplica ese día.
- **Los bloques no se alinean por índice entre niveles.** El PDF (`session-data-transformer.ts`) arma las páginas por **rol canónico** (INITIUM → NUCLEUS → DEUTEROS_1 → DEUTEROS_2 → EPIKOS/ATHLOS), no por `sortOrder`, y elige el INITIUM canónico con un orden determinista (`alfa, delta, sigma, kairos`) justo porque las sesiones de distintos niveles pueden divergir. Si `tv_class_state` guarda un `block_index` numérico y el profe cambia de nivel (D-15 dice que el nivel persiste al cambiar bloque, y viceversa), el índice puede apuntar a otro bloque o salirse de rango.

**Primary recommendation:** Construir `/tv` como página estática autocontenida (sin Vue/Quasar) generada en build desde TypeScript compilado a ES2015, con layout **flexbox + escalado por `font-size` en px calculado por JS** (nada de container queries, grid ni `aspect-ratio`); mover **toda** la lógica derivable al API (`modules/tv/`) para que quede cubierta por el vitest existente — incluido el mapeo `FormatParams → TimerSpec` normalizado —, dejando en el TV solo aritmética de reloj con corrección de offset servidor-cliente; y modelar el estado de clase por **rol de bloque**, no por índice.

---

## Architectural Responsibility Map

| Capability                                                   | Primary Tier                   | Secondary Tier          | Rationale                                                                                                                               |
| ------------------------------------------------------------ | ------------------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Resolución de "la sesión del día" (week/día/nivel/dayId/ROM) | API (`modules/tv`)             | —                       | La lógica ya vive server-side (`sessions/routes.ts`, `admin/service.ts`); duplicarla en el TV la pondría fuera del alcance de los tests |
| Fecha "hoy" según TZ de la sede                              | API                            | —                       | `todayInTz()` usa `Intl` en Node (full ICU garantizado). El reloj del TV puede estar mal y su ICU puede ser reducida                    |
| Normalización `FormatParams` (50 variantes) → `TimerSpec`    | API                            | —                       | Union discriminada de 50 casos; server-side queda cubierta por vitest y desacopla al TV del catálogo de formatos                        |
| Autoridad del estado de clase (bloque/nivel/ejercicio/timer) | API (DB, fila por sede)        | —                       | Única fuente de verdad; celular y TV nunca se hablan directo                                                                            |
| Emisión/validación/revocación del device token               | API                            | —                       | D-03 exige revocación por fila                                                                                                          |
| Limpieza de fin de día (D-07)                                | API — **expire-on-read**       | (cron alternativo)      | Sin cron: la fila lleva `class_date` y el read la ignora si ya no es hoy en la TZ de la sede                                            |
| Conteo del timer segundo a segundo                           | Browser TV                     | —                       | Regla de oro del UI-SPEC: el tiempo no viaja por la red                                                                                 |
| Corrección de reloj (offset servidor↔TV)                     | Browser TV                     | API (envía `serverNow`) | El TV no puede confiar en su propio `Date.now()`                                                                                        |
| Render (mármol/Cinzel/lista/timer/video)                     | Browser TV (estático)          | —                       | Sin framework: piso de compatibilidad elegido por nosotros                                                                              |
| Reproducción del video del ejercicio                         | Browser TV                     | CDN R2 (worker público) | `assembleVideoUrl()` ya arma la URL pública sin auth                                                                                    |
| Botonera del profe                                           | Admin SPA (Vue)                | API                     | Corre en el celular del profe (Chrome/Safari modernos): sin restricción de compatibilidad                                               |
| Vinculación/monitoreo de dispositivos                        | Admin SPA (Vue)                | API                     | Superficie de staff autenticado                                                                                                         |
| Fuentes/mármol/logo                                          | Build del admin (`public/tv/`) | —                       | Self-host obligatorio (C-12); base64 ya en el repo                                                                                      |

---

## Standard Stack

### Core — **cero dependencias nuevas**

| Librería               | Versión (verificada)      | Propósito                                                        | Por qué es la estándar acá                                                                                                                                    |
| ---------------------- | ------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fastify`              | ^5.7.4                    | Módulo API `tv`                                                  | Ya es el framework del backend [VERIFIED: el-templo-api/package.json]                                                                                         |
| `drizzle-orm`          | ^0.45.1                   | Schema + queries de las 2 tablas nuevas                          | Único ORM del repo [VERIFIED: package.json]                                                                                                                   |
| `node:crypto` (stdlib) | —                         | `randomBytes(32).toString('base64url')` + `createHash('sha256')` | Patrón exacto de `auth/refresh-token-service.ts` (fase 116) [VERIFIED: código leído]                                                                          |
| `typescript`           | ^5.9.3 (devDep del admin) | Compilar `src/tv/*.ts` → ES2015 para el kiosco                   | Ya instalado; `--lib es2015` actúa como **linter de compatibilidad** (falla ante `padStart`, `Object.entries`, etc.) [VERIFIED: el-templo-admin/package.json] |
| `vue` + `quasar`       | ^3.5.22 / ^2.16.0         | Página de control + pantalla de vinculación                      | Framework del admin [VERIFIED: package.json]                                                                                                                  |
| `pinia`                | ^3.0.4                    | Estado del control si hace falta                                 | Convención del repo (CLAUDE.md)                                                                                                                               |
| `node-cron`            | ^4.2.1                    | **NO usar** (ver Don't Hand-Roll)                                | Existe, pero D-07 se resuelve mejor con expire-on-read                                                                                                        |

### Supporting — assets ya presentes en el repo

| Asset                                          | Ubicación                                                                                                                   | Uso en el TV                                                             |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `CINZEL_REGULAR_BASE64` / `CINZEL_BOLD_BASE64` | `el-templo-admin/src/utils/pdf/pdf-assets.ts` (~44 KB base64 c/u)                                                           | `@font-face` de títulos, reloj y dígitos                                 |
| `NUNITO_SANS_REGULAR_BASE64` / `_BOLD_`        | idem (~139 KB base64 c/u)                                                                                                   | Texto general                                                            |
| `ROBOTO_REGULAR_BASE64`                        | idem (~205 KB)                                                                                                              | **Solo si hace falta cobertura griega** — ver Pitfall 6                  |
| `MARBLE_BG_BASE64`                             | idem (~244 KB base64 → ~183 KB jpeg)                                                                                        | Fondo mármol                                                             |
| `LOGO_BASE64`                                  | idem (~58 KB base64 → ~43 KB png)                                                                                           | Topbar + reposo + cierre                                                 |
| `QUOTES` (10 frases)                           | `session-pdf-builder.ts:207` — **NO exportada**                                                                             | Reposo (D-06) y cierre (D-08) ⇒ hay que extraerla a un módulo compartido |
| Tokens de color                                | `session-pdf-builder.ts:36-40` (`BG_CREAM #F2EBE1`, `NAVY #24364A`, `GOLD #B08D6E`, `SAND #DBCAB4`, `BORDER_MUTED #c5b9a8`) | Variables del CSS del TV                                                 |
| `LEVEL_SYMBOLS`                                | `session-pdf-builder.ts:43` (`alfa:α, delta:Δ, sigma:Σ, omega:Ω`) + glifo kairos ☉ dibujado como vector                     | Selector/encabezado de nivel                                             |
| `164-tv-mockup-template.html`                  | directorio de la fase                                                                                                       | **Punto de partida literal** del HTML del kiosco                         |

### Alternatives Considered

| En vez de                                       | Se podría usar                                          | Tradeoff                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/tv` estático en `public/tv/`                  | Ruta Vue en el SPA del admin                            | Menos código nuevo y comparte utils/tipos, **pero** obliga a bajar `quasar.config.js` `target.browser` de `chrome115` a ~`chrome63` para TODO el admin (riesgo de regresión no acotado) y sigue exponiendo al TV al runtime de Vue 3.5 + Quasar 2. Solo elegir esto si Franco confirma que todos los TVs son ≥2023 |
| `/tv` estático                                  | Ruta Vue + segundo build target solo para esa ruta      | Vite/Quasar 2 no soporta targets por chunk; requeriría un segundo proyecto de build. Más plomería que la página estática                                                                                                                                                                                           |
| Fuentes decodificadas a `public/tv/fonts/*.ttf` | `@font-face` con `data:` base64 inline (como el mockup) | Inline = ~470 KB de base64 re-descargados en cada reload (D-22 recarga seguido). Archivos separados quedan bajo `expires 1y immutable` del nginx del admin [VERIFIED: deploy/nginx/admin.eltemplo.org:20]. **Recomendado: archivos separados**                                                                     |
| `@fontsource/cinzel` (dep nueva en el admin)    | —                                                       | Ya es dep de `el-templo-app` [VERIFIED: el-templo-app/package.json:31], pero agregarla al admin dispara el gate humano C-08 sin necesidad: el base64 ya está en el repo                                                                                                                                            |
| Expire-on-read para D-07                        | Cron `node-cron` por TZ de sede                         | El cron ya existe (`jobs/notification-cron.ts` corre jobs por TZ de sede), pero agrega un job, una ventana de fallo y estado que puede quedar sucio si el proceso estuvo caído. Expire-on-read es determinista y testeable sin timers                                                                              |
| Índices absolutos con clamp server-side         | Comandos relativos (`POST /tv/state/next-block`)        | Los relativos hacen trivial el control ciego, pero **no son idempotentes**: un doble tap en un celular con red mala avanza dos bloques. **Recomendado: absolutos + clamp**                                                                                                                                         |
| Polling 2.5 s                                   | SSE                                                     | El UI-SPEC ya lo difirió; el contrato no cambia (Deferred)                                                                                                                                                                                                                                                         |

**Installation:** ninguna. Esta fase **no instala nada**. Si el plan termina necesitando un paquete, es un `checkpoint:human-verify` obligatorio (C-08).

---

## Package Legitimacy Audit

**No se instalan paquetes en esta fase.** La recomendación primaria (página estática compilada con el `typescript` ya presente + assets base64 ya versionados) está construida explícitamente para evitar el gate de dependencias (C-08).

`slopcheck` no está instalado en este entorno y no se intentó instalar (instalarlo sería en sí mismo una instalación de paquete sin aprobación). Como no hay paquetes candidatos, la tabla queda vacía por diseño.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
| ------- | -------- | --- | --------- | ----------- | --------- | ----------- |
| —       | —        | —   | —         | —           | —         | Ninguno     |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

**Contingencia documentada:** si el plan decidiera igualmente self-hostear las fuentes vía paquete, el candidato es `@fontsource/cinzel` + `@fontsource/nunito-sans`. `@fontsource/cinzel@^5.2.8` ya es dependencia de `el-templo-app` [VERIFIED: el-templo-app/package.json:31] — es decir, ya pasó por el gate humano una vez en este repo. `@fontsource/nunito-sans` **nunca se usó acá** y debe tratarse como `[ASSUMED]`: requiere `checkpoint:human-verify` + verificación en registry antes de instalar.

---

## Runtime State Inventory

Fase mayormente greenfield, pero toca infra viva. Categorías verificadas:

| Categoría                                                   | Encontrado                                                                                                                                                                                                                                                                                                                                                                                                                | Acción requerida                                                                                                                                                                                                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Numeración de migraciones**                               | Máximo real = **0188** (`0188_bookings_trial_date_index.sql`), presente tanto en `origin/master` como en `origin/staging`. Divergencia conocida: `0186_wellhub_integration.sql` existe **solo en staging**; el branch `feature/wellhub-integration` está en 0186 sin pushear. Máximo entre todas las ramas locales = 0187 (staging) / 0188 en remotos. [VERIFIED: `git ls-tree` sobre `origin/master` y `origin/staging`] | **La migración de esta fase es `0189_tv_screen.sql`.** Re-verificar con `ls el-templo-api/src/db/migrations/*.sql \| sort \| tail -3` **y** contra `origin/staging` antes de crearla (C-05)                                                                    |
| **Colisión de nombres de tabla**                            | Ya existe `device_tokens` (tokens FCM de push, `db/schema/notifications.ts:38`).                                                                                                                                                                                                                                                                                                                                          | Nombrar `tv_devices` / `tv_class_state` — **nunca** `devices` ni `device_tokens`                                                                                                                                                                               |
| **`TABLES_TO_CLEAN`** (`el-templo-api/test/helpers.ts:143`) | Lista explícita de ~90 tablas que se vacían entre tests. Las tablas nuevas NO están.                                                                                                                                                                                                                                                                                                                                      | Agregar `tvClassState` y `tvDevices` a la lista (antes de `branches`/`users`), o el estado se filtra entre archivos de test (mismo worker, `isolate:false`)                                                                                                    |
| **`db/schema/index.ts`**                                    | Barrel con `export * from "./<archivo>"` por tabla.                                                                                                                                                                                                                                                                                                                                                                       | Agregar `export * from "./tv-devices"` (o el nombre elegido) — si falta, `schema.tvDevices` es `undefined` en runtime y tsc igual pasa en algunos usos                                                                                                         |
| **Nginx del admin**                                         | `try_files $uri $uri/ /index.html;` + `index index.html;` ⇒ un directorio `public/tv/` con `index.html` resuelve `/tv/` y nginx redirige `/tv` → `/tv/` (301). **Pero** `location ~* \.(js\|css\|png\|jpg\|…)$ { expires 1y; Cache-Control: public, immutable; }` cachea 1 año cualquier `.js`/`.css` **sin hash de contenido**. [VERIFIED: deploy/nginx/admin.eltemplo.org]                                              | **Inlinear CSS y JS dentro de `index.html`** (index.html no matchea ese regex). Fuentes/imágenes sí como archivos separados (inmutables, correcto). Verificar en staging que `https://admin-staging.eltemplo.org/tv/` sirve la página real (checkpoint humano) |
| **`deploy/nginx/*` no se aplica solo**                      | Los archivos del repo son plantillas; la config viva está en el EC2 (`/etc/nginx/sites-available/`).                                                                                                                                                                                                                                                                                                                      | Si hiciera falta tocar nginx, es SSH ⇒ gate humano. La solución de arriba **no requiere tocar nginx**                                                                                                                                                          |
| **Secrets / env vars**                                      | La página TV no necesita ninguna nueva: la API base la puede derivar del host o llevarla inyectada en build (`VITE_API_URL` ya existe en CI, `deploy.yml:205`). `R2_PUBLIC_URL` ya existe en el API [VERIFIED: .env.example:32].                                                                                                                                                                                          | Ninguna nueva. Si igual se agrega, actualizar `.env.example` (C-13)                                                                                                                                                                                            |
| **Artefactos de build**                                     | `el-templo-admin/public/ffmpeg/*` está **commiteado** aunque lo genere `scripts/copy-ffmpeg.mjs` (postinstall).                                                                                                                                                                                                                                                                                                           | Decidir explícitamente si `public/tv/` se commitea (consistente con ffmpeg) o se gitignorea y se genera en `build`. **Recomendado: generar en `build` + gitignore**, con `process.exit(1)` si el script falla, para que CI lo detecte                          |
| **Estado en TVs ya desplegados**                            | Ninguno — feature nuevo, sin TVs vinculados.                                                                                                                                                                                                                                                                                                                                                                              | Nada                                                                                                                                                                                                                                                           |
| **Config de servicios vivos (n8n, Datadog, etc.)**          | Nada relacionado con TV. Verificado por ausencia de referencias a `tv` en el repo fuera de esta fase.                                                                                                                                                                                                                                                                                                                     | Ninguna                                                                                                                                                                                                                                                        |

---

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────┐        ┌──────────────────────┐
│  TV de la sede       │        │  Celular del profe   │
│  (browser nativo,    │        │  (admin SPA, Vue)    │
│   Chromium 53+)      │        │                      │
└──────────┬───────────┘        └──────────┬───────────┘
           │                               │
   GET cada 2.5 s                  POST (write) · auth JWT coach
   Authorization: Device <token>   Authorization: Bearer <access>
           │                               │
           ▼                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                        el-templo-api                             │
│                                                                  │
│  ┌────────────────────┐        ┌──────────────────────────────┐  │
│  │ tv/device-auth     │        │ tv/control-routes            │  │
│  │  onRequest hook    │        │  onRequest: authenticate     │  │
│  │  sha256(token) →   │        │   + rol ∈ TV_CONTROL_ROLES   │  │
│  │  tv_devices row    │        │   + canAccessBranch          │  │
│  │  is_active? →403   │        └──────────────┬───────────────┘  │
│  │  last_seen_at=NOW  │                       │                  │
│  └─────────┬──────────┘                       │                  │
│            │            ┌────────────────────────────────────┐   │
│            └───────────▶│  tv/service.ts (única autoridad)   │◀──┘
│                         │  • resolveClassDay(branch)         │
│                         │      todayInTz → week/dayName      │
│                         │      dayMode(rom?)                 │
│                         │      getDayApprovedSessions()      │
│                         │  • expire-on-read (class_date)     │
│                         │  • buildBlockRoster(role-ordenado) │
│                         │  • toTimerSpec(FormatParams)       │
│                         │  • clampState(state, roster)       │
│                         └──────────────┬─────────────────────┘   │
└────────────────────────────────────────┼─────────────────────────┘
                                         ▼
              ┌──────────────────────────────────────────────┐
              │  MySQL                                       │
              │  tv_devices      (token_hash, branch_id, …)  │
              │  tv_class_state  (1 fila por sede)           │
              │  sessions / session_blocks / prescriptions   │
              │  branches (timezone), day_modes, exercises   │
              └──────────────────────────────────────────────┘

  TV → <video src>  ───────────▶  R2 public worker (sin auth)
                                  R2_PUBLIC_URL + "exercises/<id>.mp4"

  TV → GET /tv/version.txt?t=… ─▶  admin nginx (mismo origen que /tv/)
```

Flujo del caso principal (un bloque de clase):

1. El profe abre el control → `GET /api/tv/control/context?branchId=` → sede, si hay sesión aprobada (D-10), roster de bloques por rol, cantidad de ejercicios por (bloque, nivel), estado actual.
2. Toca "iniciar clase" → `POST /api/tv/control/state` con `{blockRole:'INITIUM', level:'alfa', exerciseIndex:0, timer:'idle'}` → la API escribe `tv_class_state` con `class_date = todayInTz(branch.tz)` y devuelve el estado nuevo.
3. El TV, en su próximo poll (≤2.5 s), recibe estado + `serverNow` + datos del bloque + `timerSpec` + `videoUrl` + `tvVersion`, y renderiza.
4. El profe toca ▶ del timer → `POST … {timer:'running'}` → la API sella `timer_started_at = NOW(3)`.
5. El TV calcula `elapsed = (Date.now() + clockOffset) − timerStartedAt − pausedAccumMs` y pinta fase/ronda/dígitos localmente, sin volver a pedir nada.

### Estructura recomendada

```
el-templo-api/src/
├── db/schema/
│   └── tv.ts                     # tvDevices + tvClassState + relations
├── db/migrations/
│   └── 0189_tv_screen.sql        # hand-written (C-05/C-06/C-07)
└── modules/tv/
    ├── index.ts
    ├── device-routes.ts          # rutas consumidas por el TV (device token)
    ├── control-routes.ts         # rutas del profe (JWT coach) + pairing
    ├── device-auth.ts            # hook onRequest: valida device token
    ├── pairing.ts                # user_code / device_code (ver Pattern 2)
    ├── class-day.ts              # resolución de la sesión del día por sede
    ├── roster.ts                 # orden canónico de bloques por rol + niveles
    ├── timer-spec.ts             # FormatParams(50) → TimerSpec(4 formas)  ← PURO
    ├── schemas.ts                # JSON Schema (patrón del repo)
    ├── service.ts
    └── types.ts

el-templo-api/test/tv/
├── tv-pairing.test.ts
├── tv-device-poll.test.ts
├── tv-control.test.ts
├── tv-class-day.test.ts          # ROM/sábado, sin sesión aprobada, TZ
└── tv-timer-spec.test.ts         # unitario puro + genera timer-vectors.json

el-templo-admin/
├── src/tv/                       # TS del kiosco — NO entra al bundle del SPA
│   ├── tv.ts                     # bootstrap, poll, render
│   ├── timer.ts                  # phaseAt(elapsed, spec)  ← puerto del API
│   └── tsconfig.tv.json          # target es2015, lib es2015+dom, outFile
├── scripts/
│   └── build-tv.mjs              # tsc + decode base64 assets + inline + hash
├── public/tv/                    # GENERADO (gitignored)
│   ├── index.html                # CSS+JS inline, self-contained
│   ├── version.txt
│   ├── marble.jpg  logo.png
│   └── fonts/cinzel-*.ttf nunito-*.ttf
└── src/
    ├── pages/TvControlPage.vue   # botonera del profe (D-13)
    ├── pages/TvDevicesPage.vue   # vinculación + "visto hace X" + revocar (D-05)
    ├── composables/useTvApi.ts   # patrón use*Api.ts + cleanup() (C-14)
    └── utils/pdf/quotes.ts       # QUOTES extraídas de session-pdf-builder (DRY)
```

### Pattern 1 — Device token: copiar `refresh-token-service.ts` tal cual

```ts
// Fuente del patrón: el-templo-api/src/modules/auth/refresh-token-service.ts (fase 116)
import { createHash, randomBytes } from "node:crypto";

/** sha256 hex del token. El plaintext NUNCA se persiste. */
function hashToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

function generateToken(): string {
  return randomBytes(32).toString("base64url");
}
```

`tv_devices.token_hash varchar(64) NOT NULL UNIQUE` — idéntico a `refresh_tokens.token_hash`. Diferencias respecto de refresh tokens: **sin `expires_at`** (D-03) y con `is_active boolean` + `revoked_at` para la revocación por fila.

### Pattern 2 — Pairing estilo RFC 8628 (device authorization grant), NO solo un código corto

El riesgo real del pairing no es que un extraño adivine el código para "robar el TV", es que **cualquiera que adivine un `user_code` pendiente se lleve el device token** que el staff acaba de emitir. La solución estándar (OAuth 2.0 Device Authorization Grant, RFC 8628) separa dos valores:

- `user_code` — corto, legible en un TV a 4 m (**recomendado: 6 chars de `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`**, sin `I/1/O/0`; 32⁶ ≈ 1.07e9). Se muestra en pantalla, el staff lo tipea en el admin.
- `device_code` — largo y secreto (`randomBytes(32).base64url`), **generado por la API y guardado por el TV en `localStorage`**, nunca visible en pantalla.

El TV pollea `GET /api/tv/pair/status` mandando el **`device_code`** (no el `user_code`). Adivinar el `user_code` sin el `device_code` no sirve para nada.

```
TV (sin token)                        API                          Admin (staff)
  │  POST /api/tv/pair/start           │                                 │
  │───────────────────────────────────▶│  crea tv_pairings:              │
  │  { userCode:"K7M2QX",              │   user_code, device_code_hash,  │
  │    deviceCode:"<secreto>" }        │   claimed_by=NULL               │
  │◀───────────────────────────────────│                                 │
  │  muestra K7M2QX en pantalla        │                                 │
  │                                    │◀─ POST /api/tv/pair/claim ──────│
  │                                    │   { userCode, branchId }        │
  │                                    │   (JWT coach/owner, D-01)       │
  │  GET /api/tv/pair/status           │   crea tv_devices + token       │
  │   (deviceCode) cada 3 s ──────────▶│   y lo guarda 1 sola vez        │
  │◀── { deviceToken:"…" } ────────────│   marca el pairing consumido    │
  │  localStorage.setItem(...)         │                                 │
```

Notas: el `user_code` no expira (D-02) ⇒ es aceptable **solo** gracias al split; sin él, un código eterno + fuerza bruta sería una vulnerabilidad real. Consumo **una sola vez** (`claimed_at IS NULL` en el `UPDATE`, no un `SELECT` previo — evita el TOCTOU). El token en claro se devuelve **exactamente una vez**.

### Pattern 3 — Estado de clase por **rol de bloque**, no por índice

```ts
// Orden canónico verificado en el-templo-admin/src/utils/pdf/session-data-transformer.ts
const REGULAR_ROLES = [
  "INITIUM",
  "NUCLEUS",
  "DEUTEROS_1",
  "DEUTEROS_2",
  "EPIKOS",
] as const;
//   EPIKOS matchea también role === "ATHLOS"  (findBlock(), línea 288)
const ROM_ROLES = ["INITIUM", "ROM_LOWER", "ROM_CORE", "ROM_UPPER"] as const;

// INITIUM es compartido: fuente determinista, primer nivel presente en este orden
const INITIUM_SOURCE_ORDER = ["alfa", "delta", "sigma", "kairos"] as const;
```

`tv_class_state.block_role` guarda el rol; el "BLOQUE n/M" y los dots se derivan del roster que arma la API. Cambiar de nivel **nunca** invalida el bloque actual; cambiar de bloque resetea `exercise_index=0` y el timer (D-15). El `exercise_index` sí se clampa contra la lista del (rol, nivel) actual, porque la cantidad de ejercicios sí varía entre niveles.

### Pattern 4 — Expire-on-read para D-07 (sin cron)

```ts
// Patrón ya usado en el repo: "Expire on read — no cron job needed"
// (el-templo-api/src/modules/subscriptions/service.ts:4637)
import { todayInTz } from "../shared/date-utils";

const today = todayInTz(branch.timezone); // "YYYY-MM-DD" en TZ de la sede
if (state && state.classDate !== today) {
  return REPOSO; // fila vieja = como si no existiera
}
```

Ventajas frente a un cron por TZ de sede: determinista, testeable sin timers falsos, inmune a downtime del proceso y sin job nuevo que mantener. La fila vieja se sobrescribe sola en el próximo "iniciar clase" (`ON DUPLICATE KEY UPDATE` / upsert por `branch_id`).

### Pattern 5 — `FormatParams` (50 variantes) → `TimerSpec` (4 formas) en el API

`FormatParams` es una unión discriminada de 50 variantes [VERIFIED: `el-templo-api/src/modules/admin/format-params.ts:15-123`]. El TV no debe conocerlas. La API las normaliza:

```ts
export type TimerSpec =
  | { kind: "work_rest"; workMs: number; restMs: number; rounds: number } // tabata, interval, hiit, rom
  | { kind: "interval"; intervalMs: number; rounds: number } // emom, every_x_seconds, on_the_x, emom_for_time
  | { kind: "countdown"; totalMs: number } // amrap, amrap_series, time_cap, for_tech, *timeCapMinutes
  | { kind: "countup" }; // standard, chipper, for_time sin cap, etc.
```

Mapeos no obvios que el planner debe recordar (todos con la misma forma, DRY):

- `interval` y `hiit` tienen **exactamente** la misma forma que `tabata` (`workSeconds/restSeconds/rounds`) → misma rama.
- `rom` (`rounds`, `restSeconds`) es `work_rest` sin `workSeconds` → el trabajo es libre; decidir si cae a `countup` con rondas o a `work_rest` con `workMs=0`.
- `emom` usa `totalMinutes` (⇒ `rounds = totalMinutes*60/intervalSeconds`); `on_the_x` usa `rounds` directo; `every_x_seconds` usa `totalMinutes` como `emom`.
- `death_by`, `death_by_unbroken`, `for_time`, `for_max_reps`, `for_max_distancia`, `rounds_for_time` tienen `timeCapMinutes` **opcional** → `countdown` si está, `countup` si no.
- Todo lo que no matchea → `countup`. La función debe ser **exhaustiva** (`const _x: never = params` al final, como hace `formatParamsLabel`).

Como es una función pura server-side, queda cubierta por el vitest del API — el único lugar del repo donde hoy corren tests automáticos de este tipo de lógica.

### Pattern 6 — Corrección de reloj (la pieza que falta en la "regla de oro" del UI-SPEC)

El UI-SPEC dice "el tiempo no viaja por la red: la API publica `timerStartedAt` y el TV calcula". Eso es correcto **pero incompleto**: si el reloj del TV está corrido (frecuente en TVs sin internet estable o mal configurados), `Date.now() − timerStartedAt` da cualquier cosa. Cada respuesta del poll debe incluir `serverNow` (epoch ms) y el TV mantener:

```ts
// en cada poll
clockOffsetMs = serverNow - Date.now(); // corrige reloj mal seteado
// entre polls, avanzar con reloj monótono
elapsedMs =
  Date.now() +
  clockOffsetMs -
  timerStartedAt -
  pausedAccumMs -
  (pausedAt ? Date.now() + clockOffsetMs - pausedAt : 0);
```

Suavizar el offset (media móvil / ignorar saltos < 500 ms) evita que los dígitos "salten" en cada poll. `performance.now()` (Chrome 20+) sirve para el tick de render sin depender del reloj de pared.

### Pattern 7 — Escalado sin container queries ni `aspect-ratio`

Reemplazo directo de `cqw` con soporte hasta Chromium 53:

```html
<div id="tv"><!-- todo el contenido usa unidades em --></div>
<script>
  // 1cqw del mockup  ==  0.01 * ancho del #tv  ==  1em con base = ancho/100
  function scaleTv() {
    var w = window.innerWidth,
      h = window.innerHeight;
    var tvW = Math.min(w, (h * 16) / 9);
    var tvH = (tvW * 9) / 16;
    var el = document.getElementById("tv");
    el.style.width = tvW + "px";
    el.style.height = tvH + "px"; // reemplaza aspect-ratio: 16/9
    el.style.fontSize = tvW / 100 + "px"; // reemplaza container-type: size
  }
  scaleTv();
  window.addEventListener("resize", scaleTv); // NO ResizeObserver (Chrome 64+)
</script>
```

Conversión mecánica del mockup: **`Xcqw` → `Xem`**, sobre `#tv` y todos sus descendientes (los `em` de descendientes heredarían el font-size del padre — por eso conviene declarar el tamaño base en `#tv` y usar **`rem`-like vía una var**, o fijar `font-size` explícito en cada bloque de texto; alternativa más simple y robusta: setear también `document.documentElement.style.fontSize` y usar `rem` en todo el árbol, que **no** hereda en cascada). **Recomendado: `rem` + `html { font-size }` calculado por JS** — es la técnica clásica de kiosco y elimina el problema de composición de `em`.

Reemplazos adicionales: `display:grid` → `display:flex` (grid es Chromium 57+, y webOS 4.x es 53); `gap` en flex → márgenes explícitos (`gap` en flexbox es Chromium 84+, mucho más nuevo que grid — **trampa fácil de pasar por alto**); `minmax(0, 45fr)/minmax(0,55fr)` → `flex: 0 0 45%` / `flex: 0 0 55%` + `min-width:0`.

### Anti-Patterns to Avoid

- **Meter `/tv` como ruta del SPA sin bajar el build target.** Con `chrome115` el TV muestra una pantalla en blanco sin error visible ni forma de diagnosticar (no hay devtools en un TV de sede). Es el modo de falla más caro de esta fase.
- **Mandar "segundos restantes" en el poll.** Prohibido por el UI-SPEC (punto 4) y además fallaría feo con 2.5 s de latencia.
- **Guardar `block_index` numérico.** Ver Pitfall 1.
- **Comandos relativos (`next-block`) sin idempotencia.** Doble tap en celular con red mala = doble avance.
- **Un cron por sede para limpiar el estado.** Añade superficie de falla que expire-on-read no tiene.
- **Depender de `Intl.DateTimeFormat` con `timeZone` en el TV.** Node tiene full-ICU; un Chromium embebido de TV puede venir con ICU reducida. La API manda las cadenas ya formateadas o el offset.
- **Usar `Ω`/`☉` (o cualquier griego) asumiendo que Cinzel los tiene.** Ver Pitfall 6 — el propio PDF tuvo que cambiar de fuente para esos glifos.
- **Reutilizar el nombre `device_tokens`.** Ya existe para FCM.
- **Escribir el `.sql` en un commit distinto del schema `.ts`.** Incidente recurrente documentado (C-05 / change-control §1).

---

## Don't Hand-Roll

| Problema                                         | No construir                                      | Usar en su lugar                                                                                                                    | Por qué                                                                                                                                     |
| ------------------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Generar/validar el device token                  | HMAC propio, JWT sin expiración, uuid             | `randomBytes(32).base64url` + sha256 en DB, copiando `auth/refresh-token-service.ts`                                                | Ya resuelto y auditado en fase 116; D-03 exige revocación por fila (el HMAC stateless de `qr-token.ts` **no** sirve)                        |
| Fecha "hoy" / día de semana en TZ de sede        | `new Date()` + offsets manuales, `-3` hardcodeado | `todayInTz(tz)` / `dowInTz(tz)` de `modules/shared/date-utils.ts`                                                                   | DST-aware (Barcelona), sin dep externa, ya testeado. Hay sedes en ES y AR                                                                   |
| Buscar las sesiones del día de todos los niveles | Query nueva con N+1 por nivel                     | `AdminService.getDaySessionDetails(week, day)` (batch: sesiones + bloques + prescripciones)                                         | Ya batchea; solo hay que agregarle el filtro `status='approved'` y el JOIN a `exercises.video_url`                                          |
| Semana SPOM desde una fecha                      | Recalcular el ancla                               | `WEEK_ONE_MONDAY` / `dateToWeekNumber` — **hoy duplicados** en `sessions/routes.ts:72` y `el-templo-admin/src/utils/weekDates.ts:1` | Extraer a `modules/shared/` y reusar; una tercera copia es garantía de divergencia                                                          |
| URL del video del ejercicio                      | Concatenar `R2_PUBLIC_URL` a mano                 | `assembleVideoUrl()` de `modules/shared/video-url.ts`                                                                               | Maneja null y la falta de env var                                                                                                           |
| Fallback de ejercicio sin video                  | Nuevo placeholder                                 | Mismo criterio de `VideoPlaceholder.vue` (`el-templo-app`): si no hay URL o falla el load, cartel "Video proximamente"              | Consistencia + comportamiento probado (autoplay bloqueado, error de red)                                                                    |
| Scoping por sede del profe                       | Chequeos ad-hoc de `branch_id`                    | `attachCountryScope()` + `canAccessBranch()` de `modules/shared/country-scope.ts`                                                   | Ya resuelve owner/admin/gestion/coach/recepción y el caso multi-sede (`user_branches`)                                                      |
| Guard de rol del módulo                          | `if (role !== 'coach')` por handler               | `fastify.addHook("onRequest")` a nivel plugin con un set de `shared/permissions.ts`, como `modules/coach/routes.ts:24`              | Un solo punto de control; `rbac-sets.test.ts` ya vigila los sets                                                                            |
| Fuentes web                                      | Google Fonts / CDN                                | Base64 ya versionado en `pdf-assets.ts`, decodificado a `public/tv/fonts/`                                                          | C-12 prohíbe CDN en producción                                                                                                              |
| Frases del reposo/cierre                         | Escribir frases nuevas                            | `QUOTES` de `session-pdf-builder.ts:207` (10 frases con `text`/`goldText`/`author`) — extraer a módulo propio                       | D-06/D-08 piden **las mismas** frases del PDF                                                                                               |
| Limpieza de fin de día                           | Cron nuevo                                        | Expire-on-read con `class_date`                                                                                                     | Ver Pattern 4                                                                                                                               |
| Formateo `HH:MM:SS` con `padStart`               | —                                                 | Helper propio de 3 líneas                                                                                                           | `String.prototype.padStart` es **ES2017 / Chromium 57**: rompe en webOS 4.x. `--lib es2015` en el tsconfig del TV lo detecta en compilación |
| Wake lock / evitar que la pantalla se apague     | `navigator.wakeLock`                              | Configuración del TV, documentada en el runbook (D-21)                                                                              | En webOS la promesa de `wakeLock` **ni resuelve ni rechaza: se cuelga** [CITED: forum.webostv.developer.lge.com]                            |

**Key insight:** casi todo lo "difícil" de esta fase ya está resuelto en el repo, en un archivo concreto y con un incidente detrás. Lo genuinamente nuevo son tres cosas: el pairing, el contrato de estado, y la compatibilidad del kiosco. Las dos primeras tienen patrones externos maduros (RFC 8628, offset de reloj estilo NTP simplificado); la tercera es la que hay que diseñar con cuidado.

---

## Common Pitfalls

### Pitfall 1 — El índice de bloque no significa lo mismo en dos niveles

**Qué sale mal:** `tv_class_state.block_index = 3`; el profe cambia de α a Σ y el TV salta a otro bloque, o queda fuera de rango y muestra pantalla vacía.
**Por qué pasa:** cada nivel es una **fila de `sessions` distinta** (`W{week}-{day}-{level}`) con sus propios `session_blocks` y su propio `sort_order`. El PDF nunca usa índices: arma páginas por rol canónico y hasta elige el INITIUM con un orden determinista **precisamente porque las sesiones de distintos niveles pueden divergir** (comentario explícito en `session-data-transformer.ts:21-26`).
**Cómo evitarlo:** guardar `block_role`; derivar índice/dots del roster que arma la API; clampar `exercise_index` contra la lista del (rol, nivel) vigente.
**Señales tempranas:** un test que cambia de nivel en DEUTEROS_2 y espera seguir en DEUTEROS_2.

### Pitfall 2 — Sábado es día ROM y el UI-SPEC no lo contempla

**Qué sale mal:** el sábado el TV no encuentra NUCLEUS/DEUTEROS/EPIKOS, o el selector ofrece Σ/☉ para una sesión que solo tiene alfa/delta.
**Por qué pasa:** `day_modes` viene seedeada con `(6,'rom')` [VERIFIED: `0080_rom_mode_day_modes.sql`]. En ROM, los roles son `ROM_LOWER/ROM_CORE/ROM_UPPER` + INITIUM y solo hay **dos tiers** (alfa=BÁSICO, delta=AVANZADO); `/sessions/daily` mapea cualquier nivel ≠ alfa/kairos a delta ese día (`sessions/routes.ts:469-485`).
**Cómo evitarlo:** el roster que arma la API debe declarar `mode: 'regular' | 'rom'` y la **lista de niveles disponibles**; el control deshabilita los niveles ausentes y el TV rotula BÁSICO/AVANZADO. Si el plan decide no soportar ROM en v1, la API debe devolver "sin clase" y el TV quedarse en reposo (D-09) — pero eso significa **TV apagado todos los sábados**, y hay que decirlo explícitamente. **Pregunta abierta para el planner (OQ-1).**
**Señales tempranas:** ningún test con `day='sabado'`.

### Pitfall 3 — El bundle del admin no corre en el TV

**Qué sale mal:** pantalla en blanco, sin log, sin devtools, en la sede.
**Por qué pasa:** `quasar.config.js` compila a `chrome115` [VERIFIED]. Matriz de motores (ver State of the Art): un TV de 2024 trae Chromium 108; uno de 2022, 85-87; uno de 2019, 63.
**Cómo evitarlo:** `/tv` como página estática compilada a ES2015 (recomendación primaria). Si el plan igual elige la ruta Vue, entonces es **obligatorio** bajar `target.browser` y hacer un checkpoint de prueba en hardware real antes de seguir.
**Señales tempranas:** el plan no menciona el build target en ninguna tarea.

### Pitfall 4 — Container queries, `aspect-ratio`, `gap` en flex, `ResizeObserver`

**Qué sale mal:** layout colapsado, texto minúsculo o desbordado, sin error en consola.
**Por qué pasa:** el mockup v8 usa `container-type: size` + `cqw` (Chromium **105**) y `aspect-ratio: 16/9` (Chromium **88**). Además, el reemplazo "obvio" con `display:grid` (Chromium 57) o `gap` en flexbox (Chromium **84**) tampoco baja hasta el piso.
**Cómo evitarlo:** flexbox + márgenes (sin `gap`) + escalado por `font-size` en JS (Pattern 7). Un `@supports (container-type: size)` no alcanza: hay que escribir el layout compatible **una sola vez** y usarlo siempre, para que sea el camino probado.
**Señales tempranas:** cualquier `cqw`, `cqh`, `@container`, `aspect-ratio`, `gap:` en flex o `display:grid` sobreviviendo del mockup al código.

### Pitfall 5 — Built-ins modernos que esbuild/tsc **no** polifillan

**Qué sale mal:** `TypeError: ….padStart is not a function` en el TV, y nada en pantalla.
**Por qué pasa:** los transpiladores bajan **sintaxis**, no APIs. `String.padStart` = Chromium 57, `Object.entries/values` = 54, `Array.prototype.flat` = 69, `Object.fromEntries` = 73, `?.`/`??` = 80, spread de objetos = 60, `Element.closest` = 41, `fetch` = 42, `AbortController` = 66.
**Cómo evitarlo:** compilar el TV con `"target":"es2015","lib":["es2015","dom"]` — tsc entonces **rechaza en compilación** cualquier built-in posterior. Escribir `pad2()` a mano.
**Señales tempranas:** el tsconfig del TV hereda `lib: esnext` del tsconfig del admin.

### Pitfall 6 — α Δ Σ ☉ salen como tofu

**Qué sale mal:** cuadraditos vacíos donde va el símbolo de nivel.
**Por qué pasa:** Cinzel es una display serif latina; el propio PDF **cambia de fuente a Roboto** para los símbolos griegos (`session-pdf-builder.ts:528` y `:741`: `{ text: symbol, …, font: 'Roboto' }`) y **dibuja el ☉ (U+2609) como vector** porque Roboto tampoco lo tiene (`kairosGlyphColumn`, línea ~55). Los mismos archivos base64 alimentan las `@font-face` del TV.
**Cómo evitarlo:** clase `.glyph` con stack de sistema (`'Segoe UI', Arial, 'Noto Sans', sans-serif`) para α/Δ/Σ, y el ☉ como CSS puro (círculo con `border` dorado + punto central, `border-radius:50%`) o SVG inline. Verificar visualmente en el mockup renderizado antes de dar la tarea por hecha.
**Señales tempranas:** el símbolo de nivel escrito directo dentro de un elemento con `font-family: var(--cinzel)`.

### Pitfall 7 — El `.js`/`.css` del TV cacheado un año

**Qué sale mal:** se deploya un fix y los TVs siguen con la versión vieja para siempre; D-22 no salva porque el asset viejo se sirve igual.
**Por qué pasa:** `location ~* \.(js|css|…)$ { expires 1y; Cache-Control: public, immutable; }` en el nginx del admin [VERIFIED: deploy/nginx/admin.eltemplo.org:20-23]. Vite le pone hash a **sus** assets; un `tv.js` escrito a mano, no.
**Cómo evitarlo:** inlinear CSS y JS dentro de `index.html` (no matchea el regex). Fuentes/imágenes sí como archivos (son inmutables de verdad). Y que el `location.reload()` de D-22 apunte a `/tv/?v=<version>` para vencer también el caché del propio HTML.
**Señales tempranas:** un `<script src="tv.js">` sin hash en el nombre.

### Pitfall 8 — El reloj del TV está mal y el timer miente

**Qué sale mal:** el bloque arranca mostrando "12:43 transcurridos" o el timer va al revés.
**Por qué pasa:** el contrato manda `timerStartedAt` del servidor y el TV resta su `Date.now()` local.
**Cómo evitarlo:** Pattern 6 — `serverNow` en cada poll, offset suavizado, y un guard: si `elapsed < 0` o `> 24 h`, mostrar el timer en 0 en vez de basura.
**Señales tempranas:** el contrato de la respuesta del poll no incluye `serverNow`.

### Pitfall 9 — `timestamp` de MySQL con precisión de segundo

**Qué sale mal:** el timer arranca hasta 1 s adelantado; en un tabata de 20 s eso es 5 % de error visible.
**Por qué pasa:** en el repo **no hay un solo uso de `fsp`** [VERIFIED: grep sobre `db/schema/*.ts`], así que el default de `timestamp()` trunca al segundo.
**Cómo evitarlo:** `timestamp("timer_started_at", { fsp: 3 })` en el schema y `timestamp(3) NULL` en el SQL — drizzle soporta `fsp` [VERIFIED: `drizzle-orm/mysql-core/columns/timestamp.d.ts`]. Sería el primer uso de `fsp` en el repo: dejarlo comentado en el `.sql` y cubrirlo con un test de round-trip. Alternativa evaluada: guardar epoch ms en `bigint` (inmune a conversiones de TZ de MySQL) — más seguro pero rompe la convención; documentar la elección.
**Señales tempranas:** `timer_started_at timestamp` sin `(3)` en el SQL, o `mysqlEnum`/`timestamp` desalineados entre `.ts` y `.sql` (C-07).

### Pitfall 10 — Adivinanza del pairing code eterno

**Qué sale mal:** un tercero obtiene un device token válido y ve la plani (impacto bajo) o mantiene un dispositivo fantasma reportando `last_seen_at` (ruido operativo).
**Por qué pasa:** D-02 fija un código que no expira; sin `device_code` separado, `GET /pair/status?code=` es fuerza-brutable y el repo **no tiene rate limiting** (no hay `@fastify/rate-limit` en dependencias [VERIFIED: package.json]).
**Cómo evitarlo:** Pattern 2 (split `user_code`/`device_code`) + consumo one-shot con `UPDATE … WHERE claimed_at IS NULL` + no loguear nunca el token ni el `device_code`.
**Señales tempranas:** el endpoint de status recibe el mismo código que se muestra en pantalla.

### Pitfall 11 — Las tablas nuevas no se limpian entre tests

**Qué sale mal:** tests que pasan solos y fallan en suite, o al revés.
**Por qué pasa:** `TABLES_TO_CLEAN` es una lista **explícita** y vitest corre con `isolate:false` (mismo proceso reutilizado entre archivos).
**Cómo evitarlo:** agregar `tvClassState`, `tvDevices` (y `tvPairings` si es tabla aparte) a `test/helpers.ts`.
**Señales tempranas:** un segundo archivo de test de TV que falla con datos del primero.

### Pitfall 12 — `createLogger()` no existe en la página estática

**Qué sale mal:** o se viola C-02 con `console.log`, o se importa medio SPA dentro del kiosco.
**Cómo evitarlo:** en `src/tv/` definir un logger mínimo propio (mismo nombre/forma que `createLogger`, sin Sentry) y documentar en el header del archivo **por qué** no usa el util del SPA. La página de control (Vue) sí usa `createLogger` normal. Alternativa: mandar los errores del TV al API (`POST /api/tv/client-log`) para poder diagnosticar un kiosco sin devtools — **muy recomendable** dado que nadie va a poder abrir la consola en la sede.

### Pitfall 13 — Memoria y longevidad del kiosco

**Qué sale mal:** después de horas, el TV se pone lento o el browser mata la pestaña.
**Por qué pasa:** los browsers de TV corren con presupuestos de memoria chicos; un `<video>` en loop + polling cada 2.5 s durante 12 h acumula si el código crea nodos o listeners por poll.
**Cómo evitarlo:** un único `<video>` cuyo `src` se cambia (y `load()`) solo cuando cambia el ejercicio; render idempotente que **actualiza** nodos existentes (sin `innerHTML =` masivo por tick); un `setInterval` de reloj y uno de poll, creados una sola vez. Aprovechar D-22 también como reset preventivo: si `uptime > N horas` **y** el estado es reposo, recargar.
**Señales tempranas:** `innerHTML` dentro del loop de render del timer.

### Pitfall 14 — El deploy no reconstruye el admin

**Qué sale mal:** se toca solo el API y el `/tv` nuevo nunca llega a producción.
**Por qué pasa:** `deploy.yml` usa `paths-filter` sobre `el-templo-admin/**` y compara contra `event.before`; tras un push que muere en CI, el siguiente solo reconstruye SUS paths (documentado en la memoria del proyecto: `reference_deploy_paths_filter_trap.md`).
**Cómo evitarlo:** al shippear la fase, que el push toque los tres proyectos o usar `workflow_dispatch`.

---

## Code Examples

### Schema de las tablas (Drizzle) — con las trampas del skill anotadas

```ts
// el-templo-api/src/db/schema/tv.ts
import {
  mysqlTable,
  int,
  varchar,
  boolean,
  timestamp,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { branches } from "./branches";
import { users } from "./users";

export const tvDevices = mysqlTable(
  "tv_devices",
  {
    id: int("id").primaryKey().autoincrement(),
    branchId: int("branch_id")
      .notNull()
      .references(() => branches.id),
    // Patrón fase 116: solo el sha256 hex del token opaco se persiste.
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 100 }),
    isActive: boolean("is_active").default(true).notNull(),
    lastSeenAt: timestamp("last_seen_at"), // D-05 "visto hace X"
    revokedAt: timestamp("revoked_at"),
    pairedBy: int("paired_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idx_tv_devices_branch").on(t.branchId)],
);

export const tvClassState = mysqlTable(
  "tv_class_state",
  {
    id: int("id").primaryKey().autoincrement(),
    branchId: int("branch_id")
      .notNull()
      .references(() => branches.id),
    // D-07 expire-on-read: fecha en la TZ de la sede, NO un timestamp.
    classDate: date("class_date").notNull(),
    // Pitfall 1: ROL, no índice.
    blockRole: varchar("block_role", { length: 20 }).notNull(),
    level: varchar("level", { length: 20 }).notNull(),
    exerciseIndex: int("exercise_index").default(0).notNull(),
    // C-07: si esto fuera mysqlEnum, el primer arg ES el nombre de columna.
    timerStatus: varchar("timer_status", { length: 10 })
      .default("idle")
      .notNull(),
    // Pitfall 9: fsp 3 — primer uso en el repo, intencional.
    timerStartedAt: timestamp("timer_started_at", { fsp: 3 }),
    pausedAt: timestamp("paused_at", { fsp: 3 }),
    pausedAccumMs: int("paused_accum_ms").default(0).notNull(), // D-17
    soundEnabled: boolean("sound_enabled").default(false).notNull(), // D-19
    screen: varchar("screen", { length: 10 }).default("class").notNull(), // class | closing (D-08)
    updatedBy: int("updated_by").references(() => users.id),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex("uq_tv_class_state_branch").on(t.branchId)], // D-04: 1 estado por sede, N TVs
);
```

> Recordatorio C-05/C-06: el `.sql` correspondiente (`0189_tv_screen.sql`) va **escrito a mano**, con header `--` sin ningún `;` adentro, y **en el mismo commit** que este archivo. Los `varchar` con semántica de enum se dejan como `varchar` a propósito para no pisar la trampa C-07; si el plan prefiere `mysqlEnum`, el primer argumento debe ser el nombre de columna y la lista de valores tiene que coincidir byte a byte con el SQL.

### Hook de device auth (patrón `modules/coach/routes.ts`)

```ts
// el-templo-api/src/modules/tv/device-auth.ts
import { createHash } from "node:crypto";
import type { FastifyRequest, FastifyReply } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    tvDevice: { id: number; branchId: number };
  }
}

export function makeDeviceAuth(db: DbInstance) {
  return async function deviceAuth(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const header = request.headers.authorization ?? "";
    const token = header.startsWith("Device ") ? header.slice(7) : "";
    if (!token) {
      return reply.code(401).send({ error: "No autorizado" });
    }
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const [device] = await db
      .select({ id: schema.tvDevices.id, branchId: schema.tvDevices.branchId })
      .from(schema.tvDevices)
      .where(
        and(
          eq(schema.tvDevices.tokenHash, tokenHash),
          eq(schema.tvDevices.isActive, true),
        ),
      )
      .limit(1);
    if (!device) {
      // 401 (no 403): el TV lo interpreta como "revocado" y vuelve a pairing.
      return reply.code(401).send({ error: "Dispositivo no vinculado" });
    }
    request.tvDevice = device;
    // D-05: heartbeat. Fire-and-forget para no pagar latencia en el poll.
    void db
      .update(schema.tvDevices)
      .set({ lastSeenAt: new Date() })
      .where(eq(schema.tvDevices.id, device.id));
  };
}
```

### Contrato del poll (forma sugerida — "Claude's Discretion")

```jsonc
// GET /api/tv/state    Authorization: Device <token>
{
  "serverNow": 1785000000123, // Pattern 6 — corrección de reloj
  "tvVersion": "a3f19c", // D-22
  "branch": {
    "name": "MOGOTES",
    "clock": "19:42:07",
    "dateLabel": "MAR 24 JUL · SEM 23",
  },
  "screen": "class", // idle | class | closing   (D-06/D-08/D-09)
  "quote": { "text": "…", "goldText": "…", "author": "Aristóteles." }, // idle/closing
  "class": {
    // null cuando screen != "class"
    "mode": "regular", // regular | rom            (Pitfall 2)
    "levels": ["kairos", "alfa", "delta", "sigma"],
    "level": "alfa",
    "levelLabel": "NIVEL α",
    "blocks": [
      // roster para los dots "BLOQUE n/M"
      { "role": "INITIUM", "title": "PYROS · TABATA", "shared": true },
      { "role": "NUCLEUS", "title": "NUCLEUS · EMOM" },
    ],
    "blockRole": "NUCLEUS",
    "blockIndex": 1,
    "mobilityLine": "MOVILIDAD · …",
    "exercises": [
      {
        "name": "Dominadas",
        "rx": "8-10 reps",
        "videoUrl": "https://…/exercises/42.mp4",
      },
    ],
    "exerciseIndex": 0,
    "timer": {
      "spec": { "kind": "interval", "intervalMs": 60000, "rounds": 10 }, // Pattern 5
      "status": "running", // idle | running | paused | finished
      "startedAt": 1784999880000, // epoch ms — el tiempo NO viaja, solo el sello
      "pausedAt": null,
      "pausedAccumMs": 0,
      "soundEnabled": false,
    },
  },
}
```

### Escalado + reloj sin dependencias (ES2015, Chromium 53+)

```ts
// el-templo-admin/src/tv/tv.ts   (compilado con target es2015 / lib es2015+dom)
function pad2(n: number): string {
  // padStart es ES2017 — Pitfall 5
  return n < 10 ? "0" + n : String(n);
}

function scale(): void {
  var w = window.innerWidth,
    h = window.innerHeight;
  var tvW = Math.min(w, (h * 16) / 9);
  var tv = document.getElementById("tv") as HTMLElement;
  tv.style.width = tvW + "px";
  tv.style.height = (tvW * 9) / 16 + "px";
  // 1cqw del mockup == 1rem acá. Todo el CSS usa rem (no em: no se compone).
  document.documentElement.style.fontSize = tvW / 100 + "px";
}
scale();
window.addEventListener("resize", scale); // NO ResizeObserver (Chromium 64+)
```

---

## State of the Art

### Motores web de los smart TVs (el dato que decide la arquitectura)

| Año  | Samsung Tizen | Motor             | LG webOS  | Motor            |
| ---- | ------------- | ----------------- | --------- | ---------------- |
| 2026 | 10.0          | Chromium **M130** | webOS 26  | Chromium **132** |
| 2025 | 9.0           | Chromium M120     | webOS 25  | Chromium 120     |
| 2024 | 8.0           | Chromium M108     | webOS 24  | Chromium 108     |
| 2023 | 7.0           | Chromium M94      | webOS 23  | Chromium 94      |
| 2022 | 6.5           | Chromium M85      | webOS 22  | Chromium 87      |
| 2021 | 6.0           | Chromium M76      | webOS 6.x | Chromium 79      |
| 2020 | 5.5           | Chromium M69      | webOS 5.x | Chromium 68      |
| 2019 | 5.0           | Chromium M63      | webOS 4.x | Chromium **53**  |
| 2018 | 4.0           | Chromium M56      | webOS 4.x | Chromium 53      |
| 2017 | 3.0           | Chromium M47      | webOS 3.x | Chromium 38      |

[CITED: developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html] · [CITED: webostv.developer.lge.com/develop/specifications/web-api-and-web-engine]

**Regla dura del ecosistema:** _"Once a webOS major version is released, LG never updates the version of Chromium it uses."_ [CITED: webostv.developer.lge.com] — lo mismo aplica a Tizen. **El motor del TV es el año del TV.** No hay actualizaciones que salven la situación después.

### Umbrales de features contra esa matriz

| Feature                                                                                  | Desde         | Primer TV que lo tiene            | Veredicto para `/tv`                 |
| ---------------------------------------------------------------------------------------- | ------------- | --------------------------------- | ------------------------------------ |
| Container queries / `cqw`                                                                | Chromium 105  | Tizen 9 (2025), webOS 25 (2025)   | ❌ **Prohibido** (el mockup lo usa)  |
| `aspect-ratio`                                                                           | Chromium 88   | Tizen 7 (2023), webOS 23 (2023)   | ❌ Prohibido                         |
| `gap` en flexbox                                                                         | Chromium 84   | Tizen 7, webOS 23                 | ❌ Prohibido                         |
| `?.` / `??`                                                                              | Chromium 80   | Tizen 6.5 (2022), webOS 22 (2022) | ❌ Prohibido (o transpilado)         |
| `Object.fromEntries`                                                                     | Chromium 73   | Tizen 6.0, webOS 6.x              | ❌                                   |
| `ResizeObserver`                                                                         | Chromium 64   | Tizen 5.5, webOS 5.x              | ❌ (usar `resize` de `window`)       |
| `String.padStart`                                                                        | Chromium 57   | Tizen 5.0, webOS 5.x              | ❌ (helper propio)                   |
| CSS Grid                                                                                 | Chromium 57   | Tizen 5.0, webOS 5.x              | ⚠ Solo si el piso sube a Chromium 57 |
| `async/await`                                                                            | Chromium 55   | Tizen 5.0, webOS 5.x              | ⚠ Transpilable a generadores         |
| CSS custom properties                                                                    | Chromium 49   | Tizen 5.0, webOS 4.x              | ✅                                   |
| Flexbox, `fetch`, `Promise`, `object-fit`, clases ES2015, `const/let`, template literals | ≤ Chromium 49 | todos ≥2018                       | ✅                                   |

[VERIFIED: caniuse/Baseline vía búsqueda + Samsung "Container queries gained support in Tizen 8.0+" — consistente con Chromium 105 ≈ Tizen 9; la nota de Samsung parece optimista en una versión]

**Piso recomendado: Chromium 53** (webOS 4.x / 2018, Tizen 5.0 / 2019 y todo lo posterior). Cuesta prácticamente lo mismo que apuntar a 63 y cubre el peor TV plausible en una sede.

### Video

| Aspecto  | Estado                                                                                                                                                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codec    | Los mp4 del repo se generan con `libx264 … -pix_fmt yuv420p -movflags +faststart` [VERIFIED: `videoTranscoder.ts:61-77`]. H.264 + yuv420p es decodificación por hardware en todo smart TV; `+faststart` permite empezar sin descargar todo. ✅ |
| Autoplay | `<video autoplay loop muted playsinline>` — el patrón de `VideoPlaceholder.vue`. Muted autoplay está permitido en todos los motores relevantes. ✅                                                                                             |
| Auth     | Worker público de R2 sin auth (`R2_PUBLIC_URL`), sin CORS necesario para `<video src>` sin `crossorigin`. ✅                                                                                                                                   |
| Tamaño   | ~1.6 MB por ejercicio, 202 ejercicios con video. Un cambio de ejercicio = una descarga. En una sede con wifi flojo puede tardar: mantener el poster/último frame y no dejar el panel en negro. ⚠                                               |

### Kiosco / operación

- **Wake lock:** `navigator.wakeLock` "no es spec oficial de webOS TV" y en la práctica **la promesa se cuelga** (ni resuelve ni rechaza) [CITED: forum.webostv.developer.lge.com/t/keep-screen-on-prevent-screensaver-blackout/740]. El runbook (D-21) debe indicar la configuración del TV: en Samsung, _Settings > General > Eco Solution > Auto Power Off_ al máximo y _System Manager > Time > Screen Saver Time_ en off/máximo; en LG, ajustes equivalentes de screensaver [CITED: cast-hub.com guía de screensavers].
- **Autolanzar la URL al encender:** el browser nativo de TV **no** ofrece "abrir esta URL al arrancar". El runbook debe cubrir el flujo manual (encender → abrir browser → última pestaña/marcador `/tv/`). Si esto resulta insoportable en la práctica, la salida operativa conocida es un dispositivo Android TV barato + Fully Kiosk Browser — pero eso contradice D-20 y va al runbook como nota, **no** al código.
- **Deprecado en este contexto:** _no_ usar Application Cache, _no_ apuntar a Google Fonts (C-12), _no_ asumir devtools remotos disponibles en la sede.

---

## Environment Availability

| Dependencia                     | Requerida por                         | Disponible                          | Versión  | Fallback                                 |
| ------------------------------- | ------------------------------------- | ----------------------------------- | -------- | ---------------------------------------- |
| Node.js                         | API + build del admin                 | ✓                                   | v22.22.0 | —                                        |
| pnpm                            | Instalación/CI                        | ✓                                   | 10.28.2  | —                                        |
| MySQL                           | Migración 0189 + tests de integración | ✓                                   | 8.0.46   | —                                        |
| TypeScript (devDep admin)       | Compilar `src/tv` a ES2015            | ✓                                   | ^5.9.3   | —                                        |
| ffmpeg                          | (no requerido en esta fase)           | ✓                                   | —        | —                                        |
| `slopcheck`                     | Auditoría de paquetes                 | ✗                                   | —        | No aplica: cero paquetes nuevos          |
| **Smart TV real (Tizen/WebOS)** | **Validar D-20**                      | **✗**                               | —        | **Sin fallback técnico** — ver abajo     |
| Wifi en Moreno                  | Operación de esa sede                 | ✗ (prerequisito operativo conocido) | —        | Esa sede queda fuera hasta que haya wifi |

**Dependencias faltantes sin fallback:**

- **No hay un smart TV disponible para probar durante el desarrollo.** D-20 es una restricción dura y **no se puede verificar desde esta máquina**. El plan **debe** incluir un `checkpoint:human-verify` explícito: Franco (o alguien en una sede) abre `https://admin-staging.eltemplo.org/tv/` en el browser del TV real y reporta (a) si carga, (b) qué muestra `/tv/?diag=1`. Sin ese checkpoint, la fase se puede "terminar" y descubrir en la sede que no funciona. **Recomendación fuerte: incluir en la página un modo `?diag=1`** que imprima en pantalla `navigator.userAgent`, resultado de feature-detects (`CSS.supports('container-type','size')`, `'padStart' in String.prototype`, etc.), offset de reloj y latencia del poll — es el único instrumento de diagnóstico posible en un TV sin devtools.

**Dependencias faltantes con fallback:**

- `slopcheck` → no aplica (sin paquetes nuevos).

---

## Validation Architecture

### Test Framework

| Propiedad         | Valor                                                                                                                                                                                                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework (API)   | `vitest` (config en `el-templo-api/vitest.config.ts`), forks, `isolate:false`, DB real por worker `eltemplo_test_<POOL_ID>`                                                                                                                                                                              |
| Config file       | `el-templo-api/vitest.config.ts` + `test/setup.ts` + `test/setup-global.ts`                                                                                                                                                                                                                              |
| Quick run         | `cd el-templo-api && pnpm vitest run test/tv/<archivo>.test.ts`                                                                                                                                                                                                                                          |
| Full suite        | `cd el-templo-api && pnpm test` — **solo en CI** (C-11)                                                                                                                                                                                                                                                  |
| Framework (admin) | **NINGUNO.** `el-templo-admin/package.json` no tiene `vitest` ni script `test`; existe `src/boot/__tests__/axios-refresh-lock.test.ts` pero **no lo corre nadie**. CI del admin = lint (`continue-on-error: true`) + audit + build. Tampoco hay typecheck [VERIFIED: `.github/workflows/ci.yml:206-242`] |

### Phase Requirements → Test Map

La fase no tiene IDs de requisito; se mapea contra las decisiones.

| Decisión  | Comportamiento                                                                       | Tipo                        | Comando automatizado                            | ¿Existe?        |
| --------- | ------------------------------------------------------------------------------------ | --------------------------- | ----------------------------------------------- | --------------- |
| D-01/D-02 | Solo owner/coach pueden reclamar un pairing; `user_code` no expira                   | integration                 | `pnpm vitest run test/tv/tv-pairing.test.ts`    | ❌ Wave 0       |
| Pattern 2 | `GET /pair/status` con `user_code` (sin `device_code`) NO devuelve token             | integration                 | idem                                            | ❌ Wave 0       |
| D-02      | Un `user_code` se consume una sola vez (segundo claim → 409)                         | integration                 | idem                                            | ❌ Wave 0       |
| D-03      | Token revocado ⇒ 401 en el poll                                                      | integration                 | `test/tv/tv-device-poll.test.ts`                | ❌ Wave 0       |
| D-04      | 2 TVs de la misma sede ven el mismo estado                                           | integration                 | idem                                            | ❌ Wave 0       |
| D-05      | El poll actualiza `last_seen_at`                                                     | integration                 | idem                                            | ❌ Wave 0       |
| D-07      | Estado con `class_date` de ayer ⇒ el poll devuelve reposo                            | integration                 | `test/tv/tv-class-day.test.ts`                  | ❌ Wave 0       |
| D-07      | Mismo caso con sede en `Europe/Madrid` (borde de día distinto)                       | integration                 | idem                                            | ❌ Wave 0       |
| D-09      | Sesión del día no aprobada ⇒ poll devuelve `screen:"idle"` **sin** campo de error    | integration                 | idem                                            | ❌ Wave 0       |
| D-10      | `GET /control/context` con sesión no aprobada ⇒ flag explícito para el profe         | integration                 | `test/tv/tv-control.test.ts`                    | ❌ Wave 0       |
| D-11      | Coach solo puede escribir el estado de sedes que le corresponden (`canAccessBranch`) | integration                 | idem                                            | ❌ Wave 0       |
| D-12      | Dos writes seguidos: gana el último                                                  | integration                 | idem                                            | ❌ Wave 0       |
| D-15      | Cambiar de nivel NO resetea el timer; cambiar de bloque SÍ + `exerciseIndex=0`       | integration                 | idem                                            | ❌ Wave 0       |
| D-17      | pause → resume conserva el elapsed (`paused_accum_ms` acumula)                       | integration                 | idem                                            | ❌ Wave 0       |
| Pitfall 1 | Cambiar de nivel mantiene el mismo `block_role` y clampa `exercise_index`            | integration                 | idem                                            | ❌ Wave 0       |
| Pitfall 2 | `day='sabado'` (ROM) ⇒ roster ROM + solo alfa/delta                                  | integration                 | `test/tv/tv-class-day.test.ts`                  | ❌ Wave 0       |
| Pattern 5 | Las 50 variantes de `FormatParams` mapean a un `TimerSpec` (exhaustividad)           | unit                        | `pnpm vitest run test/tv/tv-timer-spec.test.ts` | ❌ Wave 0       |
| Pitfall 9 | `timer_started_at` conserva milisegundos en el round-trip                            | integration                 | `test/tv/tv-device-poll.test.ts`                | ❌ Wave 0       |
| Pattern 6 | El poll incluye `serverNow` coherente                                                | integration                 | idem                                            | ❌ Wave 0       |
| D-20      | La página carga y renderiza en el TV real                                            | **manual-only**             | `checkpoint:human-verify` + `/tv/?diag=1`       | ❌ Sin hardware |
| D-22      | Cambio de `version.txt` ⇒ recarga solo en reposo                                     | **manual-only / self-test** | `/tv/?selftest=1`                               | ❌ Wave 0       |

### Sampling Rate

- **Por commit de tarea:** `pnpm vitest run test/tv/` (archivo específico) + `npx tsc --noEmit` en el API + `npx vue-tsc --noEmit` en el admin (CI **no** typechequea el admin — memoria del proyecto `reference_ci_no_typecheck_frontends.md`) + `npx tsc -p el-templo-admin/src/tv/tsconfig.tv.json --noEmit`.
- **Por merge de wave:** suite completo en CI al pushear a staging (C-11).
- **Phase gate:** CI verde + checkpoint humano de D-20 en hardware real antes de `/gsd:verify-work`.

### Wave 0 Gaps

- [ ] `el-templo-api/test/tv/tv-pairing.test.ts`
- [ ] `el-templo-api/test/tv/tv-device-poll.test.ts`
- [ ] `el-templo-api/test/tv/tv-control.test.ts`
- [ ] `el-templo-api/test/tv/tv-class-day.test.ts` — ROM/sábado, TZ ES vs AR, sin sesión aprobada
- [ ] `el-templo-api/test/tv/tv-timer-spec.test.ts` — unitario puro; **además debe emitir `test/tv/__fixtures__/timer-vectors.json`**
- [ ] `el-templo-api/test/helpers.ts` — agregar las tablas nuevas a `TABLES_TO_CLEAN`
- [ ] Fixture helper para crear una sesión aprobada multi-nivel de un día (hoy cada test de sessions se arma el suyo)
- [ ] **Self-test del kiosco:** `/tv/?selftest=1` corre `timer-vectors.json` contra `phaseAt()` en el browser del TV e imprime PASS/FAIL en pantalla. Es el único mecanismo viable de verificación automática **sobre el hardware real** y cubre el hueco de que el admin no tiene test runner.
- [ ] Framework install: **ninguno** (no se agrega vitest al admin — eso dispararía C-08).

---

## Security Domain

### Applicable ASVS Categories

| ASVS                        | Aplica | Control estándar acá                                                                                                                                                                                                                                                                                                  |
| --------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 Authentication           | **sí** | Device token opaco `randomBytes(32).base64url`, sha256 en DB (patrón fase 116). Pairing tipo RFC 8628 con `device_code` secreto separado del `user_code` visible. Sin expiración por D-03, compensado con revocación por fila                                                                                         |
| V3 Session Management       | **sí** | El "sesión" del TV es la fila `tv_devices`: revocable desde el admin (D-03/D-05), `last_seen_at` como señal de vida. 401 en el poll ⇒ el TV borra `localStorage` y vuelve a pairing                                                                                                                                   |
| V4 Access Control           | **sí** | El device token da acceso **solo** a la sede de su fila (`request.tvDevice.branchId`, nunca un `branchId` del query). El profe escribe vía `attachCountryScope` + `canAccessBranch`. Los writes van gateados por un set nuevo en `shared/permissions.ts` (D-01: owner + coach), cubierto por `rbac-sets.test.ts`      |
| V5 Input Validation         | **sí** | JSON Schema en `schemas.ts` (patrón del repo, ver `sessions/schemas.ts`): `level` como `enum`, `blockRole` como `enum`, `exerciseIndex` como `integer minimum:0`, `userCode` con `pattern` del alfabeto elegido                                                                                                       |
| V6 Cryptography             | **sí** | `node:crypto` únicamente. Nunca `Math.random()` para el `device_code`. Para el `user_code` (32⁶) usar también `randomInt`/`randomBytes` — el precedente de `referrals/service.ts:500` usa `Math.random()` porque la unicidad la impone un UNIQUE, **pero acá el valor es un secreto de corta vida y debe ser CSPRNG** |
| V7 Error Handling & Logging | **sí** | Nunca loguear el token ni el `device_code`. D-09: la respuesta al TV **no** lleva mensajes de error internos. Un `POST /api/tv/client-log` (opcional) debe validar tamaño y no aceptar HTML                                                                                                                           |
| V13 API                     | sí     | Rate limiting: **el repo no tiene `@fastify/rate-limit`**. No agregarlo en esta fase (C-08); mitigar con el split `user_code`/`device_code` + consumo one-shot                                                                                                                                                        |

### Known Threat Patterns

| Patrón                                                    | STRIDE                 | Mitigación estándar                                                                                                                                    |
| --------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fuerza bruta del pairing code eterno (D-02)               | Spoofing               | `device_code` secreto (RFC 8628) + one-shot claim con `UPDATE … WHERE claimed_at IS NULL`                                                              |
| TOCTOU en el claim (dos coaches reclaman a la vez)        | Tampering              | Consumo en un solo `UPDATE` condicional, chequear `affectedRows`, no `SELECT`+`UPDATE`                                                                 |
| Device token filtrado (foto de la pantalla, TV revendido) | Elevation of Privilege | Revocación por fila desde el admin (D-03/D-05). El token **nunca** se muestra en pantalla — en pantalla solo va el `user_code`                         |
| Escritura cross-sede desde un TV comprometido             | Elevation of Privilege | Los endpoints de device son **read-only**; el `branch_id` sale de la fila del device, jamás del request                                                |
| Fuga de PII por el endpoint del TV                        | Information Disclosure | El payload del poll no incluye datos de socios: solo ejercicios, prescripciones y estado. Revisarlo en el schema de respuesta                          |
| SQL injection                                             | Tampering              | Drizzle parametriza; no hay SQL crudo en el módulo                                                                                                     |
| DoS por polling                                           | Denial of Service      | ~2.4 req/s con 6 sedes. `last_seen_at` como update fire-and-forget para no serializar. Si crece, subir el intervalo antes que agregar infra            |
| XSS en la página del kiosco                               | Tampering              | La página estática no debe usar `innerHTML` con datos del API (nombres de ejercicios vienen de la DB): usar `textContent`. Refuerza también Pitfall 13 |

---

## Assumptions Log

| #   | Claim                                                                               | Sección                            | Riesgo si está mal                                                                                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | El nginx real del EC2 coincide con `deploy/nginx/admin.eltemplo.org` del repo       | Runtime State Inventory, Pitfall 7 | `/tv/` podría 404 o servir el `index.html` del SPA. **Mitigable con un checkpoint en staging antes de dar la fase por terminada**                                                                                                        |
| A2  | Los TVs de las sedes son ≥2018 (webOS 4.x / Tizen 5.0)                              | State of the Art, piso Chromium 53 | Si hay un TV de 2016 (webOS 3.x, Chromium 38: sin CSS variables, sin `fetch`), ni el piso propuesto alcanza. **Preguntar marca/año de los TVs antes de planificar**                                                                      |
| A3  | Cinzel y NunitoSans (las base64 del repo) no cubren griego ni U+2609                | Pitfall 6                          | Fuerte evidencia indirecta (el PDF cambia a Roboto para los símbolos y dibuja ☉ como vector), pero no se abrieron los archivos de fuente. Si sí cubren, el mitigante propuesto es innecesario (costo nulo)                               |
| A4  | La respuesta del poll cabe holgada en el presupuesto de un TV y 2.5 s es suficiente | Arquitectura                       | Si el payload crece (listas largas + roster), evaluar `If-None-Match`/ETag                                                                                                                                                               |
| A5  | `tsc --target es2015 --lib es2015,dom` es suficiente para el piso Chromium 53       | Pattern 7, Pitfall 5               | tsc downlevela sintaxis y `lib` bloquea built-ins nuevos, pero no valida CSS. El diag `?diag=1` cubre el hueco                                                                                                                           |
| A6  | El INITIUM es efectivamente igual en todos los niveles del día                      | Pattern 3                          | El comentario del repo dice que desde el fix post-v5.1 sale idéntico, **pero semanas viejas o ediciones manuales pueden divergir** — por eso la fuente canónica determinista. Si diverge, el TV muestra el de alfa: coherente con el PDF |
| A7  | Sábado sigue siendo día ROM en producción (`day_modes` sin modificar desde 0080)    | Pitfall 2                          | La tabla es editable; no se consultó la DB de producción. Verificable en un minuto con un `SELECT` (requiere SSH ⇒ gate humano)                                                                                                          |
| A8  | El intervalo 2-3 s del UI-SPEC es aceptable para la latencia percibida por el profe | Arquitectura                       | Un profe que aprieta ▶ ve el TV reaccionar hasta 2.5 s después. **Vale confirmarlo con Franco**: si molesta, bajar a 1.5 s cuesta ~4 req/s totales                                                                                       |

---

## Open Questions

1. **OQ-1 — ¿Qué hace el TV los sábados (día ROM)?**
   - Lo que sabemos: `day_modes` tiene `(6,'rom')` por seed; las sesiones ROM tienen roles `ROM_LOWER/CORE/UPPER` y solo tiers alfa/delta; el PDF ya las rotula BÁSICO/AVANZADO.
   - Lo que no está claro: si v1 soporta ROM o el TV queda en reposo los sábados. El UI-SPEC no lo menciona.
   - Recomendación: **soportarlo** — el costo es un roster alternativo y dos etiquetas, y "el TV no anda los sábados" es un bug percibido, no una decisión. Confirmar con Franco antes de planificar.

2. **OQ-2 — ¿Qué marca/año son los TVs de las sedes?**
   - Lo que sabemos: la matriz de motores es determinista por año/modelo.
   - Lo que no está claro: si el peor TV es de 2018 o de 2023 — cambia si hace falta el piso Chromium 53 o alcanza con 88.
   - Recomendación: preguntarlo **antes** de planificar. Si todos son ≥2023, la ruta Vue vuelve a ser viable y ahorra bastante trabajo. Si hay uno solo viejo, la página estática es obligatoria.

3. **OQ-3 — Mecanismo exacto de la versión para D-22.**
   - Lo que sabemos: D-22 dice "el poll incluye la versión del frontend". Pero API y admin se deployan por separado: el API **no puede** conocer el hash del build del admin.
   - Lo que no está claro: si Franco acepta la variante `GET /tv/version.txt` (mismo origen, generado en build, cache-busted) en vez de piggyback en el poll.
   - Recomendación: usar `version.txt` (automático, sin riesgo de olvidar un bump manual) y anotar la desviación. El CONTEXT deja el "detalle técnico del contrato" a discreción, así que probablemente no requiere volver a discuss.

4. **OQ-4 — ¿`public/tv/` se commitea o se genera?**
   - Precedente contradictorio: `public/ffmpeg/` está commiteado aunque lo genera un script.
   - Recomendación: generarlo en `build` y gitignorearlo, con `exit 1` si falla el script — evita ~500 KB de binarios en cada diff. Decisión del planner.

5. **OQ-5 — ¿Se acepta `fsp: 3` como primer uso en el repo?**
   - Alternativa: `bigint` epoch ms (inmune a TZ de MySQL) o aceptar truncado al segundo.
   - Recomendación: `timestamp(3)`. Es la opción que mantiene la convención del repo y elimina el error de 1 s. Cubrir con un test de round-trip.

---

## Sources

### Primary (HIGH confidence)

- **Código del repo leído en esta sesión** (verificación directa):
  `el-templo-api/src/modules/sessions/routes.ts`, `el-templo-api/src/modules/admin/format-params.ts`, `el-templo-api/src/modules/admin/service.ts`, `el-templo-api/src/modules/coach/routes.ts`, `el-templo-api/src/modules/shared/{permissions,country-scope,qr-token,video-url,date-utils}.ts`, `el-templo-api/src/modules/auth/refresh-token-service.ts`, `el-templo-api/src/plugins/auth.ts`, `el-templo-api/src/app.ts`, `el-templo-api/src/db/schema/{branches,session-blocks,formats,day-modes,refresh-tokens,notifications,index}.ts`, `el-templo-api/src/db/migrations/0080_rom_mode_day_modes.sql`, `el-templo-api/test/helpers.ts`, `el-templo-api/vitest.config.ts`, `el-templo-admin/quasar.config.js`, `el-templo-admin/postcss.config.js`, `el-templo-admin/package.json`, `el-templo-admin/src/router/{index,routes}.ts`, `el-templo-admin/src/boot/axios.ts`, `el-templo-admin/src/utils/pdf/{pdf-assets,session-pdf-builder,session-data-transformer}.ts`, `el-templo-admin/src/utils/{videoTranscoder,weekDates}.ts`, `el-templo-admin/src/constants/levels.ts`, `el-templo-admin/scripts/copy-ffmpeg.mjs`, `el-templo-app/src/components/VideoPlaceholder.vue`, `deploy/nginx/admin.eltemplo.org`, `.github/workflows/{ci,deploy}.yml`
- **Skills del repo:** `.claude/skills/el-templo-db-migrations/SKILL.md`, `.claude/skills/el-templo-change-control/SKILL.md`
- **Documentos de la fase:** `164-CONTEXT.md`, `164-UI-SPEC.md`, `164-tv-mockup-template.html`
- **Samsung Developer — Web Engine Specifications:** https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html (mapa Tizen ↔ Chromium)
- **LG webOS TV Developer — Web API and Web Engine:** https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine (mapa webOS ↔ Chromium + "LG never updates the Chromium version")
- **drizzle-orm type defs** (`mysql-core/columns/timestamp.d.ts`) — confirmación de la opción `fsp`
- **Verificación de numeración de migraciones:** `git ls-tree origin/master` / `origin/staging` sobre `el-templo-api/src/db/migrations/`

### Secondary (MEDIUM confidence)

- Búsqueda web sobre soporte de container queries (Chromium 105) y `aspect-ratio` (Chromium 88), cruzada con la nota de Samsung ("Container queries gained support in Tizen 8.0+") — coherentes entre sí dentro de una versión
- webOS TV Community forum — hilo "Keep screen on, prevent screensaver/blackout": `wakeLock` se cuelga en webOS
- Guía de screensavers de smart TVs (cast-hub.com) — pasos de configuración Samsung/LG para el runbook D-21

### Tertiary (LOW confidence — marcado para validación)

- Que los TVs concretos de las sedes de El Templo estén dentro del rango asumido (A2) — **sin verificar, hay que preguntar**
- Cobertura de glifos griegos en los archivos Cinzel/NunitoSans embebidos (A3) — inferido del comportamiento del builder de PDF, no inspeccionado en la fuente

---

## Metadata

**Confidence breakdown:**

- Standard stack: **HIGH** — cero deps nuevas; todo verificado leyendo `package.json` y el código
- Arquitectura (backend): **HIGH** — cada pieza tiene un archivo precedente concreto en el repo
- Arquitectura (kiosco): **MEDIUM-HIGH** — la matriz de motores es HIGH (docs oficiales de Samsung y LG); la elección exacta del piso depende de A2/OQ-2, sin verificar
- Pitfalls: **HIGH** para los derivados del código (1, 2, 3, 5, 7, 9, 11, 14) y de docs oficiales (4); **MEDIUM** para los de comportamiento en hardware (6, 8, 13)
- Seguridad: **HIGH** — el patrón de token es el de la fase 116 ya auditado; el pairing sigue RFC 8628
- Validation architecture: **HIGH** — infra de tests inspeccionada directamente (incluida la ausencia de test runner en el admin)

**Research date:** 2026-07-24
**Valid until:** 2026-08-23 (30 días — el repo se mueve rápido: re-verificar la numeración de migraciones y `quasar.config.js` antes de ejecutar)
