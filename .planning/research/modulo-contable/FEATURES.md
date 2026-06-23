# Feature Landscape — Módulo Contable / Libro de Caja

**Dominio:** software de gestión / libro de caja multi-sucursal para PYME (gimnasio, 8 sedes ARS+EUR)
**Researched:** 2026-06-23
**Confianza global:** MEDIUM-HIGH (patrones de industria bien establecidos; el brief ya cubre la mayoría)

> Nota de encuadre: el brief del equipo (`BRIEF-MODULO-CONTABLE-FRANCO.md`) es **inusualmente maduro**. Cubre casi todas las table stakes de la industria y toma decisiones correctas (void-con-rastro, doble entrada en movimientos, separar activar/validar). Este doc confirma patrones, marca lo que falta y señala riesgos. La sección final "Contraste con el brief" es el entregable más accionable.

---

## 1. Validación de pagos / máquina de estados

### Table stakes

| Feature                                                           | Por qué se espera                                                                                | Complejidad | Dependencias                                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------ |
| Estado de "pendiente de aprobación" para carga de bajo privilegio | Patrón estándar de multi-level approval workflow en POS/ERP; quien cobra no se valida a sí mismo | Media       | `financial_transactions` necesita columna `status` (hoy solo nace firme + soft-void) |
| Firma de quién cargó / quién validó + timestamps                  | Trazabilidad mínima; ya tenés `recordedBy`                                                       | Baja        | agregar `validatedBy`/`validatedAt`                                                  |
| Transición de error/rechazo (observado→corregido)                 | Sin esto, el validador solo puede aprobar o anular; el ciclo de corrección es estándar           | Media       | máquina de estados                                                                   |
| Filtro/bandeja de pendientes por antigüedad                       | El "pendiente que envejece" es el control que reemplaza al cierre diario                         | Baja        | índice por `status`+`createdAt`                                                      |
| Distinguir saldo firme vs. pendiente                              | Pendientes NO deben sumar al saldo confirmado de caja                                            | Media       | cálculo de saldo excluye `status≠validado`                                           |

### Diferenciadores

| Feature                                                                                            | Valor                                        | Complejidad | Notas                                                     |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------- | ----------- | --------------------------------------------------------- |
| Validación selectiva por reglas ("solo dudosos": monto fuera de rango, socio nuevo, efectivo alto) | Escala el control sin revisar el 100%        | Alta        | el brief lo deja como perilla futura — correcto diferirlo |
| Alerta configurable por antigüedad de pendiente                                                    | Convierte una lista pasiva en proceso activo | Baja-Media  | perilla de días-umbral                                    |
| Activar membresía ≠ validar pago (instantáneo + pendiente en paralelo)                             | Elimina fricción al socio sin perder control | Media       | es la decisión central del brief; correcta                |

### Anti-features

- **No** modelar autorización multinivel de N niveles (gerente→director→...). Para 8 sedes, 2 roles (carga / valida) alcanzan. Más niveles = burocracia.
- **No** atar el estado de validación a un gateway/settlement externo (AuthorizedPending, settlement date). El brief lo descarta explícitamente — correcto: acá no hay gateway, todo es manual.
- **No** auto-expirar pendientes a un estado "vencido". Envejecen y alertan, no mutan solos. El brief ya lo decide así.

---

## 2. Libro de caja / cash register multi-sucursal

### Table stakes

| Feature                                            | Por qué se espera                                                                      | Complejidad | Dependencias                                                           |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------- |
| Saldo en vivo por caja                             | Núcleo del libro de caja; "¿cuánto debería haber acá?"                                 | Media       | entidad `caja` con saldo derivado de transacciones                     |
| Separación efectivo vs. electrónico                | Estándar (cash drawer vs. card/transfer); la plata física se cuenta, la electrónica no | Baja        | ya separable vía `paymentMethod`; necesita tipo de caja efectivo/banco |
| Historial de movimientos por caja                  | Auditoría básica del flujo                                                             | Baja        | listado filtrado por `cajaId`                                          |
| Diferencia esperado vs. contado (overage/shortage) | Estándar en reconciliación de caja; se registra al momento del conteo físico           | Media       | campo de "contado" en la operación de retiro/movimiento                |

### Diferenciadores

