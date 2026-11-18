---
phase: 214
slug: comunidad-anotados-aura
status: draft
shadcn_initialized: false
preset: none
created: 2026-11-17
revised: 2026-11-17 (corrección de tipografía y espaciado pedida por el checker)
---

# Phase 214 — UI Design Contract

> Contrato visual y de interacción de las pantallas de la fase 214 (planes B1 a B6 de la segunda pasada).
> Generado por gsd-ui-researcher, lo valida gsd-ui-checker.

**Fuentes de verdad, en este orden:**

1. `214-CONTEXT.md`. Mandan las decisiones de número más alto. D-15 y D-54 están revocadas.
2. Sketches elegidos (decisiones cerradas, acá se transcriben): 030 **C2**, 031 **C + L1** (`ronda3.html`), 031 `ronda2.html` cuarto teléfono (selector en Entrenar), 032 **B** y 033 **B** (el "+N" sin chispa y la chispa antes del total).
3. Tokens del código: `el-templo-app/src/css/quasar.variables.scss`, `_brand.scss`, `_premium-card.scss` (`$pd-*`) y el rework de Mi Templo (`199-UI-SPEC.md`).

**Regla de transcripción.** Cuando el sketch tiene un valor puesto a mano y el código ya tiene un token, manda el token. Cada desvío respecto del sketch está marcado con **[ajuste]** y su motivo (contraste, escala de la fase o datos que el servidor no entrega).

**Regla de textos.** Los textos marcados **[BORRADOR]** son nuevos y Franco todavía no los aprobó. Los que no llevan marca salen de un sketch elegido, de un texto que ya existe en la app o de un plan del servidor. La tabla de Copywriting dice el origen de cada uno.

**Regla de montos.** Ningún monto de Aura va escrito a mano en un texto:

- la app usa una constante nueva `src/constants/aura-amounts.ts` (`AURA_AMOUNTS_UI.profilePhoto = 5`), espejo de `el-templo-api/src/modules/aura/amounts.ts` (plan 02);
- el admin usa `src/config/aura-amounts.ts` con el mismo valor;
- los montos que llegan del servidor (`auraAwarded`, `auraTotal`, `earned`) se muestran tal cual.

En este documento, "5 de Aura" significa `{AURA_AMOUNTS_UI.profilePhoto} de Aura`.

**Datos disponibles (planes vigentes al 2026-11-17, `214-01` a `214-18`).** La UI no usa ningún campo que no esté en esta lista:

| Origen | Campos | Plan |
|---|---|---|
| `GET /api/auth/me` | `firstName`, `memberSince`, `branchTimezone` (ya existen); `auraEarned: number \| null` (null = módulo apagado o falla de lectura) | 11 |
| `GET /api/auth/me` | `photoUrl`, `photo { url, status: 'none'\|'pendiente'\|'aprobada'\|'rechazada', pendingUrl }` | 15 |
| `GET /api/auth/me` | `communityVisible`, `communityNoticeSeen` | 16 |
| `PUT /api/members/scheduling/attendees/visibility` · `POST .../attendees/notice-seen` | `{ visible, noticeSeen }` · 204 | 16 |
| `GET /api/members/scheduling/slots/:scheduleId/:date/attendees` | `total`, `canSeeList`, `reason: 'ok'\|'sin_plan'\|'oculto'`, `attendees[{ firstName, lastInitial, photoUrl, photoId, aura, isMe }]`, `hiddenCount`, `viewer { visible, noticeSeen }` | 17 |
| `GET /api/members/aura/movements?before&limit` | `earned`, `movements[{ id, amount, label, createdAt }]`, `nextBefore` | 18 |
| Foto del alumno | `POST /api/members/profile-photo/upload-url { contentType: 'image/jpeg', acceptedRules: true }` → `{ uploadUrl, key, contentType, expiresIn }`; `PUT` directo a R2; `POST /profile-photo/confirm { key }` → `{ photoId, status: 'pendiente' }`; `DELETE /profile-photo` (204); `POST /profile-photos/:photoId/report` (204, tope 20 por minuto) | 14 (tienda privada: 13) |
| Check-in del socio | `branchName`, `checkedInAt` (ya existen) + `auraAwarded: number \| null`, `auraTotal: number \| null`. Por el tope del día, `auraAwarded` puede ser menor que 5 | 11 (tope: 10) |
| Admin | `GET /api/admin/members/profile-photos` → `items[{ photoId, userId, firstName, lastName, branchId, status, reportCount, lastReportedAt, uploadedAt, url }]`; `POST /:userId/profile-photo/approve` → `{ status, auraAwarded: boolean }`; `POST /:userId/profile-photo/reject`; `DELETE /:userId/profile-photo` | 15 |
| Grilla semanal (existente) | `WeeklySlotView.id`, `bookedCount`, `maxCapacity`, `activityName`, `startTime`, `branchName` | — |

**Lo que el servidor no entrega y por eso la UI no muestra:**

- rol u origen de los anotados (D-52);
- sede u horario de la clase en cada movimiento de Aura;
- tipo de movimiento (solo llega el texto `label`);
- motivo de rechazo de una foto (ver Decisión abierta 3);
- `displayName` (`/me` no lo devuelve). El nombre sale de `firstName`, y "Atleta" queda solo si es null, como hoy.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none. Quasar 2 + Vue 3, no React: el gate de shadcn no aplica |
| Preset | not applicable |
| Component library | Quasar (`q-dialog position="bottom"`, `q-menu`, `q-toggle`, `q-skeleton`, `q-img`) + componentes propios `PremiumDialogCard` (tone `light`), con `CelebrationFrame` como precedente |
| Icon library | Material Icons (la que ya usa Quasar en la app y el admin) |
| Font | Montserrat (títulos y números; cargada en 600, 700 y 800), Geologica (cuerpo; cargada en 400, 500 y 600, **no en 700**), Cinzel (kickers y rótulo AURA; cargada en 700). Todo con `@fontsource`, ya instalado |
| Dependencias nuevas | Ninguna. `@capacitor/camera` 8.2.0 ya instalado (`getPhoto` con `source` explícito, como Conquer) |

**Componentes nuevos (nombres sugeridos para el planificador):**

| Componente | Plan B | Reemplaza o reusa |
|---|---|---|
| `src/components/MiTemploHeader.vue` | B2 | une `MainLayout.vue:34-61` y `:111-139` |
| `src/components/AuraChip.vue` (ficha L1) | B2 | nuevo; lo usa el encabezado |
| `src/components/AuraDetailSheet.vue` | B2/B4 | nuevo; se abre desde el encabezado y desde Perfil |
| `src/components/MemberAvatar.vue` (foto o iniciales) | B2/B3/B4 | reemplaza las iniciales inline de `ProfilePage.vue:17` |
| `src/components/AttendeesSheet.vue` + `AttendeePhotoDialog.vue` | B3 | analogía: `SponsorSheet.vue` (hoja clara) |
| `src/components/ProfilePhotoSheet.vue` + `PhotoRulesDialog.vue` | B1/B4 | lógica en `useProfilePhoto.ts` (patrón `useBodyCheckCamera.ts`, con `cleanup()`) |
| `src/components/CheckInCelebration.vue` | B5 | reemplaza el estado `success` de `CheckInPage.vue:37-44` |
| `HeaderLevelDropdown.vue` con prop `variant: 'bar' \| 'light'` | B2 | mismo menú, cambia el disparador |
| Admin `src/pages/FotosPerfilPage.vue` | B6 | analogía: pestañas con pelotita de `ConquerPage.vue` y `MemberPhotoUpload.vue` |

**Estilos existentes que se reusan sin tocar** (quedan fuera de la escala de esta fase, porque no se crean acá): `slot-card` y sus chips, `profile-row` y `profile-row__label` (`pd-label-11`), el `q-menu` del nivel, `pd-cta`, `pd-skip`, `pd-title` y `pd-text` de `PremiumDialogCard`, los notify y las clases tipográficas de Quasar en el admin.

---

## Spacing Scale

Valores declarados (todos múltiplos de 4 y dentro del set 4/8/16/24/32/48/64):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | gap entre cara, nombre y pastilla en la grilla; entre número y rótulo de la ficha; margen inferior de la agarradera |
| sm | 8px | gap de columnas de la grilla; padding vertical de la ficha L1; separación de la fila "N anotados" dentro de la card; padding izquierdo de la pastilla del selector; margen superior de la agarradera |
| md | 16px | margen lateral de página; gap del encabezado (foto, textos, ficha); padding de cards y de notas; gap de filas de la grilla; padding horizontal de la ficha |
| lg | 24px | padding de la celebración; aire entre la sede y "Listo"; margen inferior del botón "Ver más" |
| xl | 32px | aire inferior de las hojas sobre la zona segura (16 + 16 de padding del pie) |
| 2xl | 48px | alto de `pd-cta` y de los botones de fila de la hoja de foto; alto de "Ver más" |
| 3xl | 64px | foto de Perfil (ya existe) |

**Excepciones:**

