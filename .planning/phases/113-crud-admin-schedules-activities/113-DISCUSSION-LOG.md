# Phase 113: CRUD admin de Schedules y Activities - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-08
**Phase:** 113-crud-admin-schedules-activities
**Areas discussed:** Editar slot vivo, Conflictos al crear, CRUD Activities, UI shape

---

## Editar slot vivo con bookings futuros

| Option                               | Description                                              | Selected |
| ------------------------------------ | -------------------------------------------------------- | -------- |
| Cancelar bookings + edit + notificar | Patrón ya existente del toggle                           |          |
| Bloquear edit si hay bookings <48h   | Conservador, frustra al admin urgente                    |          |
| Migrar bookings al nuevo horario     | Inteligente pero complejo                                |          |
| Permitir edit duro sin manejo        | Caos garantizado                                         |          |
| **No permitir edit (decisión user)** | Slots inmutables, para cambiar: desactivar + crear nuevo | ✓        |

**User's choice:** Free-text — "no permitir que el admin edite horarios, quedan fijos"
**Notes:** Cambio masivo de scope. Elimina toda la complejidad de migrar bookings/notificaciones. Coherente con el patrón existente: toggle ya cubre "borrar", solo falta CREATE.

---

## Validación de conflictos al crear

| Option                                                       | Description                            | Selected |
| ------------------------------------------------------------ | -------------------------------------- | -------- |
| Bloquear overlapping branch+day, sin importar activity       | Asume una sala/grupo por sede          | ✓        |
| Bloquear solo duplicado exacto branch+day+start+end+activity | Permite multi-actividad simultánea     |          |
| Solo advertir                                                | Máxima flexibilidad, riesgo silencioso |          |
| Sin chequear                                                 | No recomendado                         |          |

**User's choice:** Bloquear overlapping branch+day (Recomendado)
**Notes:** Asume una sala por sede. Si se introducen múltiples salas en futuro, replantear.

---

## CRUD Activities + cascade

### Q1: Desactivar activity con schedules apuntando

| Option                                  | Description                  | Selected |
| --------------------------------------- | ---------------------------- | -------- |
| Bloquear + listar afectados             | Patrón validateAnchorSet     | ✓        |
| Cascade desactivar schedules            | Un click cierra todo, riesgo |          |
| Desactivar activity, schedules intactos | Inconsistente                |          |
| Solo si NO hay schedules (ni inactivos) | Demasiado estricto           |          |

**User's choice:** Bloquear + listar afectados (Recomendado)

### Q2: Editar name + description

| Option                           | Description                             | Selected |
| -------------------------------- | --------------------------------------- | -------- |
| Edit libre                       | Schedules apuntan por id, rename seguro | ✓        |
| Solo description, name inmutable | Conservador                             |          |

**User's choice:** Edit libre (Recomendado)

---

## UI shape

### Q1: Botón "Crear slot"

| Option                                      | Description                   | Selected |
| ------------------------------------------- | ----------------------------- | -------- |
| Botón flotante en HorariosPage + modal      | Patrón consistente            | ✓        |
| Click en celda vacía abre modal pre-llenado | Más context-aware, más código |          |
| Pantalla dedicada full-page                 | Innecesario                   |          |

**User's choice:** Botón flotante + modal (Recomendado)

### Q2: CRUD activities

| Option                           | Description                    | Selected |
| -------------------------------- | ------------------------------ | -------- |
| Pestaña separada en HorariosPage | Convive con catalog management | ✓        |
| Página nueva en sidebar          | Ruido en sidebar               |          |
| Modal inline en SlotDetailDialog | No permite listar todas        |          |

**User's choice:** Pestaña en HorariosPage (Recomendado)

---

## Claude's Discretion

- Estilo de modales/forms (Quasar pattern del admin existente)
- Shape de respuestas de error backend (alinear con módulo scheduling)
- Cobertura de tests (validación overlap, bloqueo cascade, CRUD básico)

## Deferred Ideas

- Editar horarios de slots vivos (descartado intencionalmente)
- Branches CRUD
- Bloqueos puntuales por slot+fecha
- Audit/historial de cambios
- Scope multi-sede en permisos
- UX context-aware para crear slot (click en celda vacía)
