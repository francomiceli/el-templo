# Phase 185: Catálogo — ciclo de vida y buscador - Context

**Gathered:** 2026-09-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Activar el ciclo de vida del catálogo que la 184 dejó preparado y darle buscador: copia local automática al editar un global (CAT-03), promoción local→global desde plataforma (CAT-04), desactivación con transiciones de estado (CAT-05) y búsqueda por nombre canónico/alias con filtros por taxonomías (CAT-07), con aislamiento por tenant en toda superficie.

**NO entra en esta fase:** carga inicial del catálogo (CAT-08, fase 186), rutinas/plantillas (187+), registro de series e historial real (`gym_set_logs` llega en fases posteriores — acá solo se garantiza que el diseño no lo rompa), disponibilidad-por-equipamiento (prohibida por brief §2.3).

</domain>

<decisions>
## Implementation Decisions

### Copia local automática (CAT-03)

- **D-01 Sombreado:** cuando un gym tiene copia local de un global, su buscador muestra SOLO la copia (el global de origen se excluye vía `copied_from_exercise_id`, p.ej. NOT EXISTS). El sombreado aplica únicamente mientras la copia está activa (`status != 'desactivado'`): desactivar la copia re-expone el global (ver D-11). La exclusión vive solo en el buscador/picker — nunca en lecturas de historial.
- **D-02 Alcance de la copia:** se copia todo — ficha completa, aliases, y punteros a variantes (más fácil/más difícil) y alternativas apuntando a los mismos ejercicios de destino (cruce local→global permitido por D-02 de la 184).
- **D-03 UX:** diálogo de confirmación ANTES de entrar a editar un global desde un gym: "esto crea la versión de tu gimnasio; el ejercicio global no cambia". Nada silencioso.
- **D-04 Status inicial:** la copia nace `publicado` (si naciera borrador, el sombreado dejaría al gym sin el ejercicio en el buscador hasta publicarla).

### Promoción local→global (CAT-04)

- **D-05 Superficie:** acción del panel super-owner de la fase 183 — listar ejercicios locales de todos los tenants y promover desde ahí. Nunca disponible para un tenant.
- **D-06 Colisión de nombre:** si ya existe un global con el mismo `nombre_canonico` (unique de scope `tenant_scope_key=0`), la promoción se bloquea con mensaje claro; el super-owner renombra manualmente y reintenta. Sin renombres automáticos.
- **D-07 Copias no promovibles:** una fila con `copied_from_exercise_id` seteado NO se puede promover (crearía un casi-duplicado global y rompería el sombreado). Si la plataforma quiere adoptar los cambios de una copia, edita el global directamente.
- **D-08 Status:** la promoción solo cambia el scope (`tenant_id=NULL`, `id` preservado); el status se mantiene tal cual.

### Desactivación y transiciones de estado (CAT-05)

- **D-09 Transiciones en UI:** las tres — `borrador→publicado` (publicar), `publicado→desactivado` (desactivar), `desactivado→publicado` (reactivar). Ciclo reversible por UI.
- **D-10 Permisos por scope:** ejercicios globales: solo super-owner desde el panel de plataforma. Ejercicios locales: el propio gym desde el admin del catálogo de la 184 (mismos roles que ya usa la edición del catálogo).
- **D-11 Independencia de copias:** desactivar un global NO toca sus copias locales (siguen publicadas). Desactivar una copia local re-expone el global vigente en el buscador de ese gym (el sombreado exige copia activa).

### Buscador (CAT-07)

- **D-12 Matching:** substring normalizado (acentos y mayúsculas) con `LIKE %term%` sobre nombre canónico y alias. Ya existe `alias_normalized`; el nombre canónico se normaliza con el mismo criterio (columna espejo o normalización en query — a definir en planning). Patrón de referencia: `member-search.ts`. Sin FULLTEXT ni fuzzy en v1.
- **D-13 Ranking:** relevancia simple y determinista: match en nombre canónico > match solo por alias; prefijo > substring; luego alfabético. Locales y globales mezclados (el sombreado ya elimina los duplicados).
- **D-14 Filtros:** filtro muscular principal por categoría derivada (7 valores, mapeo fijo D-10 de la 184) con grupo muscular fino (14) como refinamiento opcional; más equipamiento y patrón de movimiento. Filtros combinables en AND. El buscador y el picker excluyen `borrador` y `desactivado` (semántica Definición 2).
- **D-15 Superficies:** dos entregables — (a) el listado del catálogo de la 184 mejorado con búsqueda por texto + filtros, y (b) un componente QSelect autocomplete reutilizable (patrón `ReferrerSelect.vue`) contra el mismo endpoint, listo para que la 187 (rutinas) lo enchufe sin duplicar lógica.

