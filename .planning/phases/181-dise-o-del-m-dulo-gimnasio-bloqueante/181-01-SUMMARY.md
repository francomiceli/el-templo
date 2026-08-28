---
phase: 181-dise-o-del-m-dulo-gimnasio-bloqueante
plan: 01
subsystem: docs
tags: [tenancy, multi-tenant, design-doc, drizzle, fastify, saas-multitenancy]

# Dependency graph
requires: []
provides:
  - "Esqueleto completo del doc `.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md` (15 secciones canónicas de nivel 2, orden fijo)"
  - "Verificador estructural determinista `verificar-doc-08.sh` (checks C1-C8, flag `--final`)"
  - "H-1 CERRADA: categoría `TENANT_MIXED_SCOPE_TABLES` + helper `tenantOrGlobalWhere` para el catálogo global+local (Opción A, tenant_id NULLable)"
  - 'H-2 CERRADA: rename `templo-module` → `feature-module` / `ModuloTemplo` → `ModuloFeature` + `"gimnasio"` en `MODULE_NAMES`'
  - "H-3 CERRADA: capa de resolución de tenant por hostname + login scoped; cierra la decisión diferida de login/dominios del README"
  - "H-4 CERRADA: trigger del split de repos re-enunciado (dispara con el primer tenant pago en tiendas, no con el nacimiento en el monorepo); constancia D-04 (el-templo-app no se transforma)"
  - "Checklist copiable de precondiciones para la fase 184"
