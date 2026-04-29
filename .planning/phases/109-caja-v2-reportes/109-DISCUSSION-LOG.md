# Phase 109: Caja v2 + Reportes - Discussion Log

> **Audit trail only.** Decisiones canónicas en CONTEXT.md.

**Date:** 2026-04-28
**Phase:** 109-caja-v2-reportes
**Areas discussed:** Naming reporte aging, ubicación + scope reporte Deudas, estructura UI, multi-currency, paginación, endpoint, RBAC, segmentación CajaPage por kind, filtros + tabla, Excel exports

---

## Naming del reporte de aging

| Option                                                  | Selected |
| ------------------------------------------------------- | -------- |
| "Aging deudas" (jerga financiera importada del inglés)  |          |
| "Antigüedad de deudas" (literal traducción)             |          |
| **"Deudas"** (simple, directo, sin jerga) (Recomendado) | ✓        |

**Frase del usuario:** "como 'aging deudas'? tiene que estar en español, ni siquiera se que es aging" → "no se que es" → "puede ser simplemente deudas?". Decisión: naming UI = "Deudas".

**Constraint adicional locked:** "por favor asegurá que lo de aging sea un nombre interno y nunca aparezca en u[i]". → D-01: aging es solo naming interno (código, paths, variables). UI siempre en español.

---

## Ubicación del reporte Deudas

| Option                                                                | Selected |
| --------------------------------------------------------------------- | -------- |
| Sección nueva en `ReportesPage` existente (5to reporte) (Recomendado) | ✓        |
| Página dedicada `/admin/reportes/deudas`                              |          |
| Tab nuevo dentro de CajaPage                                          |          |

---

## Scope del reporte

| Option                                                                                        | Selected |
| --------------------------------------------------------------------------------------------- | -------- |
| Todos los saldos pendientes (subscription + debt_balance, cualquier amount > 0) (Recomendado) | ✓        |
| Solo `target_kind='subscription'` (mensualidades pendientes)                                  |          |
| Solo `target_kind='debt_balance'` (deudas libres clásicas)                                    |          |

---

## Estructura UI del reporte

| Option                                                                               | Selected |
| ------------------------------------------------------------------------------------ | -------- |
| Cards de totales por bucket arriba + tabla detallada con filtros abajo (Recomendado) | ✓        |
| Solo tabla detallada con filtros (sin cards executive)                               |          |
| Solo cards (drilldown a tabla en click)                                              |          |

---

## Multi-currency en reporte Deudas

| Option                                                                                | Selected |
| ------------------------------------------------------------------------------------- | -------- |
| Non-owner: 1 currency. Owner: cards separadas por currency, nunca sumar (Recomendado) | ✓        |
| Always 1 currency (la del scope)                                                      |          |
| Selector de currency siempre visible                                                  |          |

---

## Paginación del reporte

| Option                                                              | Selected |
| ------------------------------------------------------------------- | -------- |
| Server-side, `PaginatedResult<DebtRow>`, "Cargar más" (Recomendado) | ✓        |
| Client-side (carga todo y filtra en frontend)                       |          |
| Cursor-based                                                        |          |

---

## Endpoint del reporte

| Option                                                                                                  | Selected |
| ------------------------------------------------------------------------------------------------------- | -------- |
| `GET /api/admin/reports/outstanding-balances` (naming inglés en código, UI dice "Deudas") (Recomendado) | ✓        |
| Reusar `GET /api/admin/finance/balances` (si existiera)                                                 |          |
| Derivar en frontend del listing de transactions                                                         |          |

**Nota:** la response incluye totales agregados por bucket en la misma payload (no requiere segundo endpoint para alimentar las cards arriba).

---

## RBAC del reporte

| Option                                                     | Selected |
| ---------------------------------------------------------- | -------- |
| Reusar `FINANCE_READ_ROLES` (Phase 106 D-04) (Recomendado) | ✓        |
| Solo owner/admin (más restrictivo)                         |          |
| Read abierto a coach también                               |          |

---

## CajaPage — segmentación por kind (CAJA-01)

### Visualización

| Option                                                                                        | Selected |
| --------------------------------------------------------------------------------------------- | -------- |
| Bloque nuevo debajo del actual ("Por tipo de transacción", 5 cards color-coded) (Recomendado) | ✓        |
| Reemplazar el bloque actual por uno nuevo segmentado por kind                                 |          |
| Tab separado dentro de CajaPage                                                               |          |

### Backend

| Option                                                                                                             | Selected |
| ------------------------------------------------------------------------------------------------------------------ | -------- |
| Extender el endpoint summary existente (Phase 106-03) con `revenueByKind` (additive backward-compat) (Recomendado) | ✓        |
| Endpoint nuevo dedicado                                                                                            |          |
| Calcular en frontend desde el listing de transactions                                                              |          |

---

## CajaPage — filtros + tabla por kind (CAJA-02)

| Option                                                                                  | Selected |
| --------------------------------------------------------------------------------------- | -------- |
| Filtro single-select "Tipo" (Todos + 5 kinds) + columna badge color-coded (Recomendado) | ✓        |
| Filtro multi-select                                                                     |          |
| Sin filtro, solo columna informativa                                                    |          |

---

## Excel exports (CAJA-04)

### CajaPage export — granularidad

| Option                                                                                    | Selected |
| ----------------------------------------------------------------------------------------- | -------- |
| Una row por transaction + columna "Conceptos" concatenada (Recomendado, no infla totales) | ✓        |
| Una row por (transaction × link) — granular pero suma inflada                             |          |
| Dos sheets: resumen por transaction + detalle por link                                    |          |

### Reporte Deudas export — granularidad

| Option                                                                               | Selected |
| ------------------------------------------------------------------------------------ | -------- |
| Una row por concepto pendiente individual (granular para pivot tables) (Recomendado) | ✓        |
| Una row por miembro (sumarizado, pierde detalle)                                     |          |

---

## Claude's Discretion

- Color exacto de cada badge de kind (5 colores Quasar más cercanos).
- Texto exacto de las cards de totales por bucket ("Hasta 30 días" vs "0 a 30 días").
- Si el reporte Deudas también tiene un export "resumen" pivot por miembro (default: solo detalle).
- Default sort y default filtros del reporte Deudas al cargar.
- Si el bloque "Por tipo de transacción" muestra todos los kinds siempre o solo los con monto > 0.
- Comportamiento del Excel cuando el resultado paginado es muy grande (default: exportar todo con confirm si >1000 rows).

## Deferred Ideas

- Aging por concepto que no esté en `balances` (la cache es la fuente única — fuera de scope).
- Métricas calculadas no derivables del modelo (cohort retention, predicciones, churn) — fuera de v4.8.
- Drilldown desde card de bucket a tabla pre-filtrada (nice-to-have, fuera de scope).
- Notificaciones automáticas a miembros con deudas viejas (Phase futura).
- Comparativa período vs período en CajaPage (fuera de scope v4.8).
- Rediseño completo de CajaPage — preservamos la UI actual y solo sumamos.
