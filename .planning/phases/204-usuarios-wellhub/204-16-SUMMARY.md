---
phase: 204-usuarios-wellhub
plan: 16
subsystem: admin
tags: [wellhub, admin, vue, reportes]
requires: ["204-11", "204-12", "204-14"]
provides:
  - "components/reports/WellhubReport.vue (props branchOptions, branchId?)"
  - "Reportes: pestaña 'wellhub' + categoria 'Wellhub' en el filtro Fuente del log de accesos"
key-files:
  created:
    - el-templo-admin/src/components/reports/WellhubReport.vue
  modified:
    - el-templo-admin/src/pages/ReportesPage.vue
    - el-templo-admin/src/types/report.ts
metrics:
  tasks: 2
  completed: 2026-10-27
---

# Phase 204 Plan 16: Reporte Wellhub y log de accesos (admin) Summary

Pestaña "Wellhub" en Reportes (mes + sede) con visitas validadas vs presentes a mano, personas (nuevos / ex-alumnos / socios, tabla ordenada por visitas), reservas y conversiones a socio con la tasa Wellhub → socio; y "Wellhub" como una categoría más del filtro Fuente del log de accesos, con las filas rotuladas QR / Manual / Wellhub / Wellhub (a mano).

## Commits

- `5bbb13123` feat(204-16): categoria Wellhub en el filtro y las filas del log de accesos
- `6e90fa355` feat(204-16): pestana Wellhub en Reportes con el reporte por mes y sede

## Que se hizo

- `types/report.ts`: `AccessReportRow.source` pasa a `AttendanceSource` (4 valores); `AccessReportParams.source` acepta `'qr' | 'manual' | 'wellhub'` (lo que valida el API).
- `ReportesPage.vue`:
  - `sourceOptions` suma `Wellhub`; los dos casts de `source` en `fetchAccessData` / `onExportAccess` incluyen `'wellhub'`.
  - La columna Fuente usa `sourceLabels` (ya no el binario QR/Manual) y un slot `body-cell-source` con `q-chip` de color `WELLHUB_COLOR` (`secondary`) para Wellhub y Wellhub (a mano); el resto queda en texto plano.
  - Tab `wellhub` (icono `fitness_center`, no usado por otra tab) + panel `<WellhubReport :branch-options :branch-id>`, agregado a `VALID_TABS`. Autocarga, `fetchTabData` no necesita rama nueva. Sin ningun toggle nuevo (D-13).
- `WellhubReport.vue`: selects de mes (ultimos 12) y sede; KPIs con los rotulos exactos del plan; "Quiénes vinieron" (chips + tabla con link a `/alumnos/:id`); "Reservas" (5 KPIs); "Conversiones a socio" (KPI, "Tasa Wellhub → socio", tabla con Fecha / Nombre / Tipo / Plan / Sede); estado vacio "Sin actividad Wellhub en este mes"; errores con `extractError`; `cleanup()` al desmontar.

## Deviations from Plan

None - plan executed as written. Decisiones de detalle (conservadoras):

- La sede del componente es un select propio (como pide el plan) pero se inicializa con la del selector de la pagina y la sigue si cambia (`watch` sobre la prop `branchId`). Asi un `admin_sede` (sin "Todas las sedes") no dispara una request sin sede antes de que carguen las sedes.
- Descarte de respuestas viejas con un contador (`requestSeq`) para que un cambio rapido de filtro no pise el resultado.
- `ratePct` ya viene como porcentaje entero del API: se muestra `{ratePct}%` sin multiplicar.
- `row-key` de las conversiones es una funcion (`userId-localDate-planName`) por si una persona convierte mas de una vez en el mes.
- Los captions largos del `KpiCard` se truncan con elipsis (su CSS es `nowrap`): se paso tambien `title` (cae al root del q-card) para verlos completos con hover. No se toco `KpiCard`.

## Bugs no anticipados

Ninguno.

## Verificacion

No se corrio vue-tsc, lint, tests ni build (sin `node_modules`). Verificado por grep: imports (`extractError`, `formatDate`, `WELLHUB_COLOR`, `isWellhubSource`, `sourceLabels`, `AttendanceSource`, `useWellhubApi`, `KpiCard`), tipos de `types/wellhub.ts` y las aserciones de los verify del plan. Sin `any` ni `console.*`.

## Dudas para Franco

- Mirar visualmente la pestaña (ancho de los KPIs de reservas con `col-md` de 5 columnas, captions truncados).
- La pestaña es visible para todos los roles que ven Reportes (el API aplica el scope, plan 11). Si queres ocultarla para algun rol como pasa con Invitaciones, hay que decidirlo.
- El selector de sede de la pestaña duplica al de la pagina (queda sincronizado desde la pagina, pero no al reves). Se puede esconder si molesta.
- El filtro de pais de la pagina no se pasa al reporte (el API solo recibe `month` y `branchId`).

## Self-Check: PASSED

- `el-templo-admin/src/components/reports/WellhubReport.vue` existe; commits `5bbb13123` y `6e90fa355` presentes.
