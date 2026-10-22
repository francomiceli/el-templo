---
phase: 201-conquer
plan: 06
subsystem: api
tags: [conquer, activation, steps, start-offset, admin-routes]
requires: ["201-05"]
provides:
  - "activation-service.ts: activateMember, updateMember, ensureStepsForPlan, toAdminMemberView, CONQUER_INC_RANGES"
  - "POST /api/admin/conquer/members (201) y PUT /api/admin/conquer/members/:userId (200)"
  - "test/conquer/_helpers.ts: activateViaApi, createActiveConquerMember, readConquerSteps, CONQUER_MEMBERS_URL"
affects: [201-07, 201-08, 201-14, 201-15]
tech-stack:
  added: []
  patterns: ["errores de negocio { error, code } vía sendConquerError", "INSERT IGNORE multi-fila con tenantValues por fila"]
key-files:
  created:
    - el-templo-api/src/modules/conquer/activation-service.ts
    - el-templo-api/test/conquer/members-admin.test.ts
  modified:
    - el-templo-api/src/modules/conquer/schemas.ts
    - el-templo-api/src/modules/conquer/admin-routes.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - el-templo-api/test/conquer/_helpers.ts
decisions:
  - "Manifiesto y ENTRADAS_BASELINE: 482 -> 484 (+2, templo-module). Se actualizó también el header fechado de tenant-manifest.ts."
  - "Rangos de incReps (1-3) e incS (1-6) en una sola constante CONQUER_INC_RANGES, usada por el JSON-schema y por el servicio."
metrics:
  tasks: 2
  commits: 4
---

# Phase 201 Plan 06: Alta y edición del alumno de Conquer Summary

Owner/admin activan a un alumno eligiendo nivel y días y los 24/36/48 escalones iniciales salen de la tabla de Toro (§8.2) corrida por el offset editable del nivel (D-14); edición de nivel, días, incrementos y coach.

## Commits

- `feat(201-06): alta del alumno y escalones iniciales por nivel (S12-1, D-14)` — activation-service.ts
- `feat(201-06): rutas de alta y edición de alumnos Conquer` — schemas, admin-routes, manifiesto +2
- `test(201-06): alta por nivel y días, offsets y validaciones` — _helpers.ts, members-admin.test.ts
- `docs(201-06): summary del plan 06` — este archivo

(Los hashes están en `git log --oneline`; el docs commit es el último.)

## Contrato JSON de `AdminMemberView` (lo usan 201-14, 201-15)

`POST /api/admin/conquer/members` (201) y `PUT /api/admin/conquer/members/:userId` (200) devuelven:

```json
{
  "userId": 1,
  "status": "pedido | activo",
  "level": "ternero | novillo | toro | null",
  "daysCount": 4,
  "incReps": 1,
  "incS": 2,
  "coachUserId": 7,
  "activatedAt": "ISO-8601 | null",
  "activationDate": "YYYY-MM-DD | null",
  "levelSince": "YYYY-MM-DD | null",
  "cutStage": 0
}
```

Bodies:

- POST: `{ userId: integer, level: "ternero"|"novillo"|"toro", daysCount: integer, coachUserId?: integer|null }`. `coachUserId` ausente = el admin que activa; `null` = sin coach.
- PUT: al menos una de `level`, `daysCount`, `incReps` (1-3), `incS` (1-6), `coachUserId` (integer|null). Cuerpo vacío = 400 (minProperties).

Errores de negocio (`{ error: "mensaje en español", code }`):

| Código | Status | Cuándo |
|---|---|---|
| `CONQUER_SOCIO_NO_ENCONTRADO` | 404 | userId inexistente, de otro gimnasio o sin rol `member` (POST) |
| `CONQUER_DIAS_INVALIDOS` | 400 | combinación nivel/días inválida (A14), también en PUT |
| `CONQUER_COACH_INVALIDO` | 400 | coach inexistente, de otro gimnasio o socio |
| `CONQUER_YA_ACTIVO` | 409 | alta de alguien ya activo (incluye el perdedor de dos altas simultáneas) |
| `CONQUER_NO_ACTIVO` | 409 | PUT sobre un `pedido` |
| `CONQUER_INCREMENTO_INVALIDO` | 400 | solo si el servicio se llama sin pasar por el JSON-schema |

