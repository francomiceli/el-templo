---
phase: 171
slug: backstop-manifiesto-de-rutas-fail-closed-y-fixtures-2-tenant
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-29
---

# Phase 171 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Framework**          | Vitest 4.0.18                                                                                                                               |
| **Config file**        | `el-templo-api/vitest.config.ts` (no se toca en esta fase)                                                                                   |
| **Quick run command**  | `cd /home/franco/projects/et-170-sentinel/el-templo-api && pnpm exec vitest run <archivo> --hookTimeout=250000`                              |
| **Full suite command** | `cd /home/franco/projects/et-170-sentinel/el-templo-api && pnpm test` (**solo en CI** — memoria del repo: no correr la suite completa local) |
| **Estimated runtime**  | ~100 s por archivo suelto (el `setupFiles` provisiona la base per-worker, ~96 s — hallazgo 169-07); suite completa varios minutos             |

Notas que condicionan el diseño de los tests de esta fase:

- `include: ["test/**/*.test.ts"]` → `test/tenant-manifest.ts` y `test/fixtures/second-tenant.ts`
  son **módulos**, no archivos de test.
- `setupFiles: ["test/setup.ts"]` corre para TODO archivo, incluidos los de `test/unit/`: ubicar
  el gate del manifiesto en `test/unit/` **no ahorra nada** (hallazgo 169-07).
- El gate ISO-01 **necesita MySQL vivo igual**: `buildApp()` hace un `SELECT` sobre `formats`
  durante el registro del plugin de sessions (Pitfall 2 del RESEARCH). Por eso vive en
  `test/tenancy/` y usa `createTestApp()`.
- `pool: "forks"` con `isolate: false`: la base se comparte entre archivos del mismo worker →
  el fixture del gimnasio 2 limpia su rastro incondicionalmente (`beforeAll` y `afterAll`).
- **`tsconfig.json` incluye solo `src/`** y no hay `eslint.config` en el API: CI **no
  typechequea `test/`**. Por eso la forma del manifiesto (motivo obligatorio, módulo obligatorio,
  categoría válida) se valida en **runtime**, no por tipos (Pitfall 5).

---

## Wave Serialization (misma lección que las fases 169 y 170)

Las 6 waves son **una por plan a propósito**: los 6 planes comparten un único worktree
(`/home/franco/projects/et-170-sentinel`) y los tests son MySQL-backed. Dos archivos de vitest
en paralelo revientan el timeout de 120 s del provisioning por worker, y dos ejecutores
editando el mismo worktree se pisan el estado de git. Las dependencias lógicas reales están
en cada `depends_on`; la serialización total es operativa.

Solape de archivos que además fuerza el orden: `test/helpers.ts` lo tocan el plan 01 (wave 1,
`createTestApp(opts)`) y el plan 04 (wave 4, `tenantId`), y `test/tenant-manifest.ts` lo tocan
los planes 01 (wave 1), 02 (wave 2) y 06 (wave 6). Ninguno de esos pares comparte wave.

---

## Sampling Rate

- **After every task commit:** `pnpm exec tsc --noEmit` cuando el task toca `src/`, más el
  chequeo declarado en el propio task (`tsc` standalone sobre el manifiesto, one-liner de conteos
  con `tsx -e`, o el archivo de vitest que introduce el comportamiento).
- **After every plan wave:** el/los archivo(s) de test de la fase que ya existan:
  `pnpm exec vitest run test/tenancy/iso-01-manifiesto.test.ts --hookTimeout=250000` (desde wave 3)
  y `pnpm exec vitest run test/tenancy/iso-02-fixtures.test.ts --hookTimeout=250000` (desde wave 5).
- **Before `/gsd:verify-work`:** suite completa verde **en CI** (job `api-test` contra MySQL 8.0;
  no hace falta step nuevo de CI) + la evidencia de la sonda en vivo del plan 03 registrada en su
  SUMMARY + el veredicto del checkpoint D-03/D-04 aplicado (plan 06).
- **Max feedback latency:** ~120 s (un archivo de test suelto, incluido el provisioning). Los
  tasks que no corren vitest tienen latencia de segundos (`tsc`, greps, `tsx -e`).

---

## Per-Task Verification Map

