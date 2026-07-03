# Phase 151: Registrar cobro (Pagos → Cobros) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-03
**Phase:** 151-Registrar cobro (Pagos → Cobros)
**Areas discussed:** Estructura del flujo por pasos, Semántica cuenta↔cobro (API), Creación rápida inline y permisos, Rename + listado de cargas

---

## Estructura del flujo por pasos

| Option                                  | Description                                                                                                                                      | Selected |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Unificado (Recomendado)                 | Un solo flujo: socio primero, después "¿a qué se asocia el cobro?" (plan vigente / asignar plan / suelto) como paso. Elimina el toggle de modos. | ✓        |
| 3 modos como paso 1                     | Se conserva el toggle actual pero cada modo se despliega como pasos separados.                                                                   |          |
| Híbrido: socio primero, modo automático | El sistema infiere el camino según el socio elegido.                                                                                             |          |

| Option                                    | Description                                                                                                                | Selected |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------- |
| Una ruta, paso por pantalla (Recomendado) | Una sola ruta donde cada paso ocupa la pantalla completa (render por paso + header con progreso). Estado en el componente. | ✓        |
| QStepper de Quasar                        | Stepper nativo dentro de la página; conserva algo del efecto acordeón.                                                     |          |
| Rutas separadas por paso                  | Rutas hijas con estado en Pinia; plumbing extra.                                                                           |          |

| Option                            | Description                                                | Selected |
| --------------------------------- | ---------------------------------------------------------- | -------- |
| 4 pasos con resumen (Recomendado) | Socio → Qué se cobra → Cómo se paga → Resumen y Confirmar. | ✓        |
| 3 pasos sin resumen               | El paso de pago termina en Confirmar directo.              |          |
| Más granular (5-6 pasos)          | Separar plan de turnos y medio de monto.                   |          |

| Option                                | Description                                                                                                     | Selected |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------- |
| Dos columnas en desktop (Recomendado) | Paso activo a la izquierda + resumen acumulado a la derecha; en mobile el resumen se colapsa a header compacto. | ✓        |
| Mismo flujo centrado, más ancho       | Una columna idéntica a mobile.                                                                                  |          |
| Que lo decida el UI-SPEC              | Diferir al /gsd:ui-phase.                                                                                       |          |

**User's choice:** Flujo unificado, una ruta con paso por pantalla, 4 pasos con resumen, dos columnas en desktop.

---

## Semántica cuenta↔cobro (API)

| Option                              | Description                                                                                                     | Selected |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------- |
| Prellenado corregible (Recomendado) | El cobro pendiente nace imputado a la cuenta elegida; el validador puede corregirla al validar (mantiene v5.3). | ✓        |
| Definitiva desde la carga           | La cuenta queda fija; corregir requiere anular y recargar.                                                      |          |

| Option                        | Description                                                                               | Selected |
| ----------------------------- | ----------------------------------------------------------------------------------------- | -------- |
| Todos los roles (Recomendado) | Cualquier cobro transfer/card exige cuenta; para admin/owner es imputación final directa. | ✓        |
| Solo profes                   | Admin/owner podían seguir sin cuenta.                                                     |          |

| Option                       | Description                                                                                      | Selected |
| ---------------------------- | ------------------------------------------------------------------------------------------------ | -------- |
| Solo PoS ahora (Recomendado) | La exigencia vive en los endpoints del flujo de Cobros; otras superficies convergen en fase 154. | ✓        |
| Regla global en la API ya    | El motor exige cuenta en todos los endpoints de cobro; todas las UIs se actualizan ahora.        |          |

**User's choice:** Prellenado corregible, todos los roles, solo PoS en esta fase.

---

## Creación rápida inline y permisos

| Option                         | Description                                                                                                                      | Selected |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Solo admin/owner (Recomendado) | El dueño ve "Crear cuenta" inline (reusa dialog de 150); el profe ve aviso y no puede finalizar por transfer/card (efectivo sí). | ✓        |
| Todos los roles del PoS        | Abrir la creación de cuentas a los roles del PoS.                                                                                |          |

**User's choice:** Solo admin/owner.

---

## Rename + listado de cargas

| Option                      | Description                                                                                                        | Selected |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------- |
| Ruta incluida (Recomendado) | Nav, títulos, textos Y la ruta pasan a /cobros con redirect /pagos→/cobros; landing del empleado apunta a /cobros. | ✓        |
| Solo textos visibles        | La URL queda /pagos.                                                                                               |          |

| Option                                 | Description                                                                     | Selected |
| -------------------------------------- | ------------------------------------------------------------------------------- | -------- |
| Histórico con fecha+hora (Recomendado) | Se mantiene el endpoint (últimas 50) con título "Cobros" y fecha+hora por fila. | ✓        |
| Solo hoy, con filtro para atrás        | Default solo el día + filtro histórico (cambia el endpoint).                    |          |

| Option                                   | Description                                                                                                    | Selected |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------- |
| CTA arriba + listado abajo (Recomendado) | Portada con botón grande "Registrar cobro" arriba y listado histórico abajo; el CTA entra al flujo de 4 pasos. | ✓        |
| Directo al paso 1                        | /cobros abre en el paso Socio con el listado colapsado/aparte.                                                 |          |

**User's choice:** Ruta incluida, histórico con fecha+hora, CTA arriba + listado abajo.

---

## Claude's Discretion

- Selector de cuentas filtrado por banco activas + moneda del cobro; forma del campo nuevo en la API.
- "+ Nueva cuenta" visible también con cuentas existentes (admin/owner).
- "Sin cuentas de la moneda del cobro" = estado vacío con moneda preseleccionada.
- Naming de constantes internas post-rename (`PAGOS_ROLES`).
- Formato de fecha+hora del listado (agrupado por día o plano).
- Ubicación del aviso de deuda (POS-01) dentro del flujo por pasos.
- Header de progreso y transiciones entre pasos.

## Deferred Ideas

- Datos del frente de la tarjeta (COBRO-F1, ya diferido).
- Exigencia de cuenta en las demás superficies de cobro → fase 154.
- "Mis cargas" como desplegable colapsable → evaluar en UI-SPEC o fase 152 si molesta en mobile.
- Todo `v51-milestone-data-rollout.md` revisado y NO incorporado (tercera vez; sin relación).
