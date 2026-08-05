# Phase 172: Adopción 1 (piloto) — `finance` - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-30
**Phase:** 172-adopci-n-1-piloto-finance
**Areas discussed:** Frontera del strict cross-módulo, Alcance de tablas y del módulo, Batería ISO-03 (plantilla), Criterio 'mismos números'

---

## Frontera del strict cross-módulo

### P1 — Accesos a tablas finance desde otros módulos

| Option                              | Description                                                                                                                | Selected |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------- |
| Migrar todo acceso                  | Toda query sobre las 6 tablas recibe scope y pasa por helpers, esté donde esté; solo cambian los métodos que tocan finance | ✓        |
| Strict parcial por tabla            | Throw solo para tablas que ningún otro módulo toca; diferir el resto                                                       |          |
| Abrir canal de exención en sentinel | Skiplist por-sitio (la 170 lo descartó deliberadamente)                                                                    |          |

### P2 — `scripts/backfill-historical-payments.ts`

| Option                              | Description                                                             | Selected |
| ----------------------------------- | ----------------------------------------------------------------------- | -------- |
| Retrofit requireTenant              | Receta 169 D-06, ejemplar seed-onboarding-aura.ts; sale de la allowlist | ✓        |
| Evaluar si está obsoleto y borrarlo | Si es one-shot ya corrido, borrar elimina 3 entradas                    |          |
| Exención tenant-safe                | Solo calma al lint; el sentinel en dev lo revienta igual                |          |

### P3 — Momento de activación del throw

| Option                      | Description                                                              | Selected |
| --------------------------- | ------------------------------------------------------------------------ | -------- |
| Al final + demo fail-closed | Migrar todo primero; último plan activa strict + sonda en vivo revertida | ✓        |
| Al principio (red-driven)   | Suite roja como lista de tareas — rompe commits atómicos verdes          |          |
| Incremental por tabla       | N commits de activación, estado final difuso                             |          |

### P4 — Firma estándar de la receta

| Option                     | Description                                                                                    | Selected |
| -------------------------- | ---------------------------------------------------------------------------------------------- | -------- |
| TenantContext plano        | Primer parámetro; assertTenant en el call site del handler (precedente cash-register/tv claim) | ✓        |
| Scope completo del request | Deja country/branch disponibles pero fabrica scopes falsos desde crons                         |          |
| Vos decidís por método     | Discreción del planner caso a caso                                                             |          |

---

## Alcance de tablas y del módulo

### P1 — Tablas de la entrada strict

| Option                                  | Description                                                                                                     | Selected |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------- |
| Las 6 del ROADMAP                       | financial_transactions, transaction_links, balances, cash_registers, cost_centers, debt_management; AURA afuera | ✓        |
| Las 6 + aura_balances/aura_transactions | Arrastraría la migración de gamification a esta fase                                                            |          |

### P2 — Accesos del módulo finance a tablas no-finance

| Option              | Description                                                                      | Selected |
| ------------------- | -------------------------------------------------------------------------------- | -------- |
| Scopear de paso     | Cero entradas de src/modules/finance/ al cerrar; esas tablas no entran en strict | ✓        |
| Solo tablas finance | Archivos a medio migrar, dos pasadas sobre el mismo código                       |          |

### P3 — Archivos de otros módulos

| Option               | Description                                                       | Selected |
| -------------------- | ----------------------------------------------------------------- | -------- |
| Solo accesos finance | Cirugía mínima; migrar el resto es la fase de su módulo (173-175) | ✓        |
| De paso también ahí  | Convertiría el piloto en migración de 5 módulos a la vez          |          |

---

## Batería ISO-03 (plantilla)

### P1 — Generación de la batería

| Option                           | Description                                                        | Selected |
| -------------------------------- | ------------------------------------------------------------------ | -------- |
| Casos a mano + gate de cobertura | Seeding propio por ruta + gate fail-closed derivado del manifiesto | ✓        |
| 100% generado del manifiesto     | Genérico; seeding y asserts no genericizables — falsos verdes      |          |
| Solo rutas de mayor riesgo       | ISO-03 pide ruta por ruta; el gate del milestone depende de esto   |          |

### P2 — Contrato de respuesta cross-tenant

| Option                | Description                                                          | Selected |
| --------------------- | -------------------------------------------------------------------- | -------- |
| 404/vacío — no existe | Indistinguible de inexistente; sale gratis con tenantWhere           | ✓        |
| 403 explícito         | Filtra existencia y exige la query sin scope que el sentinel prohíbe |          |

### P3 — Actores de los casos

| Option                       | Description                                         | Selected |
| ---------------------------- | --------------------------------------------------- | -------- |
| Rol mínimo real por ruta     | coach/owner/admin según la ruta; precedente 169-08  | ✓        |
| Admin del tenant A para todo | Más simple, verde más débil en caminos RBAC por rol |          |

### P4 — Documentación de la receta

| Option                                | Description                                                       | Selected |
| ------------------------------------- | ----------------------------------------------------------------- | -------- |
| Doc nuevo en .docs/saas-multitenancy/ | 07-receta-adopcion.md al cerrar la fase; canonical ref de 173-175 | ✓        |
| Docblock del test + SUMMARY           | Receta repartida; SUMMARYs no se releen enteros                   |          |

---

## Criterio 'mismos números'

### P1 — Mecanismo de comparación

| Option                          | Description                                                               | Selected |
| ------------------------------- | ------------------------------------------------------------------------- | -------- |
| Script de snapshot de endpoints | Endpoints agregadores con rango fijo; JSON antes/después, diff versionado | ✓        |
| Agregados SQL directos          | Compara la fuente, no las queries migradas                                |          |
| UAT manual de Franco            | No queda comparación explícita versionada                                 |          |

### P2 — Secuencia con CR-CAJA

| Option                         | Description                                                                               | Selected |
| ------------------------------ | ----------------------------------------------------------------------------------------- | -------- |
| CR-CAJA primero                | Terminar y shippear el fix antes del execute; la 172 arranca de un master que ya lo tiene | ✓        |
| 172 primero, CR-CAJA después   | Rebase doloroso del fix sobre firmas cambiadas                                            |          |
| En paralelo, resolver al merge | Mismos archivos, mismas funciones — máximo riesgo                                         |          |

---

## Claude's Discretion

- Reparto de planes/waves (respetando throw al final y commits verdes).
- Forma exacta del gate de cobertura (criterio "ruta finance" del manifiesto) y organización de archivos de test.
- Endpoints y rango del script de snapshot; ubicación del script.
- Plumbing del TenantContext a métodos ajenos sin cambiar más firma que la necesaria.
- Ids de tenants ad-hoc en tests nuevos (convención 90169/90269/90369/90469/90671).

## Deferred Ideas

- Migración del resto de analytics/reports/subscriptions/members/coach → fases 173-175.
- Tablas AURA en strict → adopción de gamification.
- Remover `DEFAULT 1` de `tenant_id` → post-adopción completa (no roadmapeado).
- Endurecer sentinel de prod (log → throw) → pospuesto por diseño.
