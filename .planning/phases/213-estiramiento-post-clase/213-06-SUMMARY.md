---
phase: 213-estiramiento-post-clase
plan: 06
subsystem: api
tags: [communications, destinations, notifications, templates, push, admin, deep-link]
requires:
  - phase: 213-05
    provides: eventos del embudo (push_opened) y complete del estiramiento
provides:
  - seccion curada `estirar` (/training/estirar?from=push) en la API y sus dos espejos (app, admin)
  - plantilla de sistema `stretch_followup` (STRETCH_FOLLOWUP_TEMPLATE_KEY) que nace apagada
  - campo `enabledAtSeed` en TemplateSeed y escritura de `is_enabled` en seedTemplates
  - descripcion de disparo y audiencia de la plantilla en el admin
affects: [213-07 job del push (usa STRETCH_FOLLOWUP_TEMPLATE_KEY, plantilla_apagada), 213-09 app (ruta /training/estirar), 213-13 UAT (prender la plantilla)]
tech-stack:
  added: []
  patterns:
    - "seccion curada nueva con precedente `conquer`: tipo + APP_SECTIONS + appSectionForRoute en la API y espejos byte a byte"
    - "plantilla de sistema que nace apagada via `enabledAtSeed: false` (INSERT IGNORE nunca pisa lo que el admin prendio)"
key-files:
  created: []
  modified:
    - el-templo-api/src/modules/communications/destinations.ts
    - el-templo-app/src/config/destinations.ts
    - el-templo-admin/src/config/destinations.ts
    - el-templo-api/test/communications/destinations-sync.test.ts
    - el-templo-api/test/communications/destinations.test.ts
    - el-templo-app/src/boot/__tests__/push-destination.test.ts
    - el-templo-api/src/modules/notifications/types.ts
    - el-templo-api/src/modules/notifications/service.ts
    - el-templo-api/test/notifications/custom-rules.test.ts
    - el-templo-admin/src/config/rule-triggers.ts
    - el-templo-admin/src/config/system-audiences.ts
key-decisions:
  - "D-12 implementado por seccion curada `estirar` y no solo por `route` (ver 'Desvio de D-12')"
  - "La plantilla nace apagada (enabledAtSeed false): builds viejos sin el player terminarian en la pagina 404"
requirements-completed: [SC-5, SC-6, D-12, D-13]
duration: ~30min
completed: 2026-11-11
---

# Phase 213 Plan 06: Seccion curada `estirar` y plantilla `stretch_followup` Summary

Push "¿Estiraste?" como plantilla de sistema editable desde Comunicaciones, con un deep link `/training/estirar?from=push` que sobrevive a la edicion gracias a la nueva seccion curada `estirar` (API + 2 espejos), nace apagada y con su disparo y audiencia descritos en el admin.

## Tareas

| Tarea | Commit | Contenido |
|-------|--------|-----------|
| 1 | `5b9fa7897` | Seccion `estirar` en API, app y admin; sync test a 11; casos de destino y de build viejo |
| 2 | `2d229557f` | `stretch_followup` en `TEMPLATE_SEEDS` (apagada), `is_enabled` en el seed, conteo 19 -> 20, textos del admin |

## Desvio de D-12

D-12 se implementó por sección curada (`estirar`) y no solo por el campo `route` de la plantilla (opción A del SPEC/CONTEXT), porque: (1) `seedTemplates` siembra `destination_section = appSectionForRoute(route)` (`el-templo-api/src/modules/notifications/service.ts:1032`) y `appSectionForRoute` cae a `mi_templo` para cualquier ruta no listada (`el-templo-api/src/modules/communications/destinations.ts:191-207`, `default`); (2) `resolveTapRoute` en la app prioriza el destino curado y nunca mira `route` si la sección es conocida (`el-templo-app/src/boot/push-notifications.ts:30-33`); (3) el editor de Comunicaciones manda siempre `destination` al guardar y el PUT pisa `route` con `fallbackRouteFor(destination)` (`el-templo-api/src/modules/notifications/routes.ts:728`). Con la opción A el push abriría Mi Templo y el primer retoque de texto rompería el deep link. El texto sigue editable y el destino es `/training/estirar?from=push`, como pide D-12.

