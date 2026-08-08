---
phase: 169-capa-de-escritura-helpers-tenantwhere-tenantvalues-y-tenantc
plan: 08
subsystem: backend
tags:
  [
    multi-tenancy,
    mass-assignment,
    additional-properties,
    fail-closed,
    guard-por-import,
    vitest,
    mysql,
  ]

# Dependency graph
requires:
  - plan: 169-01
    provides: "la única API de tenancy y el criterio de que el tenant sale del scope server-side"
  - plan: 169-07
    provides: "dependencia OPERATIVA (worktree único + tests MySQL-backed serializados), no lógica"
provides:
  - "Inventario D-08 cerrado: los 6 sitios de src/ que spreadean el body del request, con el estado de su body-schema"
  - "createMemberSchema.body con additionalProperties: false — el agujero real que encontró la auditoría, en la ruta de alta de socio asistida"
  - "createProductSchema exportado desde src/modules/gladius/routes.ts para que el guard pueda alcanzarlo"
  - "test/tenancy/con-03-write-paths-tenant-id.test.ts: guard por import de los 6 body-schemas + batería D-09 de 5 rutas × 2 (18 tests verdes)"
  - "Criterio 2 del ROADMAP probado por comportamiento con un gimnasio spoofeado que EXISTE (90369)"
affects:
  - "169-09 (para CON-03/CON-04 sólo queda el gate consolidado de la fase)"
  - "170 (el lint de CI puede apoyarse en que el inventario de spreads es de 6 y está afirmado por un test)"
  - "171 (el manifiesto de rutas extiende esta batería al 100%; ISO-03 en la 172)"
  - "172-175 (cada fase de adopción suma sus rutas a la batería D-09)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Guard por IMPORT del objeto de schema en vez de grep sobre el archivo: un grep cuenta la palabra en un comentario o en un sub-schema anidado y da verde de mentira"
    - "El mensaje del expect nombra el SITIO DE SPREAD que el schema protege, no sólo el schema: el que rompe el guard no sabe qué está desprotegiendo"
    - "El conteo del inventario es su propio test: sin él, borrar una entrada de la tabla hace que el it.each corra una vez menos en silencio"
    - "El gimnasio spoofeado se re-verifica en CADA aserción, no una sola vez: si desapareciera, la FK haría pasar el test por el motivo equivocado"
    - "Rutas con el body ABIERTO (assign, reserve) como los casos de mayor valor de la batería: ahí el campo spoofeado llega de verdad al handler y igual se ignora"
    - "No escribir el literal `...request.body` en comentarios: la auditoría D-08 cuenta esos sitios con un grep y un comentario que lo copiara textual sumaría un falso positivo"

key-files:
  created:
    - el-templo-api/test/tenancy/con-03-write-paths-tenant-id.test.ts
  modified:
    - el-templo-api/src/modules/members/schemas.ts
    - el-templo-api/src/modules/gladius/routes.ts

key-decisions:
  - "La auditoría SÍ encontró algo: createMemberSchema (alta de socio asistida, el sitio de spread de mayor riesgo del repo) no declaraba additionalProperties: false. El plan lo daba por probablemente-limpio y pedía confirmarlo, no asumirlo — confirmarlo era el punto"
  - "Cerrar createMemberSchema NO rompe clientes viejos: Fastify compila ajv con removeAdditional: true, así que una propiedad desconocida se strippea en silencio en vez de producir un 400. Verificado contra el precedente ya documentado en updateLeadSchema"
  - "El fail-closed del guard se probó EN VIVO sacando el additionalProperties recién agregado y viendo la suite en rojo con el mensaje completo; se restauró sin commitear el estado roto"
  - "Se agregaron 2 tests que el plan no pedía (el conteo del inventario y el sanity del gimnasio sembrado) porque sin ellos el guard y la batería se pueden vaciar sin que nada avise"
  - "La existencia del gimnasio spoofeado se chequea dentro del helper de aserción, o sea en los 10 casos, y no una sola vez al principio: 'existía cuando arrancó el archivo' no es lo mismo que 'existía cuando corrió este request'"
  - "CON-03 queda Pending a propósito: es requisito de FASE y lo cierra el gate consolidado del 169-09, igual que decidieron los planes 01 a 07"

metrics:
  duration: "~17min"
  completed: 2026-07-28
---

# Phase 169 Plan 08: Auditoría D-08 y batería D-09 Summary

