# Contraste: AGORA vs estado del arte de comunidad fitness

> **Fase:** Investigación paso 2 de 2 — contraste del diseño implementado en AGORA contra los principios verificados en [COMMUNITY-BENCHMARK.md](./COMMUNITY-BENCHMARK.md).
> **Fecha:** 2026-05-31.
> **Método:** análisis del código real de AGORA (schema, routes, services) contra los 9 hallazgos confirmados del benchmark.
> **Calibración:** las tensiones se presentan como banderas/preguntas duras, no como condenas. Varios principios del benchmark tienen caveats (estudios transversales, contexto cultural) — ver caveats del benchmark.

---

## Veredicto en una tabla

| #   | Principio del benchmark                                                          | AGORA                                                                              | Veredicto                                                                                   |
| --- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | La unidad de pertenencia (grupo/squad) es el activo central; grupos 3+ > solo    | Squads con identidad (nombre+emoji), anclados a sede, mini-feed propio             | 🟡 **Estructura correcta, subutilizada** (es fase D, UI pendiente; no es el centro del MVP) |
| 2   | Canalizar la comunidad hacia conducta (asistir), no a pertenencia abstracta      | Premia mucho más el engagement digital que la asistencia                           | 🔴 **Balance invertido**                                                                    |
| 3   | El motor real es la asistencia consistente, sobre todo en los primeros 90 días   | Check-in +15/día (trigger ¿activo?); sin streaks; sin onboarding 90 días           | 🔴 **El predictor #1 es lo menos premiado**                                                 |
| 4   | Gamificación en S: hay un umbral donde más DAÑA (notificaciones controladoras)   | 12+ fuentes de AURA, 14 tipos de notificación automáticas, sin silenciar ni digest | 🔴 **En zona de riesgo de sobrecarga**                                                      |
| 5   | Leaderboards = antipatrón; usar grupal, opt-in, cohortes por nivel               | Semanal, por sede/squad (✓ grupal), pero forzoso y tabla única sin cohortes        | 🟡 **Mitad bien (grupal), mitad mal (sin opt-in ni ligas)**                                 |
| 6   | Motivación intrínseca (β=0.501) >> extrínseca; apoyar el dominio, no sustituirlo | Economía-céntrica: todo termina en AURA → tiers → canje                            | 🔴 **Apuesta fuerte a lo extrínseco**                                                       |
| 7   | El coach sostiene comunidad con bajo esfuerzo; la app amplifica rituales         | ~2.5 h/sem de aprobación manual; "Aura no acredita si pending"                     | 🔴 **Sobrecarga al profe; contradice decisión propia de el-templo**                         |
| 8   | Cold start: evitar el "pueblo fantasma"; sembrar masa crítica                    | Seed data para demo; sin estrategia de arranque real por sede                      | 🟡 **Falta la estrategia (la estructura está)**                                             |
| 9   | Cold start por nicho/sede; reclutar clases enteras, no usuarios sueltos          | Todo anclado a `branchId` + squads por turno                                       | 🟢 **Arquitectura ideal para esto** (falta la mecánica de reto-recluta)                     |

🟢 alineado · 🟡 parcial · 🔴 tensión a resolver

---

## Lo que AGORA ACIERTA (validado por la evidencia)

1. **Reacciones con significado, no likes genéricos.** `quema / fuerza / respeto / chispa` en vez de un "me gusta" plano. El benchmark dejó "reacciones con significado" como vacío sin evidencia, pero el principio cualitativo es sólido y AGORA lo ejecuta bien.

2. **La reacción "chispa" (= "quiero estar en tu próxima clase") es un puente online→offline.** Convierte ver un post en una invitación a entrenar. Esto ataca directamente uno de los **vacíos del benchmark** (conexión digital↔presencial) con una mecánica original. Es de lo más valioso del diseño.

3. **Todo está anclado a la sede (`branchId`).** La comunidad es local por sede, que es exactamente la "red atómica" natural para el cold start (hallazgo 9). La arquitectura está lista para sembrar sede por sede.

4. **Squads como capa de identidad sobre el turno** (nombre, emoji) — la unidad de pertenencia correcta según el hallazgo 1. La idea es buena; el problema es que está relegada a fase D y no es el centro del MVP.

