# Requirements: El Templo v5.0 — Métricas de Gestión

**Defined:** 2026-06-03
**Core Value:** El panel de gestión reemplaza y amplía sus métricas con 6 bloques nuevos/mejorados que miden personas (no suscripciones), respetan el rango de fechas del panel, aíslan moneda ARS/EUR y se pueden comparar lado a lado por sucursal/país/duración/plan. El gestor puede diagnosticar churn, renovación, conversión de pruebas, frecuencia de asistencia, vida del cliente y ticket promedio sobre datos correctos.

**Reference:** `ESPECIFICACION-METRICAS-GESTION.md` (spec de negocio, fuente de verdad) + `BRIEF-METRICAS-GESTION.md` (inventario actual) + `METRICAS_GESTION_HANDOFF_2026-06-02.md` (estructura de fases y hallazgos de código). Continúa la línea de analytics de las fases 117-118.

**Alcance:** Backend-first — servicios, endpoints, tests y migraciones. La UI del admin para consumir estos bloques es una fase de frontend posterior, fuera de este milestone.

**Reglas transversales (aplican a todos los bloques salvo indicación):**

- **Nominal + % + n siempre juntos.** Todo porcentaje expone su tamaño de muestra.
- **Breakdowns comparables.** Toda métrica se abre y compara lado a lado por sucursal, país, duración de plan (corto/largo) y nombre de plan.
- **Aislamiento de moneda.** ARS y EUR nunca se suman.
- **Cortes temporales.** Vistas semanal/mensual donde aplique; las cohortes respetan el rango de fechas del panel (no ventanas rodantes "desde hoy" salvo que se especifique).
- **`duration_tier` por flag** (`monthly | long_term`), no hardcodeando nombres de plan.

**Decisiones abiertas (se resuelven en el `discuss-phase` de cada fase, NO ahora):**

- `duration_tier`: columna explícita en `subscription_plans` (migración) vs derivado de `durationDays`. Validar contra planes reales.
- Bloque 4: ¿el refactor de segmentación batch nocturna entra en alcance o se difiere?
- `renewalRate` 7/14/30 actual: ¿se retira o convive con el Bloque 2?
- ARPU (Finanzas Avanzadas): ¿se jubila o convive con el LTV del Bloque 5?
- Edge cases: churn sobre el último vencimiento del rango (B1); reactivación como una vida con gap vs dos vidas (B5).

---

## v5.0 Requirements

~35 requirements en 7 categorías (1 fundación transversal + 6 bloques).

### Fundación transversal (FUND)

