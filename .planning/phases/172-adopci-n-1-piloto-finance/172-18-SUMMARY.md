---
phase: 172-adopci-n-1-piloto-finance
plan: 18
subsystem: testing
tags:
  [
    tenancy,
    finance,
    iso-03,
    aislamiento,
    transacciones,
    bandeja,
    arqueo,
    exports,
    mutation-testing,
    defensa-en-profundidad,
  ]

# Dependency graph
requires:
  - plan: 172-17
    provides: "test/fixtures/finance-gimnasio-dos.ts (sembrarFinanzasGimnasioDos / sembrarFinanzasTemplo / limpiarFinanzasDeLaBateria / tenantDeLaFila / campoDeLaFila) y la plantilla iso-03-finance-cajas.test.ts"
  - phase: 171-backstop
    provides: "test/fixtures/second-tenant.ts (seedSecondTenant, limpiarSegundoGimnasio, TENANT_DOS) y el manifiesto de 372 rutas"
  - phase: 169-capa-de-escritura
    provides: "tenantWhere / tenantValues / assertTenant"
provides:
  - "test/tenancy/iso-03-finance-transacciones.test.ts — 33 tests / 14 describes que cubren las 13 rutas de transacciones, bandeja de pendientes e historial de movimientos, aislamiento + control por ruta"
  - "Importes IRREPETIBLES por gimnasio: la tecnica para probar un AGREGADO (que no devuelve ids sino un numero) y para afirmar exports por contenido"
  - "fotoDeLaTransaccion: la evidencia de tampering sobre plata son 5 columnas juntas (gimnasio, estado, anulacion, caja imputada e importe), no una"
  - "HALLAZGO de la mutacion: el aislamiento de los LISTADOS de este grupo esta sostenido por DOS filtros independientes — sacarle el tenantWhere a buildListConditions NO pone un solo test en rojo porque los INNER JOIN de users/branches ya lo llevan"
  - "Los dos vectores cross-tenant que solo se ven leyendo el codigo: la caja ajena por validate({cashRegisterId}) y el socio ajeno por correct({correctedFields.memberId})"
affects: [172-19, 172-20, 172-21, 172-23]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Un agregado no se afirma con ids sino con NUMEROS EXACTOS sobre importes irrepetibles por gimnasio: si el filtro falla, el total se va a otro orden de magnitud y el rojo se lee solo"
    - "El COUNT de un listado paginado se afirma APARTE de las filas: son dos queries y un filtro que viva en una sola deja al staff viendo 3 filas y un total de 6"
    - "La evidencia de tampering sobre una transaccion es una FOTO de varias columnas comparada con toEqual, no un campo suelto: un rechazo que ya escribio la mitad se ve igual que uno limpio si se mira una sola columna"
    - "Mutation testing que tambien informa cuando NO pone nada en rojo: un tenantWhere que se puede sacar sin romper un test es defensa en profundidad, y saberlo es distinto de no haberlo probado"

key-files:
  created:
    - el-templo-api/test/tenancy/iso-03-finance-transacciones.test.ts
  modified: []

key-decisions:
  - "Los importes de los dos gimnasios son irrepetibles y de otro orden de magnitud (707 / 1.313 contra 9.000.009 / 7.000.007): es la unica forma de afirmar /transactions/summary, que devuelve UN numero y no filas. Hay una precondicion que lo verifica para que nadie los vuelva a hacer coincidir sin enterarse"
  - "La siembra extra (los 4 cobros con importe unico) vive en el TEST y no en el fixture compartido: solo este plan necesita pendientes y montos distinguibles, y tocar el fixture obligaba a re-correr el archivo del 172-17 sin ganar nada"
  - "fotoDeLaTransaccion es local y no una extension de campoDeLaFila: la evidencia de una escritura ajena son 5 columnas juntas, y un unico toEqual da un rojo legible de una mirada. Ademas deja el blast radius del plan en UN archivo"
  - "El vector de la CAJA ajena se prueba en validate({cashRegisterId}) y no en POST /transactions: el body del alta no acepta cashRegisterId (lo resuelve el servidor desde medio de pago + sede), asi que validate es el UNICO camino HTTP a una caja de otro gimnasio"
  - "Se agrego un caso que el plan no pedia: correct({correctedFields.memberId}) con un socio ajeno. Es el camino mas corto para mudar plata de un gimnasio al otro sin tocar ninguna ruta de alta, y ademas prueba el ROLLBACK (corregir es anular + recrear en una sola transaccion)"
  - "El actor es gym2.adminToken en las 13 y esta justificado por D-10: 8 rutas son FINANCE_VOID_ROLES, POST /transactions es FINANCE_WRITE_ROLES y el resto entra por FINANCE_READ_ROLES — en los tres conjuntos el escalon inferior es gestion/recepcion, y seedSecondTenant no crea ninguno de los dos (su unico otro staff es coach, EXCLUIDO de los tres)"

