---
phase: 148-pos-profe-alta-de-alumno-plan-en-el-cobro
plan: 06
subsystem: frontend (admin — bandeja de pendientes / caja)
tags: [pos-profe, alta-alumno, void-cascade, createdMemberName, bandeja-pendientes]
requires:
  - "PendingTrayItem.createdMemberId + createdMemberName en el payload (148-03, API)"
  - "Dialog Anular existente en BandejaPendientesTab.vue (Fase 141)"
provides:
  - "Copy condicional de advertencia de cascade en el dialog Anular cuando la carga creó un alumno nuevo"
  - "createdMemberId/createdMemberName en el tipo frontend PendingTrayItem (mirror del API)"
affects:
  - "UAT visual de cierre de la fase 148 (anular alumno-nuevo vs preexistente)"
tech-stack:
  added: []
  patterns:
    - "Banner condicional q-banner gateado por un campo nullable del row (createdMemberName) — mismo patrón que el chip 'Sin plan — asignar' (COBRO-02) y el banner de vencido"
    - "Tipo frontend que espeja 1-a-1 el tipo del API (PendingTrayItem) para que el payload fluya sin construcción manual"
key-files:
  created: []
  modified:
    - el-templo-admin/src/components/caja/BandejaPendientesTab.vue
    - el-templo-admin/src/types/transaction.ts
decisions:
  - "La advertencia es un q-banner (bg-red-1 text-negative) ARRIBA de la descripción del dialog, no reemplaza la copy existente — gestión sigue viendo el monto/socio + el toggle de membresía. El confirmar queda rojo \$negative (sin cambios)."
  - "Se agregaron createdMemberId/createdMemberName como campos REQUERIDOS (number|null / string|null) en el tipo frontend, espejando el API: el composable getPendingTray devuelve el payload tal cual (api.get<PendingTrayResult>), sin construcción manual, así que el campo fluye sin tocar el composable."
  - "El toggle 'Mantener la membresía activa' se mantiene sin cambios: el cascade server-side (148-03) desactiva al alumno creado independientemente del toggle; la copy informa ese efecto sin alterar la mecánica del void existente (fuera de scope)."
metrics:
  duration: ~7min
  completed: 2026-06-26
---

# Phase 148 Plan 06: Copy condicional de cascade al anular (frontend) Summary

**One-liner:** La mitad frontend de ALTA-06 — en la bandeja de Pendientes (`BandejaPendientesTab.vue`), el dialog de **Anular** ahora muestra un banner de advertencia rojo cuando la carga **creó un alumno nuevo** (`createdMemberName` no null, surfacado por 148-03): "Esta carga creó al alumno {nombre}. Al anular, también se desactivará su membresía y el alumno quedará inactivo (no se elimina). ¿Anular de todos modos?"; para cargas de alumno preexistente la copy queda exactamente como hoy.

## What Was Built

### Task 1 — Copy condicional en el dialog Anular según createdMemberName — `42fb9d15`

- **`BandejaPendientesTab.vue`** (dialog Anular): se insertó un `q-banner` condicional (`v-if="actionRow.createdMemberName"`, `dense rounded bg-red-1 text-negative` + icono `warning`) arriba de la descripción existente del dialog. La copy es la EXACTA del UI-SPEC (sección Destructive), interpolando el nombre con `<strong>{{ actionRow.createdMemberName }}</strong>` y resaltando "inactivo". El botón de confirmar sigue siendo `color="negative"` ($negative), sin cambios.
- Para `createdMemberName` null (alumno preexistente / path admin) el banner **no se renderiza** → la copy del dialog queda idéntica a la de hoy ("Anular el pago de {monto} de {socio}. Esta acción deja rastro y no se puede deshacer.").
- **`types/transaction.ts`**: se agregaron `createdMemberId: number | null` y `createdMemberName: string | null` a la interfaz `PendingTrayItem` del frontend, espejando 1-a-1 el tipo del API (`el-templo-api/src/modules/finance/types.ts` L435-436, 148-03). Como `getPendingTray` devuelve `api.get<PendingTrayResult>` sin construcción manual, el campo fluye desde el backend sin tocar el composable.

## Verification Results

- `pnpm exec eslint -c ./eslint.config.js src/components/caja/BandejaPendientesTab.vue`: **0 errores**. La única warning (`'err' is defined but never used`, en un catch existente) es **pre-existente** — verificado con `git stash` (misma warning sin mis cambios). Fuera de scope (SCOPE BOUNDARY).
- `grep -c "createdMember" src/components/caja/BandejaPendientesTab.vue` == **3** (≥1, criterio cumplido).
- `vue-tsc --noEmit`: sin errores en `BandejaPendientesTab.vue` / `transaction.ts` / `useTransactionsApi.ts` (el composable pasa el payload del API tal cual, los campos requeridos nuevos no rompen tsc).
- Sin `any` (CLAUDE.md) — el banner solo lee `actionRow.createdMemberName` (tipado `string | null`).

## Deviations from Plan

None — el plan se ejecutó exactamente como fue escrito. La única nota: el plan listaba solo `BandejaPendientesTab.vue` en `files_modified`, pero la tarea ya anticipaba en `<action>` que "si el tipo de la fila no lo incluye, agregar el campo opcional al tipo consumido (sin any)". Se tocó además `types/transaction.ts` para agregar los campos al tipo `PendingTrayItem` — previsto por la propia acción de la tarea, no es una desviación.

## Known Stubs

None — el banner se alimenta del campo real `createdMemberName` del payload de la bandeja (join server-side de 148-03), sin valores hardcodeados ni placeholders.

## Notes for Downstream

- **UAT visual de cierre (148):** en la bandeja de Pendientes, anular una carga creada por un profe que dio de alta a un alumno nuevo debe mostrar el banner rojo "Esta carga creó al alumno {nombre}…"; anular una carga de un alumno preexistente NO debe mostrarlo.
- El void server-side ya hace el flip a inactivo + cancela la membresía (148-03); este frontend solo informa el efecto antes del confirm.

## Self-Check: PASSED

- FOUND commit 42fb9d15
- FOUND: el-templo-admin/src/components/caja/BandejaPendientesTab.vue (banner condicional)
- FOUND: el-templo-admin/src/types/transaction.ts (createdMemberId/createdMemberName en PendingTrayItem)
