---
phase: 201-conquer
plan: 24
subsystem: api-tests, docs
tags: [conquer, e2e, journey, uat, barrido, checkpoint]
requires: ["201-23"]
provides:
  - "test/conquer/journey.test.ts: recorrido E2E del API (S12-1..S12-8)"
  - "201-UAT.md: UAT guiado para Franco y Nacho (con 'Probar en local', validaciones D-20/D-14, pendientes, hallazgos)"
affects: []
tech-stack:
  added: []
  patterns: ["un it largo con pasos comentados por criterio S12-n"]
key-files:
  created:
    - el-templo-api/test/conquer/journey.test.ts
    - .planning/phases/201-conquer/201-UAT.md
  modified: []
decisions:
  - "La molestia del recorrido se guarda en el día `front` (no re-guardando `plancha`): re-guardar plancha tras Subir cargaría el 8 ya guardado sobre el peldaño nuevo y ensuciaría el objetivo 3 que el mismo recorrido afirma."
  - "Novillo aparte se activa dentro del mismo recorrido (cubre S12-3 y deja dos alumnos para el orden del tablero S12-7)."
metrics:
  tasks: 2 de 3 (la 3 es checkpoint humano, pendiente)
  commits: 3
---

# Phase 201 Plan 24: Recorrido E2E, barrido final y UAT Summary

Cierre de la fase: un test de recorrido de punta a punta del API que encadena S12-1..S12-8 con los contratos reales, el barrido estático (a)-(f) de toda la fase y el UAT guiado para Franco y Nacho. **La Tarea 3 (UAT humano en staging) es un checkpoint y NO se ejecutó: queda pendiente de Franco y Nacho.**

## Commits

- `2fbd73822` test(201-24): recorrido de punta a punta de Conquer (S12-1..S12-8)
- `561ddc6ec` docs(201-24): UAT guiado de Conquer para Franco y Nacho
- `docs(201-24): summary del plan 24` (este archivo)

## Tarea 1: `journey.test.ts`

Un solo `it` (timeout 120 s) con pasos comentados por criterio. Todo con fábricas (`createTestMember`, `createConquerStaff`, `activateViaApi`), fechas relativas (`memberToday`, `weeksAgo`) y el R2 mockeado con `mockPrivateMedia`. Sin ids de `users`, sin fechas literales.

Orden del recorrido y qué afirma:

1. D-17/D-12: socio sin plan -> `GET /state` `bloqueado` (`member: null`) -> `POST /unlock-request` -> `pedido`; admin: `requests/count` 0 -> 1 y la lista trae al socio.
2. S12-1: `POST /members` Toro 4 días -> 201 `activo`, contador 1 -> 0, **48 escalones** (`readConquerSteps`).
3. S12-3: Novillo aparte (activado con el mismo admin): Hoy sin `opening` ni `saturday`, plan sin sábado, `?day=sabado` 400 `CONQUER_DIA_INVALIDO`, `PUT` con `opening` 409 `CONQUER_SIN_COMBOS`.
4. S12-8/D-15: `GET /state` con `bodyCheck.mustPromptDay0 true` -> `POST /body-checks/skip-day0` -> `day0Pending true`.
5. S12-7: tablero con los dos alumnos (`amarillo 1`, `ok 1`, `total 2`), el Toro con `control_dia0_pendiente`.
6. S12-2: historial Planche press e1 6, 7, 8 en semanas pasadas (`insertConquerSession`); Hoy trae `plancha` (D-16), `opening` precargada y e1 `rungName tuck, target 8, value 8, estado techo1`.
7. S12-3/S12-5: guardar lo precargado con la apertura (Toro) -> `lighting.primary` no vacío, una sesión de hoy; `GET /progress` con `subir` = Planche press e1 tuck -> adv tuck.
8. S12-5: `POST .../e1/subir` 200 -> escalón en `adv_tuck` con `sinceDate` hoy; Hoy y Progreso con e1 `adv tuck, target 3`; el segundo toque da 409 `CONQUER_NO_TOCA_SUBIR`.
9. D-16: `GET /today` sin día propone `front`.
10. S12-6: guardar `front` con molestia 4 -> tablero `rojo 1, ok 1`, el Toro primero, alerta `molestia` `abierta` con `proposal { kind: etapa, stage: 1 }`.
11. S12-6: `POST /recortes aplicar_etapa` con el `alertId` -> ficha con `cutStage 1`, sin la alerta, fila `resuelta` con `resolvedBy` = admin; `GET /today?day=sabado` con `push`/`pull` `target 9, maxSeries 3, drops 6` y `PUT` del sábado 200.
12. S12-8: `POST /body-checks` + `upload-url` + `confirm` (mock): `kind dia0`, `photos.frente true`, la respuesta no contiene la clave; `bodyCheck.hasDay0 true`; desaparece `control_dia0_pendiente` del tablero.
13. S12-8: la URL de la foto -> dueño 200, otro socio 404, admin por la ruta de admin 200, coach 403. Las 3 sesiones de hoy (`front`, `plancha`, `sabado`) cierran el recorrido.

