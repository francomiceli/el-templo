---
phase: 172-adopci-n-1-piloto-finance
plan: 19
subsystem: testing
tags:
  [
    tenancy,
    finance,
    iso-03,
    aislamiento,
    coach-load,
    movimientos,
    egresos,
    saldos,
    mutation-testing,
    defensa-en-profundidad,
    hallazgo-de-seguridad,
  ]

# Dependency graph
requires:
  - plan: 172-17
    provides: "test/fixtures/finance-gimnasio-dos.ts (sembrarFinanzasGimnasioDos / sembrarFinanzasTemplo / limpiarFinanzasDeLaBateria / tenantDeLaFila) y la plantilla iso-03-finance-cajas.test.ts"
  - plan: 172-18
    provides: "el molde de siembra local + la leccion de que un listado con INNER JOIN de users tiene DOS filtros (y este grupo, sin socio, no)"
  - phase: 171-backstop
    provides: "test/fixtures/second-tenant.ts (seedSecondTenant, coachToken, TENANT_DOS) y el manifiesto de 372 rutas"
  - phase: 169-capa-de-escritura
    provides: "tenantWhere / tenantValues / assertTenant"
provides:
  - "test/tenancy/iso-03-finance-coach-load.test.ts — 31 tests / 12 describes que cierran las 11 rutas que faltaban (7 de coach-load con rol COACH + 4 de movimientos y egresos)"
  - "La bateria ISO-03 COMPLETA: 14 (172-17) + 13 (172-18) + 11 (172-19) = las 38 rutas finance tenant-scoped del manifiesto"
  - "saldoDeLaCaja: la evidencia de este grupo es el SALDO sumado de la base SIN filtro de gimnasio — filtrarlo esconderia justo la fila colada"
  - "HALLAZGO DE SEGURIDAD (fuga real, dueño fase 173): GET /coach-load/autocompletar/:userId filtra el plan, el importe y el vencimiento de un socio de OTRO gimnasio, al rol COACH — getMemberSubscription es la unica llamada del handler sin ctx"
  - "HALLAZGO DE ADOPCION (dueño fase 173): POST /coach-load/alta NO se puede completar en un gimnasio nuevo — assignPlan inserta subscriptions sin tenantValues (DEFAULT 1) y el charge, bien filtrado, rechaza y rollea"
  - "REQUISITO DE ADOPCION: un gimnasio nuevo necesita su propia sede virtual 'Templo Online' o las rutas de carga contestan error del servidor en vez del payload vacio del contrato"
  - "Mutation testing de 5 disparos: el rechazo de un movimiento cross-tenant esta sostenido por CUATRO filtros independientes, y solo cae con los cuatro rotos a la vez"
affects: [172-20, 172-21, 172-23, 173]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El actor se pasa EXPLICITO en cada call site (`getComoGimnasioDos(url, gym2.coachToken)`) en vez de esconderlo en el helper: el rol es parte de lo que la bateria afirma (D-10), asi que tiene que verse donde se ejerce"
    - "Un `it.fails` con nombre gritado es la forma honesta de documentar una fuga que la fase no puede arreglar: afirma el contrato CORRECTO, hoy pasa porque falla, y el dia que se arregle se pone en rojo y obliga a desmarcarlo"
    - "Cuando el control positivo no se puede escribir en el gimnasio 2 (por deuda de otro modulo), se escribe en el gimnasio 1: sigue descartando 'la ruta esta rota para todos', que es el falso verde que el control existe para matar"
    - "El MOTIVO del rechazo se afirma junto con el status: una ruta con dos formas de contestar 'no encontrado' puede pasar el caso de aislamiento por el motivo equivocado"
    - "La evidencia de un asiento de doble entrada es el SALDO de las DOS cajas antes y despues: un rechazo que escribio una sola pata deja el neto del sistema distinto de cero"

key-files:
  created:
    - el-templo-api/test/tenancy/iso-03-finance-coach-load.test.ts
  modified: []

key-decisions:
  - "El actor de las 7 rutas de coach-load es gym2.coachToken (D-10, el borde menos privilegiado real) y el de las 4 de movimientos/egresos es gym2.adminToken: estas ultimas viven en finance/routes.ts, cuyo hook de modulo excluye a coach y cuyos handlers exigen FINANCE_VOID_ROLES — seedSecondTenant no crea gestion ni recepcion, asi que admin ES el minimo disponible"
  - "La fuga de getMemberSubscription NO se arregla en esta fase: D-07 dice que en archivos ajenos se tocan UNICAMENTE las queries sobre las 6 tablas strict, y subscriptions no es una de ellas. Se documenta con una asercion ejecutable (it.fails) en vez de un comentario, para que el arreglo de la 173 la ponga en rojo"
  - "El control positivo de POST /alta corre en El Templo y no en el gimnasio 2, porque en el gimnasio 2 hoy es IMPOSIBLE: la sub nace con el DEFAULT 1 y el charge la rechaza. Se agrega un tercer it que certifica lo unico certificable (el rechazo es limpio, sin rastro en ninguno de los dos gimnasios) y que se pone en rojo el dia que la 173 lo arregle"
  - "El archivo siembra el ESPEJO de El Templo (plan + socio sin sub + sub con deuda): sin sub ajena vigente, el rechazo de pay-plan seria el trivial 'no hay nada que renovar' y el caso pasaria sin ejercer una linea de tenancy"
  - "El destino del movimiento propio es una SEGUNDA caja de efectivo sobre la sede virtual, no la cuenta banco del fixture: enforceCajaScope rechaza para un no-owner toda caja sin sucursal (sin sede no hay pais que comparar), asi que la cuenta banco habria matado el control positivo por un motivo ajeno al aislamiento"
  - "saldoDeLaCaja suma SIN filtro de gimnasio, con exencion tenant-safe embebida: lo que hay que cazar es una fila de un gimnasio imputada a la caja del otro, y filtrar por gimnasio esconderia exactamente esa plata"