| Valor | Dónde | Por qué |
|---|---|---|
| 20px | solo el padding **horizontal** de las tres hojas (Quiénes van, Foto de perfil, Detalle de Aura) y lo que se alinea con ese borde (filas de movimientos, título de sección del detalle) | es el padding de `SponsorSheet.vue` (`10px 20px 22px`), la hoja clara que ya existe. Así todas las hojas de la app tienen el mismo borde |
| 2px | aro de la foto del encabezado (`0 0 0 2px` marfil + `0 0 0 4px` dorado) y filete de la ficha L1 y del total | son bordes, no espaciado. El sketch decía 1.5, **[ajuste]** a 2 |
| Existentes | `slot-card` (`padding 12px 12px 12px 16px`), `profile-row` (`padding 10px 16px`) | código existente que esta fase no toca |

Las medidas de componentes (36 de la pastilla del selector, 52 de la foto del encabezado, 56 de las caras, 84 del aro de la celebración, 20 y 24 de las insignias, 120 y 160 de las vistas previas) son tamaños, no espaciado. Todo lo tocable mide al menos 44×44.

---

## Typography

### Escala de la fase: 4 tamaños

| Role | Size | Weight | Line Height | Fuente | Dónde |
|------|------|--------|-------------|--------|-------|
| Label | 13px | 400 | 1.35 | Geologica | nombres en la grilla, antigüedad, captions, fechas de movimientos, línea de la cabecera de la hoja, "más" del grupo de ocultos |
| Label numérico | 13px | 700 | 1.2 | Montserrat | pastilla de puntos "✦ 320" en la grilla |
| Body | 15px | 400 | 1.5 | Geologica | textos de hojas, notas y diálogos; fila "N anotados"; links de la nota; valores de las filas nuevas de Perfil; textos de movimientos; línea de sede de la celebración; pastilla del total de la celebración |
| Body numérico | 15px | 700 | 1.2 | Montserrat | montos de cada movimiento; "✦ 320" de Perfil; número del total en la celebración |
| Heading | 18px | 700 | 1.2 | Montserrat | título de las hojas ("Viernes 16 · 18:00"); nombre en la vista de foto; títulos de estados vacíos; "+3" del grupo de ocultos; iniciales de las caras de 56; glifo del nivel en la pastilla |
| Display | 22px | 600 (nombre) / 800 (número de Aura) | 1.2 / 1.0 | Montserrat | nombre del encabezado (ya es 600 22); número de la ficha L1; título "¡Adentro!"; iniciales de las fotos de 64, 120 y 160 |

Cambios respecto de la versión anterior y del sketch:

- **[ajuste]** 14 → 15 en notas, fila "N anotados", links, línea de sede y pastilla del total;
- 17 → 18 en el "+3";
- 20 → 18 en las iniciales de 56 y en el glifo del nivel;
- 24 → 22 en "¡Adentro!";
- 23 → 22 en el número de la ficha L1.

### Pesos

**Declarados: 400 y 700.**

- 400 es el cuerpo en Geologica.
- 700 es Montserrat en títulos y números, y Cinzel en kickers (es el único peso cargado de Cinzel).
- Geologica nunca va en 700, porque ese peso no está cargado y el navegador lo dibujaría con negrita falsa. El énfasis en Geologica se hace con color (`$pd-ink`), no con peso.

**Excepciones, una por una:**

| Peso | Elemento | Motivo |
|---|---|---|
| 600 | nombre del encabezado de Mi Templo (Montserrat 22) | valor actual de `.header-greeting__name`, sin cambios |
| 600 | texto de los botones `pd-cta` (Geologica 15) | mixin existente `pd-cta` |
| 800 | número de la ficha L1 (22), total del detalle (44) y "+N" de la celebración (68) | numerales de Aura decididos en los sketches 031 y 033 |
| 800 | títulos de bloque "COMUNIDAD" y "ÚLTIMOS MOVIMIENTOS" (Montserrat 13) | mixin existente `mt-block-title` |

No se usa 500 en nada nuevo.

### Excepciones de tamaño, una por una

| Tamaño | Elemento | Motivo |
|---|---|---|
| 11px | kickers "QUIÉNES VAN", "TU FOTO", "TU AURA" y rótulo "✦ AURA" de la ficha L1 | mixin existente `pd-kicker-light` (Cinzel 700 11). En la ficha y en el total solo cambia el color a `$pd-gold-ink` y el tracking a .18em |
| 11px | label de fila de Perfil "FOTO DE PERFIL", "TU AURA" | clase existente `profile-row__label` (`pd-label-11`) |
| 44px | total del detalle de Aura (Montserrat 800, lh 1) | decidido en el sketch 031 ronda 3 |
| 68px | "+N" de la celebración (Montserrat 800, lh 1) | decidido en el sketch 033 B |
| 13px Cinzel 700 | "ASISTENCIA REGISTRADA" y "AURA" de la celebración | dentro de la escala (13); la fuente es Cinzel. **[ajuste]** del 12 del sketch a 13 |
| Admin | `text-h5`, `text-h6`, `text-subtitle1`, `text-body2`, `text-caption` | tipografía estándar del admin, igual al resto de sus páginas |

Todos los números de Aura usan `font-variant-numeric: tabular-nums` y separador de miles `es-AR` ("1.240"). Las chispas "✦" toman el tamaño del texto al que acompañan y son decorativas (`aria-hidden`).

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#f2ede5` página (`$brand-cream`, con `.app-bg` detrás) y `#fbf8f3` hojas y diálogos claros (`$pd-light-surface`) | fondo de Reservas, Perfil y Mi Templo; superficie de la hoja "Quiénes van", del detalle de Aura y de la hoja de foto |
| Secondary (30%) | `#ffffff` cards con borde `$pd-light-edge #8c806f` (controles) o `$pd-light-line #e5dbcd` (decorativo); degradé del encabezado `$brand-terracotta #96593a → $brand-aged-gold #7d5d42` a 135°; `#2c2318` (`$pd-surface`) fondo de la celebración | card del horario, cards de Perfil, encabezado de Mi Templo, celebración |
| Accent (10%) | familia Aura: `$pd-gold #d4b46a` (sobre oscuro), `$pd-gold-ink #7d6520` (texto sobre claro), `$pd-gold-tint #f6efdc` (fondo) y dos tokens nuevos: `$pd-aura-deep #6a5217` (número grande sobre marfil) y `$pd-gold-bright #f0d58f` (número grande sobre oscuro) | ver la lista de abajo |
| Acción (no es accent) | `$pd-terra-ink #96593a` y degradé `$pd-btn-a #a35f3c → $pd-btn-b #7e4529` | botones primarios (`pd-cta`), links, "Reservar", íconos de fila |
| Destructive | `$pd-neg-a #b34a4a → $pd-neg-b #8f3434` (botón) y `$pd-neg-title #a8423f` (texto) | "Quitar foto", "Quitar" en el admin, montos negativos del detalle de Aura, estado "No fue aprobada" |
| Hecho / OK | `$pd-sage #3f6a47` sobre `$pd-sage-tint #e9f0e6` | aro de la celebración **sin** Aura y chip "Reservado" (ya existe) |

**El dorado se usa solo en:**

1. la ficha L1 del encabezado (filete, fondo marfil, número y rótulo);
2. el aro de la foto en el encabezado de Mi Templo (ver Decisión abierta 11);
3. la pastilla de puntos de cada cara en "Quiénes van";
4. el valor "✦ 320" de la fila "Tu Aura" en Perfil;
5. el detalle de Aura (marco del total, total y montos positivos);
6. la celebración (aro dorado, "+N", "AURA" y el número de "Tu Aura"), solo cuando esa asistencia acreditó Aura.

**Nunca dorado:** botones, el sello de antigüedad (D-61), la marca "en revisión" de la foto, el selector de nivel y el aro de la celebración cuando no hubo Aura.

**Tokens nuevos** (van a `_premium-card.scss`, con el comentario del contraste):

```scss
$pd-aura-deep: #6a5217;    // número de Aura sobre marfil: 7.3:1 sobre #fffdf8, 6.5:1 sobre #f6efdc
$pd-gold-bright: #f0d58f;  // número de Aura grande sobre oscuro: 10.7:1 sobre #2c2318 (sketch 033)
$pd-aura-ivory-a: #fffdf8; // fondo de la ficha L1 y del total (arriba)
$pd-aura-spark: #c9a227;   // chispa ✦ sobre marfil: SOLO decorativa (aria-hidden), 2.4:1
// Filete de la ficha L1 y del total (decorativo):
// linear-gradient(125deg, #b8954a 0%, #e6cf8e 30%, #fff6da 48%, #e6cf8e 64%, #b8954a 100%)
```

**Contrastes medidos (WCAG, texto):**

