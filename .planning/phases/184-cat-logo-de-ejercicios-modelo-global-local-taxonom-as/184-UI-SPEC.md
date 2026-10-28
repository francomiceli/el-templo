---
phase: 184
slug: cat-logo-de-ejercicios-modelo-global-local-taxonom-as
status: draft
shadcn_initialized: false
preset: none
created: 2026-08-31
---

# Phase 184 — UI Design Contract

> Contrato visual y de interacción de la sección **Catálogo** del módulo Gimnasio en `el-templo-admin`.
> Generado por gsd-ui-researcher, verificado por gsd-ui-checker.
> Toda la copy de cara al usuario va en **español rioplatense (voseo)**. Aplican las reglas de `CLAUDE.md` (nada de `console.log` → `createLogger`; sin `any`).
> Alcance: listado plano paginado (globales + propios) + ficha de alta/edición de ejercicios propios (D-07). **NO** entra buscador ni filtros por taxonomías (CAT-07, fase 185).

---

## Design System

| Property          | Value                                                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool              | none (Quasar Material — proyecto Vue 3/Quasar, no React/Next/Vite-shadcn; el gate de shadcn no aplica)                                                                          |
| Preset            | not applicable                                                                                                                                                                  |
| Component library | Quasar v2 (`q-page`, `q-table`, `q-dialog`, `q-card`, `q-input`, `q-select`, `q-btn`, `q-badge`, `q-chip`, `q-banner`, `q-tooltip`, `q-separator`, `q-inner-loading`, `Notify`) |
| Icon library      | Material Icons (`extras: ['material-icons']` en `quasar.config.js`)                                                                                                             |
| Font              | Geologica self-hosted (`@fontsource/geologica`, pesos 400/500/600). Fuente de verdad: `el-templo-admin/src/css/app.scss`                                                        |

**Paleta — fuente de verdad:** `el-templo-admin/src/css/quasar.variables.scss` (cálida, **sin azul**). Prohibido introducir hex nuevos en componentes: usar clases de marca de Quasar (`text-primary`, `bg-secondary`, `color="info"`, etc.) que leen las vars SCSS.

**Marcador de staging:** `body.staging-env` recolorea `--q-primary` a azul solo en staging. Nunca hardcodear la terracota en un componente, o el marcador deja de funcionar.

**Reutilización obligatoria (esta es una sección nueva dentro de una app madura, no un diseño desde cero):**

| Patrón existente                                 | Archivo de referencia                                                                                     | Qué se copia                                                                                                                                       |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Página de ABM con header + CTA + QTable paginada | `src/pages/ExercisesPage.vue`                                                                             | Estructura `q-page.q-pa-md` → header `row items-center q-mb-md` con `text-h5` + `q-space` + CTA, y `q-table` con `v-model:pagination` + `@request` |
| Paginación server-side                           | `src/pages/AlumnosPage.vue` (`onTableRequest`, `tablePagination`)                                         | Handler y shape de paginación                                                                                                                      |
| Diálogo de formulario                            | `src/pages/ExercisesPage.vue` (Crear Ejercicio) / `src/components/PlanFormDialog.vue`                     | `q-dialog` + `q-card` con secciones y `q-separator`                                                                                                |
| Nav declarativo + RBAC por sección               | `src/config/templo-config.ts` (`NAV_MODEL`, sets de roles) + `src/router/routes.ts` (`meta.allowedRoles`) | Nueva categoría y set de roles siguiendo el mismo modelo                                                                                           |
| Badge de estado compartido                       | `src/composables/useStatusBadge.ts`                                                                       | Mapeo valor → `{ color, label }` en un solo lugar                                                                                                  |
| Feedback                                         | `Notify.create({ type: 'positive' \| 'negative' \| 'warning', message })`                                 | Toasts de éxito/error                                                                                                                              |
| Constantes espejadas del API con docblock        | `src/tv/timer.ts`                                                                                         | Docblock que declara "port 1:1" y obliga a cambiar los dos lados                                                                                   |

