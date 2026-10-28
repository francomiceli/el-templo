# Phase 184: Catálogo de ejercicios — modelo global/local + taxonomías - Context

**Gathered:** 2026-08-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Esta fase entrega el **modelo de datos del catálogo** (`gym_exercises` + tablas satélite de la ficha), el **scope mixto global/local** (`tenant_id` NULLable, NULL = global) con su infraestructura de tenancy (precondiciones H-1/H-2 del doc 08), las **taxonomías cerradas del §2.3 validadas en la carga**, y un **ABM mínimo en `el-templo-admin`** (listado + alta/edición de ejercicios propios). Cubre CAT-01, CAT-02, CAT-06.

**NO entra en esta fase:** copia local automática (CAT-03), promoción local→global (CAT-04), desactivación (CAT-05), buscador por nombre/alias/taxonomías (CAT-07) — todos fase 185; carga inicial del catálogo (CAT-08) — fase 186. `exercises` del SPOM queda byte a byte intacta (criterio de éxito 5).

</domain>

<decisions>
## Implementation Decisions

### Alcance de la ficha (schema)

- **D-01:** La migración de la 184 crea el **schema COMPLETO de la ficha §2.2 del brief** (19 campos), incluidas las relaciones: alias/sinónimos, grupos musculares secundarios, variante más fácil/difícil, ejercicios alternativos, y los campos v2 previstos vacíos (URL de video, imagen). Las fases 185/189 solo agregan comportamiento, nunca ALTERs sobre estas tablas.
- **D-02:** **Cruces de scope en variantes/alternativas: local→global sí, global→local no.** Un ejercicio propio puede referenciar globales o propios de su mismo gimnasio; un global solo referencia globales (si apuntara a un local, otros gimnasios verían una referencia rota). La regla se valida en la carga, igual que las taxonomías.
- **D-03:** **Obligatoriedad por scope.** Ejercicios propios del gimnasio: obligatorios duros solo nombre canónico + taxonomías (grupo primario, equipamiento, patrón) + dificultad + tipo de carga; los textos largos (descripción breve, ejecución paso a paso, errores frecuentes) son **opcionales**. La ficha completa del brief se exige solo al catálogo global curado (lo aplica la fase 186 en su pipeline de revisión). Esto es una desviación deliberada del "Obligatorio: Sí" del §2.2 para reducir fricción del profe.

### Estados en la práctica

- **D-04:** **Un ejercicio propio nace `publicado` directo** — sin paso editorial dentro del gimnasio. El estado `borrador` queda reservado para el pipeline curado del global (generación con agentes, fase 186). El default de columna sigue siendo `'borrador'` (como fija el doc 08); es el endpoint de alta propia el que setea `'publicado'`.
- **D-05:** **Cero transiciones de estado en la 184** — solo crear/editar. La desactivación (CAT-05) llega con la 185; un ejercicio mal creado se corrige editando.
- **D-06:** **Editar un ejercicio GLOBAL desde una ruta de tenant queda bloqueado en la 184** — la copia local automática (CAT-03) es de la 185. Ninguna escritura de tenant toca filas con `tenant_id IS NULL` (coherente con la regla del doc 08: `tenantValues` sin cambios en escrituras).

### UI y roles del ABM

- **D-07:** La 184 entrega en `el-templo-admin` una sección **Catálogo** gateada por `module.gimnasio.enabled`: **listado plano paginado** (globales + propios, con badge de alcance global/propio) + **form de la ficha** para alta/edición de propios. Sin buscador por taxonomías (CAT-07, fase 185). El criterio de éxito 3 ("error entendible" ante valor fuera de lista) se verifica en esta UI y en la API.
- **D-08:** **Roles del tenant con acceso al ABM: coach + admin + owner** (crean y editan). Gestión/recepción no ven la sección. Consistente con A5 (el profe es el creador de contenido del módulo).
- **D-09:** Al planificar, correr `/gsd:ui-phase 184` para el contrato de diseño del form de ficha (UI hint: yes en el roadmap).

### Base de ejecución

- **D-10:** **La 184 se encadena sobre lo hecho de 182+183 SIN esperar el push** — palabras del usuario: "no puedo revisar 182 ni 183 ahora, tenemos que usar lo que hay hecho de base". Rama nueva desde `feat/183-panel-tenants` (worktree `et-182`, HEAD `c05f9d17`). Migraciones desde **0217** (la 0216 es de la 182). El push eventual es el tren 182+183+184 completo, staging-first, con OK explícito de Franco — ninguna fase del tren se pushea suelta.

### Claude's Discretion

- **Modelado físico de las relaciones de la ficha** (alias como tabla hija vs JSON, secundarios, variantes/alternativas como self-FK o tabla puente): lo fija el planner con criterio de que la 185 pueda indexar alias para el buscador sin ALTER.
- **Empty state del catálogo** (el global está vacío hasta la 186): mensaje simple, lo resuelve la UI.
- **Mensajes de error de validación** de taxonomías: en español, entendibles (criterio 3); forma exacta a criterio del executor siguiendo los patrones de error del admin.
- **Mecánica de los renames H-2** (`templo-module`→`feature-module`, `ModuloTemplo`→`ModuloFeature`, baseline del manifiesto): checklist mecánico del doc 08, sin decisión de producto.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño del módulo (LA fuente de esta fase)

