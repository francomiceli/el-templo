---
phase: 136-redise-o-del-sistema-de-segmentaci-n-etiqueta-de-asistencia-
plan: 04
subsystem: members-api + member-app
tags:
  [segmentation, attendance-label, fastify-schema, enum, members, member-app]

# Dependency graph
requires:
  - phase: 136-01
    provides: "MemberSegment = optima | regular | alerta | ausente (motor + enum DB)"
provides:
  - "members/schemas.ts: query-param segment validado contra los 4 valores nuevos (BLOCKER 3 resuelto)"
  - "members/service.ts: subquery + filtro de segment tipados MemberSegment sobre member_segment"
  - "members/types.ts: MemberListItem.segment = MemberSegment | null"
  - "member app: MemberSegment de 4 valores en useUserStore + SegmentGreeting con record alineado + fallback NULL"
affects:
  - "136-05 (admin frontend): ?segment=alerta ahora pasa el schema sin 400"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El enum del JSON schema de Fastify es el límite de validación runtime del segment (tsc no lo cubre)"
    - "El segment de salida (output) se tipa MemberSegment | null; el filtro de entrada (query string) queda string validado por el schema"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/members/schemas.ts
    - el-templo-api/src/modules/members/service.ts
    - el-templo-api/src/modules/members/types.ts
    - el-templo-app/src/stores/useUserStore.ts
    - el-templo-app/src/modules/progression/components/SegmentGreeting.vue

key-decisions:
  - "MemberListParams.segment se deja como string (query string validado por el schema enum); narrow a MemberSegment cascadearía a routes.ts (fuera de ownership). El output MemberListItem.segment sí se narrow a MemberSegment | null."
  - "types.ts del módulo members se incluyó como soporte de service.ts (mismo módulo) — el narrow de MemberListItem.segment vive ahí."

requirements-completed: [D-01]

# Metrics
duration: ~12min
completed: 2026-06-23
---

# Phase 136 Plan 04: Propagación del enum de Asistencia a members API + member app Summary

**El enum de 4 bandas (optima/regular/alerta/ausente) propagado al schema de validación del query param `segment` de members (resolviendo el 400 espurio — BLOCKER 3), al filtro/subquery de `members/service.ts` tipados `MemberSegment`, y al member app (`useUserStore` + `SegmentGreeting`) con record alineado y fallback NULL preservado.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-06-23T00:40:00Z
- **Tasks:** 2
- **Files modified:** 5 (2 apps)

## Accomplishments

- **schemas.ts (BLOCKER 3 resuelto):** el `enum` del query param `segment` pasó de los 6 valores conductuales viejos (`nuevo`/`espartano`/`intermitente`/`en_riesgo`/`digital_warrior`/`ghost`) a los 4 de Asistencia (`optima`/`regular`/`alerta`/`ausente`). Antes, un `?segment=alerta` del admin (plan 05) recibía 400 de Fastify antes del handler — error de runtime que tsc no detecta.
- **service.ts:** la `segmentSubquery` se tipó `sql<MemberSegment | null>` (la columna física `member_segment` no cambia de nombre); el filtro `WHERE mp.member_segment = ${segment}` conserva su forma. Comentarios actualizados a la taxonomía de Asistencia.
- **types.ts (members):** `MemberListItem.segment` se narrow a `MemberSegment | null` (output consumido solo dentro del módulo). `MemberListParams.segment` se deja `string` (query string validado por el schema) con comentario explicando el límite — narrow a `MemberSegment` habría cascadeado a `routes.ts`, fuera de ownership.
- **useUserStore.ts:** `MemberSegment` reescrito a `'optima' | 'regular' | 'alerta' | 'ausente'`; `UserProfile.segment` sigue `MemberSegment | null`; el computed `segment` no cambia.
- **SegmentGreeting.vue:** `SEGMENT_GREETINGS` reescrito a `Record<MemberSegment, string>` con las 4 claves (copy uniforme `'Hola,'`, hook para copywriting futuro); fallback `?? 'Hola,'` para `null` preservado (cubre miembros <1 mes / sin plan, D-07/D-08).
- **ProgramCtaCard.vue** (consumidor de `MemberSegment`): solo tipa `MemberSegment | null`, no asume valores específicos → no requirió cambios.

## Task Commits

1. **Task 1: enum schemas.ts + filtro/subquery service.ts (members API)** — `cebbb1ed` (feat)
2. **Task 2: MemberSegment store + SegmentGreeting (member app)** — `198b451a` (feat)

## Files Created/Modified

