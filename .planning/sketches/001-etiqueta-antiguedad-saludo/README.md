---
sketch: 001
name: etiqueta-antiguedad-saludo
question: "¿Qué forma toma el sello 'verificado' de oro del Templo a la derecha de 'Hola, {nombre}!'?"
winner: "A"
tags: [badge, verificado, saludo, mi-templo, antiguedad]
---

# Sketch 001: Sello verificado del Templo (oro)

## Design Question

Un socio con 1+ año activo recibe un sello estilo "verificado" de Instagram/Twitter,
pero **en oro y con iconografía del Templo**, inline justo a la derecha de "Hola, Nacho!".
¿Qué forma tiene ese sello?

**Historia del sketch:** la ronda 1 exploró pill de años / medallón de nivel / firma
tipográfica (sin entidad nueva, en bronze). Franco redirigió: quiere el concepto
"verificado" en oro. La ronda 2 (actual) reemplaza las variantes.

**Restricciones relevadas del código real:**

- El saludo vive en `el-templo-app/src/layouts/MainLayout.vue` (solo visible en Mi Templo).
- El acento dorado estaba anotado como **RESERVADO para Aura** (`MiTemplo.vue:26`) —
  Franco decidió usar oro igual para este sello; queda flagueado como decisión consciente.
- `GET /me` hoy **no expone fecha de alta** → requisito backend chico (exponer `createdAt`
  o derivar de la 1ª suscripción) para calcular la antigüedad que gatilla el sello.

## How to View

open .planning/sketches/001-etiqueta-antiguedad-saludo/index.html

## Variants

- **A: Roseta verificado** — la roseta festoneada clásica de IG/Twitter en gradiente oro, con un templo blanco adentro. Lectura instantánea de "verificado".
- **B: Medalla laureada** — círculo de oro con corona de laurel grabada y templo blanco. Más clásica/olímpica, menos "red social".
- **C: Templo de oro** — la silueta del templo (frontón + columnas) directamente en oro, sin contenedor. La más propia de la marca, menos "verificado" a primera vista.

## What to Look For

- Cada variante tiene un **zoom ×4** abajo para juzgar el detalle del ícono.
- Controles: **1/2/5 años** cambia el tooltip; **18/21/24px** prueba el tamaño inline junto al nombre (¿a 18px se sigue leyendo el templo?).
- Tocar el sello: animación "pop" + tooltip "Miembro del Templo desde jul 2024 · 2 años".
- ¿El oro del sello pisa al acento Aura (`auto_awesome` dorado de la card especial) o conviven?
- ¿La roseta (A) se siente "prestada" de las redes o justamente por eso comunica estatus al instante?
