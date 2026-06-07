---
phase: 133
slug: calidad-del-rbol-hitos-can-nicos-variantes-bandas-de-dificul
status: draft
shadcn_initialized: false
preset: none
created: 2026-06-07
---

# Phase 133 — UI Design Contract

> Contrato visual y de interacción para la superficie ADMIN de la fase 133 (el member app es fase 134). Generado por gsd-ui-researcher, verificado por gsd-ui-checker.
>
> **Superficie única:** `el-templo-admin` → página `/tree-map` ("Árbol de ejercicios"), sus nodos Vue Flow (`CategoryFlowNode` / `RouteFlowNode` / `ExerciseFlowNode`), el drawer de revisión (`tree-map-review`) y el panel lateral (`tree-map-panel`). No se crea ninguna página nueva.
>
> **Fuente de verdad del design system:** el código existente del admin (`quasar.variables.scss` + Quasar Material palette). Esta fase NO introduce paleta, tipografía ni spacing nuevos — extiende patrones ya presentes en `TreeMapPage.vue`.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (Quasar 2.16 — app Vue establecida; shadcn no aplica a este stack) |
| Preset | not applicable |
| Component library | Quasar (Material) + @vue-flow/core 1.48 para el canvas |
| Icon library | Material Icons (default de Quasar — `check`, `close`, `arrow_upward`, `alt_route` ya en uso en la página) |
| Font | Default de Quasar (Roboto) — sin cambios |

Variables de marca (fuente: `el-templo-admin/src/css/quasar.variables.scss`, Phase 39):

| Token | Hex | Uso |
|-------|-----|-----|
| `$primary` | `#96593a` | Terracotta — acciones primarias, badges "Manual", aristas manuales, outline de selección |
| `$secondary` | `#7d5d42` | Clay — acentos secundarios |
| `$accent` | `#3d3732` | Deep Charcoal — texto |
| `$positive` | `#3b7249` | Aceptar (verde cálido) |
| `$negative` | `#b34a4a` | Rechazar / errores (rojo cálido) |
| `$warning` | `#7d6520` | Avisos (gold oscuro) — banner señal TTB |

Regla de marca: paleta cálida, **sin azul en ningún elemento nuevo**.

---

## Spacing Scale

Declarado (múltiplos de 4, alineado con clases Quasar `q-pa-*`/`q-gutter-*` ya usadas en la página):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Gaps inline (badge junto a texto, `q-ml-xs`) |
| sm | 8px | Spacing compacto dentro de nodos y filas del drawer (`q-gutter-sm`) |
| md | 16px | Padding de secciones de cards/drawer (`q-pa-md`) |
| lg | 24px | Separación entre bloques del panel |
| xl | 32px | Gaps de layout del canvas (entre columnas de rutas) |
| 2xl | 48px | Separación entre bandas de categoría en el canvas |
| 3xl | 64px | — (no se usa en esta fase) |

Exceptions (heredadas del código existente, NO corregir):
- Nodos del canvas usan paddings internos de 6/10/12px (`ExerciseFlowNode` 8×10, `RouteFlowNode` 10×12) — se conservan tal cual.
- Stripe de banda R2: borde izquierdo de **4px** en `ExerciseFlowNode` (ver Color).
- Badge `pendingCount` flotante a −8px del borde del nodo (patrón existente).

---

## Typography

Solo tipografías ya presentes en la página — ningún tamaño nuevo:

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Micro (meta de nodos: `dl N`, código de ruta) | 11px | 400 | 1.25 |
| Caption (labels del drawer/panel, sub-grupos R3, leyenda de bandas) | 12px | 400 | 1.4 |
| Body (nombre de ejercicio en drawer, selects, `text-body2`) | 13px | 400 | 1.4 |
| Subtitle/Heading (títulos de drawer/panel, `text-subtitle2`; nombre de ruta) | 14px | 600 | 1.2 |

