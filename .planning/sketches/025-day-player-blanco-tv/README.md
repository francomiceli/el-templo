---
sketch: 025
name: day-player-blanco-tv
question: "Day player mientras entrenás un bloque: ¿fondo blanco con la plani de la TV (A fiel, B TV + cards blancas, C mínima)? Contracción iso/exc/con como en la TV. ¿Qué '¡VAMOS!' más Templo y estridente (1 tallado, 2 sello, 3 explosión)?"
winner: "1: B con el borde de arriba de la hoja blanca recto, botón Completar ejercicio y el video con el alto de hoy · 2: Después en card blanca (B) · 3: tallado en piedra sin A LA ARENA"
tags: [app, player, tv, fase-197, vamos]
---

# Sketch 025: Day player en blanco, estilo TV

## Design Question

Franco (2026-10-23): el day player tiene que ir a fondo blanco en vez de crema, basándose bastante en la plani de la TV de la sede; la contracción (iso / exc / con) como en la TV; y un "¡VAMOS!" del 3-2-1 más estilo Templo, más estridente. El 3-2-1 ya no muestra el nombre del primer ejercicio (sale del código en `fix/guia-historias-player`).

## How to View

open .planning/sketches/025-day-player-blanco-tv/index.html

Tocá un ejercicio para hacerlo el de ahora y "Completar" para tildarlo; el reloj corre (EMOM de 60", los últimos 5" titilan en oro como la TV). Los 3-2-1 se repiten solos; "Repetir" reinicia uno.

## Variants

**1 · Entrenando un bloque** (bloque 2 de 4: Nucleus · Dominadas, nivel Δ, EMOM 10' cada 60")
- **Antes**: como hoy (video arriba, contenido crema, chip chico de contracción abajo del nombre).
- **A · Fiel a la TV**: topbar con BLOQUE 2 / 4 y puntos (hecho / activo), NUCLEUS en Cinzel oro con el brillo que barre, formato en dos líneas a la derecha ("EMOM" / "10' (60")"), cronómetro Cinzel 88 con la barra de columna dórica como progreso y "RONDA 3 DE 10", el video como card, NIVEL Δ · DOMINADAS 60% con la columna dórica de separador, la lista TV (badge · nombre · placa de dosis, marcador ◂ en el de ahora) y la banda de movilidad. "Completar" fijo abajo.
- **B · TV + cards blancas**: el video de siempre arriba a lo ancho; debajo una hoja blanca con cronómetro + formato en una fila y cada ejercicio en una card blanca con el badge TV y la placa de dosis sólida (terracota en el de "AHORA", verde al completarlo).
- **C · Mínima**: reloj Cinzel gigante, el ejercicio de ahora con su video chico, "Completar", y la lista en una línea por ejercicio con los badges TV.

**2 · Contracción**: Antes (chip abajo del nombre, CON e ISO del mismo terracota) / Después como la TV (badge antes del nombre, ancho fijo, tres colores: CON charcoal, EXC oro, ISO arena; dosis en placa oscura que emerge de la banda arena) / Después en card blanca (para B).

**3 · ¡VAMOS!** (sobre la foto de Guía con el velo, como hoy)
- **Antes**: círculo terracota de 160 con "VAMOS!".
- **1 · Tallado en piedra**: "¡VAMOS!" en Cinzel 900 con relleno bronce y contorno tallado, entra desde lejos; la columna dórica se abre abajo, cruza un destello y aparece "A LA ARENA".
- **2 · Sello que golpea**: un sello terracota del Templo ("★ EL TEMPLO ★") cae y golpea: la pantalla tiembla (y vibra el teléfono), ondas y polvo.
- **3 · Explosión terracota**: flash terracota a pantalla completa, rayos que giran y "¡VAMOS!" en Montserrat 900 que estalla y queda inclinado, con "AL FRENTE".

Con `prefers-reduced-motion` se ve el cartel final sin animación.

## De dónde sale (TV, origin/master)

- `el-templo-admin/src/pages/TvScreenPage.vue`: topbar (1046), cabecera bloque · cronómetro · formato (1098-1180), BLOQUE n/M + puntos (1207-1240), columnas NIVEL | RUTA + columna dórica (1278-1360), lista sin recuadro y banda arena (1447-1480), badges CON/EXC/ISO de tres colores (1513-1540), placa de dosis (1545-1583), cronómetro Cinzel con titileo en oro (1759-1790), cartel VAMOS!/DESCANSO (1854-1900).
- `el-templo-admin/src/tv/render.ts`: formato en dos líneas `paintFormato` (293), ítem `buildItem` (520: badge antes del nombre, dosis a la derecha), `paintList` (599: NIVEL | RUTA, columna dórica).
- Columna dórica: `el-templo-admin/public/tv-col-*.png` (copiadas acá).
- Player hoy: `el-templo-app/src/modules/training/components/BlockProgressionView.vue`, `player/CompactExerciseList.vue` (CON/ISO = primary, EXC = secondary), `player/CountdownOverlay.vue`.


## Ganador (2026-10-23)

- **Entrenando un bloque: B** (TV + cards blancas), con tres ajustes: el borde de arriba de la hoja blanca es recto (sin redondeo), el botón dice **Completar ejercicio** y el video conserva el alto que tiene hoy en la app.
- **Contracción: Después · en una card blanca (B).**
- **¡VAMOS!: 1 · tallado en piedra**, sin el texto "A LA ARENA".
