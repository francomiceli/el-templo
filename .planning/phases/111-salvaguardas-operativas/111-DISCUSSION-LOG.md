# Phase 111: Salvaguardas operativas - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-01
**Phase:** 111-salvaguardas-operativas
**Areas discussed:** UX handoff Assign→Convert, Phone match strictness, Audit log payload shape, Autoregister block scope, UI polish (folded)

---

## UX del handoff Assign→Convert

| Option                                 | Description                                                                                                                                                                           | Selected     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Stack: dialog encima de dialog         | AssignPlanDialog queda abierto, MemberFormDialog se abre encima como overlay. Al guardar conversión, modal se cierra y AssignPlanDialog auto-refresca planes. Cero pérdida de estado. | (no directo) |
| Cerrar y reabrir con estado preservado | AssignPlanDialog se cierra al click 'Convertir'. MemberFormDialog se abre. Tras conversión, AssignPlanDialog se reabre auto. Requiere event bus.                                      |              |
| Cerrar sin reabrir                     | AssignPlanDialog se cierra. MemberFormDialog se abre. Tras conversión, admin reabre AssignPlanDialog manual.                                                                          |              |

**User's choice:** Free-text — "tener en cuenta que desde editar alumno se puede cambiar la sede (de online a presencial o de cualquiera a cualquiera en realidad) habría que indicar ir hacia este lugar"

**Notes:** La respuesta del usuario re-enmarcó el problema: no hay modo "convertir" dedicado — el flujo de "editar alumno" YA permite cambiar sede de cualquiera a cualquiera. La conversión es: editar alumno → cambiar sede → guardar. Esto coincide con `MemberFormDialog.vue:694-750` que ya detecta virtual→física y valida campos requeridos. Decisión locked: usar dialog stack (overlay) — AssignPlanDialog queda abierto, MemberFormDialog mode='edit' se abre encima, al guardar AssignPlanDialog detecta cambio en branchId y refetch planes automáticamente. Capturado como D-01, D-02, D-03, D-04 en CONTEXT.md.

---

## Strictness del match de teléfono

| Option                                 | Description                                                                                                            | Selected |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------- |
| Exact match últimos 10 dígitos         | normalize → strip non-digits → take last 10 → exact match. Convención AR. Cero false positives. Caso Soledad atrapado. | ✓        |
| Partial match últimos 8 dígitos        | Atrapa diferencias en código de área. Más false positives.                                                             |          |
| Match exacto + fuzzy (Levenshtein 1-2) | Atrapa typos. Más complejidad.                                                                                         |          |

**User's choice:** Exact match últimos 10 dígitos (Recommended)

**Notes:** Decisión inmediata sin clarificaciones adicionales. Capturado como D-05 en CONTEXT.md. Helper `normalizePhone()` strips non-digit y devuelve `slice(-10)`.

---

## Audit log payload_json shape

| Option                         | Description                                                                                                    | Selected |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- | -------- |
| Campos clave por acción        | Cada acción tiene shape específico (cancel sub, void tx, plan assigned). Forensia suficiente, ~30MB en 5 años. | ✓        |
| Snapshot completo before/after | { before, after } del row pre/post-update. Forensia máxima, ~150MB en 5 años.                                  |          |
| Delta solo (campos cambiados)  | { changed: { campo: [old, new] } }. Compacto, harder to read en SQL. ~20MB.                                    |          |

**User's choice:** Campos clave por acción (Recommended)

**Notes:** Capturado como D-13 en CONTEXT.md. Shape específico definido para cada una de las 3 acciones core (subscription_cancelled, transaction_voided, plan_assigned).

---

## Scope del bloqueo de autorregistro

| Option                            | Description                                                                                           | Selected |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- | -------- |
| Cualquier cuenta no-deleted       | Match contra users WHERE phone_normalized=X AND deleted_at IS NULL. Incluye virtuales y presenciales. | ✓        |
| Solo cuentas en branch presencial | Match restringido a sedes físicas. Permite ghost twin via online.                                     |          |
| Cualquier cuenta incluso deleted  | Match contra todos los rows. Demasiado estricto.                                                      |          |

**User's choice:** Cualquier cuenta no-deleted (Recommended)

**Notes:** Capturado como D-08 en CONTEXT.md. Cubre el caso de Soledad y previene un ghost twin via cualquier flujo.

---

## UI polish — Badge order (folded mid-discussion)

**Origen:** El usuario agregó al discuss: "el badge que dice ghost en editar alumno, que ahora esta a la derecha, tiene que estar junto al badge que dice freemium, que ahora esta a la izquierda; deben estar los dos badges pegados en este orden: Freemium Ghost".

**Investigación:** Los badges viven en `AlumnoDetailPage.vue` (no MemberFormDialog edit). "Freemium" es el status badge en líneas 54-58 (junto al nombre, izquierda). "Ghost" es uno de los segment labels — el segment badge está en líneas 71-83 dentro del column items-end (derecha).

**Decisión:** Mover el segment badge al row del status badge. Resultado: "Freemium Ghost" pegados, en ese orden, izquierda. Capturado como D-27 y D-28 en CONTEXT.md. Es UI polish menor (mover un `<q-badge>` de un wrapper a otro), folded en plan de REQ-6 que ya toca el mismo archivo.

---

## Claude's Discretion

- Naming exacto del helper file (`phone.ts` vs `normalize.ts`).
- Debounce timing exacto del lookup (300ms propuesto).
- Wording exacto del banner CTA del AssignPlanDialog.
- Forma del actorId para la migración de Soledad (depende de si existe user "system").
- Si los índices del audit_log son los óptimos.

## Deferred Ideas

- Refund / reassign / keep_credit modes en cancel sub
- Bulk merge de cuentas duplicadas existentes
- Audit log de acciones no-financieras (member_created, branch_changed, login)
- Schedule de auditoría automática (cron del audit_log)
- Confirmación con la alumna del DOB
- Reorganización completa del header del alumno
- Index en `users.phone` / columna generada `phone_normalized`
