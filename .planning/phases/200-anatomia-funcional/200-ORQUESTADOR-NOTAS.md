# Fase 200 — Notas del orquestador (decisiones durante la ejecución, para el UAT)

Decisiones tomadas en modo autónomo durante la cadena de ejecutores. Franco (y el kinesiólogo, cuando exista) confirma o revierte.

| Plan | Decisión | Por qué |
|---|---|---|
| 200-02 | Bandera **c1** (flexión de columna cargada) solo en NC, HR y PIKE, no en REVERSE HYPER ni BRIDGE, aunque el §3.2 las agrupa en el mismo bloque | c1 habla de flexión cargada (Jefferson, pike con peso); REVERSE HYPER y BRIDGE son extensión. Mostrarla ahí sería una precaución que no corresponde. A validar por el kinesiólogo (⚑H) |
| 200-02 | Bandera **b17** con `rutas: []` | Solo aplicaba a PLYO/CARDIO, fuera de la v1 (D2) |
| 200-02 | Las citas `[n]` y el ⚑H de las banderas viven en `notaInterna` / `umbralH`, no en el texto visible | `BanderaDef` no tiene campo de marcas; `notaInterna` no sale del API (decisión 1 del planner) |
| 200-03 | En las rutas PULL, cuando la tabla articular de la ruta (§2) y la tabla resumen S8 no coinciden, manda la de la ruta (13 discrepancias, listadas en `200-03-SUMMARY.md`) | Es R2: el §2 es el texto corregido por el revisor; S8 es un resumen |
| 200-05 | **AF** (Animal Flow) queda con 11 motores por la regla "un rol por ruta, el más alto" → pinta casi todo el cuerpo | AF trabaja todo el cuerpo; el detalle por posición queda en las `nota`. A revisar por el kinesiólogo si conviene más finura |
| 200-05 | **SPAGAT** sin motores en la variante base (psoas y recto femoral "se estira", glúteo mayor estabilizador); el motor solo aparece en la variante activa | Es lo que dice la tabla; la proyección usa el fallback "estabilizador ∪ se estira" cuando no hay motores. **PIKE**: glúteo e isquios "se estira"; **SIDE PCK**: isquios antagonista. ⚑H |
| 200-05 | Ficha de PS sin el escalón "Con peso (W)" del sketch | A2 no lo nombra |
| 200-06 | Las 30 rutas pintan distinto que antes; cada diferencia tiene motivo en `diferencias-aprobadas.ts` y la tabla completa está en `200-06-SUMMARY.md` | El mapeo anterior era por categoría; el nuevo sale de los músculos de cada ruta |
| 200-06 | **PIKE pinta solo cuádriceps** (motores: psoas, que no se ve, y recto femoral) | Para revisar: en rutas de movilidad quizá convenga pintar lo que se estira (isquios). Hoy el fallback "estabilizador ∪ se estira" solo aplica si no hay motores |
| 200-06 | `zoneHitsDelBloque` marca también bloques **mixtos** (ruta del modelo + PLYO sin ruta): toda zona que pinta el cuerpo y las rutas no cubren lleva `movilidad`/`sinDetalle` | Si no, el cuerpo pintaba una zona sin chip ni hoja (D18) |
| 200-08 | En Semana, el chip de un bloque se marca si `zoneHits[zona]` existe (el bloque trabaja la zona en cualquier rol: fuerte, te sostiene o se estira), no solo si la zona está en `zones` | Es lo que hace el sketch 021 ganador (`hoyEnZona`); `zones` es lo que pinta el cuerpo en modo bloque (motor ∪ sinergista) |
| 200-08 | SS (Sissy Squat) ya no pinta glúteos: solo cuádriceps | Corrección intencional de §1.7.2 (el glúteo es co-contracción, no motor) |
| 200-03 | Pectoral en Manna (MN/RP) como **sinergista**, con nota de que se estira al final del rango (la tabla dice "Ant/S") | Regla de un rol por ruta, el más alto. A confirmar por el kinesiólogo (⚑H) |
