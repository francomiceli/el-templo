---
phase: 214
slug: comunidad-anotados-aura
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-11-17
---

# Phase 214 — Validation Strategy

> Contrato de validación por fase para el muestreo durante la ejecución. Sale de "Validation Architecture" de `214-RESEARCH.md` (líneas 1122-1160) y cubre los planes 214-01 a 214-18 (primera pasada: servidor, datos, textos de la app y admin). Los planes de pantallas de la segunda pasada suman sus filas cuando se escriban.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest. API: integración contra MySQL 8 real (CI) y unitarios puros en `test/unit/`. App: Vitest sin DOM de canvas. Admin: sin runner (vue-tsc + lint) |
| **Config file** | `el-templo-api/vitest.config.ts`; `el-templo-app` (`vitest run`) |
| **Quick run command** | `cd el-templo-api && pnpm exec tsc --noEmit && pnpm typecheck:tests && pnpm lint:tenant` (frontends: `pnpm lint` y `VUE_TSC=/home/franco/projects/el-templo/el-templo-web/node_modules/.bin/vue-tsc; $VUE_TSC --noEmit -p tsconfig.json`, comparando errores contra la base) |
| **Full suite command** | CI al pushear a staging (con OK de Franco). No se corre la suite completa en local (regla de Franco) |
| **Estimated runtime** | quick ~60-90 s por plan; un archivo de integración local hasta 300-600 s, en foreground, solo con MySQL local |

---

## Sampling Rate