patterns-established:
  - "Cierre de la plantilla ISO-03: cuando la bateria encuentra deuda de OTRO modulo, el archivo la deja anclada con aserciones que se rompen al arreglarla, y el SUMMARY nombra al dueño"

requirements-completed: []

# Metrics
duration: ~115min
completed: 2026-07-31
---

# Phase 172 Plan 19: El borde menos privilegiado, y la plata que se mueve sin socio Summary

**Las 11 rutas que faltaban quedan probadas contra un segundo gimnasio real —las 7 de `/coach-load/*` con el token de un COACH (el actor más barato que existe) y las 4 de movimientos y egresos, donde la plata se mueve sin pasar por ningún socio—: 31 tests verdes, cada aislamiento con su control positivo, cero `403` esperados y toda escritura verificada contra los SALDOS de las cajas leídos de la base. Con esto la batería ISO-03 cierra las 38 rutas finance del manifiesto (14 + 13 + 11). Pero el resultado que importa no es el verde: bajando al rol coach, la batería encontró una FUGA REAL —`GET /coach-load/autocompletar/:userId` devuelve el plan, el importe y el vencimiento de un socio de OTRO gimnasio— y un BLOQUEO DE ADOPCIÓN —`POST /coach-load/alta` no se puede completar en un gimnasio nuevo—, los dos con el mismo origen: `subscriptions` todavía no está migrada, y por D-07 esta fase no puede tocarla. Las dos quedan ancladas con aserciones ejecutables que se ponen en rojo el día que la fase 173 las arregle.**

## Performance

- **Duration:** ~115 min, de los cuales ~75 son corridas contra MySQL real (5 corridas del archivo + 1 mutación en 3 pasos + la corrida de los 3 archivos iso-03 juntos)
- **Completed:** 2026-07-31
- **Tasks:** 2/2 (las dos `auto`)
- **Files created:** 1 — **1.912 líneas**, cero archivos de `src/` tocados

## Task Commits

| Task | Nombre                                     | Commit     | Archivos                                                   |
| ---- | ------------------------------------------ | ---------- | ---------------------------------------------------------- |
| 1    | las 7 rutas de coach-load con el rol COACH | `bbb9c6ed` | `test/tenancy/iso-03-finance-coach-load.test.ts` (1.458 L) |
| 2    | las 4 de movimientos y egresos             | `ed12efa9` | mismo archivo, a **1.912 líneas**                          |

Los dos commits viven en `/home/franco/projects/et-172` (rama `feat/172-adopcion-finance`, sobre `ef04fb08` del plan 18). El SUMMARY + STATE + ROADMAP van en el checkout principal.

## 🔴 Lo primero: los dos hallazgos que la batería sacó a la luz

Los dos salen de lo mismo — **el módulo `subscriptions` todavía no está migrado** (es la fase 173) — y los dos aparecieron **solo** al bajar al rol coach, que es exactamente lo que D-10 pedía.

### 1. FUGA de datos entre gimnasios en `GET /coach-load/autocompletar/:userId`

`subscriptionService.getMemberSubscription(userId)` es la **única** llamada de ese handler que no recibe `ctx`: su query filtra por `userId` y por estado, **sin gimnasio** (`src/modules/subscriptions/service.ts` ~L919). Con un socio de otro gimnasio que tenga una sub vigente, la ruta devuelve su **`planName`, su `amount`, su `currency` y su `currentEndDate`** — al **coach** del gimnasio 2, iterando ids.

No es una hipótesis de lectura de código: el archivo la **reproduce**. El `it` que afirma el contrato correcto está marcado como fallo esperado y hoy pasa **porque falla**.

- **Severidad hoy:** ninguna en producción — prod tiene un solo gimnasio. **Bloqueante el día del onboarding del segundo**, que es justo lo que ISO-03 gatea.
- **Qué SÍ aísla la ruta hoy:** `memberBranchId` (la sede del socio) sale de `resolveUserBranchId`, que **sí** lleva su `tenantWhere` (lo puso el 172-11) y cae al fallback propio. Eso está probado con un `it` normal y la mutación lo pone en rojo.
- **Dueño:** fase 173. **Arreglo:** pasarle `ctx` a `getMemberSubscription` y filtrar `subscriptions` (una línea, más los ~8 call sites que ya tienen `ctx` a mano).
- **Por qué no se arregla acá:** D-07 — "en archivos ajenos se tocan ÚNICAMENTE las queries sobre las 6 tablas strict"; `subscriptions` no es una de ellas.

### 2. BLOQUEO de adopción en `POST /coach-load/alta`

`assignPlan` inserta la fila de `subscriptions` **sin `tenantValues`** (`~L1592`), así que la sub de un gimnasio nuevo nace con el **`DEFAULT 1`** de la columna — o sea, en El Templo (T-168-15). Acto seguido el charge la valida como concepto enlazado **con** el filtro de gimnasio (`TransactionService.create`, paso 1d) y no la encuentra:

```
POST /coach-load/alta  (gimnasio 2, socio propio, sede propia, plan propio)
→ 404 {"message":"Concepto enlazado no existe: subscription 17"}
→ rollback completo: ni sub ni charge
```

**Es fail-closed y no es una fuga** (nada queda escrito, en ningún gimnasio — el archivo lo verifica contando filas), pero significa que **el alta de coach-load no es usable por un gimnasio nuevo hasta que la 173 migre `subscriptions`**. Va a la receta de adopción (172-23).

