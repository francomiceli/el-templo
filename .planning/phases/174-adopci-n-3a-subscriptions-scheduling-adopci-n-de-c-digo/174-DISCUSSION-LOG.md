# Phase 174: Adopción 3a — `subscriptions` + `scheduling`: adopción de código - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-09
**Phase:** 174-Adopción 3a — `subscriptions` + `scheduling`: adopción de código
**Areas discussed:** Rebanado en planes, Frontera de deuda 174 vs 175, Red de seguridad del pricing, ctx del cron/member-facing

---

## Rebanado en planes

| Option                   | Description                                                                                                                                                                    | Selected |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Por flujo, ~5-6 planes   | subs lecturas+lifecycle / subs pricing con golden / scheduling booking-service / scheduling service+activities+holidays+exceptions / attendance / cierre deudas 173. Techo ~6. | ✓        |
| Por módulo, 2-3 gordos   | subscriptions / scheduling / attendance. Riesgo del tamaño que hizo inmanejable la 173.                                                                                        |          |
| Por tabla, ~10-13 chicos | Un plan por tabla. Reintroduce la trampa de la 173 (demasiados planes en cadena).                                                                                              |          |

**User's choice:** Por flujo, ~5-6 planes.
**Notes:** Franco preguntó si esto convertía la 174 en 3 fases nuevas — se aclaró la distinción **plan** (paso ejecutable dentro de una fase, como la 173 tuvo 31 planes) vs **fase** (unidad del roadmap). El rebanado es interno a la 174; la 174.1 sigue siendo su propia fase, intacta.

---

## Frontera de deuda 174 vs 175

| Option                      | Description                                                                                                                                                                                         | Selected |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Solo lo de subs/sched       | 174 salda autoExpire ctx, inserts de estos módulos, holidays, one-liner program_enrollments. getReferralOverview / computeReferralDiscountPercent / activeMemberExists / FK user_branches → NO 174. | ✓        |
| Todo el criterio #3 literal | Saldar también activeMemberExists y threadear ctx a referrals. Mete trabajo de referrals (no strict) en una fase de subs/sched.                                                                     |          |
| Mínimo estricto             | Solo autoExpire ctx, sin cross-módulo ni program_enrollments.                                                                                                                                       |          |

**User's choice:** Solo lo de subs/sched.
**Notes:** El scout confirmó que `getReferralOverview` ya tiene ctx (deuda de referrals), `activeMemberExists` es un predicado puro no usado por subs/sched (criterio #3 lo atribuye mal), y `class_coach_assignments` no se usa acá. La FK de user_branches es hardening de schema, no adopción de código.

---

## Red de seguridad del pricing

| Option                     | Description                                                                                                                                 | Selected |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Golden antes/después       | Characterization tests (inputs → mismo número) para assign/change/renew + 2 previews, incl. combos, ANTES de tocar. Acceptance = diff cero. | ✓        |
| Confiar en suite existente | >60 casos ya cubren single-tenant; solo agregar fixture de segundo tenant.                                                                  |          |
| Golden + caso cross-tenant | Golden Y test de precio cross-tenant. El caso cross-tenant es naturalmente de la 174.1.                                                     |          |

**User's choice:** Golden antes/después.
**Notes:** El pricing está replicado inline en 3 métodos (no hay función central), y ningún test existente es multi-tenant → el golden explícito es la red. El caso cross-tenant queda para la 174.1.

---

## ctx del cron/member-facing (autoExpireSubscriptions)

| Option                    | Description                                                                                                                                  | Selected |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| ctx real + excepción cron | ctx real member-facing (~8 call sites) + restaurar assertBranchDelGimnasio; UNA excepción tenant-safe documentada para el cron cross-tenant. | ✓        |
| ctx hasta el cron         | Derivar ctx por-tenant en el barrido. Cero excepciones pero artificial (expirar es legítimamente global).                                    |          |
| Dejar para 174.1          | Guards provisorios como están; decidir en el switch. Concentra riesgo en la 174.1.                                                           |          |

**User's choice:** ctx real + excepción cron.
**Notes:** Cerrar el camino member-facing obliga a threadear ctx hasta `scheduling/booking-service.ts:137` — la razón concreta de que la fase cruce a scheduling. El cron (`autoExpireDueSubscriptions`) es legítimamente cross-tenant → una única exención tenant-safe registrada, no un agujero, para que la 174.1 vaya strict.

## Claude's Discretion

- Descomposición exacta en planes (nombres, límites de `files_modified`, orden) → planner, con el criterio de D-01.
- Forma técnica del tag `tenant-safe` para el cron (comentario vs marca embebida en SQL) → según lo que ya leen sentinel/lint.

## Deferred Ideas

- getReferralOverview + interior de computeReferralDiscountPercent → fase de referrals (175+).
- activeMemberExists con tenantWhere en callers → fase de analytics/reports (175).
- FK compuesta de user_branches → hardening de schema aparte.
- Barrido general de los 58 inserts sin tenantValues fuera de subs/sched → su módulo.
- Batería de aislamiento, allowlist en cero, switch strict, test de precio cross-tenant → fase 174.1.
