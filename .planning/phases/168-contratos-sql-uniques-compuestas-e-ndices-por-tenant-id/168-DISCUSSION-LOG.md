# Phase 168: Contratos SQL — uniques compuestas e índices por `tenant_id` - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-27
**Phase:** 168-contratos-sql-uniques-compuestas-e-ndices-por-tenant-id
**Areas discussed:** Lookups pre-scope sin índice, Empaquetado y rollout, Lista gym-owned del assert CON-02, Anotación y test de las M8

---

## Lookups pre-scope sin índice

**P1 — ¿Índices secundarios no-unique en users tras componer las uniques?**

| Option                  | Description                                                                    | Selected |
| ----------------------- | ------------------------------------------------------------------------------ | -------- |
| Sí, los 3 (Recomendado) | INDEX(email), INDEX(dni), INDEX(referral_code) no-unique en la misma migración | ✓        |
| Solo email              | Login es el único camino caliente                                              |          |
| Ninguno                 | 7k filas, full scan irrelevante hoy                                            |          |

**P2 — ¿Extender el criterio al resto de las uniques convertidas?**

| Option                               | Description                                                   | Selected |
| ------------------------------------ | ------------------------------------------------------------- | -------- |
| Solo tablas que crecen (Recomendado) | users (×3) + campaign_unsubscribes.email; catálogos chicos no | ✓        |
| Regla mecánica: todas                | Toda unique convertida conserva INDEX sobre el valor          |          |
| Solo users                           | Lo ya decidido y nada más                                     |          |

**User's choice:** las dos recomendadas.

---

## Empaquetado y rollout

**P1 — Las FK de la 167 ya dejaron índice (tenant_id) auto-creado en las 87 tablas: ¿qué hace la parte "índices" de la tanda D?**

| Option                                  | Description                                                                            | Selected |
| --------------------------------------- | -------------------------------------------------------------------------------------- | -------- |
| FK cuentan, sin DDL extra (Recomendado) | Los auto-índices de FK satisfacen CON-02; el assert los cuenta; no dropear redundantes | ✓        |
| Limpiar redundantes                     | Dropear el auto-índice de FK en las tablas con unique compuesta                        |          |
| Explicitar todos                        | INDEX(tenant_id) nombrados en las 87 tablas                                            |          |

**P2 — ¿Cómo empaquetamos la migración?**

| Option                          | Description                                                    | Selected |
| ------------------------------- | -------------------------------------------------------------- | -------- |
| 1 migración: 0196 (Recomendado) | Toda la tanda D junta, estilo comentarios-narrativa de la 0192 | ✓        |
| 2 migraciones                   | Uniques con filo / índices mecánicos separados                 |          |

**P3 — ¿Rollout dentro de la fase?**

| Option                                | Description                                                                        | Selected |
| ------------------------------------- | ---------------------------------------------------------------------------------- | -------- |
| Staging+prod en la fase (Recomendado) | Patrón 166/167: worktree desde origin/master, staging → prod, pushes con OK previo | ✓        |
| Solo staging; prod después            | Gate manual posterior                                                              |          |

---

## Lista gym-owned del assert CON-02

**P1 — ¿Cómo define el assert qué tablas son gym-owned?**

| Option                                   | Description                                                                       | Selected |
| ---------------------------------------- | --------------------------------------------------------------------------------- | -------- |
| Lista estática fail-closed (Recomendado) | Clasifica TODAS las tablas; tabla sin clasificar = rojo; reutilizable por 170/171 | ✓        |
| Lista estática simple                    | Solo el array de las 87                                                           |          |
| Derivada de information_schema           | "Toda tabla con tenant_id" — no ancla nada                                        |          |

**P2 — ¿Dónde vive el módulo?**

| Option                                | Description                                                          | Selected |
| ------------------------------------- | -------------------------------------------------------------------- | -------- |
| src/db/tenant-tables.ts (Recomendado) | En runtime junto al schema; el sentinel de la 170 lo importa en prod | ✓        |
| src/modules/shared/tenant-tables.ts   | Junto al futuro tenant.ts de la 169                                  |          |
| test/ por ahora                       | La 170 lo movería después                                            |          |

**P3 — ¿Verificación también contra las bases reales?**

| Option                               | Description                                                                   | Selected |
| ------------------------------------ | ----------------------------------------------------------------------------- | -------- |
| Verificar staging+prod (Recomendado) | Patrón COL-02 de la 167 contra eltemplo_staging y eltemplo; SSH con OK previo | ✓        |
| Solo suite + smoke del deploy        | Sin evidencia de las bases reales                                             |          |

---

## Anotación y test de las M8

**P1 — ¿Dónde vive el motivo anotado de las 11 uniques globales?**

| Option                                   | Description                                                                               | Selected |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- | -------- |
| Central + comentario corto (Recomendado) | Lista M8 con motivo en tenant-tables.ts + una línea junto a cada unique en el schema file | ✓        |
| Solo central                             | Schema files limpios pero sin señal in situ                                               |          |
| Solo en schema files                     | Racional duplicado en 8 archivos                                                          |          |

**P2 — ¿Qué tan fuerte es el test de uniques?**

| Option                          | Description                                                                                                 | Selected |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------- |
| Fail-closed total (Recomendado) | Toda unique de tabla gym-owned: o arranca con tenant_id o está en la allowlist; nueva sin clasificar = rojo | ✓        |
| Solo las 11 M8                  | Verificación puntual                                                                                        |          |

---

## Claude's Discretion

- Forma exacta del módulo `tenant-tables.ts`, nombres de índices/constraints, ubicación de los tests en la suite.
- Mecánica DDL fina (DROP/ADD atómico, INPLACE, casos donde la FK exija pasos separados).
- Helpers mínimos de seeding del tenant 2 para los tests de CON-01 (sin adelantar los fixtures de la 171).

## Deferred Ideas

- Limpieza cosmética de los índices de FK redundantes bajo las uniques compuestas (post-v6.0).
- Ambigüedad de login con emails duplicados cross-tenant (decisión diferida del diseño login/dominios).
- Uniques de módulos Templo (M5, slugs, catálogos SPOM) — deuda consciente.
- Todo `v51-milestone-data-rollout.md` revisado y NO foldeado (rollout de datos v5.1, sin relación; ya descartado en la 166).
