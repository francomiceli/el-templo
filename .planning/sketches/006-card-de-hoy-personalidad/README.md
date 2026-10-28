---
sketch: 006
name: card-de-hoy-personalidad
question: "¿Cómo le damos más personalidad a la card oscura de hoy (A') sin que parezca promo: brillos de la tarjeta premium vieja, columnas de El Templo o la silueta del logo?"
winner: "C3 + borde A (ronda 2, síntesis)"
tags: [mi-templo, card-de-hoy, brillos, columnas, fase-199, D12]
---

# Sketch 006: Card de hoy con personalidad

## Design Question

La card oscura de hoy (A' del sketch 005, ya implementada en `TodayCard.vue`) quedó correcta pero plana. Franco (UAT 199, D12) pide más personalidad: el botón en la línea del CTA premium viejo, efectos de brillo como la tarjeta vieja y quizás columnas de El Templo. ¿Cuál de las tres direcciones?

## How to View

Abrir `.planning/sketches/006-card-de-hoy-personalidad/index.html` en el navegador (desde Windows: `\\wsl$\Ubuntu\home\franco\projects\el-templo\.planning\sketches\006-card-de-hoy-personalidad\index.html`).
Arriba: botones de estado (clase hoy, próxima clase, reservá, asistencia, online, sin plan, venció) y "Reducir movimiento".

## Variants

- **A: Brasa** — los brillos de la tarjeta premium vieja (borde con degradé que fluye, resplandor arriba a la derecha, chispas, línea luminosa abajo) pasados a terracota.
- **B: Columnata** — relieve de 5 columnas con frontón a la derecha, tono sobre tono, con una luz que cruza entre ellas cada tanto. Sin chispas.
- **C: Frontón** — línea de frontón arriba, silueta del logo real de El Templo detrás con un halo, 2 chispas en los capiteles, kicker en Cinzel (como la frase del día).

Las tres comparten el botón nuevo: forma del CTA premium viejo (degradé 135°, radio 10, texto blanco 600) en terracota `#a35f3c → #7e4529` (blanco 4.9:1 / 7.4:1, AA) con un destello que lo cruza cada 5 s.

## What to Look For

- ¿Se siente "nuestro" (El Templo) o se siente promo/publicidad?
- ¿El texto sigue siendo lo primero que se lee? (sobre todo en "Venció", que tiene la línea más larga)
- ¿El movimiento suma o distrae? Probar con "Reducir movimiento" (así lo ve quien lo tenga activado).
- ¿Qué tomarías de cada una? (p.ej. el borde de A + las columnas de B)

Todo copy usa "clase" (no "turno") y no existe "Hoy descansás" (decisiones UAT D3/D11).

## Ronda 2 (línea C) — `ronda2.html`

Franco eligió C sin el frontón de arriba ("el pico") y sin las chispas sobre el templo. Tres refinamientos:

- **C1 · Halo** — C limpia: logo abajo a la derecha (13%) + halo terracota que respira.
- **C2 · Luz sobre el templo** — mismo logo, un brillo que recorre SOLO la silueta del templo cada 6 s + filo terracota de 1 px en el borde de la card.
- **C3 · Columnata del logo** — logo ampliado y recortado arriba a la derecha (se ven sus columnas en el borde) + línea luminosa abajo.

## Ganador ★ Síntesis C3 + borde de A

- Logo real de El Templo (`public/logo.webp`) ampliado (330 px) y recortado arriba a la derecha (`right:-120px; top:-40px`), opacidad .12, `filter: sepia(.6) saturate(1.6) brightness(1.4)`.
- Halo terracota detrás (`radial-gradient(rgba(163,95,60,.38), transparent 65%)`, 220 px) que respira (7 s).
- Línea luminosa abajo (2 px, `#a35f3c → #e9bf9b → #a35f3c`, inset 16 px).
- Borde de la A: wrapper con padding 1.5 px y degradé 115° `#4a3a2b / #a35f3c / #f0d2b4 / #a35f3c / #4a3a2b` a 250%, fluyendo 7 s lineal; card interna radio 20, wrapper 21.
- Kicker en Cinzel 12 px, tracking .14em, `#e3c9a8`.
- Botón: forma del CTA premium viejo (degradé 135° `#a35f3c → #7e4529`, radio 10, texto blanco 600 15 px, sombra cálida + highlight interno) con destello que lo cruza cada 5 s.
- Sin frontón, sin chispas. Con `prefers-reduced-motion`: borde, halo y destello quietos.
