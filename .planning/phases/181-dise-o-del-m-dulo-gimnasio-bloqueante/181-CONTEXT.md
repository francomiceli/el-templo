# Phase 181: Diseño del módulo Gimnasio (bloqueante) - Context

**Gathered:** 2026-08-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Esta fase entrega **un documento de diseño** (`.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md`) que responde las 7 definiciones del brief de Nacho (DIS-01) y decide la superficie member-facing multi-tenant (DIS-02), con cada decisión trazada a los requirements que habilita, ANTES de escribir código de producto. Bloquea a las fases 182-192. No se escribe código del módulo en esta fase (a lo sumo spikes descartables si el research los necesita).

Decisiones del addendum que NO se re-litigan: A1 (módulo duro, cero imports SPOM), A2 (dos catálogos, `exercises` intacta), A4 (categoría derivada por mapeo fijo — **ya validado**, ver D-10), A5 (desde-cero solo profe en v1), A7 (secuencia de milestones).

</domain>

<decisions>
## Implementation Decisions

### Definición 1 / Prior A3 — modelo de datos

- **D-01:** A3 queda **CERRADA como decisión**: Calistenia y Gimnasio NO comparten modelo de datos. El doc escribe el fundamento (sesión generada por algoritmo vs plantilla→registro de series; el caso peso-corporal-con-lastre como fichas independientes sin puente de datos) — **sin matriz comparativa unificar-vs-separar**. El researcher no debe gastar esfuerzo evaluando la alternativa unificada.
- **D-02:** **El caso híbrido (un tenant con módulo Templo Y módulo Gimnasio prendidos) NO existe ni existirá** — palabras del usuario. Exclusión mutua como **invariante del diseño**, ni siquiera como pregunta abierta de v2. Respuesta a la pregunta de Nacho: un alumno siempre ve UN solo historial.

### Superficie member-facing (DIS-02)

- **D-03 (corregida 2026-08-27):** Esquema de **dos superficies**: (a) STAFF de tenants (profes/admins) en `el-templo-admin`, que ya es multi-tenant desde v6.0, con las secciones del módulo Gimnasio gateadas por `module.gimnasio.enabled` (el staff de El Templo no las ve); (b) ALUMNOS en una **NUEVA app multi-tenant dentro del monorepo** — cuarta app junto a api/app/admin, mismo stack Quasar+Vue+**Capacitor**. La app nativa en tiendas es **destino confirmado** (ver D-11), no hipótesis: un solo código con destino dual (web por subdominio + build Capacitor). El timing de la primera publicación en tiendas lo especifica el doc de diseño. _(Reemplaza al "web app/PWA sin tiendas en v1" de la discusión original.)_
- **D-04:** `el-templo-app` NO se transforma (regla firme, se ratifica con constancia explícita en el doc).
- **D-05:** **El split de repos NO se adelanta.** El doc deja constancia de que el trigger sigue intacto; la nueva app nace en el monorepo (reusa CI, deploy, convenciones; mismo EC2, un vhost más).
- **D-06:** Acceso del alumno por **subdominio por gimnasio** (`gimnasioX.<plataforma>.com`): branding pre-login y URLs propias por tenant. Implicancias que el diseño debe especificar: resolución de tenant por hostname, y aprovisionamiento del subdominio en el wizard de la 182 (recomendado: wildcard cert + nginx catch-all para que el alta no toque DNS/certs a mano).
- **D-11 (agregada 2026-08-27):** **Modelo de publicación en tiendas: UNA sola app container multi-tenant (Opción A)**, publicada y mantenida desde la cuenta de la plataforma, con branding por tenant en **runtime** (logo, colores y nombre visibles DENTRO de la app). Fundamento: como proveedores de servicio a otros gimnasios, N apps clonadas desde nuestra cuenta viola App Store Guideline 4.3 (spam) — **prohibido**. El doc de la 181 especifica la arquitectura del runtime branding (detección de tenant por login/deep link/config) y verifica el texto vigente de 4.2.6/4.3 al formalizar. Límite de plataforma asumido: el ícono/nombre en la home y en la ficha de la tienda quedan genéricos de la plataforma (ícono cambiable en runtime solo desde un set pre-empaquetado; nombre imposible en iOS).
- **D-12 (agregada 2026-08-27):** **Marca propia por gimnasio — estrategia en dos niveles.** (a) **v1:** la PWA por subdominio (D-06) es la vía de ícono+nombre propios en el teléfono ("Agregar a inicio"), tenants ilimitados sin releases; (b) **futuro, fuera de v6.1:** "tu app con tu marca en la tienda" como **add-on premium vía modelo 4.2.6** — el gimnasio publica desde SU cuenta Apple/Google (paga sus fees), la plataforma automatiza la build (fastlane/CI). Patrón estándar de SaaS white-label (Mindbody, Glofox). **Requisito de diseño que esto impone a la 181:** todo el branding es **config por tenant, nunca código** (claves en `tenant_settings` + assets por tenant), de modo que una build white-label futura sea solo configuración + assets, sin fork.