### 3. Requisito de adopción que nadie había escrito: la sede virtual propia

`resolveUserBranchId` cae, cuando el socio no aparece —que es lo que pasa con un socio de otro gimnasio desde que el SELECT lleva su `tenantWhere`—, a un fallback que busca la sede llamada **"Templo Online" del propio gimnasio**. Si el gimnasio no la tiene, el fallback tira un `Error` pelado y la ruta contesta **error del servidor** en vez del payload vacío que pide D-09.

**Un gimnasio nuevo necesita su propia sede virtual para adoptar coach-load.** El archivo la siembra y lo deja escrito en una precondición con ese texto.

## Cobertura: las 11 rutas del grupo, ruta por ruta

| #   | Ruta del manifiesto                        | Actor | Aislamiento                                                                                                  | Control positivo                                          |
| --- | ------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| 1   | `GET .../coach-load/autocompletar/:userId` | coach | la **sede** del socio ajeno no se filtra (cae en la virtual propia) + la fuga del plan, anclada              | su socio: plan, deuda `909` y sede propias                |
| 2   | `GET .../coach-load/bank-accounts`         | coach | barrido por `tenant_id` de **cada** cuenta devuelta                                                          | ve la propia, con su nombre sembrado                      |
| 3   | `GET .../coach-load/caja-efectivo`         | coach | con la sede de El Templo → **sin caja** (`caja: null`)                                                       | con su sede → su caja de efectivo                         |
| 4   | `GET .../coach-load/mis-cargas`            | coach | ni una fila ajena (barrido por `tenant_id`)                                                                  | ve la carga que acaba de hacer                            |
| 4b  | ídem                                       | admin | **el caso que de verdad ejerce la tenancy** (el admin ve TODAS las cargas) + el `total` cuadra con las filas | (mismo control)                                           |
| 5   | `POST .../coach-load/alta`                 | coach | socio de El Templo → **404 "Miembro no encontrado"** + 0 subs + 0 filas en los dos gimnasios                 | la ruta funciona de punta a punta **en El Templo**        |
| 5b  | ídem                                       | coach | **limitación conocida:** con recursos propios se corta en el charge, **sin rastro**                          | (ver hallazgo 2)                                          |
| 6   | `POST .../coach-load/misc`                 | coach | socio de El Templo → **404 "Miembro no encontrado"** + ledger de los dos gimnasios igual                     | cobra a su socio y la fila cae en **su** caja             |
| 7   | `POST .../coach-load/pay-plan`             | coach | socio de El Templo **con sub vigente y deuda** → 404 + ni cobro ni renovación                                | cobra la deuda `909` por el camino settle                 |
| 8   | `POST .../movements`                       | admin | destino ajeno → **404** y **ningún saldo se mueve** (las 2 cajas)                                            | mueve `606` entre dos cajas propias, los 2 saldos cambian |
| 8b  | ídem                                       | admin | **origen** ajeno (la combinación inversa) → 404 + saldos intactos                                            | (mismo control)                                           |
| 9   | `POST .../expenses`                        | admin | centro de costo ajeno → **400** + saldo de su caja intacto                                                   | egreso propio: baja el saldo en `353`                     |
| 9b  | ídem                                       | admin | **caja** ajena → **404** + el saldo de El Templo intacto                                                     | (mismo control)                                           |
| 10  | `POST .../movements/:id/void`              | admin | movimiento ajeno → 404, **las DOS patas** siguen vivas y el arqueo ajeno igual                               | anula el propio: 2 patas anuladas + la plata vuelve       |
| 11  | `POST .../expenses/:id/void`               | admin | egreso ajeno → 404, `voided_at` intacto y saldo ajeno igual                                                  | anula el propio y le devuelve la plata a su caja          |

11 `describe` de ruta + 1 de precondiciones = **12 describes, 31 `it`**. Las filas 4b/5b/8b/9b son casos EXTRA sobre rutas ya contadas.

### El `400` de los egresos también cumple el contrato

`MovementService.loadCaja` y la validación del centro de costo rechazan como **BadRequest**, no como NotFound: para el service un id que no matchea es un body inválido. Lo que D-09 exige es que el recurso ajeno sea **indistinguible del inexistente** y que el status **no filtre existencia**, y eso se cumple: el mensaje es exactamente el mismo que para un id que no existe en ningún gimnasio. Es el mismo precedente que el 172-18 dejó escrito para `validate({cashRegisterId})`.

### El vector "sede ajena" en `/alta` no se afirma, y está explicado

`/alta` lleva `requireBranchAccess({from:"body.branchId"})`, que para un coach corta con un **"prohibido"** antes de llegar a la capa de tenancy — un status que este milestone no define y que el criterio de aceptación prohíbe afirmar. Ese vector está cubierto donde el guard de tenancy es el que corta: `POST /cash-registers/efectivo` (172-17) y `POST /transactions` (172-18). Queda escrito en el archivo.

## LA BATERÍA ISO-03 COMPLETA: las 38 rutas finance con su archivo

Verificado contra `test/tenant-manifest.ts` por script: **38 rutas finance `tenant-scoped`**, y el grupo de este plan son exactamente **11**. Esta tabla es la que consume el gate del **172-20**.

