---
sketch: 038
name: barra-superior-aura
question: "La ficha de Aura quedó como incrustada en el encabezado. Síntesis elegida por Franco: C · Carnet (foto, nombre, antigüedad y Aura en una tarjeta clara que pisa el encabezado) más la foto de perfil en la barra al scrollear. ¿Queda así?"
winner: "La actual (staging) sin cambios de diseño + la foto de perfil reemplaza al ícono en la barra al scrollear Mi Templo; en las demás pantallas la foto está siempre; sin foto queda el ícono"
tags: [app, mi-templo, encabezado, barra-superior, aura, fase-214, fase-215]
---

# Sketch 038: Foto de perfil en la barra al scrollear

## Decisión final (Franco, 2026-11-19)

"Me parece que tenemos que conservar la actual y ya, solo agregá lo de foto en la barra al scrollear."

El encabezado de Mi Templo y la ficha de Aura quedan como están en staging. Lo único que se suma: el botón de perfil de la barra muestra la foto en lugar del ícono cuando la del encabezado queda tapada por la barra (a los 44 px de scroll); fuera de Mi Templo la foto está siempre; sin foto queda el ícono. En `index.html` es la primera columna (★).

Implementado en el worktree `/home/franco/projects/et-foto-barra`, rama `feat/foto-perfil-en-barra` (basada en `feat/regalar-aura`): `src/utils/bar-profile-photo.ts` con su test, y el botón en `MainLayout.vue`. Ninguna de las variantes de las rondas 1 a 4 ni el Carnet se implementan.

## Design Question

Pedido de Franco (2026-11-19), mirando las fases 214 y 215 en staging: la parte de arriba quedó bien, pero la ficha de Aura "está como incrustada ahí y no se siente naturalmente adherida". Pide versiones de todo el conjunto: logo, título, botones de notificaciones, perfil y salir, nombre, foto y puntos de Aura.

## Recorrido

- **Ronda 1** (`ronda1.html`): cuatro lugares para una pieza de Aura (solapa, medalla en la foto, carnet, barra personal). Franco: "más creativo, fundir el Aura con el fondo".
- **Ronda 2** (borrada a pedido): cuatro fundidos del Aura con el fondo. Sobrevive una idea: el **número fundido**.
- **Ronda 3** (`ronda3-descartada.html`): el número fundido en cuatro acomodos. Franco: "muy malo, solo te basaste en lo que dije del número fundido". El error fue reacomodar las mismas piezas sobre la misma barra en vez de repensarla.
- **Ronda 4** (`ronda4.html`): cuatro **direcciones de arte** para todo el conjunto. Cambian el material, el color, el logo, el título y los botones, no solo el Aura.

- **Síntesis** (`index.html`, la vigente): Franco, después de ver todo: "tal vez lo mejor sea ir con la opción C carnet de ronda 1, y además este cambio: al scrollear, la foto de perfil (si hay) reemplaza al ícono de perfil en la barra alta (así en todo momento el usuario se siente él)".

## Síntesis: C · Carnet + foto en la barra

Abrir `index.html`. Captura fija: `preview-C-carnet.png` (arriba en reposo, abajo scrolleado).

- **Carnet:** el degradé sigue 42 px debajo de la barra y una tarjeta clara lo pisa 32. A la izquierda foto (48, aro dorado), nombre con sello y antigüedad; el extremo derecho es el Aura, marfil, separada por un filete dorado. Tocar la foto abre la hoja de la foto y tocar el Aura abre el detalle, igual que hoy.
- **Foto en la barra:** el botón de perfil tiene el ícono y la foto en el mismo lugar. En Mi Templo, cuando la foto de la tarjeta queda tapada por la barra (a unos 46 px de scroll), el ícono se achica y se va y la foto (30, con su aro) sube y aparece. Al volver arriba, al revés. En las demás pantallas la foto está siempre. Tocarla abre Mi Perfil, como el ícono.
- **Sin foto:** queda el ícono, siempre.

Supuestos míos, a confirmar:

1. Fuera de Mi Templo la foto está siempre en la barra (no hay tarjeta que scrollear).
2. Con una foto todavía en revisión y ninguna aprobada, la barra muestra la misma que el encabezado (la pendiente, que solo ve su dueño), sin la insignia del reloj.
3. El aro de la foto en la barra es dorado con Aura prendida y blanco con Aura apagada, igual que en el encabezado.
4. En escritorio no cambia nada: ahí no hay barra de arriba, hay riel lateral.

Qué mirar: nombre largo y 12.480 de Aura a 360 (la antigüedad baja a dos renglones y la tarjeta crece), Aura apagada (la tarjeta queda solo con la persona) y sin foto.

