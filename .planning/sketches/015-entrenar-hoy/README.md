---
sketch: 015
name: entrenar-hoy
question: "¿Cómo gana peso lo de hoy en la sección 1 de Entrenar sin ser una card: hero con la figura de hoy (A), hero tipográfico a sangre (B) o escenario oscuro de lado a lado (C)?"
winner: "A → A2 puertas sin íconos + chips apilados (ronda 3b)"
tags: [entrenar, fase-197, jerarquia, figura, app]
---

# Sketch 015: Entrenar — lo de hoy

## Design Question

Fase 197, sección 1 de Entrenar (actividad del día + ver la semana). Franco aceptó "hoy + tira de 7 días" y pidió algo con más importancia que una card. Las tres variantes llevan la tira de 7 días abajo y la canasta asomando (igual en las tres), seguida de "Desafíos" y "Conquer" próximamente (D1).

## How to View

open .planning/sketches/015-entrenar-hoy/index.html

## Variants

- **A: Hero con la figura de hoy**: título grande, la figura frente y espalda con las zonas de la sesión encendidas y los bloques como pastillas. Tocar una pastilla muestra solo las zonas de ese bloque. Es la misma figura que la canasta.
- **B: Hero tipográfico a sangre**: nombre de la sesión enorme sobre la página, bloques como renglones con su formato. Sin caja ni figura.
- **C: Escenario oscuro**: banda oscura de lado a lado con el lenguaje de la card de hoy de Mi Templo (logo, halo, línea luminosa, destello).

## What to Look For

- Qué variante se lee como "lo de hoy" en 3 segundos y cuál compite menos con la card de hoy de Mi Templo.
- Si la tira de días y el comienzo de la canasta entran en el primer viewport (390x844).
- Estados "Completada" (la canasta pasa a "¿Te quedaste con ganas?") y "Domingo (sin plani)" (el botón lleva a la canasta).
- En A: una sesión de cuerpo completo enciende casi toda la figura (la plani real del viernes W34 sigma lo hace). La figura dice más cuando se toca un bloque.

## Datos

- Plani real: viernes W34, nivel sigma (DB local, sesión 2003434). El título ("Piernas y empuje") y las zonas por bloque son a mano. En la fase salen de `muscle-zones.ts`, y el título hay que definirlo (hoy el app muestra la ruta del Nucleus).
- Figura: geometría de react-native-body-highlighter v3.2.0 (MIT, ELABBASSI Hicham), la misma de `el-templo-admin/src/tv/recorrido/anatomia.json`. Acá va solo el hombre, frente y espalda.
- `hoy-390.png`: captura real de Entrenar después de la 199 (`.docs/mi-templo-rediseno/herramientas/despues-pantallas/A-presencial-hoy-training/w390-00.png`).

## Ronda 2 — Entrenar en 4 tabs (`ronda2.html`)

Franco eligió A (2026-10-20) con cambios: la tira de la semana en el medio no se entendía, y pidió 4 tabs arriba ("o símil tabs, más fancy"): planificación semanal, bloque libre, desafíos y Conquer.

- **Semana**: la tira de días va arriba (día elegido → hero) y el hero A queda debajo. Siempre se abre en esta tab.
- **Libre**: figura tocable + chips equivalentes (accesibilidad), "+5 AURA con el primero de hoy", sugerencia para complementar (zonas que la sesión de hoy no trabaja, o lo poco trabajado de la semana si no hay plani), lista ordenada de lo complementario a lo que ya hiciste hoy, con la marca "Ya lo trabajaste hoy".
- **Desafíos / Conquer**: próximamente, con punto ocre de "pronto" en la tab.
- Las tabs se conectan: con la sesión completada o un domingo sin plani, el botón lleva a Libre.

Variantes de tabs:

- **A1: Segmentado que se desliza**: píldora blanca con pulgar terracota.
- **A2: Puertas**: 4 fichas con ícono; la elegida en oscuro con línea luminosa.
- **A3: Editorial + deslizar**: Cinzel con subrayado que se desliza, y cambio de tab con gesto lateral.

## Ronda 3 — Puertas sin íconos + bloques a la izquierda (`ronda3.html`)

Franco eligió A2 (puertas) con cambios: sin íconos y "Libre" en vez de "Bloque libre" (tabs más bajas, ~44 px). En Semana, los bloques van de arriba hacia abajo a la izquierda de los cuerpos.

- **Chips apilados**: chips con el rol arriba y el nombre abajo.
- **Recorrido**: línea con un punto por bloque; muestra el orden de la clase y el formato de cada bloque.

A 390 y 360, la acción principal ("Empezar") entra en el primer viewport y no hay overflow horizontal. A 360, el recorrido parte más los renglones.

- Agregado (pedido de Franco): al tocar un bloque, debajo de la figura se abre su lista de ejercicios (miniatura de video, nombre, dosis), con encabezado de rol, nombre, formato, cantidad y zonas, y una cruz para cerrar. Los ejercicios del viernes son los reales de la sesión 2003434; los de los otros días, a mano.
- Pedido de Franco: "Empezar" pasa a la fila del título, mitad y mitad (título 24 px en 2 líneas, botón de 56 px). Ya no se va de la pantalla al abrir la lista de ejercicios. Igual para "Ver resumen", "Disponible el sábado" y "Elegir un bloque libre".

### Ronda 3b — jerarquía (análisis de tamaños, 2026-10-20)

Antes, al entrecerrar los ojos el orden era: tab oscura > día terracota > Empezar > título > figura. Se aplicó:

1. La fila "12 al 18 de octubre" pasa a rótulo de 11 px con flechas de hitbox 44 que no suman alto (el título sube 17 px).
2. Día elegido con borde terracota, sin relleno: el único terracota lleno es Empezar.
3. Tab elegida sin sombra (se mantiene en 44 px por el hitbox mínimo).
4. ~~Resumen de la sesión~~: probado y sacado (Franco, 2026-10-20).
5. Escala única: 28 / 17 / 16 / 13 / 11 (antes había 9 tamaños).
6. Kicker en `#7e4529`: 6,5:1 sobre crema (antes 4,8).
7. Nombres de bloque en una línea con "…" (el nombre completo está en la lista de ejercicios).

Después, al entrecerrar los ojos: tab > Empezar > título > figura. A 390/360 no hay overflow horizontal.

- Pedido de Franco: en Semana el chip de Nucleus está elegido por defecto (con su lista de ejercicios abierta). La figura muestra en terracota fuerte las zonas del bloque elegido y en terracota suave las de los otros bloques de hoy, sin leyenda (Franco: "con el contraste final tiene que quedar bien"), tono medio `#d39a78`. Siempre hay un bloque elegido: se sacó la cruz de la lista.
