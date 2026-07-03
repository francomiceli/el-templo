# Phase 150: Cuentas bancarias flexibles - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning

<domain>
## Phase Boundary

ABM de cuentas bancarias desde la UI del admin (crear con Banco, N° de cuenta, Titular, CUIT, CBU/CVU, Alias — solo 3 obligatorios; editar; cerrar con baja lógica conservando historial; reactivar) + registro de retiros del dueño como egreso tipo "Retiro". Levanta el diferido CAJA-F1 de v5.3 (hoy las cuentas banco son seeds: Galicia/Mercado Pago, migración 0160). Requirements: CTA-01, CTA-02, CTA-03. NO incluye: asociación obligatoria de cuenta al cobro ni creación rápida inline (fase 151, COBRO-04), ABM de centros de costo ni defaults "Pago a proveedores" (fase 152, CAJA-05), reordenamiento de tabs de Caja (fase 152), ABM de cajas de efectivo.

**Arrastrado de fase 149 (no re-decidir):** la superficie vive en Finanzas, gated admin/owner-only, frontend + API consistentes (D-04 de 149). Constraint SaaS transversal: sin Templo-ismos en core.

</domain>

<decisions>
## Implementation Decisions

### Modelo de datos de la cuenta

- **D-01: La caja ES la cuenta — extender `cash_registers`.** Los campos bancarios (banco, n° de cuenta, titular, CUIT, CBU/CVU, alias) se agregan como ~6 columnas nullable a `cash_registers`. Sin tabla nueva ni migración de relación: la imputación de transferencias, los saldos y `is_active` ya cuelgan de `cash_register_id`. Galicia/Mercado Pago se completan por UPDATE (desde la UI de edición, D-08). Costo aceptado: columnas NULL en cajas efectivo.
- **D-02: Obligatorios = Banco + Titular + (CBU/CVU **o** Alias).** Al menos un identificador transferible, cualquiera de los dos. CUIT y N° de cuenta siempre opcionales. Validación "uno de dos" explícita en form y API.
- **D-03: Nombre visible derivado, no pedido.** `cash_registers.name` se autogenera de Banco + Alias (p.ej. "Galicia · templo.gym"). Sin campo "Nombre" en el form. Fallback cuando no hay alias: a criterio de Claude (p.ej. Banco + últimos 4 del CBU/N°). Debe mantenerse coherente al editar.
- **D-04: Selector de moneda con default ARS.** El form ofrece las monedas ya soportadas (ARS/EUR), ARS preseleccionado. Moneda fija post-creación (invariante existente de `cash_registers.currency`). Cubre "cuenta afuera / cuenta adentro" del doc de Nacho con el motor multi-moneda existente.
- **D-05: Cuenta nueva nace con saldo 0.** `opening_balance = 0` y `cutoff_date` = fecha de creación (no hay movimientos previos que excluir). `type='banco'`, `branch_id=NULL`, como las cuentas banco existentes.

### Cierre y ciclo de vida

- **D-06: Cerrar con saldo ≠ 0 → warning pero permitir.** El dialog de cierre avisa el saldo actual y que "los saldos dejarán de reflejar la realidad" si no se transfiere antes, pero deja cerrar. El movimiento inter-caja existente (v5.2) es la vía para vaciarla primero si se quiere.
- **D-07: Cuenta cerrada es reactivable.** El listado del ABM muestra activas y cerradas (cerradas atenuadas) con acción de reactivar — toggle de `is_active`. Cerrada = desaparece de los selectores operativos (imputación de transferencias, egresos, y en 151 los cobros) pero conserva historial y sigue apareciendo en históricos/filtros (CTA-02).
- **D-08: Alcance del ABM = solo cuentas banco, con crear + editar + cerrar/reactivar.** La edición permite completar/corregir los campos bancarios de cuentas existentes (Galicia/MP hoy no tienen CUIT/CBU). Las cajas efectivo siguen naciendo por sucursal, fuera de este ABM.

### Retiro del dueño (CTA-03)