patterns-established:
  - "Molde ISO-03 para agregados y exports: precondicion de importes distinguibles → total exacto → desglose por medio y por sede → planilla parseada por contenido"

requirements-completed: []

# Metrics
duration: ~60min
completed: 2026-07-31
---

# Phase 172 Plan 18: El corazón transaccional de finance, aislado ruta por ruta Summary

**Las 13 rutas donde vive la plata que el staff toca todos los días —cobros, validación, corrección, anulación, bandeja de pendientes, arqueo por caja y los tres exports en `.xlsx`— quedan probadas contra un segundo gimnasio real: 33 tests verdes, cada aislamiento con su control positivo, cero `403` esperados (D-09) y toda escritura verificada releyendo la transacción ajena DE LA BASE. Lo que este plan agrega a la plantilla del 172-17 es la técnica para probar lo que no devuelve filas: importes irrepetibles por gimnasio, para que un total contaminado se vaya a los millones y el rojo se lea solo. Y cierra con una mutación que informa doble: romper el `tenantWhere` de `validate()` y el de `listPendingMiscForMember()` pone exactamente 2 tests en rojo — pero romper el de `buildListConditions()` no pone ninguno, porque el aislamiento de los listados está sostenido por DOS filtros independientes. Eso último no estaba escrito en ningún lado.**

## Performance

- **Duration:** ~60 min, de los cuales ~10 son corridas contra MySQL real (3 corridas del archivo × ~148 s + la corrida del directorio)
- **Completed:** 2026-07-31
- **Tasks:** 2/2 (las dos `auto`)
- **Files created:** 1 — **1.545 líneas**, cero archivos de `src/` tocados

## Task Commits

| Task | Nombre                                         | Commit     | Archivos                                                      |
| ---- | ---------------------------------------------- | ---------- | ------------------------------------------------------------- |
| 1    | las 7 lecturas (listados, resumen y 2 exports) | `e9fd0cd9` | `test/tenancy/iso-03-finance-transacciones.test.ts` (1.054 L) |
| 2    | las 5 escrituras + el export del historial     | `ef04fb08` | mismo archivo, a **1.545 líneas**                             |

Los dos commits viven en `/home/franco/projects/et-172` (rama `feat/172-adopcion-finance`, sobre `0f4ffed4` del plan 17). El SUMMARY + STATE + ROADMAP van en el checkout principal.

## Cobertura: las 13 rutas del grupo, ruta por ruta

