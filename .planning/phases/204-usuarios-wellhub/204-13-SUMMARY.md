---
phase: 204-usuarios-wellhub
plan: 13
subsystem: admin
tags: [wellhub, admin, vue, horarios, cobros]
requires: ["204-12", "204-06", "204-07", "204-05"]
provides:
  - "Chip Wellhub y cancelar deshabilitado en SlotDetailDialog (D-10/D-11)"
  - "Badge Wellhub + aviso que manda a la ficha en Cobros (D-09)"
key-files:
  modified:
    - el-templo-admin/src/types/scheduling.ts
    - el-templo-admin/src/components/scheduling/SlotDetailDialog.vue
    - el-templo-admin/src/pages/CobrosPage.vue
metrics:
  tasks: 2
  completed: 2026-10-27
---

# Phase 204 Plan 13: Horarios y Cobros distinguen a Wellhub Summary

Horarios marca las reservas Wellhub con un chip y no deja cancelarlas; Cobros marca a las personas Wellhub y, al elegirlas, las manda a su ficha en vez de cobrarles.

## Commits
- `3a8272648` feat(204-13): chip Wellhub y cancelar deshabilitado en el detalle del horario
- `66b53cd96` feat(204-13): badge Wellhub en Cobros y aviso que manda a la ficha

## Que se hizo
- `types/scheduling.ts`: `BookingRecord.source?: string | null`.
- `SlotDetailDialog.vue`:
  - Helper `isWellhubBooking(b)` (`source === 'wellhub'`) y constantes `WELLHUB_MANAGED_TOOLTIP` ("Se gestiona desde la app de Wellhub") y `WELLHUB_VALIDATED_TOOLTIP` ("Esta visita la validó Wellhub"). Importa `WELLHUB_COLOR`/`WELLHUB_LABEL` de `utils/wellhub-label.ts`.
  - Chip en las 3 listas futuras (reservados, pruebas, espera) y tambien en la lista "se restauraran al reactivar"; en la vista de hoy el chip sale de `member.isWellhub` (antes y despues del check-in).
  - Los 3 botones de borrar de las listas futuras y el "Cancelar reserva" de hoy quedan `:disable` para Wellhub. Un q-btn deshabilitado no dispara hover, asi que cada boton va envuelto en un `<span>` que lleva el `q-tooltip` cuando esta deshabilitado.
  - Deshacer asistencia (icono close, "Eliminar asistencia"): deshabilitado si `member.source === 'wellhub'` con el tooltip de visita validada. `wellhub_manual` sigue pudiendo deshacerse.
  - "Marcar asistencia" no se toco. No se agregaron contadores al resumen.
- `CobrosPage.vue`:
  - `MemberSearchOption.isWellhub` (requerido); `buildMemberOption` lo setea desde `showWellhubLabel === true` (nuevo campo opcional en el param). La opcion del typeahead muestra el badge Wellhub junto al nombre.
  - `redirectWellhubToFicha(option)`: limpia `selectedMember`, abre el dialogo persistente ("Viene por Wellhub" / "Ir a la ficha" / "Cancelar") y en OK hace `router.push({ path: /alumnos/:id, query: { asociar: '1' } })`.
  - Se llama desde `onMemberSelected` (typeahead), desde `applyMemberDeepLink` (`?memberId=`, no precarga ni avanza al paso 1) y desde `onUsarExistente`.

## Verificacion (solo greps y lectura, sin tests/typecheck)
- Los greps `<verify>` de ambas tareas dan OK; `redirectWellhubToFicha(` aparece 4 veces.
- Imports verificados: `utils/wellhub-label.ts` exporta `WELLHUB_COLOR`/`WELLHUB_LABEL`; `SlotAttendanceItem` tiene `isWellhub` y `source`; `MemberProfile extends MemberListItem` trae `showWellhubLabel?`; `MemberSearchResult` tambien.
- Unico constructor de `MemberSearchOption` aparte de `buildMemberOption` era `onUsarExistente`; ya lleva `isWellhub: false`.

## Deviations from Plan

1. **[Rule 2 - hueco del plan] Tercer camino de seleccion en Cobros.** El plan pedia verificar si algun modo selecciona socios por otro camino. Si: "Nuevo alumno" por DNI duplicado (`onUsarExistente`) adopta un socio existente sin pasar por `onMemberSelected`. `DuplicateMatch` solo trae `status: string | null`, asi que se guarda por `status === 'wellhub'` (visitante Wellhub). Un ex-alumno vinculado a Wellhub con estado `inactivo` no se detecta por ese camino.
2. **[Extra] Chip tambien en la lista "Se restauraran al reactivar"**, para ser consistente con las otras listas futuras.
3. **[Interpretacion] Textos como constantes** (`WELLHUB_MANAGED_TOOLTIP`, `WELLHUB_VALIDATED_TOOLTIP`) en el script en lugar de literales repetidos 4 veces en el template.
4. **[Interpretacion] `redirectWellhubToFicha` recibe `Pick<MemberSearchOption, 'id' | 'displayLabel'>`** (compatible con el `MemberSearchOption` del plan) para poder usarla desde el dedup sin armar una opcion completa.

No hubo bugs imprevistos.

## Dudas para Franco
- **Visitante de otra sede (admin_sede):** si la persona Wellhub es de otra sede (`isOtherBranch`), la ficha le da 404 a un admin_sede, asi que "Ir a la ficha" lleva a un callejon sin salida. No se resolvio (el plan no lo contempla y la proyeccion minima de otra sede solo trae `showWellhubLabel`). Conviene decidir que hacer en ese caso.
- El mensaje del aviso usa `displayLabel`, que incluye el DNI entre parentesis ("Nombre Apellido (DNI)").
- Un socio activo con vinculo Wellhub (`showWellhubLabel` false) se cobra normal en Cobros y no lleva badge, segun el plan.
- Si el aviso se abre desde `?memberId=` y se cancela, el wizard queda en la portada (paso 0) sin socio.
- El detalle del horario (buscador para agregar alumno / reservar) no muestra el chip Wellhub en las opciones: el plan solo pedia el roster.

## Known Stubs
Ninguno.

## Self-Check: PASSED
- Archivos modificados y commits `3a8272648`, `66b53cd96` verificados en `git log`.
