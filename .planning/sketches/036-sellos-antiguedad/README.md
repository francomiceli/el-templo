---
sketch: 036
name: sellos-antiguedad
question: "¿Cómo se ven los tres sellos de antigüedad (3 meses, 6 meses, 1 año o más) usando solo la paleta de la marca: del contorno al relleno (A), por anillos (B) o por tono piedra-oliva-carbón (C)?"
winner: "B, siempre con el logo chico y del mismo tamaño en los tres niveles (elegir 21 o 24 px)"
tags: [app, mi-templo, encabezado, sello, antiguedad, paleta, fase-214]
---

# Sketch 036: Sellos de antigüedad con la paleta

## Design Question

Hoy `VeteranSeal.vue` tiene tres niveles: 3 meses (bronce), 6 meses (plata) y 12 meses o más (crema con logo terracota, el "oro" sin dorado de la fase 214, D-61). El bronce y la plata usan degradés metálicos (cobre y gris azulado) que no son de la paleta. El dueño pidió: "los tres deberían respetar la paleta de colores". Hay que armar la familia de tres con tokens de la marca, que se distinga por nivel y que no se confunda con el aro dorado de Aura que está al lado, en el encabezado de Mi Templo.

Se conserva la forma (roseta de 24 puntas) y el tamaño (21 px) del componente actual.

## How to View

Abrir `.planning/sketches/036-sellos-antiguedad/index.html` (desde Windows: `\\wsl$\Ubuntu\home\franco\projects\et-comunidad\.planning\sketches\036-sellos-antiguedad\index.html`). Arriba la referencia "Hoy", después la B elegida (a 21 y a 24 px) y debajo A y C como referencia. Cada una tiene los niveles lado a lado en la maqueta del encabezado (375 px) y una lupa; cada una con los tres niveles lado a lado en la maqueta del encabezado (375 px) y una lupa debajo de cada uno.

## Variants

- **A · Del contorno al relleno:** nivel 1 solo contorno crema (hueco), nivel 2 relleno arcilla profunda (#7d5d42) con logo crema, nivel 3 roseta crema llena con logo terracota (como hoy).
- **B · Anillos (ELEGIDA POR FRANCO):** los tres crema con logo terracota; el nivel lo da la cantidad de anillos terracota: ninguno, uno, dos. Ajuste de Franco: el logo va chico y del mismo tamaño en los tres niveles, también en el de cero anillos. El boceto la muestra a 21 px y a 24 px lado a lado para elegir tamaño.
- **C · Tono:** relleno que se oscurece con la antigüedad: Warm Stone (logo carbón), Olive Stone (logo crema), Deep Charcoal (logo crema). El nivel 3 deja de ser crema.

## Paleta usada

Marble Cream #F2EDE5, Warm Stone #D9CFC1, Terracotta #96593a, Clay profundo #7d5d42 (solo en A), Olive Stone #8A8472 (solo en C), Deep Charcoal #3D3732. Ninguna usa Aged Gold ni #d4b46a: ese dorado queda solo para Aura (aro de la foto y ficha).

## What to Look For

- Sobre el degradé terracota-dorado del encabezado, ¿se ven los tres niveles y se distinguen sin la lupa?
- ¿Se confunde alguno con el aro dorado de la foto o con la ficha de Aura?
- A: ¿alcanza el contorno fino del nivel 1 a 21 px?
- B (elegida): ¿qué tamaño va, 21 px (actual) o 24 px? A 21 px la diferencia entre uno y dos anillos es sutil; a 24 px se nota más.
- C: ¿molesta que el sello de 1 año (hoy crema, ya aprobado) pase a carbón?
- Tooltips actuales (no cambian): "3 meses en El Templo", "6 meses en El Templo", "Miembro del Templo desde {mes año} · N años".

## Notas técnicas

El logo de la maqueta es una versión simplificada en SVG del frontón con cuatro columnas (la app usa `/logo.webp` como máscara). Para implementar bastaría cambiar los degradés, el relleno y el color del logo según el nivel en `VeteranSeal.vue`; los umbrales (3, 6 y 12 meses) no cambian.
