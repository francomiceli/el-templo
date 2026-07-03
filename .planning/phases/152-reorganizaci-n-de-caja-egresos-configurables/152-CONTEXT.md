# Phase 152: Reorganización de Caja + egresos configurables - Context

**Gathered:** 2026-07-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Reorganización de la vista de Caja del admin (`CajaPage.vue`, hoy 5 tabs) + configurabilidad de las categorías de egreso. Reordenar los tabs con Movimientos de caja como portada (CAJA-01), etiqueta y filtro de estado validada/pendiente en el historial de cobros (CAJA-02), filtros de fecha con drill-down a días en Cobros y Movimientos (CAJA-03), detalle del cobro con fecha de validación + usuario validador (CAJA-04), ABM de centros de costo desde la UI con defaults genéricos — levanta EGR-F2 de v5.3 (CAJA-05), y nota explicativa en Saldos (CAJA-06). Requirements: CAJA-01..06.

NO incluye: cambios al PoS de cobros (fase 151, ya ejecutada), mejoras de Deudas (fase 153), reglas de precio por medio de pago (fase 154), reporte de egresos agrupado por centro de costo (EGR-F1, sigue diferido), ABM de cajas de efectivo, cambios al motor de validación más allá de persistir quién/cuándo validó.

**Arrastrado de fases previas (no re-decidir):** 149 D-04 gating frontend + API consistente, Caja es admin/owner-only; 150 D-09 el centro de costo "Retiros" ya está seedeado; 150 D-07/D-08 patrón de baja lógica + reactivar del ABM de cuentas; 151 D-05 prellenado de cuenta corregible en la bandeja no se toca. Constraint SaaS transversal: sin Templo-ismos nuevos en core.

</domain>

<decisions>
## Implementation Decisions

### Orden final de los tabs (CAJA-01)

- **D-01: Orden = Movimientos de caja (portada) → Pendientes → Historial de cobros → Saldos → Cuentas.** CAJA-01 fija los 3 primeros (decisión de Nacho); Saldos 4° y Cuentas 5° se ordenan por frecuencia de uso — la consulta de saldos antes que la configuración de cuentas, que queda última como "settings" de la caja. Sin fusiones de tabs. (Contexto: el doc de Nacho se escribió contra la Caja de 4 tabs de v5.2/v5.3; Cuentas nació después, en la fase 150.)
- **D-02: El tab "Transacciones" se renombra "Historial de cobros"** (no "Cobros" a secas): tras la fase 151 el PoS del nav ya se llama "Cobros" (`/cobros`, registrar) — el tab de Caja es el historial y el nombre lo distingue explícitamente. Cumple la intención de CAJA-01 (dejar de llamarse "Transacciones") con un label más claro que el literal del doc.

### Filtro por día (CAJA-03)

- **D-03: Mes default + modo "por días".** Se conserva el selector de mes actual (`type="month"`) como default, con un toggle/botón que cambia a rango desde–hasta por día. El caso común (mes) sigue siendo un solo click; el rango fino aparece solo cuando se necesita. Aplica a Historial de cobros (`MovimientosTab`) y Movimientos de caja (`MovEgresosTab`).

### Estado de validación en el historial de cobros (CAJA-02, CAJA-04)

- **D-04: Etiqueta + filtro por estado.** Cada fila muestra el chip validada/pendiente (reusar el estilo/mapa de estados de `MovEgresosTab`) Y el listado agrega un filtro todas/validadas/pendientes — la acción natural que sigue a ver la etiqueta. La API ya devuelve `validationStatus` sin filtrar (routes.ts:1374).
- **D-05: Columnas nuevas `validated_by`/`validated_at` + backfill.** El "quién/cuándo validó" hoy vive solo en `audit_log` (evento `transaction_validated`); se agregan dos columnas nullable a `financial_transactions`, completadas en la transición pendiente→validado, con backfill único de las históricas desde `audit_log` en la migración. Lectura simple en listado y detalle, sin acoplar la UI al payload JSON del log.
- **D-06: Cobros nacidos validados muestran "Validado al registrar".** Los cobros que carga admin/owner nacen validados sin evento de validación: el detalle muestra "Validado al registrar" + quién lo cargó (`recordedBy`) + fecha de registro — distingue el cobro auto-validado del que pasó por la bandeja. No se backfillean `validated_by/at` para estos (el dato ya está en `recordedBy`/`createdAt`).

