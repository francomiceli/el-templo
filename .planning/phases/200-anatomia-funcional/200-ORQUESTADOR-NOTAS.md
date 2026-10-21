# Fase 200 — Notas del orquestador (decisiones durante la ejecución, para el UAT)

Decisiones tomadas en modo autónomo durante la cadena de ejecutores. Franco (y el kinesiólogo, cuando exista) confirma o revierte.

| Plan | Decisión | Por qué |
|---|---|---|
| 200-02 | Bandera **c1** (flexión de columna cargada) solo en NC, HR y PIKE, no en REVERSE HYPER ni BRIDGE, aunque el §3.2 las agrupa en el mismo bloque | c1 habla de flexión cargada (Jefferson, pike con peso); REVERSE HYPER y BRIDGE son extensión. Mostrarla ahí sería una precaución que no corresponde. A validar por el kinesiólogo (⚑H) |
| 200-02 | Bandera **b17** con `rutas: []` | Solo aplicaba a PLYO/CARDIO, fuera de la v1 (D2) |
| 200-02 | Las citas `[n]` y el ⚑H de las banderas viven en `notaInterna` / `umbralH`, no en el texto visible | `BanderaDef` no tiene campo de marcas; `notaInterna` no sale del API (decisión 1 del planner) |