5. **Antifraude e idempotencia del ledger.** No es un principio de comunidad per se, pero protege la integridad de la economía — necesario si se va a premiar conducta con puntos.

---

## Las tensiones duras (riesgos contra la evidencia)

### 🔴 T1 — El balance de incentivos premia lo digital sobre la asistencia (H2, H3)

La evidencia más robusta dice que **la asistencia consistente es el motor de retención** y que la comunidad sirve en la medida en que la sostiene. Pero los montos de AGORA dicen lo contrario:

| Acción                        | AURA                | Naturaleza          |
| ----------------------------- | ------------------- | ------------------- |
| Asistir a entrenar (check-in) | **+15** (cap 1/día) | presencial          |
| Desbloquear un hito           | **+80 a +400**      | digital (evidencia) |
| Avanzar a Embajador           | **+500**            | digital             |
| Destacado del mes             | **+100**            | digital             |

Un alumno gana más por desbloquear dos hitos (+160 a +800) que por asistir un mes entero (~+240). El sistema, sin querer, enseña que "lo que importa es generar contenido y evidencia", no "venir consistentemente". Y dato crítico a verificar: **el trigger que acredita +15 por asistencia está documentado pero podría no estar activo en el código vivo** (no aparece en migraciones) — si es así, la asistencia hoy no otorga nada automáticamente.

→ **Pregunta dura:** ¿la economía debería re-pesarse para que la asistencia consistente (y las rachas de asistencia) sea la mayor fuente de AURA, y lo digital el complemento?

### 🔴 T2 — Economía-céntrica: el diseño apuesta a lo extrínseco, lo más débil (H6)

Intrínseca β=0.501 >> reconocimiento 0.36 >> dinero 0.26. AGORA canaliza **todo** hacia AURA → tiers → canje. El activo intrínseco más potente de la calistenia —**la progresión visible de habilidad** (de tu primera dominada al muscle-up al front lever)— existe como "hitos" pero queda subordinado a la moneda: no hay roadmap de skill personalizado, ni "próximo movimiento sugerido", ni progreso de habilidad mostrado como un fin en sí mismo separado de los puntos.

→ **Pregunta dura:** ¿y si el corazón del módulo fuera un **árbol de progresión de calistenia** (dominio visible, identidad de "el que ya hace X"), con AURA como capa de apoyo y no como el fin? Esto juega a la fortaleza única de El Templo y al predictor motivacional más fuerte.

### 🔴 T3 — Riesgo de sobrecarga de gamificación y notificaciones (H4)

12+ fuentes de puntos y **14 tipos de notificación que se disparan automáticamente, sin opción de silenciar por tipo y sin digest** (cada evento = una notificación). Esto cae justo en lo que la evidencia marca como zona de daño: alertas frecuentes percibidas como controladoras que **minan la autonomía** y empujan por encima del umbral de la curva en S.

→ **Recomendación directa:** preferencias de notificación por tipo, digest/agrupación, y reducir las fuentes de puntos a las que cambian conducta. "Más no es mejor."

### 🔴 T4 — El módulo sobrecarga al profe y contradice una decisión propia de el-templo (H7)

Estimado ~2.5 h/semana por profe solo en aprobaciones (≈40 submissions/sem + hitos + moderación). Y como **"Aura nunca se acredita si la evidencia está pending"**, si el profe se atrasa unos días, los alumnos perciben el sistema muerto. Esto choca de frente con:

- el principio del benchmark (la comunidad debe funcionar con **bajo esfuerzo** del coach; la app amplifica rituales humanos, no agrega trabajo), y
- la **propia decisión registrada en el-templo**: _"misiones auto-generadas primero, creación manual del coach como enhancement"_. AGORA **no implementó la auto-generación** — todo es manual.

→ **Pregunta dura:** ¿qué se puede auto-aprobar o auto-generar (misiones por defecto, hitos verificables por check-in/sensor, evidencias de bajo riesgo) para que la comunidad no dependa de la disciplina diaria del profe? La app debería **amplificar** la regla de 3 pies / 3x3, no sumar una bandeja de entrada.

### 🟡 T5 — El leaderboard está a mitad de camino (H5)