### Claude's Discretion

- Re-editar un global cuando ya existe copia local: redirigir a editar la copia existente (la unique de scope impediría una segunda copia con el mismo nombre).
- Debounce, mínimo de caracteres y paginación del autocomplete: seguir los patrones existentes del admin.
- Confirmaciones al desactivar y presentación de desactivados en el listado admin (filtro/toggle "ver desactivados").
- Detalle técnico de la normalización del nombre canónico (columna generada vs normalización en query), evaluando volumen (catálogo chico) y el índice `idx_gym_exercise_aliases_scope_alias`.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño del módulo Gimnasio (fase 181, firmado)

- `.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md` — **Definición 2** (alcance global/local, ciclo de vida completo de CAT-03/04/05/07, semántica del enum `status`, caso borde de unique con NULL, aislamiento del buscador); Definición 6 (índice de cobertura de historial que el sombreado NO debe tocar). ⚠️ Vive en `origin/master` y en el worktree `et-182` — NO está en el checkout principal.
- `.docs/saas-multitenancy/brief-fran-modulo-gimnasio.md` — §2.2 ficha y estados, §2.3 taxonomías (disponibilidad-por-equipamiento prohibida), §2.6 variantes/alternativas.

### Fase 184 (base directa de esta fase)

- `.planning/phases/184-cat-logo-de-ejercicios-modelo-global-local-taxonom-as/184-CONTEXT.md` — decisiones D-01..D-10 de la 184: `tenant_scope_key`, aliases en tabla propia, `copied_from_exercise_id` informativo, D-05 (cero transiciones en 184), D-06 (edición de global bloqueada en 184 — esta fase la reemplaza por copia local).
- `el-templo-api/src/db/schema/gym-exercises.ts` + migración `el-templo-api/src/db/migrations/0217_gym_catalog.sql` — esquema real: `gym_exercises`, `gym_exercise_aliases` (índice `idx_gym_exercise_aliases_scope_alias` pensado para este buscador), `gym_exercise_alternatives`. ⚠️ En la rama `feat/184-catalogo-ejercicios` del worktree `et-182` (sin push aún).

### Contexto de milestone

- `.planning/phases/181-.../181-CONTEXT.md` — contexto del diseño del módulo.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `el-templo-admin/src/components/ReferrerSelect.vue` — patrón QSelect `use-input` + `@filter` con debounce contra backend: base del autocomplete de ejercicios (D-15b).
- `el-templo-api/src/modules/shared/member-search.ts` — búsqueda multi-campo con LIKE + CONCAT_WS: patrón para el service de búsqueda.
- `el-templo-api/src/modules/admin/exercise-service.ts` — buscador del catálogo VIEJO (SPOM): análogo estructural (filtros por taxonomía), NO de datos — frontera A1, cero cruces con `gym_exercises`.
- Panel super-owner de la fase 183 — superficie donde viven promoción y transiciones de globales.
- Admin del catálogo de la 184 — listado/ABM que esta fase extiende con búsqueda, filtros y acciones de estado.

### Established Patterns

- `tenantOrGlobalWhere` para toda lectura del catálogo; `tenantValues` para escritura desde rutas de tenant (la copia local es un INSERT normal de tenant). Promoción/transiciones de globales = rutas de plataforma (auth super-owner), fuera del contexto de tenant.
- Ruta/job nuevo dispara los 3 gates de tenancy (memoria `reference_gates_tenancy_ruta_job_nueva.md`).
- Tests de integración en `el-templo-api/test/` contra MySQL real; resolver `admin@test.com`, nunca ids hardcodeados.

### Integration Points

- `copied_from_exercise_id` (existe desde la 184, informativo): esta fase lo activa para la copia y el sombreado — solo en buscador/picker, jamás en lecturas de historial (protege el índice de cobertura de Definición 6).
- El endpoint de búsqueda + el QSelect quedan como contrato para la 187 (armado de rutinas).

</code_context>

<specifics>
## Specific Ideas

- El diálogo de copia local debe dejar clarísimo el efecto: "esto crea la versión de tu gimnasio; el global no cambia" — explícito sobre clever.
- El sombreado es la pieza de UX central: un gym nunca ve duplicado global+copia en resultados ni en pickers.

</specifics>

<deferred>
## Deferred Ideas

### Reviewed Todos (not folded)

- `v51-milestone-data-rollout.md` (poblar `milestone_exercise_id`) — sistema viejo (SPOM); frontera A1 garantiza cero relación con `gym_exercises`. Queda como todo independiente.

</deferred>

---

_Phase: 185-Catálogo — ciclo de vida y buscador_
_Context gathered: 2026-09-01_
