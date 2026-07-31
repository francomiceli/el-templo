# Fase 172 — Items diferidos (fuera de alcance de los planes que los encontraron)

## 172-14 · 2 tests rojos en `coach-load-alta.test.ts` — PREEXISTENTES EN MASTER

**Encontrados durante:** 172-14, Task 2 (corrida en caliente con `finance` en `TENANT_STRICT_MODULES`).

**Qué falla:**

| Test                                                                                             | Espera   | Recibe     |
| ------------------------------------------------------------------------------------------------ | -------- | ---------- |
| `alta crear-nuevo > crear-nuevo: alumno sin match → 1 user (email null) + sub activa + charge …` | `activo` | `prueba`   |
| `alta void→cascade > void: anular carga de alumno PREEXISTENTE → el cascade NO lo desactiva …`   | `activo` | `freemium` |

Las dos aserciones son sobre `users.status` después de un alta / de un void.
**No son throws del sentinel** — son fallas de derivación de estado de usuario.

**Por qué NO se arreglan acá:** están **fuera del alcance** del 172-14, que migra
queries de test a `tenant_id`. Se probó que son preexistentes con tres corridas
independientes, cada una eliminando una variable:

| Corrida | `src/`     | archivo de test | sonda strict | Resultado          |
| ------- | ---------- | --------------- | ------------ | ------------------ |
| 1       | HEAD       | migrado (mío)   | **ON**       | mismos 2 rojos     |
| 2       | HEAD       | original        | OFF          | mismos 2 rojos     |
| 3       | `a6272df0` | original        | OFF          | **mismos 2 rojos** |

La corrida 3 es la concluyente: `a6272df0` **es `origin/master`** (la base de la
fase, según el 172-01). Con `src/` y el test sin tocar por nadie de esta fase,
los dos rojos siguen ahí. **No los rompió la fase 172 ni este plan.**

**Para quién es:** el dueño del flujo de `/alta` + derivación de estado
(`subscriptions/service.ts` / `coach-load-routes.ts`), no la cadena de tenancy.

**Bandera para el 172-21 (el plan del switch):** cuando corra la suite entera y
vea `test/finance` en rojo, **estos 2 no son suyos**. El resto de `test/finance`
—341 de 343 tests, 20 archivos— pasa con el sentinel en modo throw.

**Sospecha (no verificada, no la tomes como diagnóstico):** el repo corre la
suite en CI y no local (MEMORY). Un rojo que solo aparece local suele ser dato
de entorno —seed, fecha, o el estado `prueba` de Sesiones de Prueba (v5.8)
interactuando con la recategorización—, pero **nadie lo comprobó**: puede ser un
bug real de producción tapado por no correr estos 2 casos localmente. Si CI está
verde sobre `a6272df0`, la diferencia es ambiental y hay que encontrarla antes de
confiar en esa suite como gate.

---

## 3 tests rojos en `test/tenancy/con-06-lint.test.ts` — son del 172-21

**Encontrado en:** plan 172-16, corrida en caliente sobre los 6 directorios del plan
(`test/analytics test/scheduling test/attendance test/migrations test/wellhub test/tenancy`).

Con `finance` puesto a mano en `TENANT_STRICT_MODULES`, la corrida dio **649/652**
con **cero throws del sentinel**. Los 3 rojos son todos de `con-06-lint.test.ts` y
ninguno es de este plan. Discriminados con una corrida extra con la **sonda apagada**:

| `it`                                                              | ¿Rojo con la sonda APAGADA? | Causa                                                                                                   |
| ----------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------- |
| "ve los archivos que importan el schema EN PROFUNDIDAD"           | **SÍ**                      | la lente estática ve **81** tablas con deuda y el gate exige **≥ 87**: bajó porque la fase migró `src/` |
| "el repo real con el baseline del plan 07 sale 0"                 | **SÍ**                      | `lint:tenant` sale 1 — son las **51 entradas stale** esperando que el 172-21 las borre                  |
| "una tabla de la lista strict con entradas vivas es discrepancia" | **NO**                      | artefacto de la sonda: el gate afirma que `TENANT_STRICT_MODULES` sigue **vacía** (D-15 de la fase 170) |

