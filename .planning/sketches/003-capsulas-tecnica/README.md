---
sketch: 003
name: capsulas-tecnica
question: "¿Cómo se ve la pre-clase con cápsulas de técnica en tonos claros, y qué figura las acompaña?"
winner: "D"
tags: [tv, pre-clase, tecnica, capsulas, claro]
---

# Sketch 003: Cápsulas de técnica (pre-clase)

## Design Question

Decisión previa (2026-08-25): el **cierre** queda con las frases en el estilo
oscuro del sketch 002; la **pre-clase** pasa a cápsulas de técnica con tonos
más claros de la misma paleta y un efecto más sutil (los cues no son
poéticos). ¿Qué figura acompaña a la cápsula?

## How to View

```
xdg-open .planning/sketches/003-capsulas-tecnica/index.html
```

Deep-links `#a` / `#b` / `#c` (+ `-still` para captura sin animar). Rotación
de cápsulas cada 10 s; botón "⟳ Cambiar cápsula".

## Variants

- **A: Cápsula limpia** — mármol crema con lavado cálido, tinta charcoal
  `#3d3732`, kicker dorado "TÉCNICA DEL DÍA", cue en Nunito con remate
  terracotta `#96593a`, chips "ACTIVA: DORSAL · BÍCEPS". Efecto: palabra a
  palabra con fade corto, sin glow. Reloj grande a la derecha.
- **B: Viñeta estatuaria ★ GANADORA** — ídem A + recorte de la MISMA foto
  del templo (anillas/paralelas/Hércules según familia del ejercicio) en un
  marco de **arco de medio punto** con borde dorado, crossfade + settle de
  escala lento. Los 3 recortes viven en este directorio
  (`crop-{dominadas,fondos,tiron}.webp`, del `bars-open.webp` HQ).
- **D: B refinada ★ GANADORA (elección de Franco, 2026-08-25)** — la cápsula
  de B (izquierda intacta) sobre el MISMO fondo del cierre (`bars-open` HQ,
  desde `.docs/`) con **velo crema muy claro** (gradiente .9→.55, más denso
  tras el texto) en vez del mármol; a la derecha, la identidad del cierre
  pero en clave diurna: **partenón en su dorado original** (sin filtro),
  hora y día en charcoal con **halo crema** (la zona del león es la más
  transparente del velo). Sin viñeta. **Todos los textos +20%** — mismo
  ajuste aplicado al cierre (sketch 002 D). Día y noche comparten así el
  mismo escenario, cambia la luz.
- **C: Muñecos anatómicos (descartada)** — siluetas SVG F/M dibujadas a mano
  con zonas musculares que laten. **Confirma la sospecha de Franco**: sin
  ilustración anatómica profesional queda infantil ("muñecos de galleta").
  Si se retoma la idea, el camino es assets ilustrados de verdad — o la
  versión elevada: imágenes generadas de estatuas de mármol con el grupo
  muscular en oro.

## Modelo de contenido

```
{ ejercicio, cue: [{t, acento?}], musculos: [chips], zonas: [para figura], img }
```

Mismo espíritu que `quotes.ts`: tanda curada en código, `acento` = remate
terracotta. La rotación puede intercalar cápsulas con frases si se quiere.

## Notas

- Paleta pre-clase (alba): mármol crema + `#3d3732` (tinta nueva de bloques)
  - terracotta `#96593a` + oro `#b08d6e`. El contraste narrativo con el
    cierre nocturno es deliberado: llegada = luz, fin = ritual oscuro.
- Efectos: solo opacity/transform (fade por palabra, crossfade de viñeta) —
  más barato aún que el encendido del cierre.
- Para producción: recortes por familia de ejercicio (~8-10) generables por
  Franco con el mismo estilo del bars-open; mapping familia→imagen en código.
