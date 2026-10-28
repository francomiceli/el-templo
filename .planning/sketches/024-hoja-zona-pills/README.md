---
sketch: 024
name: hoja-zona-pills
question: "Al tocar una zona: ¿'Hoy en tu clase' como pills por bloque (A simples en la card oscura, B con punto por rol sobre blanco, C que se abren)? ¿Y cómo mostrar 'N músculos en esta zona' (A uno a la vez, B cards por músculo, C primero los ejercicios)?"
winner: "a: B sin pills (bloque con su punto de rol, como texto y sin toque) · b: C con un músculo elegido por defecto, su qué hace en un globo pegado a la pill y sus ejercicios abajo; los profundos entran en la zona que tienen encima"
tags: [app, entrenar, guia, anatomia, fase-197, fase-200]
---

# Sketch 024: Hoja de zona — pills por bloque y músculos de la zona

## Design Question

Revisión de Franco (2026-10-23) de la hoja que sube al tocar una zona del cuerpo (Entrenar/Semana, ganador A2 del 021, y Tu cuerpo).

**a · Hoy en tu clase.** Hoy es una card oscura que repite, por cada bloque que toca la zona, el rol, el nombre, hasta tres líneas de músculos ("Trabaja fuerte / Te sostiene / Se estira: …") y tres ejercicios. Se calcula **por bloque**, no por ejercicio: el API junta todas las rutas del bloque (`zoneHitsDelBloque` en `el-templo-api/src/modules/anatomy/zone-hits.ts`). Con un músculo que aparece en varios bloques, queda larga. Franco pidió reducirla a pills por bloque.

**b · "N músculos en esta zona"** (`ZonaAlumno.vue`). Hoy es un título con el número y los músculos uno tras otro, cada uno con sus grupos y ejercicios (largo y repetido en zonas de 2-3 músculos).

## How to View

open .planning/sketches/024-hoja-zona-pills/index.html

## Variants

**a · Hoy en tu clase** (fondo: Entrenar con los chips de bloque; el de entrada en calor dice **Pyros**)

- **Antes:** la card oscura de hoy.
- **A · Pills simples:** la misma card oscura, solo con pills "Nucleus · Dominadas". Tocar un pill cierra la hoja y lleva al bloque.
- **B · Pill + qué hace:** sobre blanco. Cada pill lleva un punto con lo que hace la zona en ese bloque: hace fuerza, te sostiene o se estira (gana el más fuerte). Abajo, una leyenda mínima con solo los grupos que aparecen.
- **C · Pills que se abren:** como B, pero al tocar un pill se abre debajo el detalle de ese bloque (músculos por grupo y tres ejercicios). Se abre uno a la vez.
- Zonas de prueba: espalda alta (3 bloques), abdomen, bíceps, pecho y pantorrillas (hoy no se trabaja).

**b · Músculos de la zona** (fondo: Tu cuerpo)

- **Antes:** como hoy.
- **A · Uno a la vez:** el título es la zona y el kicker dice "3 músculos". Pills con los músculos, y se ve uno por vez. Con un solo músculo no hay pills: el título es el músculo.
- **B · Cards por músculo:** qué hace + un resumen ("Hace fuerza en 6 ejercicios · Te sostiene en 3 ejercicios"). Al tocar se abren sus ejercicios. La primera arranca abierta.
- **C · Primero los ejercicios:** los ejercicios de toda la zona juntos y sin repetir, cada uno en el grupo más fuerte. Los músculos van en pills arriba: tocás uno para ver qué hace.
- Zonas de prueba: espalda alta (3 músculos), zona lumbar (2), abdomen (1).
- No hay variante con "figura que resalta cada músculo": la figura dibuja la zona entera (dorsal, redondo y romboides son la misma mancha, `precision: agrupada`), así que no puede marcar uno solo.

## What to Look For

- a: si el pill solo ya responde "¿qué estoy trabajando acá hoy?" o hace falta el punto de rol (B) o el detalle (C).
- b: zonas con 3 músculos. ¿Uno a la vez (A) esconde demasiado? ¿Las cards (B) siguen siendo largas abiertas?

## Datos

