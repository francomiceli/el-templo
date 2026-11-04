---
phase: 205-oficina
plan: 05
subsystem: el-templo-admin
tags: [oficina, admin, ficha-socio]
requires: [205-04]
provides:
  - "Pestana Oficina en la ficha del socio (owner/admin/gestion) con temas vinculados y alta prefijada"
affects: []
key-files:
  created:
    - el-templo-admin/src/components/oficina/MemberOficinaTab.vue
  modified:
    - el-templo-admin/src/pages/AlumnoDetailPage.vue
metrics:
  tasks: 1
  commits: 1
---

# Fase 205 Plan 05: Pestana Oficina en la ficha del socio

`MemberOficinaTab` (props `userId`, `memberName`) carga `listTopics({ view: 'todos', targetKind: 'socio', targetId })` y `listStaff()`, muestra "N temas, M abiertos" y el boton "Nuevo tema", y reutiliza `OficinaTopicList` (al tocar un tema navega a `/oficina/:id`) y `OficinaTopicDialog` en modo create con `presetTarget { kind: 'socio', id, label }`. Al guardar recarga la lista. Orden: abiertos y dormidos primero, cerrados al final, y por ultima actividad dentro de cada grupo.

`AlumnoDetailPage.vue`: solo se agrego el import del componente, `OFICINA_ROLES`, el computed `canSeeOficina` (espejo de OFFICE_ROLES), `q-tab` y `q-tab-panel` "oficina" despues de Notas. El nombre sale de `memberName` (la misma fuente del header de la ficha).

## Verificacion

- `pnpm lint` (admin) en foreground: 0 errores, 8 warnings, todos preexistentes ajenos (env.d.ts, CobrosPage.vue, session-pdf-builder.ts). Prettier limpio en los dos archivos.
- Imports y firmas verificados por grep contra los componentes reales: `OficinaTopicList` (props `topics`/`selectedId`/`loading`/`emptyMessage`, emit `select: [id]`), `OficinaTopicDialog` (`v-model`, `mode`, `staff`, `presetTarget`, emit `saved`), `useOfficeApi` (`listTopics`, `listStaff`, `cleanup`), `OFICINA_ROLES` en `config/templo-config.ts`. `currentUser.role` es `AdminRole`, compatible con `OFICINA_ROLES.includes`.

## Desvios

- El plan decia `OficinaTopicList` sin mas; la prop real `emptyMessage` se usa para el texto "Este socio no tiene temas en Oficina." y `selectedId` va en `null` (no hay seleccion en la ficha).
- Se agrego un estado de error con boton "Reintentar" si falla la carga (ademas del `$q.notify` pedido). Si falla solo `listStaff`, el alta sigue funcionando sin elegir responsable.
- El logger recibe un objeto `{ error }` (su firma es `(msg, data?)`).

## Dudas para Franco

- Ninguna. Visual sin verificar en navegador (no hay stack local en este worktree).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno: solo consume rutas existentes gateadas por rol en la API; la pestana solo oculta.

## Self-Check: PASSED