El riesgo real de la fase —que el `tenant_id` entre por el borde vía mass-assignment— queda cerrado por los dos lados: la auditoría encontró y tapó el único agujero que quedaba (la ruta de alta de socio asistida tenía el body abierto), y ahora hay un guard que deja la suite en rojo si alguien lo vuelve a abrir, más 10 casos que prueban por comportamiento que mandar `tenantId` en el body de una ruta de escritura clave no cambia el gimnasio de la fila creada.

## Performance

- **Duration:** ~17 min
- **Tasks:** 2
- **Files:** 1 creado (712 líneas), 2 modificados
- **Tests:** 18 verdes (7 del guard + 1 sanity + 10 de la batería), 105,7 s

## Tasks Completed

| Task | Nombre                                       | Commit     | Archivos                                                                                                               |
| ---- | -------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1    | Auditoría D-08 + guard fail-closed de los 6  | `5378a5af` | `src/modules/members/schemas.ts`, `src/modules/gladius/routes.ts`, `test/tenancy/con-03-write-paths-tenant-id.test.ts` |
| 2    | Batería D-09 — 5 rutas × 2 (spoof + control) | `a70ee297` | `test/tenancy/con-03-write-paths-tenant-id.test.ts`                                                                    |

## El entregable documental de D-08: el inventario, con su estado

La auditoría se re-corrió desde cero sobre el worktree de la fase, no se copió la tabla del plan. `grep -rn "\.\.\.request\.body\|\.\.\.req\.body" --include=*.ts src/` da **exactamente 6** sitios —los mismos que el plan enumeraba, ninguno nuevo— y los dos greps complementarios (`values({ ...`, y spreads de `body`/`input`/`payload` dentro de un `.values(` multilínea) dan **0**: ningún service del repo spreadea nada en un INSERT, todos enumeran campos.

| #   | Sitio de spread                        | Body-schema                                           | Estado encontrado                                     |
| --- | -------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| 1   | `src/modules/members/routes.ts:651`    | `createMemberSchema` (`members/schemas.ts:472`)       | **ABIERTO — se cerró en este plan**                   |
| 2   | `src/modules/members/routes.ts:766`    | `createTrialMemberSchema` (`members/schemas.ts:315`)  | ya cerrado (`:318`)                                   |
| 3   | `src/modules/scheduling/routes.ts:637` | `rescheduleTrialSchema` (`scheduling/schemas.ts:582`) | ya cerrado (`:598`)                                   |
| 4   | `src/modules/finance/routes.ts:310`    | `createTransactionSchema` (`finance/schemas.ts:52`)   | ya cerrado (`:92`)                                    |
| 5   | `src/modules/campaigns/routes.ts:187`  | `createCampaignSchema` (`campaigns/schemas.ts:22`)    | ya cerrado (`:42`)                                    |
| 6   | `src/modules/gladius/routes.ts:197`    | `createProductSchema` (`gladius/routes.ts:54`)        | ya cerrado (`:66`); **faltaba el `export`**, agregado |

**5 de 6 estaban cerrados, uno no — y el que no era el peor de la lista.** El plan decía que el sondeo previo daba los 6 en verde y pedía "confirmarlo, no asumirlo". Confirmarlo era exactamente el punto: `createMemberSchema` es la ruta de **alta de socio asistida**, el spread #1, la escritura de mayor volumen del admin. Sin `additionalProperties: false`, cualquier propiedad desconocida del payload —`tenantId` la primera— viajaba entera hasta `createMember`. Hoy el service enumera campos en su `.values()`, así que no había explotación posible; pero eso es una costumbre, no un contrato, y el spread la deja a un renglón de dejar de serlo.

El fix va con el docblock que exige el idioma del milestone: cita el texto canónico de `src/db/schema/tenant-column.ts:11-16` (el gimnasio sale SIEMPRE del servidor, jamás de un payload) y el precedente de `members/routes.ts:766` ("Phase 114 D-31: createdBy comes from the JWT, never the request body") — `tenant_id` es el mismo contrato un escalón más arriba.

**Cerrar el schema no rompe clientes viejos**, y quedó escrito por qué: Fastify compila ajv con `removeAdditional: true` por default, así que una propiedad desconocida se **strippea en silencio** en vez de producir un 400. No es una suposición: es el comportamiento que el propio repo ya documenta en `updateLeadSchema` (`members/schemas.ts:382-384`). Se verificó además que ningún test del repo manda campos fuera del schema a `POST /api/admin/members`.

## Task 1 — el guard, y por qué es por import

Primer `describe` del archivo, sin DB: importa los 6 objetos de schema y afirma `body.additionalProperties === false`, con el **sitio de spread que protege** dentro del mensaje del `expect` (no sólo el nombre del schema: el que rompe el guard necesita saber qué está desprotegiendo).