Bien: el scope es por sede/squad (grupal, no global mundial) y el servicio no expone nombre/tier en la respuesta. Mal: **todos aparecen forzosamente** (sin opt-in) y es **una tabla única sin cohortes por nivel/tier**, así que un "mortal" compite contra un "dios" en un gap no cerrable, y el **reset semanal** puede sentirse brutal. La evidencia es clara en que los leaderboards desmotivan a parte de los usuarios según su autoeficacia.

→ **Recomendación:** opt-in, cohortes/ligas por tier para que el gap sea cerrable, y enfatizar el ranking **de squad vs squad** (colectivo) por sobre el individual.

### 🟡 T6 — Cold start: estructura sí, estrategia no (H8, H9)

Hay seed data para que la demo no se vea vacía, pero **ninguna estrategia de lanzamiento real**: ningún plan de rollout sede por sede, ni squad piloto, ni el "reto que recluta una clase entera" que le funcionó a Strava. Con 9 sedes, lanzar todo a la vez es la receta del pueblo fantasma multiplicada por 9.

→ **Recomendación:** plan de arranque **una sede / unos turnos piloto**, con el profe sembrando los primeros posts y un reto inaugural por squad.

### 🟡 T7 — "Mortal" como tier base puede rozar el shaming

El-templo listó como anti-features los "public leaderboards desmoralizantes" y el "streak-shaming". Llamar "Mortal" al escalón más bajo, visible públicamente, va en esa dirección. Bandera menor, fácil de ajustar.

---

## El meta-hallazgo: AGORA optimiza para engagement digital; la evidencia pide optimizar para asistencia + dominio intrínseco

Tres de las cuatro tensiones rojas (T1, T2, T4) apuntan a lo mismo: **AGORA está construida como una red social gamificada con economía de puntos**, mientras la evidencia dice que para _retener socios de un gimnasio físico_ el diseño debería girar alrededor de (a) **disparar asistencia consistente** y (b) **hacer visible el dominio de la habilidad**, con la capa social y la moneda como **soporte**, no como el fin. AGORA no está "mal hecha" —es sofisticada y tiene piezas excelentes (chispa, reacciones, anclaje por sede, antifraude)— pero su **centro de gravedad está corrido** respecto de lo que mueve retención.

---

## Recomendaciones priorizadas

**P0 — antes de portar nada a el-templo (decisiones de diseño):**

1. **Re-pesar la economía** para que la asistencia consistente y las rachas sean la mayor fuente de AURA (T1). Verificar/activar el trigger de asistencia.
2. **Elevar la progresión de habilidad** (árbol de calistenia con dominio visible) a corazón del módulo, con AURA como apoyo (T2).
3. **Reducir el trabajo manual del profe**: auto-generar misiones por defecto y auto-acreditar lo verificable; la app amplifica rituales presenciales (T4).

**P1 — al construir:** 4. Preferencias de notificación + digest; podar fuentes de puntos (T3). 5. Leaderboard opt-in, por cohorte de tier, con foco en squad vs squad (T5). 6. Plan de cold start por sede/turno piloto, con reto inaugural que recluta clases (T6).

**P2 — pulido:** 7. Revisar nomenclatura de tiers ("Mortal") por una no estigmatizante (T7). 8. Aprovechar y extender "chispa" como mecánica online→offline central.

---

## Implicación para la integración a el-templo (decisión pendiente, no parte de esta fase)

El choque de stack sigue en pie (AGORA = Next.js/Hono/Postgres+RLS multi-tenant; el-templo = Vue/Quasar/Fastify/MySQL single-tenant). Pero este contraste cambia la pregunta de integración: **no es "¿cómo porto AGORA tal cual?"** sino **"¿qué de AGORA conservo, qué re-centro, y eso cómo se materializa en el stack de el-templo?"**. Lo conservable con fuerza: el modelo social (posts/reacciones-con-significado/comentarios/chispa), el anclaje por sede, los squads, el antifraude. Lo que pide rediseño antes de portar: el balance de la economía, el peso de lo intrínseco, y la carga del profe. Esa decisión de integración es el siguiente cruce de caminos, ya fuera de la fase de investigación.
