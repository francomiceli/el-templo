# Requirements — v5.4 Reforma del Admin — Correcciones white-label (pre-tenants)

Scope derivado de `.docs/saas-multitenancy/Correcciones El Templo.md` (doc crudo de
Nacho) + `01-analisis-correcciones-admin.md` (análisis bajo lente SaaS con mapa
imagen→código). Primera etapa del camino SaaS: reforma PRIMERO, tenancy DESPUÉS
(secuencial). **SIN tenants**: nada de tabla `tenants`, `tenant_id` ni mecanismo de
módulos en este milestone.

**Constraint transversal:** todo cambio de API adopta los patrones del diseño SaaS
validado (motor vs plantilla; imports módulo→core solamente; sin nuevos Templo-ismos
en core — `.docs/saas-multitenancy/04-mecanismo-modulos.md`). Staging-first estricto.
Migraciones con SQL commiteado; tests de integración para rutas nuevas.

**Nota de solapamiento con v5.3:** este milestone levanta los diferidos EGR-F2 (ABM
centros de costo) y CAJA-F1 (ABM cuentas banco) de v5.3. Las mejoras de Deudas cruzan
con el "Motivo" que v5.3 ya agregó — verificar en plan-phase antes de duplicar.

---

## v5.4 Requirements

### NAV — Re-estructuración de navegación + RBAC

- [x] **NAV-01**: El nav del admin se agrupa en categorías **Finanzas / Alumnos / Horarios / Planes**; Pagos, Caja, Analíticas, Reportes y Deudas viven dentro de Finanzas.
- [x] **NAV-02**: **Finanzas** (completa) y **Planes** (edición) son visibles solo para admin/owner del gimnasio.
- [x] **NAV-03**: El profe/administrativo ve **solo Pagos** (registrar cobro) dentro de Finanzas, y **Planes en modo lectura** (qué incluye + precios, sin editar).
- [x] **NAV-04**: Campañas, Profes/Puntuaciones y las páginas de landing/marketing quedan **fuera del nav MVP** (gateadas por rol/flag, no borradas — siguen accesibles para El Templo).

### COBRO — Registrar cobro (Pagos → Cobros)

- [x] **COBRO-01**: "Pagos" se renombra **"Cobros"** en nav, página y textos ("Mis cargas de hoy" → "Cobros").
- [x] **COBRO-02**: El registro del cobro se reorganiza como **pantallas/pasos separados** (una sola cosa que hacer por paso) en vez de la sucesión de expansiones anidadas; funciona bien en desktop y mobile.
- [x] **COBRO-03**: El listado de cargas del profe muestra **fecha + hora** de cada registro (hoy muestra históricos sin fecha), y el botón "Continuar" queda arriba del listado.
- [x] **COBRO-04**: Un cobro por **transferencia o tarjeta** exige **seleccionar una cuenta bancaria** existente; si no hay cuentas cargadas, ofrece **crear cuenta rápida** inline y no permite finalizar sin asociarla.

### CTA — Cuentas bancarias flexibles

- [x] **CTA-01**: El admin puede **crear cuentas bancarias** con campos Banco, N° de cuenta, Titular, CUIT, CBU/CVU, Alias — solo 3 obligatorios (flexible para monotributos/empresas/varias cuentas).
- [x] **CTA-02**: El admin puede **cerrar/desactivar** una cuenta bancaria (baja lógica, conserva historial de movimientos).
- [x] **CTA-03**: El admin puede registrar **retiros del dueño** desde una cuenta bancaria o caja (egreso tipo "Retiro"), para que los saldos reflejen la realidad.

### CAJA — Reorganización de la vista de Caja

- [x] **CAJA-01**: **"Movimientos de caja" es la portada** de Caja (primer tab); "Pendientes" pasa a segundo; "Transacciones" (renombrada **"Cobros"**) tercero.
- [x] **CAJA-02**: El listado de cobros muestra **etiqueta validada/pendiente** en cada fila.
- [x] **CAJA-03**: Los filtros de fecha (Cobros y Movimientos) vienen por mes pero permiten **elegir por días** para revisar dudas puntuales.
- [x] **CAJA-04**: El detalle de un cobro incluye **fecha de validación y usuario validador** (como ya muestra Movimientos).
- [x] **CAJA-05**: Las **categorías de egreso son configurables** desde la UI (ABM de centros de costo — levanta EGR-F2 de v5.3), con defaults genéricos que incluyen **"Pago a proveedores"** y **"Retiros"** en vez de los Templo-céntricos como única opción.
- [x] **CAJA-06**: La vista Saldos muestra una **nota explicativa**: "si no se registran egresos y retiros, los saldos no reflejarán la realidad".

### DEUDA — Mejoras de Deudas

- [x] **DEUDA-01**: Cada deuda muestra **fecha desde que se registró**.
- [x] **DEUDA-02**: Cada deuda muestra su **motivo** (verificar contra el "Motivo" agregado en v5.3 antes de duplicar).
- [x] **DEUDA-03**: Cada deuda muestra **a qué pago/plan está asociada** (plan y período).
- [x] **DEUDA-04**: La vista de Deudas incluye también a los socios con **plan vencido sin renovar** (no-renovaciones), para ocuparse del negocio desde una sola pantalla.

### ALUM — Alumnos (de-Templo-ficación + accesos)

