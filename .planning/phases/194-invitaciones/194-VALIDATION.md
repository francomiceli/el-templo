---
phase: 194
slug: invitaciones
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-10-06
---

# Phase 194 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Fuente: `194-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4 (API, MySQL real por worker `eltemplo_test_<POOL_ID>`); app: vitest solo utils puros; admin sin runner |
| **Config file** | `el-templo-api/vitest.config.ts` |
| **Quick run command** | `cd el-templo-api && pnpm exec vitest run test/invitations/<archivo>.test.ts --hookTimeout 600000` (FOREGROUND, nunca `run_in_background`) |
| **Full suite command** | CI en push a staging (convención del repo: no correr la suite completa local) |
| **Static gates** | Local: `pnpm exec tsc --noEmit`, `pnpm lint:tenant`, `pnpm typecheck:tests`. **`pnpm db:verify-uniques` es SOLO CI** (necesita una DB migrada; `194-EXECUTOR-RULES.md` prohíbe `db:migrate`/`db:verify-uniques` contra la DB local `eltemplo`, compartida con otros worktrees; `invitations` no declara UNIQUE, así que el mapa de derivadas no cambia) |
| **Frontends** | `pnpm lint` + build de Quasar (D-27: sin `vue-tsc`) |
| **Estimated runtime** | ~60-300 s por archivo de integración |

---

## Sampling Rate

- **After every task commit:** `tsc --noEmit` + `lint:tenant` + el test nuevo/afectado del plan
- **After every plan:** worktree limpio + typecheck + lint (orquestador)
- **Before `/gsd:verify-work`:** CI verde en staging
- **Max feedback latency:** 300 s

---

## Per-Task Verification Map

| Req | Comportamiento | Tipo | Archivo |
|---|---|---|---|
| SC-4 | Sub `is_trial` no vuelve `activo` (status, activeMemberExists, SEPA, listado, renovaciones); Yoga trial + presencial sin cambios; reservas por cobertura intactas | integración | `test/invitations/membership-invariant.test.ts` |
| SC-4 | Cobertura de membresía ignora `is_trial` en el descuento | integración | ídem + `test/referrals/discount-computation.test.ts` |
| SC-1 | `addBusinessDays` lun-sáb menos feriados AR/ES, día de activación no cuenta | unit | `test/shared/business-days.test.ts` |
| SC-1 | Activación self-service completa (sede física, prueba, historial, lead, sub 3 clases, end_date) | integración | `test/invitations/activate.test.ts` |
| SC-1 | Uso de accesos: otra sede del país OK, otro país NO, 4.ª clase NO | integración | `test/invitations/access-usage.test.ts` |
| SC-2 | Cupo 2/mes con concurrencia | integración | `test/invitations/quota.test.ts` |
| SC-2 | Elegibilidad 6 meses / 90 días por persona / SP no bloquea / imports is_trial no cuentan | integración | `test/invitations/eligibility.test.ts` |
| SC-2 | Canal asistido mismas reglas; alta "Nuevo en Prueba" con invitador | integración | `test/invitations/assisted.test.ts`, `test/auth/register.test.ts` |
| SC-2 | Anulación de invitación libera cupo y ventana | integración | `test/invitations/void.test.ts` |
| SC-1/D-02 | El plan Invitación no se asigna por ninguna ruta admin (ni con `viaInvitation` en el body) | integración HTTP | `test/invitations/invitation-plan-guard-http.test.ts` |
| SC-3 | Conversión: cierra accesos, crea vínculo, ventana 30 d, flag por plan | integración | `test/invitations/conversion-link.test.ts` |
| SC-3 | Árbitro: gana el mayor por monto (AURA/partner/invitación), tope $, override final, boarding pass, 4 charge-paths; bug add-back D-22 | integración | `test/invitations/discount-arbiter.test.ts` |
| SC-3 | Árbitro por charge-path (diferido, inmediato, renovación) | integración | `test/invitations/discount-arbiter-paths.test.ts` |
| SC-3 | Paridad preview ↔ cobro | integración | `test/referrals/preview-parity.test.ts` |
| SC-5 | Mis invitados (cupo, estados), leads (gate conversión, cron), reporte | integración | `test/invitations/{member-overview,leads,report}.test.ts`, `test/expire-lost-leads.test.ts` |
| SC-6 | Migraciones de datos idempotentes con guards (vínculo 3) | integración | `test/migrations/0258-0259-invitaciones.test.ts` |
| Tenancy | Rutas nuevas aisladas + baselines | integración | `test/tenancy/iso-0{1,3}-*.test.ts` |
| Partner | Semana de regalo no elige plan Invitación | integración | `test/referral-partners/semana-gratis.test.ts` |
| SEPA | Export con columna importe | integración | test de export de domiciliación existente/extendido |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/invitations/_helpers.ts` — fábricas (invitador vigente, invitado freemium en sede virtual, feriados por país)
- [ ] Symlink `node_modules` + `.env.development` en el worktree (sin instalar dependencias)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Flujo app real (link → registro/login → activar → reservar → QR) | SC-1 | dispositivo + deep link | UAT staging en AR y ES |
| Feriados ES cargados por gestión | D-29 | dato operativo | Horarios ▸ Feriados, ES Oct-Dic 2026 |
| Export SEPA aceptado por el banco | D-25 | sistema externo | Leandro valida archivo |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 300s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