| #   | Ruta (clave del manifiesto)                                  | Archivo de la batería                  | Plan   |
| --- | ------------------------------------------------------------ | -------------------------------------- | ------ |
| 1   | `GET /api/admin/finance/cash-registers`                      | `iso-03-finance-cajas.test.ts`         | 172-17 |
| 2   | `GET /api/admin/finance/cash-registers/balances`             | `iso-03-finance-cajas.test.ts`         | 172-17 |
| 3   | `GET /api/admin/finance/cash-registers/balances/export`      | `iso-03-finance-cajas.test.ts`         | 172-17 |
| 4   | `GET /api/admin/finance/cost-centers`                        | `iso-03-finance-cajas.test.ts`         | 172-17 |
| 5   | `GET /api/admin/finance/cost-centers/all`                    | `iso-03-finance-cajas.test.ts`         | 172-17 |
| 6   | `POST /api/admin/finance/cash-registers`                     | `iso-03-finance-cajas.test.ts`         | 172-17 |
| 7   | `POST /api/admin/finance/cash-registers/efectivo`            | `iso-03-finance-cajas.test.ts`         | 172-17 |
| 8   | `PATCH /api/admin/finance/cash-registers/:id`                | `iso-03-finance-cajas.test.ts`         | 172-17 |
| 9   | `POST /api/admin/finance/cash-registers/:id/close`           | `iso-03-finance-cajas.test.ts`         | 172-17 |
| 10  | `POST /api/admin/finance/cash-registers/:id/reactivate`      | `iso-03-finance-cajas.test.ts`         | 172-17 |
| 11  | `POST /api/admin/finance/cost-centers`                       | `iso-03-finance-cajas.test.ts`         | 172-17 |
| 12  | `PATCH /api/admin/finance/cost-centers/:id`                  | `iso-03-finance-cajas.test.ts`         | 172-17 |
| 13  | `POST /api/admin/finance/cost-centers/:id/deactivate`        | `iso-03-finance-cajas.test.ts`         | 172-17 |
| 14  | `POST /api/admin/finance/cost-centers/:id/reactivate`        | `iso-03-finance-cajas.test.ts`         | 172-17 |
| 15  | `GET /api/admin/finance/transactions`                        | `iso-03-finance-transacciones.test.ts` | 172-18 |
| 16  | `GET /api/admin/finance/transactions/summary`                | `iso-03-finance-transacciones.test.ts` | 172-18 |
| 17  | `GET /api/admin/finance/transactions/export`                 | `iso-03-finance-transacciones.test.ts` | 172-18 |
| 18  | `GET /api/admin/finance/transactions/pending-misc/:memberId` | `iso-03-finance-transacciones.test.ts` | 172-18 |
| 19  | `GET /api/admin/finance/pending-tray`                        | `iso-03-finance-transacciones.test.ts` | 172-18 |
| 20  | `GET /api/admin/finance/pending-tray/export`                 | `iso-03-finance-transacciones.test.ts` | 172-18 |
| 21  | `GET /api/admin/finance/movements-history`                   | `iso-03-finance-transacciones.test.ts` | 172-18 |
| 22  | `GET /api/admin/finance/movements-history/export`            | `iso-03-finance-transacciones.test.ts` | 172-18 |
| 23  | `POST /api/admin/finance/transactions`                       | `iso-03-finance-transacciones.test.ts` | 172-18 |
| 24  | `POST /api/admin/finance/transactions/:id/validate`          | `iso-03-finance-transacciones.test.ts` | 172-18 |
| 25  | `POST /api/admin/finance/transactions/:id/observe`           | `iso-03-finance-transacciones.test.ts` | 172-18 |
| 26  | `POST /api/admin/finance/transactions/:id/correct`           | `iso-03-finance-transacciones.test.ts` | 172-18 |
| 27  | `POST /api/admin/finance/transactions/:id/void`              | `iso-03-finance-transacciones.test.ts` | 172-18 |
| 28  | `GET /api/admin/finance/coach-load/autocompletar/:userId`    | `iso-03-finance-coach-load.test.ts`    | 172-19 |
| 29  | `GET /api/admin/finance/coach-load/bank-accounts`            | `iso-03-finance-coach-load.test.ts`    | 172-19 |
| 30  | `GET /api/admin/finance/coach-load/caja-efectivo`            | `iso-03-finance-coach-load.test.ts`    | 172-19 |
| 31  | `GET /api/admin/finance/coach-load/mis-cargas`               | `iso-03-finance-coach-load.test.ts`    | 172-19 |
| 32  | `POST /api/admin/finance/coach-load/alta`                    | `iso-03-finance-coach-load.test.ts`    | 172-19 |
| 33  | `POST /api/admin/finance/coach-load/misc`                    | `iso-03-finance-coach-load.test.ts`    | 172-19 |
| 34  | `POST /api/admin/finance/coach-load/pay-plan`                | `iso-03-finance-coach-load.test.ts`    | 172-19 |
| 35  | `POST /api/admin/finance/movements`                          | `iso-03-finance-coach-load.test.ts`    | 172-19 |
| 36  | `POST /api/admin/finance/movements/:id/void`                 | `iso-03-finance-coach-load.test.ts`    | 172-19 |
| 37  | `POST /api/admin/finance/expenses`                           | `iso-03-finance-coach-load.test.ts`    | 172-19 |
| 38  | `POST /api/admin/finance/expenses/:id/void`                  | `iso-03-finance-coach-load.test.ts`    | 172-19 |

**14 + 13 + 11 = 38.** Ninguna ruta finance `tenant-scoped` queda sin caso.

## La mutación de cierre: hicieron falta CINCO disparos, y ese es el hallazgo

El plan pedía romper un `tenantWhere` de `movement-service.ts` o de `coach-load-routes.ts` y ver caer los casos. Se hizo, **y con las tres primeras mutaciones solo cayó UNA**:

```
Mutación A: resolveCajaCountry (finance/routes.ts)  pierde tenantWhere(cashRegisters, ctx)
Mutación B: loadCaja (movement-service.ts)          pierde tenantWhere(cashRegisters, ctx)
Mutación C: resolveUserBranchId (coach-load-routes) pierde tenantWhere(users, ctx)

  Tests  1 failed | 30 passed (31)   ← solo el de autocompletar (mutación C)
```