- [x] **ALUM-01**: "Crear nuevo alumno" es la **acción prominente** de la página de Alumnos.
- [x] **ALUM-02**: **Registrar cobro** es una **acción directa en la fila** del alumno (junto al lápiz), no anidada dentro de la ficha.
- [x] **ALUM-03**: Las **reglas de precio por medio de pago** (recargo tarjeta, etc.) dejan de estar hardcodeadas: pasan a **configuración** (default estándar sin recargo; El Templo activa la suya).
- [x] **ALUM-04**: "Avatar" se renombra a un concepto neutro (**"segmento" / categoría de socio**) en toda la UI del admin; el mecanismo subyacente se conserva.
- [x] **ALUM-05**: Los **niveles griegos** (kairos→spartan) quedan **gateados como superficie Templo** (fuera del default white-label del admin), consistente con el gating de Entrenamiento existente.

### HOR — Horarios

- [x] **HOR-01**: El sistema permite **dos clases simultáneas en la misma sucursal** (musculación conviviendo con actividades).
- [x] **HOR-02**: Se puede **crear una clase/actividad directamente desde el slot** del horario (generaliza el "test de profe" Templo-específico).
- [x] **HOR-03**: Cada **actividad define su capacidad** (cupo), en lugar de heredar únicamente la capacidad de la sucursal.

### PLAN — Planes de pago vs Rutinas de entrenamiento

- [x] **PLAN-01**: "Planes" y "Programas" se separan con nombres claros: **"Planes de pago"** (categoría Planes) y **"Rutinas de entrenamiento"** (subcategoría, gateada como Templo/entrenamiento).
- [x] **PLAN-02**: El **precio "Zero"** deja de ser parte del default: pasa a configuración (El Templo lo conserva activo).
- [x] **PLAN-03**: Un plan puede dar acceso a **varios programas seleccionados** (además del "todos los programas" existente).
- [x] **PLAN-04**: **Actualizar el precio** de un plan (inflación) no requiere crear un plan nuevo **ni altera los montos históricos** ya cobrados (verificar el comportamiento actual y garantizarlo con test).

---

## Future Requirements (deferred)

- **ANLT-F1**: Correcciones finas de Analíticas — cobrado vs devengado, no-renovaciones con total propio, LTV (activar o dar de baja), asistencia explicada, retención unificada, conversión al final. Nacho: "voy a dejar sus correcciones para el final; seguro hay muchas cosas que salgan en la práctica".
- **HOR-F1**: Asistencia real marcada por QR desde la app del alumno (histórico de tránsito por horario). Cruza a la app de miembros.
- **COBRO-F1**: Datos del frente de la tarjeta en pagos con tarjeta (antifraude / pagos al exterior).
- **PLAN-F1**: Rutinas por objetivo/grupo muscular/nivel/días + IA que dialoga con las máquinas del gimnasio (motor de entrenamiento genérico — post-MVP, territorio del diseño SaaS doc 02 §2).

## Out of Scope (this milestone)

- **Tenancy completa**: tabla `tenants`, `tenant_id`, mecanismo de módulos, tests de aislamiento — fase posterior, diseño ya validado en `.docs/saas-multitenancy/`.
- **App de miembros multi-tenant** — diferida, funda el repo SaaS.
- **Analíticas finas** (ANLT-F1) — solo se mueven Analíticas/Reportes dentro de Finanzas en el nav.
- **Borrar features Templo** (Campañas, Puntuaciones, landing, SPOM) — se gatean, no se borran.

## Traceability

Every v5.4 requirement maps to exactly one phase. Coverage: 33/33.

| Requirement | Phase     | Status   |
| ----------- | --------- | -------- |
| NAV-01      | Phase 149 | Complete |
| NAV-02      | Phase 149 | Complete |
| NAV-03      | Phase 149 | Complete |
| NAV-04      | Phase 149 | Complete |
| CTA-01      | Phase 150 | Complete |
| CTA-02      | Phase 150 | Complete |
| CTA-03      | Phase 150 | Complete |
| COBRO-01    | Phase 151 | Complete |
| COBRO-02    | Phase 151 | Complete |
| COBRO-03    | Phase 151 | Complete |
| COBRO-04    | Phase 151 | Complete |
| CAJA-01     | Phase 152 | Complete |
| CAJA-02     | Phase 152 | Complete |
| CAJA-03     | Phase 152 | Complete |
| CAJA-04     | Phase 152 | Complete |
| CAJA-05     | Phase 152 | Complete |
| CAJA-06     | Phase 152 | Complete |
| DEUDA-01    | Phase 153 | Complete |
| DEUDA-02    | Phase 153 | Complete |
| DEUDA-03    | Phase 153 | Complete |
| DEUDA-04    | Phase 153 | Complete |
| ALUM-01     | Phase 154 | Complete |
| ALUM-02     | Phase 154 | Complete |
| ALUM-03     | Phase 154 | Complete |
| ALUM-04     | Phase 154 | Complete |
| ALUM-05     | Phase 154 | Complete |
| HOR-01      | Phase 155 | Complete |
| HOR-02      | Phase 155 | Complete |
| HOR-03      | Phase 155 | Complete |
| PLAN-01     | Phase 156 | Complete |
| PLAN-02     | Phase 156 | Complete |
| PLAN-03     | Phase 156 | Complete |
| PLAN-04     | Phase 156 | Complete |
