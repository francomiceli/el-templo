# Fase 195: Web SEO local + AEO + atribución — Research técnico

**Investigado:** 2026-10-06
**Worktree:** `/home/franco/projects/et-195-seo` (rama `feat/195-seo-web`, base `origin/master` `30eef9921`)
**Dominio:** Nuxt 4 SSG + Fastify/Drizzle/MySQL + nginx + GitHub Actions + APIs de Meta y Google
**Confianza global:** MEDIA-ALTA. El código está verificado con archivo:línea. Las APIs externas están verificadas contra documentación oficial. Los detalles finos de CAPI (action_source por canal) y la política ATT de Apple tienen confianza MEDIA.
**Insumo del "qué":** `195-RESEARCH-SEO-AEO.md` (SEO/AEO cerrado). Este documento cubre solo el **cómo**.

---

<user_constraints>
## Restricciones del usuario (copiado de 195-CONTEXT.md)

### Decisiones bloqueadas

#### Organización (Franco 2026-10-06, NO re-litigar)
- **D-01** Todo en UNA fase, incluido el fix urgente de la dirección de Alem → **Juan B. Justo 1018** (no sale antes como fix suelto). Aun así, el plan del fix de datos de sedes va PRIMERO en el orden de ejecución.
- **D-02** Nombre canónico de marca: **"El Templo Calistenia"**; cada sede "El Templo Calistenia — <Sede>". Configurable en un solo lugar.

#### Bloque A — fixes técnicos
- **D-03 (A1)** Schema: `Organization` raíz con `@id` fijo + `ExerciseGym` por sede con `@id` propio, `parentOrganization`, `geo` (5+ decimales), `openingHoursSpecification` desde la grilla real, teléfono por sede. Se mudan a las páginas de sede (B3); la home conserva solo el `Organization`.
- **D-04 (A2)** GA4 + Meta Pixel por secrets en CI (+ `.env.example`). Search Console + Bing Webmaster verificados por DNS (Franco dice quién administra el DNS).
- **D-05 (A3)** 404 real (`error_page`, sin fallback a `/index.html`) + redirects 301/302 reales en nginx en lugar de meta-refresh. Deploy de config nginx por SSH → **human gate**.
- **D-06 (A4)** No tocar placeholders de contenido (fotos, testimonios, hero, og:image) hasta tener material real. **Sí** arreglar: logo del schema (404) y el link `wa.me` roto.
- **D-07 (A5)** Quitar Chapadmalal. El Templo Park = "espacio de comunidad en el Parque Primavesi", sin `ExerciseGym`. Conteos: 6 sedes MdP (Constitución, Jujuy, Moreno, Juan B. Justo, Alberti, Mario Bravo) + Barcelona.
- **D-08 (A6)** lat/lng exactos + Place ID desde los links de Google Maps que pasa Franco; horarios desde la grilla real de la DB.
- **D-09 (A7)** `X-Robots-Tag: noindex` + robots `Disallow` para web-staging, app y admin (mismo deploy nginx que D-05).

#### Bloque B — datos, páginas, app
- **D-10 (B1)** Fuente única = `branches` (migración: slug, lat/lng, place_id, foto, `publicar_en_web`) + endpoint público read-only con sedes y horarios. La web lo consume **en el build**. Migración numerada al momento de ejecutar (fase 194 usa 0255+; master tiene 0258).
- **D-11 (B2)** Rebuild **manual**, sin cron ni SSR. **B2-bis**: botón "solo web" en GitHub (input de `workflow_dispatch` o workflow aparte) con backup/rollback.
- **D-12 (B3)** Páginas: hub `/sedes` + una por sede; disciplinas/niveles (incluye Aura/Yoga); profes (`Person`) + landing "primera clase gratis"; planes **sin precios** con CTA al WhatsApp de ventas.
- **D-13 (B4)** Barcelona en `/es/` con hreflang `es-AR`/`es-ES` recíproco, solo entre páginas equivalentes.
- **D-14 (B5)** Deep links (`assetlinks.json` / `apple-app-site-association`, requiere build de tiendas) + Smart App Banner + pedido de reseña in-app (plugin Capacitor → **preguntar antes de instalar**) + ASO de las fichas (va a la guía final).
- **D-15 (B7)** robots.txt explícito permitiendo bots de búsqueda IA (`OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`); NO se bloquean bots de entrenamiento. llms.txt generado desde los datos de sedes (sin invertir más).
- **D-16 (B12)** WhatsApp de ventas: **uno por país** (MdP y Barcelona), configurable, no hardcodeado.
- **D-17 (blog)** Solo arreglos técnicos: autor real (Ignacio Bordón como `Person`), tags vacíos en prod, covers con fallback, sacar el `catch {}` mudo del sitemap, publicación vía botón "solo web". Los artículos los escribe el equipo; la guía final sugiere temas.

#### Medición y atribución
- **D-18 (B6)** Atribución propia: guardar en el alta el origen (`utm_*`, `?promo=`, referrer, landing) y mostrar en Reportes el embudo registro → prueba → pago → facturación por campaña y sede. Sirve para Meta, Google, IG, QR y flyers.
- **D-19 (B6)** Meta CAPI desde la API en registro, reserva de prueba y primer pago (email/tel hasheados SHA-256, valor y moneda en el pago), deduplicado con el Pixel (`event_id`). Mencionar en `/privacidad`. Usuarios ES solo con consentimiento (D-22).
- **D-20 (B9)** Gasto de Meta **automático**: job diario contra la Marketing API (usuario del sistema del Business Manager, `ads_read`; misma credencial que CAPI) → costo por alumno pago por campaña y sede en Reportes.
- **D-21 (B8+B10)** IA y Google:
  1. Detectar origen IA en nuestro alta (referrer + `utm_source` de chatgpt.com, perplexity, gemini, copilot, claude.ai, etc.) y mostrarlo en Reportes.
  2. Job semanal de la API de Search Console (consultas/clics/impresiones por página de sede) visible en el admin.
  3. Sync de Google Business Profile (horarios/dirección/teléfono) desde `branches`, **detrás de flag**: el acceso a la API lo aprueba Google (semanas) y las fichas deben estar verificadas.
  4. Visibilidad en respuestas de IA: planilla mensual manual de 20-30 prompts (la armamos nosotros). NO se automatiza por APIs.
- **D-22 (B11)** RGPD Barcelona: banner de consentimiento propio solo en `/es/`, con Google Consent Mode v2; GA, Pixel y CAPI de usuarios ES no se disparan sin aceptación. Sin CMP externa (regla no-CDN). Argentina sin cambios.

#### Entregable final
- **D-23** Guía paso a paso para Franco/equipo (último plan de la fase): Meta (usuario del sistema, token, dataset, plantilla de parámetros de URL, eventos de optimización, quién maneja los ads), Google (GA4, Search Console/Bing por DNS, solicitud de acceso a Business Profile API, verificación de fichas), y bloque C completo (GBP por sede, reseñas sin gating, NAP, directorios MdP, prensa Primavesi, bio IG, Bing Places/Apple Business, USC/ClassPass BCN, ASO). Cada paso dice dónde se carga el resultado (secret, setting, etc.).

### A criterio de Claude
- Forma del endpoint público y su caché; nombres de columnas/tablas de atribución; dónde vive la config por país (WhatsApp, nombre canónico) — reutilizar `tenant_settings`/patrones existentes antes de inventar.
- Cómo partir los planes (agrupar: Franco considera que 30+ planes es mucho — ver fase 194).
- Ubicación de los jobs (cron de la API existente) y su manejo de credenciales ausentes (no-op con log, nunca romper el arranque).

### Ideas diferidas (FUERA DE ALCANCE)
- Contenido real (fotos por sede, testimonios, hero/video, og:image) — cuando el equipo lo entregue.
- Monitoreo automático de prompts por APIs de IA.
- Wikidata (cuando haya fuentes independientes).
- Qué hacer con la app vieja de Virtuagym (va como ítem en la guía final).
</user_constraints>

<phase_requirements>
## Requisitos de la fase (D-01..D-23 → cómo se habilitan)

| ID | Descripción corta | Qué lo habilita en este research | Plan propuesto |
|----|-------------------|----------------------------------|----------------|
| D-01 | JBJ 1018 primero | Parche estático en `data/sedes.ts:70-78` + `llms.txt` + seed de `branches` keyed por `code='ALEM'` (precedente `0230`) | P01 |
| D-02 | Nombre canónico configurable | `tenant_settings` key `web.brand_name` con default constante; viaja en el endpoint | P01/P02 |
| D-03 | Organization raíz + ExerciseGym por sede | Builder JSON-LD propio (nuxt-schema-org no tipa `ExerciseGym`, ver §Schema) | P04 |
| D-04 | GA4/Pixel por secrets | `deploy.yml:252-256` no los inyecta; agregar `NUXT_PUBLIC_GA4_ID`/`NUXT_PUBLIC_META_PIXEL_ID` | P06/P07 |
| D-05 | 404 real + redirects nginx | `deploy/nginx/eltemplo.org:47` + quitar `routeRules` de `nuxt.config.ts:35-51`; Nuxt ya genera `404.html` | P08 (gate SSH) |
| D-06 | Logo schema + wa.me roto | `app.vue:47` (svg 404), `AppPrefooter.vue:17` (`54223XXXXXXX`) | P01 |
| D-07 | Quitar Chapadmalal, Park comunidad | Columnas `publish_on_web` + `web_kind` en `branches` | P01/P04 |
| D-08 | lat/lng/Place ID + horarios reales | Columnas en `branches`; horarios agregados desde `schedules` (`schedules.ts:31-46`) | P01/P02 |
| D-09 | noindex staging/app/admin | vhosts nginx; ojo con la secuencia noindex vs Disallow (Pitfall 6) | P08 |
| D-10 | Fuente única + endpoint público | `GET /api/web/site-data` dentro de `templo-marketing` (`modules-boot.ts`) | P02/P03 |
| D-11 | Rebuild manual + "solo web" | Input `target` en `workflow_dispatch` de `deploy.yml`/`deploy-staging.yml` | P07 |
| D-12 | Páginas sedes/disciplinas/profes/primera clase/planes | Páginas Nuxt prerenderizadas desde el JSON del build | P04/P05 |
| D-13 | `/es/` + hreflang | Páginas bajo `pages/es/`, composable de pares equivalentes | P06 |
| D-14 | Deep links + Smart Banner + reseña in-app + ASO | `.well-known` YA existen en `el-templo-app/public/.well-known/` con fingerprints TODO y no se sirven | P13 (+P08) |
| D-15 | robots IA + llms.txt generado | `public/robots.txt` estático + `llms.txt` generado en prebuild | P03 |
| D-16 | WhatsApp por país | **YA existe** `tenant_settings` `whatsapp.sales_number.{AR,ES}` (fase 193, `communications/sales-number.ts`) | P01/P02 |
| D-17 | Blog técnico | Tags vacíos = **dato** (posts sin tags en prod: `GET /api/blog/tags` → `[]`); `catch {}` en `server/api/__sitemap__/blog.ts:46` | P05 |
| D-18 | Atribución propia | Tabla `signup_attributions` + captura en `POST /api/auth/register` y `POST /api/admin/members/trial` | P09/P12 |
| D-19 | CAPI | Job outbox `meta_capi_events` (sin hooks en los caminos de pago) | P10 |
| D-20 | Gasto Meta automático | Job diario de Insights → `ad_spend_daily` | P10/P12 |
| D-21 | IA + GSC + GBP + planilla | Clasificador de canal; job GSC (JWT RS256 con `node:crypto`); GBP con OAuth refresh token detrás de flag | P09/P11/P12/P14 |
| D-22 | RGPD `/es/` | Consent Mode v2 "básico" (no cargar tags sin aceptación) + `fbq('consent')` + filtro en CAPI | P06/P10 |
| D-23 | Guía final | Doc de pasos con destino de cada dato (tabla §Datos de Franco) | P14 |
</phase_requirements>

---

## Resumen

La web es Nuxt 4.3.1 SSG (`ssr: true` + `nitro.preset: static`) servida por nginx. Hoy lee todo de archivos `data/*.ts` hardcodeados. El JSON-LD sale de `nuxt-schema-org` 5.0.10 con `identity: "Organization"`, y por eso todo colapsa en un nodo. No mide nada porque el deploy no inyecta los IDs. El blog **ya** consume la API en el build (`useFetch` contra `NUXT_PUBLIC_API_URL`), así que existe el precedente exacto para que las sedes salgan del endpoint en el build. Dos piezas de D-16 y D-14 **ya existen y no hay que inventarlas**:
- el número de WhatsApp de ventas por país vive en `tenant_settings` (fase 193);
- los archivos `.well-known` de deep links existen en el repo de la app, aunque con fingerprints `TODO` y sin servirse (la prueba live devuelve `text/html`).

La parte de API sigue patrones muy consolidados:
- rutas públicas de marketing dentro de `temploMarketingModule` (tenant 1 vía `DEFAULT_PUBLIC_TENANT_ID`);
- integraciones externas con config que devuelve `null` si falta un secret (patrón `wellhub/config.ts`);
- jobs `node-cron` que barren con `forEachActiveTenant`;
- tests de integración contra MySQL real.

Todo lo de Meta y Google se resuelve con `fetch` nativo + `node:crypto` (SHA-256 para CAPI y RS256 para el JWT de la service account de Google). **Cero dependencias nuevas**, salvo el plugin Capacitor de reseña in-app (D-14), que es un human gate.

Hay tres riesgos de diseño que el planner tiene que resolver explícitamente:
1. **Orden de rollout API→web.** El build de la web corre en paralelo con el de la API y ANTES del deploy, así que en el mismo push el endpoint nuevo todavía no existe en el servidor. Si el modo estricto falla, bloquea el deploy entero, API incluida.
2. **El 404 real de nginx expone toda página no prerenderizada.** Hoy el fallback a `index.html` la tapaba. Hay que prerenderizar todo y publicar el blog con el botón "solo web".
3. **CAPI tiene implicancias legales y de política de tiendas.** `/privacidad` dice hoy textualmente "No vendemos ni compartimos tus datos con terceros", y la definición de "tracking" de Apple ATT cubre compartir emails con redes publicitarias.

Además la fase 194 (sin mergear) toca `auth/routes.ts`, `members/routes.ts`, `subscriptions/service.ts`, `booking-service.ts` y `tenant-tables.ts`. Por eso los ganchos de 195 en esos archivos tienen que ser de 1-3 líneas, y CAPI se diseña como **outbox derivado por job** que lee el estado de la DB, en vez de hooks dentro de los caminos de pago.

