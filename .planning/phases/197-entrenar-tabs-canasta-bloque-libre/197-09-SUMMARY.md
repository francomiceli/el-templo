---
phase: 197-entrenar-tabs-canasta-bloque-libre
plan: 09
subsystem: api-tests
tags: [bloque-libre, invariantes, tenancy, iso-03, d-13]
requires: ["197-08"]
provides:
  - Invariante de aislamiento de contadores (D-13)
  - ISO-03 de las 3 rutas de la canasta (aislamiento, control positivo, guard de módulo)
affects: [197-14]
key-files:
  created:
    - el-templo-api/test/sessions/free-blocks-invariants.test.ts
    - el-templo-api/test/tenancy/iso-03-free-blocks.test.ts
  modified: []
requirements: [D-13, D-14]
---

# Fase 197 Plan 09: Invariantes de contadores y tenancy — Summary

Dos baterías (corren en CI) que cierran el API de la fase: el bloque libre no toca nada del entrenamiento regular y un socio del gimnasio 2 no ve, no abre ni cierra bloques de El Templo.

## Qué se hizo

1. **`free-blocks-invariants.test.ts`** (3 `it`). Socio presencial con perfil (racha 3/5), inscripción de programa activa (`sessionsCompletedThisWeek: 1`, `currentWeek: 2`), una `completed_sessions` de ayer, template `post_session_soreness` sembrado y dos bloques de canasta. `snapshot()` toma: filas de `completed_sessions`, racha, enrollment, `pending_notifications` (todas, con su template por left join, más el conteo de soreness), `/api/progression/stats` completo (`totalDaysTrained`, `currentStreak`, `sessionsThisWeek`, `todaySession`, etc.), `completedDates` de `/api/sessions/weekly` y `aura_transactions` por `source_type`. Casos: (1) cierre de 12' con AURA + cierre de 5' -> `toEqual` estricto de todo salvo `extra_block` (+1) y `extra_blocks_completed` (+2); (2) solo un cierre de 4' -> ni `extra_block` se mueve; (3) "Seguir entrenando" (misma fila, cruza 10') -> +1 AURA y +1 fila.
2. **`iso-03-free-blocks.test.ts`** (10 `it`, 3 `describe` con la clave de cada ruta). Setup: `seedSecondTenant`, `restoreTemploFlags`, `setModuleFlag(TENANT_DOS, "templo-training", true)`, un socio presencial por gimnasio (`createPresencialMember` con `ctx`/`branchId`) y un bloque por gimnasio. Casos: (a) lista del gym 2 = solo el suyo; (b) GET de un bloque de El Templo -> 404 `"Bloque no disponible"`; (c) POST complete ajeno -> 404 y 0 filas en ambos tenants; (d) POST propio -> fila con `tenant_id = TENANT_DOS`; (e) controles positivos de El Templo (y cruce inverso 404); (f) módulo OFF -> 404 del guard en las 3 rutas, probando antes que con el flag ON la misma request anda. `afterAll`: `cleanAllTestData` + `limpiarSegundoGimnasio` + `restoreTemploFlags`. No se inscribe en ningún `ARCHIVOS_BATERIA` (docblock).

## Commits

- `c84e77b90` test(197-09): invariante de contadores del bloque libre (D-13)
- `8b32399e5` test(197-09): aislamiento de tenant de la canasta y del cierre

## Verificación (estática)

- Ambos `<verify>` del plan imprimen `OK`. `node --experimental-strip-types --check` sobre los dos archivos: rc=0. Sin `console.`, `any`, ids de `users` ni fechas literales; sin `??` mezclado con `||`/`&&`. Sin node_modules: tests y tipos quedan para CI.

## Desvíos/decisiones

- **`source: "plan_linked"` explícito en el insert de `program_enrollments`**: la columna es `NOT NULL` sin default; el test de 197-07 (`free-blocks-list.test.ts` ~L542) inserta sin `source`. Ver "Para el orquestador".
- **dayIds del gimnasio 2 en otro día, no con sufijo**: la canasta filtra por `dayId LIKE 'W%' AND LIKE '%-{nivel}'`, así que un sufijo lo dejaría fuera. Se usa el mismo nivel (sigma) y otro día de la misma semana (El Templo martes, gimnasio 2 lunes) para que el único filtro que los separe sea el tenant. Sin cruce de año salvo la semana 1 de enero (misma limitación que 197-07/08).
- **Socio del gimnasio 2**: se crea con `createPresencialMember({ ctx, branchId })` (plan presencial + suscripción del tenant 2) en vez de usar `gym2.socios[0]`, que no tiene suscripción.
- **Sin `day_modes` ni `aura_config` para el gimnasio 2**: no se limpian en `limpiarSegundoGimnasio` (FK a `tenants`) y los cierres del gym 2 son de 5' (no piden AURA).
- **Template `post_session_soreness` sembrado** en el invariante: `cleanAllTestData` borra `notification_templates` y sin él un encolado indebido se perdería en silencio.
- El socio del invariante queda en la vista Templo (no se apunta `users.current_program_enrollment_id`); el enrollment solo aporta los contadores.
- `/progression/stats` usa fecha UTC (`toISOString`): con el reloj en 15:00 UTC coincide con la local, por eso `todaySession` es `null` en la foto de partida (la sesión sembrada es de ayer).
- Trailer de commits: `Claude Opus 5.5` según el orquestador.

## Bugs encontrados

Ninguno en código de producción.

## Para el orquestador / planes siguientes

- **Posible rojo en CI en 197-07**: `free-blocks-list.test.ts` inserta `program_enrollments` sin `source` (NOT NULL sin default). `sessions-gating.test.ts` hace lo mismo, así que puede que la DB de test lo acepte, pero el typecheck del insert (`$inferInsert`) lo pediría. Si CI da error de tipo o `Field 'source' doesn't have a default value`, agregar `source: "plan_linked" as const` ahí.
- Supuestos que CI debería confirmar: (a) el 404 del guard de módulo devuelve JSON parseable (los helpers hacen `JSON.parse`); (b) `member_profiles` no lo crea `createTestMember` (se inserta con `tenantValues`; si ya existiera, el unique de `user_id` fallaría); (c) `notification_templates` acepta el insert con `category: "motivacion"` y defaults del resto.

## Self-Check: PASSED

Archivos de test presentes y commits `c84e77b90` y `8b32399e5` en el log de `feat/197-entrenar`.
