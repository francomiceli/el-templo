# Phase 177: Paquete de clases — alta de corto plazo a medida por fórmula - Context

**Gathered:** 2026-08-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Vender **paquetes de clases de corto plazo** desde el flujo de alta: el admin/profe elige
**semanas (1–3)** y **clases por semana (1–6)**, y el sistema resuelve un plan con precio
calculado por fórmula. La duración nunca llega al mes (eso lo cubren los planes mensuales).

**Modelo (cerrado): Opción B — matriz de planes reales generada por migración.** Cada combinación
(semanas × clases/semana) es una fila real de `subscription_plans` con categoría nueva `paquete`,
`bookingMode='flexible'`, `durationDays = semanas×7`, `classesPerWeek = frecuencia`, `priceRegular`
calculado. La UI muestra **un solo producto** ("Paquete de clases") con 2 selectores que resuelven al
`planId` correcto y hacen submit por el camino de alta normal. **No se introduce motor de precios en
runtime; no se toca `assignPlan`.**

**Detalle clave:** con `durationDays = semanas×7`, la derivación existente de budget
`classesRemaining = ceil(durationDays/7) × classesPerWeek` da **exactamente `semanas×frecuencia` = total
de clases del paquete**, sin código nuevo. `classesPerWeek` da además el tope semanal duro gratis.

**Fuera de alcance:** cualquier motor de precios genérico, planes de duración ≥ 1 mes (son los
mensuales de siempre), paquetes online/no-presenciales.
</domain>

<decisions>
## Implementation Decisions

### Modelo de datos (cerrado antes de discuss)

- **D-01:** Opción B — matriz de planes reales generada por migración. Categoría nueva `paquete` en el
  enum `planCategory`. Filas ocultas del picker normal (presencial/online/especial).
- **D-02:** `bookingMode='flexible'`, `durationDays=semanas×7`, `classesPerWeek=frecuencia`,
  `planTier='other'`. Budget y tope semanal salen nativos de la derivación existente. **`assignPlan` NO
  cambia de firma/contrato ni se le agrega lógica de asignación** — el único toque permitido es agregar
  guards de categoría en la composición de precio para D-13 (excluir paquete de Aura/referidos), confirmado
  con Franco 2026-08-14 tras el plan-checker (la exclusión vive físicamente dentro del rango de líneas de
  `assignPlan` y sus hermanas, que es donde se componen los descuentos; no hay otra forma de implementar D-13).
- **D-03:** Rango 1–3 semanas × 1–6 clases/semana = 18 combinaciones por país.

### Alcance de país

- **D-04:** Se venden en **Argentina (ARS) y España (EUR)** → **36 filas** (18 ARS + 18 EUR), cada país
  con su propia tabla de precios (los números de AR no sirven convertidos). Scoping por columnas
  `country`/`currency` (patrón Fase 98).

### Precio (fórmula y grillas)

- **D-05:** Fórmula: `precio = tarifa_por_clase(frecuencia) × total_clases × recargo_corto_plazo(semanas)`,
  `total_clases = semanas × frecuencia`. Anclada a los mensuales reales de cada país, con **piso** en las
  frecuencias altas para que el precio sea **monótono** (más clases = más caro) y **nunca baje del
  precio/clase del mensual equivalente** (no canibaliza). La fórmula corre en la migración que genera las
  filas, NO en runtime.
- **D-06 (recargo corto plazo, ambos países):** 1 sem ×1,35 · 2 sem ×1,20 · 3 sem ×1,12.
- **D-07 (tarifa/clase ARS):** 1/sem $9.000 · 2/sem $8.000 · 3/sem $6.800 · 4/sem $5.800 · 5/sem $5.200 ·
  6/sem $5.000. **Grilla ARS resultante (precio / clases), redondeo a $500:**

  |       | 1/sem       | 2/sem       | 3/sem       | 4/sem        | 5/sem        | 6/sem         |
  | ----- | ----------- | ----------- | ----------- | ------------ | ------------ | ------------- |
  | 1 sem | $12.000 (1) | $21.500 (2) | $27.500 (3) | $31.500 (4)  | $35.000 (5)  | $40.500 (6)   |
  | 2 sem | $21.500 (2) | $38.500 (4) | $49.000 (6) | $55.500 (8)  | $62.500 (10) | $72.000 (12)  |
  | 3 sem | $30.000 (3) | $54.000 (6) | $68.500 (9) | $78.000 (12) | $87.500 (15) | $101.000 (18) |

