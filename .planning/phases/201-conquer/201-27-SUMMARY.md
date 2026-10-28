---
phase: 201-conquer
plan: 27
subsystem: api, app, db
tags: [conquer, guia, guide-seen, migracion-0294, uat-h1, DA-21, DA-24]
requires: ["201-26"]
provides:
  - "migración 0294: conquer_members.guide_seen_at datetime NULL (la PRIMERA fecha en que el alumno vio la guía)"
  - "GET /state: member.guideSeen (boolean, también en POST /unlock-request)"
  - "POST /api/members/conquer/guide-seen -> { guideSeen: true }, solo alumno activo, idempotente"
  - "app: useConquerApi().markGuideSeen, store.applyGuideSeen / store.markGuideSeen (silencioso)"
  - "app: utils/guide.ts con guideScreens/guideLevelLine/plainRuns y las constantes del anexo"
affects: ["201-28", "201-29", "201-30", "201-31", "201-32", "201-33", "201-34", "201-35"]
tech-stack:
  added: []
  patterns:
    - "el 'ya la vio' vive en la base y no en el teléfono (DA-21)"
    - "contenido de la guía como datos puros (runs con énfasis, sin v-html) que importan CQ_TEXTOS"
key-files:
  created:
    - el-templo-api/src/db/migrations/0294_conquer_guide_seen.sql
    - el-templo-api/test/migrations/0294-conquer-guide.test.ts
    - el-templo-api/test/conquer/guide.test.ts
    - el-templo-app/src/modules/conquer/utils/guide.ts
    - el-templo-app/src/modules/conquer/utils/__tests__/guide.test.ts
  modified:
    - el-templo-api/src/db/schema/conquer.ts
    - el-templo-api/src/modules/conquer/{member-service,member-routes,schemas}.ts
    - el-templo-api/test/tenant-manifest.ts
    - el-templo-api/test/tenancy/iso-01-manifiesto.test.ts
    - el-templo-app/src/modules/conquer/{types.ts,composables/useConquerApi.ts,stores/conquerStore.ts}
    - el-templo-app/src/modules/conquer/utils/__tests__/conquerView.test.ts
decisions:
  - "DA-21..DA-25 del plan adoptadas tal cual."
  - "Cross-tenant: el socio del gimnasio 2 recibe 404 si el gimnasio no tiene el módulo (guard de módulo) y 409 CONQUER_NO_ACTIVO si lo tiene prendido (su ctx es el gimnasio 2, que no tiene fila). Los dos casos están testeados; nunca 200 ni 500."
  - "El mensaje fijo del error del cliente es 'No pudimos guardar que viste la guía. Probá de nuevo.' (nunca se muestra: el store es silencioso)."
metrics:
  tasks: 3 de 3
  commits: 4 (+ este docs)
  completed: 2026-10-22
---

# Phase 201 Plan 27: Dato y contenido de la guía "¿Cómo funciona?" Summary

Primera parte del hallazgo 1 del UAT: el API guarda si el alumno ya vio la guía (migración 0294 + `member.guideSeen` + `POST /guide-seen`) y el app tiene la capa de datos (cliente y store) y el contenido testeado de las 6 pantallas (`utils/guide.ts`). La pantalla, la ruta y el disparo son de 201-29. No se tocó `resolveConquerView` ni `ConquerTab`.

## Commits

- `f8ccf66b9` feat(201-27): columna guide_seen_at para la guía de Conquer (migración 0294, DA-21)
- `9b0b9557f` feat(201-27): POST /guide-seen y member.guideSeen en el estado de Conquer (DA-21)
- `99be374fb` test(201-27): guía vista: feliz, idempotente, no activo, ajeno y validación
- `70d59210c` feat(201-27): datos de la guía en el app (guideSeen, markGuideSeen) y contenido de las 6 pantallas (DA-24)

## Contratos

