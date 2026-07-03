# Phase 152: Reorganización de Caja + egresos configurables - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-03
**Phase:** 152-Reorganización de Caja + egresos configurables
**Areas discussed:** Orden final de los tabs, Filtro por día, Dato de validación en el detalle, ABM de centros de costo, Filtro por estado en Cobros, Naming Cobros × 2, Alcance del ABM de categorías, Contenido de la nota de Saldos

---

## Orden final de los tabs

| Option                              | Description                                                                                | Selected |
| ----------------------------------- | ------------------------------------------------------------------------------------------ | -------- |
| Saldos 4°, Cuentas 5° (Recomendado) | Por frecuencia de uso: consulta de saldos antes que configuración de cuentas               | ✓        |
| Cuentas 4°, Saldos 5°               | El ABM de cuentas antes; Saldos cierra la fila                                             |          |
| Fusionar Saldos + Cuentas           | Un solo tab con saldo + acciones ABM; un tab menos pero mezcla consulta con administración |          |

**User's choice:** Saldos 4°, Cuentas 5°
**Notes:** El usuario primero pidió analizar qué es cada tab ("analicemos, que son las primeras 3 tabs y que son las otras 2") y por qué los últimos dos no estaban contemplados en CAJA-01. Explicado: el doc de Nacho se escribió contra la Caja de 4 tabs de v5.2/v5.3 (solo rankeó los 3 que le importaban; Saldos lo criticó sin rankear) y Cuentas nació después en la fase 150. Con ese contexto confirmó la recomendación.

---

## Filtro por día

| Option                              | Description                                                              | Selected |
| ----------------------------------- | ------------------------------------------------------------------------ | -------- |
| Mes + modo "por días" (Recomendado) | Selector de mes actual como default + toggle a rango desde–hasta por día | ✓        |
| Rango siempre visible               | Date-range picker único precargado al mes actual                         |          |
| Vos decidís                         | Claude elige la mecánica en planning                                     |          |

**User's choice:** Mes + modo "por días"

---

## Dato de validación en el detalle

| Option                                   | Description                                                                    | Selected |
| ---------------------------------------- | ------------------------------------------------------------------------------ | -------- |
| Columnas nuevas + backfill (Recomendado) | validated_by/validated_at en financial_transactions + backfill desde audit_log | ✓        |
| Leer del audit_log                       | Sin migración; query extra por detalle, acopla la UI al payload del log        |          |
| Vos decidís                              | Claude elige en planning                                                       |          |

**User's choice:** Columnas nuevas + backfill
**Notes:** El usuario preguntó "¿qué es esto? ¿por qué una migración?" — explicado que la tabla de transacciones guarda el estado pero no quién/cuándo validó (eso vive solo en audit_log), y los dos caminos posibles. Confirmó la opción recomendada.

| Option                                | Description                                                                                     | Selected |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- | -------- |
| "Validado al registrar" (Recomendado) | Muestra quién cargó + fecha de registro; distingue el auto-validado del que pasó por la bandeja | ✓        |
| Igual que los validados               | Completa validated_by/at con quien registró, sin distinguir                                     |          |
| Sin dato (—)                          | Solo la etiqueta de estado                                                                      |          |

**User's choice:** "Validado al registrar"

---

## ABM de centros de costo

| Option                          | Description                                                           | Selected |
| ------------------------------- | --------------------------------------------------------------------- | -------- |
| En el tab Cuentas (Recomendado) | Sección "Categorías de egreso" junto al ABM de cuentas; sin tab nuevo | ✓        |
| Tab propio (6°)                 | Más visible pero agrega un sexto tab para algo poco usado             |          |
| Desde el dialog de egreso       | Contextual pero esconde el ABM                                        |          |

**User's choice:** En el tab Cuentas

| Option                                    | Description                                                      | Selected |
| ----------------------------------------- | ---------------------------------------------------------------- | -------- |
| Conservar + sumar genéricos (Recomendado) | Los Templo-céntricos quedan; solo se agrega "Pago a proveedores" |          |
| Limpiar los Templo-céntricos              | Dejar solo genéricos                                             | ✓        |

**User's choice:** Limpiar los Templo-céntricos
**Notes:** Repregunta sobre el impacto en prod (hay egresos reales imputados; la migración viaja a la caja real de Nacho):

| Option                              | Description                                                                                             | Selected |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- | -------- |
| Renombrar a genéricos (Recomendado) | "Alquiler Constitución"→"Alquiler", "Viáticos profes"→"Viáticos"; no se pierde ninguna categoría en uso | ✓        |
| Desactivar los Templo-céntricos     | Nacho perdería "Alquiler"/"Viáticos" para egresos futuros                                               |          |
| Solo desactivar el redundante       | Mapeo caso por caso en planning                                                                         |          |

**User's choice:** Renombrar a genéricos

---

## Filtro por estado en Cobros (2ª ronda)

| Option                              | Description                                       | Selected |
| ----------------------------------- | ------------------------------------------------- | -------- |
| Sí, filtro + etiqueta (Recomendado) | Chip por fila + filtro todas/validadas/pendientes | ✓        |
| Solo etiqueta                       | Lo mínimo de CAJA-02                              |          |

**User's choice:** Sí, filtro + etiqueta

---

## Naming Cobros × 2 (2ª ronda)

| Option                              | Description                                                  | Selected |
| ----------------------------------- | ------------------------------------------------------------ | -------- |
| Tab "Cobros" tal cual (Recomendado) | Literal del doc de Nacho; el contexto desambigua             |          |
| "Historial de cobros"               | Distingue explícitamente del PoS "Cobros" del nav (fase 151) | ✓        |

**User's choice:** "Historial de cobros"

---

## Alcance del ABM de categorías (2ª ronda)

| Option                           | Description                                                                                                 | Selected |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------- |
| Completo, por país (Recomendado) | Crear/renombrar/desactivar/reactivar, sin borrado físico, scope por selector de país, nombre único por país | ✓        |
| Mínimo: crear + desactivar       | Menos superficie; corregir un typo parte los históricos                                                     |          |
| Vos decidís                      | Claude define en planning                                                                                   |          |

**User's choice:** Completo, por país

---

## Contenido de la nota de Saldos (2ª ronda)

| Option                            | Description                                                                        | Selected |
| --------------------------------- | ---------------------------------------------------------------------------------- | -------- |
| Aviso + explicación (Recomendado) | Qué muestra la pantalla (saldo firme desde el corte) + el aviso de egresos/retiros | ✓        |
| Solo el aviso (literal CAJA-06)   | Exactamente el texto del requirement                                               |          |

**User's choice:** Aviso + explicación

---

## Claude's Discretion

- Estilo/ubicación del chip validada/pendiente en Historial de cobros (orientar a reusar el de MovEgresosTab).
- Forma del toggle mes↔días y si el control de fecha se extrae como componente compartido.
- Copy final y forma de la nota de Saldos (banner fijo vs dismissible).
- Naming del tab Cuentas al ganar la sección de categorías y su layout interno.
- Validación de nombre único por país (case-sensitivity) y mensajes de error.
- Filtro por estado de Cobros client-side vs query param.

## Deferred Ideas

- Reporte de egresos agrupado por centro de costo (EGR-F1) — sigue diferido.
- Rediseño de fondo de la pantalla Saldos (queja de Nacho sobre la pantalla completa) — esta fase solo agrega la nota; fase propia si se re-plantea.
