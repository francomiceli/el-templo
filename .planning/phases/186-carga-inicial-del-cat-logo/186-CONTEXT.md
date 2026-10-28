# Phase 186: Carga inicial del catálogo - Context

**Gathered:** 2026-09-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Poblar el catálogo global con ~60 ejercicios publicados (rango duro 40-80), generados con agentes en lotes por patrón de movimiento, con doble checkpoint humano (lista primero, fichas después vía panel de la 185) y llegada a producción como migración SQL generada desde el dataset aprobado, siguiendo el protocolo del brief (base de prueba → validación de conteos/duplicados → backup → carga transaccional reversible).

**NO entra en esta fase:** rutinas/plantillas (187+), videos/imágenes por ejercicio (opcional post-v1 del brief), publicación masiva como feature de UI, configuración de equipamiento por gimnasio (prohibida por brief §2.3), y cualquier contenido local de tenant (la carga es 100% scope global, `tenant_id = NULL`).

</domain>

<decisions>
## Implementation Decisions

### Camino a Publicado y vehículo de carga (CAT-08)

- **D-01 Revisión en DB dev con el panel de la 185:** la generación carga los ejercicios como `borrador` en la DB de dev; la revisión humana usa el panel `/plataforma/ejercicios` y el catálogo reales (dogfooding de la 185). El ciclo Borrador→revisión→Publicado ocurre de verdad contra datos reales, no simbólicamente en archivos.
- **D-02 Aprobación = transición real, uno por uno:** el revisor toca `Publicar` en el panel por cada ejercicio aprobado (transición de la 185, criterio 3 del roadmap cumplido literalmente). Sin publicación masiva: cero UI nueva. El export toma SOLO los `publicado` de dev.
- **D-03 Vehículo a prod = migración SQL generada:** un script exporta lo aprobado en dev y genera la migración (próximo número libre; hoy 0218) con los INSERTs de `gym_exercises` + `gym_exercise_aliases` + `gym_exercise_alternatives` ya en estado `publicado`. Trackeada en `_migrations`, corre en el deploy del tren, con el backup del pipeline. Regla del proyecto respetada: prod data via migrations.
- **D-04 Corrección = fuente + regenerar:** los errores detectados en revisión se corrigen en el dataset fuente y se re-carga ese ejercicio en dev; nunca se parchea la fila a mano. Lo no aprobado queda en `borrador` y no se exporta (el volumen es flexible dentro de 40-80).

### Pipeline de generación (CAT-08)

- **D-05 Fuente de verdad = dataset JSON versionado en el repo** (p.ej. `el-templo-api/src/db/seed-data/gym-catalog/`): los agentes escriben archivos JSON commiteados; un loader los carga a dev; el export genera la migración desde el dataset. Diffable y regenerable.
- **D-06 Generación con subagentes en la sesión GSD de ejecución** (sin dependencias nuevas, sin API keys, sin scripts standalone contra la API). El prompt de generación lleva las reglas del brief §2.4 (un ejercicio un nombre canónico; distinto solo si cambia patrón/equipamiento/ángulo) y §2.5 (lenguaje llano, sin jerga El Templo — la ejecución paso a paso y los errores frecuentes son lo único que tiene el alumno).
- **D-07 Lotes por patrón de movimiento (9 lotes,** ~5-9 ejercicios c/u): cobertura de los 9 patrones garantizada por construcción; los sinónimos/casi-duplicados se detectan dentro del lote natural.
- **D-08 Validación = script gate + test permanente de CI sobre el dataset:** taxonomías contra las listas reales de la 184 (14/23/9), 9 patrones cubiertos, colisiones de nombre canónico y alias usando la MISMA normalización del buscador de la 185 (`search-normalization.ts`), punteros de alternativas/variantes resolubles dentro del set, y el reporte de conteos que exige el protocolo del brief (por grupo, por patrón, por equipamiento, duplicados). El test es barato (sin DB) y queda en CI.

### Contenido por ficha (CAT-08)

- **D-09 Checkpoint de lista ANTES de fichas:** la ejecución presenta la lista completa (~60 nombres con patrón/grupo/equipamiento) y espera OK humano antes de generar fichas completas. Descartar temprano es barato.
- **D-10 Alternativas 1-3 obligatorias por ejercicio,** resolviendo DENTRO del set inicial (brief §2.6: el reemplazo manual es instantáneo desde el día uno). Variantes más fácil/más difícil solo donde la progresión es natural — sin cadenas forzadas. El validador (D-08) chequea que ningún puntero quede colgado.
- **D-11 Aliases: 2-4 por ejercicio,** español rioplatense (con variantes regionales de uso real en gimnasios) + el nombre en inglés cuando es el de uso corriente (bench press, deadlift, curl). El buscador de la 185 matchea por alias normalizado.
- **D-12 Volumen objetivo ~60 publicados** con sesgo a equipamiento básico (barra, mancuernas, peso corporal, máquinas universales). NO forzar cobertura de los 23 equipamientos — el criterio de éxito es que un gym nuevo arme una rutina completa, no un muestrario.

### Reversibilidad y regeneración (CAT-08)

- **D-13 Ancla de identidad = nombre canónico normalizado** (misma normalización de la 185) en scope global: el loader de dev hace upsert por esa clave (regenerar actualiza, no duplica; preserva el estado de revisión de los ya publicados); las referencias internas del dataset apuntan por slug canónico. Red de seguridad: `uq_gym_exercises_scope_name` de la 184.
- **D-14 Reversión en prod = backup del pipeline + DELETE documentado:** la migración inserta solo filas globales nuevas (la tabla llega vacía a prod); la reversión manual es un DELETE de las 3 tablas en scope global, documentado junto a la migración (sin `;` dentro de comentarios SQL). Válido SOLO mientras no existan registros de entrenamiento; después de eso la salida es desactivar, no borrar (regla 5 del protocolo del brief). Sin down-migrations (el runner no tiene ese concepto).

