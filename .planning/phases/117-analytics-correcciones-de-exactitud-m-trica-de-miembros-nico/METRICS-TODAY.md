# Cómo funcionan las analíticas HOY (estado actual)

> Propósito: documento descriptivo del estado actual del módulo de analíticas, para
> que otro agente lo lea y **aporte ideas** para tener métricas más representativas y
> útiles para el flujo de trabajo real del gimnasio.
>
> Esto NO es la lista de bugs (esa está en `FINDINGS.md`). Acá se describe qué calcula
> cada métrica, con qué fuente y qué fórmula, y dónde NO refleja bien la operación real.
>
> Fuente: `el-templo-api/src/modules/analytics/` (service.ts, routes.ts, schemas.ts, types.ts).
> Frontend consumidor: `el-templo-admin` (panel de analíticas, tabs KPI / Miembros / Asistencias / Finanzas).

---

## 0. Contexto de dominio (necesario para evaluar representatividad)

**El negocio.** Cadena de gimnasios de calistenia con múltiples sedes (AR: Moreno, Alem,
Constitución, Jujuy, Mogotes, Chapadmalal; ES: Barcelona) + una sede virtual "Templo Online".
~6.150 miembros, ~749 con `status='activo'`.

**Ciclo de vida del miembro** (`users.status`, enum):
`freemium` (auto-registro app) → `prueba` (lead con clase de prueba) → `activo` (con suscripción
vigente) → `inactivo` (sub vencida/cancelada). Staff = `status` NULL.

**Modelos de plan** (`subscription_plans.plan_category`): `presencial`, `online_regular`,
`online_goal`, `online_coach`. Duraciones reales: 30 / 120 / 240 días (mensual, 4 meses, 8 meses).
Planes legacy archivados (`is_archived=1`) conviven con los vigentes.

**Modelo de scope (Phase 110)** — clave para entender los filtros de toda métrica:

- `owner`: acceso global. En analytics `scope.country = null` → **sin filtro de país → agrega TODO (AR+ES, ARS+EUR)**.
- `admin`/`gestion`: alcance por país (`users.country`) → `scope.country` = "AR" o "ES".
- `coach`/`recepción`: alcance por sedes (`user_branches`).
- El frontend puede pasar `branchId` opcional (validado por `requireBranchAccess`).

**Fechas de inicio de cada fuente de datos (CRÍTICO para series temporales):**
| Fuente | Datos confiables desde | Nota |
|---|---|---|
| `attendance` (check-in) | **2026-03-18** | Antes no existía el sistema QR/manual. |
| `financial_transactions` (ledger) | **abril 2026** (v4.8) | Antes no había registro transaccional. |
| `subscriptions.price_paid` | **abril 2026** | Subs legacy importadas con `price_paid=0`. |
| `users.created_at` | histórico completo | — |

> Implicancia: cualquier "tendencia" o "trend" que cruce el límite de marzo/abril 2026
> muestra un acantilado artificial (0 → valores reales), no un cambio de negocio.

**Zona horaria:** los timestamps se guardan en **UTC**; el gimnasio opera en **ART (UTC-3)**
(y Barcelona en CET). Las funciones `HOUR()` / `DATE()` de las queries operan sobre UTC →
las métricas por hora/día pueden estar corridas respecto a la hora local real.

**Refresco:** NO hay caché ni tablas de snapshot. Cada request recalcula todo en vivo con
queries de agregación. No hay histórico de métricas (los KPIs "punto en el tiempo" no se
pueden reconstruir hacia atrás).

---

## 1. Endpoint `GET /analytics` — KPIs (tab principal)

`getKpis()` → 3 KPIs con tendencia vs período anterior de igual largo. Rango por defecto: **mes actual**.

### 1.1 `activeMembers`

- **Qué muestra:** cantidad de miembros activos (número grande del panel).
- **Cómo:** `COUNT(*)` de `users WHERE role='member' AND status='activo'` (+ scope branch/país).
- **Fuente:** campo `users.status` (estado guardado, NO recalculado en vivo).
- **Trend:** _estimado_, no medido: `prior = actual − altas_del_período + bajas_del_período`.
- **Representatividad:** es un conteo de estado comercial, no de actividad real. Un miembro
  "activo" puede no pisar el gym hace meses. (Ver §3 para la señal de asistencia real.)

### 1.2 `monthlyRevenue`

- **Qué muestra:** ingreso del período.
- **Cómo:** `SUM(amount)` de `financial_transactions` con `voided_at IS NULL`,
  `kind IN ('plan_charge','debt_settlement')`, `direction='inflow'`, `transaction_date` en rango.