- **After every task commit:** quick run command (más el archivo unitario o de integración nuevo de la tarea, uno solo, en foreground).
- **After every plan wave:** worktree limpio + quick run command (D-41). El orquestador lo verifica después de cada plan.
- **Before `/gsd:verify-work`:** CI verde en staging + consulta 05 en staging + UAT en teléfono (D-39).
- **Max feedback latency:** 600 s.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 214-01-01 | 01 | 1 | infra | T-214-01-01 | sin instalaciones, symlinks a lockfile idéntico | infra | `test -e el-templo-api/node_modules/.bin/tsc && … && pnpm exec tsc --noEmit` | ✅ | ⬜ pending |
| 214-01-02 | 01 | 1 | D-20, D-29, D-36, D-47 | T-214-01-02 | consultas `READ ONLY`, sin escrituras ni datos personales | static | grep de `READ ONLY` y sin `UPDATE/DELETE/INSERT/...` en `consultas/04,06,07,08` | ❌ W0 (se crean) | ⬜ pending |
| 214-02-01 | 02 | 2 | D-18, D-19 | T-214-02-01 | montos solo del servidor | unit | `vitest run test/unit/aura-amounts.test.ts` | ❌ (se crea) | ⬜ pending |
| 214-02-02 | 02 | 2 | D-19 | T-214-02-01 | `amount` obligatorio en premios diarios | static + tsc | `tsc --noEmit && grep AURA_AMOUNTS.*` | ✅ | ⬜ pending |
| 214-02-03 | 02 | 2 | D-19, D-23 | T-214-02-03 | onboarding no expone el saldo | static + tsc | `tsc && grep -c 'amount: (10|50)' = 0` | ✅ | ⬜ pending |
| 214-03-01 | 03 | 3 | D-19, D-23 | T-214-03-02 | `auraAwarded` = monto con saldo previo | integration | `typecheck:tests` (+ CI `onboarding.test.ts`, `attendance*.test.ts`) | ✅ | ⬜ pending |
| 214-03-02 | 03 | 3 | D-19 | T-214-03-01 | guarda literal `milestoneAura(12) === 50` | unit + integration | `typecheck:tests` (+ CI) | ✅ | ⬜ pending |
| 214-03-03 | 03 | 3 | D-19 | — | N/A | integration | `typecheck:tests` (+ CI `stretch-complete`, `free-blocks-complete`) | ✅ | ⬜ pending |
| 214-04-01 | 04 | 4 | D-21, D-49, D-64 | T-214-04-01..03 | reglas por valor viejo exacto, respaldo primero, sin `;` en comentarios | static | grep de respaldo, ≥18 UPDATE, sin fórmulas | ❌ (se crea) | ⬜ pending |
| 214-04-02 | 04 | 4 | D-21, D-38, D-64 | T-214-04-01, -04 | idempotencia en dos corridas, filas raras intactas, tope del día histórico | migration test | `vitest run test/migrations/0344-aura-revaluation.test.ts` | ❌ (se crea) | ⬜ pending |
| 214-04-03 | 04 | 4 | D-38 | T-214-04-06 | solo conteos, `READ ONLY` | static | grep de `consultas/05` | ❌ (se crea) | ⬜ pending |
| 214-05-01 | 05 | 5 | D-23 | T-214-05-01 | `auraAmount` declarado en schema | integration | `typecheck:tests` (+ CI `stretch-complete`) | ✅ | ⬜ pending |
| 214-05-02 | 05 | 5 | D-23 | T-214-05-01 | idem | integration | `typecheck:tests` (+ CI `free-blocks-complete`) | ✅ | ⬜ pending |
| 214-06-01 | 06 | 6 | D-23 | T-214-06-01 | monto solo del servidor | static + vue-tsc | `pnpm lint && grep sin "+5 AURA" && vue-tsc` | ✅ | ⬜ pending |
| 214-06-02 | 06 | 6 | D-23 | T-214-06-01 | idem | static + vue-tsc | idem | ✅ | ⬜ pending |
| 214-07-01 | 07 | 7 | D-22 | T-214-07-01 | selector retirado (API intacta, riesgo aceptado) | static + vue-tsc | `pnpm lint && ! grep 'Descuento AURA'` | ✅ | ⬜ pending |
| 214-07-02 | 07 | 7 | D-19 | — | N/A | static | grep de 8 y 50 | ✅ | ⬜ pending |
| 214-08-01 | 08 | 8 | D-20 | T-214-08-01..03 | regla pura con ALT descartados | unit | `vitest run test/unit/proposed-time.test.ts` | ❌ (se crea) | ⬜ pending |
| 214-08-02 | 08 | 8 | D-20, D-64 | T-214-08-04 | tope del día del lado app con `tenantWhere` | static + tsc | `tsc && lint:tenant && grep evaluateTrainingAura/attendanceAuraOnLocalDay` | ❌ (se crea `day-cap.ts`) | ⬜ pending |
| 214-09-01 | 09 | 9 | D-20, D-64 | T-214-09-02 | mismo cálculo que producción en el fixture | integration | `vitest run test/sessions/complete-aura-rule.test.ts` | ❌ W0 (fixture + test) | ⬜ pending |
| 214-09-02 | 09 | 9 | D-20 | — | N/A | integration | `typecheck:tests` (+ CI de los 4 archivos migrados) | ✅ | ⬜ pending |
| 214-09-03 | 09 | 9 | D-48 | T-214-09-01 | N/A | static + vue-tsc | grep `Date.now() - …elapsedSeconds` + vue-tsc | ✅ | ⬜ pending |
| 214-10-01 | 10 | 10 | D-64 | T-214-10-01, -02 | nunca más de 5 por día, reversa exacta | static + tsc | `tsc && grep attendanceAuraAmountFor ×3` | ✅ | ⬜ pending |
| 214-10-02 | 10 | 10 | D-64 | T-214-10-01, -02 | idem | integration | `vitest run test/attendance/attendance-day-cap.test.ts` | ❌ (se crea) | ⬜ pending |
| 214-11-01 | 11 | 11 | D-02, D-12 | T-214-11-01, -02 | número solo del JWT | static + tsc | `tsc && grep earnedRowsFilter/auraEarned` | ❌ (se crea `earned.ts`) | ⬜ pending |
| 214-11-02 | 11 | 11 | D-40, D-56, D-64 | T-214-11-03 | schema propio, `attendanceRecordSchema` intacto | static + tsc | `tsc && grep memberCheckInResponseSchema` | ✅ | ⬜ pending |
| 214-11-03 | 11 | 11 | D-37, D-38 | T-214-11-01 | no se lee el número de otro | integration | `vitest run test/aura/earned-aura.test.ts` | ❌ (se crea) | ⬜ pending |
| 214-12-01 | 12 | 12 | D-30, D-31, D-50 | T-214-12-01, -04 | tabla strict, enum al final | static | grep de los `.sql` y schema | ❌ (se crea) | ⬜ pending |
| 214-12-02 | 12 | 12 | tenancy | T-214-12-01 | 5 conteos fijos +1 | migration test | `typecheck:tests` + `test/migrations/0345-0346-profile-photo.test.ts` | ❌ (se crea) | ⬜ pending |
| 214-13-01 | 13 | 13 | D-34 | T-214-13-01, -02 | claves sin id, validador anclado | unit | `vitest run test/unit/conquer-private-media.test.ts` | ✅ (se amplía) | ⬜ pending |
| 214-13-02 | 13 | 13 | D-43, D-63 | T-214-13-03, -04 | copia y borrado solo de `members/photos/{id}-…` | unit + tsc | `typecheck:tests && grep CopyObjectCommand` | ✅ | ⬜ pending |
| 214-14-01 | 14 | 14 | D-30, D-33, D-34, D-43, D-45, D-63 | T-214-14-01..05 | ficha espejada y firmada, reporte único | static + tsc | `tsc && grep … mirrorFichaPhoto removePublic reporterIds` | ❌ (se crea) | ⬜ pending |
| 214-14-02 | 14 | 14 | D-34, D-45, D-50 | T-214-14-05, -07 | normas obligatorias, tope de reportes | static + tsc | `tsc && grep manifiesto` | ✅ | ⬜ pending |
| 214-14-03 | 14 | 14 | D-30..D-34, D-43, D-45, D-63 | T-214-14-02..05 | ningún valor con id de usuario | integration | `vitest run test/members/profile-photo.test.ts` | ❌ (se crea) | ⬜ pending |
| 214-15-01 | 15 | 15 | D-30, D-31, D-32, D-46 | T-214-15-01..03 | rutas por `/:userId`, Aura única | static + tsc | `tsc && grep '/:userId/profile-photo/approve'` | ✅ | ⬜ pending |
| 214-15-02 | 15 | 15 | D-32, D-43, D-63 | T-214-15-07 | `/me` sin URL pública | static + tsc | `tsc && grep getOwnPhotoState` | ✅ | ⬜ pending |
| 214-15-03 | 15 | 15 | D-31, D-46 | T-214-15-01, -02 | admin_sede acotado, ISO-03 members | integration | `vitest run test/members/profile-photo-admin.test.ts` | ❌ (se crea) | ⬜ pending |
| 214-16-01 | 16 | 16 | D-05, D-11, D-47 | T-214-16-01, -02 | menores y exterior ocultos por defecto | unit | `vitest run test/unit/community-visibility.test.ts` | ❌ (se crea) | ⬜ pending |
| 214-16-02 | 16 | 16 | D-06, D-07, D-09 | T-214-16-03 | plan vigente por `activeMemberExists` | static + tsc | `tsc && grep activeMemberExists` | ❌ (se crea) | ⬜ pending |
| 214-16-03 | 16 | 16 | D-06, D-09 | T-214-16-03 | ISO-03 de escritura | integration | `vitest run test/scheduling/community-visibility.test.ts` | ❌ (se crea) | ⬜ pending |
| 214-17-01 | 17 | 17 | D-01..D-09, D-52, D-59, D-65 | T-214-17-01..05 | sin apellido, rol, origen ni ids | static + tsc | `tsc && grep LEFT( listAccess countSlotBookings` | ❌ (se crea) | ⬜ pending |
| 214-17-02 | 17 | 17 | D-01 | T-214-17-03 | tope por usuario e IP, schema cerrado | static + tsc | `tsc && grep RATE_LIMITS.attendees attendeesPerUser` | ✅ | ⬜ pending |
| 214-17-03 | 17 | 17 | D-37 | T-214-17-01..04 | barrido de claves y valores prohibidos | integration | `vitest run test/scheduling/attendees.test.ts` | ❌ (se crea) | ⬜ pending |
| 214-18-01 | 18 | 18 | D-13 | — | N/A | unit | `vitest run test/unit/aura-movement-labels.test.ts` | ❌ (se crea) | ⬜ pending |
| 214-18-02 | 18 | 18 | D-13, D-57 | T-214-18-01..04 | detalle privado, sin `userId` | static + tsc | `tsc && grep earnedRowsFilter` | ❌ (se crea) | ⬜ pending |
| 214-18-03 | 18 | 18 | D-37, D-38 | T-214-18-01, -02 | no se lee el detalle de otro | integration | `vitest run test/aura/member-aura-movements.test.ts` | ❌ (se crea) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Criterios del ROADMAP → tests (RESEARCH "Criterios → tests", actualizado): 1 y 2 → `attendees.test.ts` y `community-visibility.test.ts`; 3 → `earned-aura.test.ts` y `member-aura-movements.test.ts`; 4 → `0344-aura-revaluation.test.ts` + tests de fuentes; 5 → `proposed-time.test.ts`, `complete-aura-rule.test.ts`, `attendance-day-cap.test.ts`; 6 → manual; 7 → `profile-photo.test.ts` y `profile-photo-admin.test.ts`; 8 → manual (segunda pasada); 9 → consulta 07; 10 → manual.