Costo: `MiTemploHeader.vue` pasa de banda con degradé a tarjeta; el botón de perfil de `MainLayout.vue` necesita saber si la foto de la tarjeta está a la vista (un observador de intersección sobre la foto, sin escuchar el scroll). Revisar el encabezado de escritorio, que hoy reusa el mismo componente con el degradé.

## Rondas anteriores: cómo verlas

- **Capturas fijas** (lo más rápido): `preview-P1.png` a `preview-P4.png` en esta carpeta. Son maquetas armadas con las tipografías, el logo y las imágenes reales de la app, a 390 de ancho.
- **Interactivo de la ronda 4:** `ronda4.html`. Controles: pantalla (Mi Templo o Entrenar), cantidad de Aura (85, 1.240, 12.480 o apagada), nombre corto o largo, con o sin foto y ancho (360, 390, 412). "Simular +5 de Aura" hace latir el número. Tocar el número abre el detalle privado.

Los recursos teñidos están en `assets/` (se generaron a partir de `logo.webp`, `el-templo-title.png` y `bars-open.webp` de la app).

## Variantes de la ronda 4

- **Hoy (staging):** barra de color liso con el logo en un cuadradito, tres botones sueltos y, debajo, foto, nombre, antigüedad y la ficha marfil de Aura.
- **P1 · Friso:** el material de toda la parte de arriba es el relieve de Hércules que la app ya usa de fondo (`bars-open.webp`), teñido de terracota. Logo en crema sin cuadradito, título blanco, botones como medallones oscuros. Foto, nombre y antigüedad como hoy; el Aura es el número fundido, parado sobre el borde. No cambia ningún comportamiento.
- **P2 · Mármol:** se invierte el color. Arriba es mármol claro con una moldura fina abajo (dos filetes bronce y una base terracota). Logo en bronce, título en terracota, botones de línea. El Aura es un número de oro sobre el mármol. No cambia ningún comportamiento.
- **P3 · Columnata:** el templo del logo, enorme y apenas marcado, es el fondo del lado derecho, con un resplandor dorado adentro; el Aura vive entre las columnas. Título al centro de la barra, la foto a la izquierda como acceso al perfil (Cerrar sesión pasa adentro) y la campana a la derecha. Nombre grande a la izquierda.
- **P4 · Una sola barra:** sin segundo renglón. En Mi Templo la barra es la persona: logo, nombre con sello, antigüedad corta, Aura, campana y foto, en 64 px. En las demás pantallas vuelve el título.

## Qué mirar en la ronda 4

- **¿Cuál se siente El Templo?** P1 y P3 tiran hacia lo clásico y tallado; P2 hacia lo limpio; P4 hacia lo práctico.
- **El Aura:** ¿se siente parte del conjunto en cada una? En P2 es oro sobre claro; en P1 y P3 sale del fondo; en P4 es un dato más de la barra.
- **P1 en Entrenar:** el relieve queda como una tira fina en la barra de todas las pantallas. ¿Suma o distrae?
- **P2 con la barra de abajo:** la navegación inferior sigue en terracota. ¿Convive con el mármol arriba?
- **P3 con Aura apagada:** el templo queda de fondo, sin resplandor ni número.
- **P4:** en Mi Templo no aparece el título EL TEMPLO (la regla del 11-18 era que no se oculte nunca) y la antigüedad pierde "en El Templo".
- **Nombre largo a 360** y **12.480 de Aura** en las cuatro.

## Costos de implementación de la ronda 4

- **Número fundido (las cuatro):** reemplaza a `AuraChip.vue`. La tarjeta de celebración (037 D) hoy cuelga de la ficha y hay que re-anclarla. Medir el contraste de la mitad de abajo del número.
- **P1:** un recurso nuevo (el relieve teñido, unos 60 KB). La barra queda fija y el saludo se va con el scroll: hay que resolver cómo se corta la imagen entre los dos (dos recortes de la misma imagen, o barra y saludo como una sola pieza en Mi Templo).
- **P2:** cambia el color de la barra en todas las pantallas (íconos, selector de nivel, barra de estado del teléfono en claro). El título necesita una versión en terracota.
- **P3:** mueve Cerrar sesión a Perfil y la foto pasa a cambiarse desde Perfil. Título centrado: rehacer las cuentas de ancho de la barra (#19).
- **P4:** igual que P3 con Cerrar sesión y la foto, y además cambia la regla del título en Mi Templo.

## Verificación

- El carnet (en reposo y scrolleado) y las cuatro direcciones de la ronda 4 se compusieron y se miraron como imagen (`preview-C-carnet.png` y `preview-P*.png`) antes de escribir el HTML.
- Los HTML (`index.html` y `ronda4.html`) **no** se abrieron en un navegador (en WSL no hay Chrome): se validó por sintaxis y generando todas las combinaciones de estados. Puede diferir de las capturas en detalles finos.
