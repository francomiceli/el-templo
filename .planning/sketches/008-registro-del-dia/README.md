---
sketch: 008
name: registro-del-dia
question: "¿Cómo hacemos el Registro del día más fino y con aire de salud y bienestar, sin perder las 3 preguntas ni el paso de zona del cuerpo?"
winner: "A (píldora; completo = consejo del día)"
tags: [mi-templo, registro-del-dia, check-in, bienestar, fase-199]
---

# Sketch 008: Registro del día

## Design Question

El `CheckInPanel.vue` actual (título, pregunta y 3 botones con borde terracota de 44 px; colapsado en una línea con tilde verde y "editar") se siente viejo (Franco, UAT 2026-10-16). ¿Cuál de estas tres formas lo hace más fino y más de bienestar?

## How to View

Abrir `.planning/sketches/008-registro-del-dia/index.html` (desde Windows: `\\wsl$\Ubuntu\home\franco\projects\el-templo\.planning\sketches\008-registro-del-dia\index.html`).
Arriba: ancho y estado de arranque (sin responder, 1 respondida, molestia → ¿dónde?, completo, completo con día flojo). Las tres variantes se pueden responder, editar y pasar por el paso de zona.

## Variants

- **A · Píldora:** ícono de la pregunta en un círculo salvia y las respuestas en un control segmentado (una píldora con 3 opciones). Al completar, tres chips de color con el estado de cada cosa (verde bien, ocre medio, rojo tierra mal). Completo: ~98 px.
- **B · Caritas:** escala de bienestar con caras (feliz/neutra/triste) coloreadas por estado. Al completar, las tres caras y una frase ("Todo en orden hoy." / "Día flojo: andá con calma.") con el detalle.
- **C · Signos:** Cuerpo, Sueño y Energía como tres indicadores siempre a la vista, al estilo de un tablero de salud. El primero sin responder se abre solo debajo con sus opciones; tocando cualquiera se cambia. No hay modo "colapsado" aparte: completo es la misma fila de indicadores.

Las tres conservan el título "Registro del día" en terracota (D20), las mismas preguntas, opciones y orden (molestia primero) y el paso "¿Dónde?" para molestia leve/moderada. Color de bienestar: salvia `#3f6a47` (6.0:1 sobre blanco), sin azul.

## What to Look For

- ¿Cuál se siente de salud y bienestar y no de formulario?
- Probá "Completo (día flojo)": ¿se entiende de un vistazo cómo está el socio hoy?
- ¿El alto ganado vale lo que se pierde? (A y C completas son más bajas que hoy; B es la más parecida a la actual)