- **D-08 (tarifa/clase EUR):** 1/sem 10€ · 2/sem 9€ · 3/sem 7,8€ · 4/sem 6,8€ · 5/sem 6,2€ · 6/sem 6,0€.
  Anclas mensuales de España usadas: Flex Solo 50€ (1/sem = 10€/clase), Flex 90€ (2/sem = 9€/clase),
  Flex+ 125€ (6/sem = 4,17€/clase). **Grilla EUR resultante (precio / clases), redondeo a 1€:**

  |       | 1/sem   | 2/sem   | 3/sem   | 4/sem    | 5/sem     | 6/sem     |
  | ----- | ------- | ------- | ------- | -------- | --------- | --------- |
  | 1 sem | 14€ (1) | 24€ (2) | 32€ (3) | 37€ (4)  | 42€ (5)   | 49€ (6)   |
  | 2 sem | 24€ (2) | 43€ (4) | 56€ (6) | 65€ (8)  | 74€ (10)  | 86€ (12)  |
  | 3 sem | 34€ (3) | 60€ (6) | 79€ (9) | 91€ (12) | 104€ (15) | 121€ (18) |

- **D-09:** Guardrails verificados en ambas grillas: monótonas, precio/clase siempre ≥ mensual de igual
  frecuencia, y el 3sem×6 queda casi igual al mensual Flex+ pero con muchas menos clases (18 vs 30) →
  nudge intencional al mensual.

### Ciclo de vida y visibilidad

- **D-10:** **Analytics: los paquetes cuentan como cualquier alumno.** Entran en altas/bajas, activos,
  ingresos y retención igual que un mensual. Sin segregación tipo `membership_kind`. Tradeoff aceptado por
  Franco: los paquetes cortos meten algo de ruido de churn (un paquete de 1 semana que vence se lee como
  baja) — es el comportamiento deseado (conteo honesto).
- **D-11:** **Renovación:** al vencer, la renovación **reabre el selector de paquete** (se re-eligen
  semanas y clases/semana, pueden ser distintas) **Y** además permite **renovar hacia cualquier otro
  plan** (mensual, etc.). O sea: el flujo de cambio/renovación existente ya deja elegir cualquier plan;
  hay que exponerle también el modo paquete con sus 2 selectores.
- **D-12:** **Nombre visible (fila / recibos / reportes): descriptivo** — `Paquete · N sem · M/sem`
  (ej. "Paquete · 2 sem · 3/sem"). Distingue las 18 variantes de un vistazo en recibos y analytics.

### Claude's Discretion (defaults aplicados — Franco no quiso discutirlos; revisar si molesta)

- **D-13 (descuentos):** Los paquetes quedan **fuera** de descuento Aura y de referidos (precedente: pase
  `especial`, D-09 del sistema de referidos). Razón: un descuento Aura de hasta 30% sobre un paquete ya
  promocional erosionaría el guardrail de no-canibalización (podría caer bajo el precio/clase del mensual).
  **Si Franco quiere que participen de descuentos, avisar antes de planificar.**
- **D-14 (tipos de precio):** `priceZero = priceRegular` (no hay "Precio Zero" para paquetes; no se
  regalan) y `priceCreditCard = NULL` (cae a `priceRegular`; sin recargo de tarjeta por ahora — se puede
  agregar después por país si hace falta).
- **D-15 (roles):** Sin gating nuevo — venden paquetes los mismos roles que hacen alta hoy (admin/gestión
  vía `AssignPlanDialog`, coach vía PoS `/coach-load/alta`). El status del cobro sigue la regla existente
  (coach → `pendiente`).
  </decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spec de la feature

- `BRIEF-PAQUETE-CLASES.md` (raíz del repo) — brief con problema, decisiones, fórmula, grilla y preguntas
  abiertas. Este CONTEXT.md lo supera en las decisiones ya cerradas (país, ciclo de vida, defaults).

### Modelo de datos y precio

- `el-templo-api/src/db/schema/subscription-plans.ts` — tabla de planes. Enum `planCategory`
  (agregar `paquete`), `durationDays`, `classesPerWeek`, `priceRegular/priceZero/priceCreditCard`,
  `country`/`currency`, `bookingMode`, `planTier`. Único índice: `(tenantId, name, country)`.
- `el-templo-api/src/db/schema/subscriptions.ts` — membresía/consumo. `classesBudget`, `classesRemaining`,
  `endDate`, `pricePaid` (snapshot al alta).
- `el-templo-api/src/modules/subscriptions/service.ts` ~1524-1532 — derivación de budget
  `ceil(durationDays/7) × classesPerWeek` (el punto que hace innecesario el motor de precios).
- `el-templo-api/src/modules/subscriptions/service.ts:1224+` — `assignPlan` (no cambia firma/contrato ni
  lógica de asignación; solo guards de categoría para D-13 en la composición de precio — ver D-02).