Los movimientos y los egresos **seguían siendo rechazados**. Persiguiéndolo aparecieron dos barreras más, ninguna de ellas la del `tenantWhere` de la tabla:

```
Mutación D: el ON del leftJoin de branches en resolveCajaCountry  → 1 failed  (nada nuevo)
Mutación E: el chequeo de sede de TransactionService.create        → 3 failed
```

Con las **cinco** rotas, el rechazo por fin cae y la plata cruza de verdad:

```
POST /movements → 201 {"outflowTxId":115,"inflowTxId":116, ...}   ← asiento cross-tenant REAL
POST /expenses  → 201 {"expenseTxId":139}                          ← egreso contra la caja 7 de El Templo
```

y los tres tests que tienen que morder, muerden:

| Rojo                                                    | Mutación que lo desbloqueó |
| ------------------------------------------------------- | -------------------------- |
| `autocompletar` — la sede del socio ajeno se filtra     | C (`resolveUserBranchId`)  |
| `POST /movements` — plata a la caja de El Templo        | A + B + D + E (las cuatro) |
| `POST /expenses` — plata restada a la caja de El Templo | A + B + D + E (las cuatro) |

**El hallazgo:** el 172-18 dejó escrito que "en el universo del 19 el `tenantWhere` de la tabla es la ÚNICA barrera". **No lo es.** El camino de un movimiento cross-tenant está cortado por **cuatro filtros independientes y en serie**:

1. `resolveCajaCountry` filtra la **caja** por gimnasio (el guard ni llega a comparar países),
2. …y además filtra la **sede** en el `ON` del `leftJoin`, así que una caja ajena resuelve con país `null` → rechazo,
3. `loadCaja` vuelve a filtrar la caja dentro del service,
4. `create` filtra la **sede** de cada pata del asiento.

Y para la combinación inversa (origen ajeno) hay todavía una quinta: `getBalance` del snapshot de reconciliación, que también lleva la suya — ese caso **siguió verde con las cinco mutaciones**.

Dos consecuencias prácticas:

1. **Es una buena noticia y no una excusa para relajar nada.** Que ninguna mutación suelta abra el agujero es defensa en profundidad real; el día que alguien "simplifique" dos de esas cuatro capas, la tercera todavía sostiene — pero nadie sabrá cuál.
2. **Un test verde no prueba qué línea lo mantiene verde.** Esta corrida es la única razón por la que hoy conocemos la cadena completa, y es lo que hay que copiar en las fases 173-175.

La mutación se revirtió con `git checkout -- <los 4 archivos>` y se verificó: `git status --porcelain` **vacío**, los **4 `md5sum` idénticos** a los de antes de mutar y `grep -c MUTACION` en **0** sobre los 11 archivos de `src/modules/finance/`.

## Verificación

| Criterio                                                                 | Resultado                                                       |
| ------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `pnpm exec vitest run test/tenancy/iso-03-finance-coach-load.test.ts`    | ✅ **31/31** en 152 s (`--hookTimeout=250000`)                  |
| Los **TRES** archivos iso-03 en un solo worker (`--no-file-parallelism`) | ✅ **98/98** en 247 s — cero contaminación entre los tres       |
| `pnpm exec tsc --noEmit`                                                 | ✅ exit 0 después de cada task **y** con cada mutación aplicada |
| `grep -c "toBe(403)"` sobre el archivo                                   | ✅ **0**                                                        |
| `grep -c "toBe(404)"` sobre el archivo                                   | ✅ **9**                                                        |
| `grep -c "coachToken"` sobre el archivo                                  | ✅ **17** (criterio: ≥ 7)                                       |
| `describe` totales                                                       | ✅ **12** (11 de ruta + 1 de precondiciones), **31 `it`**       |
| Rutas del manifiesto cubiertas                                           | ✅ **11/11**, y la batería **38/38** (verificado por script)    |
| Conteo de filas del gimnasio 1 antes/después de un POST ajeno            | ✅ en los 3 POST de coach-load (ledger de los DOS gimnasios)    |
| Saldos antes/después en un movimiento cross-tenant rechazado             | ✅ en los 2 casos de `/movements` y en los 2 de `/expenses`     |
| Mutación de tenancy → rojo                                               | ✅ 3 rojos con 5 mutaciones (ver arriba)                        |
| Mutación revertida                                                       | ✅ `git status --porcelain` vacío + 4 `md5sum` idénticos        |
| `prettier --write` sobre el archivo                                      | ✅ antes de cada corrida larga                                  |
| Archivos de `src/` tocados / entradas de allowlist                       | ✅ **0 / 0**                                                    |

**La corrida de los TRES archivos iso-03 en UN worker es la que prueba que este archivo no ensucia a los vecinos** (Pitfall 10: `isolate: false`, base compartida por worker): comparten la MISMA base y corren en orden, que es exactamente el escenario de contaminación. 98/98.

### 📌 Entradas de allowlist que paga este plan: **0**

Igual que los planes 13→18 y por el mismo motivo: `tenant-lint-allowlist.json` solo cubre `src/` y este plan no toca una línea de `src/`. **La cuenta acumulada para el 172-21 sigue en 51.**

## Accomplishments

- **La batería ISO-03 está completa.** 38 rutas, 98 tests entre los tres archivos, cada aislamiento con su control positivo, cero `403` esperados en los tres.

- **El borde menos privilegiado, ejercido de verdad.** Las 7 rutas de coach-load corren con el token de un **coach** del gimnasio 2 — y el token va **explícito en cada call site**, no escondido en un helper, porque el rol es parte de lo que la batería afirma.

