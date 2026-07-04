---
phase: 152-reorganizaci-n-de-caja-egresos-configurables
plan: 02
subsystem: admin-caja-ui
tags: [caja, tabs, ux, admin, frontend-only]
requires:
  - "el-templo-admin CajaPage hub (fase 141)"
  - "CuentasTab saldo-firme vocabulary (fase 150)"
provides:
  - "Portada de Caja = Movimientos de caja (D-01)"
  - "Tab Transacciones relabeled a Historial de cobros (D-02)"
  - "Nota explicativa fija en Saldos (D-10 / CAJA-06)"
affects:
  - "el-templo-admin/src/constants/caja.ts"
  - "el-templo-admin/src/pages/CajaPage.vue"
  - "el-templo-admin/src/components/caja/SaldosPorCajaTab.vue"
tech-stack:
  added: []
  patterns:
    - "q-tabs hub con orden dirigido por CAJA_TAB_NAMES (constants como fuente de verdad)"
    - "q-banner no dismissible para nota persistente"
key-files:
  created: []
  modified:
    - "el-templo-admin/src/constants/caja.ts"
    - "el-templo-admin/src/pages/CajaPage.vue"
    - "el-templo-admin/src/components/caja/SaldosPorCajaTab.vue"
decisions:
  - "Reorden y label se hacen sin tocar las keys de CAJA_TABS -> el contrato ?tab= queda intacto"
  - "Banner combina qué muestra Saldos + aviso egresos/retiros en un solo bloque no dismissible (D-10)"
metrics:
  duration: ~2min
  completed: 2026-07-04
requirements: [CAJA-01, CAJA-06]
---

# Phase 152 Plan 02: Reorganización de la portada de Caja + nota de Saldos Summary

Reorganización visual de la portada de Caja (CAJA-01) y nota explicativa fija en Saldos (CAJA-06): Movimientos de caja pasa a ser la portada, el tab `transacciones` muestra "Historial de cobros", y Saldos gana un `q-banner` que explica el saldo firme y advierte sobre registrar egresos/retiros — todo sin romper el contrato `?tab=`.

## What Was Built

- **Task 1 (feat, `024d6d6c`)** — En `constants/caja.ts`: `CAJA_DEFAULT_TAB` pasa a `CAJA_TABS.movimientosCaja` (portada) y `CAJA_TAB_NAMES` se reordena a `[movimientosCaja, pendientes, transacciones, saldos, cuentas]` (D-01). Las keys del objeto `CAJA_TABS` no cambiaron (contrato `?tab=`). En `CajaPage.vue`: se reordenó el bloque de `<q-tab>` para coincidir con el nuevo orden y se cambió solo el label del tab `transacciones` de "Transacciones" a "Historial de cobros" (D-02). El badge `vencidoCount` sigue ligado al tab Pendientes.
- **Task 2 (feat, `9d8353bc`)** — `q-banner` fijo (no dismissible) al tope de `SaldosPorCajaTab.vue`, antes de la fila de export. Combina qué muestra la pantalla ("saldo firme por caja: solo movimientos validados desde el corte; los pendientes se muestran aparte") con el aviso "si no se registran los egresos y retiros, los saldos no reflejarán la realidad" (D-10). Ícono `info`, reusa el vocabulario "saldo firme" de `CuentasTab.vue`.

## Verification

- `npx vue-tsc --noEmit` en el-templo-admin: sin errores en ninguno de los 3 archivos modificados (`caja.ts`, `CajaPage.vue`, `SaldosPorCajaTab.vue`).
- Orden de tabs y default correctos en constants; label "Historial de cobros" presente una vez en CajaPage; banner con "egresos"/"retiros" presente en Saldos.

## Deviations from Plan

None - plan executed exactly as written.

## Deferred Issues

- **Pre-existing (out of scope):** `el-templo-admin/src/utils/pdf/session-pdf-builder.ts` tiene errores de tipos de `vue-tsc` (typings de `pdfmake`: `.vfs` y `margin: number[]` vs `Margins`). El archivo NO fue tocado por este plan ni está en el diff — errores preexistentes del proyecto, no causados por esta tarea. Registrados aquí, no corregidos (SCOPE BOUNDARY).

## Self-Check: PASSED

- Files modified verified present: `caja.ts`, `CajaPage.vue`, `SaldosPorCajaTab.vue` — all FOUND.
- Commits verified: `024d6d6c` FOUND, `9d8353bc` FOUND.