- `el-templo-api/src/modules/subscriptions/service.ts:5104-5161` — `getClassUsageThisWeek` / `weeklyLimit`
  (verificar el enforce del tope semanal en `flexible`).
- `el-templo-api/src/modules/shared/covered-until.ts` — `memberCoveredUntilSql()` (fuente única de cobertura).
- `el-templo-api/src/db/migrations/0179_especial_pass_core.sql` — precedente de categoría de plan con
  budget explícito + INSERT de planes por migración (patrón a copiar para la matriz).

### Flujo de alta (UI + endpoints)

- `el-templo-admin/src/pages/CobrosPage.vue` — PoS profe; tabs de categoría (presencial/online/especial),
  `loadAltaPlans()`, `FixedSchedulePicker`. Aquí va el tab "Paquete" con los 2 selectores.
- `el-templo-admin/src/components/AssignPlanDialog.vue` — alta admin (hoy agrupa solo por tier; sumar modo paquete).
- `el-templo-api/src/modules/finance/coach-load-routes.ts:674+` — endpoint `/coach-load/alta` (atómico/idempotente).
- `el-templo-api/src/modules/subscriptions/routes.ts:307` — `.../subscription/assign` (admin).
- `el-templo-admin/src/types/subscription.ts` — labels de tiers/categorías (agregar label de `paquete`).

### Referencia de datos España (aportada por Franco 2026-08-14)

- Planes presenciales ES usados como ancla: Flex Solo 50€/30d/1sem, Flex 90€/30d/2sem, Flex+ 125€/30d/6sem.
  </canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **Derivación de budget existente**: con `durationDays=semanas×7` produce el total exacto de clases del
  paquete → cero lógica nueva de budget.
- **Patrón de INSERT por migración**: `0179_especial_pass_core.sql` ya inserta planes especiales con budget;
  la matriz de 36 filas sigue el mismo patrón.
- **Camino de alta unificado**: admin y PoS convergen en `SubscriptionService.assignPlan` con `planId`;
  resolver el `planId` desde los selectores es lo único nuevo en el front.
- **Scoping multi-moneda (Fase 98)**: `country`/`currency` en el plan ya soportan la duplicación AR/ES.

### Established Patterns

- **El plan se elige SIEMPRE por `planId`** de un catálogo; el precio lo resuelve el backend por lookup
  (`getBasePrice`). La matriz respeta esto al 100%.
- **Categoría como filtro de UI**: `CobrosPage` ya filtra por `planCategory` con tabs → `paquete` es un tab más.
- **Precedente de exclusión de negocio**: `especial` fuera de referidos (D-09 del sistema); membership_kind
  fuera de analytics — patrones a NO copiar aquí para analytics (D-10 dice "como cualquier alumno") pero SÍ
  para descuentos (D-13).

### Integration Points

- Enum `planCategory` += `paquete` (Drizzle `mysqlEnum`; ver skill `el-templo-db-migrations`).
- Migración con los 36 INSERT — **numeración a coordinar con el tren v6.0 (migs 0198+); tomar el número
  libre real al momento de tocar.** Sin `;` en comentarios SQL.
- Ocultar filas `paquete` del picker de planes normal (presencial/online).
- Renovación/cambio de plan: exponer el selector de paquete en ese flujo además de la lista de planes (D-11).
  </code_context>

<specifics>
## Specific Ideas

- Nombre de fila descriptivo exacto: `Paquete · N sem · M/sem` (con el separador "·"). Ej: "Paquete · 2 sem · 3/sem".
- Redondeo: ARS a $500, EUR a 1€.
- El caso 3sem×6 se genera y se ofrece (no es celda trampa como lo hubiera sido la 4ª semana, que se descartó).
  </specifics>

<deferred>
## Deferred Ideas

- **Recargo de tarjeta / Precio Zero por país** para paquetes — hoy `priceCreditCard=NULL` y
  `priceZero=priceRegular` (D-14). Si más adelante se quiere recargo de tarjeta en paquetes, es otra iteración.
- **Participación en descuentos Aura/referidos** — decidido NO por default (D-13). Si Franco lo quiere,
  es un cambio acotado pero hay que revisar el guardrail de canibalización.
- **Investigar (research, no decisión de Franco):** confirmar que el tope semanal (`classesPerWeek`) se
  enforcea de verdad en `bookingMode='flexible'` en el punto de reserva (`booking-service.ts`), no solo
  que se expone como `weeklyLimit`.

### Reviewed Todos (not folded)

None — no se cruzaron todos con esta fase.
</deferred>

---

_Phase: 177-paquete-de-clases-alta-de-corto-plazo-a-medida-por-formula_
_Context gathered: 2026-08-14_
