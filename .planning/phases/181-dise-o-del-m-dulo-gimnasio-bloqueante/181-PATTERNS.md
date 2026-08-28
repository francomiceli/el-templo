# Fase 181: Diseño del módulo Gimnasio (bloqueante) - Mapa de patrones

**Mapeado:** 2026-08-27
**Archivos analizados:** 1 (el entregable de la fase es un único documento)
**Analogs encontrados:** 1/1 (con 4 analogs estructurales + 3 analogs de convención de schema)

**Nota de alcance:** esta fase NO escribe código de producto. El único archivo a crear es
`.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md`. Por eso este PATTERNS.md no mapea
"controller/service/component" — mapea **convenciones documentales** (cómo se escribe un doc
de la serie 01-07: encabezados, trazabilidad a REQ, cómo se presentan decisiones y tablas) y
**convenciones de schema** (cómo se leerían las tablas propuestas si ya fueran Drizyzle real),
porque D-08 exige que el doc llegue a nivel de entidades/columnas clave/FKs/índices.

---

## File Classification

| Archivo nuevo/modificado                               | Rol        | Flujo de datos                     | Analog más cercano                                                                                                                                                                                                                               | Calidad de match                                  |
| ------------------------------------------------------ | ---------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| `.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md` | design-doc | transform (síntesis de decisiones) | `.docs/saas-multitenancy/04-mecanismo-modulos.md` (estructura), `05-inventario-tablas-2026-07-26.md` (presentación de tablas), `03-diseno-tenant-db-layer.md` (decisiones de capa de datos), `07-receta-adopcion.md` (checklists/precondiciones) | exact (misma serie, mismo autor, mismo propósito) |

No hay otros archivos a crear o modificar en esta fase. `el-templo-app`, `el-templo-admin` y
`el-templo-api` **no se tocan** — el criterio de éxito 3 de la fase es justamente "cero código
de producto".

---

## Pattern Assignments

### `.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md` (design-doc, transform)

**Analogs:** los 4 docs de la serie 01-07 más relevantes por sub-necesidad. La serie completa
vive en `.docs/saas-multitenancy/`.

#### 1. Estructura general del documento (copiar de `04-mecanismo-modulos.md`)

**Encabezado + bloque de estado** (líneas 1-8 del análogo):

```markdown
# Fase 2 — Mecanismo de módulos/flags: diseño propuesto

> **Estado:** ✅ VALIDADO con Nacho (2026-07-02) — las 6 decisiones de §8 aprobadas tal
> como se propusieron. Dirección hooks/eventos acordada previamente (README §6, doc 02
> §4.2); este doc la baja a diseño concreto. Evidencia: lectura del wiring real de
> `el-templo-api` (instanciación de services, cadena de pricing, los 4 acoples de
> AuraService, `system_settings`, gating existente).
```

Aplicar a la 181 con el título/número de fase y el estado real (D-09: Franco firma, no
Nacho — el bloque de estado debe decirlo así, no copiar "validado con Nacho"):

```markdown
# Fase 181 — Diseño del módulo Gimnasio (bloqueante)

> **Estado:** ✅ Firmado por Franco (D-09) — sin gate de aprobación de Nacho; a Nacho le
> llega como información. Responde las 7 definiciones del brief de Nacho (2026-07-24 +
> addendum A1-A7) y decide la superficie member-facing multi-tenant (DIS-02). Evidencia:
> RESEARCH.md de la fase 181 (inventario de `tenant-tables.ts`, `tenant-manifest.ts`,
> `modules.ts`, `auth/routes.ts`, deploy.yml, docs oficiales de Quasar/Apple/WebKit/Let's
> Encrypt).
```

**Resumen ejecutivo** (patrón de `04-mecanismo-modulos.md` líneas 9-21): 3-5 líneas que
resuman la forma de la solución ANTES del detalle, con una lista numerada de las piezas
mínimas. Para el doc 08 esto es: "7 definiciones respondidas + DIS-02, abiertas con una
sección 'Precondiciones de plataforma' que resuelve H-1..H-4 antes de entrar a las
definiciones" (ya recomendado en el RESEARCH §Summary).

**Secciones numeradas `## N. Título`**, cada una con sub-secciones `### N.M`. El doc 08 debe
usar **una sección por definición** (verificable por `grep -c '^## Definición'` según la
Validation Architecture del research) más una sección `## DIS-02` y la sección de
precondiciones antes de todas:

