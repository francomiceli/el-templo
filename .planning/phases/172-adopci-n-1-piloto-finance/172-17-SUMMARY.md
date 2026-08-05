---
phase: 172-adopci-n-1-piloto-finance
plan: 17
subsystem: testing
tags:
  [
    tenancy,
    finance,
    iso-03,
    aislamiento,
    cajas,
    centros-de-costo,
    mass-assignment,
    fixtures,
    mutation-testing,
  ]

# Dependency graph
requires:
  - phase: 169-capa-de-escritura
    provides: "tenantWhere / tenantValues / assertTenant"
  - phase: 171-backstop
    provides: "test/fixtures/second-tenant.ts (seedSecondTenant, limpiarSegundoGimnasio, TENANT_DOS) y el manifiesto de 372 rutas"
  - plan: 172-13
    provides: "cajas y centros de costo ya migrados en test/ (ensureEfectivoCaja con tenantId)"
  - plan: 172-16
    provides: "la suite entera lista para el throw + la leccion del gate por substring"
provides:
  - "test/fixtures/finance-gimnasio-dos.ts — el gimnasio 2 CON PLATA (caja, cuenta banco, centro de costo, transaccion + link + balance) y la evidencia leida de la base (tenantDeLaFila / campoDeLaFila sobre las 6 tablas strict)"
  - "test/tenancy/iso-03-finance-cajas.test.ts — 34 tests / 15 describes que cubren las 14 rutas de cajas y centros de costo, aislamiento + control por ruta"
  - "PRUEBA DE QUE EL VERDE NO ES UN PLACEBO: dos mutaciones quirurgicas de tenancy en src/ ponen 7 tests en rojo, y los rojos caen exactamente en las rutas que sirve el metodo mutado"
  - "HALLAZGO: cost_centers del gimnasio 2 bloquea por FK el DELETE FROM tenants de seedSecondTenant — la limpieza de finance tiene que correr ANTES de sembrar, no despues"
  - "La forma que copian los planes 172-18 / 172-19 y las fases 173-175"
affects: [172-18, 172-19, 172-20, 172-21, 172-23]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bateria de aislamiento = un describe por ruta con DOS it (aislamiento + control positivo), evidencia leida de la base y mensaje de rojo que dice que significa y a que archivo ir"
    - "El barrido de un listado no se afirma por 'no aparece el id que sembre' sino leyendo el tenant_id de CADA fila devuelta: caza tambien las filas ajenas que el test no sembro (seeds de migraciones y de test/setup.ts)"
    - "Toda bateria de aislamiento necesita una PRECONDICION que descarte los aisladores alternativos: aca, que las dos sedes compartan pais — si no, el country scope escondia las filas ajenas y el test pasaba sin ejercer la tenancy"
    - "Mutation testing de un solo disparo como cierre de una bateria: romper a mano el tenantWhere de 2 metodos y verificar que los rojos caen donde tienen que caer es la unica prueba de que las aserciones muerden"

key-files:
  created:
    - el-templo-api/test/fixtures/finance-gimnasio-dos.ts
    - el-templo-api/test/tenancy/iso-03-finance-cajas.test.ts
  modified: []

key-decisions:
  - "La limpieza de finance (limpiarFinanzasDeLaBateria) corre ANTES de seedSecondTenant y no despues: cost_centers no esta en TABLES_TO_CLEAN ni en limpiarSegundoGimnasio, y su FK a tenants hace reventar el DELETE FROM tenants con ER_ROW_IS_REFERENCED_2. Lo encontro una corrida contra MySQL, no una lectura"
  - "Los dos barridos de limpieza van filtrados por tenant_id (todo lo del gimnasio 2 + solo lo MARCADO de El Templo): cero exenciones tenant-safe en la limpieza, y los catalogos que sembraron las migraciones 0161/0163/0165 y test/setup.ts quedan intactos"
  - "5 rutas GET del manifiesto pero 6 describes GET: el sexto es la variante CON RANGO de /cash-registers/balances, que dispara getPeriodMovement — otra agregacion sobre financial_transactions que un listado bien filtrado no cubre"
  - "El asiento del fixture se escribe a mano y NO por TransactionService.create: el fixture de una bateria de aislamiento no puede depender del mismo camino de escritura que la bateria pone a prueba"
  - "El export .xlsx se PARSEA con exceljs en vez de mirar solo el status: es la ruta que entrega mas datos de una sola vez y sin parsear no tendria una sola asercion de contenido"
  - "El docblock describe el status prohibido en castellano en vez de escribirlo: el criterio de aceptacion es un grep por substring y un comentario que nombre la marca lo pone en rojo igual (leccion exacta del 172-16 con test/setup.ts)"

