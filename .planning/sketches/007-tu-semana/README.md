---
sketch: 007
name: tu-semana
question: "¿Qué forma tiene que tener el bloque Tu semana de Mi Templo para que la semana y el total se lean claros y se vea bien a 360/390/412?"
winner: "A con cambios (TUS SESIONES, semana en la fila del título, letra dentro del círculo)"
tags: [mi-templo, tu-semana, week-strip, fase-199, D21]
---

# Sketch 007: Tu semana

## Design Question

El `WeekStrip.vue` de D21 (cifra grande + "sesiones esta semana" + puntos L–D a la derecha + total en pastilla abajo) se ve mal (Franco, UAT 2026-10-16): los puntos se van a la derecha o bajan sueltos y el total no tiene peso. ¿Qué estructura le da orden?

## How to View

Abrir `.planning/sketches/007-tu-semana/index.html` (desde Windows: `\\wsl$\Ubuntu\home\franco\projects\el-templo\.planning\sketches\007-tu-semana\index.html`).
Arriba: ancho (360/390/412), semana (lunes sin sesiones / jueves con 3 / domingo con 6) y total (1 / 42 / 1.284).

## Variants

- **A · Tablero:** encabezado con "N sesiones esta semana" a la derecha. Los 7 días ocupan todo el ancho como círculos de 34 px: con tilde si entrenaste, borde punteado si el día todavía no llegó y anillo oscuro en hoy. Abajo, una franja crema con el total grande en terracota y "sesiones totales en El Templo".
- **B · Dos cifras:** "N esta semana" y "N totales en El Templo" con el mismo tamaño, separadas por un filete; el total va en terracota. La semana se muestra como una barra de 7 segmentos con las letras debajo.
- **C · Columnata:** cada día es una columna del templo (capitel, fuste estriado y base) que se llena de terracota cuando entrenás; hoy lleva la letra en una pastilla oscura. Abajo, una placa crema con el total en Cinzel, como la frase del día.

Las tres usan la card de Novedades (borde `#e5dbcd`, radio 16, sombra cálida) y el título de bloque terracota (D14). Ninguna usa la pastilla del total de D21: el total gana peso por tamaño y color.

## What to Look For

- ¿Se entiende de un vistazo cuántas veces entrenaste esta semana y cuántas en total?
- Probar 360 con 1.284: ¿algo se aprieta?
- Probar el lunes sin sesiones: ¿el bloque vacío desanima o invita?
- ¿C suma personalidad o compite con la card de hoy (que ya tiene la columnata del logo)?
