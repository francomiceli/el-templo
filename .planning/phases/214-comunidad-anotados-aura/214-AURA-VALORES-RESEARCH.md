# Fase 214 — Investigación: valores de Aura antes de mostrarlos

**Fecha:** 2026-11-17. **Pedido de Franco:** "definas mejor los valores entre las distintas opciones que
dan valor, y que no queden números muy inflados", porque una vez visibles no se puede volver atrás.

**Estado:** DECIDIDO por Franco el 2026-11-17. Las decisiones están en `214-CONTEXT.md` (D-18 a D-24) y difieren de esta propuesta en tres puntos: entrenar en la app vale 3 con regla de tiempo, estirar 1 y bloque libre 2, y el descuento por Aura se apaga en vez de reescalar los tramos. Este documento queda como respaldo de la decisión.

**Insumos:**

- Producción, solo lectura, con OK de Franco: `consultas/01-distribucion-aura.sql` (resultado en
  `consultas/01-distribucion-aura.resultado-2026-11-17.txt`) y `consultas/02-aura-por-fuente-anonimo.sql`
  (2.774 filas sin identificadores, archivo local sin commitear).
- Inventario del código (subagente, worktree `et-comunidad` en `a51a00271`).
- Benchmark externo (subagente con búsqueda web). Las fuentes están al final.

## 1. Qué hay hoy

### 1.1 Cuánto vale cada cosa

| Fuente | Puntos | En clases | De dónde sale el monto | Uso real en producción |
|---|---|---|---|---|
| Asistir a una clase | 10 | 1 | Fijo en código (`attendance/service.ts:391, 563, 1041`). La config dice 5 y no se lee | 41.468 acreditaciones, 72 % del Aura |
| Completar el onboarding | 50 | 5 | Fijo en código (`onboarding/service.ts:71, 176`) | 2.195, 19 % |
| Antigüedad: 3 meses | 50 | 5 | `shared/tenure-milestones.ts:40-44` | 190 |
| Antigüedad: 6 meses | 100 | 10 | Ídem | 141 |
| Antigüedad: 1 año, y cada año | 250 | 25 | Ídem | 79 |
| Entrenar por la app (por día) | 10 | 1 | `aura_config` | 252 |
| Sesión de plan a medida (por día) | 10 | 1 | `aura_config` | 1 |
| Estiramiento post-clase (por día) | 5 | 0,5 | `aura_config` | Sin filas todavía |
| Bloque libre (por día) | 5 | 0,5 | `aura_config`. Apagado en la app por flag | Sin filas |
| Rachas de 7, 14, 30, 60 y 100 sesiones | 20, 35, 50, 100, 200 | 2 a 20 | Defaults en código (`aura/streak-reward.ts:336-350`) | 4 filas |
| Semana de programa | 15 | 1,5 | Columna por programa, editable en el admin | 19 |
| Programa completo | 100 | 10 | Ídem | 0 |

Los hitos de antigüedad solo se acreditan el día exacto del aniversario, con el alumno activo, y no hay
retroactivo: arrancaron el 2026-08-08.

### 1.2 Nadie eligió la escala

- Los montos iniciales y los tramos de canje se dejaron "a discreción" del asistente en las fases 45 y
  48 (`45-CONTEXT.md:24-25`, `48-CONTEXT.md:32`). No hay documento que explique por qué 10 por clase ni
  por qué tramos de 500.