---

## Spacing Scale

Base 4px (utilidades `q-pa-*` / `q-gutter-*` / `q-mb-*` / `q-col-gutter-*` de Quasar). Valores declarados (todos múltiplos de 4):

| Token | Value | Quasar util | Usage en esta fase                                                                     |
| ----- | ----- | ----------- | -------------------------------------------------------------------------------------- |
| xs    | 4px   | `xs`        | Gap ícono↔texto, separación entre chips de equipamiento                                |
| sm    | 8px   | `sm`        | Gutter entre campos de una misma fila del form (`q-col-gutter-sm`)                     |
| md    | 16px  | `md`        | Padding de página (`q-pa-md`), separación entre bloques del form, header↔tabla         |
| lg    | 24px  | `lg`        | Padding de las secciones del diálogo, separación entre fieldsets de la ficha           |
| xl    | 32px  | `xl`        | Corte mayor dentro del diálogo (bloque de relaciones), padding lateral del empty state |
| 2xl   | 48px  | —           | Padding vertical del empty state del listado                                           |
| 3xl   | 64px  | —           | No se usa en esta fase                                                                 |

Excepciones (explícitas, permitidas):

- **Ancho del diálogo de ficha:** `max-width: 720px`, `width: 90vw`, `max-height: 90vh` con cuerpo scrolleable. En `$q.screen.lt.md` el diálogo va `maximized`.
- **Alto mínimo de fila de tabla:** default de Quasar (48px); no se comprime a `dense` — el listado tiene chips y acciones.
- **Botonera del diálogo:** sticky al pie (`q-card-actions` con `q-pa-md`), siempre visible aunque el cuerpo scrollee.
- **Ancho mínimo de columna "Nombre canónico":** 220px, para que el nombre no se parta en dos líneas en el 90% de los casos.

---

## Typography

Geologica. Exactamente **4 tamaños** (24 / 20 / 16 / 14) y **2 pesos** (**400 regular**, **600 semibold**):

| Role    | Size | Weight | Line Height | Quasar mapping | Usage                                                                                                                           |
| ------- | ---- | ------ | ----------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Display | 24px | 600    | 1.2         | `text-h5`      | Título de página `Catálogo de ejercicios`                                                                                       |
| Heading | 20px | 600    | 1.3         | `text-h6`      | Título del diálogo de ficha, heading del empty state                                                                            |
| Body    | 16px | 400    | 1.5         | `text-body1`   | Labels de campo, valores del form, copy de banners, cuerpo del empty state                                                      |
| Label   | 14px | 400    | 1.4         | `text-body2`   | Celdas y encabezados de la tabla, hints de campo, mensajes de error inline, texto de badges/chips, títulos de fieldset (en 600) |

**Sin 12px en esta fase.** No usar `text-caption` (12px). Dos overrides scoped obligatorios en `CatalogoPage.vue` / `EjercicioFichaDialog.vue` porque Quasar tira por debajo del contrato:

```scss
:deep(.q-table thead th),
:deep(.q-table tbody td) {
  font-size: 14px;
} // Quasar default: 13px / 12px
:deep(.q-field__messages) {
  font-size: 14px;
  line-height: 1.4;
} // hints y errores, default 12px
```

El peso 500 está importado pero el contrato estandariza 400/600: no introducir 500 nuevo. `text-subtitle2` (que Quasar renderiza en 500) no se usa; los títulos de fieldset son `text-body2 text-weight-semibold` (14/600) en `text-grey-8`.

---

## Color

Reparto 60/30/10 sobre la paleta cálida:

