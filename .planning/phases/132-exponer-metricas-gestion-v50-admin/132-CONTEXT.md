# Phase 132: Exponer las 6 métricas de gestión v5.0 en el admin + limpiar deprecadas - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Exponer en el panel de Analíticas del admin las **6 métricas de gestión de v5.0** que hoy existen solo en el backend (ticket promedio, churn de no-renovación, tasa de renovación, LTV, frecuencia de asistencia, funnel de sesiones de prueba), agrupadas por tema, y **eliminar físicamente** las pantallas/cards viejas que estas métricas reemplazan. Incluye **3 extensiones acotadas de backend** necesarias para cumplir las decisiones de visualización (la fase deja de ser estrictamente frontend-only). Cierra el milestone v5.0 del lado de presentación.

**En alcance:** consumir los 6 endpoints existentes desde el frontend, renderizar las 6 métricas con sus titulares/cortes ya definidos por Nacho, las 3 extensiones de backend listadas abajo, y el borrado físico de las pantallas deprecadas.

**Fuera de alcance:** recálculo o cambios en la lógica de las métricas (el backend de cálculo ya está hecho y verificado en fases 120-123); agregación 2D dedicada turno×sucursal (se resuelve vía filtro+breakdown); pantallas operativas que las 6 nuevas NO cubren (ingresos por mes/método/sede, deuda, distribución por plan, programas, retención por ciclos).
</domain>

<decisions>
## Implementation Decisions

### Visualización de las 6 métricas (cerrado por Nacho — NO re-litigar)

Las decisiones de cómo se ve cada métrica están en el doc canónico `DECISIONES-VISUALIZACION.md`. Resumen de lo locked:

- **D-01 (Ticket):** titular doble (promedio general + promedio a precio de lista, lado a lado); desglose por plan/sucursal como detalle que se abre; % con descuento y % a $0 mostrados **separados**.
- **D-02 (Churn):** ventana titular **15 días**, con 5 y 10 como comparación; mostrar número del período **y** curva mes a mes; desglose por sucursal y plan.
- **D-03 (Renovación):** **junto al churn** en el mismo bloque; nota/aclaración al lado explicando que es "número vivo" (sube con el tiempo, no suma 100% con churn).
- **D-04 (Frecuencia):** foto general (bandas) **+** lista accionable de "enfriándose", ambas por igual; alerta de adopción de check-in baja por sede.
- **D-05 (LTV):** titular doble (meses de vida + $ por cliente); mostrar **las dos** estimaciones de meses (simple `lifetimeHeadlineMonths` + supervivencia `survivalMedianMonths`); valor proyectado **vs.** observado lado a lado.
- **D-06 (Funnel):** embudo visual clásico (3 escalones que se achican); tasa estrella grande = **cierre** (compran sobre asistieron); cortes elegibles general / sucursal / turno / turno+sucursal.

### Organización del panel (cerrado por Nacho)

- **D-07:** agrupación **por tema en 4 grupos** — Ingresos (ticket + LTV), Retención (churn + renovación), Conversión (funnel), Asistencia (frecuencia).
- **D-08:** orden por ritmo de uso — **Conversión (funnel) arriba** (uso diario); Retención + Asistencia en segunda franja (semanal); Ingresos al fondo / pestaña secundaria (solo ante problema).
- **D-09:** filtros del panel: período, sucursal, país, plan y turno. Turno solo donde el dato exista (funnel, frecuencia).

### Alcance backend (3 extensiones — decidido en esta discusión)

- **D-10 (Filtros plan/turno como ENTRADA):** agregar **filtro por plan** como parámetro de entrada a las 6 métricas (el join a plan ya existe en los breakdowns). Agregar **filtro por turno** como entrada **solo a funnel y frecuencia** (las únicas con horario de clase). Ticket/churn/renovación/LTV son por suscripción → no tienen turno. → Los endpoints hoy solo aceptan from/to, branchId, country (+window); esto extiende sus parámetros.
- **D-11 (Cruce turno×sucursal del funnel):** NO construir agregación 2D dedicada. El cruce se obtiene **vía filtro turno (D-10) + breakdown por sucursal** que ya existe. Filtrás turno=mañana y mirás el breakdown de sucursal. Cero código de agregación 2D.
- **D-12 (Contacto en lista de frecuencia):** **enriquecer el endpoint de frecuencia** (`frequency-service` / `coolingDown[]`) para que devuelva **nombre y teléfono** junto al `userId`. Una sola llamada, datos listos para exportar/llamar. El teléfono ya está en `users`.

