# Phase 122: LTV / vida del cliente - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning
**Source:** Inline decisions (discuss-phase skipped per user request; open decisions resolved directly)

<domain>
## Phase Boundary

Backend-first (servicios + endpoints + tests; **sin UI de admin** en alcance). Entrega la **vida del cliente** encadenada al churn maduro de la Fase 121:

- **Duración (dos números):** headline simple `lifetime ≈ 1 ÷ churn mensual` (reutiliza el churn person-based de 121) + robusto vía **Kaplan-Meier (solo la mediana de supervivencia)** tratando a los activos como datos censurados.
- **LTV monetario desde pagos reales** (nunca ARPU snapshot): proyectado (`lifetime × ingreso mensual real por cliente`) y observado (suma real pagada en la vida del cliente cerrado).
- Todo **separado por moneda** (ARS y EUR nunca se suman) y abierto por **sucursal, país, plan**.

**Fuera de scope:** UI del admin (fase posterior); curva de supervivencia completa mes-a-mes (diferida — solo mediana en esta fase); reactivación como métrica propia (futuro); eliminación física del ARPU viejo (→ fase de UI, ver D-122-01).

</domain>

<decisions>
## Implementation Decisions

### Encadenamiento con Fase 121 (LTV-01, LTV-03)

- **D-122-02:** El **fin de vida** de un cliente se define con la **lógica de churn maduro de la Fase 121** (D-08 de 121: solo cuenta quien venció hace ≥ ventana días; una vez churneado queda churneado). Los bloques se encadenan — el LTV consume el mismo evento de churn, no redefine "fin de vida".
- **D-122-03 (headline):** `lifetime_headline = 1 ÷ churn_mensual`, reutilizando el churn person-based ya implementado en 121 (`ChurnService`). Abierto por los breakdowns estándar (sucursal, país, plan) y por moneda.

### Reactivación → heredar corte de 15 días (DECISIÓN ABIERTA #2 — RESUELTA: heredar)

- **D-122-04:** Cliente que se fue y volvió = **una vida con gap**, usando el **mismo corte de 15 días (ventana de renovación configurable, default 15d) de la Fase 121** (D-07/D-08). Gap ≤ ventana → continuidad (misma vida, no churneó). Gap > ventana → la vida se cerró (churneó); el regreso posterior es reactivación (métrica futura fuera de alcance) y **no revierte** el churn previo. Consistencia total con 121; no se introduce un corte nuevo para LTV.

### Kaplan-Meier → solo mediana (DECISIÓN ABIERTA #3 — RESUELTA: solo mediana)

- **D-122-05:** Se calcula **solo la mediana de supervivencia** (el mes en que la mitad del grupo ya se fue), tratando a los clientes activos como **datos censurados** (no se descartan, a diferencia de un promedio de "solo cerrados"). La **curva completa mes-a-mes para graficar queda diferida** (no en esta fase) — el requirement LTV-02 pide la mediana.
- **D-122-06:** Kaplan-Meier es algoritmo estadístico nuevo → **aislado con tests dedicados** (función pura testeable + casos de censura). El planner debe crear cobertura específica para: censura (activos), eventos (churneados), empates en el mismo mes, cohorte vacía, cohorte de un solo cliente.

### LTV monetario desde pagos reales (LTV-04)

