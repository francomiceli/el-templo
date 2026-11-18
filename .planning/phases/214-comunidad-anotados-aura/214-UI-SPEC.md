---
phase: 214
slug: comunidad-anotados-aura
status: draft
shadcn_initialized: false
preset: none
created: 2026-11-17
---

# Phase 214 — UI Design Contract

> Contrato visual y de interacción de las pantallas de la fase 214 (planes B1 a B6 de la segunda pasada).
> Generado por gsd-ui-researcher, lo valida gsd-ui-checker.

**Fuentes de verdad, en este orden:**

1. `214-CONTEXT.md`. Mandan las decisiones de número más alto. D-15 y D-54 están revocadas.
2. Sketches elegidos (decisiones cerradas, acá se transcriben): 030 **C2**, 031 **C + L1** (`ronda3.html`), 031 `ronda2.html` cuarto teléfono (selector en Entrenar), 032 **B**, 033 **B** (el "+N" sin chispa, la chispa antes del total).
3. Tokens del código: `el-templo-app/src/css/quasar.variables.scss`, `_brand.scss`, `_premium-card.scss` (`$pd-*`) y el rework de Mi Templo (`199-UI-SPEC.md`).

**Regla de transcripción.** Cuando el sketch tiene un valor puesto a mano y el código ya tiene un token, manda el token. Cada desvío respecto del sketch está marcado con **[ajuste]** y su motivo (contraste, grilla de 4 o datos que el servidor no entrega).

**Datos disponibles (planes 09 a 15).** La UI no usa ningún campo que no esté en esta lista:

| Origen | Campos |
|---|---|
| `GET /api/auth/me` (planes 09, 12, 13) | `auraEarned: number \| null` (null = módulo apagado o falla de lectura), `photoUrl`, `photo { url, status: 'none'\|'pendiente'\|'aprobada'\|'rechazada', pendingUrl }`, `communityVisible`, `communityNoticeSeen`, `memberSince`, `firstName` |
| `GET /api/members/scheduling/slots/:scheduleId/:date/attendees` (plan 14) | `total`, `canSeeList`, `reason: 'ok'\|'sin_plan'\|'oculto'`, `attendees[{ firstName, lastInitial, photoUrl, photoId, aura, isMe }]`, `hiddenCount`, `viewer { visible, noticeSeen }` |
| `PUT /api/members/scheduling/attendees/visibility` / `POST .../notice-seen` (plan 13) | `{ visible, noticeSeen }` / 204 |
| `GET /api/members/aura/movements?before&limit` (plan 15) | `earned`, `movements[{ id, amount, label, createdAt }]`, `nextBefore` |
| Foto del alumno (plan 11) | `POST /profile-photo/upload-url { contentType: 'image/jpeg', acceptedRules: true }`, `PUT` directo a R2, `POST /profile-photo/confirm { key }` → `{ photoId, status: 'pendiente' }`, `DELETE /profile-photo`, `POST /profile-photos/:photoId/report` (204, tope 20 por minuto) |
| Check-in (plan 09) | lo de siempre (`branchName`, `checkedInAt`) + `auraAwarded: number \| null`, `auraTotal: number \| null` |
| Admin (plan 12) | `GET /api/admin/members/profile-photos` → `items[{ photoId, userId, firstName, lastName, branchId, status, reportCount, lastReportedAt, uploadedAt, url }]`; `POST /:userId/profile-photo/approve` → `{ status, auraAwarded }`; `POST /:userId/profile-photo/reject`; `DELETE /:userId/profile-photo` |
| Grilla semanal (existente) | `WeeklySlotView.bookedCount`, `maxCapacity`, `activityName`, `startTime`, `branchName` |

Lo que el servidor **no** entrega y por eso la UI **no** muestra: rol u origen de los anotados (D-52), sede u horario de la clase en cada movimiento de Aura, tipo de movimiento (solo llega el texto `label`) y motivo de rechazo de una foto (ver Decisión abierta 3).

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none. Quasar 2 + Vue 3, no React: el gate de shadcn no aplica |
| Preset | not applicable |
| Component library | Quasar (`q-dialog position="bottom"`, `q-menu`, `q-toggle`, `q-skeleton`, `q-img`) + componentes propios `PremiumDialogCard` (tone `light`), `CelebrationFrame` como precedente |
| Icon library | Material Icons (la que ya usa Quasar en la app y el admin) |
| Font | Montserrat (títulos, números), Geologica (cuerpo, botones), Cinzel (kickers y rótulo AURA). Ya cargadas |
| Dependencias nuevas | Ninguna. `@capacitor/camera` 8.2.0 ya instalado (`getPhoto` con `source` explícito, como Conquer) |

**Componentes nuevos (nombres sugeridos para el planificador):**

| Componente | Plan | Reemplaza o reusa |
|---|---|---|
| `src/components/MiTemploHeader.vue` | B2 | une `MainLayout.vue:34-61` y `:111-139` |
| `src/components/AuraChip.vue` (ficha L1) | B2 | nuevo; lo usa el encabezado |
| `src/components/AuraDetailSheet.vue` | B2/B4 | nuevo; se abre desde el encabezado y desde Perfil |
| `src/components/MemberAvatar.vue` (foto o iniciales) | B2/B3/B4 | reemplaza las iniciales inline de `ProfilePage.vue:17` |
| `src/components/AttendeesSheet.vue` + `AttendeePhotoDialog.vue` | B3 | analogía: `SponsorSheet.vue` (hoja clara) |
| `src/components/ProfilePhotoSheet.vue` + `PhotoRulesDialog.vue` | B1/B4 | lógica en `useProfilePhoto.ts` (patrón `useBodyCheckCamera.ts`, con `cleanup()`) |
| `src/components/CheckInCelebration.vue` | B5 | reemplaza el estado `success` de `CheckInPage.vue:37-44` |
| `HeaderLevelDropdown.vue` con prop `variant: 'bar' \| 'light'` | B2 | mismo menú, cambia el disparador |
| Admin `src/pages/FotosPerfilPage.vue` | B6 | analogía: pestañas de `ConquerPage.vue` con pelotita, `MemberPhotoUpload.vue` |

---

## Spacing Scale