- [x] **FUND-01**: Existe un mecanismo de `duration_tier` (`monthly | long_term`) por plan, resuelto por flag y no por nombre, consumible por todas las métricas para el breakdown corto/largo plazo.
- [x] **FUND-02**: Helper común que devuelve toda métrica como nominal + porcentaje + n (tamaño de muestra) en una estructura uniforme reutilizada por los 6 bloques.
- [x] **FUND-03**: Motor de breakdowns que abre cualquier métrica por sucursal, país, duración de plan y nombre de plan, devolviendo los segmentos comparables lado a lado (no solo como filtro).
- [x] **FUND-04**: Toda métrica financiera se calcula y devuelve aislada por moneda (ARS y EUR nunca se suman en un mismo total).
- [x] **FUND-05**: Las métricas de cohorte respetan el rango de fechas `[from, to)` del panel y exponen vista semanal/mensual seleccionable donde aplique (corrige caveat #1).

### Bloque 1 — Churn de no renovación (CHURN)

- [x] **CHURN-01**: El gestor obtiene el churn como **personas distintas** (no suscripciones) cuya sub venció en `[from, to)` y no registraron sub nueva dentro de N días — reemplaza la métrica vieja basada en `updated_at`.
- [x] **CHURN-02**: El parámetro N es configurable y libre (no fijo); el endpoint acepta múltiples N en simultáneo para la vista comparativa (churn@5 / @10 / @15 lado a lado).
- [x] **CHURN-03**: Solo entran al cálculo personas cuyo vencimiento ocurrió hace ≥ N días ("churn maduro"); las que siguen en ventana de gracia se excluyen de numerador y denominador hasta madurar.
- [x] **CHURN-04**: Renovación anticipada (paga antes de vencer) y cambio de duración (mensual↔largo plazo) cuentan como retención, no como churn. Una sub en pausa no cuenta como vencida.
- [x] **CHURN-05**: El gestor obtiene una serie histórica de churn por cohorte de vencimiento mes a mes, con marca de períodos provisorios (cohorte aún inmadura).
- [x] **CHURN-06**: El churn se abre por los breakdowns estándar (duración, nombre de plan, sucursal, país) con nominal + % + n.

### Bloque 2 — Tasa de renovación (RENOV)

- [x] **RENOV-01**: El gestor obtiene la tasa de renovación = renovados ÷ vencidos en la franja `[from, to)`, sobre la misma cohorte de personas que el Bloque 1.
- [x] **RENOV-02**: El corte renovación/reactivación es configurable y arranca en 15 días (volver a pagar dentro de 15 días = renovación; después = reactivación, fuera de alcance).
- [x] **RENOV-03**: La tasa es un "número vivo": no se fuerza que renovación% + churn% = 100; la consistencia entre ambos solo se cumple cuando toda la cohorte maduró (en_gracia = 0).
- [x] **RENOV-04**: La renovación se ordena y compara por segmento (sucursal, país, corto/largo, nombre de plan) para descubrir buenos y malos performers.

### Bloque 3 — Funnel de sesiones de prueba (FUNNEL)

- [x] **FUNNEL-01**: El gestor obtiene la cascada reserva → asistencia → compra con los tres números y las dos tasas: `tasa_show = asistieron ÷ reservaron`, `tasa_cierre = compraron ÷ asistieron` (sobre asistentes, no reservas), `punta_a_punta = compraron ÷ reservaron`.
- [x] **FUNNEL-02**: La conversión usa una ventana de atribución configurable (~21 días desde la sesión); la cohorte madura sola hasta cerrar la ventana.
- [x] **FUNNEL-03**: Solo cuentan leads nuevos sin suscripción paga previa; quien ya fue miembro y vuelve es reactivación, no conversión de prueba.
- [x] **FUNNEL-04**: La cohorte se ancla por la **fecha de la sesión de prueba agendada** (no por fecha de reserva ni de compra), con cortes semanal/mensual respetando el filtro.
- [x] **FUNNEL-05**: El funnel se abre por sucursal, país, turno/horario y plan que terminan comprando, con nominal y %. (No es el funnel freemium→prueba→activo de la sección 6, que está apagado.)

### Bloque 4 — Frecuencia de asistencia por miembro (FREQ)

- [x] **FREQ-01**: El gestor obtiene la frecuencia = promedio de visitas/semana por miembro sobre las últimas 4 semanas rodantes, normalizando a los miembros con < 4 semanas de antigüedad.
- [x] **FREQ-02**: Cada miembro cae en una banda (Inactivo 0 / Bajo ~1 / Medio ~2 / Alto 3+) y el gestor ve la distribución (cuántos miembros por banda), incluyendo activos con 0 visitas.
- [x] **FREQ-03**: El gestor obtiene la lista de "enfriándose": miembros que bajaron al menos una banda entre las 4 semanas actuales y las 4 previas, con el % de variación al lado.
- [x] **FREQ-04**: Toda vista de frecuencia expone al lado el % de adopción de check-in de la sede como condición de validez del dato (corrige caveat #6).
- [x] **FREQ-05**: La frecuencia alimenta y corrige los segmentos existentes (espartano/intermitente/en_riesgo/ghost…) que se mantienen y mejoran.
- [x] **FREQ-06**: El recálculo de segmentación corre en un proceso batch (ej. nightly) usando la frecuencia como insumo, en vez de solo al login con cooldown (corrige caveat #8). _(Alcance exacto a confirmar en discuss-phase.)_

### Bloque 5 — LTV / vida del cliente (LTV)

- [x] **LTV-01**: El gestor obtiene el lifetime headline = 1 ÷ churn mensual (usando el churn del Bloque 1), por los breakdowns estándar.
- [x] **LTV-02**: El gestor obtiene el lifetime robusto vía Kaplan-Meier (mediana de supervivencia), tratando a los clientes activos como datos censurados (sin descartarlos).
- [x] **LTV-03**: El fin de vida de un cliente se define con la lógica de churn maduro del Bloque 1 (los bloques se encadenan).
- [x] **LTV-04**: El LTV monetario se calcula desde pagos reales: proyectado (lifetime × ingreso mensual real por cliente) y observado (suma real pagada en la vida del cliente cerrado), nunca vía ARPU snapshot.
- [x] **LTV-05**: El LTV se devuelve separado por moneda y se abre por sucursal, país y plan (qué membresía retiene vidas más largas y deja más plata).

### Bloque 6 — Ticket promedio (TICKET)

- [x] **TICKET-01**: El gestor obtiene el ticket por plan = promedio de `price_paid` realmente cobrado (no precio de lista), capturando descuentos automáticamente.
- [x] **TICKET-02**: El ticket global = suma total cobrada ÷ cantidad de cobros (promedio ponderado por volumen, no promedio de promedios), por moneda, sobre todos los cobros de membresía del período por fecha de cobro.
- [x] **TICKET-03**: El gestor obtiene el descuento promedio aplicado = `price_paid` vs precio de lista del plan, por plan y por sede, con la mediana junto al promedio para amortiguar outliers.
- [x] **TICKET-04**: El ticket se devuelve aislado por moneda y se abre por corto/largo plazo, sucursal y país.

---

## Future Requirements (deferred)

- **UI del admin** para los 6 bloques (visualización, comparadores lado a lado, tooltips de provisionalidad). Fase de frontend posterior.
- **Reactivación** como métrica propia (quien vuelve después del corte de 15 días).
- **Activación temprana** (primeras N semanas del cliente nuevo).
- **MRR con componentes** (nuevo / expansión / contracción / churn).

## Out of Scope

- Visualización/dashboards en el admin durante este milestone (backend-first).
- Mezclar monedas en cualquier total (prohibido por regla transversal).
- Reescribir el funnel freemium→prueba→activo de la sección 6 (apagado; el Bloque 3 es otra cosa).
- Splits de archivos largos (v4.9 Refactor Splits).

## Traceability

<!-- REQ-ID → Phase (filled by roadmap 2026-06-03). 35/35 mapped, 100% coverage. -->

| Requirement | Phase     | Status   |
| ----------- | --------- | -------- |
| FUND-01     | Phase 120 | Complete |
| FUND-02     | Phase 120 | Complete |
| FUND-03     | Phase 120 | Complete |
| FUND-04     | Phase 120 | Complete |
| FUND-05     | Phase 120 | Complete |
| TICKET-01   | Phase 120 | Complete |
| TICKET-02   | Phase 120 | Complete |
| TICKET-03   | Phase 120 | Complete |
| TICKET-04   | Phase 120 | Complete |
| CHURN-01    | Phase 121 | Complete |
| CHURN-02    | Phase 121 | Complete |
| CHURN-03    | Phase 121 | Complete |
| CHURN-04    | Phase 121 | Complete |
| CHURN-05    | Phase 121 | Complete |
| CHURN-06    | Phase 121 | Complete |
| RENOV-01    | Phase 121 | Complete |
| RENOV-02    | Phase 121 | Complete |
| RENOV-03    | Phase 121 | Complete |
| RENOV-04    | Phase 121 | Complete |
| LTV-01      | Phase 122 | Complete |
| LTV-02      | Phase 122 | Complete |
| LTV-03      | Phase 122 | Complete |
| LTV-04      | Phase 122 | Complete |
| LTV-05      | Phase 122 | Complete |
| FREQ-01     | Phase 123 | Complete |
| FREQ-02     | Phase 123 | Complete |
| FREQ-03     | Phase 123 | Complete |
| FREQ-04     | Phase 123 | Complete |
| FREQ-05     | Phase 123 | Complete |
| FREQ-06     | Phase 123 | Complete |
| FUNNEL-01   | Phase 123 | Complete |
| FUNNEL-02   | Phase 123 | Complete |
| FUNNEL-03   | Phase 123 | Complete |
| FUNNEL-04   | Phase 123 | Complete |
| FUNNEL-05   | Phase 123 | Complete |