| Role            | Value                                                                     | Usage                                                                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dominant (60%)  | `#f2ede5` Marble Cream                                                    | Fondo de página, `q-card` del diálogo, cuerpo de la tabla                                                                                                                                        |
| Secondary (30%) | `#e9e2d6` cream profundo (`.bg-summary-surface`, ya existe en `app.scss`) | Fila de encabezados de la tabla, banda de encabezado del diálogo de ficha, pie de acciones sticky del diálogo                                                                                    |
| Accent (10%)    | `#96593a` Terracota (`--q-primary`)                                       | Ver lista reservada abajo                                                                                                                                                                        |
| Destructive     | `#b34a4a` Warm red (`negative`)                                           | Mensajes de error de validación, banner de error del diálogo, botón `Salir` del confirm de descarte. **No hay acciones destructivas de datos en esta fase** (D-05: sin borrado ni desactivación) |

**Accent reservado exclusivamente para:**

- CTA primaria de la página: **`Crear ejercicio`** (`color="primary"`, con ícono `add`).
- Botón primario de guardado del diálogo: **`Guardar ejercicio`** / **`Guardar cambios`**.
- Acción de fila **`Editar ejercicio`** (botón `flat dense color="primary"`) en ejercicios propios.
- Borde de campo enfocado (comportamiento default de Quasar sobre `--q-primary`).
- Ítem activo del drawer (comportamiento existente del `AdminLayout`, sin cambios).

**Nunca aplicar accent a:** badges de alcance, chips de taxonomía, el chip de categoría derivada, filas de la tabla, encabezados de sección, ni al botón `Cancelar`.

Colores semánticos (de `quasar.variables.scss`, no cuentan dentro del 10% de accent):

| Semántico               | Hex       | Uso en esta fase                                                                      |
| ----------------------- | --------- | ------------------------------------------------------------------------------------- |
| `info` (Olive Stone)    | `#6b6459` | Badge **Global** (outline)                                                            |
| `secondary` (Clay)      | `#7d5d42` | Badge **Propio** (sólido, texto blanco — contraste 5.97:1 ✔ AA)                       |
| `warning` (Dark gold)   | `#7d6520` | Aviso "no editable" en la ficha de un ejercicio global; aviso de módulo no disponible |
| `positive` (Warm green) | `#3b7249` | Notify de éxito al crear/guardar                                                      |
| `negative` (Warm red)   | `#b34a4a` | Errores de validación y de guardado                                                   |
| `grey-7/grey-8`         | Quasar    | Texto de baja jerarquía: hints, chip de categoría derivada, valores vacíos (`—`)      |

**Regla de accesibilidad:** ningún estado se comunica solo por color. Los badges de alcance y el chip de categoría siempre llevan texto; los globales además llevan ícono (`public` / `storefront`).

---

## Copywriting Contract

Todo en español (voseo). Los nombres de las taxonomías se muestran tal cual el §2.3 del brief, en _sentence case_ con nombres propios respetados (`Barra EZ`, `TRX o similar`, `Peso corporal`).