**Prueba de que no son del 172-16:** `git diff 4c252510..HEAD --name-only | grep -cE
'^el-templo-api/(src|tenant-lint-allowlist.json)'` devuelve **0**. El plan toca
únicamente archivos de `test/`, y los tres gates leen `src/`, la allowlist y la lista
strict.

**Para quién es:** el **plan 172-21**, dueño único de `tenant-lint-allowlist.json` y
el que escribe la entrada `finance` en `TENANT_STRICT_MODULES`. Los dos primeros se
apagan borrando las 51 entradas; el tercero hay que **reescribirlo** junto con
`test/db/tenant-tables.test.ts:351` (`expect(modulos.length).toBe(0)`), que también se
va a poner rojo — está anunciado en el `172-PATTERNS.md` §7 y su propio mensaje de
error dice qué hacer.

**Lo que NO hay que hacer:** sacar tablas de `TENANT_STRICT_MODULES` para que estos
gates pasen. Es literalmente lo que el mensaje del sentinel prohíbe.

---

## AMBIENTAL — `test/tenancy` entero EN PARALELO no entra en esta máquina (172-18)

**Encontrado:** plan 172-18, corrida de verificación cruzada del directorio.

`pnpm exec vitest run test/tenancy` (10 archivos, paralelismo por defecto) dio
**7 archivos rojos / 13 tests fallados / 142 salteados**. **Ninguno es un rojo de
aislamiento ni de tenancy:** son todos de provisioning de las bases por worker.

| Error                                                            | Qué es                                                                 |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `Unknown column 'tenant_id' in 'field list'` (`aura_config`)     | una base por worker quedó **sin las migraciones de la 167**            |
| `la migración 0196 no la convirtió` (×10, uniques de `con-01`)   | esa misma base, sin la 0196                                            |
| `Cannot read properties of undefined (reading 'dbPool')` (×3)    | `createTestApp()` nunca terminó — el `beforeAll` murió antes           |
| `Hook timed out in 250000ms` / `Login failed for admin@test.com` | el provisioning + seed no entra en el timeout con 10 archivos a la vez |

**Prueba de que es ambiental:** `iso-03-finance-cajas.test.ts` —verde en su propio
plan (172-17) y verde otra vez en la corrida de a dos— **también falló** en esa
corrida. Y los dos archivos iso-03 juntos en **un solo worker**
(`--no-file-parallelism`, base compartida, uno después del otro) dan **67/67**.

**Mitigación:** en esta máquina, correr `test/tenancy` con `--no-file-parallelism`
o de a un archivo.

**Para quién es:** sobre todo el **plan 172-21**, que corre la suite completa con el
sentinel en **throw**. Un rojo de provisioning en medio de esa corrida se lee como un
rojo del switch y hace perder una hora. También el **172-19**, que agrega el tercer
archivo de la batería.

---

## 🔴 LIMITACIÓN DE DISEÑO — el sentinel de RUNTIME evalúa por QUERY, no por tabla (172-21)

**Encontrado:** plan 172-21, en el PRIMER intento (fallido) de la demo del fail-closed.

Se le sacó el `tenantWhere(schema.financialTransactions, ctx)` al array `conds` de
`getSummary()` —la condición que comparten las **cuatro** agregaciones del resumen de
caja— y `test/finance/summary-sanity.test.ts` dio **5/5 verde, cero throws**, con
`finance` ya en `TENANT_STRICT_MODULES`.

El motivo está en `src/db/sentinel/analyze.ts:240-247`, etapa 4:

```typescript
return TENANT_ID.test(predicado)
  ? verdict("ok", "menciona tenant_id en el predicado", involucradas)
  : verdict("violation", `sin tenant_id sobre ${involucradas.join(", ")}`, ...);
```