- `.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md` — **⚠ vive en `origin/master` / en la base de `et-182`, NO en el checkout local viejo de el-templo** (`git show origin/master:...` si hace falta). Secciones vinculantes para la 184: H-1 (scope mixto, categoría `TENANT_MIXED_SCOPE_TABLES`, helper `tenantOrGlobalWhere`), H-2 (renames del manifiesto + `"gimnasio"` en `MODULE_NAMES`), "Checklist de precondiciones", Definición 2 (unique con `tenant_scope_key = COALESCE(tenant_id, 0)` — el caso borde de MySQL con NULL está escrito a propósito), Definición 6 (spec de `gym_exercises` y reglas transversales de las 12 tablas), mapeo de categorías D-10.
- `.docs/saas-multitenancy/brief-fran-modulo-gimnasio.md` — §2.2 ficha (19 campos), §2.3 taxonomías cerradas (14 grupos, 25 equipamientos, 9 patrones), §2.4 nombre canónico, §2.6 alternativas. Vinculante salvo la relajación de obligatoriedad de D-03.

### Requirements y contexto de fases previas

- `.planning/REQUIREMENTS.md` — CAT-01, CAT-02, CAT-06 (esta fase); CAT-03..08 delimitan qué NO entra.
- `.planning/ROADMAP.md` — success criteria de la 184; migraciones del milestone reservan desde 0216 (182 la usó → 184 usa 0217+).
- `.planning/phases/181-dise-o-del-m-dulo-gimnasio-bloqueante/181-CONTEXT.md` — D-01..D-12 de la 181 (módulo duro A1, exclusión mutua D-02, branding config-no-código D-12).

### Mecanismo de módulos y tenancy (v6.0)

- `.docs/saas-multitenancy/04-mecanismo-modulos.md` — `module.<x>.enabled` en `tenant_settings`, guard `requireModule` → 404, manifiesto fail-closed.
- `el-templo-api/src/db/tenant-tables.ts` — donde nace `TENANT_MIXED_SCOPE_TABLES` (hoy no existe — la crea esta fase).
- `el-templo-api/src/modules/shared/tenant.ts` — helpers `tenantWhere`/`tenantValues`/`assertTenant`; acá se suma `tenantOrGlobalWhere`.
- `el-templo-api/src/modules/shared/modules.ts` + `el-templo-api/test/tenant-manifest.ts` — `MODULE_NAMES` y el manifiesto que la H-2 renombra.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **Mecanismo de módulos (fase 176):** `requireModule('gimnasio')` → 404 ya funciona; solo falta agregar `"gimnasio"` a `MODULE_NAMES`.
- **Régimen de tenancy v6.0 completo:** helpers, sentinel de pool, lint CI, manifiesto fail-closed, batería ISO — las tablas `gym_*` nacen adentro; las de scope mixto necesitan la categoría y el helper nuevos (H-1).
- **RBAC del admin por secciones** (fase 149 nav por categorías): patrón existente para gatear la sección Catálogo a coach/admin/owner.
- **Patrón de enums con docblock** (`tenants.ts` status): el enum `borrador/publicado/desactivado` sigue ese estilo.

### Established Patterns

- Migraciones hand-written numeradas; la 184 numera desde **0217** sobre la base et-182 (0216 tomada).
- Validación por schema de Fastify en la ruta — las taxonomías cerradas se validan ahí, nunca post-inserción (CAT-06: "en la carga").
- Frontera A1: cero imports desde/hacia el SPOM; FKs hacia afuera solo a `users`/`branches`/`tenants`.
- Ejecución con `gsd-executor` en sonnet, secuencial, worktree compartido (método validado fase 173/182 — memoria `project_saas_multitenancy_fase173`).

### Integration Points

- `et-182` worktree, rama base `feat/183-panel-tenants` (`c05f9d17`) — la 184 se ramifica de ahí (D-10).
- Manifiesto de rutas: toda ruta nueva `/api/gym/*` entra etiquetada `feature-module` (post-rename H-2) o CI rojo.
- Tests de integración: resolver `admin@test.com`, nunca ids hardcodeados (memoria `feedback_test_user_id_nunca_hardcodeado`).

</code_context>

<specifics>
## Specific Ideas

- El badge de alcance en el listado ("Global" vs "Propio") es la traducción UI del `tenant_id` NULLable — el profe siempre sabe qué puede editar (propio) y qué no (global, hasta la 185).
- La relajación de obligatoriedad (D-03) es una decisión de producto de Franco contra el texto del brief: registrarla como desviación consciente si Nacho pregunta.

</specifics>

<deferred>
## Deferred Ideas

- **Adelantar 'desactivar' para propios**: considerado y descartado — CAT-05 completo llega en la 185.

### Reviewed Todos (not folded)

- `v51-milestone-data-rollout.md` (poblar `milestone_exercise_id`, SPOM v5.1) — matcheó por keywords genéricas; ya había sido revisado y NO plegado en la 181 (rollout de datos del módulo Templo, sin relación con el catálogo Gimnasio). Sigue como todo independiente.

</deferred>

---

_Phase: 184-Catálogo de ejercicios — modelo global/local + taxonomías_
_Context gathered: 2026-08-31_
