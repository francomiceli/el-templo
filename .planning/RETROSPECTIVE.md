# Project Retrospective

_A living document updated after each milestone. Lessons feed forward into future planning._

## Milestone: v6.0 — Tenancy: El Templo pasa a ser tenant #1

**Shipped:** 2026-08-26 (en master `da8a308f` 2026-08-23; prod verificado al cierre)
**Phases:** 166-178 (incl. 174.1/175.1) | **Plans:** 178 | **Timeline:** 2026-07-26 → 2026-08-23

### What Was Built

- `tenants`/`tenant_settings` + `tenant_id NOT NULL` con FK en las 87 tablas gym-owned (migs 0190→0209), backfill `=1` con 0 discrepancias verificadas en staging y prod.
- Enforcement en 5 capas: scope server-side, helpers `tenantWhere`/`tenantValues` + `TenantContext`, sentinel de pool mysql2, lint CON-06 con allowlist-ratchet en CI, manifiesto de rutas fail-closed + batería ISO-03 (644/644).
- Adopción con switch a strict de todo el core (finance → members → subs → sched → analytics → resto) + mecanismo de módulos (flags, `requireModule`, registry de hooks).

### What Worked

- **El método fase 173** (modelo caro planifica/orquesta, `gsd-executor` sonnet ejecuta planes detallados en secuencia, orquestador verifica entre planes): 27 planes encadenados en la 173, replicado en 174-176. Los ejecutores encontraron ~15 bugs que los planes no anticipaban.
- **Gates fail-closed que cobran de verdad**: el manifiesto de rutas cazó rutas sin clasificar 24 h después de verificarse completo (2 veces); el ratchet del lint cazó accesos nuevos de staging; el gate de uniques destapó el drift de la 0091 (unique en MySQL nunca declarada en Drizzle).
- **El switch a strict como detector de bugs**: ~25 bugs reales cross-tenant cazados antes de que exista un tenant 2 (dashboard analytics mezclando gimnasios, `deriveCoveredUntilBatch` sin filtro, `qualifyFirstPayment` global, 500 en ab-results por scope ausente).
- **Rollout con señales humanas** (staging-first, 4 aprobaciones explícitas por tanda de migraciones): 20 migraciones a prod sin downtime ni rollback.

### What Was Inefficient

- **El doble estado master/staging durante semanas** (master pre-tenancy, staging con el tren v6.0) generó una cola de reconciliaciones (177, alta prorrateada, direct_debit, PDF daytype) y forks de `subscriptions/service.ts` que hubo que mergear a mano.
- **D6 diferido** (fixtures crudos sobre tablas strict) explotó todo junto en el primer CI del tren: 90 fallos, saldados en cadena 90→0 tocando 68 archivos de test.
- **Subagentes sonnet colgándose con suites en background** pese a la prohibición (loops de watch): costó varios TaskStop/kill hasta convertir la regla en "delegar EDIT-ONLY, la verificación la corre el orquestador".
- **Docs con lag**: 10 filas de traceability quedaron `Pending` meses después de que sus fases cerraran; se saldaron recién al cierre del milestone.

### Patterns Established

- Plan GSD detallado (must_haves + artefactos + verificación explícita) + ejecutor sonnet secuencial en worktree compartido = calidad de opus a fracción del costo.
- Enforcement de invariantes como **gate continuo de CI**, nunca verificación puntual (manifiesto, ratchet, verify-tenant/verify-uniques).
- Exenciones siempre **anotadas con motivo obligatorio y grepeables** (`tenant-safe:`, allowlists con docblock por entrada).
- Migraciones hand-written numeradas contra `_migrations` real, reservando bloque al arrancar cada fase.

### Key Lessons

1. Un gate que "no puede fallar de forma cara" (sentinel en modo log) se puede cerrar con limitación declarada; uno que sí puede (strict, uniques) exige demo del rojo en vivo.
2. Los tests de aislamiento tienen que probar la vista **sin** filtro natural (branchId undefined) — con branchId el aislamiento viene "gratis" y el tenantWhere queda sin cubrir.
3. A los ejecutores baratos: prohibir vitest en background, pasar lecciones acumuladas en el prompt, y revisar todo commit de docs que hagan en el checkout principal.
4. Cuando dos features en vuelo toman el mismo número de migración (179/180 con la 0209/0210), renumerar es costo fijo de cada tren — verificar el tope real antes de escribir SQL.

### Cost Observations

- Model mix: opus/fable para planning+orquestación+merges, sonnet para ejecución de planes y barridos (~460k tokens/plan en la 173).
- Notable: la cadena 173→176 corrió esencialmente autónoma con verificación entre planes; el gasto caro se concentró en decisiones, reconciliaciones de merge y checkpoints humanos.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases  | Key Change                                                                                     |
| --------- | ------- | ---------------------------------------------------------------------------------------------- |
| v5.4-v5.8 | 149-165 | Reforma white-label primero (secuencia de Nacho); trenes staging-first con UAT humana          |
| v6.0      | 166-178 | Método 173 (orquestador caro + ejecutores sonnet); gates fail-closed como enforcement continuo |

### Top Lessons (Verified Across Milestones)

1. Staging-first estricto + señales humanas explícitas escala hasta migraciones estructurales masivas (87 tablas) sin downtime.
2. La verificación puntual caduca en 24 h; solo los gates de CI mantienen un invariante vivo.
