---
status: partial
phase: 153-mejoras-de-deudas
source: [153-VERIFICATION.md]
started: 2026-07-04T21:05:00Z
updated: 2026-07-04T21:05:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Gating visual del hub de Deudas por rol

expected: Coach ve SOLO el tab "Por socio". gestion/admin/owner ven los 3 tabs (Por socio/Por deuda/Vencidos), con "Por socio" como tab por defecto al entrar a /deudas. Coach forzando ?tab=porDeuda cae al default.
result: [pending]

### 2. Columnas nuevas del tab "Por deuda" (Motivo/Fecha de registro/Período/tooltip de nota)

expected: Cada fila muestra "Cuota {plan}" o "Sin plan"/"Otro" en Motivo, el período dd/mm–dd/mm como subtítulo cuando aplica, la fecha de registro, y la nota libre aparece en un tooltip al pasar el mouse sobre el ícono junto al Motivo (solo si hay nota).
result: [pending]

### 3. Export Excel de "Por deuda" con las 3 columnas nuevas

expected: El .xlsx descargado incluye "Motivo", "Período" y "Fecha de registro" con valores legibles.
result: [pending]

### 4. Tab "Vencidos": orden, ausencia de monto, mensaje de tabla vacía

expected: Lista ordenada por vencimiento más reciente primero, sin columna de monto/moneda, mensaje "No hay socios con plan vencido sin renovar" cuando el cohorte está vacío.
result: [pending]

### 5. ReportesPage sin el reporte de Deudas — no quedan links rotos

expected: Navegar a /reportes?tab=deudas no rompe la página (degrada a un tab válido); el tab "Deudas" ya no aparece en Reportes.
result: [pending]

### 6. Suite de tests nuevos/extendidos pasa en CI (vitest run)

expected: outstanding-balances.test.ts y expired-members.test.ts pasan en verde en CI al pushear (no se corrieron localmente por preferencia del usuario).
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
