# Phase 153: Mejoras de Deudas - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-04
**Phase:** 153-Mejoras de Deudas
**Areas discussed:** Granularidad de la lista, No-renovaciones (DEUDA-04), Motivo por deuda (DEUDA-02), Roles y acciones

---

## Granularidad de la lista

| Option                            | Description                                                          | Selected |
| --------------------------------- | -------------------------------------------------------------------- | -------- |
| Fila por socio + expansión        | Fila agregada + deudas al expandir                                   |          |
| Fila por deuda                    | Cada deuda una fila, socio repetido                                  |          |
| Fila por socio + columnas resumen | Agregada con columnas de la deuda más vieja                          |          |
| (Other)                           | "me gustaría tener ambas listas... tal vez se puedan armar dos tabs" | ✓        |

**User's choice:** Ambas listas → dos tabs. Se descubrió que la lista detallada ya existía en Reportes (`DeudasReport.vue`).

| Option                    | Description                                          | Selected |
| ------------------------- | ---------------------------------------------------- | -------- |
| Moverlo: sale de Reportes | El reporte se muda al tab "Por deuda", una sola casa | ✓        |
| Compartirlo               | Mismo componente en Deudas y Reportes                |          |

| Option                | Description               | Selected |
| --------------------- | ------------------------- | -------- |
| Tab default Por socio | Cobro rápido como portada | ✓        |
| Tab default Por deuda | Gestión como portada      |          |

| Option                    | Description                    | Selected |
| ------------------------- | ------------------------------ | -------- |
| Por socio queda como está | Sin columnas nuevas            | ✓        |
| Suma antigüedad           | Columna con la deuda más vieja |          |

**Notes:** El usuario preguntó si "ambas listas" ya se cumplía en algún lado — sí, parcialmente: la detallada vivía en Reportes. Hubo una re-pregunta a pedido del usuario antes de la respuesta definitiva.

---

## No-renovaciones (DEUDA-04)

| Option                              | Description                           | Selected |
| ----------------------------------- | ------------------------------------- | -------- |
| Tercer tab "Vencidos"               | Tab propio, semántica limpia          | ✓        |
| Mezclados en Por socio con etiqueta | Chip "Plan vencido" en la lista única |          |
| Sección aparte debajo               | Segunda tabla en el mismo tab         |          |

| Option              | Description                                                  | Selected |
| ------------------- | ------------------------------------------------------------ | -------- |
| Últimos 60 días     | Ventana fija, recuperables; más atrás es churn de Analíticas | ✓        |
| Últimos 30 días     | Solo el último ciclo                                         |          |
| Selector de ventana | Filtro 30/60/90                                              |          |

| Option              | Description                   | Selected |
| ------------------- | ----------------------------- | -------- |
| Sin monto           | Lead de renovación, no deuda  | ✓        |
| Con precio del plan | Monto potencial de renovación |          |

| Option                  | Description                 | Selected |
| ----------------------- | --------------------------- | -------- |
| En ambos tabs           | Deuda+vencido sin exclusión | ✓        |
| Solo en deudas con chip | Prioriza la deuda real      |          |

---

## Motivo por deuda (DEUDA-02)

| Option                 | Description                                              | Selected |
| ---------------------- | -------------------------------------------------------- | -------- |
| Derivado del origen    | Cuota → "Cuota {plan}"; suelto → misc_reason v5.3 + nota | ✓        |
| Capturado al registrar | Campo nuevo (prohibido por roadmap: duplica v5.3)        |          |

| Option                    | Description                   | Selected |
| ------------------------- | ----------------------------- | -------- |
| Rango de fechas del ciclo | "Cuota Full — 01/06 al 30/06" | ✓        |
| Mes legible               | "Cuota Full — Junio 2026"     |          |

| Option           | Description                                                | Selected |
| ---------------- | ---------------------------------------------------------- | -------- |
| Fecha de carga   | Cuándo se registró en el sistema (pedido literal de Nacho) | ✓        |
| Fecha de devengo | Cuándo nació la obligación                                 |          |
| Ambas            | Carga + devengo                                            |          |

| Option                  | Description                     | Selected |
| ----------------------- | ------------------------------- | -------- |
| Nota en tooltip/detalle | Columna limpia, dato disponible | ✓        |
| Columna propia          | Nota siempre visible            |          |
| No se muestra           | Solo motivo estructurado        |          |

---

## Roles y acciones

| Option         | Description                                                                    | Selected |
| -------------- | ------------------------------------------------------------------------------ | -------- |
| Tabs por rol   | Coach solo "Por socio"; Por deuda/Vencidos → gestion/admin/owner, guard en API | ✓        |
| Todos ven todo | Sin gating por tab                                                             |          |

| Option                              | Description                                                  | Selected |
| ----------------------------------- | ------------------------------------------------------------ | -------- |
| Solo lectura                        | "Es solo para ver" (Nacho); cobro por fila llega en fase 154 | ✓        |
| Link "Registrar cobro" por fila     | Se adelanta a fase 154                                       |          |
| Solo lectura + WhatsApp en Vencidos | Botón de contacto para renovar                               |          |

**Notes:** Al cerrar, el usuario indicó que se ausenta y autoriza cerrar el milestone v5.4 autónomamente: encadenar plan+ejecución de la 153 y discutir las fases 154-156 tomando siempre las opciones recomendadas (`--auto`), sin push.

## Claude's Discretion

- Labels/íconos finales de los tabs y diseño del tooltip de la nota.
- Adaptación de los filtros del reporte al mudarse (sucursal, moneda, búsqueda).
- Diseño de API: extender endpoint de reports vs endpoint nuevo de vencidos (coach endpoint intacto).
- Orden default de cada tab.
- Limpieza de la ruta/redirect en Reportes.

## Deferred Ideas

- Botón de WhatsApp en la fila de Vencidos (ofrecido, no elegido).
- Registrar cobro desde la fila → fase 154 (ALUM-02).
- Todo `v51-milestone-data-rollout.md` revisado y NO incorporado (5ª vez).
