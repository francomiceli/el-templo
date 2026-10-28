---
phase: 185
slug: cat-logo-ciclo-de-vida-y-buscador
status: draft
shadcn_initialized: false
preset: none
created: 2026-09-01
---

# Phase 185 — UI Design Contract

> Contrato visual y de interacción de **ciclo de vida + buscador** del catálogo del módulo Gimnasio.
> Generado por gsd-ui-researcher (modo autónomo: usuario ausente, cero preguntas), verificado por gsd-ui-checker.
> **Este contrato EXTIENDE `184-UI-SPEC.md` — no lo reemplaza.** Tokens, paleta, tipografía y patrones de la 184 se heredan tal cual; acá solo se declaran los agregados y las modificaciones explícitas. Ante cualquier ambigüedad, manda la 184.
> Toda la copy de cara al usuario va en **español rioplatense (voseo)**. Aplican las reglas de `CLAUDE.md` (`createLogger`, nunca `console.log`; sin `any`).

**Superficies de esta fase (4):**

| #   | Superficie                                                                     | Requisito     | Decisiones                          |
| --- | ------------------------------------------------------------------------------ | ------------- | ----------------------------------- |
| A   | `CatalogoPage.vue` extendida: búsqueda por texto + filtros + estado + acciones | CAT-05/CAT-07 | D-09, D-11, D-12, D-13, D-14, D-15a |
| B   | `EjercicioSelect.vue` — autocomplete reutilizable (contrato para la 187)       | CAT-07        | D-15b                               |
| C   | `CopiaLocalDialog.vue` — confirmación antes de editar un global desde un gym   | CAT-03        | D-01..D-04                          |
| D   | Panel de plataforma: promoción local→global + transiciones de globales         | CAT-04/CAT-05 | D-05..D-08, D-10                    |

**Fuera de alcance de este contrato:** ficha (`EjercicioFichaDialog.vue`) más allá de los dos agregados declarados abajo (chip de estado vivo + pie de modo lectura); armado de rutinas (187); carga inicial del catálogo (186).

---

## Design System

| Property          | Value                                                                                                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool              | none (Quasar Material — Vue 3/Quasar, no React/Next/Vite-shadcn; el gate de shadcn no aplica)                                                                                                   |
| Preset            | not applicable                                                                                                                                                                                  |
| Component library | Quasar v2 (`q-page`, `q-table`, `q-input`, `q-select`, `q-toggle`, `q-dialog`, `q-card`, `q-btn`, `q-badge`, `q-chip`, `q-banner`, `q-tooltip`, `q-separator`, `q-item`, `q-spinner`, `Notify`) |
| Icon library      | Material Icons (`extras: ['material-icons']` en `quasar.config.js`)                                                                                                                             |
| Font              | Geologica self-hosted (`@fontsource/geologica`, 400/500/600). Fuente de verdad: `el-templo-admin/src/css/app.scss`                                                                              |

**Paleta — fuente de verdad:** `el-templo-admin/src/css/quasar.variables.scss` (cálida, **sin azul**). Prohibido introducir hex nuevos en componentes: usar clases/props de marca de Quasar (`color="primary"`, `text-grey-8`, `bg-summary-surface`) que leen las vars SCSS. **Marcador de staging:** `body.staging-env` recolorea `--q-primary`; hardcodear la terracota lo rompe.

**Reutilización obligatoria (esta fase toca una sección ya construida — no se rediseña nada):**

| Patrón existente                                 | Archivo de referencia (rama `feat/184-catalogo-ejercicios`, worktree `et-182`)          | Qué se copia                                                                                                                                         |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Barra de búsqueda + filas de filtros sobre tabla | `src/pages/AlumnosPage.vue` (líneas ~63-130)                                            | `q-input` `dense outlined clearable debounce="300"` con `#prepend` `search`; filas `row q-col-gutter-sm items-end`                                   |
| Typeahead contra backend                         | `src/components/ReferrerSelect.vue`                                                     | `q-select use-input input-debounce="300" @filter`, mínimo 2 caracteres, `v-model` = id (`number \| null`), `#no-option`, `defineExpose({ reset })`   |
| Diálogo de confirmación de cambio de estado      | `src/components/plataforma/TenantStatusDialog.vue`                                      | `q-dialog persistent` + `q-card min-width: 420px` + cuerpo explicativo + `q-card-actions align="right"` con `Cancelar` flat y confirm con `:loading` |
| Toggle de "mostrar lo retirado"                  | `src/pages/plataforma/TenantsPage.vue` (`showArchived`)                                 | `q-toggle` sobre la tabla; el filtro se aplica en el request, no en el cliente                                                                       |
| Página de plataforma (super-owner)               | `src/pages/plataforma/TenantsPage.vue` + `PlatformHomePage.vue`                         | `q-layout` propio + `q-header bg-primary` + botón `arrow_back` a `/plataforma`; tarjeta de acceso en la home                                         |
| Badge de valor cerrado                           | `src/components/gimnasio/EjercicioScopeBadge.vue` + `src/composables/useStatusBadge.ts` | Mapa `Record<valor, { outline, color, icon, label }>` en UN solo lugar                                                                               |
| Listado del catálogo                             | `src/pages/gimnasio/CatalogoPage.vue`                                                   | Estructura de página, paginación server-side, empty/error states, overrides scoped de 14px                                                           |
| Feedback                                         | `Notify.create({ type, message })`                                                      | Toasts de éxito/error                                                                                                                                |

---

## Spacing Scale

Base 4px (utilidades `q-pa-*` / `q-mb-*` / `q-gutter-*` / `q-col-gutter-*`). Idénticos a la 184:

| Token | Value | Quasar util | Usage en esta fase                                                                                                          |
| ----- | ----- | ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| xs    | 4px   | `xs`        | Gap ícono↔texto en badges y chips; separación entre botones de la columna Acciones (`q-mr-xs`, patrón TenantsPage)          |
| sm    | 8px   | `sm`        | Gutter entre controles de la barra de filtros (`q-col-gutter-sm`); separación fila-1 ↔ fila-2 de filtros (`q-mb-sm`)        |
| md    | 16px  | `md`        | Padding de página (`q-pa-md`); separación barra de filtros ↔ tabla (`q-mb-md`); padding de `q-card-actions` de los diálogos |
| lg    | 24px  | `lg`        | Padding de las secciones de los diálogos de confirmación (`q-pa-lg` en la página de plataforma)                             |
| xl    | 32px  | `xl`        | Separación entre bloques del panel de plataforma                                                                            |
| 2xl   | 48px  | —           | Padding vertical de los empty states del listado (`padding: 48px 0`, ya existente)                                          |
| 3xl   | 64px  | —           | No se usa en esta fase                                                                                                      |

Excepciones (explícitas, permitidas):

- **Diálogos de confirmación** (copia local, transición de estado, promoción): `min-width: 420px; max-width: 95vw`. En `$q.screen.lt.sm` van `maximized`.
- **Ítem del dropdown del autocomplete:** alto mínimo **48px** (dos líneas: nombre + metadatos), target táctil del default de Quasar. No usar `dense` en las opciones.
- **Altura máxima del dropdown del autocomplete:** `320px` con scroll (`:popup-content-style="{ maxHeight: '320px' }"`); nunca lista infinita sin corte.
- **Ancho mínimo de la columna `Ejercicio`:** 220px (heredado de la 184).
- **Ancho de los selects de filtro:** `col-6 col-sm-3 col-md-2` (patrón `AlumnosPage`); el input de búsqueda `col-12 col-sm-6 col-md-5`.

---

## Typography

Geologica. Exactamente **4 tamaños** (24 / 20 / 16 / 14) y **2 pesos** (**400 regular**, **600 semibold**) — sin cambios respecto de la 184:

| Role    | Size | Weight | Line Height | Quasar mapping | Usage en esta fase                                                                                                  |
| ------- | ---- | ------ | ----------- | -------------- | ------------------------------------------------------------------------------------------------------------------- |
| Display | 24px | 600    | 1.2         | `text-h5`      | Título de página `Catálogo de ejercicios` · `Ejercicios de la plataforma`                                           |
| Heading | 20px | 600    | 1.3         | `text-h6`      | Títulos de los diálogos de confirmación; heading de los empty states                                                |
| Body    | 16px | 400    | 1.5         | `text-body1`   | Cuerpo de los diálogos de confirmación; body de los empty states                                                    |
| Label   | 14px | 400    | 1.4         | `text-body2`   | Celdas y encabezados de tabla, labels de filtros, texto de badges/chips, opciones del autocomplete, hints, tooltips |

**Sin 12px en esta fase.** No usar `text-caption`. Los tres overrides scoped obligatorios (Quasar tira por debajo del contrato) van en **cada componente nuevo con tabla, campo o lista de opciones** (`CatalogoPage.vue` ya los tiene; replicar en `PlatformExercisesPage.vue` y `EjercicioSelect.vue`):

```scss
:deep(.q-table thead th),
:deep(.q-table tbody td) {
  font-size: 14px;
} // Quasar default: 13px / 12px
:deep(.q-field__messages) {
  font-size: 14px;
  line-height: 1.4;
} // hints y errores, default 12px
:deep(.q-item__label--caption) {
  font-size: 14px;
  line-height: 1.4;
} // 2ª línea de las opciones del autocomplete, default 12px
```

El peso 500 no se introduce. Títulos de bloque = `text-body2 text-weight-semibold text-grey-8` (14/600).

---

## Color

Reparto 60/30/10 sobre la paleta cálida (idéntico a la 184):

| Role            | Value                                                                     | Usage                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dominant (60%)  | `#f2ede5` Marble Cream                                                    | Fondo de página, cuerpo de la tabla, `q-card` de los diálogos                                                                                                             |
| Secondary (30%) | `#e9e2d6` cream profundo (`.bg-summary-surface`, ya existe en `app.scss`) | Encabezado de la tabla, banda de encabezado de la ficha, pie de acciones de los diálogos                                                                                  |
| Accent (10%)    | `#96593a` Terracota (`--q-primary`)                                       | Ver lista reservada abajo                                                                                                                                                 |
| Destructive     | `#b34a4a` Warm red (`negative`)                                           | Botón de confirmación de **Desactivar**, banners de error, errores inline. Ninguna acción de esta fase borra datos: desactivar y promover son reversibles/no destructivos |

**Accent reservado exclusivamente para (lista cerrada — 7 elementos):**

1. CTA primaria de la página: **`Crear ejercicio`** (heredada de la 184).
2. Botón de guardado de la ficha (`Guardar ejercicio` / `Guardar cambios`, heredado).
3. Acción de fila **`Editar ejercicio`** sobre ejercicios propios (`flat dense color="primary"`, heredada).
4. **`Editar en mi gimnasio`** — botón del pie de la ficha en modo lectura de un global (nuevo, CAT-03).
5. **`Crear mi versión y editar`** — confirm de `CopiaLocalDialog` (nuevo, CAT-03).
6. **`Promover a global`** — acción de fila y confirm del panel de plataforma (nuevo, CAT-04).
7. Borde de campo enfocado + ítem activo del drawer + `q-header` del panel de plataforma (comportamiento existente).

