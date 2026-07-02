---
status: partial
phase: 149-nav-por-categor-as-rbac
source: [149-VERIFICATION.md]
started: 2026-07-02T21:20:00Z
updated: 2026-07-02T21:20:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Drawer por rol (6 categorías + visibilidad)

Loguearse con owner/admin/gestion/coach/recepcion y confirmar las 6 categorías del drawer, visibilidad de Caja/Analíticas/Programas oculta para empleado, sección Templo al final.
expected: Dueño ve las 6 categorías completas; empleado ve Finanzas con Pagos (+Deudas si coach/gestion, +Reportes si gestion), Alumnos, Horarios, Planes; Caja/Analíticas/Programas ocultas
result: [pending]

### 2. Columna "Programa" en /planes por rol

Como gestion/recepcion, abrir /planes y confirmar que la columna "Programa" muestra el programa vinculado real (no "—" en todos los planes); como coach, confirmar que la columna muestra "—" sin request de red a /admin/programs y sin evento nuevo en Sentry.
expected: gestion/recepcion ven el programa real; coach ve "—" sin 403 ni ruido en Sentry
result: [pending]

### 3. Diálogo "Asignar programa adicional" para gestion

Como gestion, abrir la tab Programas de un alumno → "Asignar programa adicional" y confirmar que el select de programas carga opciones (no error).
expected: El select se puebla con los programas activos
result: [pending]

### 4. Landing por rol end-to-end (login + carga fría)

Login con owner/admin → aterriza en /alumnos; login con gestion/recepcion/coach genérico → /pagos; login con Fran Scaine → /sessions; refrescar (F5) sobre "/" logueado como owner → cae en /alumnos (no /pagos).
expected: Cada rol aterriza en su destino D-14 tanto en login real como en carga fría de "/"
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