A confirmar por Franco en el UAT (plan 13).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Cobertura] Aserciones del seed apagado en `custom-rules.test.ts`**
- **Found during:** Tarea 2
- **Issue:** El plan pedia solo actualizar el conteo 19 -> 20; nada verificaba que la plantilla nazca apagada con destino `estirar` ni que las demas sigan prendidas (T-213-19 es `mitigate`).
- **Fix:** En el caso "(10) POST /admin/seed-templates ..." se agrego la lectura de las filas sembradas con `is_enabled`, `destination_section` y `route`, y sus aserciones. No corrido localmente: lo cubre CI.
- **Files modified:** `el-templo-api/test/notifications/custom-rules.test.ts`
- **Commit:** `2d229557f`

**2. [Rule 1 - Comentario] Conteo del comentario de cabecera en `system-audiences.ts`**
- El plan mencionaba solo la linea 19 ("Las 18"); habia una segunda ("Las 17 plantillas push", linea 53). Ambas pasaron a "Las 20". Tambien "Las 18 TEMPLATE_SEEDS" en `rule-triggers.ts` -> 20.

## Decisiones tomadas en ejecucion

- Cantidad real de seeds antes de la tarea: 19 (verificado contando entradas de `TEMPLATE_SEEDS`), ahora 20.
- `grep -rn "toBe(19)\|TEMPLATE_SEEDS.length" test`: los unicos conteos de plantillas estaban en `custom-rules.test.ts:422,428,451`; `notifications.test.ts` y `0260-0261-invitaciones.test.ts` solo hacen `.find`.
- Se agrego el comentario de fase 213 dentro del bloque de comentarios de `seedTemplates` explicando el `is_enabled` en el INSERT.

## Verificaciones

Corridas:
- API `pnpm exec tsc --noEmit`: solo los 3 errores preexistentes de `src/app.ts` (`@fastify/rate-limit`); nada nuevo.
- API `pnpm lint:tenant`: exit 0.
- API `pnpm typecheck:tests`: 20 discrepancias, las mismas preexistentes del baseline (ninguna en `communications/` ni `notifications/`).
- App `vitest run src/boot/__tests__/push-destination.test.ts`: 9/9 pasan (incluye los 2 casos nuevos).
- App `pnpm lint` y admin `pnpm lint`: 0 errores (solo warnings preexistentes).
- `vue-tsc --noEmit`: app 21 errores, admin 28, todos preexistentes; ninguno en `destinations.ts`, `push-destination.test.ts`, `rule-triggers.ts` ni `system-audiences.ts`.
- Grep de frases prohibidas en `types.ts` y `el-templo-admin/src/config`: sin coincidencias.

No corridas localmente (sin MySQL, las cubre CI): `destinations-sync.test.ts`, `destinations.test.ts` y `custom-rules.test.ts` (tests de API; los dos primeros son puros pero el `vitest.config.ts` del repo exige DB).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno: sin endpoints ni rutas nuevas; el destino sigue saliendo de la lista curada `APP_SECTIONS` (T-213-18) y la plantilla nace apagada (T-213-19). Pendiente de UAT (plan 13): prender `stretch_followup` desde Comunicaciones cuando el build de tiendas con el player este publicado y anotar la fecha (mueve el experimento D-16).

## Lecciones para los planes siguientes

- El job del plan 07 debe usar `STRETCH_FOLLOWUP_TEMPLATE_KEY` (exportada de `el-templo-api/src/modules/notifications/types.ts`), no pasar `titleOverride`/`bodyOverride` y, con la plantilla apagada (`is_enabled = 0`), guardar `push_decision = 'plantilla_apagada'` sin romper la card (D-11). `queueNotification` ya corta cuando `!template.isEnabled` (`service.ts:413`): revisar que no tire sino que devuelva algo distinguible.
- La app (plan 09) debe registrar la ruta `/training/estirar` aceptando `?from=push`.
- `vue-tsc` baseline actual: app 21 errores, admin 28 (preexistentes).

## Self-Check: PASSED

- Commits `5b9fa7897` y `2d229557f` existen en `feat/estiramiento-post-clase`.
- Los 11 archivos listados modificados existen y estan commiteados.
