# Phase 141: Reportes para la admin - Context

**Gathered:** 2026-06-24
**Status:** Ready for planning

<domain>
## Phase Boundary

La admin tiene la **vista de control completa** del libro de caja, reorganizando `/caja` (CajaPage) en un **hub de pestañas**: (1) **Bandeja de pendientes** (landing) ordenada por antigüedad + observados, con las acciones validar/observar/corregir/anular del 137 y alerta por umbral; (2) **Saldo firme y pendiente por caja** (138); (3) **Movimientos** (la tabla/summary/export existente); (4) **Historial de movimientos inter-caja y egresos** filtrable (139). Todo **exportable** reusando exceljs/pdfmake. End state: la validación reemplaza al cierre de caja diario como control cotidiano.

**Fase UI (necesita UI-SPEC).** Depende de 137 (estados+acciones), 138 (saldos por caja), 139 (mov/egresos). Lo ve `isCajaRole` (gestion/admin/owner); el coach NO. **Última fase antes de 142 (config).**

### En scope (141)

- **Reorganizar `el-templo-admin/src/pages/CajaPage.vue` en pestañas** (hub `/caja`): Pendientes (landing) / Saldos / Movimientos (lo existente) / Mov-Egresos. Reusa el summary + tabla + export Excel ya existentes, reacomodados.
- **Bandeja de pendientes (REP-01):** lista por antigüedad (más viejo arriba); cada fila = socio · monto · medio · caja · cargado-por · antigüedad · estado; **"Validar" prominente** (camino rápido) + menú "⋮" (Observar / Corregir / Anular); **observados en la misma bandeja** con badge + filtro Pendientes/Observados/Todos; **alerta de umbral** (filas vencidas con color/badge + contador arriba). Las acciones reusan los endpoints 137 (validate/observe/correct/void ya existen); anular abre el popup de membresía 1-a-1 (137 D-10); corregir = anular+recrear (137 D-05).
- **Saldo por caja (REP-02):** **cards agrupadas por tipo** (Efectivo sucursales / Efectivo central / Banco); cada card = nombre · saldo firme (grande) · pendiente (chico) · moneda (badge al lado); **subtotal solo por moneda**, nunca cross-currency. Necesita un **endpoint REST nuevo** que liste todas las cajas con su `getBalance` (138 dejó `getBalance` como método de servicio, sin endpoint).
- **Historial mov/egresos (REP-03):** lista de `cash_transfer` + `expense` filtrable por **caja/período**. ⚠️ **Flag de 139: necesita LEFT JOIN users** para mostrar las filas sin socio (movimientos/egresos/adjustments tienen member_id NULL; el list/export actual hace INNER JOIN y las dropea).
- **Export (REP-04):** reusar el **export Excel/PDF existente** (exceljs en finance `/transactions/export`, pdfmake en reports). **Sin mecanismo paralelo.** Los reportes nuevos (bandeja, saldos, historial) exportan con el mismo patrón server-side.
- **Endpoints read nuevos:** bandeja (list por validation_status + antigüedad), saldos por caja (getBalance REST), historial mov/egresos (LEFT JOIN). Todos `isCajaRole`.
- **UI-SPEC** (gsd-ui-phase) — las decisiones de abajo son la semilla.

### Fuera de scope (141 / otras fases)

- **Configuración editable del umbral** (perillas) → **fase 142**. En 141 el umbral va con **default 3 días hard-codeado**.
- **Config / regla Contabilium** → fase 142.
- **Carga del coach** → ya en 140 (el coach no ve estos reportes).
- **Sin migración / sin schema nuevo** (141 es reads + UI; reusa 137/138/139).

</domain>

<decisions>
## Implementation Decisions

### Estructura / navegación

- **D-01:** **Reorganizar `/caja` (CajaPage) en un hub de pestañas**: **Pendientes** (landing) / **Saldos** / **Movimientos** (la tabla+summary+export existente) / **Mov-Egresos** (historial inter-caja+egresos). Un solo hub operativo de caja, coherente, en vez de páginas sueltas o usar `/reportes`. La bandeja de pendientes es el landing (el control diario que la admin abre primero). Reusa todo lo de CajaPage v4.8, reacomodado.