- **D-09: Retiro = egreso con centro de costo "Retiros".** Sin kind nuevo ni flag en `financial_transactions`: se reusa `registerExpense` (kind='expense'), void, saldos y filtros tal cual. Esta fase **seedea el centro de costo "Retiros"** por migración (siguiendo el patrón de seeds de la fase 147). El default "Pago a proveedores" queda para la fase 152 (CAJA-05) junto con el ABM de centros.
- **D-10: Acción propia "Registrar retiro" en la UI.** Botón explícito (en el ABM de cuentas y/o junto a Egresos en Caja) que abre el dialog de egreso con el centro "Retiros" fijado y la cuenta preseleccionada cuando se lanza desde una fila del ABM. No duplica flujo: es el mismo egreso prellenado. El dialog de egresos ya carga todas las cajas activas (incluidas banco) — funciona desde cuenta bancaria o caja de efectivo, como pide CTA-03.

### Superficie UI del ABM

- **D-11: El ABM vive dentro de CajaPage** como tab/sección "Cuentas" — las cuentas ya viven conceptualmente en Caja (Saldos las muestra). Sin página nueva ni entrada extra de nav. Nota para fase 151: la "creación rápida inline" de COBRO-04 deberá reusar el form/dialog de creación de esta fase como componente, no la página.
- **D-12: Permisos = admin/owner** (heredado de 149: Caja es dueño-only para el empleado). Endpoints nuevos con guard admin/owner en la API, consistente con el nav.

### Claude's Discretion

- Fallback del nombre derivado cuando no hay alias (D-03).
- Validación de formato de CBU/CVU (22 dígitos) y CUIT (11 dígitos + dígito verificador): nivel de estrictez a criterio — orientar a validación liviana (largo/numérico) sin bloquear casos raros (cuentas del exterior).
- País del seed "Retiros" en `cost_centers`: seguir el patrón de la fase 147 (AR) salvo que el researcher encuentre razón para sembrar por país.
- Naming/orden exacto del tab "Cuentas" dentro de CajaPage (la fase 152 va a reordenar los tabs — no optimizar el orden ahora).
- Detalle de dónde se ubica el botón "Registrar retiro" (fila del ABM, header del tab, o ambos).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño del milestone (fuente de verdad)

- `.docs/saas-multitenancy/Correcciones El Templo.md` — doc crudo de Nacho; ítems de Caja/Saldos 2-4 (crear/cerrar cuenta flexible, inputs y obligatorios, asociación de pagos, nota de saldos) e ítems de egresos 4-5 (categorías "Pago a proveedores"/"retiros", retiros del dueño y cuenta personal separada).
- `.docs/saas-multitenancy/01-analisis-correcciones-admin.md` — análisis bajo lente SaaS; cuentas bancarias flexibles y retiros clasificados como 🟩 NÚCLEO (concepto contable genérico).

### Schema y motor financiero (v5.2/v5.3 — brownfield sobre el que se construye)

- `el-templo-api/src/db/schema/cash-registers.ts` — tabla a extender; invariantes: moneda fija por caja, saldo derivado desde cutoff_date, tipos efectivo/banco, `is_active` existente.
- `el-templo-api/src/db/migrations/0160_seed_banco_cuentas.sql` — seeds Galicia/Mercado Pago (las cuentas reales que el ABM pasa a gestionar); patrón de cutoff global compartido.
- `el-templo-api/src/db/schema/cost-centers.ts` — catálogo donde se seedea "Retiros"; patrón country varchar(2), seeds AR de fase 147.
- `el-templo-api/src/modules/finance/movement-service.ts` — `registerExpense` (valida centro de costo activo, acepta cualquier caja) y `voidExpense`; el retiro se monta acá sin cambios de motor.
- `el-templo-api/src/modules/finance/cash-register-service.ts` + `balance-service.ts` — servicio de cajas y saldos derivados (el warning de cierre con saldo ≠ 0 consulta acá).

### UI existente (integración)

- `el-templo-admin/src/pages/CajaPage.vue` — hub de Caja donde aterriza el tab/sección "Cuentas" (D-11).
- `el-templo-admin/src/components/caja/RegistrarMovEgresoDialog.vue` — dialog de egresos a reusar prellenado para "Registrar retiro" (D-10); ya carga todas las cajas activas.