**Nunca aplicar accent a:** badges de alcance, badge de estado, chips de taxonomía, selects de filtro, el toggle `Ver desactivados`, `Limpiar filtros`, `Cancelar`, `Ver ficha`, ni a los botones de transición de estado (`Publicar` / `Desactivar` / `Reactivar`) — esos usan color semántico, ver tabla.

Colores semánticos (de `quasar.variables.scss`; no cuentan dentro del 10% de accent):

| Semántico               | Hex       | Uso en esta fase                                                                                                                             | Contraste                       |
| ----------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `info` (Olive Stone)    | `#6b6459` | Badge de alcance **Global** (outline)                                                                                                        | heredado 184                    |
| `secondary` (Clay)      | `#7d5d42` | Badge de alcance **Propio** y **Tu versión** (sólido, texto blanco)                                                                          | 5.97:1 ✔ AA                     |
| `positive` (Warm green) | `#3b7249` | Badge de estado **Publicado** (sólido blanco); botones `Publicar` y `Reactivar`; Notify de éxito                                             | 5.69:1 sobre blanco ✔ AA        |
| `warning` (Dark gold)   | `#7d6520` | Badge de estado **Borrador** (outline); botón de fila `Desactivar` (flat); banner de módulo no disponible                                    | 4.85:1 outline sobre cream ✔ AA |
| `negative` (Warm red)   | `#b34a4a` | Botón de confirmación `Desactivar` dentro del diálogo; banners y errores inline (colisión de nombre en promoción)                            | heredado 184                    |
| `grey-7` / `grey-8`     | Quasar    | Badge de estado **Desactivado** (outline + ícono); texto de baja jerarquía: metadatos de las opciones del autocomplete, hints, `—`, tooltips | 5.39:1 sobre cream ✔ AA         |

**Regla de accesibilidad (dura):** ningún estado se comunica solo por color.

- Badge de estado = **forma (sólido vs outline) + ícono + texto**.
- Badge de alcance = **forma + ícono + texto** (heredado).
- El atenuado de las filas desactivadas (`opacity: 0.7`) es **refuerzo secundario**, nunca el único indicador: la columna `Estado` siempre lleva el badge con texto.
- Botones solo-ícono: prohibidos en esta fase. Todas las acciones de fila llevan texto.

---

## Copywriting Contract

Todo en español rioplatense (voseo). Los nombres de taxonomías se muestran tal cual el §2.3 del brief (`Barra EZ`, `TRX o similar`, `Peso corporal`). El nombre del ejercicio se interpola entre comillas latinas: `«Sentadilla búlgara»`.

### Superficie A — Listado del catálogo (`CatalogoPage.vue`)

| Element                                                       | Copy                                                                                                                                                                                                                        |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Título de página                                              | `Catálogo de ejercicios` (heredado)                                                                                                                                                                                         |
| **Primary CTA**                                               | `Crear ejercicio` (ícono `add`, `color="primary"`, heredado)                                                                                                                                                                |
| Label del buscador                                            | `Buscar por nombre o alias`                                                                                                                                                                                                 |
| Filtro categoría                                              | `Categoría`                                                                                                                                                                                                                 |
| Filtro grupo muscular                                         | `Grupo muscular`                                                                                                                                                                                                            |
| Hint del filtro grupo muscular (cuando hay categoría elegida) | `Refina dentro de la categoría elegida.`                                                                                                                                                                                    |
| Filtro equipamiento (múltiple)                                | `Equipamiento`                                                                                                                                                                                                              |
| Filtro patrón                                                 | `Patrón de movimiento`                                                                                                                                                                                                      |
| Opción "sin filtro" de todo select de filtro                  | `Todos`                                                                                                                                                                                                                     |
| Botón de limpieza                                             | `Limpiar filtros` (`flat color="grey-7"`, visible solo si hay al menos un filtro o texto activo)                                                                                                                            |
| Toggle de desactivados                                        | `Ver desactivados` (`q-toggle color="grey-7"`, apagado por default)                                                                                                                                                         |
| Columna nueva                                                 | `Estado`                                                                                                                                                                                                                    |
| Badge de estado                                               | `Publicado` · `Borrador` · `Desactivado`                                                                                                                                                                                    |
| Badge de alcance (variante nueva)                             | `Tu versión` (ejercicio propio con `copiedFromExerciseId`)                                                                                                                                                                  |
| Tooltip de `Tu versión`                                       | `Es la versión de tu gimnasio de un ejercicio global. El global no cambió.`                                                                                                                                                 |
| Acción de fila (propio)                                       | `Editar ejercicio` (heredada)                                                                                                                                                                                               |
| Acción de fila (global)                                       | `Ver ficha` (heredada — el camino a editar está adentro de la ficha, ver superficie C)                                                                                                                                      |
| Acción de fila (transición, según estado)                     | `Publicar` (borrador) · `Desactivar` (publicado) · `Reactivar` (desactivado). Solo en ejercicios propios (D-10).                                                                                                            |
| Tooltip de fila global sin transiciones                       | `Los estados del catálogo global los maneja la plataforma.`                                                                                                                                                                 |
| **Empty state — catálogo vacío** (sin texto ni filtros)       | heading `Todavía no hay ejercicios en el catálogo` + body `El catálogo global de la plataforma está en preparación. Mientras tanto, podés cargar los ejercicios propios de tu gimnasio.` + CTA `Crear ejercicio` (heredado) |
| **Empty state — sin resultados** (hay texto o filtros)        | heading `No encontramos ejercicios con esa búsqueda` + body `Probá con otro nombre o alias, o quitá alguno de los filtros.` + botón `Limpiar filtros`                                                                       |
| Empty state — solo desactivados ocultos                       | Al empty state de "sin resultados" se le suma la línea: `Hay ejercicios desactivados que coinciden. Prendé "Ver desactivados" para verlos.` (solo si el API informa que existen coincidencias desactivadas)                 |
| Error de carga / búsqueda                                     | `No pudimos cargar el catálogo. Reintentá.` + botón `Reintentar` (heredado; misma copy para la búsqueda fallida)                                                                                                            |
| Módulo no disponible                                          | `El módulo Gimnasio no está habilitado en este gimnasio.` (heredado)                                                                                                                                                        |

