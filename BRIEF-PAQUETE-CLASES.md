# BRIEF — Paquete de clases

**Estado:** propuesta consensuada (shaping cerrado 2026-08-14). Pendiente: planificar la fase e implementar.

## Problema

Hay demanda de casos de uso de **corto plazo y a medida** que los planes mensuales no cubren:
gente que quiere entrenar **una o dos semanas todos los días**, o **tres semanas cuatro días**, etc.
Hoy no hay forma de venderles algo proporcional sin inventar un plan a mano cada vez.

## Objetivo

Una opción de alta **"Paquete de clases"** con dos selectores — **semanas** y **clases por semana** —
que resuelven a un precio calculado por fórmula. Para el alumno y los reportes es _un solo producto_;
la duración nunca llega al mes (eso es el plan mensual de siempre).

## Decisiones cerradas

| Tema                | Decisión                                                                                                                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Modelo de datos** | **Opción B — matriz de planes reales generada por fórmula.** N filas concretas (categoría nueva `paquete`), ocultas del picker normal. La UI muestra 1 producto con 2 selectores que resuelven al `planId`. |
| **Rango**           | **1–3 semanas × 1–6 clases/semana** → 18 combinaciones. Nunca llega al mes.                                                                                                                                 |
| **Reserva**         | `bookingMode = 'flexible'` — el alumno reserva semana a semana.                                                                                                                                             |
| **Tope semanal**    | **Duro.** `classesPerWeek` limita las reservas de cada semana (no se puede quemar todo el paquete en dos días).                                                                                             |

### Por qué la Opción B (y no un motor de precios al alta)

El sistema **siempre** elige plan por `planId` de `subscription_plans`; el precio lo resuelve el backend
leyendo columnas del plan (no hay motor de precios en runtime, nunca lo hubo). Y el budget de clases se
**deriva**: `classesRemaining = ceil(durationDays/7) × classesPerWeek`, snapshoteado en la subscription.

**Detalle clave:** con `durationDays = semanas × 7`, la derivación existente da
`ceil(semanas×7 / 7) = semanas` exacto → budget = `semanas × clasesPorSemana` = **total de clases, sin una
sola línea de código nueva**. Y `classesPerWeek` da el tope semanal gratis.

Consecuencia: budget, tope semanal, renovación y cobertura (`covered-until.ts`) funcionan **nativos**.
La fórmula corre en la **migración que genera la matriz**, no en runtime. Cero cambios en `assignPlan`.

## Fórmula de precio

```
precio = tarifa_por_clase(frecuencia) × total_clases × recargo_corto_plazo(semanas)
       (total_clases = semanas × frecuencia; redondeo a $500)
```

**Anclaje:** derivada de los mensuales reales (Flex 2/sem = $8.000/clase; Flex+ 6/sem = $3.333/clase),
pero con **piso** en las frecuencias altas para que el precio sea **monótono** (más clases = más caro) y
**nunca baje del precio/clase del mensual equivalente** (no canibaliza).

Tarifas y recargos son **parámetros de negocio (los define Franco)**. Defaults propuestos:

- **Tarifa/clase:** 1/sem $9.000 · 2/sem $8.000 · 3/sem $6.800 · 4/sem $5.800 · 5/sem $5.200 · 6/sem $5.000
- **Recargo corto plazo:** 1 sem ×1,35 · 2 sem ×1,20 · 3 sem ×1,12

### Grilla resultante (precio / clases totales)

|           | 1/sem       | 2/sem       | 3/sem       | 4/sem        | 5/sem        | 6/sem         |
| --------- | ----------- | ----------- | ----------- | ------------ | ------------ | ------------- |
| **1 sem** | $12.000 (1) | $21.500 (2) | $27.500 (3) | $31.500 (4)  | $35.000 (5)  | $40.500 (6)   |
| **2 sem** | $21.500 (2) | $38.500 (4) | $49.000 (6) | $55.500 (8)  | $62.500 (10) | $72.000 (12)  |
| **3 sem** | $30.000 (3) | $54.000 (6) | $68.500 (9) | $78.000 (12) | $87.500 (15) | $101.000 (18) |

