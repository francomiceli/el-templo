# Phase 137: Máquina de estados de validación (cimiento) - Context

**Gathered:** 2026-06-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Una transacción de cobro (`financial_transactions`) gana un **estado de validación** (`pendiente` / `observado` / `corregido` / `validado`) **ortogonal** al soft-void existente (`voided_at` = ANULADO). El filtro canónico de "dinero firme" pasa a contar **solo `validation_status='validado' AND voided_at IS NULL`**, centralizado en un helper reutilizable, **sin alterar los números de las 6 métricas de gestión de v5.0** (fases 120-123): migración `DEFAULT 'validado'` + backfill + auditoría de TODOS los call sites + test de regresión.

End state: un pago cargado por profe nace `pendiente` y NO suma a caja firme hasta que el admin lo valida; el admin puede validar, observar y corregir (anular+recrear, nunca UPDATE) y anular (con rastro); la membresía se activa **al instante** independiente del estado del pago.

**Esta fase es CIMIENTO / backend-only. Bloquea 138-142.**

### En scope (137)

- Columna `validation_status` (enum pendiente/observado/corregido/validado) en `financial_transactions`, ortogonal a `voided_at`.
- Migración con `DEFAULT 'validado'` + backfill de filas existentes a `validado`.
- Helper canónico reutilizable para "dinero firme" (`validado AND voided_at IS NULL`); refactor de todos los call sites del filtro de ingresos/saldo para pasar por él.
- Endpoints backend: `validate()`, `observe()`, `correct()` (anular+recrear), y el `void()` existente extendido para la decisión de membresía 1-a-1. Rol resuelto **server-side** (profe→pendiente, admin→validado).
- Rastro completo de cada transición reusando el mecanismo de auditoría existente (`audit-log`, fase 111).
- Integration tests, incluido el **test de regresión** que confirma que un PENDIENTE no mueve summary/saldo y que las 6 métricas v5.0 dan los mismos números.

### Fuera de scope (137 — pertenecen a otras fases del milestone)

- **Toda UI de acciones** (bandeja de pendientes, botones validar/observar/anular) → **fase 141**.
- **Configuración / perillas** (políticas de validación/activación, "nueva casa" de settings) → **fase 142**. En 137 el comportamiento va **hard-coded**.
- Entidad caja + asociación pago↔caja → **fase 138**.
- Carga única dead-simple del profe + rol profe con permisos acotados (UI) → **fase 140**.

</domain>

<decisions>
## Implementation Decisions

### Alcance de la fase (cimiento)

- **D-01:** 137 es **backend-only puro**. Nada de UI. El "cimiento" = schema + helper canónico + endpoints (validate/observe/correct/void) + tests. La UI de acciones (bandeja + botones) es la **fase 141**; construir UI en 137 sería construirla dos veces. El flujo se prueba por integration tests, que de todos modos son el gate del blast radius.
- **D-02:** **No se toca CajaPage (v4.8)** en 137. v5.0 (Métricas) fue backend-only (su UI quedó diferida), así que **no hay UI de v5.0 que pisar**. La única UI relevante es CajaPage, que el milestone _extiende_ en 140/141, no en 137.

### Configuración (sin settings en 137)

- **D-03:** **Cero pantallas de configuración en 137.** Las reglas van **hard-coded en código**: profe→`pendiente`, admin→`validado` (rol server-side, VAL-02), membresía se activa al instante siempre (VAL-07). Las "perillas configurables" (validar-todos/dudosos, activación instantánea/diferida) son explícitamente dueñas de la **fase 142** ("nueva casa" de settings tras el borrado del subsistema en 136-07). No se adelanta nada de eso a 137.

### Flujo de pago mal cargado (observar / corregir)