| Element                                                                             | Copy                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ítem del drawer                                                                     | Categoría `Gimnasio` → ítem `Catálogo` (ícono `menu_book`)                                                                                                                                                                                                                                                                                        |
| Título de página                                                                    | `Catálogo de ejercicios`                                                                                                                                                                                                                                                                                                                          |
| **Primary CTA**                                                                     | `Crear ejercicio` (ícono `add`, `color="primary"`)                                                                                                                                                                                                                                                                                                |
| Acción de fila (propio)                                                             | `Editar ejercicio`                                                                                                                                                                                                                                                                                                                                |
| Acción de fila (global)                                                             | `Ver ficha`                                                                                                                                                                                                                                                                                                                                       |
| Tooltip de edición bloqueada (global, D-06)                                         | `Los ejercicios del catálogo global no se editan desde tu gimnasio.`                                                                                                                                                                                                                                                                              |
| Aviso dentro de la ficha global (banner `warning`)                                  | `Estás viendo un ejercicio del catálogo global: es de solo lectura. Si necesitás una versión distinta, creá un ejercicio propio.`                                                                                                                                                                                                                 |
| Título del diálogo (alta)                                                           | `Nuevo ejercicio`                                                                                                                                                                                                                                                                                                                                 |
| Título del diálogo (edición)                                                        | `Editar ejercicio`                                                                                                                                                                                                                                                                                                                                |
| Título del diálogo (lectura)                                                        | `Ficha del ejercicio`                                                                                                                                                                                                                                                                                                                             |
| Botón guardar (alta)                                                                | `Guardar ejercicio`                                                                                                                                                                                                                                                                                                                               |
| Botón guardar (edición)                                                             | `Guardar cambios`                                                                                                                                                                                                                                                                                                                                 |
| Botón secundario                                                                    | `Cancelar` (`flat`, sin color de marca) · en modo lectura: `Cerrar`                                                                                                                                                                                                                                                                               |
| **Empty state heading**                                                             | `Todavía no hay ejercicios en el catálogo`                                                                                                                                                                                                                                                                                                        |
| **Empty state body**                                                                | `El catálogo global de la plataforma está en preparación. Mientras tanto, podés cargar los ejercicios propios de tu gimnasio.` + CTA `Crear ejercicio`                                                                                                                                                                                            |
| Error de carga del listado                                                          | `No pudimos cargar el catálogo. Reintentá.` + botón `Reintentar`                                                                                                                                                                                                                                                                                  |
| **Error state (guardado)**                                                          | Banner `negative` arriba del cuerpo del diálogo: `Revisá los campos marcados.` — los detalles por campo se muestran inline debajo de cada campo. Notify `negative` para fallos no atribuibles a un campo: `No se pudo guardar el ejercicio. Reintentá.`                                                                                           |
| Error — valor fuera de lista cerrada (criterio de éxito 3)                          | `"{valor}" no es un {grupo muscular / equipamiento / patrón de movimiento} válido. Elegí uno de la lista.`                                                                                                                                                                                                                                        |
| Error — nombre duplicado (409)                                                      | `Ya tenés un ejercicio con ese nombre. Cambiá el nombre canónico o sumá esa variante como alias del ejercicio que ya existe.`                                                                                                                                                                                                                     |
| Error — requerido (nombre)                                                          | `Escribí el nombre canónico del ejercicio.`                                                                                                                                                                                                                                                                                                       |
| Error — requerido (select simple)                                                   | `Elegí una opción.`                                                                                                                                                                                                                                                                                                                               |
| Error — requerido (equipamiento, multi)                                             | `Elegí al menos un equipamiento.`                                                                                                                                                                                                                                                                                                                 |
| Error — intento de escritura sobre un global (403/409 del API, D-06)                | `Este ejercicio es del catálogo global y no se puede editar desde tu gimnasio.`                                                                                                                                                                                                                                                                   |
| Éxito (alta)                                                                        | Notify `positive`: `Ejercicio creado`                                                                                                                                                                                                                                                                                                             |
| Éxito (edición)                                                                     | Notify `positive`: `Cambios guardados`                                                                                                                                                                                                                                                                                                            |
| Tooltip de categoría derivada (criterio de éxito 4)                                 | `Se deriva del grupo muscular principal. No se edita a mano.`                                                                                                                                                                                                                                                                                     |
| Hint de textos largos opcionales (D-03 + §2.5)                                      | `Opcional, pero es lo único que el alumno tiene para saber cómo se hace el ejercicio.`                                                                                                                                                                                                                                                            |
| Hint de alias                                                                       | `Otros nombres con los que se conoce el ejercicio. Sirven para encontrarlo más adelante.`                                                                                                                                                                                                                                                         |
| Módulo no disponible (acceso por URL directa con `module.gimnasio.enabled = false`) | Banner `warning` a página completa: `El módulo Gimnasio no está habilitado en este gimnasio.`                                                                                                                                                                                                                                                     |
| **Destructive confirmation**                                                        | **Descartar cambios de la ficha:** `Si salís ahora, se pierden los datos cargados.` — botones `Salir` (`flat color="negative"`) / `Seguir editando` (`flat color="primary"`). Se dispara al cerrar el diálogo (botón, ESC o click afuera) **solo si el formulario está sucio**. Único confirm de la fase: no hay borrado ni desactivación (D-05). |