- `el-templo-api/src/modules/members/schemas.ts` — enum del query param `segment` a los 4 valores nuevos.
- `el-templo-api/src/modules/members/service.ts` — `segmentSubquery` tipada `MemberSegment | null`; import de `MemberSegment`; comentarios de filtro/subquery actualizados.
- `el-templo-api/src/modules/members/types.ts` — import de `MemberSegment`; `MemberListItem.segment` narrow a `MemberSegment | null`; comentario en `MemberListParams.segment`.
- `el-templo-app/src/stores/useUserStore.ts` — `MemberSegment` a 4 valores.
- `el-templo-app/src/modules/progression/components/SegmentGreeting.vue` — `SEGMENT_GREETINGS` a `Record<MemberSegment, string>` con las 4 claves + fallback null.

## Decisions Made

- **`MemberListParams.segment` queda `string`** (no `MemberSegment`): es el query string crudo de Fastify, validado por el enum del JSON schema en runtime. Narrow a `MemberSegment` cascadearía un `TS2322` a `routes.ts` (que pasa `segment?: string`), archivo fuera de la lista de ownership de este plan. El requisito del plan ("no asume valores viejos") se cumple en el lado de **salida** (`MemberListItem.segment` = `MemberSegment | null`).
- **`members/types.ts` incluido** aunque no esté en la lista nominal de archivos: es parte del módulo members (mismo commit que `service.ts`); ahí vive el typing de `MemberListItem`/`MemberListParams` que `service.ts` consume.

## Deviations from Plan

Ninguna funcional. Único ajuste de implementación: se tocó `members/types.ts` (mismo módulo) para alojar el narrow de `MemberListItem.segment`, en vez de inline en `service.ts`; sin cambio de comportamiento ni de scope. Sin scope creep.

## Threat Surface

- **T-136-17 (Tampering, enum query param) — mitigado:** el enum del JSON schema valida `segment` contra los 4 valores; alinearlo con el front (plan 05) elimina el 400 espurio en filtros legítimos.
- **T-136-10 (Tampering, NULL en member app) — mitigado:** el fallback `?? 'Hola,'` de `SegmentGreeting` degrada graceful con NULL o valores inesperados.
- Sin nueva superficie de seguridad fuera del threat model del plan.

## Verification

- **Grep gates:** ambos pasaron.
  - API: `schemas.ts` contiene `"optima"/"alerta"/"ausente"` y NO contiene ninguno de los 6 valores viejos; `service.ts` contiene `member_segment`.
  - App: `useUserStore.ts` contiene `'optima'`; `SegmentGreeting.vue` contiene `optima:`.
- **Typecheck members API (`pnpm tsc --noEmit` filtrado):** `members/service.ts`, `members/schemas.ts`, `members/types.ts` y también `members/routes.ts`/`members/index.ts` → **sin errores**. (El typecheck del proyecto completo sigue fallando por los consumers de settings + plan 07 pendiente — esperado por diseño foundational, fuera de ownership.)
- **Typecheck member app (`npx vue-tsc --noEmit` filtrado):** `useUserStore.ts`, `SegmentGreeting.vue`, `ProgramCtaCard.vue`, `MiTemplo.vue` → **limpios**. El app tiene 25 errores pre-existentes en archivos no relacionados (boot/\*, layouts/MainLayout, onboarding/OnboardingQuestion, training/BlockCard, pages, router, logger) — fuera de scope, no causados por este plan, no tocados.
- **NULL graceful:** confirmado — `SegmentGreeting` retorna `'Hola,'` cuando `segment` es `null`; `ProgramCtaCard` solo tipa `MemberSegment | null` sin asumir valores.
- **Tests NO ejecutados localmente** (convención del proyecto: corren en CI al pushear).

## Deferred Issues

- **25 errores de `vue-tsc` pre-existentes** en el member app (boot/auth, boot/axios, boot/sentry, boot/staging-marker, axios-refresh-lock.test, MainLayout, OnboardingQuestion, BlockCard, ChangePasswordPage, IndexPage, ProfilePage, router/index, router/routes, utils/logger). No relacionados con segmentación, no introducidos por este plan. No corregidos (scope boundary).

## Next Phase Readiness

- El admin (plan 05) ya puede enviar `?segment=alerta|optima|regular|ausente` sin recibir 400.
- El member app tipa y renderiza los 4 valores + NULL sin romper (no requiere build de tienda en esta fase).
- **Blocker conocido para CI:** el typecheck del proyecto completo del API sigue rojo hasta que las waves restantes + 136-07 reescriban los consumers downstream (settings, notification-cron, analytics, notifications/routes). No pushear a CI hasta completar la propagación.

## Self-Check: PASSED

- Los 5 archivos modificados existen en disco.
- Commits `cebbb1ed` (Task 1) y `198b451a` (Task 2) presentes en el historial.

---

_Phase: 136-redise-o-del-sistema-de-segmentaci-n-etiqueta-de-asistencia-_
_Completed: 2026-06-23_
