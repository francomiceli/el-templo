# Phase 136 — Discussion Log

**Date:** 2026-06-22
**Mode:** discuss (interactive)

> Registro humano de la discusión. No lo consumen los agentes downstream (researcher/planner/executor) — esos leen CONTEXT.md.

## Origen

La fase surgió de un pedido incremental en Horarios: mostrar "etiquetas" por alumno en la lista de asistencia. Iteró hasta convertirse en un rediseño del sistema de segmentación. El usuario definió los criterios de las dos etiquetas (Antigüedad + Asistencia) y eligió encararlo como fase GSD.

## Decisiones discutidas

### Alcance (pre-discusión)

- **Opciones:** reemplazar el segmento en todo el admin / solo Horarios / etc.
- **Elección:** la etiqueta de Asistencia REEMPLAZA el segmento en todo el admin; la Antigüedad NO reemplaza nada (dimensión nueva).
- **Ventana:** móvil de 28 días (reutiliza lógica existente).

### Notis push automáticas

- El usuario no recordaba que existían; se le explicó (5 push motivacionales atadas a transición de segmento, cron 3AM).
- Pidió mantenerlas. Se detectó conflicto (los estados de los que dependen se borran) y se resolvió: **preservar copy idéntico + reconectar disparadores a los nuevos estados** (Alerta←en_riesgo, Ausente←ghost, recovery, Óptima←espartano).
- Se verificó en prod (SSH autorizado por el usuario): notis activas, dispararon hoy 2026-06-22 (en_riesgo×9, espartano×3, ghost×1, recovery×1 enviadas; algunos fallos por token inválido).

### Primer mes (gray area identificada por Claude)

- Al sacar el segmento `nuevo` que overrideaba todo, un recién inscripto caería injustamente en Alerta/Ausente.
- **Elección:** durante el primer mes NO se muestra Asistencia (solo Antigüedad=Nuevo). El estado queda NULL hasta cumplir el mes.

### Antigüedad — visualización y persistencia

- **Elección:** solo en Horarios; calculada al vuelo desde `createdAt` (sin columna, sin cron).

### Miembro sin plan activo

- **Elección:** sin etiqueta de Asistencia (no hay denominador). Irrelevante en Horarios (no reserva/asiste).

### Cortes 75/50/1

- **Elección:** fijos en código (no configurables).

### Migración de datos

- **Elección:** recalcular en limpio (no mapeo aproximado viejo→nuevo).

## Ideas diferidas

- Rediseño del copy/estrategia de notis con la nueva taxonomía → fase aparte.
- Antigüedad en Alumnos/detalle/analytics → diferido.
- Cortes configurables vía settings → descartado por ahora.

## Abierto (menor, confirmable sin bloquear)

- ¿Se mantiene el chip de avatar (A–K) en Horarios junto a las dos etiquetas nuevas? Default: mantenerlo.