Estados vacíos de campo en la tabla: em-dash `—` en `text-grey-7` (patrón de `useStatusBadge`).

---

## Layout & Interaction Contract (phase-specific)

### Ruta, nav y gating (D-07, D-08)

- Ruta nueva `/catalogo` dentro del layout del admin, `meta.allowedRoles: CATALOGO_ROLES`.
- `CATALOGO_ROLES: AdminRole[] = ['coach', 'admin', 'owner']` (D-08) — declarado en `src/config/templo-config.ts` junto al resto de los sets, con docblock que espeje el set del API. Gestión y recepción **no ven** la sección.
- **Categoría nueva del drawer `Gimnasio`** (no se cuelga de `Entrenamiento`: esa categoría lleva `templo: true` y es la capa SPOM del Templo; el catálogo del módulo Gimnasio es superficie de otro módulo y un tenant puede tener uno sin el otro).
- **Gate de módulo:** el ítem se muestra solo si el módulo `gimnasio` está habilitado para el tenant. Preferencia del contrato: que el payload de sesión del admin exponga los módulos habilitados y `NAV_MODEL` los consulte con la misma mecánica declarativa de `templo`/`routines`. **Fallback aceptable si el planner decide no tocar el payload en la 184:** el ítem se gatea por una constante de config y la página, ante el `404` de `requireModule`, renderiza el estado _módulo no disponible_ (copy arriba) en vez de un error genérico.
- Como siempre en este admin: **el nav solo esconde, no es seguridad** — el gate real es el API (`requireModule` → 404 y el gate de roles → 403).

### Listado (`CatalogoPage.vue`)

- `q-page.q-pa-md`. Header en una fila: `Catálogo de ejercicios` (Display 24/600) + `q-space` + CTA `Crear ejercicio`.
- `q-table` **paginada server-side** (`v-model:pagination` + `@request`, patrón `AlumnosPage`), `:rows-per-page-options="[25, 50, 100]"`, default 25, `row-key="id"`, `:loading` conectado al composable.
- **Sin buscador ni filtros de ningún tipo en esta fase** (D-07). Tampoco un toggle de alcance: se difiere entero a la 185 junto con CAT-07, para no construir media superficie de búsqueda dos veces.
- **Foco visual primario de la página:** el CTA `Crear ejercicio` (único elemento accent fuera de la tabla) y, dentro de la tabla, la columna `Ejercicio` (nombre canónico). Badges, chips y acciones de fila quedan visualmente subordinados — nada compite en peso con esos dos.
- Columnas (en este orden):

  | #   | Columna           | Alineación | Contenido                                                            |
  | --- | ----------------- | ---------- | -------------------------------------------------------------------- |
  | 1   | `Ejercicio`       | left       | Nombre canónico (Label 14/400). Ancho mínimo 220px                   |
  | 2   | `Alcance`         | left       | Badge Global/Propio (ver abajo)                                      |
  | 3   | `Categoría`       | left       | Chip derivado, solo lectura, `outline color="grey-7"` + ícono `lock` |
  | 4   | `Grupo principal` | left       | Label de la taxonomía                                                |
  | 5   | `Patrón`          | left       | Label de la taxonomía                                                |
  | 6   | `Dificultad`      | left       | `Principiante` / `Intermedio` / `Avanzado`                           |
  | 7   | `Acciones`        | right      | `Editar ejercicio` (propios) · `Ver ficha` (globales)                |

  El equipamiento **no va en la tabla** (es multivaluado y la reventaría a lo ancho): se ve completo en la ficha.