Pesos para trabajo nuevo: **400 (regular) y 600 (semibold)** únicamente. Excepción heredada: el círculo de escalón de `ExerciseFlowNode` usa 700 a 11px y el nombre de ejercicio en nodo usa 500 a 12px — se conservan, no se replican en componentes nuevos.

Labels de sub-grupo R3: caption 12px, peso 600, `text-uppercase`, color `grey-7`, letter-spacing 0.5px.

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#fff` (cards/nodos) sobre page background Quasar claro | Canvas, nodos, drawer, panel |
| Secondary (30%) | `$grey-3`–`$grey-7` (bordes `$grey-5`, texto secundario `$grey-7`, aristas auto `#9e9e9e`) | Bordes de nodos, metadatos, aristas auto, labels de sub-grupo |
| Accent (10%) | `$primary #96593a` (terracotta) | SOLO: botones primarios, badge/borde "Manual", aristas manuales, outline de nodo seleccionado, borde de ruta expandida, badge "Hito" |
| Destructive | `$negative #b34a4a` | Botón Rechazar, notificaciones de error |

Accent reserved for: botones de acción primaria (`Aceptar todas`, `Mover`), estado manual (badge + borde + arista), selección de nodo, badge "Hito". **NUNCA** para las bandas de dificultad ni para aristas cross-ruta — esas tienen su propia capa semántica (abajo).

### Capa semántica 1 — Bandas de dificultad R2 (mapeo LOCKED, tree-quality-research.md §4.3)

Paleta = `levelColor()` existente (hoy duplicada en `AlumnosPage.vue`, `AlumnoDetailPage.vue`, `SessionsPage.vue`, `EditableBlockCard.vue`). **Esta fase la extrae a `src/constants/levels.ts`** junto con el nuevo `DL_BANDS`; las 4 páginas pasan a importarla (DRY lock).

| Banda | dl | Token Quasar | Hex aprox. | Texto sobre el color |
|-------|----|--------------|-----------|---------------------|
| kairos | 1–2 | `amber-6` | `#FFC107` | charcoal `$accent` (blanco no contrasta) |
| alfa | 3 | `amber-8` | `#FFA000` | charcoal `$accent` |
| delta | 4–6 | `deep-orange-7` | `#F4511E` | blanco |
| sigma | 7–8 | `brown-8` | `#5D4037` | blanco |
| omega | 9–10 | `red-9` | `#C62828` | blanco |
| spartan | 11–12 | `grey-9` | `#424242` | blanco |

Reglas:
- El token Quasar es la fuente de verdad (el hex es informativo).
- NO derivar las bandas de `LEVEL_LINEAR_MIN` (mapeo de UI deliberadamente distinto — locked).
- dl `null` / fuera de 1–12 → sin stripe, badge `dl —` en `grey-6`.

### Capa semántica 2 — Aristas del canvas (jerarquía completa, para que R4 no se confunda con lo existente)

| Arista | Stroke | Dash | Width | Marker |
|--------|--------|------|-------|--------|
| Cadena auto (existente) | `#9e9e9e` | sólida | 2 | — |
| Cadena/precedencia manual (existente) | `#96593a` | sólida | 2 | según existente |
| "Inicio de cadena" ruta→primer ejercicio (existente) | `#bdbdbd` | `6 4` | 1 (default) | — |
| **Prerequisito cross-ruta R4 (nuevo)** | `#757575` (`grey-8`) | `8 4` | 2 | `ArrowClosed` |
| **Prerequisito cross-ruta agregado ruta→ruta (nuevo, endpoints colapsados)** | `#757575` | `8 4` | 2 | `ArrowClosed` |

El dash `8 4` + marker + grey-8 distingue R4 del dashed `6 4` `#bdbdbd` sin marker que ya existe (si fueran iguales, R4 sería ilegible). Las aristas R4 NO se animan (`animated: false`) — la animación queda reservada a precedencias manuales intra-árbol existentes.

---

## Component & Interaction Contracts

