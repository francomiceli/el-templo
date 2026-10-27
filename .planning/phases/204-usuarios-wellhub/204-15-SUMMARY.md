---
phase: 204-usuarios-wellhub
plan: 15
subsystem: admin
tags: [wellhub, admin, vue, merge, ficha]
requires: ["204-10", "204-14"]
provides:
  - "components/members/WellhubMergeDialog.vue (props modelValue, sourceUserId, sourceName, gympassId; emits update:modelValue, merged(targetUserId))"
  - "WellhubCard: prop canMergeRole, emit merge(gympassId)"
key-files:
  created:
    - el-templo-admin/src/components/members/WellhubMergeDialog.vue
  modified:
    - el-templo-admin/src/components/members/WellhubCard.vue
    - el-templo-admin/src/pages/AlumnoDetailPage.vue
metrics:
  tasks: 2
  completed: 2026-10-27
---

# Phase 204 Plan 15: Unir con alumno existente (admin) Summary

Dialogo "Unir con alumno existente" abierto desde la card Wellhub de la ficha: typeahead del alumno destino, resumen de lo que se mueve, aviso "No se puede deshacer" y llamada a `mergeInto`; al terminar navega a la ficha del destino. El boton solo lo ve admin/owner.

## Commits
- `27d4f2ba1` feat(204-15): dialogo Unir con alumno existente
- `c1affdc01` feat(204-15): boton Unir solo para admin/owner y dialogo en la ficha

## Que se hizo
- `WellhubMergeDialog.vue`: `q-select` con `use-input` + `@filter` (debounce 300 ms, minimo 2 letras, contador `searchSeq` que descarta respuestas viejas) sobre `useMembersApi().searchMembers`. Excluye la propia ficha y cualquier resultado con `isWellhub === true`. Opciones "Apellido, Nombre · DNI" con el plan como caption. Al elegir destino aparece un banner con el resumen (ID de Wellhub, reservas, visitas, notas; la ficha origen se da de baja; "No se puede deshacer."). Boton "Unir fichas" (negative) deshabilitado sin destino, con loading. Exito: notify "Fichas unidas", emite `merged(targetId)` y cierra. Error: el mensaje del servidor (`extractError`) se muestra en un banner dentro del dialogo (queda abierto) y en un notify. Cada apertura y cada cierre resetean el estado.
- `WellhubCard.vue`: prop `canMergeRole: boolean` (requerida); el boton se muestra con `card.canMerge && canMergeRole` (computed `showMerge`, tambien usado en el `v-if` de las acciones); `merge` emite `card.gympassId` (aclaracion del orquestador, cambia el emit pelado del plan 14).
- `AlumnoDetailPage.vue`: `canMergeWellhub` computed local sobre `authStore.user?.role` (exactamente `'admin'` u `'owner'`, sin tocar `useAuthStore.ts` ni usar la lista de roles de login). `onWellhubMergeRequested(gympassId)` guarda el ID en `wellhubMergeGympassId` y abre el dialogo. `onWellhubMerged(targetUserId)` hace `router.push('/alumnos/<id>')`. El dialogo se monta con `v-if="memberProfile.isWellhub && canMergeWellhub && wellhubMergeGympassId"`.

## Deviations from Plan
1. **[Orquestador] `merge` lleva el `gympassId`** como payload (el plan dejaba elegir entre emitir o exponer); la pagina lo guarda en un ref y se lo pasa al dialogo. Prop de la card con nombre `canMergeRole`.
2. **[Extra] Defensa en el `v-if` del dialogo**: tambien exige `canMergeWellhub`, no solo la card (el dialogo nunca se monta para otro rol aunque algo seteara `showWellhubMerge`).
3. **[Extra] Banner de error persistente dentro del dialogo** ademas del notify (molde `InvitationCreateDialog`), para que el motivo del 409 no se pierda con el toast.

Bugs no anticipados: ninguno.

## Verificacion (solo greps y lectura, sin tests/typecheck/lint)
- Greps `<verify>` de las dos tareas dan OK (dialogo 247 lineas, sin `console.`, `ADMIN_ROLES` ausente de la pagina, `useAuthStore.ts` sin modificar).
- Verificados por lectura: `searchMembers(search, limit, opts)` y `MemberSearchResult` (exportado, con `isWellhub?`) en `useMembersApi.ts`; `extractError(err, fallback)`; `useWellhubApi().mergeInto(sourceUserId, targetUserId)`; ruta `alumnos/:userId` en `router/routes.ts` (hija de `/`, igual que el `router.push('/alumnos')` existente).

## Dudas para Franco
- Sin vue-tsc: riesgo principal es la tipificacion de `scope.opt` en los slots de `q-select` (mismo patron que CobrosPage) y `options`/`target` como objetos sin `emit-value`.
- `searchMembers` sin `includeOtherBranches`: para un admin de sede con el destino en otra sede, no aparece. Admin/owner (los unicos que ven el boton) buscan en todo el tenant, asi que no deberia afectar.
- La exclusion de `isWellhub` en la lista no se aplica a resultados de otra sede (proyeccion minima sin ese campo): el servidor igual rechaza con su mensaje.
- Despues de unir, `router.push` a la ficha destino; la ficha duplicada (de baja) ya no es accesible. No probado en navegador.

## Known Stubs
None.

## Self-Check: PASSED
- Archivo creado y commits `27d4f2ba1`, `c1affdc01` presentes en `git log`.
