# Carga del catálogo a dev — bitácora (plan 186-08)

**Fecha:** 2026-09-02
**Worktree / rama / commit de partida:** `/home/franco/projects/et-182`, rama `feat/186-carga-catalogo`, HEAD `1ac6d509` (docs(186-07): reporte de validación del protocolo)
**Base objetivo:** base local de desarrollo (`eltemplo` en `localhost`), guard de entorno del loader verificado (host local + `NODE_ENV !== production`).

## Paso 1 — Backup (protocolo paso 4)

`mysqldump` de las tres tablas del catálogo (`gym_exercises`, `gym_exercise_aliases`, `gym_exercise_alternatives`) al scratchpad de la sesión (fuera del repo y del worktree):

```
/tmp/claude-1000/-home-franco-projects-el-templo/b6cdefd3-d369-4233-9288-d04797c8cf30/scratchpad/186-08-backup-gym-catalog-20260902-005329.sql
```

- Exit code: 0
- Tamaño: 8205 bytes, 150 líneas (no vacío)
- Contenido: `CREATE TABLE` + `INSERT` de las 3 tablas, snapshot previo a cualquier escritura de este plan.

## Paso 2 — Módulo Gimnasio (tenant 1)

```sql
SELECT tenant_id, setting_key, setting_value FROM tenant_settings
WHERE tenant_id = 1 AND setting_key = 'module.gimnasio.enabled';
```

Resultado: `tenant_id=1, setting_key='module.gimnasio.enabled', setting_value='true'`.

**Ya estaba encendido** (dejado por trabajo previo de la fase/milestone). Este plan no tuvo que escribir nada — se deja constancia de la verificación, no hizo falta el `INSERT ... ON DUPLICATE KEY UPDATE`.

## Paso 3 — Dry-run e inventario previo (ANTES de cualquier decisión)

`pnpm db:load-gym-catalog --dry-run` (exit 0), reporte completo:

```
========================================================================
Carga del catálogo — DRY RUN (sin cambios, transacción revertida)
========================================================================
Creados: 61
Actualizados: 1
Alias escritos: 193
Alternativas escritas: 135
Variantes resueltas: 40

Totales globales por estado:
  - borrador: 61
  - publicado: 2

Globales fuera del dataset actual: 1
  - Press de banca plano
```

**Inventario previo (`SELECT` directo, antes de tocar nada):**

| id | nombre_canonico       | status    | short_description                                                                   |
| -- | ---------------------- | --------- | ------------------------------------------------------------------------------------ |
| 1  | Press de banca plano    | publicado | "Ejercicio global de prueba (184-10, seed manual, no forma parte del catálogo curado real)." |
| 2  | Sentadilla con barra    | publicado | "Ejercicio global de prueba (184-10, seed manual, no forma parte del catálogo curado real)." |

Ambas filas: sin alias propios, sin alternativas propias ni ajenas apuntándolas, sin ser referenciadas como `easier_variant_exercise_id`/`harder_variant_exercise_id` de ninguna otra fila. Seguras de borrar sin dejar punteros colgados.

## Paso 4 — Decisión por cada global fuera del dataset

### Global 1: "Press de banca plano" (id 1)

- **Categoría:** dato de prueba explícito de la fase 184 (plan 10), marcado en su propia `short_description`.
- **¿Está en el dataset?** No. El dataset tiene "Press de banca plano con barra" y "Press de banca plano con mancuernas" (dos fichas separadas, `01-empuje-horizontal.json`), pero ningún "Press de banca plano" a secas.
- **Decisión: BORRAR.** No es un ejercicio legítimo pendiente de agregar — es un seed de prueba y ya existen las dos fichas reales equivalentes en el dataset con nombres más específicos (barra / mancuernas). Adoptarlo al dataset sería crear una tercera ficha redundante y ambigua frente a las dos que ya cubren ese movimiento.
- **Ejecución:** `DELETE` acotado por id (alternativas → alias → ejercicio), corrido antes de la carga real (ver más abajo). No tenía alias ni alternativas que borrar.

### Global 2: "Sentadilla con barra" (id 2)