### Superficie B — Autocomplete de ejercicios (`EjercicioSelect.vue`)

| Element                                | Copy                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| Label (default, sobreescribible)       | `Ejercicio`                                                                                |
| Hint (default)                         | `Buscá por nombre o alias`                                                                 |
| Menos de 2 caracteres (`#no-option`)   | `Escribí al menos 2 letras para buscar.`                                                   |
| Sin resultados (`#no-option`)          | `No encontramos ningún ejercicio con ese nombre.`                                          |
| Error del lookup (`#no-option`)        | `No pudimos buscar en el catálogo. Probá de nuevo.`                                        |
| 2ª línea de la opción (metadatos)      | `{Grupo muscular} · {Patrón}` en `text-grey-8`                                             |
| 2ª línea cuando el match fue por alias | `Coincide con «{alias}» · {Grupo muscular}` (solo si el API devuelve el alias que matcheó) |

### Superficie C — Copia local (`CopiaLocalDialog.vue` + pie de la ficha en modo lectura)

| Element                                                                | Copy                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Botón que abre el flujo (pie de la ficha en modo lectura de un global) | `Editar en mi gimnasio` (`color="primary"`, ícono `content_copy`) — reemplaza al pie de solo `Cerrar` de la 184                                                                                                                                                                 |
| Banner de la ficha global (reescrito, D-06 ya no aplica)               | `Este ejercicio es del catálogo global. Si lo editás, creamos la versión de tu gimnasio y el global queda intacto.` (`q-banner` `warning`, ícono `content_copy`)                                                                                                                |
| Título del diálogo                                                     | `Vas a crear tu versión de este ejercicio`                                                                                                                                                                                                                                      |
| Cuerpo del diálogo                                                     | `Esto crea la versión de tu gimnasio a partir de «{nombre}»: se copian la ficha completa, los alias y las relaciones. El ejercicio global no cambia y el resto de los gimnasios lo sigue viendo igual. De acá en adelante, tu catálogo muestra tu versión en lugar del global.` |
| Confirmar                                                              | `Crear mi versión y editar` (`color="primary"`, `:loading`)                                                                                                                                                                                                                     |
| Cancelar                                                               | `Cancelar` (`flat`, sin color de marca)                                                                                                                                                                                                                                         |
| Éxito                                                                  | Notify `positive`: `Creamos tu versión de «{nombre}»` — y el diálogo de ficha se abre en modo edición sobre la copia                                                                                                                                                            |
| Error genérico                                                         | Notify `negative`: `No pudimos crear tu versión del ejercicio. Reintentá.`                                                                                                                                                                                                      |
| **Ya existe una copia desactivada** (409)                              | Banner `negative` dentro del diálogo: `Tu gimnasio ya tiene una versión de este ejercicio, pero está desactivada. Reactivala para volver a usarla.` + botón `Ver mi versión` (flat, `color="primary"`) que cierra el diálogo y abre la ficha de la copia                        |
| Ya existe una copia activa                                             | No es alcanzable por UI (el sombreado saca al global del listado). Si el API lo devuelve igual: banner `negative` `Tu gimnasio ya tiene una versión de este ejercicio.` + botón `Ver mi versión`.                                                                               |

### Superficies A y D — Transiciones de estado (`EjercicioEstadoDialog.vue`, compartido)

| Transición                    | Título                 | Cuerpo                                                                                                                                                                                                                                                                                                                                                                                                                | Confirmar                                                 | Éxito (Notify positive) |
| ----------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------- |
| `borrador → publicado`        | `Publicar ejercicio`   | `«{nombre}» pasa a estar disponible en el buscador y se puede sumar a rutinas nuevas.`                                                                                                                                                                                                                                                                                                                                | `Publicar` (`color="positive"`, ícono `check_circle`)     | `Ejercicio publicado`   |
| **`publicado → desactivado`** | `Desactivar ejercicio` | `«{nombre}» sale del buscador y no se va a poder sumar a rutinas nuevas. Las rutinas y los registros que ya lo usan se siguen viendo completos. Podés reactivarlo cuando quieras.` · **Línea extra si es una copia local:** `Tu gimnasio vuelve a ver el ejercicio global en el buscador.` · **Línea extra si es un global (panel de plataforma):** `Los gimnasios que tienen su propia versión no se ven afectados.` | `Desactivar` (`color="negative"`, ícono `visibility_off`) | `Ejercicio desactivado` |
| `desactivado → publicado`     | `Reactivar ejercicio`  | `«{nombre}» vuelve al buscador y se puede sumar a rutinas nuevas.` · **Línea extra si es una copia local:** `Tu gimnasio vuelve a ver tu versión en lugar del ejercicio global.`                                                                                                                                                                                                                                      | `Reactivar` (`color="positive"`, ícono `visibility`)      | `Ejercicio reactivado`  |
| Cancelar (las tres)           | —                      | —                                                                                                                                                                                                                                                                                                                                                                                                                     | `Cancelar` (`flat`)                                       | —                       |
| Error (las tres)              | —                      | Notify `negative`: `No pudimos cambiar el estado del ejercicio. Reintentá.` — el diálogo se cierra igual solo si el cambio fue exitoso                                                                                                                                                                                                                                                                                | —                                                         | —                       |