| #   | Ruta del manifiesto                           | `describe`                 | Aislamiento                                                                    | Control positivo                                    |
| --- | --------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------- |
| 1   | `GET .../transactions`                        | listado de transacciones   | rango ANCHO (2020→2099) y ni una fila ajena; barrido por `tenant_id` de c/fila | ve sus 3 filas **y el `total` cuenta 3, no 6**      |
| 2   | `GET .../transactions/summary`                | resumen de la caja         | `monthlyRevenue` **exacto**; ninguna sede ajena en el desglose                 | su sede aparece con su plata                        |
| 3   | `GET .../transactions/export`                 | export de transacciones    | el `.xlsx` (parseado) no trae importe ni sede de El Templo                     | sí trae los propios                                 |
| 4   | `GET .../transactions/pending-misc/:memberId` | cobros sueltos de un socio | pidiendo por un usuario ajeno → **lista vacía**                                | por su propio socio, trae el pendiente con su monto |
| 5   | `GET .../pending-tray`                        | bandeja de pendientes      | ni filas ajenas **ni un contador de 2**                                        | ve su pendiente, con su importe                     |
| 6   | `GET .../pending-tray/export`                 | export de la bandeja       | el `.xlsx` no trae el importe ni la caja ajena                                 | sí trae el propio, con su caja                      |
| 7   | `GET .../movements-history`                   | arqueo por caja            | ni filas ajenas ni la **caja** ajena imputada; `total` = 3                     | ve su movimiento, imputado a su caja                |
| 8   | `GET .../movements-history/export`            | export del arqueo          | el `.xlsx` no trae importe ni caja de El Templo                                | sí trae los propios                                 |
| 9   | `POST .../transactions`                       | alta de cobro              | socio ajeno → **404** y no nace fila (conteo de los DOS gimnasios)             | 3 tablas en `TENANT_DOS` + caja propia resuelta     |
| 9b  | ídem                                          | ídem                       | sede ajena → **404** y no nace fila                                            | (mismo control)                                     |
| 10  | `POST .../transactions/:id/validate`          | validación                 | pendiente ajeno → **404** + foto intacta                                       | valida el suyo eligiendo su caja                    |
| 10b | ídem                                          | ídem                       | **caja ajena** en el body → 400 y su propio cobro sigue pendiente              | (mismo control)                                     |
| 11  | `POST .../transactions/:id/observe`           | observación                | pendiente ajeno → **404** + foto intacta                                       | observa el suyo                                     |
| 12  | `POST .../transactions/:id/correct`           | corrección                 | pendiente ajeno → **404** + **no lo anula**                                    | corrige el suyo; el reemplazo nace en el gimnasio 2 |
| 12b | ídem                                          | ídem                       | **socio ajeno** en `correctedFields` → 404 y el propio NO queda anulado        | (mismo control)                                     |
| 13  | `POST .../transactions/:id/void`              | anulación                  | transacción ajena → **404** + sigue viva                                       | anula la suya                                       |

13 `describe` de ruta + 1 de precondiciones = **14 describes, 33 `it`**. Las filas 9b, 10b y 12b son casos EXTRA sobre rutas ya contadas (vectores distintos de la misma ruta), así que la cuenta contra el manifiesto es **13 rutas**: 8 GET + 5 escrituras.

Acumulado de la batería: **14 (172-17) + 13 (este) = 27 de las 38 rutas finance**. Quedan 11 para el **172-19** (coach-load, movimientos y egresos).

## Las cuatro precondiciones (lo que impide el verde por la razón equivocada)

| Precondición                                        | Qué falso-verde mata                                                                                                                                                                    |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Las dos sedes son AR**                            | `list`, `getSummary`, `listPendingTray` y `listMovEgresos` filtran por país además de por gimnasio: con países distintos el aislamiento lo daría el country scope (heredada del 172-17) |
| **El Templo tiene plata viva**                      | sin recurso ajeno, "no ve nada ajeno" es trivialmente cierto                                                                                                                            |
| **Las filas del gimnasio 2 nacieron ahí**           | si la siembra cayera en el `DEFAULT 1` (T-168-15), todos los controles positivos estarían mirando datos de El Templo                                                                    |
| **Los 5 importes sembrados son todos distintos** 🆕 | con importes repetidos, un total que sume plata ajena puede dar **el mismo número** que el correcto — y las aserciones del resumen y de los tres exports dejan de morder                |

La cuarta es propia de este plan y es la que sostiene la mitad del archivo.

## La mutación de cierre: 2 rojos donde tienen que estar, y 1 hallazgo

Sobre el árbol ya commiteado se rompieron **a mano tres `tenantWhere` de `src/modules/finance/transaction-service.ts`** y se volvió a correr:

```
Mutación A: validate()                    pierde tenantWhere(financialTransactions, ctx)
Mutación B: listPendingMiscForMember()    pierde tenantWhere(financialTransactions, ctx)
Mutación C: buildListConditions()         devuelve [] en vez de [tenantWhere(...)]

  Tests  2 failed | 31 passed (33)
```

Los 2 rojos caen **exactamente donde tienen que caer**:

| Rojo                                                                             | Método mutado que lo sirve |
| -------------------------------------------------------------------------------- | -------------------------- |
| `pending-misc/:memberId` — aislamiento (el socio ajeno se ve)                    | `listPendingMiscForMember` |
| `/transactions/:id/validate` — aislamiento (el pendiente ajeno se puede validar) | `validate`                 |

**Y lo que NO se puso rojo es el hallazgo del plan.** La mutación C le sacó el filtro de gimnasio a `buildListConditions`, que sirve a `GET /transactions` **y** a `GET /transactions/export`, y **ningún test cambió de color**. No es que las aserciones no muerdan: es que esas dos rutas hacen `INNER JOIN users` y `INNER JOIN branches` **con su propio `tenantWhere`**, y la transacción de El Templo apunta a un socio y a una sede de El Templo — no sobrevive al join aunque el filtro de su propia tabla desaparezca. Lo mismo pasa, por otras vías, con `listPendingTray` (su `eq(branches.country, …)` sobre un LEFT JOIN ya tenant-filtrado deja la fila ajena en NULL) y con `listMovEgresos` (su subquery de cajas del país lleva su propio filtro).

O sea: **el aislamiento de los listados de este grupo está sostenido por dos filtros independientes**, y el de `financial_transactions` es defensa en profundidad. Dos consecuencias prácticas, y las dos importan:

1. **No relajar nada.** El día que uno de esos joins pase a `LEFT`, o que aparezca un listado sin join de socio (los egresos y traspasos tienen `member_id NULL` — justo el caso del **172-19**), el `tenantWhere` de la tabla pasa a ser la ÚNICA barrera.
2. **Un test verde no prueba qué línea lo mantiene verde.** Esta corrida es la única razón por la que hoy sabemos cuál de los dos filtros está cargando el peso en cada ruta.

La mutación se revirtió con `git checkout -- <ese archivo>` y se verificó: `git status --porcelain` en `et-172` sale **vacío**, el archivo es **byte-idéntico** a la copia previa a mutar y `grep -c "tenantWhere(schema.financialTransactions, ctx)"` vuelve a dar **22**.

## Verificación

| Criterio                                                                 | Resultado                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------ |
| `pnpm exec vitest run test/tenancy/iso-03-finance-transacciones.test.ts` | ✅ **33/33** en 147 s (`--hookTimeout=250000`)         |
| Los DOS archivos iso-03 en **un solo worker** (`--no-file-parallelism`)  | ✅ **67/67** en 203 s — cero contaminación entre ellos |
| `pnpm exec tsc --noEmit`                                                 | ✅ exit 0 después de cada task                         |
| `grep -c "toBe(403)"` sobre el archivo                                   | ✅ **0**                                               |
| `grep -c "toBe(404)"` sobre el archivo                                   | ✅ **7**                                               |
| `describe` de rutas GET                                                  | ✅ **8** (las 8 rutas de lectura del grupo)            |
| `describe` totales                                                       | ✅ **14** (13 de ruta + 1 de precondiciones)           |
| Rutas del manifiesto cubiertas                                           | ✅ **13/13**                                           |
| Mutación de tenancy → rojo                                               | ✅ 2 rojos, en las rutas de los métodos mutados        |
| Mutación revertida                                                       | ✅ `git status --porcelain` vacío + diff byte a byte   |
| `prettier --write` sobre el archivo                                      | ✅ antes de cada corrida larga                         |
| Archivos de `src/` tocados / entradas de allowlist                       | ✅ **0 / 0**                                           |

**La corrida de los DOS archivos en UN worker es la que prueba que este archivo no ensucia al vecino** (Pitfall 10: `isolate: false`, base compartida por worker). Es una prueba **más fuerte** que la del directorio entero: con `--no-file-parallelism` los dos comparten la MISMA base y corren en orden (`cajas` primero, `transacciones` después), que es exactamente el escenario de contaminación. 67/67.

### La corrida del directorio entero salió INCONCLUYENTE por ambiente (no por este plan)