- **`POST /api/members/conquer/guide-seen`** (sin body; se tolera `{}`/`null`): 200 `{ guideSeen: true }`. 409 `CONQUER_NO_ACTIVO` (sin fila o en `pedido`), 401 sin token, 400 si el body no es objeto, 404 si el gimnasio no tiene el módulo. `markGuideSeen(db, ctx, userId)` en `member-service.ts`: `requireOwnActiveMember` + `UPDATE ... WHERE tenant AND user_id AND guide_seen_at IS NULL SET guide_seen_at = NOW()` (conserva la primera fecha).
- **`GET /state`**: `member.guideSeen: boolean` (`guide_seen_at IS NOT NULL`, sin query nueva). Está en `memberStateSchema`, así que también sale en `POST /unlock-request`.
- **Manifiesto:** 515 -> 516 (entrada `POST /api/members/conquer/guide-seen`, `templo-module`/`templo-training`).
- **App `types.ts`:** `ConquerMemberState.guideSeen: boolean`, `GuideSeenResponse { guideSeen: boolean }`.
- **App `useConquerApi().markGuideSeen(): Promise<GuideSeenResponse>`**.
- **App store:** `applyGuideSeen(): void` (pone `member.guideSeen = true` en memoria si hay member) y `markGuideSeen(): Promise<boolean>` (éxito -> `applyGuideSeen()` y `true`; cancelación -> `false` sin marcar; otro error -> `warn` si es 4xx esperado, `error` si no, `applyGuideSeen()` IGUAL y `false`; nunca setea `store.error`).
- **`utils/guide.ts`:** `GuideKey`, `GuideRun { text; strong? }`, `GuideScreen { key; title; lead: GuideRun[]; foot: GuideRun[]; artLabel }`, `guideScreens(level)` (6 para Toro, 5 para Ternero, Novillo y `null`), `guideLevelLine(level)` (`{ title: 'Sos Toro', text }` o `null`), `plainRuns(runs)`, `GUIDE_FLOOR`, `GUIDE_CEILING`, `GUIDE_PAIN_MIN = 4`, `GUIDE_FAILURE_EXAMPLES`. Textos del anexo §9 vía `CQ_TEXTOS`/`holdHelp`/`LEVEL_INFO`; nada del anexo duplicado en `guide.ts`.

## Mutation testing

Corridos de verdad (mutante aplicado, archivo restaurado con `cp` y verificado con `md5sum`):

API (razonados leyendo `guide.test.ts`; vitest no corre local):
1. `markGuideSeen` sin `isNull(guideSeenAt)` -> falla `guide.test.ts:187` (`olderThanOneDay` pasaría a `false` porque el segundo POST pisa la fecha).
2. `guideSeen: true` fijo en `getConquerState` -> falla `guide.test.ts:146` (recién activado debe ser `false`) y `:198`.
3. UPDATE sin `eq(userId, userId)` -> falla `guide.test.ts:198` y `:199` (el otro alumno del gimnasio quedaría en `true`).
4. `guideSeen` fuera de `memberStateSchema` -> el serializador lo borra: `guideSeenOf` tira `undefined !== true` en `guide.test.ts:159`.
5. `NOT NULL` en la columna -> falla `0294-conquer-guide.test.ts:68` (`isNullable` esperado `YES`).

App (copia de `guide.ts` + `format.ts` en el scratchpad con `node --experimental-strip-types` y un script que replica los `expect`; la base pasa `OK`):
6. `apertura` para cualquier nivel no nulo -> `FALLA (2): 5 pantallas novillo | 5 pantallas ternero` (CI: `guide.test.ts:35`).
7. `holdHelp` reemplazado por `ayuda_hold` fija -> `FALLA (1): holdHelp ternero` (CI: `guide.test.ts:75`).
8. `GUIDE_PAIN_MIN = 3` -> `FALLA (1): 4 o más` (CI: `guide.test.ts:163`).
9. `apretar` que incluye el nivel propio -> `FALLA (1): apretar sin propio` (CI: `guide.test.ts:97` y `:108`).

## Gates corridos

