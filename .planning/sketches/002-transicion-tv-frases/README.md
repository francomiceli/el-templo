---
sketch: 002
name: transicion-tv-frases
question: "¿Cómo aparecen las frases en la pantalla de transición del TV (reposo+cierre unificadas, fondo oscuro)?"
winner: "D"
tags: [tv, kiosco, frases, transicion, reposo, cierre, dark]
---

# Sketch 002: Transición TV — aparición de frases

## Design Question

La pantalla de reposo y la de cierre del kiosco comparten ~90% del contenido
(`src/tv/index.html:92-109`) y hoy la frase cambia con un swap duro de
`textContent` cada 60 s. ¿Las unificamos en una sola "pantalla de transición"
con fondo oscuro (paleta del login de la app de socios) y qué efecto de
aparición/salida le damos a las citas?

## How to View

```
xdg-open .planning/sketches/002-transicion-tv-frases/index.html
```

Deep-links: `#a`, `#b`, `#c`, y con modo: `#a-cierre`, `#c-cierre`.
La frase rota cada 12 s en el mockup (real: 60 s); botón "⟳ Cambiar frase"
para forzar el cambio y ver la transición.

## Variants

- **A: La Pluma (escritura)** — la frase se escribe palabra por palabra
  (fade + leve subida por palabra); al terminar, el remate dorado hace un
  barrido de brillo (shimmer con `background-clip: text`). Layout 60/40:
  frase a la izquierda, columna de identidad (logo/reloj/fecha) a la derecha
  con divisor dorado. Fondo: mármol oscurecido (velo charcoal sobre
  `marble.jpg` — conserva el ADN de la pantalla de clase).
- **B: La Brasa (fuego)** — cada letra se "enciende": aparece con glow ámbar
  (text-shadow) y se enfría hasta su color final (crema / bronce). Chispas
  flotantes y glow radial que respira (mismo `bg-breathe` del login).
  Frase abajo a la izquierda, identidad arriba a la derecha. Fondo: charcoal
  profundo casi negro.
- **C: El Velo (crossfade cinematográfico)** — dos capas alternadas: la frase
  saliente se desvanece hacia arriba mientras la nueva entra desde abajo
  (crossfade real, sin hueco), con una línea dorada vertical que se dibuja al
  costado. Fondo: foto `bar-train2.webp` (la del login de socios) con Ken
  Burns lento + viñeta oscura. Identidad discreta abajo a la derecha.
- **D: Síntesis ★ GANADORA (elección de Franco, 2026-08-25)** — layout de A
  (frase izquierda / columna de identidad derecha con divisor), letras que se
  encienden de B (glow ámbar → color final), salida de A (fade limpio hacia
  arriba, sin el estiramiento de letras de B), fondo `bars-open.webp`
  (Hércules y el león) con velo charcoal en gradiente — más oscuro detrás
  del texto, más abierto sobre el relieve. Chispas y glow de B atenuados.
  Ajuste 2026-08-25: imagen HQ 3072×2048 dejada por Franco en
  `.docs/bars-open.webp` (la de `el-templo-app/public` era 1536×1024 y se
  pixelaba) + velo aclarado (~.87→.4 de izq a der) con sombra estática de
  legibilidad en frase/autor (los keyframes del ignite terminan en esa
  sombra para no pisarla). Deep-link `-still` (p. ej. `#d-still`) renderiza
  sin animaciones, para screenshots/QA. Segundo ajuste: sin línea divisoria
  entre frase e identidad, y el logo wordmark reemplazado por el partenón
  dorado de `el-templo-app/icons/icon-512.webp` (sin filtro — ya es dorado
  sobre transparente, resuelve el problema del logo navy).

## Estados

Toggle **Pre-clase** (reloj protagonista + fecha) vs **Sesión completa**
(título "SESIÓN COMPLETA" con tracking-in de letter-spacing + reloj chico).
La zona de frase es idéntica en ambos → confirma que una sola pantalla sirve
para los dos estados.

## What to Look For

- ¿Qué efecto de aparición se siente "El Templo": escritura, fuego o velo?
- ¿El fondo: mármol oscurecido (A), negro brasa (B) o foto con viñeta (C)?
  Son intercambiables entre variantes — se puede cruzar efecto × fondo.
- Transición de salida: A y B vacían antes de escribir la nueva; C cruza
  (nunca queda la zona vacía). ¿Molesta el hueco de ~1 s en A/B?
- Pre-clase vs Sesión completa: ¿alcanza con título + tamaño de reloj?
- El logo va en monocromo hueso vía `filter` (el PNG es navy sobre claro y
  desaparece en fondo oscuro) — para producción conviene exportar una versión
  clara del logo real.

## Notas técnicas (Chromium 53 / kiosco)

- Todos los efectos usan solo `opacity`/`transform`/`text-shadow`/keyframes —
  sin `backdrop-filter`, sin `filter: blur()` animado, sin `gap` (flex con
  márgenes). El shimmer usa `-webkit-background-clip: text` (soportado en 53).
- El filtro del logo (`brightness/invert/sepia`) es estático, no animado.
- JS del mockup es ES5/ES2015-safe (var, funciones clásicas) — portable casi
  directo a `render.ts` del kiosco.
- Frases con el modelo real de master (`segments[{text, gold?}]`); la de
  Pessoa prueba el doble remate dorado.
