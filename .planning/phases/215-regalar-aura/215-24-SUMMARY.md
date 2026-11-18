---
phase: 215-regalar-aura
plan: 24
type: execute
subsystem: cierre-de-fase
tags: [uat, consultas, gates, conciliacion, medicion]
requires: ["215-23"]
provides:
  - "Consultas de solo lectura para la medición D-21 y la conciliación de Aura con regalos"
  - "Gates finales de API, app y admin con su resultado real"
  - "UAT de 120 casillas y la lista de pasos que solo el dueño puede hacer"
affects: []
tech-stack:
  added: []
  patterns:
    [
      consultas agregadas sin datos personales,
      gates comparados con línea de base,
    ]
key-files:
  created:
    - .planning/phases/215-regalar-aura/consultas/01-medicion-regalos.sql
    - .planning/phases/215-regalar-aura/consultas/02-conciliacion-con-regalos.sql
    - .planning/phases/215-regalar-aura/215-GATES-FINALES.md
    - .planning/phases/215-regalar-aura/215-UAT.md
  modified: []
key-decisions:
  - "La consulta 01 trae un bloque por sede y otro del gimnasio completo, porque una persona que asiste en dos sedes cuenta una vez en cada una"
  - "La conciliación compara el saldo guardado contra Aura ganada más canjes, que es la definición de la app"
requirements-completed:
  [SC-1, SC-2, SC-3, SC-4, SC-5, SC-6, SC-7, SC-8, D-21, D-22]
duration: 35 min
completed: 2026-11-18
---

# Fase 215 Plan 24: cierre de la fase (consultas, gates y UAT) Summary

Cierre de la 215 sin tocar código: dos consultas de solo lectura listas para que Franco las corra, los gates finales corridos con resultado real (todos iguales a la línea de base) y un UAT de 120 casillas con la lista de lo que solo el dueño puede decidir.

## Tareas

| Tarea | Commit      | Asunto                                                        |
| ----- | ----------- | ------------------------------------------------------------- |
| 1     | `53fb09c62` | docs(215-24): consultas de medición y conciliación de regalos |
| 2     | `9f5f92fd1` | docs(215-24): gates finales de la fase                        |
| 3     | `6429b1513` | docs(215-24): UAT de Regalar Aura y pasos del dueño           |

## Que quedo

- `consultas/01-medicion-regalos.sql`: por semana (lunes a domingo, 4 semanas) y por sede, regalos vigentes de alumnos y de profes, anulados, alumnos que asistieron (no staff, QR o manual), alumnos que regalaron y porcentaje, con la misma definición que `weeklyGiftUsage`. Un segundo bloque da el total del gimnasio. Sin nombres.
- `consultas/02-conciliacion-con-regalos.sql`: bloques a (saldo contra Aura ganada más canjes), a2 (movimientos sin fila de saldo), b (regalo sin su fila `aura_gift`), c (fila `aura_gift` sin regalo), d1 y d2 (anulaciones), e (montos o personas que no coinciden) y f (regalo con monto no positivo). Todos esperan 0 filas.
- `215-GATES-FINALES.md`: tabla con comando y resultado, 18 discrepancias heredadas de `typecheck:tests`, unitarios en verde, guards de D-22 y de `;` en migraciones, conteos de tenancy finales, orden de migraciones y la lista de tests de integración que quedan para CI con su primer lugar a mirar.
- `215-UAT.md`: 120 casillas en 9 grupos (despliegue, card y hoja, push y bandeja, detalle de Aura, admin, ocultos, anchos 360/390/412, conciliación y "Lo que solo vos podés hacer").

## Control posterior

- API: `npx tsc --noEmit` 0 (base 0), `pnpm lint:tenant` 0 discrepancias, `typecheck:tests` 18 discrepancias heredadas (ninguna en archivos de la 215).
- App: `pnpm lint` 0 errores, `vue-tsc` 20 (base 20, ninguno en archivos de la fase). Admin: `pnpm lint` 0 errores, `vue-tsc` 36 (base 36).
- Unitarios: API 25 + 16 + 12 + 7 + 27 en verde, app 30 + 31 en verde.
- Sin código tocado, sin migración, sin dependencias, sin bump, sin push. El `.tsv` de la 214 sigue sin trackear.

## Desvios respecto del plan

- Las consultas no se corrieron contra ninguna base (ni local): las tablas de la 215 no existen en la base local porque las migraciones no se aplican. Su sintaxis se revisó por lectura, contra el schema y contra la consulta 05 de la 214.
- El plan pedía el unitario `aura-gift-rules` esperando la cuenta del plan 03 (32): da 25 tests en verde; no hay fallas.
- Se sumaron los bloques a2 y f a la conciliación (no pedidos): cubren un usuario sin fila de saldo y un regalo con monto no positivo.

## Decisiones propias

- La medición lleva un bloque por sede y otro total, porque el total del admin sin filtro cuenta personas distintas y la suma de las sedes no coincide si alguien asistió en dos.
- Las consultas toman `@hoy = CURDATE()` y se puede cambiar a mano; no se usa `CONVERT_TZ` (da NULL en producción).
- El UAT lista las decisiones más pesadas de `215-DECISIONES-AUTONOMAS.md` (109 filas) para que Franco empiece por ahí, y recuerda que la rama de la 213 sigue diciendo "+5 AURA".

## Lecciones para los planes siguientes

- Los gates finales de la 215: ningún bloqueante. `lint:tenant` cubre 306 accesos por exención. Los conteos finales: gym-owned 138, schema 143, `ENTRADAS_BASELINE` 601, `CASOS_BASELINE` 77 (subs y horarios) y 42 (members).
- Hay unos 155 `it` de integración de la fase que nunca corrieron: el primer push a staging (con OK de Franco) corre juntas la suite de la 214 y la de la 215.
- La 0348 sigue reservada para el repaso de la 214 y `origin/master` y `origin/staging` no tienen ninguna migración 0348 a 0359.

## Self-Check: PASSED

Commits `53fb09c62`, `9f5f92fd1` y `6429b1513` y los cuatro archivos de la fase verificados.
