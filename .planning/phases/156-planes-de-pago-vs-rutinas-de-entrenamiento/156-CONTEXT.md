# Phase 156: Planes de pago vs Rutinas de entrenamiento - Context

**Gathered:** 2026-07-05 (modo `--auto` — decisiones = opción recomendada, autorizado por el usuario)
**Status:** Ready for planning

<domain>
## Phase Boundary

Separación conceptual y de superficie entre "Planes de pago" y "Rutinas de entrenamiento" (PLAN-01), precio "Zero" a configuración (PLAN-02), selección múltiple de programas por plan además del "todos" existente (PLAN-03), y garantía con test de que actualizar el precio de un plan no crea plan nuevo ni altera montos históricos (PLAN-04). Requirements: PLAN-01..04.

NO incluye: rediseño del motor de rutinas/programas (la visión de Nacho de rutinas por objetivos/músculos/IA es explícitamente NO-MVP), cambios a promo-plans, cambios a la "configuración de días" de planes (ítem 3 de Nacho — queda como está), app de miembros más allá de que el acceso multi-programa funcione, tenants.

**Arrastrado de fases previas (no re-decidir):** 149 nav por categorías (Planes ya es categoría, Programas dueño-only D-15) + D-04 seguridad en API; 154: módulo `settings` con keys de pricing + patrón de gate server-side en `resolvePriceType` + página `/configuracion/precios` + patrón de superficie Templo (`TEMPLO_GREEK_LEVELS`); migraciones a mano (runner propio), nunca `;` en comentarios; tests corren en CI, no localmente.

</domain>

<decisions>
## Implementation Decisions

### Separación Planes de pago / Rutinas de entrenamiento (PLAN-01)

- **D-01: Renames de superficie, sin tocar rutas ni DB.** En el nav (`templo-config.ts` ~147-151): categoría/ítem "Planes" → **"Planes de pago"** (label; path `/planes` intacto) y "Programas" → **"Rutinas de entrenamiento"** (label; path `/programas` intacto). Ajustar títulos de página (PlanesPage/ProgramasPage) y textos visibles coherentes. Los identificadores de código (programs, plans) NO se renombran.
- **D-02: "Rutinas de entrenamiento" queda gateada como superficie Templo** — flag de superficie en `templo-config.ts` (patrón `TEMPLO_GREEK_LEVELS` de 154, D-07/D-08: por instalación, no por usuario), además del dueño-only existente (149 D-15). White-label default: la subcategoría no aparece; El Templo la ve. Nada se borra (NAV-04).

### Precio "Zero" a config (PLAN-02)

- **D-03: Réplica exacta del patrón card_surcharge de 154:** nueva key `pricing.zero_price_enabled` en el módulo `settings` (GET staff / PUT owner-only, mismos endpoints/guards), default **OFF** (white-label sin Zero), migración nueva con seed idempotente **ON para El Templo** (comportamiento actual de prod intacto).
- **D-04: Gate server-side en el punto único:** `resolvePriceType` (subscriptions/service.ts, creado en 154) también normaliza `zero`→`regular` cuando `pricing.zero_price_enabled` está OFF — cubre assignPlan/changePlan/renew/preview y el PoS del profe sin duplicar lógica. El valor persistido queda normalizado (mismo criterio que 154 WR-04).
- **D-05: UI gateada:** con Zero OFF, CobrosPage esconde el toggle Zero, AssignPlanDialog no ofrece la opción, PlanFormDialog esconde el campo `priceZero`. La página `/configuracion/precios` (154) gana el segundo toggle "Precio Zero" con copy explicativo. La columna `subscription_plans.priceZero` NO se toca (mecanismo intacto, D-04 de 154 como precedente).

### Multi-programa por plan (PLAN-03)