- **Badge de alcance** (`EjercicioScopeBadge.vue`, componente compartido listado ↔ ficha — misma regla que `useStatusBadge`):
  - **Global:** `q-badge outline color="info"` + ícono `public` + texto `Global`.
  - **Propio:** `q-badge color="secondary" text-color="white"` + ícono `storefront` + texto `Propio`.
  - La diferencia es de **forma (outline vs sólido) + ícono + texto**, no solo de color.
- **Fila global:** la acción es `Ver ficha` (abre el diálogo en modo lectura). No se renderiza un `Editar` deshabilitado que no hace nada: se renderiza `Ver ficha` y, dentro, el banner `warning` explica por qué no se edita (D-06 comunicado, nunca falla en silencio).
- Empty state: bloque centrado con `q-pa-2xl` vertical (48px), ícono `fitness_center` `size="48px" color="grey-6"`, heading (20/600), body (16/400, `text-grey-8`, máx. 480px de ancho) y CTA `Crear ejercicio`. Se muestra cuando el listado vuelve vacío en la página 1.
- Error de carga: `q-banner` `negative` con la copy de arriba + botón `Reintentar` (flat). La tabla no queda en blanco sin explicación.

### Ficha (`EjercicioFichaDialog.vue`) — un solo componente, tres modos

`mode: 'create' | 'edit' | 'view'`. En `view` todos los controles van `readonly`/`disable` y el pie muestra solo `Cerrar`. El diálogo es `q-dialog` (persistente cuando el form está sucio) con `q-card` de 720px máx., cuerpo scrolleable y pie sticky.

**Encabezado del diálogo** (banda `.bg-summary-surface`): título según modo (Heading 20/600) + badge de alcance + chip de estado (`Publicado`, solo lectura — D-04/D-05: en la 184 no hay control de estado en ninguna superficie).

**Bloques del cuerpo** (cada uno con título de fieldset 14/600 `text-grey-8`, separados por `q-separator` + `lg`):

1. **Identidad**
   - `Nombre canónico *` — `q-input outlined`, requerido, trim. Autofocus en modo alta.
   - `Alias / sinónimos` — `q-select outlined multiple use-input use-chips new-value-mode="add-unique"` (texto libre, no es lista cerrada), máximo 10, trim + dedupe case-insensitive, con el hint de alias.
   - `Categoría` — **display derivado, nunca un control** (criterio de éxito 4): chip `outline color="grey-7"` con ícono `lock` y `q-tooltip`. Se recalcula **en vivo** al cambiar el grupo muscular principal, con el mapeo fijo de A4 (Pecho, Espalda, Hombros, Bíceps, Tríceps, Piernas, Core). Sin grupo elegido muestra `—`.

2. **Clasificación** (fila de 2 columnas, `q-col-gutter-sm`; los 5 primeros son obligatorios duros por D-03)
   - `Grupo muscular principal *` — `q-select` de los 14 valores cerrados.
   - `Grupos musculares secundarios` — `q-select multiple use-chips` de la **misma** lista cerrada, excluyendo el principal ya elegido.
   - `Equipamiento requerido *` — `q-select multiple use-chips` de los 25 valores cerrados, mínimo 1.
   - `Patrón de movimiento *` — `q-select` de los 9 valores cerrados.
   - `Nivel de dificultad *` — `q-select`: `Principiante` / `Intermedio` / `Avanzado`.
   - `Tipo de carga *` — `q-select`: `Externa` / `Peso corporal` / `Peso corporal con lastre o asistencia` / `Tiempo` / `Distancia`.
   - **Todos los selects de taxonomía son cerrados: `emit-value map-options` y sin `new-value-mode`.** La UI hace imposible el valor libre; el error de "fuera de lista" existe igual para lo que llegue del API (criterio 3 se verifica en las dos capas).

