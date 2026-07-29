# Phase 171: Backstop — manifiesto de rutas fail-closed y fixtures 2-tenant - Context

**Gathered:** 2026-07-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Dos entregables, ambos en `el-templo-api`:

1. **ISO-01 — Manifiesto de rutas fail-closed:** `test/tenant-manifest.ts` clasifica el
   100% de las rutas registradas hoy en `tenant-scoped` / `global` / `templo-module`, y un
   test cruza el manifiesto contra lo que el hook `onRoute` de Fastify observa en runtime.
   Ruta nueva sin clasificar = test rojo en CI que la nombra (demostrado, no asumido).
2. **ISO-02 — Fixtures 2-tenant:** la infraestructura de tests puede sembrar 2 gimnasios
   completos, y `createStaffUser` y afines aceptan el tenant como parámetro. La suite
   existente sigue verde sin tocar sus expectativas.

NO entra en esta fase: la batería de aislamiento por ruta (ISO-03, fase 172+), el
enforcement `requireModule` de módulos (fase 176), y cualquier adopción de módulo.
Cero migraciones esperadas (si alguna apareciera, reservar desde 0197).

</domain>

<decisions>
## Implementation Decisions

### Forma del manifiesto

- **D-01:** **Entradas explícitas por ruta exacta** (method + path), agrupadas por módulo
  en el archivo. ~300 entradas escritas una sola vez en esta fase; toda ruta nueva agrega
  su línea a mano — esa edición ES la "decisión consciente" que pide el goal. **Sin reglas
  por prefijo ni comodines**: una regla comodín clasificaría rutas futuras sin que nadie
  lo piense y vaciaría el criterio 2 del ROADMAP.
- **D-02:** Toda entrada **`global` lleva motivo escrito obligatorio** al lado (mismo
  espíritu que las exenciones `/* tenant-safe: <motivo> */` del lint de la 170). Las
  `tenant-scoped` no llevan anotación: son el default masivo. Las `templo-module` heredan
  el criterio de revisión de D-03/D-05 (lista corta revisada por humano).

### Revisión humana de la clasificación inicial

- **D-03:** **Checkpoint bloqueante** donde Franco revisa SOLO las listas cortas y
  peligrosas: `global` (~10-20 rutas, con sus motivos) y `templo-module` (~30-50). La masa
  `tenant-scoped` va sin revisión: equivocarse hacia tenant-scoped sobra protección, no
  falta.
- **D-04:** **Ruta dudosa → al checkpoint**, en una sección aparte con la recomendación
  del clasificador y su porqué (ej. de zonas grises: blog, academy, franchise,
  app-landing). Nada dudoso se clasifica solo.

### Fixtures del tenant 2

- **D-05:** Siembra **opt-in por archivo de test** (helper explícito, p. ej.
  `seedSecondTenant`) — formaliza lo que la fase 169 ya hacía a mano con tenants ad-hoc
  (90169/90269/90369/90469). Los ~140 archivos existentes no ven el tenant 2 y sus
  conteos no cambian: el criterio 4 se cumple por construcción. NO se siembra en el setup
  global.
- **D-06:** El gimnasio 2 es un **espejo mínimo fijo y determinístico**: 1 sede, 1 admin,
  1 coach, 2 socios, 1 plan, 1 schedule. Suficiente para probar aislamiento en cualquier
  ruta y barato de sembrar (los tests MySQL ya tardan ~100 s/archivo). Si una batería
  necesita más volumen, lo agrega ella misma.

### Categoría templo-module

- **D-07:** Los features exclusivos de El Templo (SPOM, gladius, academy, tree-editor,
  etc.) **se etiquetan `templo-module` YA en esta fase**, aunque el enforcement
  `requireModule` llegue en la 176. La decisión consciente se toma una sola vez (y Franco
  la revisa en el checkpoint D-03); la 176 solo agrega enforcement a rutas ya marcadas.
  Beneficio adicional: las fases 172-175 no incluyen esas rutas en la batería de
  aislamiento sin necesidad.

### Claude's Discretion

- Identificación exacta de una ruta (formato de la clave method+path, manejo de prefijos
  de plugins), estructura interna del archivo del manifiesto, y wording de los mensajes
  de rojo (deben nombrar la ruta faltante y decir qué hacer — seguir el precedente de los
  mensajes del lint 170).
- Cómo resolver la limpieza del tenant 2 entre tests (trampa conocida: `cleanAllTestData`
  es global-admin y `branches` no está en `TABLES_TO_CLEAN` — ver code_context). El
  patrón `limpiarRastro()` del 169-06 es el precedente.