### Formato y validación del documento

- **D-07:** **Un solo documento** en `.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md`, siguiendo la serie 01-07 del diseño v6.0. Las 7 definiciones + DIS-02 como secciones, cada una trazada a sus REQ (criterio de éxito 4 de la fase).
- **D-08:** Nivel de detalle: **entidades, columnas clave, FKs e índices para las consultas críticas** (sobre todo "historial de este alumno en este ejercicio", definición 6). El schema Drizzle/DDL final lo escriben las fases ejecutoras (184+). Ni DDL completo ni solo-conceptual.
- **D-09:** **Franco firma el doc — sin gate de aprobación de Nacho.** La fase se cierra con el OK de Franco; a Nacho le llega como información.
- **D-10:** **El pendiente de A4 queda VALIDADO en esta discusión** (2026-08-27): mapeo de categorías tal cual está en el addendum — antebrazo→Bíceps, cuello→Core, 7 categorías (Pecho, Espalda, Hombros, Bíceps, Tríceps, Piernas, Core). El doc ya no arrastra ningún "validar con Nacho".

### Claude's Discretion

- **Ambición offline (definición 3):** área no seleccionada para discusión. La resuelve el diseño/research dentro de los guardrails del brief (§5 fricción mínima; def. 3: gimnasios en subsuelo, guardado local + sync posterior, conflicto entre dos dispositivos del mismo alumno).
- **Recálculo de récords (def. 4), modelado de superseries/circuitos (def. 5), esquema e índices (def. 6), mapa de `tenant_settings` (def. 7):** territorio del researcher/planner — el brief fija los criterios de aceptación (el alumno nunca ve un récord que cambia solo; el caso simple del 90% no se complica; consulta más frecuente = historial alumno×ejercicio; todo parámetro configurable en `tenant_settings`, nunca hardcodeado).
- Nombre/branding de la nueva app de alumnos: no discutido — proponer en el doc.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Brief del módulo (LA fuente de la fase)

- `.docs/saas-multitenancy/brief-fran-modulo-gimnasio.md` — Brief de Nacho 2026-07-24 completo + addendum A1-A7 2026-07-26. Las 7 definiciones a responder están en su sección final; los guardrails, taxonomías §2.3 y reglas de fricción §5 son vinculantes.

### Requirements y roadmap del milestone

- `.planning/REQUIREMENTS.md` — 37 REQ v1 de v6.1; DIS-01/DIS-02 son los de esta fase; v2 y Out of Scope delimitan qué NO diseñar.
- `.planning/ROADMAP.md` — Reglas duras del milestone (módulo duro A1, gate `module.gimnasio.enabled`, migraciones desde 0216, staging-first, `tenant_settings`, guardrails) + success criteria de la 181 y de las fases 182-192 que este diseño habilita.

