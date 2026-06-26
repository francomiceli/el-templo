---
status: partial
phase: 148-pos-profe-alta-de-alumno-plan-en-el-cobro
source: [148-VERIFICATION.md]
started: 2026-06-26T16:39:53Z
updated: 2026-06-26T16:39:53Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Modo "Alta + plan" — chip Sede y mini-form de alumno

expected: En `CargarPagoPage.vue` (PoS coach), al entrar al modo "Alta + plan" la sede del profe aparece como default (editable). "+ Nuevo alumno" abre el mini-form (nombre + apellido + DNI). Al salir del campo DNI con un DNI ya existente, aparece el banner dorado de dedup (no se crea alumno duplicado).
result: [pending]

### 2. Flujo completo Alta — precio / turnos / Confirmar

expected: Un plan `fixed` pide el selector de turnos estructurado (`FixedSchedulePicker`); seleccionar tarjeta como medio de pago recalcula al `priceCreditCard`; un monto recibido parcial muestra la deuda restante; al Confirmar el alta el ticket sale con el chip "Nuevo" y el pago queda en estado `pendiente` (va a la bandeja de gestión).
result: [pending]

### 3. Bandeja Pendientes — dialog Anular con copy de cascade

expected: En `BandejaPendientesTab.vue`, anular una carga "Alta + plan" (alumno nuevo) muestra el banner rojo de advertencia de cascade (el alumno quedará inactivo, no se borra). Anular una carga de un alumno preexistente NO muestra ese banner.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