```markdown
## Precondiciones de plataforma (H-1..H-4)

## Definición 1 — ¿Calistenia y Gimnasio comparten modelo de datos?

## Definición 2 — Alcance global/local y promoción sin romper historial

## Definición 3 — Comportamiento offline

## Definición 4 — Recálculo de récords

## Definición 5 — Superseries y circuitos

## Definición 6 — Volumen de datos, esquema e índices

## Definición 7 — Mapa de `tenant_settings`

## DIS-02 — Superficie member-facing multi-tenant
```

**Marcadores de decisión** (patrón repetido en 02, 04, 05: `✅ DECIDIDO (fecha)`,
`✅ CONFIRMADO en bloque (Nacho, fecha)`, `✅ RESUELTO (fecha)`). Para la 181, el marcador es
`✅ CERRADA (CONTEXT 2026-08-27, D-XX)` — cada definición cierra citando el ID de decisión del
CONTEXT que la resuelve (D-01/D-02 para la 1, D-06/D-11/D-12 para DIS-02, etc.).

**Registro de cambios al final** (todos los docs de la serie lo tienen como última sección,
ver `04-mecanismo-modulos.md` líneas 261+ y `07-receta-adopcion.md` línea 346): una entrada
por fecha con qué se decidió o qué divergió. El doc 08 nace con una sola entrada
(`2026-08-27 — Creación`); no hay entradas de implementación porque esta fase no construye
código.

#### 2. Trazabilidad a REQ (patrón de tablas del research + criterio de éxito 4)

El CONTEXT y el RESEARCH no muestran una tabla REQ→sección en los docs 01-07 anteriores
(esa serie predata el sistema formal de REQ IDs), pero el propio RESEARCH.md de esta fase
ya modela el patrón a seguir en su tabla `## Phase Requirements` (líneas 56-61 del research):
una fila por REQ con "qué de esta sección lo habilita". Reusar esa forma dentro de cada
sección de definición, citando el REQ ID inline en prosa (`CAT-04`, `RUT-03`, `REG-02`, etc.,
como ya hace el research en sus propias secciones "Definición N") en vez de al final del doc:
así el grep `grep -oE '\b(CAT|RUT|REG|VAL|EVO|PROF|PLAT|ONB)-[0-9]{2}\b'` (Validation
Architecture del research) encuentra las referencias distribuidas, no centralizadas.

#### 3. Presentación de tablas propuestas (copiar el nivel de detalle de `03-diseno-tenant-db-layer.md` §3 y `completed-sessions.ts`)

El D-08 pide "entidades, columnas clave, FKs e índices para las consultas críticas" — ni DDL
completo ni solo-conceptual. El análogo exacto de ese nivel intermedio es cómo
`03-diseno-tenant-db-layer.md` presenta el helper `tenantWhere`/`tenantValues` (líneas 55-68):
snippet TypeScript corto, con comentario inline explicando el porqué, no un archivo completo.
Para las tablas propuestas del módulo Gimnasio (catálogo, plantillas, rutinas asignadas,
sesiones, set_logs, records), el patrón a copiar es el de un schema Drizzle real del repo —
ver más abajo "Patrones compartidos > Convención de schema".

**Ejemplo de cómo el research YA presenta el índice crítico de la definición 6** (para copiar
la forma, no el contenido, en el doc 08):

```
idx_gym_set_logs_hist (tenant_id, user_id, exercise_id, performed_at DESC)
```

Con la explicación en prosa de por qué ese orden de columnas (tenant primero, por la
convención de la fase 168) — así es como el doc 03 justifica cada capa, nunca solo enumera.

#### 4. Tabla de opciones con costo (copiar de H-1 del RESEARCH, que ya sigue el patrón de `05-inventario-tablas` §6 "Minas terrestres")

Cuando una definición tiene más de una opción viable (p. ej. Definición 2 / H-1: catálogo
global+local), el research ya la resolvió con una tabla de 3 columnas
`Opción | Forma | Costo en la maquinaria v6.0` (RESEARCH.md líneas 129-133). Copiar esa forma
tabular directo al doc 08 en vez de reescribir en prosa — es más grep-able y es el estilo que
`05-inventario-tablas-2026-07-26.md` §6 (Minas terrestres) y `07-receta-adopcion.md` §4 (Las
trampas) ya usan para "problema conocido + por qué + mitigación".

