---
phase: 201-conquer
plan: 21
subsystem: admin
tags: [conquer, admin, tablero, pedidos, alta, nav, badge]
requires: ["201-20"]
provides:
  - "types/conquer.ts: tipos espejo de TODAS las respuestas de admin, LEVEL_DAYS, LEVEL_LABELS, LEVELS"
  - "useConquerAdminApi: las 21 rutas de admin, ConquerApiError (message en español + code), toConquerError"
  - "CONQUER_MANAGER_ROLES, ítem Conquer con pelotita 'conquer-requests', ruta /conquer (name conquer)"
  - "useAdminStore: conquerRequestsCount + fetchConquerRequestsCount"
  - "ConquerPage (tabs Tablero y Pedidos), ConquerBoard, ConquerRequests, ConquerActivateDialog"
  - "utils/conquer-format.ts: daysSince, agoText, fullName"
affects: [201-22, 201-23]
key-files:
  created:
    - el-templo-admin/src/types/conquer.ts
    - el-templo-admin/src/composables/useConquerAdminApi.ts
    - el-templo-admin/src/utils/conquer-format.ts
    - el-templo-admin/src/pages/ConquerPage.vue
    - el-templo-admin/src/components/conquer/ConquerBoard.vue
    - el-templo-admin/src/components/conquer/ConquerRequests.vue
    - el-templo-admin/src/components/conquer/ConquerActivateDialog.vue
  modified:
    - el-templo-admin/src/config/templo-config.ts
    - el-templo-admin/src/stores/useAdminStore.ts
    - el-templo-admin/src/layouts/AdminLayout.vue
    - el-templo-admin/src/router/routes.ts
decisions:
  - "Los 4xx del API se loguean con warn (no error): son errores de negocio esperados y error() manda a Sentry."
  - "Tablero: tras Vista/Resuelta se relee el tablero entero (semáforo y contadores salen del servidor), no se parchea en memoria."
  - "Página y tablero/pedidos se recargan con un reloadToken (prop) en vez de refs a los hijos: los q-tab-panel desmontan el panel inactivo."
metrics:
  tasks: 2
  commits: 2
---

# Phase 201 Plan 21: Admin de Conquer (tablero, pedidos y alta) Summary

El owner/admin ve Conquer en el menú de Entrenamiento con una pelotita de pedidos, activa alumnos eligiendo nivel y días válidos (desde Pedidos o buscándolos) y mira el tablero con semáforo y alertas accionables. Queda el cliente tipado de las 21 rutas de admin para 201-22 y 201-23.

## Commits

- `fa05688ee` feat(201-21): cliente de admin de Conquer, menú y contador de pedidos (D-08, D-12)
- `c6a81b83f` feat(201-21): tablero, pedidos y alta de alumnos de Conquer en el admin (S12-1, S12-7)

## Qué quedó

- **Cliente** (`useConquerAdminApi`): 21 funciones tipadas. Todas lanzan `ConquerApiError` (`message` = el `error` en español del API, `code` `CONQUER_*` si lo trae, `status`). `toConquerError` está exportada por si una vista necesita ramificar por `code`. Las acciones de la ficha (`changeStep`, `applyCut`, `levelUp`) y las del catálogo devuelven la vista completa/actualizada: 201-22/23 reemplazan su estado con esa respuesta. `getMemberPhotoUrl` solo loguea `{ checkId, pose }`.
- **Tipos**: espejo de `schemas.ts` (que manda sobre los SUMMARYs). `BoardAlert.detail` es `Record<string, unknown>` (cada tipo de alerta trae lo suyo). `CutProposal.stage` es opcional (solo en `etapa`).
- **Nav**: `CONQUER_MANAGER_ROLES = ['admin','owner']` (comentario sobre abrir a coach). Ítem `/conquer` al final de Entrenamiento con `badge: 'conquer-requests'`. `AdminLayout` pide el contador solo si el rol está en `CONQUER_MANAGER_ROLES` (en `onMounted` y en el `watch(route.path)`).
- **Ruta**: `/conquer` (name `conquer`, `allowedRoles: CONQUER_MANAGER_ROLES`, `?tab=tablero|pedidos`). 201-22 debe registrar `conquer-alumno` con `params.userId`; el tablero ya navega ahí con `router.hasRoute('conquer-alumno')`.
- **Tablero**: contadores por color (rojo, amarillo, verde, sin alertas), una fila por alumno (dot, nombre, nivel y días, "última sesión hace N días"), chips con el `label` de cada alerta y `proposal.label` como subtexto y tooltip, botones Vista (solo si está `abierta`) y Resuelta para alertas con `id`. Las derivadas (`id: null`) no tienen botones.
- **Pedidos**: lista con nombre, sede y "pidió hace N días"; "Activar" abre el diálogo con el alumno prefijado. Vacío: "No hay pedidos de desbloqueo".
- **Diálogo de alta**: alumno (typeahead de `searchMembers` de 2+ caracteres, o prefijado), nivel y días (`LEVEL_DAYS[nivel]`; al cambiar el nivel los días pasan al primero válido). Arranca en Ternero ("en la duda, el más bajo"). Éxito: Notify, refresca el contador del store y emite `activated` (la página sube `reloadToken` y se releen tablero y pedidos). Error: Notify con el `error` del API.

