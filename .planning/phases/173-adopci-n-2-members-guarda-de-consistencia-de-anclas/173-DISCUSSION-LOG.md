# Phase 173: Adopción 2 — `members` + guarda de consistencia de anclas - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-04
**Phase:** 173-adopci-n-2-members-guarda-de-consistencia-de-anclas
**Areas discussed:** Frontera del strict de `users`, Forma del invariante de anclas (ADO-07), Deudas heredadas de la 172, Base de rama y secuencia

---

## Frontera del strict de `users`

### ¿La tabla `users` entra a `TENANT_STRICT_MODULES` en esta fase?

| Opción                                        | Descripción                                                                                              | Elegida |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------- |
| Sí — strict completo                          | Las 79 entradas salen; `users` + las 7 tablas propias a strict; cirugía mínima en los 50 archivos ajenos | ✓       |
| No — solo las 7 tablas propias                | `users` conserva sus 50 entradas y entra a strict en una fase de cierre post-175                         |         |
| Sí, pero migrando los archivos ajenos enteros | Vaciaría de contenido a 174/175 y haría la fase imposible de verificar como unidad                       |         |

**Notas:** Franco aceptó explícitamente que esta sea la fase más grande del milestone. Argumento decisivo: el gate D-15 no admite intermedio (tabla strict con entradas vivas = CI rojo), y diferir dejaría a 174/175 escribiendo queries nuevas sobre `users` sin red.

### ¿Cómo salen de la allowlist los scripts de `src/db/`?

| Opción                                        | Descripción                                                           | Elegida |
| --------------------------------------------- | --------------------------------------------------------------------- | ------- |
| Retrofit `requireTenant` a todos              | Misma receta que el piloto aplicó a `backfill-historical-payments.ts` | ✓       |
| Retrofit a los vivos, exención a los one-shot | Ahorra trabajo sobre código muerto pero mete 4 exenciones nuevas      |         |
| Claude decide según el inventario             | Clasificación script por script                                       |         |

### ¿Las rutas member-facing entran a la batería ISO-03?

| Opción                                         | Descripción                                                       | Elegida |
| ---------------------------------------------- | ----------------------------------------------------------------- | ------- |
| No — batería por prefijo del módulo (29 rutas) | Plantilla del piloto; las rutas ajenas reciben su caso en su fase | ✓       |
| Sí — toda ruta que toque `users`               | Sería la batería de las tres fases juntas                         |         |
| Intermedio — solo las que escriben `users`     | Autorregistro, wellhub, check-in por QR                           |         |

### ¿Qué se fotografía antes de migrar?

| Opción                                   | Descripción                                                                            | Elegida |
| ---------------------------------------- | -------------------------------------------------------------------------------------- | ------- |
| Snapshot de listados y exports           | Reusa `snapshot-finance-endpoints.ts` cambiando `ENDPOINTS`; JSON fuera del repo, 0600 | ✓       |
| Snapshot + conteos SQL por estado y sede | Cazaría un JOIN que pase a INNER                                                       |         |
| Solo suite verde + UAT                   | Sin snapshot                                                                           |         |

---

## Forma del invariante de anclas (ADO-07)

### ¿Dónde vive el invariante?

| Opción               | Descripción                                                                                                            | Elegida |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------- |
| App + contrato en DB | Helper en los 12 sitios + `user_branches` + cron, MÁS unique `(tenant_id, id)` en `branches` y FK compuesta en `users` | ✓       |
| Solo a nivel app     | Literal lo que pide el SC2; deja fuera scripts y SQL crudo                                                             |         |
| Solo contrato en DB  | El staff vería un error de FK crudo en vez del rechazo explícito                                                       |         |

**Notas:** Introduce la única migración de la fase (bloque desde 0198).

### ¿Qué contesta la API ante una sede de otro gimnasio?

| Opción                        | Descripción                                                   | Elegida |
| ----------------------------- | ------------------------------------------------------------- | ------- |
| 404 / sede inexistente        | Contrato D-09 del piloto para todo el milestone               | ✓       |
| 400 con mensaje de validación | Cumple solo si el mensaje es idéntico al de un id inexistente |         |
| Claude decide ruta por ruta   | Según la rama not-found existente de cada una                 |         |

### ¿Cómo cumple el cron el SC3?

| Opción                           | Descripción                                                       | Elegida |
| -------------------------------- | ----------------------------------------------------------------- | ------- |
| Filtro + guarda antes del UPDATE | Saltea al socio, loguea con `tenantId` estructurado, nunca aborta | ✓       |
| Solo el filtro por gimnasio      | Nada cazaría una reescritura futura en el punto de escritura      |         |
| Guarda que aborta el barrido     | Dejaría un gimnasio entero sin recategorizar por un dato raro     |         |

### ¿Hasta dónde llega la guarda?

| Opción                                                   | Descripción                                                       | Elegida |
| -------------------------------------------------------- | ----------------------------------------------------------------- | ------- |
| El ancla y sus tablas                                    | `users.branch_id` + `user_branches.branch_id` — lo que nombra M10 | ✓       |
| Toda escritura de `branch_id` del sistema                | Metería a la 173 en tablas de scheduling y finance                |         |
| El ancla ahora, el resto como regla escrita en el doc 07 |                                                                   |         |

