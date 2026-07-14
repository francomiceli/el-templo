# Phase 161: Núcleo — actividades gateadas, pase mensual y enforcement - Context

**Gathered:** 2026-07-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Modelo completo del pase "Actividades con Aura" funcionando end-to-end del lado backend + admin: schema (flag de gating en `activities` + budget mensual explícito en planes), las 3 actividades especiales (Verticales, Acrobacias, Open Gym) con slots de sábado y cupo propio, 2 planes `planCategory: 'especial'` (Socio $10.000 / Externo $20.000 ARS) vendidos y renovados vía `assignPlan`/`renewSubscription` sin regresiones, enforcement en `BookingService.reserve()` (+ booking admin) con error tipado, y consumo del budget por asistencia vía `classesRemaining`. Incluye el flag de "especial" en el ABM de actividades del admin.

**Nota de vocabulario:** "pase" es jerga interna de los docs para "suscripción a un plan de categoría `especial`". NO es una entidad nueva. En superficies visibles (analíticas, admin) el término es **"Especiales" / "Planes especiales"**.

La member app (grilla, contador, mensajes) y el reporte de reparto son fase 162.

</domain>

<decisions>
## Implementation Decisions

### Ciclo de vida socio↔pase

- **D-01:** La condición "plan presencial activo" del pase Socio ($10k) se valida **al asignar Y en cada renovación**. Si dejó de ser socio, no se le renueva el pase Socio — gestión le ofrece el Externo ($20k).
- **D-02:** Si el presencial vence a mitad del período del pase, el pase **sigue usable hasta su propio vencimiento** (ya lo pagó). La condición de socio se re-evalúa recién al renovar. Cero lógica extra en reserve/check-in.
- **D-03:** Período **rolling de 30 días desde la compra** (`durationDays=30`, como todos los planes). Nada de mes calendario.

### Consumo y reglas de reserva

- **D-04:** El descuento de cada clase ocurre **al check-in** (patrón existente de `classesRemaining`, incluye no-show vía `mark-no-shows`). La **reserva valida saldo contando las reservas futuras pendientes**: con 2 reservadas no se puede comprometer una 3ª; cancelar libera el cupo comprometido.
- **D-05:** Las 2 clases son **mezclables sin restricción** entre actividades especiales (2 de la misma también vale) — literal del audio de Nacho.
- **D-06:** **Ventana de anticipación extendida para especiales**: reservable dentro del período del pase (no los +2 días estándar), para poder planificar los 2 sábados del mes. Lista de espera aplica igual que en clases regulares.
- **D-07:** **Staff bypass con aviso**: admin/gestión puede reservar manualmente una especial para alguien sin pase, viendo una advertencia confirmable (consistente con el bypass staff existente en bonus/multi-branch). El gating duro es solo para members.

### Externo: estado y alta

- **D-08:** El externo con pase queda con `userStatus = activo` — `recomputeUserStatus` **no se toca**. Distinguible por `planCategory='especial'` donde haga falta.
- **D-09:** **Referidos (v5.5) excluidos de los pases**: `planCategory='especial'` no cualifica vínculos ni recibe descuento de referidos. El descuento simétrico es de cuotas de membresía.
- **D-10:** Alta del externo = **alta normal de alumno** (o freemium self-register) + asignación del pase Externo como única suscripción. Sin flujo nuevo.
- **D-11:** **Métricas de membresía excluyen `planCategory='especial'`**: auditar los consumidores de "subs activas / miembro activo" en analytics y excluir la categoría de miembros activos, altas/bajas, renovación/churn, LTV y ticket promedio. La plata del pase SÍ cuenta en caja/cobros (ingreso real). Además, **línea propia en analíticas** con las suscripciones especiales activas separadas socio/externo — la solapa/etiqueta se llama **"Especiales" o "Planes especiales"** (nunca "pases"). El contador puede aterrizar en fase 162 junto al reporte; la exclusión de métricas es backend y pertenece a 161.

### Datos de lanzamiento

- **D-12:** **Planes por migración** con precios exactos (patrón fase 98 + regla "prod data por migraciones"). **Actividades y slots de sábado los carga Nacho por el ABM existente** (los horarios aún no están definidos; el ABM ya lo permite).
- **D-13:** La 3ª actividad se llama **"Open Gym"** (el audio decía "OpenShin" — transcripción errada).
- **D-14:** **Solo AR/ARS.** Barcelona queda afuera; si se replica algún día, se crean planes ES como cualquier plan (patrón fase 98).

### Claude's Discretion

- Nombre exacto del flag en `activities` (`requiresPass` / `isSpecial` / etc.) y del código de error tipado (estilo `PASS_REQUIRED`, siguiendo el patrón `COVERAGE_EXPIRED`).
- Cómo expresar el budget mensual explícito en el schema de planes (columna nueva vs convención), mientras respete D-03/D-04 y no rompa el derivado `ceil(durationDays/7) × classesPerWeek` de los planes existentes.
- Nombres exactos de los 2 planes (sugerencia: "Actividades con Aura — Socio" / "— Externo"; Nacho puede renombrar).
- Ubicación exacta del contador "Especiales" en analíticas (161 vs 162 lo decide el planner; la exclusión de métricas va en 161).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Fuente de negocio

- `.docs/actividades-aura/WhatsApp Ptt 2026-07-13 at 14.40.45.txt` — Audio de Nacho: las 3 actividades de sábado, actividades separadas por sede/hora con inscripción y cupo, socio +$10k por 2 asistencias/mes mezclables.
- `.docs/actividades-aura/WhatsApp Ptt 2026-07-13 at 14.42.43.txt` — Audio de Nacho: reparto a profes según asistencia real (contexto del reporte de fase 162), externos $20k/mes, "pase de dos actividades al mes".

