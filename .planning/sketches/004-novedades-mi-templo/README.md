---
sketch: 004
name: novedades-mi-templo
question: "¿Qué forma visual hace que una sección de Novedades (oraciones cortas por sede) capte la atención en Mi Templo, sin repetir el patrón de las cards premium oscuras?"
winner: "D"
tags: [mi-templo, novedades, feed, comunicaciones, app]
---

# Sketch 004: Novedades en Mi Templo

## Design Question

Feed de oraciones cortas ("Incorporamos clases de yoga", "Open gym este sábado en Constitución")
que se cargan desde Comunicaciones (admin) y se asignan a una o varias sedes. Las cards premium
(oscuras, borde dorado con brillo animado, todas iguales) ya no captan la atención por
repetición. ¿Qué forma tiene que tener la novedad para que destaque?

## How to View

open .planning/sketches/004-novedades-mi-templo/index.html

Controles arriba: **Socio de** (filtra por sede), **Cantidad** (0 / 1 / todas), **Ya las vi** (estado leído).
Debajo de cada variante va el carrusel premium real y la card de turno, como contexto.

## Variants

- **D: Síntesis A+B** (pedido de Franco): estética del Tablón (A), una novedad por vez, máximo las 3 últimas, rotación automática cada 4,5 s con transición vertical de la Cinta (B), barra de progreso, puntos de paginación tocables, swipe lateral para pasar a mano y pausa mientras se toca. **Sin ícono a la izquierda** (pedido 2026-10-14): solo oración + NUEVO + sede + tiempo. Oración ≤ ~70 caracteres para entrar en 2 líneas (alto fijo, sin saltos al rotar).
- **A: Tablón**: card blanca con lista, un ícono por tipo, marca "NUEVO" con filete terracota, chip de sede, tiempo relativo, 3 visibles y "Ver todas".
- **B: Cinta rotativa**: banda terracota a todo el ancho que rota una novedad cada 4 s, con barra de progreso; al tocarla abre una hoja con la lista completa.
- **C: Crónica**: bloque editorial sin card. La última novedad va como titular en Cormorant itálica 30px y las demás como lista numerada.

## What to Look For

- Contraste con el carrusel premium: ¿cuál se ve primero al abrir?
- Densidad: con 1 sola novedad, ¿la sección se sostiene? (Cantidad = 1)
- Oraciones largas: B trunca en una línea; A y C no.
- ¿Hace falta el "tipo" (ícono Nuevo/Evento/Horario/Aviso…) o alcanza con la oración y la sede?