Valores declarados (todos múltiplos de 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | gap entre cara, nombre y pastilla en la grilla; entre número y rótulo AURA de la ficha |
| sm | 8px | gap de columnas de la grilla; padding vertical de la ficha L1; separación de la fila "N anotados" dentro de la card |
| sm+ | 12px | gap del encabezado (foto, textos, ficha); padding de la nota de primera vez |
| md | 16px | margen lateral de página; padding de cards; gap de filas de la grilla; padding horizontal de la ficha |
| md+ | 20px | padding horizontal de las hojas (igual que `SponsorSheet`) |
| lg | 24px | padding de la celebración; aire entre el total y "Listo" |
| xl | 32px | margen inferior de las hojas sobre la zona segura |
| 2xl | 48px | alto del botón primario (`pd-cta`) y de los botones de fila de la hoja de foto |
| 3xl | 64px | foto de Perfil (ya existe) |

**Excepciones (todas existentes o de borde, no de layout):**

- 2px: aro de la foto del encabezado (`0 0 0 2px` marfil + `0 0 0 4px` dorado) y filete de la ficha L1 (el sketch decía 1.5). **[ajuste]** a 2 por la grilla.
- 36px: alto de la pastilla del selector de nivel. Igual que `slot-card__go`. El área tocable llega a 44 con `pd-hit-44`.
- 52px: foto del encabezado (sketch 031) y filas de Perfil (ya existen).
- 56px: caras de la grilla de anotados (sketch 032 B).
- 84px: aro de la celebración (sketch 033).
- Tamaños táctiles: todo lo tocable mide al menos 44×44.

---

## Typography

Escala nueva de la fase, en 4 tamaños:

| Role | Size | Weight | Line Height | Fuente | Dónde |
|------|------|--------|-------------|--------|-------|
| Body | 15px | 400 | 1.5 | Geologica | filas de Perfil, textos de hojas y diálogos, movimientos de Aura |
| Label | 13px | 600 | 1.35 | Geologica (nombres) / Montserrat 700 (pastilla de puntos) | nombres en la grilla, pastillas de puntos, antigüedad, captions, fecha de cada movimiento |
| Heading | 18px | 700 | 1.2 | Montserrat | título de las hojas ("Viernes 16 · 18:00"), nombre en la vista de foto, título de cards del admin |
| Display | 22px | 600 (nombre) / 800 (número de Aura) | 1.2 / 1.0 | Montserrat | nombre del encabezado (ya es 600 22), número de la ficha L1 (sketch 23, **[ajuste]** a 22) |

**Pesos.** La fase usa dos pesos nuevos: 400 (cuerpo) y 700 (títulos y números). El 600 y el 800 son excepciones heredadas: el 600 ya lo tienen el nombre del encabezado y el texto de `pd-cta`, y el 800 lo tienen los números de Aura en los sketches 031, 033 y en `FreeBlockCelebration`. No se agrega ningún otro.

**Excepciones de tamaño (componentes y mixins existentes, sin valores nuevos):**

| Rol | Valor | Origen |
|---|---|---|
| Kicker Cinzel ("QUIÉNES VAN", "TU AURA") | 11px, 700, tracking .14–.2em, mayúsculas | mixin `pd-kicker-light` |
| Rótulo "AURA" de la ficha L1 | 11px Cinzel 700, tracking .18em | sketch 10px, **[ajuste]** a 11 (mínimo legible, igual al kicker) |
| Título de bloque ("COMUNIDAD", "ÚLTIMOS MOVIMIENTOS") | 13px Montserrat 800, tracking .08em | mixin `mt-block-title` |
| Total en el detalle de Aura | 44px Montserrat 800, lh 1 | sketch 031 ronda 3 |
| "+N" de la celebración | 68px Montserrat 800, lh 1 | sketch 033 B |
| Título "¡Adentro!" | 24px Montserrat 700 | sketch 033 B |
| Hora del horario | 18px Montserrat 700 | `slot-card__hour`, existente |
| Glifo del nivel en la pastilla | 20px Geologica 400 | sketch 031 ronda 2 |

Todos los números de Aura usan `font-variant-numeric: tabular-nums` y separador de miles `es-AR` ("1.240").

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#f2ede5` página (`$brand-cream`, con `.app-bg` detrás) y `#fbf8f3` hojas y diálogos claros (`$pd-light-surface`) | fondo de Reservas, Perfil y Mi Templo; superficie de la hoja "Quiénes van", del detalle de Aura y de la hoja de foto |
| Secondary (30%) | `#ffffff` cards con borde `$pd-light-edge #8c806f` (controles) o `$pd-light-line #e5dbcd` (decorativo); degradé del encabezado `$brand-terracotta #96593a → $brand-aged-gold #7d5d42` a 135°; `#2c2318` (`$pd-surface`) fondo de la celebración | card del horario, cards de Perfil, encabezado de Mi Templo, celebración |
| Accent (10%) | Familia Aura: `$pd-gold #d4b46a` (sobre oscuro), `$pd-gold-ink #7d6520` (texto sobre claro), `$pd-gold-tint #f6efdc` (fondo), y dos tokens nuevos: `$pd-aura-deep #6a5217` (número grande sobre marfil) y `$pd-gold-bright #f0d58f` (número grande sobre oscuro) | ver la lista de abajo |
| Acción (no es accent) | `$pd-terra-ink #96593a` y degradé `$pd-btn-a #a35f3c → $pd-btn-b #7e4529` | botones primarios (`pd-cta`), links, "Reservar", íconos de fila |
| Destructive | `$pd-neg-a #b34a4a → $pd-neg-b #8f3434` (botón) y `$pd-neg-title #a8423f` (texto) | "Quitar foto", "Quitar" en el admin, montos negativos del detalle de Aura, estado "No fue aprobada" |
| Hecho / OK | `$pd-sage #3f6a47` sobre `$pd-sage-tint #e9f0e6` | aro de la celebración **sin** Aura, chip "Reservado" (ya existe) |

**El dorado se usa solo en:**

1. la ficha L1 del encabezado (filete, fondo marfil, número y rótulo);
2. el aro de la foto en el encabezado de Mi Templo;
3. la pastilla de puntos de cada cara en "Quiénes van";
4. el valor "✦ 320" de la fila "Tu Aura" en Perfil;
5. el detalle de Aura: marco del total, total y montos positivos;
6. la celebración: aro dorado, "+N", "AURA" y el número de "Tu Aura", solo cuando esa asistencia acreditó Aura.

**Nunca dorado:** botones, el sello de antigüedad (D-61), la marca "en revisión" de la foto, el selector de nivel, el aro de la celebración cuando no hubo Aura.

**Tokens nuevos** (van a `_premium-card.scss`, con el comentario del contraste):

```scss
$pd-aura-deep: #6a5217;   // número de Aura sobre marfil: 7.3:1 sobre #fffdf8, 6.5:1 sobre #f6efdc
$pd-gold-bright: #f0d58f; // número de Aura grande sobre oscuro: 10.7:1 sobre #2c2318 (sketch 033)
$pd-aura-ivory-a: #fffdf8; // fondo de la ficha L1 y del total (arriba)
$pd-aura-spark: #c9a227;  // chispa ✦ sobre marfil: SOLO decorativa (aria-hidden), 2.4:1
// Filete de la ficha L1 y del total (decorativo):
// linear-gradient(125deg, #b8954a 0%, #e6cf8e 30%, #fff6da 48%, #e6cf8e 64%, #b8954a 100%)
```

**Contrastes medidos (WCAG, texto):**

| Par | Ratio | Uso |
|---|---|---|
| `$pd-aura-deep #6a5217` / `#f6efdc` (peor punto del degradé de la ficha) | 6.46 | número de la ficha y del total |
| `$pd-gold-ink #7d6520` / `#f6efdc` | 4.87 | rótulo "AURA" de la ficha, pastillas de puntos, "✦ 320" en Perfil. **[ajuste]** el sketch usaba `#8a6d1f`, que da 4.27 y no llega a AA |
| blanco / `#96593a` · blanco / `#7d5d42` | 5.55 · 5.97 | nombre y antigüedad del encabezado |
| blanco / pastilla del selector (`rgba(44,35,24,.22)` sobre el degradé) | ≥ 6.97 | selector de nivel en la barra. **[ajuste]** el sketch usaba vidrio blanco al 18 %, que da 3.8–4.0 y no llega a AA en 13px |
| blanco / `$pd-btn-a #a35f3c` | 4.93 | iniciales sobre el círculo terracota. **[ajuste]** el sketch usaba `#b9785a`, que da 3.56 |
| `$pd-ink-2 #5f584d` / `#e9e1d5` | 5.42 | "+N" y "más" del grupo de ocultos |
| `$pd-gold-bright #f0d58f` / `#2c2318` | 10.74 | "+N" y total de la celebración |
| `$pd-gold #d4b46a` / `#2c2318` | 7.74 | "AURA" de la celebración |
| `$pd-cream-2 #e3c9a8` / `#2c2318` | 9.69 | kicker "ASISTENCIA REGISTRADA" |
| `$pd-cream-3 #c9bba6` / `#2c2318` | 8.19 | línea de sede y hora |
| `$pd-neg-title #a8423f` / `#fbf8f3` | 5.64 | montos negativos, "Quitar mi foto" |
| `$pd-ink #2c2318` / `#fff7ea` · `$pd-terra-ink` / `#fff7ea` | 14.5 · 5.21 | nota de primera vez y sus links |
| `$pd-terra-ink #96593a` / `#f2ede5` | 4.76 | logo terracota del sello de antigüedad sin dorado |

Regla del rework que sigue vigente: ningún texto lleva color con transparencia. Las transparencias quedan solo en fondos, bordes y halos.

---

## Pantalla 1 — Encabezado de Mi Templo (B2, D-25 a D-27, D-53, D-60, D-61, D-66)

Un solo componente, `MiTemploHeader.vue`, que se monta en los dos lugares donde hoy está duplicado. En celular va dentro de `.mobile-greeting` (se va con el scroll). En escritorio va dentro de `q-header` (`.main-header--desktop`, ancho máximo 630, radio `0 0 12px 12px`), como hoy. Se borran el "Hola, …!", la fecha (`formatGreetingDate`), el contador de sesiones y el `HeaderLevelDropdown` del encabezado.

### Estructura

```
┌ degradé 135° #96593a → #7d5d42 · padding 8 16 16 · flex, align-items center, gap 12 ┐
│ [Foto 52]  [Nombre 22/600 + sello 21]                    [Ficha L1 ≥80×~56]  │
│            [Antigüedad 13/400, hasta 2 renglones]                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Foto (botón, 52×52, radio 50 %).** Al tocarla se abre `ProfilePhotoSheet` ahí mismo, sin salir de Mi Templo.

| Estado | Dibujo | `aria-label` |
|---|---|---|
| Con foto (`photo.url`) | `<img>` object-fit cover. Aro `box-shadow: 0 0 0 2px #f6efdc, 0 0 0 4px $pd-gold` | "Tu foto de perfil" |
| Sin foto (`status` `none` o `rechazada`, sin `url`) | fondo `rgba(255,255,255,.18)`, borde 2px punteado `rgba(255,255,255,.85)`, ícono `add_a_photo` 24 blanco, sin aro | "Subí tu foto de perfil" |
| En revisión (`pendingUrl`, sin `url`) | `<img>` de la pendiente con aro, más una insignia de 20 abajo a la derecha (`right/bottom -4`): círculo `$pd-light-surface` con ícono `schedule` 13 en `$pd-terra-ink`. **[ajuste]** el sketch la pintaba dorada, pero el dorado es solo de Aura | "Tu foto está en revisión" |
| En revisión con una aprobada (`url` y `pendingUrl`) | la aprobada con aro, más la insignia `schedule` | "Tu foto de perfil. Tenés una foto nueva en revisión" |
| La imagen falla al cargar (URL vencida, Pitfall 9) | iniciales sobre `$pd-btn-a → $pd-btn-b` y `/me` se vuelve a pedir una vez | igual que el estado de arriba |

**Nombre.** `h1`, Montserrat 600 22, blanco, en un renglón con elipsis. Usa `firstName` (o `displayName`; "Atleta" solo si el perfil no tiene nombre). El sello `VeteranSeal` va pegado a la derecha (margin-left 8, alto 21) y no se recorta.

**Sello de antigüedad sin dorado (D-61).** Mismo componente y forma (roseta con el logo), con estos tonos:

| Nivel | Hoy | Desde esta fase |
|---|---|---|
| Bronce (3 meses o más) | degradé `#e8c9a0 → #c98a4e → #8a5a2b`, logo blanco | sin cambios |
| Plata (6 meses o más) | degradé `#f2f3f6 → #c8ccd4 → #9aa0ab`, logo blanco | sin cambios |
| Oro (1 año o más) | degradé dorado, logo blanco y polvillo dorado | **roseta crema** (`#fbf8f3 → #f2ede5`, trazo `#d9cfc1`), **logo en `$pd-terra-ink`** (4.76:1) y **sin polvillo**. Es el "Sin dorado" del sketch 031 |

Con menos de 3 meses no hay sello, como hoy. El tooltip y el `aria-label` no cambian. Ver Decisión abierta 4.

**Antigüedad.** Geologica 400 13, blanco, line-height 1.3, como mucho 2 renglones. Sale de `memberSince` con un formateador puro (`formatTenure`, con test):

| Meses completos | Texto |
|---|---|
| 0 | "Tu primer mes en El Templo" |
| 1 | "1 mes en El Templo" |
| 2 a 11 | "N meses en El Templo" |
| 12 | "1 año en El Templo" |
| 13 a 23 | "1 año y M mes(es) en El Templo" |
| 24 o más | "N años" + (" y M mes(es)" si M > 0) + " en El Templo" |
| sin `memberSince` | no se dibuja la línea |

Va siempre, con o sin foto. Ver Decisión abierta 5.

**Ficha L1 de Aura (`AuraChip.vue`, botón).** Abre `AuraDetailSheet`.

- Marco: radio 16, padding 2, fondo con el filete de la sección Color y sombra `0 6px 16px rgba(60,40,15,.22)`.
- Interior: `min-width` 80, padding 8 16, radio 14, fondo `linear-gradient(180deg, #fffdf8, #f6efdc)`, columna centrada.
- Número: Montserrat 800 22, lh 1, `$pd-aura-deep`, tabular-nums, formato `es-AR`.
- Rótulo, a 4 del número: chispa "✦" (10px, `$pd-aura-spark`, `aria-hidden`) + "AURA" en Cinzel 700 11, tracking .18em, `$pd-gold-ink`.
- `aria-label`: "Tu Aura: 320. Ver el detalle".
- Al apretarla: `transform: scale(.97)` solo con `prefers-reduced-motion: no-preference`. Foco visible: `outline 2px #fff, offset 2px`.
- Con `auraEarned === 0` muestra "0". Con `auraEarned === null` (módulo apagado o falla) **no se dibuja**, y el nombre ocupa el lugar.
- Staff y alumnos la ven igual (D-58).

### Estados del encabezado

| Estado | Qué se ve |
|---|---|
| Cargando (`profile === null`) | `q-skeleton` (`animation="none"`, como hoy): círculo 52, barra 160×1.2em del nombre, barra 200×1.2em de la antigüedad, rectángulo 80×56 radio 16 de la ficha. Mismo alto final, sin saltos |
| Con foto | foto con aro, nombre + sello, antigüedad, ficha |
| Sin foto | círculo punteado con `add_a_photo`, nombre + sello, antigüedad, ficha |
| Foto en revisión | ver la tabla de la foto |
| Sin Aura todavía (`auraEarned === 0`) | ficha con "0", y el detalle muestra el estado vacío |
| Menos de 3 meses | sin sello. Antigüedad "Tu primer mes…" o "N meses…" |
| Módulo de Aura apagado | sin ficha |

**Ancho mínimo (360).** 360 − 32 − 52 − 24 − ficha (~84) deja unos 168 para los textos. El nombre se corta con elipsis y la antigüedad baja a 2 renglones. Probar a 360, 390 y 412 sin desborde horizontal.

**Después de un check-in** el store pone `auraEarned = auraTotal` (si llegó), así el encabezado se actualiza sin volver a pedir `/me`.

---

## Pantalla 2 — Selector de nivel en la barra de Entrenar (B2, D-55, D-62)

**Celular** (sketch 031 ronda 2, cuarto teléfono). En el `q-toolbar` de `MainLayout`, a la izquierda del botón de Perfil. Solo se ve con `route.name === 'training'` (`TrainingIndex`). No aparece en Mi Templo, en la Guía ni en los players.

- Disparador (`HeaderLevelDropdown variant="bar"`): pastilla de 36 de alto, padding `0 4 0 12`, radio 999, gap 4, fondo `rgba(44,35,24,.22)` (**[ajuste]** de contraste, ver Color), borde `1px rgba(255,255,255,.45)`. Lleva el glifo (Geologica 400 20, blanco), el nombre ("DELTA", Montserrat 700 13, tracking .06em, mayúsculas, blanco) y `expand_more` 18 blanco. El área tocable llega a 44 con `pd-hit-44`.
- `role="button"`, `aria-haspopup="menu"`, `aria-label="Nivel que estás viendo: Delta. Cambiar nivel"`. Se abre con Enter y con Espacio.
- Menú: el `q-menu` actual sin cambios (banner "Tu nivel:" / "Estás viendo:", ítems de 44, notify "Nivel cambiado a …"). Ancla `bottom right` / `self top right`.
- **Ancho de la barra.** Con el selector visible y la pantalla en menos de 420 px, se oculta la imagen del título "EL TEMPLO" y queda el logo de 32, que pasa a ser el link a Mi Templo (`aria-label="El Templo, ir a Mi Templo"`). Sin esto, la barra desborda a 360 y a 390 (logo, título de 106 px, pastilla de unos 115 y dos botones de 42).

**Escritorio** (no hay barra de arriba; **propuesta, ver Decisión abierta 1**). Una fila fina al principio de `EntrenarView`, arriba de las pestañas, alineada a la derecha y con padding `12 16 0`:

- `HeaderLevelDropdown variant="light"`: misma pastilla de 36, fondo `#fff`, borde `1px $pd-light-edge`. Glifo en `$pd-terra-ink`, nombre en `$pd-ink` (15.4:1) y chevron en `$pd-ink-2`.
- Se ve solo con `isDesktop` y `route.name === 'training'`, y también cuando `ENTRENAR_TABS_ENABLED` está apagado.

---

## Pantalla 3 — Card del horario y hoja "Quiénes van" (B3, D-01 a D-09, D-51, D-52, D-59, D-65)

### 3a. Fila "N anotados" en la card del horario (sketch 030 C2)

Solo en la grilla principal de Reservas (`ReservasPage.vue` ~665, socio con acceso a la grilla). No va en la grilla del modo prueba (~432) ni en la de la semana gratis de partner (~207).

- La card pasa a columna: `.slot-card__top` (lo de hoy: hora y actividad a la izquierda, chip y acción a la derecha) y debajo `.slot-card__who`.
- `.slot-card__who` es un `<button type="button">` a todo el ancho: `margin-top 8`, `padding-top 8`, `border-top 1px dashed $pd-light-line`, `min-height 44`, flex con gap 8. Lleva el texto "10 anotados" (Geologica 600 14, `$pd-ink`) y, al final, `chevron_right` 22 en `$pd-light-edge`. **Sin caras** (D-59).
- Se muestra si `bookedCount > 0`, el horario no es pasado y no es feriado. Con 0 anotados no hay fila y el chip sigue diciendo "Sé el primero".
- Para no repetir el número, cuando la fila está visible el chip de disponibilidad se muestra solo si es `few`, `last` o `full` ("Quedan 3 lugares", "Queda 1 lugar", "Completo"). El chip `available` ("N anotados") se oculta.
- `@click.stop`: abre la hoja y no dispara `onSlotTap` de la card.
- `aria-label`: "Ver quiénes van a las 18:00. 10 anotados".
- Texto: `bookedCount === 1` → "1 anotado"; si no, "N anotados".

### 3b. Hoja "Quiénes van" (`AttendeesSheet.vue`, sketch 030 C2 + 032 B)

`q-dialog position="bottom"` con `:transition-duration="reducedMotion ? 0 : 280"`.

- Card: ancho 100 %, `max-width 480`, `max-height 85vh`, fondo `$pd-light-surface`, radio `20px 20px 0 0`, sombra `0 -10px 40px rgba(44,35,24,.3)`. Flex en columna.
- Agarradera: 40×4, radio 2, `#d9cfc1`, margin `10 auto 4`.
- **Cabecera** (fija, padding `4 20 12`):
  - kicker "QUIÉNES VAN" (`pd-kicker-light`);
  - `h3` Heading 18 con "Viernes 16 · 18:00" (día de la semana con mayúscula + número + hora, en la zona de la sede);
  - una línea Label 13 en `$pd-ink-2`: "{total} de {maxCapacity} lugares · {activityName}".
- **Cuerpo** (scroll, padding `0 20 8`).
- **Pie** (fijo, padding `12 20` + `env(safe-area-inset-bottom)` + 8, `border-top 1px $pd-light-line`): un botón a todo el ancho, ver la tabla de abajo.

**Grilla de caras (032 B).**

- `display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 16px 8px; padding: 8px 0`.
- Celda: columna centrada, gap 4, `min-width 0`, `role="listitem"` (la grilla es `role="list"` con `aria-label="Anotados"`).
- `MemberAvatar` 56: foto (`object-fit cover`) o iniciales (primera letra de `firstName` + `lastInitial`, Montserrat 700 20, blanco sobre `$pd-btn-a → $pd-btn-b`).
- Nombre: Label 13/500 `$pd-ink`, un renglón con elipsis. Formato "Sofía M." (`firstName` + " " + `lastInitial` + "."), o solo "Sofía" si `lastInitial` es null. Nunca el apellido completo (no llega).
- Si `isMe`: el nombre dice **"Vos"**. **[ajuste]** el sketch C2 decía "Franco M. (vos)", que se corta en la columna de unos 76 px a 360.
- Fila de puntos (`min-height 20`, así los nombres quedan alineados): si `aura` no es null, pastilla `padding 2 8`, radio 999, fondo `$pd-gold-tint`, texto Montserrat 700 13 `$pd-gold-ink` con "✦ 320" (chispa `$pd-gold`, decorativa). Si `aura` es null (0 puntos, D-65, o módulo apagado): vacía. Sin etiquetas de profe, Wellhub ni nivel (D-04, D-52).
- `aria-label` de la celda: "Sofía M., 320 de Aura" o "Sofía M.".
- Orden: el del servidor (orden de reserva). La app no reordena (D-03, D-17).
- **Grupo de ocultos** (si `hiddenCount > 0`, siempre la última celda): círculo 56 fondo `#e9e1d5` con "+3" (Montserrat 700 17, `$pd-ink-2`), y debajo "más" (Label 13, `$pd-ink-2`). `aria-label="y otros 3 más"`. Sin pastilla.
- **Caras tocables:** solo las que tienen `photoId !== null` y no son `isMe`. Esas celdas son `<button>` con `aria-label="Ver la foto de Sofía M."` y abren `AttendeePhotoDialog`. El resto no es interactivo: fotos de ficha (`photoId` null), iniciales y la propia.

**Nota de primera vez (D-05)** si `canSeeList && !viewer.noticeSeen`. Va arriba de la grilla, en el cuerpo:

- caja: padding 12, radio 12, fondo `#fff7ea`, borde `1px #ecd9b8`, Body 14/1.4 `$pd-ink`, `role="note"`;
- texto **[BORRADOR]**: "Tu nombre de pila, la inicial de tu apellido, tu foto y tu Aura también aparecen en esta lista para tus compañeros.";
- dos links (Geologica 600 14, `$pd-terra-ink`, subrayados, cada uno con al menos 44 de alto), separados por 16: **"Entendido"** y **"Ocultarme"**;
- "Entendido": `POST notice-seen` y la nota se cierra;
- "Ocultarme": `POST notice-seen`, cierra la hoja y navega a `/profile#comunidad`, con foco en el interruptor de visibilidad, que se resalta 2 s con un contorno `$pd-terra-ink`;
- si la persona cierra la hoja sin tocar ninguno de los dos, la nota vuelve a aparecer la próxima vez.

**Pie de la hoja (acción):**

| Estado del horario | Botón | Acción |
|---|---|---|
| Se puede reservar | `pd-cta` 48: "Reservar 18:00" | cierra la hoja y corre **el mismo** `onSlotTap(slot)` de la card, con su diálogo de confirmación (Decisión abierta 8) |
| Completo y admite lista de espera | `pd-cta` + `pd-cta-secondary-light`: "Anotarme en la lista de espera" | cierra y corre `onSlotTap(slot)` |
| Ya reservado, pasado, especial bloqueado o feriado | `pd-cta-secondary-light`: "Cerrar" | cierra |

### 3c. Estados de la hoja

| Estado | Contenido del cuerpo |
|---|---|
| Cargando | 8 celdas de esqueleto (`q-skeleton type="circle" size="56px"` + barra 48×13), `aria-busy="true"`. La cabecera ya muestra día, hora y actividad. El total queda en esqueleto hasta que llega |
| Error (red o 5xx) | ícono `cloud_off` 32 `$pd-ink-2` + Body "No pudimos cargar quiénes van." + botón `pd-cta-secondary-light` "Reintentar". `role="alert"` |
| 404 | "Este horario ya no está disponible." + "Cerrar" |
| Nadie anotado (`total === 0`, por carrera con la grilla) | Heading "Todavía no hay nadie anotado" + Body "Reservá y sé el primero." |
| Quien mira está oculto (`reason: 'oculto'`) | nota: caja padding 12, radio 12, fondo `#f3ede4`, ícono `visibility_off` 20 `$pd-terra-ink`, Body 14 `$pd-ink-2`: "Estás oculto en las listas, por eso ves solo el número: hay **{total} anotados**." + link "Cambialo en Perfil" (→ `/profile#comunidad`) |
| Sin plan vigente (`reason: 'sin_plan'`) | misma nota con ícono `lock`: "Hay **{total} anotados**. La lista con nombres la ven los alumnos con plan vigente." |
| Nadie tiene foto | todas las celdas con iniciales. Es lo esperado al lanzar |
| 20 anotados | 5 filas de 4. El cuerpo scrollea, cabecera y pie quedan fijos. Con 20 + ocultos, la celda "+N" va al final |
| Lista vacía con ocultos (`attendees: []`, `hiddenCount > 0`) | solo la celda "+N más" |

### 3d. Vista de la foto y "Reportar foto" (D-34, D-45)

`AttendeePhotoDialog.vue` = `q-dialog` + `PremiumDialogCard tone="light"` (ancho máximo 340).

- Paso 1 (vista): foto en círculo de 160 centrada; debajo el nombre "Sofía M." (Heading 18) y la pastilla de puntos si tiene. Acciones: link `pd-skip` con ícono `flag` 18, "Reportar foto", y `pd-skip` "Cerrar".
- Paso 2 (confirmar, dentro del mismo diálogo):
  - `h3.pd-title`: "¿Reportar la foto de Sofía M.?"
  - `p.pd-text` **[BORRADOR]**: "La revisa el equipo de El Templo. Sofía no se entera de quién la reportó."
  - botones: `pd-cta` "Reportar" y `pd-skip` "Cancelar".
- Respuestas:
  - 204 → cierra y notify positive "Gracias. La vamos a revisar.";
  - 404 → "Esa foto ya no está disponible.";
  - 429 → "Ya enviaste varios reportes. Probá de nuevo en un rato.";
  - otro error → "No pudimos enviar el reporte. Probá de nuevo."
- El reporte no oculta la foto en la app: la decisión es del staff (plan 11).

---

## Pantalla 4 — Perfil (B1/B4, D-30 a D-35, D-43, D-50, D-63)

### 4a. Cabecera de Perfil

`profile-head__avatar` (64) pasa a `MemberAvatar` 64:

- muestra `photo.url`, si no `pendingUrl` con la insignia `schedule` (20, como en el encabezado), y si no las iniciales;
- sin aro dorado (el aro es del encabezado de Mi Templo);
- pasa a ser un `<button>` que abre `ProfilePhotoSheet`, con `aria-label` igual al del encabezado;
- sin foto lleva una insignia de cámara: círculo 24 `$pd-terra-ink` con `photo_camera` 14 blanco, abajo a la derecha.

### 4b. Sección nueva "Comunidad" (`id="comunidad"`, entre "Tu cuenta" y "Ajustes")

Título `profile-title` "Comunidad". Una `profile-card` con tres filas de 52, con el estilo de filas existente:

1. **Foto de perfil** (`<button class="profile-row profile-row--link">` → `ProfilePhotoSheet`):
   - ícono `photo_camera`, label "FOTO DE PERFIL" y `chevron_right`;
   - valor por estado:

   | `photo.status` | Valor (15/500) | Caption (13, `$pd-ink-2`) |
   |---|---|---|
   | `none` | "Subí tu foto" en `$pd-terra-ink` | "La primera foto aprobada suma 5 de Aura." |
   | `pendiente` | "En revisión" | "La ven tus compañeros cuando la aprobemos." |
   | `aprobada` | "Aprobada" | "Aparece en las listas de la clase." |
   | `rechazada` | "No fue aprobada" en `$pd-neg-title` | "Podés subir otra." |

2. **Aparecer en las listas** (`<label class="profile-row">` + `q-toggle color="primary"`, igual que Notificaciones):
   - texto **[BORRADOR]**: "Aparecer en las listas de la clase";
   - caption **[BORRADOR]**: "Tus compañeros ven tu nombre de pila, la inicial de tu apellido, tu foto y tu Aura. Si lo apagás, vos tampoco ves quiénes van.";
   - valor inicial `communityVisible` de `/me` (ya trae la regla de menores y del exterior aplicada);
   - al cambiarlo: `PUT visibility` optimista. Si sale bien, notify positive "Listo, ya no aparecés en las listas." o "Listo, ya aparecés en las listas.". Si falla, vuelve atrás y notify negative "No pudimos guardar el cambio. Probá de nuevo.";
   - sin diálogo de confirmación.

3. **Tu Aura** (`<button class="profile-row profile-row--link">` → `AuraDetailSheet`):
   - ícono `auto_awesome` en `$pd-terra-ink`, label "TU AURA";
   - valor "✦ 320": Montserrat 700 15, `$pd-gold-ink`, chispa decorativa `$pd-gold`;
   - `chevron_right`; `aria-label` "Tu Aura: 320. Ver el detalle";
   - si `auraEarned === null` la fila no se dibuja.

### 4c. Hoja de foto (`ProfilePhotoSheet.vue`)

Hoja clara, igual que "Quiénes van" (fondo `$pd-light-surface`, radio 20 arriba, `max-width 480`, padding `4 20`, agarradera).

**Vista principal:**

- kicker "TU FOTO" y título Heading 18 "Foto de perfil";
- vista previa: `MemberAvatar` 120 centrado, con la insignia `schedule` si hay pendiente;
- línea de estado (Body 15, centrada), según `photo.status`:
  - `none`: "Todavía no subiste tu foto."
  - `pendiente`: "Tu foto está en revisión. La ven tus compañeros cuando la aprobemos."
  - `aprobada`: "Tu foto está aprobada y aparece en las listas de la clase."
  - `rechazada`: "Tu última foto no fue aprobada. Podés subir otra."
- acciones (filas de 48 dentro de una `profile-card`):
  - en nativo, "Sacar una foto" (`photo_camera`) y "Elegir de la galería" (`photo_library`);
  - en web, "Elegir una foto" (`upload`), que abre un `<input type="file" accept="image/*">` oculto;
  - "Quitar mi foto" (`delete_outline`, texto e ícono `$pd-neg-title`), solo si hay `url` o `pendingUrl`;
- pie Label 13 `$pd-ink-2`: "La primera foto aprobada suma 5 de Aura." El número sale de la constante de montos de la app, no va escrito a mano.

**Flujo de subida:**

1. Tocar "Sacar una foto", "Elegir de la galería" o "Elegir una foto" abre primero **`PhotoRulesDialog`** (D-50), siempre, en cada subida:
   - `PremiumDialogCard tone="light"`; `h3.pd-title` "Antes de subir tu foto";
   - lista de normas **[BORRADOR, ver Copywriting]**;
   - botones: `pd-cta` "Acepto, elegir foto" y `pd-skip` "Cancelar".
2. Al aceptar se abre la fuente elegida:
   - en nativo, `Camera.getPhoto({ source: CameraSource.Camera | CameraSource.Photos, resultType: Base64, quality: 80, width: 1080, correctOrientation: true, saveToGallery: false })`. Nunca `CameraSource.Prompt`, porque su hoja viene en inglés (Pitfall 11);
   - en web, el `<input type="file">`.
   - Si la persona cancela la cámara o la galería: se vuelve a la vista principal, sin mensaje.
3. **Recorte:** cuadrado centrado automático a 480 px, JPEG 0.82, por canvas (`toAvatarJpeg`), en nativo y en web. Muestra la vista previa "Así se va a ver": círculo de 160 y caption "Se recorta al centro." Botones `pd-cta` "Subir foto" y `pd-skip` "Elegir otra". Ver Decisión abierta 6.
4. "Subir foto": el botón pasa a `loading` con "Subiendo…" y la hoja no se puede cerrar (`persistent`) hasta terminar. Llama a `upload-url` con `acceptedRules: true`, sube con `PUT` y confirma.
5. Si sale bien: vuelve a la vista principal en estado `pendiente` y muestra el notify positive "Listo. Tu foto quedó en revisión."

**Errores de la subida:**

| Caso | Texto |
|---|---|
| No se puede decodificar (HEIC en Chrome de escritorio) | "Ese formato no se puede abrir. Elegí una foto JPG o PNG." |
| Sin permiso de cámara | "No tenemos permiso para usar la cámara. Podés habilitarlo en los ajustes del teléfono o elegir una foto de la galería." |
| 503 (`FOTO_PERFIL_NO_DISPONIBLE`) | "Las fotos no están disponibles por ahora. Probá más tarde." |
| Red, PUT fallido o 409 (`FOTO_PERFIL_NO_SUBIDA`) | "No pudimos subir la foto. Revisá tu conexión y probá de nuevo." |
| 400 (`FOTO_PERFIL_INVALIDA` o clave) | "No pudimos procesar la foto. Probá con otra." |

Nunca hay un error "es muy pesada" (D-33).

**Quitar mi foto** (D-30, D-63): `PremiumDialogCard tone="light"`.

- `h3.pd-title.pd-title--neg`: "¿Quitar tu foto?"
- `p.pd-text` **[BORRADOR]**: "Se quita de tu perfil, de tu ficha y de las listas de la clase. Si sumaste Aura por tu foto, no se pierde."
- botones: `pd-cta pd-cta--neg` "Quitar foto" y `pd-skip` "Cancelar".
- 204 → estado `none` y notify "Listo, quitamos tu foto."; si falla, notify negative "No pudimos quitar la foto. Probá de nuevo."

---

## Pantalla 5 — Detalle privado de Aura (`AuraDetailSheet.vue`, D-13, D-57, D-66)

Hermano claro de la ficha L1 (sketch 031 ronda 3, el que se abre al tocar el Aura). `q-dialog position="bottom"`, card `max-width 480`, `max-height 88vh`, fondo `$pd-light-surface`, radio 20 arriba, con agarradera.

- **Total** (marco igual a la ficha): margin `12 16 4`, radio 20, padding 2 con el filete; el interior radio 18, padding `16 20`, fondo `#fffdf8 → #f6efdc`, centrado:
  - kicker "TU AURA" en Cinzel 700 11, tracking .2em, `$pd-gold-ink`;
  - total `earned` Montserrat 800 44, lh 1, `$pd-aura-deep`, precedido por "✦" de 24 en `$pd-aura-spark` (decorativo, alineado a 8 px arriba);
  - línea Label 13 `$pd-ink-2` con ícono `lock` 15: "Solo vos ves este detalle".
- **Título** `mt-block-title` "Últimos movimientos" (margin `16 20 4`).
- **Filas** de movimiento: `min-height 52`, padding `8 20`, `border-top 1px #f1eadf`, flex, gap 12.
  - A la izquierda: `label` (Body 15/500 `$pd-ink`) y debajo la fecha (Label 13 `$pd-ink-2`).
  - A la derecha: monto Montserrat 700 15, `$pd-gold-ink` con "+" si es positivo, o `$pd-neg-title` con "−" (U+2212) si es negativo.
  - **Sin ícono por motivo**, porque el servidor manda solo el texto (Decisión abierta 7). **[ajuste]** frente al sketch, que tenía íconos y la sede en cada fila.
- **Fecha** en la zona de la sede: "Hoy", "Ayer", y si no "Lun 10 nov" (día abreviado con mayúscula, número y mes abreviado). Si no es del año actual, se suma el año: "Lun 10 nov 2025".
- `aria-label` por fila: "Asistencia a clase, hoy, más 5" o "Asistencia anulada, jueves 6 de noviembre, menos 5".
- **Ver más:** botón `pd-cta-secondary-light` a todo el ancho menos 40 (margin `12 20 20`), alto 44, "Ver más". Pide `before = nextBefore`, suma las filas abajo, se pone en `loading` mientras carga y desaparece con `nextBefore === null`. Al cargar, el foco queda en la primera fila nueva.

**Estados:**

| Estado | Qué se ve |
|---|---|
| Cargando | el marco del total con un esqueleto de 120×44 y 6 filas de esqueleto (barra 160×15 + 80×13 y 32×15 a la derecha) |
| Vacío (`movements: []`) | total "0" + Heading 18 "Todavía no hay movimientos" + Body "Cuando sumes Aura, la vas a ver acá." Sin explicar cómo se gana (D-13) |
| Error | "No pudimos cargar tu Aura." + `pd-cta-secondary-light` "Reintentar" |
| Error en "Ver más" | las filas cargadas quedan; el botón vuelve con notify negative "No pudimos cargar más movimientos." |
| Módulo apagado (404 del guard) | la hoja no se abre: sin ficha ni fila no hay forma de llegar |

---

## Pantalla 6 — Celebración de asistencia (`CheckInCelebration.vue`, D-40, D-56, D-58, D-64)

Reemplaza el estado `success` de `CheckInPage.vue`. Pantalla completa sobre todo, barra de pestañas incluida:

- `position: fixed; inset: 0; z-index: 9999`, fondo `$pd-surface #2c2318`;
- padding 24 + zonas seguras (`env(safe-area-inset-*)`);
- columna centrada en vertical y horizontal, gap 8;
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` del kicker.

### Con Aura (`auraAwarded` > 0)

| Orden | Elemento | Estilo |
|---|---|---|
| 0 | Halo | `div` absoluto 320×320 centrado al 18 % del alto, `radial-gradient(circle, rgba(212,180,106,.32), transparent 65%)`, decorativo |
| 1 | Aro | 84×84, radio 50 %, `linear-gradient(135deg, #f5dd7e, $pd-gold 55%, #a8843a)`, ícono `check` 44 en `$pd-surface` |
| 2 | Kicker | "ASISTENCIA REGISTRADA" Cinzel 700 12 → **[ajuste]** 13, tracking .2em, `$pd-cream-2`, margin-top 16. Es el `id` del `aria-labelledby` |
| 3 | Monto | "+{auraAwarded}" Montserrat 800 68, lh 1, `$pd-gold-bright`, **sin chispa** (ajuste de Franco). El valor sale de la respuesta: con D-64 puede ser +2 o +5. Nunca va fijo |
| 4 | Rótulo | "AURA" Cinzel 700 13, tracking .24em, `$pd-gold` |
| 5 | Total | pastilla margin-top 16, padding `8 16`, radio 999, fondo `rgba(240,230,214,.1)`, Body 14 `$pd-cream`: "Tu Aura: " + chispa "✦" (`$pd-gold`, decorativa) + número Montserrat 700 15 `$pd-gold-bright` (`auraTotal`). Solo si `auraTotal` no es null |
| 6 | Sede y hora | Body 14 `$pd-cream-3`, margin `8 0 24`: "{Sede} · {HH:mm}". La sede es `branchName` con el reemplazo actual "El Templo X" → "Sede X", y la hora es `checkedInAt` en la zona de la sede |
| 7 | Botón | `pd-cta` 48, `min-width 200`: "Listo" |

### Sin Aura (`auraAwarded` null: el profe que se auto-registra, la visita que no acredita o el módulo apagado)

La misma pantalla, sin los pasos 3, 4 y 5:

- aro **salvia** (`$pd-sage` con `check` blanco, 6.24:1) y halo sin dorado (`rgba(240,230,214,.12)`). **[ajuste]** el sketch dejaba el aro dorado, pero el dorado es solo de Aura;
- después del kicker: título "¡Adentro!" (Montserrat 700 24, `$pd-cream`).

### Movimiento (con `prefers-reduced-motion: no-preference`)

| t (ms) | Qué pasa |
|---|---|
| 0 | fundido del fondo, 200 |
| 0 | aro: `pop` 500, `cubic-bezier(.2,.8,.2,1)` (escala .4 → 1.12 → 1) |
| 150 / 300 / 350 / 500 / 550 / 650 | entra (`rise` 400–450: translateY 14 → 0, opacidad 0 → 1) el kicker, el monto, el rótulo, el total, la sede y el botón, en ese orden |
| 700 | el número del total cuenta de `auraTotal − auraAwarded` hasta `auraTotal`, un paso cada 90 ms (como mucho 450 ms) |
| 0 → | el halo respira (opacidad .55 ↔ 1, 3 s) **dos ciclos y queda en .8**. No repite al infinito: se ve unas 3 veces por semana |

- El botón "Listo" funciona desde el primer frame. La animación nunca bloquea.
- **Con movimiento reducido:** sin `pop`, `rise`, conteo ni respiración. Todo aparece de una con los valores finales y el halo queda fijo en .8.
- Sin sonido ni vibración.

### Interacción y accesibilidad

- Al montar, foco en "Listo" (igual que `CelebrationFrame`).
- Región `aria-live="polite"` oculta que anuncia una vez: "Asistencia registrada. Sumaste 5 de Aura. Tu Aura: 320." Sin Aura: "Asistencia registrada en Sede Mario Bravo."
- El número que cuenta lleva `aria-hidden`; el anuncio ya tiene el valor final.
- "Listo" llama a `goBack()` (`router.back()`, como hoy). Antes, si `auraTotal` no es null, actualiza `auraEarned` en el store.
- La tecla Escape también cierra.
- Los estados de escaneo, permiso negado, error y carga de `CheckInPage` no cambian en esta fase.

---

## Pantalla 7 — Revisión de fotos en el admin (B6, D-31, D-32, D-45, D-46)

**Ubicación (propuesta, ver Decisión abierta 2):** página propia `FotosPerfilPage.vue` en la ruta `/alumnos/fotos`, registrada **antes** de `alumnos/:userId`. Ítem nuevo de nav en el grupo "Gestión", debajo de "Alumnos":

```ts
{ path: '/alumnos/fotos', label: 'Fotos', icon: 'face', roles: ALL_STAFF_ROLES, badge: 'fotos' }
```

- En el admin, `ALL_STAFF_ROLES` coincide con `MEMBER_ROLES` del API (D-46).
- La pelotita usa `adminStore.photoReviewCount` = `items.length` de la misma cola. No hace falta endpoint nuevo. Se refresca como los otros contadores del store y después de cada acción.
- No va en Feedback, porque Feedback es solo para dueños.

**Estilo:** el del admin (Quasar estándar, `q-page padding`, `text-h5`, `$primary` terracota). No se usa el lenguaje del rework de la app.

**Estructura:**

- Encabezado: `text-h5` "Fotos de perfil" + subtítulo `text-body2 text-grey-8` "Las fotos que suben los alumnos y las que reportaron. Las reportadas van primero."
- Grilla de `q-card flat bordered`: `col-12 col-sm-6 col-md-4 col-lg-3`, gutter `q-col-gutter-md`. Cada card:
  - foto `q-img` con `ratio 1`, radio 8 arriba. Al tocarla se abre un `q-dialog` con la foto a 480;
  - nombre completo `text-subtitle1 text-weight-medium` (el staff sí ve el apellido), con link "Ver ficha" → `/alumnos/:userId`;
  - sede (nombre sacado de `getBranches()` por `branchId`), en `text-caption text-grey-8`;
  - fecha "Subida el 17/11 a las 18:04" (`uploadedAt`), en `text-caption`;
  - chip de estado: `pendiente` → `q-chip` "Pendiente" (`color="warning" text-color="white"`, `#7d6520` con blanco 5.59); aprobada con reportes → "Reportada · N" (`color="negative"`) + "Último reporte: 17/11 18:04";
  - acciones (`q-card-actions align="between"`):

  | Estado | Acción principal | Acción secundaria |
  |---|---|---|
  | `pendiente` | `q-btn unelevated color="primary"` "Aprobar" | `q-btn flat color="negative"` "Rechazar" |
  | aprobada reportada | `q-btn outline color="primary"` "Mantener" (POST approve, que limpia los reportes) | `q-btn unelevated color="negative"` "Quitar" |

**Diálogos:**

- **Rechazar:**
  - `q-card` con título "Rechazar la foto de {Nombre}";
  - texto: "Le avisamos que no fue aprobada para que suba otra.";
  - si se acepta la Decisión abierta 3: `q-option-group type="radio"` con los motivos borrador;
  - botones "Rechazar" (`color="negative"`) y "Cancelar".
- **Quitar:** título "¿Quitar la foto de {Nombre}?", texto **[BORRADOR]** "Se quita también la foto de su ficha. El Aura que sumó no se toca.", botones "Quitar" (`negative`) y "Cancelar".
- Aprobar y Mantener van sin diálogo.

**Respuestas:**

- Al salir bien, la card sale de la grilla y aparece el notify:
  - "Foto aprobada. Sumó 5 de Aura." (si `auraAwarded`) o "Foto aprobada." (si no);
  - "Listo, la foto queda.";
  - "Foto rechazada.";
  - "Foto quitada.";
- 404 → notify warning "Esa foto ya no está en la cola." y se vuelve a pedir la lista;
- 503 → banner (abajo).

**Estados de la página:**

| Estado | Qué se ve |
|---|---|
| Cargando | 4 cards de esqueleto (`q-skeleton` cuadrado + 2 barras) |
| Vacío | centrado: `q-icon name="face" size="48px" color="grey-6"`, `text-h6` "No hay fotos para revisar", `text-body2 text-grey-8` "Cuando un alumno suba su foto o alguien reporte una, aparece acá." |
| Error | `q-banner` warning: "No pudimos cargar las fotos." + botón "Reintentar" |
| 503 (sin almacenamiento) | `q-banner` warning: "Las fotos no están disponibles por ahora." |
| `admin_sede` | ve solo las de sus sedes (lo hace el servidor). Sin filtro de sede en la UI |

---

## Copywriting Contract

Español rioplatense, con vos. **[BORRADOR]** = Franco lo tiene que aprobar antes de los builds.

| Element | Copy |
|---------|------|
| Primary CTA (hoja de anotados) | "Reservar 18:00" (hora del horario) |
| Primary CTA (foto) | "Acepto, elegir foto" → "Subir foto" |
| Primary CTA (celebración) | "Listo" |
| Fila del horario | "1 anotado" / "N anotados" |
| Kicker de la hoja | "QUIÉNES VAN" |
| Grupo de ocultos | "+3" / "más" (lector: "y otros 3 más") |
| Uno mismo en la grilla | "Vos" |
| Empty state heading (hoja) | "Todavía no hay nadie anotado" |
| Empty state body (hoja) | "Reservá y sé el primero." |
| Empty state heading (Aura) | "Todavía no hay movimientos" |
| Empty state body (Aura) | "Cuando sumes Aura, la vas a ver acá." |
| Empty state (admin) | "No hay fotos para revisar" / "Cuando un alumno suba su foto o alguien reporte una, aparece acá." |
| Error state (hoja) | "No pudimos cargar quiénes van." + "Reintentar" |
| Error state (Aura) | "No pudimos cargar tu Aura." + "Reintentar" |
| Error state (foto) | ver la tabla de errores de la Pantalla 4c |
| Oculto | "Estás oculto en las listas, por eso ves solo el número: hay **N anotados**." + "Cambialo en Perfil" |
| Sin plan | "Hay **N anotados**. La lista con nombres la ven los alumnos con plan vigente." |
| Destructive confirmation | Quitar mi foto: "¿Quitar tu foto?" / "Se quita de tu perfil, de tu ficha y de las listas de la clase. Si sumaste Aura por tu foto, no se pierde." **[BORRADOR]** |
| Destructive confirmation (admin) | Quitar: "¿Quitar la foto de {Nombre}?" / "Se quita también la foto de su ficha. El Aura que sumó no se toca." Rechazar: "Rechazar la foto de {Nombre}" / "Le avisamos que no fue aprobada para que suba otra." |
| Reporte | "¿Reportar la foto de Sofía M.?" / "La revisa el equipo de El Templo. Sofía no se entera de quién la reportó." **[BORRADOR]** → "Gracias. La vamos a revisar." |
| Celebración | "ASISTENCIA REGISTRADA" · "+5" · "AURA" · "Tu Aura: ✦ 320" · "Sede Mario Bravo · 18:04" · "Listo". Sin Aura: "¡Adentro!" |
| Detalle | "TU AURA" · "Solo vos ves este detalle" · "ÚLTIMOS MOVIMIENTOS" · "Ver más" |

### Borradores para aprobar (Franco)

**1. Normas para subir la foto** (D-50, `PhotoRulesDialog`). Título "Antes de subir tu foto", lista con viñetas:

> - Que sea una foto tuya, donde se te vea la cara.
> - Sin desnudos ni contenido sexual.
> - Sin insultos, símbolos ofensivos ni nada que discrimine.
> - Sin publicidad ni datos de contacto.
> - El equipo de El Templo revisa cada foto antes de mostrarla y puede quitarla en cualquier momento.
>
> Tu foto la ven los alumnos con plan vigente en las listas de la clase.

**2. Aviso de primera vez de la lista** (D-05):

> Tu nombre de pila, la inicial de tu apellido, tu foto y tu Aura también aparecen en esta lista para tus compañeros.
> **Entendido** · **Ocultarme**

**3. Interruptor de visibilidad** (D-06):

> **Aparecer en las listas de la clase**
> Tus compañeros ven tu nombre de pila, la inicial de tu apellido, tu foto y tu Aura. Si lo apagás, vos tampoco ves quiénes van.

**4. Permiso de cámara de iOS** (`NSCameraUsageDescription`, D-35; exige binario nuevo):

> El Templo necesita acceso a la cámara para escanear el código QR de asistencia, sacar tu foto de perfil, la foto del Desafío de la Barra, las fotos de tu control físico de Conquer y grabar los videos que le mandás a tu coach

`NSPhotoLibraryUsageDescription` queda como está: ya cubre "si elegís una foto … desde el dispositivo".

**5. Motivos de rechazo** (solo si se acepta la Decisión abierta 3). Lo que ve el staff → lo que dice la push al alumno (título fijo "Tu foto no fue aprobada"):

| Motivo (admin) | Cuerpo de la push |
|---|---|
| No se te ve la cara | "Subí una foto donde se te vea la cara. Podés hacerlo desde tu perfil." |
| No es una foto tuya | "Tiene que ser una foto tuya. Podés subir otra desde tu perfil." |
| Contenido que no va | "La foto no cumple las normas. Podés subir otra desde tu perfil." |
| Otro motivo | "Podés subir otra desde tu perfil." (el texto del plan 12) |

**6. Textos de cada movimiento de Aura** (`movement-labels.ts`, plan 15; donde cambian respecto del plan, se dice):

| Fuente | Texto | Cambio respecto del plan 15 |
|---|---|---|
| `attendance` | Asistencia a clase | era "Clase" |
| `manual_adjustment` / `attendance_reversal` | Asistencia anulada | — |
| `onboarding_completion` | Completaste tu perfil | — |
| `tenure_milestone` (ref meses) | "3 meses en El Templo", "1 año en El Templo" (sin ref: "Antigüedad en El Templo") | — |
| `streak_bonus` (ref N) | Racha de N sesiones (sin ref: "Racha") | — |
| `training_completion` | Entrenamiento en la app | — |
| `goal_plan_completion` | Sesión de tu plan | — |
| `extra_block` | Bloque libre | — |
| `stretch` | Estiramiento | — |
| `program_week_completion` | Semana de programa | — |
| `program_completion` | Programa completo | — |
| `profile_photo` | Foto de perfil | era "Subiste tu foto" |
| `manual_adjustment` (otro) | Ajuste de Aura | — |
| otro | Movimiento de Aura | — |

**7. Anuncio previo** (D-11; lo publica el staff como Novedad con push, destino `reservas`; opcional, no es pantalla):

> **Ahora ves quién va a tu clase.** En Reservas, tocá los anotados de cada horario. Si preferís no aparecer, podés ocultarte desde Perfil.

---

## Accesibilidad (resumen transversal)

- Tocables de 44×44 o más: foto, ficha, fila "N anotados", celdas con foto, links de la nota, pastilla del selector (con `pd-hit-44`), filas de Perfil (52) y botones de 48.
- Las hojas y diálogos son `q-dialog`, que atrapa el foco y lo devuelve al disparador al cerrar. Cada hoja tiene `aria-labelledby` apuntando a su título. La agarradera es decorativa (`aria-hidden`).
- Las imágenes de personas llevan `alt=""` porque el nombre ya está en el texto. Las chispas "✦" llevan `aria-hidden`.
- Los números de Aura se leen como "320 de Aura", nunca como "estrella 320".
- Los estados de carga llevan `aria-busy`, los errores `role="alert"` y las confirmaciones usan los notify existentes (píldora oscura).
- El foco visible es `outline 2px` en `$pd-terra-ink` sobre claro y blanco sobre el degradé.
- Movimiento: todo lo animado se apaga con `prefers-reduced-motion: reduce` (celebración, `scale` de la ficha, transición de las hojas con duración 0, pop del sello que ya existe).
- Navegación por teclado (web y escritorio): Tab recorre las celdas tocables en orden de reserva, y Enter o Espacio abren.
- Se mide con `contrast.py` sobre capturas a 360, 390 y 412: 0 fallas.

---

## Decisiones abiertas para Franco

En lenguaje llano y con la recomendación primero. Ninguna frena los planes: si no hay respuesta, el planificador sigue con la recomendada.

1. **Selector de nivel en la computadora.** En la computadora no hay barra de arriba. **Recomiendo** ponerlo arriba de las pestañas de Entrenar, a la derecha, como una pastilla clara con la letra y el nombre ("Δ DELTA ▾"). Alternativas: en la barra del costado, debajo del ícono de Entrenar (queda escondido cuando la barra está cerrada), o dejarlo en Mi Templo solo en la computadora (rompe "solo en Entrenar").
2. **Dónde revisa el staff las fotos en el admin.** **Recomiendo** un ítem nuevo "Fotos" en el grupo Gestión, con la pelotita roja de pendientes, que vean los mismos que ven Alumnos. Alternativas: un botón "Fotos por revisar" arriba de la lista de Alumnos (menos visible), o una pestaña en Feedback (no sirve: Feedback lo ven solo los dueños y las fotos las aprueban también profes y recepción).
3. **Motivo del rechazo.** **Recomiendo** que el staff elija un motivo de una lista corta y que la push al alumno diga cuál es (borradores en Copywriting 5). Es un cambio chico al plan 12: un campo opcional al rechazar. Alternativa: sin motivo, con la push genérica "Tu foto no fue aprobada. Podés subir otra desde tu perfil." (lo que ya está planificado).
4. **El sello de antigüedad sin dorado.** **Recomiendo** cambiar solo el de 1 año o más: roseta crema con el logo terracota y sin el polvillo dorado. El de bronce (3 meses) y el de plata (6 meses) quedan como hoy, así se siguen distinguiendo los tres. Alternativa: los tres iguales en crema, como el único sello del sketch.
5. **La línea de abajo del nombre cuando no hay foto.** En el sketch, sin foto decía "Subí tu foto y sumá 5 de Aura" en lugar de la antigüedad. **Recomiendo** mostrar siempre la antigüedad y que la invitación a subir la foto sea el círculo punteado con la camarita: al lanzar casi nadie tiene foto, y si no, casi nadie vería su antigüedad. Alternativa: lo del sketch.
6. **Recorte de la foto.** **Recomiendo** recortar al centro de forma automática y mostrar cómo va a quedar antes de subirla. Alternativa: dejar mover y agrandar la foto dentro del círculo (más código y más pruebas en iOS).
7. **Íconos en los movimientos de Aura.** El sketch tenía un ícono por motivo, pero el servidor manda solo el texto. **Recomiendo** dejarlos sin ícono en esta fase. Alternativa: sumar el tipo de movimiento a la respuesta (cambio chico al plan 15) y dibujar los íconos.
8. **Reservar desde la hoja "Quiénes van".** **Recomiendo** que el botón "Reservar 18:00" de la hoja abra el mismo diálogo de confirmación de siempre, con las mismas reglas. Alternativa: reservar directo desde la hoja sin confirmación, como en el sketch (es otro camino que hay que probar con prueba, especiales y lista de espera).
9. **Aura 0 en el encabezado.** **Recomiendo** mostrar la ficha con "0" (al tocarla, el detalle dice "Todavía no hay movimientos"). Alternativa: ocultar la ficha hasta el primer punto.
10. **Textos borrador.** Aprobar o corregir los 7 bloques de "Borradores para aprobar": normas de la foto, aviso de primera vez, interruptor, permiso de cámara de iOS, motivos de rechazo, textos de movimientos y anuncio.

Ajustes menores que tomé sin preguntar, por regla (avisar si alguno molesta):

- el aro de la celebración sin Aura va verde salvia y no dorado;
- la marca "en revisión" va en terracota y no dorada;
- en la grilla, uno mismo figura como "Vos" en lugar de "Franco M. (vos)";
- la pastilla del selector va con fondo oscuro translúcido y no con vidrio blanco (contraste).

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | ninguno (proyecto Vue/Quasar, sin shadcn) | not applicable |
| Third-party | ninguno | not applicable |

Sin dependencias nuevas (D-35).

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
