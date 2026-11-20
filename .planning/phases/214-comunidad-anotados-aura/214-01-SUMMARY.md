---
phase: 214-comunidad-anotados-aura
plan: 01
subsystem: tooling
tags: [node_modules, typecheck-baseline, sql-readonly]
requires: []
provides:
  - node_modules por symlink (raiz, API, app, admin) y .env de la API en el worktree et-comunidad
  - linea de base de typecheck (TYPECHECK-BASELINE.md)
  - consultas de solo lectura 04, 06, 07 y 08 (escritas, no corridas)
affects: [214-02, 214-03, 214-04, 214-05, 214-06, 214-07, 214-08]
key-files:
  created:
    - .planning/phases/214-comunidad-anotados-aura/TYPECHECK-BASELINE.md
    - .planning/phases/214-comunidad-anotados-aura/consultas/04-importados-marzo.sql
    - .planning/phases/214-comunidad-anotados-aura/consultas/06-visibilidad-por-defecto.sql
    - .planning/phases/214-comunidad-anotados-aura/consultas/07-linea-de-base.sql
    - .planning/phases/214-comunidad-anotados-aura/consultas/08-calibracion-tiempo-propuesto.sql
decisions:
  - "Admin node_modules desde el checkout principal (36 errores) en vez de et-199 (35): diferencia irrelevante"
metrics:
  completed: 2026-11-17
---

# Phase 214 Plan 01: Entorno y consultas de solo lectura Summary

Worktree `et-comunidad` operativo (node_modules por symlink, sin instalar nada), linea de base de typecheck registrada y cuatro consultas SQL de solo lectura escritas sin ejecutar.

## Proveedores de node_modules (md5 de lockfile verificado)

| Destino | Proveedor | md5 lock |
|---|---|---|
| raiz | /home/franco/projects/el-templo/node_modules | package.json def354cc8e |
| el-templo-api | /home/franco/projects/et-199-mi-templo/el-templo-api/node_modules | 5762f05d4c |
| el-templo-admin | /home/franco/projects/el-templo/el-templo-admin/node_modules | 8cd26e21a3 |
| el-templo-app | /home/franco/projects/et-202-carga/el-templo-app/node_modules | 063bf7a8e6 |

`.env` y `.env.development` de la API tambien por symlink (DB_HOST=localhost en ambos). `git status` no muestra los symlinks.

## Linea de base de typecheck

- API: 0 errores (`pnpm exec tsc --noEmit`).
- App: 21 errores (vue-tsc): `import.meta.env` sin tipos, `html5-qrcode` y tipos de tests. Errores de entorno.
- Admin: 36 errores (35 con el proveedor et-199): `vitest` no instalado en ningun worktree con ese lock, `import.meta.env`, otros preexistentes.
- Detalle exacto en `TYPECHECK-BASELINE.md`. Los planes siguientes exigen cero errores NUEVOS.

## Tareas

| Tarea | Commit |
|---|---|
| 1 Linea de base de typecheck | e56de4e97 |
| 2 Consultas 04, 06, 07, 08 | cdc563916 |

## Deviations from Plan

None - plan executed as written. NINGUNA consulta se corrio. No se instalo nada.

## Decisiones del ejecutor

- En la 08, los dos SELECT del plan (total y por `session_mode`) se unificaron en un `UNION ALL` porque un CTE no se comparte entre sentencias. Mismo resultado en una sola corrida.
- En la 08, `ratio = duration * 60 / propuesto_segundos` porque `completed_sessions.duration` esta en minutos (el plan escribia `duration / propuesto`).
- En la 08 las prescripciones de movilidad cuentan dentro del bloque (se guardan como prescripciones con `exercise_type`); anotado en el encabezado.
- Mediana aproximada con `ROW_NUMBER()`/`COUNT() OVER` (promedio de las dos filas centrales).
- `.planning/.../consultas/02-aura-por-fuente-anonimo.resultado-2026-11-17.tsv` ya estaba sin trackear al empezar (no es mio): no lo commitee.

## Known Stubs

Ninguno. Los `YYYY-MM-DD` de `@dia` y `@lanzamiento` son parametros a completar por quien corra la consulta.

## Self-Check: PASSED

Archivos y commits verificados (e56de4e97, cdc563916).
