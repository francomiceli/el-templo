# Propuestas de ampliación — Módulo de Analíticas

> Documento para el agente de planning de la próxima fase de código.
> Contexto previo: `FINDINGS.md` (bugs de origen) + documento descriptivo del estado
> actual del módulo + feature ya comprometida de **miembros únicos 7/14/30 días** en
> la tab de Asistencias (Fase 117).
>
> Estas 5 propuestas amplían el panel hacia métricas que el equipo realmente usa para
> decidir: conversión de pruebas, renovaciones, seguimiento de activos y salud
> financiera. Ordenadas por impacto operativo.

---

## 1. Funnel de conversión `freemium → prueba → activo` con tiempos por etapa

**Por qué.** Hoy `newMembers` mete a todos los registros nuevos en la misma bolsa
(freemium + prueba + activo), entonces no se puede ver dónde se cae el embudo. Es la
métrica que más falta para decidir si el problema está en marketing (no llegan
pruebas), en la clase de prueba (no convierten), o en el onboarding (convierten pero
churnean rápido).

**Qué calcular.**

- Cohorte por mes de alta (`users.created_at`).
- Para cada cohorte:
  - % que pasó a `prueba`.
  - % que pasó a `activo`.
  - Mediana de días entre `freemium → prueba` y entre `prueba → activo`.
- Corte por sede y por país.

**Fuente.** Necesita historial de cambios de `users.status`. Si no existe tabla de
auditoría hoy, agregar `user_status_history` (cambio de modelo — el agente de
planning debe contemplarlo como migración). Mientras tanto se puede aproximar el
paso a `activo` con la primera `subscriptions.created_at` del usuario.

**Acciona qué.**

- Mati ve por sede qué instructor convierte mejor pruebas.
- Vista global: comparar conversión Barcelona vs MDP.
- Marketing detecta si los freemium se quedan freemium para siempre (señal de que
  el flujo de invitación a clase de prueba no funciona).

---

## 2. Retención por cohorte basada en **ciclos de plan** (no en meses calendario)

**Por qué.** El `retentionRate` actual es engañoso: un mes sin vencimientos da 100%.
No dice si los que entraron en enero siguen estando en mayo. Además, una curva
clásica de retención por mes calendario no funciona con planes de 120/240 días: un
plan de 8 meses no "renueva" mes a mes, renueva al vencimiento.

**Solución: cohortes por ciclos de plan.** Para cada miembro, el ciclo 1 es su
primera sub, ciclo 2 es la siguiente sub consecutiva, etc. El eje X de la curva pasa
a ser "ciclo N" en vez de "mes N". Esto unifica la lectura entre planes cortos y
largos: un usuario de plan anual en ciclo 3 lleva 2 años, uno de mensual en ciclo 3
lleva 3 meses, pero ambos dicen lo mismo: "aguantó tres renovaciones".

**Qué calcular.**

- **Vista principal — Retención por ciclos.** Cohorte = mes de **primera
  suscripción activa** (no `created_at`, porque eso incluye freemium). Para cada
  cohorte: % que llegó al ciclo 2, ciclo 3, ciclo 4...
- **Vista secundaria — Por categoría de plan.** Misma curva pero filtrable por
  `plan_category` (presencial / online_regular / online_goal / online_coach) o por
  bucket de duración (30 / 120 / 240 días), para responder preguntas tipo "¿los de
  240 días renuevan más que los de 30?".
- **Métrica derivada — Distribución de ciclos completados.** % de los activos
  actuales que está en ciclo 1 vs ciclo 2 vs ciclo 3+. Es proxy directo de madurez
  de la base: si el 80% está en ciclo 1, sos un negocio que captura y pierde; si
  hay masa en ciclo 3+, tenés una base leal.

**Definición de "ciclo consecutivo".** Dos subs del mismo miembro cuentan como
ciclos consecutivos si el gap entre `end_date` de una y `start_date` de la siguiente
es ≤ **30 días**. Más que eso ya es reactivación, no renovación. (Decisión de
producto a confirmar; el valor debería ser configurable.)

**Acciona qué.**

- Te dice si el problema está en el **ciclo 2** (onboarding falla) o en el **ciclo
  6** (fatiga). Son acciones distintas: contenido de onboarding vs gamificación /
  cambio de rutina.
- La distribución de ciclos es la métrica de "salud de base" que hoy no existe.

---

## 3. Engagement real ("activo que efectivamente viene") + ratio de adopción de check-in

Esto fusiona dos cosas que ganan mucho juntas.

### Parte A — Engagement real

Para cada miembro `status='activo'`: cuántos check-ins en últimos 7 / 14 / 30 días.
Derivar tres segmentos accionables:

- **Engaged** — ≥ 2 visitas en últimos 7 días.
- **At risk** — 0 visitas en últimos 14 días pero sub vigente.
- **Ghost** — 0 visitas en últimos 30 días pero sub vigente.

Esto se publica como **lista nominal** (no solo número), igual que `attentionList`.
El equipo puede llamar/escribir a los "ghost" antes de que no renueven.

### Parte B — Calidad del dato de check-in por sede

Por sede, ratio = `bookings confirmados con check-in registrado` ÷ `total bookings
confirmados`. Si Chapadmalal da 5% y Moreno 85%, el panel expone el problema
operativo (no el engagement). Sin esta métrica de "calidad", toda la Parte A miente
para Chapadmalal.