- Jueves "Tirón y core" del 021 (Pyros / Nucleus Dominadas OAP / Deuteros Front lever FL / Epikos Core TTB). Músculos y rutas: borrador del 019.
- Textos nuevos ("Hace el movimiento", definición de "Te sostiene", las 17 definiciones revisadas, nombres Dominadas/Push Ups/Remos, nombre de la sección) desde `../023-guia-sobre-blanco/copy.js`.

## Ajuste (2026-10-23, vuelta 2)

Elecciones de Franco y cambios. La página ahora muestra solo **Antes** y **Ganador** en cada pregunta (las variantes que no ganaron se sacaron).

**a · Hoy en tu clase: B, sin pills.** Una línea por bloque con su punto (qué hace la zona en ese bloque: hace el movimiento / te sostiene / se estira, gana el más fuerte), como **texto**, sin forma de botón y **sin toque**: lo que se toca son los ejercicios de abajo. Leyenda mínima con solo los puntos que aparecen. Debajo va la hoja ganadora de (b) y "Ver en … ›". Un selector prueba cómo nombrar el bloque: **Nucleus** (default: los bloques de la clase se llaman así en la Guía), **Dominadas** o **Nucleus · Dominadas**. Los cálculos incluyen a los músculos de adentro (p.ej. Hombros: el manguito sostiene en Dominadas y Front Lever).

**b · La zona: C con un músculo elegido.** Ya no hay estado "ninguno elegido":
- Arriba, kicker "N músculos" y el título con la zona. Abajo, las pills de los músculos en una fila que se desplaza; arranca elegido el **principal** (el primero de la zona).
- La pill elegida toma el fondo arena y su **qué hace sale en un globo pegado a ella** (la flecha apunta a la pill y la sigue al cambiar o al desplazar la fila).
- Abajo, **sus** ejercicios con sus grupos (Hace el movimiento / Te sostiene / Se estira, con la (i)). Al tocar otra pill cambian el globo y los ejercicios.
- Con un solo músculo no hay pills: el título es el músculo y el qué hace va en el bloque arena, sin flecha.
- Zonas de prueba: Espalda alta (3), Hombros (2 + manguito), Pecho (1 + serrato), Abdomen (1 + iliopsoas), Zona lumbar (2) y Bíceps (1).

Con un músculo elegido siempre, C termina pareciéndose a A de la vuelta 1, pero con pills en vez de segmentos y la explicación nacida del toque.

### Los que no se ven: en qué zona entran

En el contenido del API (`musculos.ts`) tienen `zona: null`. Se suman a la hoja de la zona que tienen encima, al final de las pills, con borde punteado y "adentro" (y "Más adentro" en el globo):

- **Manguito rotador → Hombros.** Rodea la articulación del hombro por debajo del deltoides (y del trapecio, atrás). Su trabajo es mantener el hombro centrado: el alumno lo busca en el hombro.
- **Serrato anterior → Pecho.** Va sobre las costillas del costado, debajo del pectoral y la axila, y en la figura la zona más cercana del frente es el pecho. También trabaja con el pectoral en los empujes (Push Ups, Planche, Handstand Push Up). Alternativas descartadas: Oblicuos (sus dientes de abajo se cruzan con el oblicuo, pero es otro movimiento) y Espalda alta (se desliza debajo del omóplato, pero desde atrás no se ve ni se siente).
- **Iliopsoas → Abdomen.** El psoas baja pegado a la columna lumbar, detrás de la panza, y el ilíaco va por dentro de la pelvis: casi todo el músculo está debajo de la zona del abdomen. Solo el tendón llega arriba del muslo. Alternativa: Cuádriceps, porque es pareja del recto femoral (los dos levantan la pierna). Es más funcional pero menos honesta sobre dónde está.

**Para el código:** hace falta un campo nuevo en los músculos profundos (p.ej. `debajoDe: "deltoids"`) en `musculos.ts`. `musculosDeZona` del store los agrega al final con una marca, y `TuCuerpoPage` deja de pintar la card "Los que no se ven".

## Ganador

- **a:** B sin pills: bloque con su punto de rol, como texto y sin toque, más una leyenda mínima. El nombre del bloque se decide con el selector (default: el rol, "Nucleus").
- **b:** C con un músculo elegido por defecto (el principal), su qué hace en un globo pegado a la pill y sus ejercicios por grupo abajo. Los profundos entran en la zona que tienen encima (Hombros, Pecho y Abdomen).