| Task ID   | Plan | Wave | Requirement | Threat Ref        | Secure Behavior                                                                            | Test Type         | Automated Command                                                                 | File Exists  | Status     |
| --------- | ---- | ---- | ----------- | ----------------- | ------------------------------------------------------------------------------------------ | ----------------- | --------------------------------------------------------------------------------- | ------------ | ---------- |
| 171-01-01 | 01   | 1    | ISO-01      | T-171-01/02       | Seam inerte en producción: `src/index.ts` sin cambios, hook solo si un test lo pasa         | tsc + git + grep  | `pnpm exec tsc --noEmit` + `git diff --numstat src/index.ts` vacío                | n/a          | ⬜ pending |
| 171-01-02 | 01   | 1    | ISO-01      | T-171-03          | Contrato del manifiesto sin comodines; motivo/módulo expresados en el tipo                  | tsc standalone    | `pnpm exec tsc --noEmit --strict --skipLibCheck test/tenant-manifest.ts`          | ⬜ Wave 0    | ⬜ pending |
| 171-02-01 | 02   | 2    | ISO-01      | T-171-06          | Baseline one-shot sin regenerador commiteado; 370 claves, 0 duplicados                      | cli               | conteo `sort -u` sobre el volcado + `git status --porcelain el-templo-api/`       | n/a          | ⬜ pending |
| 171-02-02 | 02   | 2    | ISO-01      | T-171-04/05/07    | 100% clasificado, `global` con motivo, `templo-module` con módulo, dudosas marcadas         | tsc + `tsx -e`    | `pnpm exec tsc --noEmit --strict --skipLibCheck test/tenant-manifest.ts` + conteos | ⬜ Wave 0    | ⬜ pending |
| 171-02-03 | 02   | 2    | ISO-01      | T-171-05/07       | Dossier revisable: `global` entero, `templo-module` agrupado, 12 dudosas con recomendación  | doc assertion     | `test -f 171-CLASIFICACION.md` + `grep -c "D-04"`                                 | ⬜           | ⬜ pending |
| 171-03-01 | 03   | 3    | ISO-01      | T-171-08/10/11    | Gate bidireccional + guard de HEAD + `sinMotivo`/`sinModulo` en runtime                     | integration       | `pnpm exec vitest run test/tenancy/iso-01-manifiesto.test.ts --hookTimeout=250000` | ⬜ Wave 0    | ⬜ pending |
| 171-03-02 | 03   | 3    | ISO-01      | T-171-08/09       | Criterio 2 en vivo: rojo que nombra `GET /api/_probe-171`, revert sin commitear             | cli + integration | `git status --porcelain src/app.ts` vacío + re-corrida del gate en verde           | n/a          | ⬜ pending |
| 171-04-01 | 04   | 4    | ISO-02      | T-171-12          | `tenantId` opcional default 1: los ~215 call sites previos no cambian                       | integration       | `pnpm exec vitest run test/tenancy/tenant-helpers.test.ts --hookTimeout=250000`    | ✅ existe    | ⬜ pending |
| 171-04-02 | 04   | 4    | ISO-02      | T-171-12/13/14/15 | Espejo D-06 con `tenantValues` en todo INSERT; DELETE siempre con `tenant_id`                | grep + source     | greps de `tenantValues(` y ausencia de `UPDATE users SET tenant_id`               | ⬜           | ⬜ pending |
| 171-05-01 | 05   | 5    | ISO-02      | T-171-16/17/18    | Aserciones por `SELECT tenant_id` de doble lado + gate de opt-in sobre `test/setup.ts`      | integration       | `pnpm exec vitest run test/tenancy/iso-02-fixtures.test.ts --hookTimeout=250000`   | ⬜ Wave 0    | ⬜ pending |
| 171-05-02 | 05   | 5    | ISO-02      | T-171-19          | Criterio 4: 3 archivos expuestos verdes SIN tocar sus expectativas                          | integration       | los 3 `vitest run` encadenados con `&&` + `git status --porcelain el-templo-api/test/` | ✅ existen   | ⬜ pending |
| 171-06-01 | 06   | 6    | ISO-01      | T-171-20/21       | Checkpoint bloqueante: nadie clasifica una gris sin Franco                                  | manual (blocking) | `<human-check>` — respuesta transcripta con fecha en el SUMMARY                    | n/a          | ⬜ pending |
| 171-06-02 | 06   | 6    | ISO-01      | T-171-22/23       | Veredicto aplicado y gate verde; se arregla el manifiesto, nunca el test                    | integration       | `pnpm exec vitest run test/tenancy/iso-01-manifiesto.test.ts --hookTimeout=250000` | ✅ (plan 03) | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

Archivos que NO existen y que crean los propios planes de esta fase (cada uno dentro del plan
que introduce el comportamiento que prueba — ninguna tarea depende de un test inexistente de
otro plan):

- [ ] `test/tenant-manifest.ts` — plan 01 task 2 (contrato + comparador puro) y plan 02 task 2
      (las 370 entradas). Es un **módulo**, no un archivo de test.
- [ ] `test/tenancy/iso-01-manifiesto.test.ts` — plan 03 task 1 (gate fail-closed bidireccional +
      motor con fixtures sintéticos, ISO-01).
- [ ] `test/fixtures/second-tenant.ts` — plan 04 task 2 (`seedSecondTenant` /
      `limpiarSegundoGimnasio`, ISO-02). También es un módulo.
- [ ] `test/tenancy/iso-02-fixtures.test.ts` — plan 05 task 1 (verificación del espejo,
      retrocompat de los helpers e higiene, ISO-02).
- [ ] Extensión de `test/helpers.ts` — plan 01 task 1 (`createTestApp(opts)`) y plan 04 task 1
      (`tenantId` opcional).

Framework install: **no hace falta** — Vitest ya está configurado. Cero dependencias nuevas en
toda la fase.

---

## Manual-Only Verifications

| Behavior                                                                              | Requirement | Why Manual                                                                                                             | Test Instructions                                                                                       |
| ------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| La clasificación de las rutas `global` y de las fronteras `templo-module` es correcta   | ISO-01      | Es una decisión de producto, no una aserción: clasificar de más como `global` desactiva el backstop de esa ruta (D-03)    | Plan 06 task 1: revisar `171-CLASIFICACION.md` secciones A y B y responder "aprobado" o los cambios      |
| Las 12 zonas grises, incluidos los 2 conflictos entre documentos cerrados               | ISO-01      | Q2 (labs_inquiries = plataforma) vs doc 04 §2.1, y Q5 (unsubscribes por tenant) vs marcarlas `global` (D-04)             | Plan 06 task 1: sección C del dossier, una fila por caso, con veredicto escrito y fecha                 |
| La suite COMPLETA sigue verde con los fixtures nuevos (criterio 4 del ROADMAP)          | ISO-02      | La suite completa no se corre local por decisión del repo; la corre CI contra MySQL 8.0                                  | Job `api-test` del push de la fase. Localmente solo la regresión dirigida de 3 archivos (plan 05 task 2) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (el único `<human-check>` es el
      checkpoint bloqueante D-03, que por definición no es automatizable)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (cada archivo lo crea el plan que lo usa)
- [x] No watch-mode flags (todo es `vitest run`)
- [x] Feedback latency < 120 s por archivo de test
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