### Diseño v6.0 (contexto técnico que el diseño debe respetar)

- `.docs/saas-multitenancy/02-inventario-modulos.md` — §2: la decisión original de dos catálogos (A2).
- `.docs/saas-multitenancy/05-inventario-tablas-2026-07-26.md` — §3: el "club GLOBAL" (tablas sin `tenant_id`, propiedad de plataforma) que el catálogo global pasa a integrar.
- `.docs/saas-multitenancy/04-mecanismo-modulos.md` — Mecanismo de módulos de la fase 176: flags en `tenant_settings`, guard `requireModule` → 404, manifiesto de rutas fail-closed (toda ruta nueva del módulo entra ahí o CI rojo).
- `.docs/saas-multitenancy/07-receta-adopcion.md` — §1.4: sede virtual por tenant (la referencia el aprovisionamiento del wizard, PLAT-03).

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **Mecanismo de módulos (fase 176):** `module.<x>.enabled` en `tenant_settings` + `requireModule` → 404 — el gate de TODO el módulo Gimnasio ya existe; el diseño solo define el flag `module.gimnasio.enabled` y sus defaults.
- **Enforcement de tenancy v6.0:** helpers `tenantWhere`/`tenantValues` + `TenantContext`, sentinel de pool mysql2, lint CI, manifiesto de rutas fail-closed, batería de aislamiento (ISO) — las tablas nuevas del módulo nacen dentro de este régimen.
- **`el-templo-admin` multi-tenant:** ya resuelve tenant server-side por login — hogar del lado staff sin app nueva.
- **Pipeline de deploy monorepo:** agregar la cuarta app = un build + un vhost más en el mismo EC2 (ojo `paths-filter`/`event.before` — memoria `reference_deploy_paths_filter_trap`).

### Established Patterns

- API Fastify con módulos por feature en `el-templo-api/src/modules/`, schema Drizzle en `src/db/schema/`, migraciones hand-written numeradas (v6.1 reserva desde **0216**).
- Frontends Quasar + Vue 3 + Pinia (composition); la nueva app de alumnos replica este stack.
- Frontera A1 verificable: tablas propias, rutas propias, cero imports desde/hacia el SPOM; acople solo por FK a `users`/`branches`/`tenants` + lectura de `subscriptions`.

### Integration Points

- `tenant_settings` — todos los parámetros del brief (autogestión OFF default, timeout 12h, edición 24h, umbrales del panel) viven ahí; la definición 7 produce el mapa de claves.
- Subdominios por gimnasio — nginx/certs del EC2 + resolución de tenant por hostname (nuevo punto de integración que el diseño especifica; los vhosts de front NO proxean `/api`, memoria `reference_admin_nginx_no_proxea_api`).

</code_context>

<specifics>
## Specific Ideas

- La respuesta escrita a Nacho sobre "¿un historial o dos?" es: **uno, siempre** — por exclusión mutua de módulos (D-02).
- El doc debe dejar dos constancias explícitas exigidas por los success criteria: `el-templo-app` no se transforma, y el split de repos no se adelanta (trigger intacto).
- Subdominio por gimnasio elegido explícitamente sobre dominio único: al usuario le importa el branding/URL propia por tenant desde antes del login.

</specifics>

<deferred>
## Deferred Ideas

### Reviewed Todos (not folded)

- `v51-milestone-data-rollout.md` (poblar `milestone_exercise_id`, SPOM v5.1) — matcheó por keywords genéricas; revisado y NO plegado: es rollout de datos del módulo Templo, sin relación con el diseño del módulo Gimnasio. Sigue como todo independiente.

Fuera de eso: ninguna — la discusión se mantuvo dentro del alcance de la fase.

</deferred>

---

_Phase: 181-Diseño del módulo Gimnasio (bloqueante)_
_Context gathered: 2026-08-27_
