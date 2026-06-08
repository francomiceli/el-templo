---
phase: 134-rbol-del-miembro-estados-de-nodo-y-criterio-de-avance-objeti
verified: 2026-06-08T12:50:51Z
status: human_needed
score: 13/13 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Abrir Mi Árbol en el member app con un miembro real (nivel alfa/delta) y confirmar que cada nodo muestra: ícono de estado correcto (✅/🔥/⚪/🔒), dl numérico, etiqueta de banda (alfa/delta/sigma/omega/spartan) con color de marca, y que el anillo reza 'X% a tu alcance'."
    expected: "Los 4 estados se diferencian visualmente. El anillo muestra el % correcto. El disclaimer del anillo vs. Dominado es visible."
    why_human: "Cambio puramente visual de frontend. No existe vue-tsc en este monorepo (binario no instalado; typecheck de SFCs corre en CI). La apariencia solo se puede validar en el device."
  - test: "Abrir el player en una sesión activa (slides CON y luego ISO) y verificar que 'Objetivo: 3×8 (reinicia en 3×5)' aparece junto a los botones de ajuste en slides CON/EXC, y 'Objetivo: 3×30s' en slides ISO. Confirmar que los botones 'más fácil' / 'más difícil' siguen funcionando idéntico a antes."
    expected: "El texto de criterio aparece solo en slides reales (v-if canAdjustCurrentSlide). La mecánica de ajuste de fase 131 está intacta."
    why_human: "Cambio visual en el player. No hay tests de integración para UI del player. Requiere sesión activa con distintos tipos de contracción."
  - test: "Ejecutar el suite de integración en CI: pushear staging a origin/staging y confirmar que los ~8 nuevos tests de tree-progress (S1–S8) pasan en verde contra MySQL real."
    expected: "Suite CI verde. 0 regresiones en los tests existentes (401, categorías, %, scope isolation, A/B/C phase 131)."
    why_human: "Por política del proyecto (MEMORY) el suite de integración NO se corre localmente. Requiere push a origin/staging con confirmación explícita del usuario."
---

# Phase 134: Árbol del miembro — estados de nodo y criterio de avance objetivo (member app) — Verification Report

**Phase Goal:** Llevar la calidad del árbol a la experiencia del miembro. R6: estados de nodo (Bloqueado/Disponible/En progreso/Dominado) + bandas de dificultad en Mi Árbol. R5: criterio de avance objetivo (3×8 dinámico / 3×30s isométrico) en el player, complementando el tap manual de fase 131 sin reemplazarlo.
**Verified:** 2026-06-08T12:50:51Z
**Status:** human_needed
**Re-verification:** No — verificación inicial

