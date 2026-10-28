---
sketch: 009
name: barra-activa
question: "¿Qué fondo le da más presencia a la pestaña activa de la barra de abajo sin recargarla?"
winner: "A (píldora translúcida 58×30 detrás del ícono; Franco pasó de B a A)"
tags: [app, navegacion, barra-inferior, tabs]
---

# Sketch 009: Pestaña activa en la barra de abajo

## Design Question

Hoy la pestaña activa solo cambia de crema a blanco y pone el texto en negrita (`MainLayout.vue`, `.mobile-tab--active`): cuesta ver en qué sección estás. ¿Qué fondo la marca mejor?

## How to View

Abrir `.planning/sketches/009-barra-activa/index.html` (desde Windows: `\\wsl$\Ubuntu\home\franco\projects\el-templo\.planning\sketches\009-barra-activa\index.html`). Tocá cualquier pestaña para cambiar la activa (cambia en los tres teléfonos). Arriba: ancho 360/390/412.

## Variants

- **A · Píldora suave:** píldora translúcida (blanco al 20%) de 58×30 detrás del ícono, que se estira al activarse (Material 3). Ícono y texto blancos.
- **B · Píldora crema:** píldora crema sólida (#f2ede5) de 54×30 con sombra y el ícono en terracota (invertido). La de más presencia.
- **D · Píldora crema completa** (pedido de Franco tras ver B): la píldora crema (64×48, radio 16) abarca ícono y texto, los dos en terracota. A 360 "Mi Templo" en negrita queda justo (≈6 px por lado).
- **E · A + íconos de contorno** (pedido de Franco): la píldora translúcida de la A con el ícono relleno en la activa; las demás con el ícono de contorno (Material Icons Outlined). Entrenar (dibujo propio) va con el trazo de su silueta. Ojo: "menu_book", "event_available" y "card_membership" casi no cambian entre relleno y contorno; el efecto se nota sobre todo en Mi Templo y Entrenar.
- **G · Línea + íconos de contorno** (pedido de Franco): la línea de la F + ícono relleno en la activa y de contorno en las demás (E sin la píldora).
- **F · Solo la línea** (pedido de Franco): la línea arena (#f0d2b4, 28×3) de la C arriba de la pestaña activa, sin ficha ni píldora.
- **C · Ficha + línea:** toda la pestaña (ícono + texto) en una ficha más oscura y hundida, con una línea arena (#f0d2b4) arriba.

Las tres usan la barra real (degradé `#7d5d42 → #96593a`, 56 px, mismos íconos y textos).

## What to Look For

- ¿Se ve de un vistazo en qué sección estás?
- ¿Compite con la card de hoy o con los botones terracota de la pantalla?
- Probá 360: ¿la píldora o la ficha se pisan con las pestañas vecinas?
