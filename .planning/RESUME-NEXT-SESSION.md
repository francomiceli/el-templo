# Resume — Milestone v5.8 Sesiones de Prueba (corrida autónoma 2026-07-15/16)

**Captured:** 2026-07-16, pausa pedida por Franco justo antes del verifier de la fase 165.
**Status:** Fases 163 y 164 COMPLETAS y verificadas. Fase 165 con los 5 planes ejecutados y el code review resuelto — **falta SOLO el verifier + cierre de fase + cierre de milestone**. Nada pusheado, nada deployado, cero SSH.

(El resume anterior de este archivo — fases 98-101, 2026-04-21 — quedó obsoleto hace meses; esas fases ya shippearon.)

---

## Prompt para pegar al arrancar la próxima sesión

```
Retomá desde /home/franco/projects/el-templo-v58/.planning/RESUME-NEXT-SESSION.md — corré el verifier de la fase 165 y cerrá el milestone v5.8.
```

---

## DÓNDE está el trabajo (CRÍTICO — situación de dos checkouts)

- **Rama canónica de v5.8: `feat/sp-automatizacion-v58`** en el worktree **`/home/franco/projects/el-templo-v58`**. TODO el trabajo de v5.8 (planning + código + fixes) vive ahí. Tip actual: `2ba7e63e`.
- El checkout principal (`/home/franco/projects/el-templo`) quedó en `feat/sesiones-prueba-v58` para el OTRO agente (deudas/puntuaciones, ya pusheó su trabajo en `feat/deudas-gestion-puntuaciones`). `feat/sesiones-prueba-v58` está CONTAMINADA (docs de planning duplicados + commits de deudas entrelazados) — **NO usarla para nada; la de v5.8 es `feat/sp-automatizacion-v58`**.
- Deps instaladas en el worktree (api, admin, app; `--frozen-lockfile`) y `.env` copiados. `vue-tsc` NO existe en admin ni app (gap de tooling preexistente) — el gate frontend real es `pnpm exec eslint`.
- Todos los comandos `gsd-sdk` deben correrse DESDE el worktree (`cd /home/franco/projects/el-templo-v58`).

## Paso siguiente EXACTO al retomar

1. Spawn `gsd-verifier` (model sonnet) para la fase 165, working dir el worktree, phase dir `.planning/phases/165-self-service-y-ux-de-gesti-n`, REQ-IDs SELF-01..04. Nota para el verifier: los fixes CR-01/WR-01..04 se aplicaron DESPUÉS de los SUMMARYs (ver 165-REVIEW.md `status: resolved`) — verificar en código, no confiar en docs. Gates ya corridos: tsc api limpio; suites tocadas verdes (31 tests post-fix + E2E 6/6 + reports 20/20); eslint limpio.
2. Con el VERIFICATION.md: persistir `165-HUMAN-UAT.md` (UAT visual app+admin en staging + relevamiento de fricciones con Nacho), `gsd-sdk query phase.complete 165` + commit de cierre (patrón exacto de 163/164).
3. Resumen final del milestone para Franco + decidir con él: push a staging (NUNCA solo), y opcionalmente `/gsd:complete-milestone`.

## Estado por fase

| Fase | Estado | Review | Verificación |
|------|--------|--------|--------------|
| 163 Máquina de estados | ✓ Completa (4/4 planes) | 2 WR corregidos | 9/9, HUMAN-UAT: p90 real + dry-run prod |
| 164 Reprogramación y reporte | ✓ Completa (4/4) | 1 CR + 4 WR + 1 IN corregidos | 12/12, HUMAN-UAT: 2 ítems visuales |
| 165 Self-service y UX | Planes 5/5 ejecutados, review resuelto (1 CR + 4 WR + IN) | resolved | **PENDIENTE (paso 1 de arriba)** |

## Qué entregó v5.8 (para el resumen a Franco)

- **163**: cron diario `expire-lost-leads` (04:00 AR) que vence En seguimiento→Perdido tras X días; X = p90 histórico sembrado en `system_settings` (`leads.perdido_window_days`, fallback 14, editable en DB); reset Perdido→En seguimiento al re-agendar; columna `lead_status_source` (auto/manual — el cron nunca pisa un manual); backfill 0183 con backup `users_lead_backup_0183` + dry-run commiteado. Migraciones **0182 y 0183** (0181 la tiene deudas en otra rama sin mergear — coordinar numeración si shippean por separado).
- **164**: acción "Reprogramar" en el admin (transaccional, valida fecha/día/sede/estado del lead — un `ganado` da 409); columna "Reprogramaciones" (derivada de canceladas, retroactiva) + indicador/filtro auto-manual en el reporte de SP con CSV.
- **165**: teléfono obligatorio en toda reserva de SP (alta admin 409 accionable, self-service 400 `PHONE_REQUIRED` + captura en el diálogo de la app con `phoneRequired` en eligibility); persistencia que preserva prefijo país (`sanitizePhoneForStorage`, +34/+549 sobreviven — el `normalizePhone` global NO se tocó); reporte de SP con Teléfono + link WhatsApp + acción "Ver ficha"; **E2E del funnel completo verde (6/6) — el flujo self-service de Phase 119 está sano; si un freemium ve el cartel en prod es elegibilidad de ese usuario, no un bug**.

## Pendientes humanos acumulados (para Franco)

1. **Push a staging** de `feat/sp-automatizacion-v58` (decisión de Franco, nunca automática) + CI (corre el suite completo; local solo corrimos archivos tocados).
2. **Antes del deploy a prod**: correr `el-templo-api/src/db/scripts/0183_backfill_lost_leads_dryrun.sql` contra prod → esperado ≈112 flips; y verificar el p90 real que siembre 0182 (dev cayó al fallback 14).
3. UAT visual: 163/164/165 HUMAN-UAT (reprogramar E2E, reporte con columnas nuevas, app freemium reservando prueba con teléfono).
4. Relevamiento de fricciones reales de gestión con Nacho (SELF-04 se acotó a lo evidente: WhatsApp + Ver ficha en el reporte).
5. Tooling: agregar `vue-tsc` a devDependencies de admin/app si se quiere ese gate (hoy no existe — contradice MEMORY).
6. Flake UTC preexistente en `reports-trial-sessions.test.ts` (`dateOffset()` en UTC vs CURDATE ART) — deferred item de 164; el mismo bug se corrigió en los tests nuevos de 163/165.
7. Coordinación de ramas: `feat/deudas-gestion-puntuaciones` (0181) vs `feat/sp-automatizacion-v58` (0182/0183) — el que shippee segundo renumera si hace falta. `feat/sesiones-prueba-v58` se puede borrar tras revisar (contaminada).
8. Version bump pendiente al armar el tren (feature = minor → candidata 1.7.0, decidir al ship).

## Registro completo de decisiones autónomas

`.planning/AUTONOMOUS-DECISIONS-v5.8.md` (en el worktree): gates auto-aprobados, plan-checker salteado (pedido de Franco), p90 dinámico en migración, separación de ramas por el agente concurrente, `pnpm install --frozen-lockfile`.