---

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                                            | Status                                          | Evidence                                                                                                                                                                                                                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | GET /api/tree-progress/me retorna `state` por nodo con valores dominado\|en_progreso\|disponible\|bloqueado                                                      | ✓ VERIFIED                                      | `TreeNode.state: NodeState` (service.ts L78-87); `treeNodeSchema` declara `state: { type: "string" }` (schemas.ts L20-21); `NodeState` type exportado (service.ts L75)                                                                                                                                                                 |
| 2   | GET /api/tree-progress/me retorna `band` por nodo con valores alfa\|delta\|sigma\|omega\|spartan                                                                 | ✓ VERIFIED                                      | `TreeNode.band: ContentLevel` (service.ts L86); `bandForDl()` calcula el band desde `LEVEL_LINEAR_MIN` sin hardcodear (service.ts L149-155); schemas.ts L22 declara `band`                                                                                                                                                             |
| 3   | dominado es evidence-only: dl≤ceiling solo NUNCA domina (D-01)                                                                                                   | ✓ VERIFIED                                      | service.ts L428-431: `dominado = dominatedExerciseIds.has(id) \|\| completedExerciseIds.has(id)` — el branch `dl <= ceiling` no aparece. Test S1 afirma explícitamente que ningún nodo es dominado solo por ceiling                                                                                                                    |
| 4   | Exactamente un en_progreso por ruta (el primer nodo no-dominado con prereqs satisfechos, D-02)                                                                   | ✓ VERIFIED                                      | service.ts L485-490: segundo pase por ruta ordenada, `frontier = sortedNodes.find(n => n.state === "disponible"); if (frontier) frontier.state = "en_progreso"`. Test S2 verifica un solo frontier por ruta                                                                                                                            |
| 5   | Gating híbrido D-06: bloqueado cuando dl>ceiling Y un prereq del grafo no dominado; disponible cuando dl≤ceiling O todos los prereqs del grafo dominados         | ✓ VERIFIED                                      | service.ts L434-439: `allPrereqsDominated = prereqIds === undefined \|\| Array.from(prereqIds).every(id => dominatedExerciseIds.has(id))`. Tests S3 (bloqueado) y S4 (D-06 unlock). Aristas cargadas via `loadEdges()` y mapeadas con `buildPrereqMap()`                                                                               |
| 6   | Las aristas son efectivamente cargadas de `exercise_progressions` (loadEdges wired al Promise.all)                                                               | ✓ VERIFIED                                      | service.ts L386-393: `[nodes, completedExerciseIds, dominatedExerciseIds, edges] = await Promise.all([loadGraphNodes, ..., loadEdges(db)])`. `loadEdges` selecciona de `schema.exerciseProgressions` (service.ts L325-337)                                                                                                             |
| 7   | `reached` y `percent` no cambian de fórmula — los estados son una capa separada (D-05)                                                                           | ✓ VERIFIED                                      | service.ts L422-425: fórmula `reached = dl <= ceiling \|\| completedExerciseIds.has \|\| dominatedExerciseIds.has` sin modificar. Test S8 reproduce el assert de 50% legacy con la capa de estados activa                                                                                                                              |
| 8   | schemas.ts declara `state` y `band` en treeNodeSchema (Fastify no los stripea)                                                                                   | ✓ VERIFIED                                      | schemas.ts L20-21: `state: { type: "string" }` y `band: { type: "string" }` en `treeNodeSchema`. Comentario explica la razón (L17-19)                                                                                                                                                                                                  |
| 9   | types.ts del member app espeja el mismo contrato (state + band como uniones exactas)                                                                             | ✓ VERIFIED                                      | types.ts L75-76: `state: 'dominado' \| 'en_progreso' \| 'disponible' \| 'bloqueado'` y `band: 'kairos' \| 'alfa' \| 'delta' \| 'sigma' \| 'omega' \| 'spartan'`. Sin lógica derivada en el store                                                                                                                                       |
| 10  | SubfamilyProgressRow.vue renderiza ícono+color por estado, dl numérico, y etiqueta de banda (D-08)                                                               | ✓ VERIFIED                                      | SubfamilyProgressRow.vue L29-39: `STATE_META[node.state].icon/color`, `dl{{ node.dificultadLineal }}`, `BAND_COLOR[node.band]`. `STATE_META` y `BAND_COLOR` son tablas de presentación — no derivan estado (D-05). Sin azul (único match "blue" es el comentario "NO blue")                                                            |
| 11  | El % del anillo se re-etiqueta como "a tu alcance" (D-05); la fórmula no cambia                                                                                  | ✓ VERIFIED                                      | SubfamilyProgressRow.vue L5: `{{ subfamily.percent }}% a tu alcance`. TreeCategorySection.vue L17: caption `a tu alcance`. MiArbol.vue L6-10: disclaimer que aclara anillo (alcance) ≠ verde Dominado (maestría)                                                                                                                       |
| 12  | BlockProgressionView.vue deriva el criterio de la contracción en runtime (ISO→3×30s, CON/EXC→3×8), junto al adjust row, sin tocar la mecánica de fase 131 (D-07) | ✓ VERIFIED                                      | BlockProgressionView.vue L516-518: `advanceCriterion = contraction === 'ISO' ? 'Objetivo: 3×30s' : 'Objetivo: 3×8 (reinicia en 3×5)'`. Renderizado en L96 dentro del mismo `v-if="canAdjustCurrentSlide"`. `onAdjust`/`canAdjustCurrentSlide` no modificados. Sin migración, sin columna nueva                                         |
| 13  | allPrereqsDominated también incluye prereqs dominados vía completed session (completedExerciseIds), no solo vía exercise_adjustments (dominatedExerciseIds)      | ✓ VERIFIED (fixed post-verify, commit 7e41ff9b) | Se extrajo el helper compartido `isDominated(id) = dominatedExerciseIds.has(id) \|\| completedExerciseIds.has(id)` y se usa tanto para el estado del nodo como para el gating de prereqs (service.ts). Test S9 añadido: un prereq dominado vía sesión completada desbloquea el nodo downstream (en_progreso, no bloqueado). tsc limpio |