### Bandeja de pendientes (control diario)

- **D-02:** Lista ordenada por **antigüedad** (más viejo arriba = más urgente). Cada fila: socio · monto · medio · caja · **cargado por** (qué coach/admin) · **antigüedad** ("hace N días") · estado.
- **D-03:** Acción principal **"Validar" prominente** (un toque, camino rápido — la mayoría de los pendientes están bien). Menú secundario "⋮" con **Observar / Corregir / Anular** para los casos raros. Reusa los endpoints 137 (validate:390 / observe:426 / correct:470 / void:321 ya existen).
- **D-04:** **Observados en la misma bandeja**, distinguidos con badge (ej: ámbar "Observado"), con filtro arriba: **Pendientes / Observados / Todos**. Es el mismo control (no una vista separada).
- **D-05:** **Anular** abre el popup de **membresía 1-a-1** (137 D-10, `keepMembershipActive`, default activa) — la UI del contrato backend que 137 dejó. **Corregir** = anular+recrear (137 D-05), con la UI para cargar el dato corregido.

### Saldo por caja

- **D-06:** **Cards agrupadas por tipo**: secciones **Efectivo sucursales** / **Efectivo central** / **Banco**. Cada card = nombre de la caja · **saldo firme** (grande, Σ validados) · **pendiente** (chico, debajo, Σ pendientes aparte) · **moneda** (badge al lado). **Subtotal solo por moneda** dentro de cada grupo; **nunca un total que mezcle ARS+EUR**.
- **D-07:** Necesita un **endpoint REST nuevo** "saldos por caja" que itere las cajas activas y devuelva su `getBalance` (firme + pendiente). 138 shipó `getBalance` como método de servicio y difirió el endpoint a esta fase.

### Umbral de alerta de pendientes

- **D-08:** **Default 3 días, hard-codeado en 141.** Un pendiente con más de 3 días sin validar dispara la alerta. **Hacerlo editable por la admin = fase 142** (la casa de config; la 136-07 borró el subsistema de settings, la 142 lo reconstruye). 141 solo **consume** el umbral (constante por ahora; si 142 lo persiste, 141 lo lee).
- **D-09:** **Alerta visual:** las filas que superan el umbral se marcan con **color + badge "vencido"**; arriba de la bandeja un **contador** ("⚠ N pendientes superan los 3 días"). Como la lista ya está ordenada por antigüedad, los vencidos quedan arriba.

### Export

- **D-10:** **Reusar el export Excel/PDF existente** (exceljs en finance `/transactions/export`, pdfmake en reports/members) — **sin mecanismo paralelo** (REP-04). Los reportes nuevos (bandeja, saldos, historial) exportan con el mismo patrón server-side.

### Claude's Discretion

- Forma exacta de los endpoints read nuevos (bandeja / saldos por caja / historial) siguiendo convenciones del módulo finance; reusar filtros existentes (`TransactionListFilters`) donde aplique.
- Cómo se computa "antigüedad" (días desde createdAt/transactionDate) y dónde (server vs front).
- Estructura de los componentes Quasar de las pestañas (reusar q-table/q-tabs/q-card existentes; STACK: sin UI kit nuevo); se fija fino en el UI-SPEC.
- Qué reportes tienen export (probablemente los 3 nuevos + el existente) y en qué formato (Excel y/o PDF).
- Cómo se pasa el umbral (constante compartida) para que 142 lo reemplace sin tocar la UI.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño del milestone

- `.planning/research/modulo-contable/ARCHITECTURE.md` § "Punto 5" / reportes (si existe) + el patrón de export.
- `BRIEF-MODULO-CONTABLE-FRANCO.md` — sección 5/6 (reportes para la admin, "la validación reemplaza el cierre de caja diario").

### Fases previas (de las que depende 141)