| Feature                                                            | Valor                                                   | Complejidad | Notas                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------- | ----------- | ------------------------------------------------------------- |
| Reconciliación atada al evento de retiro (no a cierre diario fijo) | Encaja con que las admins no están en cada sede         | Media       | el brief lo elige — buena adaptación al modelo operativo real |
| Caja banco única global (no por sucursal)                          | Refleja que transfer/tarjeta no son físicas de una sede | Baja        | decisión de modelado del brief; correcta                      |
| Aislamiento de moneda en saldos (ARS vs EUR)                       | 7 sedes ARS + 1 EUR; no se pueden sumar                 | Media-Alta  | una caja no debería mezclar monedas; ver gaps                 |

### Anti-features

- **No** implementar cierre/apertura de turno (shift open/close) con float inicial y arqueo obligatorio. Es el patrón POS retail clásico, pero el brief lo descarta con buena razón (las admins no están en cada local cada día). Forzarlo crearía pendientes de cierre que nadie cierra.
- **No** modelar "float" / fondo fijo de cambio como concepto separado al arrancar. Útil en retail con vuelto; sobra para cobro de membresías. Diferir.
- **No** sub-cajas por usuario/cajero individual. El nivel "caja por sucursal" es el grano correcto; granular por persona = ruido.

---

## 3. Movimientos entre cajas y egresos

### Table stakes

| Feature                                                                           | Por qué se espera                                                  | Complejidad | Dependencias                                                                        |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------- |
| Movimiento inter-caja con doble entrada (debita origen, acredita destino, neto=0) | Principio contable básico; sin doble entrada los saldos no cuadran | Media       | nueva operación; reusa `direction` inflow/outflow o un par de transacciones ligadas |
| Egreso (salida real, solo debita, neto negativo)                                  | El libro de caja necesita registrar plata que sale                 | Media       | nueva operación                                                                     |
| Depósito efectivo→banco modelado como movimiento (no egreso)                      | Error clásico: tratar el depósito como gasto descuadra todo        | Baja        | clasificación correcta en UI                                                        |
| Trazabilidad de quién/cuándo en cada movimiento/egreso                            | Auditoría                                                          | Baja        | `recordedBy`+timestamp                                                              |

### Diferenciadores

| Feature                                                            | Valor                                          | Complejidad | Notas                                |
| ------------------------------------------------------------------ | ---------------------------------------------- | ----------- | ------------------------------------ |
| Esperado vs. contado en el movimiento (registra diferencia física) | Convierte el retiro en punto de reconciliación | Media       | el brief lo pide; buen diseño        |
| Nota libre en egreso sin categoría obligatoria                     | Arranca simple, categoriza después             | Baja        | decisión del brief; correcta para v1 |

### Anti-features

- **No** construir plan de cuentas / categorización de egresos (proveedor/dueño/gasto) ahora. El brief lo difiere — correcto. Es donde los proyectos contables se atascan.
- **No** modelar transferencias inter-moneda (caja ARS → caja EUR) con tipo de cambio. Las sedes no mueven plata entre países. Si surge, es egreso+ingreso manual, no una feature.
- **No** reversar movimientos con "delete". Igual que pagos: void-con-rastro. Un movimiento mal cargado se anula dejando huella (ver gap: el brief no explicita el void de movimientos/egresos).

---

## 4. Carga única que propaga

### Table stakes

| Feature                                                        | Por qué se espera                                     | Complejidad | Dependencias                                                                          |
| -------------------------------------------------------------- | ----------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------- |
| Un registro de pago activa membresía Y impacta caja en un acto | Es el objetivo del proyecto: matar el triple tipeo    | Media       | `transaction_links` ya une pago↔subscription; falta la UI/servicio que orqueste ambos |
| Cobro suelto (pago sin membresía asociada)                     | No todo cobro es membresía (productos, deuda, ajuste) | Baja        | modelo ya lo aguanta (`debt_balance`/`adjustment`); falta pantalla                    |
| Idempotencia / no doble-carga del mismo pago                   | Si propaga a 2 lugares, no puede ejecutarse dos veces | Media       | clave de idempotencia o confirmación                                                  |

### Diferenciadores

| Feature                                                          | Valor                                                              | Complejidad | Notas                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ | ----------- | ------------------------------------------- |
| Popup de decisión membresía al anular (default: queda activa)    | Maneja el caso real "pagó de más" vs "devolución" sin regla rígida | Media       | el brief lo especifica; buen criterio 1-a-1 |
| Placeholder de "facturado por qué vía" sin construir facturación | Deja lugar a colgar AFIP después sin rehacer                       | Baja        | el brief lo anticipa; sabio                 |

### Anti-features

