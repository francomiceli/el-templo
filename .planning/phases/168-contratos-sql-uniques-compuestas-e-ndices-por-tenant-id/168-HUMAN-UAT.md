---
status: partial
phase: 168-contratos-sql-uniques-compuestas-e-ndices-por-tenant-id
source: [168-VERIFICATION.md]
started: 2026-07-27T22:20:00Z
updated: 2026-07-27T22:20:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Smoke funcional por UI en producción — contratos de unicidad intactos para el staff

expected: En el admin de producción: (a) dar de alta un socio con un DNI que ya existe → lo sigue rechazando con el mismo error de siempre; (b) crear una sede con un código repetido → mismo rechazo. Listado de socios, cobros y reporte de deuda sin errores nuevos. (Criterio 5 del ROADMAP: cero cambio de comportamiento para el staff tras convertir las 12 uniques a compuestas por tenant.)
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