**Sin campo de motivo.** El `TenantStatusDialog` pide motivo porque la suspensión de un tenant va a un log de auditoría; acá no hay auditoría declarada en CONTEXT.md y no se inventa un campo obligatorio que frena al profe.

### Superficie D — Panel de plataforma (`PlatformExercisesPage.vue`)

| Element                                    | Copy                                                                                                                                                                                                                                                                             |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tarjeta en `PlatformHomePage`              | Título `Ejercicios` · bajada `Catálogo global y ejercicios de cada gimnasio` · botón `Ejercicios` (ícono `fitness_center`, `color="primary"`)                                                                                                                                    |
| Título de la página                        | `Ejercicios de la plataforma`                                                                                                                                                                                                                                                    |
| Buscador                                   | `Buscar por nombre o alias`                                                                                                                                                                                                                                                      |
| Filtro de alcance                          | `Alcance`: `Todos` / `Del catálogo global` / `De un gimnasio`                                                                                                                                                                                                                    |
| Filtro de gimnasio                         | `Gimnasio` (lista de tenants; opción `Todos`)                                                                                                                                                                                                                                    |
| Filtro de estado                           | `Estado`: `Todos` / `Publicado` / `Borrador` / `Desactivado`                                                                                                                                                                                                                     |
| Columna de pertenencia                     | `Gimnasio` — badge `Global` para los globales, nombre del tenant para los locales                                                                                                                                                                                                |
| Acción de fila (local)                     | `Promover a global` (`flat dense color="primary"`, ícono `public`)                                                                                                                                                                                                               |
| Acción bloqueada (copia local, D-07)       | Botón `Promover a global` `disable` + tooltip: `Es la versión de un gimnasio de un ejercicio global: no se promueve. Si querés adoptar estos cambios, editá el ejercicio global.`                                                                                                |
| Acciones de fila (global)                  | `Publicar` / `Desactivar` / `Reactivar` según estado (mismo diálogo compartido)                                                                                                                                                                                                  |
| Título del diálogo de promoción            | `Promover a global`                                                                                                                                                                                                                                                              |
| Cuerpo del diálogo de promoción            | `«{nombre}» pasa al catálogo global y queda visible para todos los gimnasios. Conserva su identificador, así que las rutinas y los registros de {gimnasio} lo siguen resolviendo igual. El estado no cambia: sigue en {estado}.`                                                 |
| Confirmar promoción                        | `Promover a global` (`color="primary"`, `:loading`)                                                                                                                                                                                                                              |
| Éxito                                      | Notify `positive`: `«{nombre}» ahora es un ejercicio global`                                                                                                                                                                                                                     |
| **Error — colisión de nombre (409, D-06)** | Banner `negative` **dentro del diálogo** (no Notify: el super-owner necesita el texto mientras actúa): `Ya existe un ejercicio global llamado «{nombre}». Renombrá el ejercicio del gimnasio y volvé a intentar.` El diálogo queda abierto y el botón vuelve a estar disponible. |
| Error — copia no promovible (409/422)      | Mismo banner: `Este ejercicio es la versión de un gimnasio de un ejercicio global y no se puede promover.`                                                                                                                                                                       |
| Error genérico                             | Notify `negative`: `No pudimos promover el ejercicio. Reintentá.`                                                                                                                                                                                                                |
| Empty state del panel                      | heading `No hay ejercicios que coincidan` + body `Cambiá la búsqueda o los filtros.`                                                                                                                                                                                             |
| Error de carga del panel                   | `No pudimos cargar los ejercicios. Reintentá.` + botón `Reintentar`                                                                                                                                                                                                              |

### Destructive confirmations (resumen para el checker)

| Acción                          | ¿Destructiva?                                     | Confirmación                                                                                                |
| ------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `Desactivar ejercicio`          | Reversible, alto impacto                          | Diálogo obligatorio con el cuerpo de arriba; confirm en `negative`. **Nunca acción directa desde la fila.** |
| `Promover a global`             | Irreversible por UI                               | Diálogo obligatorio; confirm en `primary`. La copy dice explícitamente que conserva el identificador.       |
| `Crear mi versión y editar`     | No destructiva, pero cambia lo que ve el gimnasio | Diálogo obligatorio (D-03, "nada silencioso").                                                              |
| `Publicar` / `Reactivar`        | Reversible, bajo impacto                          | Diálogo de confirmación simple (misma mecánica, cuerpo corto) — consistencia sobre atajos.                  |
| `Descartar cambios de la ficha` | —                                                 | Heredado de la 184 (`Si salís ahora, se pierden los datos cargados.`), sin cambios.                         |

**No existe ninguna acción de borrado en esta fase** (CAT-05: se desactiva, no se borra). Si el executor se encuentra escribiendo la palabra "Eliminar" en esta fase, está fuera de contrato.

---

## Layout & Interaction Contract (phase-specific)

### A. Listado del catálogo — `CatalogoPage.vue` (extensión)

**Barra de filtros** (entre el header y la tabla, patrón `AlumnosPage`):

