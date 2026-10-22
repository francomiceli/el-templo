---
phase: 201-conquer
plan: 30
subsystem: app/conquer (Inicio y camino de niveles)
tags: [conquer, estetica-b, inicio, niveles, vue]
requires: [201-28, 201-29]
provides:
  - Inicio (ConquerHome) con el pórtico del nivel y la fila fija "¿Cómo funciona?"
  - ConquerLevelsPage con la card del nivel del alumno como pieza oscura
affects: [201-31, 201-32, 201-33, 201-34, 201-35]
key-files:
  modified:
    - el-templo-app/src/modules/conquer/components/ConquerHome.vue
    - el-templo-app/src/modules/conquer/pages/ConquerLevelsPage.vue
metrics:
  tasks: 2
  commits: 2
---

# Phase 201 Plan 30: Inicio y camino de niveles (variante B) Summary

Inicio y Niveles migrados a la variante B del sketch 022 con las fuentes del app. Solo template y estilos: la lógica, el copy
y la navegación quedan como estaban (D-16: día que toca, sábado de Toro, semana completa). Sin cambios de API ni tests nuevos.

## Commits

| Tarea | Commit | Mensaje |
| --- | --- | --- |
| 1 | `af20d6636` | `feat(201-30): Inicio de Conquer con el pórtico del nivel y ¿Cómo funciona? (hallazgos 1 y 2)` |
| 2 | `930878755` | `feat(201-30): El camino de niveles con el templo clásico (hallazgo 2)` |

El SUMMARY se commitea aparte con `docs(201-30)`.

## Qué quedó

**Inicio (`ConquerHome.vue`)**, sobre `CqScreen`, en el orden de DA-29:

1. `CqPortico` (única pieza oscura): kicker "Conquer · Semana N del bloque"; `CqLevelIcon` 56 + nombre del nivel (Montserrat 800,
   36 px, alto .95) y "Tu nivel · {texto}"; el camino de niveles como UN `router-link` a `conquer-niveles` (`aria-label` "Ver el
   camino de niveles", cabezas 38/30 px, filetes `--cq-deco-gold`, actual en `--cq-on-night-hi` y las otras en `--cq-on-night-2`)
   con "El camino de Milón ›" (`.cq-textlink`); y `CqButton variant="on-night"` con `ctaLabel` → `goToday`.
2. Aviso del control (`.cq-notice`, `bodyCheckNotice`) con "Hacerlo ahora" (`cq-btn--secondary cq-btn--small`) a `conquer-control`.
3. "Tu semana" (`.cq-block-title` + chip `cq-chip--hecha` "Semana completa") y una `.cq-card--flush` con un `router-link` de 52 px
   por día a `dayTarget`: "✓ Hecha" (`--hecha`), "Te toca" (`--techo`) o "Pendiente" (`.cq-sub`); barrita dorada a la izquierda
   del día que toca.
4. "Última marca": `.cq-card--flush` con nombre, "{día} · {d/m}" y el valor `.cq-num` 24 px; vacío → "Todavía no cargaste marcas." (`.cq-sub`).
5. Card con tres `.cq-rowlink`: "¿Cómo funciona?" (disco `.cq-q`) → `conquer-guia`, "Progreso", "Evolución".

Se fueron `CqSky`, `CqSun`, `CqCloudButton`, `cq-grow`, el CTA de abajo y las clases `cq-home__day/access/notice` viejas.
Script: solo imports + `isNext(d)` (presentación; `dayStatus` lo usa). Sin cambios de lógica.

**Niveles (`ConquerLevelsPage.vue`)**, sobre `CqScreen`: `CqPageHeader` ("El camino" / "La leyenda de Milón de Crotona", vuelta a
`/training?tab=conquer`); leyenda (`CQ_TEXTOS.leyenda_milon`) en una `.cq-card` con `.cq-meander` arriba; "Tres niveles, un método";
una `.cq-card` por nivel, la del alumno con `.cq-dark` (ícono, kicker, nombre y chip "Tu nivel" en `--cq-tint-cream`/`--cq-night`);
nota de "3 ejercicios × 3 series" y `CqButton variant="secondary"` "Volver al inicio". Se quitó el alto mínimo y el pie de nubes.
Script: solo imports (carga en frío, `goBack` y `onUnmounted` intactos).

## Gates

- Tarea 1 y 2: ambos `<automated>` imprimen `OK` (greps de estructura, regex LEGADO y FUENTES/COLORES vacías, `pnpm lint` 0 errores
  con los 2 warnings preexistentes ajenos de `boot/axios.ts` y `useSessionPlayer.ts`, `vue-tsc` sin nada en `src/modules/conquer`).
- `prettier --check` sobre los dos archivos: limpio. Los dos bloques `<style>` compilan con `sass` (verificado extrayéndolos al scratchpad).
- Higiene: sin `console.*`, `any`, ni `fonts.googleapis/gstatic` en los dos archivos. `git status --porcelain` vacío al cerrar.
- Tests de vitest: NO corridos (regla del proyecto). Este plan no agrega ni cambia tests (solo template y estilos), así que no hay
  mutantes que probar con node. No existe ningún test que importe `ConquerHome` ni `ConquerLevelsPage`.

## Deviations from Plan

Ninguno de fondo. Decisiones chicas donde el plan dejaba margen (las más simples que cumplen la spec):

1. **Sin `--cq-paper` explícito en Inicio**: lo define `.cq-dark` (el pórtico lo es), así que el ícono del nivel ya tiene el hocico azul noche.
2. **Cabezas de niveles no actuales en `--cq-on-night-gold`** (el dorado del sketch), no en `--cq-on-night-2`: DA-29 fija ese color solo para los
   nombres. Para ganarle a la regla `.cq-dark .cq-level-icon` (empate de especificidad) el selector va con `.cq-home__path` adelante.
3. **"Última marca" vacía**: el texto va suelto (`.cq-sub`, sin card), como estaba antes.
4. **Sin sufijo "past"**: el camino ya no distingue niveles ya superados (DA-29 solo distingue el actual).
5. `isNext(d)` factorizó la condición "día que toca" que repetían la clase de la fila y `dayStatus`.

Ninguna ambigüedad de producto nueva.

## Trampas para los planes 31-35

1. **Empates de especificidad con `.cq-dark`**: `.cq-root .cq-dark .cq-level-icon` / `.cq-title` / `.cq-num` valen (0,3,0), igual que un selector
   scoped de dos clases + atributo `[data-v]`. Para pisarlos desde un componente, anteponer una clase del padre (3 clases + atributo), no confiar en el
   orden de las hojas. Lo mismo para pisar `.cq-chip`/`.cq-card` (0,2,0): `.mi-clase.cq-chip`.
2. `.cq-card` es columna con `gap 12`: una card en fila (ícono + texto) necesita `.mi-clase.cq-card { flex-direction: row }`.
3. `.cq-card--flush` tiene `padding: 4px 16px`: para una barrita en el borde izquierdo de una fila, `left: -16px` (como `.wrow.next::before`).
4. Un `router-link` con `.cq-btn` necesita `text-decoration: none` propio (el `<a>` lo subraya); `.cq-textlink` dentro de otro enlace sirve como
   "falso" enlace de texto (un `span`), no anidar `<a>` en `<a>`.
5. `.cq-notice` es `flex-wrap`: para que el texto ceda y el botón baje solo cuando no entra usar `flex: 1 1 150px; min-width: 0` en el texto.
6. Con 201-34 (borrado del LEGADO) Inicio y Niveles ya no dependen de ninguna clase ni token legado.

## Qué mirar a ojo en 201-35

- Primer viewport de Inicio a 390×844 con las puertas de Entrenar arriba: el botón del pórtico tiene que terminar antes de y = 788
  (estimado ~410 px de contenido sobre las puertas, hay margen, pero medirlo).
- Aviso del control físico: una fila a 390 px; a 360 px puede bajar el botón, y el texto "Tu control del día 0 está pendiente" no se corta.
- Nombres largos de ejercicio en "Última marca" (`overflow-wrap: anywhere`) y el valor `.cq-num` que no se parte (`nowrap`).
- Camino de niveles del pórtico a 360 px (tres nombres en mayúsculas de 11 px con 0,1em de espaciado: "NOVILLO" es el más ancho) y que el
  toque en cualquier parte del bloque abre Niveles.
- Barrita dorada del día que toca (queda sobre el borde de la card, `left: -16px`) y fila de 5 días de Toro.
- Niveles a 360 px: nombre + chip "Tu nivel" en la misma línea o bajando limpio; la card oscura con su línea luminosa abajo.
- Aro de foco: dentro del pórtico es crema (`.cq-dark :focus-visible`).

## Para el orquestador

- No hay migración, dependencias nuevas ni tests nuevos; no se tocó STATE.md, ROADMAP.md ni memorias.
- Pendiente de CI: nada propio de este plan (los tests de Conquer existentes no tocan estos dos componentes).

## Lecciones nuevas

- Un bloque `<style scoped lang="scss">` se puede validar en solitario extrayéndolo con `awk` al scratchpad y compilándolo con el `sass` de
  `el-templo-app/node_modules/.bin` (los tokens son `var(--cq-*)`, no necesita imports).
- `prettier --check` sobre un `.vue` reescrito entero sirve para confirmar el formato antes de commitear (el pre-commit no corre en este worktree).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno: sin rutas ni superficies nuevas. T-201-109 aceptado (sin cambios de lógica; el app sigue pintando lo que decide el API).

## Self-Check: PASSED