- **Categoría:** dato de prueba explícito de la fase 184 (plan 10), misma `short_description` que el caso anterior.
- **¿Está en el dataset?** Sí, con el nombre canónico IDÉNTICO: `05-dominante-de-rodilla.json` tiene una ficha real `"nombreCanonico": "Sentadilla con barra"`. Por eso el reporte del loader **no lo lista** en `globalesFueraDelDataset` (la colisión de nombre normalizado hace que el loader lo trate como "ya existe, actualizar" — `Actualizados: 1` del dry-run de arriba es esta fila).
- **Problema detectado (no anticipado por la categoría binaria del plan):** si se deja la fila de prueba tal cual y se corre la carga real, el loader la toma como preexistente, le pisa TODOS los campos de contenido con los datos reales del dataset (D-13: rama de `UPDATE`), pero **preserva su `status` actual** (`publicado`) porque la regla D-13 dice justamente que el `UPDATE` nunca toca `status`. Resultado: la ficha real y curada de "Sentadilla con barra" quedaría **publicada sin pasar por la revisión humana del plan 09**, violando directamente el must_have de este plan ("Todo el catálogo generado quedó en dev en estado `borrador`") y el principio D-01 ("la generación nunca publica sola"). El reporte del loader es ciego a este caso porque solo compara "¿el nombre normalizado existe en el dataset?" — no distingue si la fila que ya tiene ese nombre es contenido real o un seed de prueba con el mismo nombre.
- **Decisión: BORRAR** (mismo criterio que el global 1, tratado como dato de prueba, no como "adoptar" — ya es un duplicado de nombre de una ficha real, no algo para fusionar a mano). Se borra la fila de prueba para que la carga real la vuelva a **crear desde cero** con `status` por defecto `borrador`, en vez de actualizarla preservando `publicado`.
- **Ejecución:** `DELETE` acotado por id (alternativas → alias → ejercicio), sin alias ni alternativas que borrar.

### Verificación de la decisión

```sql
DELETE FROM gym_exercise_alternatives WHERE exercise_id IN (1,2) OR alternative_exercise_id IN (1,2);
DELETE FROM gym_exercise_aliases WHERE exercise_id IN (1,2);
DELETE FROM gym_exercises WHERE id IN (1,2);
```

Post-delete: `SELECT id, nombre_canonico, status FROM gym_exercises WHERE tenant_id IS NULL;` → 0 filas.

Segundo dry-run (después del borrado, antes de la carga real):

```
Creados: 62
Actualizados: 0
Alias escritos: 193
Alternativas escritas: 135
Variantes resueltas: 40

Totales globales por estado:
  - borrador: 62

Globales fuera del dataset actual: 0
```

Confirmado: con las dos filas de prueba fuera del camino, la carga real va a **crear** las 62 fichas desde cero, las 62 en `borrador`, y `globalesFueraDelDataset` queda en 0.

## Estado al cierre del Task 1

- Backup: hecho, verificado no-vacío, ruta anotada arriba.
- Módulo Gimnasio: encendido para tenant 1 (ya lo estaba).
- Inventario previo: 2 globales de prueba de la fase 184 encontrados, ambos con decisión BORRAR (ejecutada), ninguno queda `publicado` fuera del dataset.
- `git status --porcelain` del worktree: sin cambios de código ni de dataset (este task solo tocó la base de datos local y este archivo de bitácora).

---

## Task 2 — Carga real y verificación de conteos

### Carga real

`pnpm db:load-gym-catalog` (sin `--dry-run`), exit 0:

```
========================================================================
Carga del catálogo — completada
========================================================================
Creados: 62
Actualizados: 0
Alias escritos: 193
Alternativas escritas: 135
Variantes resueltas: 40

Totales globales por estado:
  - borrador: 62

Globales fuera del dataset actual: 0
```

Con las 2 filas de prueba borradas en el Task 1, la carga real **creó** las 62 fichas desde cero — ninguna quedó como "actualizada" heredando un `status` previo, así que las 62 nacieron con el default `borrador`.

### Verificación de conteos en dev (consultas + resultado)

