# Benchmark de mercado: comunidad en fitness (estado del arte)

> **Fase:** Investigación paso 1 de 2 — benchmark de mercado puro (sin sesgo de AGORA).
> **Fecha:** 2026-05-31. **Método:** deep-research (23 fuentes → 98 claims → 25 verificados adversarialmente, 20 confirmados / 5 refutados).
> **Próximo paso:** contraste de estos principios contra el diseño ya implementado en AGORA (qué valida / qué falta / qué sobra).
> **Foco:** mayor peso a gimnasios físicos/boutique; apps masivas (Strava/Nike/Keep) como complemento.

---

## Tesis central que debe gobernar el diseño

La comunidad **no retiene como fin emocional en sí mismo** — retiene **indirectamente, en la medida en que dispara asistencia consistente**, que es el predictor conductual robusto de permanencia. El módulo de comunidad de El Templo debe diseñarse para **llevar gente a la sede y sostener la frecuencia**, no para maximizar engagement digital ni "sentido de pertenencia" abstracto.

Corolario de gamificación: **más no es mejor**. La relación gamificación↔adherencia tiene forma de S con un umbral de sobrecarga donde más gamificación _daña_. La motivación **intrínseca** (dominio de la habilidad, identidad de grupo) supera ampliamente a la **extrínseca** (puntos, badges, ranking) como predictor de uso continuado.

---

## Hallazgos confirmados (con fuerza de evidencia)

### 1. El apoyo social estructurado aumenta la actividad física — robusto (HIGH, 3-0)

Intervenciones de apoyo social (compañeros, contratos de grupo, grupos de ejercicio) → mediana **+44.2% en tiempo activo** y **+19.6% en frecuencia**; recomendación de "evidencia fuerte" del CPSTF (organismo federal de salud pública EE.UU.). El ejercicio en grupo supera al individual (parejas > solo; grupos de 3+ > parejas).
→ **Diseño:** la unidad de pertenencia (clase/turno/squad por sede) es el activo central; diseñar para que el ejercicio sea grupal, no solitario.

- thecommunityguide.org/findings/physical-activity-social-support-interventions-community-settings.html
- community.inc/deep-dives/community-growth-strava · strava.com/yis-community-2022

### 2. La pertenencia NO predice retención por sí sola (HIGH, 3-0 / 2-1)

CrossFit genera **más capital social y pertenencia** que gimnasios tradicionales — pero en regresión, ni capital social ni pertenencia ni tipo de gimnasio predijeron la asistencia de forma independiente (solo correlación débil r=.28). Estudio chino 2026 (n=525): pertenencia β=0.076, **p=0.156 (no significativa)**.
→ **Diseño:** no tratar la comunidad como driver emocional aislado; canalizarla hacia **conducta** (asistir, entrenar). _Caveat: estudios transversales; el chino es culturalmente específico._

- journals.sagepub.com/doi/abs/10.1177/1359105316664132 · ncbi.nlm.nih.gov/pmc/articles/PMC12511082/

### 3. El motor real de retención es la asistencia consistente, sobre todo en los primeros 90 días (MEDIUM, 2-1)

La mayoría del churn ocurre en los primeros 3 meses. Investigación de Paul Bedford: las visitas son el predictor #1 (4+ visitas/mes → ~7 meses más de permanencia; 5 visitas el primer mes → 90%+ retención). Onboarding estructurado: 87% retención a 6 meses vs ~60% estándar. El segmento "ausentes entusiastas" churna pese a alta satisfacción → la conducta predice mejor que la satisfacción declarada.
→ **Diseño:** mecánicas que disparen asistencia en los primeros 90 días (retos de check-in por sede, squads que registren presencia).

- pushpress.com/blog/gym-member-retention-guide · doi.org/10.1080/23750472.2020.1763829 · doi.org/10.1080/23750472.2024.2305896

### 4. La gamificación tiene forma de S: hay un umbral donde más DAÑA (HIGH, 2-1 / 3-0)

