# Phase 195: Web SEO local + AEO + atribución - Context

**Gathered:** 2026-10-06 (5 rondas de decisiones con Franco, 2026-10-05/06)
**Status:** Ready for research/planning
**Insumo principal:** `195-RESEARCH-SEO-AEO.md` (hallazgos con archivo:línea, auditoría live, estado del arte con fuentes, decisiones textuales)

<domain>
## Phase Boundary

eltemplo.org (`el-templo-web/`, Nuxt 4 SSG servido como estático por nginx) pasa a:

- leer sedes, horarios y datos de contacto de una **fuente única** (tabla `branches` + endpoint público de solo lectura) en el build;
- publicar páginas indexables por sede, disciplina y profes, con schema correcto, y Barcelona en `/es/`;
- medir de verdad (GA4, Meta Pixel, Search Console, Bing) y **atribuir** cada alta a su origen hasta el pago (incluye tráfico de IA), con eventos de conversión a Meta por CAPI;
- automatizar del lado de Meta y Google todo lo que se pueda (gasto de Meta, Search Console, fichas de Google Business Profile);
- cerrar con una **guía final paso a paso** de lo que Franco/equipo hace a mano en Meta y Google (lo mínimo inevitable), que incluye el bloque C (sin código).

Fuera: contenido real (fotos, testimonios, hero, og:image) — se espera al equipo (A4); textos de artículos del blog; monitoreo automático de prompts por APIs de IA.
</domain>

<decisions>
## Implementation Decisions

### Organización (Franco 2026-10-06, NO re-litigar)
- **D-01** Todo en UNA fase, incluido el fix urgente de la dirección de Alem → **Juan B. Justo 1018** (no sale antes como fix suelto). Aun así, el plan del fix de datos de sedes va PRIMERO en el orden de ejecución.
- **D-02** Nombre canónico de marca: **"El Templo Calistenia"**; cada sede "El Templo Calistenia — <Sede>". Configurable en un solo lugar.

### Bloque A — fixes técnicos
- **D-03 (A1)** Schema: `Organization` raíz con `@id` fijo + `ExerciseGym` por sede con `@id` propio, `parentOrganization`, `geo` (5+ decimales), `openingHoursSpecification` desde la grilla real, teléfono por sede. Se mudan a las páginas de sede (B3); la home conserva solo el `Organization`.
- **D-04 (A2)** GA4 + Meta Pixel por secrets en CI (+ `.env.example`). Search Console + Bing Webmaster verificados por DNS (Franco dice quién administra el DNS).
- **D-05 (A3)** 404 real (`error_page`, sin fallback a `/index.html`) + redirects 301/302 reales en nginx en lugar de meta-refresh. Deploy de config nginx por SSH → **human gate**.
- **D-06 (A4)** No tocar placeholders de contenido (fotos, testimonios, hero, og:image) hasta tener material real. **Sí** arreglar: logo del schema (404) y el link `wa.me` roto.
- **D-07 (A5)** Quitar Chapadmalal. El Templo Park = "espacio de comunidad en el Parque Primavesi", sin `ExerciseGym`. Conteos: 6 sedes MdP (Constitución, Jujuy, Moreno, Juan B. Justo, Alberti, Mario Bravo) + Barcelona.
- **D-08 (A6)** lat/lng exactos + Place ID desde los links de Google Maps que pasa Franco; horarios desde la grilla real de la DB.
- **D-09 (A7)** `X-Robots-Tag: noindex` + robots `Disallow` para web-staging, app y admin (mismo deploy nginx que D-05).

### Bloque B — datos, páginas, app
- **D-10 (B1)** Fuente única = `branches` (migración: slug, lat/lng, place_id, foto, `publicar_en_web`) + endpoint público read-only con sedes y horarios. La web lo consume **en el build**. Migración numerada al momento de ejecutar (fase 194 usa 0255+; master tiene 0258).
- **D-11 (B2)** Rebuild **manual**, sin cron ni SSR. **B2-bis**: botón "solo web" en GitHub (input de `workflow_dispatch` o workflow aparte) con backup/rollback.
- **D-12 (B3)** Páginas: hub `/sedes` + una por sede; disciplinas/niveles (incluye Aura/Yoga); profes (`Person`) + landing "primera clase gratis"; planes **sin precios** con CTA al WhatsApp de ventas.
- **D-13 (B4)** Barcelona en `/es/` con hreflang `es-AR`/`es-ES` recíproco, solo entre páginas equivalentes.
- **D-14 (B5)** Deep links (`assetlinks.json` / `apple-app-site-association`, requiere build de tiendas) + Smart App Banner + pedido de reseña in-app (plugin Capacitor → **preguntar antes de instalar**) + ASO de las fichas (va a la guía final).
- **D-15 (B7)** robots.txt explícito permitiendo bots de búsqueda IA (`OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`); NO se bloquean bots de entrenamiento. llms.txt generado desde los datos de sedes (sin invertir más).
- **D-16 (B12)** WhatsApp de ventas: **uno por país** (MdP y Barcelona), configurable, no hardcodeado.
- **D-17 (blog)** Solo arreglos técnicos: autor real (Ignacio Bordón como `Person`), tags vacíos en prod, covers con fallback, sacar el `catch {}` mudo del sitemap, publicación vía botón "solo web". Los artículos los escribe el equipo; la guía final sugiere temas.