- `.planning/phases/137-.../137-SUMMARY.md` (×3) — estados + endpoints validate/observe/correct/void + el contrato `keepMembershipActive` (popup 1-a-1).
- `.planning/phases/138-.../138-SUMMARY.md` (×3) — `getBalance` (método de servicio, el endpoint REST se agrega acá), cajas por tipo.
- `.planning/phases/139-.../139-SUMMARY.md` (×3) — mov/egresos + **el flag: la caja history necesita LEFT JOIN users** para filas NULL-member.

### Roadmap / requirements

- `.planning/ROADMAP.md` § Phase 141 (REP-01..04).
- `.planning/REQUIREMENTS.md` — REP-01..REP-04.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `el-templo-admin/src/pages/CajaPage.vue` — la página a **reorganizar en pestañas**. Ya tiene: summary cards (revenueByMethod/monthlyRevenue/revenueByKind), q-table de transacciones (con columna acciones), sección egresos, dialog de detalle, **export Excel** (exceljs, botón → `/transactions/export`). Se reacomoda, no se tira.
- `el-templo-api/src/modules/finance/routes.ts` — endpoints 137 ya existen: validate (390), observe (426), correct (470), void (321); summary (761), export Excel (823). 141 agrega: GET bandeja (pendientes+observados), GET saldos por caja, GET historial mov/egresos.
- `el-templo-api/src/modules/finance/cash-register-service.ts` — `getBalance(cashRegisterId)` (138): firme + pendiente derivado. El endpoint nuevo de saldos itera cajas activas + getBalance.
- `el-templo-api/src/modules/finance/transaction-service.ts` — `list`/`TransactionListFilters` (reusar para bandeja por validation_status + historial por kind/caja/período). OJO el LEFT JOIN (flag 139).
- Export: **exceljs** (`Workbook`, finance routes) + **pdfmake** (reports/members, `el-templo-admin/src/utils/pdf/`). REP-04 reusa.

### Established Patterns

- **Aislamiento de moneda** (137/138): nunca totales cross-currency; moneda siempre al lado.
- **Saldo derivado** (138): firme = Σ validados; pendiente aparte (nunca suma al firme).
- **Soft-void ortogonal + popup membresía** (137): anular con rastro + decisión 1-a-1.
- **isCajaRole** (gestion/admin/owner) gatea `/caja` y `/reportes`; coach excluido (privacidad).
- **Pinia composition + composables con cleanup()** (sin onUnmounted dentro); **createLogger** no console; **paleta cálida sin azul**; **componentes Quasar existentes** (sin UI kit nuevo).

### Integration Points

- **LEFT JOIN users (flag 139):** el historial mov/egresos y cualquier list que incluya cash_transfer/expense/adjustment debe usar LEFT JOIN (member_id NULL en esas filas) o las dropea.
- **Endpoint saldos por caja:** nuevo, sobre `getBalance` de 138.
- **Umbral 3 días:** constante compartida (front o back) que 142 reemplazará por config.
- **Export server-side:** reusar el patrón exceljs/pdfmake; no inventar uno nuevo.

</code_context>

<specifics>
## Specific Ideas

- `/caja` se vuelve el **hub de control de caja** en pestañas; **Bandeja de pendientes = landing** (el control diario que reemplaza el cierre de caja).
- Bandeja: **Validar a un toque** + menú para lo raro; observados conviven con filtro; vencidos (>3 días) con alerta visual + contador.
- Saldo por caja: cards por tipo, moneda al lado, **jamás mezclar monedas**.
- Umbral **3 días** (default 141, editable en 142).
- Export **reusa** exceljs/pdfmake (sin paralelo).

</specifics>

<deferred>
## Deferred Ideas

- **Umbral configurable por la admin** → fase 142 (config). 141 = default 3 días hard-codeado.
- **Config / regla de transición Contabilium** → fase 142.
- **Métricas de gestión v5.0** (UI diferida) → fuera de este milestone (otro frontend).

</deferred>

---

_Phase: 141-Reportes para la admin_
_Context gathered: 2026-06-24_