| Par | Ratio | Uso |
|---|---|---|
| `$pd-aura-deep #6a5217` / `#f6efdc` (peor punto del degradé de la ficha) | 6.46 | número de la ficha y del total |
| `$pd-gold-ink #7d6520` / `#f6efdc` | 4.87 | rótulo "AURA" de la ficha, pastillas de puntos, "✦ 320" en Perfil. **[ajuste]** el sketch usaba `#8a6d1f`, que da 4.27 y no llega a AA |
| blanco / `#96593a` · blanco / `#7d5d42` | 5.55 · 5.97 | nombre y antigüedad del encabezado |
| blanco / pastilla del selector (`rgba(44,35,24,.22)` sobre el degradé) | ≥ 6.97 | selector de nivel en la barra. **[ajuste]** el sketch usaba vidrio blanco al 18 %, que da 3.8–4.0 |
| blanco / `$pd-btn-a #a35f3c` | 4.93 | iniciales sobre el círculo terracota. **[ajuste]** el sketch usaba `#b9785a`, que da 3.56 |
| `$pd-ink-2 #5f584d` / `#e9e1d5` | 5.42 | "+N" y "más" del grupo de ocultos |
| `$pd-gold-bright #f0d58f` / `#2c2318` | 10.74 | "+N" y total de la celebración |
| `$pd-gold #d4b46a` / `#2c2318` | 7.74 | "AURA" de la celebración |
| `$pd-cream-2 #e3c9a8` / `#2c2318` | 9.69 | kicker "ASISTENCIA REGISTRADA" |
| `$pd-cream-3 #c9bba6` / `#2c2318` | 8.19 | línea de sede y hora |
| `$pd-neg-title #a8423f` / `#fbf8f3` | 5.64 | montos negativos y "Quitar mi foto" |
| `$pd-ink #2c2318` / `#fff7ea` · `$pd-terra-ink` / `#fff7ea` | 14.5 · 5.21 | nota de primera vez y sus links |
| `$pd-terra-ink #96593a` / `#f2ede5` | 4.76 | logo terracota del sello de antigüedad sin dorado |

Regla del rework que sigue vigente: ningún texto lleva color con transparencia. Las transparencias quedan solo en fondos, bordes y halos.

---

## Foco visual por pantalla

1. **Encabezado de Mi Templo:** la ficha clara de Aura a la derecha. La foto con aro es lo segundo que se ve.
2. **Selector de nivel:** es secundario: la pastilla no compite con las pestañas de Entrenar.
3. **Hoja "Quiénes van":** las caras de la grilla, antes que los números.
4. **Perfil:** la foto de la cabecera y, en la sección Comunidad, la fila "Foto de perfil".
5. **Detalle de Aura:** el total grande dentro del marco marfil.
6. **Celebración:** el "+N" dorado. Sin Aura, el aro y "¡Adentro!".
7. **Revisión de fotos (admin):** la foto de cada card y sus dos botones.

---

## Pantalla 1 — Encabezado de Mi Templo (B2, D-25 a D-27, D-53, D-60, D-61, D-66)

Un solo componente, `MiTemploHeader.vue`, que se monta en los dos lugares donde hoy está duplicado:

- en celular, dentro de `.mobile-greeting` (se va con el scroll);
- en escritorio, dentro de `q-header` (`.main-header--desktop`, ancho máximo 630, radio `0 0 12px 12px`), como hoy.

Se borran el "Hola, …!", la fecha (`formatGreetingDate`), el contador de sesiones y el `HeaderLevelDropdown` del encabezado.

### Estructura

```
┌ degradé 135° #96593a → #7d5d42 · padding 8 16 16 · flex, align-items center, gap 16 ┐
│ [Foto 52]  [Nombre 22/600 + sello 21]                      [Ficha L1 ≥80×~56]  │
│            [Antigüedad 13/400, hasta 2 renglones]                              │
└────────────────────────────────────────────────────────────────────────────────┘
```

**[ajuste]** El gap del sketch era 12. Pasa a 16 por la escala.

**Foto (botón, 52×52, radio 50 %).** Al tocarla se abre `ProfilePhotoSheet` ahí mismo, sin salir de Mi Templo.

| Estado | Dibujo | `aria-label` |
|---|---|---|
| Con foto (`photo.url`) | `<img>` object-fit cover. Aro `box-shadow: 0 0 0 2px #f6efdc, 0 0 0 4px $pd-gold` (Decisión abierta 11) | "Tu foto de perfil" |
| Sin foto (`status` `none` o `rechazada`, sin `url`) | fondo `rgba(255,255,255,.18)`, borde 2px punteado `rgba(255,255,255,.85)`, ícono `add_a_photo` 24 blanco, sin aro | "Subí tu foto de perfil" |
| En revisión (`pendingUrl`, sin `url`) | `<img>` de la pendiente con aro, más una insignia de 20 abajo a la derecha (`right/bottom -4`): círculo `$pd-light-surface` con ícono `schedule` en `$pd-terra-ink`. **[ajuste]** el sketch la pintaba dorada, pero el dorado es solo de Aura | "Tu foto está en revisión" |
| En revisión con una aprobada (`url` y `pendingUrl`) | la aprobada con aro, más la insignia `schedule` | "Tu foto de perfil. Tenés una foto nueva en revisión" |
| La imagen falla al cargar (URL vencida, Pitfall 9) | iniciales (Display 22 Montserrat 700, blanco) sobre `$pd-btn-a → $pd-btn-b`, y `/me` se vuelve a pedir una vez | igual que el estado de arriba |

**Nombre.** `h1`, Montserrat 600 22, blanco, en un renglón con elipsis. Usa `firstName`, y "Atleta" solo si es null. El sello `VeteranSeal` va pegado a la derecha (margin-left 8, alto 21) y no se recorta.

**Sello de antigüedad sin dorado (D-61).** Mismo componente y forma (roseta con el logo):

| Nivel | Hoy | Desde esta fase |
|---|---|---|
| Bronce (3 meses o más) | degradé `#e8c9a0 → #c98a4e → #8a5a2b`, logo blanco | sin cambios |
| Plata (6 meses o más) | degradé `#f2f3f6 → #c8ccd4 → #9aa0ab`, logo blanco | sin cambios |
| Oro (1 año o más) | degradé dorado, logo blanco, polvillo dorado | **roseta crema** (`#fbf8f3 → #f2ede5`, trazo `#d9cfc1`), **logo en `$pd-terra-ink`** (4.76:1) y **sin polvillo**. Es el "Sin dorado" del sketch 031 |

Con menos de 3 meses no hay sello, como hoy. El tooltip y el `aria-label` no cambian. Ver Decisión abierta 4.

**Antigüedad.** Label 13/400, blanco, line-height 1.3, hasta 2 renglones. Sale de `memberSince` con un formateador puro (`formatTenure`, con test). Los textos son **[BORRADOR]**:

| Meses completos | Texto |
|---|---|
| 0 | "Tu primer mes en El Templo" |
| 1 | "1 mes en El Templo" |
| 2 a 11 | "N meses en El Templo" |
| 12 | "1 año en El Templo" |
| 13 a 23 | "1 año y M mes(es) en El Templo" |
| 24 o más | "N años" + (" y M mes(es)" si M > 0) + " en El Templo" |
| sin `memberSince` | no se dibuja la línea |

**[ajuste]** La antigüedad va siempre, con o sin foto. El sketch, sin foto, ponía "Subí tu foto y sumá 5 de Aura" en su lugar; acá la invitación a subir la foto es el círculo punteado. Ver Decisión abierta 5.

**Ficha L1 de Aura (`AuraChip.vue`, botón).** Abre `AuraDetailSheet`.

- Marco: radio 16, padding 2, fondo con el filete de la sección Color, sombra `0 6px 16px rgba(60,40,15,.22)`.
- Interior: `min-width` 80, padding `8 16`, radio 14, fondo `linear-gradient(180deg, #fffdf8, #f6efdc)`, en columna centrada.
- Número: Display 22 Montserrat 800, lh 1, `$pd-aura-deep`, tabular-nums, formato `es-AR`.
- Rótulo, a 4 del número: `pd-kicker-light` (Cinzel 700 11) con color `$pd-gold-ink` y tracking .18em. Dice "✦ AURA"; la chispa va en `$pd-aura-spark` y es decorativa.
- `aria-label`: "Tu Aura: 320. Ver el detalle".
- Al apretarla: `transform: scale(.97)`, solo con `prefers-reduced-motion: no-preference`.
- Foco visible: `outline 2px #fff`, offset 2px.
- Con `auraEarned === 0` muestra "0" (Decisión abierta 9).
- Con `auraEarned === null` (módulo apagado o falla) **no se dibuja**, y el nombre ocupa ese lugar.
- Staff y alumnos la ven igual (D-58).

### Estados

| Estado | Qué se ve |
|---|---|
| Cargando (`profile === null`) | `q-skeleton` (`animation="none"`, como hoy): círculo 52, barra 160×1.2em, barra 200×1.2em y rectángulo 80×56 radio 16. Mismo alto final, sin saltos |
| Con foto | foto con aro, nombre con sello, antigüedad y ficha |
| Sin foto | círculo punteado con `add_a_photo`, nombre con sello, antigüedad y ficha |
| Foto en revisión | ver la tabla de la foto |
| Sin Aura todavía (`auraEarned === 0`) | ficha con "0"; el detalle muestra su estado vacío |
| Menos de 3 meses | sin sello; antigüedad "Tu primer mes…" o "N meses…" |
| Módulo de Aura apagado | sin ficha |