### Planning del milestone

- `.planning/ROADMAP.md` §"v5.7 (Actividades con Aura)" — Overview con modelado decidido, constraint de migraciones (0176-0178 tomadas por v5.5; v5.6 puede reservar siguientes — verificar máximo aplicado antes de generar SQL) y dependencia 161→162.
- `.planning/REQUIREMENTS.md` — 14 REQ-IDs v5.7; esta fase cubre ACT-01..02, PASE-01..04, GATE-01..04.

### Reglas operativas del repo

- `.claude/skills/el-templo-db-migrations/SKILL.md` — Runner custom, numeración hand-written, semicolon trap, staging/prod comparten host MySQL.
- `.claude/skills/el-templo-change-control/SKILL.md` — Staging-first estricto, git add explícito, gates de aprobación.

</canonical_refs>

<code_context>

## Existing Code Insights

(Research de codebase 2026-07-14, 3 informes en sesión: clases/formatos, planes/cobros, programas.)

### Reusable Assets

- `el-templo-api/src/db/schema/activities.ts` — tabla `activities` (name, maxCapacity nullable → hereda sede): acá va el flag de gating.
- `el-templo-api/src/db/schema/subscription-plans.ts` — enums `planCategory` (agregar `especial`), precios, `durationDays`, `classesPerWeek` (quedará NULL en los pases), country/currency.
- `el-templo-api/src/db/schema/subscriptions.ts` — `classesRemaining`/`classesBudget` (el budget de 2 se setea explícito al asignar/renovar), multi-sub por categoría enforced en service layer.
- `el-templo-api/src/modules/scheduling/booking-service.ts` — `reserve()` valida en orden slot→ventana→sub→cobertura→cross-country→budget→semanal→duplicados→capacidad; el gating nuevo entra entre suscripción y capacidad. `adminAddBooking` (~:528) necesita la variante con aviso (D-07).
- `el-templo-api/src/modules/attendance/service.ts` — check-in QR/manual decrementa `classesRemaining` (~:240-253, :410-426, :695-704); acá se decide de QUÉ sub decrementar (pase vs presencial) según la actividad (D-04, GATE-02).
- `el-templo-api/src/modules/subscriptions/service.ts` — `assignPlan` (~:1397 cálculo de budget), `renewSubscription` (~:3786), `recomputeUserStatus` (~:5455, NO tocar), `getBasePrice`. Validación presencial-activo del pase Socio va en assign + renew (D-01).
- `el-templo-api/src/modules/scheduling/service.ts` — `getWeeklyGrid`/`WeeklySlotView` (~:299-319): extender con el flag para que la fase 162 pinte la grilla.
- Patrón error tipado: `COVERAGE_EXPIRED` en `scheduling/routes.ts` (~:814-820).
- Referidos: guard de cualificación/descuento en el núcleo de fase 157 — excluir `especial` (D-09).

### Established Patterns

- Seed de planes por migración con precios exactos: migración de fase 98 (12 planes ES) como referencia directa (D-12).
- Multi-sub por categoría ya existe (presencial + online, `test/subscriptions/dual-subscription.test.ts`) — el pase es una categoría más en paralelo.
- "ROM sábado" del pipeline de sesiones (fase 97, `day_modes`) es OTRO dominio — no confundir con las actividades presenciales especiales.
- Consumo en check-in, no en reserva (patrón establecido; memoria del repo: créditos se descuentan al check-in).

### Integration Points

- El gate frontend actual es todo-o-nada por `planCategory === 'presencial'` (`useUserStore.hasPresencialPlan`, member app) — la fase 162 lo refina; 161 debe dejar el backend correcto (el externo con solo pase debe poder reservar SOLO especiales — GATE-04 — aunque la UI llegue en 162).
- Tests de integración obligatorios en `el-templo-api/test/` para: gating en reserve (con/sin pase, socio/externo), validación presencial en assign/renew, budget explícito de 2, consumo correcto en check-in, no-regresión de planes existentes.

</code_context>

<specifics>
## Specific Ideas

- Ejemplo literal de Nacho para el consumo mezclable: "yo pago 10 mil pesos y puedo ir un sábado a la clase de verticales de Pato y el otro sábado del mes a la de Nico, o puedo mezclar como quiero".
- Las actividades deben existir separadas por sede+hora ("clase vertical en Moreno tal hora, acrobacias en Constitución a tal hora") — es exactamente el modelo `activities`+`schedules` existente.
- Naming visible: "Especiales" / "Planes especiales" en analíticas y superficies; "Actividades con Aura" como marca del producto.

</specifics>

<deferred>
## Deferred Ideas

- **Reparto con montos calculados por profe** (REP-F1) — la regla exacta está verde (Nacho duda entre tercios y proporcional); v5.7 entrega solo el conteo de asistencias (fase 162).
- **Compra del pase in-app con gateway** (APP-F1) — v6.0+.
- **Pases para España** — se crean como planes ES cuando exista la operación (D-14).

### Reviewed Todos (not folded)

- `v51-milestone-data-rollout.md` — match por keywords ("milestone", "plan") es falso positivo: es el rollout de datos del árbol de ejercicios v5.1, sin relación con esta fase.

</deferred>

---

_Phase: 161-Núcleo — actividades gateadas, pase mensual y enforcement_
_Context gathered: 2026-07-14_
