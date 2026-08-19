---
phase: 159
slug: semana-nueva-backend-modos-de-d-a-generadores-roles-de-bloqu
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-13
---

# Phase 159 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                               |
| ---------------------- | ------------------------------------------------------------------- |
| **Framework**          | vitest (integration tests contra MySQL `eltemplo_test`)             |
| **Config file**        | `el-templo-api/vitest.config.ts`                                    |
| **Quick run command**  | `cd el-templo-api && pnpm vitest run <archivo>`                     |
| **Full suite command** | corre en CI (regla del proyecto: no correr el suite completo local) |
| **Estimated runtime**  | ~variable (por archivo, segundos–minutos)                           |

---

## Sampling Rate

- **After every task commit:** `cd el-templo-api && pnpm exec tsc --noEmit` (typecheck local) + test del archivo tocado
- **After every plan wave:** typecheck + tests de los generadores/`/generate` afectados en foreground
- **Before `/gsd:verify-work`:** CI verde (suite completo)
- **Max feedback latency:** ~120 s por archivo

> ⚠️ Regla del proyecto: el suite completo corre en CI, no local. Typecheck local sí. Tests SOLO en foreground con timeout amplio (prohibido `run_in_background` + loops de espera con `pgrep`).

---

## Per-Task Verification Map

_Task IDs reales de 159-01..06 (reconciliado 2026-08-13). Cada task de código productivo tiene `<automated>`; los tests de integración se crean INLINE en la misma task que verifican (no hay Wave 0 separada — ver abajo)._

| Task ID   | Plan | Wave | Requirement            | Threat Ref     | Secure Behavior                                                                                                   | Test Type   | Automated Command                                                  | Test File                       | Status     |
| --------- | ---- | ---- | ---------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------ | ------------------------------- | ---------- |
| 159-01-T1 | 01   | 1    | SEM-01, SEM-12         | T-159-04       | BlockRole/sessionMode extendidos; los dos `Record<BlockRole,…>` exhaustivos fuerzan cobertura de los 5 roles      | typecheck   | `pnpm exec tsc --noEmit`                                           | n/a (typecheck)                 | ⬜ pending |
| 159-01-T2 | 01   | 1    | SEM-01                 | T-159-01/02/04 | `session_mode` sólo acepta el enum del body (varchar libre); day_modes NO fija combos/tecnica (D-02)              | typecheck   | `pnpm exec tsc --noEmit`                                           | n/a (typecheck)                 | ⬜ pending |
| 159-02-T1 | 02   | 2    | SEM-03, SEM-04, SEM-06 | —              | pipeline reusado (Stage 1 reemplazado al estilo goal-plan-pipeline, D-P6)                                         | typecheck   | `pnpm exec tsc --noEmit`                                           | n/a (typecheck)                 | ⬜ pending |
| 159-02-T2 | 02   | 2    | SEM-06                 | —              | STRETCHING como función PURA de `(week, day)` — los 6 niveles NO divergen (pitfall `Math.random()`)               | integration | `pnpm vitest run test/unit/stretching-selection.test.ts`           | test/unit/stretching-selection  | ⬜ pending |
| 159-03-T1 | 03   | 3    | SEM-02, SEM-03         | —              | combos-generator: INITIUM→COMBOS I sup→COMBOS II inf→STRETCHING, determinístico por (week,day)                    | integration | `pnpm vitest run test/unit/combos-generator.test.ts`               | test/unit/combos-generator      | ⬜ pending |
| 159-03-T2 | 03   | 3    | SEM-04                 | —              | tecnica-generator: INITIUM→TECNICA I→TECNICA II MISMA ruta→STRETCHING                                             | integration | `pnpm vitest run test/unit/tecnica-generator.test.ts`              | test/unit/tecnica-generator     | ⬜ pending |
| 159-04-T1 | 04   | 1    | SEM-05                 | —              | tabla `session_week_regime` clasificada tenant (tenant_id primero en el unique)                                   | integration | `pnpm vitest run test/db/tenant-tables.test.ts`                    | test/db/tenant-tables           | ⬜ pending |
| 159-04-T2 | 04   | 1    | SEM-05                 | —              | ancla semana→fecha/régimen; retro-etiquetado W12+ NO muta filas históricas (@data-only idempotente)               | integration | `pnpm vitest run test/migrations/0202-session-week-regime.test.ts` | test/migrations/0202-…-regime   | ⬜ pending |
| 159-05-T1 | 05   | 4    | SEM-01, SEM-12, SEM-13 | —              | ruteo por modo en generateWeek (override per-request `dayModes`) + badge DEUTEROS A/B                             | typecheck   | `pnpm exec tsc --noEmit`                                           | n/a (typecheck)                 | ⬜ pending |
| 159-05-T2 | 05   | 4    | SEM-01, SEM-12, SEM-13 | T-159-01       | `/generate` acepta modo por día + etiqueta de clase derivada; enum del body es la única contención                | integration | `pnpm vitest run test/sessions/generate-modes.test.ts`             | test/sessions/generate-modes    | ⬜ pending |
| 159-06-T1 | 06   | 2    | SEM-13                 | T-159-15/16    | etiqueta derivada de la sesión aprobada, UNA query/semana (anti N+1), solo actividad genérica (respeta isSpecial) | typecheck   | `pnpm exec tsc --noEmit`                                           | n/a (typecheck)                 | ⬜ pending |
| 159-06-T2 | 06   | 2    | SEM-13                 | T-159-14       | rename 'Calistenia'→'General' sin duplicar (get-or-create + migración mismo commit); TV lee sesión con fallback   | integration | `pnpm vitest run test/scheduling/derived-class-label.test.ts`      | test/scheduling/derived-class-… | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

