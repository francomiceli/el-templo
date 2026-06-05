# Phase 132: Exponer las 6 métricas de gestión v5.0 en el admin + limpiar deprecadas - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-05
**Phase:** 132-exponer-metricas-gestion-v50-admin
**Areas discussed:** Alcance backend (3 extensiones), Borrado de pantallas viejas, Formato lista accionable de frecuencia

> Nota: las decisiones de visualización de cada métrica (titulares, agrupación 4 temas, orden, ventana 15d, embudo clásico) llegaron pre-cerradas por Nacho en `DECISIONES-VISUALIZACION.md` y NO se re-discutieron.

---

## Alcance backend — Filtros plan/turno como entrada

| Option                      | Description                                           | Selected |
| --------------------------- | ----------------------------------------------------- | -------- |
| Plan sí, turno donde aplica | Filtro plan en las 6; turno solo en funnel+frecuencia | ✓        |
| Solo plan                   | Plan en las 6, turno fuera de la fase                 |          |
| Ninguno ahora               | Frontend-only estricto, diferir plan y turno          |          |

**User's choice:** Plan sí, turno donde aplica.
**Notes:** Ticket/churn/renovación/LTV son por suscripción → no tienen turno. El join a plan ya existe en los breakdowns.

## Alcance backend — Cruce turno×sucursal del funnel

| Option                                | Description                                                                      | Selected |
| ------------------------------------- | -------------------------------------------------------------------------------- | -------- |
| Vía filtro turno + breakdown sucursal | Cruce gratis filtrando turno y mirando breakdown de sucursal; cero agregación 2D | ✓        |
| Agregación 2D dedicada                | Construir el cruce real en el servicio; más caro                                 |          |
| Diferir el cruce                      | Solo single-axis ahora                                                           |          |

**User's choice:** Vía filtro turno + breakdown sucursal.
**Notes:** Depende de que turno sea filtro de entrada (D-10). Colapsa esta extensión en la del filtro.

## Alcance backend — Contacto en lista de frecuencia

| Option                             | Description                                         | Selected |
| ---------------------------------- | --------------------------------------------------- | -------- |
| Enriquecer endpoint con nombre+tel | Frecuencia devuelve nombre/teléfono junto al userId | ✓        |
| Resolver en el frontend            | Front cruza userId con otro endpoint                |          |
| Solo nombre, sin teléfono          | Lista clickeable al perfil, sin tel directo         |          |

**User's choice:** Enriquecer endpoint con nombre+tel.
**Notes:** Teléfono ya está en la tabla users. Una sola llamada, datos listos para exportar/llamar.

---

## Borrado de pantallas viejas — Retención legacy

| Option                                 | Description                                                          | Selected |
| -------------------------------------- | -------------------------------------------------------------------- | -------- |
| Borrar la card, conservar RetencionTab | Card simple "Tasa de retención" fuera; curvas por ciclo se conservan | ✓        |
| Borrar ambas                           | Criterio estricto; se pierde retención por ciclos                    |          |
| Conservar ambas                        | Riesgo de duplicación                                                |          |

**User's choice:** Borrar la card, conservar RetencionTab.
**Notes:** Las curvas por ciclo responden otra pregunta que las 6 nuevas no cubren → no es duplicado.

## Borrado de pantallas viejas — AsistenciaTab huérfano

| Option                     | Description                                        | Selected |
| -------------------------- | -------------------------------------------------- | -------- |
| Borrar el archivo huérfano | Código muerto fase 117, nunca renderizado; higiene | ✓        |
| Dejarlo como está          | No tocar fuera del alcance estricto                |          |

**User's choice:** Borrar el archivo huérfano.
**Notes:** La nueva Frecuencia no reemplaza horas pico/ocupación; AsistenciaTab simplemente nunca se conectó.

---

## Formato lista accionable de frecuencia — Click en fila

| Option                    | Description                                   | Selected |
| ------------------------- | --------------------------------------------- | -------- |
| Nombre→perfil, tel→llamar | Nombre abre perfil; teléfono link tel:/llamar | ✓        |
| Solo abrir perfil         | Toda la fila navega al perfil                 |          |
| Solo tel: directo         | La fila dispara la llamada directa            |          |

**User's choice:** Nombre→perfil, tel→llamar.

## Formato lista accionable de frecuencia — Export

| Option                 | Description                                                            | Selected |
| ---------------------- | ---------------------------------------------------------------------- | -------- |
| CSV                    | Descarga CSV, consistente con reporte de sesiones de prueba (fase 114) | ✓        |
| Copiar al portapapeles | Botón que copia nombre+tel                                             |          |

**User's choice:** CSV.

---

## Claude's Discretion

- Estructura concreta de tabs/componentes Vue para los 4 grupos temáticos.
- Tipos TS en `types/analytics.ts`.
- Si el filtro por plan es query param uniforme o helper compartido.

## Deferred Ideas

- Agregación 2D dedicada turno×sucursal (descartada; se logra vía filtro+breakdown).
- Otras duplicaciones de pantalla que aparezcan en implementación, evaluadas contra "nada duplicado".
