---
sketch: 013
name: reservas
question: "¿Cómo llevamos Reservas al lenguaje del rework de Mi Templo: refinando la estructura actual (A) o reordenando con una próxima clase oscura y días en círculos (B)?"
winner: "A + punto salvia de B en el día con reserva + anotados en chip salvia (verde, como antes)"
tags: [app, reservas, rework, card-de-hoy]
---

# Sketch 013: Reservas

## Design Question

`ReservasPage.vue` quedó afuera del rework: márgenes de 8 px (Mi Templo usa 16), "Próxima clase" con filete a la izquierda (estilo viejo), "Reservar" como link de texto, "0 personas anotadas" en verde, "Sesion Grupal" sin tilde, la sede no parece tocable y las condiciones son un párrafo suelto.

## How to View

Abrir `.planning/sketches/013-reservas/index.html` (desde Windows: `\\wsl$\Ubuntu\home\franco\projects\el-templo\.planning\sketches\013-reservas\index.html`). Arriba: estado (sin reserva / con reserva vie 19:00) y ancho. Los días se pueden tocar. Escenario: jueves 15 a las 12:30, la mañana de hoy ya pasó.

## Variants

- **Hoy:** como está.
- **A · Refinar:** mismo orden que hoy. 16 px; sede como chip tocable ("Mario Bravo ▾"); próxima clase clara con borde degradé fino y "Tu próxima clase" en Cinzel, con "Cancelar" como link; días como fichas (la elegida en terracota, hoy con borde); horarios en cards con borde y sombra cálida; "Reservar" como pastilla terracota (sin destello: es una acción repetida); cupos que invitan ("Sé el primero", "4 anotados", "Quedan 3 lugares" en ocre, "Completo" en rojo tierra → "Lista de espera" con borde); horario reservado con borde salvia + "Reservado" + "Cancelar"; horarios pasados punteados; condiciones plegables con ícono.
- **B · Reordenar:** como A, pero la próxima clase es una card oscura hermana de la card de hoy (fecha grande, "Mañana", "Cancelar") y los días son círculos como Tus sesiones, con un punto salvia donde tenés reserva.

## What to Look For

- ¿Se siente de la misma app que Mi Templo?
- La pastilla "Reservar" repetida 8 veces: ¿pesa demasiado?
- B: ¿la card oscura arriba compite con la card de hoy de Mi Templo (que muestra lo mismo)?
