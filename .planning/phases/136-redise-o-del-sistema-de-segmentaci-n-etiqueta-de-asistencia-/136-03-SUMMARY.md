---
phase: 136-redise-o-del-sistema-de-segmentaci-n-etiqueta-de-asistencia-
plan: 03
subsystem: analytics
tags:
  [analytics, segmentation, engagement, attention-list, fastify, json-schema]

# Dependency graph
requires:
  - phase: 136-01
    provides: "MemberSegment union de 4 valores (optima|regular|alerta|ausente)"
provides:
  - "SegmentCounts en 4 bandas + sinSegmento (analytics/types.ts)"
  - "EngagementMember.segment = alerta|ausente"
  - "countActiveBySegment + getEngagementNominalList sobre las 4 bandas (worklist alerta/ausente)"
  - "getAttentionList.priorityRank remapeado a ausente(0)/alerta(1)/resto(2)"
  - "Schemas response/request de analytics validan solo los 4 valores nuevos"
affects:
  - "136-04..136-06 (notificaciones, members, app, frontend, Horarios — siguen propagando el enum)"
  - "Frontend admin analytics.ts (SegmentCounts/EngagementMember) — consumidor downstream, lo reescribe el plan de frontend"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Analytics LEE member_profiles.segment, nunca recalcula (D-12 preservado)"
    - "priorityRank con literales fuera del union = regresión silenciosa; test de orden la detecta"

key-files:
  created:
    - .planning/phases/136-redise-o-del-sistema-de-segmentaci-n-etiqueta-de-asistencia-/136-03-SUMMARY.md
  modified:
    - el-templo-api/src/modules/analytics/types.ts
    - el-templo-api/src/modules/analytics/engagement-service.ts
    - el-templo-api/src/modules/analytics/service.ts
    - el-templo-api/src/modules/analytics/routes.ts
    - el-templo-api/src/modules/analytics/schemas.ts
    - el-templo-api/test/analytics/engagement.test.ts
    - el-templo-api/test/analytics/analytics.test.ts
  deleted: []

key-decisions:
  - "Urgencia invertida: ausente = 0 (mayor urgencia, 0% uso), alerta = 1; coincide entre engagement-service (worklist) y service.ts (attention-list)"
  - "Schema attentionList.segment conserva null en el enum (member sin perfil); engagement nominal NO (siempre alerta/ausente por el filtro SQL)"
  - "Test de orden agregado en AMBAS suites (engagement nominal + attention-list) para blindar el remap de priorityRank/urgency"

requirements-completed: [D-01]

# Metrics
duration: ~5min
completed: 2026-06-23
---

# Phase 136 Plan 03: Propagación de las 4 bandas a Analytics Summary

**El enum de 4 bandas (optima/regular/alerta/ausente) propagado a analytics: SegmentCounts, countActiveBySegment, la worklist de seguimiento (en_riesgo+ghost → alerta+ausente), el `getAttentionList.priorityRank` (que comparaba contra strings muertos — regresión silenciosa restaurada), los schemas de validación y los tests, preservando scope/PII.**

## Performance

- **Duration:** ~5 min
- **Completed:** 2026-06-23
- **Tasks:** 3
- **Files modified:** 7 (5 src + 2 tests)

## Accomplishments

- **`SegmentCounts`** reescrito a `{ optima, regular, alerta, ausente, sinSegmento }` (eliminados los 6 buckets conductuales); `EngagementMember.segment` a `"alerta" | "ausente"`; comentarios JSDoc que hablaban de "6 segments" actualizados a las 4 bandas (D-01).
- **`engagement-service.ts`:** `SEGMENT_KEYS` a las 4 bandas; init de `counts` a las 4 bandas + sinSegmento; predicado SQL `IN ('en_riesgo','ghost')` → `IN ('alerta','ausente')`; filtro de narrowing y mapa `urgency` invertido a `{ ausente: 0, alerta: 1 }` (ausente = mayor urgencia, 0% uso). `applyScope`/`activeMemberExists` intactos (T-136-07: no fuga de PII entre sedes).
- **`service.ts` `getAttentionList.priorityRank`:** remapeado los literales muertos `"ghost"`→`"ausente"` (0) y `"en_riesgo"`→`"alerta"` (1), resto 2. Sin esto, tras la migración 0151 los strings viejos nunca matcheaban `MemberSegment | null` (4 valores) → la attention-list perdía silenciosamente el orden por banda (T-136-16). Comentarios de prioridad y JSDoc actualizados.
- **`routes.ts`:** comentario del endpoint `/engagement` actualizado a "worklist alerta/ausente".
- **`schemas.ts`:** los tres enums (attentionList.segment, counts props, nominal.segment) validan solo los 4 valores nuevos (+ null en attention-list, + sinSegmento en counts). Sin props/enum huérfanos de los 6 segmentos viejos (T-136-08: el JSON schema de Fastify no filtra campos fantasma).
- **Tests reescritos:** `engagement.test.ts` (countActiveBySegment + nominalList a 4 bandas) y `analytics.test.ts` (casos ghost/en_riesgo de attention-list a ausente/alerta). **Agregado en ambas suites un assert de ORDEN** que verifica que `ausente` precede a `alerta` a igual urgencia, cubriendo el remap de `priorityRank`/`urgency` (T-136-16).

