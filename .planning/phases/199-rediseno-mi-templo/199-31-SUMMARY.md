---
phase: 199-rediseno-mi-templo
plan: 31
subsystem: verification
tags: [capture, contrast, wcag, gap-closure, mi-templo]
requires: ["199-30", "199-32"]
provides:
  [
    "evidencia medida del build final: capturas A-O, 5 pantallas, checks.json, motion.json",
  ]
key-files:
  modified:
    - .docs/mi-templo-rediseno/herramientas/mkmocks.cjs
    - .docs/mi-templo-rediseno/herramientas/capture.cjs
    - .docs/mi-templo-rediseno/herramientas/checks.py
    - .docs/mi-templo-rediseno/despues/ (regenerado)
decisions:
  - "Plan ejecutado con D20/D21 (post-plan): visibleTitles espera 'tu semana' y 'registro del día', ninguno de 'para vos'/'tus sesiones'; regla weekTotalBadge nueva"
metrics:
  completed: 2026-10-16
  commits: 0
  iterations: 0
---

# Phase 199 Plan 31: re-captura final de Mi Templo Summary

Build final del worktree (HEAD `b8e1169d6`, sin commits nuevos): A-O con 0 fallas de contraste, las 7 corridas de pantallas con 0 fallas, card de hoy entera a 390 en los 15 estados, sin overflowX y `checks.json` con 96 PASS / 0 FAIL.

## Ejecución

- Build: `VITE_API_URL=https://api-staging.eltemplo.org/api quasar build` (OK). Worktree limpio al final (`git status --porcelain` vacío), `dist/spa` ignorado.
- Iteraciones de arreglo usadas: **0 de 3** (no hizo falta tocar código de la app; 0 commits).
- Historial: `.docs/mi-templo-rediseno/despues/` anterior pasó a `despues-199-21/` (y `herramientas/despues` también). `herramientas/despues-pantallas` anterior quedó como `despues-pantallas-pre31/`. `despues-29/` no se tocó.
- Salidas: `.docs/mi-templo-rediseno/despues/` (capturas w360/390/412, full-w\*, rieles, contrast.txt/json, capture.log por estado; `fold.json`, `contrast-consolidated.json`, `checks.json`, `motion.json`, `despues-pantallas/`, `antes-pantallas/`). Reportes crudos con `-bg.png` y `report.json` quedan en `herramientas/despues/`. Collage antes/después: no se hizo (opcional).

## Ajustes de herramienta (no tocan staging ni la app)

Copias `*.pre31.cjs` hechas. Cambios:

1. `mkmocks.cjs`: estados J-O (K = A con clock 20:30; M con `subscription` `scheduled` + `plan-status` programado y sin reservas; N con beneficios "Envío gratis / 20% OFF TODO / 2X1 EN CAFÉS / MMMMMMMMMMMM / 15% OFF / 2x1"; O con 1 novedad de 61 caracteres: "Este sábado clase abierta en Alem: traé a un amigo y entrenan", el texto propuesto tenía 69, se acortó a 61 para caer en 60-68).
2. `capture.cjs`: bloque `checks` por ancho en `report.json`, `CAPTURE_MOTION=1` (solo `motion.json`).
3. `capture.cjs`: con `__clock` futuro (J y L, domingo 18) el boot de la app (`boot/auth.ts` `isJwtExpired`) creía vencido el token real y pedía `POST auth/refresh`, que caía en login. Ahora esa llamada se responde local con los mismos tokens. No llega a staging.
4. `capture.cjs`: `collectTexts` omite texto tapado por el FAB flotante (`elementFromPoint` dentro de `.check-in-fab`). Motivo: en H el ícono `bolt` de la 2.ª card de patrocinador quedaba bajo el FAB terracota y medía 1.07 contra `#96593a` (captura inicial de H; el ícono no se ve, ver `w390-00.png`). Solo afecta a H (único estado con FAB). Reevaluada H: 0 fallas.
5. `checks.py` nuevo (96 chequeos). `run31.sh` ayudante (corre captura + contrast con logs).

## Tabla por estado (Mi Templo)

Contraste = textos medidos / fallas (p10 mínimo ≥ 4.76). Card de hoy a 390: top-bottom (límite 788, todas `entera`). overflowX false a 360/390/412 en todos. Escrituras: ver abajo.