### Lista accionable de frecuencia (decidido en esta discusión)

- **D-13:** click en fila: el **nombre abre el perfil** del miembro (navegación existente del admin); el **teléfono es link tel:/llamar** directo. Cubre las dos intenciones.
- **D-14:** export en **CSV**, consistente con el reporte de sesiones de prueba existente (módulo Reportes, fase 114).

### Borrado de pantallas viejas (decidido en esta discusión — criterio Nacho: "nada duplicado")

Borrados **confirmados** (los reemplazan directo las 6 nuevas):

- **D-15:** borrar las cards **Renovación (7/14/30 días)** en `MiembrosTab.vue` (las reemplaza la nueva Tasa de renovación). Borrar también la llamada `getMemberAnalytics`/`renewalRate` legacy si queda huérfana.
- **D-16:** borrar la card **ARPU mensual** en `FinanzasAvanzadasTab.vue` (la reemplaza el nuevo Ticket promedio). **Conservar** el chart "Caja vs Devengado" de ese mismo tab.
- **D-17:** borrar **FunnelTab.vue** completo (funnel fase 118 freemium→prueba→activo, hoy "coming soon") + su `<q-tab>`/`<q-tab-panel>` y estado/fetch en `AnaliticasPage.vue`. Lo reemplaza el nuevo Funnel de sesiones de prueba (reservó→asistió→compró).
- **D-18:** borrar la card simple **"Tasa de retención"** en `MiembrosTab.vue` (se duplica con churn+renovación nuevos).
- **D-19 — CANCELADO (2026-06-05, premisa falsa).** NO borrar `AsistenciaTab.vue`. La premisa original ("huérfano / nunca renderizado") es incorrecta: el archivo está **vivo**, importado y renderizado en `ReportesPage.vue` (import L757, render L193) como el tab de Asistencia que la **fase 117 movió a Reportes**. También referenciado en `chart-colors.ts`. Conservar tal cual; borrarlo rompería ReportesPage. Verificado por grep + decisión de Nacho.

Borrados **descartados** (se conservan — las 6 nuevas NO los cubren):

- **D-20:** **conservar RetencionTab.vue** (curvas de retención por ciclo de plan) — responde otra pregunta ("hasta qué ciclo llega cada cohorte") que ninguna de las 6 nuevas reemplaza. No es "duplicado".
- **D-21:** conservar todo `FinanzasTab.vue` (ingresos por mes/método/sede, deuda), Programas (inscripciones), "Caja vs Devengado", y de `MiembrosTab` los counts operativos (Nuevos, Bajas, Nuevos vs Bajas, Distribución por plan, lista "requieren atención").

### Claude's Discretion

- Estructura concreta de tabs/componentes Vue nuevos (cómo se materializan los 4 grupos temáticos en `AnaliticasPage.vue`) — patrón a definir en planning siguiendo el patrón de tabs existente.
- Tipos TS en `types/analytics.ts` que reflejen los output shapes de los 6 endpoints.
- Si el filtro por plan se implementa como query param uniforme en los 6 servicios o vía helper compartido — decisión de planner.
  </decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Decisiones de visualización (LO MÁS IMPORTANTE — define cómo se ve cada métrica)

- `.planning/phases/132-exponer-metricas-gestion-v50-admin/DECISIONES-VISUALIZACION.md` — respuestas de Nacho: titulares, cortes, agrupación 4 temas, orden del panel, filtros, criterio de borrado. Incluye sección "Implicancias de alcance" que origina las 3 extensiones de backend.
- `.planning/phases/132-exponer-metricas-gestion-v50-admin/BRIEFING-DISCUSION.md` — briefing de negocio que explica qué calcula cada métrica (contexto, no requisito).