- **Scope:** por `users.branch_id` (del miembro) y `branches.country`.
- **Representatividad:** solo refleja lo cargado en el ledger nuevo (abril 2026+). No incluye
  cobros del sistema viejo ni planes largos prepagos (que se pagaron una vez fuera del ledger).

### 1.3 `dailyAttendanceAvg`

- **Qué muestra:** promedio de check-ins por día en el período.
- **Cómo:** `COUNT(*)` de `attendance` (checkedInAt en rango) ÷ cantidad de días del rango.
- **Representatividad:** depende 100% de que las sedes **pasen lista**. Sedes que no usan el
  check-in (ej. Chapadmalal) subreportan → el promedio mezcla "poca gente" con "no se registró".

---

## 2. Endpoint `GET /analytics/members` — Miembros

`getMemberAnalytics()`.

### 2.1 `newMembers`

- `COUNT(*)` de `users role='member'` con `created_at` en rango.
- **Incluye TODOS los estados** (freemium + prueba + activo). Es "registros nuevos", no "altas de pago".

### 2.2 `churnedMembers`

- `COUNT(*)` de `subscriptions status='cancelled'` con `updated_at` en rango.
- Cuenta cancelaciones por `updated_at` (no por fecha de baja efectiva); una sub editada puede contar.

### 2.3 `retentionRate`

- Universo: usuarios distintos cuya sub tiene `end_date` dentro del rango ("vencieron en el período").
- Retenidos: los que además tienen OTRA sub `active/paused` (id distinto).
- `rate = retenidos / vencidos × 100`. Si no vence ninguna → devuelve 100%.
- **Representatividad:** un mes sin vencimientos da 100% (puede engañar). No distingue renovación
  inmediata de reactivación tardía.

### 2.4 `planDistribution`

- Subs `active/paused` agrupadas por `subscription_plans.name`.
- **No filtra `is_archived`** (planes legacy contaminan) y agrupa por nombre no único
  (AR "Flex" + ES "Flex" se fusionan en vista global).

### 2.5 `attentionList`

- "Por vencer": subs `active` con `end_date` entre hoy y +7 días (limit 10, ordenado por urgencia).
- Solo implementa el tipo "expiring"; el campo `daysOverdue` queda siempre `null` (no hay lista de
  "vencidos/en mora" pese a que el tipo existe en `types.ts`).

---

## 3. Endpoint `GET /analytics/attendance` — Asistencias

`getAttendanceAnalytics()`. Esta es la tab donde se va a sumar **miembros únicos 7/14/30 días** (fase 117).

### 3.1 `dailyCheckins`

- Serie diaria: `COUNT(*)` de `attendance` por `DATE(checked_in_at)` en rango.
- Cuenta check-ins (eventos), no personas: alguien que va 5 veces aporta 5.

### 3.2 `peakHoursHeatmap`

- Mapa de calor (díaSemana × hora). `COUNT(*)` por `(DAYOFWEEK, HOUR)` ÷ semanas del período,
  normalizado por capacidad de sede (`branches.max_capacity`, default 22) → % de ocupación.
- **Hora en UTC** (ver §0): los picos pueden estar corridos respecto a la hora local.
- Sin `branchId` usa capacidad default 22 (no la real de cada sede) → ocupación poco fiable en agregado.

### 3.3 `slotOccupancy`

- Por horario fijo (`schedules` activos): promedio de **reservas** (`bookings` en
  `reservado/qr_escaneado/confirmado`) por semana ÷ capacidad.
- Mide **reservas**, no asistencia real (un slot lleno de reservas con muchos no-show parece sano).

### 3.4 `noShowRate`