- **Los dos hallazgos que solo aparecen bajando de rol.** La fuga de `autocompletar` y el bloqueo del `alta` estaban ahí desde el 172-11 y ninguna de las 27 rutas anteriores los podía ver: las dos entran por `subscriptions`, y `subscriptions` solo se toca desde coach-load.

- **La evidencia de este grupo es el SALDO.** Los movimientos y los egresos no tienen socio (`member_id NULL`), así que no hay listado que mirar: lo que se afirma es que el arqueo de las dos cajas —en los dos gimnasios— quedó **exactamente igual** después del rechazo. `saldoDeLaCaja` suma de la base **sin filtro de gimnasio** a propósito: lo que hay que cazar es una fila de un gimnasio imputada a la caja del otro, y filtrar la escondería.

- **Las dos patas y el `voided_at`.** `voidMovement` camina `transaction_links` para descubrir la pata hermana, así que una anulación colada se llevaría **las dos** y rompería el neto cero del asiento ajeno. El archivo siembra el movimiento de El Templo **completo** (2 patas + 2 links) justamente para poder afirmarlo.

- **La segunda caja que el control positivo necesitaba, y por qué.** `enforceCajaScope` rechaza para un actor no-owner **toda caja sin sucursal** (sin sede no hay país que comparar), así que la cuenta banco del fixture no sirve de destino: el rechazo llegaría por el guard de país y no por el de gimnasio. La solución fue una segunda caja de efectivo sobre la **sede virtual** del gimnasio 2 (el invariante "una caja efectivo activa por sucursal+moneda" obliga a que sea otra sede).

- **El MOTIVO del rechazo se afirma junto con el status.** Las tres rutas de carga tienen más de una forma de contestar "no encontrado", y solo una es la barrera de tenancy. Sin afirmar el mensaje, el caso de `/alta` habría seguido en verde el día que la ruta se rompiera por otro motivo — que es **exactamente lo que le pasa hoy** con un socio propio.

## Decisions Made

### 1. La fuga se documenta con una aserción ejecutable, no con un comentario

Cuatro opciones y por qué gana la cuarta:

- **No sembrar la sub ajena** — la fuga queda invisible y el caso pasa trivialmente (un socio sin sub no filtra nada). Es el falso verde que esta batería existe para matar.
- **Afirmar el comportamiento actual (con fuga)** — enshrine un agujero de seguridad como si fuera contrato. Inaceptable.
- **Afirmar el contrato correcto en un `it` normal** — archivo rojo, y no se puede arreglar sin violar D-07.
- **Afirmar el contrato correcto en un `it` marcado como fallo esperado** ✅ — hoy documenta la fuga **ejecutando**, y el día que la 173 la arregle el test se pone en **rojo** ("esperaba fallar y pasó") y obliga a desmarcarlo. Es autodestructivo por diseño, que es lo que se quiere de la deuda documentada.

El archivo lo dice con todas las letras, incluido un "no lo borres para poner el archivo en verde: ya está en verde, y borrarlo borra la única prueba de que la fuga existe".

### 2. El control positivo de `/alta` corre en El Templo

Un control positivo existe para matar **un** falso verde: "el caso de aislamiento pasó porque la ruta está rota para todos". Con el alta bloqueada en el gimnasio 2 por deuda de otro módulo, el control **en El Templo** sigue matando exactamente ese falso verde (la ruta funciona de punta a punta, 201 + charge en el gimnasio 1), y el tercer `it` certifica lo único certificable del gimnasio 2: que el rechazo es **limpio**, sin una sub colgada ni una fila de ledger en ninguno de los dos. Una sub del socio del gimnasio 2 sobreviviendo en El Templo **sí** sería un cruce de datos real, y ese es el rojo que ese `it` vigila.

### 3. El espejo de El Templo (plan + socio sin sub + sub con deuda) es parte del contrato del archivo

Tres piezas, tres falsos verdes distintos:

- **El socio sin sub** es el objetivo de `/alta` y `/misc`: tiene que ser **distinto** del que lleva la suscripción, porque `assignPlan` rechaza con conflicto (y no por tenancy) a quien ya tiene un plan activo, y ese rechazo taparía el que se quiere medir.
- **La sub con deuda** es el objetivo de `/pay-plan`: sin ella el rechazo sería el trivial "no hay nada que renovar" y el caso pasaría sin ejercer una línea de tenancy. Con ella, la ruta recorre `renewSubscription` **entero** —lecturas que la 173 todavía no filtra— y el único guard que corta es el de socio de `create`.
- **El plan** lo necesitan las dos, y además lo usa el control positivo del alta.

### 4. El actor: coach en 7, admin en 4, y las dos cosas justificadas

D-10 pide el mínimo **real**. Las 7 de coach-load van con `coachToken` porque `coach-load-routes.ts` declara su propio hook con `FINANCE_LOAD_ROLES` precisamente para dejarlo entrar ahí y **solo** ahí. Las 4 de movimientos y egresos viven en `finance/routes.ts`, cuyo hook de módulo exige `FINANCE_READ_ROLES` (coach **excluido**) y cuyos handlers exigen además `FINANCE_VOID_ROLES` (owner/admin/gestion): `seedSecondTenant` no crea `gestion` ni `recepcion`, así que **`admin` ES el mínimo disponible**. Queda escrito en el nombre de cada `describe`, como pedía el plan.

### 5. El caso EXTRA de `mis-cargas` con el rol admin

Para un coach la ruta fuerza `recordedBy = él mismo`, así que las filas de El Templo quedarían afuera **aunque el filtro de gimnasio no existiera**: el caso con coach es necesario (es el rol real de la ruta) pero no muerde. El caso con **admin** —que ve TODAS las cargas de su gimnasio— es el que de verdad ejerce la tenancy, y de paso afirma que el `total` cuadra con las filas (son dos queries distintas).