| Estado               | Textos / fallas | Card hoy 390 | FAB | Card de hoy (texto medido a 390)                                                        |
| -------------------- | --------------- | ------------ | --- | --------------------------------------------------------------------------------------- |
| A presencial hoy     | 131 / 0         | 136-324      | no  | HOY · JUEVES 15 / Muscle Up / Tu clase: 19:00 · Alem / Ver la sesión / Cambiar clase    |
| B completada         | 127 / 0         | 136-341      | no  | Muscle Up / Completada · 55 min · RPE 7 / Ver resumen                                   |
| C sin clase hoy      | 129 / 0         | 136-324      | no  | TU PRÓXIMA CLASE / Lunes 19 · 08:00 / Alem / Mis clases / Cambiar clase                 |
| D sin plan           | 114 / 0         | 136-396      | no  | EMPEZÁ HOY / Arrancá tu plan / Ver planes / Clase de prueba gratis                      |
| E online con plan    | 129 / 0         | 136-364      | no  | Muscle Up / Semana 3 de 12 / Entrenar / Mi programa                                     |
| F online sin plan    | 136 / 0         | 136-297      | no  | Muscle Up / Entrenar / Ver planes                                                       |
| G popup entrada      | 4 / 0           | 136-396      | no  | (diálogo abierto; se mide solo el modal)                                                |
| H ventana            | 130 / 0         | 136-363      | SÍ  | Tu clase: 19:00 · Alem / Tu clase empieza en 12 min / Ver la sesión                     |
| I venció             | 126 / 0         | 136-374      | no  | TE EXTRAÑAMOS / Renová tu plan / Renovar                                                |
| J domingo, próxima   | 123 / 0         | 136-324      | no  | TU PRÓXIMA CLASE / **Lunes 19 · 19:00** / Alem / Mis clases / Cambiar clase             |
| K clase pasada       | 128 / 0         | 136-324      | no  | Reservá tu clase / Elegí día, horario y sede / Reservar                                 |
| L online domingo     | 122 / 0         | 136-364      | no  | Calistenia Online / Entrenar / Mi programa                                              |
| M vencido programado | 123 / 0         | 136-324      | no  | Reservá tu clase / Elegí día, horario y sede / Reservar (sin Arranca/Ver planes/Renová) |
| N patrocinadores 12  | 132 / 0         | 136-324      | no  | (igual A) beneficios: 0 cortados, fuentes [22,22,22,22,30,30]                           |
| O novedad larga      | 128 / 0         | 136-324      | no  | (igual A)                                                                               |

Ningún texto de la card de hoy contiene "descans" ni "turno" en ningún ancho. Pastilla del total (`.week-strip__badge`): "42" blanco sobre `#96593a`, 5.55:1, y "sesiones en total" (o "en El Templo" en I) correcto; presente en todos los estados con `.week-strip`.

## Pantallas (antes-gap → final, fallas de contraste)

| Pantalla                    | Antes | Final         | overflowX |
| --------------------------- | ----- | ------------- | --------- |
| /training                   | 7     | 0 (30 textos) | no        |
| /planes                     | 8     | 0 (202)       | no        |
| /training/guia              | 2     | 0 (24)        | no        |
| /profile                    | 15    | 0 (47)        | no        |
| /reservas (A)               | 16    | 0 (35)        | no        |
| /reservas R-prueba-selector | n/a   | 0 (21)        | no        |
| /reservas R-prueba-sede     | n/a   | 0 (48)        | no        |

C6: en `/reservas` (R-prueba-sede) "Turno Mañana" y "Turno Tarde" salen en `rgb(90,83,71)` = `#5a5347`, sobre `#e8e2da` / `#ece6dd`: 5.69 y 5.96:1.

## checks.json y motion.json

96 chequeos, 0 FAIL. Detalle destacado:

- `novBar`: true en los estados con 2 novedades (A, B, C, E, H, J, K, L, N); false en los de 0 (D, F, G, I, M) y en O (1 sola novedad).
- O (reduced-motion, 360/390/412): texto completo igual al mock, `lines` 2, `overflowX` 0, `overflowY` 0, 0 animaciones (con la clase `nov-card--reduced`).
- `fab`: true solo en H (en K no hay FAB).
- `visibleTitles`: sin "para vos" ni "tus sesiones" en ningún estado; "Tu semana" donde está `.week-strip`, "Registro del día" donde está `.check-in-panel` (A, B, C, E, F, H-O; no en D/G).
- `motion.json` (movimiento real, `reducedMotionMatches: false`): O: `.nov-item__line` con 1 animación WAAPI `running`, `iterations` infinito; A: `.today-card` con 3 `CSSAnimation` (`border-flow`, `breathe`, `sheen`) corriendo; en A el marquee de la 1.ª novedad ya figura `finished` (1 iteración, hay 2 novedades).

