# Phase 110: Admin users por país + multi-sede staff - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-30
**Phase:** 110-admin-users-by-country-multi-branch-staff
**Areas discussed:** Inyección del middleware canAccessBranch, Código HTTP en violaciones, Endpoint para sedes accesibles, Permisos para gestionar staff cross-país

---

## Inyección del middleware canAccessBranch

| Option                               | Description                                                                                                                                                              | Selected |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Helper puro + preHandler explícito   | `canAccessBranch(scope, branchId)` función pura testeable. preHandler `requireBranchAccess` toma branchId de un campo conocido. Se registra explícitamente en cada ruta. | ✓        |
| Helper inline en cada handler        | Sin preHandler. Cada handler llama `canAccessBranch` al inicio. Más explícito pero repetido.                                                                             |          |
| preHandler global con auto-detección | preHandler escanea query/body/params buscando `branchId`. Más DRY pero falsos positivos.                                                                                 |          |

| Option                                                 | Description                                          | Selected                       |
| ------------------------------------------------------ | ---------------------------------------------------- | ------------------------------ |
| Configuración por ruta (`from: 'query.branchId'` etc.) | Cada ruta declara dónde está el branchId. Sin magic. | ✓ (default tras "no entiendo") |
| Convención: query.branchId por defecto                 | Asume query.branchId; fallback explícito en handler. |                                |

| Option                                            | Description                                                                                                  | Selected |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------- |
| Scope check en preHandler + data check en service | preHandler valida permiso (403). Service valida cross-country data (400, mantiene Phase 98 D-03). Dos capas. | ✓        |
| Todo en service                                   | Sin preHandler en writes. Centraliza lógica pero pierde defense in depth.                                    |          |

**Notes:** Usuario respondió "no entiendo" en la pregunta del lugar del branchId. Aclaración inline (Fastify query/params/body), decisión por default = configuración por ruta.

---

## Código HTTP en violaciones (403 vs 400)

| Option                            | Description                                                                                                       | Selected |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------- |
| Coexisten: 403 permiso, 400 datos | preHandler 403 con `BRANCH_OUT_OF_SCOPE`. Service mantiene 400 para business rules cross-country (Phase 98 D-03). | ✓        |
| Todo 403                          | Unificar a permiso. Cambia código de Phase 98.                                                                    |          |
| Todo 400                          | Mantener Phase 98 puro. Semánticamente incorrecto (400 ≠ forbidden).                                              |          |

| Option                                                      | Description                                                        | Selected |
| ----------------------------------------------------------- | ------------------------------------------------------------------ | -------- |
| `{ error, message, code }` con `code='BRANCH_OUT_OF_SCOPE'` | Body estructurado para match exacto en frontend.                   | ✓        |
| `{ error, message }` sin code                               | Mismo shape que Phase 98. Frontend distingue por status + mensaje. |          |

| Option                          | Description                                        | Selected |
| ------------------------------- | -------------------------------------------------- | -------- |
| `request.log.warn` estructurado | Sigue D-17 Phase 98 (no Sentry para 4xx).          | ✓        |
| Sin log                         | Menos ruido pero ciego ante intentos sistemáticos. |          |

---

## Endpoint para sedes accesibles

| Option                                            | Description                                                             | Selected |
| ------------------------------------------------- | ----------------------------------------------------------------------- | -------- |
| Modificar `GET /admin/members/branches` existente | Filtra por scope. Todos los consumidores se actualizan automáticamente. | ✓        |
| Crear nuevo endpoint `/branches/accessible`       | Viejo queda devolviendo todas. Más endpoints, más decisión cliente.     |          |
| Query param `?scope=mine\|all`                    | Default: mine. Owner puede pedir all.                                   |          |

| Option                          | Description                         | Selected |
| ------------------------------- | ----------------------------------- | -------- |
| Owner respeta `?country=AR\|ES` | Consistente con Phase 98 D-02.      | ✓        |
| Owner ve siempre todas          | Más simple pero rompe consistencia. |          |

| Option                          | Description                                          | Selected |
| ------------------------------- | ---------------------------------------------------- | -------- |
| Templo Online siempre incluida  | Consistente con regla `if (branch.isVirtual) allow`. | ✓        |
| Solo si isVirtual matchea scope | Más estricto, contradice "global" del SPEC.          |          |

**Notes:** Durante esta área, el usuario cuestionó el modelo conceptual: "¿no se supone que todos los de un país ven lo que tiene ese país?". Hubo intercambio: primero acordamos simplificar (user_branches como info operativa, no restricción); luego el usuario corrigió: "el rol ES de seguridad, no se simplifica". **Decisión final**: user_branches ES restricción de seguridad (modelo SPEC original mantenido). Documentado como D-13 en CONTEXT.md.

---

## Permisos para gestionar staff cross-país

| Option                        | Description                                                                                             | Selected |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- | -------- |
| Solo owner                    | Crear/editar/desactivar staff es exclusivo de owner. Consistente con `/api/users` actual (OWNER_ROLES). | ✓        |
| owner + admin del mismo país  | admin de AR crea staff AR. Distribuye carga.                                                            |          |
| owner + admin sin restricción | admin crea staff de cualquier país. Liberal, riesgo.                                                    |          |

| Option                        | Description                                                     | Selected |
| ----------------------------- | --------------------------------------------------------------- | -------- |
| Solo sedes del país del staff | Form pide país primero, luego multi-select filtrado a ese país. | ✓        |
| Sedes de cualquier país       | Coach con sedes en AR + ES. Más flexible pero ambiguo.          |          |

| Option                                     | Description                                                      | Selected |
| ------------------------------------------ | ---------------------------------------------------------------- | -------- |
| Owner con `country = NULL` = acceso global | Sin tabla `user_countries`.                                      | ✓        |
| Owner con tabla `user_countries`           | Permite owners de N países pero no globales. Refactor adicional. |          |

---

## Claude's Discretion

- Naming exacto del archivo del helper (`branch-access.ts`, `authz.ts`, `scope-guards.ts`).
- Forma del API del helper Drizzle (firma exacta, retorno boolean vs throw).
- Componente Quasar exacto del multi-select de sedes (q-select multiple vs q-checkbox group) — UI-researcher en plan-phase.
- Si `requireBranchAccess` se exporta como named export desde `branch-access.ts` o como Fastify plugin separado.
- Logging key como string literal vs constante exportada.

## Deferred Ideas

- Tabla `countries` con metadata (nombre, moneda, timezone)
- Multi-país para admin/gestion (no solo owner)
- Owner restringido a N países (no global)
- Cache de scope o JWT con scope embebido
- Reorganización del menú admin por scope
- Migración histórica de qué sede atendió cada coach
- `user_branches` como metadata operativa (descartado durante discusión)