### C1 — `ExerciseFlowNode` con banda R2 (req R2-BANDS)

- **Stripe:** `border-left: 4px solid <color de banda>` (sobre el borde `$grey-5` existente). Estados existentes no cambian: `--manual` sigue pintando todo el borde `$primary` (el stripe de 4px convive encima del lado izquierdo); `--selected` sigue con outline `$primary`.
- **Badge dl:** el texto plano `dl {{ dl }}` se reemplaza por `q-badge` con color de banda, label `dl N`, texto según tabla de contraste de arriba. Tooltip del badge: `{{ banda }} (dl {{min}}–{{max}})`.
- **Badge variante (R1, solo si el nodo visible es variante en vistas que las muestren):** `q-badge outline color="grey-7" label="Variante"`. En el backbone filtrado las variantes no se renderizan como nodos de cadena — este badge aplica al panel y al drawer, no al canvas.

### C2 — Leyenda de bandas (req R2-BANDS)

- Ubicación: toolbar de `/tree-map` (la barra existente con búsqueda), alineada a la derecha.
- Forma: 6 chips `q-badge` compactos en fila, label `kairos 1–2`, `alfa 3`, `delta 4–6`, `sigma 7–8`, `omega 9–10`, `spartan 11–12`, cada uno con su color de banda y texto según contraste. En viewport angosto (<1100px) colapsa a un solo botón `q-btn flat icon="palette"` con la leyenda en `q-menu`.
- Sin leyenda los colores no significan nada — la leyenda es parte del contrato, no opcional.

### C3 — Sub-grupos R3 (req R3-SUBGRP)

- Agrupación por **category dominante de la ruta** (server-side, viaja en `EditableTree`); las rutas se ordenan por sub-grupo dentro de su banda de categoría.
- Render: nodo-label de sub-grupo encima del primer grupo de columnas de ruta — caption 12px / 600 / uppercase / `grey-7` (ver Typography). Sin caja, sin borde: es un agrupador visual, NO un eje de navegación (locked: "la riqueza queda en las rutas").
- Filtro: `q-select` denso "Sub-grupo" en la toolbar (junto a la búsqueda existente), `clearable`, opciones = categorías finas presentes. Filtrar oculta rutas de otros sub-grupos (mismo comportamiento que la búsqueda existente).
- Display names en es-AR title case: `Pull Vertical`, `Pull Horizontal`, `Push Vertical`, `Push Horizontal`, `Knee Dominant`, `Hip Dominant`, `Core Anterior`, `Core Posterior`, `Core Lateral`, `Oblicuos` (mapear desde los valores UPPERCASE de la DB).

### C4 — Drawer de revisión: eje hito/variante (req R1-REV) + señal TTB (req TTB-SIG)

Extiende el drawer existente (`tree-map-review`, 420px, derecha) — NO crear un drawer nuevo:

- **Agrupación visual:** las filas de propuestas se agrupan por el "movimiento" detectado por la heurística. Header de grupo: caption 12px/600/uppercase `grey-7` con el token de movimiento (ej. `WINDSHIELD`) + contador `(N)`. Propuestas sin movimiento detectado van al final bajo header `Sin movimiento detectado`.
- **Control hito/variante por fila:** `q-btn-toggle` denso de 2 opciones `Hito | Variante`, pre-poblado por la heurística. Si `Variante` → aparece `q-select` denso "Hito" con los candidatos del mismo grupo (movimiento × escalón), pre-seleccionado el propuesto. El select muestra `nombre — dl N`.
- **Badges de estado en la fila:** `q-badge color="primary" outline label="Hito"` para el hito propuesto del grupo; `q-badge color="grey-7" outline label="Variante"` para el resto. Se mantiene el badge existente `orange-8 "sin escalón"`.
- **Accept/Reject:** mismos botones redondos existentes (`check` positive / `close` negative) y mismo "Aceptar todas" con diálogo de confirmación. Aceptar escribe dimensión Y hito/variante en la misma pasada (una sola revisión por ejercicio).
- **Señal split TTB (solo ruta TTB):** `q-banner dense` arriba de la lista, `class="bg-warning text-white"` (gold `$warning`), icono `call_split`. No es accionable (sin botones): es un recordatorio persistente para la decisión de profes. Copy abajo.