- **D-04:** **Las dos opciones, la admin elige** según el caso. 137 expone **`observe()`** (marcar "observado" = problema flagueado, sin tocar aún, p.ej. cuando hay que preguntarle al profe el dato correcto) y **`correct()`** (corrección directa cuando ya sabe el dato). Razón: los dos estados (`observado`/`corregido`) ya están lockeados en el enum, cada uno mapea a una situación real, y el costo de UI es de la 141 — en 137 son solo dos endpoints.
- **D-05:** **"Corregir" = anular + recrear, nunca UPDATE** (inmutabilidad del ledger). Mecánica: la transacción vieja queda **`voided_at` seteado + `validation_status='corregido'`** (distingue "anulado porque estaba mal y lo recreé" de un anulado-por-devolución), y la **nueva nace `validado`** (la crea el admin). La nueva se **linkea a la vieja vía `transaction_links`** (`target_kind='transaction'`, que ya existe) para que el rastro muestre "este reemplazó a aquel".
- **D-06:** Ciclo de vida resultante:
  - `pendiente` → (admin valida) → `validado`
  - `pendiente` → (admin observa) → `observado` → (admin corrige) → vieja=`corregido`+void, nueva=`validado`
  - `pendiente` → (admin corrige directo) → vieja=`corregido`+void, nueva=`validado`
  - cualquier `validado` → (admin anula) → `voided_at` (ANULADO = devolución/error, eje separado del enum)

### Rastro / auditoría

- **D-07:** **Historia completa con rastro.** Cada transición (cargado, validado, observado, corregido, anulado) deja registro con **autor + fecha + motivo**. Es la esencia del control que reemplaza al cierre de caja diario.
- **D-08:** **Reusar el mecanismo de auditoría existente** (`audit-log`, fase 111, que `void()` ya usa vía `auditLog.write()`), agregando los action types nuevos (`transaction_validated`, `transaction_observed`, `transaction_corrected`). DRY y consistente con el audit row de void. **No** crear tabla `validation_events` dedicada salvo que la investigación muestre que conviene (p.ej. para queries de la bandeja 141). Esta es discreción de Claude/researcher.

### Membresía vs caja (ya lockeado, reafirmado)

- **D-09:** La **membresía se activa al instante** al cargar el pago, independiente del `validation_status` (VAL-07). Un PENDIENTE **ya salda la deuda del socio en `balances`** pero **NO suma a caja firme** (el filtro canónico lo excluye). "Activar membresía ≠ validar pago" — son dos efectos separados de la misma carga.
- **D-10:** **Anular es solo admin** (motivo + autor + fecha, VAL-06). Al anular un pago con membresía asociada, la decisión de mantener o no la membresía activa es **1-a-1 con default "activa"** — en 137 esto es el **parámetro/contrato backend** (`keepMembershipActive`, default true); el popup que lo expone es UI de fase posterior.

### Claude's Discretion

- Estructura interna del helper canónico de "dinero firme" (función vs query builder compartido) y dónde vive en el módulo finance.
- `audit-log` reutilizado vs tabla dedicada de eventos de validación (ver D-08) — decidir con base en la investigación de cómo la bandeja 141 va a consultar el historial.
- Forma exacta de los endpoints (REST shape, naming) siguiendo las convenciones del módulo finance existente.
- Cómo `correct()` arma la transacción nueva (copia de campos del original + override del dato corregido) dentro de una transacción DB atómica.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño del milestone (módulo contable)

- `BRIEF-MODULO-CONTABLE-FRANCO.md` — brief de diseño consolidado (raíz). Fuente de verdad de la visión del libro de caja.
- `.planning/research/modulo-contable/ARCHITECTURE.md` — arquitectura propuesta vs. modelo v4.8 existente.
- `.planning/research/modulo-contable/FEATURES.md` — desglose de features del milestone.
- `.planning/research/modulo-contable/PITFALLS.md` — riesgos identificados (incl. blast radius del filtro canónico).
- `.planning/research/modulo-contable/STACK.md` — decisiones de stack (cero dependencias nuevas).

### Roadmap / requirements

- `.planning/ROADMAP.md` § Phase 137 — goal, success criteria, requirements VAL-01..VAL-07. También 138-142 para entender qué se difiere a cada fase.
- `.planning/REQUIREMENTS.md` — texto completo de VAL-01..VAL-07.
- `.planning/PROJECT.md` § Current Milestone v5.2 — decisiones clave y out-of-scope del milestone.

### Riesgo crítico (blast radius v5.0)

