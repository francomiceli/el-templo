# Phase 204: Usuarios Wellhub como tipo de usuario - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-27
**Phase:** 204-usuarios-wellhub
**Areas discussed:** Identidad y etiqueta, Operación del staff, Métricas y reporte, Socio activo con Wellhub, Conversión desde la ficha, Ficha del visitante Wellhub

Antes del discuss, Franco: "para los que entran por wellhub directo es importante distinguirlos como tipo de usuario wellhub, es importante a nivel operación, incluso deberíamos tenerlo en cuenta a la hora de las métricas, reportes, analíticas". No adelantar hotfixes: todo en la fase.

---

## Identidad y etiqueta

| Pregunta | Opciones | Elegida |
|---|---|---|
| Estado de un ex-alumno que viene por Wellhub | Inactivo + etiqueta · pasa a 'wellhub' · 'wellhub' + marca ex-alumno | **Inactivo + etiqueta Wellhub** |
| ¿Etiqueta permanente o por ventana? | Permanente + última visita · ventana de N días · vos decidí | **Permanente + última visita**. Además: "si la persona decide asociarse al templo directamente, la conversión debe poder hacerse desde su ficha de alumno" |
| Cómo se ve un convertido | 'Activo · vino por Wellhub' · solo 'Activo' · 'Activo · Wellhub' | **Solo 'Activo', sin marca** |
| Convertido al que se le vence el plan | Regla única · solo si vuelve por Wellhub | **Regla única** (se ve siempre que no sea activo) |
| Duplicado con otro email | Vincular a mano desde la ficha · avisar posible duplicado · nada | **Vincular a mano desde la ficha** |
| ¿Visitante Wellhub en la app? | No por ahora · acceso limitado | **No por ahora** |

## Operación del staff

| Pregunta | Opciones | Elegida |
|---|---|---|
| Wellhub en el listado | En Todos + filtro · sección aparte | Franco: "que no sea un nuevo filtro: opción en el select Estado O un toggle como 'solo deudores', ¿cuál te parece?" → recomendé el toggle (Wellhub es etiqueta, no estado: un Inactivo · Wellhub no aparecería eligiendo 'Wellhub' en Estado) → **Toggle 'Solo Wellhub'** |
| Wellhub en Cobros | Badge · ocultar · aviso al seleccionar | **Badge + aviso**, "que el aviso lo mande a ficha de alumno para convertir" |
| Horarios | Chip en la persona · chip + contador | **Chip en la persona** |
| Acciones sobre reserva Wellhub | Bloquear · permitir con aviso · permitir igual | **"No puede cancelarla, sí marcarle asistencia a mano"** |

## Métricas y reporte

| Pregunta | Opciones | Elegida |
|---|---|---|
| Wellhub en métricas de asistencia | Excluir + aparte · solo excluir · toggle | Franco preguntó si había propuesta para "hoy mezclan todo"; "el 1 me parece bien, pero lo de wellhub debe sumar a las métricas totales". Propuse total + desglose por origen. Franco: "me gustaría que wellhub sea un dato más pero que no llenes todas las páginas de botones y toggles relacionados a wellhub, sólo donde se muestran varias categorías agregar wellhub como una más" → **Total incluye Wellhub; categoría más solo donde ya hay categorías** |
| Embudo | Origen más en el embudo · también en leads | Franco: "¿no sería un lead?" → **Origen más en el embudo, fuera del pipeline de leads** |
| Contenido del reporte Wellhub | (multi) validadas · a mano · personas y frecuencia · reservas/no-shows/conversiones | **Las 4** |

## Socio activo con Wellhub

| Pregunta | Opciones | Elegida |
|---|---|---|
| Regla | Permitir separado del plan · rechazar · cuenta como su visita | **Permitir, separado del plan** |
| Visibilidad | Alcanza (sin marca) · que aparezca en el toggle | **Que aparezca en el toggle** (activos con uso Wellhub en los últimos 30 días) |
| Campaña bajas | Sacarlo · dejarlo | **Sacarlo** |

## Zonas grises adicionales

Ofrecidas: Conversión desde la ficha, Unir duplicados, Presente a mano, Ficha del visitante Wellhub. Franco eligió Conversión y Ficha: "para 1 y 4, andá con lo recomendado y más completo, y vamos a escribir context, plan y ejecución autónomos, tengo que salir un momento".

## Claude's Discretion

- Conversión (D-17) y ficha (D-20): lo recomendado y más completo, por pedido explícito.
- Presente a mano (D-19) y unir duplicados (D-21): no discutidos. Se tomó la opción recomendada.

## Deferred Ideas

- Acceso limitado a la app para Wellhub sin plan.
- Aviso automático de posible duplicado.
- Activar las otras 5 sedes.