**Ancho mínimo (360).** 360 − 32 − 52 − 32 − ficha (~84) deja unos 160 para los textos. El nombre se corta con elipsis y la antigüedad baja a 2 renglones. Probar a 360, 390 y 412 sin desborde horizontal.

**Después de un check-in** el store pone `auraEarned = auraTotal` (si llegó), así el encabezado se actualiza sin volver a pedir `/me`.

---

## Pantalla 2 — Selector de nivel en la barra de Entrenar (B2, D-55, D-62)

**Celular** (sketch 031 ronda 2, cuarto teléfono). Va en el `q-toolbar` de `MainLayout`, a la izquierda del botón de Perfil. Solo se ve con `route.name === 'training'` (`TrainingIndex`): no aparece en Mi Templo, en la Guía ni en los players.

- Disparador (`HeaderLevelDropdown variant="bar"`): pastilla de 36 de alto, padding `0 4 0 8` (**[ajuste]** el sketch tenía 10 a la izquierda), radio 999, gap 4.
- Fondo `rgba(44,35,24,.22)` (**[ajuste]** de contraste, ver Color) y borde `1px rgba(255,255,255,.45)`.
- Contenido: glifo (Heading 18, Montserrat 700, blanco), nombre ("DELTA", Label numérico 13 Montserrat 700, tracking .06em, mayúsculas, blanco) y `expand_more` blanco.
- El área tocable llega a 44 con `pd-hit-44`.
- `role="button"`, `aria-haspopup="menu"`, `aria-label="Nivel que estás viendo: Delta. Cambiar nivel"`. Se abre con Enter y con Espacio.
- Menú: el `q-menu` actual sin cambios (banner "Tu nivel:" / "Estás viendo:", ítems de 44, notify "Nivel cambiado a …"), anclado `bottom right` / `self top right`.
- **Ancho de la barra.** Con el selector visible y la pantalla en menos de 420 px, se oculta la imagen del título "EL TEMPLO" y queda el logo de 32, que pasa a ser el link a Mi Templo (`aria-label="El Templo, ir a Mi Templo"`). Sin esto, la barra desborda a 360 y a 390.

**Escritorio** (no hay barra de arriba; **propuesta, ver Decisión abierta 1**):

- una fila fina al principio de `EntrenarView`, arriba de las pestañas, alineada a la derecha, con padding `16 16 0`;
- `HeaderLevelDropdown variant="light"`: la misma pastilla de 36, con fondo `#fff` y borde `1px $pd-light-edge`; glifo en `$pd-terra-ink`, nombre en `$pd-ink` (15.4:1) y chevron en `$pd-ink-2`;
- se ve solo con `isDesktop` y `route.name === 'training'`, y también cuando `ENTRENAR_TABS_ENABLED` está apagado.

---

## Pantalla 3 — Card del horario y hoja "Quiénes van" (B3, D-01 a D-09, D-51, D-52, D-59, D-65)

### 3a. Fila "N anotados" en la card del horario (sketch 030 C2)

Va solo en la grilla principal de Reservas (`ReservasPage.vue` ~665, socio con acceso a la grilla). No va en la grilla del modo prueba (~432) ni en la de la semana gratis de partner (~207).

- La card pasa a columna:
  - `.slot-card__top`: lo de hoy (hora y actividad a la izquierda, chip y acción a la derecha);
  - `.slot-card__who`, debajo.
- `.slot-card__who` es un `<button type="button">` a todo el ancho:
  - `margin-top 8`, `padding-top 8`, `border-top 1px dashed $pd-light-line`, `min-height 44`, flex con gap 8;
  - texto "10 anotados" en Body 15/400 `$pd-ink`;
  - al final, `chevron_right` en `$pd-light-edge`;
  - **sin caras** (D-59).
- Se muestra si `bookedCount > 0`, el horario no es pasado y no es feriado. Con 0 anotados no hay fila y el chip sigue diciendo "Sé el primero".
- Para no repetir el número: con la fila visible, el chip de disponibilidad se muestra solo si es `few`, `last` o `full` ("Quedan 3 lugares", "Queda 1 lugar", "Completo"). El chip `available` ("N anotados") se oculta.
- `@click.stop`: abre la hoja y no dispara el `onSlotTap` de la card.
- `aria-label` **[BORRADOR]**: "Ver quiénes van a las 18:00. 10 anotados".
- Texto: `bookedCount === 1` → "1 anotado"; si no, "N anotados" (mismo helper que hoy).
- **Si la card y la hoja no coinciden, manda la hoja.** La card usa `bookedCount` de la grilla y la hoja usa `total` del endpoint de anotados, que excluye cuentas borradas y puede diferir en ±1. La card se corrige sola en la próxima recarga de la grilla.

### 3b. Hoja "Quiénes van" (`AttendeesSheet.vue`, sketch 030 C2 + 032 B)

`q-dialog position="bottom"` con `:transition-duration="reducedMotion ? 0 : 280"`.

- Card: ancho 100 %, `max-width 480`, `max-height 85vh`, fondo `$pd-light-surface`, radio `20px 20px 0 0`, sombra `0 -10px 40px rgba(44,35,24,.3)`, en columna.
- Agarradera: 40×4, radio 2, `#d9cfc1`, `margin 8 auto 4`.
- **Cabecera** (fija, padding `4 20 16`):
  - kicker "QUIÉNES VAN" (`pd-kicker-light`);
  - `h3` Heading 18: "Viernes 16 · 18:00" (día de la semana con mayúscula, número y hora, en la zona de la sede, `branchTimezone`);
  - línea Label 13/400 en `$pd-ink-2`: "{total} de {maxCapacity} lugares · {activityName}".
- **Cuerpo** (scroll, padding `0 20 8`).
- **Pie** (fijo, padding `16 20` + `env(safe-area-inset-bottom)`, `border-top 1px $pd-light-line`): un botón a todo el ancho (tabla de abajo).

**Grilla de caras (032 B):**

- `display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 16px 8px; padding: 8px 0`.
- Celda: columna centrada, gap 4, `min-width 0`, `role="listitem"`. La grilla es `role="list"` con `aria-label="Anotados"`.
- `MemberAvatar` 56: foto (`object-fit cover`) o iniciales (primera letra de `firstName` + `lastInitial`, Heading 18 Montserrat 700, blanco sobre `$pd-btn-a → $pd-btn-b`).
- Nombre: Label 13/400 `$pd-ink`, un renglón con elipsis. Formato "Sofía M." (`firstName` + " " + `lastInitial` + "."), o solo "Sofía" si `lastInitial` es null. Nunca el apellido completo (no llega).
- Si `isMe`: el nombre dice **"Vos"**. **[ajuste]** el sketch C2 decía "Franco M. (vos)", que se corta en la columna de unos 76 px a 360.
- Fila de puntos (`min-height 20`, así los nombres quedan alineados):
  - si `aura` no es null: pastilla `padding 0 8`, `min-height 20`, radio 999, fondo `$pd-gold-tint`, texto Label numérico 13/700 `$pd-gold-ink` "✦ 320" (chispa `$pd-gold`, decorativa);
  - si `aura` es null (0 puntos, D-65, o módulo apagado): vacía;
  - sin etiquetas de profe, Wellhub ni nivel (D-04, D-52).
- `aria-label` de la celda: "Sofía M., 320 de Aura" o "Sofía M.".
- Orden: el que manda el servidor (orden de reserva). La app no reordena (D-03, D-17).
- **Grupo de ocultos** (si `hiddenCount > 0`, siempre la última celda):
  - círculo 56 fondo `#e9e1d5` con "+3" (Heading 18 Montserrat 700, `$pd-ink-2`);
  - debajo "más" (Label 13/400, `$pd-ink-2`);
  - `aria-label="y otros 3 más"`, sin pastilla.
- **Caras tocables:** solo las que tienen `photoId !== null` y no son `isMe`. Esas celdas son `<button>` con `aria-label="Ver la foto de Sofía M."` y abren `AttendeePhotoDialog`. El resto no es interactivo: fotos de ficha (`photoId` null), iniciales y la propia.

**Nota de primera vez (D-05)**, si `canSeeList && !viewer.noticeSeen`, arriba de la grilla:

- caja: padding 16, radio 12, fondo `#fff7ea`, borde `1px #ecd9b8`, Body 15/400 `$pd-ink`, `role="note"`;
- texto **[BORRADOR]**: "Tu nombre de pila, la inicial de tu apellido, tu foto y tu Aura también aparecen en esta lista para tus compañeros.";
- dos links (Body 15/400, `$pd-terra-ink`, subrayados, cada uno de 44 de alto como mínimo), separados por 16: **"Entendido"** **[BORRADOR]** y **"Ocultarme"** **[BORRADOR]**;
- "Entendido": `POST notice-seen` y la nota se cierra;
- "Ocultarme": `POST notice-seen`, cierra la hoja y navega a `/profile#comunidad`, con foco en el interruptor de visibilidad (que se resalta 2 s con un contorno `$pd-terra-ink`);
- si la persona cierra la hoja sin tocar ninguno de los dos, la nota vuelve a aparecer la próxima vez.

