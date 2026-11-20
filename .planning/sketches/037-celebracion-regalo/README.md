---
sketch: 037
name: celebracion-regalo
question: "¿Cómo se avisa, con una celebración chica y sin pantalla completa, que se sumó Aura (regalos y otros motivos): tarjeta que baja desde arriba (A), hoja desde abajo con botón Ver (B), globito pegado a la ficha (C) o la mezcla de C y A (D)?"
winner: "D: mezcla de C y A (sale de la ficha de Aura, tarjeta marfil con filete y línea que se vacía, se va sola a los 5 s), para cualquier Aura"
tags: [app, mi-templo, aura, regalar, celebracion, fase-215]
---

# Sketch 037: Celebración al recibir un regalo de Aura

## Design Question

Fase 215. Un compañero o el profe le regala 1 o 2 puntos de Aura a un alumno, con un motivo ("Buena técnica", "Constancia", "Buena energía", "Me ayudó"). La primera vez que el alumno abre la app después de recibirlo aparece un cartel breve que NO es pantalla completa (la celebración de asistencia, `CheckInCelebration.vue`, sí lo es: fondo oscuro, halo dorado, "+5" grande y "Listo").

Textos:

- Con nombre de compañero: "Juan P. te dio Aura por Buena energía"
- Del profe: "Tu profe Fran te dio Aura por Constancia"
- Sin nombre (quien regaló está oculto o no tiene nombre): "Te dieron 1 de Aura por Buena energía". Nunca "Alguien".
- Varios desde la última vez: un solo cartel resumen, "Recibiste 3 regalos de Aura" (con el total de puntos aparte).

## Decisión de Franco: variante D

D = mezcla de C y A, y vale para CUALQUIER Aura, no solo regalos.

- Mecánica de C: sale de la ficha de Aura del encabezado; la ficha late, sube el "+N" y el número cuenta hasta el nuevo total.
- Diseño de A: tarjeta marfil con filete dorado y la línea dorada que se vacía; se va sola a los 5 s (tocarla abre el detalle de Aura).
- Se dispara al llegar a Mi Templo si se sumó Aura desde la última visita por un motivo que NO tuvo su propia celebración: regalos, rachas, foto aprobada, antigüedad, programas, onboarding. Asistencia, estiramiento y bloque libre NO (ya tienen la suya).
- Textos: regalo "Juan P. te dio Aura por Buena energía" / "Tu profe Fran te dio Aura por Constancia" / sin nombre "Te dieron 1 de Aura por Buena energía" (nunca "Alguien"); racha "+10 · 14 días seguidos entrenando en la app"; foto "+5 · Foto de perfil"; antigüedad "+15 · 3 meses en El Templo"; programa "+50 · Programa completo". El "+N" va en la pastilla de la derecha.
- Varios desde la última visita: "Sumaste 12 de Aura" con los 2 últimos motivos debajo y "y N más" si hay más.

## How to View

Abrir `.planning/sketches/037-celebracion-regalo/index.html` (desde Windows: `\\wsl$\Ubuntu\home\franco\projects\et-comunidad\.planning\sketches\037-celebracion-regalo\index.html`). La D va primera, marcada "Elegida por Franco"; A, B y C quedan como referencia. Arriba se elige el caso (regalo de compañero, del profe, sin nombre, racha, foto, antigüedad, programa, varios) y los puntos de los regalos (1 o 2). "Reproducir las cuatro" (o el botón de cada columna) vuelve a correr la animación. Al abrir la página corre sola una vez.

## Variants

- **D · Desde la ficha, con el diseño de la tarjeta (ELEGIDA POR FRANCO):** ver arriba.
- **A · Tarjeta que baja desde arriba:** marfil con filete dorado (como la ficha de Aura), cara con aro dorado, texto y "+1 ✦". Baja, se queda 5 segundos con una línea que se vacía y se va sola. No pide nada.
- **B · Hoja desde abajo con "Ver":** hoja oscura con halo dorado, cara grande, texto y botón "Ver" (abre el detalle de Aura) más "Ahora no". Se queda hasta que el alumno elige. Cubre la barra de pestañas.
- **C · Globito pegado a la ficha de Aura:** un globito oscuro sale de la ficha del encabezado; la ficha late, sube un "+1" y el número cuenta hasta el total nuevo. Se va solo a los 6 segundos; tocarlo abre el detalle.

## What to Look For

- ¿Se nota lo suficiente sin ser pantalla completa? A es la más suave, B la más fuerte, C la que mejor conecta el regalo con el número.
- ¿Conviene que se vaya sola (A, C) o que espere al alumno (B)? Si se va sola y el alumno no miraba, el regalo igual queda en la bandeja de notificaciones (sketch 035).
- "Sin nombre": la cara es una chispa en vez de una foto. ¿Se entiende sin "Alguien"?
- "Varios": caras apiladas y un solo cartel. ¿Alcanza con el total o hace falta decir quiénes?
- Movimiento reducido: sin deslizamientos, solo aparece y desaparece.