3. **Instrucciones** (todas opcionales en ejercicios propios — D-03, desviación consciente del "Obligatorio: Sí" del §2.2)
   - `Descripción breve` — `q-input` 2 filas.
   - `Ejecución paso a paso` — `q-input type="textarea"` 6 filas, con el hint del §2.5.
   - `Errores frecuentes` — `q-input type="textarea"` 3 filas.
   - `Recomendaciones de seguridad` — `q-input type="textarea"` 3 filas.
   - Ningún asterisco en estos labels y ninguna regla de requerido: la fricción del profe es el motivo de D-03.

4. **Relaciones**
   - `Variante más fácil` · `Variante más difícil` — `q-select use-input` typeahead de un solo valor.
   - `Ejercicios alternativos` — `q-select use-input multiple use-chips`.
   - Reglas de las tres: excluir el propio ejercicio de las opciones; las opciones salen del lookup por nombre descrito abajo; la restricción de scope de D-02 (local→global sí, global→local no) queda garantizada porque en la 184 solo se editan propios, y el propio ve globales + propios de su gimnasio. Si el API rechaza igual el cruce, se muestra el error inline del campo con la copy que devuelva el server.
   - **Lookup del typeahead:** consulta por **nombre canónico**, `limit 20`, debounce 300ms sobre el endpoint de listado. Esto **no es** el buscador de CAT-07 (sin alias, sin taxonomías, sin filtros en el listado) — es el mínimo para poder elegir una referencia. **Fallback si el planner decide que ni el parámetro `nombre` entra en la 184:** los tres campos se renderizan `disable` con hint `Disponible cuando esté el buscador del catálogo.` (nunca ocultos sin explicación).

**Campos v2 del §2.2 (`URL de video`, `Imagen`): NO se renderizan en la 184.** El schema los tiene (D-01) pero un control muerto y deshabilitado en un form de 19 campos es ruido. Decisión discrecional, registrada acá para que la fase que los active sepa que la UI arranca sin ellos.

**Campo `Alcance` del §2.2:** no es un control — se muestra como badge en el encabezado del diálogo (en alta siempre es `Propio`).

**Campo `Estado` del §2.2:** no es un control en la 184 (D-04/D-05) — chip de solo lectura.

### Validación e interacción del form

- Marcado de obligatorios: sufijo ` *` en el label (patrón existente en `TenantWizardPage.vue`).
- Validación **on-blur** por campo (`q-input`/`q-select` con `:rules`) + revalidación completa al pulsar guardar. No validar on-keystroke: no se le grita al profe mientras tipea.
- Al fallar el guardado en el server: banner `negative` arriba del cuerpo (`Revisá los campos marcados.`), errores por campo inline, y **scroll automático al primer campo con error**.
- Botón de guardar con `:loading` mientras vuela el request; `Cancelar` deshabilitado durante el envío.
- El diálogo es `persistent` mientras el form esté sucio → cerrar por ESC/click-afuera dispara el confirm `Descartar cambios`. Con el form limpio, cierra directo.
- Éxito: cerrar diálogo, `Notify` positivo, refrescar la página actual del listado manteniendo paginación.
- Botones solo-ícono (si el executor usa uno en la columna de acciones): **`aria-label` obligatorio**; la preferencia del contrato es botón con texto (`Editar ejercicio` / `Ver ficha`), no ícono solo.

### Taxonomías en el frontend

- Las tres listas cerradas + el mapeo de categoría viven en `src/constants/gym-taxonomies.ts`, **espejo 1:1 del enum/constante del API**, con docblock al estilo `src/tv/timer.ts` que obligue a cambiar los dos lados juntos.
- El frontend **nunca** deriva la categoría por su cuenta para persistirla: la calcula solo para mostrarla en vivo mientras se edita, y el valor de verdad lo devuelve el API.
- Orden de las opciones en los selects: el **orden del brief §2.3** (no alfabético) — está agrupado por lógica anatómica/funcional y así lo espera el profe.

