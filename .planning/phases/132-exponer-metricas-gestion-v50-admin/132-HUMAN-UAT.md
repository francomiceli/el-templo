---
status: partial
phase: 132-exponer-metricas-gestion-v50-admin
source: [132-VERIFICATION.md]
started: 2026-06-05
updated: 2026-06-05
---

## Current Test

[awaiting human testing]

## Tests

### UAT-01 — Orden y nomenclatura de tabs

- **status:** pending
- Abrir Analíticas en el admin. Confirmar que aparecen los 4 grupos nuevos en el orden D-08: **Conversión → Retención → Asistencia → Ingresos**. Verificar que la pestaña de curvas por ciclo quedó rotulada "Retención (ciclos)" para no confundirse con la nueva Retención (churn+renovación).

### UAT-02 — Lista accionable "Enfriándose" (Frecuencia)

- **status:** pending
- En el tab Asistencia, sobre la lista de enfriándose: (a) click en el **nombre** abre el perfil del miembro; (b) el **teléfono** es link `tel:` (llamar) y no rompe con teléfono nulo; (c) **Exportar CSV** descarga un archivo `frecuencia-enfriandose-YYYY-MM-DD.csv` con los datos correctos.

### UAT-03 — Filtro Turno condicional

- **status:** pending
- El selector de **Turno** debe aparecer SOLO en Conversión y Asistencia, y desaparecer en Retención e Ingresos. Cambiar turno (mañana/tarde) y confirmar que los datos cambian.

### UAT-04 — Aislamiento ARS/EUR e Ingresos

- **status:** pending
- En el tab Ingresos: Ticket y LTV deben mostrar bloques **separados por moneda** (nunca sumar ARS+EUR). Confirmar que LTV muestra **las dos** estimaciones de meses (simple + supervivencia) y proyectado vs observado.

### UAT-05 — Ausencia física de métricas deprecadas

- **status:** pending
- Confirmar que ya NO aparecen: cards de Renovación 7/14/30 ni "Tasa de retención" simple en Miembros; card de ARPU mensual en Finanzas Avanzadas (pero el chart "Caja vs Devengado" SÍ sigue). El viejo tab Funnel (freemium "coming soon") ya no existe.

### UAT-06 — Scope planId AND-eado con sucursal/país (datos reales)

- **status:** pending
- Con datos reales en staging: aplicar filtro por plan y confirmar que respeta el scope de país/sucursal del admin (un admin no puede ver datos de otra sede/país inyectando planId/turno).

### UAT-07 — CI verde en staging (15 tests nuevos)

- **status:** pending
- **Gate de CI, no local.** Pushear a `origin/staging` para que CI aplique y corra los ~15 tests de integración nuevos (ticket 3, trial-funnel 5, frequency 7). Confirmar suite verde. Sin migraciones que aplicar.

## Notes

- Code review (132-REVIEW.md): 0 critical, 6 warning, 5 info. Seguridad limpia. Warnings no bloqueantes a evaluar: WR-01/02 (label "15 días" hardcodeado vs `window`), WR-03 (fallback ARS en LTV bajo scope EUR-only), WR-05 (nombre vacío clickeable para miembros sin nombre). Se pueden abordar como pulido post-UAT con `/gsd:code-review 132 --fix`.
- Sin migraciones en esta fase. Todo en `staging` local, sin push.
