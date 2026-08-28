---
phase: 181-dise-o-del-m-dulo-gimnasio-bloqueante
plan: 04
subsystem: docs
tags:
  [
    design-doc,
    data-model,
    indexing,
    tenant-settings,
    multitenancy,
    tenant-tables,
  ]

# Dependency graph
requires:
  - phase: 181-03
    provides: "Definiciones 3-5 completas (offline, récords, superseries) — gym_set_logs, gym_personal_records y las columnas de agrupación citadas sin re-decidirlas"
provides:
  - "Definición 6 (esquema completo: 12 tablas gym_, columnas clave/FKs/índices, índice de cobertura idx_gym_set_logs_hist, volumen, particionado, encaje con tenant-tables.ts)"
  - "Definición 7 (mapa de 8 keys de tenant_settings del módulo + 7 keys de branding, defaults, reglas de forma)"
affects:
  [
    184-catalogo-de-ejercicios,
    187-plantillas-rutina,
    189-registro-de-series,
    190-recalculo-de-records,
    182-wizard-alta-tenant,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "tenant_id NULLable + tenant_scope_key generado COALESCE(tenant_id,0) para las 4 tablas de scope mixto (gym_exercises, gym_routine_templates y sus dos hijas)"
    - "Denormalización deliberada de user_id/exercise_id/performed_at en gym_set_logs para que un único índice cubra la consulta crítica"
    - "Índice de cobertura compuesto (tenant_id, user_id, exercise_id, performed_at DESC) en vez de índices simples de una columna"
    - "Tabla gym_log_edits propia para REG-05, en vez de reusar audit_log (forense financiero, sin columnas antes/después)"
    - "gimnasio.* en tenant_settings sin cache (query directa por índice único), a diferencia de module.*.enabled"
    - "brand.subdomain NO se persiste como key — se deriva de tenants.slug"

key-files:
  created: []
  modified:
    - .docs/saas-multitenancy/08-diseno-modulo-gimnasio.md

key-decisions:
  - "12 tablas nuevas prefijo gym_: 8 gym-owned (tenantIdColumn NOT NULL DEFAULT 1) y 4 de scope mixto NULLable (gym_exercises, gym_routine_templates, gym_routine_template_days, gym_routine_template_exercises)"
  - "gym_routine_template_days y gym_routine_template_exercises denormalizan el tenant_id de su plantilla dueña (nunca se reparentan) en vez de resolver el scope subiendo por JOINs"
  - "gym_set_logs denormaliza user_id, exercise_id y performed_at aunque sean derivables de la sesión — es LA decisión de la definición, sin eso ningún índice cubre la consulta crítica"
  - "idx_gym_set_logs_hist (tenant_id, user_id, exercise_id, performed_at DESC) sirve tres consultas a la vez: historial, MAX() de récords (Def. 4) y EVO-02 (última vez)"
  - "REG-05 (log de ediciones) usa tabla propia gym_log_edits, no audit_log — audit_log es forense financiero write-only sin columnas before/after"
  - "Sin particionado en v1; umbral de revisión: decenas de millones de filas en gym_set_logs o índice fuera del buffer pool de InnoDB"
  - "gimnasio.signals.easy_streak default '3' es elección de este diseño (espeja hard_streak), el brief no da default para 'Fácil'"
  - "Los parámetros gimnasio.* NO se cachean (query directa barata por índice único); module.*.enabled sigue con su cache existente"
  - "brand.subdomain se deriva de tenants.slug, no se persiste como key en tenant_settings, para evitar dos fuentes que puedan divergir"

patterns-established:
  - "Reglas transversales de columnas/FKs escritas una sola vez para las 12 tablas, en vez de repetirlas por tabla"
  - "El argumento cuantitativo de H-1 (FK simple vs. polimórfica) se repite en la Definición 6 porque es donde más pesa (rompería el índice de cobertura)"

requirements-completed: [DIS-01]

duration: 40min
completed: 2026-08-27
---

# Phase 181 Plan 04: Definiciones 6 y 7 del doc 08 (esquema+índices, mapa de tenant_settings) Summary

**Especificó el plano de datos completo del módulo (12 tablas `gym_`, columnas clave, FKs,
índices y el índice de cobertura `idx_gym_set_logs_hist` para la consulta crítica
alumno×ejercicio) y el mapa completo de los 15 parámetros configurables del módulo en
`tenant_settings` (8 de producto + 7 de branding), con defaults, trazabilidad y reglas de
forma que ninguna fase ejecutora puede improvisar.**

## Performance

- **Duration:** ~40 min
- **Tasks:** 2/2 completadas
- **Files modified:** 1

## Accomplishments

- **Definición 6** completa: inventario de 12 tablas nuevas (`gym_exercises`,
  `gym_routine_templates` + 2 hijas, `gym_assigned_routines` + 2 hijas, `gym_sessions`,
  `gym_session_exercises`, `gym_set_logs`, `gym_personal_records`, `gym_log_edits`) con su
  scope de tenancy (8 GYM-OWNED, 4 MIXTO por H-1); columnas clave/FKs/índices por tabla al
  nivel de `03-diseno-tenant-db-layer.md`; la decisión de denormalizar `user_id`/`exercise_id`/
  `performed_at` en `gym_set_logs`; el índice de cobertura `idx_gym_set_logs_hist` con su
  justificación de orden de columnas y por qué se aparta del patrón de `completed_sessions`;
  estimación de volumen con números (96/semana, 5.000/año/alumno, 2,5 M/año para 500 alumnos)
  marcada como aritmética sobre supuestos; decisión de no particionar en v1 con umbral
  concreto; el argumento cuantitativo que refuerza H-1 (FK simple vs. polimórfica); y el
  encaje con `tenant-tables.ts` (`GYM_OWNED_TABLES` / `TENANT_MIXED_SCOPE_TABLES`) y las
  migraciones reservadas desde 0216.
- **Definición 7** completa: mecánica verificada de `tenant_settings` (KV, vocabulario
  `"true"`/`"false"` divergente de `system_settings`, cache de `module.*` existente); tabla de
  8 keys `gimnasio.*`/`module.gimnasio.enabled` con default/REQ/fuente; tabla de 7 keys
  `brand.*` con decisión explícita de que `brand.subdomain` se deriva de `tenants.slug` y no
  se persiste; y las cinco reglas de forma (namespaces, parseo con default único, defaults en
  código no en seed, decisión explícita de no cachear `gimnasio.*`, regla dura 5 del
  milestone).
- Decisión de tabla propia `gym_log_edits` (en vez de reusar `audit_log`) documentada con su
  fundamento: `audit_log` es forense financiero write-only sin columnas antes/después.

## Task Commits

1. **Tasks 1-2: Definiciones 6 y 7** - `885e2ca0` (docs) — un solo commit, ambas definiciones
   son secciones contiguas del mismo archivo y comparten la verificación conjunta del script.

## Files Created/Modified

- `.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md` — reemplazados los dos stubs
  `_PENDIENTE_` de Definición 6 y 7 por las respuestas completas (446 líneas agregadas), cada
  una cerrada con su traza de REQ IDs.

## Decisions Made

Ver `key-decisions` en el frontmatter. Todas discreción de Claude dentro de los guardrails del
brief (D-08 fija el nivel de detalle; A6/A7 del research ya anticipaban el mapa de 8 keys y el
default propio de `easy_streak`) — ninguna reabre decisiones cerradas del CONTEXT (D-01, D-02,
D-08, D-10, H-1, etc.).

## Deviations from Plan

None - plan ejecutado tal como estaba escrito. Ambas tareas se resolvieron en un solo commit
(mismo patrón que los planes 181-02 y 181-03: regiones contiguas del mismo archivo, sin
requerimiento de commits separados por task para un plan docs-only con verificación conjunta).

## Self-Check: PASSED

- `.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md` — FOUND, contiene las secciones
  `## Definición 6 —` y `## Definición 7 —` completas, sin `PENDIENTE`.
- Commit `885e2ca0` — FOUND en `git log`.
- `git diff --stat` (previo al commit) mostraba únicamente el doc 08 modificado
  (446 inserciones, 2 borrados) y `git show --stat HEAD` post-commit confirma el mismo único
  archivo.
- `pnpm exec prettier --check` sobre el doc — sale 0.
- `bash verificar-doc-08.sh` (sin `--final`) — 0 fallas, C2/C4 en verde para las 7 Definiciones.
- Grep de literales requeridos por `acceptance_criteria` (nombres de tabla, `idx_gym_set_logs_hist`
  con firma completa, `denormaliza`, `TENANT_MIXED_SCOPE_TABLES`, `tenant-tables.ts`, `0216`,
  las 8 keys `gimnasio.*`/`module.gimnasio.enabled`, las 7 keys `brand.*`, defaults `"false"`,
  `"12"`, `"24"`, `"3"`, `"14"`, `"kg"`) — todos presentes, ≥1 ocurrencia cada uno.
- `grep -n 'references(() => exercises'` sobre el doc — sin salida (ninguna FK hacia el SPOM).

## Verificación (salida completa)

```
OK: C1 - el archivo .docs/saas-multitenancy/08-diseno-modulo-gimnasio.md existe
OK: C2 - hay 7 secciones '## Definición N —' (7)
OK: C3 - hay 4 subsecciones '### H-N' (4)
OK: C4 - todas las secciones de Definición trazan a al menos un REQ ID
OK: C5 - constancia de que el-templo-app no se transforma
OK: C6 - constancia del trigger de split de repos
OK: C8 - prettier --check pasa

Resumen: 0 falla(s).
```

Exit code: 0.

Checks del plan (además del script genérico):

- REQ IDs únicos en el rango de Definición 6: **27** (≥10 requerido).
- Ocurrencias de `idx_gym_set_logs_hist`: **4** (≥1 requerido).
- REQ IDs únicos en el rango de Definición 7: **7** (≥6 requerido).
- `git status --porcelain el-templo-api`: vacío (cero migraciones, cero schema — verificado,
  ningún archivo bajo `el-templo-api/` tocado por este plan).

## Nota sobre el commit y `.gitignore`

`.docs/` está gitignored a nivel repo. `git add .docs/saas-multitenancy/08-diseno-modulo-gimnasio.md`
imprime el warning "The following paths are ignored" pero el archivo (ya tracked desde el
plan 181-01) queda staged igual — confirmado con `git diff --cached --stat` antes de commitear.
El hook `lint-staged` también falla al intentar re-stagear el archivo tras `prettier --write`
por el mismo motivo (`[FAILED] The following paths are ignored...`), pero el commit se completa
igual con el contenido correcto (446 inserciones exactas, sin archivos extra) — mismo
comportamiento ya documentado y verificado en los planes 181-02 y 181-03.
