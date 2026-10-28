---
phase: 201-conquer
plan: 28
subsystem: app/conquer (base visual)
tags: [conquer, estetica-b, tokens, wcag, scss, vue]
requires: [201-27]
provides:
  - tokens --cq-* de la variante B (solo bajo .cq-root) y utilidades del templo clásico
  - CqScreen, CqButton, CqPortico (nuevos) y CqPageHeader, CqGreek, CqTemple, CqLevelIcon (restilizados)
  - ConquerTab (cargando/error) y ConquerBlocked/pedido migrados
affects: [201-29, 201-30, 201-31, 201-32, 201-33, 201-34, 201-35]
key-files:
  created:
    - el-templo-app/src/modules/conquer/styles/__tests__/conquer-tokens.test.ts
    - el-templo-app/src/modules/conquer/components/brand/CqScreen.vue
    - el-templo-app/src/modules/conquer/components/brand/CqButton.vue
    - el-templo-app/src/modules/conquer/components/brand/CqPortico.vue
  modified:
    - el-templo-app/src/modules/conquer/styles/conquer.scss
    - el-templo-app/src/modules/conquer/components/brand/{CqPageHeader,CqGreek,CqTemple,CqLevelIcon}.vue
    - el-templo-app/src/modules/conquer/components/{ConquerTab,ConquerBlocked}.vue
metrics:
  tasks: 3
  commits: 3
---

# Phase 201 Plan 28: base visual del templo clásico (variante B) Summary

Base de la estética B del sketch 022 con las fuentes del app: `conquer.scss` reescrito (tokens solo bajo `.cq-root`, sin
Cormorant ni `@fontsource`, bloque LEGADO marcado), test de CI de contraste WCAG y alcance, tres piezas nuevas
(`CqScreen`, `CqButton`, `CqPortico`), cuatro restiladas y la tab (cargando/error) más Bloqueado/pedido ya migrados.

## Commits

| Tarea | Commit | Mensaje |
| --- | --- | --- |
| 1 | `b6a459768` | `feat(201-28): tokens del templo clásico para Conquer, sin Cormorant (DA-15, DA-17)` (incluye el test) |
| 2 | `db67a2ce5` | `feat(201-28): piezas base del templo clásico — pantalla, botón, pórtico, cabecera, letras griegas y templo (DA-16)` |
| 3 | `7756eee8d` | `feat(201-28): Bloqueado y estados de la tab con el templo clásico (hallazgo 2)` |

El SUMMARY se commitea aparte con `docs(201-28)`.

## Lista FINAL de tokens (todos dentro de `.cq-root` en `styles/conquer.scss`)

- Neutros: `--cq-surface` `--cq-surface-2` `--cq-sand` `--cq-text` `--cq-text-2` `--cq-line` `--cq-edge` `--cq-field-edge`
  `--cq-sage` `--cq-sage-tint` `--cq-on-sage` (los `$pd-*` salen de `_premium-card.scss`, ningún hex del app repetido).
- Submarca: `--cq-night` `--cq-night-2` `--cq-deco-gold` (solo decoración) `--cq-text-gold` `--cq-edge-gold` `--cq-tint-cream`.
- Sobre azul noche: `--cq-on-night` `--cq-on-night-hi` `--cq-on-night-gold` `--cq-on-night-2`.
- Fuentes: `--cq-font-body` (Geologica) `--cq-font-head` (Montserrat) `--cq-font-kicker` (Cinzel) `--cq-font-greek` (Geologica).
- Interno: `--cq-paper` (lo define `.cq-dark` en `--cq-night`; lo lee `CqLevelIcon`).

## Utilidades FINALES (todas descendientes de `.cq-root`)

`.cq-title` `.cq-block-title` `.cq-kicker` `.cq-sub` `.cq-num` `.cq-row` · `.cq-card` `.cq-card--flush` `.cq-card--sel` ·
`.cq-dark` (también `.cq-root.cq-dark`; adentro redefine kicker, sub, num, title, textlink, level-icon y foco) ·
`.cq-chip` + `--rango|techo|bajo|neutro|subir|hecha` · `.cq-btn` + `--primary|on-night|secondary|ghost-night|subir|small` ·
`.cq-textlink` `.cq-rowlink` (+ `__chev`) `.cq-q` `.cq-notice` `.cq-select` `.cq-field` `.cq-seg` (+ `__opt`, `--on`,
`aria-pressed|aria-checked=true`) `.cq-meander` `.cq-enter` (solo bajo `no-preference`). `@keyframes pd-sheen` (del mixin)
y `cq-enter` quedan a nivel raíz de la hoja.

## API de las piezas

- `CqScreen` (slot, sin props): `<div class="cq-root cq-screen">`, importa la hoja; transparente, columna, `gap 16`,
  `padding 16 16 24`, `min-width 0`, `flex: 1 1 auto`.
- `CqButton` `{ label, variant?: 'primary'|'on-night'|'secondary'|'ghost-night'|'subir', small?, loading?, disabled?, type?: 'button'|'submit' }`,
  emite `click`. Spinner CSS propio (clase `cq-button__spin`), `aria-busy` mientras `loading`.
