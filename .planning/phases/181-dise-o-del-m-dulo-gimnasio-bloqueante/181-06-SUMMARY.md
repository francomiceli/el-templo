---
phase: 181-dise-o-del-m-dulo-gimnasio-bloqueante
plan: 06
subsystem: docs
tags: [saas-multitenancy, tenancy, requirements-traceability, docs]

# Dependency graph
requires:
  - phase: 181-05
    provides: DIS-02 (superficie member-facing) y Seguridad del diseño (STRIDE) ya escritas en el doc 08
provides:
  - Frontera A1/A2 del módulo Gimnasio, afirmada de forma verificable (moduleScope, /api/gimnasio, cero imports SPOM, exercises intacta)
  - Tabla de trazabilidad REQ → sección con los 37 REQ IDs de v1
  - Decisiones heredadas por las fases 182-192, incluyendo el modelo fijado del rol de plataforma (PLAT-01)
  - README de la serie reconciliado (diferida de login cerrada, trigger de split re-enunciado)
affects: [182, 183, 184, 187, 189, 190, 191, 192]

tech-stack:
  added: []
  patterns:
    - "Trazabilidad REQ → sección como tabla explícita al cierre de un doc de diseño, para que fases ejecutoras no re-litiguen decisiones"

key-files:
  created: []
  modified:
    - .docs/saas-multitenancy/08-diseno-modulo-gimnasio.md
    - .docs/saas-multitenancy/README.md

key-decisions:
  - "Modelo del rol de plataforma (PLAT-01): tabla `platform_users` aparte, con su propio login/JWT que nunca lleva tenant_id — descartadas la opción de un valor nuevo en roleEnum sobre tenant 1 y la de un tenant reservado, porque ambas doblan invariantes existentes (roleEnum sin valor de plataforma, users.tenant_id NOT NULL con assertTenant fail-closed)"
  - "El header del doc 08 decía 'Firmado por Franco (D-09)' de forma prematura (heredado de una ola anterior); se corrigió a 'Completo, pendiente firma de Franco (D-09)' porque la firma real es el gate de la Task 3, todavía no ejecutada"
  - "El trigger del split de repos se re-enuncia con el mismo texto normativo en el doc 08 §H-4 y en el README §6 — condición disparadora idéntica (primer tenant pago publicado en tiendas), verificada por comparación directa"

patterns-established: []

requirements-completed: [] # DIS-01/DIS-02 quedan condicionados a la firma de Franco en Task 3 (checkpoint pendiente, no se marcan completos en esta corrida)

# Metrics
duration: ~35min
completed: 2026-08-27
---

# Fase 181 Plan 06: Cierre del doc 08 (Tasks 1-2 de 3) Summary

**Se escribieron la frontera A1/A2, la trazabilidad completa a los 37 REQ IDs de v1 y las decisiones heredadas por las fases 182-192 (incluyendo el modelo fijado de PLAT-01: tabla `platform_users` aparte); se reconcilió el README de la serie con el doc 08. Task 3 (firma de Franco, D-09) queda pendiente — es un checkpoint bloqueante que este agente NO ejecutó por alcance explícito.**

## Alcance de esta corrida

Este plan tiene 3 tasks. Se ejecutaron **Task 1** y **Task 2** (ambas `type="auto"`). **Task 3
es `checkpoint:human-verify` (gate bloqueante, la firma de Franco/D-09) y NO se ejecutó** —
queda para que el orquestador se la presente a Franco.

## Performance

- **Tasks:** 2/3 completadas (Task 3 pendiente por diseño del plan)
- **Files modified:** 2 (`.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md`, `.docs/saas-multitenancy/README.md`)

## Accomplishments

- Frontera A1/A2 escrita de forma verificable: tablas propias (prefijo `gym_`), rutas
  propias vía `moduleScope(app, "gimnasio", gimnasioRoutes, { prefix: "/api/gimnasio" })`,
  cero imports SPOM en ninguna dirección, `exercises` intacta, acople limitado a FKs +
  lectura de `subscriptions` vía `shared/active-member.ts`.
- Tabla "qué NO se construye" (9 filas, cada una con el helper concreto) y anti-patrones
  nombrados.