### RBAC (fase 149)

- `.planning/phases/149-nav-por-categor-as-rbac/149-CONTEXT.md` — D-01/D-04: dueño vs empleado, gating frontend + API consistente; Caja es admin/owner-only.
- `el-templo-api/src/modules/shared/permissions.ts` — sets de roles centralizados para los guards de los endpoints nuevos.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `cash_registers.is_active` — la baja lógica ya existe a nivel schema; CTA-02 es exponerla por API/UI con la semántica de D-06/D-07.
- `RegistrarMovEgresoDialog.vue` — dialog de egresos con selector de caja (todas las activas) y centro de costo; "Registrar retiro" es este dialog prellenado.
- `registerExpense` / `voidExpense` (movement-service) — motor de egresos completo con validación de centro de costo; el retiro no requiere cambios de motor.
- Patrón de seeds idempotentes por nombre (migración 0160, guard NOT EXISTS con derived table) — reusar para el seed "Retiros".
- `getCashRegisterBalances` — para mostrar el saldo por cuenta en el ABM y en el warning de cierre.

### Established Patterns

- **Enum/columnas byte-for-byte con la migración** (referencia Drizzle): los nombres de columna nuevos en `cash-registers.ts` deben coincidir exactamente con el SQL de la migración — CI falla con "Unknown column" que tsc no detecta.
- **`db:generate` está roto por drift pre-existente** (fases 144/153/155 lo sufrieron): la migración se escribe a mano, numeración siguiente a la última en `src/db/migrations/` (verificar el número al momento de ejecutar — el tren v5.2/v5.3 llegó hasta 0162).
- **Nunca `;` dentro de comentarios SQL** (el runner splittea por `;` antes de strippear `--`).
- **Tests de integración obligatorios** para rutas nuevas/modificadas (`el-templo-api/test/`).
- **La seguridad real vive en la API** (149 D-04): guards admin/owner en endpoints, el nav solo esconde.

### Integration Points

- `el-templo-api/src/modules/finance/routes.ts` — endpoints nuevos del ABM (create/update/close/reactivate) con guard admin/owner.
- `el-templo-api/src/modules/finance/schemas.ts` — schemas de validación (obligatorios D-02, "uno de dos" CBU/Alias).
- `CajaPage.vue` — tab/sección nueva "Cuentas". La fase 152 reordenará los tabs; no pisarse.
- Fase 151 (COBRO-04) consumirá: cuentas activas para el selector de cobro + el form de creación como dialog inline. Diseñar el form de creación como componente reutilizable.

</code_context>

<specifics>
## Specific Ideas

- El doc de Nacho enfatiza flexibilidad: "muchos monotributos, una empresa, muchas cuentas bancarias, cuenta afuera cuenta adentro" — el form no debe imponer estructura más allá de los 3 obligatorios.
- La nota "si no se registran egresos y retiros sobre cuentas no mostrarán los saldos reales" es CAJA-06 (fase 152), pero el warning de cierre con saldo (D-06) usa el mismo espíritu de mensaje.

</specifics>

<deferred>
## Deferred Ideas

- **Default "Pago a proveedores" + ABM de centros de costo** — fase 152 (CAJA-05); esta fase solo seedea "Retiros".
- **Asociación obligatoria cuenta↔cobro + creación rápida inline** — fase 151 (COBRO-04); esta fase deja el form de creación como componente reutilizable.
- **Reordenamiento de tabs de Caja** — fase 152 (CAJA-01); el tab "Cuentas" se agrega sin optimizar el orden.

### Reviewed Todos (not folded)

- `v51-milestone-data-rollout.md` (Rollout de datos v5.1 — poblar `milestone_exercise_id`) — ya revisado y descartado en la fase 149 por el mismo match débil de keywords; sin relación con cuentas bancarias.

</deferred>

---

_Phase: 150-Cuentas bancarias flexibles_
_Context gathered: 2026-07-02_