- `CqPortico` `{ columns?: boolean }` (default `true`) + slot: `<section class="cq-dark cq-portico">` radio 20, padding
  18 16. El contenido va dentro de un `div.cq-portico__body` (columna, `gap 14`, `position: relative; z-index: 1`) con el
  halo y la columnata (`aria-hidden`, `pointer-events: none`) detrás. El halo respira solo bajo `no-preference`.
- `CqPageHeader` (mismas props/eventos): atrás 44×44 en `--cq-night`, `h2.cq-title`, subtítulo `p.cq-sub`; sin meandro.
- `CqGreek` suma `size?: 'md'|'sm'` (34/28 px). `CqTemple` (mismas props): para SOBRE `.cq-dark`. `CqLevelIcon` (mismas props):
  azul noche por defecto, `--cq-on-night-hi` dentro de `.cq-dark`, papel blanco salvo que `.cq-dark` lo ponga en azul noche.

## Bloque LEGADO (lo borra 201-34) y quién lo usa todavía

Segundo bloque `.cq-root` al final de `conquer.scss`, con los tokens de DA-20 (`--cq-sky1..3`, `--cq-deep`, `--cq-sun`,
`--cq-muted`, `--cq-cloud*`, `--cq-ink*`, `--cq-glass`, `--cq-hair*`, `--cq-gold*`, `--cq-cream`, `--cq-subir-*`,
`--cq-pad-*`, `--cq-body`, `--cq-display` = `var(--cq-font-head)`) y las utilidades `.cq-display` `.cq-ital` `.cq-caps`
`.cq-rule` `.cq-grow` `.cq-toast` `.cq-link` `.cq-cta` `.cq-small` `.cq-foot`. Todavía lo usan (con `CqSky`/`CqSun`/`CqCloudButton`):
`ConquerHome.vue`, `today/CqSaveSheet.vue`, `ConquerLevelsPage`, `ConquerTodayPage`, `ConquerSaturdayPage`,
`ConquerProgressPage`, `ConquerBodyCheckPage`, `ConquerEvolutionPage` y `brand/CqSun.vue`.

Regex LEGADO (debe NO imprimir nada sobre archivos migrados):
`CqSky|CqSun|CqCloudButton|\bcq-(display|ital|caps|small|toast|rule|grow|foot|cta|sky|link)\b|var\(--cq-(sky1|sky2|sky3|deep|sun|muted|cloud|cloud2|cloud3|ink|ink2|glass|hair|hair2|display|body|pad-x|pad-top|pad-bottom|gold|gold-hi|cream|subir-bg|subir-ink)[,)]`

## Gates

- Tarea 1: verify `OK` (grep de tokens y clases, `sass` compila, `pnpm lint` 0 errores). Test de tokens corrido con un shim de
  vitest en node (ver Lecciones): 60/60.
- Tarea 2: verify `OK` (lint 0 errores; `vue-tsc` sin nada en `src/modules/conquer`). Tarea 3: idem.
- `git diff origin/staging -- el-templo-app/src/css el-templo-app/src/components/anatomy` vacío. `git status --porcelain` vacío.
- `pnpm lint` imprime 2 warnings preexistentes y ajenos (`boot/axios.ts` `Capacitor`, `useSessionPlayer.ts` `watch`).

## Mutantes (test de tokens; vitest NO se corrió, se replicó la lógica real con un shim en node)

| # | Mutante | Resultado | `expect` que lo atrapa |
| --- | --- | --- | --- |
| 1 | `--cq-text-gold: #cfae6b` | 3 fallos (2,1 / 1,9 / 1,8 contra surface, tint-cream y página) | `conquer-tokens.test.ts:221` (`toBeGreaterThanOrEqual(min)`) |
| 2 | `--cq-night:` definido en un `:root` fuera de `.cq-root` | 2 fallos (token y hex fuera) | `:165` (`toEqual([])`) y `:169` (`toBe(false)`) |
| 3 | `--cq-on-night-2: #8a93b8` | falla (5,40 < 7) | `:221` |
| 4 | un `@media print` con `#f6e2a4` fuera del bloque | falla el hex | `:169` |

## Deviations from Plan

**1. [Rule 3 - gate] Selectores planos en vez de `&--variante` para botones, chips y card.** El `<automated>` de la tarea 1
busca `\.cq-btn--secondary`, `\.cq-chip--neutro`, `\.cq-card--flush`, etc. como literales; con `&--x` anidado el grep no
los encuentra. Se escribieron como `.cq-btn--primary { }` planos dentro de `.cq-root` (mismo CSS compilado). `.cq-seg__opt`,
`.cq-rowlink__chev` y los modificadores `--on` siguen anidados (el grep no los pide).

**2. [Rule 1 - bug propio] El test de alcance repartía mal el SCSS** (el `head` del bloque traía el `@import` previo y no
reconocía `.cq-root`); se corrigió separando la sentencia previa y se comprobó con el shim antes de commitear.

**3. Cosas anotadas sin decisión de producto:**
- `CqPortico` suma un `div.cq-portico__body` alrededor del slot (en vez de `position: relative` por descendiente con `:deep`):
  más simple y no depende de `:deep`. Los hijos del slot son una columna con `gap 14`.
