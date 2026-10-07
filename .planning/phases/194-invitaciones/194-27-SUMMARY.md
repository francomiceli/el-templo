---
phase: 194-invitaciones
plan: 27
subsystem: app
tags: [invitations, mis-invitados, rebrand, redirect, d-26, d-27, sc-5]
requires:
  - phase: 194-10
    provides: rutas de elegibilidad y activacion (las usa 194-28)
  - phase: 194-19
    provides: GET /members/referrals con bloques invitations e invitedBy
provides:
  - "Pantalla Mis invitados (/mis-invitados): cupo, link del servidor, lista con estado derivado, accesos x/N, vencimiento y descuento"
  - "/mis-referidos como redirect a /mis-invitados (builds publicadas, pushes y avisos con destino referidos)"
  - "Rebrand de perfil, card de Mi Templo y destino de la app"
  - "utils/invitation-view.ts: presentacion pura (estados, cupo, accesos, fechas, descuento, share)"
affects: [194-28]
key-files:
  created:
    - el-templo-app/src/pages/MisInvitadosPage.vue
    - el-templo-app/src/utils/invitation-view.ts
    - el-templo-app/src/utils/__tests__/invitation-view.test.ts
    - el-templo-app/test/legacy-invitation-routes.test.ts
  modified:
    - el-templo-app/src/router/routes.ts
    - el-templo-app/src/pages/ProfilePage.vue
    - el-templo-app/src/modules/progression/components/ReferralCtaCard.vue
    - el-templo-app/src/config/destinations.ts
    - el-templo-admin/src/config/destinations.ts
  deleted:
    - el-templo-app/src/pages/MisReferidosPage.vue
key-decisions:
  - "La clave `referidos` de destinations.ts conserva la RUTA `/mis-referidos` (espejo de la API: destinations-sync.test.ts exige igualdad profunda y las builds publicadas la usan); solo cambia el label a 'Invitaciones'. El redirect del router la lleva a /mis-invitados"
  - "Ningun numero de cupo/accesos/vigencia esta en la app: quotaText/accessesText reciben los valores del servidor; el link lo arma el servidor (inviteUrl)"
requirements-completed: [SC-5, D-10, D-26, D-27]
completed: 2026-10-07
---

# Phase 194 Plan 27: Mis invitados (app) Summary

**La app tiene `/mis-invitados` con "Te quedan N de M invitaciones este mes", el boton "Invitar a alguien" que comparte el `inviteUrl` que arma el servidor, la lista de invitados con chip de estado derivado (Invitado / Entrenando / Vencido / Socio activo / Inactivo), accesos x/N y vencimiento, el bloque "Te invito" y el descuento con sus invitados activos; `/mis-referidos` redirige y el copy visible de la app ya no dice "referido".**

## Commits

| Tarea | Commit | Contenido |
| ----- | ------ | --------- |
| 1 | `2b5c23d2c` | `invitation-view.ts` + 10 casos, `MisInvitadosPage.vue`, ruta `mis-invitados` + redirect, `git rm` de `MisReferidosPage.vue` |
| 2 | `9c302f8b5` | Perfil "Mis invitados", badge "Invitaciones" y fallback de boton en la card, label de destino, `test/legacy-invitation-routes.test.ts` |
| fix | `fc5ed969e` | Espejo del admin de `destinations.ts` con el label de la API (bug de 194-26) |
| fix | `8c2d4c6be` | Comentario de `destinations.ts` fuera de la tupla (el sync lo extrae por regex contigua) |

## Verificacion

