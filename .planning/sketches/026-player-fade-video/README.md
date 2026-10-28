---
sketch: 026
name: player-fade-video
question: "Player entrenando un bloque: sin la columna dórica, ¿cómo mostrar el ejercicio de ahora (nombre + cantidad) sobre un fade a negro al pie del video? A nombre grande + placa, B nombre en Cinzel, C cantidad gigante tipo TV. Header: NUCLEUS a la izquierda y Dominadas donde estaba el reloj; el reloj baja a la fila del formato."
winner: "A sin AHORA, con la cantidad grande en Cinzel como en C; sin la lista de ejercicios (solo Completar ejercicio)"
tags: [app, player, tv, fase-197]
---

# Sketch 026: Player con fade en el video

## Design Question

Sobre lo que Franco ve en local (sketch 025 B implementado en `fix/guia-historias-player`): la columna dórica como separador del formato queda mal. Pedido (2026-10-23):

1. Sacar la columna dórica.
2. Fade a negro en el borde inferior del video, con el **nombre del ejercicio de ahora y su cantidad** (la dosis como en la placa: solo número, segundos con ″).
3. Header sobre el video: **NUCLEUS** a la izquierda (junto a la flecha), **Dominadas** arriba a la derecha (donde estaba el reloj, junto al ⋮).
4. El **cronómetro** baja a la hoja blanca, en la **misma fila** del nombre del formato y su descripción (reloj Cinzel a la derecha). Separador simple (línea).
5. Las cards siguen igual.

## How to View

open .planning/sketches/026-player-fade-video/index.html

Tocá el video (30 % izquierdo = atrás, 70 % derecho = adelante) o una card para cambiar de ejercicio. Botones: zonas de toque, sin video (fallback), completar, reiniciar.

## Variants

- **Antes**: lo que hay en local (kicker + nombre a la izquierda, reloj arriba a la derecha, formato + definición + columna dórica).
- **A · nombre grande + placa**: tempo + AHORA arriba, nombre en Montserrat 22 y la cantidad en una placa terracota a la derecha (misma placa que el AHORA de la lista).
- **B · nombre en Cinzel**: nombre tallado en Cinzel mayúscula (como los títulos de la TV), debajo el tempo y la cantidad en crema.
- **C · cantidad gigante, tipo TV**: la cantidad en Cinzel 58 a la izquierda (se lee de lejos con el teléfono en el piso), el nombre a su derecha.

Las tres comparten el header nuevo y la fila formato + reloj.

## Controles existentes (para no taparlos)

- `StoryExerciseCard`: dos zonas de toque cubren TODO el video (`tap-left` 30 %, `tap-right` 70 %, z-index 5). El fade y el texto van por debajo (`pointer-events: none`, z-index 3/4): tocar sobre el nombre sigue avanzando. No hay controles nativos de video (autoplay, loop, muted).
- Arriba: barra de segmentos (z-index 10), flecha atrás y ⋮: no cambian de lugar.
- **Sin video** la app muestra el "name hero" (nombre grande centrado + badge): ahí el pie NO se muestra para no repetir el nombre.
- "Bloque completo" tapa todo el video como hoy (el pie queda debajo).
- La ruta a la derecha del header se corta con "…" (máx. ~170 px) para que no choque con NUCLEUS en 360 px.

## Datos

Nucleus · Dominadas, EMOM 12 min cada 60 s, con su descripción. Ejercicios: Dominada estricta CON 8, Dominada negativa en 5 segundos EXC 5, Colgado activo ISO 30″, Remo invertido CON 10, Movilidad de hombros (descanso activo) 40″. Foto `bars-open.webp` como cuadro del video. Las piezas de la columna del "Antes" se leen de `../025-day-player-blanco-tv/`.


## Ganador (2026-10-23)

**A**, con dos cambios: sin la etiqueta "AHORA" y la cantidad en grande en Cinzel como en la C. Además, **la lista de ejercicios de la hoja blanca se saca**: debajo del formato y el reloj queda directamente "Completar ejercicio".