- **D-06: Tabla join `plan_programs`** (`subscription_plan_id` FK, `program_id` FK, UNIQUE compuesto) + migración. `grants_all_programs` se CONSERVA con prioridad: si está true, el plan da acceso a todos (la lista se ignora); si está false, el acceso es la lista de `plan_programs` (vacía = ninguno, comportamiento actual).
- **D-07: La lógica de acceso a programas** (enrollment/gating que hoy chequea `grantsAllPrograms` — `programs/enrollment-service.ts`, `subscriptions/service.ts`) pasa a resolver: all → lista → nada, en un único helper/criterio reutilizable. La app de miembros debe poder enrolarse/ver los programas de la lista igual que hoy con "todos".
- **D-08: UI:** PlanFormDialog gana un multi-select de programas (visible cuando `grantsAllPrograms` está desactivado), gateado por la misma superficie de rutinas (D-02) — un white-label sin rutinas no ve el selector. El endpoint de create/update de planes acepta `programIds: number[]`.

### Precio actualizable sin romper históricos (PLAN-04)

- **D-09: Verificación + test, mínimo cambio de código.** Editar `priceRegular`/`priceCreditCard`/`priceZero` de un plan existente: (a) NO crea un plan nuevo, (b) NO altera `subscriptions.pricePaid` ni montos de `financial_transactions` históricos, (c) las asignaciones/renovaciones POSTERIORES usan el precio nuevo. Si la verificación encuentra que ya funciona así (lo esperado: `pricePaid` se copia al asignar), el entregable es el **test de integración que lo garantiza** (regresión permanente); si aparece un bug, se corrige en esta fase.

### Claude's Discretion

- Naming del flag de superficie de rutinas (p.ej. `TEMPLO_TRAINING_ROUTINES`) y copy final de labels/títulos.
- Shape del multi-select (q-select multiple con chips) y cómo se muestra la lista en la tabla de planes.
- Si `plan_programs` expone endpoints propios o viaja embebido en el payload de planes (recomendado: embebido).
- Orden y agrupación de los dos toggles en `/configuracion/precios`.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño del milestone (fuente de verdad)

- `.docs/saas-multitenancy/Correcciones El Templo.md` — §Planes y programas (~158-177): "Rutinas de entrenamiento y planes de pago sería más claro", "solo se actualicen los precios por inflación... chequiemoslo" (PLAN-04), ítem 1 "cuál es la idea de pagar ZERO" (PLAN-02), ítem 2 "debería tener la opción de seleccionar varios" (PLAN-03); la visión de rutinas por objetivos/IA es NO-MVP explícito.
- `.docs/saas-multitenancy/01-analisis-correcciones-admin.md` — image32-37 → PagosPage/PlanFormDialog/PlanesPage/ProgramasPage.

### API y schema

- `el-templo-api/src/db/schema/subscription-plans.ts` — `priceZero` (38), `grantsAllPrograms` (50); se conservan ambos.
- `el-templo-api/src/modules/settings/` — módulo de 154 (keys.ts, service, routes): recibe la key `pricing.zero_price_enabled` (D-03).
- `el-templo-api/src/modules/subscriptions/service.ts` — `resolvePriceType` (154): gana la rama zero (D-04); lógica de acceso a programas con `grantsAllPrograms` (D-07); CRUD de planes (acepta `programIds`, D-08); `pricePaid` copiado al asignar (D-09).
- `el-templo-api/src/modules/programs/enrollment-service.ts` — chequeo de `grantsAllPrograms` para enrolamiento (D-07).
- `el-templo-api/src/db/schema/subscriptions.ts` — `pricePaid` (57): el histórico que PLAN-04 protege.
- Migraciones nuevas: seed de la setting Zero + tabla `plan_programs` — runner propio; verificar numeración (última: 0167).

### Superficie a modificar (admin)

