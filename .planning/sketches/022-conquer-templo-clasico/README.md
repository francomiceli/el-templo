---
sketch: 022
name: conquer-templo-clasico
question: "¿Cómo se ve Conquer con la estética del templo clásico del app, con sus colores (azul noche y oro) solo en las terminaciones: filete dorado (A), pórtico nocturno (B) o estela tallada (C)? + guía introductoria nueva"
winner: B
tags: [app, conquer, fase-201, rework, guia, contraste]
---

# Sketch 022: Conquer, templo clásico

## Design Question

Franco: "mejorar la visual, manteniendo esta característica del conquer con sus colores propios, pero acercando los estilos a los de la app de El Templo hoy, y siguiendo las guías de contraste y demás que dieron origen a la fase 197. No tiene que parecer dreamy ni con nubes como está ahora; lo imagino con estética del templo clásica, pero sumando estos colores nuevos a las terminaciones."

Reemplaza el cielo, el sol, las nubes y las cards translúcidas de la fase 201 (`conquer.scss`, `CqSky`, `CqSun`, `CqCloudButton`). La página, las cards, el chrome y las puertas de Entrenar son las del app (tokens de la 199/197). Los colores de Conquer (azul noche `#131d44`, oro `#cfae6b`, oro claro `#f6e2a4`, crema `#fdf3d3`) van en acentos, bordes, chips, números grandes y letras griegas.

## How to View

open .planning/sketches/022-conquer-templo-clasico/index.html

Selector arriba: variante A/B/C y ancho 390/360. Se ven las cuatro pantallas lado a lado: Inicio, Hoy, Progreso y la guía. Se puede tocar: los contadores (el templo se llena con los escalones cargados), Guardar, Subir en Progreso, la guía (Siguiente/Atrás/Saltar) y "¿Cómo funciona?" en Inicio (reinicia la guía).

## Variants

- **A · Filete dorado**: el app tal cual. Cada card de Conquer lleva un filete dorado arriba (el `pd-line` del app, en oro). El nivel tiene un frontón en línea, los títulos de bloque van en azul noche con meandro y los números en Montserrat. Es la más cercana al app.
- **B · Pórtico nocturno**: el lenguaje de la card de hoy (superficie oscura, línea luminosa, destello) en azul noche y oro. Va en UNA pieza por pantalla: el nivel con columnata y halo, la cabecera de cada ejercicio y los contadores de Progreso. La guía es entera oscura, hermana de los pop-ups. Números y nivel en Cormorant Garamond, la letra de Nacho. Es la que más se siente Conquer.
- **C · Estela**: piedra tallada, sin superficies oscuras. Losas `#fbf8f3` con doble marco dorado, frontón + friso con meandro en el nivel, títulos inscriptos en Cinzel entre meandros y letras griegas grandes en una columna con filete. Números en Cinzel (sin minúsculas: "9 S"). Es la más "templo clásico".

Común a las tres:

- **Puerta Conquer** elegida en azul noche con línea dorada, en lugar del marrón del app.
- **Botón principal** azul noche con filete dorado y el destello del app. No hay CTA dorado: el dorado sigue siendo de Aura.
- **"Entrenar hoy"** sube al bloque del nivel, para que entre en el primer viewport (lección de la 197).
- **Chips de estado**:
  - En rango: arena.
  - Techo 1 de 2: azul noche con oro claro.
  - Bajo el piso: borde dorado.
  - Sin datos: punteado.
  - **SUBIR**: salvia del app (`#3f6a47` sobre `#e9f0e6`), el único verde, como pedía Nacho. Reemplaza al verde claro del prototipo.
- **Botón Subir** salvia sólido.

## La guía "¿Cómo funciona?" (nueva)

Son 6 pantallas cortas. Se muestra una vez, después del control del día 0, y queda fija en Inicio › ¿Cómo funciona?:

1. **La serie Conquer**: Α Β Γ seguidos sin descanso + Ω hold final; 3 series por ejercicio, descanso entre series.
2. **Anotás un número por escalón**: el de la peor serie (ejemplo 7 · 6 · 5 → 5). Viene precargado con el objetivo. Hold = segundos; por lado = el más flojo.
3. **Hasta dónde apretar**: según el nivel ("Sos Toro…") y brazos rectos (fallo técnico) / flexionados (fallo muscular). No estaba en la lista de Franco, pero sin esto no se usa "como se espera".
4. **Apertura y sábado** (solo Toro): Press → Push → Hold; se anota la progresión de arranque y las series completadas; sábado 3 máximas + 10 drops. Ternero y Novillo no ven esta pantalla (quedan 5).
5. **Cuándo aparece Subir**: techo dos sesiones seguidas → Subir → progresión más difícil, arranca de nuevo en el piso. Sin esperar al coach, primero el E1.
6. **Si algo te molesta**: 0 a 10 antes de guardar. Con 4 o más lo ve el coach y ajusta. "Marcá lo que sentiste, aunque sea poco."

## What to Look For

- Si se nota que es Conquer sin romper con Entrenar (pasar de la puerta Semana a Conquer no debería sentirse como otra app).
- Si las terminaciones alcanzan (A, C) o hace falta una superficie azul noche para que Conquer tenga identidad (B).
- Hoy es largo: 3 ejercicios × 4 escalones. Mirar si el ritmo de cabeceras de B ayuda a ubicarse al scrollear.
- En la guía: si después de leerla queda claro qué número anotar y cuándo tocar Subir.

## Contraste (medido en el sketch, 390 y 360)

- Todo texto en color sólido. El script de chequeo (todos los textos de las 4 pantallas y las 6 pantallas de la guía, en las 3 variantes) da 0 fallas y 0 overflow horizontal. La única excepción es el chrome del app (barra de arriba y de abajo, con fondo degradé, que no se mide así).
- El oro claro y el oro solo son texto sobre azul noche (12,7 y 7,7:1).
- Sobre claro, el dorado de texto es `#7a5a1c` (6,4 sobre blanco, 5,5 sobre la página) y el borde dorado de controles es `#a08548` (3,5 sobre blanco, 3,0 sobre la página, WCAG 1.4.11). El oro `#cfae6b` sobre claro es solo decorativo: filetes, meandro, frontón.
- Secundario sobre azul noche: `#c3c9df` (9,9:1).

## Datos

- Alumno Toro, semana 5 del bloque, plantilla de 4 días + sábado. El jueves es Vertical con las progresiones iniciales de Toro (catálogo §3) y apertura 90° press → HSPU → Hold de plancha, objetivo 4.
- Textos del modo del catálogo §9; constantes del motor de la síntesis §4.
- Fuentes sin CDN: `@font-face` a los `@fontsource` del `node_modules` del checkout principal, con fallbacks de sistema. Fondo `bars-open.webp` y logo del sketch 015.
- Fuera del sketch: Bloqueado, Sábado, Evolución/control físico y la hoja de Guardar. Heredan la variante que gane.

## Ganador

**B · Pórtico nocturno** (Franco, 2026-10-22), con un cambio: las fuentes son las de la app de hoy en todo Conquer (texto y números). Sin Cormorant: los números grandes van con la tipografía de la app.