## Deviations from Plan

### Auto-fixed Issues

**Ninguno.** No hubo que tocar `src/` ni el fixture compartido.

### Desviaciones de alcance (documentadas, ninguna relaja una aserción)

**1. El control positivo de `POST /coach-load/alta` no está en el gimnasio 2** sino en El Templo, más un tercer `it` que ancla la limitación. Motivo y razonamiento completos en el hallazgo 2 y la decisión 2. **Es la única ruta de las 11 sin control positivo en el gimnasio 2**, y no por decisión del plan sino porque hoy es imposible.

**2. Un `it` marcado como fallo esperado** para la fuga de `autocompletar` (decisión 1). No estaba en el plan; el plan asumía que ese vector estaba mitigado (T-172-19-01) y no lo está.

**3. El rechazo de `POST /expenses` con centro de costo ajeno es `400` y no `404`.** El plan pedía 404; el service trata un id que no matchea como body inválido. El contrato D-09 se cumple igual (mensaje idéntico al de un id inexistente, sin filtrar existencia) y es el mismo precedente que el 172-18 dejó escrito. Se agregó **un caso extra** con la **caja** ajena, que sí da 404, para que el grupo tenga los dos sabores.

**4. Siembra propia más grande que la de los planes 17 y 18:** sede virtual del gimnasio 2, segunda caja de efectivo, plan + socio + sub con deuda de El Templo, sub con deuda del gimnasio 2, movimiento completo (2 patas + 2 links) y egreso de El Templo. Cada pieza está justificada en su docblock; todas viven en el **test** y no en el fixture compartido (misma decisión que el 172-18: no obligar a re-correr los archivos de los otros dos planes).

**5. La mutación de cierre fue de CINCO disparos, no de uno.** El plan pedía apuntarle al `tenantWhere` de la tabla asumiendo que era la única barrera. No lo era, y perseguirlo produjo el hallazgo más útil del plan (la cadena de cuatro filtros).

**6. El vector "sede ajena" no se afirma en `/alta`** (lo corta el preHandler de sede con un status que el criterio de aceptación prohíbe escribir). Queda explicado en el archivo y cubierto en otros dos archivos de la batería.

---

**Total deviations:** 0 auto-fixed + 6 de alcance. Ninguna relaja una aserción; cuatro **agregan** cobertura y dos documentan deuda ajena con aserciones ejecutables.

## Issues Encountered

**`tsc --noEmit` sigue sin cubrir `test/`** (`tsconfig.json` incluye solo `src/**/*`). Se corrió igual después de cada task y después de cada mutación —exit 0— porque prueba que no se rompió `src/`. El único gate real de un archivo de test sigue siendo vitest.

**No hay ESLint en `el-templo-api`.** Se corrió `prettier --write` sobre el archivo antes de cada corrida larga (lección del 172-13).

**Este plan NO corrió con la sonda strict encendida**, por regla explícita del plan (no se toca `src/db/tenant-tables.ts`). El archivo está escrito **strict-safe por construcción**: sus tres lecturas crudas (`estaAnulada`, `saldoDeLaCaja`, `contarSubsDelSocio`) llevan su exención `tenant-safe:` embebida con el motivo, y todas las demás queries van por `tenantWhere` / `tenantValues`. Aun así, el **172-21 tiene que volver a correr este archivo con el throw encendido**.

## Deferred Issues

**🔴 NUEVO — la fuga de `getMemberSubscription` y el bloqueo del alta.** Los dos son de la **fase 173** (`subscriptions`), por D-07. Van a `deferred-items.md` con el detalle y con el nombre del `it` que los ancla, para que quien los arregle sepa qué test se le va a poner en rojo.

**Los 2 rojos de `test/tenancy/con-06-lint.test.ts`** siguen siendo del **172-21** (51 entradas stale de allowlist + la lente estática). En `deferred-items.md` desde el 172-16.

**Los 2 rojos ambientales de `coach-load-alta.test.ts`** siguen en `deferred-items.md` desde el 172-14; fuera de alcance.

**`test/tenancy` entero en paralelo no entra en esta máquina** (del 172-18). Este plan agrega el tercer archivo de la batería: la corrida válida son los tres **en un worker** (`--no-file-parallelism`), que da 98/98.

## Threat Flags

| Flag                                  | File                                            | Description                                                                                                                                                                                                                                                                                                        |
| ------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| threat_flag: cross-tenant-read (REAL) | `src/modules/subscriptions/service.ts` (~L919)  | **`getMemberSubscription(userId)` no recibe `ctx`**: `GET /coach-load/autocompletar/:userId` devuelve `planName`, `amount`, `currency` y `currentEndDate` de un socio de OTRO gimnasio, al rol **coach**. Reproducido por el archivo. Fuera de alcance por D-07 — **fase 173**. Ancla: el `it` de "FUGA CONOCIDA". |
| threat_flag: missing-tenant-stamp     | `src/modules/subscriptions/service.ts` (~L1592) | **`assignPlan` inserta `subscriptions` sin `tenantValues`** → `DEFAULT 1`. Fail-closed (el charge rechaza y rollea), pero **bloquea `POST /coach-load/alta` para todo gimnasio que no sea El Templo**. Fuera de alcance por D-07 — **fase 173**. Ancla: el `it` de "limitacion conocida".                          |
| threat_flag: adoption-prerequisite    | `src/modules/finance/coach-load-routes.ts`      | El fallback de `resolveUserBranchId` exige una sede virtual **"Templo Online" propia del gimnasio**; sin ella, las rutas de carga contestan error del servidor en vez del payload vacío del contrato. No es un agujero, es un **requisito de onboarding** — va a la receta (172-23).                               |