### Barrido estático final (a)-(f)

```
(a) grep -cE '"(GET|POST|PUT|PATCH|DELETE) /api/(members|admin)/conquer' test/tenant-manifest.ts
37
(b) ls el-templo-api/src/db/migrations/029*.sql
0290_conquer_catalog.sql
0291_conquer_member_state.sql
0292_conquer_catalog_seed.sql
    (git diff --name-only origin/staging -- migrations: solo esas tres)
(c) node --no-warnings el-templo-api/test/conquer/oracle-check.mjs
ORACULO OK / SEMILLA OK / MOTOR OK (14785 casos) / REGLAS OK
(d) console.* / : any / <any> / as any / fonts.googleapis|gstatic
    - en src/modules/conquer, test/conquer, app/src/modules/conquer, admin/components/conquer, admin/pages/Conquer*.vue:
      solo test/conquer/fixtures/conquer-app.html:2 (el <link> de Google Fonts del fixture, que no se sirve ni se toca)
    - ampliado a los 172 archivos .ts/.vue/.scss que la rama agregó o modificó vs origin/staging (sin fixtures): sin hallazgos
    - r2Bucket en private-media.ts: sin hallazgos
(e) git diff --name-only origin/staging -- el-templo-app/src/components/anatomy
(vacío)
(f) git diff --stat origin/staging -- app/admin/api package.json
(vacío)
```

Gates: `npx tsc --noEmit` OK; `pnpm lint:tenant` `DISCREPANCIAS: 0`; `pnpm typecheck:tests | grep -E "test/(conquer|unit/conquer|migrations/0290)"` vacío (tras `prettier --write` del archivo). Vitest NO se corrió (regla de la fase): `journey.test.ts` corre en CI.

### Mutantes razonados

Cada mutante se aplicó a producción, se verificó el diff y se revirtió con `git checkout -- <ruta>` (árbol limpio).

1. `CONQUER_MANAGER_ROLES = ["owner", "admin", "coach"]` (`permissions.ts`): el coach pasa a 200 en la ruta de fotos del admin; falla `journey.test.ts:478` (`expect(deCoach.statusCode).toBe(403)`).
2. Quitar `eq(conquerBodyChecks.userId, userId)` de `findOwnCheck` (`body-check-service.ts`): el otro alumno obtiene 200 con la URL de una foto ajena; falla `journey.test.ts:464` (`expect(ajena.statusCode).toBe(404)`).
3. `saturdayPlan`: `drops = cutStage >= 2 ? 6 : 10` (`rules.ts`, el recorte 1 ya no baja los drops): el sábado daría 13; falla `journey.test.ts:393` (`target: 9`). `oracle-check.mjs` con el mutante sigue en `REGLAS OK`, así que solo lo atrapan este test y `test/unit/conquer-rules.test.ts`.
4. `nextTarget`: `if (last >= techo)` sin `prev >= techo` (`engine.ts`): 6, 7, 8 ya daría `subir` con objetivo 3. `oracle-check.mjs` falla (diferencial reps `[0,7,12]`, `[2,0,8]`) y en CI falla `journey.test.ts:304` (`estado: "techo1"` y `target: 8`).