- El halo usa `rgba(207, 174, 107, .22)` literal (gradiente de fondo, permitido): `color-mix()` no está garantizado en
  los WebViews iOS que soporta el app.
- `.cq-dark` también aplica a la raíz (`.cq-root.cq-dark`), por si 201-29 hace la guía entera oscura sobre `CqScreen`.
- `.cq-card--sel` se conservó (lo usan `CqComboCard` y `CqSubirCard`): ahora es borde `--cq-edge-gold`.
- `@include mt-block-title` compila con `font-family: "Montserrat"` literal (viene del mixin de `_brand.scss`, que el plan manda
  usar); el literal no está escrito en `conquer.scss`.
- El `<script>` de `ConquerTab` y `ConquerBlocked` solo cambió en imports y en un comentario; el copy ("Ya le avisamos al equipo",
  `CQ_TEXTOS.*`) quedó igual. "Modo premium" ahora es `.cq-block-title` bajo el kicker "Conquer".

## Trampas para los planes 29-35

1. **`.cq-dark` y todo lo de la hoja necesita un ancestro `.cq-root`** (o ser la raíz). Hojas/diálogos teletransportados llevan
   su propia raíz `.cq-root`, como ya decía la lección 201-18; si la raíz es `.cq-root cq-dark`, sirve igual.
2. **Mezcla esperada hasta 201-33:** `.cq-card`, `.cq-chip*`, `.cq-sub`, `.cq-num`, `.cq-select`, `.cq-row`, `.cq-meander` ya
   tienen el look NUEVO; las pantallas sin migrar los pintan sobre el cielo con texto crema (ilegible en cards blancas). No
   "arreglarlas" fuera de su plan.
3. `.cq-sub` ahora tiene `margin: 0` y es un `<p>`-friendly; `.cq-title` es 22 px y se usa en `h2`. Para cifras grandes: `.cq-num`
   + `font-size` del componente (40 px en KPI, 30 px en contador, según el sketch).
4. `CqLevelIcon` es azul noche por defecto y el papel es blanco: sobre fondo de página crema el hocico se ve blanco (como el sketch).
   En la pieza oscura no hay que hacer nada (la hoja lo cubre).
5. `CqGreek` trae un aro de 3 px (`--cq-surface` + `--cq-deco-gold`) que sobresale del disco: darle `margin`/gap suficiente en
   `CqStepRow` (201-30). El aro blanco pensado para fondo claro; sobre `.cq-dark` se vería como un aro blanco.
6. `CqButton` es `width: 100%` por defecto (`small` lo pasa a `auto`). Para dos botones lado a lado, un contenedor grid/flex.
7. En `.cq-seg`, la opción elegida acepta `aria-pressed="true"`, `aria-checked="true"` o la clase `cq-seg__opt--on`.
8. `app.scss` sigue importando `@fontsource/cormorant-garamond` 400 y cursivas (globales del app, no de Conquer); el chunk de Conquer ya
   no importa ninguna. Si en el UAT aparece Cormorant en Conquer, viene del `font-family` literal de un archivo sin migrar.
9. Regex FUENTES/COLORES para los verify de 201-29..33 sobre archivos migrados que no sean `conquer.scss` (ver DA-20): ojo con los
   comentarios, que también matchean (en 201-28 hubo que reescribir dos comentarios que nombraban `CqSky`/`CqCloudButton`).

## Lecciones nuevas

- **Correr tests puros de vitest con node sin vitest:** armar en el scratchpad un árbol espejo (`src/modules/.../__tests__`,
  `src/css`) y un paquete `node_modules/vitest` con un shim de `describe/it/it.each/expect` (`toBe`, `toEqual`,
  `toBeGreaterThanOrEqual`); se ejecuta con `node --no-warnings --experimental-strip-types` y permite mutar el SCSS en una copia sin
  tocar el repo. El script de apoyo (`runtok.sh`) vive en el scratchpad, no en el repo.
- Los verify con `grep "\.clase--variante"` rompen si se anida con `&--`: escribir los selectores planos o ajustar el grep.
- `@import 'src/css/premium-card'` desde un `.scss` suelto compila con `--load-path=.` y no emite CSS al importarse (comprobado).
- `prettier --write` sobre `conquer.scss` (propio, reescrito) es seguro.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno: sin rutas ni superficies nuevas. T-201-103 y T-201-105 mitigados por `conquer-tokens.test.ts` (alcance y contraste);
T-201-104 (sin `@fontsource` ni Google Fonts en el chunk) verificado por grep y por el test.

## Para el orquestador

- Sigue pendiente de verificar en CI: `conquer-tokens.test.ts` (60 casos; corrido en node con shim, no con vitest real).
- A ojo (201-35): Bloqueado a 360/390 px (portada en marco oscuro, botón de 52 px), spinner de la tab, y que el chunk de Conquer no
  traiga ninguna `font-face` de Cormorant.
- No hay migración ni dependencias nuevas; no se tocó STATE.md, ROADMAP.md ni memorias.

## Self-Check: PASSED
