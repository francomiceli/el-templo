# Phase 199 — UI Design Contract

**Fuente visual de verdad:** `.planning/sketches/005-mi-templo-jerarquia/index.html`. Variante **A'** (★), orden **B** (por defecto), frase **clara**, pop-up **modal + novedad**. Ante cualquier duda de medida o color, manda el `<style>` del sketch.
**Decisiones:** `199-CONTEXT.md` (D-01..D-26).

## Tokens

| Token       | Valor                                               | Uso                                                               | Contraste                         |
| ----------- | --------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------- |
| `page`      | `#f2ede5` + foto `bars-open.webp` al 8 % **detrás** | fondo de página                                                   | —                                 |
| `card`      | `#ffffff` opaco                                     | todas las cards claras                                            | —                                 |
| `ink`       | `#2c2318`                                           | texto principal; títulos sobre la página; fondo de la card de hoy | 15.4 sobre blanco                 |
| `ink-2`     | `#6b6459` (`$info`)                                 | texto secundario                                                  | 5.9 sobre blanco, 5.0 sobre crema |
| `terra`     | `#96593a` (`$primary`)                              | títulos/acentos sobre card, botones primarios claros              | 5.6 sobre blanco                  |
| `cream-ink` | `#f0e6d6`                                           | texto sobre `ink`                                                 | 12.5                              |
| `kick-dark` | `#e3c9a8`                                           | kicker de la card de hoy                                          | 9.6 sobre `ink`                   |
| `line`      | `#e5dbcd`                                           | bordes de cards claras                                            | —                                 |
| `ok`        | `#3b7249`                                           | check del registro, "Socio activo"                                | —                                 |

**Reglas:**

- texto **siempre en color sólido** (cero `rgba(..., <1)` en `color` de texto);
- dorado reservado para Aura: **ningún** CTA dorado;
- crema sobre terracota en la tab bar (`#f2ede5`, 4.75).

## Espaciado y forma

- Margen lateral de página **16**. Padding de card **16** (la card de hoy: 20 arriba). Gap entre bloques **16**. Grilla 8 pt. **Sin cajas anidadas.**
- Radios: card 16, card de hoy 20, botón 12, chip 999.
- Botón primario: alto **48**, padding 0 20, Geologica 600 15. Opciones del registro: alto **44**.

## Tipografía

| Rol                    | Fuente      | Tamaño / peso                                    |
| ---------------------- | ----------- | ------------------------------------------------ |
| Saludo                 | Montserrat  | 600 22                                           |
| Título card de hoy     | Montserrat  | 700 28 / 1.15                                    |
| Kicker                 | Montserrat  | 700 11, uppercase, tracking .1em                 |
| Título de sección      | Montserrat  | 800 13, uppercase, tracking .08em, color `ink`   |
| Cuerpo                 | Geologica   | 400–600, 13–16                                   |
| Beneficio patrocinador | Montserrat  | 800 30, sin quiebre                              |
| Frase                  | Cinzel      | 700 21 / 1.5, uppercase; tramo `gold` en `terra` |
| Autor de la frase      | Nunito Sans | 700 11, uppercase, tracking .3em, `#5c5347`      |

## Componentes (orden de la pila)

0. **Saludo** (layout): gradiente terracota→clay; fecha 13 y "ALFA" ≥ 10 en blanco sólido.
1. **Card de hoy (A'):** fondo `ink`, texto `cream-ink`, kicker `kick-dark`, botón primario crema/`ink`, secundario como link subrayado crema. Sin borde dorado, sin pastilla de categoría. Sombra `0 10px 24px rgba(44,35,24,.22)`. Chips en `rgba(240,230,214,.12)`, con el chip "ok" verde `#2f4a35`/`#d9efdc`. Barra de progreso del programa `#4a3f33`/`#e3c9a8`. Gancho al pie, separado por `1px #4a3f33`. Contenido por gate: ver CONTEXT D-03 y D-05.
2. **Novedades:** NovedadesCard del sketch 004 sin cambios visuales.
3. **Registro del día:** card; título de sección + "n de 3"; pregunta Geologica 600 16; 3 botones borde 1.5 `terra`, texto `terra`. Colapsado: tick verde 24 + resumen + "editar" en `terra`.
4. **Patrocinadores:**
   - Track a sangre con padding 16 y `scroll-padding-inline: 16`, gap 10.
   - Card 82 %, `min-height 156`, radio 16, fondo/texto de la marca. La no activa va a escala .94 **sin opacidad**.
   - Logo 44 con radio 12, en colores invertidos.
   - Pastilla de canje sólida invertida ("TEMPLO15" / "Mostrá tu carnet").
   - Marca de agua a .13 (decorativa).
   - Puntos 7 px, el activo 24 px con barra de progreso `terra`.
   - Hoja de detalle: hoja inferior blanca, radio 20 arriba.
   - Carnet: pantalla completa `ink`, "Socio activo" en píldora verde, hora en vivo Montserrat 700 34 tabular.
5. **Tu semana:** card; número Montserrat 700 32 + "sesiones / esta semana" + 7 puntos de 22 px (entrenado = `terra` relleno; hoy = borde `ink` 2 px) + "N sesiones en total" en `ink-2`.
6. **Para vos:** card blanca, borde `line`, ~130 alto, kicker `terra` 10, título 16, una línea `ink-2`, link "Acción →" `terra`. Track con la siguiente asomando 24 px, sin dots.
7. **Frase:** sin fondo propio; Cinzel; entrada palabra por palabra (.55 s, escalón .09 s) al entrar en pantalla; con `prefers-reduced-motion` aparece estática.

**Overlays:**

- **FAB QR extendido:** alto 56, radio 28, `terra`, ícono QR + "Marcar asistencia" Geologica 600 16, a 16 del borde y 16 sobre la tab bar. Pulso suave. Solo en la ventana ±20 min.
- **Pop-up de entrada:** modal actual sin cambios de diseño (salvo contraste de su botón: texto ≥ 4.5).

## Interacción

- Patrocinadores: avance automático (constante, 2 s por defecto), pausa 3 s al tocar, swipe manual, toque en un punto = saltar, toque en una card = hoja de detalle.
- Registro: responder avanza; con las 3 respondidas, colapsa.
- Hitbox mínimo 44×44 en todo lo tocable (los puntos del carrusel pueden ampliar el área táctil con padding).

## Criterios visuales verificables

- `contrast.py` sobre las capturas "después": 0 fallas.
- Card de hoy completa dentro de y ≤ 788 a 390×844 en las 7 variantes.
- Sin overflow horizontal a 360/390/412.