patterns-established:
  - "Plantilla ISO-03 para 172-18/172-19 y para las fases 173-175: precondiciones → describe por ruta (aislamiento + control) → evidencia de la base en toda escritura → mutacion de cierre"

requirements-completed: []

# Metrics
duration: ~95min
completed: 2026-07-31
---

# Phase 172 Plan 17: La batería ISO-03 arranca — cajas y centros de costo Summary

**Las 14 rutas de cajas y centros de costo quedan probadas ruta por ruta contra un segundo gimnasio real: 34 tests verdes, cada caso de aislamiento con su control positivo, cada escritura verificada releyendo la fila ajena DE LA BASE y no del status HTTP, y cero `403` esperados en todo el archivo (contrato D-09). Se cierra con la prueba que ninguna batería de aislamiento debería omitir: dos mutaciones quirúrgicas del `tenantWhere` en `src/` ponen 7 tests en rojo, y los 7 caen exactamente en las rutas que sirve el método mutado — el verde no es un placebo. El fixture nuevo (`finance-gimnasio-dos.ts`) es el que van a consumir los planes 172-18 y 172-19, y su forma es la que copian las fases 173-175.**

## Performance

- **Duration:** ~95 min, de los cuales ~50 son corridas contra MySQL real (5 corridas: 2 de smoke del fixture, 2 del archivo y 1 del directorio `test/tenancy` entero)
- **Completed:** 2026-07-31
- **Tasks:** 3/3 (las tres `auto`)
- **Files created:** 2 — **1.767 líneas**, cero archivos de `src/` tocados

## Task Commits

| Task | Nombre                                         | Commit     | Archivos                                                           |
| ---- | ---------------------------------------------- | ---------- | ------------------------------------------------------------------ |
| 1    | fixture de finanzas del gimnasio 2 + evidencia | `6c8a6a56` | `test/fixtures/finance-gimnasio-dos.ts` (614 líneas)               |
| 2    | las 6 lecturas (5 rutas GET + la del rango)    | `8989bcb5` | `test/tenancy/iso-03-finance-cajas.test.ts` + fixture (+2 exports) |
| 3    | las 9 escrituras                               | `0f4ffed4` | `test/tenancy/iso-03-finance-cajas.test.ts` (a 1.153 líneas)       |

Los tres commits viven en `/home/franco/projects/et-172` (rama `feat/172-adopcion-finance`, sobre `6c34d948` del plan 16). El SUMMARY + STATE + ROADMAP van en el checkout principal.

## Cobertura: las 14 rutas del grupo, ruta por ruta