**Pie de la hoja (acción):**

| Estado del horario | Botón | Acción |
|---|---|---|
| Se puede reservar | `pd-cta` 48: "Reservar 18:00" | cierra la hoja y corre **el mismo** `onSlotTap(slot)` de la card, con su diálogo de confirmación. **[ajuste]** en el sketch se reservaba directo desde la hoja (Decisión abierta 8) |
| Completo y admite lista de espera | `pd-cta` + `pd-cta-secondary-light`: "Anotarme en la lista de espera" **[BORRADOR]** | cierra y corre `onSlotTap(slot)` |
| Ya reservado, pasado, especial bloqueado o feriado | `pd-cta-secondary-light`: "Cerrar" | cierra |

### 3c. Estados de la hoja

| Estado | Contenido del cuerpo |
|---|---|
| Cargando | 8 celdas de esqueleto (`q-skeleton type="circle" size="56px"` + barra 48×13), `aria-busy="true"`. La cabecera ya muestra día, hora y actividad; el total queda en esqueleto hasta que llega |
| Error (red o 5xx) | ícono `cloud_off` 32 `$pd-ink-2` + Body **[BORRADOR]** "No pudimos cargar quiénes van." + botón `pd-cta-secondary-light` "Reintentar". `role="alert"` |
| 404 | **[BORRADOR]** "Este horario ya no está disponible." + "Cerrar" |
| Nadie anotado (`total === 0`, por carrera con la grilla) | Heading **[BORRADOR]** "Todavía no hay nadie anotado" + Body **[BORRADOR]** "Reservá y sé el primero." |
| Quien mira está oculto (`reason: 'oculto'`) | nota: padding 16, radio 12, fondo `#f3ede4`, ícono `visibility_off` `$pd-terra-ink`, Body 15/400 `$pd-ink-2`: **[BORRADOR]** "Estás oculto en las listas, por eso ves solo el número: hay {total} anotados." + link **[BORRADOR]** "Cambialo en Perfil" (→ `/profile#comunidad`) |
| Sin plan vigente (`reason: 'sin_plan'`) | la misma nota con ícono `lock`: **[BORRADOR]** "Hay {total} anotados. La lista con nombres la ven los alumnos con plan vigente." |
| Nadie tiene foto | todas las celdas con iniciales. Es lo esperado al lanzar |
| 20 anotados | 5 filas de 4. El cuerpo scrollea y cabecera y pie quedan fijos. Con 20 + ocultos, la celda "+N" va al final |
| Lista vacía con ocultos (`attendees: []`, `hiddenCount > 0`) | solo la celda "+N más" |

### 3d. Vista de la foto y "Reportar foto" (D-34, D-45)

`AttendeePhotoDialog.vue` = `q-dialog` + `PremiumDialogCard tone="light"` (ancho máximo 340).

- **Paso 1 (vista):**
  - foto en círculo de 160, centrada;
  - el nombre "Sofía M." (Heading 18) y la pastilla de puntos, si tiene;
  - acciones: link `pd-skip` con ícono `flag`, "Reportar foto" **[BORRADOR]**, y `pd-skip` "Cerrar".
- **Paso 2 (confirmar, en el mismo diálogo):**
  - `h3.pd-title` **[BORRADOR]**: "¿Reportar la foto de Sofía M.?"
  - `p.pd-text` **[BORRADOR]**: "La revisa el equipo de El Templo. Sofía no se entera de quién la reportó."
  - botones: `pd-cta` "Reportar" y `pd-skip` "Cancelar".
- **Respuestas:**
  - 204 → cierra y notify positive **[BORRADOR]** "Gracias. La vamos a revisar.";
  - 404 → "Esa foto ya no está disponible.";
  - 429 → "Ya enviaste varios reportes. Probá de nuevo en un rato.";
  - otro error → "No pudimos enviar el reporte. Probá de nuevo." (los tres **[BORRADOR]**).
- El reporte no oculta la foto en la app: la decisión es del staff (plan 14).

---

## Pantalla 4 — Perfil (B1/B4, D-30 a D-35, D-43, D-50, D-63)

### 4a. Cabecera de Perfil

`profile-head__avatar` (64) pasa a `MemberAvatar` 64:

- muestra `photo.url`; si no hay, `pendingUrl` con la insignia `schedule` (20, como en el encabezado); si no, las iniciales (Display 22, como hoy);
- sin aro dorado (el aro es del encabezado de Mi Templo);
- pasa a ser un `<button>` que abre `ProfilePhotoSheet`, con el mismo `aria-label` que en el encabezado;
- sin foto lleva una insignia de cámara: círculo 24 `$pd-terra-ink` con `photo_camera` blanco, abajo a la derecha.

### 4b. Sección nueva "Comunidad" (`id="comunidad"`, entre "Tu cuenta" y "Ajustes")

Título `profile-title` "Comunidad" **[BORRADOR]**. Una `profile-card` con tres filas de 52, con la estructura de filas existente.

**1. Foto de perfil** (`<button class="profile-row profile-row--link">` → `ProfilePhotoSheet`):

