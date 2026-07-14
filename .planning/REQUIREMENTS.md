# Requirements — v5.7 Actividades con Aura

Scope derivado de `.docs/actividades-aura/` (audios de Nacho, 2026-07-13) + research de
codebase (2026-07-14, 3 informes: clases/formatos, planes/cobros, programas). Clases
especiales de sábado (Verticales con Pato, Acrobacias con Nico, tercera a definir)
gateadas por un pase mensual de 2 asistencias mezclables: socio activo +$10.000 ARS,
externo $20.000 ARS.

**Modelado decidido (pre-discuss):** planes nuevos con `planCategory: 'especial'` +
budget mensual explícito de 2 clases; gating por flag en `activities`; enforcement en
`BookingService.reserve()`; consumo vía `classesRemaining` existente. Programas
descartados como vehículo (contenido online, sin horario/cupo/asistencia; precio por
programa removido a propósito en mig. 0071). Se descartó también una entidad
`class_passes` separada: el plan reutiliza renovación, cobros, deuda, país/moneda y
multi-sub por categoría (presencial + especial en paralelo, como presencial + online
hoy).

**Constraint operativo:** staging-first estricto; migraciones con SQL commiteado
(numeración a verificar en plan-phase — 0176-0178 aplicadas por v5.5, ojo con lo que
reserve v5.6); tests de integración para rutas nuevas/modificadas.

**Abierto para discuss-phase:** (a) el externo con pase contaría como `activo` en
`recomputeUserStatus` — impacto en analytics/referidos; (b) consumo a la reserva vs al
check-in (patrón actual: check-in); (c) horarios exactos, sedes y nombre real de la
tercera actividad ("OpenShin" en el audio); (d) si el staff puede pisar el gating
(bypass existente para admin/coach en bonus/multi-branch).

---

## v5.7 Requirements

### ACT — Actividades especiales

- [ ] **ACT-01**: El admin puede marcar una actividad como "especial" (gateada por pase) al crearla o editarla.
- [ ] **ACT-02**: Las 3 actividades especiales (Verticales, Acrobacias, tercera a definir) existen como actividades con slots de sábado por sede/horario, cada una con su cupo propio.

### PASE — Pase mensual "Actividades con Aura"

- [ ] **PASE-01**: Existen planes de categoría `especial` con budget mensual explícito de 2 clases, independiente del tope semanal (`classesPerWeek`).
- [ ] **PASE-02**: Un socio activo puede tener el pase Socio ($10.000 ARS) como suscripción en paralelo a su plan presencial; la asignación valida que tenga presencial activo.
- [ ] **PASE-03**: Un externo (sin plan presencial) puede tener el pase Externo ($20.000 ARS) como única suscripción.
- [ ] **PASE-04**: El pase entra al ciclo normal de renovación, cobro y deuda sin regresiones en los planes existentes.

### GATE — Gating y consumo

- [ ] **GATE-01**: El backend rechaza la reserva de una actividad especial sin pase con saldo, con código de error tipado (hoy no existe gating por actividad).
- [ ] **GATE-02**: Cada asistencia a una actividad especial consume 1 clase del pase, no del presupuesto del plan presencial.
- [ ] **GATE-03**: El socio presencial sin pase no puede reservar actividades especiales; su acceso a clases regulares no cambia en nada.
- [ ] **GATE-04**: El externo con pase solo puede reservar actividades especiales, no clases regulares.

### APP — Member app

- [ ] **APP-01**: La grilla de reservas muestra las actividades especiales con distintivo y estado según el acceso del usuario (con pase / sin pase).
- [ ] **APP-02**: El usuario con pase ve cuántas clases especiales le quedan en el mes (2/2, 1/2, 0/2).
- [ ] **APP-03**: El usuario sin pase que intenta reservar una actividad especial recibe un mensaje claro de qué es el pase y cómo conseguirlo (informativo — sin pago in-app).

### REP — Reporte para reparto

- [ ] **REP-01**: El admin ve las asistencias por actividad especial por mes, separando origen socio/externo, como insumo del reparto manual a los profes (sin montos calculados).

## Future Requirements (deferred)

- **REP-F1**: Reparto con montos calculados por profe (requiere fijar la regla exacta de reparto — Nacho aún duda entre tercios y proporcional — y ligar cobros a asistencias).
- **APP-F1**: Compra del pase in-app con gateway de pago (depende del milestone de payment gateway, v6.0+).
- **PASE-F1**: Precios del pase configurables por país/sede más allá del mecanismo estándar de planes.

## Out of Scope (this milestone)

- **Pago in-app / gateway**: la venta del pase es carga manual vía admin/PoS, como todo cobro hoy.
- **Reparto automático / liquidaciones a profes**: no existe infra de liquidaciones; REP-01 entrega el insumo y el reparto es manual.
- **Notificaciones push / campaña de lanzamiento** de las actividades — anuncio ad-hoc fuera de este milestone.
- **Programas** como vehículo del pase — descartado tras research (ver encabezado).

## Traceability

<!-- Filled by roadmap -->

| Requirement | Phase     | Status  |
| ----------- | --------- | ------- |
| ACT-01      | Phase 161 | Pending |
| ACT-02      | Phase 161 | Pending |
| PASE-01     | Phase 161 | Pending |
| PASE-02     | Phase 161 | Pending |
| PASE-03     | Phase 161 | Pending |
| PASE-04     | Phase 161 | Pending |
| GATE-01     | Phase 161 | Pending |
| GATE-02     | Phase 161 | Pending |
| GATE-03     | Phase 161 | Pending |
| GATE-04     | Phase 161 | Pending |
| APP-01      | Phase 162 | Pending |
| APP-02      | Phase 162 | Pending |
| APP-03      | Phase 162 | Pending |
| REP-01      | Phase 162 | Pending |
