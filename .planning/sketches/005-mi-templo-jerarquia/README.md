---
sketch: 005
name: mi-templo-jerarquia
question: "¿Cómo se distingue la card de hoy (la acción del día) del resto de Mi Templo: oscura sin estilo de promo, o todas blancas con énfasis por tamaño y sombra?"
winner: "A'"
tags: [mi-templo, jerarquia, rediseno, app, contraste, qr]
---

# Sketch 005: Mi Templo — jerarquía

## Design Question

Mi Templo hoy apila 9–12 cards con el mismo peso, y lo más llamativo es una promo ("¿Qué mejorarías?"). El diagnóstico (`.docs/mi-templo-rediseno-diagnostico.md`) y la Fase 2 (`.docs/mi-templo-rediseno-fase2.md`) definieron la pila nueva, los márgenes y las superficies.

Pregunta abierta: ¿la card de hoy va oscura (A') o todas blancas (C)? Los socios ya asocian "card oscura = promo". Decide la prueba de 5 segundos con socios.

## How to View

open .planning/sketches/005-mi-templo-jerarquia/index.html

Controles arriba:

- **Variante:** A' / C / Antes.
- **Socio:** 6 combinaciones de gates.
- **Momento:** fuera de la ventana / en la ventana ±20 min / ya marcó.
- **Pop-up de entrada:** actual o 2 propuestas.
- **Vista:** pantalla o página completa con la línea del primer viewport.
- **Pruebas:** squint test, zona del pulgar, comparar con antes.

## Variants

- **★ A': Hoy oscura, sin vocabulario de promo** (GANADORA 10-15, elegida por Franco sin prueba de 5 s; el guion queda para validar en staging). Fondo `#2c2318`, texto crema, botón crema. Sin borde dorado ni pastilla de categoría. Es la única superficie oscura; las promos pasan a ser claras.
- **C: Todas blancas.** La card de hoy se distingue por tamaño (título de 28 px), sombra cálida y filete terracota arriba.
- **Antes:** captura real de staging del primer viewport, para comparar.

Común a las dos variantes:

- pila nueva (hoy → registro → novedades → tu semana → para vos → frase);
- margen y padding de 16, sin cajas anidadas;
- texto siempre sólido;
- QR extendido solo en la ventana del turno;
- registro del día de a una pregunta;
- "Tu semana" sin RPE (puntos por día);
- carrusel claro de ~130 px que deja asomar la siguiente slide;
- frase de la tanda activa del TV, **con el look de la pantalla de cierre del TV** (foto + velo oscuro, glow ámbar, Cinzel 700 crema con remate en bronce `#d4b896`, autor Nunito Sans espaciado, entrada palabra por palabra al aparecer en pantalla). Velo más parejo que el TV porque en el celular la frase ocupa todo el ancho.

Patrocinadores (sumado 10-15, brief de la sesión el-templo-50; marcas de ejemplo):

- carrusel de marcas debajo de "Tu semana", adaptado (texto sólido, pastilla invertida, sin opacidad en textos, 6 marcas = límite default);
- avanza solo (control 2 s / 4 s), se pausa 3 s al tocarlo, con puntos y barra de progreso;
- al tocar una card se abre la hoja de detalle: código + "Copiar", o "Mostrá tu carnet" (pantalla con nombre, sede, "Socio activo" y hora en vivo);
- sin plan: la hoja muestra "Activá tu plan para usarlo".

Propuestas para los pendientes de la revisión:

- **Card sin plan:** "Arrancá tu plan" (nunca tuvo) / "Renová tu plan · Te extrañamos" (venció) + gancho "Hoy en Alem se entrena…".
- **Pop-up de entrada:** DECIDIDO modal como hoy; cuando se configura, además queda como primera novedad (cerrarlo no la borra). Las propuestas hoja inferior / aviso en línea quedan en el sketch como descartadas.

## What to Look For

- **Squint test:** con la vista borrosa, ¿qué se ve primero en A' y en C?
- **Ceguera de banner:** ¿A' se lee como "esto es mío" o como otra promo?
- **Primer viewport** (vista página completa): ¿la card de hoy y el registro entran en todos los socios?
- **Zona del pulgar:** botón principal de hoy y QR extendido.
- **Patrocinadores:** ¿le compiten a la card de hoy al hacer scroll? ¿2 s o 4 s alcanzan para leer marca + beneficio + canje?