### Claude's Discretion

- Estructura interna del dataset (un archivo por patrón vs por ejercicio), esquema JSON exacto y ubicación definitiva bajo `el-templo-api/`.
- Si la migración usa IDs explícitos o resuelve las referencias de alternativas por subquery de nombre — decidir en planning mirando cómo quedó la 0217 y el estado del autoincrement.
- Detalle del reporte de validación (formato, dónde se archiva) y del script de export dataset→migración.
- Selección concreta de los ~60 ejercicios y su distribución fina por patrón (la lista pasa por el checkpoint D-09 de todos modos).
- Redacción de los prompts de generación por lote (siempre con §2.4/§2.5 embebidos).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Brief y diseño del módulo (⚠️ viven en `origin/master` y en el worktree `et-182` — NO en el checkout principal)

- `.docs/saas-multitenancy/brief-fran-modulo-gimnasio.md` — §2.3 (listas cerradas de taxonomías; equipamiento por ejercicio, nunca por gimnasio), **§2.4 (reglas de generación del catálogo — LOCKED)**, §2.5 (sin video en v1: ejecución paso a paso y errores frecuentes en lenguaje llano), §2.6 (alternativas cargadas en el catálogo), **sección "Carga inicial del catálogo" (protocolo de 5 pasos — LOCKED)**.
- `.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md` — Definición 2 (modelo global/local, enum `status`), mapeo fijo D-10 de categoría derivada (el generador usa ESE mapeo, no uno propio), "los defaults viven en código, no en la migración de seed".

### Fases base (código en worktree `et-182`, rama `feat/185-catalogo-ciclo-buscador`, SIN push)

- `.planning/phases/184-cat-logo-de-ejercicios-modelo-global-local-taxonom-as/184-CONTEXT.md` — taxonomías reales (14/23/9; equipamientos=23, agarres fuera), schema de 3 tablas, mig 0217.
- `.planning/phases/185-cat-logo-ciclo-de-vida-y-buscador/185-CONTEXT.md` — estados y transiciones, buscador, normalización.
- `el-templo-api/src/db/schema/gym-exercises.ts` — schema real de las 3 tablas (en et-182).
- `el-templo-api/src/modules/gimnasio/search-normalization.ts` — la normalización canónica que D-08/D-13 deben reusar (en et-182).
- `el-templo-api/src/db/migrations/0217_gym_catalog.sql` — molde de migración del módulo (en et-182).

### Reglas de proyecto

- Skill `el-templo-db-migrations` — runner custom, numeración manual, sin `;` en comentarios, NUNCA drizzle-kit push/migrate.
- Skill `el-templo-change-control` §7 — prod data via migrations; nunca seeds contra prod.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- Panel `/plataforma/ejercicios` + `CatalogoPage` + `EjercicioFichaDialog` (fases 184/185, en et-182): la superficie de revisión humana D-01/D-02 ya existe completa — esta fase NO construye UI.
- `search-normalization.ts` (185): normalización única para la detección de duplicados/colisiones del validador D-08 y el upsert D-13.
- Taxonomías y JSON Schemas de la 184 (`gym-taxonomies`, validación ajv): las listas contra las que valida D-08.
- Runner de migraciones custom + molde 0217 para la migración de datos D-03.

### Established Patterns

- Migraciones de datos de prod ya existentes en el historial (altas de sede, renames) como precedente del formato INSERT-only documentado.
- Tests de integración en `el-templo-api/test/` contra MySQL real; el validador de dataset en cambio es test SIN DB (rápido, CI-friendly).

### Integration Points

- La carga llega a prod DENTRO del tren 182+183+184+185+186: la migración de datos se numera DESPUÉS de la 0217 y de cualquier migración que la 186 no conozca aún — verificar el número libre al momento de generar.
- El catálogo publicado es el insumo directo de la fase 187 (rutinas): el criterio de éxito 5 (armar una rutina completa solo con el catálogo inicial) se verifica de verdad recién ahí; en la 186 se aproxima con la revisión humana + distribución por patrón.

</code_context>

<specifics>
## Specific Ideas

- La revisión humana es dogfooding deliberado de la 185: revisar las fichas usando el buscador/filtros/panel recién construidos, y que eso sirva de UAT informal extra de la 185.
- El conteo de duplicados/sinónimos es "el que más importa" (brief, protocolo paso 2) — el validador lo trata como bloqueante, no como warning.
- "40-80 publicados que cubran los nueve patrones, antes que 300 a medias" — ante la duda, menos y mejor.

</specifics>

<deferred>
## Deferred Ideas

- **Publicación masiva en el panel de plataforma** (selección múltiple + endpoint batch): descartada para esta fase (D-02); si el catálogo crece y se repite el flujo de revisión, considerarla como mejora del panel.
- **Videos e imágenes por ejercicio** — primer opcional post-v1 del brief; el campo queda previsto en el schema de la 184.

### Reviewed Todos (not folded)

- `v51-milestone-data-rollout.md` (poblar `milestone_exercise_id`) — sistema viejo (SPOM); la frontera A1 garantiza cero relación con `gym_exercises`. Ya revisado y no plegado también en la 185. Sigue como todo independiente.

</deferred>

---

_Phase: 186-Carga inicial del catálogo_
_Context gathered: 2026-09-01_