affects:
  [
    182-diseno-alta-tenant-wizard,
    184-catalogo-ejercicios-backend,
    187-plantillas-rutina,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Verificador bash determinista sin `set -e` (acumula fallas, reporta todas, exit code al final)"
    - "Marcador reservado `PENDIENTE` para stubs de secciones que completan olas siguientes del mismo doc"

key-files:
  created:
    - .docs/saas-multitenancy/08-diseno-modulo-gimnasio.md
    - .planning/phases/181-dise-o-del-m-dulo-gimnasio-bloqueante/verificar-doc-08.sh
  modified: []

key-decisions:
  - "H-1: Opción A — tabla única con tenant_id NULLable (NULL = global) para el catálogo de ejercicios y las plantillas de rutina globales; categoría TENANT_MIXED_SCOPE_TABLES + helper tenantOrGlobalWhere"
  - 'H-2: Opción B1 — rename templo-module→feature-module / ModuloTemplo→ModuloFeature; "gimnasio" entra a MODULE_NAMES como módulo comercial único'
  - "H-3: resolución de tenant por hostname (anterior a attachScope) resuelve a la vez el login cross-tenant (T-173-15) y DEFAULT_PUBLIC_TENANT_ID; host no resoluble se rechaza, nunca fallback a tenant 1; cierra la decisión diferida del README"
  - "H-4: el trigger del split de repos se redefine — lo dispara el primer tenant pago publicado en tiendas, no el nacimiento del código en el monorepo"

requirements-completed: [DIS-01, DIS-02]

# Metrics
duration: ~25min
completed: 2026-08-27
---

# Phase 181 Plan 01: Esqueleto del doc 08 + Precondiciones de plataforma (H-1..H-4) Summary

**Doc `08-diseno-modulo-gimnasio.md` fundado con sus 15 secciones canónicas y las cuatro precondiciones de plataforma (H-1..H-4) firmadas: categoría de tabla de scope mixto, rename de categoría de manifiesto, resolución de tenant por hostname que cierra el login cross-tenant, y trigger del split de repos re-enunciado.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-08-27
- **Tasks:** 3/3 completadas
- **Files modified:** 2 (uno nuevo doc + un script nuevo)

## Accomplishments

- Fundado `.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md` con las 15 secciones de nivel 2 en el orden canónico exacto que fija el plan, con stubs `_PENDIENTE — se completa en el plan 181-0X._` para las secciones que completan las olas 2-6.
- Creado `verificar-doc-08.sh`: script bash determinista (`set -uo pipefail`, sin `set -e`) con 8 checks (C1 existencia, C2 conteo de 7 Definiciones, C3 conteo de 4 H-N, C4 trazabilidad REQ por definición vía `awk`, C5 constancia `el-templo-app` no se transforma, C6 constancia split de repos, C7 solo con `--final` ausencia de `PENDIENTE`, C8 `prettier --check` con degradación a `WARN` si el binario no está disponible). El script solo lee el doc, nunca lo modifica.
- H-1 **CERRADA**: decide Opción A (tabla única, `tenant_id` NULLable, NULL=global) para el catálogo de ejercicios y —explícitamente, la misma decisión— para las plantillas de rutina globales (RUT-01). Nombra los artefactos reales: categoría `TENANT_MIXED_SCOPE_TABLES` en `tenant-tables.ts`, helper `tenantOrGlobalWhere` en `tenant.ts`, exención nominal en sentinel/lint.
- H-2 **CERRADA**: decide Opción B1 (rename `templo-module`→`feature-module`, `ModuloTemplo`→`ModuloFeature`) + `"gimnasio"` como módulo comercial único en `MODULE_NAMES`.
- H-3 **CERRADA**: decide una capa de resolución de tenant por hostname anterior a `attachScope`, que resuelve a la vez el login cross-tenant (T-173-15) y la deuda de `DEFAULT_PUBLIC_TENANT_ID`; prescribe validación estricta de `Host` contra `tenants.slug` (rechazo si no resuelve, prohibido el fallback `?? 1`); cierra formalmente la decisión diferida del README sobre login/dominios/unicidad de email.
- H-4 **CERRADA**: re-enuncia el trigger del split de repos con texto normativo que reemplaza al del README (dispara con el primer tenant pago publicado en tiendas, no con el nacimiento del código en el monorepo); deja constancia explícita D-04 (`el-templo-app` NO se transforma).
- Checklist copiable de precondiciones (14 ítems `[ ]`, agrupados por H-1..H-4, cada uno con la fase que lo ejecuta) cierra la sección de Precondiciones de plataforma.

## Task Commits

Cada tarea se commiteó atómicamente en la rama `feat/181-diseno-modulo-gimnasio` del worktree `/home/franco/projects/et-181`:

1. **Task 1: Crear el esqueleto del doc 08 y el verificador estructural** - `73343c4d` (docs)
2. **Task 2: Escribir H-1 (catálogo de scope mixto) y H-2 (categoría de manifiesto)** - `9fdaaf53` (docs)
3. **Task 3: Escribir H-3 (resolución de tenant y login) y H-4 (trigger de split) + checklist** - `b1587217` (docs)

No hubo commit de metadata GSD separado (STATE.md/ROADMAP.md/REQUIREMENTS.md) porque el plan no incluyó ese paso en el checkout compartido — ver nota en "Deviations" sobre `.docs/` y push.

## Files Created/Modified

- `.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md` (322 líneas) - el único entregable de producto de la fase: doc de diseño con las 15 secciones canónicas; Precondiciones de plataforma completa (H-1..H-4 + checklist); Definiciones 1-7, DIS-02, Seguridad, Frontera, Trazabilidad y Decisiones heredadas quedan en stub `PENDIENTE` para los planes 181-02 a 181-06.
- `.planning/phases/181-dise-o-del-m-dulo-gimnasio-bloqueante/verificar-doc-08.sh` (ejecutable) - verificador estructural determinista, sin dependencias de red ni de MySQL, consumido por esta y las siguientes olas del plan.

## Decisions Made

- **H-1 (Opción A):** catálogo global+local como una sola tabla con `tenant_id` NULLable. Ver tabla de opciones A/B/C en el doc. Misma decisión aplica a plantillas de rutina globales (RUT-01).
- **H-2 (Opción B1):** rename de categoría de manifiesto en vez de mantener `templo-module` semánticamente falso para el módulo Gimnasio.
- **H-3:** D-06 (subdominio por gimnasio) resuelve dos deudas a la vez — login cross-tenant y `DEFAULT_PUBLIC_TENANT_ID`. Login de `el-templo-admin`/`el-templo-app` queda sobre tenant 1 en v1 hasta que su hostname entre al esquema.
- **H-4:** redefinición (b) del trigger de split — dispara con tenant pago en tiendas, no con el código en el monorepo. Se prefirió sobre la opción (a) por ser la única con criterio verificable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `.docs/` está gitignored a nivel de repo (`# Local documentation (not tracked)`) pero el plan exige commitear el doc 08**

- **Found during:** preparación del commit de Task 1.
- **Issue:** `.gitignore` raíz excluye todo `.docs/` como "documentación local, no trackeada" — nunca hubo un commit histórico bajo `.docs/saas-multitenancy/*` en todo el repo (verificado con `git log --all -- '.docs/saas-multitenancy/*'`, cero resultados). El plan, sin embargo, declara el doc 08 en `files_modified` y las instrucciones del prompt piden commitearlo explícitamente como el entregable de producto de la fase — y por diseño de la fase, el doc tiene que sobrevivir a la creación de NUEVOS worktrees para las fases 182-192 (worktrees nuevos solo heredan archivos trackeados por git, nunca los `.gitignore`d de un worktree hermano).
- **Fix:** usar `git add -f` para forzar el tracking de este archivo puntual (no se tocó `.gitignore` ni se cambió el comportamiento para el resto de `.docs/`). Documentado acá explícitamente porque es una desviación de una convención de repo deliberada y de larga data — **recomiendo que el usuario confirme esta decisión** antes de que la fase 182 dependa de que este archivo esté commiteado.
- **Files modified:** `.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md` (con `-f` en los 3 commits de esta plan).
- **Verification:** `git show HEAD:.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md` existe y coincide byte a byte con el archivo en disco tras cada commit; `git log --all -- '.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md'` ahora muestra los 3 commits de esta plan.
- **Committed in:** `73343c4d`, `9fdaaf53`, `b1587217`.

**2. [Rule 3 - Blocking] `node_modules` no existía en el worktree → el pre-commit hook (Husky+lint-staged) fallaba con `ERR_MODULE_NOT_FOUND: lint-staged`**

- **Found during:** primer intento de commit de Task 1.
- **Issue:** el worktree `et-181` se creó sin `pnpm install` en la raíz. Sin `node_modules`, el hook `.husky/pre-commit` no puede importar `lint-staged` y el commit aborta antes de tocar el índice de git.
- **Fix:** corrí `pnpm install` en la raíz del worktree (sin argumentos — no agrega ni actualiza ningún paquete; `package.json` ya declara `husky`/`lint-staged`/`prettier` como devDependencies, y no hay `pnpm-lock.yaml` trackeado). Es el paso de setup documentado como estándar en la skill `el-templo-build-and-run` §3.0 ("Root (pre-commit hooks)"), distinto de la prohibición de `pnpm add`/`pnpm update`/bump de versiones de la skill `el-templo-change-control` §6. Los 57 paquetes se resolvieron 100% desde el store local de pnpm (cero descargas de red).
- **Files modified:** ninguno trackeado — solo pobló `node_modules/` (gitignored) en este worktree.
- **Verification:** `pnpm exec prettier --check` corre y pasa; los 3 commits de esta plan pasaron el pre-commit hook real (Husky + lint-staged ejecutó `prettier --write` sobre el doc en cada uno, sin cambios porque ya estaba formateado).
- **Committed in:** N/A (no genera cambios trackeados).

---

**Total deviations:** 2 auto-fixed (2 blocking). **Impacto:** ambos son correcciones de infraestructura/entorno necesarias para que el entregable de la fase exista donde el resto de la fase (182-192) lo necesita, y para poder commitear en absoluto. Ninguna tocó código de producto ni cambió el `.gitignore`. La desviación #1 (forzar el tracking de `.docs/08-...`) es la única con impacto de diseño y se señala explícitamente para revisión humana.

## Issues Encountered

Ninguno más allá de las dos desviaciones documentadas arriba. Todos los `read_first` de las 3 tareas se verificaron contra el código real del worktree (no contra los docblocks, que están stale en dos lugares: el conteo de `GYM_OWNED_TABLES`, verificado en 91 entradas reales vs. "88" del comentario, y `ENTRADAS_BASELINE = 389` vs. "374 rutas" de un comentario viejo en `iso-01-manifiesto.test.ts`). El doc 08 no repite ninguno de los dos números stale.

## User Setup Required

None - no external service configuration required. **Sí requiere una decisión del usuario:** confirmar que forzar (`git add -f`) el tracking de `.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md` pese al `.gitignore` de `.docs/` es la resolución correcta (ver Deviation #1) — la alternativa sería que el doc 08 viva fuera de `.docs/` (p. ej. en `.planning/phases/181-.../`) si se prefiere respetar el gitignore a rajatabla.

## Next Phase Readiness

- Las Tasks 2-6 de este mismo plan wave (181-02 a 181-06) pueden completar las Definiciones 1-7, DIS-02, Seguridad, Frontera, Trazabilidad y Decisiones heredadas sobre este esqueleto sin re-litigar H-1..H-4.
- La fase 184 (catálogo de ejercicios) tiene los artefactos exactos que debe crear: `TENANT_MIXED_SCOPE_TABLES`, `tenantOrGlobalWhere`, rename de manifiesto, `"gimnasio"` en `MODULE_NAMES` — nombrados por su identificador real de repo, no por descripción.
- La fase 182 (wizard de alta) tiene la precondición H-3 (resolución de tenant por host + login scoped) como bloqueante explícito antes de aprovisionar subdominios.
- **Bloqueo pendiente para el cierre de la fase 181:** el checkpoint humano `checkpoint:human-verify` (OK de Franco, D-09) no se ejecutó en esta plan — es responsabilidad del plan que cierre la fase completa (181-06) o de una revisión aparte, según lo defina el orquestador.
- **Pendiente de decisión humana:** confirmar la resolución de Deviation #1 (`.docs/` gitignored vs. commit forzado del doc 08).

---

_Phase: 181-dise-o-del-m-dulo-gimnasio-bloqueante_
_Completed: 2026-08-27_