### Reglas de presentación

- La Parte A solo es confiable para sedes con Parte B alta.
- El frontend tiene que mostrar un **warning visual** cuando se filtra por una sede
  con baja adopción de check-in (umbral inicial sugerido: <50%).
- Esto es **representatividad honesta** > número bonito.

**Acciona qué.**

- Mati tiene lista semanal de "activos que se van a ir si nadie los toca".
- Vos tenés tablero de qué sedes no operan el check-in y se los podés exigir como
  estándar operativo, no como sugerencia.

---

## 4. Caja vs Devengado (revenue honesto para planes largos)

**Por qué.** Hoy `monthlyRevenue` = lo cargado en el ledger ese mes. Un plan de 8
meses que se pagó en marzo aporta TODO en marzo y cero en abril–octubre. Esto
distorsiona cualquier comparación mes a mes y subestima la salud financiera de los
meses posteriores. Para una cadena que vende planes de 30 / 120 / 240 días el
problema no es teórico, es estructural.

**Qué calcular.**

- **Caja del mes** — lo que ya calcula `revenueTrend` (mantener, es útil para
  tesorería: cuánta plata entró efectivamente).
- **Ingreso devengado del mes** — para cada `subscription` activa en el mes,
  prorratear `price_paid / duration_days × días_de_la_sub_dentro_del_mes`. Sumar
  por mes.
- Mostrar **ambas series superpuestas** en el mismo gráfico. La diferencia visual
  es el efecto "prepago largo".

**Restricción dura.** Separado por moneda siempre (ARS / EUR nunca sumadas, como
ya hace `outstandingByCurrency`). Aplicar el mismo patrón a los helpers de revenue
existentes resuelve de paso el bug #3 de `FINDINGS.md`.

**Bonus — ARPU real.** Una vez que está el devengado, calcular **ARPU mensual** =
`ingreso devengado del mes` ÷ `activos del mes`. Es la métrica de salud unitaria que
hoy no existe y que dice si la base crece por volumen o por valor.

**Acciona qué.**

- Tesorería usa la curva de caja (lo de siempre).
- Decisiones de negocio (¿estamos creciendo? ¿bajó el ticket?) usan devengado +
  ARPU. Hoy mirar solo caja para esas decisiones es mirar mal.

---

## 5. Panel de Vencimientos y Renovaciones (completar `attentionList`)

**Por qué.** El tipo `attentionList` en `types.ts` ya prevé "vencidos/en mora" pero
solo está implementado el caso "expiring", y `daysOverdue` queda siempre `null`. Es
la lista de trabajo del equipo de recepción día a día y hoy está a medias.

**Qué agregar.**

- **Vencidos sin renovar** — sub vencida hace 1–7, 8–14, 15–30 días, con
  `daysOverdue` real (no `null`). Tres buckets porque la acción es distinta:
  recordatorio amable / llamada / oferta de reactivación.
- **Renovaciones de la semana** — con flag de estado: `ya pagó` / `no pagó` / `habló
con coach`. (Si los flags no existen como campos, hay que evaluar agregarlos o
  derivarlos de transacciones recientes.)
- **Tasa de renovación 7/14/30 días** — de los que vencieron hace N días, qué %
  renovó. Esta es la métrica de retención **operativa** (complementa la curva de
  cohortes del punto 2, que es estratégica).

**Cruce con punto 3 (importante).** Para cada miembro en "por vencer esta semana"
mostrar también su **segmento de engagement** (engaged / at risk / ghost). Un
"ghost por vencer" tiene ~90% de probabilidad de no renovar y se prioriza distinto
que un "engaged por vencer" que probablemente renueva solo. Esto convierte la
lista de un volcado de datos en una **lista priorizada de acción**.

**Acciona qué.**

- Es literalmente la worklist semanal de Mati y recepción. Hoy esa lista la arman
  a mano o no la arman.
- La priorización por engagement evita malgastar contactos en gente que iba a
  renovar igual y concentra esfuerzo donde hay riesgo real.

---

## Notas transversales para el agente de implementación

Tres cosas que valen para varias de las propuestas y conviene tener resueltas antes:

### Predicado canónico de "activo"

Tiene que estar centralizado (helper SQL o vista compartida) antes de implementar
cualquiera de estas 5 propuestas, porque todas lo usan. Esto resuelve de paso los
hallazgos #1 y #5 de `FINDINGS.md`. Decisión de producto pendiente: si el
predicado canónico incluye o excluye los ~48 miembros con drift de `users.status`
(probablemente excluirlos = mostrar el número real).

### Scope branch/país y moneda

Todas las métricas nominales (puntos 3A y 5) tienen que respetar el modelo de scope
(owner global / admin-país / coach-recepción-sedes) igual que `attentionList`
actual. Para owner, las listas pueden cruzar país pero el corte debe quedar
visualmente claro. Las métricas monetarias **nunca suman ARS + EUR** en un mismo
número (regla ya vigente en `outstandingByCurrency`, hay que extenderla a todo el
módulo financiero).

### Tests de integración

Obligatorios para cada métrica nueva, contra MySQL real. El bug de `'confirmed'`
vs `'confirmado'` (#2 de FINDINGS) sobrevivió porque no había test de no-show con
datos reales — no repetir el patrón.
