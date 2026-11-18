---
sketch: 033
name: aviso-asistencia
question: "¿Cómo avisa la app que se registró la asistencia y se sumaron 5 de Aura: píldora sobre la barra (A), celebración a pantalla completa (B) o resumen con tu clase (C)?"
winner: "B: celebración a pantalla completa, igual para alumnos y staff. Sin el +5 cuando la asistencia no acredita Aura"
tags: [app, asistencia, aura, fase-214]
---

# Sketch 033: Aviso al marcar asistencia

## Design Question

Fase 214, D-40. Hoy `CheckInPage.vue` muestra un tilde, "Asistencia registrada", la sede y un botón "Volver", sin mención del Aura. Franco pidió un aviso mejorado. Con la escala nueva cada asistencia suma 5. Al staff no se le muestra Aura.

## How to View

Abrir `.planning/sketches/033-aviso-asistencia/index.html` (desde Windows: `\\wsl$\Ubuntu\home\franco\projects\et-comunidad\.planning\sketches\033-aviso-asistencia\index.html`). "Repetir animación" vuelve a correr la entrada. Se puede cambiar entre alumno y staff.

## Variants

- **Hoy:** como está.
- **A · Píldora sobre la barra:** vuelve sola a Mi Templo y aparece la píldora oscura de los mensajes de la app con "+5 Aura" en dorado.
- **B · Celebración:** pantalla oscura con el "+5" grande, el total que sube y "Listo".
- **C · Con tu clase:** confirma, muestra el "+5" con el total, con quiénes entrenás hoy y cómo va la semana.

## Ajuste de Franco sobre B (2026-11-17)

El "+5" va sin la chispa de Aura. La chispa pasa a la línea del total: "Tu Aura: ✦ 320", después del texto y antes del número.

## What to Look For

- Esto pasa unas 3 veces por semana: ¿cuál no cansa a la décima vez?
- ¿El "+5" se entiende sin explicación?
- ¿Vale la pena el toque extra de B y C?
- Staff: ¿queda bien sin la parte de Aura?
