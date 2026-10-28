---
sketch: 023
name: guia-sobre-blanco
question: "Franco: en la Guía muchos textos van sobre el crema y se leerían mejor sobre blanco. ¿Cómo queda cada pantalla con el texto en superficies blancas? En la ficha: ¿una card por sección (A) o la figura arriba sobre crema + una hoja blanca continua (B)?"
winner: "Tu cuerpo: Después sin la card de los de adentro (van en la hoja de su zona) · Ficha: A con kicker en Montserrat 800 · Historias: panel blanco centrado · Nombre: a elegir entre 4 candidatos"
tags: [app, guia, anatomia, legibilidad, fase-200]
---

# Sketch 023: Guía sobre blanco

## Design Question

Revisión de Franco (2026-10-23): en la Guía muchos textos quedan sueltos sobre el fondo crema (`$brand-cream` #f2ede5) y deberían ir sobre blanco para leerse mejor. Recorrido pantalla por pantalla, Antes (como está en `origin/master`) y Después.

## How to View

open .planning/sketches/023-guia-sobre-blanco/index.html

## Pantallas y variantes

1. **Tu cuerpo** (`TuCuerpoPage.vue`). Antes: título, "Tocá un músculo", el selector Frente/Espalda y "Los que no se ven (están más adentro)" sobre crema. Después: barra superior blanca, una card blanca con la ayuda, el selector y la figura, y otra con los músculos de adentro.
2. **Ficha del ejercicio** (`TuCuerpoFichaPage.vue`). Es la pantalla con más texto. Hoy todo va sobre crema y solo los errores comunes van en cards blancas.
   - **A · Una card por sección:** encabezado, figura con sus músculos, dónde sentirlo, tips y errores, cada uno en su card.
   - **B · Figura arriba + hoja blanca:** la figura queda sobre crema (la leyenda en pills blancas) y todo el texto en una sola hoja blanca con divisores.
   - Botones para ver Push Ups, Front Lever y Planche (esta última sin contenido, con el cartel "Pronto").
3. **Historias de día** (`GuiaPage.vue`, 5 de 7 historias con `theme: 'dia'`). Antes: velo crema translúcido sobre la foto, y el texto sobre ese velo. Después: velo más liviano y el texto en un panel blanco abajo. Las 2 de noche no cambian.
4. **Guía de inicio:** ya va en blanco y oscuro, no cambia (no hay teléfono).

## Textos nuevos

- `copy.js` es el único lugar de los textos nuevos, y también lo usa el 024. Tiene `ROL_FUERTE = "Hace el movimiento"` (elegido 2026-10-23), la definición de "Te sostiene": "No hace el movimiento pero sustenta los músculos que lo hacen.", las 17 definiciones revisadas de `.docs/revision-definiciones-musculos-2026-10-23.md` y el nombre de la sección.
- Push Ups lleva un "qué es" genérico de flexión de brazos. En el código, la ruta `OAPU` es la escalera completa hasta la flexión a un brazo, y su ficha real (`el-templo-api/src/modules/anatomy/content/rutas/OAPU.ts`) solo describe el final. Los tips y errores de este sketch también son genéricos: los reales hablan de "la mano libre", que es de la flexión a un brazo.

## What to Look For

- Si el blanco mejora la lectura sin que la pantalla se vuelva una pila de cajas (A vs B en la ficha).
- En las historias: si el panel blanco tapa demasiado la foto.

## Datos

- Figura y músculos: borrador de la investigación (sketch 019, `data.js`). Hoja y lógica de alumno: 020 (`app.css`, `alumno.js`, `alumno-ui.js`).

## Ajuste (2026-10-23, vuelta 2)

Respuestas de Franco y cambios:

1. **Tu cuerpo:** el Después está aprobado. Franco preguntó si "Los que no se ven" podían sumarse a algún lado al tocar. Ahora **no hay card aparte**: serrato, manguito e iliopsoas entran en la hoja de la zona que tienen encima, como un músculo más del selector del 024 (b), con borde punteado y la marca "adentro". La figura gana alto. Hay un teléfono con la hoja de Hombros abierta y el manguito elegido. Las zonas elegidas y su porqué están en el README del 024.
2. **Ficha:** gana **A** (una card por sección). El kicker del patrón ("PUSH", "PULL") pasa de Cinzel a **Montserrat 800** con tracking: en la app, `.ficha__kicker` hoy usa `pd-kicker-light` (Cinzel 11 px); el cambio es usar el estilo de `pd-role-label`.
3. **Nombre de la sección:** Franco quiere otro que "Tu cuerpo". Un selector arriba de la página (y del 024) prueba 4 candidatos en todos los lugares: card de la Guía, título de la pantalla, "‹ volver" de la ficha y "Ver en … ›" de la hoja en Entrenar. Candidatos: **Tus músculos**, **Mapa del cuerpo**, **Anatomía**, **Qué trabajás** (y "Tu cuerpo" para comparar). La elección se recuerda entre los dos sketches.
4. **Historias de día:** aprobado, con el panel blanco **centrado** vertical y horizontalmente (máx. 340 px de ancho); "Tocá para seguir" queda abajo, centrado.

Los teléfonos "Antes" usan los textos nuevos de las definiciones; solo el rótulo vuelve a "Trabaja fuerte" para mostrar cómo está hoy.

## Ganador

- **Tu cuerpo:** Después, sin la card "Los que no se ven" (los profundos van en la hoja de su zona).
- **Ficha:** A, una card por sección, kicker del patrón en Montserrat 800.
- **Historias de día:** panel blanco centrado.
- **Nombre:** pendiente entre los 4 candidatos.