## Task Commits

1. **Task 1: Propagar 4 bandas a types.ts + engagement-service.ts** — `ebb867a1` (refactor)
2. **Task 2: Remapear getAttentionList.priorityRank + comentarios stale** — `f00d66f3` (refactor)
3. **Task 3: Schemas + tests de engagement y attention-list** — `b2a0de4c` (test)

## Files Created/Modified

- `el-templo-api/src/modules/analytics/types.ts` — `SegmentCounts` (4 bandas + sinSegmento), `EngagementMember.segment` (alerta|ausente), comentarios de `AttentionMember.segment`.
- `el-templo-api/src/modules/analytics/engagement-service.ts` — `SEGMENT_KEYS`, init `counts`, predicado SQL, filtro narrowing, `urgency` invertida; scope intacto.
- `el-templo-api/src/modules/analytics/service.ts` — `getAttentionList.priorityRank` remapeado; comentarios.
- `el-templo-api/src/modules/analytics/routes.ts` — comentario del endpoint `/engagement`.
- `el-templo-api/src/modules/analytics/schemas.ts` — 3 enums a las 4 bandas; props de SegmentCounts.
- `el-templo-api/test/analytics/engagement.test.ts` — suite a 4 bandas + assert de orden ausente-antes-alerta + import de `users`.
- `el-templo-api/test/analytics/analytics.test.ts` — casos de attention-list a ausente/alerta + assert de orden de `priorityRank`.

## Decisions Made

- **Urgencia invertida coherente:** `ausente = 0` (mayor urgencia: 0% de uso de membresía), `alerta = 1`. El mismo orden se aplica en la worklist de engagement (sort interno) y en la attention-list (`priorityRank`). Mapea 1:1 al viejo `ghost`(0)/`en_riesgo`(1).
- **`null` se conserva en el enum de `attentionList.segment`** (un miembro de la attention-list puede no tener perfil); en cambio el `nominalList.segment` NO admite null porque el filtro SQL `IN ('alerta','ausente')` garantiza el union estrecho.
- **Test de orden en ambas suites** (no solo en una): el engagement nominal usa un sort en JS y la attention-list usa `priorityRank`; son dos rutas de código distintas y cada una merece su blindaje.

## Deviations from Plan

### 1. [Rule 2 - Cobertura crítica] Import de `users` en engagement.test.ts

- **Found during:** Task 3 (assert de orden nuevo)
- **Issue:** El nuevo test de orden ausente-antes-alerta necesita forzar nombres (`lastName`) que rompan a propósito el tiebreak alfabético para probar que la urgencia de banda manda. El helper de seed no setea `lastName`, así que el test actualiza `users.lastName` directamente.
- **Fix:** Agregado `import { users as usersTable } from "../../src/db/schema/users"` y dos `app.db.update(...)`. Es código de test, no de producción; no altera el contrato.
- **Files modified:** `el-templo-api/test/analytics/engagement.test.ts`
- **Commit:** `b2a0de4c`

---

**Total deviations:** 1 (Rule 2 — refuerzo de cobertura del nuevo assert de orden). Sin scope creep, sin cambios de producción fuera de la lista de propiedad.

## Issues Encountered

**Breakage downstream esperada (NO corregida — fuera de file-ownership).** Como se anticipó en el SUMMARY de 136-01, el typecheck del PROYECTO COMPLETO sigue fallando hasta que las waves restantes (notificaciones, members, app, frontend) y 136-07 reescriban sus consumidores. El scope de verificación de ESTE plan es solo los 7 archivos de analytics, que typechean limpio. No se tocó ningún archivo fuera de la lista.

## Verification

- **`pnpm tsc --noEmit` file-scoped sobre los 7 archivos propios (types/engagement-service/service/routes/schemas + engagement.test/analytics.test): LIMPIO** (sin errores en ninguno).
- `SEGMENT_KEYS`, `SegmentCounts` y los 3 enums de schemas en las 4 bandas; worklist sobre `IN ('alerta','ausente')`.
- `getAttentionList.priorityRank` ordena por `ausente`(0)/`alerta`(1); **sin literales `"ghost"`/`"en_riesgo"` en `service.ts`** (gate negativo verde).
- Comentarios de `service.ts`/`routes.ts` sin "ghost/en_riesgo".
- Sin props/enum huérfanos de los 6 estados viejos en `types.ts`/`schemas.ts` (grep limpio).
- `applyScope`/`activeMemberExists` sin tocar — PII por sede preservada (T-136-07).
- **Tests NO ejecutados localmente** (corren en CI al pushear, por convención del proyecto). Las fechas de seed de los tests nuevos no dependen de ventanas TZ-sensibles (overdue por DATEDIFF / subs con start/end explícitos), por lo que no introducen flake nuevo.

## Self-Check: PASSED

- Los 7 archivos modificados existen en disco y typechean limpio.
- Commits `ebb867a1`, `f00d66f3`, `b2a0de4c` presentes en el historial de `staging`.
- Sin deletions accidentales en ninguno de los 3 commits.

---

_Phase: 136-redise-o-del-sistema-de-segmentaci-n-etiqueta-de-asistencia-_
_Completed: 2026-06-23_