**Recomendación principal:** 14 planes, en este orden: datos de sedes (JBJ) → endpoint → pipeline de build → páginas/schema → `/es/`+consent → CI "solo web" → atribución → Meta → Google → Reportes → app → nginx (gate SSH al final del rollout) → guía. Migraciones en el bloque **0270+**.

---

## Mapa de responsabilidades por capa

| Capacidad | Capa primaria | Capa secundaria | Por qué |
|-----------|---------------|-----------------|---------|
| Datos de sedes (dirección, geo, slug, publicación) | Base de datos (`branches`) | API (endpoint público) | D-10: fuente única; los datos de prod entran por migración |
| Horarios publicados | Base de datos (`schedules`) | API (agregación a `openingHours`) | La grilla real ya vive en `schedules`; una sola función la usan la web y el sync GBP |
| WhatsApp de ventas y nombre canónico | Base de datos (`tenant_settings`) | API | Ya existe la key `whatsapp.sales_number.<PAÍS>` (fase 193) |
| HTML/JSON-LD/hreflang/llms.txt/robots | CDN/Static (Nuxt SSG en build) | — | D-11: sin SSR ni cron; todo se hornea en el build |
| 404, redirects, noindex, content-type de `.well-known` | Servidor web (nginx) | — | D-05/D-09; meta-refresh y soft-404 son limitaciones del preset static |
| Consentimiento `/es/` y carga de GA4/Pixel | Browser | — | D-22; el banner es propio |
| Captura first-touch (utm/referrer/fbclid) | Browser (web + app web) | API (persistencia en el alta) | El referrer y los params solo existen en el cliente |
| Clasificación de canal (incluida IA) | API | — | Lógica pura testeable; se recalcula sin depender del cliente |
| CAPI, Insights, Search Console, GBP | API (jobs `node-cron`) | Base de datos (outbox/estado) | Secrets server-side; reintentos e idempotencia en DB |
| Embudo y costo por alumno | API (reports) | Admin (tab Reportes) | Agregación SQL server-side, scoped por tenant y sede |
| "Solo web" con backup/rollback | CI (GitHub Actions) | Servidor (rsync) | D-11 B2-bis |

---

## Restricciones del proyecto (de CLAUDE.md y skills)

- **Logging:** en la API, Pino (`request.log`, `app.log`, `pino({name})` en jobs), nunca `console.log`. En los fronts, `createLogger()`. La web ya tiene `utils/logger.ts`, y los scripts `.mjs` de build pueden usar `console` porque no son la app (**[ASUMIDO]**: confirmarlo; la alternativa es `process.stdout.write`).
- **TypeScript:** sin `any`; `catch (err: unknown)` + `instanceof Error`.
- **Tests de API:** toda ruta nueva lleva test de integración en `el-templo-api/test/` contra MySQL real. **No correr la suite local completa** (CI la corre); solo typecheck y algún archivo puntual.
- **DB:** schema en `src/db/schema/`, SQL **escrito a mano** (`db:generate` está roto por drift), sin `;` en comentarios SQL, el `.sql` va en el mismo commit que el schema, **nunca** `drizzle-kit migrate`. Datos de prod siempre por migración; datos de test nunca por migración.
- **Env vars nuevas** → `.env.example` correspondiente **y** el heredoc `.env.production` de `deploy.yml` y `deploy-staging.yml`. Si no van al heredoc, el valor no llega a prod.
- **Human gates:** push (cada vez), SSH (cada vez, con el comando exacto), instalar o actualizar dependencias (incluye el plugin Capacitor), deploys manuales de frontend (prohibidos).
- **`git add` por path explícito.** Nunca `-A` ni `.`.
- **Sin CDN en prod.** Los scripts de GA4/Pixel ya se cargan desde Google/Meta (fase 36); son servicios de terceros por naturaleza, no assets. **[ASUMIDO]**: excepción aceptada; confirmarlo con Franco en la guía.
- **Composables:** exponen `cleanup()`, sin `onUnmounted` adentro. **Stores:** Pinia con setup function.
- **Ejecución:** planes ejecutados por `gsd-executor` en sonnet, **secuenciales**; tests solo en foreground; sin `run_in_background`.
- **CI no typechequea app ni admin** → `vue-tsc` local obligatorio. La web sí (`ci.yml:218` `nuxi typecheck`).
- **Version bumps:** feature=minor (la app está en `1.8.1`, `el-templo-app/version.txt`).

---

## Mapa del código (archivo:línea)

### Web (`el-templo-web/`)
| Qué | Dónde | Nota |
|-----|-------|------|
| Módulos y config | `nuxt.config.ts:3-9` (content, eslint, schema-org, image, sitemap); `:27-29` `schemaOrg.identity: "Organization"`; `:35-51` redirects por `routeRules` (salen como meta-refresh); `:53-59` `preset: static`, `failOnError: false`, `ignore: ["/aura-club"]`; `:61-69` runtimeConfig con `apiUrl`, `ga4Id`, `metaPixelId` | El `identity` comparte `@id` y causa el colapso |
| Sedes hardcodeadas | `data/sedes.ts:38-134` (9 sedes, Alem 3958 en `:70-78`, Chapadmalal `:114-123`, lat/lng aproximados de 3 decimales) | `expansion-maps.ts:27-35` tiene coordenadas **mejores** (4 decimales, Constitución -37.9566) → usarlas como seed |
| JSON-LD | `app.vue:43-62` `defineOrganization` (logo `/images/logo-eltemplo.svg` → **404 live**, "8 sedes"); `pages/index.vue:45-78` `defineLocalBusiness` × sede con `@type: SportsActivityLocation`, teléfono AR para todas, FAQPage | Rich results de FAQPage retirados (ver research SEO) |
| twitter:site | `app.vue:13` `@eltemplo` | La marca es `eltemplomdp` |
| "8 sedes" | `app.vue:49`, `pages/index.vue:27,36,89`, `SectionLocations.vue:38,47`, `data/faq.ts:54`, `data/academy.ts:106,378`, `data/ecosystem.ts:47,57`, `data/gladius.ts:27,57`, `pages/gladius.vue:28,38`, `data/app-landing.ts:54` | Derivar el conteo de los datos (helper `sedesCount`) |
| WhatsApp | `data/sedes.ts:31-36` (AR `5492235820521`, ES `34680774331`), `AppNav.vue:31`, `AppFooter.vue:29`, `SectionConversion.vue:33`, `BlogSidebar.vue:105`, `BlogPostCta.vue:49`, **roto** `AppPrefooter.vue:17` (`wa.me/54223XXXXXXX`) | Los mismos números que `el-templo-app/src/utils/whatsapp.ts:19-22` |
| GA4 / Pixel | `plugins/ga4.client.ts` (carga `googletagmanager.com/gtag/js`, `page_view` en `afterEach`); `plugins/meta-pixel.client.ts` (carga `connect.facebook.net/.../fbevents.js`); `composables/useAnalytics.ts` | Ninguno respeta consentimiento hoy |
| Banner cookies | `components/CookieConsent.vue` (solo zona horaria `Europe/*`, "informational only: analytics load regardless") | Lo reemplaza el banner real de `/es/` (D-22) |
| Blog | `pages/blog/[slug].vue:45-62` (404 con `createError` si no existe), `:89-108` `defineArticle` con autor "El Templo" y logo 404; `pages/blog/index.vue:72-80`; `server/api/__sitemap__/blog.ts:22-48` (`catch {}` mudo) | Prod: `GET /api/blog/tags` → `{"tags":[]}` y los posts tienen `tags:[]`, `coverImage:null` (verificado con curl) |
| robots / llms | `public/robots.txt` (4 líneas), `public/llms.txt` ("8 sedes", sin direcciones) | — |
| Salida del build | `.output/public/` trae `200.html`, `404.html` (shell SPA), `qr/bcn` (archivo sin extensión con meta-refresh), `_payload.json` (verificado en el checkout viejo) | — |
| CI web | `.github/workflows/ci.yml:184-222` (lint `continue-on-error`, `nuxi typecheck`, `pnpm run generate` **sin** `NUXT_PUBLIC_API_URL` → apunta a localhost) | El build de CI no tiene API: hace falta un fixture |
| Privacidad | `pages/privacidad.vue:73` "No vendemos ni compartimos tus datos con terceros" | **Contradice CAPI** (Pitfall 9) |
| App store IDs | `data/app-landing.ts:214-215` (`id6761773726`, `com.eltemplo.app`) | Smart App Banner |

### Deploy
| Qué | Dónde |
|-----|-------|
| Triggers | `deploy.yml:6-9` (`push` master/main + `workflow_dispatch` **sin inputs**); `deploy-staging.yml:6-9` igual con staging |
| Detección | `deploy.yml:20-41` `dorny/paths-filter` → outputs api/app/admin/web |
| Build web | `deploy.yml:222-262`: `if: github.event_name == 'workflow_dispatch' \|\| ...web == 'true'`; env solo `NUXT_PUBLIC_API_URL: secrets.VITE_API_URL` y Sentry; **sin GA4/Pixel** (`:252-256`) |
| Deploy | `deploy.yml:270-282` exige que **todos** los builds sean success/skipped; backup `:341-350` copia los 4 dirs **siempre**; rsync web `:404-409`; smoke web `:459-467`; rollback `:469-494` restaura los 4 `.previous` + `pnpm install` + `pm2 restart` |
| Env API prod | `deploy.yml:352-378` (heredoc `.env.production`) |
| Staging | `deploy-staging.yml:231-272` (web con `STAGING_VITE_API_URL`), `:356-358` backup, `:474-476` smoke `web-staging`, `:500-502` rollback |

### nginx (`deploy/nginx/`)
| Vhost | Línea clave | Estado |
|-------|-------------|--------|
| `eltemplo.org` | `:47` `try_files $uri $uri/index.html $uri.html /index.html =404;` (soft-404); `:51-54` assets con `add_header` propio (no hereda headers del server); el comentario `:16` dice "certbot will add certificate paths" | **El archivo del repo NO tiene las líneas de certbot** que sí tiene el server |
| `web-staging.eltemplo.org` | `:32` y `:79` mismo soft-404; sin noindex | Live: indexable |
| `app.eltemplo.org` / `admin.eltemplo.org` | `:16` `try_files $uri $uri/ /index.html;` sin noindex; sin manejo de `.well-known` | Live: `/robots.txt` y `/.well-known/*` devuelven `200 text/html` (verificado con curl) |
| `api.eltemplo.org` | `:21-22` `X-Real-IP` y `X-Forwarded-For` | La API **no** tiene `trustProxy` → `request.ip` = 127.0.0.1 (Pitfall 11) |

### API (`el-templo-api/`)
| Qué | Dónde |
|-----|-------|
| `branches` | `src/db/schema/branches.ts:17-90`: `name`, `code` (unique por tenant), `timezone`, `country`, `address` (0132), `isActive`, `isVirtual`, `tenantId` DEFAULT 1. **Sin** phone/lat/lng/slug |
| Códigos prod | `ALEM` (JBJ desde mig 0230), `CONST`, `JUJUY`, `MOGOTES` (Mario Bravo, 0221), `MORENO`, `ALBERTI`, `PARK`, `CHAPADMALAL`, `BCN`, `ONLINE` (seed-production.ts:46-76, migs 0132/0208/0221/0230/0238) | Nombres en DB: "Constitucion" **sin tilde** (0208:25), "Juan B. Justo", "Mario Bravo", "Barcelona" |
| Grilla | `src/db/schema/schedules.ts:31-46` (`dayOfWeek` 1=lun..6=sáb, `startTime`/`endTime` `HH:MM`, `isActive`, `deletedFrom`, `coachUserId`); `activities.ts` (`name`, `isSpecial`, `specialLine`) | Horarios de socios con auth: `scheduling/routes.ts:1538` |
| Rutas públicas marketing | `src/modules-boot.ts` `temploMarketingModule` (franchise, gladius, blog, academy, app-landing); `moduleScope` agrega `requireModule`; en rutas anónimas resuelve `DEFAULT_PUBLIC_TENANT_ID = 1` (`shared/modules.ts:86`, `shared/module-registry.ts:189-236`) |
| Rate limit | `src/app.ts:163-170` `@fastify/rate-limit` `global:false`, opt-in con `config.rateLimit` |
| CORS | `src/app.ts:134-147` ya permite `https://eltemplo.org` |
| Config por tenant | `tenant_settings` (`schema/tenants.ts:73-85`, unique `(tenant_id, setting_key)`); `communications/sales-number.ts:45-131` (`whatsapp.sales_number.AR/ES`, validación `^[0-9]{8,15}$`, rutas admin `communications/routes.ts:302-337`). **Sin seed en migraciones** (hoy la app cae al hardcode) |
| Registro | `modules/auth/routes.ts:82-626` (`POST /api/auth/register`, pública, resuelve el tenant de la fila de `branches`, bloques best-effort de promo/ref/partner `:359-563`); schema `auth/schemas.ts:1-30` (sin `additionalProperties:false`) |
| Alta "Nuevo en Prueba" | Admin `components/TrialMemberFormDialog.vue` → `useMembersApi.createTrialMember` → `POST /api/admin/members/trial` (`members/routes.ts:871-903`), schema `members/schemas.ts:334-350` con **`additionalProperties: false`** (Pitfall 12) |
| Prueba self-service | `scheduling/trials-service.ts:262` `reserveTrialSelfService` (ruta `POST /reserve-trial`, `scheduling/routes.ts:1344-1380`); admin `bookTrial` `:894` (ruta `POST /trials`, `routes.ts:985-1006`); `bookings.isTrial` |
| "Primer pago" ya definido | `analytics/trial-funnel-service.ts:20-23`: "FIRST paid subscription (`pricePaid > 0` AND `priceTypeApplied != 'zero'`)"; `subscriptions` tiene `pricePaid` (int), `currency` (`schema/subscriptions.ts:71-73`), `createdAt` |
| Jobs | `src/jobs/*.ts` con `node-cron` ^4.2.1; arranque en `src/index.ts:50-58`; patrón de integración externa: `jobs/wellhub-sync.ts` (guard de config antes del barrido, `forEachActiveTenant`, try/catch por tick) + `modules/wellhub/config.ts` (devuelve `null` si faltan secrets) + `modules/wellhub/client.ts:59` (`fetch` nativo) |
| Service account precedente | `FIREBASE_SERVICE_ACCOUNT_BASE64` (`notifications/service.ts:124-136`, no-op con warn si falta) |
| Reportes admin | `el-templo-admin/src/pages/ReportesPage.vue:58-90` (tabs: accesos, asistencia, cobros, vencimientos, renovaciones, inactivos, deudas, conversión, sesiones de prueba, recategorización); patrón de componente por tab: `<RenovacionesTab :branch-id>` (`:480-482`), `<TrialSessionsReport :branch-id :country>` (`:750-752`) |
| Registro en la app | `el-templo-app/src/pages/RegisterPage.vue:239-256` (lee `promo`, `ref`, `code` de la query), `:310-325` (submit), **bug** `:234` `if (route.query.branchId) return 'Registrarse en Park'` (cualquier `branchId` muestra "Park") |
| Deep links | `el-templo-app/public/.well-known/assetlinks.json` (fingerprints `TODO_PROD_PLAY_APP_SIGNING_SHA256`), `apple-app-site-association` (`6D9R97DGAK.com.eltemplo.app`, paths `/r/trial*`); `AndroidManifest.xml` intent-filter `autoVerify` host `app.eltemplo.org` `/r/trial`; iOS `App.entitlements:7-17` associated-domains **comentado** (memoria `reminder_ios_deeplinks_associated_domains`); handler `src/boot/deep-links.ts` |