`pnpm exec vitest run test/tenancy` (10 archivos, en paralelo) dio **7 archivos rojos / 13 tests fallados / 142 salteados**, pero **ninguno de los errores es de aislamiento** y el archivo del 172-17 —verificado verde por su propio plan y verde otra vez acá en la corrida de a dos— **falló también**. Los errores son de provisioning de las bases por worker en esta máquina:

| Error observado                                                    | Qué significa                                                          |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `Unknown column 'tenant_id' in 'field list'` (sobre `aura_config`) | una de las bases por worker quedó **sin las migraciones de la 167**    |
| `la migración 0196 no la convirtió` (×10, uniques de `con-01`)     | esa misma base sin la 0196                                             |
| `Cannot read properties of undefined (reading 'dbPool')` (×3)      | `createTestApp()` nunca terminó: el `beforeAll` murió antes            |
| `Hook timed out in 250000ms` / `Login failed for admin@test.com`   | el provisioning + seed no entra en el timeout con 10 archivos a la vez |

**No es una regresión de la fase y no hay que perseguirlo:** los mismos archivos pasan de a uno y de a dos. Lo que sí conviene, para el **172-19** y sobre todo para el **172-21** (que tiene que correr la suite entera con el throw encendido): **correr `test/tenancy` con `--no-file-parallelism`**, o de a un archivo, en esta máquina. Un rojo de provisioning en medio de la corrida del switch se lee como un rojo del sentinel y hace perder una hora.

### 📌 Entradas de allowlist que paga este plan: **0**

Igual que los planes 13→17 y por el mismo motivo: `tenant-lint-allowlist.json` solo cubre `src/` y este plan no toca una línea de `src/`. **La cuenta acumulada para el 172-21 sigue en 51.**

## Accomplishments

- **Las 13 rutas del corazón transaccional, con caso y control cada una.** 33 tests, evidencia leída de la base en las 5 escrituras, contrato D-09 respetado sin una sola excepción.

- **La técnica para probar un agregado.** `/transactions/summary` no devuelve ids: devuelve `monthlyRevenue`. Cada gimnasio siembra importes irrepetibles y de otro orden de magnitud, así que el número esperado es exacto (`12.345 + 707`) y el contaminado se va a los millones. El mismo truco sostiene los tres exports y los dos contadores (`total` de la bandeja y del arqueo), que son **queries aparte de las de filas**: un filtro que viviera solo en una de las dos dejaría al staff viendo 3 filas y un total de 6.

- **Los tres exports se parsean.** Las tres rutas devuelven un `.xlsx` y son las que más datos entregan de una sola vez. Se cargan con `exceljs` y se leen las columnas por índice fijo (`getCell(n)` y no `eachCell`, que saltea las vacías y correría las columnas comparando la equivocada).

- **Dos vectores que no estaban en el plan y que solo se ven leyendo el código:**
  - **La caja ajena.** `POST /transactions` **no acepta** `cashRegisterId` en el body (el servidor la resuelve desde medio de pago + sede), así que el vector "cobro contra caja ajena" es inalcanzable por ahí. El único camino HTTP a una caja de otro gimnasio es `POST /transactions/:id/validate` con `{cashRegisterId}` — y ahí está el caso: rechazo + el cobro propio **sigue pendiente y con su caja de siempre** (un rechazo que ya escribió la mitad es peor que no rechazar).
  - **El socio ajeno por la puerta de atrás.** `correct({correctedFields: {memberId}})` deja al cliente elegir a quién reasignarle un cobro: es el camino más corto para mudar plata de un gimnasio al otro sin tocar una ruta de alta. El caso además prueba el **rollback**: corregir es anular + recrear dentro de UNA transacción, así que el rechazo tiene que dejar el cobro propio **sin anular** — un cobro anulado sin reemplazo es plata que desaparece del arqueo.

- **`fotoDeLaTransaccion`: la evidencia de tampering sobre plata son 5 columnas juntas.** Gimnasio, estado de validación, anulación, caja imputada e importe, comparadas con un solo `toEqual`. Un handler que valide la fila ajena y después conteste que no existe daría verde mirando solo el status; uno que la anule "a medias" daría verde mirando solo `validation_status`.