- El 10 por asistencia viene de las fases 50 y 61. El 50 del onboarding, de la 78 (D-22). Las rachas, de
  la 81 (D-11, D-12). Los hitos de antigüedad, de un comentario en el código ("decisión Franco
  2026-08-06": superar la racha de 100 días, que daba 200).
- `aura_config` no manda: solo la leen cuatro fuentes (entreno por la app, plan a medida, bloque libre y
  estiramiento). No hay pantalla para editarla. La fase 198 "Aura configurable" está en espera.

### 1.3 Lo que muestran los datos (alumnos activos = asistieron en los últimos 56 días, 1.256)

- Aura ganada: p25 80, p50 250, p75 570, p90 870, máximo 1.750. 79 alumnos ya tienen cuatro cifras.
- Composición entre activos: asistencia 80 %, onboarding 11 %, antigüedad 9 %, app 1 %.
- 684 personas tienen Aura sin una sola asistencia acreditada, y 679 de ellas tienen exactamente 50
  (solo el onboarding).
- La antigüedad real casi no se ve: mediana de 660 para quien lleva más de 2 años y de 620 para quien
  lleva de 6 a 11 meses. El Aura arrancó en marzo de 2026.
- Cero canjes en todo el ledger. El saldo guardado coincide con la suma del ledger en las 2.898 cuentas.
- Salvedad: "activos" incluye a quienes vienen por Wellhub, que asisten y no ganan Aura.

## 2. Qué dice el benchmark

Confianza entre paréntesis. Detalle y enlaces en la sección 7.

- **La escala de 10 por clase es normal.** En los sistemas comparables la acción central vale entre 2 y
  20: Perkville recomienda 5 por visita (media), Peloton da 2 por día de entrenamiento (alta), Stack
  Overflow 10 por voto (media).
- **No hay evidencia que compare 1, 10 o 100 puntos para la misma acción** en un sistema de estatus. Los
  trabajos conocidos (Hsee 2003, Bagchi y Li 2011) tratan sobre el avance hacia una meta, que acá no
  existe porque no hay niveles. La escala es criterio, no ciencia.
- **Lo que sí está respaldado: la gente optimiza puntos**, así que la proporción entre acciones moldea la
  conducta (Hsee, medio; Mekler 2017, alto; Anderson 2013, alto).
- **Los bonos únicos son chicos en los demás sistemas.** Peloton: unirse vale 2,5 días de entrenamiento y
  el aniversario 12,5 días (alta). Perkville ata los bonos de entrada a la asistencia: primera, cuarta y
  octava visita (media-baja).
- **Regalar puntos:** Bonusly y HeyTaco usan un cupo aparte, chico, que vence y no se acumula (media).
  Peloton paga 1 punto por semana por saludar a otro miembro, la mitad de un día de entrenamiento (alta).
- **Cambiar reglas después de visibles se paga caro**, aunque el respaldo es secundario (media-baja).
- **Un número al lado del nombre funciona como ranking implícito** aunque no haya tabla. Es lectura del
  investigador, no hay estudio directo. Con los valores de hoy, un alumno nuevo vería su número al lado
  de otro 7 veces mayor.

## 3. Diagnóstico

Hay dos problemas distintos y conviene no mezclarlos.

1. **Proporciones.** Los bonos únicos pesan demasiado frente a la acción que importa. El onboarding
   (un formulario) vale 5 clases; el año de antigüedad vale 25 clases y se repite cada año; las rachas
   suman 40 clases en total. Esto sí tiene respaldo externo y se ve en los datos (684 personas con 50
   puntos sin haber venido nunca).
2. **Tamaño del número.** Con 10 por clase, un alumno de 3 veces por semana pasa los 1.700 en un año y
   los 5.000 en tres. No es un error según el benchmark, pero el número solo sube, y el pedido de Franco
   es que no quede inflado.

## 4. Propuesta

### 4.1 Proporciones (vale para cualquier escala)

| Fuente | Hoy, en clases | Propuesta, en clases | Por qué |
|---|---|---|---|
| Asistir a una clase | 1 | 1 | Es la unidad |
| Completar el onboarding | 5 | 1 | Un formulario no puede valer más que venir. Referencia: Peloton 2,5 |
| Antigüedad 3 meses | 5 | 3 | Reconocimiento, no fuente principal |
| Antigüedad 6 meses | 10 | 5 | Ídem |
| Antigüedad 1 año, y cada año | 25 | 10 | Referencia: Peloton 12,5 días por aniversario |
| Rachas 7 / 14 / 30 / 60 / 100 | 2 / 3,5 / 5 / 10 / 20 | 1 / 2 / 3 / 5 / 10 | Misma lógica que antigüedad. Hoy casi no se usan |
| Entrenar por la app, plan a medida | 1 | 1 | Sin cambio. Son el 1 % del Aura |
| Estirar, bloque libre | 0,5 | 0,5 | Decididos por Franco en las fases 197 y 213 |
| Programas (semana, completo) | 1,5 y 10 | Sin cambio | Se editan por programa desde el admin |
| Foto de perfil, si se confirma | — | 0,5 | Acción trivial, una sola vez |
| Regalo entre alumnos, si se confirma | — | A definir en el bloque 3 | Cupo aparte que vence, no del saldo propio |

Con estas proporciones la asistencia pasa a explicar el 92 % del Aura de los alumnos activos.

### 4.2 Escala (cuánto vale una clase)

Simulado sobre los 1.256 alumnos activos de hoy, con las proporciones de 4.1.

| Una clase vale | Alumno del medio | 1 de cada 10 más altos | Máximo hoy | Alumnos con 4 cifras hoy | Un año yendo 3 veces por semana | Tres años |
|---|---|---|---|---|---|---|
| 10 (como hoy, sin retocar bonos) | 250 | 870 | 1.750 | 79 | 2.010 | 5.630 |
| 10, con bonos chicos | 200 | 780 | 1.710 | 58 | 1.750 | 5.070 |
| 5, con bonos chicos | 100 | 390 | 855 | 0 | 875 | 2.535 |
| 3, con bonos chicos | 60 | 234 | 513 | 0 | 525 | 1.521 |

Una clase = 1 punto queda descartada: el número sería casi igual al contador de sesiones que va en el
encabezado, y no deja lugar para que estirar valga menos que asistir.

**Recomendación: una clase vale 5.**

- Es el valor que recomienda Perkville para gimnasios y está en el medio del rango observado.
- Hoy nadie llegaría a cuatro cifras, y un alumno constante tarda más de un año en llegar.
- Deja lugar para valores menores a una clase (estirar 2 o 3).
- Si con el tiempo queda chico, subir es indoloro. Bajar una escala ya visible es una devaluación a la
  vista de todos. Ante la duda conviene empezar por la escala menor.

**Alternativa barata: dejar 10 y achicar solo los bonos.** Corrige el problema de proporciones, que es el
que tiene respaldo, y casi no toca código ni historial. No corrige el tamaño del número.

**Escala 3:** es la que dijo Matías en la reunión ("asististe, tres puntos"). Números más chicos todavía,
pero estirar pasa a valer 1 (un tercio de clase) y no queda margen para afinar.

### 4.3 Lo ya acreditado

Recomendación: re-valorizar el historial por migración con los valores nuevos, para que el número de cada
alumno signifique lo mismo antes y después del cambio. Hoy es gratis: nadie vio su Aura y no hubo canjes.
Si solo se cambia hacia adelante, una clase de octubre valdría el doble que una de diciembre.

## 5. Qué hay que tocar

| | Dejar 10, bonos chicos | Clase = 5 o 3 |
|---|---|---|
| Constantes en código | Onboarding, hitos de antigüedad, rachas | Además asistencia (3 lugares) y su reversa |
| `aura_config` (por migración) | — | Entreno por la app, plan a medida, estirar, bloque libre |
| Historial a re-valorizar | 2.519 filas (2.109 onboarding + 410 hitos), 2.113 alumnos | Las 44.000 filas del ledger |
| Saldos | Recalcular los afectados | Recalcular todos |
| Textos fijos en la app | "+50" de respaldo en el onboarding (2 lugares) | Además los siete "+5" de estirar y bloque libre |
| Tramos de canje (500 / 1.000 / 2.000 / 5.000) | Sin cambio | Decidir si se reescalan (250 / 500 / 1.000 / 2.500) o se dejan |
| Tests que afirman montos | Onboarding e hitos (unas 20 aserciones) | Además estirar, bloque libre, sesiones y, si se reescalan, los de tramos (unas 130) |

Puntos a cuidar en la migración del historial:

- Las reversas de asistencia son filas de −10 sin vínculo a su asistencia (solo el texto "Reversa
  asistencia #id"). Se reescalan igual que la asistencia.
- Onboarding, canjes y reversas no tienen clave única (referencia NULL): se identifican por fuente.
- Ninguna descripción guardada lleva el monto de puntos adentro.
- Los textos "+5" viven dentro de la app. La 1.9.6 todavía no tiene builds de tiendas: conviene decidir
  antes de generarlos para que no quede una versión mostrando el valor viejo.

## 6. Decisiones abiertas para Franco

1. Proporciones de la tabla 4.1 (onboarding, antigüedad, rachas).
2. Escala: 10, 5 o 3.
3. Re-valorizar el historial o cambiar solo hacia adelante.
4. Tramos de canje si cambia la escala. Con bonos chicos, quienes alcanzan el tramo de 500 pasan de 402
   a 314 aun sin cambiar la escala.
5. Los alumnos de muchos años no se distinguen de los de este año. ¿Se acepta, o se quiere un
   reconocimiento retroactivo de antigüedad? Sería una acreditación nueva.
6. Regalo entre alumnos y foto de perfil: bloque 3 del discuss.

## 7. Hallazgos del inventario fuera de esta decisión

No se arreglan acá; quedan como ideas diferidas en `214-CONTEXT.md`.

- La semana de programa se acredita una sola vez por inscripción: la clave de idempotencia es la misma
  para todas las semanas (`programs/service.ts:914-919, 961-966`) y las siguientes chocan en silencio.
- La racha cuenta sesiones, no días (`streaks/service.ts:175-283`).
- El onboarding devuelve el saldo como si fuera el monto ganado (`onboarding/service.ts:68, 173`) y la
  app muestra "+50" si el servidor devuelve 0 (`OnboardingResult.vue:24`).
- La reversa de asistencia no se aplica si el saldo es menor a 10, y no distingue si esa asistencia había
  acreditado (`attendance/service.ts:1297-1310`).
- El canje se guarda como `manual_adjustment` y gasta los puntos antes de la transacción de la
  suscripción (`aura/pricing-benefits.ts:208`).
- `aura_config['referral']` no son puntos sino el % de descuento por invitado activo. El relevamiento
  temía que valiera 50 por el orden de las migraciones 0030 y 0176. DESCARTADO: en producción vale 10
  (`consultas/03-sesiones-y-config.resultado-2026-11-17.txt`).
- No hay guard de duplicados visible en el check-in forzado (`attendance/service.ts:558`). Sin confirmar.

## 8. Fuentes del benchmark

- Hsee, Yu, Zhang y Zhang (2003), "Medium Maximization", JCR 30(1). Solo resumen.
  https://econpapers.repec.org/RePEc:oup:jconrs:v:30:y:2003:i:1:p:1-14
- Bagchi y Li (2011), "Illusionary Progress in Loyalty Programs", JCR 37(5). Solo resumen.
  https://sciencedaily.com/releases/2010/08/100824121020.htm
- Mekler y otros (2017), Computers in Human Behavior 71.
  https://aminer.org/pub/56d8e5dadabfae2eee30a6d8/towards-understanding-the-effects-of-individual-gamification-elements-on-intrinsic-motivation-and
- Anderson, Huttenlocher, Kleinberg y Leskovec (2013), WWW.
  https://archives.iw3c2.org/www2013/proceedings/p95.pdf
- Club Peloton (blog oficial). https://www.onepeloton.com/blog/what-is-club-peloton
- Perkville, reglas de puntos (blog del proveedor).
  https://info.perkville.com/blog/tips-for-earning-and-redeeming-rules
- Stack Overflow, reputación. https://stackoverflowteams.com/help/whats-reputation
- Bonusly, cómo funcionan los puntos. https://help.bonus.ly/en/articles/357124-how-do-bonusly-points-work
- HeyTaco, tope diario.
  https://heytaco.com/blog/why-heytaco-uses-a-daily-giving-limit-and-why-it-works-better-than-weekly-or-monthly
- Ho, Liu y Wang (2023), ISR, rankings e insignias. https://pubsonline.informs.org/doi/fpi/10.1287/isre.2022.1147
- Bradler, Dur, Neckermann y Non (2016), Management Science 62(11).
  https://cris.maastrichtuniversity.nl/en/publications/employee-recognition-and-performance-a-field-experiment/
- Yu-kai Chou, inflación de puntos (blog de consultor, confianza baja).
  https://yukaichou.com/gamification-analysis/reward-layers-architecture-points-fail/

**No se encontró:** un experimento que compare escalas para la misma acción, un estudio sobre un total
visible al lado del nombre, uno sobre devaluación de puntos de estatus, ni una proporción documentada de
"acción central sobre total" en sistemas sanos.
