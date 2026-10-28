# Phase 177 — Discussion Log

**Date:** 2026-08-14

Registro humano de la discusión (no lo consumen los agentes downstream; la fuente para planificar es `177-CONTEXT.md`).

## Grises presentados (multiSelect)

- Tabla de precios · Descuentos y tipos de precio · Alcance de país · Ciclo de vida y visibilidad.
- **Elegidos para discutir:** Alcance de país + Ciclo de vida y visibilidad.
- **No elegidos → defaults aplicados por Claude:** Tabla de precios (se usan los defaults propuestos, D-06/D-07/D-08) y Descuentos/tipos de precio (D-13/D-14).

## Área: Alcance de país

- Pregunta: ¿AR solo o AR+ES? → **AR + ES** (36 filas, 18 ARS + 18 EUR).
- Pregunta: ¿cómo fijar precios EUR? → Franco aportó los planes presenciales de España. Anclas: Flex Solo 50€ (1/sem), Flex 90€ (2/sem), Flex+ 125€ (6/sem). Claude derivó la grilla EUR con el mismo método (D-08).

## Área: Ciclo de vida y visibilidad

- Analytics: → **"como cualquier alumno"** (sin segregación; ruido de churn aceptado) (D-10).
- Renovación: → **reabre el selector de paquete Y permite renovar hacia cualquier otro plan** (D-11).
- Nombre visible: → **descriptivo "Paquete · N sem · M/sem"** (D-12).

## Decisiones cerradas antes de la discusión (en la conversación de shaping)

- Modelo B (matriz generada), rango 1–3 sem × 1–6 clases/sem, reserva flexible, tope semanal duro,
  `durationDays=semanas×7`, no toca `assignPlan`. Ver `BRIEF-PAQUETE-CLASES.md` y D-01..D-03.

## Deferred / research

- Recargo tarjeta / Precio Zero por país (diferido).
- Participación en descuentos Aura/referidos (default NO; revisar si Franco lo pide).
- Research: verificar enforce del tope semanal en `bookingMode='flexible'` en `booking-service.ts`.