- **Fila 1** (`row q-col-gutter-sm q-mb-sm items-end`): `q-input` de búsqueda (`col-12 col-sm-6 col-md-5`, `dense outlined clearable debounce="300"`, `#prepend` ícono `search`) + `q-toggle` `Ver desactivados` (`col-6 col-sm-3`, `color="grey-7"`) + `Limpiar filtros` (`flat`, alineado a la derecha con `q-space`, visible solo si hay filtros activos).
- **Fila 2** (`row q-col-gutter-sm q-mb-md items-end`): 4 selects `dense outlined emit-value map-options clearable` — `Categoría` (7), `Grupo muscular` (14), `Equipamiento` (25, `multiple use-chips`), `Patrón de movimiento` (9). Cada uno `col-6 col-sm-3 col-md-2`.
- **Sin botón "Buscar":** todo cambio de texto (debounce 300ms) o de filtro dispara el request. Filtros combinables en **AND** (D-14).
- **Refinamiento categoría → grupo muscular (D-14):** con `Categoría` elegida, las opciones de `Grupo muscular` se restringen a los grupos que mapean a esa categoría (mapeo fijo D-10 de la 184, ya espejado en `gym-taxonomies.ts`). Si al cambiar la categoría el grupo seleccionado deja de pertenecer, se limpia el grupo automáticamente. Con `Categoría` vacía se ofrecen los 14.
- **Búsqueda mínima:** cero caracteres = sin filtro de texto (el listado completo). No hay mínimo de 2 caracteres acá (a diferencia del autocomplete): el catálogo es chico y la tabla ya está paginada.
- **Reset de paginación:** cualquier cambio de texto, filtro o toggle **resetea `page` a 1** y conserva `rowsPerPage`. Un cambio de página NO resetea filtros.
- **Estado durante la búsqueda:** `q-table :loading` (overlay de Quasar). Las filas anteriores quedan visibles debajo del overlay — nunca se blanquea la tabla mientras se teclea.
- **Orden de resultados:** el ranking lo calcula el API (D-13: canónico > alias, prefijo > substring, luego alfabético). **La UI no reordena y la tabla no ofrece `sortable` en la columna `Ejercicio` mientras haya término de búsqueda** (rompería el ranking). Las columnas se dejan sin `sortable` en esta fase.

**Tabla — columnas (orden final):**

| #   | Columna           | Alineación | Contenido                                                   | Cambio vs 184   |
| --- | ----------------- | ---------- | ----------------------------------------------------------- | --------------- |
| 1   | `Ejercicio`       | left       | Nombre canónico (Label 14/400), min-width 220px             | —               |
| 2   | `Alcance`         | left       | `EjercicioScopeBadge` (Global / Propio / **Tu versión**)    | variante nueva  |
| 3   | `Estado`          | left       | `EjercicioStatusBadge` (Publicado / Borrador / Desactivado) | **nueva**       |
| 4   | `Categoría`       | left       | Chip derivado `outline color="grey-7"` + `lock` + tooltip   | —               |
| 5   | `Grupo principal` | left       | Label de la taxonomía                                       | —               |
| 6   | `Patrón`          | left       | Label de la taxonomía                                       | —               |
| 7   | `Dificultad`      | left       | `Principiante` / `Intermedio` / `Avanzado`                  | —               |
| 8   | `Acciones`        | right      | Máximo **2 botones** con texto                              | acciones nuevas |

- **Responsive:** en `$q.screen.lt.lg` se ocultan `Categoría` y `Dificultad` vía `visible-columns` (siguen en la ficha; la categoría además vive como filtro). Nunca se oculta `Estado` ni `Alcance`.
- **Columna `Acciones` — regla determinista (máximo 2 botones, siempre con texto):**
  - Ejercicio **propio**: `Editar ejercicio` (accent) + **una** transición según el estado actual (`Publicar` | `Desactivar` | `Reactivar`). Nunca las tres.
  - Ejercicio **global**: solo `Ver ficha` (flat, sin color). Nada de botones deshabilitados: el motivo se explica con `q-tooltip` sobre la celda solo si el executor decide mostrar el ícono informativo; la vía de acción está dentro de la ficha.
  - Ejercicio propio en estado `desactivado`: `Editar ejercicio` sigue disponible + `Reactivar`.
- **Filas desactivadas:** clase `row-desactivado { opacity: 0.7 }` (refuerzo secundario del badge, nunca único indicador). Solo aparecen con el toggle `Ver desactivados` prendido.
- **Sombreado (D-01):** lo resuelve el API. La UI **no filtra nada del lado del cliente**; si aparece un duplicado global+copia, es un bug del endpoint, no se parchea en el componente.

### B. Autocomplete reutilizable — `EjercicioSelect.vue`

Contrato **congelado para la fase 187** (rutinas lo consume sin tocarlo):

- **Props:** `modelValue: number | null`, `label?: string` (default `Ejercicio`), `hint?: string`, `disable?: boolean`, `multiple?: boolean` (default `false`), `excludeIds?: number[]` (para excluir el ejercicio actual o los ya elegidos).
- **Emits:** `update:modelValue` con `number | null` (o `number[]` en modo múltiple). **El consumidor nunca ve el shape de la opción** (regla de `ReferrerSelect`).
- **Expone:** `reset()` vía `defineExpose`.
- **QSelect:** `dense outlined clearable use-input input-debounce="300"` + `:loading` + `@filter`.
- **Mínimo 2 caracteres** antes de pegarle al backend (regla de `ReferrerSelect`: menos caracteres = medio catálogo). Con menos, la lista queda vacía con el mensaje declarado.
- **`limit` 20 resultados**, sin scroll infinito. El endpoint es el mismo del buscador (D-15b) y **excluye `borrador` y `desactivado`** (D-14, Definición 2).
- **Opción de la lista (dos líneas, `q-item` de 48px):** línea 1 = nombre canónico (Label 14/400) + `EjercicioScopeBadge`; línea 2 = metadatos en `text-grey-8` 14px (`{Grupo muscular} · {Patrón}`, o `Coincide con «{alias}» · {Grupo muscular}` cuando el match vino por alias). **Fallback:** si el endpoint no devuelve el alias que matcheó, se omite esa parte — nunca se renderiza un placeholder vacío ni se adivina el alias en el cliente.
- **Errores del lookup:** se loguean con `createLogger` y la lista queda vacía con el mensaje de error en `#no-option`. Jamás un Notify por tecla.
- **`cleanup()`** en el composable de API (convención del proyecto: sin `onUnmounted` adentro del composable).

