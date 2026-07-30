# Phase 170: Detección automática — sentinel de pool mysql2 + lint en CI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-28
**Phase:** 170-detecci-n-autom-tica-sentinel-de-pool-mysql2-lint-en-ci
**Areas discussed:** Ruido en prod y la métrica, Mecanismo de "módulo migrado", Forma del lint, Allowlist decreciente

---

## Ruido en prod y la métrica

### ¿Cómo logueamos las violaciones del sentinel en prod/staging?

| Option                          | Description                                                                                             | Selected |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- | -------- |
| Dedup: 1 log por query distinta | Primera aparición → log.error con detalle; repeticiones → contador. Logs acotados + inventario completo | ✓        |
| Silencio hasta que se migre     | Solo tablas migradas loguean; el resto contador invisible                                               |          |
| Loguear todo siempre            | Cada violación escribe su línea — inundación hasta la 175                                               |          |

**Notes:** La primera formulación de la pregunta fue confusa ("que?"); se re-explicó
en criollo el problema del volumen (hoy nada migrado → casi toda query violaría) y
Franco eligió la recomendada.

### ¿Qué es la "métrica" del sentinel en prod?

| Option                              | Description                                                                    | Selected |
| ----------------------------------- | ------------------------------------------------------------------------------ | -------- |
| Contador + resumen periódico en log | In-memory + log estructurado periódico con totales y top violadores; cero deps | ✓        |
| Evento Sentry deduplicado           | Visible en dashboard, pero consume cuota y mezcla deuda con errores reales     |          |
| Ambos                               | Máxima visibilidad, más código y ruido en Sentry                               |          |

### ¿Qué queries inspecciona el sentinel?

| Option                     | Description                                                          | Selected |
| -------------------------- | -------------------------------------------------------------------- | -------- |
| Todas: SELECT y escrituras | Diseño cerrado del doc 03; una lectura sin tenant_id es la peor fuga | ✓        |
| Solo escrituras en la 170  | Menos falsos positivos, pero desvía del diseño validado              |          |

### ¿Cómo se arma y cierra el inventario de excepciones (ventana de observación)?

| Option                            | Description                                                                | Selected |
| --------------------------------- | -------------------------------------------------------------------------- | -------- |
| Suite de tests + días de staging  | Inventario determinístico de la suite + 2-3 días de staging para confirmar | ✓        |
| Solo staging, ~1 semana           | Pasivo; staging tiene poco tráfico                                         |          |
| Cierre el mismo día con smoke E2E | Veloz pero sin margen para crons nocturnos/webhook                         |          |

---

## Mecanismo de "módulo migrado"

### ¿Dónde vive la lista de tablas en modo strict (throw)?

| Option                     | Description                                                           | Selected |
| -------------------------- | --------------------------------------------------------------------- | -------- |
| En tenant-tables.ts        | Junto a GYM_OWNED_TABLES; fuente canónica única ya vigilada por gates | ✓        |
| Config propia del sentinel | Autocontenido pero duplica la fuente de verdad                        |          |
| Variable de entorno        | Flexible pero invisible y desincronizable                             |          |

### ¿Granularidad de la lista strict?

| Option                | Description                                                   | Selected |
| --------------------- | ------------------------------------------------------------- | -------- |
| Por módulo → tablas   | Record { finance: [...] }; una fase de adopción = una entrada | ✓        |
| Lista plana de tablas | Más directa pero sin trazabilidad de módulo/fase              |          |

### Con la lista strict vacía, ¿cómo se prueba el throw?

| Option                                 | Description                                                                    | Selected |
| -------------------------------------- | ------------------------------------------------------------------------------ | -------- |
| Sentinel parametrizable + test inyecta | El test inyecta una tabla real como strict y afirma el throw; prod queda vacía | ✓        |
| Activar una tabla real ya en la 170    | Declararía migrado algo que no pasó por su fase de adopción                    |          |

### En tests, ¿qué hace el sentinel con las tablas no strict?

| Option                            | Description                                               | Selected |
| --------------------------------- | --------------------------------------------------------- | -------- |
| Silencio + modo inventario aparte | SENTINEL_INVENTORY=1 junta violaciones y reporta al final | ✓        |
| Warn visible en cada corrida      | Output ilegible hasta la 175; riesgo de warning-blindness |          |