## Tarea 2: `201-UAT.md`

Escrito en español con: (0) qué cubre CI, (1) antes de probar (R2 privado + CORS + `R2_PRIVATE_BUCKET_NAME` / `STAGING_R2_PRIVATE_BUCKET_NAME`, Nacho `admin`/`owner`, push solo con OK de Franco, build nativo por `NSCameraUsageDescription`), (2) **Probar en local** (migrar la base local con `pnpm db:migrate`, `pnpm dev` de API 3000 / app 9000 / admin 9100, cuentas del seed, módulo ya prendido por la 0209, cómo correr fechas hacia atrás con SQL solo en local, limpieza de un alumno), (3) recorrido manual S12-1..S12-9 más D-09/D-22 (incluido el efecto global de los `@font-face` de Cormorant 600/700), D-10/D-17, D-11 (solo el destino), D-12, D-13, D-16 y todos los puntos a ojo que dejaron los ejecutores (picker de 5 días a 390 px, hoja de guardado, `<select>` en iOS, curva del E1 en pantallas anchas, comparador de 226 px y tabla de 4 columnas, letras griegas que caen a Georgia, sábado de Toro sin mapa), (4) validaciones de Nacho (A5, A11, A12, A6, A13, AS-10, AS-9 x2 + las 3 propuestas de D-14) con dónde se cambia cada una, (5) pendientes (**D-11 NO está completo**, apertura a coach D-08), (6) qué cuidar al mergear con la 200, (7) el barrido y (8) tabla de hallazgos vacía.

## Tarea 3: checkpoint humano (PENDIENTE)

`checkpoint:human-verify`, no ejecutada. Falta: Franco confirma CI verde y decide el push a staging (el orquestador pregunta antes de empujar), crea el bucket privado y los secrets (o acepta probar sin fotos), y Franco y Nacho siguen `201-UAT.md` en staging y en un teléfono de 390 px. Señal de reanudación: "aprobado" o los hallazgos pegados en la tabla del UAT.

## Desvíos del plan

- El plan pedía "re-guardar plancha con molestia 4". El recorrido guarda `front` con molestia 4: un re-guardado de plancha tras Subir cargaría el e1 = 8 ya guardado sobre `adv tuck` (por `alreadySaved`) y contaminaría el objetivo 3 que el mismo test afirma. La regla (alerta, tablero rojo, propuesta de etapa 1) se prueba igual y de paso se afirma que Hoy pasa a `front` (D-16).
- El plan decía `GET /today?day=front` para ver el objetivo 3 de Planche press, pero ese ejercicio es del día `plancha`: se consulta `?day=plancha`.
- Se agregaron al recorrido: lista de pedidos del admin, segundo toque de Subir (409), tablero con dos alumnos (S12-7), ficha tras el recorte con la alerta resuelta, desaparición de `control_dia0_pendiente` al hacer el día 0 y el rol `owner/admin` 200 en la foto (control positivo del 403 del coach).
- El barrido (d) del plan pasa en los directorios que listaba; encontré la única mención de `fonts.googleapis` en el fixture `test/conquer/fixtures/conquer-app.html` (ya documentada en 201-02: es fixture, no se sirve). Ampliado además a todos los archivos de la fase vs `origin/staging`.
- No hubo nada roto en el barrido: sin commits `fix(201-24)`.

Ambigüedades nuevas (opción más simple): ninguna de producto. En el UAT, "Veredicto" de Franco y de Nacho separados.

## Known Stubs

Ninguno.

## Self-Check: PASSED

`journey.test.ts` y `201-UAT.md` existen; commits `2fbd73822` y `561ddc6ec` en `git log`.
