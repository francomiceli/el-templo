# Fase 132 — Decisiones de visualización (input de Nacho)

> Respuestas de Nacho al briefing (`BRIEFING-DISCUSION.md`). Definen cómo se ven las 6 métricas en el panel. Este doc es el **input de diseño** para el `discuss-phase` / `plan-phase`. Al final, sección de **implicancias de alcance** que cruza cada decisión contra lo que los endpoints devuelven hoy.

## Por métrica

### 1. Ticket promedio

- **Titular:** promedio general **+** promedio a precio de lista, lado a lado.
- **Desglose por plan y sucursal:** detalle que se abre al tocar (no siempre visible).
- **% con descuento / % a $0:** sí, mostrados **separados** (a $0 por un lado, con descuento por otro). La estrategia se apoya en descuentos → interesa verlos distintos.

### 2. Churn de no-renovación

- **Ventana titular:** 15 días. Mostrar también 5 y 10 como lecturas prematuras / comparación.
- **Vista:** las dos — un número del período **y** la curva mes a mes.
- **Desglose:** sí, por sucursal y por plan (qué sede / plan pierde más gente).

### 3. Tasa de renovación

- **Junto al churn**, en el mismo bloque (dos caras de lo mismo).
- **"Número vivo"** (sube con el tiempo): con una nota/aclaración al lado que lo explique.

### 4. Frecuencia de asistencia

- **Foco:** las dos por igual — foto general (bandas) **+** lista de gente para contactar.
- **Lista de "enfriándose":** clickeable **y exportable** (para que recepción los llame).
- **Alerta de adopción de check-in:** sí, alertar cuando una sede escanea poco y sus datos son flojos.

### 5. LTV / Vida del cliente

- **Titular:** los dos lado a lado — meses de vida **+** $ por cliente.
- **Estimaciones de meses:** las dos — la simple (a partir del churn) y la fina (supervivencia).
- **Valor en plata:** proyectado **vs.** real (observado), lado a lado.

### 6. Funnel de sesiones de prueba

- **Formato:** embudo visual clásico (tres escalones que se achican).
- **Tasa estrella (grande):** la de **cierre** — % que compra sobre los que asistieron.
- **Cortes:** vista elegible — general, solo sucursal, solo turno, **o turno + sucursal combinados**.

## Decisiones transversales

- **Agrupación por tema (4 grupos):**
  - **Ingresos:** ticket + LTV
  - **Retención:** churn + renovación
  - **Conversión:** funnel
  - **Asistencia:** frecuencia
- **Filtros que se usan de verdad:** período, sucursal, país, plan y **turno** (mañana/tarde). El turno se habilita donde el dato exista (funnel, frecuencia, asistencia).
- **Limpieza:** eliminar las pantallas viejas que estas métricas reemplazan (ARPU viejo, renovación/retención vieja, churn viejo). El equipo identifica cuáles dar de baja. **Criterio rector: nada de info duplicada.**

## Mapa del panel (ritmo de uso → orden)

| Ritmo de uso       | Métricas                           |
| ------------------ | ---------------------------------- |
| Diaria (portada)   | Funnel de prueba                   |
| Semanal (repaso)   | Renovación · Churn                 |
| Solo ante problema | Frecuencia · LTV · Ticket promedio |

**Orden de secciones resultante:**

1. **Conversión (Funnel)** → arriba de todo (uso diario).
2. **Retención (Churn + Renovación)** y **Asistencia (Frecuencia)** → segunda franja (uso semanal).
3. **Ingresos (Ticket + LTV)** → más al fondo / pestaña secundaria (solo ante problema).

---

## Implicancias de alcance (verificar en `discuss-phase` / `plan-phase`)

La fase 132 se definió en el roadmap como **frontend-only, sin migraciones**. La mayoría de las decisiones encajan con lo que los endpoints ya devuelven, **pero tres empujan el alcance hacia el backend**. Confirmar antes de planificar:

1. **Filtro global por `plan` y por `turno` como ENTRADA.** Hoy los endpoints aceptan como parámetros de entrada: rango de fechas, `branchId`, `country` (y `window` en churn/renewal/ltv/funnel). **No aceptan `planId` ni `turno` como filtro de entrada** — el plan/turno aparecen solo como _breakdowns de salida_ en algunos endpoints. Para que "plan" y "turno" funcionen como **filtros globales del panel**, hay que **extender los endpoints**. → No es frontend-only.

2. **Funnel: corte "turno + sucursal combinados".** El backend devuelve breakdowns de **un eje a la vez** (sucursal, país, turno, plan-comprado por separado). El cruce de **dos dimensiones** (turno × sucursal) **no existe hoy** → requiere extensión del `trial-funnel-service`.

3. **Frecuencia: lista "enfriándose" exportable para llamar.** `coolingDown[]` trae `userId`, banda actual/previa y % de variación — **no nombre ni teléfono**. Para una lista accionable/exportable que recepción use, hay que **enriquecer el endpoint** (o resolver nombre/teléfono en el frontend con otra llamada).

**Lo que SÍ encaja sin tocar backend** (ya viene en el output): titular doble de ticket (`global` + cohorte `listPrice`), % descuento y % $0 separados, churn 5/10/15 + serie mensual + breakdowns sucursal/plan, renovación con mismo denominador, bandas + adopción de check-in de frecuencia, LTV doble estimación (`lifetimeHeadlineMonths` + `survivalMedianMonths`) y monetario `projected`/`observed`, embudo del funnel con `tasaCierre` de titular.

**Decisión pendiente para Franco:** ¿la fase 132 absorbe estas 3 extensiones de backend (deja de ser frontend-only), o se acotan/difieren (ej. plan/turno como filtro solo donde ya esté soportado, cruce turno×sucursal a una fase posterior)?