#### 5. Checklist de precondiciones (copiar de `07-receta-adopcion.md` §1.1 y §6)

Para la sección "Precondiciones de plataforma" que el RESEARCH recomienda como apertura del
doc 08, el análogo formal es la lista de checkboxes de `07-receta-adopcion.md` líneas 32-42
("Precondiciones de plataforma (fases 166-171, todas en master)") y el checklist copiable de
cierre (líneas 270-317, formato ` ``` ` con `[ ]` por ítem, agrupado por sección en MAYÚSCULAS).
El doc 08 puede usar la misma forma para dejar explícito qué debe existir antes de que la 184
empiece (H-1 resuelto y nombrado, H-2 resuelto y nombrado, H-3 con la resolución de tenant por
host especificada, H-4 con el trigger re-enunciado).

---

## Convención de schema a espejar (para que las tablas propuestas del doc "lean como el schema real")

Aunque esta fase no escribe Drizzle, D-08 exige columnas/FKs/índices concretos. Estos tres
archivos son el estilo de referencia:

### `el-templo-api/src/db/schema/tenant-column.ts` (helper de tenancy — cómo se documenta una decisión de columna)

Patrón de docblock a imitar en prosa dentro del doc 08 cuando se proponga la columna de
tenancy de las tablas nuevas (todas las tablas gym-owned del módulo Gimnasio la llevan igual):

```ts
export function tenantIdColumn() {
  return int("tenant_id")
    .notNull()
    .default(1)
    .references(() => tenants.id);
}
```

El comentario que antecede la función (líneas 1-31 del archivo) es el ejemplo canónico de
"por qué esta columna es así" — el mismo tono (una decisión, su motivo, el trade-off
descartado) es el que el doc 08 debe usar al proponer, p. ej., por qué `gym_exercises.tenant_id`
es NULLable (Opción A de H-1) en vez de `NOT NULL DEFAULT 1` como toda tabla gym-owned normal:
la excepción se nombra y se justifica exactamente así, no se da por sentada.

### `el-templo-api/src/db/schema/tenants.ts` (tabla raíz — cómo se presenta una entidad con enum + tabla KV asociada)

Dos patrones reusables para el doc 08:

1. **Enum de estado con comentario de semántica de negocio** (líneas 8-13): útil para
   proponer, p. ej., el `status` de `gym_exercises` (borrador/publicado/desactivado, CAT-05
   de la Definición 2) con la misma forma "una línea por valor, qué significa, qué NO hace".
2. **Tabla KV con unique compuesta** (líneas 73-85) — es el ejemplo exacto de la Definición 7
   (`tenant_settings`), ya existe y no se propone de nuevo; el doc 08 solo referencia esta
   tabla y aporta el mapa de keys (ya lo trae el RESEARCH.md, sección Definición 7).

```ts
export const tenantSettings = mysqlTable(
  "tenant_settings",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: int("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    settingKey: varchar("setting_key", { length: 100 }).notNull(),
    settingValue: text("setting_value").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex("uq_tenant_setting").on(t.tenantId, t.settingKey)],
);
```

### `el-templo-api/src/db/schema/completed-sessions.ts` (tabla histórica gym-owned — el analog de forma más cercano a `gym_set_logs`/`gym_sessions`)

Es la tabla más parecida en propósito a lo que la Definición 6 propone (`gym_set_logs`,
historial alumno×ejercicio): registro histórico, con `tenantId`, FK a `users`/`branches`,
varios índices simples sobre columnas de consulta frecuente:

```ts
export const completedSessions = mysqlTable(
  "completed_sessions",
  {
    id: int("id").primaryKey().autoincrement(),
    tenantId: tenantIdColumn(),
    userId: int("user_id")
      .notNull()
      .references(() => users.id),
    dayId: varchar("day_id", { length: 50 }).notNull(),
    date: varchar("date", { length: 10 }).notNull(),
    branchId: int("branch_id")
      .notNull()
      .references(() => branches.id),
    startedAt: timestamp("started_at").notNull(),
    completedAt: timestamp("completed_at").notNull(),
    // ... columnas de negocio
  },
  (table) => [
    index("completed_sessions_user_idx").on(table.userId),
    index("completed_sessions_date_idx").on(table.date),
    index("completed_sessions_branch_idx").on(table.branchId),
  ],
);
```

**Diferencia a marcar explícitamente en el doc 08:** `completed_sessions` usa tres índices
simples de una columna porque sus consultas hoy son independientes. La Definición 6 pide
específicamente un **índice compuesto de cobertura** `(tenant_id, user_id, exercise_id,
performed_at DESC)` para `gym_set_logs`, porque la consulta crítica ("historial de este
alumno en este ejercicio") filtra por las tres columnas a la vez — el doc debe explicar por
qué se aparta del patrón de índices simples de `completed_sessions` (que sí sirve de ejemplo
de forma para las columnas `tenantId`/FK/timestamps, pero no para la estrategia de índice).

---

## Shared Patterns

### Trazabilidad de decisiones (aplica a las 7 definiciones + DIS-02)

**Fuente:** convención de toda la serie 01-07 (`02-inventario-modulos.md`,
`04-mecanismo-modulos.md`, `05-inventario-tablas-2026-07-26.md`).

Cada definición cierra con un marcador de estado citando quién decidió y cuándo:

```markdown
## 8. Decisiones — ✅ TODAS VALIDADAS con Nacho (2026-07-02)
```

Adaptado a la 181 (D-09: sin gate de Nacho):

```markdown
### Definición N — ✅ CERRADA (CONTEXT 2026-08-27, D-0X)
```

### Presentación de opciones con costo (aplica a Definición 2/H-1, Definición 5, DIS-01 en general)

**Fuente:** `05-inventario-tablas-2026-07-26.md` §6 "Minas terrestres" y RESEARCH.md H-1
(tabla `Opción | Forma | Costo`).

```markdown
| Opción | Forma | Costo en la maquinaria v6.0 |
| ------ | ----- | --------------------------- |
| A. ... | ...   | ...                         |
```

Usar SIEMPRE que exista más de una opción viable — nunca resolver en prosa una decisión que
tiene alternativas reales, porque el planner y las fases 184+ necesitan poder citar "opción A,
tabla tal" sin releer un párrafo largo.

### Checklist de precondiciones/cierre (aplica a la sección de apertura del doc 08)

**Fuente:** `07-receta-adopcion.md` §1.1 (precondiciones) y §6 (checklist de cierre,
formato ` ``` ` con `[ ]`).