- **El guard que NO alcanza, documentado en el test.** El preHandler `requireBranchAccess` de `POST /transactions` responde "¿este actor puede operar en esta sede?" mirando **el país**, no el gimnasio: con las dos sedes en AR, deja pasar la sede ajena. El que frena el intento es el guard de sede del handler, que sí lleva `tenantWhere(branches, ctx)`. El caso ejercita justamente esa barrera y el comentario dice por qué es la única que queda.

## Decisions Made

### 1. Los importes irrepetibles son parte del contrato del archivo, no un detalle de siembra

Tres opciones y por qué gana la tercera:

- **Afirmar `monthlyRevenue > 0`** — pasa con la plata de cualquiera. Es exactamente el "es mayor que cero" que el 172-17 ya había descartado para los saldos.
- **Afirmar contra un total calculado en el test leyendo la base** — se ve riguroso y es circular: si el `SUM` del service y el del test comparten el bug, los dos dan lo mismo.
- **Números exactos sobre importes irrepetibles** ✅ — el esperado es una constante, y el contaminado es imposible de confundir. Con una **precondición** que verifica que los 5 importes sembrados siguen siendo distintos, para que nadie los vuelva a hacer coincidir sin enterarse.

### 2. La siembra extra vive en el test, no en el fixture compartido

`finance-gimnasio-dos.ts` es de los tres planes de la batería (17, 18 y 19), y el 172-17 lo dejó explícitamente así. Pero los **cobros pendientes** y los **importes distinguibles** los necesita **solo este plan**: el 17 no los usó y el 19 tiene su propio universo (egresos y traspasos, `member_id NULL`). Meterlos en el fixture habría (a) obligado a re-correr el archivo del 17 por un cambio que no le sirve y (b) puesto números mágicos de este plan en el contrato de los otros dos. La siembra local pasa por `tenantValues` igual, y las precondiciones releen su gimnasio de la base — o sea, **no le cree al fixture ni a sí misma**.

### 3. `fotoDeLaTransaccion` local en vez de extender `campoDeLaFila`

`campoDeLaFila` (del fixture) lee UNA columna y su unión cerrada cubre `name` / `is_active` / `currency`. Una transacción necesita cinco columnas juntas, y extender la unión del fixture habría tocado un archivo compartido por tres planes para agregar cuatro literales. El lector local:

- Da un rojo legible de una mirada (un `toEqual` con el objeto entero, no cuatro asserts sueltos).
- Deja el **blast radius del plan en UN archivo** — importa porque el 172-21 tiene que volver a correr todo esto con el throw del sentinel encendido.
- Lleva la **misma exención `tenant-safe:` embebida y el mismo razonamiento** que `tenantDeLaFila`: leer la fila ajena SIN filtrarla por gimnasio **es** la aserción; filtrarla la volvería tautológica.

### 4. El actor es `gym2.adminToken` en las 13, y está justificado (D-10)

8 de las 13 son `FINANCE_VOID_ROLES` (owner/admin/gestion), `POST /transactions` es `FINANCE_WRITE_ROLES` (+recepcion) y las de lectura entran por el guard de módulo `FINANCE_READ_ROLES` (+recepcion). En los tres conjuntos el escalón por debajo de `admin` es `gestion` o `recepcion`, y **`seedSecondTenant` no crea ninguno de los dos**: su único otro staff es un `coach`, EXCLUIDO de los tres. `admin` **es** el mínimo real disponible. El borde menos privilegiado de finance sigue siendo trabajo del **172-19** con `gym2.coachToken` sobre `/coach-load/*`. Queda escrito en la cabecera del archivo.

### 5. El caso de `pending-misc` usa `admin@test.com` como "el socio ajeno"

Después de `cleanAllTestData` es el único usuario de El Templo que queda vivo, y `financial_transactions.member_id` no distingue socios de staff. Registrar un socio real de El Templo en cada `beforeEach` habría sumado un `/auth/register` (con bcrypt) × 33 tests para cambiar nada de lo que el caso afirma. El id se resuelve **por email y nunca hardcodeado**: la base de CI no tiene el mismo id que la local.

## Deviations from Plan

### Auto-fixed Issues

**Ninguno.** El archivo pasó verde en la primera corrida de cada task, y no hubo que tocar `src/` ni el fixture.