---

## Component Inventory (executor reference)

| Componente                 | Ubicación                                                                        | Acción                                                                                |
| -------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `CatalogoPage.vue`         | `src/pages/gimnasio/` (nuevo subdirectorio, precedente: `src/pages/plataforma/`) | Nuevo — header + CTA + QTable paginada + empty/error states                           |
| `EjercicioFichaDialog.vue` | `src/components/gimnasio/`                                                       | Nuevo — ficha en 3 modos (create/edit/view)                                           |
| `EjercicioScopeBadge.vue`  | `src/components/gimnasio/`                                                       | Nuevo — badge Global/Propio compartido listado ↔ ficha                                |
| `useGymCatalogApi.ts`      | `src/composables/`                                                               | Nuevo — patrón `useXApi` existente (`loading` ref + métodos tipados, sin `any`)       |
| `gym-taxonomies.ts`        | `src/constants/`                                                                 | Nuevo — listas cerradas + mapeo de categoría, espejo del API                          |
| `templo-config.ts`         | `src/config/`                                                                    | Editar — `CATALOGO_ROLES` + categoría `Gimnasio` en `NAV_MODEL` con su gate de módulo |
| `routes.ts`                | `src/router/`                                                                    | Editar — ruta `/catalogo` con `meta.allowedRoles: CATALOGO_ROLES`                     |
| `app.scss`                 | `src/css/`                                                                       | Sin cambios — `.bg-summary-surface` ya existe y se reutiliza                          |

No se crean tokens, colores ni fuentes nuevas. Cero hex hardcodeados en componentes.

---

## Registry Safety

| Registry                           | Blocks Used | Safety Gate                                                          |
| ---------------------------------- | ----------- | -------------------------------------------------------------------- |
| n/a (Quasar Material, first-party) | ninguno     | not applicable — el proyecto no usa shadcn ni registries de terceros |

Sin registries de terceros declarados. Gate de shadcn no aplica (Vue/Quasar, no React). Vetting: N/A. Sin dependencias nuevas (regla del proyecto: no se instala nada sin preguntar).

---

## Decisiones discrecionales de este contrato (no venían de CONTEXT.md)

| #   | Decisión                                                                            | Razón                                                                                                                  |
| --- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | Categoría de drawer **`Gimnasio`** nueva, no reusar `Entrenamiento`                 | `Entrenamiento` lleva `templo: true` (capa SPOM). Gimnasio es otro módulo y son independientes por tenant              |
| 2   | Ficha en **diálogo** (720px) y no en página propia                                  | Precedente del admin para ABM (ExercisesPage, PlanFormDialog); mantiene el listado como contexto                       |
| 3   | Un solo componente de ficha con 3 modos                                             | Evita duplicar 19 campos entre "editar propio" y "ver global"                                                          |
| 4   | Globales: acción `Ver ficha` + banner explicativo, **no** un `Editar` deshabilitado | Comunica el bloqueo de D-06 con una salida útil en vez de un control muerto                                            |
| 5   | **Sin filtros ni toggle de alcance** en el listado                                  | D-07 difiere el buscador a CAT-07/fase 185; media superficie de búsqueda se paga dos veces                             |
| 6   | Campos v2 (video/imagen) fuera del form                                             | Controles deshabilitados permanentes = ruido; el schema igual existe (D-01)                                            |
| 7   | Equipamiento fuera de la tabla                                                      | Multivaluado: rompe el ancho del listado; va completo en la ficha                                                      |
| 8   | Typeahead de relaciones por nombre, límite 20                                       | Mínimo indispensable para elegir referencias sin construir CAT-07. Fallback declarado si el planner lo saca de la fase |
| 9   | Override scoped de 14px en celdas de tabla y mensajes de campo                      | Los defaults de Quasar (13/12px) violan el contrato de tipografía de la casa (heredado del 151-UI-SPEC)                |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