- `el-templo-admin/src/config/templo-config.ts` — labels nav (~147-151) + flag de superficie de rutinas (D-01/D-02); patrón `TEMPLO_GREEK_LEVELS` (154) como analog.
- `el-templo-admin/src/pages/ConfiguracionPreciosPage.vue` — segundo toggle Zero (D-05).
- `el-templo-admin/src/composables/usePricingSettingsApi.ts` — método para la key Zero (D-05).
- `el-templo-admin/src/components/PlanFormDialog.vue` — esconder `priceZero` con regla OFF (D-05) + multi-select de programas (D-08).
- `el-templo-admin/src/components/AssignPlanDialog.vue` + `el-templo-admin/src/pages/CobrosPage.vue` — gate del toggle/opción Zero (D-05; mismo lugar donde 154 gateó tarjeta).
- `el-templo-admin/src/pages/PlanesPage.vue` / `ProgramasPage.vue` — títulos/labels (D-01).

### Contexto de fases previas (dependencias directas)

- `.planning/phases/154-alumnos-de-templo-ficaci-n-accesos/154-CONTEXT.md` + `154-REVIEW.md` — patrón settings/gate/resolvePriceType/superficie Templo que esta fase replica (incluida la lección WR-04: normalizar también renovaciones).

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- Módulo `settings` completo (154): agregar una key es sumar constante + métodos + schema, sin infra nueva.
- `resolvePriceType` (154): la rama Zero es un `if` más en el mismo punto único.
- `ConfiguracionPreciosPage` + `usePricingSettingsApi` (154): el toggle Zero es el segundo control de la misma página.
- Patrón de superficie Templo (`TEMPLO_GREEK_LEVELS`, 154 D-07/D-08).
- Migraciones seed idempotentes (0157/0166 como analogs) y de tabla nueva.

### Established Patterns

- Gate server-side primero, UI esconde después (149 D-04, 154 WR-01/WR-02 lessons: guards de rol en el plugin, preview y renovaciones pasan por el mismo punto).
- Tests de integración para todo endpoint nuevo/modificado; suites en CI, no local; gates locales tsc/lint.
- Sin `git add -A`; archivos pre-existentes modificados no se tocan.

### Integration Points

- settings keys + routes (Zero), resolvePriceType (rama zero), CRUD de planes (programIds), enrollment-service (lista), PlanFormDialog/AssignPlanDialog/CobrosPage (gates UI), templo-config (labels + flag), migraciones (seed + join table).

</code_context>

<specifics>
## Specific Ideas

- Nacho: "Rutinas de entrenamiento y planes de pago sería más claro" — D-01 usa sus nombres textuales.
- Nacho: "cuál es la idea de pagar ZERO, efectivo, descuento qué?" — Zero sale del default white-label (D-03); el recargo tarjeta ya salió en 154.
- Nacho: "Si al actualizar el precio tengo que crear un nuevo programa O retroactivamente va a creer que todos los planes anteriores deberían haber pagado lo que hay que pagar ahora estaría boludo. Creo que funciona bien pero chequiemoslo." — D-09 es exactamente ese chequeo, garantizado con test.
- Nacho: "Excelente dar acceso a todos los programas, pero también debería tener la opción de seleccionar varios." — D-06/D-07/D-08.

</specifics>

<deferred>
## Deferred Ideas

- **Rutinas por objetivos/grupos musculares + IA con las máquinas del gimnasio + períodos de revisión** — visión de Nacho explícitamente NO-MVP; milestone futuro.
- **Clarificar/estandarizar la "configuración de días" del plan** (ítem 3 de Nacho, image34) — no está en los requirements de esta fase; anotado para un ajuste de UX futuro.
- **"¿La asignación de planes limita la funcionalidad de la App de cliente?"** (pregunta de Nacho) — regla de negocio interesante para explorar cuando se toque la app de miembros; fuera del milestone.

### Reviewed Todos (not folded)

- `v51-milestone-data-rollout.md` — match 0.6 por keywords genéricas; NO incorporado por octava vez (149-156): sin relación con Planes.

</deferred>

---

_Phase: 156-Planes de pago vs Rutinas de entrenamiento_
_Context gathered: 2026-07-05 via --auto (recommended options)_
