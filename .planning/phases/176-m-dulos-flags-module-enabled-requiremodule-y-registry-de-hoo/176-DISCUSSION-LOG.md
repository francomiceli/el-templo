# Phase 176: Módulos — flags `module.*.enabled`, `requireModule` y registry de hooks - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-20
**Phase:** 176-Módulos — flags, requireModule y registry de hooks
**Areas discussed:** Logística del tren, Alcance composition root, Marketing público sin tenant, Frontend admin (§6)

---

## Logística del tren

| Option                       | Description                                                                                                | Selected      |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------- |
| Worktree nuevo desde el tren | Rama feat/176-modulos desde el HEAD del tren (2a4f5c92); la 176 va como segunda ola sin retrasar la Fase C | ✓ (con matiz) |
| Sumar al tren et-173         | Ejecutar directo en et-173 y re-pushear staging con todo junto                                             |               |
| Esperar Fase C               | No ejecutar hasta que el tren esté en master                                                               |               |

**User's choice:** Worktree nuevo desde el tren.
**Notes:** Franco aportó que otro agente ya validó staging como apto para master. Matiz sobre el viaje: quiere la 176 en staging y después TODO v6.0 junto (incluida la 176) a master — la Fase C espera a la 176. Verificado en discusión: `2a4f5c92` incluye el saldado D6 (`16177e5d`) y es ancestro de `origin/staging` (`41f1bd7a`).

---

## Alcance composition root

| Option                | Description                                                                                                                       | Selected |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Híbrido               | Hooks de los 4 módulos + rutas ModuleDef de marketing/onboarding/gamification; los 7 plugins fp de SPOM quedan in-place con guard | ✓        |
| Mínimo guard-in-place | modules-boot.ts solo con hooks; los ~14 registros quedan en app.ts                                                                |          |
| Migración completa    | Los 4 módulos exportan ModuleDef; app.ts pierde los ~14 registros                                                                 |          |

**User's choice:** Híbrido (recomendada).
**Notes:** Coherente con doc 04 §5 ("los de SPOM pueden migrar al manifest gradualmente").

---

## Marketing público sin tenant

| Option                            | Description                                                                                          | Selected |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- | -------- |
| Default tenant 1                  | Helper explícito que resuelve tenant 1 en rutas públicas; guard cubre el 100%; Host-mapping diferido | ✓        |
| Resolución por Host ya            | Mapeo dominio→tenant + middleware desde el día 1                                                     |          |
| Reclasificar públicas como global | Sin guard en las públicas; solo admin CRUD gateado                                                   |          |

**User's choice:** Default tenant 1 (recomendada).
**Notes:** Vacío detectado por el scout: attachScope requiere JWT, las públicas de blog/academy/app-landing no lo tienen.

---

## Frontend admin (§6)

| Option             | Description                                                                           | Selected |
| ------------------ | ------------------------------------------------------------------------------------- | -------- |
| API-only           | enabledModules en /me; nav del admin y reemplazo del hack canAccessTraining diferidos | ✓        |
| §6 completo        | API + nav gateado + reemplazo del hack por templo-training ON + RBAC                  |          |
| Diferir todo el §6 | 100% backend puro, sin enabledModules                                                 |          |

**User's choice:** API-only (recomendada).
**Notes:** Reemplazar el hack cambia quién ve el nav de training — decisión de producto a validar con Nacho aparte.

---

## Claude's Discretion

- Verificación byte-idéntica del pricing (estrategia de tests golden) — researcher/planner.
- Coordinación con forks pendientes de `subscriptions/service.ts` (177 D-13, alta prorrateada).
- Dónde se montan realmente las rutas de aura (el manifiesto cuenta solo 1 ruta gamification).
- Numeración de la migración del seed de flags.

## Deferred Ideas

- Gating del nav del admin por módulo + reemplazo del hack `canAccessTraining` (producto, con Nacho).
- Resolución de tenant por Host/dominio para rutas públicas.
- Migración de los 7 plugins fp de SPOM al formato ModuleDef.
- Promover flags KV a tabla `tenant_modules` si aparece billing.
- Todo revisado no incorporado: `v51-milestone-data-rollout.md` (falso positivo por "milestone").
