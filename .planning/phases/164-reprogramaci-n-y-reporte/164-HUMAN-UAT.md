---
status: partial
phase: 164-reprogramacion-y-reporte
source: [164-VERIFICATION.md]
started: 2026-07-16T03:30:00Z
updated: 2026-07-16T03:30:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Reprogramar sesión de prueba end-to-end (admin)
expected: En Horarios → Sesiones de Prueba, cada trial tiene acción "Reprogramar" (ícono event_repeat) que abre picker de fecha+turno (solo fechas futuras, turnos de la semana elegida con feriados/inactivos reflejados); al confirmar, el turno viejo desaparece, el nuevo aparece, y si el lead estaba Perdido vuelve a En seguimiento. Un alumno ya convertido (ganado) da error 409 accionable.
result: [pending]

### 2. Reporte de SP: columna Reprogramaciones + origen del estado + filtro
expected: En Reportes → Sesiones de Prueba: columna "Reprogramaciones" (tooltip aclara que cuenta todas las pruebas canceladas del lead, retroactivo), ícono lápiz con tooltip "Estado puesto a mano" en leads con estado manual, select "Origen" (Automático/Manual) que filtra — Automático incluye históricos. Export CSV con las 2 columnas nuevas.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