---

## Deudas heredadas de la 172

### WR-01 — autorregistro con `insert(users)` en el DEFAULT 1

| Opción                          | Descripción                                                                                  | Elegida |
| ------------------------------- | -------------------------------------------------------------------------------------------- | ------- |
| Fix + test dirigido de la ruta  | Estampa `tenantId: branchTenantId` y verifica que el usuario nazca en el gimnasio de la sede | ✓       |
| Solo el fix, sin test propio    |                                                                                              |         |
| Fix + entra a la batería ISO-03 | Abriría la batería a otro prefijo                                                            |         |

### Fuga de `getMemberSubscription` y `assignPlan` sin `tenantValues`

| Opción                         | Descripción                                                                                | Elegida |
| ------------------------------ | ------------------------------------------------------------------------------------------ | ------- |
| Acá, las dos                   | El ancla de `iso-03-finance-coach-load.test.ts:1326` se pone en rojo y hay que desmarcarla | ✓       |
| Se difieren a la 174           | `subscriptions/service.ts` se reescribe entero allá                                        |         |
| Solo la fuga del autocompletar |                                                                                            |         |

### `canAccessBranch` decide por país

| Opción                                 | Descripción                                                                                         | Elegida |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- | ------- |
| Sí — es la hermana de ADO-07           | El país deja de ser el aislador; el doc 07 lo marca como "el aislador alternativo que nadie nombra" | ✓       |
| No — viaja con auth/settings en la 175 |                                                                                                     |         |

### WR-02 e IN-02

| Opción                              | Descripción                                                                        | Elegida |
| ----------------------------------- | ---------------------------------------------------------------------------------- | ------- |
| Los dos                             | `tenantWhere` al ON del join; el snapshot deja de cortar la paginación en silencio | ✓       |
| Solo IN-02 (el script que reusamos) |                                                                                    |         |
| Ninguno — quedan advisory           |                                                                                    |         |

---

## Base de rama y secuencia

**Aporte del usuario, sin pregunta previa:** "todas las fases que quedan de este milestone se resuelven en staging y van todas juntas a master cuando estén listas". Fija base y destino de 173/174/175 y explica por qué la 173 no puede seguir la letra de la receta (worktree desde `origin/master`).

### ¿Hay gate de secuencia antes del worktree?

| Opción                                      | Descripción                                                                        | Elegida |
| ------------------------------------------- | ---------------------------------------------------------------------------------- | ------- |
| Backmerge master→staging primero            | Master tiene `f77e05b4`, que toca `members/routes.ts` y `schemas.ts` (+150 líneas) | ✓       |
| Arrancar ya, resolver al mergear            | Paga el conflicto con el diff de la fase encima                                    |         |
| Backmerge + esperar también a domiciliación | Bloquearía el arranque en un UAT ajeno                                             |         |

### ¿Qué número reserva la migración?

| Opción                             | Descripción                                                   | Elegida |
| ---------------------------------- | ------------------------------------------------------------- | ------- |
| 0198 en adelante                   | Respeta el 0197 de domiciliación aunque aún no esté en master | ✓       |
| 0198, en dos migraciones separadas |                                                               |         |
| Claude decide al planificar        |                                                               |         |

### ¿Cuándo se hace el UAT del staff?

| Opción                                                     | Descripción                                                                               | Elegida |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------- |
| Después del merge a staging, como el piloto                | CI verde + diff de snapshot vacío, y recién ahí el staff prueba contra staging desplegado | ✓       |
| Antes del merge, con la rama desplegada                    | El repo no despliega ramas de fase hoy                                                    |         |
| Suite + snapshot alcanzan, UAT como confirmación posterior |                                                                                           |         |

---

## Claude's Discretion

- Reparto de planes/olas respetando el orden de 9 pasos del doc 07 §2, con `test/` presupuestado como bloque propio.
- Nombre y forma exacta del helper del invariante; una o dos migraciones.
- Criterio para derivar "ruta de members" del manifiesto en el gate de cobertura y organización de los archivos de batería.
- Selección fina de endpoints y rango de fechas del snapshot.
- Ids de tenants ad-hoc en tests nuevos.

## Deferred Ideas

- Migración completa de analytics, scheduling, subscriptions (más allá de las deudas), notificaciones, campañas, referidos, wellhub y entrenamiento — 174/175.
- Casos de aislamiento de las rutas member-facing y de `POST /api/auth/register` como `describe` de batería.
- Guarda de `branch_id` sobre tablas no-ancla — 174/175, y documentarla en el doc 07.
- `aura_balances`/`aura_transactions` en strict — con gamification.
- Remover el `DEFAULT 1` de `tenant_id` — post-adopción completa.
- Endurecer el sentinel de prod (log → throw).
- Onboarding del gimnasio nuevo: sede virtual "Templo Online" propia (doc 07 §1.4).
- Chip "Pendiente" hardcodeado en `CobrosPage.vue:70`.

### Reviewed Todos (not folded)

- `v51-milestone-data-rollout.md` — falso positivo por keywords; ya descartado en las fases 166, 169, 170 y 172.
