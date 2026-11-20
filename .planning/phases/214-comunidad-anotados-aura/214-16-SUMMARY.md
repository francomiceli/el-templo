---
phase: 214-comunidad-anotados-aura
plan: 16
subsystem: scheduling
tags: [community, visibility, member_profiles, D-05, D-06, D-07, D-09, D-11, D-44, D-47]
requires: ["214-15"]
provides:
  - "isMinor, defaultVisible, effectiveVisible, listAccess (reglas puras en scheduling/community-visibility.ts)"
  - "getViewerCommunityState, setCommunityVisibility, markCommunityNoticeSeen (scheduling/community-service.ts)"
  - "PUT /api/members/scheduling/attendees/visibility y POST /api/members/scheduling/attendees/notice-seen"
  - "GET /auth/me con communityVisible y communityNoticeSeen"
  - "migracion 0347 (member_profiles.community_visible y community_notice_seen_at)"
affects: ["214-17"]
key-files:
  created:
    - el-templo-api/src/db/migrations/0347_member_profiles_community.sql
    - el-templo-api/src/modules/scheduling/community-visibility.ts
    - el-templo-api/src/modules/scheduling/community-service.ts
    - el-templo-api/test/unit/community-visibility.test.ts
    - el-templo-api/test/scheduling/community-visibility.test.ts
  modified:
    - el-templo-api/src/db/schema/member-profiles.ts
    - el-templo-api/src/modules/scheduling/schemas.ts
    - el-templo-api/src/modules/scheduling/routes.ts
    - el-templo-api/src/modules/auth/routes.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - el-templo-api/test/tenancy/iso-03-sched-escritura.test.ts
    - el-templo-api/test/tenancy/iso-03-cobertura-subs-sched.test.ts
decisions:
  - "Wellhub sin suscripcion no tiene plan en vigor: aparece en la lista pero ve solo el numero (D-68, segun el plan)"
  - "isMinor compara cadenas ISO (nacimiento + 18 anios contra la fecha local), asi un nacido el 29/02 cumple el 1/03 en anios no bisiestos"
  - "/me calcula communityVisible con lo que ya lee (member_profiles, dateOfBirth, branchCountry, branchTimezone): cero consultas extra"
metrics:
  tasks: 3
  completed: 2026-11-18
---

# Phase 214 Plan 16: visibilidad del alumno en la comunidad Summary

Preferencia de visibilidad (`member_profiles.community_visible`, NULL = regla por defecto) y marca de "ya vi el aviso" guardadas en el servidor, con las reglas puras de D-11/D-47 (ocultos por defecto: menores de 18 a la fecha local de la sede y sedes fuera de Argentina; sin fecha de nacimiento cuenta como adulto; la preferencia explicita siempre gana) y la regla de quien ve la lista (D-07/D-09: staff siempre; alumno solo con plan en vigor por `activeMemberExists` y siendo el mismo visible; si no, motivo `sin_plan` u `oculto`). Sin interruptor de encendido (D-44).

## Commits

- `83fae9755` test(214-16): reglas de visibilidad de la comunidad (rojo)
- `08bf46927` feat(214-16): reglas de visibilidad de la comunidad
- `4f303fe06` feat(214-16): preferencia de visibilidad y aviso visto en member_profiles
- `66a658605` feat(214-16): preferencia de visibilidad y aviso visto (D-05, D-06)
- `12708c5ea` test(214-16): visibilidad de la comunidad e ISO-03 de escritura

## Verificacion

- `npx tsc --noEmit` (API): 0. `pnpm lint:tenant`: DISCREPANCIAS 0.
- Unit `community-visibility.test.ts` con la config unitaria: 18 de 18 en verde (rojo antes de la implementacion, commit aparte).
- `pnpm typecheck:tests`: 18 discrepancias de base, las mismas de antes (los 2 "empeorados" son `analytics.test.ts` y `members.test.ts`, archivos que este plan no toca); 0 errores en los archivos tocados.
- Manifiesto: `ENTRADAS_BASELINE` 585 -> 587 (conteo real de claves: 585 antes). ISO-03 subs+sched: `CASOS_BASELINE` 74 -> 76 (incluido el texto del `it` "las 76 rutas"). Extraccion de claves de `describe` verificada a mano con la misma regex del gate: salen las 2 claves nuevas.
- Integracion: `test/scheduling/community-visibility.test.ts` (14 `it`) y los 4 `it` nuevos de ISO-03 escritos, no corridos (quedan para CI: `test/setup.ts` se cuelga en local). Migracion 0347 no aplicada en la base local (regla del orquestador). Numero 0347 verificado libre con `git fetch` contra `origin/master` y `origin/staging` (el ultimo es 0346 en este worktree).

## Deviations from Plan

- Ninguno de fondo. El test de "body con campos de mas" del plan no se escribio como rechazo: Fastify usa `removeAdditional` por defecto, asi que un `userId` extra se descarta y responde 200. Se reemplazo por un caso que afirma que el `userId` del body se ignora y la preferencia queda en el usuario del token.
- Prettier reformateo por accidente 3 archivos ajenos de `scheduling/` (`activity-service.ts`, `especial-trial-service.ts`, `holiday-service.ts`): se revirtieron con `git checkout` de cada ruta antes de commitear. En `schemas.ts` quedaron 4 lineas ajenas reformateadas (cortes de reserva) que lint-staged habria reformateado igual.

## Decisiones propias

- Wellhub sin suscripcion: sin plan en vigor, ve solo el numero (como pedia el plan, D-68). Queda anotado para Franco.
- `getViewerCommunityState` devuelve ademas `preference`, `branchId` y `branchCountry` para que el plan 17 no tenga que releerlos.
- `notice-seen` y `visibility` solo exigen sesion de socio autenticado (ningun rol): un staff que llame guarda su fila, sin efecto sobre la lista (el staff la ve siempre).

## Notas para los planes siguientes

- Plan 17: usar `getViewerCommunityState(db, ctx, userId)` + `listAccess({ isStaff, hasPlanInEffect, viewerVisible: state.visible })`. Para filtrar a los OTROS anotados hay que aplicar `effectiveVisible` a cada uno con su `dateOfBirth`, el `country`/`timezone` de su sede y su `member_profiles.community_visible`.
- Si CI falla `community-visibility.test.ts`: mirar primero el plan sembrado con `createTestPlan` (login `admin@test.com`/`adminpass123`), la sede `ES` creada en el test (se borra en `afterAll`) y el `UPDATE users` con `tenantWhere`.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. Las 2 rutas nuevas estan en el manifiesto como `tenant-scoped` y cubiertas por ISO-03.

## Self-Check: PASSED

Los 5 commits y los 5 archivos nuevos existen.