- **No** integrar facturación electrónica AFIP/ARCA en este módulo. El brief la pone "última" — correcto. Es la pieza regulada que hunde cronogramas.
- **No** carga automática vía gateway / débito automático. Fuera de alcance por decisión; todo manual. Correcto para el contexto.
- **No** sincronización bidireccional con Contabilium. El brief eligió reemplazo progresivo con convivencia, no sync. Sync bidireccional = pesadilla de conflictos.

---

## 5. UI mínima para empleado de bajo privilegio (profe)

### Table stakes

| Feature                                                         | Por qué se espera                                 | Complejidad | Dependencias                                  |
| --------------------------------------------------------------- | ------------------------------------------------- | ----------- | --------------------------------------------- |
| Form de carga rápida: socio + monto + medio de pago, pocos taps | El profe cobra entre clases; fricción = no se usa | Media       | reusa selector de miembro existente del admin |
| Sucursal/caja preseleccionada por contexto del usuario          | El profe no debería elegir sede cada vez          | Baja        | `branchId` del usuario logueado               |
| Confirmación clara de "cargado, pendiente de validación"        | El profe necesita saber que quedó registrado      | Baja        | feedback UI                                   |
| Solo ve/edita lo suyo (no valida, no ve caja global)            | Bajo privilegio = vista acotada                   | Baja        | RBAC; el rol ya existe en el admin            |

### Diferenciadores

| Feature                                                                  | Valor                              | Complejidad | Notas                                              |
| ------------------------------------------------------------------------ | ---------------------------------- | ----------- | -------------------------------------------------- |
| Defaults inteligentes (medio de pago más usado, monto sugerido por plan) | Menos taps aún                     | Media       | precio del plan ya en `subscriptions`              |
| El profe puede corregir SU propia carga observada                        | Cierra el loop sin escalar a admin | Baja        | máquina de estados (observado→corregido por autor) |

### Anti-features

- **No** dar al profe vista de saldos de caja, reportes ni movimientos. Bajo privilegio = carga y nada más. El brief lo respeta.
- **No** permitir al profe elegir el estado del pago ni validar/anular. Solo carga PENDIENTE. El brief lo respeta.
- **No** una app/pantalla separada para el profe. Es un rol dentro del admin existente; pantalla nueva = mantenimiento doble.

---

## MVP recomendado

Priorizar (orden de construcción sugerido):

1. **Máquina de estados de validación** sobre `financial_transactions` (PENDIENTE/OBSERVADO/CORREGIDO/VALIDADO + ANULADO existente). Pieza central, todo lo demás depende.
2. **Bandeja de pendientes** + saldo firme vs. pendiente. Da valor inmediato a la admin.
3. **UI de carga única** (profe PENDIENTE / admin VALIDADO) que propaga a membresía.
4. **Entidad `caja` + saldo por caja** (efectivo por sede + banco global).
5. **Movimiento inter-caja + egreso** (doble entrada / debita-solo).

Diferir: reglas de "dudoso", categorización de egresos, facturación AFIP, float/turnos.

---

## Contraste con el brief

### (a) Features estándar de industria que el brief YA cubre — bien

- Máquina de estados de validación con ciclo de corrección (PENDIENTE→OBSERVADO→CORREGIDO→VALIDADO). Igual al multi-level approval estándar, sin sobre-ingeniería.
- Void-con-rastro en vez de delete (decisión 2a). Es exactamente el principio de ledger inmutable / append-only que recomienda la industria contable.
- Doble entrada en movimientos inter-caja (debita origen / acredita destino / neto 0) vs. egreso (solo debita / neto negativo). Modelado contablemente correcto.
- Depósito efectivo→banco como movimiento, no egreso. Error clásico evitado.
- Separar activar membresía de validar pago. Reduce fricción sin perder control.
- Reconciliación esperado-vs-contado en el evento de retiro. Equivalente al overage/shortage del cash drawer, adaptado a no tener cierre diario.
- Diferir facturación AFIP a lo último y dejar placeholder de "facturado". Sabio.
- Perillas de configuración (validar todos vs. dudosos; activación instantánea vs. con validación previa).
- RBAC profe-bajo-privilegio dentro del admin existente.

### (b) Features estándar que FALTAN en el brief y vale considerar