---

## Forma del lint

### ¿Qué forma toma el lint de CI?

| Option                             | Description                                                  | Selected |
| ---------------------------------- | ------------------------------------------------------------ | -------- |
| Script standalone tsx + step de CI | Idioma verify-tenant-\*; exit codes 0/1/2; rápido, sin MySQL | ✓        |
| Gate como test de Vitest           | Pagaría ~96 s de provisioning MySQL de test/setup.ts         |          |
| Regla ESLint custom                | El API no tiene ESLint; armar config + plugin es lo más caro |          |

### ¿Cómo analiza el código el script?

| Option                     | Description                                                                                           | Selected |
| -------------------------- | ----------------------------------------------------------------------------------------------------- | -------- |
| AST con compiler API de TS | Ya es dependencia; distingue sql`` real de prosa; ancla exención al sitio del write (hallazgo 169-09) | ✓        |
| Regex/grep multilinea      | Exactamente lo que el 169-09 demostró frágil                                                          |          |

### ¿Dónde corre además de CI?

| Option                    | Description                              | Selected |
| ------------------------- | ---------------------------------------- | -------- |
| CI + comando local manual | Gate duro en CI; pnpm lint:tenant a mano | ✓        |
| CI + pre-commit (husky)   | Sumaría segundos a todos los commits     |          |

### ¿Valida también las exenciones tenant-safe existentes?

| Option                       | Description                                                             | Selected |
| ---------------------------- | ----------------------------------------------------------------------- | -------- |
| Sí: formato + motivo + sitio | Cierra el criterio 3 con la misma herramienta; inventario en una pasada | ✓        |
| No: solo accesos nuevos      | Criterio 3 sin enforcement automático                                   |          |

---

## Allowlist decreciente

### ¿Formato de las entradas?

| Option                          | Description                                                         | Selected |
| ------------------------------- | ------------------------------------------------------------------- | -------- |
| Archivo + tabla                 | Estable ante ediciones; acceso a tabla nueva = entrada nueva = rojo | ✓        |
| Archivo + conteo (ratchet)      | Ciego al swap dentro del mismo archivo                              |          |
| Sitio exacto (hash del snippet) | Fricción constante ante refactors cosméticos                        |          |

### ¿Check que impide agrandarla?

| Option                                | Description                                                      | Selected |
| ------------------------------------- | ---------------------------------------------------------------- | -------- |
| Diff contra la rama base en CI        | Entradas ganadas vs merge-base/event.before = rojo; stale = rojo | ✓        |
| Solo stale=rojo + visibilidad en diff | Suficiente contra olvidos, no contra atajos                      |          |

### ¿Coherencia con la lista strict?

| Option                        | Description                                                   | Selected |
| ----------------------------- | ------------------------------------------------------------- | -------- |
| Sí: strict + allowlist = rojo | Cada adopción obligada a vaciar sus entradas al activar throw | ✓        |
| No: listas independientes     | Permite el estado mentiroso "migrado con exentos"             |          |

### ¿Generación de la baseline inicial?

| Option                              | Description                                                       | Selected |
| ----------------------------------- | ----------------------------------------------------------------- | -------- |
| One-shot en la 170, sin regenerador | Se corre una vez, se revisa y committea; achicar es manual        | ✓        |
| Comando regenerador permanente      | Regenerar = re-absorber sitios nuevos; puerta trasera del ratchet |          |

---

## Claude's Discretion

- Parser del sentinel: extracción de nombres de tabla, detección de presencia de
  `tenant_id`, manejo de statements no-DML.
- Nombres/ubicación del script de lint, pnpm script y archivo de allowlist.
- Detalle del resumen periódico (intervalo, forma del log).
- Integración exacta del wrap del pool en `plugins/database.ts`.
- `tenantWhere`/`tenantValues` cuentan como presencia de `tenant_id` para el lint.

## Deferred Ideas

- Endurecer sentinel de prod a throw (pospuesto por diseño: "endurecer después con
  datos reales").
- Config ESLint para el API (feedback en editor).
- Sistema de métricas real (Prometheus/OTel).