- `ESPECIFICACION-METRICAS-GESTION.md` — las 6 métricas de gestión que NO deben cambiar de número (auditar sus call sites del filtro de ingresos).

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `el-templo-api/src/db/schema/financial-transactions.ts` — tabla a extender con `validation_status`. Ya tiene `voided_at`/`voided_by`/`void_reason` (eje ANULADO ortogonal). Enums declarados inline en la columna (patrón D-05 del schema).
- `el-templo-api/src/modules/finance/transaction-service.ts` — clase que **deliberadamente no expone `update()`** (solo `void()`, líneas ~239+). Acá viven `validate()`/`observe()`/`correct()` nuevos. El **filtro canónico de revenue** está en el summary (líneas ~762-774: `direction='inflow' AND voided_at IS NULL`) — este es el punto exacto donde se inserta el `validation_status='validado'` y se centraliza en helper.
- `el-templo-api/src/db/schema/transaction-links.ts` — pivot con `target_kind='transaction'` ya existente → linkea la transacción corregida (nueva) con la original (vieja) sin schema nuevo.
- `el-templo-api/src/db/schema/audit-log.ts` + `auditLog.write(tx, {...})` — mecanismo de auditoría forense (fase 111) que `void()` ya usa atómicamente dentro de la transacción DB. Reusar para los eventos de validación nuevos (D-08).
- `el-templo-api/src/modules/finance/balance-service.ts` — `applyDelta(tx, row, links, sign)` que `void()` usa para revertir efectos sobre `balances`. Relevante para entender el split membresía/caja.
- `el-templo-api/src/modules/subscriptions/service.ts` — `recordAssignmentCharge` ya activa membresía + cobro + saldo atómicamente. La activación instantánea (D-09) se monta acá; un PENDIENTE debe seguir saldando `balances` sin sumar a caja firme.

### Established Patterns

- **Inmutabilidad del ledger:** nunca UPDATE de montos; solo void (con rastro) + recrear. `correct()` debe seguir esto (D-05).
- **Auditoría atómica:** el audit row se escribe con el mismo `tx` handle que la mutación; si algo falla después, el row desaparece (helper nunca abre su propia transacción).
- **Rol server-side:** no confiar en el cliente para profe vs admin (VAL-02). Resolver desde el usuario autenticado.

### Integration Points

- **Filtro canónico de ingresos — BLAST RADIUS ALTO.** El combo `inflow AND voided_at IS NULL` se consume en ~6+ lugares, incluidas las 6 métricas v5.0. Call sites conocidos a auditar (no exhaustivo — el researcher debe completar): `modules/finance/transaction-service.ts`, `modules/analytics/ticket-service.ts`, `modules/analytics/advanced-finance-service.ts`, `modules/analytics/ltv-service.ts`, `modules/analytics/service.ts`, `modules/reports/service.ts`, `modules/subscriptions/service.ts`. Todos deben pasar por el helper canónico nuevo y dar los mismos números tras el backfill `validado`.

</code_context>

<specifics>
## Specific Ideas

- "Dinero firme" = `validation_status='validado' AND voided_at IS NULL` — definición textual del milestone, debe ser el único lugar donde se expresa (helper centralizado).
- ANULADO **no** es un valor del enum — se mantiene como `voided_at IS NOT NULL`, eje completamente separado. Un pago puede estar `validado` y luego anularse.
- El estado `corregido` se usa para distinguir un void-por-corrección de un void-por-devolución (ambos tienen `voided_at`, pero `validation_status` los separa).

</specifics>

<deferred>
## Deferred Ideas

- **Perillas configurables de política** (validar-todos vs solo-dudosos, activación instantánea vs diferida) → **fase 142** (config + transición Contabilium). En 137 todo hard-coded.
- **Bandeja de pendientes + botones validar/observar/anular** (UI) → **fase 141** (reportes para la admin).
- **Popup de decisión de membresía al anular** (UI) → fase posterior; en 137 solo el contrato backend `keepMembershipActive` (D-10).
- **Entidad caja + asociación pago↔caja** → **fase 138**.
- **Regla "qué dato manda" durante convivencia con Contabilium** → **fase 142**.

</deferred>

---

_Phase: 137-Máquina de estados de validación (cimiento)_
_Context gathered: 2026-06-24_