```
PRECONDICIONES DE PLATAFORMA — módulo Gimnasio

TENANCY
[ ] H-1 resuelto: categoría + helper nombrados en tenant-tables.ts
[ ] H-2 resuelto: categoría de manifiesto decidida (feature-module o templo-module documentado)
[ ] H-3 resuelto: resolución de tenant por hostname especificada, login scoped
[ ] H-4 resuelto: trigger de split re-enunciado, constancia explícita
```

### Registro de cambios (footer, aplica al doc completo)

**Fuente:** última sección de TODOS los docs 01-07.

```markdown
## Registro de cambios

- **2026-08-27** — Creación. [resumen de 2-3 líneas de qué se decidió y por qué]
```

---

## No Analog Found

Ninguno. El único archivo de esta fase (el doc 08) tiene un analog estructural exacto (la
serie 01-07 completa, mismo directorio, mismo autor, mismo propósito) y analogs de convención
de schema exactos (`tenant-column.ts`, `tenants.ts`, `completed-sessions.ts`) para el nivel de
detalle que D-08 exige.

---

## Metadata

**Alcance de búsqueda de analogs:** `.docs/saas-multitenancy/*.md` (serie 01-07 + README),
`el-templo-api/src/db/schema/` (tenant-column.ts, tenants.ts, completed-sessions.ts, listado
completo del directorio).
**Archivos escaneados:** 10 docs de `.docs/saas-multitenancy/` (headings extraídos de 02, 03,
04, 05, 07 con grep; contenido leído en detalle de 03, 04, 05); 2 archivos de schema leídos
completos (tenant-column.ts, tenants.ts) + 1 tabla de ejemplo completa (completed-sessions.ts);
listado de ~50 archivos de `src/db/schema/` para elegir el analog de tabla histórica.
**Fecha de extracción de patrones:** 2026-08-27