### ABM de centros de costo (CAJA-05)

- **D-07: El ABM vive dentro del tab Cuentas**, como sección "Categorías de egreso" junto al ABM de cuentas bancarias. Misma naturaleza (catálogos que se tocan poco), sin sexto tab. El tab puede renombrarse si hace falta (Claude's discretion).
- **D-08: Alcance completo, por país.** Crear / renombrar / desactivar / reactivar, SIN borrado físico (hay egresos imputados). Scopeado por el selector de país existente de CajaPage; nombre único por país. Mismo patrón que el ABM de cuentas de la fase 150 (D-07/D-08: baja lógica, cerradas fuera de los selectores operativos, visibles en históricos).
- **D-09: Migración renombra los seeds Templo-céntricos a genéricos** (no los desactiva ni los borra — se usan en prod): "Alquiler Constitución"→"Alquiler", "Viáticos profes"→"Viáticos"; "Librería" y "Varios" ya son genéricos y quedan. Además agrega **"Pago a proveedores"** ("Retiros" ya existe desde la fase 150). Nacho no pierde ninguna categoría en uso, los históricos quedan coherentes y el catálogo queda white-label.

### Nota de Saldos (CAJA-06)

- **D-10: Aviso + explicación en una sola nota.** La nota de Saldos incluye qué muestra la pantalla (saldo firme por caja: movimientos validados desde el corte; pendientes aparte) Y el aviso "si no se registran egresos y retiros, los saldos no reflejarán la realidad". Cierra las dos quejas de Nacho sobre Saldos (no se entiende qué muestra + los números mienten sin egresos).

### Claude's Discretion

- Estilo/ubicación exactos del chip validada/pendiente en el Historial de cobros (orientar a reusar el mapa de labels/colores de `MovEgresosTab.vue:316-331`).
- Forma del toggle mes↔días (botón, tabs de modo, etc.) y si el control de fecha se extrae como componente compartido entre los dos tabs (DRY sugiere que sí).
- Copy final de la nota de Saldos (mientras cubra D-10) y su forma (banner fijo vs dismissible).
- Naming del tab Cuentas al ganar la sección de categorías (p.ej. "Cuentas y categorías") y layout interno (secciones apiladas vs sub-tabs).
- Detalle de la validación de nombre único por país en API (case-insensitive o no) y mensajes de error.
- Si el filtro por estado de Cobros se resuelve client-side o como query param del endpoint existente.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño del milestone (fuente de verdad)

- `.docs/saas-multitenancy/Correcciones El Templo.md` — doc crudo de Nacho; §CAJA completo: Pendientes ítem 1 (segundo tab), Saldos ítems 1 y 4 (no se entiende qué muestra + nota "avivador de boludos"), Transacciones ítems 1-5 (tercero, "cobros", etiqueta, filtro por días, detalle con validador), movimientos de caja ítems 1-4 (portada, ídem filtro, desplegables de egresos muy Templo, "Pago a proveedores"/"retiros").
- `.docs/saas-multitenancy/01-analisis-correcciones-admin.md` — análisis bajo lente SaaS de las correcciones; §3 Finanzas.

### Superficie a modificar (admin)

- `el-templo-admin/src/pages/CajaPage.vue` — hub de 5 tabs (130 líneas, `CAJA_TABS`); reorden D-01 + rename D-02; ya tiene selector de país arriba (scope del ABM D-08).
- `el-templo-admin/src/components/caja/MovimientosTab.vue` — el tab "Transacciones"→"Historial de cobros": columnas (fecha/tipo/alumno/monto/método/concepto/registrado por), filtro de mes `type="month"` (~línea 158), dialog "Detalle de la Transaccion" (~línea 294). Recibe: chip de estado (D-04), filtro de estado (D-04), drill-down a días (D-03), validador+fecha en el detalle (D-05/D-06).
- `el-templo-admin/src/components/caja/MovEgresosTab.vue` — Movimientos de caja (portada): ya muestra estado por fila (mapa de labels ~316-331) y "Registrado por"; recibe el drill-down a días (D-03). Referencia de estilo para el chip de Cobros.
- `el-templo-admin/src/components/caja/SaldosPorCajaTab.vue` — recibe la nota D-10.
- `el-templo-admin/src/components/caja/CuentasTab.vue` — recibe la sección "Categorías de egreso" (D-07); patrón ABM a imitar (crear/editar/cerrar/reactivar, cerradas atenuadas).

### API y schema (motor financiero v5.2/v5.3)

- `el-templo-api/src/db/schema/financial-transactions.ts` — recibe `validated_by`/`validated_at` (D-05); `validation_status` enum existente (fase 137), ortogonal al soft-void.
- `el-templo-api/src/db/schema/cost-centers.ts` — tabla del ABM (fase 147): name/country varchar(2)/is_active; el comentario del archivo ya anticipa que el ABM estaba DIFERIDO.
- `el-templo-api/src/modules/finance/transaction-service.ts` — transición pendiente→validado (~619-720, escribe `audit_log` action `transaction_validated` con actorId): acá se completan las columnas nuevas; corregir=anular+recrear (~809-891) nace validado (aplica D-06).
- `el-templo-api/src/modules/finance/routes.ts` — listado de transacciones ya devuelve `validationStatus` (~1374); endpoints nuevos del ABM de centros con guard admin/owner (patrón 150 D-12).
- `el-templo-api/src/db/schema/audit-log.ts` — fuente del backfill de D-05.
- `el-templo-api/src/modules/finance/movement-service.ts` — `registerExpense` valida centro de costo activo; los centros desactivados por el ABM deben salir del selector de egresos (mismo mecanismo).

### Contexto de fases previas (dependencias directas)

- `.planning/phases/150-cuentas-bancarias-flexibles/150-CONTEXT.md` — D-07/D-08 (baja lógica + reactivar, patrón del ABM), D-09 (seed "Retiros" ya hecho), D-11 (tab Cuentas), D-12 (admin/owner-only).
- `.planning/phases/151-registrar-cobro-pagos-cobros/151-CONTEXT.md` — D-09 (el PoS ya se llama "Cobros" `/cobros` — motiva D-02), D-05 (prellenado de cuenta en la bandeja, no tocar).
- `.planning/phases/149-nav-por-categor-as-rbac/149-CONTEXT.md` — D-04 (gating frontend + API consistente; Caja dueño-only).

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- Mapa de estados de `MovEgresosTab.vue` (~316-331: pendiente/observado/corregido/validado + colores) — reusar para el chip de Cobros (D-04); evaluar extraerlo a un util compartido.
- Patrón de filtro de mes → `dateFrom`/`dateTo` idéntico en ambos tabs (`MovimientosTab.vue` ~503, `MovEgresosTab.vue` ~397) — base del modo "por días" (D-03); candidato natural a componente/composable compartido.
- `CuentasTab.vue` + `CuentaBancariaFormDialog.vue` — patrón completo de ABM con baja lógica a imitar para categorías (D-08).
- Patrón de seeds/updates idempotentes por nombre en migraciones (0160/0161) — para el rename de seeds + "Pago a proveedores" (D-09).
- `audit_log` evento `transaction_validated` (payload con txId, actorId) — fuente del backfill (D-05).

### Established Patterns

- **`db:generate` roto por drift pre-existente** — la migración se escribe a mano; numeración siguiente a la última en `src/db/migrations/` (el tren v5.2/v5.3 llegó a 0162; verificar al ejecutar). Nunca `;` dentro de comentarios SQL.
- **Columnas byte-for-byte con la migración** (referencia Drizzle) — los nombres en `financial-transactions.ts` deben coincidir exactamente con el SQL; CI falla con "Unknown column" que tsc no ve.
- **"Dinero firme" = `validation_status='validado' AND voided_at IS NULL`** — helper canónico, nunca inline (D-08/T-138-09 de la fase 138). Las columnas nuevas NO cambian esta definición.
- **La seguridad real vive en la API** (149 D-04): endpoints del ABM de centros con guard admin/owner; la UI solo esconde.
- **Tests de integración obligatorios** para rutas nuevas/modificadas (`el-templo-api/test/`): ABM de centros (crear/renombrar/desactivar/reactivar + unicidad por país + egreso con centro desactivado → 400), validate completa `validated_by/at`, detalle expone el dato.
- **Migración comparte MySQL staging/prod** — el rename de seeds (D-09) impacta la caja real de Nacho al llegar el tren a prod; el rename está decidido con ese impacto explícito (no pierde categorías en uso).

### Integration Points

- `CajaPage.vue` `CAJA_TABS` + orden de `q-tab` — reorden D-01, rename D-02, default tab = portada Movimientos.
- `transaction-service.ts` `validate()` — setea `validated_by/at` (D-05); el flujo corregir=anular+recrear produce filas nacidas validadas → rama D-06.
- Endpoint de listado/detalle de transacciones — exponer `validatedBy`/`validatedAt` (+ nombre del validador) y el filtro por estado (D-04).
- `routes.ts` (finance) — CRUD nuevo de `cost_centers` (crear/renombrar/desactivar/reactivar) con guard admin/owner; el selector de egresos (`RegistrarMovEgresoDialog.vue`) ya lista solo activos.
- Migración nueva: columnas `validated_by`/`validated_at` + backfill desde `audit_log` + renames de `cost_centers` + seed "Pago a proveedores".

</code_context>

<specifics>
## Specific Ideas

- Nacho sobre Movimientos de caja: "hermoso. Debería ser portada de caja" — la portada no se rediseña, solo se promueve (D-01).
- Nacho sobre Transacciones ítem 4: "el filtro de fecha está bueno que venga predeterminado por mes pero debería permitir elegir por días para revisar cuando algo genere dudas puntuales en retrospectiva" — D-03 es la traducción literal (mes default, días como drill-down de revisión).
- Nacho sobre Saldos ítem 1: "No sé de dónde vienen ni qué muestran. ¿Totales del día? ¿del mes? ¿pendientes de validar?" — motiva que la nota D-10 explique el saldo firme además del aviso de CAJA-06.
- Nacho sobre egresos: "Revisar desplegables de egresos, muy específicos del templo que aclare de la sucursal el alquiler. Si está bueno que haya alquiler." — por eso el rename conserva "Alquiler" sin la sucursal (D-09).

</specifics>

<deferred>
## Deferred Ideas

- **Reporte de egresos agrupado por centro de costo** (EGR-F1 de v5.3) — sigue diferido; el ABM (CAJA-05) no lo incluye.
- **Rediseño de fondo de la pantalla Saldos** (queja de Nacho "siento que esta pantalla no va a funcionar para un usuario externo") — esta fase solo agrega la nota explicativa (D-10); un rediseño de Saldos sería fase propia si Nacho lo re-plantea tras la nota.

### Reviewed Todos (not folded)

- `v51-milestone-data-rollout.md` (Rollout de datos v5.1 — poblar `milestone_exercise_id`) — revisado y NO incorporado por cuarta vez (149, 150, 151, 152): rollout de datos del sistema de entrenamiento v5.1, sin relación con la vista de Caja (match débil por keywords genéricas).

</deferred>

---

_Phase: 152-Reorganización de Caja + egresos configurables_
_Context gathered: 2026-07-03_
