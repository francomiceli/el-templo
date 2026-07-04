---
status: partial
phase: 152-reorganizaci-n-de-caja-egresos-configurables
source: [152-VERIFICATION.md]
started: 2026-07-04T15:30:00Z
updated: 2026-07-04T15:30:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Portada de Caja y orden de tabs

expected: Al abrir /caja sin ?tab=, aterriza en "Movimientos de caja". El orden visual de los tabs es Movimientos de caja / Pendientes / Historial de cobros / Saldos / Cuentas.
result: [pending]

### 2. Banner de Saldos

expected: El q-banner aparece fijo (no se puede cerrar) al tope de Saldos, con texto legible que explica "saldo firme" y advierte sobre egresos/retiros.
result: [pending]

### 3. Chip de estado + filtro en Historial de cobros

expected: Cada fila muestra un chip de color (validado=verde, pendiente=naranja, etc.) y el selector "todas/validadas/pendientes" filtra la tabla correctamente, incluyendo la paginación server-side.
result: [pending]

### 4. DateRangeFilter — toggle mes/día

expected: En Historial de cobros y Movimientos de caja, el control arranca en modo mes y el toggle "Por día" expone Desde/Hasta sin romper la carga de datos.
result: [pending]

### 5. Detalle de cobro — validador y "Validado al registrar"

expected: Al abrir el detalle de un cobro validado por la bandeja se ve "Validado por {nombre} · {fecha}"; al abrir uno nacido validado se ve "Validado al registrar · {registrador} · {fecha de alta}" (fecha visible, no vacía tras el fix CR-01).
result: [pending]

### 6. ABM Categorías de egreso en Cuentas

expected: En el tab Cuentas, la sección "Categorías de egreso" permite crear, renombrar, desactivar (atenuada + badge "Cerrada") y reactivar una categoría, respetando el país seleccionado arriba.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
