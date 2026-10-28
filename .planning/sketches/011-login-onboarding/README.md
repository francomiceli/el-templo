---
sketch: 011
name: login-onboarding
question: "¿El login y las preguntas del onboarding toman el lenguaje de la card de hoy / los pop-ups? ¿Manteniendo la card translúcida sobre la estatua (A) o sólida como la card de hoy (B)?"
winner: 'A, sin título chico en la card (ni "Entrá a tu templo" ni "Paso N de 5") y "Bienvenido al Templo" en Cinzel 700 1.22rem .08em (una línea a 360)'
tags: [app, login, onboarding, card-de-hoy, contraste]
---

# Sketch 011: Login y onboarding

## Design Question

`LoginPage.vue` y `OnboardingQuestion.vue` ya usan una card oscura translúcida sobre la foto de la estatua (`bar-train2.webp`) con un botón terracota, pero con el lenguaje viejo (filete terracota arriba, botón plano, textos chicos con poco contraste, opción elegida en un tinte del 15 %). ¿Los llevamos al lenguaje de la card de hoy y los pop-ups (sketch 010 A)?

## How to View

Abrir `.planning/sketches/011-login-onboarding/index.html` (desde Windows: `\\wsl$\Ubuntu\home\franco\projects\el-templo\.planning\sketches\011-login-onboarding\index.html`). Arriba: pantalla (Login / Pregunta de onboarding), ancho y movimiento. En la pregunta, las opciones se pueden tocar.

## Variants

- **Hoy:** lo actual.
- **A · Translúcida + lenguaje de la card:** card translúcida (se ve la estatua) con borde degradé quieto, título chico en Cinzel ("Entrá a tu templo" / "Paso 2 de 5"), campos como los pop-ups, botón con destello, opción elegida en terracota sólido y contraste corregido (textos chicos y links en `#c9bba6`, links subrayados).
- **B · Sólida:** lo mismo con la card sólida `#2c2318` (igual a la card de hoy y los pop-ups); tapa la estatua detrás del formulario.

Los títulos chicos son nuevos (propuesta). Fondo, logo y textos reales de la app.

## What to Look For

- ¿A ya se siente de la familia sin perder la estatua?
- En la pregunta: ¿"Paso 2 de 5" suma o repite los puntos de arriba?
- Probá 360: las 7 opciones entran sin scroll en las tres.