---

## Wave 0 Requirements

- [ ] Symlinks de `node_modules` en `et-comunidad` (plan 01, tarea 1).
- [ ] Helper de test: sesión aprobada con bloques y prescripciones + `startedAt` válido, `test/sessions/_aura-session-fixtures.ts` (plan 09, tarea 1; lo usan 4 a 6 archivos).
- [ ] Doble de la tienda privada: `mockPrivateMedia` con `copyFromPublic` y `removePublic` en `test/conquer/_helpers.ts` (plan 13, tarea 2).

Los tres están dentro de los planes que los necesitan, antes de las tareas que los usan.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| El admin no ofrece el descuento por Aura | SC-6, D-22 | El admin no tiene runner de tests | Abrir "Asignar plan" en el admin de staging y confirmar que no aparece "Descuento AURA" |
| Consultas de producción (04, 05, 06, 07, 08) | D-29, D-36, D-38, D-47, D-20 | Corren contra prod con OK de Franco | Franco las corre; resultados en `consultas/*.resultado-*.txt` |
| Copia de la foto de ficha entre buckets de R2 | D-43, D-63 | CI no tiene R2 | En staging: abrir la lista de una clase con un alumno con foto de ficha y confirmar que la URL es del bucket privado y que quitarla borra el objeto público |
| Encabezado, lista, detalle, celebración y foto en teléfono real | SC-8, SC-10, D-39 | Segunda pasada (pantallas) | UAT de cierre en iOS y Android, incluida una foto con ubicación (EXIF descartado) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 600s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
