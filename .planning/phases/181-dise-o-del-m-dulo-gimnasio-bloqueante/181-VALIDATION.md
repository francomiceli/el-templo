---
phase: 181
slug: dise-o-del-m-dulo-gimnasio-bloqueante
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-27
---

# Phase 181 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
>
> **Nota:** esta fase entrega un documento Markdown (`.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md`); no hay comportamiento ejecutable que testear. Las verificaciones son deterministas sobre el artefacto — no se inventan tests de unidad para un `.md` (ver `181-RESEARCH.md` §Validation Architecture).

---

## Test Infrastructure

| Property               | Value                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------- |
| **Framework**          | Ninguno aplica al entregable (el repo usa vitest, irrelevante para esta fase)      |
| **Config file**        | none — no se instala nada                                                          |
| **Quick run command**  | `pnpm exec prettier --check .docs/saas-multitenancy/08-diseno-modulo-gimnasio.md`  |
| **Full suite command** | n/a — la fase no toca código; la suite de la API no puede regresionar por un `.md` |
| **Estimated runtime**  | ~2 seconds                                                                         |

---

## Sampling Rate

- **After every task commit:** `pnpm exec prettier --check` sobre el doc (coincide con el pre-commit).
- **After every plan wave:** greps estructurales del mapa de abajo (como `verification` de la tarea o script chico).
- **Before `/gsd:verify-work`:** greps estructurales verdes + doc formateado.
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID                 | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type        | Automated Command                                                                                                 | File Exists | Status     |
| ----------------------- | ---- | ---- | ----------- | ---------- | --------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------- | ----------- | ---------- |
| TBD (el planner asigna) | —    | —    | DIS-01      | —          | N/A             | grep estructural | `grep -c '^## Definición' .docs/saas-multitenancy/08-diseno-modulo-gimnasio.md` → 7                               | ❌ W0       | ⬜ pending |
| TBD                     | —    | —    | DIS-01      | —          | N/A             | grep estructural | `grep -oE '\b(CAT\|RUT\|REG\|VAL\|EVO\|PROF\|PLAT\|ONB)-[0-9]{2}\b' <doc> \| sort -u \| wc -l` ≥ 1 por definición | ❌ W0       | ⬜ pending |
| TBD                     | —    | —    | DIS-02      | —          | N/A             | grep literal     | `grep -q 'el-templo-app' <doc> && grep -qi 'no se transforma' <doc>`                                              | ❌ W0       | ⬜ pending |
| TBD                     | —    | —    | DIS-02      | H-4        | N/A             | grep literal     | `grep -qi 'split' <doc>` (constancia explícita del trigger)                                                       | ❌ W0       | ⬜ pending |
| TBD                     | —    | —    | Todos       | —          | N/A             | prettier         | `pnpm exec prettier --check <doc>`                                                                                | ✅          | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] Los greps estructurales de arriba embebidos como `verification` de la(s) tarea(s) que escriben el doc (o un `.sh` chico, a criterio del planner — mismo determinismo).
- [ ] **No** instalar framework de tests: no hay código en esta fase.

---

## Manual-Only Verifications

| Behavior                                                                                       | Requirement | Why Manual                                                                                              | Test Instructions                                                                                                                          |
| ---------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontera A1/A2 (cero imports SPOM, `exercises` intacta) afirmada y con tablas nuevas nombradas | Criterio 3  | No hay código que grepear todavía — el enforcement real (lint, ISO, manifiesto) corre en las fases 182+ | Revisión de la sección de frontera del doc: nombra tablas propias, FKs permitidas (`users`/`branches`/`tenants` + lectura `subscriptions`) |
| OK de Franco (D-09) — gate real de cierre de la fase                                           | Todos       | Decisión del CONTEXT: Franco firma, Nacho informativo                                                   | `checkpoint:human-verify` al final de la ejecución                                                                                         |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (verificado por plan-checker 2026-08-27, checks 8a-8d PASS)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (los 4 greps quedaron embebidos en `verificar-doc-08.sh`, creado por plan 181-01 Task 1 — `wave_0_complete` pasa a true cuando ese script exista en disco)
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-08-27 (plan-checker: 0 blockers; verificación sustantiva PASS)