- API: `npx tsc --noEmit` limpio; `pnpm lint:tenant` DISCREPANCIAS 0; `pnpm typecheck:tests | grep -E "test/(conquer|unit/conquer|migrations/029)"` vacío; `prettier --check` limpio sobre los archivos tocados.
- `node --no-warnings test/conquer/oracle-check.mjs`: ORACULO OK / SEMILLA OK / MOTOR OK (14785 casos) / REGLAS OK / ANEXO OK.
- App: `pnpm lint` 0 errores (2 warnings preexistentes ajenos: `boot/axios.ts`, `useSessionPlayer.ts`); `vue-tsc` sin errores en `src/modules/conquer`; prettier limpio sobre los archivos del plan.
- Higiene (`console.*`, `any`, `fonts.googleapis`): sin hallazgos.
- Numeración: 0294 libre en worktree, `origin/master`, `origin/staging` y los `et-*` (chequeado antes de crear el `.sql`).
- Tests de vitest: NO corridos (regla del proyecto). Escritos: `0294-conquer-guide.test.ts`, `conquer/guide.test.ts`, `utils/__tests__/guide.test.ts`.
- `git status --porcelain` vacío al cerrar.

## Deviations from Plan

Ninguno de fondo. Detalles menores:

- El plan pedía ajustar "asserts de objeto exacto sobre `member`" que encontrara el grep de `publishNoFace`: no hay ninguno (solo tipos de respuesta en tests; `requests.test.ts` y `_helpers.ts` declaran el `member` sin `guideSeen` y no hace falta). Solo se tocó el fixture tipado de `conquerView.test.ts` en el app.
- El caso cross-tenant (6) tiene dos variantes en vez de una (404 sin módulo, 409 con el módulo prendido), ver Decisions.
- El body inválido (8) se prueba con `it.each` de array, string y número, enviados como JSON crudo con `content-type`.

## Trampas para los planes 28-35

1. **`guideSeen` ya está en `ConquerMemberState`**: cualquier fixture tipado nuevo del app (tests de `resolveConquerView`, de la tab, de la guía) necesita `guideSeen`. En `conquerView.test.ts` quedó en `true` para que sus expectativas de `inicio` no cambien; 201-29 va a sumar la vista `guia` y tiene que agregar casos con `guideSeen: false`.
2. **201-29 decide la vista**: `dia0` gana a `guia`; `guia` solo si `member.guideSeen === false` y el día 0 ya está resuelto (hecho o "Lo hago después"). Al terminar o saltar: `store.markGuideSeen()` (silencioso, ya marca en memoria aunque el API falle). Desde Inicio, "¿Cómo funciona?" relee la guía sin llamar al API (`guideScreens(level)` es pura).
3. **Contenido**: la pantalla pinta `GuideRun[]` con `<strong v-if="run.strong">` (sin `v-html`). `GuideScreen.artLabel` es la descripción accesible de la ilustración. `foot` puede ser `[]` (pantalla 3 sin nivel): no pintar un párrafo vacío. Para la línea "Sos Toro" usar `guideLevelLine(level)`.
4. **No duplicar el copy**: los textos del método salen de `CQ_TEXTOS`; `guide.ts` ya los compone. Si Nacho cambia uno, se cambia en `format.ts` (y en `format.test.ts`).
5. **La base local de Franco** (alumno user 28 ya activado) va a ver la guía una vez después de migrar la 0294 (DA-25): es lo buscado para probar 201-29.
6. Manifiesto en 516.

## Para el orquestador

- **Correr `pnpm db:migrate` en la base LOCAL de Franco** (aplica 0294 sobre la 0293) antes de probar 201-29. El ejecutor no lo corrió ni tocó la base.
- Pendiente de verificar en CI: todo lo de vitest. Lo más delicado: `guide.test.ts` del API (el caso del gimnasio 2 con el módulo prendido espera 409 y el de body inválido espera 400 para array, string y número: depende de la coerción de Ajv de Fastify) y `0294-conquer-guide.test.ts`.

## Lecciones nuevas

- `plan 27`: para correr módulos del app que importan `./format` sin extensión en Node 22 (mutación de utils puras), copiar `guide.ts` y `format.ts` al scratchpad y reescribir el import a `./format.ts`; correr con `node --no-warnings --experimental-strip-types`.
- El `logFailure` del store ignora los 4xx (`isExpected`): una acción que quiera dejar rastro de un 4xx tiene que llamar `log.warn` por su cuenta (como `markGuideSeen`).
- `prettier --write` sobre archivos NUEVOS propios es seguro en el app; el harness avisa "changed on disk", es el formateo.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno: una ruta nueva con `userId` del token, sin body, mitigaciones T-201-99..101 cubiertas (tests de otro alumno, otro gimnasio y falla del API con marca en memoria).

## Self-Check: PASSED