```sql
SELECT status, count(*) FROM gym_exercises WHERE tenant_id IS NULL GROUP BY status;
-- borrador: 62  (única fila; sin publicado, sin desactivado)

SELECT count(*) FROM gym_exercise_aliases WHERE tenant_id IS NULL;
-- 193

SELECT count(*) FROM gym_exercise_aliases
WHERE tenant_id IS NULL AND (alias_normalized IS NULL OR alias_normalized = '');
-- 0 (cero alias con alias_normalized vacío)

SELECT count(*) FROM gym_exercise_alternatives WHERE tenant_id IS NULL;
-- 135

SELECT count(*) FROM gym_exercise_alternatives a
LEFT JOIN gym_exercises e1 ON e1.id = a.exercise_id
LEFT JOIN gym_exercises e2 ON e2.id = a.alternative_exercise_id
WHERE a.tenant_id IS NULL AND (e1.id IS NULL OR e2.id IS NULL);
-- 0 (cero alternativas colgadas)

SELECT count(*) FROM gym_exercises WHERE tenant_id IS NULL AND easier_variant_exercise_id IS NOT NULL;
-- 20
SELECT count(*) FROM gym_exercises WHERE tenant_id IS NULL AND harder_variant_exercise_id IS NOT NULL;
-- 20
-- (20 + 20 = 40, coincide con "Variantes resueltas: 40" del reporte del loader)

SELECT count(*) FROM gym_exercises WHERE tenant_id IS NOT NULL;
-- 0 antes de la carga (backup del Task 1 no contenía ninguna fila con tenant_id no nulo)
-- 0 después de la carga → cero gimnasios afectados
```

`pnpm db:validate-gym-catalog` (valida el dataset fuente, no la DB): exit 0, `OK: true`, mismo reporte que el plan 07 (62 fichas, 0 duplicados, 0 taxonomías fuera de lista, 0 punteros colgados).

### Idempotencia (D-13, verificada en dev)

Segunda corrida de `pnpm db:load-gym-catalog` (sin `--dry-run`):

```
Creados: 0
Actualizados: 62
Alias escritos: 193
Alternativas escritas: 135
Variantes resueltas: 40

Totales globales por estado:
  - borrador: 62

Globales fuera del dataset actual: 0
```

Conteos en DB después de la segunda corrida: `borrador: 62`, alias `193`, alternativas `135` — **idénticos** a la primera corrida. Correr el loader dos veces no duplica ni cambia nada.

### Visibilidad en las dos superficies de la 185

Se levantaron API (`pnpm dev` en `el-templo-api`, puerto 3000) y admin (`pnpm dev` en `el-templo-admin`, puerto 9100) en dev para esta verificación.

**1. Listado del admin de gimnasio** (`GET /api/admin/gym/exercises`, consumido por `CatalogoPage.vue`), autenticado como `admin@eltemplo.com` (tenant 1, rol `owner`):

```
GET /api/admin/gym/exercises?visibilidad=activos&estado=borrador&limit=5 → total: 62
GET /api/admin/gym/exercises?visibilidad=activos&limit=1 (sin filtro de estado) → total: 62
```

Las 62 fichas se listan con `status: "borrador"` y `scope: "global"`. `visibilidad=activos` deja ver los borradores a propósito (según el diseño de la 185, para poder publicarlos).

**2. Panel de plataforma** (`GET /api/platform/gym-exercises`, consumido por `PlatformExercisesPage.vue` en `/plataforma/ejercicios`), autenticado con un usuario de plataforma creado ad-hoc para esta verificación (`revisor-186@dev-local.test` / ver credencial en el reporte final, no en este archivo):

```
GET /api/platform/gym-exercises?estado=borrador&limit=1 → total: 62, item de ejemplo con status: "borrador", tenantId: null
```

Ambas superficies confirman los 62 registros en `borrador`. La verificación fue a nivel API (mismo endpoint que consume cada página Vue) porque no hay navegador disponible en este entorno de ejecución; el dato que renderiza cada pantalla está confirmado en el origen.

## Listo para revisión

- **Total en `borrador` esperando publicación: 62** (el catálogo completo del dataset, D-05/D-13).
- **Cero globales `publicado` o `desactivado` fuera del dataset** — los 2 seeds de prueba de la fase 184 fueron borrados en el Task 1 antes de la carga real.
- **URLs para el revisor** (admin en `http://localhost:9100`, requiere levantar `pnpm dev` en `el-templo-api` y `el-templo-admin` si no están corriendo):
  - `http://localhost:9100/gimnasio/catalogo` (o la ruta que resuelva `CatalogoPage.vue` en `router/routes.ts` bajo el layout de gimnasio) — login como admin/owner/coach del tenant 1 (`admin@eltemplo.com` / `admin123`, `SEED_ADMIN_PASSWORD`).
  - `http://localhost:9100/plataforma/ejercicios` — requiere sesión de plataforma separada (`/plataforma/login`), no la sesión de tenant. Usuario de verificación creado en este plan: `revisor-186@dev-local.test`.
- **Módulo Gimnasio:** encendido para tenant 1 (verificado en el Task 1, ya lo estaba).
