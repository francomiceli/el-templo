---
phase: 181-dise-o-del-m-dulo-gimnasio-bloqueante
plan: 03
subsystem: docs
tags:
  [
    design-doc,
    offline-sync,
    capacitor-preferences,
    personal-records,
    superset-modeling,
    multitenancy,
  ]

# Dependency graph
requires:
  - phase: 181-02
    provides: "Esqueleto del doc 08 con H-1..H-4 firmados y Definiciones 1-2 completas"
provides:
  - "Definición 3 (offline: outbox client_set_uid, merge last-write-wins por serie, límite ITP/WebKit)"
  - "Definición 4 (récords: recálculo transaccional, gym_personal_records, prohibición del hook event)"
  - "Definición 5 (superseries/circuitos: 4 columnas en la fila del ejercicio, sin tabla de bloques)"
affects:
  [187-plantillas-rutina, 189-registro-de-series, 190-recalculo-de-records]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Outbox local con client_set_uid + unique (tenant_id, client_set_uid) para idempotencia de sync offline"
    - "Recálculo de récords SIEMPRE en la misma transacción que el registro (nunca en hook event ni batch diferido)"
    - "Agrupación de ejercicios en columnas de la fila (group_key/group_type/order_in_group) en vez de tabla de bloques"

key-files:
  created: []
  modified:
    - .docs/saas-multitenancy/08-diseno-modulo-gimnasio.md

key-decisions:
  - "Offline solo cubre la sesión en curso (rutina activa cacheada + outbox de series); catálogo, historial y panel del profe requieren red"
  - "Merge entre dos dispositivos es last-write-wins por serie usando recorded_at del cliente, nunca NOW() del servidor; lo pisado queda en el log de ediciones"
  - "idb/IndexedDB explícitamente NO se adopta en v1 (volumen ~24-100 filas por sesión no lo justifica)"
  - "Sesión sincronizada después de marcarse abandonada NO vuelve a completada salvo cierre manual — marcada como regla de producto que Franco firma junto con el doc"
  - "Récord personal se recalcula dentro de la misma transacción del registro; batch/diferido descartado de plano"
  - "gym_personal_records con columna metric desde v1 aunque solo exista max_weight, para no necesitar ALTER cuando lleguen récords de reps/volumen en v2"
  - "Edición/baja de serie fuerza recálculo completo con MAX(), nunca decremento manual, para evitar el récord fantasma"
  - "Superseries/circuitos viven en 4 columnas de la fila del ejercicio (order_in_day, group_key, group_type, order_in_group); tabla routine_blocks queda como promoción futura, disparada por un requerimiento a nivel de bloque (no de ejercicio)"

patterns-established:
  - "Reutilizar mecanismos ya existentes del repo (sessionPlayerStore.ts, useTokenStorage.ts) en vez de inventar infraestructura offline nueva"
  - "El índice de historial de la Definición 6 sirve dos consultas a la vez: lectura de historial y recálculo de récord"

requirements-completed: [DIS-01]

duration: 35min
completed: 2026-08-27
---

# Phase 181 Plan 03: Definiciones 3, 4 y 5 del doc 08 (offline, récords, superseries) Summary

**Especificó el comportamiento offline con outbox idempotente y merge por serie, la
transaccionalidad obligatoria del recálculo de récords personales, y el modelado de
superseries/circuitos con cuatro columnas en la fila del ejercicio sin tabla de bloques.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3/3 completadas
- **Files modified:** 1

## Accomplishments

- Definición 3 (offline) completa: alcance limitado a la sesión en curso, outbox sobre
  `@capacitor/preferences` reusando `sessionPlayerStore.ts`/`useTokenStorage.ts`, idempotencia
  vía `client_set_uid` con unique `(tenant_id, client_set_uid)`, merge `last-write-wins` por
  serie entre dos dispositivos, doble sello `recorded_at`/`synced_at`, timeout de abandono
  server-side vía `forEachActiveTenant`, caso borde de sync post-abandono marcado como regla de
  producto a firmar por Franco, y el límite de ITP/WebKit en Safari-en-pestaña.