| #   | Ruta del manifiesto                                   | `describe`                             | Aislamiento                                                     | Control positivo                                   |
| --- | ----------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------- |
| 1   | `GET /api/admin/finance/cash-registers`               | cuentas banco del ABM                  | ninguna cuenta de El Templo (barrido por `tenant_id` de c/fila) | ve su propia cuenta, con su nombre                 |
| 2   | `GET .../cash-registers/balances`                     | saldos por caja                        | ninguna caja de El Templo                                       | ve su caja y su firme es **exactamente** lo propio |
| 3   | `GET .../cash-registers/balances` (con `dateFrom/To`) | saldos con rango (`getPeriodMovement`) | el inflow del período no cuenta plata ajena                     | su caja trae `period` calculado, no `null`         |
| 4   | `GET .../cash-registers/balances/export`              | export de saldos (.xlsx **parseado**)  | el .xlsx no nombra ninguna caja ajena                           | el .xlsx sí nombra la propia                       |
| 5   | `GET .../cost-centers`                                | centros activos (selector de egresos)  | ningún centro de El Templo (ni los de las migraciones)          | ve el propio, con su nombre                        |
| 6   | `GET .../cost-centers/all`                            | centros del ABM (incluye inactivos)    | tampoco el ajeno **dado de baja**                               | ve el propio incluso dado de baja                  |
| 7   | `POST .../cash-registers`                             | alta de cuenta banco                   | `tenantId` ajeno en el body → la fila nace en el gimnasio 2     | sin spoofeo, nace en el gimnasio 2 igual           |
| 8   | `POST .../cash-registers/efectivo`                    | alta de caja efectivo                  | sede ajena → **404** y no nace ninguna caja (conteo) + spoofeo  | sí le abre caja a su propia sede                   |
| 9   | `PATCH .../cash-registers/:id`                        | edición de cuenta banco                | **404** + el `name` ajeno intacto                               | sí edita la propia (y el nombre cambia)            |
| 10  | `POST .../cash-registers/:id/close`                   | cierre de cuenta banco                 | **404** + la ajena sigue `is_active = 1`                        | sí cierra la propia                                |
| 11  | `POST .../cash-registers/:id/reactivate`              | reactivación de cuenta banco           | **404** + la ajena (cerrada a propósito) sigue en `0`           | sí reactiva la propia tras cerrarla                |
| 12  | `POST .../cost-centers`                               | alta de centro de costo                | `tenantId` ajeno en el body → nace en el gimnasio 2             | sin spoofeo, nace en el gimnasio 2 igual           |
| 13  | `PATCH .../cost-centers/:id`                          | renombrado                             | **404** + el `name` ajeno intacto                               | sí renombra el propio                              |
| 14  | `POST .../cost-centers/:id/deactivate`                | baja lógica                            | **404** + el ajeno sigue activo                                 | sí da de baja el propio                            |
| 15  | `POST .../cost-centers/:id/reactivate`                | reactivación                           | **404** + el ajeno (bajado a propósito) sigue en `0`            | sí reactiva el propio                              |

15 `describe` de ruta + 1 de precondiciones = **16 describes, 34 `it`**. Las filas 2 y 3 son la **misma ruta** del manifiesto con y sin rango, así que la cuenta contra el manifiesto es **14 rutas**: 5 GET + 9 escrituras. Las otras 24 rutas finance quedan para el **172-18** (13: transacciones, bandeja, historial) y el **172-19** (11: coach-load, movimientos, egresos) — 14 + 13 + 11 = **38**, el total finance del manifiesto.

## Las tres precondiciones (lo que impide el verde por la razón equivocada)

Antes de cualquier caso de aislamiento el archivo afirma tres cosas. No son decoración: cada una neutraliza una forma distinta de pasar en verde sin probar nada.

| Precondición                                           | Qué falso-verde mata                                                                                                                                                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Las dos sedes son AR**                               | `listActiveCajasWithBalance` y los dos `cost-centers` filtran **por país** además de por gimnasio. Con sedes de países distintos, el aislamiento lo daría el country scope y la capa de tenancy no se ejercería |
| **El Templo tiene finanzas vivas**                     | sin recurso ajeno, "no ve nada ajeno" es trivialmente cierto                                                                                                                                                    |
| **Las filas del gimnasio 2 nacieron en el gimnasio 2** | si el fixture cayera en el `DEFAULT 1` de la columna (T-168-15), TODOS los controles positivos estarían mirando datos de El Templo                                                                              |

La primera es la que más costó ver y la que más vale: es el aislador alternativo que nadie nombra.

## La prueba de que el verde no es un placebo (mutation testing)

Un archivo de aislamiento que pasa contra código correcto no demuestra que sus aserciones muerdan. Sobre el árbol ya commiteado se rompieron **a mano dos `tenantWhere` de `src/modules/finance/cash-register-service.ts`** y se volvió a correr:

```
Mutación 1: getCostCenterRow  pierde  tenantWhere(schema.costCenters, ctx)
Mutación 2: listBankAccounts  pierde  tenantWhere(schema.cashRegisters, ctx)

  Tests  7 failed | 27 passed (34)
```

Y los 7 rojos caen **exactamente donde tienen que caer**:

| Rojo                                                                  | Método mutado que lo sirve                                                             |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `GET /cash-registers` — aislamiento y control                         | `listBankAccounts`                                                                     |
| `close` y `reactivate` de cuenta banco — control                      | `listBankAccounts` (el handler de `close` lo llama después de cerrar)                  |
| `PATCH`, `deactivate` y `reactivate` de centro de costo — aislamiento | `getCostCenterRow`: el guard deja de 404ear y la ruta contesta 200 sobre la fila ajena |

Y lo que **NO** se puso rojo también informa: `GET /cost-centers` y `/cost-centers/all` siguieron verdes porque sus propios métodos de listado no se tocaron. Las mutaciones fueron quirúrgicas y el mapa de rojos las refleja una a una.

La mutación se revirtió con `git checkout -- <ese archivo>` y se verificó: `git status --porcelain` en `et-172` sale **vacío** y `grep -c "tenantWhere(schema.costCenters, ctx)"` vuelve a dar **7**.

## Verificación

| Criterio                                                         | Resultado                                                                        |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `pnpm exec vitest run test/tenancy/iso-03-finance-cajas.test.ts` | ✅ **34/34** en 135 s (`--hookTimeout=250000`)                                   |
| `pnpm exec tsc --noEmit`                                         | ✅ exit 0 después de cada task                                                   |
| `grep -c "toBe(403)"` sobre el archivo                           | ✅ **0**                                                                         |
| `grep -c "toBe(404)"` sobre el archivo                           | ✅ **7**                                                                         |
| `describe` de rutas GET                                          | ✅ **6** (5 rutas + la variante con rango)                                       |
| `grep -c "TENANT_DOS"` en el fixture                             | ✅ 5 (≥ 3)                                                                       |
| `grep -c "ensureEfectivoCaja("` en el fixture                    | ✅ **1**, con los 4 argumentos explícitos                                        |
| `sql.raw` sobre unión cerrada de literales                       | ✅ 2 sitios (`TablaStrict` de 6 miembros y `ColumnaInspeccionable` de 3)         |
| Mutación de tenancy → rojo                                       | ✅ 7 rojos, en las rutas del método mutado                                       |
| `test/tenancy` entero (9 archivos)                               | ✅ **159/161** — los 2 rojos son los de `con-06-lint` **ya diferidos al 172-21** |
| `prettier --check` sobre los 2 archivos                          | ✅ (corrido antes de cada corrida larga)                                         |
| `git status --porcelain` en `et-172` al terminar                 | ✅ vacío                                                                         |
| Archivos de `src/` tocados / entradas de allowlist               | ✅ **0 / 0**                                                                     |

**La corrida del directorio entero es la que prueba que este archivo no ensucia a los vecinos** (Pitfall 10: `isolate: false`, base compartida por worker). `iso-01`, `iso-02`, `con-01`, `con-03`, `con-04`, `con-05` y `tenant-helpers` pasaron los 159 con el archivo nuevo adelante.

### 📌 Entradas de allowlist que paga este plan: **0**

Igual que los planes 13→16 y por el mismo motivo: `tenant-lint-allowlist.json` solo cubre `src/` y este plan no toca una línea de `src/`. **La cuenta acumulada para el 172-21 sigue en 51.**

## Accomplishments

- **La batería ISO-03 existe y muerde.** 34 tests, 14 rutas, aislamiento + control por ruta, evidencia leída de la base y una mutación que lo prueba.

- **El fixture que van a consumir los planes 18 y 19.** `sembrarFinanzasGimnasioDos` deja el gimnasio 2 con caja de efectivo, cuenta banco, centro de costo y un asiento completo (transacción validada + `transaction_links` + `balances`); `sembrarFinanzasTemplo` deja el espejo del gimnasio 1 para los recursos ajenos. Los dos con `tenantValues`, y `tenantDeLaFila` está ahí justamente **para que los tests puedan no creerle al fixture**.