**Guardrails verificados:**

- Monótono: más clases → más caro, en toda fila y columna.
- No canibaliza: el precio/clase de cualquier paquete es siempre ≥ el del mensual de igual frecuencia.
- Nudge al mensual: 3sem×6 = $101.000 por **18** clases vs mensual Flex+ $100.000 por **30** clases →
  si vas a entrenar tanto, conviene el mes. Intencional.

## Arquitectura e implementación

Trabajo de **fase (GSD)**, no fix suelto.

1. **Migración**
   - `planCategory` enum += `'paquete'` (Drizzle `mysqlEnum`, ver skill `el-templo-db-migrations`).
   - INSERT de las 18 filas: `name` ("Paquete · N sem · M/sem"), `planCategory='paquete'`,
     `bookingMode='flexible'`, `durationDays = semanas×7`, `classesPerWeek = frecuencia`,
     `priceRegular = fórmula`, `planTier='other'`.
   - **Numeración a coordinar con el tren v6.0** (hoy migs desde 0198+; confirmar el número libre real
     al momento de tocar). Sin `;` en comentarios SQL.
2. **UI de alta** — tab "Paquete de clases" con 2 selectores → resuelve `planId` → submit normal.
   - `CobrosPage.vue` (PoS profe; ya tiene tabs de categoría presencial/online/especial).
   - `AssignPlanDialog.vue` (admin; hoy solo agrupa por tier → sumarle el modo paquete).
3. **Ocultar del picker normal** las filas `paquete` (que no ensucien presencial/online).
4. **Analytics** — agrupar/segregar la categoría `paquete` como corresponda (precedente: `membership_kind`).
5. **Tests de integración** — alta con plan `paquete`: budget derivado = semanas×frecuencia,
   tope semanal, cobertura. Resolver `admin@test.com` (nunca hardcodear ids).

## Preguntas abiertas (para la etapa de planificación)

- **España (country=ES):** ¿se duplican las 18 filas en EUR con otra tabla de precios? (patrón Fase 98).
- **Descuentos:** ¿los paquetes participan de descuento Aura y referidos, o quedan afuera como el pase
  `especial`? (hoy `especial` está fuera de referidos — D-09).
- **Precio Zero / recargo tarjeta:** ¿se definen `priceZero`/`priceCreditCard` para paquetes o
  `priceZero = priceRegular` y sin recargo?
- **Renovación:** un paquete no renueva automático; se vende otro. Confirmar la UX (¿botón "renovar"
  reabre el selector?).
- **Verificar** que el tope semanal (`classesPerWeek`) se enforcea en `bookingMode='flexible'`
  (getClassUsageThisWeek expone `weeklyLimit`, pero confirmar el punto de bloqueo de reserva).
- **Nombres visibles:** ¿la fila muestra "Paquete · 2 sem · 3/sem" o un display unificado "Paquete de
  clases (6 clases)"?

## Referencias de código

- `el-templo-api/src/db/schema/subscription-plans.ts` — tabla de planes (enum `planCategory`, `durationDays`, `classesPerWeek`).
- `el-templo-api/src/modules/subscriptions/service.ts` (~1524-1532) — derivación de budget.
- `el-templo-api/src/modules/subscriptions/service.ts:1224+` — `assignPlan` (no requiere cambios).
- `el-templo-api/src/modules/finance/coach-load-routes.ts:674+` — alta del PoS profe.
- `el-templo-api/src/db/migrations/0179_especial_pass_core.sql` — precedente de categoría con budget explícito.
- `el-templo-admin/src/pages/CobrosPage.vue` — PoS profe (tabs de categoría).
- `el-templo-admin/src/components/AssignPlanDialog.vue` — alta admin (agrupación por tier).
