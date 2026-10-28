---
sketch: 014
name: mensajes-flash
question: "¿Dónde y cómo mostramos los mensajes flash (Notify) para que no tapen la barra de navegación y sigan el lenguaje del rework?"
winner: "B (píldora oscura sobre la barra, ícono de color, acción opcional)"
tags: [app, notify, toasts, feedback, reservas]
---

# Sketch 014: Mensajes flash

## Design Question

Los mensajes flash son el `Notify` de Quasar (~60 en la app, 19 en Reservas): salen abajo por defecto y tapan la barra de navegación ~3 s, con los colores genéricos de Quasar.

## How to View

Abrir `.planning/sketches/014-mensajes-flash/index.html` (desde Windows: `\\wsl$\Ubuntu\home\franco\projects\el-templo\.planning\sketches\014-mensajes-flash\index.html`). Arriba, los botones disparan mensajes reales (reserva confirmada, cancelada, lista de espera, teléfono inválido, error) en los 4 teléfonos a la vez.

## Variants

- **Hoy:** Notify de Quasar abajo, rectangular, verde/rojo/amarillo, tapa la barra.
- **A · Arriba, card clara:** baja debajo del encabezado; card crema con borde, franja del tono (salvia / ocre / rojo tierra), ícono en círculo y X.
- **B · Abajo, sobre la barra:** píldora oscura (hermana de los pop-ups) encima de la barra, con ícono de color y acción opcional ("Ver", "Deshacer").
- **C · En el lugar:** lo positivo no muestra cartel (la card del horario pasa a "Reservado" con un pulso salvia); solo errores y avisos usan un mensaje arriba, con el tono de fondo.

Se implementaría global (defaults de `Notify` en `quasar.config` + un estilo), no tocando los ~60 llamados uno por uno.

## What to Look For

- ¿Se ve el mensaje sin perder la barra de navegación?
- ¿Arriba (A) se nota o pasa desapercibido mientras mirás abajo?
- C: ¿alcanza el cambio de la card para saber que se reservó?