- **El rojo que solo la corrida podía encontrar.** El smoke del fixture —tres tests descartables, corridos antes de commitear la Task 1— destapó que un centro de costo del gimnasio 2 sobreviviente del test anterior hace reventar `seedSecondTenant`:

  ```
  DELETE FROM tenants WHERE id = 90671
  → ER_ROW_IS_REFERENCED_2: fk_cost_centers_tenant
  ```

  `cost_centers` no está en `TABLES_TO_CLEAN` **y** `limpiarSegundoGimnasio` tampoco la toca — es la misma trampa que el 169-06 documentó para `branches`, por otra tabla. La limpieza de finance **tiene que correr antes de sembrar**, y llamarla después no sirve porque para entonces el `beforeEach` ya murió. Quedó escrito en el docblock del fixture con el nombre de la FK.

- **La precondición del país.** `listActiveCajasWithBalance` filtra por país además de por gimnasio. Si la sede del gimnasio 2 fuera `ES` y la de El Templo `AR`, los 34 tests pasarían en verde **sin que la capa de tenancy hiciera nada**. Hay un `it` que lo afirma y un mensaje de rojo que dice explícitamente "arreglá las sedes, no relajes estas aserciones".

- **El barrido de listados no confía en los ids sembrados.** En vez de "no aparece el id que yo sembré", cada listado lee el `tenant_id` de **cada fila devuelta** desde la base. Eso caza también las cajas `Banco ARS`/`Banco EUR` de `test/setup.ts` y los centros de costo de las migraciones 0161/0163/0165 — filas ajenas que este archivo no creó y que un test ingenuo nunca habría mirado.

- **El export se parsea.** `GET /cash-registers/balances/export` devuelve un `.xlsx`; mirar solo el status dejaría a la ruta que más datos entrega de una vez sin una sola aserción de contenido. Se carga con `exceljs` y se leen los nombres de la columna "Caja".

- **La trampa del gate por substring, esquivada a tiempo.** La primera versión del docblock explicaba "en este archivo no hay ni un solo `toBe(403)`" — y el `grep` del criterio de aceptación devolvió **2**, las dos de mi propio comentario. Es **exactamente** el rojo que el 172-16 pagó en `test/setup.ts` contra `iso-02 Test 13`. Se reescribió describiendo el código en castellano, con una advertencia para el próximo que lo edite.

## Decisions Made

### 1. La limpieza de finance corre ANTES de `seedSecondTenant`

Tres opciones y por qué gana la tercera:

- **Agregar `cost_centers` a `TABLES_TO_CLEAN`** — cambia el comportamiento global de un helper del que dependen ~215 archivos, por un problema de un archivo. Además la tabla viene seedeada por migraciones: vaciarla globalmente rompe todo lo que asume "Varios".
- **Agregar el `DELETE` de `cost_centers` a `limpiarSegundoGimnasio`** — tentador y quizá correcto a futuro, pero ese fixture es de la fase 171 y esta fase lo **consume, no lo rediseña** (regla del CONTEXT). Tocarlo afectaría también a `iso-02`, que lo tiene bajo prueba.
- **Una limpieza propia de la batería, llamada antes de sembrar** ✅ — vive con el fixture que ensucia, borra exactamente lo suyo, y el orden queda documentado con el nombre de la FK que lo obliga.

### 2. Los dos barridos de limpieza van filtrados por `tenant_id`: cero exenciones

`limpiarFinanzasDeLaBateria` hace cuatro `DELETE` y **ninguno necesita exención `tenant-safe`**: dos filtran por el gimnasio 2 (todo lo suyo) y dos por El Templo **más la marca `ISO03`**. Es lo contrario del `finally` de `con-01`, que sí necesita ser cross-tenant. Acá el barrido acotado es a la vez el correcto y el sentinel-safe — y borrar de más habría sido peor que no borrar: los catálogos de las migraciones y las cajas de `test/setup.ts` los usan decenas de archivos del mismo worker.

Las **3 exenciones** del plan están todas en `tenantDeLaFila` / `campoDeLaFila`, y son la misma del 172-16 decisión 2: leer el `tenant_id` (o el campo) de la fila **ES** la aserción; filtrarla por gimnasio la volvería tautológica.

### 3. Seis `describe` GET para cinco rutas GET