### C5 — Panel lateral del ejercicio: hito ↔ variantes (req R1-REV)

Extiende `tree-map-panel` existente:

- Línea de metadatos gana el badge de rol: `Hito` (primary outline) o `Variante de: {nombre}` (grey-7 outline, con el nombre del hito linkeable — click selecciona el hito en el canvas).
- Si el seleccionado es hito con variantes: sección nueva "Variantes (N)" como `q-expansion-item` denso colapsado por defecto; cada variante en `q-item` denso con nombre + badge dl de banda + botón `q-btn flat dense size="sm"` "Marcar como hito" (intercambia rol con confirmación, ver Copywriting).
- Si el seleccionado es variante: botón `q-btn outline dense size="sm"` "Promover a hito" debajo de las acciones existentes.

### C6 — Prerequisitos cross-ruta R4 (req R4-XRUTA)

Render según Pitfall 7 del RESEARCH, opción (a)+(b):

- **Ambos extremos expandidos:** arista gris punteada nodo→nodo (estilo de la tabla de aristas).
- **Algún extremo colapsado:** arista agregada gris punteada `RouteFlowNode → RouteFlowNode` + badge en el `RouteFlowNode` de la ruta élite: `q-badge outline color="grey-8" label="prereq"` posicionado junto al badge `pendingCount` existente (que mantiene prioridad visual — el prereq badge va a la izquierda del pending si coexisten). Tooltip: copy abajo.
- Click en arista R4 (nodo→nodo o agregada): selecciona y muestra tooltip `Prerequisito: {ejercicio origen} ({ruta}) → {ejercicio destino} ({ruta})`.
- Alta/baja de aristas R4: mecanismo existente (arrastrar handle entre nodos de rutas distintas / `POST /precedence`) — sin UI nueva de creación.

### Estados obligatorios (todas las superficies nuevas)

| Estado | Contrato |
|--------|---------|
| Loading | `:loading` en los botones que disparan la acción (patrón existente `proposalBusyId`/`bulkBusy`); el drawer usa `q-skeleton` solo si se agrega fetch nuevo |
| Empty | Copy específico por superficie (ver Copywriting); nunca panel en blanco |
| Error | `Notify` negative con copy de error + el estado previo intacto (optimistic updates prohibidos en accept/reject) |
| Disabled | "Aceptar todas" disabled con 0 filas (existente); "Marcar como hito" disabled mientras otra mutación está en vuelo |

---

## Copywriting Contract

Idioma: **español rioplatense** (voseo, consistente con "podés arrastrar…" existente). Sin emojis en copy nuevo (el 🎉 existente del empty state se conserva, no se replica).