### Medición y atribución
- **D-18 (B6)** Atribución propia: guardar en el alta el origen (`utm_*`, `?promo=`, referrer, landing) y mostrar en Reportes el embudo registro → prueba → pago → facturación por campaña y sede. Sirve para Meta, Google, IG, QR y flyers.
- **D-19 (B6)** Meta CAPI desde la API en registro, reserva de prueba y primer pago (email/tel hasheados SHA-256, valor y moneda en el pago), deduplicado con el Pixel (`event_id`). Mencionar en `/privacidad`. Usuarios ES solo con consentimiento (D-22).
- **D-20 (B9)** Gasto de Meta **automático**: job diario contra la Marketing API (usuario del sistema del Business Manager, `ads_read`; misma credencial que CAPI) → costo por alumno pago por campaña y sede en Reportes.
- **D-21 (B8+B10)** IA y Google:
  1. Detectar origen IA en nuestro alta (referrer + `utm_source` de chatgpt.com, perplexity, gemini, copilot, claude.ai, etc.) y mostrarlo en Reportes.
  2. Job semanal de la API de Search Console (consultas/clics/impresiones por página de sede) visible en el admin.
  3. Sync de Google Business Profile (horarios/dirección/teléfono) desde `branches`, **detrás de flag**: el acceso a la API lo aprueba Google (semanas) y las fichas deben estar verificadas.
  4. Visibilidad en respuestas de IA: planilla mensual manual de 20-30 prompts (la armamos nosotros). NO se automatiza por APIs.
- **D-22 (B11)** RGPD Barcelona: banner de consentimiento propio solo en `/es/`, con Google Consent Mode v2; GA, Pixel y CAPI de usuarios ES no se disparan sin aceptación. Sin CMP externa (regla no-CDN). Argentina sin cambios.

### Entregable final
- **D-23** Guía paso a paso para Franco/equipo (último plan de la fase): Meta (usuario del sistema, token, dataset, plantilla de parámetros de URL, eventos de optimización, quién maneja los ads), Google (GA4, Search Console/Bing por DNS, solicitud de acceso a Business Profile API, verificación de fichas), y bloque C completo (GBP por sede, reseñas sin gating, NAP, directorios MdP, prensa Primavesi, bio IG, Bing Places/Apple Business, USC/ClassPass BCN, ASO). Cada paso dice dónde se carga el resultado (secret, setting, etc.).

### Claude's Discretion
- Forma del endpoint público y su caché; nombres de columnas/tablas de atribución; dónde vive la config por país (WhatsApp, nombre canónico) — reutilizar `tenant_settings`/patrones existentes antes de inventar.
- Cómo partir los planes (agrupar: Franco considera que 30+ planes es mucho — ver fase 194).
- Ubicación de los jobs (cron de la API existente) y su manejo de credenciales ausentes (no-op con log, nunca romper el arranque).
</decisions>

<canonical_refs>
## Canonical References (ver tabla de hallazgos en `195-RESEARCH-SEO-AEO.md` §2)

- `el-templo-web/data/sedes.ts` (hardcodeado, Alem vieja en :70), `pages/index.vue:45-78` (JSON-LD colapsado), `nuxt.config.ts:27-51`, `app.vue:11-14,47`, `plugins/ga4.client.ts`, `plugins/meta-pixel.client.ts`, `server/api/__sitemap__/blog.ts:46`
- `deploy/nginx/eltemplo.org:47` (`try_files ... /index.html` → soft-404)
- `.github/workflows/deploy.yml:252-256` (IDs no inyectados)
- `el-templo-api/src/db/migrations/0230_alem_renombre_juan_b_justo.sql`; `scheduling/routes.ts:1538` (horarios con auth)
- Fases previas: 36 (SEO+Analytics), 37 (audit fixes), 41 (Content & Media Handoff, nunca ejecutada)
</canonical_refs>

<code_context>
## Gates y trampas conocidas

- El `el-templo-web/` del checkout principal está atrasado: trabajar SOLO en este worktree (`et-195-seo`, base origin/master `30eef9921`).
- Endpoint público nuevo + tablas/jobs nuevos disparan los gates de tenancy (memoria `reference_gates_tenancy_ruta_job_nueva`, `reference_tabla_gym_owned_nueva_cinco_conteos`).
- Staging y prod comparten host MySQL; los datos de sedes (lat/lng, place_id, slug) entran por migración.
- SSH (nginx) y deps nuevas (plugin de reseñas Capacitor, cliente de APIs Google/Meta) son **human gates**: preferir `fetch` nativo a SDKs.
- Secrets nuevos → `.env.example` + secrets de CI; jobs sin credenciales = no-op.
- CI no typechequea app/admin/web: verificar localmente con lint + build.
</code_context>

<deferred>
## Deferred

- Contenido real (fotos por sede, testimonios, hero/video, og:image) — cuando el equipo lo entregue.
- Monitoreo automático de prompts por APIs de IA.
- Wikidata (cuando haya fuentes independientes).
- Qué hacer con la app vieja de Virtuagym (va como ítem en la guía final).
</deferred>
