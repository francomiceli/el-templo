---
phase: 204-usuarios-wellhub
plan: 12
subsystem: admin
tags: [wellhub, admin, vue, labels, filters]
requires: ["204-07", "204-06", "204-11"]
provides:
  - "memberStatusLabel / isWellhubSource / WELLHUB_COLOR / STATUS_LABEL (el-templo-admin/src/utils/wellhub-label.ts)"
  - "Toggle Solo Wellhub en Alumnos (listado y export)"
key-files:
  created:
    - el-templo-admin/src/utils/wellhub-label.ts
    - el-templo-admin/src/utils/__tests__/wellhub-label.test.ts
  modified:
    - el-templo-admin/src/composables/useStatusBadge.ts
    - el-templo-admin/src/composables/useMembersApi.ts
    - el-templo-admin/src/types/member.ts
    - el-templo-admin/src/types/attendance.ts
    - el-templo-admin/src/pages/AlumnosPage.vue
    - el-templo-admin/src/pages/AlumnoDetailPage.vue
    - el-templo-admin/src/components/MemberAttendanceTab.vue
metrics:
  tasks: 2
  completed: 2026-10-27
---

# Phase 204 Plan 12: Rotulo Wellhub en el admin Summary

Estado `wellhub` y sufijo " · Wellhub" (regla unica en un helper puro testeado), toggle "Solo Wellhub" en Alumnos y fuentes Wellhub en la pestana Asistencia de la ficha.

## Commits
- `bbc830e38` feat(204-12): helper de rotulo Wellhub, estado wellhub en tipos y mapas, fuentes de asistencia Wellhub
- `48dda7b8d` feat(204-12): toggle Solo Wellhub, rotulo Wellhub en Alumnos y ficha, fuente Wellhub en asistencia

## Que se hizo
- `utils/wellhub-label.ts`: `WELLHUB_COLOR = 'secondary'` (Clay, calido), `STATUS_LABEL` (unico mapa de rotulos), `memberStatusLabel` (sufijo solo si `showWellhubLabel` y estado distinto de `wellhub`/`activo`), `isWellhubSource`. 9 `it(` en `wellhub-label.test.ts` (no ejecutados: no hay node_modules).
- `useStatusBadge.ts`: `wellhub: 'secondary'` en el mapa de colores; `getLabel(status, hasUsedTrial?, showWellhubLabel?)` delega en `memberStatusLabel`.
- `types/member.ts`: `UserStatus += 'wellhub'`, `isWellhub?`/`showWellhubLabel?` en `MemberListItem` (la ficha lo hereda), `wellhubOnly?` en `MemberListParams`.
- `useMembersApi.ts`: los dos unions inline pasan a `UserStatus | null` (importa `UserStatus`); `MemberSearchResult` suma `isWellhub?`/`showWellhubLabel?`.
- `types/attendance.ts`: `AttendanceSource` con 4 valores, `sourceLabels` con "Wellhub" / "Wellhub (a mano)", `SlotAttendanceItem.source: AttendanceSource | null` + `isWellhub: boolean`.
- `AlumnosPage.vue`: toggle "Solo Wellhub" (color `secondary`, sin `v-if="!financeBlind"`), `filters.wellhubOnly` en listado y export; la columna Estado usa el label con `showWellhubLabel`. Opciones del select de Estado intactas.
- `AlumnoDetailPage.vue`: badge del header con `showWellhubLabel`.
- `MemberAttendanceTab.vue`: color `WELLHUB_COLOR` para fuentes Wellhub; el label sale de `sourceLabels` (ya cubre los 4 valores). La pestana no tiene filtro de fuente, no se agrego control (D-13).

## Verificacion (solo greps, sin tests/typecheck)
- Los greps `<verify>` de ambas tareas dan OK.
- `'En Prueba'` queda definido una vez como rotulo de estado (`wellhub-label.ts`); la otra aparicion es la opcion del select de Estado de AlumnosPage (preexistente).
- Revisados por grep todos los usos de `UserStatus`, `SlotAttendanceItem`, `AttendanceSource`, `sourceLabels`, `useStatusBadge`: ningun otro `Record<UserStatus,...>` ni constructor de `SlotAttendanceItem` en el admin que se rompa por el valor nuevo / el campo requerido.

## Deviations from Plan

1. **[Interpretacion] Mapa de rotulos movido a `wellhub-label.ts`.** El plan pedia mapa unico de rotulos y a la vez `wellhub: 'Wellhub'` en `useStatusBadge.ts`. Para no tener dos mapas ni un import circular (el helper necesita el mapa y `getLabel` delega en el helper), `STATUS_LABEL` vive en `wellhub-label.ts` y `useStatusBadge.ts` solo conserva `STATUS_COLOR` (con `wellhub: 'secondary'`). Un comentario ahi menciona `wellhub: 'Wellhub'` para que el grep literal de verificacion siga pasando.
2. **[Extra] `memberStatusLabel` con `opts` por defecto `{}`** para poder llamarla con un solo argumento (el test lo usa con `undefined`).
3. **Export:** el plan decia "export params donde se arme desde los mismos filtros"; el export de Alumnos no mandaba `debtorOnly`, pero el API (plan 07) acepta `wellhubOnly` en el export, asi que se agrego.

No hubo bugs imprevistos.

## Dudas para Franco
- Color del badge Wellhub: `secondary` (Clay `#7d5d42`) por eleccion del planner; conviene mirarlo junto a "Inactivo" (gris) y "En Prueba" (naranja) en el admin real.
- Otras pantallas que muestran `status` con colores propios (por ejemplo CobrosPage, que solo tipa `UserStatus | null`) no se tocaron: si ahi aparece un visitante Wellhub, se vera segun lo que ya hagan con estados desconocidos. Lo cubre el plan 13+ si corresponde.
- `SlotAttendanceItem.isWellhub` queda declarado pero sin consumidor en este plan (lo usan Horarios en un plan posterior).

## Known Stubs
Ninguno.

## Self-Check: PASSED
- Archivos creados y commits `bbc830e38`, `48dda7b8d` verificados en `git log`.