### Especificación de cálculo backend (qué devuelve cada endpoint)

- `ESPECIFICACION-METRICAS-GESTION.md` (raíz del repo) — spec de cálculo de las 6 métricas.
- `el-templo-api/src/modules/analytics/routes.ts` — endpoints `/admin/analytics/{ticket,churn,renewal,ltv,frequency,trial-funnel}` y sus query params actuales.
- `el-templo-api/src/modules/analytics/ticket-service.ts`, `churn-service.ts`, `renewal-service.ts`, `ltv-service.ts`, `frequency-service.ts`, `trial-funnel-service.ts` — output shapes que el frontend debe tipar y consumir; los 3 que se extienden (D-10/D-12).

### Roadmap

- `.planning/ROADMAP.md` §"v5.2 Phase Details → Phase 132" — goal y success criteria de la fase.
  </canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `el-templo-admin/src/pages/AnaliticasPage.vue` — página de Analíticas con patrón de tabs (`<q-tab>`/`<q-tab-panel>`); los 4 grupos temáticos nuevos se montan acá. Hoy define tabs Miembros/Finanzas/Programas/Funnel/Retención.
- `el-templo-admin/src/composables/useAnalyticsApi.ts` — composable de llamadas a la API de analytics; faltan los 6 métodos (`getTicket`, `getChurn`, `getRenewal`, `getLtv`, `getFrequency`, `getTrialFunnel`).
- `el-templo-admin/src/types/analytics.ts` — interfaces TS de analytics (hoy solo fases 117-118); agregar las de los 6 endpoints.
- `el-templo-admin/src/components/analytics/*` — componentes tab existentes como referencia de estilo (cards, charts con la lib actual).
- Reporte de sesiones de prueba (módulo Reportes, fase 114) — patrón de **export CSV** existente a reusar para D-14.

### Established Patterns

- Scope país/sucursal del backend (`applyScope` / `country-scope.ts`) — ya aplicado en los 6 endpoints; el frontend solo pasa los filtros. Los endpoints respetan roles admin.
- Aislamiento de moneda ARS/EUR (los outputs vienen por moneda separada) — los componentes nuevos deben respetarlo (nunca sumar monedas).
- Charts: usar la misma librería/wrapper que los tabs actuales de Analíticas.

### Integration Points

- Frontend admin → 6 endpoints `/admin/analytics/*` (consumo nuevo).
- Backend: extender query params de los 6 servicios (filtro plan) + funnel/frecuencia (filtro turno) + enriquecer `frequency-service` con nombre/teléfono desde `users`.
- `AnaliticasPage.vue`: alta de 4 grupos temáticos + baja de FunnelTab y cards deprecadas (D-15 a D-19).
  </code_context>

<specifics>
## Specific Ideas

- El cruce turno×sucursal del funnel se resuelve por composición (filtro + breakdown), no por código nuevo de agregación — preferencia explícita por menos código (D-11).
- La lista de "enfriándose" es la pieza accionable central de Frecuencia: nombre→perfil + tel→llamar + export CSV, pensada para que recepción trabaje la lista (D-13/D-14).
- Las decisiones de Nacho son la fuente de verdad de UI; el `discuss` solo resolvió alcance backend, borrado y formato de lista — no re-litigar titulares ni agrupación.
  </specifics>

<deferred>
## Deferred Ideas

- **Agregación 2D dedicada turno×sucursal** en el funnel (cruce real en el servicio) — descartada para esta fase (se logra vía filtro+breakdown). Si en el futuro se necesita el cruce sin filtrar, sería su propio trabajo.
- **Identificación de pantallas a dar de baja más allá de las mapeadas** — el mapa de borrado (D-15 a D-21) cubre lo conocido; si en implementación aparece otra duplicación, evaluarla contra el criterio "nada duplicado".
  </deferred>

---

_Phase: 132-exponer-metricas-gestion-v50-admin_
_Context gathered: 2026-06-05_