- Definición 4 (récords) completa: recálculo en la misma transacción (descarta el proceso
  diferido con fundamento), tabla `gym_personal_records` con `metric` desde v1, dos caminos
  (alta barata con `ON DUPLICATE KEY UPDATE` vs edición/baja con recálculo `MAX()` completo,
  nunca decremento), concurrencia resuelta con `FOR UPDATE`, prohibición explícita del hook
  `event` (doc 04 §4.1) y la alternativa on-the-fly descartada por `achieved_at`.
- Definición 5 (superseries/circuitos) completa: tabla markdown con las cuatro columnas
  (`order_in_day`, `group_key`, `group_type`, `order_in_group`), argumento del caso simple sin
  costo, argumento del clonado (`INSERT ... SELECT`, cross-ref RUT-03/RUT-04), `group_key`
  generado por el servidor y único por día, y la alternativa `routine_blocks` con su disparador
  concreto de promoción.

## Task Commits

Todas las tareas se resolvieron con una sola escritura del doc, commiteada en un solo commit
atómico (las tres secciones son partes contiguas del mismo archivo y comparten verificación):

1. **Tasks 1-3: Definiciones 3, 4 y 5** - `67becf3c` (docs)

## Files Created/Modified

- `.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md` — reemplazados los tres stubs
  `_PENDIENTE_` de Definición 3, 4 y 5 por las respuestas completas, cada una cerrada con su
  traza de REQ IDs.

## Decisions Made

Ver `key-decisions` en el frontmatter. Todas discreción de Claude dentro de los guardrails del
brief, tal como especificaba el plan — ninguna reabre decisiones ya cerradas del CONTEXT.

## Deviations from Plan

None - plan ejecutado tal como estaba escrito. Las tres secciones se escribieron en un solo
commit en lugar de tres commits separados por task, porque las tres tareas modifican
regiones contiguas del mismo archivo y el plan no exige commits por task individuales para
un plan de tipo docs-only con verificación conjunta al final (`verificar-doc-08.sh` corre
sobre el doc completo, no por sección).

## Self-Check: PASSED

- `.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md` — FOUND, contiene las tres secciones
  completas.
- Commit `67becf3c` — FOUND en `git log`.
- `git diff --name-only` (previo al commit) mostraba únicamente el doc 08 modificado.
- `pnpm exec prettier --check` sobre el doc — sale 0 (post-commit, re-verificado).
- `bash verificar-doc-08.sh` — 2 fallas (Definición 6 y 7, fuera de alcance de este plan,
  pendientes del plan 181-04), bajando de las 5 fallas C4 previas a la ejecución.

## Verificación (salida completa)

```
OK: C1 - el archivo .docs/saas-multitenancy/08-diseno-modulo-gimnasio.md existe
OK: C2 - hay 7 secciones '## Definición N —' (7)
OK: C3 - hay 4 subsecciones '### H-N' (4)
FALLA: C4 - la sección 'Definición 6 — Volumen de datos, esquema e índices' no traza a ningún REQ ID
FALLA: C4 - la sección 'Definición 7 — Mapa de parámetros en tenant_settings' no traza a ningún REQ ID
OK: C5 - constancia de que el-templo-app no se transforma
OK: C6 - constancia del trigger de split de repos
OK: C8 - prettier --check pasa

Resumen: 2 falla(s).
```

Exit code: 1 (esperado — Definiciones 6 y 7 son del plan 181-04, no de este).

## Nota sobre el commit y `.gitignore`

`.docs/` está gitignored a nivel repo. `git add .docs/saas-multitenancy/08-diseno-modulo-gimnasio.md`
imprime el warning "The following paths are ignored" y sale con código 1, pero el archivo
queda igual en el índice (confirmado con `git status --short` antes de commitear). El hook
`lint-staged` también falla al intentar re-stagear el archivo tras `prettier --write`
(mismo motivo), pero el commit se completa igual con el contenido correcto —
comportamiento ya documentado y verificado en el plan 181-02.