PUT sin fila de Conquer (socio sin pedido, staff, otro gimnasio, id inexistente) = 404 sin `code` (mensaje "Alumno de Conquer no encontrado"). Los 400 del JSON-schema (rangos de inc, enums, tipos) llevan el formato estándar de Fastify, sin `code`.

## Comportamiento

- `ensureStepsForPlan(tx, ctx, catalog, settings, member, log?)`: para cada ejercicio único de `planDays` y cada `startSteps[]`, crea la fila si falta. Peldaño = `shiftStartPosition(posición del code de Toro, settings.startOffset[nivel], posiciones activas)`. `INSERT IGNORE` + filtro previo: nunca toca filas existentes. Devuelve `affectedRows`. Code de Toro inexistente o inactivo: parte del activo más cercano hacia lo fácil (o hacia lo difícil si no hay) y loguea `warn { exerciseCode, rung }`.
- `activateMember`: valida días (400), destino `member` del gimnasio (404), coach staff (400); carga catálogo, settings y zona horaria fuera de la tx; tx con `SELECT ... FOR UPDATE` primero. `pedido` -> UPDATE (conserva `requested_at`), sin fila -> INSERT. `activation_date = level_since = todayInTz(sede del alumno)`, `cut_stage = 0`. Un duplicado/deadlock de dos altas simultáneas se traduce a 409 `CONQUER_YA_ACTIVO` (T-201-19).
- `updateMember`: FOR UPDATE; 404/409; valida la combinación resultante; `level_since = hoy` solo si el nivel cambia de verdad; `ensureStepsForPlan` solo si cambian los días. Bajar días NO borra escalones. Cambiar de nivel NO mueve ningún escalón existente.
- Roles asignables como coach: `owner, admin, coach, gestion, admin_sede, coach_actividad` (excluye `member`, `tv`, `recepcion`).

## Gates corridos

- Pre-flight `node_modules`: OK.
- `npx tsc --noEmit`: OK tras cada tarea.
- `pnpm lint:tenant`: `DISCREPANCIAS: 0` (el primer intento falló: ver trampas).
- `pnpm typecheck:tests | grep -E "test/(conquer|unit/conquer|migrations/0290)"`: vacío.
- Higiene (`console.*`, `any`, ids de `users` literales): sin hallazgos. `prettier --check` OK sobre todos los archivos tocados.
- Vitest NO se corrió (regla de la fase): `members-admin.test.ts` y el manifiesto corren en CI.

## Mutantes razonados

Cada mutante se aplicó en `activation-service.ts`, se verificó y se revirtió con `git checkout -- <ruta>` (`git status` limpio sobre el archivo).

1. Offset fijo 0 en `ensureStepsForPlan` (`const offset = 0`, línea 206). Falla `members-admin.test.ts:199` (Novillo `planche_hold:e1` esperaba `half_lay`, daría `full`) y `:200` (`hspu:e1` esperaba `pared`). Con `node` sobre `rules.ts`: `shiftStartPosition(0, 1, ...)` = 1 pero con offset 0 = 0.
2. `ensureStepsForPlan` con upsert sobre filas existentes (`onDuplicateKeyUpdate({ set: { rungId } })`; quitar solo el filtro `have` no cambia el resultado porque `INSERT IGNORE` es la segunda defensa). Falla `:543` (`expect(despues.get(key)).toEqual(step)`): el test deja `planche_hold:e1` apuntando a `tuck` con `tamperStep` y ese loop exige que los compartidos queden idénticos, `rungId` incluido, tras 3 a 4 días.
3. `assertValidLevelDays` desactivado (`if (false)`, línea 253). Fallan los 4 casos del `it.each` de `:351` (`statusCode` 400 y `code CONQUER_DIAS_INVALIDOS`; con el mutante darían 201 y `countMemberRows` 1) y `:633` (PUT `novillo` 3 días a `toro`).
4. `activateMember` que no pasa el `status` de `pedido` a `activo` (línea 436: `status: existing ? existing.status : "activo"`). Falla `:279` (`status` esperado `activo`), `:285` (`{ count: 0 }` seguiría en 1) y `:293` (GET /state del alumno daría `pedido`).
5. (Extra) `levelSince` siempre reiniciado en `buildMemberSet`. Falla `:662` (`toBe(vieja)` tras un PUT solo de `incReps`). Si en cambio nunca se reinicia, falla `:669`.
6. (Extra) Sin `tenantWhere` en `assertTargetIsMember`: el socio del gimnasio 2 (rol `member`) pasaría a 201. Falla el caso "socio del gimnasio 2" (`:392-410`, 404) y el test del admin del gimnasio 2 sobre un socio del 1.

