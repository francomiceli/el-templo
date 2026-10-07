---
phase: 194-invitaciones
plan: 29
subsystem: release
tags: [preflight, migrations, gates, release-checklist, d-25, d-27, d-28, d-29]
requires:
  - phase: 194-22
    provides: API completa y migraciones 0260/0261
  - phase: 194-26
    provides: admin completo
  - phase: 194-28
    provides: app 1.8.2
provides:
  - "194-RELEASE-CHECKLIST.md: qué viaja junto, orden de push, migraciones y su efecto en prod, SQL read-only, backup, guion de UAT AR+ES, SEPA, feriados ES, builds de tienda, limitaciones abiertas"
key-files:
  created:
    - .planning/phases/194-invitaciones/194-RELEASE-CHECKLIST.md
requirements-completed: [SC-1, SC-2, SC-3, SC-4, SC-5, SC-6, D-29, D-25, D-28, D-27]
completed: 2026-10-07
---

# Phase 194 Plan 29: pre-flight de cierre Summary

**Numeración 0255-0257 + 0260-0261 libre en origin/master y origin/staging, gates estáticos de los 3 paquetes sin errores nuevos de la fase, y `194-RELEASE-CHECKLIST.md` con todo lo que el humano y el orquestador necesitan para el push.**

## Resultado de cada gate

| Gate | Resultado |
| ---- | --------- |
| `git fetch origin` + `ls-tree` master/staging/tren | master y staging topan en 0254/0258/0259; el tren `feat/v6.1-gimnasio` en 0252. 0255-0257 y 0260-0261 libres. Sin bloqueo |
| `grep -c "^--.*;"` en 0255-0261 | 0 en cada archivo |
| Enums de 0255 vs `schema/invitations.ts` | coinciden (`channel`, `status`) |
| API `tsc --noEmit` | 0 |
| API `lint:tenant` | 0 (DISCREPANCIAS 0) |
| API `typecheck:tests` | sale 1 por deuda ajena; la fase no tocó ninguno de los archivos con errores (verificado con `git diff --name-only origin/master...HEAD -- el-templo-api/test`) |
| Admin `lint` / `build` | 0 errores (8 warnings preexistentes) / OK |
| App `lint` / `build` | 0 errores (2 warnings preexistentes) / OK |
| App `test` | 298 verdes, 2 rojos preexistentes (`level-display.test.ts`) |
| `git status` | limpio tras los builds |

No se corrió la suite de integración de la API (la corre CI).

## Commits

- Checklist y este SUMMARY en un commit de docs (ver `git log`).

## Deviations from Plan

Ninguna. Se interpretó el criterio "gates de los 3 paquetes en 0" con la deuda preexistente declarada por el orquestador: `typecheck:tests` (1) y `level-display.test.ts` (2 casos) salen con error por causas ajenas a la fase, documentadas en la sección 0 y la sección 9 del checklist.

## Observaciones para el orquestador

- `typecheck:tests` marca errores NUEVOS respecto de su baseline (`attendance`, `check-ins-roster`, `email/sender`, 4 `test/unit/*`, y `analytics.test.ts` empeorado de 2 a 4). Son archivos que la fase no toca: el baseline envejeció frente a master. No se regeneró.
- Las migraciones del tren v6.1 (0242-0252) ya colisionan en número con las de master (0242-0254), y 0253 está reservada a 192.3. El que integre el tren después tiene que renumerar por encima de 0261 y sumar los conteos de tenancy (`ENTRADAS_BASELINE` 455, `GYM_OWNED_TABLES` 100).
- Staging y prod comparten host y MySQL: 0260 (datos de prod) y 0261 (copy vivo) corren contra producción desde el primer push a staging, por eso el backup va antes.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-194-89 (numeración re-verificada), T-194-90 (sección "VIAJAN JUNTOS" del checklist), T-194-91 (backup documentado como paso humano previo) cubiertos.

## Self-Check: PASSED

- `194-RELEASE-CHECKLIST.md` existe, contiene "VIAJAN JUNTOS" y las 9 secciones (más la sección 0 con los resultados del pre-flight).
