---
sketch: 012
name: dialogos-tramite
question: "¿Cómo llevamos los diálogos genéricos de Quasar que quedan (Reservas, eliminar cuenta, elegir sede) al lenguaje de la card de hoy sin que un sí/no se vuelva ceremonia?"
winner: "A · Hermana clara (crema + borde degradé fino, botón terracota con destello; destructivo en rojo sin destello) + copy corregido"
tags: [app, dialogos, reservas, perfil, quasar]
---

# Sketch 012: Diálogos de trámite

## Design Question

Después de los pop-ups (sketch 010) y login/onboarding (011) quedan con el `q-card` genérico de Quasar: los 5 de confirmación de `ReservasPage.vue` (reservar / cambiar horario / lista de espera / cancelar reserva / prueba / partner), eliminar cuenta (`ProfilePage.vue`), el texto del programa (`ProgramProgressCard.vue`) y elegir sede (`BranchPickerDialog.vue`). Son trámites, no mensajes de El Templo.

## How to View

Abrir `.planning/sketches/012-dialogos-tramite/index.html` (desde Windows: `\\wsl$\Ubuntu\home\franco\projects\el-templo\.planning\sketches\012-dialogos-tramite\index.html`). Arriba: diálogo, ancho y movimiento.

## Variants

- **Hoy:** `q-card` blanca de Quasar, título Roboto, botones planos en mayúsculas a la derecha.
- **A · Hermana clara:** card crema `#fbf8f3` con el borde degradé fino (quieto), título Montserrat 700, texto tinta, botón terracota con destello a lo ancho y el secundario como link. Lo destructivo (cancelar reserva, eliminar cuenta) en rojo `#b34a4a → #8f3434` y SIN destello.
- **B · Hermana oscura:** lo mismo con la superficie oscura de los pop-ups (sketch 010 A).

Copy: en A y B los textos van corregidos (faltan "¿" en las preguntas de Reservas y tildes en eliminar cuenta: "acción", "eliminarán", "Confirmá"); Hoy los muestra como están.

## What to Look For

- ¿A se siente de la familia y sigue siendo liviana para un sí/no?
- ¿B es demasiado "ceremonia" para un trámite? ¿Compite con los pop-ups de Mi Templo?
- Eliminar cuenta: ¿el rojo sin destello comunica bien que es destructivo?
