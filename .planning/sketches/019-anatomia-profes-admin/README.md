---
sketch: 019
name: anatomia-profes-admin
question: "¿Cómo recorre un profe la sección Anatomía del admin: por complejo → ruta (A), por músculo tocando el cuerpo (B) o con un buscador y las dos entradas (C)?"
winner: "B → B2 (ronda 2): solo el cuerpo, hoja desde abajo, ficha a pantalla completa + (i) por rol y glosario"
tags: [admin, anatomia, profes, figura, navegacion]
---

# Sketch 019: Anatomía para profes (admin)

## Design Question

Entrada nueva **Anatomía** en el menú izquierdo del admin (Entrenamiento, después de Árbol), con toda la información para los profes. Define el modelo de navegación que después reusan la Guía (020) y Entrenar (021) de la app.

## How to View

open .planning/sketches/019-anatomia-profes-admin/index.html

(`#b`, `#c`, `#a-PS` o `#c-FL` abren directo una variante o ruta. Abajo a la derecha: 390 / 820 / 1280.)

## Variants

- **A: Complejo → ruta → ficha**: árbol Push / Pull / Lower / Core / Movilidad / Flow con conteos a la izquierda y la ficha de la ruta a la derecha. En el celular, el árbol pasa a un selector.
- **B: Por músculo**: el cuerpo grande y tocable. Cada zona abre sus músculos (con el aviso "zona = grupo" y la precisión), y cada músculo muestra las rutas por rol (motor / sinergista / estabilizador / se estira). Tocar una ruta abre su ficha en una hoja lateral. Aparte, los músculos profundos que el dibujo no muestra.
- **C: Buscador + las dos entradas**: "¿Qué te preguntó el alumno?" busca rutas, músculos, ejercicios y preguntas tal cual. Debajo van las preguntas frecuentes (llevan directo a la sección de la ficha), recorrer por músculo y recorrer por complejo.

La **ficha de ruta** es la misma en las tres: encabezado (complejo, código, n ejercicios, tipo, brazo, "Borrador · sin validar"), resumen, chips de sección, cuerpo pintado por rol + aviso de lo que no está en el dibujo, y secciones Articulaciones y músculos · Fases · Por qué progresa · Se siente / compensa · Cues · Cuándo derivar · Ejercicios. Cada afirmación lleva su marca de evidencia (L1, C, M, R, H o número de fuente).

## What to Look For

- Si un profe en la sala llega en 2 toques a la respuesta ("¿por qué me cuesta más el full?", "me duele la ingle en el pistol").
- Si el cuerpo pintado por rol se entiende sin leer la leyenda.
- Si el aviso "zona = grupo" y la precisión (exacta / agrupada / aproximada) se leen o molestan.
- Densidad de la ficha: si sirve para estudiar y para responder rápido.
- A 390 px: árbol → selector, cuerpo arriba más chico, tabla en bloques.

## Datos

- Contenido real de `.planning/research/anatomia-profes-2026-10-21.md`: árbol y conteos (§1.2), FL (S3.1) y PS (A2) completos, y músculo → rutas por rol de las tablas S8 y TI-H. Las otras rutas muestran sus músculos por rol + "ficha en preparación".
- Nombres con D1 (Espinales y planchas laterales, Manna, Side Pancake, Fondos, Front Lever Row). Sin PLYO / CARDIO / KL (D2). Todo en **borrador**: falta el kinesiólogo humano (D5).
- Figura: react-native-body-highlighter v3.2.0 (MIT, ELABBASSI Hicham), hombre frente / espalda, sacada del sketch 015 (`anat.js`).

## Ronda 2 — B en el celular (`ronda2.html`)

Franco eligió B (2026-10-21): los profes entran al admin desde el celular, y la app de alumnos va a ser parecida. La ronda 2 muestra dos celulares lado a lado:

- **B2 · Solo el cuerpo**: frente / espalda en grande con un botón para girar. Al tocar una zona sube una hoja desde abajo con sus músculos y roles; la hoja se arrastra para verla entera, achicarla o cerrarla, y el cuerpo se achica arriba para que la zona marcada siga a la vista. Al tocar una ruta se abre la ficha a pantalla completa, con "← Espalda alta" para volver.
- **B3 · Cuerpo + buscador arriba**: igual que B2, más un buscador que va directo a una ruta, un músculo (gira a la vista donde se ve) o una pregunta (abre la ficha en esa sección).

Archivos compartidos con la ronda 1: `base.css`, `ficha.js` (figura, ficha, panel de zona, índice del buscador), `data.js`, `anat.js`.

## Ganador (2026-10-21)

**B2.** Franco: B porque los profes entran al admin desde el celular, y la app de alumnos va a ser parecida. Sin buscador. Pidió que se explique qué es motor, estabilizador, etc. → cada rol lleva una (i) que despliega su definición con un ejemplo de nuestras rutas, más un **glosario** (roles, tipos de contracción, precisión de la zona) que se abre debajo del cuerpo y desde la ficha ("¿Qué significa cada rol?").

Para la fase: la base es B2 en el celular. En el escritorio, la misma navegación de B de la ronda 1 (cuerpo a la izquierda, panel a la derecha, ficha en hoja lateral). Modelo de datos y ficha compartidos con la Guía (020) y Entrenar (021).

### Ajuste post-ganador (2026-10-21)

Franco: las (i) están bien; la pregunta del principio ("¿Qué es motor, estabilizador…?") no va; y al lado de cada rol no se entendía qué hacían las rutas. Cambios:

- Sin el link al glosario debajo del cuerpo (el glosario sigue en la ficha: "¿Qué significa cada rol?").
- Cada rol se lee como frase arriba de sus rutas: **Es motor en · Es sinergista en · Estabiliza en · Es antagonista en · Se estira en**.
- Las rutas van con su nombre completo + el código chico (sin repetirlo si es igual al nombre).