## Gates corridos

- Pre-flight `node_modules`: OK.
- `pnpm lint` (admin): 0 errores, 8 warnings preexistentes ajenos (CobrosPage, session-pdf-builder, env.d.ts), tras cada tarea.
- `vue-tsc --noEmit -p tsconfig.json` filtrado por `types/conquer|useConquerAdminApi|templo-config|useAdminStore|AdminLayout|router/routes|pages/ConquerPage|components/conquer|conquer-format`: vacío (el baseline del admin sigue trayendo errores ajenos, p. ej. tests de `boot/`).
- Higiene (`console.*`, `any`, `color="info|primary"`, Google Fonts): sin hallazgos. `prettier --check` OK en todo lo tocado.
- Los dos `verify` del plan: sus greps de existencia pasan (`GREPS_OK`, las 21 funciones presentes).
- Sin vitest ni tests de API (el admin no tiene vitest; el plan no toca el API).

## Mutation testing

No hay tests ejecutables en el admin. La única lógica pura es `utils/conquer-format.ts`, verificada con un script en el scratchpad vía `node --experimental-strip-types` (casos: hoy, ayer, 9 días, fecha futura, null, basura, ISO, textos, nombre). Mutantes aplicados y revertidos (archivo verificado con `prettier --check` y `grep`):

1. Quitar `Math.max(0, ...)` en `daysSince`: el script falla ("futuro no negativo": -40 en vez de 0).
2. `agoText(1)` devuelve "hace 1 días" en vez de "ayer": el script falla ("a1").

El script no se versiona (el admin no tiene runner de tests). Los componentes (`ConquerBoard`, `ConquerRequests`, `ConquerActivateDialog`) no tienen lógica pura propia; se cubren con UAT.

## Desvíos del plan

- Archivo extra `el-templo-admin/src/utils/conquer-format.ts` (no estaba en `files_modified`): los "hace N días" del tablero y de los pedidos (y la ficha de 201-22) comparten helper, por DRY.
- `q-tabs`/botones usan `color="secondary"`/`"accent"` en vez de `primary`: el grep de verify rechaza `color="primary"` (también matchea `active-color="primary"`), y `secondary` es el clay cálido de El Templo.
- Formato del admin: el `.prettierrc.json` del admin tiene `semi: true` (el archivo de reglas decía "sin punto y coma" para app y admin; en el admin manda el `.prettierrc.json`, el app sí va sin `;`).
- El commit de la Tarea 1 deja `routes.ts` apuntando a `pages/ConquerPage.vue`, que llega en el commit de la Tarea 2 (el plan separa así las tareas). Solo ese commit intermedio no compilaría con Vite; el HEAD sí.

Ambigüedades nuevas (opción más simple):

- Las alertas guardadas `vista` conservan solo el botón "Resuelta" (Vista solo aparece si está `abierta`).
- El tablero no filtra por color al tocar un contador (solo informa).
- "Activar alumno" sin pedido previo busca entre todos los socios (`searchMembers`); el API devuelve 404 `CONQUER_SOCIO_NO_ENCONTRADO` si no corresponde.

## Trampas / notas para 201-22 y 201-23

- `extractError` del admin prioriza `message` sobre `error`; para Conquer usar `toConquerError`/`ConquerApiError` (prioriza `error`, que es el texto en español). Las vistas solo capturan `err instanceof Error` y muestran `err.message`.
- Los `q-tab-panel` desmontan el panel inactivo: cada pestaña carga en `onMounted` y recarga con la prop `reloadToken`. Las nuevas tabs (Galería, Catálogo, Ajustes) pueden seguir el mismo patrón; `ConquerPage` tiene `TAB_NAMES` para sumar nombres válidos de `?tab=`.
- No usar `color="primary"`/`"info"` en ningún atributo (ni `active-color`): el verify de los planes lo rechaza. `secondary` (clay), `accent` (carbón), `negative`, `warning` y `positive` son todos cálidos en este admin.
- `inUse` de un peldaño = algún escalón de algún alumno apunta a él (no incluye la tabla de arranque, que la valida el API).
- Los dots del semáforo son `span` con `bg-negative|bg-warning|bg-positive|bg-grey-5` (clase `.conquer-dot` scoped en `ConquerBoard`).

## Known Stubs

Ninguno. (La ficha `conquer-alumno` es una ruta futura de 201-22, no un stub: el tablero la detecta con `hasRoute`.)

## Self-Check: PASSED

Los 7 archivos creados existen, los 4 modificados están en el diff de `fa05688ee`, y los commits `fa05688ee` y `c6a81b83f` están en `git log`.