Las 4 agregaciones hacen `innerJoin` a `branches` **con su propio `tenantWhere`**, así
que el SQL sigue mencionando `tenant_id` en la zona de predicado y el veredicto es `ok`
— aunque `financial_transactions`, que es la tabla strict, quedó sin filtrar.

**No es un bug del switch ni una regresión: es el diseño del analizador de runtime**
(regex sobre el texto del SQL, sin parser — T-170-03 evitó a propósito el costo de un
parser en el hot path de toda query). Pero **nadie lo había escrito**, y cambia cómo hay
que leer el verde:

- El **sentinel** NO cubre por sí solo las queries multi-tabla. Una tabla strict puede
  quedar sin filtrar y pasar, si cualquier otra tabla de la misma query lleva su filtro.
- La **lente estática del lint** SÍ es por tabla: cuenta un acceso por tabla involucrada,
  incluidas las joineadas (WR-01 de la 170). Es la que atrapa este caso.
- **El switch descansa en las dos, no en una.** Una fase de adopción que solo mire el
  verde del sentinel se está mintiendo.

**Para quién es:** las fases **173-175** (mismo modo de falla en cada switch) y el
**172-23**, que escribe `.docs/saas-multitenancy/07-receta-adopcion.md`: la receta tiene
que decir que la sonda de la demo va sobre una query de **UNA SOLA TABLA**, y que el
criterio de "módulo migrado" lo certifica el lint, no el sentinel.

**Lo que NO hay que hacer:** meter un parser de SQL en el wrap del pool para arreglarlo.
Es una decisión arquitectónica de la 170 (costo por query en TODA la app), no un
descuido.

---

## ✅ RESUELTO por el 172-21 — los 2 rojos de `coach-load-alta` eran AMBIENTALES (paralelismo)

Los dos `it` que la sección de arriba (172-14) documentó como preexistentes en master
—`alta crear-nuevo … esperaba activo, recibió prueba` y `void→cascade … esperaba activo,
recibió freemium`— **pasan** en la corrida del 172-21: `test/finance` entero con
`--no-file-parallelism` da **20 archivos / 343 tests verdes**, `coach-load-alta.test.ts`
incluido (20/20), con el sentinel en **throw**.

Eso confirma la sospecha que el 172-14 dejó anotada sin verificar: las tres corridas que
los reprodujeron usaban el **paralelismo por defecto**. Con un solo worker la base es una
sola y compartida, y las dos aserciones sobre `users.status` dan lo esperado.

**No es un bug de producción tapado.** La causa exacta (seed compartido entre archivos,
recategorización, o el estado `prueba` de v5.8 interactuando) **no se investigó** y no
hace falta: CI corre verde sobre esa base y el rojo no aparece con un worker.

---

## 🔴 FASE 173 — dos deudas de `subscriptions` que la batería ISO-03 dejó ancladas (172-19)

**Encontrado:** plan 172-19, bajando al rol COACH sobre `/coach-load/*` (las 27 rutas
anteriores de la batería no las podían ver: las dos entran por `subscriptions`, y
`subscriptions` solo se toca desde coach-load).