- Intención: `no_show / (confirmados + no_show)`.
- (Estado real del cálculo documentado en `FINDINGS.md` #2.)

---

## 4. Endpoint `GET /analytics/financial` — Finanzas

`getFinancialAnalytics()`. Fuente principal: `financial_transactions` (ledger abril 2026+).

### 4.1 `revenueTrend`

- Ingreso mensual: `SUM(amount)` por `DATE_FORMAT(transaction_date,'%Y-%m')`, mismos filtros
  que §1.2 (`plan_charge` + `debt_settlement`, inflow, no anulado).

### 4.2 `revenueByMethod`

- Desglose `cash` / `transfer` / `card`. **Excluye** `aura_credit` e `internal`
  (no aparecen en el desglose aunque sumen al total de otras vistas).

### 4.3 `revenueByBranch`

- `SUM(amount)` por `financial_transactions.branch_id` (sede donde se registró el cobro,
  que puede diferir de la sede personal del miembro).

### 4.4 `outstandingByCurrency`

- Deuda pendiente "a hoy": `SUM(amount)` de `balances WHERE amount > 0`, **separado por moneda**
  (ARS/EUR, nunca sumadas). Filtro branch/país vía join a `subscriptions` (excluye filas
  `target_kind='debt_balance'` cuando hay filtro). Es la única métrica que maneja moneda bien.

> Nota transversal de moneda: salvo `outstandingByCurrency`, los helpers de revenue no separan
> moneda (ver `FINDINGS.md` #3). Relevante para evaluar qué significa "ingreso total".

---

## 5. Resumen de fuentes por métrica

| Métrica                                          | Tabla(s) fuente                         | Tipo            | Ventana            |
| ------------------------------------------------ | --------------------------------------- | --------------- | ------------------ |
| activeMembers                                    | `users.status`                          | estado guardado | punto en el tiempo |
| monthlyRevenue                                   | `financial_transactions`                | evento          | rango (mes)        |
| dailyAttendanceAvg                               | `attendance`                            | evento          | rango              |
| newMembers                                       | `users.created_at`                      | evento          | rango              |
| churnedMembers                                   | `subscriptions` (cancelled)             | evento          | rango              |
| retentionRate                                    | `subscriptions` (end_date)              | derivada        | rango              |
| planDistribution                                 | `subscriptions` + `subscription_plans`  | snapshot        | punto en el tiempo |
| attentionList                                    | `subscriptions` (expiring)              | derivada        | próximos 7 días    |
| dailyCheckins / heatmap / slotOccupancy / noShow | `attendance` / `bookings` / `schedules` | evento          | rango              |
| revenue\*                                        | `financial_transactions`                | evento          | rango              |
| outstandingByCurrency                            | `balances`                              | snapshot        | punto en el tiempo |

---

## 6. Para el otro agente — preguntas que disparan ideas

Pensar en **representatividad** (¿la métrica dice lo que el dueño cree que dice?) y en
**utilidad para el flujo de trabajo** (¿gatilla una acción concreta del equipo?). Algunos disparadores:

1. **"Activo" comercial vs "activo" real.** Hoy `activeMembers` = tiene sub vigente. ¿Conviene una
   métrica paralela de "activos que asistieron en los últimos N días" (engagement real)? ¿Cómo se
   muestran juntos sin confundir? (La feature de miembros únicos 7/14/30 es un primer paso.)

2. **Miembros únicos vs check-ins.** `dailyCheckins` cuenta eventos. ¿Qué ventanas y cortes de
   "personas distintas" sirven para decisiones (semanal por sede, frecuencia de visita, % de la
   base activa que efectivamente viene)?

3. **Adopción del check-in como métrica en sí.** Hay sedes que no pasan lista → toda métrica de
   asistencia subreporta. ¿Vale una métrica de "calidad del dato" (reservas con vs sin check-in por
   sede) para que el panel exponga el problema operativo, no solo el engagement?

4. **Cohortes y retención real.** La retención actual es "renovó/venció en el mes". ¿Sirve más una
   curva de retención por cohorte de alta? ¿Conversión freemium→prueba→activo con tiempos?

5. **Dinero: comprometido vs cobrado.** Hoy revenue = lo cargado en el ledger. ¿Falta distinguir
   ingreso devengado (planes largos prorrateados) vs caja del mes? ¿Mora real (deuda vencida) vs
   saldo pendiente?

6. **Vistas accionables para el equipo.** ¿Qué listas nominales (no solo números) ayudan al día a
   día? Ej: "activos que no vienen hace 14 días", "mensuales sin pago registrado este ciclo",
   "vencen esta semana". El `attentionList` ya existe pero solo cubre "por vencer".

7. **Segmentación que importa.** Presencial vs online, por sede, por tier de plan, AR vs ES (moneda).
   ¿Qué cortes faltan para que cada responsable vea lo suyo?

8. **Tendencias honestas.** Dado el acantilado de datos (marzo/abril 2026), ¿cómo presentar series
   sin que parezca crecimiento explosivo artificial? ¿Marcar el inicio de cada fuente?

> Restricción de implementación: respetar el modelo de scope (owner global / admin-país /
> coach-recepción-sedes), separar siempre por moneda, y no sumar entre monedas. Flujo staging-first.
> Tests de integración obligatorios para métricas nuevas.