- Dónde vive el test del manifiesto y cómo se integra a la suite/CI existente.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño cerrado del milestone (no re-litigar)

- `.docs/saas-multitenancy/03-diseno-tenant-db-layer.md` §"Capa 5" — el mecanismo exacto
  de esta fase: hook `onRoute` test-only + manifiesto versionado + 3 categorías +
  fail-closed. Diseño CERRADO.
- `.docs/saas-multitenancy/04-mecanismo-modulos.md` — qué significa `templo-module` y la
  regla "toda ruta `templo-module` DEBE tener `requireModule`" (enforcement en fase 176,
  pero la etiqueta se pone acá — D-07).
- `.docs/saas-multitenancy/06-estrategia-migracion.md` §"T4 — Backstop" — encaje de esta
  fase en la secuencia del milestone.

### Requisitos y fase

- `.planning/REQUIREMENTS.md` — ISO-01 e ISO-02 (líneas 54-55).
- `.planning/ROADMAP.md` §"Phase 171" — goal + 4 success criteria.

### Precedentes de fases anteriores a seguir

- `.planning/phases/170-detecci-n-autom-tica-sentinel-de-pool-mysql2-lint-en-ci/170-CONTEXT.md`
  — D-16 (baseline one-shot sin regenerador commiteado) y el estilo de mensajes de rojo
  accionables del lint.
- `el-templo-api/src/modules/shared/tenant.ts` — los helpers de la 169
  (`tenantWhere`/`tenantValues`/`assertTenant`) que los fixtures usan para sembrar por
  tenant.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `el-templo-api/test/helpers.ts` — `createStaffUser(app, data)` (hoy recibe `branchId`,
  no sabe de tenants), `createTestMember`, `createTestPlan`, `assignTestPlan`,
  `cleanAllTestData`. Son los helpers que ISO-02 extiende con tenant como parámetro.
- `el-templo-api/src/app.ts` — punto único donde se registran todos los plugins/rutas
  (~35 `app.register(...)`); el hook `onRoute` se cuelga acá (o en `createTestApp` de
  helpers) y ve todo.
- Convención de ids de tenants de test: 90169/90269/90369/90469 ya usados por la 169 —
  los fixtures nuevos siguen la serie (un id ≠ los ya usados; dos archivos con el mismo
  id se pisan con `isolate: false`).

### Established Patterns

- **Fail-closed con mensaje accionable** (lint 170, gates 169-04/169-08): el rojo nombra
  al incumplidor exacto y dice qué hacer. El test del manifiesto sigue ese estilo.
- **Baseline one-shot** (D-16 de la 170): la clasificación inicial de ~300 rutas se
  genera una vez; no se commitea un regenerador que permita "refrescar" la decisión.
- **Motivo escrito junto a la excepción** (exenciones tenant-safe): D-02 lo replica para
  las rutas `global`.

### Integration Points

- El test del manifiesto corre dentro de la suite de integración existente (CI ya la
  ejecuta contra MySQL real); no requiere step nuevo de CI.
- **Trampas conocidas para los fixtures** (de 168-REVIEW y 169-06): `cleanAllTestData`
  limpia TODO sin filtro de tenant (morderá si un archivo mezcla tenants y espera
  supervivencia selectiva); `branches` NO está en `TABLES_TO_CLEAN`, así que las sedes
  sobreviven entre tests y la fila de `tenants` no se puede borrar mientras una sede la
  referencie (`fk_branches_tenant`) — borrar sedes primero, gimnasio después
  (`limpiarRastro()` del 169-06). `aura_config.source_type` es unique GLOBAL: dos
  tenants no pueden compartir `source_type` en un test.
- Los tests unitarios pagan ~96 s de provisioning MySQL por `test/setup.ts` global
  (hallazgo 169-07) — si el test del manifiesto puede ser unitario puro, considerar ese
  costo al ubicarlo.

</code_context>

<specifics>
## Specific Ideas

- El manifiesto como "decisión consciente por ruta": Franco valida explícitamente que el
  costo aceptado es ~300 líneas una vez + 1 línea por ruta nueva, a cambio de que ninguna
  ruta se clasifique implícitamente.
- La revisión humana se concentra donde está el riesgo (global/templo-module); la masa
  tenant-scoped no se revisa.

</specifics>

<deferred>
## Deferred Ideas

### Reviewed Todos (not folded)

- `v51-milestone-data-rollout.md` (poblar `milestone_exercise_id`) — matcheó por keywords
  genéricas; sin relación con el backstop de tenancy. Queda pendiente donde estaba.

</deferred>

---

*Phase: 171-Backstop — manifiesto de rutas fail-closed y fixtures 2-tenant*
*Context gathered: 2026-07-29*
