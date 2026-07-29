---
phase: 170-detecci-n-autom-tica-sentinel-de-pool-mysql2-lint-en-ci
plan: 10
subsystem: testing
tags: [tenancy, lint, allowlist, ratchet, ci, baseline]

# Dependency graph
requires:
  - phase: 170-07
    provides: "El baseline one-shot original (423 entradas) y el step de CI"
  - phase: 170-09
    provides: "El motor que ya ve alias locales y joins, y la medicion del delta (+78, 0 perdidos)"
provides:
  - "Allowlist re-baselineada a 501 entradas: la deuda que existe hoy, vista con la lente completa"
  - "El criterio 4 del ROADMAP demostrado en vivo: el caso que el verificador dejo pasar en VERDE ahora sale exit 1"
  - "La bateria CON-06 entera en verde (38/38) sin haber tocado un solo archivo de test"
  - "El criterio de ADMISION de la allowlist escrito y medido (violations, no live) dentro del propio archivo"
affects: [171-fixtures-2-tenant, 172-adopcion-finance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Criterio de ADMISION (violations) distinto del criterio de SUPERVIVENCIA (live): una entrada entra por violar, pero no se cae por convertirse en exencion"
    - "Sonda de gate en archivo YA listado: para probar que un par nuevo dentro de un archivo viejo tambien rompe, la sonda se escribe en el archivo viejo y se revierte con `git checkout -- <ruta>`"

key-files:
  created: []
  modified:
    - el-templo-api/tenant-lint-allowlist.json

key-decisions:
  - "El baseline nuevo se genera sobre `violations` y NO sobre `live`: medido sobre este arbol, las 423 entradas previas estan TODAS entre los 501 pares violadores (C\\V = 0), asi que generar sobre violations no pierde ninguna. La hipotesis del plan 09 (53 entradas sostenidas solo por exenciones) no se sostiene con el motor corregido"
  - "Los 11 pares que separan `live` (512) de `violations` (501) son exenciones ancladas de seed.ts / seed-spom.ts que NUNCA estuvieron en la allowlist: entran por D-12/D-17, no por aca. Agregarlos habria sido tolerancia pura sin violacion detras"
  - "El re-baseline es CORRECCION del mismo one-shot (D-16): snippet descartable fuera del repo, cero comandos regeneradores, `note` y `scope` verbatim"

requirements-completed: []

# Metrics
duration: ~35min
completed: 2026-07-29
---

# Phase 170 Plan 10: Re-baseline de la allowlist y demostracion en vivo del criterio 4 Summary

**La allowlist paso de 423 a 501 entradas —los 78 pares que el motor no veia por alias de variable local (CR-01) y por tablas joineadas (WR-01)— con CERO entradas perdidas, y el caso exacto que `170-VERIFICATION.md` reprodujo en VERDE ahora deja `pnpm lint:tenant` en exit 1: el criterio 4 del ROADMAP dejo de ser una afirmacion.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-07-29
- **Tasks:** 2 auto + 1 checkpoint humano
- **Files modified:** 1

## Accomplishments

- **El baseline vuelve a describir la deuda real.** 78 pares (archivo, tabla) mas sobre 51 archivos, ninguno inventado: son accesos que ya existian y que el motor ciego no reportaba.
- **Cero entradas perdidas, verificado contra `git show`** — no por confianza, por comparacion de conjuntos.
- **La decision que el plan 09 delegaba quedo resuelta con una medicion, no con una preferencia** (ver mas abajo): el baseline sale de `violations`.
- **Las dos formas ciegas quedaron demostradas en vivo, con su rojo literal y su verde posterior.**
- **La bateria CON-06 pasa entera (38/38) sin tocar el archivo de test:** el `it` que el plan 09 dejo rojo a proposito se puso verde solo por el re-baseline.

## Task Commits

1. **Task 1: Re-baseline one-shot corregido de la allowlist** — `2401232c` (fix)
2. **Task 2: Demostracion en vivo del criterio 4** — sin commit de codigo por diseno (las sondas se revierten; la salida es este SUMMARY)
3. **Task 3: Checkpoint humano** — pendiente de la aprobacion de Franco

## La decision que el plan 09 delegaba: `violations` vs `live`

El plan 09 anticipaba que 53 de las 423 entradas se sostenian "vivas" solo por accesos EXIMIDOS,
y que generar sobre `violations` las perderia. **Se midio antes de decidir y la hipotesis no se
sostiene con el motor corregido:**

| Conjunto | Pares | Comentario |
| --- | --- | --- |
| `V` — pares con al menos un acceso que VIOLA | 501 | `!compliant && !exemption` |
| `L` — pares "vivos" del gate stale | 512 | `!compliant \|\| exemption` |
| `C` — allowlist previa | 423 | |
| `C \ V` (se perderian generando sobre violations) | **0** | ninguna |
| `C \ L` | 0 | ninguna |
| `L \ V` fuera de la allowlist | 11 | todos de `src/db/seed.ts` y `src/db/seed-spom.ts` |

**Elegido: `violations` (501).** Los dos criterios coinciden en lo que importa —no se pierde
ninguna entrada— y `violations` no agrega tolerancia de mas. Los 11 pares que separan a `live`
de `violations` son exenciones ancladas de los dos seeds (`[ARCHIVO ENTERO] tenant-safe:
provisioning local/de test`), nunca estuvieron en la allowlist y su canal es D-12/D-17: meterlos
aca seria tolerancia pura sin ninguna violacion detras.

Que el gate stale use `live` **no contradice** esto: `live` es criterio de **supervivencia** (una
entrada no se cae por que alguien convirtio su acceso en exencion en otro PR — un rojo por eso
seria ruido que empuja a desactivar el gate, y asi esta escrito en el codigo, `lint-tenant.ts:1276-1284`),
mientras que `violations` es criterio de **admision**. El razonamiento quedo escrito adentro del
propio archivo, en el campo `generated`, para que la proxima persona no lo tenga que re-derivar.

## El re-baseline: antes / despues

| Lente | Antes (plan 08) | Despues (este plan) |
| --- | --- | --- |
| Entradas de la allowlist | 423 | **501** (+78) |
| Archivos con deuda | 120 | **120** |
| Tablas gym-owned con deuda | 87 | **87** |
| Entradas perdidas | — | **0** |
| Entradas bajo `test/` | 0 | **0** |
| Archivos que ganan entradas | — | **51** |

Archivos y tablas no se mueven, y es lo esperado: los 78 pares nuevos caen sobre archivos y tablas
que ya tenian deuda por otro acceso. Es exactamente el modo de falla que WR-01 describia — deuda
que crece **dentro** de un archivo ya listado, invisible porque la clave del ratchet es el par.

Atribucion (medida en el plan 09): **73 pares vienen de los joins (WR-01) y 5 de los alias locales
(CR-01)**, y esos 5 son uno a uno los de `campaigns/service.ts` (`users`, `branches`,
`subscriptions`, `campaign_unsubscribes` y el quinto que el fix destapo, `attendance`).

`pnpm lint:tenant` con la allowlist nueva: **exit 0**, `Archivos analizados: 429`,
`Entradas de la allowlist: 501`, `unlistedViolations: 0`, `staleMissingFile: 0`,
`staleNoLongerViolating: 0`, `strictWithAllowlist: 0`, `DISCREPANCIAS: 0`.

## Sonda A — alias de variable local (el caso que el verificador dejo pasar en VERDE)

Archivo temporal `el-templo-api/src/modules/__probe-alias.ts`, literal del spot-check de
`170-VERIFICATION.md`:

```ts
import * as schema from "../db/schema";
const holidaysAlias = schema.holidays;
export function probeAlias(db: {...}): unknown {
  return db.select().from(holidaysAlias);
}
```

`pnpm lint:tenant` → **exit 1**:

```text
Archivos analizados:            430
Entradas de la allowlist:       501

Violaciones NO listadas en la allowlist (unlistedViolations): 1
  - el-templo-api/src/modules/__probe-alias.ts — holidays (1 acceso)
      Que hacer: migra esos accesos a tenantWhere / tenantValues (...), o escribi la exencion
      /* tenant-safe: <motivo> */ ... Agregar la entrada a el-templo-api/tenant-lint-allowlist.json
      NO es una salida valida: el gate de entradas ganadas (D-14) deja el build rojo igual.

DISCREPANCIAS: 1
```

Borrada la sonda → **exit 0**, `Archivos analizados: 429`, `unlistedViolations: 0`,
`DISCREPANCIAS: 0`.

**Contraste con el verificador:** la MISMA sonda daba `unlistedViolations: 0` / `DISCREPANCIAS: 0`
(exit 0, verde) antes del plan 09. Eso era el Critical CR-01.

## Sonda B — join a una segunda tabla gym-owned, en un archivo ya listado (WR-01)

Sonda escrita DENTRO de `el-templo-api/src/db/fill-future-bookings.ts`, un archivo cuyo par del
`from` (`holidays`) **ya esta en la allowlist**, joineando `routes`, que para ese archivo es un par
NUEVO:

```ts
return db.select().from(holidays).innerJoin(routes, eq(routes.id, holidays.id));
```

`pnpm lint:tenant` → **exit 1**:

```text
Archivos analizados:            429
Entradas de la allowlist:       501

Violaciones NO listadas en la allowlist (unlistedViolations): 1
  - el-templo-api/src/db/fill-future-bookings.ts — routes (1 acceso)

DISCREPANCIAS: 1
```

El par del `from` (`fill-future-bookings.ts` + `holidays`) queda callado porque esta tolerado, y el
par del join sale solo. Revertida la sonda con `git checkout -- el-templo-api/src/db/fill-future-bookings.ts`
→ **exit 0**, `unlistedViolations: 0`, `DISCREPANCIAS: 0`.

## Por que este re-baseline NO viola D-16

- **Es correccion del MISMO baseline one-shot, no un regenerador nuevo.** El motor no veia estos 78
  pares cuando el plan 07 genero la lista: las 423 entradas nunca describieron la deuda real,
  describieron la deuda **visible**. D-16 permite generar una vez, revisar y commitear; lo que
  prohibe es un comando permanente que cualquier PR pueda correr para blanquear la deuda que acaba
  de introducir.
- **No se agrego ningun modo de generacion al script.** El calculo se hizo con un snippet
  descartable en el scratchpad de la sesion, fuera del repo, igual que en el plan 07 y en el
  re-baseline del plan 08 (`d8fa4986`). `git status --porcelain` quedo vacio al cierre.
- **`note` y `scope` se preservaron VERBATIM.** El unico campo tocado ademas de `entries` es
  `generated`, que ahora cuenta la fecha, el motivo (CR-01/WR-01, criterio 4 fallido) y el criterio
  de admision con sus numeros.
- **Achicar sigue siendo borrar entradas a mano** al migrar cada modulo.

## El rojo ESPERADO del gate D-14 en el push a staging

El step de CI corre `pnpm lint:tenant --base="$LINT_BASE"` y en un push `LINT_BASE =
github.event.before`. `origin/staging` **ya tiene la allowlist de 423 entradas** (merge `566b880c`),
asi que el push que lleve este re-baseline va a leer las 78 entradas nuevas como "la allowlist
CRECIO" y va a dejar el step **"Tenant lint (CON-06)" en ROJO una sola vez**.

- **Eso es el ratchet funcionando, no un bug:** crecer la lista exige que un humano mire y acepte.
- **Horizonte: un solo run.** El push siguiente ya tiene la lista nueva en la base y vuelve a verde.
- **El deploy de staging no depende de `ci.yml`** (`deploy-staging.yml` se dispara por su cuenta con
  el push), asi que el rojo no bloquea el deploy.
- **Precedente:** es el mismo movimiento que Franco aprobo en el plan 08 (opcion b, "arreglar antes
  de pushear") para el punto ciego gemelo.

**Camino RECHAZADO a proposito:** borrar la allowlist en un commit y re-agregarla en el siguiente
para que `readBaseAllowlist` no la encuentre en la base y saltee el gate. El propio codigo lo nombra
como "la forma de resetear el ratchet" y emite la advertencia ruidosa cuando la base no tiene el
archivo. No se hizo y no se va a hacer.

## Decisions Made

- **Baseline sobre `violations` (501), no sobre `live` (512)** — medido, no supuesto. Detalle arriba.
- **La sonda B se escribio dentro de un archivo YA listado** en vez de en un archivo nuevo: es la
  unica forma de demostrar el must-have "un join nuevo en un archivo cuyo par del `from` ya esta en
  la allowlist deja el lint en rojo". Con un archivo nuevo los dos pares serian nuevos y la prueba
  seria mas debil.

## Deviations from Plan

**1. [Rule 1 — Correccion de premisa] El plan delegaba una decision sobre una premisa que la medicion desmintio**

- **Found during:** Task 1
- **Issue:** El plan 09 (y el brief de este plan) afirmaban que 53 de las 423 entradas se sostenian
  vivas solo por accesos eximidos, y que generar sobre `violations` las perderia. Medido sobre este
  arbol con el motor corregido: `C \ V = 0` — ninguna. Los pares vivos-no-violadores son 11 y
  **ninguno** estaba en la allowlist.
- **Fix:** Se genero sobre `violations` (el criterio que el plan 07 fijo y que el propio Task 1 de
  este plan manda: "solo entran accesos que VIOLAN"), con la guarda de perdidas = 0 corriendo ANTES
  de escribir el archivo. El resultado satisface las dos condiciones a la vez: cero perdidas y cero
  tolerancia agregada.
- **Files modified:** `el-templo-api/tenant-lint-allowlist.json`
- **Verification:** `REBASELINE_OK entries=501 nuevas=78` (guarda del plan, post-commit) + `pnpm lint:tenant` exit 0.
- **Committed in:** `2401232c`

---

**Total deviations:** 1 (correccion de premisa, sin cambio de alcance)
**Impact on plan:** Ninguno sobre el resultado esperado — la instruccion de fallback del brief
("ante la duda, preservar las 53") se cumple de forma trivial porque no habia ninguna que preservar.

## Issues Encountered

- **`prettier` no se resuelve desde la raiz del monorepo** (`pnpm exec prettier` da
  `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`); si desde `el-templo-api/`. La allowlist ya sale con el
  formato de Prettier (`JSON.stringify(obj, null, 2)` + newline final), asi que lint-staged no la
  reformateo en el commit.

## Verificación

| Chequeo | Resultado |
| --- | --- |
| `pnpm lint:tenant` (sin `--base`) | ✅ exit 0 — `DISCREPANCIAS: 0`, 501 entradas, 429 archivos |
| Guarda del plan (perdidas / test / duplicados / orden) | ✅ `REBASELINE_OK entries=501 nuevas=78` |
| `note` y `scope` verbatim | ✅ el diff del commit toca solo `generated` + `entries` (313 ins / 1 del) |
| Sonda A (alias local) | ✅ exit 1 con el par nombrado → borrada → exit 0 |
| Sonda B (join en archivo listado) | ✅ exit 1 con el par del join nombrado → revertida → exit 0 |
| `pnpm exec tsc --noEmit` | ✅ exit 0 |
| `vitest run test/tenancy/con-06-lint.test.ts --hookTimeout=250000` | ✅ **38/38 passed** (118.8s), incluido `el repo real con el baseline del plan 07 sale 0` |
| `con-06-lint.test.ts` sin modificar en este plan | ✅ `git diff 90ca1b59 HEAD` vacio para ese archivo |
| `git status --porcelain -- el-templo-api` | ✅ vacio (ninguna sonda commiteada ni olvidada) |
| Migraciones / dependencias nuevas | ✅ cero (`pnpm-lock.yaml` intacto) |
| Push | ✅ nada pusheado (gate humano) |

## Known Stubs

Ninguno.

## User Setup Required

**Checkpoint pendiente (Task 3, `blocking-human`):** Franco tiene que (a) mirar el diff de la
allowlist y el conteo antes/despues, (b) confirmar el racional de D-16, y (c) **aceptar
explicitamente el rojo esperado del gate D-14** en el push a staging. El push se pide por separado,
en su propio turno (skill `el-templo-change-control`, seccion 5).

## Next Phase Readiness

- El gate CON-06 queda **utilizable**: verde sobre el repo de hoy y rojo ante las tres formas que lo
  dejaban ciego.
- **Sin cerrar de esta fase (no son de este plan):** WR-02 (el recorte de proyeccion del sentinel es
  ciego a un `WITH`), WR-03 (`event.before` irresoluble tras force-push) y WR-04 (`isCompliantText`
  matchea `tenant_id` dentro de comentarios y sin word boundary — hoy un
  `// TODO: falta filtrar por tenant_id` blanquea un acceso).
- La deuda inventariada (501 pares, 120 archivos) es el mapa de la adopcion modulo por modulo de las
  fases 172+: cada migracion borra sus entradas en el mismo PR.

---

_Phase: 170-detecci-n-autom-tica-sentinel-de-pool-mysql2-lint-en-ci_
_Completed: 2026-07-29 (pendiente el checkpoint humano)_