### C. Copia local — `CopiaLocalDialog.vue` + ficha en modo lectura

Flujo completo, sin pasos silenciosos (D-03):

1. En el listado, un ejercicio **global** ofrece `Ver ficha` → `EjercicioFichaDialog` en `mode: 'view'`.
2. El banner `warning` de la ficha cambia de "es de solo lectura, creá un ejercicio propio" (184) a la copy nueva, que anticipa el efecto de editar.
3. El pie de la ficha en modo lectura pasa de `Cerrar` solo a: `Cerrar` (flat) + **`Editar en mi gimnasio`** (accent, ícono `content_copy`).
4. Ese botón **no ejecuta nada**: abre `CopiaLocalDialog` (persistente, 420px). Confirmar dispara el POST de copia.
5. Éxito → se cierra el diálogo de confirmación, la ficha se **rehidrata con la copia** y pasa a `mode: 'edit'` (el profe queda editando, sin volver al listado), Notify `positive`.
6. Cerrar la ficha después de eso refresca el listado en la página actual (`onFichaSaved`, patrón existente): la copia aparece con badge `Tu versión` y el global desaparece por sombreado.
7. Botón de confirmación con `:loading` durante el request; `Cancelar` deshabilitado mientras vuela.
8. El 409 de copia preexistente se resuelve **dentro del diálogo** con el banner + `Ver mi versión` (nunca un Notify que deje al usuario sin salida).

### D. Panel de plataforma — `PlatformExercisesPage.vue`

- Ruta `/plataforma/ejercicios`, **fuera del layout del admin de tenant**: `q-layout` propio con `q-header bg-primary text-white`, `q-btn flat round icon="arrow_back" to="/plataforma"` y `q-toolbar-title` `Ejercicios` — copia exacta del molde de `TenantsPage.vue`. La guarda de sesión de plataforma la da `router/index.ts` por `startsWith('/plataforma')` (patrón existente, sin `meta.allowedRoles` de tenant).
- Tarjeta de acceso nueva en `PlatformHomePage.vue`, tercera del grid (`col-12 col-md-6`), con la copy declarada.
- `q-page.q-pa-lg` + barra de filtros (misma mecánica que la superficie A: búsqueda con debounce 300, selects `Alcance` / `Gimnasio` / `Estado`) + `q-table` paginada server-side.
- **Este panel no aplica sombreado ni oculta desactivados por default:** el super-owner necesita ver todo el universo. El filtro `Estado` arranca en `Todos`.
- Columna `Acciones`: máximo 2 botones (`Promover a global` en locales, la transición que corresponda en globales). El botón deshabilitado de promoción **sí** se renderiza (con tooltip) porque el super-owner necesita entender por qué una fila no se puede promover — es la excepción explícita a la regla de "nada de controles muertos" de la 184.
- Nada de esta página aparece jamás en el admin de un tenant (D-05).

### Cambios acotados a componentes de la 184

