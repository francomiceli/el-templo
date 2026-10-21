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
| 200-03 | Pectoral en Manna (MN/RP) como **sinergista**, con nota de que se estira al final del rango (la tabla dice "Ant/S") | Regla de un rol por ruta, el más alto. A confirmar por el kinesiólogo (⚑H) |