Estudio Frontiers Psychology oct-2025 (n=632, modelo cúbico, 66% varianza): más allá del umbral de sobrecarga la pendiente es -0.90. Mecanismo (SDT): pop-ups/alertas de feed excesivos se perciben como **controladores** y minan la autonomía; feedback ruidoso erosiona la competencia. _Verbatim: "Overly frequent pop-up quests or social-feed alerts risk being perceived as controlling, thereby undermining autonomy."_
→ **Diseño:** gamificación **moderada y configurable**, no maximizada; cuidar frecuencia de notificaciones. _Caveat: el número de cutpoint es de un estudio; la FORMA es la lección, no el valor exacto._

- frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2025.1671543/full

### 5. Los leaderboards son un antipatrón documentado (HIGH, 2-1 / 3-0 / 3-0)

Son el elemento de gamificación **peor valorado** en contextos sociales; "demotivating or stressful"; el exceso de competencia afecta la salud mental. Su efecto está moderado por autoeficacia y clima competitivo **en direcciones opuestas**: motivan a unos y desaniman a otros.
→ **Diseño:** evitar leaderboards públicos globales. Si hay competencia: grupal (sede vs sede, squad vs squad), **opt-in**, con ligas/cohortes por nivel para que el gap sea cerrable. Nunca exponer a los menos activos al fondo de una tabla pública.

- ncbi.nlm.nih.gov/pmc/articles/PMC10453885/ · aisel.aisnet.org/icis2015/proceedings/IShealth/14/

### 6. La motivación intrínseca supera a la extrínseca (HIGH, 3-0)

SEM (Frontiers 2024, n=514): intrínseca **β=0.501 (efecto grande)** > reconocimiento social 0.361 > recompensa financiera 0.259. La sobre-dependencia de motivadores extrínsecos produce foco en metas de corto plazo en vez de cambio de conducta duradero.
→ **Diseño:** la gamificación debe **apoyar** metas intrínsecas (progreso de habilidad de calistenia, dominio, identidad de grupo), no sustituirlas con puntos vacíos. _Caveat: estudio de apps masivas chinas → aplica al complemento digital._

- frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2023.1286463/full · ncbi.nlm.nih.gov/pmc/articles/PMC10453885/

### 7. Rituales humanos de bajo esfuerzo para el coach (MEDIUM, 3-0)

"Regla de los 3 pies" (saludar a quien entra) y "regla 3x3" (usar el nombre, contacto visual, contacto apropiado tres veces por sesión) — derivados de prácticas de servicio (Ritz-Carlton 10/5, Walmart). Operacionalizan pertenencia sin esfuerzo cognitivo constante del profe.
→ **Diseño:** la app debe **amplificar** estos rituales presenciales (recordar nombres, celebrar hitos), no reemplazarlos. _Caveat: fuente secundaria, sin datos que liguen a churn._

- pushpress.com/blog/gym-member-retention-guide

### 8. El modo de fallo del arranque es el "pueblo fantasma" (MEDIUM, 3-0 / 2-1)

Nadie se une a una comunidad vacía. Hay un umbral de masa crítica por debajo del cual no se auto-sostiene. _Caveat: el "~1.000 suscriptores" es heurística divulgativa, no investigación; otras fuentes ubican el umbral cerca de 10.000. El principio es robusto, el número es contestado._

- medium.com/twosapp/the-cold-start-problem... · andrewchen.com/how-to-solve-the-cold-start-problem-for-social-products/

### 9. El cold start se resuelve por nicho estrecho, no por lanzamiento masivo (HIGH, 3-0)

Strava targeteó ciclistas (clubes), repartió Garmins a mano y fue a carreras locales. Un reto ("el 5K más rápido gana ruedas") **reclutó clubes enteros**, no usuarios sueltos.
→ **Diseño:** sembrar la comunidad **por sede** (red atómica natural = sede + sus turnos/clases), aprovechando los vínculos profe-alumno existentes y retos que recluten clases enteras. No lanzar las 9 sedes vacías a la vez.

- community.inc/deep-dives/community-growth-strava · contrary.com/company/strava