El grupo tiene 5 rutas de lectura, pero el criterio de aceptación pedía ≥ 6 `describe`. En vez de inflar la cuenta partiendo una ruta en dos, el sexto cubre una **superficie de ataque distinta de la misma ruta**: `GET /cash-registers/balances` **con rango de fechas** dispara `getPeriodMovement`, que es **otra agregación** sobre `financial_transactions` — un listado bien filtrado con un período mal filtrado seguiría delatando cuánto factura el otro gimnasio. La aserción es fina a propósito: el inflow del período tiene que dar **exactamente** el importe propio, porque el **doble** sería la plata ajena sumada.

### 4. El asiento del fixture se escribe a mano, no por `TransactionService.create`

El fixture de una batería de aislamiento **no puede depender del mismo camino de escritura que la batería pone a prueba**: si `create` tuviera el bug, el fixture sembraría mal y el test lo taparía. Los valores son los de un cobro real (`plan_charge` / `inflow` / `validado`) para que `getBalance` lo cuente como plata firme.

### 5. El actor es `gym2.adminToken` en las 14, y está justificado

D-10 pide el rol **mínimo real**. 12 de las 14 rutas son `ADMIN_ROLES`-only y `GET /cost-centers` es `FINANCE_VOID_ROLES`: `admin` **es** el mínimo. Las dos que aceptarían menos (`/cash-registers/balances` y su export, `FINANCE_READ_ROLES`) no pueden bajar más **con este fixture**: el único otro staff que `seedSecondTenant` crea es un `coach`, y coach está EXCLUIDO de `FINANCE_READ_ROLES`. El borde menos privilegiado de finance lo ejerce el **172-19** con `gym2.coachToken` sobre `/coach-load/*`. Queda escrito en la cabecera del archivo.

### 6. El mass-assignment se afirma por el RESULTADO, y el comentario dice que hay dos barreras

`createBankAccountSchema` / `createCostCenterSchema` / `createEfectivoCajaSchema` declaran `additionalProperties: false`, y Fastify compila ajv con `removeAdditional: true`: el `tenantId` del body se **descarta en el transporte** antes de llegar al handler. La segunda barrera es `tenantValues(ctx, …)`, que estampa el gimnasio **después** del spread. El test afirma el resultado (`201` + la fila en `TENANT_DOS`) y el mensaje del rojo dice qué significaría un `400`: que la barrera se mudó al transporte (rechazar en vez de descartar) — **también un contrato válido**, pero entonces el caso tiene que afirmar eso y no esto.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] `cost_centers` del gimnasio 2 bloquea por FK el `DELETE FROM tenants` de `seedSecondTenant`**

- **Found during:** Task 1, smoke del fixture contra MySQL real (antes de commitear)
- **Issue:** con el orden que prescribía el plan (`cleanAllTestData` → `seedSecondTenant` → sembrar), el centro de costo del gimnasio 2 sobrevive al `beforeEach` siguiente y hace reventar `limpiarSegundoGimnasio` con `ER_ROW_IS_REFERENCED_2` sobre `fk_cost_centers_tenant`. El primer test pasaba y el segundo y el tercero morían en el `beforeEach`.
- **Fix:** `limpiarFinanzasDeLaBateria` se saca de adentro de `sembrarFinanzasTemplo` y pasa a ser un paso explícito del `beforeEach`, **antes** de `seedSecondTenant`. El motivo, con el nombre de la FK, queda en el docblock del fixture y en el comentario del `beforeEach` del test.
- **Files modified:** `test/fixtures/finance-gimnasio-dos.ts` (antes de commitear la Task 1)
- **Committed in:** `6c8a6a56`

**2. [Rule 1 - Bug del gate] Mi propio docblock ponía en rojo el criterio de aceptación**

- **Found during:** Task 2, verificación de los greps
- **Issue:** el docblock decía "en este archivo NO hay ni un solo `toBe(403)`" y el criterio de aceptación es justamente `grep -c "toBe(403)" = 0`. Devolvía **2**. Es la trampa exacta que el 172-16 pagó con `test/setup.ts` y el gate `iso-02 Test 13`.
- **Fix:** el párrafo describe el status en castellano y lleva una advertencia (⚠️) para el próximo que lo edite: "no lo 'aclares' escribiendo el número".
- **Files modified:** `test/tenancy/iso-03-finance-cajas.test.ts`
- **Committed in:** `8989bcb5`