| Componente                 | Cambio                                                                                                                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EjercicioScopeBadge.vue`  | Se suma la variante `copia` → sólido `secondary` + ícono `content_copy` + texto `Tu versión` + tooltip. El mapa sigue siendo un único `Record`.                                                                                                         |
| `EjercicioFichaDialog.vue` | (1) El chip de estado del encabezado deja de estar hardcodeado en `Publicado` y pasa a usar `EjercicioStatusBadge` con el status real. (2) Banner `warning` de global reescrito. (3) Pie de modo lectura con `Editar en mi gimnasio`. Nada más se toca. |
| `CatalogoPage.vue`         | Barra de filtros, columna `Estado`, acciones de transición, toggle de desactivados, empty state de "sin resultados", montaje de los diálogos nuevos.                                                                                                    |
| `useGymCatalogApi.ts`      | Métodos nuevos (`searchExercises`, `changeStatus`, `createLocalCopy`); `q` deja de ser "lookup por nombre" y pasa a ser el término del buscador (nombre + alias). Docblock actualizado.                                                                 |
| `gym-taxonomies.ts`        | Se suma el mapa inverso categoría → grupos musculares para el refinamiento del filtro (mismo docblock de espejo 1:1 del API).                                                                                                                           |

---

## Component Inventory (executor reference)

| Componente                           | Ubicación                    | Acción                                                                                        |
| ------------------------------------ | ---------------------------- | --------------------------------------------------------------------------------------------- |
| `CatalogoPage.vue`                   | `src/pages/gimnasio/`        | **Editar** — barra de filtros, columna `Estado`, acciones de transición, empty state nuevo    |
| `EjercicioSelect.vue`                | `src/components/gimnasio/`   | **Nuevo** — autocomplete reutilizable (contrato congelado para la 187)                        |
| `CopiaLocalDialog.vue`               | `src/components/gimnasio/`   | **Nuevo** — confirmación de copia local + estados de 409                                      |
| `EjercicioEstadoDialog.vue`          | `src/components/gimnasio/`   | **Nuevo** — confirmación de las 3 transiciones, compartido tenant ↔ plataforma                |
| `EjercicioStatusBadge.vue`           | `src/components/gimnasio/`   | **Nuevo** — badge de estado (mapa cerrado forma+ícono+texto, patrón `EjercicioScopeBadge`)    |
| `EjercicioScopeBadge.vue`            | `src/components/gimnasio/`   | **Editar** — variante `copia` (`Tu versión`)                                                  |
| `EjercicioFichaDialog.vue`           | `src/components/gimnasio/`   | **Editar** — chip de estado real, banner reescrito, pie con `Editar en mi gimnasio`           |
| `PlatformExercisesPage.vue`          | `src/pages/plataforma/`      | **Nuevo** — listado global/local de toda la plataforma + promoción + transiciones             |
| `PromoverGlobalDialog.vue`           | `src/components/plataforma/` | **Nuevo** — confirmación de promoción + banner de colisión de nombre                          |
| `PlatformHomePage.vue`               | `src/pages/plataforma/`      | **Editar** — tarjeta `Ejercicios`                                                             |
| `useGymCatalogApi.ts`                | `src/composables/`           | **Editar** — búsqueda, transiciones de estado, copia local                                    |
| `usePlatformExercisesApi.ts`         | `src/composables/`           | **Nuevo** — contra `boot/platform-axios` (patrón de las APIs de plataforma de la 182/183)     |
| `gym-taxonomies.ts`                  | `src/constants/`             | **Editar** — mapa categoría → grupos musculares para el refinamiento del filtro               |
| `routes.ts`                          | `src/router/`                | **Editar** — ruta `/plataforma/ejercicios` (mismo criterio que las demás rutas de plataforma) |
| `app.scss` / `quasar.variables.scss` | `src/css/`                   | **Sin cambios** — cero tokens, colores o fuentes nuevas                                       |

**Cero hex hardcodeados en componentes. Cero dependencias nuevas** (regla del proyecto: no se instala nada sin preguntar).

---

## Registry Safety

| Registry                           | Blocks Used | Safety Gate                                                          |
| ---------------------------------- | ----------- | -------------------------------------------------------------------- |
| n/a (Quasar Material, first-party) | ninguno     | not applicable — el proyecto no usa shadcn ni registries de terceros |

Sin registries de terceros declarados. Gate de shadcn: **no aplica** (Vue 3/Quasar, no React/Next). Vetting: N/A — no hay bloques externos que revisar.

---

## Decisiones discrecionales de este contrato (no venían de CONTEXT.md)

| #   | Decisión                                                                                                          | Razón                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | El camino a editar un global vive **dentro de la ficha** (`Editar en mi gimnasio`), no como segundo botón de fila | Mantiene la columna `Acciones` en 2 botones y le da al profe el contexto completo del ejercicio antes de decidir crear su versión                            |
| 2   | Badge de alcance con tercera variante `Tu versión` en lugar de un chip aparte                                     | El sombreado (D-01) es la pieza central de UX: el profe tiene que entender de un vistazo por qué el global "desapareció"                                     |
| 3   | Diálogo de confirmación también para `Publicar` y `Reactivar` (no solo para `Desactivar`)                         | Consistencia: tres transiciones, una sola mecánica y un solo componente. El costo de un click extra es menor que el de dos patrones distintos                |
| 4   | Sin campo `Motivo` en las transiciones (a diferencia de `TenantStatusDialog`)                                     | Aquel motivo alimenta el log de auditoría de tenants; acá CONTEXT.md no pide auditoría y un campo obligatorio inventado frena al profe                       |
| 5   | Colisión de nombre en la promoción como **banner dentro del diálogo**, no Notify                                  | D-06 pide "mensaje claro" y el super-owner necesita leer el nombre mientras renombra; un toast que se va en 3s es exactamente el modo de fallar              |
| 6   | Columna `Estado` en posición 3 + ocultar `Categoría`/`Dificultad` en `<lg`                                        | Sumar una 8ª columna sin regla responsive reventaba el ancho; ambas siguen accesibles (categoría además como filtro)                                         |
| 7   | Toggle `Ver desactivados` (apagado por default) en vez de un select `Estado` en el listado del tenant             | Discreción declarada en CONTEXT.md. En un tenant los propios nacen `publicado` (D-04 de la 184): un select de 4 valores para un universo binario es ruido    |
| 8   | Botón de promoción **deshabilitado con tooltip** en las copias locales (excepción a la regla de la 184)           | El super-owner opera sobre filas ajenas y necesita saber por qué una no se puede promover (D-07); ocultarlo lo dejaría adivinando                            |
| 9   | Mínimo 2 caracteres en el autocomplete, cero en el buscador del listado                                           | El autocomplete es un dropdown de 20 ítems dentro de un formulario (regla de `ReferrerSelect`); el listado ya está paginado y mostrar todo es su estado base |
| 10  | La UI nunca reordena resultados ni filtra sombreados en el cliente                                                | D-01/D-13 son contrato del API; duplicar la lógica en el front garantiza que se desincronicen                                                                |
| 11  | Panel de plataforma como página nueva `/plataforma/ejercicios` + tarjeta en la home                               | D-05 exige superficie exclusiva del super-owner; el molde de `TenantsPage` ya resuelve layout, guard y header                                                |
| 12  | 2ª línea del autocomplete con el alias que matcheó, con fallback declarado si el API no lo devuelve               | Cierra el loop de D-12 (buscar por alias) sin bloquear la fase si el endpoint no expone el dato                                                              |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending

---

## Addendum post-checker (no bloqueante, incorporado)

- **Foco visual primario — Superficie A (CatalogoPage extendida):** sigue siendo el CTA `Crear ejercicio` + la columna `Ejercicio`; la barra de búsqueda/filtros y la columna `Estado` son secundarias (fondo neutro, sin accent).
- **Foco visual primario — Superficie D (PlatformExercisesPage.vue):** la columna `Ejercicio` (nombre canónico, 16px/600) es el foco; `Promover a global` es el único accent de la pantalla.
- **Accesibilidad de botones de fila:** `Publicar` / `Desactivar` / `Reactivar` / `Promover a global` llevan `aria-label` con el nombre del ejercicio (`aria-label="Publicar {nombre}"`).