**Score:** 13/13 truths verificadas (Truth #13 corregida post-verificación, commit 7e41ff9b)

---

### Observaciones sobre Truth #13

**Inconsistencia menor en D-06 para prereqs dominados via completed session:**

La función `dominado` de un nodo (service.ts L429-431) correctamente incluye ambas señales de D-01:

```typescript
const dominado =
  dominatedExerciseIds.has(node.exerciseId) ||
  completedExerciseIds.has(node.exerciseId);
```

Pero `allPrereqsDominated` (service.ts L435-437) solo verifica `dominatedExerciseIds`:

```typescript
Array.from(prereqIds).every((id) => dominatedExerciseIds.has(id));
```

**Consecuencia práctica:** Si un prereq fue completado en sesión (branch b, completedExerciseIds) pero el miembro nunca tapeó "dominado" en el ajuste (exercise_adjustments), el nodo downstream permanecerá `bloqueado` aunque el prereq esté marcado como `dominado` en el árbol. Es una inconsistencia interna entre los dos usos de "dominado", pero el impacto real es bajo:

- En la práctica, los miembros que completan una sesión con un ejercicio probablemente también lo registren como dominado via el tap de ajuste.
- Puede corregirse con `dominatedExerciseIds.has(id) || completedExerciseIds.has(id)` en L437 — cambio de una línea, sin migración.
- Clasificado como WARNING (no BLOCKER) porque la fase sigue siendo coherente con D-01 para el estado del nodo en sí; solo el gating de prereqs es ligeramente más estricto de lo esperado.

---

### Required Artifacts

| Artifact                                                                    | Expected                                                       | Status     | Detalles                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/modules/tree-progress/service.ts`                        | state + band + edge load en buildMemberTree                    | ✓ VERIFIED | `loadEdges()`, `buildPrereqMap()`, `bandForDl()`, `NodeState`, `TreeNode.state/band`, segundo pase frontier — todo presente y wired                                                                                          |
| `el-templo-api/src/modules/tree-progress/schemas.ts`                        | state + band en treeNodeSchema                                 | ✓ VERIFIED | Líneas 20-22 del schema: `state` y `band` declarados                                                                                                                                                                         |
| `el-templo-api/test/tree-progress/member-tree.test.ts`                      | 8 tests S1–S8 cubriendo los 4 estados, D-01, D-02, D-06, banda | ✓ VERIFIED | Tests S1–S8 presentes. Cobertura: dl≤ceiling nunca domina (S1), frontier por ruta (S2), bloqueado (S3), D-06 unlock (S4), latest-per-node bajado (S5), dominado por sesión (S6), banda (S7), reached/percent invariante (S8) |
| `el-templo-app/src/modules/progression/types.ts`                            | Espejo de TreeNode con state + band                            | ✓ VERIFIED | L75-76: uniones exactas idénticas al contrato backend                                                                                                                                                                        |
| `el-templo-app/src/modules/progression/components/SubfamilyProgressRow.vue` | Render state/band/dl verbatim, % re-etiquetado                 | ✓ VERIFIED | STATE_META + BAND_COLOR (presentación pura). Sin derivación de estado. "a tu alcance" en header                                                                                                                              |
| `el-templo-app/src/modules/progression/components/TreeCategorySection.vue`  | Ring re-etiquetado                                             | ✓ VERIFIED | Caption "a tu alcance" junto al anillo circular                                                                                                                                                                              |
| `el-templo-app/src/modules/progression/pages/MiArbol.vue`                   | Disclaimer anillo ≠ dominado                                   | ✓ VERIFIED | L6-10: disclaimer explícito sobre la distinción alcance vs. maestría                                                                                                                                                         |
| `el-templo-app/src/modules/training/components/BlockProgressionView.vue`    | advanceCriterion derivado de contraction                       | ✓ VERIFIED | Computed L516-518, renderizado L96 dentro de v-if canAdjustCurrentSlide                                                                                                                                                      |

---

### Key Link Verification

| From                       | To                                 | Via                                                | Status  | Detalles                                                                 |
| -------------------------- | ---------------------------------- | -------------------------------------------------- | ------- | ------------------------------------------------------------------------ |
| `buildMemberTree`          | `exercise_progressions` (aristas)  | `loadEdges` en Promise.all                         | ✓ WIRED | service.ts L386-393: 4 entries en Promise.all incluyendo `loadEdges(db)` |
| `treeNodeSchema`           | `TreeNode.state/band`              | Fastify response schema                            | ✓ WIRED | schemas.ts L20-22 declara ambos campos                                   |
| `SubfamilyProgressRow.vue` | `TreeNode.state / TreeNode.band`   | `STATE_META[node.state]` / `BAND_COLOR[node.band]` | ✓ WIRED | Template L29-39 usa verbatim los campos del server                       |
| `BlockProgressionView.vue` | `currentSlideExercise.contraction` | `advanceCriterion` computed                        | ✓ WIRED | L516: `currentSlideExercise.value?.contraction === 'ISO'`                |

---

### Data-Flow Trace (Level 4)

| Artifact                   | Data Variable             | Fuente                                                              | Produce datos reales                                        | Status    |
| -------------------------- | ------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------- | --------- |
| `SubfamilyProgressRow.vue` | `node.state`, `node.band` | `GET /api/tree-progress/me` → `buildMemberTree` → DB queries reales | Sí — 4 queries a MySQL (nodes, completed, dominated, edges) | ✓ FLOWING |
| `BlockProgressionView.vue` | `advanceCriterion`        | `currentSlideExercise.contraction` (ya cargado en el player)        | Sí — derivado de datos de sesión real                       | ✓ FLOWING |

---

### Behavioral Spot-Checks

Step 7b SKIPPED — el suite de integración corre en CI, no localmente (política del proyecto, MEMORY). Typecheck local es el único gate automatizable sin push. Los commits existen en el repositorio local y el código está en `staging` sin pushear a origin.

---

### Probe Execution

No hay probes declarados para esta fase. Step 7c: N/A.

---

### Requirements Coverage

| Requirement | Plan           | Descripción                              | Status      | Evidencia                                                                                                                         |
| ----------- | -------------- | ---------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| R6          | 134-01, 134-02 | Estados de nodo + bandas en Mi Árbol     | ✓ SATISFIED | Backend (service.ts, schemas.ts) + frontend (types.ts, SubfamilyProgressRow.vue, TreeCategorySection.vue, MiArbol.vue) — completo |
| R5          | 134-03         | Criterio de avance objetivo en el player | ✓ SATISFIED | `advanceCriterion` en BlockProgressionView.vue — sin migración, derivado de contraction                                           |

---

### Anti-Patterns Found

| Archivo | Línea | Patrón | Severidad | Impacto                                         |
| ------- | ----- | ------ | --------- | ----------------------------------------------- |
| Ninguno | —     | —      | —         | Sin deuda, sin console.log, sin `any`, sin azul |

**Commits verificados en git log:** `874c87f0`, `55ce23c8`, `8ceab4b0` (plan 01), `da8f9318`, `d05ac9b1` (plan 02), `79840720` (plan 03).

**Sin migraciones nuevas:** última migración es 0145 (fase anterior). Correcto — D-07 no requería schema changes.

---

### Human Verification Required

#### 1. UAT visual de Mi Árbol (member app)

**Test:** Abrir Mi Árbol en el member app con un miembro real (nivel alfa o delta) y revisar cada nodo de al menos una ruta con los 4 estados posibles.
**Expected:** Los 4 estados se diferencian visualmente (✅ Dominado en verde, 🔥 En Progreso en terracota, ⚪ Disponible en gris neutro, 🔒 Bloqueado con opacidad reducida). Cada nodo muestra `dl{n}` y la etiqueta de banda con color. El header de ruta reza `XX% a tu alcance`. El anillo circular muestra el caption "a tu alcance". El disclaimer sobre anillo vs. Dominado es visible al inicio de la página.
**Why human:** Cambio puramente visual de frontend. El binario `vue-tsc` no está instalado en el monorepo (el typecheck de SFCs corre en el build de Quasar / CI). La apariencia solo se verifica en device o emulador.

#### 2. UAT del criterio de avance en el player

**Test:** En el player, navegar a un slide de tipo ISO (ejercicio isométrico) y luego a uno de tipo CON o EXC. Confirmar el texto de criterio y que los botones de ajuste siguen respondiendo.
**Expected:** Slide ISO: aparece `"Objetivo: 3×30s"` sobre los botones de ajuste. Slide CON/EXC: aparece `"Objetivo: 3×8 (reinicia en 3×5)"`. Los botones "más fácil" y "más difícil" funcionan idéntico a fase 131 (sin regresión). El criterio NO aparece en slides de movilidad ni cuando se revisan bloques anteriores.
**Why human:** Cambio visual en el player. Requiere sesión activa con distintos tipos de contracción. No hay tests de integración para la UI del player.

#### 3. CI en staging: suite de integración S1–S8

**Test:** Pushear `staging` a `origin/staging` (con confirmación explícita) y confirmar que los ~8 nuevos tests de tree-progress (S1–S8) pasan en verde contra MySQL real, sin regresiones en los tests existentes.
**Expected:** CI verde. ~8 tests nuevos en `test/tree-progress/member-tree.test.ts` pasan. Los tests pre-existentes (401, categorías, %, scope isolation, A/B/C de fase 131) siguen verdes.
**Why human:** Por política del proyecto los tests de integración NO se corren localmente. Requiere push a origin/staging con confirmación explícita del usuario.

---

### Gaps Summary

No hay gaps bloqueantes. El WARNING menor de Truth #13 (la lógica `allPrereqsDominated` de D-06 verificaba solo `dominatedExerciseIds` y no `completedExerciseIds`) **fue corregido en esta misma fase** (commit `7e41ff9b`): se extrajo el helper `isDominated()` que cubre las dos ramas de evidencia de D-01 y se usa tanto para el estado del nodo como para el gating de prereqs, con test S9 que lo ejercita. tsc limpio.

---

_Verified: 2026-06-08T12:50:51Z_
_Verifier: Claude (gsd-verifier)_