### Desviaciones de alcance (menores, documentadas)

**3. `ensureEfectivoCaja` se llama UNA vez, no dos.** El plan sugería que `sembrarFinanzasTemplo` también lo usara. Se resuelve la caja de El Templo con un `SELECT` y se tira un error explicativo si falta: `test/setup.ts` ya la siembra para todas las sedes, y crearla de nuevo taparía el rojo del día que ese seed deje de correr. De paso, el grep del criterio da exactamente **1**.

**4. El criterio "≥ 6 `describe` GET" se cumple con 5 rutas + 1 variante,** no con 6 rutas: el grupo del manifiesto tiene **5** rutas de lectura (la cuenta 14 = 5 GET + 9 escrituras cierra 14+13+11 = 38). Ver decisión 3.

**5. El criterio de la Task 2 "`grep -c toBe(404)` ≥ 1" no se cumplía al cerrar la Task 2** y sí al cerrar la Task 3: el grupo **no tiene ninguna ruta GET by-id**, así que no hay dónde afirmar un 404 en la sección de lecturas. Los 7 `toBe(404)` son todos de escrituras.

**6. Se exportaron 2 constantes nuevas del fixture en el commit de la Task 2** (`IMPORTE_SEMBRADO`, `MONEDA_SEMBRADA`), para que la aserción fina de saldos no tenga un número mágico. Es una adición al artefacto de la Task 1 dentro del mismo plan, sin cambio de comportamiento.

---

**Total deviations:** 2 auto-fixed (1 × Rule 3, 1 × Rule 1) + 4 de alcance menor. Ninguna agrega superficie ni relaja una aserción.

## Issues Encountered

**`tsc --noEmit` sigue sin cubrir `test/`** (`tsconfig.json` incluye solo `src/**/*`). Se corrió igual después de cada task —exit 0— porque prueba que no se rompió `src/`. Como gate extra se corrió `tsc` en modo suelto sobre el fixture: **cero errores atribuibles a los archivos nuevos** (los que aparecen son drift preexistente de `test/helpers.ts` y de `mjml` sin tipos). El único gate real de un archivo de test sigue siendo vitest.

**No hay ESLint en `el-templo-api`** (no existe `eslint.config.js` ahí ni script `lint`). Se corrió `prettier --write` sobre los dos archivos antes de cada corrida larga, tomando la lección del 172-13.

**Este plan NO corrió con la sonda strict encendida**, por regla explícita del plan (no se toca `src/db/tenant-tables.ts`). Los dos archivos están escritos **strict-safe por construcción**: las 3 lecturas crudas llevan su exención `tenant-safe` embebida y **todas** las demás queries van por `tenantWhere` / `tenantValues`. Aun así, el **172-21 tiene que volver a correr este archivo con el throw encendido** — es la primera vez que la fase agrega queries nuevas sobre tablas strict después del barrido global del 172-16.

## Deferred Issues

**Los 2 rojos de `test/tenancy/con-06-lint.test.ts`** siguen siendo del **172-21** y reproducen con la sonda apagada (deuda de 51 entradas de allowlist + la lente estática que bajó de 87 a 81 tablas). Ya están anotados en `deferred-items.md` desde el 172-16. Este plan no los toca.

**Los 2 rojos ambientales de `coach-load-alta.test.ts`** siguen en `deferred-items.md` desde el 172-14; fuera de alcance.

## Threat Flags

Ninguno. Este plan no agrega superficie: no crea rutas, no cambia permisos, no toca schemas de request, no instala paquetes y no modifica una línea de `src/`.

Mitigaciones del `<threat_model>` del plan:

| Threat      | Estado                                                                                                                                                                                                                            |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-172-17-01 | ✅ 6 casos de lectura, cada uno leyendo el `tenant_id` de **cada fila devuelta** desde la base; los 6 con su control positivo                                                                                                     |
| T-172-17-02 | ✅ las 7 escrituras por id releen la fila ajena (`tenant_id` **y** el campo que se intentó cambiar) y la comparan contra su valor original; los `reactivate` cierran antes el recurso ajeno para que un UPDATE colado deje rastro |
| T-172-17-03 | ✅ 3 casos de mass-assignment (cuenta banco, caja efectivo, centro de costo) que verifican el `tenant_id` REAL de la fila creada                                                                                                  |
| T-172-17-04 | ✅ cada aislamiento tiene su control **y además** 3 precondiciones que descartan el falso verde por siembra rota o por country scope                                                                                              |
| T-172-SC    | ✅ no se instaló ni actualizó ningún paquete                                                                                                                                                                                      |

