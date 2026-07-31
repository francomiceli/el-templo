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