### Superposición con ramas paralelas (riesgo de merge)
| Rama | Archivos calientes que 195 también toca |
|------|-----------------------------------------|
| `feat/194-invitaciones` (migs 0255-0257, planea 0258/0259) | `auth/routes.ts` (+194 líneas), `members/routes.ts` (+308), `subscriptions/service.ts`, `scheduling/booking-service.ts`, `settings/routes.ts`, `db/tenant-tables.ts`, `analytics/service.ts`, `ENTRADAS_BASELINE` |
| `feat/v6.1-gimnasio` (tren 192, migs 0245-0253) | `deploy.yml`/`deploy-staging.yml` (+135/+139: job `build-kaia` con el mismo `workflow_dispatch \|\|`), `auth/routes.ts`, `db/tenant-tables.ts`, `src/index.ts`, `con-04-crons-per-tenant.test.ts` |

**Consecuencia para el diseño:** ganchos de 1-3 líneas en `auth/routes.ts` y `members/routes.ts`; CAPI **sin tocar** `subscriptions/service.ts` ni `booking-service.ts` (lo resuelve el outbox por job); el "solo web" se diseña centralizado en `detect-changes`, así el merge con `build-kaia` es agregar un output.

---

## Stack estándar (sin dependencias nuevas)

### Núcleo (ya instalado, versiones del lockfile)
| Librería | Versión | Uso en 195 | Fuente |
|----------|---------|------------|--------|
| nuxt | 4.3.1 | Páginas SSG, `useHead`, `nitro.prerender.routes` | `el-templo-web/pnpm-lock.yaml:3808` [VERIFICADO: lockfile] |
| nuxt-schema-org | 5.0.10 (`@unhead/schema-org` 2.1.9) | Solo `defineArticle` del blog; las sedes salen del builder propio | lockfile `:3788` [VERIFICADO] |
| @nuxtjs/sitemap | 7.6.0 | Sitemap; fuente de blog ya existente | lockfile `:823` [VERIFICADO] |
| fastify | ^5.7.4 | Endpoint público + reportes | `el-templo-api/package.json:42` [VERIFICADO] |
| drizzle-orm | ^0.45.1 | Schema/queries | `package.json:40` [VERIFICADO] |
| node-cron | ^4.2.1 | Jobs Meta/Google | `package.json:47` [VERIFICADO] |
| @fastify/rate-limit | ^11.2.0 | `config.rateLimit` en el endpoint público | `package.json:35` [VERIFICADO] |
| Node.js | 22.x (CI `NODE_VERSION: '22'`; local v22.22.0) | `fetch` global, `AbortSignal.timeout`, `Buffer` `base64url`, `crypto.createSign` / `createHash` | [VERIFICADO: entorno] |

### Soporte (único candidato nuevo, human gate)
| Librería | Versión | Propósito | Cuándo |
|----------|---------|-----------|--------|
| `@capacitor-community/in-app-review` | 8.0.0 (peer `@capacitor/core >=8.0.0`) | Pedido de reseña in-app (D-14) | Solo si Franco aprueba la instalación; [ASUMIDO] nombre de origen no oficial, ver auditoría |

### Alternativas consideradas
| En vez de | Se podría usar | Por qué no |
|-----------|----------------|------------|
| JWT RS256 propio con `node:crypto` | `google-auth-library` / `googleapis` | Dependencias grandes; el flujo son ~25 líneas documentadas por Google |
| `fetch` contra Graph API | `facebook-nodejs-business-sdk` | SDK pesado; CAPI e Insights son 2 endpoints REST |
| Builder JSON-LD propio | `defineLocalBusiness` de nuxt-schema-org | Su tipo no admite `ExerciseGym` (`ValidLocalBusinessSubTypes` termina en `SportsActivityLocation`) y el `identity` ya causó el colapso |
| Banner propio + Consent Mode | CMP externa (Cookiebot, etc.) | D-22 y la regla no-CDN la prohíben |
| `@nuxtjs/i18n` para `/es/` | Páginas bajo `pages/es/` + `useHead` hreflang | Solo hay 3-5 páginas equivalentes; i18n sería una dependencia nueva y sobre-ingeniería |
| Workflow aparte `deploy-web.yml` | Input `target` en el `workflow_dispatch` existente | Duplicaría SSH/backup/rollback (DRY) |

**Instalación:** ninguna, salvo el plugin de reseña (gate). En el worktree no hay `node_modules` (verificado), así que los ejecutores necesitan `pnpm install --frozen-lockfile` en cada proyecto. Eso no altera el árbol de dependencias, pero conviene confirmarlo una vez con Franco porque su regla dice "nunca instalar sin preguntar".

## Auditoría de legitimidad de paquetes

| Paquete | Registro | Antigüedad | Descargas | Repo | slopcheck | Disposición |
|---------|----------|------------|-----------|------|-----------|-------------|
| `@capacitor-community/in-app-review` | npm | creado 2024-04-22, último 2026-09-28 | 207.119/semana | github.com/capacitor-community/in-app-review | [OK] (`slopcheck scan --pkg npm`) | Aprobado **solo con checkpoint:human-verify** (regla del repo + nombre de origen no oficial) |
| `@capawesome/capacitor-app-review` | npm | creado 2024-11-25, v8.1.0 | 25.802/semana | github.com/capawesome-team/capacitor-plugins | [OK] | Alternativa; no recomendada (menos adopción) |

Ninguno tiene `postinstall` (`npm view ... scripts.postinstall` vacío). **Removidos por [SLOP]:** ninguno. **Marcados [SUS]:** ninguno.

---

## Patrones de arquitectura

### Diagrama de flujo

```
                    ┌──────────────── MIGRACIONES 0270+ (datos prod) ────────────────┐
                    ▼                                                                 │
   branches(+web cols) ── schedules/activities ── tenant_settings(whatsapp, brand)    │
          │                         │                         │                       │
          └──────────┬──────────────┴─────────────────────────┘                       │
                     ▼                                                                 │
   GET /api/web/site-data  (público, templo-marketing, tenant 1, rate-limit, cache)   │
                     │                                     │                           │
   [build-time] scripts/fetch-web-data.mjs ◄───────────────┘     computeOpeningHours() │
        │ strict en deploy / fixture en CI                        ▲ (misma función)    │
        ▼                                                         │                    │
   data/generated/web-data.json ──► Nuxt generate ──► .output/public                  │
        │   (/, /sedes, /sedes/<slug>, /disciplinas/*, /profes/*, /primera-clase,      │
        │    /planes, /es/*, llms.txt, sitemap.xml, JSON-LD @graph, hreflang)          │
        ▼                                                                              │
   GitHub Actions (push o dispatch target=solo-web) ─► backup ─► rsync ─► smoke ─► rollback
        ▼                                                                              │
   nginx eltemplo.org (404 real, 301/302, robots) ──► Navegador                        │
                                                        │ consent /es/ → GA4 / Pixel   │
                                                        │ first-touch utm/fbclid/ref   │
                                                        ▼                              │
            CTA "Reservá online" → app.eltemplo.org/register?branchId&utm_*&fbclid&src │
                                                        ▼                              │
   POST /api/auth/register {attribution}   POST /api/admin/members/trial {origin}      │
                     └───────────┬───────────────────────┘                             │
                                 ▼                                                     │
              signup_attributions (canal clasificado: meta/google/ia/ig/qr/...)        │
                                 │                                                     │
   ┌──────── jobs node-cron (forEachActiveTenant + módulo templo-marketing) ─────────┐ │
   │ meta-capi (*/10): deriva eventos de la DB → meta_capi_events → Graph /events    │ │
   │ meta-spend (diario): Insights act_*/insights → ad_spend_daily                   │ │
   │ search-console (semanal): JWT RS256 → searchAnalytics.query → search_console_*  │ │
   │ gbp-sync (diario, flag off|dry-run|apply): branches → locations.patch ──────────┼─┘
   └─────────────────────────────────────────────────────────────────────────────────┘
                                 ▼
   GET /api/admin/reports/attribution*  ──► Admin › Reportes › "Origen de altas"
```

### Estructura recomendada

```
el-templo-api/src/
├── modules/web-public/           # endpoint público (registrado en temploMarketingModule, prefix /api/web)
│   ├── routes.ts                 # GET /site-data
│   ├── service.ts                # arma el payload (sedes, actividades, horarios, contacto por país, marca)
│   ├── opening-hours.ts          # función pura: schedules → periodos por día (la reusa gbp-sync)
│   └── schemas.ts
├── modules/marketing/            # atribución + integraciones (módulo nuevo, nace strict)
│   ├── attribution-service.ts    # recordSignupAttribution(db, ctx, userId, input)
│   ├── channel.ts                # classifyChannel() puro (IA, meta, google, ig, qr, referido…)
│   ├── meta/{config,client,capi-builder,capi-service,spend-service}.ts
│   ├── google/{auth,search-console,gbp}.ts
│   └── report-service.ts         # embudo + costo por alumno
├── jobs/marketing-meta.ts        # CAPI */10 + gasto diario (1 archivo = 1 entrada en JOBS_ESPERADOS)
└── jobs/marketing-google.ts      # GSC semanal + GBP diario (flag)

el-templo-web/
├── scripts/fetch-web-data.mjs    # prebuild: endpoint → data/generated/web-data.json + public/llms.txt
├── scripts/verify-seo-output.mjs # post-generate: asserts sobre HTML/JSON-LD/sitemap/robots
├── data/web-data.fixture.json    # fixture commiteado SOLO para CI sin API
├── data/sedes.ts                 # adapter tipado sobre web-data.json (reemplaza el hardcode)
├── utils/schema-graph.ts         # builder puro del @graph JSON-LD
├── composables/useHreflang.ts    # pares equivalentes AR↔ES
├── composables/useConsent.ts     # estado de consentimiento (/es/)
├── composables/useAttribution.ts # captura first-touch + decora CTAs
├── pages/sedes/{index,[slug]}.vue, pages/disciplinas/[slug].vue, pages/profes/{index,[slug]}.vue,
│   pages/primera-clase-gratis.vue, pages/planes.vue, pages/es/{index,barcelona,...}.vue
└── components/ConsentBanner.vue  # solo en /es/
```

### Patrón 1: Endpoint público de marketing (tenant 1, sin JWT)
**Qué:** una ruta dentro de `temploMarketingModule`, que así hereda `requireModule('templo-marketing')`. La consulta usa `tenantWhere(tabla, { tenantId: DEFAULT_PUBLIC_TENANT_ID })`. Con eso pasa el lint de tenancy y el sentinel sin exenciones.
**Respuesta:** `{ generatedAt, brand:{name}, countries:{AR:{salesWhatsapp}, ES:{...}}, sedes:[{slug, code, publicName, kind:'gym'|'community_space', address:{street, locality, region, postalCode, country}, geo:{lat,lng}|null, placeId, mapsUrl, phone, photo, timezone, activities:[{name, slug, isSpecial}], openingHours:[{dayOfWeek, opens, closes}], schedule:[{dayOfWeek, startTime, endTime, activity}]}] }`.
**Sin PII:** no se exponen coaches (los profes se manejan como contenido editorial, ver Open Q2).
**Caché:** header `Cache-Control: public, max-age=300` y `config.rateLimit` (p. ej. 60/min). Sin caché en memoria: el consumo es solo en el build.

```ts
// Fuente: patrón existente modules-boot.ts + shared/tenant.ts
// modules-boot.ts → temploMarketingModule.routes.push({ plugin: webPublicRoutes, prefix: "/api/web" })
fastify.get("/site-data", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (_req, reply) => {
  const ctx: TenantContext = { tenantId: DEFAULT_PUBLIC_TENANT_ID };
  const data = await service.getSiteData(ctx);
  reply.header("Cache-Control", "public, max-age=300");
  return data;
});
```

### Patrón 2: Datos en build con modo estricto
**Qué:** `package.json` → `"generate": "node scripts/fetch-web-data.mjs && nuxt generate"`. El script:
- con `NUXT_PUBLIC_API_URL` presente y `WEB_DATA_STRICT=1` (deploy), hace fetch y **falla con exit 1** ante error o payload inválido (sin sedes, sin JBJ, etc.);
- sin strict (CI `web-check`, dev local), cae a `data/web-data.fixture.json` con un warning.

Escribe `data/generated/web-data.json` (gitignored) y `public/llms.txt` (sacar de git, generado). `nuxt.config.ts` lee el JSON para armar `nitro.prerender.routes` (`/sedes/<slug>` de cada sede publicada, `/es/...`, tags de blog si existen).
**Por qué no `useAsyncData` por página:** un solo fetch, determinista, testeable, y la lista de rutas a prerenderizar se conoce antes del build.

### Patrón 3: Grafo JSON-LD propio
**Qué:** `utils/schema-graph.ts` exporta funciones puras `organizationNode(brand)`, `gymNode(sede, orgId)` y `communitySpaceNode(sede)`. Se inyectan con `useHead({ script: [{ type: 'application/ld+json', key: 'graph', innerHTML: safeJson(graph) }] })`.
- En `nuxt.config.ts`: sacar `schemaOrg.identity` y poner `schemaOrg.defaults: false`. Así el módulo deja de crear WebSite/WebPage/identity y solo emite `defineArticle` en el blog; el `publisher` de ese artículo debe referenciar `{ '@id': 'https://eltemplo.org/#organization' }`.
- `@id` fijos: `https://eltemplo.org/#organization`, `https://eltemplo.org/sedes/<slug>#gym`.
- `geo` solo cuando `placeId` no es null, es decir cuando la coordenada vino de la ficha real. Las aproximadas no se publican en el schema, pero sí sirven para el mapa Leaflet.
- Park: `@type: "Place"` (o `SportsActivityLocation` sin `parentOrganization`) con `containedInPlace` Parque Primavesi y descripción "espacio de comunidad". Nunca `ExerciseGym`.

