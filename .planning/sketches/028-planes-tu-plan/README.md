---
sketch: 028
name: planes-tu-plan
question: "¿Cómo ve el socio su plan actual, la próxima membresía ya cargada y los planes anteriores en la pestaña Planes: cards apiladas (A), línea de tiempo con 'cubierto hasta' (B) o card oscura (C)? + push y pelotita al cargarse"
winner: "D"
tags: [app, planes, membresias, push, badge]
---

# Sketch 028: Planes — Tu plan y próxima membresía

## Design Question

Los socios que pagan antes del vencimiento no saben si se les cargó la renovación. El dato existe (`subscriptions.status='scheduled'`, encadenada por `previousSubscriptionId`), pero la app no lo muestra. ¿Qué forma tiene la sección "Tu plan" arriba de Planes para que se lea en 3 segundos "estoy cubierto hasta X" y que la próxima membresía no se confunda con la actual?

La pestaña sigue llamándose **Planes**. El catálogo (por objetivos / regulares) queda debajo con el lenguaje del rework. Perfil deja de duplicar la info (link a Planes).

## How to View

open .planning/sketches/028-planes-tu-plan/index.html

## Variants

- **Hoy:** como está. "Activo — vence…" sin mirar el estado; con hueco muestra la programada como activa; la renovación cargada no aparece.
- **A · Cards apiladas:** plan actual con marco claro (como "Tu próxima clase" de Reservas, 013 A) y barrita del período. Debajo, card aparte "Tu próxima membresía" con borde salvia y "Nuevo". Planes anteriores en lista.
- **B · Línea de tiempo:** una sola card que arranca con "Cubierto hasta el 15 dic". Adentro: próxima (arriba, punteada) → hueco si lo hay → actual (llena) → anteriores. Nodos como Tus sesiones.
- **C · Card oscura:** el plan como superficie oscura hermana de los pop-ups (010 A, sin columnata ni halo). "Después sigue…" en la parte de abajo de la misma card. Anteriores plegados.
- **D · Síntesis (pedido de Franco: C + línea de B, plan actual arriba):** card oscura de C con la línea de tiempo adentro: actual (nodo terracota lleno, nombre grande, barrita) → hueco (punteado ocre) → próxima ("Después sigue", punteada con "Nuevo" la primera vez, cerrada con ✓ y "Cargada" después). Sin próxima y a ≤7 días del vencimiento, nodo punteado "Todavía no hay renovación cargada…". Sin "Cubierto hasta…" (Franco). Fechas con año solo si no es el año en curso ("15 ene 2027"). Anteriores en card clara plegada con los puntitos de la línea.
- **Aviso:** push en la pantalla bloqueada y pelotita en la pestaña Planes (punto como el de evaluación o "1" rojo como el de la Guía).

## What to Look For

- **Renovación cargada, primera vez:** ¿se entiende enseguida que la próxima ya está paga y que arranca sola?
- **Solo programada (hueco):** ¿queda claro que hoy no tiene plan, pero que el próximo ya está cargado?
- **Vence en 3 días sin renovar:** el texto "¿Ya renovaste? Cuando lo carguemos lo vas a ver acá" responde la duda sin alarmar.
- **Pausado, pase especial, sin plan, nunca tuvo plan, nombre largo** a 360 px.
- **Pelotita:** punto o número.

## Decisiones (Franco, 2026-10-28)

- **Ganadora D.** Card oscura de C, con el plan actual arriba y la línea de tiempo de B adentro.
- **Sin "Cubierto hasta…".**
- **Fechas:** el año aparece solo si no es el año en curso, por ejemplo "15 ene 2027". Ver el estado "Cruza de año".
- **Historial:** nunca muestra el monto pagado.
- **"Elegí tu plan"** (nunca tuvo plan) también lleva el botón de WhatsApp, igual que "Sin plan activo".
- **Pelotita:** punto, como el de evaluación en Mi Templo.
- **Planes anteriores:** card plegada por defecto: ícono history + "Planes anteriores (N)" + expand_more. Al expandirse muestra TODOS (sin "Ver todos" ni hoja).
- Variantes A, B y C conservadas como referencia.

## Preguntas abiertas para la implementación

- **Pausa:** `subscriptions.pauseEndDate` (opcional) → "En pausa hasta el X" si existe; si no, "En pausa". Al reanudar, endDate se corre por los días pausados.
- **Pase especial:** sale de `/me/especial-pass` (saldo de clases). ¿Se muestra junto a un plan regular si tiene los dos?