| Element | Copy |
|---------|------|
| Primary CTA (drawer) | `Aceptar` / `Aceptar todas` (existentes, sin cambios) |
| Toggle hito/variante | `Hito` · `Variante` — select dependiente label `Hito` |
| CTA panel (variante) | `Promover a hito` |
| CTA panel (variante de un hito) | `Marcar como hito` |
| Empty state drawer (existente) | `No quedan propuestas pendientes en esta ruta 🎉` (sin cambios) |
| Empty state variantes (panel) | `Este hito no tiene variantes asignadas.` |
| Empty state sub-grupo filtrado | `No hay rutas en este sub-grupo.` |
| Banner señal TTB | Título: `Posible split de ruta` · Cuerpo: `Los movimientos TTB, Windshield y ATW podrían ser rutas separadas. La decisión se toma con los profes — esta agrupación es la referencia.` |
| Tooltip badge prereq (ruta élite) | `Esta ruta tiene prerequisitos en otra ruta. Expandí ambas para ver las aristas.` |
| Tooltip badge dl | `{banda} (dl {min}–{max})` — ej. `delta (dl 4–6)` |
| Notif éxito accept | `Propuesta aceptada: {nombre} → {Hito|Variante de {hito}}.` |
| Notif éxito promover | `{nombre} ahora es el hito; {nombre anterior} pasó a variante.` |
| Error state (genérico mutaciones) | `No se pudo guardar el cambio. Reintentá; si persiste, recargá la página.` |
| Error state (carga del árbol) | `No se pudo cargar el árbol. Recargá la página para reintentar.` |
| Destructive confirmation — `Aceptar todas` | (Existente, se conserva) diálogo `Aceptar todas` con `ok` primary / `Cancelar` flat |
| Destructive confirmation — promover/intercambiar hito | Diálogo: título `Promover a hito` · cuerpo `"{variante}" pasa a ser el hito y "{hito actual}" pasa a variante. Las cadenas del árbol se recalculan.` · botones `Promover` (primary) / `Cancelar` (flat) |
| Destructive confirmation — aceptar variante dentro de cadena manual (locked) | Diálogo: título `La cadena se va a editar` · cuerpo `"{nombre}" está en una cadena ordenada a mano. Al marcarlo como variante sale de la cadena y sus vecinos se reconectan.` · botones `Aceptar igual` (primary) / `Cancelar` (flat) |

Reglas: accept/reject individuales siguen SIN confirmación (patrón existente); solo las 3 acciones de la tabla llevan diálogo. Las notificaciones usan `Notify` de Quasar, position consistente con el resto del admin.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none — stack Vue/Quasar, shadcn no aplica | not required |
| third-party | none — la fase no agrega ninguna dependencia (regla del proyecto: nunca instalar sin aprobación) | not required |

---

## Claude's Discretion (decisiones tomadas en este spec, abiertas a override del usuario)

Resueltas sin discusión interactiva (la fase no tuvo discuss-phase); las locked decisions R1–R4 + bandas NO se tocaron. Flag de revisión para el usuario:

1. **Stripe 4px + badge dl coloreado** como render de banda R2 (vs. solo badge o fondo completo del nodo). El fondo completo rompería la legibilidad del estado `--manual`/`--selected` terracotta.
2. **Dash `8 4` + grey-8 + ArrowClosed** para aristas R4, para diferenciarlas del dashed `6 4 #bdbdbd` "inicio de cadena" ya existente (el ejemplo del RESEARCH usaba `6 4 #9e9e9e`, demasiado parecido).
3. **Badge `prereq` + arista agregada ruta→ruta** para R4 con rutas colapsadas (opción a+b del Pitfall 7, la recomendada por el RESEARCH).
4. **`q-btn-toggle` Hito|Variante por fila del drawer** integrado a la revisión de dimensiones existente (una sola pasada del profe), con agrupación visual por movimiento — honra el espíritu "aceptar propuesta podría marcar hito vs variante" de la decisión locked.
5. **Confirmación solo en 3 acciones** (aceptar todas — existente; promover hito; variante en cadena locked). Accept/reject individual sin diálogo, como hoy.
6. **Leyenda de bandas en la toolbar** (no flotante en el canvas) para no tapar nodos.
7. **Extracción de `levelColor()` a `constants/levels.ts`** como parte de esta fase (DRY agresivo del proyecto; hoy duplicada en 4 archivos) — las 4 páginas pasan a importar.
8. **Texto charcoal sobre amber** (kairos/alfa) en badges de banda — blanco sobre amber falla contraste WCAG; el resto de bandas usa blanco.
9. **Genuinamente contencioso a revisar:** el banner TTB es persistente y no descartable (decisión: que no se pierda la señal, locked "dejar señalizado — no perderlo"). Si molesta en el uso diario, puede volverse colapsable conservando un chip indicador.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