```ts
// Fuente: developers.google.com/search/docs/appearance/structured-data/local-business (ver research SEO)
const ORG_ID = "https://eltemplo.org/#organization";
export function gymNode(s: WebSede): Record<string, unknown> {
  return {
    "@type": "ExerciseGym",
    "@id": `https://eltemplo.org/sedes/${s.slug}#gym`,
    name: `${BRAND} — ${s.publicName}`,
    url: `https://eltemplo.org/sedes/${s.slug}`,
    parentOrganization: { "@id": ORG_ID },
    telephone: s.phone ?? undefined,
    address: { "@type": "PostalAddress", streetAddress: s.address.street, addressLocality: s.address.locality,
               addressRegion: s.address.region ?? undefined, postalCode: s.address.postalCode ?? undefined,
               addressCountry: s.address.country },
    ...(s.placeId && s.geo ? { geo: { "@type": "GeoCoordinates", latitude: s.geo.lat, longitude: s.geo.lng },
                               hasMap: s.mapsUrl } : {}),
    openingHoursSpecification: s.openingHours.map((h) => ({
      "@type": "OpeningHoursSpecification", dayOfWeek: `https://schema.org/${DAY[h.dayOfWeek]}`,
      opens: h.opens, closes: h.closes })),
  };
}
// XSS: los datos vienen de la DB → escapar "<" en el JSON embebido
export const safeJson = (o: unknown) => JSON.stringify(o).replace(/</g, "\\u003c");
```

### Patrón 4: Horarios publicados = unión de clases por día
**Qué:** `opening-hours.ts` agrupa `schedules` activos (`isActive=1`, `deletedFrom IS NULL`, actividad activa) por `dayOfWeek`. Fusiona intervalos solapados o contiguos, y los separa cuando el hueco es ≥ 60 min. El resultado es una o dos franjas por día (mañana y tarde).
**Una sola función** la consumen el endpoint web y el sync GBP, así web, schema y ficha de Google dicen lo mismo (NAP + horarios consistentes).
**Excluir** actividades especiales de nicho de la definición de "abierto" si Franco lo prefiere (Open Q3).

```ts
export function mergeIntervals(slots: Array<{ start: string; end: string }>, gapMin = 60) {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const sorted = slots.map((s) => [toMin(s.start), toMin(s.end)] as const).sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s - last[1] < gapMin) last[1] = Math.max(last[1], e); else out.push([s, e]);
  }
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return out.map(([s, e]) => ({ opens: fmt(s), closes: fmt(e) }));
}
```

### Patrón 5: Atribución
**Captura en el cliente (web):** `useAttribution` guarda first-touch (`utm_source/medium/campaign/content/term`, `fbclid`, `gclid`, host del `document.referrer` si es externo, `landing_path`, `ts`) en `sessionStorage`. En `/es/` solo después del consentimiento; sin consentimiento solo reenvía los params de la URL actual al hacer click, sin almacenar. Decora los links salientes a `app.eltemplo.org/register` con esos params más `src_ref=<host>` y `branchId`.
**Captura en la app web:** una función en `RegisterPage.vue` (y un boot liviano para el first-touch si se aterriza en `/login`) arma `attribution` y lo manda en el body de `register`.
**En la API:** un bloque best-effort al final del handler de `register`, calcado del bloque de referidos (`auth/routes.ts:466-503`): try/catch con `request.log.warn` y **nunca** bloquea el alta. Llama a `recordSignupAttribution(db, ctx, userId, {...input, platform, clientIp: x-real-ip, userAgent})`.
**Admin "Nuevo en Prueba":** un select "¿Cómo nos conoció?" (Instagram, Anuncio Meta, Google/Maps, Web, IA (ChatGPT, etc.), Referido, Volante/QR, Pasó por la puerta, Otro) + campaña opcional. En la ruta se extrae `origin` **antes** de pasar el body al service, y se agrega al schema (`additionalProperties:false`).
**Clasificación:** `classifyChannel()` es pura, se ejecuta en el server con lo crudo guardado y se puede re-clasificar. Para IA, una lista de hosts y `utm_source`: `chatgpt.com`, `chat.openai.com`, `perplexity.ai`, `gemini.google.com`, `copilot.microsoft.com`, `claude.ai`, `you.com`, `meta.ai`, `grok.com`, `deepseek.com` (lista mantenible).

### Patrón 6: CAPI como outbox derivado (sin hooks en caminos de pago)
**Qué:** el job `marketing-meta.ts` corre `*/10 * * * *`. Por tenant con `templo-marketing` habilitado:
1. **Deriva candidatos** con SQL:
   - `CompleteRegistration` = filas de `signup_attributions` nuevas;
   - `Schedule` (o custom `TrialBooked`) = `bookings.isTrial=1` no cancelado;
   - `Purchase` = primera suscripción paga del usuario (`pricePaid>0 AND priceTypeApplied<>'zero'`, mismo criterio que `trial-funnel-service.ts:20-23`).

   Solo eventos posteriores a `capi.start_at` (setting) y dentro de la ventana de Meta (7 días web/otros, 62 días `physical_store`).
2. Los inserta en `meta_capi_events` con `event_id` determinista **UNIQUE** (`reg-<userId>`, `trial-<bookingId>`, `purchase-<subscriptionId>`). Eso da idempotencia.
3. Los envía en lotes (≤1000 por request según la doc; usar 100), marca `sent`/`failed`/`skipped_consent`/`skipped_ios` y reintenta con tope.
4. Purga `client_ip`/`user_agent` de `signup_attributions` tras el envío o a los 7 días.

**Por qué:** cero cambios en `subscriptions/service.ts`/`booking-service.ts` (que 194 reescribe), reintentos gratis, consentimiento centralizado, y cubre los cobros de caja, la renovación y cualquier otro camino de pago sin enumerarlos.
**Dedup con el Pixel:** el Pixel web dispara `PageView`/`Lead` (click CTA), que no son los mismos eventos. Si algún día el Pixel dispara `CompleteRegistration`, tiene que usar el mismo `event_id`.

### Antipatrones a evitar
- **Hooks de CAPI dentro de `assignPlan`/`reserveTrialSelfService`:** acoplamiento a archivos que 194 reescribe y un camino de pago olvidado. Usar el outbox.
- **`tenant-lint-allowlist.json` para el endpoint público:** está prohibido sumar entradas. Usar `tenantWhere` con `DEFAULT_PUBLIC_TENANT_ID`.
- **Publicar `geo` aproximado con precisión falsa en el schema:** solo con `placeId`.
- **Sumar ARS + EUR en "facturación" o en costo por alumno:** agrupar siempre por moneda.
- **Fetch de la API desde el navegador para datos de sedes:** todo va horneado en el build (payload estático).
- **Hardcodear el número de WhatsApp en la web:** viene del endpoint (`tenant_settings`).

---

## Modelo de datos propuesto (migraciones 0270+)

| Migración | Contenido | Tipo |
|-----------|-----------|------|
| `0270_branches_web_fields.sql` | `ALTER TABLE branches ADD` `web_slug VARCHAR(60) NULL`, `public_name VARCHAR(100) NULL`, `publish_on_web TINYINT(1) NOT NULL DEFAULT 0`, `web_kind ENUM('gym','community_space') NOT NULL DEFAULT 'gym'` (cuidado: el 1er arg de `mysqlEnum` = `"web_kind"`), `locality VARCHAR(100) NULL`, `region VARCHAR(100) NULL`, `postal_code VARCHAR(20) NULL`, `phone VARCHAR(30) NULL`, `latitude DECIMAL(9,6) NULL`, `longitude DECIMAL(9,6) NULL`, `place_id VARCHAR(255) NULL`, `maps_url VARCHAR(500) NULL`, `photo_url VARCHAR(500) NULL`, `gbp_location_id VARCHAR(100) NULL`, `gbp_synced_hash CHAR(64) NULL`, `gbp_synced_at TIMESTAMP NULL`; `UNIQUE uq_branches_tenant_web_slug (tenant_id, web_slug)` (**tiene que arrancar con `tenant_id`**, test 0196 "Test 5") | schema |
| `0270` (mismo archivo, `--> statement-breakpoint`) o `0271_seed_branches_web.sql` | UPDATEs keyed por `code` (idempotentes, no-op en la DB de test): ALEM→slug `juan-b-justo`, `public_name` 'Juan B. Justo', `address` 'Juan B. Justo 1018' (ya en 0230); CONST→'Constitución' (con tilde, en `public_name`); JUJUY, MORENO, ALBERTI, MOGOTES ('Mario Bravo'); BCN→slug `barcelona`, `address` 'Av. Diagonal 368' (hoy 'Eixample, Av. Diagonal 368'), `locality` 'Barcelona', `country` ES; PARK→`web_kind='community_space'`, slug `parque-primavesi`; CHAPADMALAL/ONLINE→`publish_on_web=0`; lat/lng aproximados desde `expansion-maps.ts:27-35` (JBJ: **sin** coordenada hasta el link de Franco); `INSERT INTO tenant_settings ... WHERE NOT EXISTS` para `whatsapp.sales_number.AR='5492235820521'`, `.ES='34680774331'`, `web.brand_name='El Templo Calistenia'` | datos prod |
| `0272_signup_attributions.sql` | `signup_attributions` (tenant_id, user_id UNIQUE con tenant_id, channel VARCHAR(32), utm_source/medium/campaign/content/term VARCHAR(150), promo_code VARCHAR(50), ref_code VARCHAR(32), referrer_host VARCHAR(255), landing_path VARCHAR(500), fbclid VARCHAR(255), fbc VARCHAR(300), fbp VARCHAR(100), gclid VARCHAR(255), platform VARCHAR(16) ('web','android','ios','admin'), captured_via VARCHAR(16), consent_ads TINYINT(1) NULL, client_ip VARCHAR(45) NULL, user_agent VARCHAR(512) NULL, created_at) | schema |
| `0273_marketing_meta.sql` | `meta_capi_events` (tenant_id, event_id UNIQUE con tenant_id, event_name, user_id, entity_type, entity_id, action_source, event_time, status VARCHAR(20), attempts, last_error VARCHAR(500), sent_at, created_at); `ad_spend_daily` (tenant_id, platform, account_id, campaign_id, campaign_name, date, spend DECIMAL(14,2), currency CHAR(3), UNIQUE(tenant_id, platform, campaign_id, date)) | schema |
| `0274_search_console.sql` | `search_console_stats` (tenant_id, period_start, period_end, page VARCHAR(500), query VARCHAR(500) NULL, clicks, impressions, ctr DECIMAL(6,4), position DECIMAL(6,2), fetched_at; índice por (tenant_id, period_end, page)) | schema |
| `0275_sedes_maps_franco.sql` (**cuando lleguen los datos**) | lat/lng exactos (≥5 decimales), `place_id`, `maps_url`, `phone`, `postal_code`, JBJ coord | datos prod, plan de datos posterior |

**Numeración (verificado 2026-10-06 recorriendo todas las ramas locales):**
- master llega a `0258_role_coach_actividad`, con huecos;
- el tren v6.1 usa 0245-0253 (sin mergear);
- 194 usa 0255-0257 y planea `0258_fix_referral_*` (**choca** con la 0258 de master, que la tiene que renumerar) y `0259_rebrand_invitaciones_copy`.

**Recomendación: reservar el bloque 0270-0279 para 195.** El runner aplica en orden lexicográfico todo archivo que falte en `_migrations`, así que un 0259 de 194 mergeado después de que 0270 ya corrió igual se aplica, siempre que las tablas sean independientes (lo son: 195 toca `branches`/tablas nuevas; 194 toca `subscription_plans`/`invitations`). Antes de crear cada archivo, re-verificar con:
```bash
cd /home/franco/projects/et-195-seo && for b in $(git branch -a --format='%(refname:short)' | grep -v HEAD); do git ls-tree -r --name-only $b -- el-templo-api/src/db/migrations | grep -o '/0[0-9]\{3\}_' ; done | sort -u | tail
```

### Gates de tenancy (checklist exacto)
| Gate | Disparador en 195 | Qué tocar |
|------|-------------------|-----------|
| ISO-01 manifiesto | Rutas nuevas: `GET /api/web/site-data` (`templo-module`, `templo-marketing`), `GET /api/admin/reports/attribution` (+ `/campaigns`, `/search-console` si se separan) (`tenant-scoped`) | `test/tenant-manifest.ts` + `ENTRADAS_BASELINE` (hoy **447**, `iso-01-manifiesto.test.ts:316`) + título del `it` |
| ISO-03 cobertura | Solo si una ruta cae bajo los prefijos `/api/admin/analytics`, `/api/campaigns`, `/api/notifications`, `/api/admin/referrals`, `/api/members/referrals`, `/api/*/improvement-proposals`, `/api/auth`, `/api/admin/finance/`, `/api/admin/{members,users,leads}`, `/api/{admin,members}/{subscriptions,scheduling}` | **Recomendado:** reportes bajo `/api/admin/reports/attribution*` → fuera de ISO-03 (escribir igual el test de aislamiento por CLAUDE.md) |
| CON-04 jobs | `jobs/marketing-meta.ts`, `jobs/marketing-google.ts` | `JOBS_ESPERADOS` (`con-04-crons-per-tenant.test.ts:289-299`) + comentarios "N jobs"; el cuerpo envuelto en `forEachActiveTenant`, salteando tenants sin `templo-marketing` |
| CON-06 lint | Todo acceso a tablas gym-owned | `tenantWhere`/`tenantValues`; nunca allowlist |
| Tabla nueva ×4 (`signup_attributions`, `meta_capi_events`, `ad_spend_daily`, `search_console_stats`) | 5 conteos | `src/db/tenant-tables.ts` `GYM_OWNED_TABLES` (+ `TENANT_STRICT_MODULES` si el módulo nace strict, recomendado `marketing`); `test/db/tenant-tables.test.ts:116,121` (hoy 99 y 103 → 103 y 107) + `MODULOS_DECLARADOS`; `test/migrations/0192-0195-tenant-columns.test.ts:170` (`gymOwnedChecked` 99→103); `test/migrations/0196-tenant-unique-contracts.test.ts:616,639` (99→103 + texto); `TABLES_TO_CLEAN` en `test/helpers.ts` si llevan FK a `users`/`bookings`/`subscriptions` (antes de las referenciadas) |
| Sentinel en tests | Queries directas de test a tablas strict | `tenantWhere(tabla, TEMPLO_CTX)` |

`grep -rn "gymOwnedChecked\|MODULOS_DECLARADOS\|GYM_OWNED_TABLES.length\|ENTRADAS_BASELINE\|JOBS_ESPERADOS" el-templo-api/test` antes de cerrar cada plan con tablas, rutas o jobs.

---

## APIs externas (verificadas)

### Meta Conversions API
- **Endpoint:** `POST https://graph.facebook.com/{API_VERSION}/{PIXEL_ID}/events` con `access_token`. La doc muestra `v25.0` [CITADO: developers.facebook.com/docs/marketing-api/conversions-api/using-the-api]; **v26.0** salió el 2026-07-29 [CITADO: developers.facebook.com/blog/post/2026/07/29/introducing-graph-api-v26-and-marketing-api-v26/]. Recomendado: constante `META_GRAPH_VERSION="v26.0"` con override por env.
- **Por evento:** `event_name`, `event_time` (unix s), `action_source`, `user_data`; `event_source_url` es requerido para `website`; para `app` se requiere `app_data` (con `extinfo`) [CITADO: .../parameters/server-event].
- **`action_source` válidos:** `email`, `website`, `app`, `phone_call`, `chat`, `physical_store`, `system_generated`, `business_messaging`, `other` [CITADO]. Mapeo recomendado [ASUMIDO, validar con `test_event_code`]:
  - registro en `app.eltemplo.org` web → `website` (con `event_source_url`, `client_user_agent`, `client_ip_address`);
  - registro nativo Android, o lead creado por admin → `system_generated` u `other` (evitar `app` por el `extinfo`);
  - pago en caja → `physical_store` (ventana de 62 días).
- **Ventanas:** `event_time` hasta 7 días atrás; `physical_store` hasta 62 días. Un evento fuera de ventana **rechaza el request entero**. Máximo 1000 eventos por request, y un evento inválido rechaza el lote [CITADO]. → Filtrar por ventana antes de enviar y usar lotes chicos.
- **Hash SHA-256 (hex):** `em`, `ph`, `fn`, `ln`, `ct`, `country`, `external_id` (recomendado). Normalización: minúsculas + trim; teléfono solo dígitos, sin ceros iniciales, con código de país; país ISO-2 en minúscula [CITADO: .../customer-information-parameters]. **No** hashear `client_ip_address`, `client_user_agent`, `fbc`, `fbp`. Formato `fbc`: `fb.1.<creation_time_ms>.<fbclid>` [CITADO].
- **Teléfono AR** [ASUMIDO]: E.164 móvil = `549` + 10 dígitos (área sin 0, sin 15). Reusar `normalizePhone` (últimos 10 dígitos, `shared`) y prefijar `549`; ES = `34` + 9 dígitos.
- **`event_id`** "optional but recommended", y deduplica junto con `event_name` [CITADO].
- **`test_event_code`:** los eventos de test **no se descartan** y "flow into Events Manager and are used for targeting" [CITADO] → **staging NO debe tener token de CAPI** (staging corre con una copia de datos reales de prod).
- **Token:** desde Events Manager › Settings › "Generate access token" (crea app + system user; sin App Review ni permisos) o desde un system user propio con el pixel asignado [CITADO: .../conversions-api/get-started].

### Meta Marketing API — Insights (gasto)
- `GET https://graph.facebook.com/v26.0/act_<AD_ACCOUNT_ID>/insights?level=campaign&time_increment=1&time_range={"since":"YYYY-MM-DD","until":"YYYY-MM-DD"}&fields=campaign_id,campaign_name,spend,account_currency,date_start,date_stop&limit=500` + `paging.next` [CITADO: .../reference/ad-account/insights/]. Requiere `ads_read` [CITADO: .../marketing-api/insights].
- **Tokens de system user:** "do not expire" [CITADO, MEDIA: varias fuentes secundarias + doc de auth]. Standard access: 1 system user + 1 admin system user [CITADO: .../system-users/overview].
- **"Misma credencial que CAPI" (D-20)** [ASUMIDO, MEDIA]: un solo token de system user con el **dataset/pixel** y la **cuenta publicitaria** asignados y scope `ads_read` sirve para las dos cosas. El token que genera Events Manager **puede no** tener acceso a la cuenta publicitaria. La guía tiene que pedir el token del system user propio. Validarlo con un `GET /me/adaccounts` antes de activar.
- **Job diario:** re-traer los últimos 7 días con upsert, porque Meta re-ajusta el gasto. Varias cuentas: `META_AD_ACCOUNT_IDS=act_1,act_2` (AR en ARS o USD, BCN en EUR). **Nunca convertir monedas.**

### Google Search Console API
- `POST https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query`. `siteUrl` de propiedad de dominio = `sc-domain:eltemplo.org` (URL-encoded). Scope `https://www.googleapis.com/auth/webmasters.readonly`. Body: `startDate`/`endDate` (hora del Pacífico), `dimensions` (`date`, `page`, `query`, …), `dimensionFilterGroups` (`contains`, `includingRegex`…), `rowLimit` hasta 25.000, `startRow`, `dataState` (`final`/`all`). Respuesta: `rows[{keys, clicks, impressions, ctr, position}]`, `metadata.first_incomplete_date` [CITADO: developers.google.com/webmaster-tools/v1/searchanalytics/query].
- **Auth con service account:** se agrega el `client_email` de la service account como usuario de la propiedad (Settings › Users and permissions; "Restricted" alcanza para lectura) [CITADO, MEDIA: support.google.com/webmasters/answer/2453966 + guías].
- **JWT sin librería** [CITADO: developers.google.com/identity/protocols/oauth2/service-account]: header `{"alg":"RS256","typ":"JWT","kid":...}`, claims `{iss, scope, aud:"https://oauth2.googleapis.com/token", iat, exp<=iat+3600}`, firma RS256 y `POST https://oauth2.googleapis.com/token` con `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=...` → `access_token`, `expires_in`.

### Google Business Profile API
- **Acceso:** formulario de solicitud; requiere un perfil **verificado y activo hace 60+ días**, un sitio web que represente al negocio, un email owner/manager y un proyecto GCP. Sin aprobar la cuota es **0 QPM**; aprobado, 300 QPM [CITADO: developers.google.com/my-business/content/prereqs].
- **APIs a habilitar:** Google My Business API, Account Management, Lodging, Place Actions, Notifications, Verifications, Business Information [CITADO: .../basic-setup].
- **Auth:** OAuth 2.0 client + consentimiento de un usuario owner/manager con scope `https://www.googleapis.com/auth/business.manage`. La doc **no** menciona service accounts [CITADO]. Se usa un refresh token guardado y `grant_type=refresh_token` contra `oauth2.googleapis.com/token`. **Trampa:** con la pantalla de consentimiento en "Testing" el refresh token **vence a los 7 días**; hay que pasarla a "In production" y re-consentir [CITADO, MEDIA: varias fuentes coinciden].
- **Update:** `PATCH https://mybusinessbusinessinformation.googleapis.com/v1/locations/{id}?updateMask=regularHours,phoneNumbers,storefrontAddress,websiteUri&validateOnly=true|false`; `regularHours.periods[{openDay, openTime{hours,minutes}, closeDay, closeTime}]`. Las ediciones pueden quedar en revisión antes de aplicarse [CITADO: .../businessinformation/rest/v1/locations/patch].
- **Diseño:** env `GBP_SYNC_MODE=off|dry-run|apply` (default `off`). `dry-run` usa `validateOnly=true`. Solo se hace PATCH si cambió el hash de `(horarios, teléfono, dirección, web)` respecto de `branches.gbp_synced_hash`, porque editar seguido arriesga revisiones y suspensión [ASUMIDO]. Un script local `scripts/gbp-authorize.ts` (loopback) obtiene el refresh token y otro `scripts/gbp-list-locations.ts` mapea `locations/<id>` → `branches.gbp_location_id` (va por migración de datos).

### Consentimiento (D-22)
- **Google Consent Mode v2:** `gtag('consent','default',{ad_storage:'denied', ad_user_data:'denied', ad_personalization:'denied', analytics_storage:'denied'})` **antes** del `config`; al aceptar, `gtag('consent','update',{...:'granted'})`; soporta `wait_for_update` y `region`. Si se llama fuera de orden, "consent defaults won't work" [CITADO: developers.google.com/tag-platform/security/guides/consent].
- **Meta Pixel:** `fbq('consent','revoke')` **antes** de `init`, `fbq('consent','grant')` al aceptar [CITADO: developers.facebook.com/docs/meta-pixel/implementation/gdpr].
- **Recomendado para `/es/`: modo "básico".** No se inyecta ni `gtag.js` ni `fbevents.js` hasta la aceptación; al aceptar se cargan con default `denied` → `update granted`, y con Pixel `revoke` → `init` → `grant`. Así se cumple literalmente "no se disparan sin aceptación".
- **Navegación SPA de `/` a `/es/`** con scripts ya cargados (visitante AR que entra a `/es/`): si no hay decisión guardada, mandar `consent update denied` + `fbq('consent','revoke')`.
- **Argentina sin cambios** (carga normal).

### Deep links, Smart Banner
- **AASA:** `https://<dominio>/.well-known/apple-app-site-association`, HTTPS, `application/json`, sin extensión, sin redirects; Apple lo cachea en su CDN [CITADO: developer.apple.com/documentation/xcode/supporting-associated-domains].
- **assetlinks:** `/.well-known/assetlinks.json`, `application/json`, HTTPS, sin redirects; con Play App Signing va el fingerprint de Play Console › App signing, **no** el del keystore local [CITADO: developer.android.com/training/app-links/configure-assetlinks].
- **Smart App Banner:** `<meta name="apple-itunes-app" content="app-id=6761773726">`, solo Safari iOS [CITADO: developer.apple.com/documentation/webkit/promoting-apps-with-smart-app-banners]. En Android no hay banner nativo; la sección de descarga existente alcanza.
- **El dominio de los deep links es `app.eltemplo.org`** (`AndroidManifest.xml`, AASA, `deep-links.ts:14-18`), **no** `eltemplo.org`. D-14 se resuelve sirviendo bien esos archivos en `app.eltemplo.org`, completando fingerprints y re-habilitando el entitlement iOS (portal de Apple, guía).

### hreflang y noindex
- **hreflang:** cada versión se lista a sí misma y a las otras; sin el link de vuelta, "the tags will be ignored". `x-default` como fallback; el código es idioma[-región] (`es-AR`, `es-ES`) [CITADO: developers.google.com/search/docs/specialty/international/localized-versions].
- **noindex vs Disallow:** "For the noindex rule to be effective, the page or resource **must not** be blocked by a robots.txt file" [CITADO: developers.google.com/search/docs/crawling-indexing/block-indexing] → ver Pitfall 6.

### Apple ATT (riesgo para D-19)
- Apple define tracking como vincular datos de la app con datos de otras empresas "for targeted advertising or advertising measurement", y lista como ejemplo "Sharing a list of emails ... with a third-party advertising network that uses that information to retarget ... or to find similar users" [CITADO: developer.apple.com/app-store/user-privacy-and-data-use/]. Enviar a Meta por CAPI el email o teléfono hasheado de alguien que se registró **en la app iOS** encaja en esa definición → requeriría el prompt ATT y una ficha de privacidad actualizada. Ver Pitfall 10 y Open Q1.

---

## No hacerlo a mano

| Problema | No construir | Usar | Por qué |
|----------|--------------|------|---------|
| Firma RS256 / SHA-256 | Implementación propia de RSA/SHA | `crypto.createSign('RSA-SHA256')`, `crypto.createHash('sha256')` | Primitivas nativas auditadas |
| Pedir la reseña al usuario | Modal propio "calificanos" con link a la tienda | API nativa de review (plugin) | iOS y Android limitan y moderan; el modal propio no cuenta como review in-app |
| Cola de reintentos de CAPI | Reintentos en memoria/`setTimeout` | Tabla outbox + cron | Sobrevive reinicios de pm2 y es idempotente por `event_id` UNIQUE |
| Detección del primer pago | Enumerar los caminos de cobro | Criterio SQL ya usado en `trial-funnel-service.ts` | Hay muchos caminos (caja, renovación, cambio de plan) |
| Parseo del Place ID | Regex sobre links de Maps | Place ID Finder oficial (manual, guía) [CITADO: developers.google.com/maps/documentation/javascript/examples/places-placeid-finder] | Los links de Maps traen el FID/CID, no el `ChIJ...` |
| Banner RGPD | CMP externa | Banner propio + Consent Mode v2 | D-22, regla no-CDN |
| 404 y redirects | Páginas `meta-refresh` / `routeRules` del preset static | nginx `error_page` / `return 301/302` | El preset static no puede emitir status codes |

**Idea clave:** casi todo lo "difícil" (auth de Google, CAPI, insights) son 1-2 requests HTTP documentados. El costo real está en el orden de rollout, el consentimiento y la idempotencia, no en el cliente HTTP.

---

## Inventario de estado en runtime (lo que el repo no arregla)

| Categoría | Encontrado | Acción |
|-----------|------------|--------|
| Datos guardados | `branches` en prod: dirección JBJ ya corregida (0230), pero sin slug/geo/publicación; BCN con `address='Eixample, Av. Diagonal 368'`; `tenant_settings` sin números de ventas (la app usa el hardcode) | Migración de datos 0270/0271 (P01) |
| Config de servicios externos | GBP (fichas: dirección vieja de Alem, horarios), Superprof, Foursquare, IG bio (beacons.ai), Wellhub, directorios MdP | Guía (bloque C, P14); el sync GBP cubre lo suyo cuando se apruebe la API |
| Config live del servidor | vhosts nginx en `/etc/nginx/sites-available/*` con líneas de certbot que **no** están en el repo | P08: leer el live (`sudo nginx -T`) antes de editar; human gate |
| Cachés de terceros | Google indexó URLs soft-404 y las páginas de web-staging/app/admin; Apple CDN cachea el AASA | Search Console "Removals" + noindex (guía); el AASA tarda en refrescar |
| Secrets/env | Ninguno existe todavía: `WEB_GA4_ID`, `WEB_META_PIXEL_ID`, `META_*`, `GOOGLE_SC_*`, `GBP_*` | P07 los cablea (no-op si están vacíos); Franco los carga (P14) |
| Builds instalados | Apps nativas 1.8.x sin entitlement iOS; `assetlinks.json` con TODO | P13 + build de tiendas (fuera del deploy web) |

---

## Errores comunes (Pitfalls)

### Pitfall 1: Deadlock de rollout API→web
**Qué pasa:** en un mismo push con API (endpoint nuevo + migración) y web, `build-web` corre **antes** del job `deploy` (`deploy.yml:273`). El fetch estricto pega contra la API vieja → 404 → falla el build web → el job `deploy` no corre (exige todos los builds success/skipped) → **tampoco se deploya la API**.
**Cómo evitarlo:** rollout en dos pasos. (1) Push del commit que contiene solo API+migración (P01-P02), ya sea `git push origin <sha>:staging` o un push que no toque `el-templo-web/**`. (2) Push del resto, o botón "solo web". Documentarlo en el checklist de rollout de P07. Alternativa descartada: fallback al fixture en deploy, porque publica datos viejos sin avisar.
**Señal de alarma:** `Build Web` rojo con un error de fetch en un push que también toca la API.

### Pitfall 2: El 404 real expone rutas no prerenderizadas
**Qué pasa:** hoy `try_files ... /index.html` sirve el shell de la SPA para cualquier ruta y la navegación client-side lo tapa. Con `=404` + `error_page`, un post de blog publicado después del último build, o una página dinámica no descubierta por el crawler, da **404 duro** (el `404.html` de Nuxt es un shell SPA servido con status 404).
**Cómo evitarlo:** la verificación post-build lista todas las rutas esperadas (sedes publicadas, `/es/*`, posts del API) y falla si falta alguna. El blog se publica con "solo web" (D-17). Aplicar el cambio de nginx **después** de que la web nueva esté en prod.
**Señal de alarma:** `curl -I https://eltemplo.org/blog/<slug-nuevo>` → 404.

### Pitfall 3: Herencia de `add_header` en nginx
**Qué pasa:** un `location` con su propio `add_header` (el de assets, `eltemplo.org:51-54`) **no hereda** los `add_header` del `server`. Hoy los assets ya pierden HSTS y los security headers. Un `X-Robots-Tag` de nivel server no aplica a imágenes y JS.
**Cómo evitarlo:** para noindex alcanza con el HTML, pero conviene repetir los headers en las locations que definan los suyos. Verificar con `curl -I` sobre un HTML y sobre un asset.

### Pitfall 4: El repo no refleja el nginx live
**Qué pasa:** los vhosts del repo no tienen las líneas `ssl_certificate` que agregó certbot. Copiar el archivo del repo encima del live **rompe TLS**.
**Cómo evitarlo:** el plan P08 entrega un **diff aplicable** más un runbook, no un "copiá el archivo". Primero `sudo nginx -T > /tmp/nginx-live.txt` (lectura, también gate SSH), después editar el bloque 443 a mano, `sudo nginx -t`, `sudo systemctl reload nginx`, y curls de verificación.

### Pitfall 5: Staging comparte host y datos
**Qué pasa:** el API de staging (puerto 4001) corre los **mismos crons** con `.env` de staging contra `eltemplo_staging`, que es un clon con usuarios reales. Si staging tiene el token de CAPI, manda conversiones reales a Meta. Con `test_event_code` también se usan para targeting (doc citada).
**Cómo evitarlo:** **no** cargar secrets `STAGING_META_*` ni `STAGING_GBP_*`. Para GSC en staging da igual (solo lectura), pero no es necesario. El config devuelve `null` → job no-op con un `log.info` al arrancar (patrón `startWellhubSyncJob`).

### Pitfall 6: noindex + Disallow juntos
**Qué pasa:** con `Disallow: /`, Google no rastrea, no ve el `X-Robots-Tag: noindex`, y las URLs ya indexadas pueden seguir apareciendo (doc citada).
**Cómo evitarlo (sin re-litigar D-09):** secuenciar. Primero el header noindex y robots **permitiendo** el rastreo; cuando Search Console muestre las URLs fuera del índice (o tras usar "Removals"), recién ahí `Disallow`. El plan P08 entrega los dos estados y la guía dice cuándo pasar del primero al segundo. Si Franco prefiere aplicar todo junto, que quede anotado como riesgo aceptado.

### Pitfall 7: Fixture de CI vs datos reales
**Qué pasa:** CI `web-check` no tiene API (`NUXT_PUBLIC_API_URL` default localhost). Sin fixture, el build de CI falla o genera una web vacía.
**Cómo evitarlo:** `data/web-data.fixture.json` commiteado con la **forma** real (2-3 sedes de ejemplo) usado solo sin `WEB_DATA_STRICT`. Los asserts de "JBJ 1018 presente" corren en deploy (strict) o con la API local, no contra el fixture.

### Pitfall 8: Prerender silencioso
**Qué pasa:** `nitro.prerender.failOnError: false` (`nuxt.config.ts:56`) y el `catch {}` del sitemap esconden errores. Una página de sede rota se publica sin avisar.
**Cómo evitarlo:** `scripts/verify-seo-output.mjs` después del generate (en CI y en deploy). En el sitemap, `catch (err: unknown)` + log + throw en modo strict.

### Pitfall 9: `/privacidad` contradice CAPI
**Qué pasa:** `pages/privacidad.vue:73` dice "No vendemos ni compartimos tus datos con terceros". CAPI comparte identificadores hasheados con Meta.
**Cómo evitarlo:** reescribir la sección (mención explícita a Meta/Google, finalidad de medición de anuncios, base legal, opt-out). El texto lo aprueba Franco (gate de contenido). Agregar el aviso de cookies/consentimiento de `/es/`. **CAPI no se activa** (no se carga el token) hasta que el texto esté en prod.

### Pitfall 10: Apple ATT y fichas de privacidad
**Qué pasa:** registros hechos en la app iOS → email hasheado a Meta = "tracking" según Apple → sin el prompt ATT hay riesgo de rechazo o sanción en App Review. Las fichas "Privacy Nutrition Label" (App Store) y "Data safety" (Play) tienen que reflejarlo.
**Cómo evitarlo (recomendado):** guardar `platform` en `signup_attributions`; el job CAPI **saltea** `platform='ios'` (status `skipped_ios`) hasta que Franco decida (Open Q1). Android, web y admin siguen. Si después se hace ATT, es un plugin nuevo (otro human gate).

### Pitfall 11: IP del cliente detrás de nginx
**Qué pasa:** `src/app.ts` no configura `trustProxy` → `request.ip` = `127.0.0.1`. (Efecto lateral existente: el rate-limit de `forgot-password` es global y no por IP.)
**Cómo evitarlo:** para CAPI leer `request.headers['x-real-ip']` (lo setea `api.eltemplo.org:21`), validarlo con `net.isIP`, y guardarlo solo hasta el envío. Cambiar `trustProxy` está fuera de alcance; anotarlo como hallazgo.

### Pitfall 12: `additionalProperties:false` borra campos nuevos
**Qué pasa:** `createTrialMemberSchema` (`members/schemas.ts:337`) tiene `additionalProperties:false` y AJV de Fastify remueve los campos no declarados → el `origin` desaparece sin error. Además el handler hace spread de `request.body` hacia el service.
**Cómo evitarlo:** declarar `origin`/`campaign` en el schema con `maxLength` y extraerlos antes del spread. Test de integración que verifique la fila en `signup_attributions`.

### Pitfall 13: Monedas y husos
**Qué pasa:** `subscriptions.currency` (ARS/EUR) y la moneda de la cuenta publicitaria (puede ser USD). Sumar sin agrupar da números falsos. Los días de Insights están en el huso de la cuenta.
**Cómo evitarlo:** agrupar siempre por moneda; mostrar el costo por alumno solo cuando la moneda del gasto y la del cobro coinciden, o mostrar las dos por separado.

### Pitfall 14: `RegisterPage` dice "Park" para cualquier sede
**Qué pasa:** `RegisterPage.vue:234`: si el CTA web pasa `branchId`, el encabezado dice "Registrarse en Park".
**Cómo evitarlo:** arreglarlo en P09 (encabezado genérico o con el nombre de la sede).

### Pitfall 15: `.well-known` no llega al dist de la app
**Qué pasa:** live, `app.eltemplo.org/.well-known/assetlinks.json` responde `text/html`. Si el archivo estuviera en `dist/spa`, nginx lo serviría (tiene extensión `.json`). Que devuelva HTML indica que **el build de Quasar/Vite no lo copia** o que el deploy lo pierde [ASUMIDO: hay que diagnosticarlo].
**Cómo evitarlo:** en P13, `quasar build` + `ls -la dist/spa/.well-known`. Si no está, agregar un paso de copia explícito (hook de build o paso del workflow) y además la `location` de nginx con `default_type application/json` (el AASA no tiene extensión).

### Pitfall 16: Merge con 194 y v6.1
**Qué pasa:** conflictos en `ENTRADAS_BASELINE`, conteos de tablas, `JOBS_ESPERADOS`, `auth/routes.ts`, `members/routes.ts`, `deploy*.yml`.
**Cómo evitarlo:** ganchos mínimos; el "solo web" centralizado en `detect-changes`; anotar en cada SUMMARY los números de baseline usados, para que la integración los recalcule (sumar deltas, no copiar números).

---

## Ejemplos de código

### JWT RS256 para service account (Search Console) con `node:crypto`
```ts
// Fuente: developers.google.com/identity/protocols/oauth2/service-account (flujo HTTP/REST)
import { createSign } from "node:crypto";

interface ServiceAccount { client_email: string; private_key: string; private_key_id?: string }
const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

export async function googleAccessToken(sa: ServiceAccount, scope: string): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", ...(sa.private_key_id ? { kid: sa.private_key_id } : {}) }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600 }));
  const signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(sa.private_key).toString("base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claims}.${signature}` }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Google token ${res.status}`);
  const body = (await res.json()) as { access_token?: unknown };
  if (typeof body.access_token !== "string") throw new Error("Google token sin access_token");
  return body.access_token;
}
// Test sin red: generateKeyPairSync("rsa",{modulusLength:2048}) → firmar → verificar con createVerify + publicKey.
```
Para GBP es igual pero con `grant_type=refresh_token&refresh_token=...&client_id=...&client_secret=...`.

### Evento CAPI (builder puro + hashing)
```ts
// Fuente: developers.facebook.com/docs/marketing-api/conversions-api/parameters/* (citadas arriba)
import { createHash } from "node:crypto";
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export function buildPurchaseEvent(p: { subscriptionId: number; userId: number; tenantId: number; createdAt: Date;
  email: string | null; phone10: string | null; country: "AR" | "ES"; value: number; currency: string; fbc: string | null }) {
  const ph = p.phone10 ? (p.country === "AR" ? `549${p.phone10}` : `34${p.phone10.slice(-9)}`) : null;
  return {
    event_name: "Purchase",
    event_time: Math.floor(p.createdAt.getTime() / 1000),
    event_id: `purchase-${p.subscriptionId}`,
    action_source: "physical_store",
    user_data: {
      ...(p.email ? { em: [sha256(p.email.trim().toLowerCase())] } : {}),
      ...(ph ? { ph: [sha256(ph)] } : {}),
      external_id: [sha256(`${p.tenantId}:${p.userId}`)],
      country: [sha256(p.country.toLowerCase())],
      ...(p.fbc ? { fbc: p.fbc } : {}),
    },
    custom_data: { value: p.value, currency: p.currency },
  };
}
// POST https://graph.facebook.com/${META_GRAPH_VERSION}/${META_PIXEL_ID}/events
// body: { data: [...], access_token, ...(testEventCode ? { test_event_code } : {}) }
```

### Config de integración que no rompe el arranque
```ts
// Fuente: patrón modules/wellhub/config.ts + jobs/wellhub-sync.ts:120-138
export function getMetaConfig(): MetaConfig | null {
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  const pixelId = process.env.META_PIXEL_ID;
  if (!token || !pixelId) return null;            // "" del heredoc de secrets también cae acá
  return { token, pixelId, adAccountIds: (process.env.META_AD_ACCOUNT_IDS || "").split(",").map((s) => s.trim()).filter(Boolean),
           graphVersion: process.env.META_GRAPH_VERSION || "v26.0", testEventCode: process.env.META_CAPI_TEST_EVENT_CODE || null };
}
export function startMarketingMetaJob(db: Db): void {
  if (!getMetaConfig()) { log.info("Meta sin configurar — CAPI y gasto apagados"); return; }
  cron.schedule("*/10 * * * *", async () => { try { await runCapiSweep(db); } catch (err) { log.error({ err }, "CAPI sweep falló"); } });
  cron.schedule("15 6 * * *", async () => { try { await runSpendSync(db); } catch (err) { log.error({ err }, "Gasto Meta falló"); } });
}
// Dentro: forEachActiveTenant(db, log, "marketing-meta", async (ctx) => { if (!(await isModuleEnabled(ctx.tenantId, "templo-marketing", db))) return; ... })
```

### "Solo web" centralizado en `detect-changes`
```yaml
# Fuente: sintaxis de GitHub Actions workflow_dispatch inputs (docs.github.com) [ASUMIDO: verificar con un dispatch en staging]
on:
  push: { branches: [master, main] }
  workflow_dispatch:
    inputs:
      target:
        description: "Qué deployar"
        type: choice
        options: [todo, solo-web]
        default: todo
