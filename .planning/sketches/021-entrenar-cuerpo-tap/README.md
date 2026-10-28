---
sketch: 021
name: entrenar-cuerpo-tap
question: "¿Qué pasa al tocar una zona del cuerpo de hoy en Entrenar (Semana)? Franco eligió A: la hoja de Tu cuerpo con 'Hoy en tu clase' arriba. ¿Solo la hoja (A1) o hoja + chips de bloque marcados (A2)?"
winner: "A2: hoja con Hoy en tu clase + chips de los bloques que trabajan la zona; modos sin mezclar"
tags: [app, entrenar, fase-197, anatomia, figura]
---

# Sketch 021: Entrenar — tocar el cuerpo

## Design Question

En la pantalla Semana de Entrenar (fase 197: chips de bloque a la izquierda del cuerpo), el cuerpo pasa a ser interactivo. Franco eligió (2026-10-21) la opción A: al tocar una zona sube la misma hoja de "Tu cuerpo" (sketch 020), con un bloque **Hoy en tu clase** arriba.

## How to View

open .planning/sketches/021-entrenar-cuerpo-tap/index.html

## Variants

- **A1 · Solo la hoja**: tocar una zona sube la hoja (media pantalla) y el cuerpo con los chips sube para quedar a la vista arriba.
- **A2 · Hoja + chips**: igual, y además los chips de los bloques que trabajan esa zona quedan marcados (borde y punto terracota); el resto se apaga. El cuerpo responde en los dos sentidos: chip → zonas, zona → chips.

## La hoja

1. **Hoy en tu clase** (oscuro, el lenguaje de la card de hoy): por cada bloque de hoy que trabaja la zona, qué hace con esos músculos (Trabaja fuerte / Te sostiene / Se estira) y sus primeros ejercicios. Si ninguno la trabaja: "Hoy tu clase no trabaja esta zona".
2. Lo mismo que en Tu cuerpo: qué hace cada músculo y en qué ejercicios trabaja (con las (i)).
3. "Ver en Tu cuerpo ›" (abre la Guía en esa zona) + "Avisale a tu profe".

## What to Look For

- Si "Hoy en tu clase" responde a la pregunta del alumno ("¿qué estoy trabajando acá hoy?") sin leer el resto.
- A2: si los chips marcados ayudan o suman ruido.
- Que el cuerpo y la zona tocada se sigan viendo con la hoja abierta.

## Datos

- Jueves de "Tirón y core" (plani armada a mano, estilo del 015): Nucleus = Dominadas (ruta OAP), Deuteros = Front lever (FL), Epikos = Core (TTB). Las zonas encendidas salen del **modelo nuevo** (`zonasDeRuta`), no de `muscle-zones.ts`: en la fase, la figura de Entrenar también pasa a la fuente única.
- Sin barra de tabs: la 197 las oculta con `ENTRENAR_TABS_ENABLED=false` (queda solo Semana). Por eso tampoco aparece Libre.
- Estilos de Entrenar copiados del 015 ronda 3 (`entrenar.css`); hoja y lógica de alumno compartidas con el 020 (`app.css`, `alumno.js`, `alumno-ui.js`).

## Ajuste (2026-10-21)

Franco: se mezclaba el marcado del bloque elegido con el de la zona tocada, y al tocar se recargaba la lista de ejercicios (casi tapada por la hoja). Cambios:

- **Dos modos que no se mezclan.** Sin hoja: el cuerpo muestra las zonas del bloque elegido (como en la 197). Con la hoja abierta: el cuerpo muestra **solo la zona tocada**, ningún chip queda como elegido y, en A2, solo se marcan los chips que trabajan esa zona. Al cerrar, vuelve el bloque elegido.
- **Tocar una zona ya no redibuja la pantalla**: solo se repintan el cuerpo y los chips; la lista de ejercicios queda igual. Tocar un chip sí cambia de bloque (y cierra la hoja), como en la 197.

## Ganador (2026-10-21)

**A2.** Hoja de Tu cuerpo con "Hoy en tu clase" arriba + los chips de los bloques que trabajan la zona tocada, con los dos modos separados (bloque elegido / zona tocada) y sin recargar la lista de ejercicios.
