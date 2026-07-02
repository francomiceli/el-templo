# Phase 149: Nav por categorías + RBAC - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-02
**Phase:** 149-Nav por categorías + RBAC
**Areas discussed:** Mapeo de roles negocio→enum, Mecanismo de gateo Templo, Planes read-only para profe, Estructura visual del nav

---

## Mapeo de roles negocio→enum

| Option                   | Description                                                | Selected         |
| ------------------------ | ---------------------------------------------------------- | ---------------- |
| 2 niveles estrictos      | Dueño = owner+admin; empleado = coach+gestion+recepcion    | ✓ (con agregado) |
| Gestion queda intermedio | Solo coach/recepcion bajan; gestion conserva acceso actual |                  |
| Gestion sube a dueño     | Dueño = owner+admin+gestion                                |                  |

**User's choice:** "2 niveles estrictos + que para el templo gestion pueda ver reportes y deudas"
**Notes:** La excepción de gestion es Templo-only, no core white-label.

| Option                                | Description                                  | Selected         |
| ------------------------------------- | -------------------------------------------- | ---------------- |
| Deudas solo dueño                     | Dentro de Finanzas el profe ve SOLO Pagos    | ✓ (con agregado) |
| Empleado conserva Deudas simplificado | Tab simplificado visible para coach/empleado |                  |

**User's choice:** "Solo dueño, excepto para El Templo: el profe ve el Deudas simplificado, pero SÓLO lo ve el coach del Templo y nadie más"
**Notes:** Aclarado en follow-up: "todos los coaches de El Templo" — excepción por tenant/deployment, NO por persona (distinto de canAccessTraining por email).

| Option                      | Description                                               | Selected |
| --------------------------- | --------------------------------------------------------- | -------- |
| Frontend + API consistentes | Donde un rol pierde acceso en nav, el guard API se ajusta | ✓        |
| Solo frontend en 149        | API queda como está salvo abrir GET /plans a coach        |          |

**User's choice:** Frontend + API consistentes

---

## Mecanismo de gateo Templo

| Option                    | Description                                                  | Selected |
| ------------------------- | ------------------------------------------------------------ | -------- |
| Config central en código  | templo-config.ts (admin) + extensión de permissions.ts (API) | ✓        |
| Feature flags por env var | TEMPLO*FEATURES / VITE_TEMPLO*\* por deployment              |          |
| Solo por rol, sin flag    | Gatear owner-only sin marcar "esto es Templo"                |          |

**User's choice:** Config central en código

| Option                        | Description                                  | Selected |
| ----------------------------- | -------------------------------------------- | -------- |
| Sección "Templo" al final     | Sección propia del drawer, gate Templo + rol | ✓        |
| Sin entrada de nav            | Rutas solo por URL directa                   |          |
| Mezcladas en las 4 categorías | Contradice NAV-04                            |          |

**User's choice:** Sección "Templo" al final

| Option                  | Description                                         | Selected |
| ----------------------- | --------------------------------------------------- | -------- |
| Sí, a la sección Templo | Entrenamiento se muda manteniendo canAccessTraining | ✓        |
| No se toca en 149       | Queda como sección propia arriba                    |          |

**User's choice:** Entrenamiento se muda a la sección Templo

---

## Planes read-only para profe

| Option                       | Description                                          | Selected |
| ---------------------------- | ---------------------------------------------------- | -------- |
| Misma PlanesPage sin edición | Condicionada por rol, sin botones/dialogs de edición | ✓        |
| Vista catálogo separada      | Página nueva simplificada para mostrador             |          |

**User's choice:** Misma PlanesPage sin edición

| Option                             | Description                                         | Selected |
| ---------------------------------- | --------------------------------------------------- | -------- |
| Planes de pago + promos            | Lo que el profe necesita en mostrador; Programas NO | ✓        |
| Solo planes de pago                | Sin promos                                          |          |
| Todo (planes + promos + programas) | Adelanta visibilidad de superficie que la 156 gatea |          |

**User's choice:** Planes de pago + promos

**Notes:** Hallazgo de código compartido durante el área: la API hoy deja al coach escribir planes (guard module-wide `SUBSCRIPTION_ROLES` sin guards extra en POST/PUT/PATCH) — se cierra en esta fase (D-11).

---

## Estructura visual del nav

| Option                            | Description                      | Selected |
| --------------------------------- | -------------------------------- | -------- |
| Categorías expandibles            | q-expansion-item por categoría   |          |
| Headers + items planos (como hoy) | Mismo patrón actual, re-agrupado | ✓        |
| Dos niveles (categoría → submenu) | Segundo nivel o página hub       |          |

**User's choice:** Headers + items planos, como hoy

| Option                                    | Description | Selected     |
| ----------------------------------------- | ----------- | ------------ |
| Config Caja→Finanzas; resto→Configuración |             |              |
| Todo en "Configuración"                   |             | ✓ (variante) |
| Quedan como hoy (Administracion)          |             |              |

**User's choice:** "Config de caja no es nada creo, que desaparezca y que los otros queden en 'configuración'"
**Notes:** Verificado: ConfiguracionCajaPage tiene un solo setting ("Umbral de pendientes (días)", fase 142). Follow-up: el usuario eligió **borrar el setting también** (queda default hardcodeado). Notificaciones + Usuarios → sección "Configuración".

| Option                         | Description                           | Selected |
| ------------------------------ | ------------------------------------- | -------- |
| Empleado→Cobros; dueño→Alumnos | Fran Scaine sigue cayendo en Sesiones | ✓        |
| Todos → Alumnos                |                                       |          |
| Dueño → Caja                   |                                       |          |

**User's choice:** Empleado→Cobros; dueño→Alumnos

| Option                         | Description                         | Selected |
| ------------------------------ | ----------------------------------- | -------- |
| Dentro de Planes, dueño-only   | La fase 156 decide su destino final | ✓        |
| Directo a la sección Templo ya | Adelanta scope de la 156            |          |

**User's choice:** Programas dentro de Planes, dueño-only

---

## Claude's Discretion

- Naming de la sección Templo y de la sección Configuración.
- Íconos y orden interno de items por categoría.
- Implementación de la redirección por rol (guard vs redirect dinámico).
- Estructura interna de templo-config.ts / extensión de permissions.

## Deferred Ideas

- Destino final de Programas como subcategoría Templo → fase 156.
- Todo revisado y NO incorporado: `v51-milestone-data-rollout.md` (rollout de datos v5.1, sin relación con nav/RBAC).