---

## ⚠️ Mitos REFUTADOS — NO usar como justificación (votos 0-3)

1. **"La comunidad es el driver primario de retención boutique"** — refutado 0-3. (La industria lo repite; la evidencia de regresión no lo sostiene. Ver hallazgo 2-3: opera indirectamente vía asistencia.)
2. **"Bajar churn de 7% a 3% sube el LTV de ~$1.600 a ~$6.700"** — refutado 0-3. No usar esta cifra.
3. **"El sistema Kudos (solo positivo) de Strava reduce trolling; los posts reciben 8x más feedback que Twitter; 44% mejoran su vida social"** — refutado 0-3. (Cae en un punto clave del brief: UGC/feeds → queda sin evidencia confirmada.)
4. **"Los rewards extrínsecos crowd-IN la motivación intrínseca"** — refutado 0-3 (contradecía el hallazgo 6; prevalece que el exceso de extrínsecos puede minar la intrínseca).
5. **"La salida del cold start es la 'red atómica' / 10 amigos en 7 días estilo Facebook"** — refutado 0-3 como formulación. (El principio de masa crítica del hallazgo 8-9 sí sobrevive; esta operacionalización específica no.)

---

## Vacíos del brief — puntos que NO sobrevivieron a verificación (a cubrir en investigación adicional)

Estos puntos del pedido original **no produjeron afirmaciones confirmadas** y quedan abiertos:

1. **Tamaño óptimo de grupo** (squad/clase/turno) e identidad de grupo por sede — Dunbar se mencionó pero ningún número sobrevivió para calistenia.
2. **Mecánicas concretas de UGC y feeds** (qué se postea, moderación, reacciones con significado vs likes) — el dato de Strava fue refutado; punto crítico sin evidencia.
3. **Herramientas concretas del coach** en Trainerize / TrueCoach / Wodify / Glofox / Mindbody para sostener comunidad sin sobrecarga — sin claims verificadas.
4. **Conexión online↔offline** (eventos presenciales reforzados por la app) y **sistemas de referidos** orgánicos en gimnasios físicos — sin claims verificadas.
5. **Métricas de éxito de comunidad** más allá de asistencia/churn (engagement por sede, ratio de contribuyentes, NPS de comunidad).

---

## Caveats de calidad (leer antes de citar)

- Las afirmaciones más fuertes (apoyo social, gamificación en S, leaderboards, motivación intrínseca, capital social CrossFit) son **fuentes primarias revisadas por pares**.
- Retención por asistencia/90 días, rituales 3x3 y cold start descansan parcial/totalmente en **fuentes secundarias** (blogs de proveedores, libro de Andrew Chen) — corroboradas pero menos rigurosas.
- Números específicos (44.2%, GFR 0.95, 1.000 suscriptores) son **ilustrativos**, no leyes meta-analíticas.
- **Todos** los estudios académicos son **transversales** (un punto temporal) → miden asociación/intención, no retención causal longitudinal.
- Sesgo de contexto: varios estudios clave son de **apps digitales masivas chinas** → pertenecen al complemento, no al foco de gimnasio físico; transferibilidad al contexto argentino con cautela.

---

## Puente al paso 2 (contraste con AGORA)

Señal temprana, a profundizar en la fase de contraste: **AGORA está fuertemente apoyada en gamificación extrínseca** (moneda AURA por casi todo, tiers, leaderboard semanal, store de canjes, puntos por hito/misión/referido). La evidencia advierte precisamente sobre eso: curva en S (riesgo de sobrecarga), leaderboards como elemento peor valorado, y extrínseco < intrínseco. **No invalida AGORA** —tiene mucho bien pensado (squads como unidad de pertenencia, reacciones con significado, antifraude, foco por sede)— pero define las **preguntas duras** del contraste: ¿está AGORA del lado sano de la curva de gamificación? ¿Su leaderboard respeta los recaudos (opt-in, por cohorte, grupal)? ¿Sus mecánicas disparan asistencia presencial o solo engagement digital?