> **Nyquist:** cada task de código productivo tiene `<automated>` (typecheck y/o test de integración); ningún tramo de 3 tasks consecutivas queda sin verify automatizado; sin flags watch-mode; latencia < 120 s/archivo.

---

## Wave 0 Requirements — satisfechas INLINE por los planes

Los tests de integración NO requieren una Wave 0 separada: cada uno se CREA en la misma task que lo verifica (test-alongside), y el framework (vitest + MySQL de test) ya está instalado. Trazabilidad:

- [x] STRETCHING función pura de `(week, day)` — `test/unit/stretching-selection.test.ts` creado en **159-02-T2**.
- [x] Test de integración combos-generator (SEM-03 + SEM-06) — `test/unit/combos-generator.test.ts` en **159-03-T1**.
- [x] Test de integración tecnica-generator (SEM-04 + SEM-06) — `test/unit/tecnica-generator.test.ts` en **159-03-T2**.
- [x] Test del ancla + retro-etiquetado, filas históricas intactas (SEM-05) — `test/migrations/0202-session-week-regime.test.ts` en **159-04-T2**.
- [x] Test de `/generate` aceptando modo por día (SEM-13) + etiqueta derivada — `test/sessions/generate-modes.test.ts` en **159-05-T2** y `test/scheduling/derived-class-label.test.ts` en **159-06-T2**.

_Framework ya instalado (vitest + MySQL de test). No hace falta instalar nada._

---

## Manual-Only Verifications

| Behavior                                                                   | Requirement | Why Manual                                                                                                         | Test Instructions                                                                                             |
| -------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Rename "Calistenia"→"General" no duplica fila `activities` en sedes nuevas | SEM-13      | Depende de get-or-create por literal en `scheduling/service.ts` + `seed-production.ts`; efecto se ve al crear sede | Verificar post-deploy que crear una sede no genera actividad duplicada; migración + código en el mismo commit |
| Efecto retroactivo del rename en reports históricos (A2)                   | SEM-13      | Decisión de negocio pendiente de checkpoint humano                                                                 | Confirmar con Franco si reports históricos deben mostrar el nombre viejo o nuevo                              |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (satisfechas inline por los planes)
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved
</content>
