# Phase 143: Discussion Log

**Phase:** 143 — Profesor por clase + Puntuación post clase presencial
**Date:** 2026-06-23
**Status:** Discussion complete → context written

Registro de las decisiones tomadas en discuss-phase, agrupadas por las 5 áreas. Cada entrada lista las opciones presentadas y la respuesta elegida.

---

## Área 1 — Mecánica de puntuación

**P: ¿Qué escala usás para puntuar al profe?**
Opciones: Estrellas 1–5 · Caritas (3–5) · Pulgar arriba/abajo
→ **Estrellas 1–5.** (D-M1)

**P: ¿Hay comentario de texto además del puntaje?**
Opciones: Opcional siempre · Solo si puntaje bajo · Sin comentario
→ **Opcional siempre** (texto libre opcional en todos los casos). (D-M2)

**P: ¿Quién ve las puntuaciones individuales?**
Opciones: Owner ve todo, profe ve agregado · Solo owner, profe no ve nada · Profe ve individual (con miembro)
→ **Solo el owner; el profe NO ve nada** (ni su promedio). (D-M3)

---

## Área 2 — Comportamiento del pop-up

**P: ¿El pop-up es salteable u obligatorio?**
Opciones: Salteable · Obligatorio
→ **Salteable** (el miembro puede cerrarlo sin puntuar). (D-P1)

**P: Si lo saltea, ¿qué pasa?**
Opciones: Reaparece hasta puntuar/caducar · Una sola vez
→ **Una sola vez:** si lo saltea, esa clase NO se vuelve a pedir. (D-P2)

**P: ¿La puntuación caduca?**
Opciones: Caduca a los 7 días · Caduca a las 48 hs · No caduca
→ **Caduca a las 48 hs.** (D-P3)

**P: Si hay varias clases sin puntuar, ¿cómo se manejan?**
Opciones: Una por una, más reciente primero · Solo la última clase · Todas juntas en una lista
→ **Solo la última clase** (las anteriores se descartan; no hay cola). (D-P4)

---

## Área 3 — Asignación + identidad del profe

**P: ¿Modelo de asignación del profe a la clase?**
Opciones: Solo sucursal + QR (sin titular) · Titular por horario + QR confirma · (respuesta libre)
→ **Roster semanal:** los owners asignan un profe por `(sucursal, día, turno mañana/tarde)`, semana a semana. NO es titular fijo recurrente ni solo a nivel sucursal. Los alumnos NO saben qué profe les toca. (D-A1)

**P: ¿Puede haber más de un profe por clase (co-dictado)?**
Opciones: Un solo profe por clase · Varios profes posibles
→ **Un solo profe por clase/turno.** (D-A2)

**P: ¿Qué se le muestra al miembro del profe al puntuar?**
Opciones: Nombre + foto · Solo nombre · (respuesta libre)
→ **Nada:** el alumno solo puntúa la clase de su última asistencia y nunca ve nada del profe. El pop-up se arma alrededor de la CLASE (actividad/día). (D-A3)
*Nota: revierte el punto del ROADMAP pre-discuss que decía "la app muestra el profe".*

---

## Área 4 — Casos borde del QR / fallback

**P: ¿De dónde sale "el profe de la clase" para atribuir el puntaje?**
Opciones: Asignación semanal del owner · QR scan del profe · Owner asigna + QR confirma
→ **De la asignación semanal del owner (roster).** Determinístico, no depende de que el profe escanee. (D-Q1)

**P: El QR self-scan del profe (su propia asistencia), ¿entra en esta fase?**
Opciones: Diferir a otra fase · Incluir en esta fase
→ **Incluir:** el profe escanea con su app de alumno (`el-templo-app`) para registrar su propia asistencia, validado vs. su sucursal asignada. Independiente de la atribución del rating. (D-Q2)

**P: Si el owner no asignó profe a ese turno/día y el miembro va a puntuar, ¿qué pasa?**
Opciones: No mostrar pop-up · Guardar puntaje huérfano
→ **No mostrar pop-up** (sin profe asignado no hay a quién puntuar). (D-Q3)

---

## Área 5 — Vista del owner

**P: ¿Qué ve el owner de las puntuaciones en esta fase?**
Opciones: Vista simple (promedio + recientes) · Reporte completo · Diferir toda la vista
→ **Vista simple** en admin: promedio por profe + lista de puntajes/comentarios recientes. Reporte completo (tendencias/filtros/export) se difiere. (D-O1)

---

## Ideas diferidas

- Reporte completo de puntuaciones para owners (tendencias, filtros por fecha/sucursal, export Excel/PDF) — probablemente su propia fase.
- Co-dictado (varios profes por clase) — diferido; v1 es un solo profe por turno.
- Mostrar el profe al miembro de antemano / titular por horario — explícitamente descartado.

---

_Discussion complete. Context written to `143-CONTEXT.md`. Next: `/gsd-plan-phase 143`._