1. **Aislamiento de moneda en cajas (ARS vs EUR).** El brief habla de caja efectivo/banco y "banco una sola global", pero El Templo opera ARS (7 sedes) + EUR (Barcelona). Una caja banco "única global" **no puede** mezclar ARS y EUR ni sumar saldos. Falta decidir: ¿caja banco por moneda? ¿saldos segmentados por `currency`? El modelo financiero ya aísla moneda en métricas (v5.0) — la caja debe heredar eso. **Es el gap más importante.**
2. **Void de movimientos y egresos.** El brief detalla void-con-rastro para pagos, pero no dice qué pasa cuando se carga mal un movimiento inter-caja o un egreso. Necesitan el mismo tratamiento (anular con rastro, nunca borrar), si no los saldos quedan inconsistentes sin forma limpia de corregir.
3. **Idempotencia de la carga única.** Si un acto propaga a membresía + caja, falta definir qué pasa si se ejecuta dos veces (doble click, retry de red). Estándar: clave de idempotencia o lock. No mencionado.
4. **Conteo/arqueo de la caja banco.** El esperado-vs-contado tiene sentido en efectivo. Para banco la "verdad" es el extracto bancario — falta decidir si/cómo se concilia banco (aunque sea diferido, conviene anotarlo como no-alcance explícito).
5. **Permiso de ver pero no editar para un rol intermedio** (ej. dueño/gerente que mira saldos sin cargar). El brief solo define profe y admin. Posible perilla futura — no bloqueante.

### (c) Decisiones específicas / no-estándar del brief — ¿bueno o riesgoso?

- **Sin cierre de caja diario** (reconciliación atada al retiro). NO estándar (POS retail siempre tiene shift close). **Bueno** acá: refleja que las admins no están en cada sede. Riesgo bajo y bien mitigado por la lista de pendientes que envejece + alerta. Único riesgo residual: un pendiente "envejecido" que nadie mira; el alerta configurable lo cubre si se implementa de verdad.
- **Caja banco única global.** No-estándar (lo común es banco por entidad/sede). **Bueno** por simplicidad, **pero choca con multi-moneda** (ver gap a.1). Aceptable solo si se resuelve el aislamiento ARS/EUR.
- **Egreso sin categoría, solo nota libre.** No-estándar (todo libro de caja serio categoriza). **Aceptable para v1** porque difiere complejidad real; riesgo: si crece el volumen de egresos sin categoría, los reportes pierden valor. Marcado como fase posterior — ok.
- **Reemplazo progresivo de Contabilium con convivencia.** Pragmático, no-estándar (lo limpio es cortar). **Bueno** por el riesgo regulatorio de AFIP, **pero** introduce un período de doble fuente de verdad (Administrador + Contabilium conviviendo) — exactamente el problema que el proyecto quiere matar. Riesgo: definir bien qué dato manda en cada etapa para no recrear el descalce. No bloqueante pero merece una regla explícita por etapa.
- **Activación instantánea de membresía con pago pendiente.** No-estándar para e-commerce, razonable para gym con staff conocido. **Bueno**; el riesgo (activar sin pago real) está bien acotado por firma + envejecimiento + reconciliación en retiro.

---

## Fuentes

- [Microsoft Dynamics 365 Commerce — Shift and cash drawer management](https://learn.microsoft.com/en-us/dynamics365/commerce/shift-drawer-management) (MEDIUM — patrón de transfer entre tills y reconciliación)
- [Microsoft Dynamics 365 — Cash management overview](https://learn.microsoft.com/en-us/dynamics365/commerce/cash-mgmt) (MEDIUM)
- [Lightspeed Restaurant POS — Recording Money In/Out](https://o-series-support.lightspeedhq.com/hc/en-us/articles/31329389716251) (MEDIUM — pay in/out, safe drops)
- [Retaildogma — Balancing a Cash Drawer](https://www.retaildogma.com/balancing-a-cash-drawer/) (MEDIUM — float, overage/shortage)
- [Patriot Software — Void, Delete or Edit Transactions](https://www.patriotsoftware.com/accounting/training/help/void-delete-transaction-whats-the-difference/) (MEDIUM — void vs delete, rastro)
- [Hubifi — Immutable Audit Log Basics](https://www.hubifi.com/blog/immutable-audit-log-basics) (MEDIUM — append-only ledger)
- [Hyperbots — Pending Payment Approval](https://www.hyperbots.com/glossary/pending-payment-approval) (LOW-MEDIUM — multi-level approval workflow)
- [HCL Commerce — Payment state machine](https://help.hcl-software.com/commerce/9.1.0/payments.events/refs/rppppcpaystate.html) (MEDIUM — estados approve/pending/reverse)
- [AppIntent — Best Gym Accounting / Payment / Billing Software 2026](https://www.appintent.com/software/gym-and-fitness/accounting/) (LOW — landscape de gym software)