## Desvíos del plan

Ninguno de fondo. Notas:

- `ensureStepsForPlan`, `activateMember` y `updateMember` reciben un parámetro final opcional `log?: FastifyBaseLogger` (para el `warn` del plan, que no tenía de dónde sacar el logger). Es compatible con los contratos de `<interfaces>`.
- El plan pedía 12 situaciones; se cubrieron todas más: alta simultánea (201 + 409), sin token (401), socio activándose a sí mismo (403), `recepcion` (403), PUT con body inválido como coach (403 antes que 400), cross-tenant de PUT y de POST con el módulo prendido en el gimnasio 2.
- `CONQUER_INC_RANGES` vive en `activation-service.ts` y `schemas.ts` lo importa (un solo lugar para 1-3 / 1-6).

Ambigüedades nuevas (opción más simple):

- Coach asignable = cualquier staff operativo (`owner, admin, coach, gestion, admin_sede, coach_actividad`); se excluyen `recepcion` y `tv`.
- Reactivar a alguien no es posible (no existe estado "inactivo" en la spec): un `activo` siempre da 409.
- PUT con `level` igual al actual no reinicia `level_since`.
- Code de Toro inexistente en el catálogo: se usa el peldaño activo más fácil de la escalera (con `warn`).

## Trampas / notas para los planes siguientes

- `lint:tenant`: un `INSERT` multi-fila con `.values(rows)` donde `rows` ya trae `tenantId` por otro lado NO pasa el sentinel; hay que escribir `.values(rows.map((r) => tenantValues(ctx, r)))` inline en la llamada.
- `handleServiceError` común responde `{ error: "Solicitud invalida", message }` sin `code`. Para `{ error, code }` se usa `sendConquerError` (privado de `admin-routes.ts`, 201-08 y siguientes pueden moverlo a un archivo compartido del módulo si lo necesitan).
- Un `AppError` llega a la ruta con `err.code` solo si se construyó con el tercer argumento. Los 404 genéricos de "alumno sin fila" no lo llevan.
- `readConquerSteps(app, userId)` (helper de test) devuelve `Map<"<ejercicio>:<e1|e2|e3|hold>", { rungId, rungCode, mode, sinceDate, calibration }>`: usarlo en los tests de Hoy/Guardar de 201-07/08.
- `createActiveConquerMember` crea un admin NUEVO por llamada (devuelve su token en `adminToken`); si un test necesita varios alumnos con el mismo admin, usar `activateViaApi` con un solo `createConquerStaff`.
- El conteo de escalones por plantilla es 4 por ejercicio (e1, e2, e3, hold): 12 ejercicios de Toro = 48; el plan de 3 días tiene 9 ejercicios (36), el de 2 días 6 (24). Los 9 de 3 días están todos dentro de los 12 de 4 días (3 a 4 días crea exactamente 12 filas nuevas).
- Manifiesto: 484 entradas tras 201-06.

## Known Stubs

Ninguno.

## Self-Check: PASSED

Archivos creados existen (`activation-service.ts`, `members-admin.test.ts`); commits de las tareas en `git log`.