- Tabla de trazabilidad REQ → sección con los 37 REQ IDs de v1 (33 filas de REQ que el
  diseño condiciona directamente + 4 filas de REQ de plataforma sin decidir, con su fase y
  qué del doc los condiciona).
- Decisiones heredadas por las fases 182-192, con el modelo del rol de plataforma (PLAT-01)
  **fijado** (no solo listado como opciones): tabla `platform_users` aparte, citando
  `roleEnum` (6 valores, ninguno de plataforma) y `assertTenant` (deniega tenant nulo,
  fail-closed) como los hechos que descartan las otras dos opciones.
- README de la serie reconciliado: `08-diseno-modulo-gimnasio.md` agregado al índice; la
  diferida de login/resolución de tenant/unicidad de email marcada **CERRADA por doc 08
  §H-3** (con el sentido de la resolución resumido); el trigger del split de repos
  re-enunciado con el texto normativo exacto del doc 08 §H-4.
- Doc 08 cerrado: header corregido (ver Deviations), Registro de cambios completado, cero
  `PENDIENTE` restantes, `verificar-doc-08.sh --final` en verde.

## Task Commits

1. **Task 1: Escribir frontera A1/A2, trazabilidad REQ → sección y decisiones heredadas** - `62e20905` (docs)
2. **Task 2: Reconciliar el README de la serie y cerrar el documento** - `83fe569a` (docs)

_Task 3 (checkpoint:human-verify, firma de Franco D-09) NO se ejecutó — gate bloqueante para el orquestador._

No hay commit de metadata de plan (`STATE.md`/`ROADMAP.md`/`REQUIREMENTS.md`) en esta
corrida: los REQ del plan (DIS-01, DIS-02) quedan condicionados a la firma de Franco y esa
actualización de estado corresponde a cuando el checkpoint se resuelva, no antes.

## Files Created/Modified

- `.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md` — Frontera A1/A2, Trazabilidad REQ → sección, Decisiones heredadas, header de estado corregido, Registro de cambios completado
- `.docs/saas-multitenancy/README.md` — índice con el doc 08, diferida de login cerrada, trigger de split re-enunciado, nota de "quinto frontend" en el contrato de tipos

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Header del doc 08 afirmaba una firma que no existía todavía**

- **Found during:** Task 2, al leer el encabezado completo del doc antes de actualizarlo.
- **Issue:** La línea de estado decía `✅ Firmado por Franco (D-09)` desde antes de esta
  corrida (heredado de una ola anterior), pero la firma real es el gate de la Task 3 de
  este mismo plan, que este agente tiene prohibido ejecutar. Dejar esa línea intacta habría
  hecho que el doc mintiera sobre su propio estado.
- **Fix:** Se cambió a `✅ Completo (2026-08-27) — pendiente firma de Franco (D-09)`, y la
  misma redacción se usó en la fila nueva del índice del README.
- **Files modified:** `.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md` (línea de
  estado del encabezado).
- **Commit:** `83fe569a`.

No hubo desviaciones de Rule 2, 3 o 4. Cero código de producto tocado. Cero migraciones.
Cero paquetes instalados.

## Known Stubs

Ninguno. El doc 08 no tiene stubs pendientes fuera de la firma de Franco (que es un gate
explícito del plan, no un stub de contenido).

## Threat Flags

Ninguno. Este plan es docs-only; no introduce superficie de red, auth, storage ni schema
nueva. El threat model del plan (T-181-23..26, T-181-SC) ya cubre el alcance real
ejecutado.

## Self-Check: PASSED

- `.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md` — FOUND, modificado, commiteado en `62e20905` y `83fe569a`.
- `.docs/saas-multitenancy/README.md` — FOUND, modificado, commiteado en `83fe569a`.
- Commit `62e20905` — FOUND en `git log --oneline` de la rama `feat/181-diseno-modulo-gimnasio`.
- Commit `83fe569a` — FOUND en `git log --oneline` de la rama `feat/181-diseno-modulo-gimnasio`.
- `bash .planning/phases/181-dise-o-del-m-dulo-gimnasio-bloqueante/verificar-doc-08.sh --final` — exit 0, 8/8 checks OK (verificado post-commit).
- `git status --porcelain el-templo-api el-templo-app el-templo-admin el-templo-web` — vacío (verificado post-commit).
- Ningún `git push` ejecutado.