## Checklist de gaps

| Gap                           | Evidencia                                                                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| D1 velocidad carrusel         | no verificable por captura (constante 4000 en código)                                                                                                                                                  |
| D3 nunca "descansás"          | `checks.json` `\*                                                                                                                                                                                      | sinDescansTurno` PASS en 15 estados; C muestra "Tu próxima clase" |
| D4 vencido + programado       | M: card de reservar sin "Arranca/Ver planes/Renová/Ya renovaste" (`M-vencido-programado                                                                                                                | copyReservar`)                                                    |
| D5 clase pasada               | K: "Reservá tu clase / Elegí día, horario y sede / Reservar"; J: "Lunes 19 · 19:00" sin "mañana"                                                                                                       |
| D6 beneficio                  | `benefitCut` vacío en 15 estados a 3 anchos; N con "MMMMMMMMMMMM" fuente 22px sin corte                                                                                                                |
| D8 admin                      | fuera de las capturas                                                                                                                                                                                  |
| D9 autor sin punto            | A y B muestran "Virgilio" sin punto final                                                                                                                                                              |
| D10 contraste otras pantallas | 0 fallas en las 5 pantallas + 2 variantes de Reservas                                                                                                                                                  |
| D11 clase vs turno            | 0 "turno" en la card de hoy; J/K/L OK                                                                                                                                                                  |
| D12 card sketch 006           | `motion.json`: 3 animaciones CSS en `.today-card`; card entera a 390 en 15 estados                                                                                                                     |
| D13 barra Novedades           | `novBar` true con 2+ y false con 1                                                                                                                                                                     |
| D14 color de títulos          | contraste de "Registro del día" y "Tu semana" `rgb(150,89,58)` sobre blanco 5.55:1                                                                                                                     |
| D15 sin "Para vos"            | `visibleTitles` sin "para vos" en 15 estados                                                                                                                                                           |
| D16 copy registro             | colapsado B: "Registro del día · Molestia leve (hombros) · Dormiste bien · Energía: normal". La opción "Bien" de energía no se ve en captura (pregunta 1 de 3 es molestia): no verificable por captura |
| D17/D21 Tu semana + pastilla  | `weekTotalBadge` PASS; título "Tu semana", cifra grande, puntos L-D, pastilla `#96593a`/blanco                                                                                                         |
| D18/D20 registro              | A: "Registro del día" + "¿Tenés alguna molestia hoy?"; B colapsado con título                                                                                                                          |
| D19 desplazamiento            | O: con reduced-motion 2 líneas sin recorte; con movimiento marquee WAAPI activo                                                                                                                        |
| C1                            | J ("Mis clases" + "Cambiar clase", "Lunes 19 · 19:00")                                                                                                                                                 |
| C2                            | K y M                                                                                                                                                                                                  |
| C6                            | `/reservas`: "Turno Mañana/Tarde" `#5a5347`                                                                                                                                                            |

## Escrituras a staging

0 llegaron a staging. Todo no-GET se responde local (`capture.log` de cada corrida lista solo `POST .../event` de novedades/patrocinadores/avisos y `POST auth/me/intro-stories`; `POST auth/refresh` en J/L se responde local con los mismos tokens). Ningún `capture.log` contiene `AVISO`.

## Deviations from Plan

1. [Rule 3 - herramienta] Respuesta local de `auth/refresh` para los estados con clock futuro (ver arriba).
2. [Rule 1 - herramienta] Exclusión del texto tapado por el FAB (falso positivo en H).
3. Mock de O acortado a 61 caracteres (el texto sugerido tenía 69, fuera de 60-68).
4. D20/D21: reglas `visibleTitles` y `weekTotalBadge` según el mensaje del orquestador (el plan es previo).
5. Sin collage antes/después (opcional).

## Bugs de copy/lógica documentados

Ninguno. No se encontró ningún FAIL de copy ni de lógica.

## Known Stubs

Ninguno (plan de verificación, sin código de la app).

## Self-Check: PASSED

- `.docs/mi-templo-rediseno/despues/{A..O}-*` con `contrast.txt`, `capture.log`, `contrast.json`: presentes.
- `checks.json`, `motion.json`, `fold.json`, `contrast-consolidated.json`: presentes.
- Worktree `/home/franco/projects/et-199-mi-templo` limpio, HEAD `b8e1169d6`.