Sigue vigente la bandera del 172-18 sobre `canAccessBranch` (`shared/branch-access.ts`), que este archivo vuelve a rozar en `/alta`.

Ningún otro. Este plan no agrega superficie: no crea rutas, no cambia permisos, no toca schemas de request, no instala paquetes y no modifica una línea de `src/`.

Mitigaciones del `<threat_model>` del plan:

| Threat      | Estado                                                                                                                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-172-19-01 | ⚠️ **PARCIAL — el vector está roto y ahora está probado.** La **sede** del socio ajeno sí está aislada (caso verde + rojo bajo mutación); el **plan** del socio ajeno **se filtra** y queda anclado con un `it` marcado como fallo esperado. Dueño del arreglo: fase 173. |
| T-172-19-02 | ✅ 2 casos (destino ajeno y origen ajeno) con los saldos de las cajas de los DOS gimnasios comparados antes y después, más el control que verifica que un movimiento propio SÍ mueve los dos saldos                                                                       |
| T-172-19-03 | ✅ 2 casos de anulación ajena: 404 + `voided_at` intacto (las **dos** patas en el movimiento) + el arqueo ajeno sin moverse, con su control positivo de anulación propia                                                                                                  |
| T-172-19-04 | ✅ los 3 POST de coach-load cuentan el ledger de los DOS gimnasios antes/después, y los de `/alta` y `/pay-plan` además cuentan las suscripciones del socio ajeno (evidencia del rollback)                                                                                |
| T-172-SC    | ✅ no se instaló ni actualizó ningún paquete                                                                                                                                                                                                                              |

## Next Phase Readiness

**El 172-20 (gate de cobertura) tiene todo lo que necesita:** la tabla de las 38 rutas con su archivo está arriba, en el formato de clave del manifiesto (`"<MÉTODO> <url>"`), y los tres archivos tienen su lista en el docblock. Verificado por script: el manifiesto tiene **exactamente 38** rutas finance `tenant-scoped` y las 38 están cubiertas.

**Cinco cosas que los planes siguientes dan por sentadas:**

1. **La corrida válida de la batería son los TRES archivos en UN worker** (`--no-file-parallelism`): 98/98. En paralelo, el provisioning de las bases por worker de esta máquina da falsos rojos (deferred del 172-18).
2. **El 172-21 tiene que volver a correr este archivo con el sentinel en throw.** Las tres lecturas crudas llevan su exención embebida; el resto va por `tenantWhere`/`tenantValues`.
3. **El 172-23 (receta de adopción) tiene tres entradas nuevas y obligatorias:** la sede virtual propia, el bloqueo del alta hasta la 173, y la fuga de `autocompletar` como riesgo declarado del onboarding.
4. **La fase 173 arranca con dos rojos esperándola**, y son buenos rojos: al pasarle `ctx` a `getMemberSubscription` y `tenantValues` al insert de `assignPlan`, los dos `it` anclados se ponen en rojo y hay que convertirlos en casos de aislamiento y control normales. Está escrito adentro de cada uno.
5. **La cadena de cuatro filtros del camino de un movimiento** (documentada arriba) es la referencia para las mutaciones de las fases 173-175: apuntarle a un solo `tenantWhere` y ver que no pasa nada **no** significa que el test no muerda.

**Sin blockers para el 172-20.**

## Self-Check: PASSED

- `FOUND` `.planning/phases/172-adopci-n-1-piloto-finance/172-19-SUMMARY.md`
- `FOUND` commits `bbb9c6ed` (T1) y `ed12efa9` (T2) en `feat/172-adopcion-finance`
- `FOUND` `el-templo-api/test/tenancy/iso-03-finance-coach-load.test.ts` (1.912 líneas)
- `VERIFIED` **31/31** verdes con `--hookTimeout=250000`; `tsc --noEmit` exit 0 después de cada task
- `VERIFIED` **98/98** con los TRES archivos iso-03 en UN solo worker (`--no-file-parallelism`)
- `VERIFIED` `grep -c "toBe(403)"` = **0**, `grep -c "toBe(404)"` = **9**, `grep -c "coachToken"` = **17**
- `VERIFIED` 12 `describe` (11 de ruta + 1 de precondiciones) y las **11 rutas** del manifiesto cubiertas
- `VERIFIED` por script contra `test/tenant-manifest.ts`: **38** rutas finance `tenant-scoped`, las **11** de este grupo exactamente las esperadas
- `VERIFIED` la mutación de 5 `tenantWhere` en `src/` produce **3 rojos** (y con menos de 4, ninguno en el camino del dinero), y quedó **revertida**: `git status --porcelain` vacío, los 4 `md5sum` idénticos a los previos y `grep -c MUTACION` en 0
- `VERIFIED` `git diff --stat ef04fb08..HEAD` = 1 archivo, **0 archivos de `src/`**
- `VERIFIED` `tenant-lint-allowlist.json` sin modificar y `src/db/tenant-tables.ts` sin tocar (la sonda no se encendió en ningún momento)

**ADO-01 NO se marca completo:** el requisito exige `finance` migrado con aislamiento verde de las 38 rutas, y aunque las 38 ya tienen caso, **una de ellas (`/coach-load/alta`) no es operable por un gimnasio nuevo y otra (`/coach-load/autocompletar`) filtra datos ajenos** — las dos por deuda de la fase 173. **ISO-03 tampoco se marca**: lo cierra el gate del 172-20.

---

_Phase: 172-adopci-n-1-piloto-finance_
_Completed: 2026-07-31_