### Adiciones al alcance (menores, documentadas)

**1. Dos casos EXTRA que el plan no pedía** (`validate` con caja ajena y `correct` con socio ajeno). El plan pedía cubrir el vector "cajaId del gimnasio 1" en `POST /transactions`, y ese vector **no existe ahí**: el schema no acepta `cashRegisterId` (el servidor la resuelve). En vez de omitirlo, se lo cubrió en la única ruta que sí deja elegir la caja. El de `correct` salió de leer los `correctedFields`: `memberId` es un id elegido por el cliente sobre una operación que anula y recrea.

**2. Una precondición nueva** (los 5 importes sembrados son distintos entre sí). No estaba en el plan; sostiene todas las aserciones de agregados y exports.

**3. La mutación de cierre fue de TRES mutaciones, no de dos.** La tercera (`buildListConditions`) se agregó para medir si el filtro de la tabla es el que sostiene los listados. **No puso nada en rojo**, y ese resultado negativo es el hallazgo más útil del plan (ver la sección de la mutación).

---

**Total deviations:** 0 auto-fixed + 3 adiciones de alcance. Ninguna relaja una aserción; las tres agregan cobertura o información.

## Issues Encountered

**`tsc --noEmit` sigue sin cubrir `test/`** (`tsconfig.json` incluye solo `src/**/*`). Se corrió igual después de cada task —exit 0— porque prueba que no se rompió `src/`. El único gate real de un archivo de test sigue siendo vitest.

**No hay ESLint en `el-templo-api`.** Se corrió `prettier --write` sobre el archivo antes de cada corrida larga (lección del 172-13).

**Este plan NO corrió con la sonda strict encendida**, por regla explícita del plan (no se toca `src/db/tenant-tables.ts`). El archivo está escrito **strict-safe por construcción**: la única lectura cruda (`fotoDeLaTransaccion`) lleva su exención `tenant-safe:` embebida y **todas** las demás queries van por `tenantWhere` / `tenantValues`. Aun así, el **172-21 tiene que volver a correr este archivo con el throw encendido**.

## Deferred Issues

**Los 2 rojos de `test/tenancy/con-06-lint.test.ts`** siguen siendo del **172-21** (51 entradas stale de allowlist + la lente estática). Ya están en `deferred-items.md` desde el 172-16.

**Los 2 rojos ambientales de `coach-load-alta.test.ts`** siguen en `deferred-items.md` desde el 172-14; fuera de alcance.

**Nuevo (ambiental, no de código): `test/tenancy` entero en paralelo no entra en esta máquina.** 7 archivos rojos por provisioning de las bases por worker (bases sin migrar + `beforeAll` timeout), con el archivo del 172-17 —conocido verde— entre ellos. Se anota en `deferred-items.md` con la mitigación (`--no-file-parallelism`) porque **el 172-21 corre la suite completa con el sentinel en throw** y este ruido se confunde con un rojo real del switch.

## Threat Flags

| Flag                                | File                                  | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| threat_flag: cross-tenant-predicate | `src/modules/shared/branch-access.ts` | `canAccessBranch` resuelve la sede **sin filtro de gimnasio** (`eq(branches.id, branchId)`): para un admin, la regla es "mismo país". Con dos gimnasios en el mismo país, el preHandler `requireBranchAccess` **deja pasar una sede ajena** y la única barrera que queda es el guard del handler. No es una fuga hoy (finance sí lo tiene), pero **cada ruta que use ese preHandler como único guard de sede es un agujero**. `branches` no es tabla strict de finance y el archivo es de `shared/`: por D-07 queda **fuera del alcance de esta fase** — es material de la **173** (members) o de un plan propio. Este archivo lo documenta en el caso de `POST /transactions`. |

Ningún otro. Este plan no agrega superficie: no crea rutas, no cambia permisos, no toca schemas de request, no instala paquetes y no modifica una línea de `src/`.

Mitigaciones del `<threat_model>` del plan:

| Threat      | Estado                                                                                                                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-172-18-01 | ✅ 8 casos de lectura con filtros anchos: barrido por `tenant_id` de cada fila devuelta, totales exactos contra importes irrepetibles y los 3 exports parseados y afirmados por contenido                                                              |
| T-172-18-02 | ✅ las 5 escrituras por id releen la FOTO de la transacción objetivo (gimnasio, estado, anulación, caja e importe) y la comparan con su valor original; el objetivo ajeno está **pendiente** a propósito, para que un intento que se cuele deje rastro |
| T-172-18-03 | ✅ 2 casos de cobro contra recurso ajeno (socio y sede) con conteo de transacciones de los DOS gimnasios antes y después, + el control que verifica el `tenant_id` REAL de las 3 tablas del asiento y la caja resuelta                                 |
| T-172-SC    | ✅ no se instaló ni actualizó ningún paquete                                                                                                                                                                                                           |

## Next Phase Readiness

**El 172-19 arranca con todo escrito.** Cinco cosas que da por sentadas:

1. **El orden del `beforeEach` es obligado**: `cleanAllTestData` → `limpiarFinanzasDeLaBateria` → `seedSecondTenant` → `sembrarFinanzasTemplo` → `sembrarFinanzasGimnasioDos`. Copiarlo tal cual; invertir los dos primeros pasos rompe por FK.
2. **Su universo es el que más necesita el `tenantWhere` de la tabla.** Los egresos y traspasos tienen `member_id NULL` (y a menudo `branch_id NULL`), así que sus listados usan **LEFT JOIN**: la defensa en profundidad que este plan encontró en `/transactions` **no aplica ahí**. El filtro de `financial_transactions` es, en esas rutas, la única barrera — y por eso la mutación de cierre del 19 tiene que apuntarle a ella.
3. **El actor del 19 es `gym2.coachToken`** en las 4 rutas de `/coach-load/*` (D-10). Es el único grupo donde el borde menos privilegiado se puede ejercer con este fixture.
4. **Si crea cajas o centros de costo, tiene que pasar por `limpiarFinanzasDeLaBateria`** o extenderla: nadie más los limpia.
5. **El 172-20 (gate de cobertura) tiene la lista de este archivo** en el docblock, en el mismo formato de clave del manifiesto (`"<MÉTODO> <url>"`), igual que el del 172-17.

**Sin blockers.**

## Self-Check: PASSED

- `FOUND` `.planning/phases/172-adopci-n-1-piloto-finance/172-18-SUMMARY.md`
- `FOUND` commits `e9fd0cd9` (T1) y `ef04fb08` (T2) en `feat/172-adopcion-finance`
- `FOUND` `el-templo-api/test/tenancy/iso-03-finance-transacciones.test.ts` (1.545 líneas)
- `VERIFIED` **33/33** verdes con `--hookTimeout=250000`; `tsc --noEmit` exit 0 después de cada task
- `VERIFIED` **67/67** con los dos archivos iso-03 en UN solo worker (`--no-file-parallelism`): no se ensucian entre ellos
- `VERIFIED` `grep -c "toBe(403)"` = **0** y `grep -c "toBe(404)"` = **7**
- `VERIFIED` 14 `describe` (13 de ruta + 1 de precondiciones) y las **13 rutas** del manifiesto cubiertas
- `VERIFIED` la mutación de 3 `tenantWhere` en `src/` produce **2 rojos**, exactamente en las rutas que sirven `validate` y `listPendingMiscForMember`, y quedó **revertida** (`git status --porcelain` vacío, archivo byte-idéntico a la copia previa, `grep -c` de vuelta en 22)
- `VERIFIED` `git diff --stat 0f4ffed4..HEAD` = 1 archivo, 1.545 inserciones, **0 archivos de `src/`**
- `VERIFIED` `tenant-lint-allowlist.json` sin modificar y `src/db/tenant-tables.ts` sin tocar (la sonda no se encendió en ningún momento)

**ADO-01 NO se marca completo**, misma convención que 172-01…172-17: el requisito exige `finance` migrado con aislamiento verde **de las 38 rutas**, y la batería lleva 27. **ISO-03 tampoco**: lo cierran el 172-19 y el gate del 172-20.

---

_Phase: 172-adopci-n-1-piloto-finance_
_Completed: 2026-07-31_