jobs:
  detect-changes:
    outputs:
      api: ${{ steps.resolve.outputs.api }}
      web: ${{ steps.resolve.outputs.web }}   # ídem app/admin (y kaia cuando llegue v6.1)
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: filter
        if: github.event_name == 'push'
        with: { filters: "..." }               # el mismo bloque de hoy
      - id: resolve
        run: |
          if [ "${{ github.event_name }}" = "workflow_dispatch" ]; then
            if [ "${{ inputs.target }}" = "solo-web" ]; then
              echo "api=false" >> $GITHUB_OUTPUT; echo "app=false" >> $GITHUB_OUTPUT
              echo "admin=false" >> $GITHUB_OUTPUT; echo "web=true" >> $GITHUB_OUTPUT
            else
              for k in api app admin web; do echo "$k=true" >> $GITHUB_OUTPUT; done
            fi
          else
            echo "api=${{ steps.filter.outputs.api }}" >> $GITHUB_OUTPUT   # ídem app/admin/web
          fi
  build-web:
    if: needs.detect-changes.outputs.web == 'true'   # se saca el "workflow_dispatch ||"
# Backup y rollback: condicionar cada directorio a needs.build-X.result == 'success' (hoy copian/restauran los 4 siempre).
# El rollback solo hace pnpm install + pm2 restart si la API se deployó.
```

### nginx (fragmentos para P08)
```nginx
# eltemplo.org — bloque 443 (editar el LIVE, conservar las líneas de certbot)
error_page 404 /404.html;
location = /404.html { internal; }
location = /curso-entrenadores { return 301 /academy; }
location = /qr/bcn       { return 302 https://app.eltemplo.org/register?promo=TEMPLOPASSBCN; }
location = /qr/aura-club { return 302 https://app.eltemplo.org/register?promo=AURACLUB1; }
location / { try_files $uri $uri/index.html $uri.html =404; }

# web-staging / app / admin (y sus -staging) — bloque 443
add_header X-Robots-Tag "noindex, nofollow" always;
# Etapa 2 (después de desindexar, ver Pitfall 6):
location = /robots.txt { default_type text/plain; return 200 "User-agent: *\nDisallow: /\n"; }

# app.eltemplo.org (y app-staging) — deep links
location = /.well-known/apple-app-site-association { default_type application/json; try_files $uri =404; }
location = /.well-known/assetlinks.json            { default_type application/json; try_files $uri =404; }
```
Verificación (con gate SSH): `sudo nginx -t && sudo systemctl reload nginx`; desde local, `curl -s -o /dev/null -w "%{http_code}" https://eltemplo.org/no-existe` → 404; `curl -sI https://eltemplo.org/qr/bcn | grep -i '^location'`; `curl -sI https://app.eltemplo.org/ | grep -i x-robots`; `curl -sI https://app.eltemplo.org/.well-known/assetlinks.json | grep -i content-type` → `application/json`.

### robots.txt (D-15)
```
User-agent: OAI-SearchBot
Allow: /

User-agent: Claude-SearchBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: *
Allow: /

Sitemap: https://eltemplo.org/sitemap.xml
```

---

## Datos que necesitamos de Franco (todo con fallback no-op)

| Dato | Dónde se carga | Comportamiento si falta |
|------|----------------|-------------------------|
| Links de Google Maps por sede (→ lat/lng ≥5 decimales) + Place ID (Place ID Finder) + teléfono por sede + código postal | Migración de datos `0275_*` (plan de datos, se puede agregar después) | Schema sin `geo`/`hasMap`; teléfono = WhatsApp del país; mapa con coordenadas aproximadas |
| ID de GA4 `G-…` | Secret `WEB_GA4_ID` → `NUXT_PUBLIC_GA4_ID` (deploy.yml build-web) | Plugin no-op (ya existe el guard, `ga4.client.ts:11`) |
| ID del Pixel/dataset | Secrets `WEB_META_PIXEL_ID` (web) y `META_PIXEL_ID` (API) | Plugin no-op; CAPI apagado |
| Token del system user (dataset + cuenta publicitaria, `ads_read`) | Secret `META_CAPI_ACCESS_TOKEN` (solo prod) | Job no-op con `log.info` |
| IDs de cuentas publicitarias `act_…` | Secret `META_AD_ACCOUNT_IDS` | Gasto apagado; Reportes muestra "sin datos de gasto" |
| `test_event_code` (validación puntual) | Secret temporal `META_CAPI_TEST_EVENT_CODE` (se borra después) | — |
| Quién administra el DNS | Guía (registros TXT de Search Console/Bing) | Sin verificación → sin job GSC (403) |
| JSON de la service account de Search Console (agregada como usuario restringido de `sc-domain:eltemplo.org`) | Secret `GOOGLE_SC_SERVICE_ACCOUNT_BASE64` (mismo patrón que `FIREBASE_SERVICE_ACCOUNT_BASE64`) | Job GSC no-op |
| Aprobación de la API de Business Profile + OAuth client + refresh token de un owner | Secrets `GBP_OAUTH_CLIENT_ID`, `GBP_OAUTH_CLIENT_SECRET`, `GBP_REFRESH_TOKEN`; `GBP_SYNC_MODE` | `off` por default |
| `locations/<id>` de cada ficha | Migración de datos (`branches.gbp_location_id`), con el script de listado | Sync saltea la sede |
| WhatsApp de ventas AR/ES (si cambian) | Admin › Comunicaciones (ya existe, fase 193) o seed en 0270 | Seed con los números actuales |
| Fingerprint SHA-256 de Play App Signing (prod + staging) | `el-templo-app/public/.well-known/assetlinks.json` | App Links sin verificar (como hoy) |
| Capability Associated Domains + provisioning profile | Portal de Apple + secret `IOS_PROVISION_PROFILE_BASE64` (memoria del reminder) | Universal Links iOS siguen apagados |
| Aprobación del texto de `/privacidad` | PR de contenido | CAPI no se activa |
| Decisión sobre iOS/ATT (Open Q1) | — | Default: CAPI saltea `platform='ios'` |
| Fotos/bios de profes | `el-templo-web/data/profes.ts` | Se publican solo los profes con contenido |

---

## Agrupación de planes recomendada (14 planes, ejecución secuencial)

| # | Plan | Cubre | Depende de | Gates humanos |
|---|------|-------|------------|---------------|
| **P01** | **Datos de sedes primero:** mig 0270 (columnas web en `branches` + seed keyed por `code` + `tenant_settings` WhatsApp/marca) + schema TS + parche inmediato de la web estática (`sedes.ts` JBJ 1018, sin Chapadmalal, Park comunidad, conteos derivados, `llms.txt`, pin JBJ en `expansion-maps.ts`, `wa.me` del prefooter, logo del schema → `/favicon-192x192.png`, `twitter:site`) + test de migración | D-01, D-02, D-06, D-07, D-16 | — | — |
| P02 | Endpoint `GET /api/web/site-data` + `opening-hours.ts` + rate limit + manifiesto ISO-01 + tests (forma, solo publicadas, sin PII, horarios fusionados, tenant 2 no visible) | D-08, D-10, D-03 (datos) | P01 | — |
| P03 | Pipeline de build web: `fetch-web-data.mjs` (strict/fixture), adapter `data/sedes.ts`, `llms.txt` generado, `robots.txt` IA, sitemap sin `catch` mudo, `verify-seo-output.mjs` + paso en `ci.yml` | D-10, D-15, D-17 (sitemap) | P02 | — |
| P04 | Builder JSON-LD + hub `/sedes` + `/sedes/[slug]` + home solo con `Organization` + config de nuxt-schema-org (`defaults:false`, sin `identity`) | D-03, D-07, D-12 (sedes) | P03 | — |
| P05 | Disciplinas/niveles (incl. Aura/Yoga), profes (`Person`), "primera clase gratis" (CTA WhatsApp por país + "Reservá online" a `/register`), planes sin precios, blog (autor Ignacio `Person`, fallback de cover, UI sin tags cuando no hay, prerender de tags) | D-12, D-17 | P04 | Contenido de profes (opcional) |
| P06 | `/es/` Barcelona + `useHreflang` + `ConsentBanner` + plugins GA4/Pixel con consentimiento + `useAttribution` (first-touch + decoración de CTAs) + Smart App Banner | D-13, D-22, D-04 (cliente), D-18 (web), D-14 (banner) | P05 | — |
| P07 | CI/CD: input `target` (todo / solo-web) en los 2 workflows, backup/rollback por target, env de build web (GA4/Pixel/`WEB_DATA_STRICT`), heredoc API con las vars nuevas, `.env.example`, smoke web extendido, checklist de rollout en 2 pasos (Pitfall 1) | D-11, D-04 | P03 | Franco carga secrets después (no bloquea) |
| P08 | nginx (archivos del repo + runbook con diff del live): 404 real, 301/302, quitar `routeRules`, noindex en 2 etapas, `.well-known` con content-type | D-05, D-09, D-14 (serving) | P04-P07 | **checkpoint:human-action SSH** (lectura `nginx -T` + aplicación); se ejecuta en el rollout a prod |
| P09 | Atribución: mig `signup_attributions`, `classifyChannel` (incl. IA), bloque best-effort en `register`, `origin` en `POST /admin/members/trial` + select en `TrialMemberFormDialog`, captura en `RegisterPage` (+ fix "Park"), 5 conteos de tenancy, tests | D-18, D-21.1 | P01 | — |
| P10 | Meta: mig `meta_capi_events` + `ad_spend_daily`, config/client/builder, job `marketing-meta.ts` (outbox CAPI + gasto), filtros de consentimiento ES e iOS, `/privacidad` reescrita, CON-04 + conteos, tests con `fetch` mockeado | D-19, D-20, D-22 (server) | P09 | Aprobación del texto de privacidad; decisión ATT (Open Q1) |
| P11 | Google: mig `search_console_stats`, `google/auth.ts` (JWT RS256 + refresh token), job `marketing-google.ts` (GSC semanal + GBP diario `off`/`dry-run`/`apply`), scripts `gbp-authorize`/`gbp-list-locations`, tests | D-21.2, D-21.3 | P02 (opening-hours) | — (las credenciales llegan después) |
| P12 | Reportes "Origen de altas": `GET /api/admin/reports/attribution*` (embudo registro→prueba→pago→facturación por canal/campaña/sede/moneda, costo por alumno pago con `ad_spend_daily`, IA, panel GSC) + tab en `ReportesPage.vue` + tests de aislamiento | D-18, D-20, D-21.1, D-21.2 | P09-P11 | — |
| P13 | App: `assetlinks`/AASA (fingerprints), diagnóstico y copia de `.well-known` en el build, entitlement iOS (condicional al portal), pedido de reseña in-app + bump minor | D-14 | P08 (serving) | **checkpoint: aprobar `@capacitor-community/in-app-review`**; datos Play/Apple |
| **P14** | **Guía paso a paso** (Meta, Google, bloque C, ASO, Virtuagym, segmento GA4 de IA, planilla de 20-30 prompts como CSV) con destino exacto de cada dato (tabla de arriba) | D-23, D-21.4 | todos | — |

**Notas de agrupación:**
- P01 va primero por D-01 y ya deja la web estática correcta aunque los planes siguientes tarden.
- P08 se **escribe** en su lugar de la secuencia, pero la ejecución SSH contra `eltemplo.org` se hace después de que la web nueva esté en prod. El noindex de staging/app/admin se puede aplicar antes.
- Si hay que bajar a ~12 planes: fusionar P11 dentro de P10 (como "integraciones") y P13 con P08. No conviene fusionar P09 con P10: son las tablas con más gates.

---

## Estado del arte

| Antes | Ahora | Cuándo | Impacto |
|-------|-------|--------|---------|
| Graph API v20-v24 | v25 (2026-02-18), **v26 (2026-07-29)**; v20 se depreca el 2026-09-24 | 2026 | Fijar v26.0 con override por env |
| Consent Mode v1 | v2 con `ad_user_data`/`ad_personalization` | 2024 | Los 4 parámetros son obligatorios en el default |
| Firebase App Indexing | App Links / Universal Links + Smart App Banner | (research SEO) | Nada de Firebase |
| FAQPage con rich results | Sin rich results desde 2026-05-07 | (research SEO) | No invertir; se puede quitar de la home |

**Obsoleto en el repo:** `CookieConsent.vue` informativo (lo reemplaza el banner real de `/es/`); `routeRules` de redirects (pasan a nginx); `schemaOrg.identity` (pasa al builder propio).

---

## Registro de supuestos

| # | Supuesto | Sección | Riesgo si es falso |
|---|----------|---------|--------------------|
| A1 | Un solo token de system user con `ads_read` + dataset + cuenta publicitaria sirve para CAPI e Insights | APIs Meta | La guía pide dos tokens; dos secrets en vez de uno |
| A2 | Mapeo de `action_source` (web→`website`, admin/nativo→`system_generated`, caja→`physical_store`) es aceptado para optimizar | APIs Meta | Eventos rechazados o no usables para optimizar; validar con `test_event_code` |
| A3 | Teléfono AR para CAPI = `549` + 10 dígitos | Ejemplos | Menor tasa de match |
| A4 | Scripts de GA4/Pixel desde dominios de Google/Meta son una excepción aceptada a "no CDN" | Restricciones | Habría que self-hostear (no viable para gtag) |
| A5 | `@nuxtjs/sitemap` 7.6 incluye las rutas prerenderizadas (`/sedes/*`, `/es/*`) automáticamente | Patrón 2 | Hay que agregar una fuente desde `web-data.json` (la verificación post-build lo detecta) |
| A6 | `.well-known` no llega a `dist/spa` por el build de Quasar | Pitfall 15 | El problema estaría en nginx o en rsync; el diagnóstico de P13 lo resuelve |
| A7 | GBP: editar solo ante cambios evita revisiones y suspensiones | APIs GBP | Bajo |
| A8 | Profes como contenido editorial estático en la web (no en DB) | Open Q2 | Si Franco los quiere editables desde el admin, hace falta tabla + 5 conteos |
| A9 | `console` es aceptable en scripts `.mjs` de build de la web | Restricciones | Cambio cosmético |
| A10 | Sintaxis de `workflow_dispatch.inputs` tipo choice y contexto `inputs` | Ejemplos | Verificar con un dispatch real en staging (`gh` no está local: lo dispara Franco desde la UI) |
| A11 | Planes sin precio como contenido estático (no desde `subscription_plans`) | P05 | El catálogo real tiene promos/especiales/trial; exponerlo exige curaduría |
| A12 | `pnpm install --frozen-lockfile` en el worktree no viola la regla de "no instalar" | Stack | Pedir OK una vez |

## Preguntas abiertas (RESOLVED)

> Todas resueltas el 2026-10-06 por las decisiones del addendum de 195-CONTEXT.md (D-24..D-30). Cada pregunta indica su resolución.

1. **CAPI y usuarios que se registran en la app iOS (ATT).**
   - Sabemos: la definición de tracking de Apple cubre compartir emails con redes publicitarias.
   - No está claro: si Franco acepta saltearlos, agregar el prompt ATT (plugin nuevo + review) o aceptar el riesgo.
   - Recomendación: default saltear `platform='ios'` y que la guía lo explique.
   - **RESUELTA → D-24:** CAPI excluye los registros desde la app iOS (y los de plataforma desconocida); siguen contando en la atribución propia (plan 195-08).
2. **Profes: ¿contenido estático o DB?**
   - Recomendación: `data/profes.ts` en la web. Se publican los que tengan contenido; Ignacio Bordón es el primero (ya hay foto en `public/images/photos/ignacio-bordon.webp`).
   - **RESUELTA → D-27:** profes = archivo de datos de la web, publicado con el botón "solo web" (plan 195-05).
3. **¿Qué cuenta como "abierto" para `openingHours`?**
   - ¿Todas las actividades, o solo calistenia y las clases regulares (sin especiales/yoga)?
   - Recomendación: todas las actividades activas no especiales, más las especiales si la sede no tiene otras clases ese día. Confirmar con Franco.
   - **RESUELTA → D-30:** horarios publicados = clases regulares activas (`activities.is_special = 0`); las especiales solo se listan como actividades (plan 195-02).
4. **Nombre público de Barcelona.**
   - "Barcelona" o "Eixample"; la web hoy dice "Eixample" y la DB "Barcelona".
   - Recomendación: `public_name` 'Barcelona (Eixample)' o lo que diga la ficha de GBP.
   - **RESUELTA → D-30:** "El Templo Calistenia — Barcelona (Eixample)" (mig 0271, plan 195-01).
5. **Consentimiento para CAPI de usuarios ES registrados en la app.**
   - Solo hay forma de capturarlo si la web pasa `consent=1` al link de registro o si se agrega un checkbox en el registro ES (requiere build de tiendas).
   - Recomendación v1: ES sin consentimiento explícito = sin CAPI.
   - **RESUELTA → D-25:** sin CAPI para España; en Barcelona solo Pixel + GA4 con consentimiento web + atribución propia (planes 195-06 y 195-08).
6. **Secuencia noindex/Disallow** (Pitfall 6): ¿Franco acepta las dos etapas?
   - **RESUELTA → D-26:** noindex en dos etapas (etapa 1 sin Disallow, etapa 2 semanas después; planes 195-13 y 195-14).
7. **Deep links a `/register`:** agregar paths al AASA/intent-filter, para que el CTA web abra la app, complica la atribución en la app nativa. Recomendación: no, mantener `/r/trial`.
   - **RESUELTA:** se mantiene `/r/trial` sin agregar `/register` a AASA/intent-filter (plan 195-12).
8. **Tags de blog vacíos:** es un problema de **dato** (los posts no tienen tags en prod). ¿Se asignan desde el admin del blog (guía) o con una migración de datos? Recomendación: guía. El código oculta la UI de tags cuando no hay.
   - **RESUELTA → D-30:** los tags los asigna el equipo desde el admin del blog (ítem de la guía de 195-14), sin migración.

---

## Disponibilidad del entorno

| Dependencia | Requerida por | Disponible | Versión | Fallback |
|-------------|---------------|-----------|---------|----------|
| Node.js | Todo | ✓ | v22.22.0 | — |
| pnpm | Todo | ✓ | 10.28.2 | — |
| MySQL local | Tests API puntuales, `db:migrate` local | ✓ | 8.0.46 | CI |
| `node_modules` en el worktree (api/app/admin/web) | Typecheck, build, tests | ✗ | — | `pnpm install --frozen-lockfile` por proyecto (A12) |
| nginx local | `nginx -t` de los vhosts | ✗ | — | `sudo nginx -t` en el server (gate SSH) |
| Docker | — | ✗ | — | — |
| `gh` CLI | Disparar `workflow_dispatch` | ✗ | — | Franco desde la UI de GitHub |
| PyYAML | Validar sintaxis de los workflows | ✓ | — | — |
| openssl | Generar claves de test | ✓ | 3.0.2 | `crypto.generateKeyPairSync` |
| curl | Verificación live (lectura pública) | ✓ | — | — |

**Bloqueantes sin fallback:** ninguno. **Con fallback:** nginx (se valida en el server), `gh` (UI).

---

## Arquitectura de validación (Nyquist)

### Framework de tests
| Propiedad | Valor |
|-----------|-------|
| API | Vitest ^4.0.18, integración contra MySQL real (`vitest.config.ts`, una DB por worker `eltemplo_test_<POOL_ID>`) |
| App | Vitest (`el-templo-app/package.json:12`), unit en `src/**/__tests__` |
| Web | Sin runner → verificación por build + `scripts/verify-seo-output.mjs` (Node puro, sin deps) |
| Comando rápido API | `cd el-templo-api && pnpm exec vitest run test/<archivo>.test.ts` (solo el archivo nuevo) |
| Suite completa | CI (`ci.yml` API Integration Tests) — no correrla local |
| Typecheck | `cd el-templo-api && npx tsc --noEmit`; `pnpm --dir el-templo-web exec nuxi typecheck`; `vue-tsc` en app y admin (CI no los chequea) |

### Requisitos → tests
| ID | Comportamiento | Tipo | Comando automatizado | ¿Existe? |
|----|----------------|------|----------------------|----------|
| D-01/D-07 | Migración deja ALEM con slug `juan-b-justo`, CHAPADMALAL/ONLINE sin publicar, PARK `community_space`, idempotente | integración | `vitest run test/migrations/0270-branches-web.test.ts` | ❌ Wave 0 |
| D-01 | La web no contiene "Alem 3958", "Chapadmalal", "8 sedes", `54223XXXXXXX` | build+grep | `node el-templo-web/scripts/verify-seo-output.mjs` | ❌ |
| D-10/D-08/D-16 | `GET /api/web/site-data` devuelve solo sedes publicadas, horarios fusionados, WhatsApp por país, sin PII ni datos de otro tenant | integración | `vitest run test/web-public/site-data.test.ts` | ❌ |
| D-08 | `mergeIntervals` (solapes, huecos ≥60, vacío) | unit | ídem (archivo `opening-hours.test.ts`) | ❌ |
| D-03 | Home: exactamente 1 nodo `@id …/#organization` y 0 `ExerciseGym`; cada `/sedes/<slug>/index.html` con `ExerciseGym`, `parentOrganization`, `openingHoursSpecification`; Park sin `ExerciseGym` | build+parse | `verify-seo-output.mjs` | ❌ |
| D-13 | Pares hreflang recíprocos y autorreferentes; `lang` `es-ES` en `/es/` | build+parse | `verify-seo-output.mjs` | ❌ |
| D-15 | `robots.txt` con los 3 bots; `llms.txt` con "Juan B. Justo 1018" (en strict) | build+grep | `verify-seo-output.mjs` | ❌ |
| D-17 | Sitemap con posts; sin `catch {}` mudo; `Person` de autor en el JSON-LD de un post | build+grep | `verify-seo-output.mjs` + `grep -n "catch {" server/api/__sitemap__/blog.ts` (0) | ❌ |
| D-22 | En `/es/` sin consentimiento no hay `<script src=…googletagmanager…>` ni `fbevents` en el HTML; banner presente | build+grep (estático) + manual en navegador | `verify-seo-output.mjs`; manual: DevTools › Network | ❌ |
| D-11 | Workflow YAML válido; `target=solo-web` solo construye web (dry: revisar el plan de jobs) | estático + manual | `python3 -c "import yaml,sys;yaml.safe_load(open(sys.argv[1]))" .github/workflows/deploy.yml`; dispatch real en staging (Franco) | — |
| D-05/D-09/D-14 | 404, redirects, X-Robots, content-type de `.well-known` | manual (post-SSH) | curls del bloque nginx | — |
| D-18 | `register` con `attribution` crea la fila; sin `attribution` el alta igual funciona; un error de atribución no bloquea; `origin` del admin persiste (no lo borra AJV); tenant 2 no ve filas de tenant 1 | integración | `vitest run test/marketing/attribution.test.ts` | ❌ |
| D-21.1 | `classifyChannel` (chatgpt.com, perplexity, gemini, copilot, claude.ai, utm meta/google, promo, ref, directo) | unit | ídem (`channel.test.ts`) | ❌ |
| D-19 | Outbox: deriva los 3 eventos, `event_id` estable, idempotente en dos corridas, saltea ES sin consentimiento e iOS, respeta la ventana de 7/62 días, normaliza y hashea (vectores conocidos), lote rechazado → `failed` con reintento, sin config → no-op | integración (fetch mockeado con `vi.stubGlobal`) | `vitest run test/marketing/meta-capi.test.ts` | ❌ |
| D-20 | Insights paginado → upsert `ad_spend_daily`; re-corrida actualiza sin duplicar | integración | `vitest run test/marketing/meta-spend.test.ts` | ❌ |
| D-21.2 | JWT firmado verificable con la clave pública; job GSC guarda filas; 403 → log sin throw | unit + integración | `vitest run test/marketing/google-search-console.test.ts` | ❌ |
| D-21.3 | GBP: `off` no llama; `dry-run` manda `validateOnly=true`; `apply` solo si cambió el hash | integración | `vitest run test/marketing/gbp-sync.test.ts` | ❌ |
| D-18/D-20 | Reporte: embudo por canal/campaña/sede/moneda; costo por alumno; aislamiento de tenant; roles | integración | `vitest run test/reports/attribution-report.test.ts` | ❌ |
| Gates | ISO-01, CON-04, conteos de tablas | integración (CI) | `vitest run test/tenancy/iso-01-manifiesto.test.ts test/tenancy/con-04-crons-per-tenant.test.ts test/db/tenant-tables.test.ts` | ✅ (se actualizan) |
| D-18 (app) | Util de captura arma `attribution` desde la query/sessionStorage | unit | `cd el-templo-app && pnpm exec vitest run src/utils/__tests__/attribution.test.ts` | ❌ |

### Frecuencia de muestreo
- **Por tarea:** typecheck del proyecto tocado + el test nuevo puntual + lint.
- **Por plan:** `pnpm --dir el-templo-web run generate && node el-templo-web/scripts/verify-seo-output.mjs` (planes web); `npx tsc --noEmit` + `pnpm lint:tenant` (planes API); `vue-tsc` (app/admin).
- **Gate de fase:** CI verde en staging (suite completa) + verificación manual post-SSH + `/gsd:verify-work`.

### Huecos de Wave 0
- [ ] `el-templo-web/scripts/verify-seo-output.mjs` + paso en `ci.yml` web-check (después de `generate`).
- [ ] `el-templo-web/data/web-data.fixture.json`.
- [ ] `el-templo-api/test/web-public/`, `test/marketing/` (carpetas nuevas) y helper de mock de `fetch` (reusable para Meta/Google).
- [ ] `el-templo-app/src/utils/__tests__/attribution.test.ts`.

---

## Dominio de seguridad

### Categorías ASVS aplicables
| Categoría | Aplica | Control estándar |
|-----------|--------|------------------|
| V2 Autenticación | Sí (credenciales de servicio) | Tokens solo en env/secrets; nunca en logs ni en Sentry (agregar scrub de `access_token`/`assertion`/`refresh_token` al `beforeSend` de `instrument.ts` si se loguean errores de request) |
| V3 Sesiones | No | — |
| V4 Control de acceso | Sí | Reportes con los mismos roles que la tab Reportes (ADMIN/owner, sedes forzadas para roles de alcance de sede); el endpoint público solo expone datos públicos y sedes con `publish_on_web=1` |
| V5 Validación de entrada | Sí | JSON schema de Fastify con `maxLength` en cada campo de `attribution`/`origin`; `net.isIP` para la IP; allowlist de `channel`; `safeJson` (escape de `<`) en el JSON-LD |
| V6 Criptografía | Sí | `node:crypto` (SHA-256 para CAPI —pseudonimización, no seguridad—; RS256 para Google). Nada hecho a mano |
| V8 Protección de datos | Sí | Minimización: IP/UA con purga ≤7 días; consentimiento ES; ATT iOS; aviso en `/privacidad` |

### Amenazas conocidas
| Patrón | STRIDE | Mitigación |
|--------|--------|------------|
| Inyección de atribución basura o enorme vía register público | Tampering/DoS | Schema con `maxLength`; best-effort; sin lógica de negocio dependiente |
| XSS en el JSON-LD con nombres de la DB | Tampering | `JSON.stringify(...).replace(/</g,'\\u003c')` |
| Fuga de tokens Meta/Google en logs | Information disclosure | No loguear URL completas con `access_token` (mandar el token en el body o redactarlo) |
| Staging enviando datos reales a Meta | Information disclosure | Sin secrets de Meta en staging (Pitfall 5) |
| Enumeración de sedes ocultas por el endpoint público | Information disclosure | Filtro `publish_on_web=1` + test |
| Abuso del endpoint público | DoS | `config.rateLimit` (con la salvedad de `trustProxy`, Pitfall 11: hoy el límite es global, no por IP) |
| Inyección en la URL de `wa.me` | Tampering | Reusar `isValidSalesNumber` (`^[0-9]{8,15}$`) |

---

## Fuentes

### Primarias (confianza ALTA)
- Código del repo (worktree `et-195-seo`): todos los archivo:línea citados; inventario de migraciones de todas las ramas locales; `curl` live a eltemplo.org, app.eltemplo.org y api.eltemplo.org (2026-10-06).
- Meta CAPI: https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api · https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event · https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters · https://developers.facebook.com/docs/marketing-api/conversions-api/get-started
- Meta Insights: https://developers.facebook.com/docs/marketing-api/insights · https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights/ · https://developers.facebook.com/docs/marketing-api/system-users/overview
- Graph API v25/v26: https://developers.facebook.com/blog/post/2026/02/18/introducing-graph-api-v25-and-marketing-api-v25 · https://developers.facebook.com/blog/post/2026/07/29/introducing-graph-api-v26-and-marketing-api-v26/
- Meta Pixel consent: https://developers.facebook.com/docs/meta-pixel/implementation/gdpr
- Search Console: https://developers.google.com/webmaster-tools/v1/searchanalytics/query
- Service account JWT: https://developers.google.com/identity/protocols/oauth2/service-account
- Business Profile: https://developers.google.com/my-business/content/prereqs · https://developers.google.com/my-business/content/basic-setup · https://developers.google.com/my-business/reference/businessinformation/rest/v1/locations/patch · https://developers.google.com/my-business/content/implement-oauth
- Consent Mode: https://developers.google.com/tag-platform/security/guides/consent
- hreflang: https://developers.google.com/search/docs/specialty/international/localized-versions
- noindex: https://developers.google.com/search/docs/crawling-indexing/block-indexing
- Apple: https://developer.apple.com/documentation/xcode/supporting-associated-domains · https://developer.apple.com/documentation/webkit/promoting-apps-with-smart-app-banners · https://developer.apple.com/app-store/user-privacy-and-data-use/
- Android: https://developer.android.com/training/app-links/configure-assetlinks
- Place ID Finder: https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder
- Tipos de `@unhead/schema-org` 2.1.9 (leídos del `node_modules` del checkout principal; mismo lockfile verificado por md5)

### Secundarias (confianza MEDIA)
- Tokens de system user sin vencimiento: https://developers.facebook.com/documentation/ads-commerce/marketing-api/get-started/authentication + guías (definite.app, optizent).
- Service account como usuario de Search Console: https://support.google.com/webmasters/answer/2453966 + guías.
- Refresh token de 7 días en modo Testing: varias fuentes (tech.sailjada.com 2026-05) coincidentes.

### Terciarias (confianza BAJA, validar)
- Mapeo de `action_source` por canal para optimización (A2).
- Comportamiento de copia de `.well-known` en el build de Quasar (A6).

## Metadata

**Desglose de confianza:**
- Mapa del código y gates de tenancy: ALTA (leído en el código, con números actuales).
- Stack sin dependencias nuevas: ALTA (fetch/crypto nativos en Node 22, verificado).
- APIs externas: ALTA para endpoints y parámetros (doc oficial); MEDIA para la combinación de tokens y `action_source`.
- Pitfalls: ALTA en rollout/nginx/AJV/trustProxy (verificados en código y live); MEDIA en ATT (definición citada, interpretación aplicada).

**Fecha:** 2026-10-06
**Vigencia:** ~30 días para el código (hay ramas paralelas activas: re-verificar la numeración y los baselines al ejecutar); ~90 días para las APIs externas (Graph API versiona cada ~6 meses).
