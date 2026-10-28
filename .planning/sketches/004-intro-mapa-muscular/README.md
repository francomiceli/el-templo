---
sketch: 004
name: intro-mapa-muscular
question: "¿Cómo se ve la intro 'el recorrido de hoy' (entre PYROS y el 1er bloque) con cuerpos H/M detallados y las zonas de cada bloque coloreadas?"
winner: "D"
tags: [tv, clase, intro, musculos, anatomia, svg, claro]
---

# Sketch 004: Intro mapa muscular

## Design Question

Al terminar la entrada en calor (PYROS), la TV presenta "el recorrido de hoy":
figuras de hombre y mujer con las zonas musculares de cada bloque en el color
del bloque. Pedido de Franco (2026-10-05): **que no se vea básico, que el
cuerpo tenga detalle** (el sketch 003 C ya descartó las siluetas dibujadas a
mano: "muñecos de galleta").

## How to View

```
xdg-open .planning/sketches/004-intro-mapa-muscular/index.html
```

Barra superior: variante (A/B/C) × coreografía (Todo junto / Giro) · ▶ Repetir ·
⟲ Frente/espalda manual. Deep-links: `#a`, `#b-giro`, `#c-junto`, y para
captura sin animar `#a-still`, `#a-still-espalda`, `#c-still-foco1`.

## Variants

- **A: Escultura griega** — cuerpo de mármol (cada músculo con su degradé de
  relieve, luz arriba-izquierda, grano y vetas estáticas recortadas a la
  silueta); las zonas se "encienden" con degradé del color del bloque. Pedestal
  grabado ΑΝΗΡ / ΓΥΝΗ.
- **B: Écorché** — lámina anatómica: músculos con **fibras orientadas** (eje
  principal de cada músculo + overrides anatómicos: pecho hacia el húmero,
  oblicuos "manos al bolsillo", glúteos hacia el trocánter), fascia clara entre
  músculos; inactivos en gris cálido, activos en el color del bloque.
- **C: Holográfico/técnico (en claro)** — línea fina + fibras muy tenues,
  grilla de puntos, esquinas de encuadre, plataforma con anillos, barrido de
  escaneo; en foco aparecen **callouts** con línea quebrada a cada zona.

- **D: Síntesis ✦ (pedido de Franco, 2026-10-05)** — base **A (escultura
  griega)** + los **puntos con línea y rótulo de C** sobre el cuerpo (bloque en
  foco) + **fundido cruzado frente↔espalda** (opacity de cada vista, 1.5 s) en
  lugar del giro. Sin pedestal; cuerpos ocupando el alto del marco (51.5em, leyenda más angosta) y
  columna de rótulos pegada al contorno real a la altura de los puntos. Rótulos en unidades de pantalla (mismo tamaño en H y M, cuyas
  fuentes vienen a escalas distintas). Default al abrir el sketch.
  Detalle a resolver en producción: cuando dos zonas quedan muy juntas
  (abdominales/oblicuos, aductores/isquios de espalda) las líneas casi se
  pisan → tabla curada de puntos de anclaje por zona y figura.

Coreografías (toggle "Todo junto" / "Bloque a bloque", valen para todas):

- **Todo junto + leyenda** (~7 s): entran los cuerpos, se encienden las zonas
  de frente bloque tras bloque en ráfaga, se arma la leyenda; gira a la
  espalda, vuelve al frente.
- **Giro frente → espalda** (~13 s): bloque por bloque con foco; gira **solo si
  el bloque tiene zonas exclusivas del otro lado** (p. ej. DEUTEROS I muestra
  cuádriceps de frente y gira para glúteos/isquios).
- Ambas terminan en un **loop de espera** (mientras el profe explica): foco
  rotativo por bloque cada ~3.4 s, girando cuando el bloque lo pide.

## Datos / supuestos

- Geometría: `anatomy-data.js` = paths de **react-native-body-highlighter
  v3.2.0 (MIT)** — H/M × frente/espalda, ~23 grupos, con manos/pies/cabeza.
  Comparado contra `@lucawahlen/vue-human-muscle-anatomy` (sin cabeza/manos,
  muy esquemático) y `body-muscles` (low-poly): ganó por lejos.
- Clase de ejemplo (modo regular): NUCLEUS HSPU (hombros/tríceps/trapecio) ·
  DEUTEROS I pistol (piernas+glúteos) · DEUTEROS II remo (dorsales/bíceps/
  antebrazos) · EPIKOS hollow+superman (abs/oblicuos/lumbares). Paleta cálida
  de marca: terracota `#b4532a`, ámbar `#c8901f`, oliva `#6b7a34`, borgoña `#7a2a3a`.
- Hoy las planis **no tienen músculos por ejercicio**; en producción las
  zonas saldrían de un mapeo curado `route`/`category` → zonas (ver memoria
  `project_tv_intro_mapa_muscular`).

## Arquitectura pensada para la TV

- Cada capa es un `<svg>` propio apilado (base + 1 por bloque + callouts):
  encender/atenuar = `opacity` de la capa → compositor, sin repintar el cuerpo.
- Giro = `scaleX(1→0)`, swap de `visibility`, `scaleX(0→1)`; escaneo de C =
  `translateY`. Nada de filter/blend/drop-shadow.
- Degradés, tramas de fibras y vetas son estáticos (se rasterizan una vez).
  **Riesgo a medir en el TV real**: costo del primer raster de B (tramas) y
  memoria con 2 figuras × 2 vistas × 5 capas.

## What to Look For

1. ¿Cuál estética se lee "pro" desde el fondo del salón y no infantil?
2. ¿Se distinguen los 4 colores de bloque sobre crema, y entre sí?
3. ¿Todo junto (rápido, panorámico) o giro (narrativo, más largo)?
4. Proporción H/M y ubicación de la leyenda vs. las figuras.

## Abierto

- Músculo en dos bloques: ¿qué color gana? (hoy no hay solapamiento en el ejemplo)
- ¿La intro retrasa el timer del 1er bloque o corre encima de PYROS terminado?
- ¿Se dispara sola al pasar de PYROS o con botón "Presentar clase" en el control?