- ícono `photo_camera`, label "FOTO DE PERFIL" y `chevron_right`;
- el valor va en Body 15/**400** (**[ajuste]** las filas viejas de Perfil usan 500) y el caption en Label 13/400 `$pd-ink-2`.

| `photo.status` | Valor **[BORRADOR]** | Caption **[BORRADOR]** |
|---|---|---|
| `none` | "Subí tu foto" en `$pd-terra-ink` | "La primera foto aprobada suma {AURA_AMOUNTS_UI.profilePhoto} de Aura." |
| `pendiente` | "En revisión" | "La ven tus compañeros cuando la aprobemos." |
| `aprobada` | "Aprobada" | "Aparece en las listas de la clase." |
| `rechazada` | "No fue aprobada" en `$pd-neg-title` | "Podés subir otra." |

**2. Aparecer en las listas** (`<label class="profile-row">` + `q-toggle color="primary"`, igual que Notificaciones):

- texto **[BORRADOR]** (Body 15/400): "Aparecer en las listas de la clase";
- caption **[BORRADOR]** (Label 13/400): "Tus compañeros ven tu nombre de pila, la inicial de tu apellido, tu foto y tu Aura. Si lo apagás, vos tampoco ves quiénes van.";
- valor inicial: `communityVisible` de `/me`, que ya trae aplicada la regla de menores y del exterior;
- al cambiarlo, `PUT visibility` optimista:
  - si sale bien, notify positive **[BORRADOR]** "Listo, ya no aparecés en las listas." o "Listo, ya aparecés en las listas.";
  - si falla, vuelve atrás y notify negative **[BORRADOR]** "No pudimos guardar el cambio. Probá de nuevo.";
- sin diálogo de confirmación.

**3. Tu Aura** (`<button class="profile-row profile-row--link">` → `AuraDetailSheet`):

- ícono `auto_awesome` en `$pd-terra-ink` y label "TU AURA";
- valor "✦ 320" en Body numérico 15/700 Montserrat `$pd-gold-ink` (chispa `$pd-gold`, decorativa);
- `chevron_right`;
- `aria-label` "Tu Aura: 320. Ver el detalle";
- si `auraEarned === null`, la fila no se dibuja.

### 4c. Hoja de foto (`ProfilePhotoSheet.vue`)

Hoja clara, igual que "Quiénes van": fondo `$pd-light-surface`, radio 20 arriba, `max-width 480`, padding `4 20`, agarradera `margin 8 auto 4`.

**Vista principal:**

- kicker "TU FOTO" (`pd-kicker-light`) y título Heading 18 **[BORRADOR]** "Foto de perfil";
- vista previa: `MemberAvatar` 120 centrado (iniciales Display 22), con la insignia `schedule` si hay una pendiente;
- línea de estado (Body 15/400, centrada) **[BORRADOR]**:
  - `none`: "Todavía no subiste tu foto."
  - `pendiente`: "Tu foto está en revisión. La ven tus compañeros cuando la aprobemos."
  - `aprobada`: "Tu foto está aprobada y aparece en las listas de la clase."
  - `rechazada`: "Tu última foto no fue aprobada. Podés subir otra."
- acciones (filas de 48 dentro de una `profile-card`) **[BORRADOR]**:
  - en nativo, "Sacar una foto" (`photo_camera`) y "Elegir de la galería" (`photo_library`);
  - en web, "Elegir una foto" (`upload`), que abre un `<input type="file" accept="image/*">` oculto;
  - "Quitar mi foto" (`delete_outline`, texto e ícono `$pd-neg-title`), solo si hay `url` o `pendingUrl`;
- pie Label 13/400 `$pd-ink-2` **[BORRADOR]**: "La primera foto aprobada suma {AURA_AMOUNTS_UI.profilePhoto} de Aura."

**Flujo de subida:**

1. Tocar "Sacar una foto", "Elegir de la galería" o "Elegir una foto" abre primero **`PhotoRulesDialog`** (D-50), siempre, en cada subida:
   - `PremiumDialogCard tone="light"`; `h3.pd-title` **[BORRADOR]** "Antes de subir tu foto";
   - lista de normas **[BORRADOR, ver Copywriting]**;
   - botones `pd-cta` **[BORRADOR]** "Acepto, elegir foto" y `pd-skip` "Cancelar".
2. Al aceptar se abre la fuente elegida:
   - en nativo, `Camera.getPhoto({ source: CameraSource.Camera | CameraSource.Photos, resultType: Base64, quality: 80, width: 1080, correctOrientation: true, saveToGallery: false })`. Nunca `CameraSource.Prompt`, porque su hoja viene en inglés (Pitfall 11);
   - en web, el `<input type="file">`.
   - Si la persona cancela la cámara o la galería, se vuelve a la vista principal sin mensaje.
3. **Recorte:** cuadrado centrado automático a 480 px, JPEG 0.82, por canvas (`toAvatarJpeg`), en nativo y en web.
   - Vista previa con el título **[BORRADOR]** "Así se va a ver": círculo de 160 y caption **[BORRADOR]** "Se recorta al centro."
   - Botones `pd-cta` **[BORRADOR]** "Subir foto" y `pd-skip` **[BORRADOR]** "Elegir otra". Ver Decisión abierta 6.
4. "Subir foto": el botón pasa a `loading` con "Subiendo…" y la hoja queda `persistent` hasta terminar. Llama a `upload-url` con `acceptedRules: true`, sube con `PUT` y confirma.
5. Si sale bien: vuelve a la vista principal en estado `pendiente`, con notify positive **[BORRADOR]** "Listo. Tu foto quedó en revisión."

**Errores de la subida (todos [BORRADOR]):**

| Caso | Texto |
|---|---|
| No se puede decodificar (HEIC en Chrome de escritorio) | "Ese formato no se puede abrir. Elegí una foto JPG o PNG." |
| Sin permiso de cámara | "No tenemos permiso para usar la cámara. Podés habilitarlo en los ajustes del teléfono o elegir una foto de la galería." |
| 503 (`FOTO_PERFIL_NO_DISPONIBLE`) | "Las fotos no están disponibles por ahora. Probá más tarde." |
| Red, PUT fallido o 409 (`FOTO_PERFIL_NO_SUBIDA`) | "No pudimos subir la foto. Revisá tu conexión y probá de nuevo." |
| 400 (`FOTO_PERFIL_INVALIDA` o clave) | "No pudimos procesar la foto. Probá con otra." |

Nunca hay un error de "es muy pesada" (D-33).

**Quitar mi foto** (D-30, D-63): `PremiumDialogCard tone="light"`.

- `h3.pd-title.pd-title--neg` **[BORRADOR]**: "¿Quitar tu foto?"
- `p.pd-text` **[BORRADOR]**: "Se quita de tu perfil, de tu ficha y de las listas de la clase. Si sumaste Aura por tu foto, no se pierde."
- botones `pd-cta pd-cta--neg` "Quitar foto" y `pd-skip` "Cancelar".
- 204 → estado `none` y notify **[BORRADOR]** "Listo, quitamos tu foto."; si falla, notify negative **[BORRADOR]** "No pudimos quitar la foto. Probá de nuevo."

---

## Pantalla 5 — Detalle privado de Aura (`AuraDetailSheet.vue`, D-13, D-57, D-66)

Hermano claro de la ficha L1 (sketch 031 ronda 3, el que se abre al tocar el Aura). `q-dialog position="bottom"`, card `max-width 480`, `max-height 88vh`, fondo `$pd-light-surface`, radio 20 arriba y agarradera `margin 8 auto 4`.

- **Total**, con el mismo marco que la ficha:
  - margin `16 16 4`, radio 20, padding 2 con el filete;
  - interior: radio 18, padding 16, fondo `#fffdf8 → #f6efdc`, centrado;
  - kicker "TU AURA" (`pd-kicker-light` con color `$pd-gold-ink`, tracking .2em);
  - total `earned` en Montserrat 800 44, lh 1, `$pd-aura-deep`, precedido por la chispa "✦" en `$pd-aura-spark` (decorativa);
  - línea Label 13/400 `$pd-ink-2` con ícono `lock`: **[BORRADOR]** "Solo vos ves este detalle".
- **Título** `mt-block-title`: "Últimos movimientos" (margin `16 20 4`).
- **Filas de movimiento:** `min-height 52`, padding `8 20`, `border-top 1px #f1eadf`, flex con gap 16.
  - Izquierda: `label` (Body 15/400 `$pd-ink`) y debajo la fecha (Label 13/400 `$pd-ink-2`).
  - Derecha: monto en Body numérico 15/700 Montserrat. En `$pd-gold-ink` con "+" si es positivo; en `$pd-neg-title` con "−" (U+2212) si es negativo.
  - **Sin ícono por motivo**: el servidor manda solo el texto (Decisión abierta 7). **[ajuste]** el sketch tenía íconos y la sede en cada fila.
- **Fecha** en la zona de la sede (`branchTimezone`): "Hoy", "Ayer", o si no "Lun 10 nov" (día abreviado con mayúscula, número y mes abreviado). Si no es del año actual se suma el año: "Lun 10 nov 2025".
- `aria-label` de cada fila: "Asistencia a clase, hoy, más 5" o "Asistencia anulada, jueves 6 de noviembre, menos 5".
- **Ver más:** botón `pd-cta-secondary-light` a todo el ancho menos 40 (margin `16 20 24`), alto 48, texto "Ver más".
  - pide `before = nextBefore` y suma las filas abajo;
  - queda en `loading` mientras carga y desaparece con `nextBefore === null`;
  - al cargar, el foco va a la primera fila nueva.

**Estados:**

| Estado | Qué se ve |
|---|---|
| Cargando | el marco del total con un esqueleto de 120×44 y 6 filas de esqueleto (barra 160×15 + 80×13, y 32×15 a la derecha) |
| Vacío (`movements: []`) | total "0" + Heading 18 **[BORRADOR]** "Todavía no hay movimientos" + Body **[BORRADOR]** "Cuando sumes Aura, la vas a ver acá." Sin explicar cómo se gana (D-13) |
| Error | **[BORRADOR]** "No pudimos cargar tu Aura." + `pd-cta-secondary-light` "Reintentar" |
| Error en "Ver más" | las filas ya cargadas quedan; el botón vuelve, con notify negative **[BORRADOR]** "No pudimos cargar más movimientos." |
| Módulo apagado (404 del guard) | la hoja no se abre: sin ficha ni fila no hay forma de llegar |

---

## Pantalla 6 — Celebración de asistencia (`CheckInCelebration.vue`, D-40, D-56, D-58, D-64)

Reemplaza el estado `success` de `CheckInPage.vue`. Pantalla completa sobre todo, incluida la barra de pestañas:

- `position: fixed; inset: 0; z-index: 9999`;
- fondo `$pd-surface #2c2318`;
- padding 24 + zonas seguras (`env(safe-area-inset-*)`);
- columna centrada en vertical y horizontal, gap 8;
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` apuntando al kicker.

### Con Aura (`auraAwarded` > 0)

| Orden | Elemento | Estilo |
|---|---|---|
| 0 | Halo | `div` absoluto 320×320, centrado al 18 % del alto, `radial-gradient(circle, rgba(212,180,106,.32), transparent 65%)`, decorativo |
| 1 | Aro | 84×84, radio 50 %, `linear-gradient(135deg, #f5dd7e, $pd-gold 55%, #a8843a)`, ícono `check` 44 en `$pd-surface` |
| 2 | Kicker | "ASISTENCIA REGISTRADA": Cinzel 700 13, tracking .2em, `$pd-cream-2`, margin-top 16. Es el `id` del `aria-labelledby` |
| 3 | Monto | "+{auraAwarded}": Montserrat 800 68, lh 1, `$pd-gold-bright`, **sin chispa** (ajuste de Franco). El valor sale de la respuesta y por D-64 puede ser +2 o +5: nunca va fijo |
| 4 | Rótulo | "AURA": Cinzel 700 13, tracking .24em, `$pd-gold` |
| 5 | Total | pastilla con margin-top 16, padding `8 16`, radio 999, fondo `rgba(240,230,214,.1)`. Texto Body 15/400 `$pd-cream`: "Tu Aura: ", la chispa "✦" (`$pd-gold`, decorativa) y el número en Body numérico 15/700 `$pd-gold-bright` (`auraTotal`). Solo se muestra si `auraTotal` no es null |
| 6 | Sede y hora | Body 15/400 `$pd-cream-3`, margin `8 0 24`: "{Sede} · {HH:mm}". La sede es `branchName` con el reemplazo actual "El Templo X" → "Sede X", y la hora es `checkedInAt` en `branchTimezone` |
| 7 | Botón | `pd-cta` 48, `min-width` 200: "Listo" |

### Sin Aura (`auraAwarded` null: el profe que se auto-registra, la visita que no acredita o el módulo apagado)

La misma pantalla sin las filas 3, 4 y 5:

- aro **salvia**: `$pd-sage` con `check` blanco (6.24:1), y halo sin dorado (`rgba(240,230,214,.12)`). **[ajuste]** el sketch dejaba el aro dorado, pero el dorado es solo de Aura;
- después del kicker va el título "¡Adentro!" (Display 22, Montserrat 700, `$pd-cream`).

### Movimiento (con `prefers-reduced-motion: no-preference`)

| t (ms) | Qué pasa |
|---|---|
| 0 | fundido del fondo, 200 ms |
| 0 | aro: `pop` de 500 ms, `cubic-bezier(.2,.8,.2,1)`, escala .4 → 1.12 → 1 |
| 150 / 300 / 350 / 500 / 550 / 650 | entran, en este orden, el kicker, el monto, el rótulo, el total, la sede y el botón. Cada uno con `rise` de 400–450 ms: translateY 16 → 0 y opacidad 0 → 1 |
| 700 | el número del total cuenta de `auraTotal − auraAwarded` hasta `auraTotal`, un paso cada 90 ms, 450 ms como máximo |
| 0 → | el halo respira (opacidad .55 ↔ 1, ciclos de 3 s) **dos veces** y queda en .8. No se repite al infinito: esta pantalla se ve unas 3 veces por semana |

- El botón "Listo" funciona desde el primer frame. La animación nunca bloquea.
- **Con movimiento reducido:** sin `pop`, `rise`, conteo ni respiración. Todo aparece de una con los valores finales y el halo queda fijo en .8.
- Sin sonido ni vibración.

### Interacción y accesibilidad

- Al montar, el foco va a "Listo" (como en `CelebrationFrame`).
- Una región oculta `aria-live="polite"` anuncia una sola vez. Los números salen de la respuesta, no van escritos a mano:
  - con Aura: "Asistencia registrada. Sumaste {auraAwarded} de Aura. Tu Aura: {auraTotal}." **[BORRADOR]**;
  - sin Aura: "Asistencia registrada en {Sede}." **[BORRADOR]**.
- El número que cuenta lleva `aria-hidden`, porque el anuncio ya tiene el valor final.
- "Listo" llama a `goBack()` (`router.back()`, como hoy). Antes, si `auraTotal` no es null, pone `auraEarned` en el store. Escape también cierra.
- Los estados de escaneo, permiso negado, error y carga de `CheckInPage` no cambian en esta fase.

---

## Pantalla 7 — Revisión de fotos en el admin (B6, D-31, D-32, D-45, D-46)

**Ubicación (propuesta, ver Decisión abierta 2):** página propia `FotosPerfilPage.vue` en la ruta `/alumnos/fotos`, registrada **antes** de `alumnos/:userId`. Ítem nuevo de nav en el grupo "Gestión", debajo de "Alumnos":

```ts
{ path: '/alumnos/fotos', label: 'Fotos', icon: 'face', roles: ALL_STAFF_ROLES, badge: 'fotos' }
```

- En el admin, `ALL_STAFF_ROLES` coincide con `MEMBER_ROLES` del API (D-46).
- La pelotita usa `adminStore.photoReviewCount` = `items.length` de la misma cola, sin endpoint nuevo. Se refresca como los otros contadores del store y después de cada acción.

**Estilo:** el del admin (Quasar estándar, `q-page padding`, clases `text-*`, `$primary` terracota), no el lenguaje del rework de la app.

**Encabezado:**

- `text-h5` **[BORRADOR]** "Fotos de perfil";
- subtítulo `text-body2 text-grey-8` **[BORRADOR]** "Las fotos que suben los alumnos y las que reportaron. Las reportadas van primero."

**Grilla:** `q-card flat bordered`, columnas `col-12 col-sm-6 col-md-4 col-lg-3`, gutter `q-col-gutter-md`. Cada card tiene:

- foto `q-img` (`ratio 1`, radio 8 arriba); al tocarla se abre un `q-dialog` con la foto a 480;
- nombre completo en `text-subtitle1` (el staff sí ve el apellido) y el link "Ver ficha" → `/alumnos/:userId`;
- sede (nombre sacado de `getBranches()` con el `branchId`) en `text-caption text-grey-8`;
- fecha **[BORRADOR]** "Subida el 17/11 a las 18:04" (`uploadedAt`) en `text-caption`;
- chip de estado:
  - `pendiente` → `q-chip` "Pendiente" (`color="warning" text-color="white"`; `#7d6520` con blanco da 5.59);
  - aprobada con reportes → "Reportada · N" (`color="negative"`) y debajo "Último reporte: 17/11 18:04" (los dos **[BORRADOR]**);
- acciones (`q-card-actions align="between"`):

| Estado | Acción principal | Acción secundaria |
|---|---|---|
| `pendiente` | `q-btn unelevated color="primary"` "Aprobar" | `q-btn flat color="negative"` "Rechazar" |
| aprobada reportada | `q-btn outline color="primary"` "Mantener" **[BORRADOR]** (POST approve, que limpia los reportes) | `q-btn unelevated color="negative"` "Quitar" |

**Diálogos:**

- **Rechazar:**
  - título **[BORRADOR]** "Rechazar la foto de {Nombre}";
  - texto **[BORRADOR]** "Le avisamos que no fue aprobada para que suba otra.";
  - si se acepta la Decisión abierta 3, un `q-option-group type="radio"` con los motivos;
  - botones "Rechazar" (`negative`) y "Cancelar".
- **Quitar:**
  - título **[BORRADOR]** "¿Quitar la foto de {Nombre}?";
  - texto **[BORRADOR]** "Se quita también la foto de su ficha. El Aura que sumó no se toca.";
  - botones "Quitar" (`negative`) y "Cancelar".
- **Aprobar** y **Mantener** van sin diálogo.

**Respuestas:**

- Al salir bien, la card sale de la grilla y aparece el notify **[BORRADOR]**:
  - "Foto aprobada. Sumó {AURA_AMOUNTS.profilePhoto} de Aura." si `auraAwarded` es true, o "Foto aprobada." si no;
  - "Listo, la foto queda.";
  - "Foto rechazada.";
  - "Foto quitada.".
- 404 → notify warning **[BORRADOR]** "Esa foto ya no está en la cola." y se vuelve a pedir la lista.
- 503 → banner (tabla de estados).

**Estados de la página:**

| Estado | Qué se ve |
|---|---|
| Cargando | 4 cards de esqueleto (`q-skeleton` cuadrado + 2 barras) |
| Vacío | centrado: `q-icon name="face" size="48px" color="grey-6"`, `text-h6` **[BORRADOR]** "No hay fotos para revisar", `text-body2 text-grey-8` **[BORRADOR]** "Cuando un alumno suba su foto o alguien reporte una, aparece acá." |
| Error | `q-banner` warning **[BORRADOR]**: "No pudimos cargar las fotos." + "Reintentar" |
| 503 (sin almacenamiento) | `q-banner` warning **[BORRADOR]**: "Las fotos no están disponibles por ahora." |
| `admin_sede` | ve solo las de sus sedes (lo filtra el servidor); sin filtro de sede en la UI |

---

## Copywriting Contract

Español rioplatense, con vos.

Origen de cada texto:

- **Sketch**: está en un sketch elegido;
- **Existente**: ya está en la app;
- **Franco**: es literal de Franco;
- **[BORRADOR]**: es nuevo y falta que Franco lo apruebe.

| Element | Copy | Origen |
|---------|------|--------|
| Primary CTA (hoja de anotados) | "Reservar 18:00" (hora del horario) | Sketch 030 |
| Primary CTA (foto) | "Acepto, elegir foto" → "Subir foto" | [BORRADOR] |
| Primary CTA (celebración) | "Listo" | Sketch 033 |
| Fila del horario | "1 anotado" / "N anotados" | Existente (`slot-availability.ts`) |
| Kicker de la hoja | "QUIÉNES VAN" | Sketch 030/032 |
| Grupo de ocultos | "+3" / "más" (lector de pantalla: "y otros 3 más") | Sketch 032 + Franco ("y otros 3 más") |
| Uno mismo en la grilla | "Vos" | [BORRADOR] ([ajuste] de "(vos)") |
| Celebración | "ASISTENCIA REGISTRADA" · "+{auraAwarded}" · "AURA" · "Tu Aura: ✦ {auraTotal}" · "¡Adentro!" | Sketch 033 |
| Celebración, línea de sede | "{Sede} · {HH:mm}" | Sketch 033 (la hora es la del registro) |
| Detalle | "TU AURA" · "Últimos movimientos" · "Ver más" | Sketch 031 ronda 3 |
| Detalle, aviso de privacidad | "Solo vos ves este detalle" | [BORRADOR] |
| Empty state heading (hoja) | "Todavía no hay nadie anotado" | [BORRADOR] |
| Empty state body (hoja) | "Reservá y sé el primero." | [BORRADOR] |
| Empty state heading (Aura) | "Todavía no hay movimientos" | [BORRADOR] |
| Empty state body (Aura) | "Cuando sumes Aura, la vas a ver acá." | [BORRADOR] |
| Empty state (admin) | "No hay fotos para revisar" / "Cuando un alumno suba su foto o alguien reporte una, aparece acá." | [BORRADOR] |
| Error state (hoja) | "No pudimos cargar quiénes van." + "Reintentar" | [BORRADOR] |
| Error state (Aura) | "No pudimos cargar tu Aura." + "Reintentar" | [BORRADOR] |
| Error state (foto) | tabla de errores de la Pantalla 4c | [BORRADOR] |
| Oculto | "Estás oculto en las listas, por eso ves solo el número: hay N anotados." + "Cambialo en Perfil" | [BORRADOR] |
| Sin plan | "Hay N anotados. La lista con nombres la ven los alumnos con plan vigente." | [BORRADOR] |
| Antes de subir | "Antes de subir tu foto" · "Así se va a ver" · "Se recorta al centro." | [BORRADOR] |
| Destructive confirmation (app) | Quitar mi foto: "¿Quitar tu foto?" / "Se quita de tu perfil, de tu ficha y de las listas de la clase. Si sumaste Aura por tu foto, no se pierde." | [BORRADOR] |
| Destructive confirmation (admin) | Quitar: "¿Quitar la foto de {Nombre}?" / "Se quita también la foto de su ficha. El Aura que sumó no se toca." · Rechazar: "Rechazar la foto de {Nombre}" / "Le avisamos que no fue aprobada para que suba otra." | [BORRADOR] |
| Reporte | "¿Reportar la foto de Sofía M.?" / "La revisa el equipo de El Templo. Sofía no se entera de quién la reportó." → "Gracias. La vamos a revisar." | [BORRADOR] |
| Antigüedad | tabla de la Pantalla 1 | [BORRADOR] |
| Push de rechazo (sin motivos) | "Tu foto no fue aprobada" / "Podés subir otra desde tu perfil." | Plan 15 |

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

**5. Motivos de rechazo** (solo si se acepta la Decisión abierta 3). Lo que ve el staff → cuerpo de la push al alumno (título fijo "Tu foto no fue aprobada"):

| Motivo (admin) | Cuerpo de la push |
|---|---|
| No se te ve la cara | "Subí una foto donde se te vea la cara. Podés hacerlo desde tu perfil." |
| No es una foto tuya | "Tiene que ser una foto tuya. Podés subir otra desde tu perfil." |
| Contenido que no va | "La foto no cumple las normas. Podés subir otra desde tu perfil." |
| Otro motivo | "Podés subir otra desde tu perfil." (el texto del plan 15) |

**6. Textos de cada movimiento de Aura** (`movement-labels.ts`, plan 18):

| Fuente | Texto | Cambio respecto del plan 18 |
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

**7. Anuncio previo** (D-11). Lo publica el staff como Novedad con push, con destino `reservas`. Es opcional y no es pantalla:

> **Ahora ves quién va a tu clase.** En Reservas, tocá los anotados de cada horario. Si preferís no aparecer, podés ocultarte desde Perfil.

---

## Accesibilidad (resumen transversal)

- Tocables de 44×44 o más: foto, ficha, fila "N anotados", celdas con foto, links de la nota, pastilla del selector (`pd-hit-44`), filas de Perfil (52), botones de 48.
- Las hojas y los diálogos son `q-dialog`: atrapan el foco y lo devuelven al disparador al cerrar. Cada hoja tiene `aria-labelledby` apuntando a su título. La agarradera es decorativa (`aria-hidden`).
- Las imágenes de personas llevan `alt=""`, porque el nombre ya está en el texto. Las chispas "✦" llevan `aria-hidden`. Los números de Aura se leen "320 de Aura".
- Los estados de carga llevan `aria-busy` y los errores `role="alert"`. Las confirmaciones usan los notify existentes (la píldora oscura).
- Foco visible: `outline 2px` en `$pd-terra-ink` sobre fondo claro y en blanco sobre el degradé.
- Movimiento: todo lo animado se apaga con `prefers-reduced-motion: reduce`. Eso incluye la celebración, el `scale` de la ficha, la transición de las hojas (duración 0) y el pop del sello que ya existe.
- Teclado (web y escritorio): Tab recorre las celdas tocables en orden de reserva, y Enter o Espacio las abren.
- Se mide con `contrast.py` sobre capturas a 360, 390 y 412: 0 fallas.

---

## Decisiones abiertas para Franco

En lenguaje llano y con la recomendación primero. Ninguna frena los planes: si no hay respuesta, el planificador sigue con la recomendada.

1. **Selector de nivel en la computadora.** En la computadora no hay barra de arriba. **Recomiendo** ponerlo arriba de las pestañas de Entrenar, a la derecha, como una pastilla clara con la letra y el nombre ("Δ DELTA ▾"). Alternativas: en la barra del costado, debajo del ícono de Entrenar (queda escondido cuando esa barra está cerrada), o dejarlo en Mi Templo solo en la computadora (rompe "solo en Entrenar").
2. **Dónde revisa el staff las fotos en el admin.** **Recomiendo** un ítem nuevo "Fotos" en el grupo Gestión, con la pelotita roja de pendientes, visible para los mismos que ven Alumnos. Alternativas: un botón "Fotos por revisar" arriba de la lista de Alumnos (menos visible), o una pestaña en Feedback (no sirve: Feedback lo ven solo los dueños y las fotos las aprueban también profes y recepción).
3. **Motivo del rechazo.** **Recomiendo** que el staff elija un motivo de una lista corta y que la push al alumno diga cuál es (borradores en Copywriting 5). Es un cambio chico al plan 15: un campo opcional al rechazar. Alternativa: sin motivo, con la push genérica "Tu foto no fue aprobada. Podés subir otra desde tu perfil.", que es lo que el plan 15 ya tiene.
4. **El sello de antigüedad sin dorado.** **Recomiendo** cambiar solo el de 1 año o más: roseta crema con el logo terracota y sin el polvillo dorado. Los de bronce (3 meses) y plata (6 meses) quedan como hoy, así se siguen distinguiendo los tres. Alternativa: los tres iguales en crema, como el único sello del sketch.
5. **La línea de abajo del nombre cuando no hay foto.** En el sketch, sin foto decía "Subí tu foto y sumá 5 de Aura" en lugar de la antigüedad. **Recomiendo** mostrar siempre la antigüedad y que la invitación a subir la foto sea el círculo punteado con la camarita: al lanzar casi nadie tiene foto, y casi nadie vería su antigüedad. Alternativa: lo del sketch.
6. **Recorte de la foto.** **Recomiendo** recortarla sola al centro y mostrar cómo va a quedar antes de subirla. Alternativa: dejar que la persona la mueva y la agrande dentro del círculo (más trabajo y más pruebas en iPhone).
7. **Íconos en los movimientos de Aura.** El sketch tenía un ícono por motivo, pero el servidor manda solo el texto. **Recomiendo** dejarlos sin ícono en esta fase. Alternativa: que el servidor mande también el tipo de movimiento (cambio chico al plan 18) y dibujar los íconos.
8. **El botón "Reservar" dentro de la lista de quiénes van.** **Recomiendo** que, al tocarlo, aparezca la misma ventanita de confirmación que sale hoy al tocar "Reservar" en la card del horario. Así se reserva igual que siempre, con los mismos avisos y reglas. Alternativa: reservar en el acto, sin esa ventanita, como mostraba el sketch. Es más rápido, pero es una forma nueva de reservar que hay que volver a probar con clases de prueba, actividades especiales y lista de espera.
9. **Aura en 0 en el encabezado.** **Recomiendo** mostrar la ficha con un "0" (al tocarla, el detalle dice "Todavía no hay movimientos"). Alternativa: no mostrar la ficha hasta que la persona sume su primer punto.
10. **Textos borrador.** Aprobar o corregir los 7 bloques de "Borradores para aprobar" y los textos marcados [BORRADOR] en la tabla de Copywriting.
11. **El aro dorado de la foto en el encabezado.** En el sketch, la foto lleva un aro dorado que la une con el Aura. Todo lo demás que es dorado aparece solo cuando hay Aura de por medio, pero este aro aparece siempre. **Recomiendo** dejarlo dorado siempre que se vea la ficha de Aura, aunque la persona tenga 0, porque marca el encabezado como "tu lugar con Aura"; y pasarlo a blanco cuando el Aura está apagada para el gimnasio y no hay ficha. Alternativa: aro blanco siempre, y el dorado queda solo en la ficha.

Ajustes menores que tomé sin preguntar, por regla (avisar si alguno molesta):

- el aro de la celebración sin Aura va verde salvia, no dorado;
- la marca "en revisión" va en terracota, no dorada;
- en la grilla, uno mismo dice "Vos" y no "Franco M. (vos)";
- la pastilla del selector tiene fondo oscuro translúcido y no vidrio blanco (contraste);
- tamaños y espacios redondeados a la escala de la fase (14 → 15, 12 → 16, etc.).

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