El docblock explica los **dos** caminos por los que un grep daría verde de mentira, y los dos son reales en este repo:

1. cuenta la palabra cuando aparece en un **comentario** — y estos schemas están llenos de comentarios que explican por qué el body va cerrado, incluido el que este plan agregó;
2. cuenta la palabra cuando está en un **sub-schema anidado** y no en la raíz del `body`. `createTransactionSchema` y `createCampaignSchema` tienen las dos cosas (uno adentro de `links.items` / `copySlots` y otro en la raíz), y el que importa es el de la raíz, que es el que acota lo que el handler spreadea.

También quedó escrito **qué hacer cuando el guard se caiga**: no borrar la aserción ni sumar una excepción, sino devolverle el `additionalProperties: false` a la raíz del body, o —si esa ruta de verdad tiene que aceptar propiedades libres— **dejar de spreadear el body** en el handler. Un body abierto y un spread son compatibles de a uno, nunca juntos.

**Fail-closed probado en vivo.** Se sacó el `additionalProperties: false` recién agregado a `createMemberSchema` y la suite quedó en rojo con el mensaje completo (`expected undefined to be false`, más el texto que nombra el sitio de spread y el arreglo). Se restauró antes de commitear; el estado roto no se commiteó.

## Task 2 — la batería D-09, y los tres cuidados que la hacen valer algo

10 casos, 5 rutas × 2 (spoofeado y control), más un sanity del gimnasio sembrado:

| Ruta                                                 | Tabla inspeccionada      | Cierre del body                   |
| ---------------------------------------------------- | ------------------------ | --------------------------------- |
| `POST /api/admin/members` (spread #1)                | `users`                  | cerrado (por este plan)           |
| `POST /api/admin/members/trial` (spread #2)          | `users`                  | cerrado                           |
| `POST /api/admin/finance/transactions` (spread #4)   | `financial_transactions` | cerrado                           |
| `POST /api/admin/subscriptions/members/:id/…/assign` | `subscriptions`          | **ABIERTO**                       |
| `POST /api/members/scheduling/reserve`               | `bookings`               | **ABIERTO** (y el actor es socio) |

**Las 5 rutas no son el mismo test cinco veces**, y eso quedó escrito en el archivo. El payload spoofeado muere en dos lugares distintos: en las tres primeras ajv lo strippea antes del handler (es el guard del Task 1 probado de punta a punta en vez de por introspección), mientras que `assignPlanSchema` y `reserveSchema` **no** declaran `additionalProperties: false` —no están en el inventario D-08 porque sus handlers no spreadean el body— así que ahí el `tenantId` llega de verdad hasta `request.body` y el handler lo ignora porque enumera lo que le pasa al service. **Esos dos son la evidencia más fuerte de la batería: prueban el contrato incluso donde el transporte no lo defiende**, y el de la reserva lo prueba además desde el borde menos privilegiado del repo (actor socio, no staff).

Los tres cuidados, los tres declarados en el docblock:

1. **El gimnasio spoofeado EXISTE** (id `90369`, sembrado en el `beforeAll` con borrado defensivo previo y slug propio del archivo). `tenant_id` tiene FK a `tenants`: con un id inventado la fila nacería en 1 igual, pero por MySQL y no por el código, y el archivo entero pasaría en verde probando nada (T-168-15). **Y se re-verifica en cada una de las 10 aserciones, no una sola vez al principio**: "existía cuando arrancó el archivo" no es lo mismo que "existía cuando corrió este request".
2. **Las aserciones van por `SELECT tenant_id … WHERE id = ?`** sobre la fila realmente creada. Ningún schema de respuesta expone `tenant_id` (ni debe), así que afirmar sobre el JSON sería afirmar sobre nada. El SQL es crudo a propósito: el punto es mirar la columna en la base, no lo que el ORM diga de ella.
3. **Cada ruta se ejercita dos veces.** El par de control es lo que distingue "la ruta ignoró el valor" de "esta ruta nunca escribe tenant y la columna cayó en su DEFAULT las dos veces".

El helper de aserción produce un mensaje que nombra el gimnasio encontrado y explica qué significa el fallo, con el arreglo (`tenantValues(scope, …)`), siguiendo el idioma de `con-01` — un `expected 90369 to be 1` pelado no le dice a nadie que acaba de abrirse un agujero de aislamiento.

**Higiene del worker.** `afterEach` incondicional devuelve El Templo a `active` (este archivo no suspende a nadie, pero con `isolate: false` dejar el gimnasio 1 en estado raro rompería todos los archivos siguientes y el síntoma aparecería lejos). El `afterAll` corre `cleanAllTestData` **antes** de borrar el gimnasio de prueba: si un test hubiera fallado escribiendo una fila en el 90369, la FK impediría borrarlo y el error de limpieza taparía el fallo real. **La trampa de `branches` del 169-06 no aplica acá**: este archivo no siembra sedes para el gimnasio de prueba —no las necesita, el gimnasio sólo tiene que existir— así que no hay `fk_branches_tenant` que bloquee el DELETE.

Fixtures del `test/helpers.ts` existente (`createTestApp`, `getAuthToken`, `registerUser`, `ensureEfectivoCaja`, `cleanAllTestData`); el andamiaje de plan + actividad + horario se copió **localmente** del setup de `test/scheduling-reserve-coverage.test.ts`, sin importar nada de otro archivo de test y **sin agregar un solo helper a `test/helpers.ts`** (las fixtures 2-tenant formales son de la fase 171). El reloj va pinneado a un miércoles con la clase del jueves siguiente, mismo fixture que ese archivo, porque la ventana de reserva del socio es de +2 días.

## Deviations from Plan

**1. [Rule 2 — Funcionalidad crítica ausente] `createMemberSchema` no tenía `additionalProperties: false`**

- **Encontrado en:** Task 1.
- **Problema:** el plan anticipaba que la auditoría "probablemente no encuentre nada que arreglar". Encontró uno, y el más caro: la ruta de alta de socio asistida —el spread #1— aceptaba propiedades libres.
- **Fix:** `additionalProperties: false` en la raíz del `body`, con el docblock que cita `tenant-column.ts:11-16` y el precedente de `createdBy`, exactamente como el plan instruía para este caso. Se verificó primero que no rompe clientes (ajv strippea, no rechaza) y que ningún test manda campos extra a esa ruta.
- **Commit:** `5378a5af`.

**2. [Rule 3 — Blocking] Mis propios comentarios rompían el `<verify>` del plan**

- **Encontrado en:** Task 1, en la primera corrida del `<verify>`.
- **Problema:** los dos docblocks que agregué (en `members/schemas.ts` y en `gladius/routes.ts`) citaban el spread textualmente. El `<verify>` del plan exige que `grep -rn '\.\.\.request\.body' --include=*.ts src/ | wc -l` siga siendo **6**, y mis comentarios lo llevaron a **8**. Es, literalmente, el falso positivo por comentario que el docblock del guard describe como el motivo de no verificar por grep.
- **Fix:** los dos comentarios se reescribieron sin el literal (dicen "SPREADEA el body del request dentro del input de `createX`" y nombran la línea). El conteo volvió a 6. Quedó una nota en el comentario de `gladius/routes.ts` para que nadie lo "mejore" copiando el spread textual de nuevo.
- **Commit:** `5378a5af`.

**3. [Rule 2 — Funcionalidad crítica ausente] Dos tests que el plan no pedía**

- **Encontrado en:** Tasks 1 y 2.
- **Problema:** el guard es un `it.each` sobre una tabla y la batería depende de un gimnasio sembrado. Las dos cosas se pueden vaciar sin que nada avise: borrar una entrada de la tabla hace que el `it.each` corra una vez menos **en verde**, y si el gimnasio 90369 desapareciera, los 10 casos pasarían por la FK en vez de por el código.
- **Fix:** (a) un test que afirma que el inventario tiene 6 entradas y sin nombres repetidos, con el mensaje que explica qué verificar antes de sacar una; (b) el chequeo de existencia del gimnasio spoofeado movido **dentro del helper de aserción**, o sea corriendo en los 10 casos, más un sanity explícito al principio.
- **Commit:** `5378a5af` (a) y `a70ee297` (b).

**Nota sobre el orden TDD:** el Task 2 está marcado `tdd="true"` y se ejecutó escribiendo la batería contra el comportamiento ya existente, sin gate RED previo — el criterio que se prueba es una propiedad del código actual, no una feature nueva. Mismo registro que dejaron los planes 169-01 a 169-06; el único que hizo gate RED real fue el 169-07, cuyo helper no existía todavía.

**Sin desviaciones de alcance:** cero dependencias nuevas, cero installs, cero migraciones, ninguna firma de service tocada, ningún helper agregado a `test/helpers.ts`.

## Verificación

| Verificación                                                                             | Resultado                                       |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `npx tsc --noEmit`                                                                       | **exit 0** (después de cada task)               |
| `npx vitest run test/tenancy/con-03-write-paths-tenant-id.test.ts --no-file-parallelism` | **18 passed** (105,7 s)                         |
| Fail-closed del guard, probado en vivo                                                   | **1 failed** con el mensaje completo, revertido |
| `grep -rn '\.\.\.request\.body' --include=*.ts src/ \| wc -l`                            | **6**                                           |
| `grep -rn 'values({ \.\.\.' --include=*.ts src/`                                         | **0**                                           |
| `export const createProductSchema` en `gladius/routes.ts`                                | presente                                        |
| Cero `any` explícito / cero `console.*` en los 3 archivos                                | OK                                              |
| Residuo en `eltemplo_test_1`: `tenants WHERE id=90369`                                   | **0**                                           |
| Residuo: `users WHERE tenant_id <> 1`                                                    | **0**                                           |
| `tenants WHERE id=1` → `status`                                                          | `active`                                        |
| `git diff --diff-filter=D` de los 2 commits                                              | sin borrados                                    |
| `git status` del worktree tras cada commit                                               | limpio (symlink de `node_modules` borrado)      |

## Threat Model — dispositions cubiertas

| Threat   | Cómo quedó cubierto                                                                                                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-169-38 | 5 rutas × 2 casos afirmando `tenant_id = 1` por SELECT sobre la fila creada, con un gimnasio spoofeado que **existe** y se re-verifica en cada aserción                             |
| T-169-39 | Guard por import de los 6 objetos de schema, con el sitio de spread en el mensaje. Fail-closed probado en vivo: la suite queda en rojo, no en silencio                              |
| T-169-40 | La auditoría se re-corrió desde cero (3 greps, no sólo el del plan) y el `<verify>` exige que el conteo siga en 6; además el conteo del inventario es su propio test                |
| T-169-41 | Gimnasio spoofeado existente + par de control por ruta + aserciones por SELECT y no por respuesta HTTP. Dos de las 5 rutas tienen el body abierto, así que el spoof llega de verdad |
| T-169-42 | **Aceptado y declarado:** el docblock dice que la batería es representativa por D-09 y nombra la fase 171 (manifiesto) y la 172 (ISO-03) como las del barrido completo              |
| T-169-SC | Cero dependencias nuevas, cero installs. `node_modules` por symlink al worktree 167, creado para typechequear/testear y borrado antes de cada commit                                |

## Estado del worktree

`/home/franco/projects/et-169-tenant-layer`, rama `feat/169-capa-escritura`, 18 commits sobre `1200b8af`:

- `c21baefd`, `f6bc7ecc` — plan 169-01
- `0426d4de`, `bb85aa64` — plan 169-02
- `dbb89644`, `f3036876` — plan 169-03
- `3f69a1fe`, `d79d5569` — plan 169-04
- `58b4ea84`, `e2d7793f` — plan 169-05
- `64629f56`, `0847c8da` — plan 169-06
- `e1fa91f4`, `978402e1`, `df2455bc`, `d980234f` — plan 169-07
- `5378a5af` — `feat(169-08): cerrar el body de createMemberSchema y guard de los 6 sitios de spread`
- `a70ee297` — `test(169-08): tenantId en el body no cambia el tenant_id de la fila creada`

Nada pusheado (staging-first: el rollout es del plan 169-09). El symlink de `node_modules` está **borrado**; recrearlo apuntando a `/home/franco/projects/et-167-columnas/el-templo-api/node_modules` antes de cualquier typecheck o corrida de tests, y volver a borrarlo antes de commitear. El checkout principal `/home/franco/projects/el-templo` no se tocó: sigue en `fix/referral-preview-y-refresh-ficha` con su working tree de código intacto.

## Requirements: CON-03 sigue **Pending** a propósito

El frontmatter declara `requirements: [CON-03]` y **no se marcó completo**. Con este plan queda probado el criterio 2 del ROADMAP sobre la batería representativa y cerrada la auditoría D-08, pero CON-03 es un requisito de FASE —"todo INSERT sobre tabla gym-owned toma el `tenant_id` del scope server-side"— y el plan 169-09 es el que corre el gate consolidado que lo cierra. Marcarlo acá sería un falso positivo que el verificador de fase tendría que revertir, igual que decidieron los planes 01 a 07.

## Known Stubs

Ninguno.

## Self-Check: PASSED

- `el-templo-api/test/tenancy/con-03-write-paths-tenant-id.test.ts` presente en el worktree (712 líneas, mínimo del plan 220).
- `el-templo-api/src/modules/members/schemas.ts` y `src/modules/gladius/routes.ts` presentes y modificados.
- Commits presentes en `git log --all`: `5378a5af`, `a70ee297`.
- `git status` del worktree: limpio.
