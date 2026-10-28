---
sketch: 020
name: guia-anatomia-app
question: "¿Cómo se ve la Guía partida en dos (Empezá acá arriba, Tu cuerpo abajo): hermanas oscuras de los pop-ups (A), claras con imagen (B) o mitades a sangre (C)? Y la vista grande Tu cuerpo en tono alumno."
winner: "Síntesis: layout de B con los dos botones llenos + Empezá acá con el fondo de A"
tags: [app, guia, anatomia, alumnos, figura]
---

# Sketch 020: Guía en dos cards + Tu cuerpo

## Design Question

Franco (2026-10-21): la pestaña **Guía** de la app se parte en dos. Arriba, una card **Empezá acá** que lleva a las historias de hoy (sin cambios). Abajo, una card que lleva a una **vista de anatomía interactiva en grande**. La vista grande es la B2 del sketch 019 (ganadora para profes) en tono alumno.

## How to View

open .planning/sketches/020-guia-anatomia-app/index.html

Tres celulares lado a lado. Tocá cualquiera de las dos mitades.

## Variants (la portada de la Guía)

- **A · Hermanas de los pop-ups**: las dos cards oscuras, con el marco que fluye y la línea luminosa (el lenguaje del 010 A). Foto de las barras en Empezá acá; cuerpo encendido asomando en Tu cuerpo.
- **B · Claras con imagen**: las dos blancas. Foto con velo crema arriba, cuerpo grande asomando abajo. La única card oscura sigue siendo la de hoy en Mi Templo.
- **C · Mitades a sangre**: sin cards. La pantalla partida en noche (como la primera historia) y día, con la línea luminosa en el medio y títulos en Cinzel.

- **★ Síntesis (ganadora, 2026-10-21)**: Franco eligió B con los dos botones llenos y el fondo de A para "Cómo es entrenar en El Templo": Empezá acá oscura con la foto de las barras (sin el marco que fluye), Tu cuerpo blanca con el cuerpo encendido asomando. "Tu cuerpo" para alumnos, aprobada como está.

## Tu cuerpo (igual en todas)

- `‹ Guía` + "Tu cuerpo". Frente / espalda con giro, "Tocá un músculo". Debajo, los músculos que no se ven (serrato, manguito rotador, iliopsoas).
- Al tocar una zona sube una hoja desde abajo. Por cada músculo: **qué hace** en una frase y tres grupos de ejercicios (en vez de los cinco roles de los profes): **Trabaja fuerte en** (motor + sinergista) · **Te sostiene en** (estabilizador) · **Se estira en**. Cada grupo tiene su (i) con la definición simple. El antagonista no se muestra.
- Sin códigos de ruta, sin banderas de derivación: al pie, "¿Te molesta o te duele acá? Avisale a tu profe".
- Al tocar un ejercicio se abre su ficha corta: qué es, el cuerpo pintado (trabaja fuerte / te sostiene), dónde se siente, tips y errores comunes. Completa solo para Front Lever y Pistol Squat.

## What to Look For

- Si las dos mitades se leen como dos puertas del mismo peso, y cuál compite menos con la card de hoy de Mi Templo.
- Si "Trabaja fuerte / Te sostiene / Se estira" se entiende sin la (i).
- Si la ficha corta tiene el largo justo para un alumno.

## Datos

- Mismo modelo que el 019 (`../019-anatomia-profes-admin/data.js`, `ficha.js`, `anat.js`) + `alumno.js` (qué hace cada músculo, los 3 grupos, la ficha corta de FL y PS).
- Todo en **borrador**: a los alumnos no se les muestra nada hasta la validación humana (D5).
- Implementación: hoy los links "¿Qué es Nucleus?" de las cards de bloque (`guia-role-map.ts`) saltan a un slide de la Guía. Con la Guía partida, tienen que seguir yendo directo a la historia, no a la portada.