- `pnpm lint`: 0 errores (2 warnings preexistentes: `axios.ts`, `useSessionPlayer.ts`).
- `pnpm build` (quasar): OK.
- `pnpm test`: 281 verdes, 2 rojos PREEXISTENTES en `test/level-display.test.ts` (espera 5 niveles, el codigo tiene `kairos` desde la fase 129). Ajenos a la fase; anotados en `deferred-items.md`. Los tests nuevos (`invitation-view`, `legacy-invitation-routes`) pasan.
- Mutation testing: reemplazar el `redirect` de `mis-referidos` por un componente hace fallar 2 de los 4 casos de `legacy-invitation-routes`; revertido.
- Espejo de destinos verificado con un script (admin == app == API, 9 secciones, mismo regex que `destinations-sync.test.ts`).
- Copy: chequeo canonico sobre los 4 archivos de la tarea sin salida; barrido sin exclusiones de toda la app revisado a mano: restan solo claves/rutas internas (`referidos`, `mis-referidos`), tests de esas claves, un comentario, y `CÓDIGO DE REFERIDO` de `RegisterPage.vue` (lo resuelve 194-28).

## Deviations from Plan

**1. [Rule 1 - Bug, en archivo ajeno] Espejo del admin desalineado.** 194-26 puso `label: 'Mis invitados'` en `el-templo-admin/src/config/destinations.ts` pero la API (194-22) dice `Invitaciones`; `destinations-sync.test.ts` exige igualdad profunda. Se corrigio el admin a `Invitaciones` (commit `fc5ed969e`).

**2. [Interpretacion, conflicto plan vs sync] Ruta y label de `destinations.ts`.** El plan pedia label "Mis invitados" y ruta `mis-invitados`; la API (fuente de verdad) tiene label `Invitaciones` y ruta `/mis-referidos` (las builds publicadas la usan) y el sync test compara los tres espejos. Se uso label `Invitaciones` (tambien lo indican las lecciones de 194-25/26) y se mantuvo la ruta `/mis-referidos`, que el router redirige. Consecuencia en criterios: `grep mis-invitados destinations.ts` da 0 (la ruta nueva vive en `routes.ts`, 2 lineas) y los dos tests de navegacion existentes (`push-destination`, `aviso-navigation`) NO cambian (siguen siendo correctos); el caso "destino `referidos` termina en `mis-invitados`" quedo en `test/legacy-invitation-routes.test.ts`.

**3. [Rule 3 - Entorno] `node_modules` de la app roto.** El symlink `el-templo-app/node_modules` apuntaba a `et-horarios-eliminar`, cuyo `node_modules` ya no existe (limpieza de worktrees). Se re-apunto el symlink (archivo ignorado, sin instalar nada) a `/home/franco/projects/el-templo/el-templo-app/node_modules`, cuyo `pnpm-lock.yaml` es identico al del worktree. Los symlinks de admin y API siguen colgando hacia el mismo destino inexistente (no se usaron en este plan).

**4. [Menor] Etapas de la propia invitacion.** Se agrego `invitedByStageLabel/Color` (convertido = "Ya sos socio") para rotular el bloque "Te invito"; el plan solo listaba los 5 estados de invitados.

## Allowlist de copy

Vacia. (El chequeo canonico no imprime nada sobre los archivos de las tareas; `CÓDIGO DE REFERIDO` de `RegisterPage.vue` es de 194-28.)

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del threat model. T-194-84 (solo nombre de pila + inicial; la pantalla no pide ni muestra telefonos) y T-194-85 (el link sale de `invitations.inviteUrl`, la app no construye URLs) cubiertos.

## Lecciones para planes siguientes

- `destinations-sync.test.ts` extrae las tuplas con un regex CONTIGUO `key/label/route`: no poner comentarios dentro de la tupla (sacan la seccion del espejo y el test pide exactamente 9). Verificar el espejo con un script contra la API antes de commitear cambios en `destinations.ts`.
- El `node_modules` del worktree puede apuntar a un worktree borrado: si `eslint`/`vitest` no se encuentran, verificar `ls -la el-templo-app/node_modules` y re-apuntar el symlink a un checkout con el mismo `pnpm-lock.yaml` (no instalar).
- `pnpm test` de la app tiene 2 rojos preexistentes (`level-display.test.ts`): el criterio es que no aparezcan fallos nuevos.
- Los tests de la app corren en entorno `node`: un test de rutas puede construir un router con `createMemoryHistory` y resolver sin cargar los componentes (son imports dinamicos).
- El hook rechaza `git` combinado con `cd`/variables: `cd` y `git` en llamadas separadas.

## Self-Check: PASSED