**Fuera de alcance por D-07** ("en archivos ajenos se tocan ÚNICAMENTE las queries
sobre las 6 tablas strict"; `subscriptions` no es una de ellas). Las dos están
ancladas con aserciones ejecutables en
`el-templo-api/test/tenancy/iso-03-finance-coach-load.test.ts`, así que **el arreglo
las pone en rojo** y quien lo haga tiene que convertirlas en casos normales.

### 1. FUGA de datos entre gimnasios — `GET /coach-load/autocompletar/:userId`

`subscriptionService.getMemberSubscription(userId)` es la única llamada del handler
que **no recibe `ctx`** (`src/modules/subscriptions/service.ts` ~L919: filtra por
`userId` y estado, sin gimnasio). Con un socio de otro gimnasio que tenga sub
vigente, la ruta devuelve su **`planName`, `amount`, `currency` y `currentEndDate`**
— al **coach**, iterando ids.

- **Severidad hoy:** ninguna en prod (un solo gimnasio). **Bloqueante al onboardear el segundo.**
- **Lo que SÍ aísla:** `memberBranchId` (sale de `resolveUserBranchId`, que sí lleva su `tenantWhere`).
- **Arreglo:** `ctx` a `getMemberSubscription` + `tenantWhere(subscriptions, ctx)`.
- **Ancla:** el `it` llamado `FUGA CONOCIDA (dueño: fase 173): el coach del gimnasio 2
SI ve el plan de un socio de El Templo`, marcado como fallo esperado. Al arreglarlo
  se pone en rojo ("esperaba fallar y pasó"): desmarcarlo y dejarlo como aislamiento.

### 2. BLOQUEO de adopción — `POST /coach-load/alta`

`assignPlan` inserta `subscriptions` **sin `tenantValues`** (~L1592) → la sub de un
gimnasio nuevo nace con el `DEFAULT 1` (El Templo, T-168-15). El charge la valida como
concepto enlazado **con** filtro de gimnasio y no la encuentra:

```
POST /coach-load/alta (gimnasio 2, todo propio)
→ 404 {"message":"Concepto enlazado no existe: subscription N"} + rollback completo
```

- **Fail-closed, NO es fuga** (nada queda escrito; el test lo verifica contando filas).
- **Consecuencia:** el alta de coach-load **no es usable por un gimnasio nuevo** hasta la 173.
- **Ancla:** el `it` `limitacion conocida (dueño: fase 173): con recursos PROPIOS el alta
se corta en el charge, sin escribir nada`. Al arreglarlo contesta 201 y el `it` se pone
  en rojo: convertirlo en el control positivo (201 + sub y charge en el gimnasio 2).

---

## 📌 REQUISITO DE ADOPCIÓN (no es deuda, es documentación) — la sede virtual propia (172-19)

`resolveUserBranchId` (`coach-load-routes.ts`) cae, cuando el socio pedido no es del
gimnasio, a un fallback que busca la sede llamada **"Templo Online" del propio
gimnasio**. Sin esa sede el fallback tira un `Error` y las rutas de carga contestan
**error del servidor** en vez del payload vacío que pide D-09.

**Un gimnasio nuevo necesita su propia sede virtual para adoptar coach-load.** Va a
`.docs/saas-multitenancy/07-receta-adopcion.md` (plan **172-23**).

---

## 📋 CIERRE DE MILESTONE — la tabla de trazabilidad de `REQUIREMENTS.md` está atrasada (172-20)

No es deuda de código: es contabilidad. `ISO-01` e `ISO-02` siguen marcados `Pending` en
`.planning/REQUIREMENTS.md` (checkbox y tabla) aunque la **fase 171 los entregó y están en
master**, y ningún `docs(172-XX)` de esta fase tocó el archivo. El 172-20 mantuvo esa
convención en vez de marcar `ISO-03` solo.

**Qué revisar al cerrar el milestone v6.0**, en un solo pase:

- `ISO-01` / `ISO-02` → entregados por la fase 171.
- `ISO-03` → las 38 rutas finance tienen caso + gate de cobertura (172-17/18/19/20). **Ojo
  con la letra del requisito** ("no expone ni escribe datos del tenant B"): hoy
  `GET /coach-load/autocompletar/:userId` **sí expone** el plan de un socio ajeno, por la
  deuda de `subscriptions` que arregla la **fase 173**. Decidir si se marca con esa fuga
  viva o después.
- `CON-05` / `CON-06` → los entrega el **172-21** (el switch + allowlist en cero).
- `ADO-01` → falta el switch (172-21) **y** el alta de coach-load usable por un gimnasio
  nuevo (fase 173).
