# Requirements — v5.3 Mejoras Caja / Módulo Contable (feedback v5.2)

Scope derivado del feedback operativo de v5.2, consolidado en
`BRIEF-FEEDBACK-V52-CAJA.md`. Cinco áreas (A–E). Descartados / ya existentes:
puntos 2 (cambiar plan = gestión), 3 (sugerir precio = ya existe), 7 (turnos
fijos = ya existe), 8 (dinero pendiente = ya resuelto).

**Constraint:** staging-first estricto. Backend = Fastify + Drizzle + MySQL
(`el-templo-api`); admin = Quasar/Vue3 (`el-templo-admin`). Migraciones con SQL
commiteado; tests de integración para rutas nuevas.

---

## v5.3 Requirements

### A — Aviso de deuda en la PoS (POS)

- [x] **POS-01**: Al seleccionar un socio en "Cargar pago", si tiene deuda, se muestra un aviso destacado (monto + plan) en **ambos modos** (Pago de plan / Cobro suelto). Usa `autocompletar.outstanding` (ya disponible); no se recarga el buscador.

### B — Imputación de caja en la validación (CAJA) — _fundacional para C y D_

- [ ] **CAJA-01**: El cobro del profe nace con una **caja sugerida** (efectivo de la sede del profe vía `recordedBy` / banco por moneda), marcada como no-definitiva.
- [ ] **CAJA-02**: Al validar un pago pendiente, gestión puede **confirmar o cambiar** la caja imputada (`cash_register_id`). El endpoint de validación (hoy inmutable) se abre para recibirla.
- [ ] **CAJA-03**: El sistema soporta **múltiples cuentas banco** (varias cajas tipo `banco`). Gestión elige la cuenta al validar una transferencia. Staging seedea **Galicia** + **Mercado Pago**.
- [ ] **CAJA-04**: La PoS del profe **no** ofrece selector de caja/sede — el profe nunca elige caja.

### C — Cobro suelto → alta de plan posterior (COBRO)

- [x] **COBRO-01**: El "Cobro suelto" incluye un dropdown **Motivo** con opciones "Sin plan activo" / "Otro", persistido como **campo** (no texto libre).
- [ ] **COBRO-02**: En Pendientes, un cobro con motivo "Sin plan activo" muestra un chip **"Sin plan — asignar"** que navega a la ficha del alumno.
- [ ] **COBRO-03**: Al asignar un plan, gestión puede **usar la plata de un cobro suelto pendiente** del socio para cubrir el monto: anula el cobro suelto y **recrea un `plan_charge`** vinculado a la sub (misma caja/monto/método), de forma **atómica** dentro de `assignPlan`. Gestión ve **todos** los cobros sueltos pendientes del socio.
- [ ] **COBRO-04**: Si el cobro suelto **excede** el precio del plan, el **excedente no se aplica** (lo maneja gestión aparte).
- [ ] **COBRO-05**: El botón **"Validar" manual queda bloqueado** en la bandeja para los cobros marcados "Sin plan activo" (se redirigen a asignar plan, para que no queden como plata suelta validada).

### D — "Movimientos de caja" como arqueo por caja (ARQUEO)

- [ ] **ARQUEO-01**: La pestaña "Movimientos de caja" muestra **todo lo imputado a una caja** (cobros de socio + egresos + traspasos + ajustes), filtrando por `cash_register_id` (todos los tipos, no solo los sin-socio).
- [ ] **ARQUEO-02**: La vista muestra **pendientes y validados**, cada uno **marcado** con su estado.
- [ ] **ARQUEO-03**: El filtro **Tipo** incluye **Cobros** (además de Movimientos / Egresos / Ajustes).
- [ ] **ARQUEO-04**: La pestaña "Transacciones" (vista comercial por socio) **se mantiene** sin cambios de criterio.

### E — Centros de costo para egresos (EGR)

- [ ] **EGR-01**: Existe un catálogo `cost_centers` (por país), seedeado en AR con **Alquiler Constitución / Librería / Viáticos profes / Varios**.
- [ ] **EGR-02**: Registrar un egreso **exige** elegir un centro de costo (obligatorio; "Varios" como escape). Solo aplica a egresos (kind `expense`).
- [ ] **EGR-03**: La lista de "Movimientos de caja" muestra el **centro de costo** de cada egreso.

---

## Future Requirements (deferred)

- **EGR-F1**: Reporte de egresos agrupado por centro de costo (por período y caja/sede).
- **EGR-F2**: ABM de centros de costo desde la UI (alta/edición/baja).
- **CAJA-F1**: ABM de cuentas banco desde la UI (staging usa seeds).

## Out of Scope (this milestone)

- Reporte por centro de costo y ABM de centros (diferidos arriba).
- ABM de cuentas banco desde UI (staging usa seeds Galicia/Mercado Pago).
- Cambiar plan en el cobro del profe (es trabajo de gestión, descartado).
- Facturación electrónica AFIP/ARCA (sigue fuera, como en v5.2).

## Traceability

| REQ-ID    | Phase | Status   |
| --------- | ----- | -------- |
| POS-01    | 145   | Complete |
| COBRO-01  | 145   | Complete |
| COBRO-02  | 145   | pending  |
| CAJA-01   | 146   | pending  |
| CAJA-02   | 146   | pending  |
| CAJA-03   | 146   | pending  |
| CAJA-04   | 146   | pending  |
| COBRO-03  | 146   | pending  |
| COBRO-04  | 146   | pending  |
| COBRO-05  | 146   | pending  |
| ARQUEO-01 | 146   | pending  |
| ARQUEO-02 | 146   | pending  |
| ARQUEO-03 | 146   | pending  |
| ARQUEO-04 | 146   | pending  |
| EGR-01    | 147   | pending  |
| EGR-02    | 147   | pending  |
| EGR-03    | 147   | pending  |

_17/17 v5.3 requirements mapped — no orphans, no duplicates._