- **D-122-07:** **Nunca** vía ARPU snapshot (caveat #8 del spec: denominador snapshot no histórico). Dos cálculos:
  - **Proyectado:** `lifetime × ingreso_mensual_real_promedio_por_cliente`, donde el ingreso mensual real sale de los **pagos reales** (no del precio de lista).
  - **Observado (clientes cerrados):** **suma real** de todo lo pagado en la vida del cliente (exacto, sin estimar). De ahí también `ingreso_mensual_real = LTV_observado ÷ lifetime`.
- **D-122-08:** El precio usado es el **realmente cobrado** (`price_paid` / pagos reales), capturando descuentos y becas automáticamente — coherente con el universo de pagos reales del milestone.

### ARPU → retirar (DECISIÓN ABIERTA #1 — RESUELTA: retirar, vía deprecación D-09)

- **D-122-01:** El **ARPU de Finanzas Avanzadas se retira**, aplicando el **mismo patrón D-09 de la Fase 121**: se marca **deprecado** a nivel código (comentario/anotación) y el **LTV monetario nuevo queda como reemplazo canónico**, pero **se deja funcionando** para **no romper el dashboard de Finanzas Avanzadas actual** que lo consume. La **eliminación física** se hace en la **fase de UI del admin** (cuando las tarjetas se reconecten a los endpoints nuevos). ⚠️ Consistente con D-09: backend-first no rompe consumidores vivos; la retirada literal se satisface a nivel milestone. El planner debe localizar el cómputo de ARPU, anotarlo deprecado y dejar el LTV como canónico.

### Separación por moneda y breakdowns (LTV-05)

- **D-122-09:** LTV (headline, Kaplan-Meier mediana, monetario proyectado y observado) **separado por moneda** (ARS / EUR nunca se suman) y abierto por **sucursal, país, plan**, reutilizando los helpers de breakdown/aislamiento de moneda de la Fase 120. El LTV por plan debe mostrar qué membresía retiene vidas más largas y deja más plata por cliente.

### Claude's Discretion

- Si el cálculo de LTV vive en un `LtvService` nuevo o se compone sobre `ChurnService`/`RenewalService` existentes — el planner decide respetando los patrones de `analytics/` y el motor de cohorte compartido de 120/121.
- Forma exacta del endpoint (`GET /ltv` con `window` + breakdown params, en línea con `/churn` y `/renewal` de 121) y del schema de respuesta (nominal + n + por-moneda).
- SQL exacto para el ingreso mensual real por cliente desde pagos reales y para la suma observada de clientes cerrados.
- Cómo se materializa la cohorte de supervivencia (duración de cada vida en meses) para alimentar Kaplan-Meier desde el motor de cohorte por `end_date`.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spec del milestone

- `ESPECIFICACION-METRICAS-GESTION.md` — §5 "LTV / vida del cliente" (fin de vida, headline `1÷churn`, Kaplan-Meier, LTV monetario proyectado/observado, edge case reactivación, cortes). §8 caveat ARPU snapshot.
- `.planning/REQUIREMENTS.md` — Bloque 5 (LTV-01..05) y nota de decisión abierta ARPU (línea 23).

### Fase 121 (de la que esta fase DEPENDE — el churn define el fin de vida)

- `.planning/phases/121-vencimiento-churn-de-no-renovaci-n-tasa-de-renovaci-n/121-CONTEXT.md` — D-07 (ventana 15d configurable), D-08 (churn maduro + "una vez churneado queda churneado"), D-09 (patrón de deprecación de métricas viejas), motor de cohorte por `end_date ∈ [from,to)`.
- `.planning/phases/121-.../121-01-SUMMARY.md`, `121-02-SUMMARY.md`, `121-03-SUMMARY.md` — qué se construyó: motor de cohorte compartido, `ChurnService` (person-based, multi-N, maduro), `RenewalService`, endpoints `GET /churn` y `GET /renewal`. **Reutilizar, no duplicar.**
- `.planning/phases/121-.../121-PATTERNS.md` — analogías de archivos y excerpts del módulo analytics.

### Fundación (Fase 120)

- `.planning/phases/120-fundaci-n-transversal-ticket-promedio/120-CONTEXT.md` — helpers/breakdowns (sucursal/país/plan), aislamiento de moneda, cohortes `[from,to)`, `duration_tier` derivado, formato nominal + % + n.

### Código

- `el-templo-api/src/modules/analytics/service.ts` — servicios existentes; localizar el cómputo de ARPU (deprecar, D-122-01).
- `el-templo-api/src/modules/analytics/routes.ts` — registro de endpoints (`/churn`, `/renewal` como patrón para `/ltv`).
- `el-templo-api/test/` — patrón de tests de integración contra MySQL real (helpers de seed/auth).

</canonical_refs>

<specifics>
## Specific Ideas

- **Señal valiosa:** si el headline (`1÷churn`) y la mediana Kaplan-Meier difieren mucho, el churn no es parejo (probablemente más alto al inicio). El endpoint debe permitir comparar ambos números.
- **Universo de pagos:** todos los cobros de membresía (nuevas y renovaciones) por fecha de cobro, respetando el filtro del panel (coherente con el ticket promedio del milestone).
- Endpoint nuevo en línea con `GET /churn` y `GET /renewal` (acceso gestión, mismo middleware de scope/sede que 121).

</specifics>

<deferred>
## Deferred Ideas

- Curva de supervivencia completa mes-a-mes para graficar (solo mediana en esta fase — D-122-05).
- Reactivación como métrica propia (quien vuelve después del corte de ventana) — futuro.
- Eliminación física del ARPU viejo del API → fase de UI del admin (D-122-01).
- UI del admin para LTV → fase posterior.

</deferred>

---

_Phase: 122-ltv-vida-del-cliente_
_Context gathered: 2026-06-04 — inline (discuss-phase skipped, 3 open decisions resolved by user: ARPU retirar/deprecar, reactivación heredar corte 15d, Kaplan-Meier solo mediana)_