## Next Phase Readiness

**El 172-18 y el 172-19 arrancan con la plantilla escrita.** Seis cosas que dan por sentadas:

1. **`test/fixtures/finance-gimnasio-dos.ts` es de los tres planes**, no de este. `sembrarFinanzasGimnasioDos` ya devuelve `transactionId`, `linkId` y `balanceId` —que este plan casi no usa— porque el 172-18 los necesita como "transacción del otro gimnasio".
2. **El orden del `beforeEach` es obligado y ya está documentado**: `cleanAllTestData` → `limpiarFinanzasDeLaBateria` → `seedSecondTenant` → `sembrarFinanzasTemplo` → `sembrarFinanzasGimnasioDos`. Copiarlo tal cual; invertir los dos primeros pasos rompe por FK.
3. **`tenantDeLaFila` y `campoDeLaFila` ya cubren las 6 tablas strict**, `debt_management` incluida. El 172-16 dejó anotado que esa tabla no tiene una sola query de test directa: la unión ya está lista para que el 18 o el 19 la cubran.
4. **El actor de `/coach-load/*` es `gym2.coachToken`** (D-10). Es el único grupo donde el borde menos privilegiado se puede ejercer, y la cabecera de este archivo lo deja escrito.
5. **`cost_centers` y las cuentas banco no las limpia nadie más.** Si el 18 o el 19 crean filas ahí, tienen que pasar por `limpiarFinanzasDeLaBateria` o extenderla.
6. **El 172-20 (gate de cobertura) necesita la lista de este archivo:** las 14 rutas están en el docblock, en el mismo formato de clave del manifiesto (`"<MÉTODO> <url>"`).

**Sin blockers.**

## Self-Check: PASSED

- `FOUND` `.planning/phases/172-adopci-n-1-piloto-finance/172-17-SUMMARY.md`
- `FOUND` commits `6c8a6a56` (T1), `8989bcb5` (T2) y `0f4ffed4` (T3) en `feat/172-adopcion-finance`
- `FOUND` `el-templo-api/test/fixtures/finance-gimnasio-dos.ts` (614 líneas) y `el-templo-api/test/tenancy/iso-03-finance-cajas.test.ts` (1.153 líneas)
- `VERIFIED` **34/34** verdes con `--hookTimeout=250000`; `tsc --noEmit` exit 0 después de cada task
- `VERIFIED` `grep -c "toBe(403)"` = **0** y `grep -c "toBe(404)"` = **7**
- `VERIFIED` 6 `describe` de rutas GET + 9 de escritura + 1 de precondiciones
- `VERIFIED` la mutación de 2 `tenantWhere` en `src/` produce **7 rojos**, exactamente en las rutas que sirven los métodos mutados, y quedó **revertida** (`git status --porcelain` vacío, `grep -c "tenantWhere(schema.costCenters, ctx)"` = 7)
- `VERIFIED` `test/tenancy` entero: **159/161**, y los 2 rojos son los de `con-06-lint` ya diferidos al 172-21
- `VERIFIED` `git diff --stat 6c34d948..HEAD` = 2 archivos, 1.767 inserciones, **0 archivos de `src/`**
- `VERIFIED` `tenant-lint-allowlist.json` sin modificar y `src/db/tenant-tables.ts` sin tocar (la sonda no se encendió en ningún momento)

**ADO-01 NO se marca completo**, misma convención que 172-01…172-16: el requisito exige `finance` migrado con aislamiento verde **de las 38 rutas**, y este plan cubre 14. **ISO-03 tampoco**: lo cierran el 172-18, el 172-19 y el gate del 172-20.

---

_Phase: 172-adopci-n-1-piloto-finance_
_Completed: 2026-07-31_
