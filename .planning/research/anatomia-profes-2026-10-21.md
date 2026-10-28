# Anatomía para profes — Investigación consolidada

Fecha: 2026-10-21. Proyecto El Templo (gimnasio de calistenia, Argentina). Solo lectura sobre `origin/master` + DB local `eltemplo`; sin código de app y sin commits.
Estado: **borrador revisado por agente kinesiólogo; pendiente kinesiólogo humano (derivación) y Nacho (método y siglas).** No es texto para alumnos ni para profes: es material de investigación para destilar.
Cómo se armó: unión de la parte 1 (inventario y modelo), la parte 2 (tren superior y core) y la parte 3 (tren inferior, movilidad, flow, plyo, cardio, kettlebell), más la aplicación de las dos revisiones del kinesiólogo (R2 = revisión de la parte 2, R3 = revisión de la parte 3). El Apéndice B registra cada hallazgo y cómo se aplicó.

## 0. Resumen ejecutivo

**Qué es.** El pedido: una sección "Anatomía" para profes (admin/TV/Guía) que diga qué músculos y articulaciones trabaja cada complejo y ruta, por qué se progresa, dónde se siente, compensaciones, cues y cuándo derivar. Este documento es la investigación previa a escribir esos textos y a construir el modelo.
**Qué hay (por entregable).**
- §1 Inventario: 1.546 filas / 1.283 nombres, 30 rutas con ejercicios + `FB` (sin ejercicios), árbol patrón → categoría → ruta con conteos, código por código, 18 anomalías de datos y un diccionario unificado de siglas (§1.4).
- §2 Análisis articular: base común (tren superior y tren inferior) y luego cada una de las 30 rutas + PLYO, CARDIO y KL (fases, articulaciones, músculos y rol, contracción, por qué progresa).
- §3 Banderas de derivación consolidadas en DOS niveles (a: urgencia/guardia el mismo día; b: derivar al kinesiólogo) + precauciones previas.
- §4 Modelo de contenido (herencia complejo → ruta → gesto → ejercicio), qué permite y qué no el dibujo, y recomendación de almacenamiento: archivos versionados en el repo.
- §5 Guía de 16 preguntas para profes, mini-test antes/después de 10 ítems y preguntas para Nacho (siglas sin resolver). §6 Plan de validación (a–e). Apéndice A: 109 referencias numeradas + 5 libros, unificadas. Apéndice B: registro de las 86 correcciones.
**Hallazgos que cambian decisiones.**
- El catálogo NO tiene campos de músculo, articulación ni texto: todo lo anatómico hay que crearlo. La "ruta" no es una unidad homogénea (FL, NC, TTB, PIKE, MN/RP, AF): hace falta un nivel **gesto**, y los roles por fase son por gesto, no por ruta.
- Las revisiones hallaron un error sistemático en la mecánica de las palancas (qué cadena sostiene piernas y pelvis según el cuerpo esté boca arriba o boca abajo) y otros errores de rol o contracción (sissy/quad curl, side pancake, swing, muscle-up, vertical). Quedaron corregidos en el cuerpo.
- Las banderas originales no incluían urgencias (columna con síntomas bilaterales o en la zona de la silla de montar, orina oscura post-esfuerzo, "pop" con hematoma, dolor de pecho). Ahora sí (§3).
- `muscle-zones.ts` hoy pinta mal rutas clave (BL = PL, SS sin cuádriceps, ninguna ruta de fuerza de piernas pinta gemelos); el dibujo tiene 23 zonas (la TV usa 15) y no distingue dorsal/romboides, cabezas del deltoides ni glúteo mayor/medio.
**Decisiones que tiene que tomar Franco.**
1. Nombre oficial de HR, MN/RP, SIDE PCK, HD/ID y FLR (hoy hay 2–3 versiones por ruta; §1.4).
2. PLYO (36) y KL (19): ¿rutas nuevas o "sin mapeo" explícito? Corregir además los 5 "SISSY SQ OL" sin ruta.
3. ¿Los profes van a EDITAR el contenido o solo a revisarlo? (decide tablas MySQL vs archivos; recomendado: archivos, con estado de validación aparte si hace falta).
4. Dibujo: ¿se acepta vivir con las 23 zonas en v1 (sumando `tibialis`) y un POC de dividir solo `upper-back`?
5. ¿Quién es el kinesiólogo humano y quién valida con Nacho? Sin ese nombre ninguna bandera ni rol corregido pasa de "borrador".
**Decisiones de Franco (registro).**
- D1 (2026-10-21) Nombres oficiales: HR = **Espinales y planchas laterales** · MN/RP = **Manna** · SIDE PCK = **Side Pancake** · HD/ID = **Fondos** · FLR = **Front Lever Row**. Reemplazan "Ham Raise", "L-Sit", "Side Pike Compression", "Hefesto / Impossible Dips" y "Front Lever Pull Ups" en DB, TV y app. La expansión de las siglas HD/ID sigue abierta para Nacho (⚑N).
- D2 (2026-10-21) PLYO, CARDIO y KL (99 ejercicios) quedan **fuera de la v1** de la sección: no se crean rutas ni fichas. El análisis de §2.2 TI-E a TI-G queda guardado para una etapa posterior. Igual se corrigen los 5 "SISSY SQ OL" sin ruta → SS (migración de datos).
- D3 (2026-10-21) Los profes **solo leen y opinan**, no editan. Contenido en **archivos versionados en el repo** (opción B de §4.7). Los aportes de los profes llegan por formulario u hoja y se vuelcan a los archivos. Mismo contenido para todos los tenants en v1. Si hace falta, más adelante se suma el estado de validación y los comentarios en DB (opción C).
- D4 (2026-10-21) Dibujo: **v1 con el dibujo actual** (opción (a) de §4.1): `precision` exacta/agrupada/aproximada por zona + aviso "zona = grupo" en la UI + sumar `tibialis`. **POC de dividir solo `upper-back`** (dorsal vs romboides/trapecio medio) midiendo costo de arte y presupuesto de la TV, antes de decidir deltoides y glúteo. Zonas como datos, no enum cableado.
- D5 (2026-10-21) Kinesiólogo humano: **no hay, queda pendiente**. No frena el sketch 019 ni el modelo. Banderas y H1–H18 siguen en "borrador" y no se muestran como validadas hasta tenerlo.
**Estado de validación.** Borrador revisado por agente kinesiólogo (86 hallazgos: todos los CRÍTICO y MAYOR aplicados); **pendiente kinesiólogo humano en derivación y puntos marcados ⚑H, y Nacho en método y siglas (⚑N).** Nada pasa a "validado" ni se muestra a alumnos hasta entonces (§6).

## Leyenda de marcas y convenciones (leer antes de las secciones)

**Marcas de evidencia (unificadas de las tres partes):**

| Marca | Qué significa |
|---|---|
| `[n]` | Fuente que se abrió y leyó; ver Apéndice A, que conserva cómo se leyó cada una (abstract / texto completo / texto parcial / señalada por la revisión). Solo se cita lo que el abstract dice; no se citan números que no se vieron. |
| `[L1]`–`[L5]` | Libro de texto citado de memoria, sin verificar página (Neumann, Kapandji, Low, McGill, NSCA). Toda fila basada solo en libro = "texto de referencia estándar, a corroborar contra el libro antes de publicar". |
| `[C]` | Consenso de coaching o inferencia a partir de anatomía/física, **sin evidencia directa leída**. Es una hipótesis de trabajo. (En la parte 2 aparecía como "consenso de coaching".) |
| `[M]` | Derivación mecánica: física básica (momento = peso × brazo de palanca horizontal) o geometría; **no es una fuente**. (En la parte 2 aparecía como "derivación mecánica/geométrica".) |
| `[R]` | Texto o corrección aportado por la revisión del kinesiólogo como conocimiento estándar de anatomía/biomecánica **sin cita verificada** (el revisor no consultó Neumann ni Kapandji). |
| `+` | (tablas resumen) rol según anatomía `[L1]` sin EMG directa. |
| (inferido) / ⟦PLACEHOLDER⟧ | Parte 1: deducido de nombres o patrones / a completar por el validador. Nada de esto es afirmación. |
| ⚑H | Necesita validación de un **kinesiólogo humano** (lista consolidada en §6.3). |
| ⚑N | Necesita definición o confirmación de **Nacho** (método, siglas, composición de ejercicios; §5.4 y §6.4). |

**Rol y contracción.** Rol: M = motor/agonista, S = sinergista, Est = estabilizador, Ant = antagonista co-activo, Al = músculo alargado (estirado). Contracción: C/CON = concéntrica, E/EXC = excéntrica, I/ISO = isométrica (coincide con la columna `effort` del catálogo). Los códigos compuestos de la parte 3 (p. ej. M-ISO, Est-ISO) significan rol-contracción.
**Cómo leer el EMG.** El EMG de superficie mide actividad eléctrica, no fuerza ni carga articular; no ve músculos profundos (subescapular, manguito en general); el %MVIC puede superar 100 % porque se normaliza contra una contracción de prueba que puede subestimar el máximo real. En la parte 2, los porcentajes de `[6]` son contribución relativa entre músculos, no %MVIC. Amplitud de EMG ≠ hipertrofia ni fuerza (§2.2, BI6). Todas las cifras de EMG son por ejercicio, con una carga y una muestra chica.
**Abreviaturas.** Articulaciones: GH glenohumeral, ST escapulotorácica, AC acromioclavicular, EC esternoclavicular. Músculos: RA recto abdominal, OE/OI oblicuo externo/interno, TrA transverso del abdomen, CL cabeza larga, RF recto femoral, TFL tensor de la fascia lata, iliopsoas = psoas mayor + ilíaco, "isquios" = isquiotibiales. Cargas: LCA/LCP ligamento cruzado anterior/posterior. Estadística: MVIC = % de la contracción máxima voluntaria; RSI = índice de fuerza reactiva (altura de salto / tiempo de contacto); DOMS = dolor muscular tardío (agujetas); η² = tamaño de efecto (diferencia grande). Ejercicios preparatorios = antes "PSE". Bloqueo = extensión completa (antes "lockout").
**Catálogo.** Tipo (estática/dinámica/mixta) = proporción de `effort` ISO/CON/EXC sobre las filas cargadas (≥55 % ISO estática; ≤15 % dinámica; sin dato si más de la mitad está vacía). Brazo: SAS/BAS desde `category_secondary`. Cadena abierta/cerrada = convención clásica (segmento distal fijo = cerrada), toda inferida y a validar.
**Etiquetas de la estructura.** BS1–BS6 = base común del tren superior (§2.1); S2–S8 = rutas del tren superior y core; BI1–BI6 = base común del tren inferior (§2.2); A–I (secciones TI-A a TI-I) = rutas del tren inferior, movilidad, flow, plyo, cardio y kettlebell.

## 1. Inventario de nuestros complejos (catálogo real)

Fuente: DB local (SELECTs, 1.546 filas en `exercises`, 31 en `routes`), `src/db/schema/*`, `src/modules/tv/*`, `el-templo-admin/src/tv/recorrido/*`, `route-progression-map.ts`, `route-labels.ts` (3 copias) y `.docs/saas-multitenancy/08-diseno-modulo-gimnasio.md`. Lo que no sale de datos o código verificado va marcado **(inferido)**. **El catálogo no tiene ningún campo de músculo, articulación ni texto explicativo**: solo `pattern`, `category`, `category_secondary`, `route`, `position`, `habilidad`, `effort`, `dificultad_lineal`, `progression_step`.

### 1.1 Schema relevante (origin/master)

`exercises` (`src/db/schema/exercises.ts`), 1.546 filas en local, un solo tenant (`tenant_id = 1`):

| Columna | Qué es | Notas |
|---|---|---|
| `pattern` varchar(100) | Patrón: PUSH, PULL, LOWER, CORE, MOVILIDAD, FLOW, PLYO, CARDIO, KL | 2 filas con `''` (error) |
| `category` varchar(100) | Categoría (23 valores) | PLYO tiene 36 filas con `''` |
| `category_secondary` varchar(100) | Texto libre (34 valores + 51 vacíos): SAS/BAS, QUADS, ISQUIOS... | La TV lo usa con "contiene" |
| `exercise` / `exercise_2` | Nombre completo / nombre base sin posición | `exercise_2` ≈ "gesto" pero casi 1:1 con el nombre (1.004 pares ruta+exercise_2 únicos) |
| `position` | Mezcla 3 cosas: escalón de palanca (TUCK/ADV TUCK/STR/FULL), implemento/entorno (RINGS, P-BARS, WALL, BOX, RACK) y orientación (INCLINED, DECLINED, HOR, VERTICAL) | 751 vacíos |
| `habilidad` | Variante paralela (PIKE, W, OL, RINGS, SIT, JUMP, INV, L SIT, FALSE GRIP...) | 1.064 vacíos |
| `effort` | `CON` / `EXC` / `ISO` o vacío | **441 vacíos (28,5 %)**; vacíos casi todos en piernas y AF |
| `exercise_level` | alfa / delta / sigma / omega / spartan | |
| `dificultad_lineal` | 1-12 (Alfa 1-3, Delta 4-6, Sigma 7-8, Omega 9-10, Spartan 11-12) | orden de progresión de rutas "linear" |
| `progression_step` | rank del escalón dentro de la ruta (solo rutas "token") | 621 filas con valor |
| `milestone_exercise_id` | 47 variantes colgando de un hito | |
| `mobility_related` | 139 filas: `LS ( LUNGES )` 43, `FL` 30, `TTB / HF` 28, `MN` 27, `PL` 11 | vínculo ejercicio→ruta de movilidad |
| `equipment` enum | **solo 5 filas con valor** (`ninguno`) | el equipamiento real está escondido en `position`/`habilidad` |
| `route_pending` | 0 en todas | el marcador existe pero nadie lo usa para las 104 sin ruta |

`routes` (`src/db/schema/routes.ts`): `code` (unique GLOBAL, no compuesta con tenant), `display_name` (varchar, hoy vacío en HR, HT, NC, QC), `excluded_from_tree` (AF, BRIDGE, FB, HR, HS, PIKE, SPAGAT = 1), `tenant_id`. 31 filas = 30 códigos con ejercicios + `FB` (Full Body, sin ejercicios; la TV pinta el cuerpo entero para esa ruta).

Tablas hermanas que importan al modelo: `exercise_progressions` (aristas DAG), `exercise_milestone_proposals`, `exercise_dimension_proposals`, `contraction_rules`, `intensity_rules`. No hay tabla de músculos en el schema de master.

### 1.2 Árbol patrón → categoría → ruta (n ejercicios, con `TRIM`)

Nota: en la DB local **no hay espacios sobrantes** al borde en pattern/category/route/secondary/exercise (0 filas afectadas; la advertencia de los docs de la TV vale para el CSV original o para prod, no verificado). Sí hay **188 nombres con doble espacio interno** ("DF  INV", "NC  BENT") y 27 grupos ruta+nombre que difieren solo por espacios/puntos.

```
PUSH (423)
 ├─ PUSH HORIZONTAL (263)  BL 49 · HD/ID 67 · OAPU 76 · PL 48 · PLPU 23
 ├─ PUSH VERTICAL   (158)  HS 50 · HSPU 61 · PHS 47   [+ KL 1 sin ruta, ver abajo]
 ├─ CORE 1 (MN/RP) · MOVILIDAD 1 (HS)                      ← filas sueltas con categoría "rara"
PULL (503)
 ├─ PULL VERTICAL   (292)  FL 4 · MU 55 · OAP 94 · TTB 139
 ├─ PULL HORIZONTAL (199)  FL 111 · FLR 30 · MN/RP 27 · OAR 31
 ├─ CORE ANTERIOR   (11)   FL 11   ← dragon flag y afines (inferido)
 └─ CORE 1 (MN/RP)
LOWER (283)
 ├─ KNEE DOMINANT (143)  L 21 · PS 60 · QC 17 · SS 22 · SU 18 · (sin ruta 5)
 ├─ HIP DOMINANT  (139)  DS 20 · HT 45 · NC 44 · PS 5 · QC 5 · SU 20
 └─ MOVILIDAD 1 (MN/RP)
CORE (29)
 ├─ CORE ANTERIOR 10 (TTB) · CORE LATERAL 6 (HR) · CORE POSTERIOR 12 (HR) · CORE 1 (HS)
MOVILIDAD (140)
 ├─ SPAGAT 45 (SPAGAT 41 · PIKE 4)   ├─ BRIDGE 30 (BRIDGE)
 ├─ OBLICUOS 28 (SIDE PCK)           ├─ HIP DOMINANT 20 (PIKE)
 ├─ CORE POSTERIOR 11 (REVERSE HYPER)├─ CORE 3 (PIKE)
 └─ MOVILIDAD 3 (FL 1 · HS 1 · PIKE 1)
FLOW (67)  AF 66 + 1 HIP DOMINANT con ruta NC
           (CARDIO 19 · DESPLAZAMIENTO 22 · CORE 12 · MOVILIDAD 8 · ESTABILIDAD 3 · UPPER 2 · HIP DOMINANT 1)
PLYO (36)  sin categoría y sin ruta
CARDIO (44) COORDINATIVO 12 · PLYO 31 · LUNGE 1 — todos sin ruta
KL (19)    kettlebell (inferido por nombres: SWING, SNATCH, CLEAN/JERK) — sin ruta
(sin patrón, 2)  DEEP LUNGE HEEL UP / DEEP LUNGE HEEL UP W, ruta SPAGAT → error de carga
```

Totales por ruta (incluye todas las categorías): TTB 149 · FL 127 · OAP 94 · OAPU 76 · HD/ID 67 · AF 66 · PS 65 · HSPU 61 · MU 55 · HS 53 · BL 49 · PL 48 · PHS 47 · HT 45 · NC 45 · SPAGAT 43 · SU 38 · FLR 30 · MN/RP 30 · BRIDGE 30 · OAR 31 · PIKE 28 · SIDE PCK 28 · PLPU 23 · QC 22 · SS 22 · L 21 · DS 20 · HR 18 · REVERSE HYPER 11 · (sin ruta 104).

### 1.3 Ruta por ruta

Convenciones:
- **Tipo** salió de la proporción `effort` (ISO/CON/EXC) sobre las filas cargadas: ≥55 % ISO = estática; ≤15 % ISO = dinámica; entre medio = mixta. Si más del 50 % de las filas no tiene `effort`, se marca "sin dato" y lo que se escribe es **(inferido)** por nombres.
- **Brazo** sale de `category_secondary` (contiene `STRAIGHT ARM` = SAS, `BENT ARM` = BAS). Piernas/core: "n/a".
- **Cadena**: uso la definición clásica (segmento distal fijo = cerrada). Es una convención discutida en la literatura: **todo lo de esta columna es (inferido) y para validar**; en rutas de tracción/empuje la mano está fija pero cadera/piernas se mueven, por eso aparece "mixta por segmento".
- Ejemplos: ordenados por `dificultad_lineal` (y `progression_step` cuando existe), nombres tal cual están en la DB.
- "Sig." = significado del código: **DICC** = diccionario en código (`route-labels.ts`, `routes.display_name`, `route-progression-map.ts`); **(inferido)** = deducido por nombres.

#### PUSH

| Ruta | Sig. | n · efforts (ISO/CON/EXC/vacío) | Tipo | Brazo | Cadena | Ejemplos (fácil → difícil) |
|---|---|---|---|---|---|---|
| **PL** | Planche (DICC) | 48 · 32/16/0/0 | Estática predominante (67 % ISO) | SAS 43 / BAS 5 | Cerrada en brazos; cuerpo libre en el aire (mixta) | PLANK FLOOR · PLANK SUPERMAN FLOOR · PLANK SUPP OA FLOOR · CROW S.A TO TUCK PL · ADV TUCK PL (PB) · BA FULL PL · CASETA PL TO STR. ASSISTED · FULL PL ASSISTED |
| **PLPU** | Planche Push Up (DICC) | 23 · 0/16/7/0 | Dinámica | BAS 23 | Cerrada | PROTRACTED DIPS · PLPU PSEUDO · PLPU SA TUCK TO ADV TUCK BA · PLPU ADV TUCK SA TO SUPER ADV BA · PLPU CASETA · PLPU STR · PLPU ASSISTED FULL |
| **BL** | Back Lever (DICC) | 49 · 15/22/12/0 | Mixta (31 % ISO); BL no tiene `exercise_2` cargado (49 vacíos) | SAS 42 / BAS 7 | Cerrada en manos, cuerpo colgando (mixta) | INVERTED RINGS · RINGS SUPPORT SUPINE · BL ADV TUCK PRONE · BL ADV TUCK SUPINE · BL STRADDLE PRONE · BL FULL PRONE · BL FULL PULL UP |
| **OAPU** | One Arm Push Up (DICC); en la TV "Push Ups" | 76 · 24/40/12/0 | Mixta (32 % ISO) | BAS 76 | Cerrada | SCAPULAR P.U KNEE · P.U SUPINE KNEE · P.U BULGARIAN HOR · P.U DECLINED · P.U RINGS SUPINE DECLINED · OAPURINGS 90 ASSIST · PELICAN P.U FULL RANGE HOR |
| **HD/ID** | DB: "Fondos (Dips)"; TV/app: "Hefesto / Impossible Dips" (conflicto) | 67 · 16/27/24/0 | Mixta (24 % ISO) | BAS 67 | Cerrada | DIPS LEG ASSISTED BOX · DIP SINGLE BAR · PROTRACTED DIP P-BARS · BULGARIAN DIP RINGS · KOREAN DIP SUPINE BAR · RUSSIAN DIP RINGS · IMPOSSIBLE DIP P-BARS |
| **HS** | Handstand (DICC); skill/equilibrio, excluida del árbol | 53 · 9/5/1/**38** | Sin dato (**inferido** estática / de equilibrio) | SAS 49 | Cerrada | KNEE PIKE BOX · HS BOX · TIP TOE PRESS · CONEJITO TO WALL BELLY · FOREARM HS · KICK TO FREE HS · FREE HS TAPS · WALL PRESS OA FREE HS |
| **HSPU** | Handstand Push Up (DICC) | 61 · 17/29/15/0 | Mixta/dinámica (28 % ISO) | BAS 61 | Cerrada | BOX HSPU KNEE · BOX WIDE P.U PIKE · BOX P.U PIKE · P.U ARCHER PIKE · P.U ARCHER RINGS DEEP PIKE · KIPPING HANDSTAND FREE · HSPU TO 90 FULL FREE |
| **PHS** | Press to Handstand (DICC) | 47 · 11/27/9/0 | Dinámica (23 % ISO) | SAS 34 / BAS 13 | Cerrada en manos | LEAN PIKE FLOOR · PIKE TO LEAN FLOOR · CROW FLOOR · CROW PRESS TO HS FLOOR · TUCK PL B.A TO HS FLOOR · PL. PRESS WALL TUCK WALL · STRADDLE PHS FREE · SUPER ADV TUCK PHS FREE |

#### PULL

| Ruta | Sig. | n · efforts | Tipo | Brazo | Cadena | Ejemplos |
|---|---|---|---|---|---|---|
| **FL** | Front Lever (DICC). **Ruta heterogénea**: DF (Dragon Flag, inferido) 30, ELBOW VICTORIAN 13, DP 13 (sin resolver), FL PRESS ≈24, BOAT 7, YEWKIES 5, ICM 4... | 127 · 38/65/24/0 | Mixta (30 % ISO) | SAS 89 / BAS 28 | Cerrada en manos, cuerpo libre (mixta) | DF INV · DF SA TUCK · DF ADV TUCK · DF SA HALF LAYOUT · ELBOW VICTORIAN TUCK · FL PRESS STR · ELBOW VICTORIAN STR · FALSE GRIP VICTORIAN ASSISTED FULL |
| **FLR** | DB: "Front Lever Row"; TV/app: "Front Lever Pull Ups" (DICC) | 30 · 13/17/0/0 | Mixta (43 % ISO) | BAS 30 | Cerrada en manos | ROW A LA CINTURA INCLINED · ROW FRONT PIKE · ROW FRONT ADV TUCK · ROW FRONT WIDE ADV TUCK · ROW FRONT WIDE SUPER ADV · BA FL STRADDLE · BA FL FULL |
| **OAP** | One Arm Pull Up (DICC); TV: "Dominadas" | 94 · 35/39/20/0 | Mixta (37 % ISO) | BAS 92 / SAS 1 | Cerrada | RETRAC. BAR VERTICAL · PL.UP TOP RACK · L SIT PL.UP STRICT · TYPERWITER PL.UP ASSIST · OA DEAD HANG · PL.UP L-SIT MID ARCHER · OAC ASSISTED FINGERS · OAP STRICT |
| **OAR** | One Arm Row (DICC); TV: "Remos" | 31 · 8/17/6/0 | Mixta (26 % ISO) | BAS 31 | Cerrada | ROW STANDING · ROW OH INCLINED · ROW OA INCLINED · ROW OH HORIZONTAL · ROW WIDE HORIZONTAL · ROW OH DECLINED · ROW ARCHER HORIZONTAL · ROW OA DECLINED |
| **MU** | Muscle Up (DICC) | 55 · 7/33/15/0 | Dinámica (13 % ISO) | BAS 54 / SAS 1 | Cerrada | STANDING MUSCLE UP INCLINED · BOTTOM DIP RACK · ASSISTED KIP MU RACK · FALSE GRIP BA MID FLYS VERTICAL · MUSCLE UP RINGS · SWING KIPPING MU BAR · MUSCLE UP RINGS ARCHER · MUSCLE UP BAR WEIGHTED |
| **MN/RP** | DB: "Manna"; TV/app: "L-Sit"; docs viejos: "Manna / Planche invertida" (conflicto). Los nombres son L-sit/V-sit/Reverse Planche | 30 · 10/19/1/0 | Mixta (33 % ISO) | SAS 28 (secundaria "PULL HORIZONTAL POSTERIOR (STRAIGHT ARM)") | Cerrada en manos | PIKE PULSE SIT · SCAPULA PRESS 1-1 L-SIT · L-SIT TUCK STR · SCISSORS OUT L-SIT · L-SIT DOUBLE EXTENSION STR · V-SIT · V-SIT SCISSORS · REVERSE PLANCHE (ASSISTED) |
| **TTB** | Toes To Bar (DICC). Categoría PULL VERTICAL (139) pero el gesto es core/flexión de cadera colgado | 149 · 42/102/5/0 | Dinámica/mixta (28 % ISO) | SAS 71 / BAS 68 | Cerrada en manos, piernas libres (mixta) | ABS CRUNCH · TTB 90 BA MID SUPINE TUCK · TTB V STR · TTB BENT ARM MID STR · TTB ATW SUPINE PIKE · OA TTB SUPINE 90 PIKE · SHAWARMA ON V PIKE · OA HANG TO MEATHOOK TO INVERTED SLOW PIKE |

#### LOWER

| Ruta | Sig. | n · efforts | Tipo | Brazo | Cadena | Ejemplos |
|---|---|---|---|---|---|---|
| **PS** | Pistol Squat (DICC); 60 KNEE DOMINANT + 5 HIP DOMINANT | 65 · 5/1/5/**54** | Sin dato (**inferido** dinámica) | n/a | Cerrada (pie fijo) | CLOSE SQUAT PARCIAL · BORROWER SQUAT · PS ASSISTED · HACK SQUAT W · COSSACK SQUAT · PS TO BOX JUMP · HACK PS W · SEIZA TO PISTOL |
| **SS** | Sissy Squat (DICC); secundaria QUADS | 22 · 4/2/2/14 | Sin dato (inferido dinámica) | n/a | Cerrada | HINDU SQ PARCIAL · SOLEO SQ · HINDU SQ FULL ROM · APE REACH · SISSY SQ ASSISTED · HINDU SQ W · SISSY SQ · LEVITATION SQUAT ASSIST |
| **L** | Lunge (DICC); "LS" = (inferido) lunge/split | 21 · 4/0/1/16 | Sin dato (inferido dinámica) | n/a | Cerrada | LS PARCIAL ASSISTED · BACK LS · LS SHUFFLE · DEEP LS · LUNGE JUMP · BULGARIAN LUNGE · BULGARIAN LUNGE JUMP · BULGARIAN LUNGE W |
| **SU** | Step Up (DICC); "PQ" no resuelto; 18 KNEE + 20 HIP | 38 · 7/2/5/24 | Sin dato (inferido dinámica) | n/a | Cerrada | PQ PARCIAL · PQ · LUNGE TO STEP UP · SU SHUFFLE SIDE · PQ FULL ROM W · STEP DOWN W · SU SHUFFLE JUMP W |
| **QC** | Quad Curl (DICC); secundaria QUADS (19) / GLUTES (3) | 22 · 3/2/2/15 | Sin dato (inferido dinámica con excéntrico) | n/a | Cerrada | SEIZA REACH · QC PARCIAL · QC ASSISTED · QC · TIBIALES PARED · QUAD BOX · QC FULL ROM · QC FULL ROM W |
| **DS** | Dragon Squat (DICC); "DP" (dragon pistol, inferido) / "DS"; HIP DOMINANT, secundaria GLUTES | 20 · 5/0/1/14 | Sin dato (inferido dinámica) | n/a | Cerrada | DS PARCIAL ASSISTED · DS SHUFFLE · DP ASSISTED · DP PARCIAL · DP · DP FULL ROM · DS JUMP W · DP PULSE W |
| **HT** | Hip Thrust (DICC, `display_name` vacío); incluye "LOW BRIDGE" (nombre que también usa BRIDGE) | 45 · 6/2/0/37 | Sin dato (inferido dinámica) | n/a | Cerrada | HT ON BOX · HT · HT REACH ON RINGS · HT L. ON BOX OL · HT OL EXP · LOW BRIDGE OL · LOW BRIDGE KNEE TO CHEST · HT SLIDE OL RING W |
| **NC** | Nordic Curl (DICC, `display_name` vacío). **Heterogénea**: NC, DEADLIFT, GOOD MORNING, CALF RISES, HORSE STANCE, JEFFERSON | 45 · 4/5/7/29 | Sin dato (NC puro = excéntrico/mixto) | n/a | Cerrada | GOOD MORNING · DEADLIFT W · NC BENT · NC · SLANTBOARD JEFFERSON · NC BENT TO EXTENSION · NC OL · NC FULL ROM W |
| **REVERSE HYPER** | "Hiperextensión inversa" (docs de la fase 100); en la TV "Reverse Hyper" | 11 · 3/8/0/0 | Dinámica (inferido) | n/a | **Abierta** en piernas (inferido) | RH TUCK · RH STR OL · RH STR. DONKEY KICK · RH HALF STR · RH TUCK TO FULL · RH STR · RH FULL |

#### CORE

| Ruta | Sig. | n · efforts | Tipo | Brazo | Cadena | Ejemplos |
|---|---|---|---|---|---|---|
| **HR** | **CONFLICTO**: la TV/app/docs la llaman "Ham Raise"; los 18 ejercicios son espinales (CORE POSTERIOR, secundaria ESPINALES 12) y side planks/bote lateral (CORE LATERAL, OBLICUOS 6). `display_name` vacío | 18 · 3/11/4/0 | Dinámica (inferido) | n/a | Mixta (inferido) | BOTE LATERAL · BOTE ESPINAL · ESPINAL CAJON · SIDE PLANK ELBOW · ESPINAL JEFFERSON · ESPINAL TORSION · ESPINAL A 1 · ESPINAL A 1 TORSION |

#### MOVILIDAD / FLOW

| Ruta | Sig. | n · efforts | Tipo | Brazo | Cadena | Ejemplos |
|---|---|---|---|---|---|---|
| **BRIDGE** | Bridge/Puente (DICC); secundaria "PULL" (30) | 30 · 11/19/0/0 | Mixta (37 % ISO) | n/a (hombro en flexión, brazos rectos — **inferido**) | Cerrada (manos y pies fijos) | CAT COW · SEAL REPS · SUSPENDED SEAL · LOW BRIDGE · MID BRIDGE ONE LEG · FULL BRIDGE ONE LEG · FULL BRIDGE WALL WALK |
| **PIKE** | Pike/Pica (DICC); 4 categorías (HIP DOMINANT 20, CORE 3, SPAGAT 4, MOVILIDAD 1) | 28 · 12/13/0/3 | Mixta | n/a | n/a | PIKE STANDING · JEFFERSON CURL · STANDING WINDMILL · BOX PIKE SQUAT · SITTED PIKE W · PANCAKE W · HEAD TO TOE CROSSED ELBOW · OL FRONT PIKE W |
| **SPAGAT** | Spagat/split (DICC), secundaria LOWER ANTERIOR 37 | 43 · 5/0/0/38 | Sin dato (inferido estática, de elongación) | n/a | n/a | QUAD STANDING STRETCH · COUCH STRETCH · SPLIT STANDING PIKE · GENTLEMAN TO PLEGADO · ARCHER COUCH STRETCH KNEE SPAGAT · WARRIOR SPAGAT STRETCH · SPAGAT ARCHER ASSISTED · SPAGAT FULL SPLIT |
| **SIDE PCK** | DB: "Side Pike Compression"; TV/app: "Side Pancake"; docs viejos: "Patada lateral" (conflicto); los nombres son oblicuos con peso/windmill/twist | 28 · 6/22/0/0 | Dinámica (21 % ISO) | n/a | n/a | WEIGHTED OBLIQUE · AROUND THE WORLD WEIGHTED · STRAIGHT SIDE PCK STANDING W. · WINDMILL SIDE PCK STANDING PRESS · PCK SIDE W · PCK SIDE TWIST · OVERHEAD PCK SIDE |
| **AF** | Animal Flow (DICC); patrón FLOW; excluida del árbol | 66 · 2/2/0/**62** | Sin dato (inferido dinámica, locomoción) | n/a (mezcla) | Mixta | BIRD DOG KNEE · PRIMATE SIDEWAYS · CRAB REACH · BUNNY HOPS · SIDE MACACO · GORILLA WALK · LION PU · FLYING CROW TO PU |
| **FB** | Full Body (v5.6; "ruta que acepta todos los ejercicios") | **0** ejercicios | — | — | — | — (la TV le pinta las 15 zonas) |

#### Sin ruta (104 filas)

| Grupo | n | Qué es | Ejemplos |
|---|---|---|---|
| PLYO (patrón PLYO, categoría `''`) | 36 | Pliometría | SEIZA TO GENTLEMAN · STEP DOWN REBOUND · CALF JUMP · REACTIVE SQ ON BOX · SQ TO JUMP |
| CARDIO (patrón CARDIO: PLYO 31, COORDINATIVO 12, LUNGE 1) | 44 | Acondicionamiento / coordinativos | WALL SKIPPING · DEADLIFT TO JUMP · SQ STEP TOUCH · REACTIVE SQ JUMP BOX |
| KL (patrón KL) | 19 | **Kettlebell (inferido)** | AROUND THE BODY · ATLAS SWING · SNATCH SQ · POWER SNATCH PRESS · SWING 180° |
| Errores de carga | 5 | 5 × "SISSY SQ OL..." KNEE DOMINANT sin ruta (deberían ser SS). Aparte: 2 × "DEEP LUNGE HEEL UP" sin patrón (ruta SPAGAT, no cuentan acá) | |

### 1.4 Diccionario unificado de códigos y siglas

Unifica lo que decían las tres partes (diccionario en código: `route-labels.ts` ×3, `routes.display_name`, `route-progression-map.ts`; contenido real de los ejercicios). **Regla de este documento:** cuando el nombre de una ruta tiene más de una versión, manda el **contenido real** de los ejercicios para decidir qué se explica, y el nombre oficial queda como decisión pendiente de Franco (⚑N). `VALIDATION-RESULTS.md` del API describe rutas con significados incorrectos y **no debe usarse como diccionario** (anomalía A16).

| Código | Nombre unificado | Qué contiene realmente | Conflictos entre fuentes / estado |
|---|---|---|---|
| **PL** | Planche | lean, tuck, adv tuck, straddle, full, bent arm, maltese, "caseta" | "caseta" sin definir ⚑N |
| **PLPU** | Planche Push Up | pseudo-planche push up, SA→BA, "caseta", assisted | — |
| **BL** | Back Lever | tuck → full, SUPINE/PRONE, pull-up en BL | SUPINE/PRONE = orientación de mano/agarre (no confirmado) ⚑N; "Zanetti" sin definir |
| **OAPU** | One Arm Push Up (en la TV: "Push Ups") | push-up en suelo, rodillas, anillas, archer, asistido con dedos | — |
| **HD/ID** | **Fondos (Dips)** (`display_name`) | dips en paralelas, anillas, barra; Russian, Korean, Bulgarian, Hungarian, archer, impossible, supine, protracted, Hefesto/Pelican | **Conflicto:** la TV/app la llaman "Hefesto / Impossible Dips". La expansión de las siglas HD/ID no está en el repo (hipótesis no verificada: "Horizontal Dip / Incline Dip"). No es "hindu". Nombre oficial: Franco ⚑N |
| **HS** | Handstand | tripod, headstand, wall belly/back, free, un brazo, kick-up | Excluida del árbol de fuerza (migración 0143) |
| **HSPU** | Handstand Push Up | pike P.U, box, wall, free, kipping, 90/deficit/wide | — |
| **PHS** | Press to Handstand | pike press, straddle, frog/crow press, tuck/adv tuck planche press | — |
| **FL** | Front Lever | **ruta heterogénea:** DF (dragon flag, inferido) 30 filas, Elbow Victorian 13, DP 13, FL press ≈24, Boat 7, Yewkies 5, ICM 4, rows/hangs | Reparte 4 categorías (A8). DP, ICM, Yewkies, Elbow Victorian, Boat: sin resolver ⚑N |
| **FLR** | Front Lever Row (DB) / "Front Lever Pull Ups" (TV/app) | rows a la cintura, row front pike/tuck/adv tuck; "BA FL" = bent-arm front lever | Nombre oficial: Franco |
| **OAP** | One Arm Pull Up (en la TV: "Dominadas") | pull-up/chin-up asistido, archer, typewriter, L-sit pull-ups, OAC | `PL.UP` = pull-up, `CH.UP` = chin-up; OAC (inferido: chin-up a una mano) |
| **OAR** | One Arm Row (en la TV: "Remos") | row inclinado/horizontal, búlgaro, typewriter, de pie | — |
| **MU** | Muscle Up | anillas, barra, transiciones, falso agarre, kipping | — |
| **MN/RP** | **Manna / Reverse Planche** (`display_name` = "Manna") | L-sit, V-sit, scapula press, manna press, reverse planche | **Conflicto:** la TV/app la llaman "L-Sit"; docs viejos "Manna / Planche invertida". La DB la clasifica PULL HORIZONTAL (ver 1.8) |
| **TTB** | Toes To Bar | core colgado (pike, windshield, ATW, L a V), crunches y "ABS HINGE" (CORE ANTERIOR), colgadas a un brazo | Categoría PULL VERTICAL (139) + CORE ANTERIOR (10); "hinge" sin definir ⚑N |
| **L** | Lunge | back/deep lunge, búlgara (asistida, W, jump), heel up | "LS" = lunge/split squat (inferido) |
| **PS** | Pistol Squat y **familia sentadilla** | pistol (assisted, heel up, to box, seiza to pistol), deep/close/cyclist/borrower/snowboard/hack, cossack, side lunge, shrimp, saltos; 5 filas HIP = sumo squat | La ruta es "familia sentadilla", no solo pistol |
| **SS** | **Sissy Squat** (NO shrimp) | sissy (parcial, assisted, W, OL), Hindu squat, ape reach, soleo squat, crab sissy, levitation squat | El shrimp vive en PS. 5 filas "SISSY SQ OL" cargadas sin ruta (A2) |
| **SU** | Step Up | PQ/PSU, lunge to step up, speed skater, step up box/side/shuffle, step down | PQ y PSU sin definir en el repo (PSU = pistol step-up: hipótesis) ⚑N |
| **QC** | **Quad Curl** | seiza up/down, seiza reach, seiza to squat, QC (parcial/full/assisted/W), quad box, tibiales en pared | No hay descripción en el repo (el borrador de progresiones lo marca "¿Quad/Seiza?"); `display_name` vacío ⚑N |
| **DS** | **Dragon Squat** | DS (parcial/full/W/jump/shuffle), DP, "Dragon HT" | Se lo conoce como sentadilla monopodal con la pierna libre por detrás; "DP" = dragon pistol (hipótesis) ⚑N |
| **HT** | Hip Thrust | hip thrust y puente (box, anillas, slide, OL, W), deadlift raised toes, "LOW BRIDGE" | `display_name` vacío; "LOW BRIDGE" aparece también en BRIDGE (A14); "L. on box" sin definir ⚑N |
| **NC** | Nordic Curl | **heterogénea:** nordic (bent, OL, assisted, full rom W) ≈20, deadlift, good morning, jefferson, horse stance, calf raises | `display_name` vacío; GM = good morning (inferido) |
| **REVERSE HYPER** | Reverse Hyper | RH full/half/str/tuck, OL, donkey kick | Categoría CORE POSTERIOR; abierta en piernas (inferido) |
| **HR** | **Espinales y side planks** (la etiqueta "Ham Raise" es incorrecta) | bote espinal, bote lateral, espinal cajón/Jefferson/torsión/A 1/360, side plank (supp/arch/elbow/twist) | **Conflicto:** TV/app/`route-labels.ts` dicen "Ham Raise"; `display_name` vacío; la sigla no está expandida en el repo. Se usa como movilidad previa de MN y FL. Nombre oficial: Franco ⚑N |
| **BRIDGE** | Bridge (puente de espalda / rueda; no el glute bridge) | shoulder/low/mid/full bridge, table, wall walk, twist, OL, cat-cow, seal | Secundaria "PULL" (A9) |
| **PIKE** | Pike | pike sentado/parado, jefferson curl, box pike, pancake W, windmill, head to toe, L-sit leg lifts | Reparte 4 categorías (20 HIP + 3 CORE + 4 SPAGAT + 1 MOVILIDAD) |
| **SPAGAT** | Spagat (split) | full/assisted (delta/omega), couch stretch, pigeon, warrior, gentleman, 90-90, quad stretch | "Delta/Omega" sin definir (hipótesis: tipos de asistencia) ⚑N |
| **SIDE PCK** | **Side Pancake** (TV/app; PCK = pancake) | pancake lateral (bent/straight, OL, W, twist, windmill, around the world) = oblicuos | **Conflicto:** `routes.display_name` dice "Side Pike Compression"; docs viejos "Patada lateral". El contenido es pancake lateral. Nombre oficial: Franco ⚑N |
| **AF** | Animal Flow | beast, crab, ape, scorpion, frogger, crow/frog, lizard, bear/duck walk, cossack walk | 66 ejercicios con ruta AF; el patrón FLOW tiene 67 filas (1 es HIP DOMINANT con ruta NC). Excluida del árbol |
| **FB** | Full Body | ninguno (la TV pinta las 15 zonas) | — |
| (sin ruta) | **PLYO** 36, **CARDIO** 44 (PLYO 31, COORDINATIVO 12, LUNGE 1), **KL** 19 (kettlebell, inferido) | saltos, burpee/mountain climber/skipping, swing/snatch/clean | 104 filas sin ruta; `route_pending` = 0 en todas (A1) |

**Siglas y sufijos de los nombres** (no hay glosario en api/admin/app; todo **inferido** salvo lo marcado):

| Sigla | Lectura unificada | Evidencia |
|---|---|---|
| BA / SA | Bent Arm / Straight Arm | `category_secondary`; `BA FL TUCK`, `PLPU SA STR TO BA FULL` (alta) |
| OA / OAC | One Arm / (c = chin-up, inferido) | rutas OAP/OAPU/OAR |
| OL / O.L | One Leg | `habilidad` OL en PS/SU/NC/L/HT/PL |
| W | Weighted (con lastre) | `habilidad` W en piernas |
| STR | Straddle | `WORD_ALIASES` de `route-progression-map.ts` |
| PB / P-BARS | Parallettes / paralelas | `position` |
| DF | Dragon Flag (en FL) | 30 filas de FL; **no confundir con DP** |
| DP | **Dos lecturas sin resolver:** dragon pistol (en DS) y 13 filas de FL con escalones de palanca (tuck…half layout) | ⚑N |
| LS, GM, ATW | Lunge/split squat, Good Morning, Around The World | nombres (inferido) |
| PL.UP / CH.UP / P.U | Pull-up / chin-up / push-up | catálogo (alta) |
| JUMP, PARCIAL, FULL ROM, ASSISTED/ASIST | pliométrico, rango, asistencia | nombres |
| ISO / EXC / CON | tipo de contracción dominante | columna `effort` |
| KL | Kettlebell (patrón) | nombres |
| **Sin resolver** (⚑N, §5.4) | DP, PQ, PSU, FR, PRE, MC, ICM, Yewkies, Hefesto, Elbow Victorian, caseta, "L." en HT, BOAT, Ariete, Zanetti, Inv Deadlift, delta/omega, HD/ID, HR, "hinge", "retracción to 90", SUPINE/PRONE, Russian/Korean/Bulgarian/Hungarian/impossible dips, "bote espinal", "espinal cajón/360/A 1" | — |

### 1.5 Rutas según su estrategia de progresión (dato del código, útil para el modelo)

`route-progression-map.ts` (fuente única de la progresión por ruta):
- **"token"** (escalones por palabra en position/nombre): FL, FLR, BL, PLPU, MN/RP, TTB, PL, REVERSE HYPER (palanca: TUCK → ADV TUCK → SUPER ADV → STRADDLE → HALF LAYOUT → FULL), OAP, OAPU, MU, HSPU, PHS, OAR, SIDE PCK.
- **"linear"** (por `dificultad_lineal`): HD/ID, PS, SU, NC, L, DS, SS, QC, HT.
- **"excluded"** (movilidad/skill, fuera del árbol de fuerza): SPAGAT, BRIDGE, PIKE, HS, AF, HR.
- Regla maestra: *un token que cambia asistencia/dificultad = escalón (Progression); misma dificultad con otra herramienta/forma = Habilidad (variante paralela).*

### 1.6 Anomalías de datos (lista accionable)

| # | Anomalía | Evidencia | Impacto en Anatomía |
|---|---|---|---|
| A1 | 104 ejercicios sin ruta; `route_pending=0` en todos | PLYO 36, CARDIO 44, KL 19, 5 SS mal cargados | Sin contenido heredable; decidir "sin mapeo" explícito o rutas nuevas (PLYO, KL) |
| A2 | 5 × "SISSY SQ OL..." sin ruta (son SS) y 2 × "DEEP LUNGE HEEL UP" sin patrón/categoría | queries §1.3 | Corregir en datos antes de heredar |
| A3 | `HR` etiquetada "Ham Raise" pero el contenido es espinales + side plank | route-labels ×3 vs ejercicios | Contenido incorrecto si se escribe por la etiqueta |
| A4 | Nombre oficial en conflicto: MN/RP (Manna / L-Sit), HD/ID (Fondos / Hefesto-Impossible Dips), SIDE PCK (Pike Compression / Pancake / Patada lateral), FLR (Row / Pull Ups), TTB (Toes To Bar / Toe to Bar) | `routes.display_name` vs `route-labels.ts` ×3 vs `100-02-SUMMARY.md` | Fijar nombre oficial |
| A5 | `routes.display_name` vacío en HR, HT, NC, QC | tabla `routes` | Idem |
| A6 | `route-labels.ts` triplicado (api, admin, app); `TvZonaMuscular` y `ZONA_ES` duplicados (api `types.ts`, admin `poll.ts`, `figuras.ts`) | git grep | Riesgo de deriva; fuente única futura |
| A7 | Rutas heterogéneas: FL (DF/Victorian/Press/Boat), NC (peso muerto/calf raises/horse stance), TTB (core colgado/colgadas a un brazo), PIKE (4 categorías) | exercise_2 por ruta | Herencia por ruta falla sin nivel "gesto" |
| A8 | Rutas repartidas en 2–4 categorías: FL 4, PIKE 4, TTB 2, PS 2, SU 2, QC 2 | árbol §1.2 | La herencia categoría→ruta no es un árbol limpio |
| A9 | `category_secondary` caótica: 34 valores + 51 vacíos; "GLUTE"/"GLUTES"; "LUNGES"/"SQUAT"/"DQ"; "PUSH HORIZONTAL (STRAIGHT ARM)" vs "PUSH HORIZONTAL ANTERIOR (STRAIGHT ARM)"; BRIDGE=“PULL”; SIDE PCK="LOWER POSTERIOR" | query secundaria | `muscle-zones.ts` mapea con "contiene" sobre este texto; fuente de errores |
| A10 | Categoría "CORE" usada para filas de HS, MN/RP, PIKE, AF; "CORE ANTERIOR" dentro del patrón PULL (FL 11); "MOVILIDAD" como categoría dentro de PUSH y LOWER | árbol | Categoría ≠ complejo consistente |
| A11 | `effort` vacío en 28,5 % (piernas, AF, HS, SPAGAT): el tipo de contracción no se puede derivar de datos | query efforts | Contracción por fase debe cargarse en el modelo nuevo |
| A12 | `equipment` casi vacío (5 filas); equipamiento real en `position`/`habilidad` (RINGS, P-BARS, WALL, BOX, RACK) | columnas | Anatomía por implemento no inferible |
| A13 | 188 nombres con doble espacio; 27 grupos ruta+nombre duplicados por espacios/puntos ("O.L" vs "OL"); 219 grupos con la misma (ruta, nombre, position) repetidos por distinto `effort` | queries | Una fila = movimiento × contracción; contar ejercicios por NOMBRE, no por fila (1.283 nombres vs 1.546 filas) |
| A14 | HT contiene "LOW BRIDGE…", BRIDGE contiene "LOW BRIDGE": mismo nombre, rutas distintas | nombres | Posible mapeo cruzado |
| A15 | BL sin `exercise_2` (49 vacíos) | query | Agrupación por gesto inexistente en BL |
| A16 | `VALIDATION-RESULTS.md` (api/sessions/validation) describe rutas con significados incorrectos ("FL: Flexibility/Mobility", "PS: Push Specific") | doc | **No usar como diccionario** |
| A17 | Rutas de la tabla `routes` con `code` unique GLOBAL (no `(tenant_id, code)`) | schema | Un segundo tenant no puede reutilizar códigos; las rutas son método de El Templo |
| A18 | Solo 12 `video_url` en `exercises` (los videos viven en otra parte: `videoKey` de prescripciones) | query | No se puede enlazar anatomía→video desde `exercises` sin esa tabla |

### 1.7 Mapeo actual de la TV (`muscle-zones.ts`)

#### 1.7.1 Cómo funciona `muscle-zones.ts`

Módulo puro (sin DB). Tres tablas de datos, todas con normalización `trim().toUpperCase()` y colapso de espacios:

1. `CATEGORY_ZONAS` — match exacto de `category` → 1 a 3 zonas (p. ej. `PUSH HORIZONTAL → chest, triceps, deltoids`; `PULL VERTICAL → upper-back, biceps, forearm`; `HIP DOMINANT → gluteal, hamstring, lower-back`; `KNEE DOMINANT/LUNGE → quadriceps, gluteal, adductors`).
2. `SECONDARY_ZONAS` — `category_secondary` por **"contiene"**, se suma todo (`STRAIGHT ARM → abs`, `QUADS`, `ISQUIOS`, `GLUTES`, `ABS`, `ESPINALES → lower-back`, `LOWER POSTERIOR → hamstring, gluteal`, `PIKE → hamstring, abs`...).
3. `ROUTE_ZONAS` — solo `TTB → abs, obliques` y `MN/RP → abs, triceps`.

`zonasDeEjercicio` = unión. `zonasDelGrupo` (el que usa la TV) cuenta cuántos ejercicios del grupo tocan cada zona y deja las que alcanzan ≥ 40 % de la zona más frecuente (`UMBRAL_DOMINANCIA = 0.4`); si queda vacío y el rol es ROM_*, cae a `ROM_ROLE_ZONAS`. La ruta `FB` pinta las 15 zonas.

**Quién lo consume** (git grep sobre origin/master):
- `el-templo-api/src/modules/tv/recorrido.ts` (única llamada de producción: `zonasDelGrupo`, `ZONAS_ORDEN`) → arma `TvRecorridoBloque.zonas` en el poll de la TV.
- `class-day.ts` trae `exerciseCategory / exerciseCategorySecondary / exerciseRoute` por prescripción solo para esto.
- `test/tv/tv-muscle-zones.test.ts` (contrato de la tabla).
- Del lado del front: `el-templo-admin/src/tv/poll.ts` (copia del tipo `TvZonaMuscular`), `recorrido/figuras.ts` (`ZONA_ES` = rótulos en español, `svgBloque`, `puntosDeZonas`) y `recorrido/index.ts`. **No hay otro consumidor** (ni app, ni reportes).

#### 1.7.2 Dónde es impreciso (corrida real con los datos locales)

Salida de `zonasDelGrupo` aplicada a TODOS los ejercicios de cada ruta (simula lo que pintaría un bloque que usara solo esa ruta):

| Ruta | Zonas dominantes hoy | Problema (hipótesis; ver las contradicciones en §1.8 y el análisis del §2) |
|---|---|---|
| BL | chest, deltoids, triceps, abs | Idéntica a PL (lo que sí es cierto: no distingue las dos rutas). La hipótesis original de que mandar BL a "empuje" era un error **queda sin sustento** según el análisis del §2 (S4.1 y S3.3: la gravedad hiperextiende el hombro y lo sostienen flexores); a confirmar con Nacho ⚑N; ver C3 en §1.8 |
| PL | chest, deltoids, triceps, abs | Mismas zonas que BL y que OAPU/HD-ID salvo `abs`; no distingue estático SAS vs dinámico BAS |
| MN/RP (L-sit) | deltoids, triceps, biceps, trapezius, upper-back, abs | La categoría PULL HORIZONTAL aporta bíceps/dorsal/trapecio; su gesto (SAS, depresión/flexión de cadera) no parece tracción, pero el §2 (S3.3) propone que está en PULL porque el motor del hombro son los extensores (ver C2 en §1.8; a confirmar con Nacho) |
| TTB | biceps, forearm, upper-back, abs, obliques | Categoría PULL VERTICAL pinta dorsal/bíceps; falta lo que da nombre a la ruta (flexores de cadera, sin región en el dibujo) |
| FL | deltoids, biceps, trapezius, upper-back, abs | Mezcla de dragon flag + palanca + press; la tabla no tiene los flexores de cadera, que según el §2 (S3.1 y S6.1) son los que sostienen las piernas en FL y dragon flag; la hipótesis original de que falta cadena posterior queda corregida (ver C4 en §1.8) |
| SS | gluteal, quadriceps, adductors | Sissy squat: el foco es cuádriceps/rodilla; glúteo y aductores son categoría genérica KNEE DOMINANT |
| QC | gluteal, quadriceps, adductors | Idem; "TIBIALES PARED" necesita `tibialis` (slug existe en el dibujo, no en la TV) |
| PS / SU / L | gluteal, quadriceps, adductors (+ lower-back, hamstring por filas HIP DOMINANT) | No distingue pistol (control de cadera/tobillo) de lunge |
| NC | lower-back, gluteal, hamstring | **Sin gemelos** aunque tiene CALF RISES; "NC puro" es isquios |
| SIDE PCK | abs, obliques, gluteal, hamstring | gluteal/hamstring vienen de la secundaria "LOWER POSTERIOR", que aquí es un error de carga |
| HS | deltoids, triceps, trapezius, abs | Skill de equilibrio; `abs` viene de "STRAIGHT ARM" por "contiene" |
| BRIDGE | deltoids, lower-back, gluteal | Hombro en flexión + columna + cadera: no hay forma de mostrar dos articulaciones |
| HR | lower-back, abs, obliques, gluteal | Funciona por casualidad (el contenido es espinal/oblicuo) pero la ruta se llama "Ham Raise" |
| Sin ruta (PLYO/CARDIO/KL) | gluteal, quadriceps, calves (solo por categoría PLYO/POTENCIA) | KL (kettlebell) no tiene mapeo |
| **Todas** | `calves` solo aparece en PLYO/POTENCIA | Gemelos/sóleo ausentes de toda la fuerza de piernas |

Límites estructurales de la tabla actual:
- **Granularidad de categoría**, no de ejercicio ni de gesto: dos ejercicios de la misma ruta con músculos distintos (DF vs FL press, NC vs calf raise) pintan igual.
- **Sin rol**: motor, sinergista y estabilizador pesan lo mismo (solo el conteo de ejercicios define dominancia).
- **Sin fase ni tipo de contracción**.
- **"Contiene" sobre texto libre** = frágil ante errores A9 (ya generó SIDE PCK, HS).
- **Un solo nivel de detalle** (15 zonas): no sirve para enseñar anatomía.

### 1.8 Contradicciones entre partes y cómo quedaron

| # | Tema | Qué decía cada parte | Estado |
|---|---|---|---|
| C1 | **HR** | Parte 1: la TV/app/docs la llaman "Ham Raise" pero sus 18 ejercicios son espinales y side planks. Parte 2: contenido = espinales, sigla sin expandir. Parte 3: no la analiza. | Coinciden en el contenido; **nombre oficial sin resolver** (Franco ⚑N). |
| C2 | **MN/RP: ¿por qué "PULL"?** | Parte 1 (§1.7.2): "su gesto (SAS, depresión/flexión de cadera) no es tracción". Parte 2 + R2-33: la DB la pone en PULL porque el motor del hombro son los extensores (dorsal, deltoides posterior, tríceps CL), como en FL y rows. | **La parte 2 prevalece** como hipótesis; confirmar criterio de la DB con Nacho ⚑N. |
| C3 | **BL: ¿error de mapeo a "empuje"?** | Parte 1 la marcaba como "candidato fuerte a error" (gesto de colgado/extensión de hombro). Parte 2 + R2-33: BL está en PUSH porque la gravedad hiperextiende el hombro y lo sostienen **flexores** (deltoides anterior, pectoral, bíceps). | La hipótesis de la parte 1 **queda sin sustento según la parte 2** (BL = PUSH es coherente; a confirmar con Nacho ⚑N). Lo que sí es cierto: hoy BL y PL pintan las mismas zonas (§1.7.2). |
| C4 | **FL: "sin glúteos/cadena posterior"** | Parte 1 sugería que a FL le falta cadena posterior. Parte 2 original le asignaba el sostén de las piernas a la cadena posterior. R2-2/R2-4 lo corrigen: boca arriba sostienen **flexores de cadera + abdomen**. | Corregido: lo que falta en el mapa de FL son los flexores de cadera (sin región en el dibujo). |
| C5 | **SIDE PCK** | Parte 1: DB = "Side Pike Compression", TV/app = "Side Pancake". Parte 3: `route-labels.ts` = Side Pancake, PCK = pancake. | Sin resolver (⚑N); el análisis se hizo sobre pancake lateral porque eso es el contenido. |
| C6 | **DP** | Parte 1: dragon pistol (en DS) y "sin resolver" en FL. Parte 2: ¿"dragon pull"? sin confirmar. Parte 3: dragon pistol (hipótesis). | Sin resolver; posiblemente **dos significados distintos** (⚑N). |
| C7 | **ICM / Yewkies / Boat** | Parte 1: sin resolver. Parte 2: ICM = Ice Cream Maker (confianza baja); boat tratado como core anterior isométrico. | Sin resolver (⚑N). |
| C8 | **AF: 66 vs 67 filas** | Parte 1: AF 66 + 1 fila HIP DOMINANT con ruta NC = 67 del patrón FLOW. Parte 3 escribe "AF (67)". | Resuelto: 66 con ruta AF; 67 es el patrón FLOW. |
| C9 | **PLYO/KL: conteos** | Parte 1: PLYO 36 + CARDIO/PLYO 31; KL 19 sin desglose. Parte 3 menciona 2 filas KL/PLYO. | Pendiente de un SELECT; no cambia el análisis. |
| C10 | **Jefferson curl en dos rutas** | Parte 2 lo trata en HR/CORE POSTERIOR (flexión-relajación, creep); Parte 3 en NC/PIKE (modelo porcino). | Complementarios, no contradictorios; las precauciones se unificaron en §3 (c). |
| C11 | **Conteos de las revisiones** | R3 declara 40 hallazgos (7/12/21) pero la tabla trae 41 numerados (7/12/22). | Se registran los 41 (Apéndice B). |
| C12 | **L-sit en tres rutas** | Aparece en MN/RP (L-sit/V-sit), en OAP ("L SIT PL.UP") y en PIKE ("L-sit leg lifts"). | No es contradicción; el análisis del L-sit de MN/RP (S3.3) y el de flexores de cadera activos de PIKE (C4) son complementarios. |

### 1.9 Cómo se obtuvieron los números (parte 1)

- Conexión: `mysql2` con `DB_*` de `el-templo-api/.env` (sin imprimir credenciales), solo SELECTs. Scripts: `scratchpad/scripts/q.cjs`, `ex.cjs`, `1.sql … 7.sql`, `mz/run.mts` (aplica `zonasDelGrupo` de origin/master a cada ruta con Node `--experimental-strip-types`).
- Ejemplos por ruta: 8 puntos equiespaciados de la lista ordenada por `dificultad_lineal, progression_step, id` (por eso aparecen nombres repetidos con distinto `effort`).
- `exercise_2` fue interpretado como "nombre base sin posición"; se verificó con FL (`DF`, `DF SA`, `ELBOW VICTORIAN`...).
- Datos de la librería de dibujo (slugs, `abductors`, `side`): README de `HichamELBSI/react-native-body-highlighter` (consulta web, 2026-10-21) y el JSON embebido. La existencia de `abductors` en la librería y su ausencia en el JSON embebido **no se profundizó** (no hay `node_modules` de la librería en el repo).
- Todo lo marcado "(inferido)" son deducciones por nombres/patrones, no confirmaciones de profes.

## 2. Análisis articular por complejo y por ruta

Cada ruta sigue el mismo esquema: **1. Fases · 2. Análisis articular (articulación, acción y plano, músculos y rol, contracción por fase) · 3. Por qué progresa · 4. Dónde se siente / compensaciones · 5. Cues · 6. Banderas de la ruta.** La base común de cada tren se escribe una sola vez (BS1–BS6 y BI1–BI6) y las rutas la referencian. Las tablas de síntesis músculo → rutas (S8 y TI-H) y los resúmenes de evidencia débil (S7 y TI-I) están al final de cada tren. Todo el contenido está en estado **borrador revisado por agente kinesiólogo**; las correcciones aplicadas están marcadas `[R]` y listadas en el Apéndice B.

### 2.1 Tren superior y core (PULL VERTICAL, PULL HORIZONTAL, PUSH HORIZONTAL, PUSH VERTICAL, CORE)

#### BS. Base común del tren superior y core (las rutas la referencian como BS1…BS6)

##### BS1. Complejo del hombro: quién hace qué

- El "hombro" son cuatro articulaciones (glenohumeral GH, escapulotorácica ST, acromioclavicular AC, esternoclavicular EC). La ST no es una articulación anatómica: es un deslizamiento funcional de la escápula sobre el tórax [L1][L2].
- **Ritmo escapulohumeral**: al elevar el brazo la escápula rota hacia arriba, disminuye su rotación interna y pasa de inclinación anterior a posterior. En 25 sujetos asintomáticos medidos a 0°, 90° y 140° de elevación humeral en el plano escapular, la escápula mostró rotación hacia arriba progresiva, menor rotación interna y paso de inclinación anterior a posterior, y la actividad EMG de trapecio superior e inferior, elevador de la escápula y serrato anterior aumentó con el ángulo (excepto trapecio inferior entre 90° y 140°) [10]. La relación clásica "2:1 GH:ST" es la cifra de libro [L1][L2] (no la verifiqué). La revisión aclara que es una simplificación: el ritmo no es constante a lo largo del arco [R].
- **Pares de fuerza**: la rotación escapular hacia arriba la hacen trapecio superior + inferior + serrato anterior [L1]. En pacientes con patología de hombro se describe menor activación de serrato anterior y mayor de trapecio superior [11]. Cools et al. usan precisamente razones UT/SA, UT/LT, UT/MT como criterio de "buen equilibrio escapular" [16].
- **Protracción/retracción** (abducción/aducción escapular, o rotación interna/externa de la escápula según el autor): protracción = serrato anterior (+ pectoral menor); retracción = romboides + trapecio medio [L1]. En el pull-up estricto la escápula recorre ~22° de pro/retracción con agarre al frente, ~10° con agarre ancho y ~17° con agarre invertido [1].
- **Depresión/elevación**: depresión = trapecio inferior, dorsal ancho (vía húmero, en cadena cerrada), pectoral menor, fibras inferiores del serrato anterior y subclavio (este último sobre la clavícula); elevación = trapecio superior, elevador de la escápula [L1].
- **Manguito rotador**: supraespinoso, infraespinoso, redondo menor, subescapular. Función: centrar la cabeza humeral (compresión dinámica) y rotar [L1]. En el pull-up/chin-up el infraespinoso trabajó 71–79 % MVIC [3] (lo interpreto como estabilizador/rotador externo, **interpretación mía**; el abstract solo reporta el %).
- **Dorsal ancho / redondo mayor / pectoral mayor (esternal)**: extensores/aductores/rotadores internos de GH desde posición flexionada [L1]. Nota fisiológica clásica: el pectoral mayor invierte su acción según el ángulo (extensor desde flexión hasta neutro, flexor desde hiperextensión) [L1] — importa en dips y planche.
- **Escapulotorácica y "discinesia"**: alteraciones cinemáticas escapulares se asocian a lo que la literatura llama pinzamiento subacromial (término de los estudios; no se le dice al alumno): meta-análisis con menor rotación hacia arriba y rotación externa de la escápula, mayor elevación y retracción **de la clavícula**, y sin diferencia global en la inclinación posterior; los efectos cambian según el plano, el ángulo de elevación y la población [12]. Pero "discinesia escapular" es un **hallazgo/deficiencia, no un diagnóstico**, y la literatura se contradice sobre su relevancia clínica [33]. En los apuntes: usarlo como pista de control motor, no como etiqueta.

##### BS2. Codo y antebrazo

- Flexores: bíceps braquial (flexor + supinador; la cabeza larga cruza GH), braquial anterior (flexor puro), braquiorradial (flexor con antebrazo neutro) [L1]. Extensores: tríceps (la cabeza larga cruza GH y es también extensor/aductor de hombro), ancóneo [L1].
- En chin-up (supino) vs pull-up (prono): Youdas encontró **mayor** activación de pectoral mayor y bíceps en chin-up y mayor trapecio inferior en pull-up, y no reporta diferencias en dorsal ancho (117–130 % MVIC en los tres ejercicios) [3]. Dickie, en cambio, midiendo repeticiones completas, encontró activación pico y media **similares** entre agarres para ocho músculos salvo trapecio medio (mayor con pronado vs neutro: 60,1 ± 22,5 vs 37,1 ± 13,1 %MVIC pico) [2]. **Evidencia contradictoria sobre el bíceps**: distintas muestras, normalización y definición de fase; no hay consenso EMG fuerte.
- En el pull-up, el EMG medio fue mayor en la fase concéntrica que en la excéntrica para braquiorradial, bíceps y pectoral mayor (P < 0,01) [2].

##### BS3. Muñeca en carga

- En soporte (push-up, dips, planche, HS) la muñeca queda en extensión alta; los flexores/extensores de muñeca y de dedos regulan la presión (ajuste fino de equilibrio) [L1].
- En la vertical, la "estrategia de muñeca" (corregir el equilibrio con presión de dedos/palma) es la estrategia primaria; si falla, se pasa a una estrategia mixta con hombros, caderas y codos; cerrar los ojos y flexionar el cuello empeoran la estabilidad [7]. En gimnastas jóvenes y adultos, los flexores de muñeca tuvieron la mayor actividad relativa de todos los grupos medidos (media 60 %, pico 200 %) [6].
- Apoyo en barras/anillas redujo el EMG de flexores de muñeca vs suelo (44 % y 46 % vs 61 %) sin cambiar el tríceps [5].
- En gimnastas en crecimiento existe una lesión de la zona de crecimiento del radio distal por carga repetida (la literatura la llama "gymnast wrist"; término de uso interno) [31].

##### BS4. Brazo recto (SAS) vs brazo flexionado (BAS)

- **SAS**: codo extendido, la carga se transmite por la cadena brazo-escápula-tronco; el momento de la gravedad sobre el hombro se resiste **sin generar torque con flexión de codo**. Los músculos del codo trabajan mayormente de forma **isométrica estabilizadora** (consenso de coaching + anatomía [L1]). En SAS el bíceps trabaja isométrico para proteger el codo. Su cabeza larga queda **más estirada y cargada** cuando el hombro está en extensión con el codo recto (back lever, German hang, reverse planche/manna, fondos profundos, transición del muscle-up). En el planche trabaja como flexor activo de hombro. En el FL la carga se siente más en el pliegue del codo [R].
- **BAS**: el torque se produce con flexión/extensión de codo además del hombro; hay más recorrido y trabajo muscular concéntrico/excéntrico.
- **Por qué importa (lo que la evidencia sí dice)**:
  - En planche (soporte "support scale") el bíceps y el pectoral mostraron diferencias grandes entre la habilidad y sus ejercicios preparatorios; también cambiaron la coactivación bíceps/tríceps y serrato/trapecio (n = 7 gimnastas de anillas de alto nivel) [4]. → la habilidad completa **no** se reproduce con sus progresiones.
  - En la cruz de hierro, PM y bíceps fueron los músculos más sensibles a la situación de carga [21].
  - En 26 gimnastas de alto nivel operados de hombro (30 hombros), en 27 hombros (90 %) el mecanismo fue tracción del brazo en flexión-rotación forzada con las manos fijas en barra/anillas (el mismo abstract señala que la subluxación inferior voluntaria forma parte del entrenamiento de algunos gimnastas); las lesiones "dolorosas" eran mayormente de manguito superior y anclaje del bíceps [18]; 8 de 26 hombros requirieron cirugía por lesión del anclaje del bíceps (tenodesis) y 4 por lesión del rodete (SLAP) [19].
  - Street workout (n = 93): 62,4 % reportó lesión en 12 meses; la tendinopatía fue el diagnóstico más frecuente (31 % de los lesionados); el hombro (23 %) y la espalda alta/media (18,4 %) las zonas más lesionadas [20]. Es encuesta, no mide causa.
- **"Adaptación más lenta del tejido conectivo"**: la afirmación es consenso de coaching [L3]. El meta-análisis de adaptación tendinosa muestra que los tendones sí responden a carga (rigidez SMD 0,70) y que la **magnitud de la carga** importa más que el tipo de contracción, pero incluye solo tendón de Aquiles y rotuliano, no bíceps ni tendón del manguito [22]. **No hay evidencia directa** de que el bíceps proximal adapte más lento que el músculo en SAS; es extrapolación razonable. Regla práctica de progresión: aumentar exposición de a poco y respetar dolor tendinoso (ver banderas).

##### BS5. Core como transmisor

- Definición operativa: control de la posición y movimiento del tronco sobre la pelvis para producir, transferir y controlar fuerza hacia el segmento distal [27]. En calistenia el tronco rígido es lo que permite que el torque del hombro se transmita a las piernas (palancas).
- **Anti-extensión / hollow (inclinación pélvica posterior + costillas abajo)**: en las palancas, lo que "cae" son las piernas y la pelvis. **Boca arriba** (front lever, dragon flag, boat, reverse planche) caen hacia la espalda: la gravedad tiende a **extender** cadera y zona lumbar, y lo frenan el abdomen (recto abdominal, oblicuos) y los **flexores de cadera** (iliopsoas, recto femoral). **Boca abajo** (planche, planche push-up, back lever) caen hacia el pecho: la gravedad tiende a **flexionar** cadera y columna, y lo frenan **glúteo mayor, isquiotibiales y erectores espinales**. En ese caso el abdomen no sostiene las piernas: controla que la cadena posterior no se pase y arquee la zona lumbar ("banana") (derivación mecánica estándar; concepto de anti-extensión: [L4]) [R]. En EMG: roll-out y pike sobre pelota fueron los ejercicios que más activaron recto abdominal superior/inferior y oblicuos (p. ej. roll-out RA superior 63 %, pike OE 84 % MVIC) con paraespinales lumbares < 10 % MVIC en todos [24].

Resumen de quién sostiene las piernas según la orientación (consecuencia directa de la corrección R2-1; vale para toda la base común):

| Orientación del cuerpo | Palancas | Piernas y pelvis "caen" hacia | La gravedad tiende a... | Lo frenan |
|---|---|---|---|---|
| **Boca arriba** | FL, dragon flag, boat, reverse planche (apoyo libre) | la espalda | **extender** cadera y zona lumbar | Abdomen (recto abdominal, oblicuos) y **flexores de cadera** (iliopsoas, recto femoral); el glúteo solo co-contrae para la retroversión |
| **Boca abajo** | Planche, PLPU, back lever | el pecho | **flexionar** cadera y columna | **Glúteo mayor, isquiotibiales y erectores**; el abdomen controla que no se arquee la zona lumbar |

- Cadena cerrada con las manos fijas: la secuencia de activación se organiza desde el punto fijo (manos) hacia el segmento móvil (en 16 gimnastas, 18 elementos; en movimientos de aceleración, no en sostenes) [34]. Idea útil (por extrapolación: el estudio no midió sostenes) para explicar por qué en el hang/soporte el tronco "responde" a la escápula.
- Evidencia asociativa (no causal): atletas "overhead" con discinesia escapular mostraron menor resistencia (McGill) y menor activación de erectores, multífidos, glúteo medio, recto abdominal, TrA/OI y serrato en plancha y push-up (n = 30 mujeres, transversal) [36].

##### BS6. Cómo es el "momento de fuerza" en las palancas [M]

En FL, BL, planche, dragon flag, L-sit, etc., el momento de la gravedad sobre la articulación de apoyo es aprox. peso × distancia horizontal entre el eje (hombro) y el centro de masa. Todas las progresiones tuck → adv tuck → straddle → full "mueven" ese centro de masa hacia afuera (o acercan/alejan el hombro del apoyo). Es física básica; **no es una fuente**. Los porcentajes de distribución de masa corporal no se citan aquí porque no los verifiqué.

#### S2. PULL VERTICAL

##### S2.1 FL (ruta, categoría PULL VERTICAL: hang pasivo / hang activo / retracción escapular / retracción "to 90")

El análisis completo del front lever está en S3.1. Esta sección cubre solo lo que el catálogo ubica en PULL VERTICAL (la base de colgado).

**1. Fases**
- Hang pasivo: colgado, escápulas elevadas y rotadas hacia arriba, hombros en flexión máxima.
- Hang activo: depresión escapular sin flexionar codos.
- Retracción escapular vertical: "pull-up escapular" (depresión + retracción con brazos rectos).
- Retracción "to 90": el catálogo no la define; probablemente un arrastre del cuerpo hacia ~90° con brazos rectos (a confirmar con el profe).

**2. Análisis articular**

| Articulación | Acción y plano | Músculos y rol | Contracción por fase |
|---|---|---|---|
| ST | Hang pasivo: elevación + rotación hacia arriba; activo: depresión (plano frontal/escapular) | Trapecio inferior, dorsal ancho (en cadena cerrada), pectoral menor = M de la depresión; trapecio superior/elevador = Ant; serrato = Est [L1] | Pasivo: la mayor parte de la carga la toman cápsula y ligamentos, con actividad muscular baja (agarre y algo de manguito); en personas con hombros muy laxos o con antecedente de luxación, preferir el colgado activo ⚑H [R]; activo: C al deprimir, luego I |
| GH | Flexión ~180° mantenida; en el "to 90" extensión desde flexión (sagital) | Dorsal ancho, redondo mayor, deltoides posterior = M; manguito = Est [L1] | Pasivo: —; to 90: C; vuelta: E |
| Codo | Extendido | Bíceps/braquial/braquiorradial = Est isométrico (SAS, ver BS4); tríceps = co-contracción (bloquea el codo; su cabeza larga además ayuda a extender el hombro) | I |
| Muñeca/mano | Agarre | Flexores de dedos/antebrazo = M del agarre | I |

**3. Por qué progresa**: pasivo → activo (agrega control escapular) → retracción con arrastre (agrega torque de extensión de hombro por inclinación del cuerpo). La variable es la **cantidad de carga transferida a músculo vs a estructuras pasivas** y el brazo de palanca del cuerpo respecto del hombro [M].

**4. Dónde se siente / compensaciones**: se siente en dorsal y trapecio inferior; en el pasivo, "cuelga" de los hombros. Compensaciones: encoger hombros (trapecio superior dominante), flexionar codos, balancear; costillas abiertas con lumbar en extensión.

**5. Cues**: "alejá los hombros de las orejas sin doblar los codos"; "empujá la barra hacia abajo" (depresión); "costillas hacia la cadera" (anti-extensión).

**6. Banderas de la ruta** (señales observables; además las transversales de la sección 3): dolor profundo anterior o lateral de hombro que aparece al colgarse pasivo; hormigueo o adormecimiento que baja por el brazo al colgarse; sensación de "salida" o inestabilidad del hombro al colgar (en gimnastas la tracción con manos fijas es el mecanismo dominante en lesiones quirúrgicas [18]).

##### S2.2 MU — Muscle Up (barra / anillas, estricto / kipping, falso agarre)

**Evidencia directa (una sola, n = 10 hombres activos):** en anillas el muscle-up exige más trapecio superior, bíceps y flexores de antebrazo en el tirón, y más tríceps y bíceps en el empuje, que en barra; los estabilizadores del hombro no cambiaron; los autores sugieren aprender primero en barra [37] (señalada por la revisión, leída solo por el revisor; ver Apéndice A). El resto del análisis es anatomía funcional [L1] + consenso de coaching [L3].

**1. Fases**
1. Colgado con falso agarre (muñeca flexionada sobre el aro/barra).
2. Tirón explosivo ("high pull"): extensión de hombro + flexión de codo, aro/barra llega a esternón/abdomen.
3. **Transición**: el cuerpo pasa de debajo a encima del agarre; codos van hacia atrás y luego adelante; hombros pasan por delante de las manos.
4. Empuje (dip) hasta soporte con brazos extendidos.
5. Descenso controlado (inversa).

**2. Análisis articular**

| Articulación | Acción y plano | Músculos y rol | Contracción por fase |
|---|---|---|---|
| ST | Tirón: depresión + retracción + rotación hacia abajo; transición: protracción + inclinación anterior; soporte: depresión + protracción moderada | Trapecio inferior/medio, romboides (tirón) = M; serrato anterior, pectoral menor (transición y soporte) = M/S; trapecio superior = Est [L1] | Tirón: C; transición: C del serrato; soporte: I |
| GH | Tirón: extensión (y aducción si el agarre es ancho) desde flexión máxima. Transición: el tronco pasa por encima de las manos y el hombro va hacia **extensión máxima + rotación interna** (es el punto de mayor estrés anterior). Empuje: **flexión de hombro desde hiperextensión** hasta neutro, junto con extensión de codo | Tirón: dorsal ancho, redondo mayor, pectoral mayor esternal, deltoides posterior. Empuje: pectoral mayor, deltoides anterior, tríceps. Manguito = Est [L1] [R] | Tirón: C; transición: E→I en el punto bajo; empuje: C; descenso: E |
| Codo | Flexión intensa (tirón) → extensión (empuje) | Bíceps, braquial, braquiorradial (tirón) = M; tríceps (empuje) = M [L1][2] | Tirón: C; empuje: C; descenso: E (el EMG medio concéntrico fue mayor que el excéntrico para BR/bíceps/pectoral en pull-up [2]) |
| Muñeca | Falso agarre: flexión con desviación cubital sostenida (la desviación no está confirmada ⚑H) | Flexores de muñeca/dedos = M isométrico [C] | I durante todo el elemento |
| Columna/cadera | Kipping: extensión → flexión de cadera ("swing"); estricto: hollow rígido | Glúteo/isquiotibiales (fase de arco) y iliopsoas/recto femoral + abdomen (golpe de cadera); RA/OE (hollow) [L1] | C en kip; I en estricto |

Nota de evidencia sobre el tirón: en pull-ups, la secuencia de pico de activación empezó por trapecio inferior y pectoral mayor y terminó con bíceps y dorsal ancho [3] (es pull-up estricto, no MU).

**3. Por qué progresa**: la variable es **cuánta energía viene del cuerpo (kip) vs del músculo**, la altura que debe alcanzar el tirón antes de la transición y la inestabilidad (las anillas se mueven; con barra el recorrido es fijo). Escalones del catálogo: transición asistida, kipping, estricto, lento, ancho, archer, lastrado. El "slow" alarga el tiempo bajo tensión en el punto de transición (el punto de menor ventaja mecánica) [M].

**4. Dónde se siente / compensaciones**
- "Chicken wing": un codo se adelanta/abre y el otro se retrasa en la transición → compensa déficit de fuerza/movilidad de un hombro [C].
- Tirón bajo (no llegan al esternón) → la transición exige más desde un ángulo débil.
- Pérdida del falso agarre; abrir muñeca; "chicken wing" con un codo muy flexionado.
- Hombros encogidos en la salida (trapecio superior) en vez de depresión.

**5. Cues**: "tirá hacia las caderas, no hacia arriba"; "codos pegados y juntos al pasar"; "llevá los hombros por encima de las manos"; "pasá rápido y controlado por el punto bajo: bajá solo hasta donde puedas empujar sin que el hombro se vaya hacia adelante".

**6. Banderas de la ruta** (señales observables; además las transversales de la sección 3): dolor anterior de hombro o "chasquido" doloroso en la transición (los autores de [1] señalan mayor riesgo de lo que ellos llaman pinzamiento subacromial (término del estudio; no se le dice al alumno) con agarres anchos y movimientos dinámicos tipo kipping, por elevación alta del brazo y reducción del espacio subacromial; eso es inferencia de cinemática en 11 hombres sanos, no lesiones medidas); dolor medial/lateral de codo con la transición; dolor en el pliegue anterior del codo con debilidad para girar la palma hacia arriba; dolor en cara palmar de muñeca con falso agarre; hormigueo en mano.

##### S2.3 OAP — One Arm Pull Up (y chin-up a una mano, OAC)

**No encontré EMG de pull-up a una mano.** Se extrapola de pull-up bilateral [2][3] + anatomía [L1].

**1. Fases**: colgado (con control de rotación del tronco) → iniciación escapular → tirón (concéntrico) → arriba → descenso controlado (excéntrico).

**2. Análisis articular**

| Articulación | Acción y plano | Músculos y rol | Contracción por fase |
|---|---|---|---|
| ST (lado de trabajo) | Depresión + rotación hacia abajo con ligera retracción | Trapecio inferior, dorsal ancho, romboides = M/S; serrato = Est [L1] | Iniciación: C; tirón: C; descenso: E |
| GH | Extensión/aducción (plano frontal/escapular) | Dorsal ancho (en pull-up bilateral 117–130 % MVIC [3]), redondo mayor, pectoral mayor = M; infraespinoso 71–79 % MVIC como Est [3] | C → I arriba → E |
| Codo | Flexión | Bíceps (mayor en chin-up vs pull-up [3]), braquial, braquiorradial [2] | C / I / E |
| Tronco | **Anti-rotación y anti-inclinación lateral** (la carga está de un lado) | Oblicuos, cuadrado lumbar, erectores = Est [L1] (anti-rotación: anatomía, sin EMG directa) | I |
| Muñeca/dedos | Agarre unilateral | Flexores de dedos = M | I |

**3. Por qué progresa**: la variable es **el porcentaje del peso que carga el brazo de trabajo**. Asistido con dedos / con la otra mano / archer (el brazo extendido actúa de apoyo y la carga se reparte) → typewriter → un brazo completo → OAP lastrado. Es palanca y reparto de carga (derivación mecánica; ver nombres del catálogo). El texto completo de [1] recomienda las dominadas frontales asistidas para los más débiles (dato útil que el documento original no usaba; señalado por la revisión).

**4. Compensaciones**: rotación y balanceo del tronco, hombro encogido, cuello adelantado, codo del brazo de trabajo que cae hacia afuera, mano libre "ayuda" sin querer.

**5. Cues**: "hombro lejos de la oreja antes de tirar"; "pecho hacia la barra"; "costillas y pelvis alineadas, no dejes que el tronco gire".

**6. Banderas de la ruta** (señales observables; además las transversales de la sección 3): dolor en el pliegue anterior del codo o debilidad al girar la palma hacia arriba (nota interna: zona del tendón distal del bíceps); dolor medial/lateral de codo (sobrecarga de tendones del antebrazo); dolor de hombro en la parte baja del tirón (en la fase colgada con agarre invertido el húmero está en rotación externa extrema y se desvía hasta 42° del plano escapular [1], lo que los autores asocian a más riesgo subacromial; el agarre al frente se desvía hasta 28° [1]).

##### S2.4 TTB — Toes To Bar (variantes pike, windshield, ATW, L a V)

Evidencia directa: en 14 varones, el hanging straight leg raise produjo la mayor exigencia abdominal (RA > 130 % MVC, OE 88 % MVC) y ~3000 N de compresión de columna (estimada con modelo), más que el "body saw" (< 2500 N) [23].

**1. Fases**
1. Hang activo con hollow (escápulas deprimidas, pelvis en retroversión).
2. Elevación de piernas: flexión de cadera con retroversión pélvica creciente.
3. Compresión final: dedos a la barra, el dorsal empuja la barra hacia las caderas (extiende el hombro) para inclinar el tronco hacia atrás y acercar los pies a la barra, tronco flexionado ("pike").
4. Descenso excéntrico controlado.

**2. Análisis articular**

| Articulación | Acción y plano | Músculos y rol | Contracción por fase |
|---|---|---|---|
| Cadera | Flexión (sagital), rodillas extendidas | Iliopsoas, recto femoral, TFL, sartorio = M; aductores = S [L1] | Subida: C; arriba: I; bajada: E |
| Columna lumbar/pelvis | Flexión de tronco + **retroversión pélvica** | Recto abdominal, oblicuo externo = M; oblicuo interno/TrA = Est [L1][23] | I al inicio (evitar anteversión), C en la compresión, E al bajar |
| ST/GH | Depresión escapular + extensión de hombro para **contrabalancear** el movimiento de las piernas | Dorsal ancho, redondo mayor, trapecio inferior = M/Est; el dorsal empuja la barra hacia las caderas (extiende el hombro) para inclinar el tronco hacia atrás y acercar los pies a la barra [L1] | I (con C cuando se mueven los hombros) |
| Codo | Extendido o levemente flexionado | Flexores del codo = Est | I |
| Muñeca/mano | Agarre | Flexores de dedos = M | I |

Variantes con rotación (windshield, "ATW" = around the world presumiblemente): suman oblicuos como M/anti-rotación; [L1].

**3. Por qué progresa**: el brazo de palanca de las piernas respecto de la cadera/hombro; **rodillas flexionadas → piernas rectas** (aumenta el momento de las piernas sobre la cadera), **90° → barra → pike invertido** (agrega rango de flexión de cadera/columna y exige movilidad de isquios), kipping → estricto (quita impulso), rotación (agrega oblicuos). Derivación mecánica.

**4. Compensaciones**: balanceo (kip no intencional), anteversión pélvica al bajar (lumbar en extensión con carga), hombros encogidos (pérdida del hang activo), brazos que se flexionan para "acortar" el recorrido, dominancia de flexores de cadera sin retroversión abdominal (en [29], en adultos sanos, el supine double leg thrust activó mucho el recto femoral y los autores sugieren que *podría* no ser ideal para personas con patología lumbar; no midieron pacientes. Es otro ejercicio, pero ilustra el predominio de los flexores de cadera).

**5. Cues**: "primero costillas a la cadera, después subí las piernas"; "hombros lejos de las orejas"; "los dedos buscan la barra con la pelvis que rota hacia atrás".

**6. Banderas de la ruta** (señales observables; además las transversales de la sección 3): dolor lumbar con flexión o al volver a la posición colgada (carga de columna alta [23]); pellizco o dolor en el pliegue de la ingle al flexionar mucho la cadera; dolor de hombro anterior al sostener el hang con elevación pasiva; adormecimiento de manos.

---

#### S3. PULL HORIZONTAL

##### S3.1 FL — Front Lever (estático; tuck, adv tuck, one leg, straddle, half layout, full)

**Evidencia directa de EMG en FL revisada por pares: no encontré.** Hay un listado de congreso [109] (no leído) que reporta EMG en nueve condiciones de preparación para FL y planche, sin texto accesible. Todo lo siguiente es anatomía [L1] + coaching [L3] + extrapolación de [4][21] (planche y cruz de hierro).

**1. Fases (estático + entrada/salida)**
1. **Entrada**: desde colgado (o inversión "skin the cat"), tirón con brazos rectos hasta cuerpo horizontal (tuck lever raise).
2. **Posición sostenida**: cuerpo horizontal boca arriba, brazos rectos casi perpendiculares al tronco, escápulas deprimidas/retraídas, hollow.
3. **Salida**: descenso excéntrico hasta colgado, o inversión controlada.

Geometría: brazos verticales, tronco horizontal → ángulo húmero-tronco de ~90° [M].

**2. Análisis articular**

| Articulación | Acción y plano | Músculos y rol | Contracción por fase |
|---|---|---|---|
| GH | Extensión de hombro desde flexión (sagital), aducción leve | Dorsal ancho, redondo mayor, pectoral mayor esternal, deltoides posterior, tríceps cabeza larga = M [L1]; manguito (infraespinoso/redondo menor/subescapular) = Est | Entrada: C; hold: I; descenso: E |
| ST | Depresión + retracción moderada (nunca elevación) | Trapecio inferior, romboides, dorsal ancho (cadena cerrada), pectoral menor = M/S; serrato = Est; trapecio superior = Ant | I |
| Codo | **Extendido (SAS)** | Bíceps (cabeza larga cruza GH), braquial, braquiorradial = Est isométrico; tríceps = co-contracción (bloquea el codo; su cabeza larga además ayuda a extender el hombro). En planche el bíceps tuvo diferencias grandes de actividad entre la habilidad y sus ejercicios preparatorios [4] | I |
| Columna lumbar/pelvis | Hollow: retroversión pélvica, anti-extensión | Recto abdominal, oblicuos = M/Est; erectores = Ant (no deberían dominar); glúteo mayor = co-contracción para la retroversión (anatomía [L1]; sin cita específica de FL) | I |
| Cadera | Extensión neutra mantenida contra la gravedad, que tiende a hiperextenderla | **Iliopsoas, recto femoral, tensor de la fascia lata = M isométrico** (sostienen las piernas en línea); glúteo mayor = co-contracción para la retroversión pélvica (no sostiene las piernas) [R] | I |

**3. Por qué progresa**
- **Variable que cambia**: la distancia horizontal entre el hombro y el centro de masa de tronco + piernas (derivación mecánica, BS6).
- Tuck: rodillas al pecho → centro de masa cerca del hombro. Adv tuck: espalda plana, rodillas lejos del pecho → centro de masa más lejos. One leg / straddle: una pierna o ambas abiertas → distribución intermedia. Half layout, full: piernas rectas y juntas → máxima distancia.
- Straddle suele ser más fácil que full por la proyección más corta de las piernas abiertas sobre el eje del cuerpo (derivación mecánica; no verificada con datos).
- Ruta paralela: **BAS (bent arm FL, rows)**: acortan el brazo de palanca efectivo y reparten el trabajo en codo; ver FLR en S3.2.
- Catálogo: "FL WIDE" = brazos más abiertos (cambia dirección de fuerza sobre el dorsal; sin evidencia).

**4. Dónde se siente / compensaciones típicas**
- Se siente en dorsal ancho, redondo mayor, abdomen, y en el bíceps (pliegue del codo), que trabaja fuerte para proteger el codo con brazos rectos [C].
- **Caderas caídas / piernas más abajo**: aumenta lordosis lumbar y quita el hollow (anti-extensión perdida).
- **Pike (caderas altas)**: acorta artificialmente la palanca → "trampa" de progresión.
- **Codos flexionados**: convierte SAS en BAS (el movimiento ya no es FL estricto).
- **Hombros encogidos / cabeza adelantada**: trapecio superior sustituye a depresión.

**5. Cues**: "tirá la barra hacia las caderas, brazos rectos"; "hollow: costillas abajo, pelvis hacia atrás (retroversión), abdomen duro como si te fueran a pegar"; "hombros lejos de las orejas y hacia atrás"; "cuerpo recto como una tabla desde el cuello".

**6. Banderas de la ruta** (señales observables; además las transversales de la sección 3): dolor en la **cara anterior del hombro / surco bicipital** que aparece al sostener (tendón de la cabeza larga del bíceps; en gimnastas con cirugía de hombro hay lesiones del anclaje del bíceps [18][19]); dolor de codo (anterior, en pliegue, por tracción en SAS); hormigueo en mano; dolor lumbar al sostener; dolor articular o tendinoso que no mejora en ~2 semanas pese a bajar la carga, o que empeora sesión a sesión (regla general de la sección 3; umbral a validar ⚑H); dolor en el pliegue anterior del codo con debilidad para girar la palma hacia arriba.

##### S3.2 FLR — Front Lever Row (dinámico; "a la cintura", front pike/tuck/adv tuck)

**1. Fases**: partir de FL (o su progresión) con brazos rectos → **remada** concéntrica (codos flexionan, hombros extienden, escápulas retraen/deprimen) hasta barra a la cintura o costillas → pausa → excéntrico lento hasta brazos rectos.

**2. Análisis articular**

| Articulación | Acción y plano | Músculos y rol | Contracción por fase |
|---|---|---|---|
| GH | Extensión continuada + aducción | Dorsal ancho, redondo mayor, deltoides posterior, tríceps CL = M [L1] | Subida: C; arriba: I; descenso: E |
| ST | Retracción + depresión | Romboides, trapecio medio/inferior = M [L1] | C / I / E |
| Codo | Flexión | Bíceps, braquial, braquiorradial = M [L1] | C / I / E |
| Tronco | Hollow rígido | RA/OE = M/Est | I |

Evidencia relacionada: en una revisión narrativa de EMG del dorsal ancho, la remada invertida mostró la mayor amplitud en un solo estudio pequeño que requiere replicación [30]. No es FLR.

**3. Por qué progresa**: la misma palanca de FL (S3.1) **más** el rango de remada. "A la cintura inclinado vs horizontal" cambia el ángulo del cuerpo con la vertical (inclinación = brazo de palanca del cuerpo, derivación mecánica); el row a la cintura enfatiza la extensión de hombro (dorsal) por sobre la flexión de codo [C].

**4. Compensaciones**: remar con hombros encogidos, caderas que caen al subir, cuello que se adelanta, codos que se abren, "tirón" con impulso de piernas.

**5. Cues**: "llevá la barra al ombligo"; "codos pegados a las costillas"; "bajá en tres segundos sin soltar el hollow".

**6. Banderas de la ruta** (señales observables; además las transversales de la sección 3): igual que FL (bíceps proximal/codo) + dolor de codo con la flexión profunda; dolor posterior de hombro (infraespinoso) al final de la remada.

##### S3.3 MN/RP — Manna / Reverse Planche (L-sit, V-sit, scapula press, manna press, reverse planche)

La DB lo pone en PULL HORIZONTAL, pero el contenido real es **soporte con brazos rectos**: L-sit (manos al costado de la cadera), V-sit/manna (manos detrás) y reverse planche (manos detrás, cuerpo boca arriba). Probablemente la DB lo pone en PULL porque el motor del hombro son los **extensores** (dorsal, deltoides posterior, tríceps cabeza larga), los mismos del FL y los rows; simétricamente, el BL está en PUSH porque lo sostienen los **flexores** (deltoides anterior, pectoral, bíceps) (derivación mecánica; a confirmar que ese sea el criterio de la DB ⚑N). Cadera y tronco trabajan distinto según el escalón; por eso se separan abajo.

**1. Fases**
- L-sit / V-sit: soporte → depresión escapular → compresión de cadera (L = 90°, V = más cerrada).
- Scapula press: elevación y depresión escapular con brazos rectos (movimiento pequeño).
- Manna press: desde V-sit elevar la cadera sobre las manos (soporte con cadera por encima de la altura del hombro).
- Reverse planche: cuerpo horizontal boca arriba, manos detrás, cadera extendida.

**2. Análisis articular**

| Articulación | Acción y plano | Músculos y rol | Contracción por fase |
|---|---|---|---|
| ST | Depresión + retracción. Con el hombro en hiperextensión la escápula tiende a inclinarse hacia adelante y rotar hacia abajo; el trabajo es controlar esa inclinación y que no se eleve ⚑H | Trapecio inferior/medio, romboides, dorsal ancho, pectoral menor (que se estira), fibras inferiores del serrato = M/Est [L1] [R] | I (hold) / C-E en scapula press |
| GH | **Extensión de hombro** (sagital, hasta hiperextensión relativa) + rotación externa/interna según agarre | Dorsal ancho, redondo mayor, deltoides posterior, tríceps CL = M; pectoral mayor esternal (estirado en el rango final) = Ant/S; bíceps CL (tensión anterior) = Est [L1] | I |
| Codo | Extendido (SAS) | Tríceps/ancóneo = M isométrico (mantienen extensión); bíceps/braquial = Ant/Est | I |
| Muñeca | Extensión alta (dedos hacia atrás/costados) | Extensores/flexores = Est; carga articular alta [L1] | I |
| Cadera/columna | **L/V-sit**: flexión de cadera con rodillas extendidas, retroversión; **reverse planche** (apoyo solo en manos, boca arriba): la gravedad tiende a extender cadera y columna | L/V-sit: iliopsoas, recto femoral, aductores y recto abdominal = M. Reverse planche: el abdomen (recto abdominal, oblicuos) y los flexores de cadera = M isométrico; glúteo y erectores = co-contracción postural, no sostienen. (Distinto de la "plancha invertida" con talones en el piso, donde sí trabaja sobre todo el glúteo.) ⚑H: confirmar que el reverse planche del catálogo sea el apoyo libre [L1] [R] | I |

**3. Por qué progresa**: L-sit → V-sit sube la exigencia de movilidad/fuerza de compresión (brazo de palanca de las piernas respecto de la cadera, que se acorta al elevarse; el soporte se hace más corto); manna press agrega traslación de cadera sobre las manos (inclinación de hombros hacia adelante, lean). En reverse planche, igual que en el planche, el centro de masa tiene que quedar encima de las manos; cuanto más se alargan las piernas (tuck → straddle → full), más hay que llevar los hombros hacia atrás de las manos, y crece el torque que tiene que hacer el hombro (distancia horizontal entre los hombros y el centro de masa) (BS6) [R]. Combina **flexibilidad de isquios, extensión de hombro y fuerza SAS**.

**4. Compensaciones**: hombros elevados (colapso hacia las orejas), flexión de codo, caderas bajas y rodillas dobladas en L-sit (pierde la palanca), hiperextensión lumbar para "sentir" el reverse planche, muñecas con presión desigual.

**5. Cues**: "empujá el piso para alejarlo y sacá hombros de las orejas"; "las piernas arrancan desde la cadera, no desde las rodillas"; "pelvis levemente atrás, abdomen duro".

**6. Banderas de la ruta** (señales observables; además las transversales de la sección 3): dolor anterior de hombro en la posición de extensión extrema (reverse planche, Korean/hombro detrás: tensión de cápsula anterior, bíceps y pectoral; consenso clínico/coaching), dolor lumbar con hiperextensión, dolor de muñeca por extensión final, pellizco o dolor en el pliegue de la ingle con V-sit al comprimir la cadera.

##### S3.4 OAR — One Arm Row (inclinado, horizontal, bulgaro, typewriter, de pie)

**1. Fases**: posición inicial con brazo extendido → remada (concéntrica) hasta que la mano llega al costado → pausa → descenso (excéntrico). Tronco rígido sin rotar.

**2. Análisis articular**

| Articulación | Acción y plano | Músculos y rol | Contracción por fase |
|---|---|---|---|
| ST | Retracción + depresión leve | Romboides, trapecio medio/inferior = M [L1] | C / I / E |
| GH | Extensión + aducción (plano sagital/escapular) | Dorsal ancho, redondo mayor, deltoides posterior = M; manguito = Est [L1] | C / I / E |
| Codo | Flexión | Bíceps, braquial, braquiorradial = M [L1] | C / I / E |
| Tronco | **Anti-rotación** (el tirón unilateral genera rotación) | Oblicuos, cuadrado lumbar, erectores = Est [L1] (anti-rotación: anatomía, sin EMG directa) | I |
| Cadera/pies | Posición estable | Glúteos = Est | I |

Evidencia: remada invertida con alta amplitud de dorsal ancho en un único estudio pequeño [30]; **no encontré EMG de row a una mano**.

**3. Por qué progresa**: inclinación del cuerpo (más horizontal = más peso del cuerpo sobre el brazo), % de carga que se reparte con la otra mano ("asistido"), altura/amplitud del recorrido, y supresión del apoyo contralateral. Variable: **porcentaje del peso sobre el brazo de trabajo y brazo de palanca** [M].

**4. Compensaciones**: rotación del tronco para "alcanzar", hombro encogido, cadera que cae, codo que se abre, mano libre empuja.

**5. Cues**: "tirá con el codo hacia el bolsillo"; "pelvis y costillas quietas, que el tronco no gire"; "hombro lejos de la oreja".

**6. Banderas de la ruta** (señales observables; además las transversales de la sección 3): dolor medial/lateral de codo, dolor en el pliegue anterior del codo con debilidad para girar la palma hacia arriba, dolor posterior de hombro al final, dolor lumbar unilateral persistente.

---

#### S4. PUSH HORIZONTAL

##### S4.1 BL — Back Lever (tuck, adv tuck, straddle, full; "SUPINE/PRONE" = orientación a confirmar)

**No encontré EMG de back lever.** Anatomía [L1] + coaching [L3].

**1. Fases**
1. **Entrada**: desde colgado, "skin the cat": inversión (pike) → paso por la **German hang** (hombros en extensión/rotación interna extrema) → extensión de cadera hasta cuerpo horizontal boca abajo.
2. **Posición sostenida**: cuerpo horizontal boca abajo, brazos rectos, manos arriba/delante del tronco; hombros en extensión relativa de ~90° respecto del tronco [M].
3. **Salida**: inversa (volver a pike o a German hang controlada).

**2. Análisis articular**

| Articulación | Acción y plano | Músculos y rol | Contracción por fase |
|---|---|---|---|
| GH | La gravedad empuja al tronco hacia el colgado vertical → tiende a **hiperextender** el hombro [M]. Se resiste con **flexores** de hombro (sagital) y rotación interna controlada | Deltoides anterior, pectoral mayor (clavicular), coracobraquial, bíceps CL = M/Est; dorsal ancho = Ant (su acción extensora favorece la caída) [L1] | Entrada: E (al descender por German hang) → C (al volver); hold: I |
| ST | Escápula deprimida y algo retraída; la carga tiende a elevarla e inclinarla hacia adelante | Trapecio inferior, romboides, dorsal ancho (deprime vía húmero) = Est; pectoral menor = estirado [L1] [R] ⚑H (la posición escapular en BL varía por escuela) | I |
| Codo | Extendido (SAS) | Bíceps/braquial/braquiorradial = Est isométrico (resistir hiperextensión); tríceps = co-contracción (bloquea el codo) | I |
| Columna/cadera | Extensión de cadera y columna **neutra**: evitar hiperlordosis | Glúteo mayor, isquios, erectores = M; RA/OE = Est anti-extensión [L1] | I |

**3. Por qué progresa**: misma palanca que en FL: el centro de masa se aleja del hombro en tuck → adv tuck → straddle → full [M]. Pero el costo es **de rango de hombro y de estructuras pasivas** (cápsula anterior, bíceps CL, ligamentos glenohumerales) más que de fuerza pura [C]. El catálogo incluye "BL pull-up" (BAS) y "ZANETTI" (nombre de comunidad, sin definición).

**4. Dónde se siente / compensaciones**: frente del hombro, pectoral y bíceps; compensaciones: **caderas bajas / lumbar en hiperextensión**, **codos flexionados**, **cabeza hacia atrás** (hiperextensión cervical), hombros adelantados (pérdida de estabilidad escapular), pecho hundido entre los hombros.

**5. Cues**: "cuerpo plano, glúteos apretados"; "empujá los hombros hacia abajo y hacia las manos"; "bajá a la German hang con control, sin dejarte caer".

**6. Banderas de la ruta** (señales observables; además las transversales de la sección 3): dolor en la **cara anterior del hombro** durante o tras la German hang/skin the cat (cápsula/bíceps); sensación de "salida" o inestabilidad del hombro (en gimnastas con cirugía de hombro hubo hombros inestables y dolorosos; mecanismo principal fue tracción con manos fijas en flexión-rotación forzada [18]; BL no es el mismo gesto pero comparte estrés capsular, **extrapolación mía**); dolor de codo en el pliegue, con debilidad para girar la palma hacia arriba; hormigueo.

##### S4.2 HD/ID — Fondos (Dips) (paralelas, anillas, barra; Russian, Korean, Bulgarian, Hungarian, archer, "impossible", supine, protracted)

**La expansión de HD/ID no está en la DB; se trata como "Fondos (Dips)".** Evidencia directa: comparación de dip en banco, barra y anillas en 13 varones experimentados [8].

**1. Fases**
1. Soporte superior: brazos extendidos, escápulas deprimidas.
2. **Descenso (excéntrico)**: flexión de codo + extensión de hombro (húmero hacia atrás del tronco).
3. Fondo: hombro en extensión máxima, codos a ≥90°.
4. **Ascenso (concéntrico)**: extensión de codo + retorno del hombro a neutro.
5. Bloqueo final, escápulas deprimidas/protraídas.

**2. Análisis articular**

| Articulación | Acción y plano | Músculos y rol | Contracción por fase |
|---|---|---|---|
| GH | Descenso: extensión de hombro (sagital); ascenso: flexión desde hiperextensión + aducción horizontal | Pectoral mayor (esternal, invierte su acción según el ángulo [L1]), deltoides anterior, dorsal ancho (control en el fondo) = M/S; manguito = Est | Desc: E; fondo: I; asc: C |
| ST | Depresión + protracción leve en el soporte; en el fondo tendencia a elevar | Trapecio inferior, pectoral menor, serrato anterior = Est/M [L1] | I → C al bloquear |
| Codo | Flexión → extensión | **Tríceps braquial** = M (el abstract no dice qué cabeza). Pico medio de tríceps: banco 0,83 ± 0,34 mV, barra 1,04 ± 0,27 y anillas 1,05 ± 0,40 mV [8]. El fondo en banco trabaja sobre todo el tríceps, pero con **menos** activación pico que barra y anillas, y con **más** extensión de hombro; bíceps = Ant/Est | Desc: E; asc: C |
| Muñeca | Extensión + soporte | Flexores/extensores = Est [L1] | I |
| Tronco | Rígido, ligera inclinación según variante | RA/OE = Est | I |

Datos de [8]: el dip en banco requiere **mayor extensión de hombro**; el dip en barra es una progresión apropiada desde el banco por mayores picos de activación; los dips en anillas tuvieron picos similares a la barra con tres músculos que aumentaron su intensidad. El abstract no dice cuáles tres, y concluye con implicancias para personas con historia de dolor/lesión de hombro.

**3. Por qué progresa**: variables = (a) **porcentaje del peso** (piernas apoyadas en cajón → libre), (b) **rango de extensión de hombro** (dip corto → profundo; Korean/supine con manos detrás del cuerpo = rango extremo), (c) **estabilidad** (barra única → paralelas → anillas) [8], (d) trayectoria/inclinación del torso (Russian = definición a confirmar con los profes ⚑N, protracted = empuje con protracción escapular), (e) reparto unilateral (archer). Los detalles de cada variante nombrada ("Bulgarian", "Hungarian", "impossible") **no están definidos en la DB**.

**4. Compensaciones**: hombros encogidos en el fondo ("orejas al hombro"), codos que se abren, excesiva profundidad con deslizamiento anterior de la cabeza humeral [C], cuello adelantado, caderas colgando sin control.

**5. Cues**: "hombros lejos de las orejas arriba y abajo"; "codos cerca del cuerpo"; "bajá hasta donde mantengas el pecho abierto sin que el hombro se vaya adelante".

**6. Banderas de la ruta** (señales observables; además las transversales de la sección 3): dolor anterior de hombro en el fondo; dolor localizado sobre la articulación acromioclavicular o la esternoclavicular; hormigueo en brazo; dolor de codo posterior (olecranon/tríceps) o medial; **dolor súbito en el pecho o la axila durante un fondo (sobre todo profundo, negativo o lastrado), con o sin chasquido, y después moretón o cambio de forma del pliegue de la axila → cortar y derivar el mismo día** (hay al menos un caso publicado en un atleta de calistenia [38]; el abstract no dice en qué ejercicio); en personas con historia de lesión de hombro, [8] menciona que la selección de variante tiene implicancias.

##### S4.3 OAPU — One Arm Push Up (suelo, inclinado, anillas, straddle, archer)

**EMG unilateral de push-up completo: no encontré.** Hay datos de push-up plus de rodillas a una mano (Maenhout) y de push-up bilateral.

**1. Fases**: posición inicial (pies abiertos, mano bajo el hombro, otra mano a la espalda) → descenso excéntrico (codo flexiona, escápula y tronco anti-rotan) → fondo → ascenso concéntrico → bloqueo con protracción.

**2. Análisis articular**

| Articulación | Acción y plano | Músculos y rol | Contracción por fase |
|---|---|---|---|
| GH | Aducción horizontal + flexión (plano transversal) | Pectoral mayor, deltoides anterior = M; manguito, bíceps CL = Est [L1] | Desc: E; asc: C |
| ST | Protracción + rotación hacia arriba en el bloqueo | **Serrato anterior** = M (mayor actividad con escápula rotada hacia arriba + protracción: push-up plus [9]; con elevación humeral de 120° vs 90° vs 60° [13]; meta-análisis de 19 estudios: plus estándar da alta actividad de SA y en superficie estable con hombros al ancho y flexión de 110–120° [14]) | I → C al bloquear |
| Codo | Flexión → extensión | Tríceps = M [L1] | Desc: E; asc: C |
| Tronco | **Anti-rotación fuerte** (la carga es lateral) | Oblicuos (OE/OI), cuadrado lumbar, glúteo medio = M/Est [L1] (anti-rotación: anatomía, sin EMG directa) | I |
| Muñeca | Extensión + soporte | Flexores = Est | I |

Nota de [15]: en push-up plus de rodillas con una sola mano, la actividad del SA no cambió respecto del bilateral; la extensión de pierna homolateral aumentó SA y la heterolateral el trapecio inferior (n = 32 sanos, rodillas). Transferencia al OAPU completo es **extrapolación**.

Nota de carga: un push-up con banda a 6RM produjo EMG comparable a un press de banca a 6RM y ganancias de fuerza similares en 5 semanas (n = 30) [17]; es un argumento general de que el push-up se puede cargar para ser efectivo.

**3. Por qué progresa**: variable = **% del peso sobre un brazo** y **brazo de palanca del tronco**. Cadena: push-up bilateral → apoyo asistido (dedos, mano a la pared) → archer (la otra mano hace de apoyo lateral) → OAPU. Separar los pies (straddle) amplía la base y reduce la exigencia anti-rotación; juntarlos la aumenta [M].

**4. Compensaciones**: rotación del tronco hacia el brazo libre, cadera que cae o sube, hombro de trabajo encogido, codo que se abre mucho, mano libre apoya sin querer.

**5. Cues**: "caderas cuadradas al suelo, no abras el pecho"; "empujá el piso lejos"; "codo a 45°".

**6. Banderas de la ruta** (señales observables; además las transversales de la sección 3): dolor anterior de hombro en el fondo; dolor lateral/medial de codo; dolor de muñeca por extensión; dolor lumbar unilateral.

##### S4.4 PL — Planche (lean, tuck, adv tuck, straddle, full, bent-arm)

Evidencia directa: EMG de la "support scale" (planche) y 5 ejercicios preparatorios en 7 gimnastas de anillas de alto nivel [4].

**1. Fases**
1. Entrada: desde L-sit/tuck, crow o lean hacia adelante.
2. **Hold**: cuerpo horizontal boca abajo, brazos rectos, hombros por delante de las manos, escápulas protraídas.
3. Salida: descenso controlado o vuelta a apoyo.

**2. Análisis articular**

| Articulación | Acción y plano | Músculos y rol | Contracción por fase |
|---|---|---|---|
| GH | Flexión de hombro sostenida (sagital), con el húmero inclinado hacia adelante | Deltoides anterior, pectoral mayor (clavicular), coracobraquial, bíceps CL = M/Est; en [4] registraron pectoral clavicular, dorsal, tríceps CL, infraespinoso, trapecio medio (transverso), serrato, bíceps, deltoides anterior | I |
| ST | **Protracción + rotación hacia arriba**, depresión mantenida | Serrato anterior = M; trapecio inferior/medio = Est. [4] midió razón serrato/trapecio (cambió entre planche y sus ejercicios preparatorios) | I |
| Codo | **Extendido (SAS)** | Tríceps = M isométrico; bíceps = Est (coactivación bíceps/tríceps difirió entre planche y ejercicios preparatorios [4]) | I |
| Muñeca | **Extensión alta** con carga elevada | Flexores/extensores = Est | I |
| Columna/cadera | Línea con leve retroversión | **Glúteo mayor, isquiotibiales, erectores = M** isométrico (sostienen las piernas); recto abdominal/oblicuos = Est (evitan el arco) [R] | I |

**Resultado clave de [4]**: diferencias grandes entre planche y sus ejercicios preparatorios en trapecio, pectoral y bíceps (tamaño de efecto η² = 0,64, 0,51 y 0,67); también en la razón bíceps/tríceps y serrato/trapecio, y en sinergias musculares (abstract). Lectura: **las progresiones no entrenan exactamente lo mismo que el planche completo**. El abstract no da los valores de EMG ni cuáles ejercicios preparatorios.

**3. Por qué progresa**: variable = **distancia horizontal entre los hombros y el centro de masa** (= torque que tiene que hacer el hombro) [M]. El centro de masa siempre tiene que quedar encima de las manos. Por eso, cuanto más se alargan las piernas (tuck → adv tuck → straddle → full), más hay que adelantar los hombros por delante de las manos (más "lean"), y crecen el torque del hombro y la extensión de muñeca [R]. BAS vs SAS: el bent-arm acorta el brazo de palanca y desplaza trabajo a tríceps/hombro anterior [C].

**4. Dónde se siente / compensaciones**
- Se siente en pecho, hombro anterior, antebrazo/muñeca y abdomen; el bíceps también ([4]).
- **Sin protracción**: pecho caído entre hombros, escápulas aducidas; reduce estabilidad del soporte.
- **Caderas altas (pike)**: acortan la palanca.
- **Lumbar hiperextendido** o cadera baja.
- **Codos flexionados** para "ayudar".
- **Hombros encogidos**: elevación en lugar de depresión.

**5. Cues**: "empujá el piso lejos y redondeá la espalda alta (protracción)"; "hombros por delante de las manos"; "pelvis hacia atrás, glúteos duros"; "dedos hacia afuera para repartir carga".

**6. Banderas de la ruta** (señales observables; además las transversales de la sección 3): dolor en la **cara anterior del hombro / bíceps** (tendón proximal) en SAS; dolor de muñeca (cara dorsal por impacto/extensión o cara palmar), en menores de edad dolor de muñeca del lado del pulgar al apoyarse [31] (nota interna: lesión de la zona de crecimiento del radio distal); dolor medial de codo; hormigueo en dedos; sensación de bloqueo en hombro.

##### S4.5 PLPU — Planche Push Up

**No encontré EMG de planche push-up.** Se deduce de planche [4] + push-up.

**1. Fases**: planche (o su escalón) → **descenso** con codos flexionando, hombros que avanzan más → fondo (pecho entre las manos, cuerpo horizontal) → **empuje** hasta extender → planche.

**2. Análisis articular**: igual que S4.4 en la fase estática, más codo y hombro dinámicos.

| Articulación | Acción y plano | Músculos y rol | Contracción por fase |
|---|---|---|---|
| GH | Flexión + aducción horizontal con alto momento | Deltoides anterior, pectoral mayor (clavicular) = M [L1]; bíceps CL = Est [4] | Desc: E; asc: C |
| ST | Protracción mantenida | Serrato anterior = M; trapecio = Est [9][13] | I |
| Codo | Flexión profunda → extensión | Tríceps = M [L1] | Desc: E; asc: C |
| Muñeca | Extensión alta, carga máxima | Flexores/extensores = Est | I |
| Tronco/cadera | Línea con leve retroversión | Glúteo mayor, isquiotibiales, erectores = M isométrico (sostienen las piernas); RA/OE = Est (evitan el arco) [R] (aplicado por coherencia con la corrección de PL) | I |

**3. Por qué progresa**: planche push-up combina las variables del planche (palanca) + recorrido de codo (rango) + paso SAS → BAS ("PLPU SA STR TO BA FULL" en el catálogo). En el nivel pseudo-planche (manos cerca de las caderas, dedos hacia atrás) el hombro se adelanta aún más (lean) y el tríceps trabaja a mayor ángulo [C].

**4. Compensaciones**: bajar sin mantener protracción ("hundir el pecho"), caderas que suben, codos que se abren, perder la línea del cuerpo.

**5. Cues**: "bajá el pecho hacia las manos manteniendo el cuerpo recto"; "protracción siempre, incluso abajo".

**6. Banderas de la ruta** (señales observables; además las transversales de la sección 3): dolor anterior de hombro y bíceps, dolor de muñeca, dolor medial de codo (el tríceps y flexores del antebrazo toman mucha carga).

---

#### S5. PUSH VERTICAL

##### S5.1 HS — Handstand (tripod, headstand, wall belly, wall back, free, un brazo, kick-up)

Evidencia directa de EMG: 25 gimnastas (10 adultos, 15 jóvenes) en piso/anillas/paralelas [5]; correlación entre EMG y control postural [6]; revisión sistemática de 21 estudios [7].

**1. Fases**
1. **Entrada**: kick-up o press desde L/pike (ver PHS S5.3), caminata de pared, tripod.
2. **Sostenido**: línea tobillos-cadera-hombros-manos, hombros en flexión máxima (~180°), escápulas elevadas y rotadas hacia arriba.
3. **Salida**: vuelta a piso controlada (rollout, cartwheel).

**2. Análisis articular**

| Articulación | Acción y plano | Músculos y rol | Contracción por fase |
|---|---|---|---|
| Muñeca | **Extensión alta + estrategia de equilibrio ("estrategia de muñeca")** | Flexores de muñeca/dedos = M del control (media 60 %, pico 200 % en gimnastas [6]); extensores = Est | I con microcorrecciones C/E |
| Codo | Extendido | Tríceps = Est: contribución relativa 13–16 % (no %MVIC) [6]; los gimnastas adultos mostraron 19,1 % menos actividad de tríceps y 17,6 % menos de deltoides anterior que los jóvenes (interpretación: con más experiencia se usa menos activación) [5] | I |
| GH | **Flexión ~180°** (sagital) | Deltoides anterior 15–18 % de contribución relativa (no %MVIC) [6]; pectoral mayor clavicular, manguito = Est [L1] | I |
| ST | Elevación + rotación hacia arriba máxima; posición neutra de protracción | Trapecio descendente (superior) 20–26 % de contribución relativa (no %MVIC) [6]; trapecio inferior, serrato anterior = M/Est [L1] | I |
| Columna/costillas | Línea neutra (**sin hiperlordosis**) | RA/OE = Est anti-extensión; erectores = Ant; glúteo mayor = Est [L1] | I |
| Cabeza/cuello | Neutro; flexión cervical empeora el desempeño [7] | — | — |

**Estrategia de equilibrio**: primero muñecas; si falla, mixta con hombros, caderas, codos [7]. Apoyo en barras/anillas bajó el EMG de flexores de muñeca vs piso; el resto aumentó en anillas [5].

**3. Por qué progresa** (variable que cambia): **base de apoyo y grados de libertad de control** → pared (apoyo externo) → libre → un brazo/pocos dedos (reduce la base) → anillas. También **posición del centro de masa respecto de las manos** y la **flexión de hombro necesaria** (movilidad: que el brazo llegue a ~180° sin arquear la zona lumbar). El catálogo lo refleja: wall belly → wall back → free → one-arm free HS. Los jóvenes, que tuvieron peor control postural, mostraron más actividad de tríceps, bíceps y recto femoral que los adultos [6].

**4. Dónde se siente / compensaciones**
- Se siente en muñecas (flexores), hombros, tríceps y abdomen.
- **Costillas abiertas + hiperlordosis**: compensación típica de **falta de flexión de hombro** o de control abdominal; el cuerpo "banana" [C].
- **Hombros no elevados** (pecho caído): pierde la ventaja mecánica.
- **Codos hiperextendidos** (discutible: en personas hiperlaxas es habitual y la escuela de gimnasia varía; lo decide un kinesiólogo o coach humano ⚑H).
- **Cabeza metida/levantada**: según [7], flexionar el cuello empeora la vertical.

**5. Cues**: "empujá el piso lejos, orejas entre los brazos"; "costillas hacia la cadera, glúteos duros"; "dedos agarrando el piso para corregir"; "mirá entre las manos".

**6. Banderas de la ruta** (señales observables; además las transversales de la sección 3): dolor de muñeca persistente (cara dorsal o radial); en menores, dolor de muñeca del lado del pulgar al apoyarse [31]; dolor en la parte alta del hombro en flexión máxima; dolor cervical. **Antes de las primeras inversiones (vertical, HSPU, press), preguntar:** ¿presión alta no controlada?, ¿glaucoma, problemas de retina o cirugía de ojos reciente?, ¿embarazo?, ¿desmayos? Si alguna es sí, que lo consulte con su **médico** antes de invertirse. **Durante:** dolor de cabeza fuerte y súbito, visión borrosa o mareo que no pasa al volver de pie → cortar y derivar al médico [R] ⚑H (a validar por un médico o kinesiólogo humano; es una consulta médica, no kinesiológica).

##### S5.2 HSPU — Handstand Push Up (pike P.U, box, wall, 90, deficit, free)

**No encontré EMG de HSPU revisado por pares**; hay un preprint (no revisado por pares) de cinética sobre el kipping, n = 16: la fuerza sobre la cabeza durante el kip suele superar el peso corporal y quienes tuvieron dolor llevaban la cabeza en extensión [39]. Se deduce de HS [5][6] + pike push-up.

**1. Fases**: HS/pike → **descenso excéntrico** (codos flexionan, cabeza baja, hombros extienden respecto de la vertical y la escápula baja) → fondo (cabeza al piso o a 90°) → **ascenso** (extensión de codo + elevación escapular) → bloqueo.

**2. Análisis articular**

| Articulación | Acción y plano | Músculos y rol | Contracción por fase |
|---|---|---|---|
| GH | Flexión ~120°→180° (sagital) | Deltoides anterior = M; pectoral mayor clavicular = S; manguito = Est [L1] | Desc: E; asc: C |
| ST | Elevación + rotación hacia arriba hacia el bloqueo; protracción | Trapecio superior y serrato anterior = M; trapecio inferior = Est. En HS completo contribuyen trapecio descendente 20–26 % y deltoides anterior 15–18 % (contribución relativa, no %MVIC) [6] | Desc: E; asc: C |
| Codo | Flexión → extensión | Tríceps = M [L1] | Desc: E; asc: C |
| Muñeca | Extensión alta | Flexores = Est [6] | I |
| Columna | Anti-extensión | RA/OE = Est | I |

**3. Por qué progresa**: variable = **porcentaje del peso sobre brazos** (pike en suelo → elevado → vertical), **rango** (parcial → 90 → profundo/deficit), **apoyo** (pared → libre), **energía** (kipping). [L1].

**4. Compensaciones**: arco lumbar (para llegar a la pared), codos que se abren, cuello flexionado, pierna que patea, pérdida de protracción al bloquear.

**5. Cues**: "codos a 45°"; "trípode con las manos y la cabeza" (en el escalón bajo); "empujá el piso lejos hasta elevar los hombros"; con cabeza al piso: "cabeza neutra al tocar el piso, no tires la cabeza hacia atrás; tocá suave" (evidencia de un preprint, no revisado por pares).

**6. Banderas de la ruta** (señales observables; además las transversales de la sección 3): dolor cervical (en HSPU con cabeza al piso), dolor de hombro anterior o superior, dolor de codo posterior, dolor de muñeca; **dolor de cuello, o dolor u hormigueo que baja al brazo después de HSPU → cortar las variantes con cabeza al piso y derivar**.

##### S5.3 PHS — Press Handstand (pike, straddle, frog, crow, tuck/adv tuck/planche press)

Evidencia: EMG de press handstand en paralelas en 41 gimnastas varones (12 chicos de 10–12 años que lo logran, 13 que no, 16 adultos). Entre los chicos, los que lograban el press handstand tenían el **serrato anterior** más activo que los que no (diferencia de hasta 63 %, a 160° de flexión de hombro); fue el único músculo que difirió [35]. Los autores parten de la idea de que la dificultad es más de control que de fuerza (no midieron fuerza). Es de 2026; solo se leyó el abstract/página de la revista.

**1. Fases**
1. Posición inicial (L-sit, pike, straddle, frog/crow, tuck).
2. **Lean adelante**: hombros pasan sobre las manos con **protracción**; carga en manos aumenta.
3. **Elevación de caderas**: compresión de cadera (flexores + abdomen) mientras los hombros se abren de ~90° a ~180° de flexión.
4. **Llegada a vertical**: apoyo equilibrado, hombros elevados.
5. Descenso inverso (excéntrico).

**2. Análisis articular**

| Articulación | Acción y plano | Músculos y rol | Contracción por fase |
|---|---|---|---|
| GH | Flexión de hombro de ~90°→180° bajo carga | Deltoides anterior, pectoral mayor clavicular = M; manguito = Est [L1][35] | Subida: C; vertical: I; bajada: E |
| ST | Protracción + rotación hacia arriba + elevación | Serrato anterior = M [35]; trapecio superior e inferior = S (rotación hacia arriba); trapecio medio = Est | C → I |
| Cadera | Flexión mantenida (compresión) → luego extensión a línea | Iliopsoas, recto femoral, aductores (compresión); glúteo/isquios (alineación final) [L1] | I / C |
| Tronco | Flexión de tronco/retroversión durante la compresión, luego neutro | RA/OE = M/Est | I / C |
| Codo | Extendido | Tríceps = Est isométrico | I |
| Muñeca | Extensión alta con carga creciente | Flexores = Est | I |

**3. Por qué progresa**: variables = **centro de masa más lejos del hombro** (frog/crow press → straddle → pike → tuck planche → straddle planche → planche), **demanda de movilidad** (isquios y aductores, pike más cerrado), **tiempo de apoyo del hombro en lean**. Straddle es más fácil que pike porque la compresión es más corta y requiere menos flexibilidad de isquios [C].

**4. Compensaciones**: salto/impulso ("patada"), codos flexionados, cadera que no sube por falta de lean, lumbar en hiperextensión al llegar, hombros sin protracción.

**5. Cues**: "llevá los hombros sobre las manos primero"; "apretá las piernas contra el pecho antes de subir"; "empujá el piso lejos hasta el final".

**6. Banderas de la ruta** (señales observables; además las transversales de la sección 3): dolor anterior de hombro con el lean, dolor de muñeca, dolor lumbar al llegar a vertical, pellizco o dolor en el pliegue de la ingle con la compresión.

---

#### S6. CORE

##### S6.1 CORE ANTERIOR (ruta TTB: crunch, side crunch, "hinge", tuck, pike crunch; ruta FL: boat tuck/str/full, DF "dragon flag", boat a invertida)

Evidencia: roll-out y pike sobre pelota produjeron las mayores activaciones de RA superior/inferior, OE y OI (ej. roll-out RA superior 63 %, RA inferior 53 %, OE 46 %, OI 46 %; pike OE 84 %), con paraespinales lumbares < 10 % MVIC [24]. Hanging straight leg raise: RA > 130 % MVC, OE 88 % MVC, ~3000 N compresión [23]. En una comparación de cinco ejercicios, el V-sit y el reverse curl dieron la mayor actividad de oblicuo externo, y el reverse curl la mayor de recto abdominal inferior. Los autores concluyen que los ejercicios sí activan de forma distinta las porciones del abdomen, aunque no siempre como se suponía para cada ejercicio [28] (n = 25).

**1. Fases (isométrico + dinámico)**: ver cada ejercicio; en boat/V-sit: soporte isométrico; en crunch: flexión concéntrica y vuelta excéntrica; en DF: descenso excéntrico del cuerpo rígido, hold y retorno.

**2. Análisis articular**

| Articulación | Acción y plano | Músculos y rol | Contracción por fase |
|---|---|---|---|
| Columna lumbar/torácica | Flexión (crunch) o **anti-extensión** (boat, DF) | Recto abdominal, oblicuo externo = M; oblicuo interno/TrA = Est [24][L1] | Crunch: C/E; boat/DF: I (DF: E al bajar) |
| Cadera | Flexión (boat, TTB, leg raises) o línea neutra sostenida contra la gravedad, que tiende a extenderla (DF) | Iliopsoas y recto femoral = M en boat/TTB **y también en DF** (isométrico, sostienen las piernas); glúteo mayor = co-contracción para la retroversión, no motor [L1] [R] | I / C |
| ST/GH (DF, hanging) | Depresión + extensión de hombro para fijar el tronco | Dorsal ancho, tríceps CL, trapecio inferior = Est [L1] | I |

**3. Por qué progresa**: **palanca de las piernas respecto del eje** (tuck → straddle → full, derivación mecánica) y **rango/estabilidad** (DF desde bench → libre). El "hinge" del catálogo no está definido en la DB; probablemente una variante de anti-extensión con descenso en bisagra (no verificada).

**4. Compensaciones**: lumbar en extensión (se pierde la retroversión), predominio de flexores de cadera (recto femoral muy activo), cuello flexionado, balanceo.

**5. Cues**: "costillas hacia la cadera"; "costillas abajo, pelvis hacia atrás (retroversión), abdomen duro como si te fueran a pegar"; "empujá la zona lumbar contra el piso".

**6. Banderas de la ruta** (señales observables; además las transversales de la sección 3): dolor lumbar con flexión repetida o con hanging leg raises (compresión alta [23]); dolor en la ingle (pellizco al flexionar mucho la cadera); dolor de cuello.

##### S6.2 CORE POSTERIOR (HR: "bote espinal", "espinal Jefferson", "espinal A 1", "espinal torsión", "espinal cajón", "espinal 360")

**Evidencia específica del Jefferson curl: no encontré ningún estudio** (búsqueda en Europe PMC por título). El resto es anatomía [L1] + literatura de columna lumbar general.

**1. Fases (dinámicas)**: típicamente de pie o sentado: flexión segmentaria controlada de columna (cabeza a vértebras sucesivas) → fondo → **extensión vertebral controlada** de vuelta; en "bote espinal" (¿boat/hold? no definido), extensión de cadena posterior sostenida.

**2. Análisis articular**

| Articulación | Acción y plano | Músculos y rol | Contracción por fase |
|---|---|---|---|
| Columna (lumbar/torácica) | Flexión controlada (sagital) → extensión | Erectores espinales (iliocostal, longísimo, espinoso), multífidos, semiespinoso = M del retorno; abdominales = Ant que se alargan/modulan [L1] | Bajada: E (frenar la flexión); subida: C |
| Cadera | Flexión (bisagra) → extensión | Glúteo mayor, isquios = M [L1] | Bajada: E; subida: C |
| Tejidos pasivos | Ligamentos posteriores, discos, fascia toracolumbar | La flexión completa mantenida produce *creep* lumbar: +5,5° en 20 min con constante de tiempo 9,4 min y recuperación de ~50 % de la rigidez en 2 min; la laxitud temporal puede elevar el riesgo de lesión por hiperflexión [32] | — |
| Columna/cadera, **arch hold boca abajo** ("bote espinal" muy probable; definición a confirmar ⚑N) | Extensión sostenida (boca abajo) | Erectores espinales, multífidos, glúteo mayor, isquiotibiales = M; trapecio inferior/romboides si los brazos van adelante [L1] [R] | I |

**Flexión-relajación (R2-28).** Cerca de la flexión máxima los erectores dejan de activarse (flexión-relajación) y la carga queda en los tejidos pasivos: por eso la carga externa del Jefferson se progresa muy de a poco [R]. En [32], después de una flexión completa sostenida la columna queda más laxa por un rato; los autores recomendaron caminar o pararse unos minutos antes de un esfuerzo exigente. No meter un Jefferson largo justo antes de un levantamiento o salto pesado. Qué ejercicios componen "bote espinal", "espinal cajón", "espinal 360" y "espinal A 1" hay que confirmarlo con los profes (⚑N).

**3. Por qué progresa**: variables = **rango de flexión**, **carga externa** (Jefferson con peso), **unilateralidad** ("A 1" = a una pierna presumiblemente), **torsión** (suma rotación), **tiempo bajo tensión** (360). No hay evidencia comparativa entre escalones.

**4. Dónde se siente / compensaciones**: se siente en toda la espalda y isquios; compensaciones: **flexión solo lumbar** (en lugar de segmentaria), pérdida de control al llegar al fondo, perder la bisagra de cadera.

**5. Cues**: "bajá vértebra por vértebra"; "isquios largos, rodillas casi extendidas"; "subí en orden inverso".

**6. Banderas de la ruta** (señales observables; además las transversales de la sección 3): dolor lumbar que baja a la pierna, hormigueo en la pierna, pérdida de fuerza (ver sección 3, columna); dolor que aumenta al flexionar y no cede en reposo. **Precaución previa:** si tuvo una hernia o protrusión diagnosticada, que el kinesiólogo autorice la flexión con carga antes de empezar (sección 3, precauciones).

##### S6.3 CORE LATERAL (HR: side plank supp/arch/elbow/twist, "bote lateral")

Evidencia: cuadrado lumbar más activo (54 % del máximo) en side support (apoyado en un codo y ambos pies) que en otras tareas, medido con electrodos intramusculares en 4 adultos [26]; el side bridge sirvió para fortalecer glúteo medio y oblicuo externo en 30 sujetos sanos [25]; el side bridge fue evaluado en [29] (el abstract no da el número).

**1. Fases**: posición lateral sobre antebrazo/mano → elevación de cadera → hold → descenso; "twist" = rotación del tronco con el brazo libre; "arch" = elevación con arqueo lateral.

**2. Análisis articular**

| Articulación | Acción y plano | Músculos y rol | Contracción por fase |
|---|---|---|---|
| Columna lumbar | **Anti-flexión lateral** (plano frontal) | Cuadrado lumbar, oblicuos (OE/OI), multífidos = M/Est [26][25] | I |
| Cadera | Abducción neutral (pierna de abajo) | Glúteo medio = M/Est [25] | I |
| GH (brazo de apoyo) | Abducción ~90° en carga, estabilización | Deltoides, supraespinoso, serrato anterior = Est [L1][36] | I |
| ST | Depresión + protracción | Serrato anterior, trapecio inferior = Est [L1] | I |

**3. Por qué progresa**: variable = **brazo de palanca del tronco** (rodillas apoyadas → pies → pierna elevada), base de apoyo (codo → mano), añadidos rotatorios (twist). Derivación mecánica.

**4. Compensaciones**: cadera que cae o se adelanta, hombro de apoyo hundido (pérdida de depresión), tronco rotado hacia el piso o el techo.

**5. Cues**: "cadera hacia el techo, hombro lejos de la oreja"; "línea recta desde cabeza a pies".

**6. Banderas de la ruta** (señales observables; además las transversales de la sección 3): dolor lateral lumbar punzante, dolor de hombro del brazo de apoyo, parestesias.


#### S7. Dónde la evidencia es débil o contradictoria

1. **Sin estudios revisados por pares que encontré**: FL (solo un listado de congreso [109], no leído), BL, OAP, OAPU completo, PLPU, HSPU (solo un preprint de cinética [39]), Jefferson curl. MU tiene una sola EMG (n = 10) [37]. Todo lo demás de esas rutas es anatomía [L1] + coaching [L3].
2. **Bíceps en chin-up vs pull-up**: [3] (mayor en chin-up) vs [2] (similar en repetición completa).
3. **Planche**: [4] reporta diferencias entre planche y ejercicios preparatorios pero en abstract no se dan valores; n = 7 gimnastas elite.
4. **Handstand**: muestras pequeñas (n = 25 en [5], n = 41 en [35]; en [6] el abstract no da n), jóvenes y adultos mezclados [5][6][35]; la revisión [7] incluyó solo 21 estudios, 10 % con EMG.
5. **Dips**: n = 13 varones [8]; el abstract no reporta qué tres músculos aumentan en anillas.
6. **Impingement en pull-ups**: inferencia desde cinemática en 11 varones; los propios autores señalan inconsistencias (inclinación posterior) [1].
7. **Adaptación tendinosa en SAS**: meta-análisis solo en Aquiles/rotuliano [22]; el bíceps proximal es extrapolación.
8. **"Discinesia escapular"**: relevancia clínica discutida [33]; meta-análisis de cinemática en pinzamiento con efectos moderados [12].
9. **EMG ≠ carga**: la actividad eléctrica no equivale a carga tisular ni a fuerza; ver la leyenda del comienzo.

#### S8. Tabla resumen: músculo → rutas donde es motor (M) o estabilizador (Est)

M = motor/agonista; S = sinergista; Est = estabilizador; Ant = antagonista; (+) = rol según anatomía [L1] sin EMG directa; la citación [n] indica que hay un estudio leído que midió el músculo en un gesto de esa ruta o muy cercano.

| Músculo | Motor (M) / sinergista (S) en | Estabilizador (Est) en |
|---|---|---|
| Dorsal ancho | OAP (M) [3], MU (M tirón), FL (M), FLR (M), OAR (M), MN/RP (M), TTB (Est depresión), BL (Ant) | PL/PLPU (Est) |
| Redondo mayor | FL, FLR, MU tirón, OAP, OAR (M, +) | MN/RP (+) |
| Pectoral mayor (esternal) | MU (tirón y empuje), HD/ID (M), OAPU (M) | FL (S extensión desde flexión, +) |
| Pectoral mayor (clavicular) | PL, PLPU, PHS, BL, OAPU (M; [4] midió el clavicular en planche) | HS (+) |
| Deltoides anterior | HS (Est [6]), HSPU, PHS (M), BL, PL, PLPU (M; [4]) | MU, HD/ID |
| Deltoides posterior | FL, FLR, OAR, MN/RP (M, +) | OAP (+) |
| Tríceps braquial (cabeza larga) | MU empuje, HD/ID (M [8]), OAPU, PLPU, HSPU (M), FL (S, +) | PL, HS (Est [6]), MN/RP (Est isométrico), PHS |
| Bíceps braquial | OAP, MU tirón, FLR, OAR (M [2][3]) | FL, PL, PLPU, BL (Est, SAS [4][21]), HD/ID (Ant) |
| Braquial / braquiorradial | OAP, MU, FLR, OAR (M [2]) | FL, PL, BL (Est) |
| Serrato anterior | OAPU (M [9][13][14]), PL, PLPU, HSPU, PHS (M [35]) | HS, MU, OAP, FL (Est) |
| Trapecio inferior | MU, OAP, TTB, FL (M/Est depresión, [3] midió en pull-up) | HD/ID, PL, MN/RP, HS (Est) |
| Trapecio medio / romboides | OAR, FLR (M retracción), MU tirón (S) [2] (pronado > neutro) | FL, OAP (Est) |
| Trapecio superior / descendente | HS (M elevación, 20–26 % de contribución relativa [6]), HSPU (M) | en colgados (OAP y otros): que no domine (evitar encoger los hombros) |
| Infraespinoso / manguito | — | OAP [3] (Est 71–79 % MVIC), PL [4], FL, BL, HS (Est) |
| Pectoral menor | — | FL, BL, MN/RP, HD/ID (Est/S, +) |
| Flexores de muñeca/dedos | MU falso agarre (M isométrico), HS (M del control [6]) | OAP, TTB (agarre), PL, PLPU, MN/RP |
| Recto abdominal | TTB [23], boat, DF (M) [24][28] | FL, FLR, BL, PL, PLPU, HS, HSPU, PHS, OAPU (Est anti-extensión) |
| Oblicuo externo / interno / TrA | TTB [23], boat (M) [24][28] | FL, PL, HS, OAPU (anti-rotación), OAP, OAR |
| Cuadrado lumbar | CORE LATERAL (M) [26] | OAP, OAR, OAPU (anti-rotación/inclinación) |
| Erectores espinales / multífidos | CORE POSTERIOR, BL, PL, PLPU (M, +; frenan la flexión de cadera y columna boca abajo) | FL, HS (Ant) |
| Glúteo mayor / isquiotibiales | CORE POSTERIOR, BL, PL, PLPU (M: sostienen las piernas boca abajo) | FL, DF, reverse planche, HS (co-contracción/Est) |
| Glúteo medio | CORE LATERAL (M) [25] | OAPU, OAR (Est unilateral) |
| Iliopsoas / recto femoral / aductores | TTB, boat, L/V-sit, PHS compresión, **FL, DF y reverse planche** (M, +; en FL, DF y reverse planche, isométrico) [29] | — |
| Coracobraquial | BL (M, +) [L1] | PL (+) |

### 2.2 Tren inferior, movilidad, flow, plyo, cardio y kettlebell (LOWER, MOVILIDAD, FLOW, PLYO, CARDIO, KL)

#### BI. Base común del tren inferior (las rutas la referencian como BI1…BI6)

##### BI1. Complejo lumbo-pélvico-cadera

- La **pelvis** rota sobre las cabezas femorales: inclinación anterior/posterior en el plano sagital. Flexión de cadera "limpia" = la pelvis se inclina hacia adelante sobre los fémures con columna lumbar neutra (bisagra). Cuando se acaba el rango de cadera, la flexión sigue en la **columna lumbar** (ritmo lumbo-pélvico) [L1][L2]. Esa es la causa común de "lumbar que compensa" en pike, nordic, deadlift, bridge y swing.
- **Cadera** (enartrosis, 3 grados de libertad) [L1]. El rango útil al final **depende de la forma del hueso** (versión femoral, cabeza-cuello, acetábulo) además de los tejidos blandos. En sentadilla profunda con talones apoyados la flexión de cadera medida varió mucho entre personas (media 95° con desvío estándar de 27°, n=30 adultos indios, edad media 48 años) [56]: hay una variabilidad individual enorme, y "no llegar" no siempre es falta de flexibilidad. El diagnóstico clínico del dolor de cadera por forma ósea (el consenso de Warwick lo llama síndrome de pinzamiento femoroacetabular; término de uso interno, no para el alumno) exige **síntomas + signos clínicos + imagen**, no la imagen sola [94].
- **Glúteo mayor**: principal extensor y rotador externo de cadera [L1]. Su contribución relativa a la fase concéntrica de la sentadilla aumentó con la profundidad: 16,9% (parcial), 28,0% (paralela), 35,4% (completa) del total de 4 músculos medidos, n=10 [47]. En sentadilla monopodal y peso muerto monopodal se registró la mayor activación de glúteo mayor entre 12 ejercicios (n=21) [49].
- **Glúteo medio/menor y TFL**: estabilizan la pelvis en el plano frontal en apoyo monopodal [L1]. En la sentadilla monopodal, quienes la ejecutaban "bien" (según panel de clínicos) tenían activación más temprana de glúteo medio y mayor fuerza de abducción de cadera y flexión lateral de tronco que quienes la ejecutaban "mal" (n=34 asintomáticos) [58].
- **Isquiotibiales**: semitendinoso, semimembranoso y porción larga del bíceps femoral son **biarticulares** (extienden la cadera y flexionan la rodilla); la **porción corta del bíceps femoral es monoarticular** (solo flexiona la rodilla) [L1]. En bisagra trabajan largos y casi isométricos/excéntricos; en nordic trabajan excéntricos sobre la rodilla. Ver NC.
- **Estabilidad de columna**: ningún músculo domina; los roles cambian con la tarea. Si el objetivo es estabilizar, entrenar patrones que involucren muchos músculos (Kavcic, McGill, modelo + EMG, n=7 ejercicios) [101]. Es argumento contra los cues del tipo "metés solo el transverso".

##### BI2. Rodilla: mecanismo extensor y brazo de momento

- **Mecanismo extensor**: cuádriceps (3 vastos + recto femoral) → rótula → tendón rotuliano → tuberosidad tibial. La rótula alarga el brazo de momento del cuádriceps [L2]. El recto femoral cruza también la cadera (biarticular) [L1].
- **Brazo de momento externo en la rodilla** = distancia horizontal entre la rodilla y la línea de la fuerza de reacción del suelo. Cuanto más adelante viaja la rodilla respecto del pie (y más inclinada la tibia), más grande es el momento extensor que debe sostener el cuádriceps [C, física elemental], y más chico el de cadera. Dato: en sentadilla con barra paralela, al impedir con una barrera que las rodillas pasen la punta del pie, el torque de rodilla bajó de ≈150 a ≈117 N·m y el de cadera subió de ≈28 a ≈303 N·m (n=7 hombres, carga = peso corporal) [45]. Los autores concluyen que restringir la rodilla probablemente transfiere fuerzas "de forma inapropiada" a cadera y zona lumbar, y que la carga articular adecuada puede requerir que la rodilla pase un poco la punta del pie; con la barrera, además, el tronco se inclinó más [45].
- **Profundidad**: la fuerza patelofemoral, la fuerza en LCP y la compresión tibiofemoral aumentan con la flexión de rodilla y alcanzan su pico cerca del máximo de flexión [40][41]. El esfuerzo relativo del **extensor de rodilla** aumentó con la profundidad pero no con la carga; el de **extensores de cadera** aumentó con **ambas** (profundidad y carga), y el de **plantiflexores** con la carga pero no con la profundidad (n=10 mujeres entrenadas, 50-90% 1RM) [46]. Traducción práctica: cuádriceps → rango; glúteo → rango y carga; gemelos/sóleo → carga.
- **Rodilla adelante de los pies**: mover la rodilla ≥8–10 cm más allá de la punta del pie aumenta la carga de LCA y la fuerza patelofemoral (p.ej. wall squat corto ≈3650 N vs largo ≈2900 N a 90°); sentadilla con talones despegados dio >3 veces la carga de LCA que con talones apoyados — pero **en magnitudes absolutas chicas** (los ejercicios de cadena cerrada suelen dar <150 N de LCA) [40]. O sea: no es "prohibido", es palanca.
- **Sentadilla profunda y salud de rodilla**: evidencia **contradictoria**. Una revisión clásica recomendaba sentadilla paralela sobre profunda por mayor potencial de lesión en meniscos y ligamentos [41]. Una scoping review de 2024 (15 estudios) encontró que 14 no mostraban efecto negativo y solo un caso clínico asoció la profunda con lesión [57]. Postura prudente: profundidad completa es razonable con técnica y progresión; en rodillas con dolor, bajar el rango.
- Banderas de rodilla y de adolescentes (derrame, bloqueo, apofisitis): ver la sección 3 (se redactaron una sola vez, no por ruta).

##### BI3. Tobillo: dorsiflexión como limitante

- La **dorsiflexión (DF)** de tobillo es limitante de rango en sentadilla, zancada, step-down, pistol (en el sissy el talón está arriba y el límite es otro: rodilla y recto femoral) [L1]. Sóleo (flexor plantar monoarticular) y gastrocnemio (biarticular: con la rodilla flexionada queda acortado y limita menos la dorsiflexión; con la rodilla extendida limita más) frenan la DF [L1].
- Simular menos DF con una cuña de 12° bajo el antepié produjo **más valgo de rodilla y desplazamiento medial de rodilla, menos activación del cuádriceps y más del sóleo** en sentadilla (n=30 sanos) [54]. En otro estudio (n=40), mayor DF **en la prueba de zancada con carga** se asoció a más flexión de rodilla y desplazamiento de tobillo en sentadilla y a más varo en monopodal; la DF pasiva sin carga **no** discriminó [55]. Lección: medir DF **en carga** (rodilla a la pared). Ambos son transversales: sugieren asociación, no prueban que mejorar DF corrija el patrón.
- Con talones elevados el rango requerido de rodilla sube: sentadilla con talones arriba llegó a 157° de flexión de rodilla (n=30, población india, actividades cotidianas) [56].
- Los plantiflexores controlan el avance de la tibia en excéntrico; su esfuerzo relativo sube con la carga externa [46].

##### BI4. Rodilla dominante ↔ cadera dominante es un **continuo**, no una categoría

Lo que decide cuánto trabaja cada articulación no es el nombre del ejercicio sino: inclinación del tronco, avance de la rodilla, ancho de la base, posición del pie y rango.

| Variable | Efecto medido | Fuente |
|---|---|---|
| Tronco más inclinado (30–40°) vs erguido | Más isquios y menos cuádriceps, menos traslación de rodilla | [40] |
| Rodillas libres vs restringidas | Torque de rodilla ↑, de cadera ↓ | [45] |
| Base ancha vs angosta (sentadilla) | Momento neto de DF de tobillo (ancha/media) vs plantiflexor (angosta); más momento de rodilla y cadera en ancha; tibias más verticales | [43] |
| Sumo vs convencional (peso muerto) | Sumo: tronco y muslos más verticales, momento de DF de tobillo; convencional: momento de flexor de rodilla y plantiflexor | [44] |
| Zancada búlgara (35% 1RM) vs sentadilla trasera (70% 1RM) | **Ambas hip-dominantes** por momento articular neto; la búlgara baja la demanda de rodilla | [51] |
| Búlgara con tronco flexionado | Más glúteo mayor, bíceps femoral y recto femoral (n=21 mujeres atletas) | [52] |
| Aterrizaje en drop jump: estrategia de rodilla vs de cadera | Rodilla: más RSI y rigidez de pierna a 30 cm; cadera: más disipación en tobillo a 60 cm | [84] |

**Consecuencia para el catálogo:** "LOWER | KNEE DOMINANT | L" (lunge) y "LOWER | HIP DOMINANT | SU" son etiquetas de **patrón/intención**, no de cinética medida. Una búlgara cargada puede ser más de cadera que de rodilla [51]. Los profes no deberían decir "esto es todo cuádriceps" sin mirar el tronco y la rodilla del alumno.

##### BI5. Plano frontal: valgo dinámico — qué dice la evidencia y qué no

- Hipótesis de trabajo (teórica): el movimiento anormal de fémur y tibia en planos frontal/transverso altera la mecánica patelofemoral; por eso se entrena control proximal (cadera/pelvis) y distal (tobillo/pie) [59].
- Estudio prospectivo (205 atletas mujeres, 9 rupturas de LCA): las lesionadas tuvieron al aterrizar ≈8° más de abducción de rodilla, **2,5× el momento de abducción**, 20% más de fuerza de reacción y 16% menos de tiempo de apoyo; el momento de abducción predijo la lesión con 78% sensibilidad y 73% especificidad [79]. **Limitación**: solo 9 eventos; mujeres de deportes de alto riesgo; no extrapolable a un alumno de calistenia.
- Escala de errores de aterrizaje LESS en 829 atletas juveniles de fútbol (7 lesiones): corte en 5 → sensibilidad 86%, especificidad 64% [80]. Útil como lista de chequeo del profe, **no** como test diagnóstico.
- Programas de entrenamiento neuromuscular previenen lesiones de LCA en mujeres jóvenes; los subgrupos con fuerza, control proximal y programas múltiples redujeron lesiones (OR ≈0,32) [81]. Nota: no es el valgo en sí lo que se "arregla" con un cue; son programas completos.
- Cargar el movimiento con una banda que tira la rodilla hacia adentro **aumentó** el valgo pico en los tres ejercicios (sentadilla bipodal, step-up frontal y monopodal); no subió la activación de glúteos en monopodal ni step-up (solo el glúteo mayor integrado en la bipodal) [50]: la banda sirve como test de control, no como fortalecedor.
- **Cue "rodillas afuera"**: práctica de coaching extendida; su efecto sobre lesiones no lo encontré probado en las fuentes leídas [C].

##### BI6. Roles, contracciones y la trampa del EMG

- Concéntrica = el músculo se acorta y vence la carga; excéntrica = se alarga frenando; isométrica = no cambia el largo [L1]. En una sentadilla: descenso = EXC de extensores; ascenso = CON; el instante de transición = ISO breve.
- **Amplitud de EMG ≠ hipertrofia ni fuerza.** El hip thrust mostró EMG de glúteo mayor mayor que la sentadilla, pero en un ensayo de 9 semanas (n=34) el crecimiento del glúteo fue similar y la sentadilla hizo crecer más cuádriceps y aductores [60][63]. Todas las cifras de EMG de este documento son **por ejercicio, con una carga y una muestra chica**.
- **Largo muscular importa**: el cuádriceps en rodilla flexionada y los isquios en cadera flexionada trabajan "largos". Entrenar a mayor largo muscular produjo más hipertrofia de isquios en curl sentado que en curl prono (+14% vs +9%, n=20) [70] y en el estudio de lengthened-state vs nordic el LSET superó al nordic en hipertrofia total y del bíceps femoral largo (+18% vs +11%; +19% vs +5%; n=42) [69].
- Evidencia general de prescripción: ACSM recomienda fuerza 2–3 d/sem y un total de 60 s de estiramiento por ejercicio (puede repartirse en series), ≥2 d/sem, para mantener rango [88].

#### TI-A. LOWER | KNEE DOMINANT

##### A1. L — Lunge (zancada, búlgara, heel up, jump)

**1. Fases** (pierna de adelante): F1 apoyo/carga → F2 descenso (EXC) → F3 fondo (ISO breve, rodilla trasera cerca del suelo) → F4 ascenso (CON) → F5 reposición. La pierna de atrás: cadera en extensión y rodilla flexionada.

**2. Análisis articular** (base: BI1, BI2, BI3; roles [L1][L2])

| Articulación | Acción · plano | Músculos y rol | Contracción (F2 / F3 / F4) |
|---|---|---|---|
| Cadera delantera | Flexión → extensión · sagital | Glúteo mayor **M**; aductor mayor (fibras isquiocondíleas) **S**; isquios **S** (en zancada la relación bíceps femoral/mediales fue alta en la fase concéntrica [68]); recto femoral **Ant** relativo | EXC / ISO / CON |
| Cadera delantera | Control de aducción-abducción y rotación · frontal/transversal | Glúteo medio/menor, TFL **Est** | ISO-EXC en todo el recorrido |
| Cadera trasera | Extensión (alargamiento de flexores) · sagital | Iliopsoas y recto femoral **alargados** (limitan el rango; en búlgara más aún [C]); glúteo mayor **Est** | EXC leve / ISO / CON leve |
| Rodilla delantera | Flexión → extensión · sagital | Cuádriceps **M** (vastos + recto femoral); isquios **Ant** co-activos | EXC / ISO / CON |
| Rodilla trasera | Flexión mantenida · sagital | Cuádriceps trasero **Est** (recto femoral alargado en cadera ext + rodilla flex) | ISO-EXC |
| Tobillo delantero | Dorsiflexión (la tibia avanza) · sagital | Sóleo y gastrocnemio **EXC** controlan; tibial anterior **Est** | EXC / ISO / CON (plantiflexión al empujar) |
| Pelvis / lumbar | Neutro; evita rotación y báscula · todos | Erectores, oblicuos, cuadrado lumbar **Est**; glúteo medio contralateral **Est** | ISO |

**Evidencia.**
- Búlgara (35% 1RM) vs sentadilla trasera (70% 1RM), n=20 hombres: ambas con mayor momento neto en cadera que en rodilla o tobillo; la búlgara redujo la demanda de rodilla [51]. Búlgara con tronco flexionado ↑ glúteo mayor, bíceps femoral y recto femoral (n=21 mujeres) [52].
- Zancada y step-up lateral produjeron >45% MVIC en vasto medial oblicuo (n=30) [25].
- Paso largo vs corto (peso corporal): fuerza patelofemoral mayor con paso largo entre 10°–40° de flexión y mayor con paso corto entre 50°–100°; subir a una plataforma de 10 cm baja la carga patelofemoral; zancada estacionaria (sin paso) carga menos la rótula que con zancada en movimiento; zancada lateral carga más la rótula que la frontal entre 40°–100° [40]. La zancada corta (rodilla ≈9 cm pasada de la punta) tuvo más carga de LCA que la larga [40].
- La sentadilla monopodal generó más activación excéntrica de cuádriceps que la zancada frontal y que la búlgara (n=23, peso corporal); no se informó diferencia clara entre zancada y búlgara en el abstract [53].

**3. Por qué progresa.** Rango (parcial → full → deep, la profundidad sube el momento y esfuerzo relativo del extensor de rodilla [46]); asistencia con mano/banda (resta carga); elevación del pie de atrás (aumenta recorrido y carga unilateral [51]); largo del paso (desplaza demanda entre rodilla y cadera [40][45]); carga W; salto (pliometría). "Heel up" quita demanda de DF y adelanta la rodilla [C, por BI2/BI3].

**4. Dónde se siente / compensaciones.** Se siente en cuádriceps y glúteo del lado de adelante; en búlgara, flexor de cadera y cuádriceps de atrás estirándose. Compensaciones: (a) **valgo** de rodilla delantera [BI5]; (b) talón delantero que despega (DF limitada [54][55]); (c) tronco que cae adelante (cambia a cadera, no siempre es error [52][BI4]); (d) **lumbar en hiperextensión** con pelvis en anteversión cuando el flexor de la pierna trasera es corto [C]; (e) pelvis que rota hacia el lado de adelante [C]; (f) pasos que cruzan la línea media y estrechan la base [C].

**5. Cues.** "Pie entero en el piso, tres puntos." "Bajá la cadera derecho, como en un ascensor." "Costillas sobre la pelvis." "La rodilla de adelante sigue la dirección del segundo dedo." (cues de coaching, sin evidencia directa [C])

**6. Banderas de la ruta** (señales observables; además las transversales de la sección 3). Dolor en la parte delantera de la rodilla que persiste o aparece al bajar escaleras o cargar [59]; rodilla que se traba, falla o se hincha después de entrenar (ver sección 3, rodilla) [C]; dolor en la punta de abajo de la rótula con saltos [C]; dolor profundo en la ingle al flexionar mucho la cadera [94][95] (ver sección 3, cadera).

---

##### A2. PS — Pistol Squat y familia sentadilla

Incluye: pistol (assisted/heel up/to box/seiza to pistol), shrimp, cossack, side lunge, cyclist squat, deep/close/narrow squat, reverse to squat, snowboard squat, saltos (jump, tuck jump).

**1. Fases (pistol):** F1 parado en una pierna, pierna libre extendida adelante → F2 descenso EXC (flexión de cadera, rodilla y DF; contrapeso con brazos/tronco) → F3 fondo (rango máximo, ISO breve) → F4 ascenso CON → F5 bloqueo.

**2. Análisis articular**

| Articulación | Acción · plano | Músculos y rol | Contracción (F2 / F3 / F4) |
|---|---|---|---|
| Cadera de apoyo | Flexión → extensión · sagital | Glúteo mayor **M**; aductor mayor **S**; isquios **S** (se alargan en la cadera y se acortan en la rodilla: su largo cambia poco y su aporte como extensores es moderado [L1]) | EXC / ISO / CON |
| Cadera de apoyo | Control frontal y transversal (evitar valgo/caída pélvica) | Glúteo medio/menor, TFL, rotadores externos **Est** | ISO-EXC; mayor demanda que en sentadilla bipodal [49][50] |
| Rodilla de apoyo | Flexión profunda → extensión · sagital | Cuádriceps **M** (vastos principalmente; recto femoral co-actúa en cadera flexionada) | EXC / ISO / CON |
| Tobillo de apoyo | DF máxima → plantiflexión · sagital | Sóleo **M-EXC** en el descenso y **M-CON** al empujar; gastrocnemio **Est** (acortado); tibial anterior **Est** | EXC / ISO / CON |
| Cadera libre | Flexión sostenida con rodilla extendida (pierna adelante) | **Iliopsoas, recto femoral y tensor de la fascia lata M-ISO, trabajando muy acortados** (por eso se acalambran y la pierna "cae"); cuádriceps **Est-ISO** para mantener la rodilla estirada; **isquios de la pierna libre alargados al máximo (cadera flexionada + rodilla extendida): suelen ser el primer limitante del pistol** junto con la dorsiflexión [L1][R] | ISO |
| Tronco/columna | Inclinación adelante controlada; neutralidad lumbar | Erectores **Est**; oblicuos/recto abdominal **Est**; cuadrado lumbar lado de apoyo **Est** | ISO |

**Evidencia.**
- Sentadilla monopodal vs bipodal vs step-up frontal (n=18 mujeres): la monopodal tuvo la mayor activación integrada y pico de glúteo mayor y medio [50]. Sentadilla monopodal y peso muerto monopodal tuvieron la mayor activación de glúteo mayor entre 12 ejercicios (n=21) [49]. El mejor para glúteo medio fue la abducción en decúbito lateral [49].
- Activación **excéntrica** de cuádriceps: la sentadilla monopodal superó a zancada frontal y búlgara en los 3 músculos medidos (n=23) [53].
- Cargas: con 12-RM la sentadilla monopodal dio fuerza patelofemoral ≈1800–2800 N vs ≈2100–3650 N del wall squat entre 60°–90°; LCA 22–59 N (monopodal) vs 0 N (wall) entre 0°–40°; la rodilla pasó ≈10 cm la punta del pie [40].
- Declive (n=10): a mayor declive subió el momento extensor de rodilla y el EMG de recto femoral; bajó el momento plantiflexor, pero el gastrocnemio subió su EMG a 24°; no daría ventaja mecánica a la rodilla [48]. (Matiza la idea de que "más declive = mejor": pasados ~16° el gemelo vuelve a activarse y no habría ventaja mecánica extra para la rodilla; n=10.)
- **No hay estudio de pistol squat completo** (con descenso hasta el máximo y pierna libre extendida) entre las fuentes leídas: lo de arriba es extrapolación [C].

**3. Por qué progresa.** Rango (parcial → caja baja → full); asistencia (banda/TRX/mano) que baja la carga en la pierna de apoyo; elevación de talón (suprime el límite de DF pero aumenta el avance de rodilla y la demanda de cuádriceps [BI2][BI3]); contrapeso (más inclinación = más cadera [45]); carga unilateral intrínseca (todo el peso en una pierna: demanda excéntrica de cuádriceps mayor que bipodal [53]); excéntrico lento (EXC en la columna `effort`); salto; pierna libre apoyada en talón o en caja → pierna libre más alta [R]. **Shrimp**: la pierna libre va atrás; cuánto cuádriceps vs cadera depende de cuánto se incline el tronco y cuánto avance la rodilla [BI4]; no hay datos [C]. **Cossack/side lunge**: agregan el plano frontal (aductores en excéntrico, base ancha) [L1]; la zancada lateral carga más la rótula que la frontal a 40°–100° [40].

**4. Dónde se siente / compensaciones.** Cuádriceps y glúteo de la pierna de apoyo; sóleo en DF extrema. Compensaciones típicas: valgo [BI5], **talón que despega** (DF o fuerza [54][55]), **lumbar que se flexiona al fondo** (pérdida de neutralidad cuando la cadera no flexiona más; "butt wink" es término de coaching [C]; una pequeña retroversión al final de una sentadilla profunda sin peso es común y no es por sí misma un problema: corregirla cuando hay carga axial, cuando es grande o cuando da molestia [C]), caída de la pelvis libre (glúteo medio [58]), pie colapsado hacia adentro [C], pierna libre que apoya el piso, tronco que se desploma.

**5. Cues.** "Trípode del pie: talón, base del dedo gordo, base del meñique." "Sentate hacia atrás y abajo, no te dejes caer." "Brazos adelante como contrapeso." "Bajá en 3 segundos." [C]

**6. Banderas de la ruta** (más las transversales de la sección 3). Dolor anterior de rodilla persistente [59]; pinchazo profundo en la ingle al llegar al fondo (ver sección 3, cadera) [94]; dolor en rodilla con rodillas muy flexionadas que reaparece cada vez [C]; rodilla que falla o se traba (ver sección 3, rodilla) [C].

**Evidencia débil/contradictoria:** sin estudios de pistol; declive: n=10; EMG monopodal en mujeres jóvenes sanas.

---

##### A3. QC — Quad Curl (seiza, quad box, tibiales)

**Advertencia:** el ejercicio no está descripto en el repo. Por nombres: seiza = sentado sobre los talones; "up and down" = pasar de sentado a erguido sobre rodillas; "reach" = alcanzar atrás/adelante; "quad on box" = apoyo en caja; "tibiales pared" = elevación de punta de pie de espaldas a la pared. Todo lo siguiente es **razonamiento a partir de BI2 y [L1]**, no evidencia de QC. **Confirmar la definición con Nacho antes de publicar.**

**1. Fases:** F1 sentado sobre los talones (rodilla en flexión profunda, empeine apoyado) → F2 extender rodillas / elevar cadera (CON) y/o recostarse hacia atrás con el torso (EXC del cuádriceps frenando) → F3 posición erguida o inclinada (ISO) → F4 retorno.

| Articulación | Acción · plano | Músculos y rol | Contracción |
|---|---|---|---|
| Rodilla | Flexión profunda → extensión · sagital | Cuádriceps **M**: EXC al reclinarse, CON al volver; recto femoral muy exigido si la cadera está en extensión [C: biarticular [L1]] | EXC / ISO / CON |
| Cadera | Mantenida en 0° (cuerpo en línea) | **Flexores de cadera (recto femoral, iliopsoas) M-ISO** cuando el torso se reclina (la gravedad tiende a extender la cadera); glúteo mayor en co-contracción para no quebrar la cadera hacia adelante; **abdominales Est** (antiextensión lumbar) [R] | ISO |
| Tobillo | Plantiflexión pasiva (empeine al suelo) | Estira tibial anterior y extensores de dedos; (en "tibiales pared": tibial anterior **M-CON/EXC** en DF) | ISO pasiva |
| Columna lumbar | Neutro; evita hiperextensión | Abdominales (recto abdominal, oblicuos) **Est** | ISO |

**Evidencia.** El **reverse nordic curl** (análogo mecánico: cuádriceps excéntrico en cadera extendida, torso reclinado) no produjo mayor activación excéntrica de cuádriceps que sentadilla monopodal, zancada o búlgara, con menor rango de rodilla (n=23) [53]. Arrodillarse repetidamente a flexión profunda: datos de cadáver y de prótesis, con la advertencia de más presión en cartílago y meniscos en rodillas intactas si es crónico y repetitivo [108] — **extrapolación débil**.

**3. Por qué progresa.** El brazo de momento sobre la rodilla crece con la distancia horizontal entre rodilla y centro de masa: reclinar el torso más atrás = más palanca [C]. Rango (parcial → full), asistencia con manos/banda, caja, carga W, una pierna (OL en el catálogo).

**4. Compensaciones.** Flexionar cadera (pike) para acortar la palanca [C]; hiperextensión lumbar (costillas abiertas) [C]; valgo; descargar con los tobillos plantiflexionados dolorosos.

**5. Cues.** "Línea recta de rodillas a hombros." "Bajá con las costillas abajo." "Controlá el descenso, no te tires." [C]

**6. Banderas de la ruta** (más las transversales de la sección 3). Dolor en la cara posterior de la rodilla en flexión profunda sostenida [C]; dolor anterior de rodilla persistente [59]; dolor de empeine/tobillo anterior que no cede [C].

---

##### A4. SS — Sissy Squat (incluye Hindu squat, ape reach, soleo squat, crab sissy)

**1. Fases:** F1 parado, talones elevándose; F2 descenso EXC: flexión de rodilla con cadera extendida y torso inclinado hacia atrás (línea hombros–rodillas), talones arriba; F3 fondo ISO (rodilla muy avanzada); F4 ascenso CON. Hindu squat = versión dinámica con balanceo de brazos y talones que se elevan.

| Articulación | Acción · plano | Músculos y rol | Contracción (F2 / F3 / F4) |
|---|---|---|---|
| Rodilla | Flexión profunda con rodilla muy avanzada → extensión · sagital | Cuádriceps **M**, recto femoral especialmente largo [C: cadera extendida + rodilla flexionada [L1]] | EXC / ISO / CON |
| Cadera | Neutra (0°), **isométrica** | **Flexores de cadera (recto femoral e iliopsoas) M-ISO**: con el cuerpo reclinado, la gravedad empuja la cadera hacia la extensión y son ellos los que la frenan. El recto femoral trabaja en los dos extremos (extiende la rodilla y sostiene la cadera), por eso se siente tanto en el muslo de adelante. Glúteo mayor: co-contracción para mantener la línea (no dejar que la cadera se flexione) [R] | ISO |
| Tobillo/pie | Plantiflexión sostenida (talones arriba), apoyo en antepié | Gastrocnemio y sóleo **Est-ISO**; flexores de dedos e intrínsecos del pie **Est** | ISO |
| Columna lumbar | Neutro | Abdominales y erectores **Est** | ISO |

**Evidencia.** **No hay estudio de sissy squat** entre las fuentes leídas. Por mecánica: con la rodilla muy adelantada y en flexión profunda, lo que sube es la **carga sobre la rótula y el tendón rotuliano** [40][41]; las cargas de LCA de sentadilla aparecen sobre todo entre 0-60° de flexión y son chicas en valor absoluto [40][41]; en el fondo trabaja más el **LCP** (cizalla posterior) [41]; con las rodillas libres, el torque de rodilla sube y el de cadera baja [45]; la flexión profunda sube la demanda del extensor de rodilla [46]; la sentadilla con talones arriba requirió ≈157° de flexión de rodilla [56]. Conclusión: ejercicio de **máxima demanda de cuádriceps con palanca larga** [C]; **no hay datos de seguridad**; prudencia con dolor rotuliano o del tendón [C].

**3. Por qué progresa.** Rango (parcial → full), asistencia con apoyo de mano, ángulo de la línea del cuerpo (palanca), carga W, una pierna (OL), tiempo bajo tensión en la fase EXC.

**4. Compensaciones.** Quebrar la cadera hacia atrás (acorta la palanca y roba demanda al cuádriceps [45]); hiperextensión lumbar; elevar el talón demasiado temprano; valgo; sacudir el torso para volver.

**5. Cues.** "Rodillas y hombros en una línea." "Empujá el piso con el antepié." "Bajá lento, no rebotes en el fondo." [C]

**6. Banderas de la ruta** (más las transversales de la sección 3). Dolor en la parte delantera de la rodilla o en el tendón debajo de la rótula que aparece o persiste ([40][59]: la hipótesis mecánica es sobrecarga de la rótula y su tendón; nota interna); molestia en tendón rotuliano que empeora con cada sesión [C]; cualquier chasquido doloroso.

---

##### A5. SU — Step Up (PQ, PSU, step down, step out, speed skater; también la versión HIP)

**Códigos sin verificar:** **PQ** y **PSU** (ver 1.4). Hipótesis: PSU = pistol step-up. Preguntar. La parte HIP de SU (step up box, step down, shuffle, side) comparte mecánica; solo cambia altura del cajón y trayectoria.

**1. Fases:** F1 apoyo del pie en el cajón y carga → F2 ascenso CON (extensión de cadera y rodilla de la pierna del cajón, plantiflexión) → F3 bloqueo ISO → F4 descenso (step-down) **EXC** (flexión controlada de rodilla y cadera, DF) → F5 toque suave.

| Articulación | Acción · plano | Músculos y rol | Contracción (F2 / F4) |
|---|---|---|---|
| Cadera | Extensión → flexión · sagital | Glúteo mayor **M**; aductor mayor, isquios **S** | CON / EXC |
| Cadera | Control pélvico · frontal | Glúteo medio/menor, TFL **Est** (esencial en el apoyo en cajón) | ISO-EXC |
| Rodilla | Extensión → flexión · sagital | Cuádriceps **M**: concéntrico al subir, **excéntrico** al bajar | CON / EXC |
| Tobillo | DF ↔ plantiflexión · sagital | Sóleo/gastrocnemio **S-CON** al subir, **Est-EXC** al bajar | CON / EXC |
| Pierna libre | Flexión de cadera y rodilla (balanceo) | Flexores de cadera **S** | CON / ISO |

**Evidencia.** Step-up frontal vs sentadilla monopodal: el step-up activó menos glúteo mayor y medio que la monopodal (n=18) [50]. Step-up lateral >45% MVIC en vasto medial oblicuo (n=30) [25]. Carga de LCA en step-up/down y sentadilla es mayor cerca de 30° de flexión (pero bajas en absoluto) [40]. Una banda que tira la rodilla hacia adentro **aumentó** el valgo pico en el step-up frontal [50].

**3. Por qué progresa.** Altura del cajón (más flexión inicial y más demanda de cadera/rodilla [BI2]); tempo EXC en el step-down; peso W; menos ayuda de la pierna de abajo (rebote); trayectoria (lateral, shuffle); salto; PSU/PQ = unilateralidad extrema (hipótesis).

**4. Compensaciones.** Empujar con la pierna de abajo (la pierna del suelo "hace trampa"); cadera que se levanta o cae; valgo [BI5]; tronco inclinado a un lado; talón del cajón que despega.

**5. Cues.** "Todo el pie sobre el cajón, empujá con el talón." "Subí sin impulso de la pierna de abajo." "Bajá en 3 segundos tocando el suelo apenas." [C]

**6. Banderas de la ruta** (más las transversales de la sección 3). Dolor de rodilla al subir y bajar escaleras que persiste [59]; dolor lateral de rodilla o cadera en el apoyo [C].

---

#### TI-B. LOWER | HIP DOMINANT

##### B-DS. DS — Dragon Squat (DS, DP, Dragon HT)

**Advertencia de definición.** El repo confirma el nombre (Dragon Squat) pero no lo describe. En calistenia se conoce como una sentadilla monopodal cuya pierna libre pasa por **detrás** del cuerpo (cruzada o colgando atrás), no adelante como en el pistol. **No encontré ninguna fuente primaria ni de revisión sobre el dragon squat**; lo siguiente es inferencia [C] y debe confirmarse con Nacho. "DP" probablemente = dragon pistol (hipótesis).

**1. Fases (inferidas):** F1 apoyo en una pierna, la libre cruzada atrás → F2 descenso EXC con inclinación de tronco adelante (contrapeso de la pierna trasera) → F3 fondo ISO → F4 ascenso CON → F5 bloqueo.

| Articulación | Acción · plano | Músculos y rol | Contracción |
|---|---|---|---|
| Cadera de apoyo | Flexión → extensión · sagital | Glúteo mayor **M**; aductor mayor, isquios **S** | EXC / ISO / CON |
| Cadera de apoyo | Control frontal y rotación (la pierna libre cruzada tiende a rotar la pelvis) | Glúteo medio/menor, TFL, rotadores **Est** | ISO-EXC |
| Rodilla de apoyo | Flexión → extensión · sagital | Cuádriceps **M** (menos momento que en pistol si el tronco se inclina [45]) | EXC / ISO / CON |
| Tobillo de apoyo | DF → plantiflexión | Sóleo **EXC/CON** | EXC / CON |
| Cadera libre | Extensión mantenida y aducción/rotación | Glúteo mayor y aductores de la pierna libre **Est-ISO** | ISO |
| Pelvis/lumbar | Antirrotación y neutralidad | Oblicuos, erectores, cuadrado lumbar **Est** | ISO |

**Por qué lo clasifican "hip dominant":** con la pierna libre detrás, el centro de masa se retrasa y el tronco se inclina; eso corre el momento hacia la cadera [45][40][C]. Es coherente con el hallazgo de que ejercicios unilaterales con cadera dominante demandan más glúteo [51][52].

**3. Progresión.** Rango (parcial → full), asistencia (DP assisted), caja, carga W, salto, "shuffle" (desplazamientos). **4. Compensaciones.** Rotación pélvica por la pierna libre; valgo; talón que despega; lumbar que se flexiona al fondo. La cadera de apoyo queda en flexión + aducción + rotación interna (la posición que más comprime la parte anterior de la cadera): progresar el rango lento y no forzar si da pinchazo en la ingle [C]. **5. Cues.** "Cadera atrás, pecho adelante." "Pelvis cuadrada, no dejes que la pierna de atrás te gire." "Apretá el glúteo de la pierna de apoyo." [C] **6. Banderas de la ruta** (más las transversales de la sección 3). Dolor anterior de rodilla persistente [59]; pinchazo en la ingle en flexión profunda con rotación (ver sección 3, cadera) [94]; dolor lumbar que baja a la pierna (ver sección 3, columna) [96].

---

##### B-HT. HT — Hip Thrust (puente de glúteo, on box, anillas, slide, OL)

**1. Fases:** F1 setup (escápulas apoyadas en banco/piso, pies apoyados) → F2 ascenso CON (extensión de cadera hasta bloqueo (extensión completa), tibias verticales) → F3 **pico ISO** (pelvis en retroversión, cadera extendida) → F4 descenso EXC.

| Articulación | Acción · plano | Músculos y rol | Contracción (F2 / F3 / F4) |
|---|---|---|---|
| Cadera | Extensión (hasta ~0°) · sagital | Glúteo mayor **M** (fibras superiores e inferiores); isquios **S**; aductor mayor **S** | CON / ISO / EXC |
| Cadera/pelvis | Estabilidad frontal y rotación (muy exigida en OL) | Glúteo medio/menor, TFL **Est**; oblicuos **Est** | ISO |
| Rodilla | ~90° flexión mantenida en el pico | Cuádriceps **activo** (en [60] el vasto lateral no difirió de la sentadilla: 99,5% vs 110% MVIC de media; más demanda con los pies cerca); isquios **Ant/S** | ISO |
| Tobillo | Neutro, apoyo de pie | Sóleo/gastrocnemio **Est** | ISO |
| Columna lumbar | Neutral, evita hiperextensión | Recto abdominal y oblicuos **Est-ISO** (frenan anteversión); erectores **Est** | ISO |

**Evidencia.**
- HT con barra vs sentadilla trasera, 10RM estimado, 13 mujeres entrenadas: media de glúteo mayor superior 69,5% vs 29,4%; inferior 86,8% vs 45,4%; bíceps femoral 40,8% vs 14,9%; vasto lateral sin diferencia (99,5% vs 110%) [60].
- 12 atletas hombres, carga 3RM: el pico de EMG de glúteo mayor fue mayor en el HT que en sentadilla y en split squat, con fuerza de reacción menor [61].
- 20 mujeres, 80% 1RM: HT mayor activación en el **tercio superior** del rango (bloqueo) en glúteo mayor, vasto lateral e isquios; la RFESS (búlgara) mayor en el **tercio inferior**; en todo el recorrido la RFESS dio más vasto lateral (59,4% vs 43,6%) [62].
- Entrenamiento 9 semanas, 34 no entrenados: hipertrofia glútea **similar** entre HT y sentadilla; la sentadilla hizo crecer más cuádriceps y aductores; el EMG mayor del HT no predijo consistentemente la hipertrofia [63].
- **Lectura honesta:** el HT carga la cadera en rango corto (bloqueo) y es muy bueno para activar glúteo; no hay evidencia de que sea "mejor" que la sentadilla en resultado. **Evidencia mixta**, muestras chicas, mayoría mujeres entrenadas/atletas.
- En un estudio de 10 ejercicios de isquios, el puente con rodillas flexionadas tuvo de las menores razones BF/mediales (más isquios mediales) [68].

**3. Por qué progresa.** Rango (puente bajo en piso → hombros sobre banco/caja → talones elevados); carga (W, barra); unilateral (OL: duplica carga relativa y exige glúteo medio y control pélvico [C]); palanca de isquios (anillas/slide: la pierna se aleja → más demanda de isquios y flexores de rodilla en cadera extendida [C], coherente con que isquios mediales dominan en puente [68]); explosividad (HT EXP).

**4. Dónde se siente / compensaciones.** Glúteo, isquios (según distancia de pies). **Lumbar que compensa**: hiperextensión al bloqueo con costillas abiertas y pelvis en anteversión (se siente en lumbar y se "pierde" el glúteo) [C]; pies muy lejos → isquios, muy cerca → cuádriceps [C]; rodillas que colapsan; en OL: rotación y caída de la pelvis libre; cuello hiperextendido; calambre de isquios: alejar un poco los pies o bajar la cadera (no es bandera) [C].

**5. Cues.** "Mentón al pecho, costillas abajo." "Empujá con los talones, tibias verticales arriba." "Pausa de 1 segundo apretando." "Pelvis en retroversión al subir." [C]

**6. Banderas de la ruta** (más las transversales de la sección 3). Dolor lumbar localizado al extender, o que baja a la pierna con adormecimiento o debilidad (ver sección 3, columna) [96][103]; dolor en la parte alta de atrás del muslo, cerca del isquion, que persiste o con tirón súbito [C].

---

##### B-NC. NC — Nordic Curl (y el resto de la ruta: bisagra, jefferson, gemelos)

La ruta NC mezcla 4 grupos. Se tratan por separado.

###### B-NC-1. Nordic hamstring curl (NC, NC BENT, NC OL, assisted, full rom W)

**1. Fases:** F1 arrodillado, tobillos fijos, cuerpo rígido (cadera extendida, columna neutra) → F2 caída hacia adelante con **control excéntrico** de isquios sobre la rodilla (gravedad ejerce momento extensor sobre la rodilla) → F3 punto de pérdida de control (suelta y amortigua con manos) → F4 retorno (ayudado por brazos en el nivel básico; CON de isquios en niveles altos).

| Articulación | Acción · plano | Músculos y rol | Contracción (F2 / F4) |
|---|---|---|---|
| Rodilla | Extensión pasiva por gravedad (sentido anterior), freno por flexores · sagital | Bíceps femoral (largo y corto), semitendinoso, semimembranoso **M-EXC**; gastrocnemio, grácil, sartorio **S** | EXC / CON (si hay retorno propio) |
| Cadera | Neutra mantenida (extensión isométrica) | Glúteo mayor, aductor mayor e isquios largos **Est-ISO** | ISO |
| Columna lumbar y pelvis | Neutro; evita hiperextensión y quiebre en cadera | Erectores, abdominales **Est-ISO** | ISO |
| Tobillo | Fijo (plantiflexión leve) | Peso/ancla; gastrocnemio **S** | ISO |

**Evidencia.**
- **Preferencia muscular**: en 24 hombres, el nordic mostró de las menores razones bíceps femoral/mediales; la **resonancia magnética funcional** mostró que en el nordic se activa más el **semitendinoso**; en cambio la extensión de cadera a 45° activó selectivamente el bíceps femoral largo [68].
- **Hipertrofia específica por ejercicio** (n=42, 12 semanas, 34 sesiones): el nordic hizo crecer **1,9 veces más que el LSET** los flexores de rodilla que **no** extienden la cadera, mientras que el entrenamiento excéntrico de curl en cadera flexionada (LSET) hizo crecer **2,2 veces más que el nordic** los que sí la extienden (n=42: 14 por grupo, incluido un grupo control); el bíceps femoral largo creció +19% con LSET vs +5% con nordic [69]. O sea: el nordic **no** es el mejor para el bíceps femoral largo, el isquio más lesionado en sprint.
- **Prevención de lesiones**: meta-análisis (15 estudios, 8459 atletas): RR 0,49 (IC95 0,32–0,74) a favor de programas que incluyen nordic; con 8 RCT, RR 0,52 (0,32–0,85); sin estudios de alto riesgo de sesgo, 0,55 (0,34–0,89) [64]. RCT de 942 futbolistas daneses: tasa de lesión 3,8 vs 13,1 por 100 jugador-temporada, RR 0,293 (0,150–0,572) [66]. **Pero**: una reevaluación metodológica con solo RCT que aleatorizaron al nordic (5 + 1 actualización) halló RR 0,56 (0,20–1,52) y 0,59 (0,27–1,29): **evidencia inconclusa, mucho riesgo de sesgo, a lo sumo recomendación condicional para fútbol** [65]. En los estudios, el nordic suele ir **dentro de programas multi-ejercicio**: su efecto aislado no se puede separar [64].
- **Factores de riesgo**: fuerza excéntrica en nordic <337 N (RR 4,4) y fascículos de bíceps femoral largo <10,56 cm (RR 4,1) elevaron el riesgo de lesión de isquios en 152 futbolistas de élite (27 lesiones) [67].
- **Dolor y daño**: una sola sesión de 24 repeticiones redujo la fuerza excéntrica hasta el día 3, el rango pasivo hasta el día 4 y causó dolor muscular los días 2–3; tras 4 semanas la segunda sesión dañó menos (efecto de repetición) (n=13 hombres entrenados) [71]. Volúmenes altos y subidas rápidas aumentan dolor muscular tardío y dolor no-DOMS (n=40) [72].

**3. Por qué progresa.** La palanca: cuanto más horizontal el cuerpo, mayor el brazo de momento de la gravedad sobre la rodilla [C, física]. Se progresa **recortando asistencia** (banda, manos, rango parcial "BENT"), aumentando amplitud, carga (W), pasando a una pierna (OL) y retardando el excéntrico. NC BENT = flexión de cadera reduce el brazo de palanca [C].

**4. Dónde se siente / compensaciones.** Cara posterior del muslo (isquios) en excéntrico. Compensaciones: **quebrar en la cadera** ("pike") para acortar la palanca [C]; **hiperextensión lumbar** ("banana") para mantener la altura del torso [C]; piernas asimétricas/pelvis rotada [C]; soltar de golpe (pierde la fase excéntrica); dolor de rodilla por apoyo rotuliano al arrodillarse: poner colchoneta doble (bandera solo si duele igual con apoyo blando) [C].

**5. Cues.** "Cuerpo recto de rodillas a cabeza." "Apretá los glúteos." "Frená la caída lo más lento posible." "Caé con las manos, no con la cara." [C]

**6. Banderas de la ruta** (más las transversales de la sección 3). Pinchazo o tirón agudo en la parte de atrás del muslo o en el glúteo durante la ejecución, a veces con chasquido → cortar y derivar en el día (ver sección 3, isquios) [C]; dolor persistente en la parte alta de atrás del muslo [C]. **URGENCIA (guardia, no kinesiólogo):** orina oscura (color té o coca), dolor muscular desproporcionado, hinchazón o debilidad marcada 24-72 h después de una sesión excéntrica nueva o de mucho volumen (nordic, sissy, saltos) [C] (ver sección 3, nivel a). Primera sesión de nordic: volumen bajo (el daño y el dolor son medibles incluso con 24 repeticiones en hombres entrenados [71]; los volúmenes altos y crecientes dan más dolor [72]).

###### B-NC-2. Bisagra: deadlift, good morning, deadlift OL, deadlift to clean

**Fases:** F1 parado/apoyado → F2 bisagra EXC (cadera flexiona por inclinación pélvica, rodilla leve flexión, columna neutra) → F3 fondo ISO → F4 extensión CON → F5 bloqueo.

| Articulación | Acción · plano | Músculos y rol | Contracción |
|---|---|---|---|
| Cadera | Flexión → extensión · sagital | Glúteo mayor **M**; isquios y aductor mayor **S** (largos en el fondo) | EXC / ISO / CON |
| Rodilla | Flexión leve, fija | Isquios **Est-S**; cuádriceps **Est** | ISO |
| Lumbar | Neutro | Erectores **Est-ISO** (alto en bisagra), abdominales **Est** | ISO |
| Tobillo | DF leve | Sóleo **Est** | ISO |
| Cadera (OL) | Estabilidad frontal | Glúteo medio/menor **Est** | ISO |

Evidencia: el peso muerto monopodal tuvo la mayor activación de glúteo mayor entre 12 ejercicios (n=21) [49]; sumo vs convencional: sumo con tronco más vertical y momento de DF de tobillo; convencional: 25-40% más trabajo mecánico total y momentos de extensores de cadera y rodilla, flexor de rodilla y plantiflexor; sumo: momento dorsiflexor de tobillo; momentos de cadera sin diferencia (n=12 + 12 levantadores) [44]. Compensaciones: redondear lumbar; transformar la bisagra en sentadilla; hiperextensión final. Cues: "Empujá la cadera hacia atrás como cerrando una puerta con la cola." "Pecho largo." "Cuando subís, el piso se aleja." [C]. Banderas de la ruta: dolor lumbar que baja a la pierna, entumecimiento o debilidad (ver sección 3, columna) [96].

###### B-NC-3. Jefferson curl (JEFFERSON OL, slantboard, deep sq to jefferson)

**Qué es:** flexión vertebral segmentaria lenta con carga, de pie, hasta que el tronco cuelga. **No hay ningún estudio de jefferson curl en las fuentes leídas.** Lo más cercano: modelos de laboratorio. Columna porcina (cervical C3-C4): la **flexo-extensión repetida** con compresión moderada produjo hernia discal, y más compresión → más hernias y más graves (segmentos cervicales porcinos, in vitro) [97]; la hernia progresó por clefts en el anillo [98]. **Extrapolar a una columna lumbar humana viva con carga lenta y progresiva es especulativo**: ni "peligrosísimo" ni "seguro" está demostrado. Práctica de coaching: cargas bajas, progresión lenta, no en personas con dolor lumbar [C]. **No prescribir Jefferson ni flexión de columna cargada** sin aval de un profesional en personas con osteoporosis u osteopenia conocida, antecedente de fractura vertebral, hernia de disco (reciente o diagnosticada: el kinesiólogo autoriza la flexión con carga antes de empezar) o síntomas radiculares (ver sección 3, columna); en mujeres posmenopáusicas y personas mayores, preguntar antes [R]. Aplica también a PIKE con peso y a "deep sq to jefferson". Banderas de la ruta: ver sección 3, columna.

###### B-NC-4. Calf raises / horse stance

Elevaciones de gemelos: de pie con rodilla extendida: **gastrocnemio y sóleo M**; con rodilla flexionada (sentado, soleo squat, horse stance): el gastrocnemio queda acortado y aporta menos, así que **predomina el sóleo**; CON al subir y EXC al bajar [L1][R]. El esfuerzo relativo de plantiflexores sube con la carga externa [46]. Horse stance (base ancha): momento de DF de tobillo y mayor demanda de aductores/rotadores [43][C].

**Banderas de la ruta (calf raises).** Dolor y rigidez en el tendón de Aquiles a la mañana o al arrancar, que dura más de 2-3 semanas o empeora sesión a sesión; bulto o engrosamiento doloroso del tendón → derivar y bajar saltos/pogo. **URGENCIA:** sensación de patada o pedrada en la pantorrilla o el talón durante un salto o un arranque, con dificultad para empujar con el pie → cortar, no apoyar, guardia el mismo día (ver sección 3, nivel a) [R]. Los umbrales de tiempo los valida un kinesiólogo humano ⚑H.

---

##### B-PSS. Variantes HIP de otras rutas: sumo squat (PS), quad on box/seiza (QC), step up (SU)

- **Sumo squat** (PS en hip dominant): base ancha (≈170% del ancho de hombros) y pies rotados: muslos más horizontales, tibias más verticales, **momento de DF de tobillo** y mayores momentos de rodilla y cadera que en base angosta (n=39 levantadores de powerlifting; 2D vs 3D) [43]; en sentadilla (10 levantadores) la base ancha dio mayores compresiones tibiofemoral y patelofemoral y mayor tensión de LCP que la angosta, mientras la angosta dio más gastrocnemio [42]; con 12RM el pico patelofemoral fue 4313–4674 N (ancha) vs 3958–4246 N (angosta) [40]. Aductor mayor: sinergista de extensión [L1] (**sin EMG leído**).
- **Quad on box / seiza up and down (QC en hip):** ver A3.
- **Step up (SU en hip):** ver A5.

---

#### TI-C. MOVILIDAD

##### C0. Marco común de movilidad: qué limita el rango y qué hace el estiramiento

- **Qué limita el rango** (tres familias): (1) **articular/óseo** (forma de la cabeza femoral, acetábulo, versión; topes óseos) [94][L1]; (2) **muscular/tejido conectivo** (rigidez pasiva del músculo-tendón, fascia); (3) **neural/sensorial** (tolerancia al estiramiento; tensión del sistema nervioso) [90][92][104].
- **Estiramiento: ¿se alarga el músculo o cambia la sensación?** Revisión de Weppler & Magnusson: el músculo se alarga durante el estiramiento pero el cambio es temporal; las ganancias de una sesión y de programas de 3 a 8 semanas se explican por **modificación de la sensación** (tolerancia), no por cambio estructural; efectos de >8 semanas no evaluados en esa revisión [90]. Meta-análisis más nuevo (65 estudios, 1542 adultos): el estiramiento estático crónico bajó la rigidez (g=0,37) y **subió la tolerancia al estiramiento** (g=0,74, torque máximo tolerable); ni el estiramiento agudo ni el crónico cambió la longitud fascicular; la mejora de rango se asoció con menor rigidez y con más tolerancia [92].
- **Dosis y técnica**: meta-análisis de 77 estudios: estiramiento estático y PNF dieron más rango a largo plazo que balístico/dinámico (efecto moderado); ni volumen, ni intensidad, ni frecuencia moderaron el resultado; las mujeres ganaron más rango que los hombres [91]. Mejoras agudas de rango duran típicamente <30 min; ≥60 s de estático por grupo muscular se asoció a −4,6% de rendimiento inmediato vs −1,1% con <60 s; estirar dentro de un calentamiento con actividad dinámica posterior tiene efecto insignificante sobre el rendimiento [89]. ACSM: un total de 60 s por ejercicio (puede repartirse en series), ≥2 días/sem para mantener rango [88].
- **Flexibilidad activa vs pasiva** [C: definiciones de manual]: pasiva = rango que se logra con ayuda externa; activa = rango que el propio alumno logra con fuerza de agonistas. Por eso hay ISO y STRENGTH en el catálogo (p.ej. "SPAGAT STRENGTH ISO"): el rango pasivo sin fuerza que lo controle no se "posee"; en coaching se considera que "colgarse" de ligamentos y cápsula en ese rango es riesgoso, pero **no hallé evidencia leída que lo pruebe** [C].
- **Neural**: técnicas neurodinámicas mejoraron la flexibilidad de isquios (13 ECA, n=624; SMD 1,01 inmediato, 1,21 corto plazo) y superaron al estático a corto plazo, con heterogeneidad [104].
- **Seguridad general**: el estiramiento estático no mostró efecto claro sobre lesiones totales ni por sobreuso, aunque la revisión recomienda incluir estiramiento dentro de una entrada en calor con actividad dinámica posterior para reducir lesiones musculares y ganar rango, con efecto mínimo sobre el rendimiento [89].

---

##### C1. SPAGAT — splits y estiramientos de cadera

Incluye: spagat frontal (full/assisted/delta/omega), couch stretch, pigeon, warrior, gentleman, 90-90, diagonal stretch, quad stretch de pie, isquios acostado.

**1. Fases:** F1 entrada controlada (ejercer fuerza para bajar) → F2 aproximación al rango final → F3 **sostén** (ISO pasiva o activa, 30–120 s) → F4 salida activa (CON de agonistas).

**2. Análisis articular** (spagat frontal)

| Articulación | Acción · plano | Tejido que se elonga / músculos y rol | Tipo |
|---|---|---|---|
| Cadera delantera | **Flexión** con rodilla extendida · sagital | **Isquios** (bíceps femoral, ST, SM) alargados **Al**; glúteo mayor; nervio ciático (tensión neural) [104] | Elongación pasiva; flexores de cadera **M** para elevar activamente (ISO-CON) |
| Cadera trasera | **Extensión** (hasta ~hiperextensión) · sagital | **Iliopsoas, recto femoral (si rodilla flexionada: couch)**, cápsula anterior/ligamento iliofemoral alargados [L1] | Elongación pasiva; glúteo mayor **M** para sostener |
| Rodilla delantera | Extensión | Cuádriceps **Est**; gastrocnemio (si el pie se dorsiflexiona) alargado | ISO |
| Pelvis | Neutra/cuadrada (evitar rotación y báscula) | Glúteo medio, oblicuos **Est** | ISO |
| Lumbar | Neutral | Erectores, abdominales **Est** | ISO |
| Pigeon/90-90 (pierna de adelante) | Flexión + rotación externa de cadera | Se alargan el **glúteo mayor** (por la flexión) y el **piriforme** (con la cadera muy flexionada se comporta como rotador interno, por eso la rotación externa lo estira) y la cápsula posterior. Los rotadores externos profundos (obturadores, gemelos, cuadrado femoral) **no** se estiran en esta posición. Si falta rotación externa de cadera, la rodilla de adelante recibe torsión: regresar (pie más cerca de la ingle o en caja) [L1][R] | Elongación pasiva |

**3. Qué limita (por orden de probabilidad)** [C a partir de C0]: tolerancia/sensorial y rigidez de isquios y flexores de cadera; tensión neural del ciático [104]; **y topes óseos/cápsula** (variantes de forma de cadera [94][95]). Bailarines preprofesionales jóvenes tuvieron más rotación externa pasiva y menos interna que no bailarines (n=60 + 31, edad media ≈12): no se puede separar si es entrenamiento o selección [107].

**4. Por qué progresa.** No hay "carga" sino **asistencia y rango**: asistido (delta/omega, bloques o cintas) → pierna doblada → pierna extendida → altura/full. Cambia la palanca con apoyo de manos o bloques bajo cadera. La mejora a corto plazo es principalmente de tolerancia [90][92]; la fuerza activa se entrena con ISO/CON en rango final.

**5. Dónde se siente / compensaciones.** Isquios (delantera), cara anterior de cadera y muslo (trasera). Compensaciones: **rotación pélvica** ("abrir la cadera" hacia el lado de la pierna trasera) [C]; rodilla trasera que gira hacia afuera; **hiperextensión lumbar** para "bajar más" [C]; **flexión lumbar** si isquios cortos [C]; pierna delantera en rotación externa para "ganar" rango [C]; hiperextensión de rodilla delantera; "colgarse" de ligamentos sin tono muscular.

**6. Cues.** "Caderas cuadradas hacia adelante." "Empujá el piso con ambos pies para activar." "Respirá largo; no rebotes." "Salí con la fuerza de la pierna, no con la espalda." [C]

**7. Banderas de la ruta** (más las transversales de la sección 3). Pinchazo profundo en la ingle (o el alumno se agarra el costado de la cadera con la mano en forma de C) al llegar al rango final, sobre todo en personas muy móviles [94][95]; dolor en la ingle o en la cara interna del muslo al cerrar las piernas con fuerza, al patear o en el cossack [93]; hormigueo o ardor que baja por la pierna [C]; dolor en el hueso de la nalga (zona del isquion) [C] → derivar. (Para el kinesiólogo: dolor relacionado con aductores/iliopsoas según [93]; dolor de origen articular de cadera [94][95].)

**Evidencia débil:** la mayoría de estudios de estiramiento usan poblaciones no atléticas y rangos agudos; sobre splits específicamente no hay trabajos revisados por pares leídos. La asociación "mucha movilidad + dolor profundo de ingle" es un reporte descriptivo [95].

---

##### C2. BRIDGE — puente de espalda (rueda)

Incluye: shoulder bridge, table, low/mid/full bridge, elbow bridge, wall bridge/wall walk, twist, OL/one arm, seal reps y seal push-up, cat-cow.

**1. Fases:** F1 supino, pies y manos apoyadas → F2 empuje CON (extensión de codos, hombros flexionados, cadera extendida) → F3 **pico ISO** (arco: extensión de torácica/lumbar/cadera, hombro ≈ flexión máxima, muñeca en extensión máxima) → F4 descenso EXC.

| Articulación | Acción · plano | Músculos y rol (y tejido alargado) | Contracción |
|---|---|---|---|
| **Hombro** (glenohumeral) | **Flexión máxima (≈180°)** + escápula con rotación superior y báscula posterior · sagital/escapular | Deltoides anterior, coracobraquial, serrato anterior, trapecio superior/inferior **M** (empuje); **dorsal ancho, pectoral mayor y menor, redondo mayor alargados** [L1] | CON / ISO / EXC |
| **Codo** | Extensión · sagital | Tríceps **M** | CON / ISO / EXC |
| **Muñeca** | **Extensión máxima (carga axial)** · sagital | Flexores de muñeca y dedos **alargados**; extensores **Est** | ISO |
| Columna torácica | Extensión · sagital | Erectores torácicos **S**; recto abdominal y pectorales **alargados**; **rango segmentario limitado** (costillas, apófisis espinosas) [L1] | ISO |
| Columna lumbar | **Extensión** · sagital | Erectores lumbares **S**; cuadrado lumbar **S**; recto abdominal y psoas **alargados** | ISO |
| Cadera | **Extensión** · sagital | Glúteo mayor e isquios **M**; iliopsoas y recto femoral **alargados** | CON / ISO / EXC |
| Rodilla / tobillo | Extensión / DF | Cuádriceps **M**; sóleo **Est** | ISO |

**Qué limita el rango (en orden de aparición habitual)** [C a partir de BI1 y [L1]]: (1) movilidad de hombro (flexión+escápula) y dorsal ancho/pectoral; (2) extensión **torácica**; (3) extensión de cadera (flexores); (4) extensión de muñeca; (5) la **lumbar es la que "se vende"**: si hombros, torácica y cadera no dan, el arco se concentra en 1–2 segmentos lumbares.

**Evidencia.** No hay estudios de rueda/bridge con carga lumbar en las fuentes leídas. Lo que sí hay: (a) la espondilólisis (fractura por estrés de la parte posterior de una vértebra lumbar; término clínico de uso interno) es más frecuente en deportes con **carga repetida, extensión y rotación**, compromete sobre todo L5 y suele diagnosticarse tarde (revisión narrativa de 50 trabajos) [103]; (b) **muñeca del gimnasta**: dolor de muñeca en hasta 79% de gimnastas, por carga axial repetida y extensión forzada en esqueleto inmaduro; dolor dorsal sobre la metáfisis radial, empeora con extensión, con extensión activa y pasiva limitada (revisión actual) [31]; (c) en push-up con hombros elevados ≈90° la escápula puede quedar en posición de pinzamiento (n=16) [102] (condición distinta: hombro a ≈90° con codos abiertos en push-up; no es la flexión completa del bridge; extrapolación débil) — sugiere cuidado con carga de hombro en rangos extremos [C].

**3. Por qué progresa.** Altura/rango: table → shoulder → low → mid → full (más hombro, más extensión torácica y de cadera); acercar manos a pies aumenta la demanda de extensión [C]; asimetría (OL/one arm) agrega control y rotación; wall walk (entrada/ salida gradual). Carga W: no aplica.

**4. Dónde se siente / compensaciones.** Se debería sentir **hombro/pecho/cadera abriéndose y glúteo activo**, no un pinchazo en la zona lumbar. Compensaciones: **hiperextensión lumbar concentrada en L4-L5/L5-S1** [C]; hombros "cerrados" (poca flexión) con codos abiertos; **cabeza colgando** (carga cervical); pies muy separados y rodillas en valgo/varo para compensar cadera [C]; muñecas con desviación radial/ulnar forzada; pérdida de empuje de glúteo (cadera baja).

**5. Cues.** "Empujá el piso con manos y pies a la vez." "Llevá los hombros sobre las muñecas." "Glúteos activos: abrí la cadera, no la espalda." "Relajá el cuello." [C]

**6. Banderas de la ruta** (más las transversales de la sección 3). Dolor lumbar localizado que se reproduce al arquear, sobre todo en menores de 20 que entrenan extensión repetida [103] (ver sección 3, columna y adolescentes); dolor lumbar que baja a la pierna, adormecimiento o debilidad (ver sección 3, columna) [96]; dolor del lado de atrás de la muñeca con carga o pérdida de extensión de la muñeca [31]; mareo, visión borrosa u hormigueo en los brazos con la cabeza colgando → cortar [C]; dolor de muñeca que sigue al día siguiente (en adolescentes, derivar) [31].

**Nota sobre banderas rojas:** las "banderas rojas" lumbares tienen **poca evidencia de exactitud diagnóstica** individual; son un marco de razonamiento clínico, no un detector [96].

---

##### C3. SIDE PCK — Side Pancake (OBLICUOS)

Flexión lateral de tronco con piernas abiertas (pancake), a una pierna, con carga, con giro, windmill.

**1. Fases:** F1 sentado/parado en base ancha → F2 inclinación lateral hacia una pierna: pasada la vertical, la gravedad hace el trabajo y el descenso lo **frenan en excéntrico el cuadrado lumbar y los oblicuos del lado contrario** (el costado que se estira); el lado hacia el que te inclinás solo trabaja en concéntrico si "tirás" activamente hacia abajo (versión activa) [R] → F3 **sostén** del rango (ISO) → F4 retorno: **concéntrico del lado contrario** [R].

| Articulación | Acción · plano | Músculos y rol (tejido alargado) | Contracción |
|---|---|---|---|
| Columna lumbar/torácica | **Flexión lateral** · frontal | Oblicuos, cuadrado lumbar e intertransversos **del lado contrario: M (EXC al bajar, ISO en el sostén, CON al subir)** y a la vez alargados (junto con la fascia toracolumbar); lado de la inclinación: M-CON solo en la versión activa; rango por segmento chico [L1][R] | EXC / ISO / CON |
| Cadera (ambas) | Abducción (base ancha) · frontal; cadera de la pierna hacia la que se inclina: flexión | **Aductores (grácil, largo, magno) alargados**; isquios mediales alargados | ISO pasiva |
| Rodilla | Extensión (straight) o flexión (bent) | Cuádriceps **Est**; isquios mediales **Ant** | ISO |
| Hombro (windmill/overhead) | Flexión | Deltoides, manguito **Est** | ISO |
| Pelvis | Neutra/cuadrada | Glúteo medio **Est** | ISO |

**Evidencia.** No encontré estudios del side pancake ni del windmill de oblicuos. Lo relacionado: en el puente lateral (side bridge, otro ejercicio) hubo activación de oblicuo externo y glúteo medio >45% MVIC en 30 sujetos [25] → la musculatura lateral del tronco es un estabilizador relevante de la pelvis. Para estabilidad lumbar, ningún músculo domina [101]. El resto: anatomía de manual [L1].

**3. Progresión.** Rango (parcial → full), pierna doblada → recta, peso W (estático/dinámico), unilateral (OL), giro (twist/windmill agregan rotación y control antirrotación [C]).

**4. Compensaciones.** Rotar el tronco en vez de inclinar lateralmente; flexión hacia adelante en lugar de lateral; cadera que se despega del suelo; rodilla que rota; colapso lumbar. **5. Cues.** "Costado largo, no te dejes caer." "Cadera pegada al piso." "Pecho al costado, no al piso." [C] **6. Banderas de la ruta** (más las transversales de la sección 3). Pinchazo o dolor en la cara interna de la ingle o del muslo (ver sección 3, cadera) [93]; dolor lumbar agudo, o que baja a la pierna (ver sección 3, columna) [96]; dolor medial de rodilla en variantes con pierna doblada [C].

---

##### C4. PIKE — pike y flexión de cadera (HIP DOMINANT/PIKE, 20)

Incluye pike sentado/parado, jefferson curl, box pike hang/squat, pancake W, head to toe, L-sit leg lifts (en CORE/PIKE), windmill.

**1. Fases:** F1 posición inicial → F2 **flexión de cadera** (pelvis en anteversión sobre fémures, rodillas extendidas) y flexión de tronco → F3 sostén ISO → F4 salida CON.

| Articulación | Acción · plano | Tejido que se elonga / músculos y rol | Contracción |
|---|---|---|---|
| Cadera | Flexión con rodilla extendida · sagital | **Isquios, glúteo mayor, fascia posterior alargados**; flexores de cadera (psoas, recto femoral) **M** (para activos) | Elongación pasiva / CON-ISO activa |
| Pelvis | Anteversión | Glúteo y isquios **Ant/Al**; flexores de cadera **M** | ISO |
| Columna lumbar | Flexión **evitable o permitida** según versión (pike vs jefferson) · sagital | Erectores **alargados**; abdominales **Est** | ISO-EXC |
| Rodilla | Extensión | Cuádriceps **Est** | ISO |
| Tobillo | DF si agarra el pie | Gastrocnemio **alargado** | Pasiva |

**Qué limita:** rigidez/tolerancia de isquios y fascia posterior, tensión neural del ciático [104], y topes óseos de cadera [94]. Pike activo (L-sit leg lifts) exige flexores de cadera concéntricos y rango de isquios simultáneamente (limitación por "insuficiencia activa" del agonista) [L1][C].

**Evidencia.** Ver C0: estiramiento y neurodinamia [89][91][92][104]. Para el **jefferson**: ver B-NC-3 (sin estudios directos; modelos in vitro [97][98]).

**3. Progresión.** Parcial → full rango; sentado vs parado (cadena cinética), a una pierna (OL), con peso (W), déficit (box pike hang). **4. Compensaciones.** **Flexión lumbar en lugar de flexión de cadera**; rodillas flexionadas; pelvis que se va hacia atrás en lugar de adelante; cuello hiperflexionado. **5. Cues.** "Cadera adelante y atrás, no redondeá la espalda." "Pecho al muslo con columna larga." "Sentí tensión en la parte posterior del muslo, no en la lumbar." [C] **6. Banderas de la ruta** (más las transversales de la sección 3). Hormigueo, ardor o "tirón eléctrico" que baja por detrás de la pierna al hacer pike → bajar rango y derivar si se repite (ver sección 3, columna) [96]; dolor en el hueso de la nalga (isquion) o tirón agudo atrás del muslo [C].

---

##### C5. REVERSE HYPER — extensión de cadera en prono (CORE POSTERIOR)

RH full / half / str / tuck / OL / donkey kick (cuerpo apoyado, piernas colgando, extender cadera).

**1. Fases:** F1 piernas colgando (cadera ≈90°; la lumbar se flexiona algo al fondo, ≈20° en máquina [100]; en la versión libre controlar ese rango) → F2 extensión de cadera CON hasta horizontal (rodillas extendidas en "str", flexionadas en "tuck") → F3 **pico ISO** → F4 descenso EXC (péndulo controlado).

| Articulación | Acción · plano | Músculos y rol | Contracción |
|---|---|---|---|
| Cadera | Extensión → flexión · sagital | Glúteo mayor e isquios **M**; erectores **Est-S** | CON / ISO / EXC |
| Lumbar | Neutro → leve extensión (**límite del rango**) | Erectores espinales **Est-ISO** (alto) | ISO |
| Pelvis | Retroversión leve al final | Glúteo mayor **S**; abdominales **Est** | ISO |
| Rodilla | Extensión (str) / flexión (tuck) | Cuádriceps / isquios **Est** | ISO |

**Evidencia.** (Estudios con **máquina** de reverse hyper; la versión del catálogo parece libre — transferencia no verificada [C].) Reverse hyperextension vs hiperextensión (10 sujetos): mayores EMG pico de erectores espinales, glúteo mayor y bíceps femoral con reverse hyper en extensión y flexión [99]; en otro estudio (20 sujetos, carga equivalente) la hiperextensión tuvo **más** activación integrada de glúteo mayor y bíceps femoral, y el reverse hyper **mayor momento lumbar pico (+129%)** pero **menos flexión lumbar** (20,4° vs 31,1°) y **más rango muslo–tronco** (76,6° vs 64,7°) [100]. **Resultados contradictorios** (distintos protocolos); el segundo describe al reverse hyper como patrón con "mayor rango de cadera y menos estrés angular lumbar" [100].

**3. Progresión.** Largo de palanca (tuck → str: más brazo de momento [C]); rango (half → full), unilateral (OL), explosividad (donkey kick), ISO largo. **4. Compensaciones.** Subir las piernas por **hiperextensión lumbar** en vez de cadera [C]; balancear con inercia; rotación pélvica en OL; flexión de rodillas. **5. Cues.** "Subí las piernas desde el glúteo, no desde la espalda." "Costillas abajo." "Frená en horizontal, no pases." [C] **6. Banderas de la ruta** (más las transversales de la sección 3). Dolor lumbar al extender, sobre todo si es de un solo lado y en adolescentes [103] (ver sección 3, columna y adolescentes); irradiación o entumecimiento (ver sección 3, columna) [96].

---

#### TI-D. FLOW (AF, Animal Flow)

**Evidencia:** busqué estudios de Animal Flow en PubMed/Europe PMC y **no encontré ninguno** (solo resultados no relacionados). Todo lo siguiente es análisis por posición y por tarea con fuentes de apoyo genéricas (cuadrupedia, push-up, muñeca de gimnasta). Los nombres son del catálogo (66 ejercicios en CARDIO, CORE, DESPLAZAMIENTO, ESTABILIDAD, MOVILIDAD, UPPER).

**Marco de fases (común):** F1 posición de entrada → F2 **transición** (CON/EXC dinámica entre posiciones) → F3 sostén (ISO) → F4 salida.

##### D1. Análisis por posición (hombro, muñeca, cadera, columna)

| Posición | Hombro | Muñeca | Cadera / rodilla | Columna / pelvis | Músculos clave y rol | Contracción |
|---|---|---|---|---|---|---|
| **Beast** (cuadrupedia con rodillas flotando) | Flexión ≈90° en carga; escápula protracción | Extensión cargada, rango alto (valor en grados sin verificar) [31][C] | Flexión de cadera ≈90°, rodilla flexionada | Neutra, antiextensión | Serrato anterior, pectoral, deltoides anterior **Est-ISO**; recto abdominal, transverso, oblicuos **Est-ISO**; cuádriceps **Est-ISO** [101] | ISO |
| **Beast walk / Bear walk / Lizard / Monkey** | Alternan carga contralateral | Cargada | Flexión-extensión alterna | Antirrotación | Oblicuos, glúteo medio **Est**; glúteo mayor, isquios **M** al impulsar | CON-ISO-EXC |
| **Crab** (mesa invertida) | **Extensión** de hombro con rotación ext. (cara anterior abierta) | Extensión con dedos hacia atrás | Extensión de cadera sostenida | Neutra/leve extensión | Tríceps, deltoides posterior, trapecio medio/inferior, romboides **Est/M**; glúteo mayor, isquios **M-ISO** | ISO-CON |
| **Ape / deep squat (hands to floor)** | Flexión | Cargada | **Flexión profunda de cadera y rodilla**; DF de tobillo | Flexión lumbar suave | Cuádriceps, glúteo mayor **M**; sóleo **Est** | EXC-CON |
| **Scorpion (reach)** | Variable | Carga unilateral | Flexión de cadera de la pierna que cruza + rotación | **Extensión y rotación lumbar/torácica** | Oblicuos, erectores, glúteo mayor **M-S** | CON-ISO |
| **Frogger / bunny hops / spider jump** | Soporte de carga | Soporte | Flexión/extensión explosiva de cadera y rodilla; aterrizaje | Neutro | Cuádriceps, glúteos, gemelos **M-CON**; serrato **Est** | CON-EXC (ver TI-E) |
| **Crow / frog / flying crow** | **Protracción máxima**; codo flexionado soporta rodillas | Extensión alta con carga del cuerpo (grados sin verificar) [C] | Flexión de cadera, rodillas contra tríceps | Cifosis activa | Serrato anterior, tríceps, flexores de muñeca/dedos (agarre) **Est-ISO**; core **Est** | ISO |
| **Cossack walk, side kick, side monkey** | — | — | **Abducción/aducción de cadera**; flexión profunda unilateral | Frontal | **Aductores alargados (EXC)**, glúteo medio **Est**; cuádriceps **M** | EXC-CON |
| **Wave unload, scorpion reach completo, primate** | Variable | Cargada | Variable | Movilidad segmentaria de columna | Erectores, abdominales **M-Est** | CON-EXC |

**Nota (crab).** El crab apoya los pies en el piso (como la "plancha invertida con talones apoyados"): no es el reverse planche de apoyo libre del tren superior (ver S3.3), donde el glúteo no sostiene las piernas.

**Apoyos de evidencia (todos indirectos):**
- En 31 hombres sanos, gatear en cuadrupedia y bird dog engrosaron el transverso del abdomen más que en supino; el bird dog engrosó más el erector espinal que todas las demás condiciones; el ejercicio de "heel off" estimuló más multífido y oblicuo interno (ecografía) [105].
- Alzamiento cuadrúpedo de brazo/pierna activó glúteo mayor >45% MVIC (n=30) [25].
- La estabilidad de columna depende de muchos músculos y cambia con la tarea [101].
- En push-up con hombros elevados ≈90° la escápula puede quedar en posición de pinzamiento (n=16) [102] (condición distinta: hombro a ≈90° con codos abiertos en push-up; extrapolación débil): precaución en posiciones cargadas con hombro muy flexionado (crow, bear con manos adelantadas) [C].

##### D2. Progresión, compensaciones, cues, banderas

**Progresión.** Más tiempo en la posición; más dificultad de transición; mayor rango (ape, scorpion); menor base de apoyo (beast, crow); más velocidad (cardio). No hay progresión lineal fija en el catálogo (nota PROGRESIONES: "AF = ¿no tiene progresión lineal?").

**Compensaciones.** **Muñecas** (dedos cerrados, peso en base de la mano, carga en extremo de extensión) [31]; hombros "colgados" (sin protracción) y escápula alada [C]; lumbar que se hunde (antiextensión perdida) [C]; cadera muy alta o muy baja en beast [C]; rodillas en valgo en frogger y ape [C]; cabeza hiperextendida.

**Cues.** "Empujá el piso lejos con las manos." "Abrí los dedos, repartí el peso en toda la mano." "Costillas hacia adentro, ombligo hacia arriba." "Caderas a la altura del hombro (beast)." [C]

**Banderas de la ruta** (más las transversales de la sección 3). Dolor dorsal de muñeca con carga o pérdida de extensión [31]; pinchazo anterior de hombro o sensación de "salida" (inestabilidad) [C]; dolor lumbar en scorpion con extensión y rotación [103][96]; pinchazo inguinal en flexión profunda de cadera (frog, ape) [94].

---

#### TI-E. PLYO (plyometría y saltos; también CARDIO/PLYO y KL/PLYO)

##### E0. Patrones en el catálogo (36 sin ruta + 31 CARDIO/PLYO + 2 KL/PLYO)

1. **Salto vertical bilateral**: squat jump, pop squat, deadlift to jump.
2. **Salto horizontal**: long jump (OL), deadlift to long jump.
3. **Reactivo / caída**: drop jump, box drop to SQ, reactive SQ on box/wall, reactive HT.
4. **Tobillo-dominante / rigidez**: calf jump, pogo (O.L, W, side to side), skipping 2/2.
5. **Unilateral**: bulgarian rebound, pop lunge, jump box O.L.
6. **Lateral**: skater, box side to side, speed skater.
7. **Desde posición estática sin contramovimiento**: seiza to squat jump, seiza to skater (no hay ciclo estiramiento-acortamiento previo; es concéntrico puro [C]).
8. **Caderas**: pike rebound.

##### E1. Fases del salto-aterrizaje

F1 **contramovimiento** (flexión de cadera, rodilla y DF; EXC) → F2 **amortiguación/transición** (ISO breve, aprovecha reflejo y elasticidad) → F3 **propulsión** (extensión triple de cadera-rodilla-tobillo; CON) → F4 **vuelo** → F5 **aterrizaje** (flexión de cadera, rodilla y DF; EXC) → F6 (reactivo) rebote inmediato.

| Articulación | Acción · plano | Músculos y rol | Contracción (F1 / F3 / F5) |
|---|---|---|---|
| Cadera | Flexión → extensión → flexión · sagital | Glúteo mayor, isquios **M**; aductor mayor **S**; glúteo medio/menor **Est** (frontal) | EXC / CON / EXC |
| Rodilla | Flexión → extensión → flexión · sagital | Cuádriceps **M** (esp. vastos); isquios **Est/A** | EXC / CON / EXC |
| Tobillo | DF → plantiflexión → DF · sagital | Gastrocnemio y sóleo **M** (resorte: tendón de Aquiles); tibial anterior **Est** | EXC / CON / EXC |
| Pelvis/lumbar | Neutro | Erectores y abdominales **Est** | ISO |

##### E2. Evidencia

- **Ciclo estiramiento-acortamiento (SSC):** comparado con acción concéntrica pura, un SSC no fatigante mejora la fuerza a una velocidad dada, con EMG concéntrico bajo y contribución importante del reflejo de estiramiento de latencia corta; la fatiga reduce ese reflejo y la rigidez muscular, empeorando la potenciación [86].
- **Eficacia:** meta-análisis de 26 estudios: el entrenamiento pliométrico mejoró la altura de salto vertical 4,7% (SJ), 8,7% (CMJ), 7,5% (CMJ con brazos) y 4,7% (DJ) en promedio [85].
- **Aterrizaje: estrategia de absorción.** Soft (flexión de rodilla ≈117°) vs stiff (≈77°) desde 59 cm (8 mujeres atletas): el aterrizaje rígido da mayor fuerza de reacción y los **plantiflexores** absorben más; en el blando, cadera y rodilla absorben más energía [82]. Con drop vertical jump (20 mujeres) el trabajo negativo medio fue −0,30 (cadera), −0,62 (rodilla) y −1,03 J/kg (tobillo); la contribución de cadera y rodilla se asoció a aterrizaje suave, la del tobillo con efecto contrario [83]. En drop jump (18 atletas): 30 cm da el mejor RSI y rigidez de pierna; a 45–60 cm sube la fuerza de impacto y el trabajo negativo y baja la eficiencia; a 30 cm conviene estrategia de rodilla, a 60 cm la de cadera por mayor disipación en tobillo [84].
- **Cargas absolutas:** aterrizaje bipodal de 60 cm: ≈253 N de LCA a 33–48°; compresión tibiofemoral de 4–8× peso corporal en drop jump de 60 cm y 12RM de sentadillas/zancadas; la desaceleración rápida carga más el LCA (≈1294 N al frenar corriendo) [40]. Por eso: progresión de intensidad (de bajo a alto) y de dificultad [40].
- **Prevención:** programas neuromusculares con fuerza, control proximal y múltiples ejercicios reducen lesiones de LCA en mujeres jóvenes (OR ≈0,32) [81]. Valgo al aterrizaje: ver BI5 (muestras chicas, sensibilidad/especificidad modestas [79][80]).
- **Pogo/gemelos/Aquiles:** no hay fuente leída sobre cargas de Aquiles en pogo; usar sentido común y progresión [C].

##### E3. Progresión, compensaciones, cues, banderas

**Progresión (NSCA, libro [L5], sin verificar página):** bilateral → unilateral; baja altura/amplitud → alta; contacto largo → reactivo (contacto corto); dirección vertical → horizontal → lateral; sin carga → carga ligera; sin desacople → con rebote.

**Compensaciones.** **Valgo al aterrizar** [79][80]; **aterrizaje rígido** (poca flexión de rodilla y cadera; en [82] 77° vs 117°: más fuerza de reacción y el tobillo absorbe más); talón que golpea primero; tronco que cae atrás; asimetría; contacto largo en pogo (pierde reactividad); aterrizaje ruidoso (mala absorción).

**Cues.** "Aterrizá silencioso." "Cadera atrás y abajo, rodillas sobre los pies." "Pecho sobre las rodillas." "En pogo: contacto corto, tobillo rígido, rodilla casi extendida." [C]

**Banderas de la ruta** (más las transversales de la sección 3). Dolor en la parte delantera de la rodilla o en el tendón debajo de la rótula que aparece o empeora tras saltos [59][C]; dolor y rigidez en el tendón de Aquiles a la mañana o al arrancar que dura más de 2-3 semanas o empeora sesión a sesión, o bulto doloroso → derivar y bajar saltos/pogo [C]; **URGENCIA:** sensación de patada o pedrada en la pantorrilla o el talón durante un salto o arranque (ver sección 3, nivel a) [C]; dolor en un punto del hueso de la tibia que aparece al saltar y después también al caminar o de noche → derivar [C]; rodilla que falla o se hincha (ver sección 3, rodilla) [C]; adolescentes: dolor en el bulto bajo la rótula, en la punta de la rótula o en el talón con saltos → derivar (ver sección 3) [C]; dolor lumbar que baja a la pierna tras aterrizar (ver sección 3, columna) [96].

---

#### TI-F. CARDIO (burpee, mountain climber, skipping, jacks, coordinativos)

**Evidencia general:** la intensidad interválica alta es una vía eficaz para adaptaciones aeróbicas y metabólicas, con menos volumen/tiempo si se compara con entrenamiento continuo (revisión narrativa de HIIT de bajo volumen) [87]; ACSM recomienda ≥150 min/sem de intensidad moderada o ≥75 min/sem de vigorosa y 2–3 d/sem de fuerza y neuromotor [88]. **No leí estudios de EMG o biomecánica del burpee ni del mountain climber** (mis búsquedas devolvieron solo estudios de test de burpee y respuestas fisiológicas que no abrí). Lo siguiente es análisis por patrón [C] con apoyo de BI1–BI5.

| Patrón (catálogo) | Fases | Articulaciones y músculos clave | Riesgo/compensación |
|---|---|---|---|
| **Burpee y variantes** (burpee, 1/2 burpee, burpee box jump, inchworm burpee, burpee to lizard) | Sentadilla EXC → apoyo de manos → salto atrás a plancha → (push-up) → salto adelante → salto vertical | Cadera/rodilla/tobillo (E-CON-EXC); hombro y muñeca en carga; lumbar antiextensión (abdominales, glúteos) | Lumbar que se hunde en plancha; aterrizajes duros en retorno; valgo; muñeca cargada [31][BI5] |
| **Mountain climber y variantes** (MC cross, semicircle, switch, plank skier, plank jack) | Plancha ISO; alternar flexión de cadera/rodilla (CON de flexores de cadera, EXC de extensores del lado apoyado) | Recto abdominal, oblicuos, transverso **Est-ISO** (antiextensión); psoas/recto femoral **M-CON**; serrato, deltoides **Est** | Cadera alta (pierde carga abdominal), lumbar colapsada, hombro retraído |
| **Skipping / pogo / jumping jacks / skater / step touch** | Contacto breve → vuelo; frontal/sagital | Plantiflexores y cuádriceps **M-reactivos**; glúteo medio **Est** (skater) | Aterrizaje rígido; valgo en skater [79][82] |
| **Coordinativos** (squat square walk, SQ step touch, jumping jack criss cross) | Patrón en el suelo | Equilibrio, coordinación, glúteo medio | Menos riesgo; foco motor |

**Cues.** "Mantené la plancha firme al saltar atrás." "Aterrizá suave." "Respiración rítmica." [C] **Banderas de la ruta** (más las transversales de la sección 3). Dolor lumbar que baja a la pierna (ver sección 3, columna) [96]; dolor de muñeca con carga [31]; **EMERGENCIA:** dolor, opresión o ardor en el pecho, falta de aire desproporcionada al esfuerzo, palpitaciones irregulares, mareo intenso o desmayo durante o justo después del esfuerzo → cortar ya, no dejar que se vaya solo, llamar a emergencias; si se repite aunque sea leve, apto médico antes de volver (ver sección 3, nivel a) [R].

---

#### TI-G. KL (kettlebell)

Incluye swing (2 manos, 1 mano, cross, side, atlas, touch floor), swing jump/180°, waiter clean, around the body, clean/jerk, snatch (lunge, sq, touch floor), press up.

##### G1. Swing (patrón de bisagra balística)

**Fases:** F1 **hike** (campana atrás entre piernas, bisagra de cadera con tronco inclinado, isquios EXC) → F2 **drive** (extensión explosiva de cadera, CON glúteo mayor e isquios) → F3 **flotación** (campana a la altura del pecho; brazos pasivos; cuerpo en "plancha de pie") → F4 **caída y captura** — la campana baja y la cadera se flexiona: los **extensores de cadera (glúteo mayor, isquios, aductor mayor) frenan en excéntrico** y cargan el próximo impulso (ciclo estiramiento-acortamiento); los flexores de cadera, como mucho, inician la bisagra con una contracción concéntrica breve ("meter la cadera atrás") y no frenan nada [R].

| Articulación | Acción · plano | Músculos y rol | Contracción (F1 / F2 / F4) |
|---|---|---|---|
| Cadera | Flexión → extensión explosiva → flexión · sagital | Glúteo mayor, isquios **M**; aductor mayor **S** | EXC / CON / EXC |
| Rodilla | Flexión leve ≈20–30° (mínima) [C] | Cuádriceps **S-Est**; isquios **Est** | ISO |
| Lumbar | Neutro, antiflexión | Erectores y abdominales **Est-ISO** (pulsos) | ISO |
| Hombro | Flexión pasiva por la campana | Dorsal ancho, deltoides **Est-ISO** | ISO |
| Antebrazo/mano | Agarre | Flexores de dedos **Est** | ISO |

**Evidencia.**
- **Cargas de columna** (McGill & Marshall, 7 hombres + 1 instructor, campana de 16 kg): el swing crea un patrón "hip-hinge squat" con ciclos rápidos de activación-relajación; ≈50% MVC de erectores lumbares y ≈80% MVC de glúteos; ≈3200 N de compresión lumbar; cizalla **posterior** de L4 sobre L5 (opuesta a un levantamiento tradicional); "algunos individuos creen que restaura la espalda y unos pocos que irrita tejidos" [73].
- **Demanda mecánica** (16 hombres): impulso neto del swing de 32 kg ≈276 N·s vs 183 N·s de sentadilla al 60% 1RM y 231 N·s de jump squat al 40% 1RM; fuerzas pico y medias menores que en sentadillas pero potencia mayor que sentadilla y comparable al jump squat [74].
- **Adaptaciones** (21 hombres, 6 semanas, 2/sem): swing y jump squat mejoraron 1RM de media sentadilla (9,8%) y altura de salto (19,8%) sin diferencia entre grupos [75].
- **EMG:** 23 sujetos, swing 2 manos y 1 mano: glúteo mayor ≈75% MVIC pico, glúteo medio ≈55%, bíceps femoral ≈79%; el bíceps femoral se activa **primero**; correlación moderada entre largo pasivo del flexor de cadera y activación de glúteo mayor [76]. En 14 sujetos, el swing "hip hinge" activó más isquios que el "squat swing" y que el de "doble extensión de rodilla"; los isquios mediales más que el bíceps femoral [77]. **Contradicción parcial:** el bíceps femoral aparece alto en [76] y menor que los mediales en [77] (distintas normalizaciones y estilos).
- **Cardio:** 17 futbolistas universitarias, 4 semanas de 15 s trabajo/15 s pausa de snatch (20 min): +2,3 ml·kg⁻¹·min⁻¹ de VO₂max (≈6%), sin cambio en el grupo de circuito [78]. Muestra chica, estudio corto.

**3. Por qué progresa.** Carga (16 → 24 → 32 kg: aumenta impulso [74]); asimetría (1 mano: antirrotación [C]); rango y complejidad (touch floor, snatch: agrega hombro y control overhead [73]); velocidad (swing jump/180° agrega pliometría); duración (cardio, [78]).

**4. Dónde se siente / compensaciones.** Glúteos, isquios, abdomen; **no** en lumbar ni en hombros. Compensaciones: **"sentadilla" en vez de bisagra** (más quads, menos isquios [77]); **flexión lumbar** al fondo; **hiperextensión lumbar al tope** ("inclinarse hacia atrás") [C]; **tirar con los brazos** (front raise) [C]; campana que se aleja del cuerpo (pierde tensión); rodillas en valgo.

**5. Cues.** "Bisagra, no sentadilla." "Cadera como salto vertical sin salto." "Arriba, plancha de pie: glúteos y abdomen apretados." "La campana flota; los brazos no tiran." [C]

**6. Banderas de la ruta** (más las transversales de la sección 3). Dolor lumbar que baja a la pierna, entumecimiento o debilidad (ver sección 3, columna) [96]; los propios autores avisan que algunas personas sienten irritación de tejidos con el swing [73]; dolor de hombro con overhead (snatch/press) [C]; tirón de isquios [C].

##### G2. Variantes de potencia (snatch, clean, jerk, waiter clean)

Más complejas: agregan flexión/extensión de codo, hombro overhead y control; **no leí datos que comparen la activación del snatch con la del swing** (el abstract de [73] no los informa) **ni EMG de clean/jerk con kettlebell** [C]. Banderas de hombro: dolor en la parte delantera del hombro al subir el brazo [C].

---

#### TI-H. Tabla resumen: músculo → rutas donde es motor (M) o estabilizador (Est)

Clasificación por anatomía [L1][L2] y por los datos citados en cada ruta. M = motor/agonista principal; S = sinergista relevante; Est = estabilizador (isométrico/control); Ant = antagonista co-activo; Al = alargado.

| Músculo | Rutas donde es **M** (motor) | Rutas donde es **S/Est** (apoyo/estabilizador) |
|---|---|---|
| **Glúteo mayor** | HT, DS, NC-bisagra (DL/GM), PS (pistol/familia), L (cadera delantera), SU, BRIDGE (cadera), REVERSE HYPER, KL swing, PLYO (extensión triple) | NC-nordic (Est-ISO cadera), SS (co-contracción; no sostiene), SPAGAT (trasera, Est), FLOW (crab/beast), PIKE (Al) |
| **Glúteo medio/menor, TFL** | — | L, PS, DS, SU (pelvis/valgo), HT (OL), PLYO (frontal), CARDIO (skater), FLOW, SPAGAT (pelvis) |
| **Cuádriceps (vastos)** | L, PS, SS, QC, SU, PLYO (propulsión/aterrizaje) | HT (ISO ≈90°), NC (Est), KL swing (S), BRIDGE (rodilla), FLOW (beast, cossack) |
| **Recto femoral** | SS, QC (largo en cadera ext; además flexor de cadera M-ISO con el cuerpo reclinado) | L (pierna trasera: alargado), SPAGAT/BRIDGE (alargado, Al), CARDIO (MC: flexión de cadera M-CON) |
| **Isquiotibiales (BF largo)** | NC-bisagra, REVERSE HYPER, HT (S) | L (S), KL swing (M-S), PLYO (S), NC-nordic (BF largo menos que ST [68][69]) |
| **Isquiotibiales mediales (ST/SM)** | **NC-nordic (ST preferente [68])**, KL swing (más que BF [77]) | HT con rodilla flexionada [68], L |
| **Aductor mayor** | — | PS (cossack/side lunge/sumo, EXC), SPAGAT (alargado), SIDE PCK (alargado), L/DS/HT (S), FLOW (cossack) |
| **Gastrocnemio** | PLYO (resorte), calf raises (NC) | NC-nordic (S), SS (Est-ISO), PS (Est) |
| **Sóleo** | calf raises, PLYO, PS (DF EXC) | L, SU, SS, HT (Est), KL (Est) |
| **Tibial anterior** | QC (tibiales pared) | PS (Est), PLYO aterrizaje (Est) |
| **Iliopsoas / flexores de cadera** | PIKE activo (L-sit), CARDIO (MC), PS (pierna libre), SS y QC (cuerpo reclinado: M-ISO) | SPAGAT, BRIDGE (alargados, Al) |
| **Erectores espinales** | REVERSE HYPER (E alto) | HT, NC (todas), PS, KL swing (≈50% MVC [73]), PIKE (Al), BRIDGE (S) |
| **Recto abdominal y oblicuos** | SIDE PCK (oblicuos del lado contrario: M, EXC/CON), CARDIO (MC) | HT (antiextensión), NC, SS, KL swing, FLOW (beast), BRIDGE (Al) |
| **Cuadrado lumbar** | SIDE PCK (M contralateral, EXC/CON) | PS, L, DS (E-lateral), BRIDGE (S) |
| **Serrato anterior, trapecio inferior** | BRIDGE (M), FLOW (crow/beast) | CARDIO (burpee/MC) |
| **Tríceps, deltoides anterior, pectoral** | BRIDGE (M empuje) | FLOW (beast/crab/crow), CARDIO (burpee) |
| **Dorsal ancho, pectoral (alargados)** | — | BRIDGE (Al), KL swing (Est-ISO), SIDE PCK (windmill) |
| **Flexores/extensores de muñeca** | FLOW (crow, Est-ISO) | BRIDGE (flexores alargados), CARDIO (burpee) |

---

#### TI-I. Dónde la evidencia es débil o contradictoria (resumen)

1. **Pistol squat, sissy squat, dragon squat, quad curl, seiza, shrimp, cossack, side pancake, windmill, jefferson curl, bridge/rueda, Animal Flow:** no encontré literatura revisada por pares. Todo es inferencia anatómica/biomecánica [C].
2. **Sentadilla profunda y rodilla:** contradicción entre una revisión clásica prudente [41] y una scoping review reciente benigna [57].
3. **Hip thrust vs sentadilla:** EMG a favor del HT para glúteo [60][61]; hipertrofia similar [63]. EMG no es resultado.
4. **Nordic:** meta-análisis dice RR ≈0,5 [64] y un RCT con RR 0,29 [66]; la reevaluación con solo RCT es inconclusa [65]. Además la hipertrofia que produce no prioriza el bíceps femoral largo [69]. El nordic suele ir dentro de programas combinados.
5. **Valgo dinámico:** valor predictivo con muestras chicas (9 y 7 lesiones) [79][80]; el efecto del cue "rodillas afuera" sobre lesiones no está demostrado en las fuentes leídas.
6. **DF de tobillo y patrón de sentadilla:** asociaciones transversales; la DF pasiva sin carga no discriminó [54][55].
7. **Estiramiento:** mecanismo (tolerancia vs tejido) debatido; efectos >8 semanas poco estudiados [90]; dosis no moderó el efecto [91].
8. **Reverse hyper:** dos estudios con máquina que se contradicen en EMG de glúteo e isquios [99][100]; transferencia a la versión libre sin verificar.
9. **Swing:** n=7 en el estudio de cargas lumbares [73]; EMG de bíceps femoral discordante entre estudios [76][77].
10. **Aterrizaje (pliometría):** la mayor parte de los estudios son en mujeres jóvenes atletas y tareas de laboratorio.
11. **Banderas rojas lumbares:** exactitud diagnóstica individual de la mayoría no demostrada [96].
12. **Carga de rodilla:** magnitudes de laboratorio (modelos) [40][41][42][43]; no equivalen a daño.

## 3. Progresión, dónde se siente vs compensación, cues y señales para derivar

**Dónde está cada cosa.** Para cada ruta, los bloques "por qué progresa", "dónde se siente / compensaciones", "cues" y "banderas de la ruta" están dentro de su sección en el §2 (bloques 3 a 6 de cada ruta); la base común no se repite en cada ruta. Esta sección agrega lo que faltaba: las **banderas de derivación consolidadas**, redactadas una sola vez y referenciadas desde cada ruta (sección "ver sección 3").

### 3.1 Banderas de derivación consolidadas

**Cómo están redactadas (reglas de las revisiones).**
- Son **señales observables**: lo que el alumno cuenta o lo que el profe ve. El profe **no diagnostica y no hace pruebas clínicas** (nada de maniobras, palpación ni "pruebas" de aducción o slump). No se le dice al alumno ningún rótulo clínico.
- Formato: **Señal → Acción**. La columna "Nota interna" explica la estructura o el motivo, solo para quien revisa o para el profe; no se le dice al alumno.
- Dos niveles: **(a) URGENCIA** (cortar la clase y guardia o emergencias el mismo día) y **(b) DERIVAR** (no volver a cargar ese patrón hasta que lo vea un kinesiólogo o médico).
- Los umbrales de tiempo ("~2 semanas", "2–3 semanas") son propuestas de la revisión y **los tiene que fijar un kinesiólogo humano** ⚑H. Las revisiones advierten además que las "banderas rojas" lumbares tienen poca exactitud diagnóstica individual (`[96]`): son un marco de razonamiento, no un detector.
- Fuentes: R2 = revisión de la parte 2; R3 = revisión de la parte 3 (texto de reemplazo de las revisiones). "R2 §4 #n" = ítem n de la lista de banderas faltantes de la revisión 2; "R3 #n" = ítem n de la lista de banderas faltantes de la revisión 3; "R2-n"/"R3-n" = hallazgo n (Apéndice B). `[R]` = conocimiento clínico estándar sin cita verificada.

#### (a) URGENCIA — cortar la clase y guardia o emergencias el mismo día

| # | Señal observable | Acción | Dónde aplica | Nota interna (no se le dice al alumno) | Fuente |
|---|---|---|---|---|---|
| a1 | Adormecimiento en la entrepierna, los genitales o la cara interna de los muslos ("zona de la silla de montar"); dificultad nueva para orinar, o pérdida de control de orina o de materia fecal; debilidad u hormigueo **en las dos piernas** a la vez | Cortar la clase; **guardia médica ya** (no kinesiólogo) | Todo lo que carga la columna: TTB, core, HT, NC y bisagra, Jefferson, PIKE, BRIDGE, REVERSE HYPER, KL, PLYO | Es una urgencia quirúrgica de la zona lumbar (cauda equina). No aparecía en ninguna parte del documento original | R3-5; R2 §4 #10 |
| a2 | Dolor, opresión o ardor en el pecho, falta de aire desproporcionada al esfuerzo, palpitaciones irregulares, mareo intenso o desmayo durante o justo después del esfuerzo | Cortar ya, no dejar que se vaya solo, **llamar a emergencias**. Si se repite aunque sea leve: apto médico antes de volver | CARDIO, PLYO y cualquier ruta | Emergencia cardiovascular | R3-18 |
| a3 | Orina oscura (color té o coca), dolor muscular desproporcionado, hinchazón o debilidad marcada 24–72 h después de una sesión excéntrica nueva o de mucho volumen (nordic, sissy, saltos) | **Guardia médica el mismo día** (no kinesiólogo). Primera sesión de nordic: volumen bajo | NC (nordic), SS, QC, PLYO | Posible rabdomiólisis (riesgo renal). El daño y el dolor son medibles incluso con 24 repeticiones de nordic en hombres entrenados `[71]`; los volúmenes altos y crecientes dan más dolor `[72]` | R3-7 |
| a4 | "Pop" o chasquido con dolor súbito durante el esfuerzo, sobre todo si después aparece moretón, hinchazón o cambio de forma (bulto en el brazo, pliegue de la axila distinto, hundimiento en el pliegue del codo). Incluye: dolor súbito en el pecho o la axila durante un fondo (profundo, negativo o lastrado), con o sin chasquido | Cortar; derivar **el mismo día** | Fondos (HD/ID), tracciones (OAP, MU, FL, FLR, BL, OAR), pull en general | Las roturas tendinosas de bíceps distal y de pectoral se resuelven mejor si se evalúan temprano. Hay al menos un caso publicado en un atleta de calistenia `[38]` (el abstract no dice en qué ejercicio) | R2 §4 #2; R2-24 |
| a5 | Sensación de "patada" o "pedrada" en la pantorrilla o el talón durante un salto o un arranque, con dificultad para empujar con el pie | Cortar, no apoyar, **guardia el mismo día** | PLYO, CARDIO, calf raises (NC) | Posible rotura del tendón de Aquiles | R3-14 |
| a6 | Adolescente (≈10–16 años) con **renguera nueva** y dolor de ingle, muslo o rodilla, sin golpe previo | **Médico en el día** | Todas las rutas con alumnos adolescentes (sissy, saltos, seiza, bridge) | Una lesión de cadera puede doler en la rodilla (posible epifisiólisis) | R3-15 |
| a7 | Durante una inversión (vertical, HSPU, press): dolor de cabeza fuerte y súbito, visión borrosa o mareo que no pasa al volver de pie | Cortar y derivar al **médico** (consulta médica, no kinesiológica; plazo a validar ⚑H) | HS, HSPU, PHS | Ver tamizaje previo en §3.3 | R2-26 |

#### (b) DERIVAR — no volver a cargar ese patrón hasta que lo vea un kinesiólogo o médico

**(b1) Transversales (valen para todas las rutas).**

| # | Señal observable | Acción | Fuente |
|---|---|---|---|
| b1 | Dolor que **despierta a la noche** o que no deja dormir del lado afectado | Cortar y derivar al kinesiólogo | R2 §4 #1 |
| b2 | **Pérdida de fuerza súbita** o "brazo muerto": no puede levantar el brazo, sostener el agarre o girar la palma hacia arriba con fuerza | Cortar y derivar | R2 §4 #3 |
| b3 | **Hormigueo, adormecimiento o dolor que baja** por el brazo (más allá del codo) o por la pierna (más allá de la rodilla), o que aparece al mover o cargar el cuello. Con la columna: dolor lumbar que baja por debajo de la rodilla, hormigueo o adormecimiento en pierna o pie, pérdida de fuerza (pie que "se cae", no puede caminar en puntas o en talones) | Cortar y derivar antes de volver a cargar (si además aparece algo de a1: urgencia) | R2 §4 #4; R3-5 |
| b4 | Sensación de que el hombro "se sale", se traba o "se va"; un codo que se traba o no termina de estirarse | Cortar y derivar | R2 §4 #5 |
| b5 | Dolor articular o tendinoso que **no mejora en ~2 semanas** pese a bajar la carga, que empeora sesión a sesión o que aparece cada vez más temprano en la sesión | Derivar (umbral ⚑H; rodilla y Aquiles: 2–3 semanas) | R2 §4 #6; R2-21 |
| b6 | Dolor que no cambia con nada (ni con el movimiento, ni con el reposo, ni con la posición); dolor de espalda nuevo con fiebre, pérdida de peso sin explicación o antecedente de cáncer; dolor después de una caída o un golpe | **Médico** | R2 §4 #7 y #15; R3-5 |
| b7 | Después de una **caída sobre la mano extendida** (vertical, planche, salida de anillas): dolor en la base del pulgar, del lado del dorso de la mano, aunque pueda seguir entrenando | Derivar (nota interna: es la zona del escafoides, cuya fractura se pasa por alto con facilidad) | R2 §4 #8 |
| b8 | **Menores en crecimiento**: dolor de muñeca del lado del pulgar al apoyarse, o dolor de codo (de afuera o de adentro) en apoyos o colgados | Derivar pronto y **no entrenar a través del dolor** `[31]` | R2 §4 #9 |
| b9 | Dolor en el pliegue anterior del codo con debilidad para girar la palma hacia arriba | Derivar (FL, FLR, BL, MU, OAR y OAP) | R2 §4 #14 |
| b10 | Muñeca con carga (PL, PLPU, HS, HSPU, PHS, MN/RP, AF, BRIDGE): dolor del lado del dedo meñique con chasquido o sensación de inestabilidad al apoyar o al girar la muñeca; dolor del lado de atrás de la muñeca con carga o pérdida de extensión `[31]` | Derivar | R2 §4 ajustes; R3 (BRIDGE, AF) |

**(b2) Por segmento o contexto.**

| # | Señal observable | Acción | Dónde aplica | Fuente |
|---|---|---|---|---|
| b11 | **Columna:** dolor lumbar localizado que se reproduce al arquear (en especial en menores de 20 que entrenan extensión repetida `[103]`); dolor lumbar con flexión repetida o con hanging leg raises `[23]`; dolor que aumenta al flexionar y no cede en reposo | Derivar. Si además hay síntomas de b3 o a1, ver esos niveles | BRIDGE, REVERSE HYPER, HT, TTB, HR/Jefferson | R2-27; R3 |
| b12 | **PIKE:** hormigueo, ardor o "tirón eléctrico" que baja por detrás de la pierna al hacer pike | Bajar rango y derivar si se repite | PIKE, SPAGAT | R3-19 |
| b13 | **Rodilla:** hinchazón que aparece en las horas siguientes a entrenar; rodilla que se traba y no se puede estirar del todo; sensación de que "se sale" o falla al apoyar o al girar; dolor de adelante de la rodilla que dura más de 2–3 semanas o empeora sesión a sesión (escaleras abajo, sentado mucho tiempo, arrodillarse); dolor puntual en el costado de la articulación con flexión profunda o giro | Derivar; mientras tanto, sacar saltos y flexión profunda cargada. **Un chasquido sin dolor ni hinchazón no es bandera** | L, PS, QC, SS, SU, DS, PLYO | R3-16 |
| b14 | **Cadera / ingle:** pinchazo profundo en la ingle al llegar al fondo de una sentadilla, un dragon, un pigeon o un spagat, o al cruzar la pierna hacia adentro; chasquido **con dolor** o sensación de traba; el alumno se agarra el costado de la cadera con la mano en forma de "C"; dolor en la ingle o en la cara interna del muslo al cerrar las piernas con fuerza, al patear o en el cossack; pellizco o dolor en el pliegue de la ingle al flexionar mucho la cadera (TTB, V-sit, PHS); hormigueo o ardor que baja por la pierna | Derivar. Nota interna: dolor de origen articular de cadera o relacionado con aductores/iliopsoas; marcos de consenso `[93][94][95]` | PS, DS, SPAGAT, SIDE PCK, TTB, MN/RP, PHS, AF | R3 #6; R3-19; R2-22 |
| b15 | **Isquios:** pinchazo o tirón agudo durante un nordic, una bisagra o un sprint, a veces con chasquido; si después aparece moretón en la parte de atrás del muslo, duele al sentarse o cuesta caminar normal | Cortar y derivar **en el día o al siguiente** | NC, HT, bisagra | R3 #7 |
| b16 | **Aquiles:** dolor o rigidez en el tendón a la mañana o al arrancar, que dura más de 2–3 semanas o empeora sesión a sesión; bulto o engrosamiento doloroso del tendón | Derivar y bajar saltos/pogo | calf raises, PLYO | R3-14 |
| b17 | **Tibia (plyo):** dolor en **un punto** del hueso de la tibia que aparece al saltar y después también al caminar o de noche | Derivar | PLYO, CARDIO | R3 #11 |
| b18 | **Adolescentes (≈10–16 años):** dolor en el bulto de abajo de la rótula, en la punta inferior de la rótula o en el talón que aparece con saltos, sissy o arrodillarse | Derivar y bajar impacto/flexión profunda | SS, QC, PLYO, SU | R3-15 |
| b19 | **HSPU con cabeza al piso:** dolor de cuello, o dolor u hormigueo que baja al brazo después | Cortar las variantes con cabeza al piso y derivar (evidencia de un preprint, no revisado por pares `[39]`) | HSPU | R2-25 |
| b20 | **Bridge con cabeza colgando:** mareo, visión borrosa u hormigueo en los brazos; dolor de muñeca que sigue al día siguiente (en adolescentes, derivar) | Cortar | BRIDGE | R3 #13 |
| b21 | **Hombro en colgados y apoyos:** dolor profundo anterior o lateral de hombro al colgarse pasivo; sensación de "salida" o inestabilidad; dolor en la cara anterior del hombro durante o después de German hang/skin the cat, planche o fondos profundos | Cortar la variante y derivar (en gimnastas, el mecanismo dominante de las lesiones quirúrgicas fue la tracción con manos fijas `[18]`) | FL (hang), BL, MN/RP, PL, HD/ID | R2-22; S2.1, S4.1 |

#### (c) Precauciones previas: no prescribir sin aval

| # | Precaución | Acción | Fuente |
|---|---|---|---|
| c1 | **Flexión de columna cargada** (Jefferson, pike con peso, "deep sq to jefferson"): osteoporosis u osteopenia conocida, antecedente de fractura vertebral, hernia de disco reciente o diagnosticada, o síntomas radiculares. En mujeres posmenopáusicas y personas mayores, preguntar antes | **No prescribir sin aval** del kinesiólogo (para hernia o protrusión diagnosticada: que autorice la flexión con carga antes de empezar). Cargas bajas, progresión lenta. No meter un Jefferson largo justo antes de un levantamiento o salto pesado `[32]` | R3-17; R2 §4; R2-28 |
| c2 | **Inversiones** (vertical, HSPU, press): antes de las primeras, preguntar ¿presión alta no controlada?, ¿glaucoma, problemas de retina o cirugía de ojos reciente?, ¿embarazo?, ¿desmayos? | Si alguna es sí: que lo consulte con su **médico** antes de invertirse ⚑H | R2-26 |
| c3 | **Hombros muy laxos o con antecedente de luxación** (también hiperlaxos en spagat y bridge) | Preferir colgado activo; German hang y skin the cat solo con criterio de un kinesiólogo ⚑H | R2-10; R2 §5 #6; R3 §humano #7 |
| c4 | **Primera exposición al nordic** | Volumen bajo (ver a3) ⚑H dosis inicial segura | R3-7 |
| c5 | **Progresión de exposición en SAS** (BL, German hang, manna, planche): cuántas sesiones o semanas antes de subir de escalón | Sin evidencia directa (`[22]` es solo Aquiles y rotuliano) ⚑H | R2 §5 #5 |
| c6 | **Menores en crecimiento:** volumen de apoyo de muñeca y colgados, saltos, sissy, seiza, bridge | Criterios de edad y carga a definir con un kinesiólogo pediátrico/deportivo ⚑H | R2 §5 #7; R3 §humano #3 |

### 3.2 Qué bloque de banderas aplica a cada ruta

| Grupo de rutas | Bloques |
|---|---|
| Colgados y tracciones (FL hang, MU, OAP, FL, FLR, OAR, BL) | b1–b5, b9, b21, a4; c3, c5 |
| Fondos (HD/ID) y empujes (OAPU, PL, PLPU) | b1–b5, b7, b10, a4 (pectoral); b8 en menores |
| Inversiones (HS, HSPU, PHS) | b7, b10, b19, a7; c2 |
| MN/RP y TTB | b3, b14, b21; a1 (columna) |
| Core posterior/lateral (HR), Jefferson, PIKE, REVERSE HYPER, BRIDGE | b3, b11, b12, b20; a1; c1 |
| Rodilla (L, PS, QC, SS, SU) y DS | b13, b14, b18; a3, a6 |
| Cadera y movilidad (SPAGAT, SIDE PCK) | b14; c3 |
| Cadena posterior (HT, NC, bisagra) | b11, b15; a1, a3; c4 |
| Gemelos, PLYO, CARDIO | b16, b17, b18; a2, a5, a6 |
| KL (swing, snatch) | b3, b11; a1 |
| AF | b10, b14 |


## 4. Modelo de contenido estructurado

Qué permite y qué no el dibujo (`anatomia.json`), el modelo de entidades con herencia complejo → ruta → gesto → ejercicio, qué parte es global de plataforma y qué parte es método de El Templo, y la recomendación de almacenamiento (**archivos versionados en el repo**, con la puerta abierta a un híbrido con DB solo para el estado de validación). Las secciones 4.1 a 4.8 vienen de la parte 1; la 4.9 agrega lo que surge de las partes 2 y 3 y de las revisiones.

### 4.1 El dibujo (`el-templo-admin/src/tv/recorrido/`)

- `anatomia.json` (136 KB): geometría de **react-native-body-highlighter v3.2.0** (MIT, Copyright ELABBASSI Hicham; el aviso viaja en `_licencia`). Cuatro figuras (hombre/mujer × frente/espalda) + 2 contornos por sexo. Cada región = `{ slug, p: [[d, ángulo, elongación, cx, cy], ...] }`; el ángulo/elongación/centroide se precalcularon (sketch 004) para orientar fibras y ubicar rótulos.
- `anatomia.ts`: carga con `import()` dinámico y valida la forma (`parseAnatomia`).
- `figuras.ts`: arma el SVG (base de mármol + capa por bloque con degradé); `ZONA_ES` (rótulo español de las 15 zonas); `puntosDeZonas` calcula un punto por zona.
- `index.ts`: coreografía de la TV; `vistasDe` decide frente/espalda según qué `slug` aparece en cada vista.

**Slugs presentes por figura (cantidad de paths):**

| Figura | Slugs |
|---|---|
| Hombre FRENTE | chest(2), obliques(16), abs(8), biceps(2), triceps(2), neck(5), trapezius(2), deltoids(2), adductors(6), quadriceps(6), knees(4), tibialis(2), calves(4), forearm(6), hands(12), ankles(4), feet(4), head, hair |
| Hombre ESPALDA | neck(2), trapezius(2), deltoids(2), upper-back(6), triceps(6), lower-back(4), forearm(8), gluteal(4), adductors(2), hamstring(8), calves(8), ankles(2), feet(2), hands(12), head, hair |
| Mujer FRENTE | neck(5), trapezius(2), deltoids(4), chest(2), biceps(2), triceps(2), obliques(12), abs(8), forearm(8), hands(12), adductors(6), quadriceps(6), knees(6), tibialis(2), calves(4), ankles(4), feet(4), head, hair(2) |
| Mujer ESPALDA | hair(2), neck(2), trapezius(2), deltoids(2), upper-back(4), lower-back(4), triceps(6), forearm(8), hands(12), gluteal(4), adductors(4), hamstring(6), calves(8), feet(2) |

La TV usa 15 slugs: `chest, deltoids, triceps, biceps, forearm, trapezius, upper-back, lower-back, abs, obliques, gluteal, quadriceps, hamstring, adductors, calves`. **Quedan sin uso (existen en el JSON): `neck, tibialis, knees, hands, feet, ankles, head, hair`.**
Observación: la página de la librería lista además `abductors` (solo espalda) y un atributo `side: left|right` por parte; **el JSON embebido NO trae `abductors`** (no aparece en ningún grupo): hay que verificar si es de una versión posterior de la librería. Los paths vienen como pares izq/der (p. ej. `chest(2)`, `quadriceps(6)`), lo que en principio permitiría pintar unilateral (útil para OL/OA) **(inferido, no probado)**.

**Qué permite el dibujo:**
- Pintar 15 zonas + 8 más sin cambiar la geometría; frente/espalda, hombre/mujer.
- Rótulos por zona con punto de anclaje automático.
- Intensidad por zona (hoy solo encendido/apagado; el degradé permitiría 2–3 niveles de opacidad sin tocar el SVG).

**Qué NO permite (hoy):**

| Músculo/estructura que importa en nuestras rutas | Qué hay en el dibujo |
|---|---|
| Dorsal ancho, romboides, redondo mayor/menor, infraespinoso | `upper-back` = **una sola mancha** |
| Cabezas del deltoides (anterior/medio/posterior) | `deltoids` único; frente = lo anterior, espalda = lo posterior de forma implícita |
| Manguito rotador (supra/infra/redondo menor/subescapular) | no existe |
| Serrato anterior, pectoral menor, coracobraquial | no existe (el path `obliques` del frente podría cubrir el serrato: a verificar visualmente) |
| Glúteo mayor vs medio/mínimo | `gluteal` único |
| Psoas-ilíaco, flexores de cadera, tensor de la fascia lata, sartorio | no existe (profundos/laterales); recto femoral = `quadriceps` |
| Erectores vs multífidos/cuadrado lumbar | `lower-back` único |
| Transverso del abdomen, recto vs oblicuos | `abs` / `obliques` separados; transverso no (profundo) |
| Bíceps braquial vs braquial vs braquiorradial | `biceps` / `forearm` |
| Tríceps (cabeza larga vs vastos) | `triceps` único |
| Gemelo vs sóleo | `calves` único |
| Estructuras que no son músculo (cápsula, labrum, tendones, ligamentos) | fuera de alcance del dibujo |
| Isquios (bíceps femoral, semitendinoso, semimembranoso) | `hamstring` único |
| Aductores (mayor, largo, grácil) | `adductors` único |
| Tibial anterior | slug `tibialis` existe en el JSON pero no está en `TvZonaMuscular` (basta agregarlo) |

**Opciones:**

| Opción | Qué es | Esfuerzo | Riesgo / límite |
|---|---|---|---|
| **(a) Vivir con el dibujo** | Cada músculo del modelo se proyecta a 1+ zonas (`zonas[]` con `precision: exacta | agrupada | aproximada`). Los textos y la tabla de la sección muestran el músculo real; el dibujo "agrupa". Se suma `tibialis`, `neck`, `hands/feet` al tipo de zonas | Bajo (solo capa de datos) | Un mismo cuadro pinta dorsal/romboides igual; hay que avisarle al profe "zona = grupo" en la UI |
| **(b) Extender el SVG con regiones nuevas** | La licencia MIT permite derivar. Dividir a mano `upper-back` (dorsal / romboides-trapecio medio-inferior / redondos), `deltoids` (3 cabezas), `gluteal` (mayor / medio), `lower-back` (erectores) dibujando sobre los paths existentes (Inkscape/Figma), y agregar nuevos slugs en `anatomia.json`. Se mantiene el aviso de licencia y se documenta qué se derivó | Medio–alto (arte vectorial por 4 figuras × 2 vistas; test visual) | Hay que mantener el fork; costo en TV (más paths: el presupuesto de la TV es estricto, ver incidentes f655466c / 750e11f58); coherencia hombre/mujer; el arte "tipo mármol" de la TV exige trazar bien. **Hasta un POC sobre una sola región (upper-back), no se puede estimar de verdad** |
| **(c) Otra librería/dibujo** | Ninguna instalada; solo alternativas conocidas, **todas a verificar licencia/atribución antes de cualquier uso** | Alto (reemplaza rendering + coreografía TV) | Ver tabla de abajo |

Alternativas conocidas (sin instalar, **licencias a verificar archivo por archivo**):

| Alternativa | Qué ofrece | Licencia (a verificar) |
|---|---|---|
| `react-body-highlighter` (original web de giavinh79) | Mismo tipo de modelo, menos detalle; trae distinción de deltoides anterior/posterior en algunas versiones | MIT (recordado; verificar) |
| Z-Anatomy / BodyParts3D | Modelos 3D con músculos individuales → se pueden renderizar proyecciones 2D por músculo | CC BY-SA (share-alike; implica condiciones sobre derivados; verificar) |
| Láminas de Gray's Anatomy (dominio público, 1918) en Wikimedia Commons | Ilustraciones de músculos por región (superficiales y profundos) | Dominio público el original; cada archivo de Commons tiene su licencia propia |
| Servier Medical Art | Ilustraciones médicas vectoriales | CC BY (atribución) |
| wger (app de ejercicios) | Overlays SVG de músculos por zona anatómica | Verificar (el proyecto es AGPL; los gráficos pueden tener otra licencia) |
| Comerciales (Visible Body, Complete Anatomy, BioDigital, Muscle & Motion) | Anatomía con detalle y capas | Licencia comercial; fuera de alcance |

**Recomendación (mía, para decidir con Franco):** empezar por **(a)** con `precision` explícita en el modelo y **sumar `tibialis`** (cero costo de arte). Reservar **(b)** solo para las 3 divisiones con más retorno pedagógico en nuestras rutas: `upper-back` (dorsal vs romboides/trapecio inferior), `deltoids` (anterior/medio/posterior) y `gluteal` (mayor vs medio). Hacer un POC de una sola (upper-back) antes de comprometerse. El modelo de datos debe soportar una región nueva sin migración: las "zonas" son **datos con vista y slug**, no un enum cableado en 3 lugares.

### 4.2 Principios

1. **Una sola fuente** para sección Anatomía (admin), control/explicación de la TV y Guía de la app. La TV hoy recibe `zonas[]` por bloque; en el modelo nuevo las zonas **se derivan** de músculo→zona, no se tipean.
2. **Músculo y articulación son datos globales** (no cambian por gimnasio ni por ruta). **Ruta/gesto/ejercicio** son datos del método de El Templo.
3. **Texto por audiencia** (profe vs alumno) y por locale, desacoplado de los hechos estructurados (para poder validar hechos y redactar tonos por separado).
4. **Todo afirmado lleva cita y estado de validación** (borrador / en revisión / validado), a nivel de relación (p. ej. "pectoral mayor es sinergista en PL") no solo de entidad.
5. **Herencia explícita con overrides visibles** (nada de "se infiere").

### 4.3 Entidades

```
Region(dibujo) ─< MusculoRegion >─ Musculo ─< MusculoAccion >─ AccionArticular >─ Articulacion
                                      │                           │
                                      │                           └── plano (sagital/frontal/transverso), eje, ROM típico
                                      │
                                      └─< RutaMusculo >─ Ruta ─< Fase >─< FaseAccion >─ AccionArticular
                                              ▲              │      (tipo contracción por fase y por acción)
                                              │              ├── Gesto (opcional, familia dentro de la ruta)
                         overrides ───────────┤              └── Complejo (patrón / categoría) [herencia]
                                              │
                                    EjercicioOverride (exercise_id o clave lógica)
Texto(entidad, campo, audiencia, locale, estado)      Cita(fuente, ubicación, nivel_evidencia) ─< Afirmacion
Validacion(entidad_o_afirmacion, estado, revisor, fecha, versión)      SenalDerivacion / Compensacion / Cue (bloques de la ruta)
```

#### 4.3.1 Entidades y campos

| Entidad | Campos | Notas |
|---|---|---|
| **Region** (zona del dibujo) | `slug` (clave del JSON), `nombre_es`, `vista` (`frente`/`espalda`/`ambas`), `en_dibujo: bool`, `figura_hijos?` | Reemplaza al enum `TvZonaMuscular` y a `ZONA_ES`. Una región nueva (b) es solo una fila |
| **Musculo** | `id`, `nombre_es`, `nombre_lat`, `segmento` (cabeza-cuello/tronco/MS/MI), `grupo14` (los 14 del módulo Gimnasio: pecho, espalda, hombros, bíceps, tríceps, antebrazo, cuádriceps, isquiotibiales, glúteos, gemelos, aductores, abdominales, lumbares, cuello), `profundo: bool`, `origen`, `insercion`, `inervacion?`, `texto_profe`, `texto_alumno` | `grupo14` deja que el módulo Gimnasio reutilice la misma tabla |
| **MusculoRegion** | `musculo_id`, `region_slug`, `precision` (`exacta`/`agrupada`/`aproximada`/`ninguna`), `vista` | Proyección músculo → mancha. Si es `ninguna` (psoas), el músculo se explica en texto y no se pinta |
| **Articulacion** | `id`, `nombre_es`, `tipo`, `segmento`, `grados_libertad`, `texto_profe`, `texto_alumno` | ej. glenohumeral, escapulotorácica, codo, columna lumbar, coxofemoral, rodilla, tobillo |
| **AccionArticular** | `id`, `articulacion_id`, `movimiento` (flexión/extensión/abducción/rotación/…), `plano` (`sagital`/`frontal`/`transverso`), `eje`, `descripcion` | Una acción = un grado de libertad + sentido |
| **MusculoAccion** | `musculo_id`, `accion_id`, `rol_general` (`agonista_principal`/`agonista_secundario`) | Hecho anatómico "genérico", independiente del ejercicio |
| **Complejo** | `id`, `tipo` (`patron`/`categoria`/`familia`), `padre_id`, `nombre_es`, `descripcion_profe`, `descripcion_alumno` | Patrón (PUSH, PULL, LOWER, CORE, MOVILIDAD, FLOW) y categoría (PUSH HORIZONTAL…). Es el 1er nivel de herencia |
| **Ruta** | `code` (= `routes.code`), `nombre_oficial`, `complejo_id`, `tipo_esfuerzo` (`estatica`/`dinamica`/`mixta`), `brazo` (`SAS`/`BAS`/`mixto`/`na`), `cadena` (`abierta`/`cerrada`/`mixta`), `palancas_resumen`, `por_que_progresa`, `escalones[]` (refiere a `route-progression-map.ts`), `excluida_arbol` | La herencia: si no define campo, hereda del `Complejo` |
| **Gesto** (familia dentro de la ruta) | `id`, `ruta_code`, `nombre`, `criterio` (qué lo une: p. ej. `exercise_2` base), `sobreescribe_ruta: {campos}` | Opcional en rutas homogéneas; **necesario donde cambian rol o contracción** (ver 4.9). Resuelve A7 (FL: dragon flag/victorian/press/boat; NC: nordic/peso muerto/calf raise) |
| **Fase** | `id`, `gesto_id` (o `ruta_code` si la ruta es homogénea; ver 4.9), `orden`, `nombre` (p. ej. "sostén", "descenso"), `descripcion` | Una ruta tiene 1–4 fases |
| **FaseAccion** | `fase_id`, `accion_id`, `contraccion` (`concentrica`/`excentrica`/`isometrica`/`pliometrica`), `estabiliza: bool` | Tipo de contracción **por fase y acción**, porque `exercises.effort` está vacío en 28,5 % |
| **RutaMusculo** (el reemplazo de `muscle-zones.ts`) | `gesto_id` (o `ruta_code` si la ruta es homogénea), `fase_id?`, `musculo_id`, `rol` (`motor`/`sinergista`/`estabilizador`/`antagonista`), `contraccion`, `peso` (1–3, para intensidad de color y umbral de dominancia), `escalon_desde?`/`escalon_hasta?` (el rol puede cambiar con la palanca), `afirmacion_id` | Una fila por afirmación citable |
| **EjercicioOverride** | `exercise_id` o `clave` (ruta + `exercise_2` + `position`), `agrega_musculos[]`, `quita_musculos[]`, `cambia_rol[]`, `nota_profe`, `nota_alumno`, `motivo` | Solo para las excepciones puntuales |
| **Texto** | `entidad_tipo`, `entidad_id`, `campo`, `audiencia` (`profe`/`alumno`/`tv`), `locale` (`es-AR`), `cuerpo`, `estado` | Texto largo; los hechos estructurados viven fuera |
| **Bloque didáctico** (de ruta o gesto) | `tipo` (`donde_se_siente`/`compensacion`/`cue`/`error_tipico`/`senal_derivacion`), `texto_*`, `afirmacion_id` | Los puntos 3 del pedido original |
| **Cita** | `id`, `fuente` (libro/paper/guía), `autores`, `anio`, `ubicacion` (cap./pág./sección), `tipo_evidencia` (`texto_de_referencia`/`EMG`/`revision`/`consenso_de_expertos`/`practica_de_profes`), `nivel` (A/B/C o escala acordada), `url/doi?` | |
| **Afirmacion** | `id`, `enunciado`, `entidad_tipo`/`entidad_id`, `citas[]` | La unidad de validación |
| **Validacion** | `afirmacion_id` o `entidad`, `estado` (`borrador`/`en_revision`/`validado`/`observado`/`rechazado`), `revisor` (persona + rol: kinesiólogo/lic. EF/profe), `fecha`, `version_contenido`, `comentario` | Historial; el estado "vigente" es la última fila |

#### 4.3.2 Herencia

```
Complejo (patrón)  →  Complejo (categoría)  →  Ruta  →  Gesto  →  Ejercicio (override)
```
- **Resolución de un campo** (p. ej. `musculos`): se toma el nivel más específico que lo defina; los músculos se **suman** salvo que el override tenga `quita_musculos`.
- Un campo sin valor sube al padre; si no hay valor en la cadena, el resultado es `sin_contenido` (nunca "vacío válido") — el test de cobertura lo detecta.
- Las rutas con varias categorías (A8: FL, TTB, PIKE) se resuelven porque **la ruta es la unidad primaria** y la categoría es solo etiqueta/filtro; el patrón de `muscle-zones.ts` (categoría → zonas) desaparece.

#### 4.3.3 Qué reemplaza a qué

| Hoy (`muscle-zones.ts`) | Modelo nuevo |
|---|---|
| `CATEGORY_ZONAS` | `Complejo` + `RutaMusculo` heredado (default por categoría, si se quiere) |
| `SECONDARY_ZONAS` ("contiene") | Eliminado. SAS/BAS pasan a `Ruta.brazo`; ISQUIOS/QUADS/GLUTES pasan a roles explícitos |
| `ROUTE_ZONAS` | `RutaMusculo` |
| `ROM_ROLE_ZONAS` | `Complejo` ROM_* o `Ruta` virtual por rol (hoy el rol ROM no es ruta) |
| `UMBRAL_DOMINANCIA` | Se mantiene como regla de **agregación de grupo**, pero ponderada por `rol`/`peso` y no por conteo de ejercicios |
| `ZONA_ES`, `ZONAS_ORDEN`, `TvZonaMuscular` (×3 copias) | `Region` |

### 4.4 Proyección a la TV (compatibilidad)

`zonas_de_ruta(code)` = `{ region.slug | musculo ∈ RutaMusculo(code, rol ∈ {motor, sinergista}), musculo→región }`. Los estabilizadores se pintan con menor opacidad **solo si** se amplía la TV; mientras tanto no entran. El payload del poll no cambia de forma (`zonas: string[]`) → se puede migrar sin tocar el front de la TV.

### 4.5 Multi-tenancy

Hechos del repo (origin/master):
- `exercises` y `routes` son **gym-owned** (`tenant_id` en `GYM_OWNED_TABLES`), hoy solo con datos del tenant 1 (El Templo). `routes.code` tiene `UNIQUE` global.
- `src/db/tenant-tables.ts` es fail-closed: **toda tabla nueva se clasifica** (gym-owned, exenta con motivo, etc.). Exentas hoy: `tenants`, `tenant_settings`, `system_settings`, `labs_inquiries`, `sponsor_brands` (catálogo de PLATAFORMA).
- El diseño del módulo Gimnasio (doc 08) crea un catálogo `gym_exercises` con `tenant_id` NULLable (NULL = global; helper `tenantOrGlobalWhere`), **fuera de master (rama del tren 182/184)**, y 14 grupos musculares cerrados. Un tenant tiene `templo-training` ON o `gimnasio` ON, nunca los dos.

**Recomendación:**
- **Músculo, articulación, acción articular, región, cita** = **global de plataforma** (anatomía no cambia por gimnasio). En DB serían tablas exentas con motivo (como `sponsor_brands`); en archivos, no se clasifican.
- **Ruta, gesto, `RutaMusculo`, override** = **contenido del método de El Templo**, atado al módulo `templo-training`. Hoy solo existe en tenant 1; si el SaaS suma otro gimnasio con calistenia, tendría que ser una decisión de producto (¿hereda el método de El Templo, o carga el propio?). **No agregar `tenant_id` hoy**: YAGNI y evita el problema de `routes.code` unique global.
- El `grupo14` en `Musculo` deja la puerta abierta a que el módulo Gimnasio use la misma anatomía (ficha de ejercicio "grupo muscular secundario") sin duplicar.

### 4.6 Cuántas excepciones esperar (estimación gruesa con el catálogo)

- Rutas claramente homogéneas (herencia plana sirve): PL, PLPU, BL, HSPU, PHS, OAPU, OAP, OAR, MU, HD/ID, PS, SS, L, SU, DS, QC, HT, REVERSE HYPER, SIDE PCK, BRIDGE, SPAGAT, HR → ~22 rutas.
- Rutas heterogéneas que piden **gestos**: FL (≈6 gestos: dragon flag, Victorian, press, boat, row/BA FL, hang/escápulas), TTB (≈3: core colgado, colgadas a un brazo, crunch), NC (≈4: nordic, peso muerto/GM, calf raises, horse stance/Jefferson), PIKE (≈3), AF (varios, ~5 familias de locomoción), MN/RP (≈3: L-sit, V-sit, reverse planche) → **≈12–15 gestos**.
- Ejercicios sueltos que se apartan de su gesto: nombres con equipamiento/variante que cambia el trabajo (OL, WIDE, ARCHER, FALSE GRIP, SUPINE, RINGS, JUMP): estimo **3–6 % de los 1.283 nombres (≈40–80)**. Es una estimación a confirmar con una muestra de 100 nombres con un profe.
- Fuera de la herencia: **104 filas sin ruta** (PLYO, CARDIO, KL) = otro contenido (3 "complejos" nuevos), no excepciones.

### 4.7 Opciones de almacenamiento

| Criterio | A. Tablas MySQL + Drizzle | B. Archivos versionados (JSON/YAML + MD) en el repo | C. Híbrido |
|---|---|---|---|
| Qué es | ~15 tablas nuevas + migraciones + admin de carga | Carpeta `content/anatomia/` (p. ej. `musculos.yaml`, `rutas/FL.yaml`, `textos/FL.profe.md`) con esquema JSON Schema; build lo empaqueta | Hechos y relaciones en archivos (B); estado de validación, comentarios de revisores, tests de profes y analítica en DB |
| Quién edita | Profes vía una pantalla de admin (hay que construirla: esfuerzo alto) | Franco/Nacho/dev por PR; profes **no** (salvo con una herramienta intermedia) | Contenido por PR; validación/respuestas de revisión desde el admin |
| Validación | Constraints + zod/ajv en la API | JSON Schema + tests CI de coherencia contra la DB de catálogo (CI ya tiene MySQL) | Ambas |
| Tests de coherencia | Posibles pero necesitan DB sembrada | **Muy fáciles** (puro archivo + SELECT de `routes`) | Fáciles |
| Auditabilidad (citas, versiones, diffs) | Hay que construir historial | **Git ya lo da** (blame, PR, revisión por el kinesiólogo comentando el PR) | Git para hechos, DB para workflow |
| i18n / audiencias | Columnas o tabla `texto` | Archivos por `audiencia.locale` | Idem B |
| Costo de cambio de modelo | Migración por cada ajuste (el modelo va a cambiar mucho en la etapa de investigación) | **Barato**: se edita el esquema y los archivos | Barato |
| Deploy | Cambios en prod = datos vía migración (regla del repo: `prod data via migrations`) | Un deploy por cambio de contenido (ya es el pipeline normal) | Idem |
| Multi-tenant | Hay que clasificar cada tabla en `tenant-tables.ts` (gates) | No aplica | Solo la parte DB |
| Riesgo | Sobre-ingeniería antes de saber el modelo; admin de carga de 15 tablas | Los profes no pueden editar directo; contenido en el bundle (peso) | Dos fuentes de verdad si no se disciplina el límite |
| Carga en TV | Pedir a la API (ya lo hace) | Compilar a un JSON mínimo `ruta → zonas` que viaja por el poll | Idem |

**Recomendación: B para empezar, con la puerta abierta a C.**
Razones: (1) el modelo va a cambiar durante la investigación (secciones 2 y 3), y B tiene costo de cambio casi nulo; (2) el volumen es chico (~45–60 músculos, ~15 articulaciones/acciones por articulación, ~30 rutas, ~15 gestos, ~80 overrides) y cambia poco; (3) citas y revisión del kinesiólogo encajan con PR/diff; (4) tests de coherencia son triviales; (5) ya hay precedentes de "archivo de datos único" en el repo (`empeza-aca-content.ts`, `route-progression-map.ts`, taxonomías con JSON Schema en la rama 184); (6) evita clasificar tablas en `tenant-tables.ts` y tocar prod por migración. **Condición:** diseñar una forma de que los profes aporten sin PR (p. ej. una hoja de cálculo/formulario de revisión que Franco vuelca a los archivos, o más adelante la parte "estado de validación + comentarios" en DB = C). Mover a A recién si se confirma que los profes van a **editar** el contenido seguido (no solo revisarlo).

### 4.8 Ejemplos completos (contenido placeholder, sin datos científicos inventados)

Notación: `⟦...⟧` = a completar por el validador. `estado: borrador` = nada validado. Los datos marcados `[catálogo]` salen de la DB/código verificados; todo lo anatómico es placeholder. Los **candidatos a músculo** son una lista de trabajo para que el validador los acepte, cambie o descarte; **no son afirmaciones**.

#### 4.8.1 Ruta FL (Front Lever)

```yaml
ruta:
  code: FL                                   # [catálogo] routes.code
  nombre_oficial: "Front Lever"              # [catálogo] DB y TV coinciden
  complejo_id: PULL.PULL_HORIZONTAL          # [catálogo] 111/127 filas; pero 11 en CORE ANTERIOR y 4 en PULL VERTICAL
  categorias_en_catalogo: [PULL HORIZONTAL, CORE ANTERIOR, PULL VERTICAL, MOVILIDAD]   # anomalía A8
  tipo_esfuerzo: mixta                       # [catálogo] ISO 38 / CON 65 / EXC 24 → estático para sostén, dinámico para press y rows
  brazo: mixto                               # [catálogo] SAS 89 / BAS 28
  cadena: ⟦a validar: abierta/cerrada/mixta⟧
  escalones: [TUCK, ADV TUCK, SUPER ADV, STRADDLE, HALF LAYOUT, FULL]   # [route-progression-map.ts]
  habilidades: [VERTICAL, PIKE, HORIZONTAL, INV, OL]
  por_que_progresa:
    profe: "⟦PLACEHOLDER: explicación del brazo de palanca al extender cadera/rodillas, con cita⟧"
    alumno: "⟦PLACEHOLDER: versión corta y sin jerga⟧"
  estado: borrador

gestos:                                      # [catálogo] exercise_2 más frecuentes en FL
  - { id: FL.DF,        nombre: "Dragon Flag (inferido)",  filas: 30, sobreescribe: {tipo_esfuerzo: ⟦⟧, musculos: ⟦⟧} }
  - { id: FL.VICTORIAN, nombre: "Elbow Victorian",         filas: 13 }
  - { id: FL.PRESS,     nombre: "FL Press / Press to 90",   filas: ⟦contar⟧ }
  - { id: FL.BOAT,      nombre: "Boat",                     filas: 7 }
  - { id: FL.OTROS,     nombre: "DP (sin resolver), YEWKIES, ICM, FL WIDE, hangs/escápulas", filas: ⟦contar⟧ }

fases:                                       # a definir con el análisis biomecánico (sección 2)
  - { orden: 1, nombre: "⟦p. ej. entrada / elevación⟧", contraccion: ⟦⟧ }
  - { orden: 2, nombre: "⟦sostén en horizontal⟧",        contraccion: isometrica }   # inferido por ISO 38 filas; validar
  - { orden: 3, nombre: "⟦descenso controlado⟧",        contraccion: excentrica }   # inferido por EXC 24 filas; validar

articulaciones_y_acciones:                   # referencias a las entidades globales
  - { articulacion: glenohumeral,    accion: ⟦p. ej. extensión / aducción⟧, plano: ⟦⟧, contraccion: ⟦⟧ }
  - { articulacion: escapulotoracica, accion: ⟦⟧, plano: ⟦⟧ }
  - { articulacion: coxofemoral,     accion: ⟦⟧, plano: ⟦⟧ }
  - { articulacion: columna_lumbopelvica, accion: ⟦⟧, plano: ⟦⟧ }

ruta_musculo:                                # tabla de relaciones (reemplaza muscle-zones)
  # musculo_id = candidatos para el validador; rol/contracción NO afirmados
  - { musculo: dorsal_ancho,        rol: ⟦⟧, contraccion: ⟦⟧, peso: ⟦1-3⟧, cita: ⟦pendiente⟧ }
  - { musculo: redondo_mayor,       rol: ⟦⟧, contraccion: ⟦⟧, peso: ⟦⟧,     cita: ⟦pendiente⟧ }
  - { musculo: pectoral_mayor,      rol: ⟦⟧, contraccion: ⟦⟧, peso: ⟦⟧,     cita: ⟦pendiente⟧ }
  - { musculo: triceps_cabeza_larga, rol: ⟦⟧, contraccion: ⟦⟧, peso: ⟦⟧,    cita: ⟦pendiente⟧ }
  - { musculo: deltoides_posterior, rol: ⟦⟧, contraccion: ⟦⟧, peso: ⟦⟧,     cita: ⟦pendiente⟧ }
  - { musculo: romboides,           rol: ⟦⟧, contraccion: ⟦⟧, peso: ⟦⟧,     cita: ⟦pendiente⟧ }
  - { musculo: trapecio_inferior,   rol: ⟦⟧, contraccion: ⟦⟧, peso: ⟦⟧,     cita: ⟦pendiente⟧ }
  - { musculo: recto_abdominal,     rol: ⟦⟧, contraccion: ⟦⟧, peso: ⟦⟧,     cita: ⟦pendiente⟧ }
  - { musculo: oblicuos,            rol: ⟦⟧, contraccion: ⟦⟧, peso: ⟦⟧,     cita: ⟦pendiente⟧ }
  - { musculo: gluteo_mayor,        rol: ⟦⟧, contraccion: ⟦⟧, peso: ⟦⟧,     cita: ⟦pendiente⟧ }
  - { musculo: erectores_espinales, rol: ⟦⟧, contraccion: ⟦⟧, peso: ⟦⟧,     cita: ⟦pendiente⟧ }
  - { musculo: ⟦otros que agregue el validador: flexores de antebrazo, serrato, etc.⟧ }

bloques_didacticos:
  donde_se_siente: { profe: "⟦⟧", alumno: "⟦⟧", cita: ⟦⟧ }
  compensacion_tipica: [ { profe: "⟦⟧", alumno: "⟦⟧", cita: ⟦⟧ } ]
  cues: [ { texto: "⟦⟧", cita: ⟦⟧ } ]
  senales_derivacion: [ { texto: "⟦⟧", criterio: "⟦⟧", cita: ⟦⟧ } ]

zonas_dibujo_resultantes: ⟦se derivan de ruta_musculo; hoy muscle-zones da: deltoids, biceps, trapezius, upper-back, abs⟧
validacion: { estado: borrador, revisor: null, fecha: null }
```

#### 4.8.2 Ruta PS (Pistol Squat)

```yaml
ruta:
  code: PS                                   # [catálogo]
  nombre_oficial: "Pistol Squat"             # [catálogo] DB y TV coinciden
  complejo_id: LOWER.KNEE_DOMINANT           # [catálogo] 60/65 filas; 5 filas en HIP DOMINANT (anomalía A8)
  tipo_esfuerzo: dinamica                    # inferido: effort vacío en 54/65; ISO 5 / EXC 5 / CON 1
  brazo: na
  cadena: cerrada                            # inferido (pie fijo); validar
  estrategia_progresion: linear              # [route-progression-map.ts] por dificultad_lineal
  habilidades: [W, OL, JUMP]                 # [route-progression-map.ts]
  por_que_progresa:
    profe: "⟦PLACEHOLDER: qué cambia entre sentadilla cerrada parcial, asistida, hacia pistol completa (rango, apoyo unilateral, control del tronco/tobillo), con cita⟧"
    alumno: "⟦PLACEHOLDER⟧"
  estado: borrador

gestos:                                      # [catálogo] exercise_2 de PS (59 familias en 65 filas: casi 1:1 con el nombre)
  - { id: PS.BILATERAL, nombre: "sentadillas bilaterales/preparatorias (CLOSE SQUAT, BORROWER, HACK SQUAT, CYCLIST SQ, COSSACK, DEEP SQ)" }
  - { id: PS.ASISTIDA,  nombre: "PS ASSISTED / PARCIAL / HEEL UP ASSISTED" }
  - { id: PS.COMPLETA,  nombre: "PS / PS W / HACK PS W / SEIZA TO PISTOL" }
  - { id: PS.SALTOS,    nombre: "PS TO BOX JUMP, SQUAT TUCK JUMP, REVERSE TO SQUAT JUMP" }

fases:
  - { orden: 1, nombre: "⟦descenso⟧",    contraccion: ⟦excentrica?⟧ }
  - { orden: 2, nombre: "⟦fondo⟧",       contraccion: ⟦isometrica?⟧ }
  - { orden: 3, nombre: "⟦ascenso⟧",     contraccion: ⟦concentrica?⟧ }

articulaciones_y_acciones:
  - { articulacion: coxofemoral, accion: ⟦⟧, plano: ⟦⟧ }
  - { articulacion: rodilla,     accion: ⟦⟧, plano: ⟦⟧ }
  - { articulacion: tobillo,     accion: ⟦p. ej. dorsiflexión⟧, plano: ⟦⟧ }
  - { articulacion: columna_lumbopelvica, accion: ⟦⟧, plano: ⟦⟧ }
  - { articulacion: coxofemoral_pierna_libre, accion: ⟦⟧, plano: ⟦⟧ }   # la pierna que no apoya

ruta_musculo:
  - { musculo: cuadriceps_recto_femoral, rol: ⟦⟧, contraccion: ⟦⟧, peso: ⟦⟧, cita: ⟦pendiente⟧ }
  - { musculo: vastos,                   rol: ⟦⟧, contraccion: ⟦⟧, peso: ⟦⟧, cita: ⟦pendiente⟧ }
  - { musculo: gluteo_mayor,             rol: ⟦⟧, contraccion: ⟦⟧, peso: ⟦⟧, cita: ⟦pendiente⟧ }
  - { musculo: gluteo_medio,             rol: ⟦⟧, contraccion: ⟦⟧, peso: ⟦⟧, cita: ⟦pendiente⟧ }
  - { musculo: aductores,                rol: ⟦⟧, contraccion: ⟦⟧, peso: ⟦⟧, cita: ⟦pendiente⟧ }
  - { musculo: isquiotibiales,           rol: ⟦⟧, contraccion: ⟦⟧, peso: ⟦⟧, cita: ⟦pendiente⟧ }
  - { musculo: gemelo_soleo,             rol: ⟦⟧, contraccion: ⟦⟧, peso: ⟦⟧, cita: ⟦pendiente⟧ }
  - { musculo: tibial_anterior,          rol: ⟦⟧, contraccion: ⟦⟧, peso: ⟦⟧, cita: ⟦pendiente⟧ }
  - { musculo: flexores_cadera_pierna_libre, rol: ⟦⟧, contraccion: ⟦⟧, peso: ⟦⟧, cita: ⟦pendiente⟧ }
  - { musculo: core_estabilizador,       rol: ⟦⟧, contraccion: ⟦⟧, peso: ⟦⟧, cita: ⟦pendiente⟧ }

bloques_didacticos:
  donde_se_siente: { profe: "⟦⟧", alumno: "⟦⟧" }
  compensacion_tipica: [ { profe: "⟦p. ej. qué pasa con el talón/rodilla/tronco⟧", alumno: "⟦⟧" } ]
  cues: [ { texto: "⟦⟧" } ]
  senales_derivacion: [ { texto: "⟦dolor articular de rodilla/cadera: criterio de derivación⟧" } ]

zonas_dibujo_resultantes: ⟦hoy muscle-zones da: gluteal, quadriceps, adductors; no pinta gemelos ni tibial⟧
validacion: { estado: borrador, revisor: null, fecha: null }

ejercicio_override_ejemplos:                 # excepciones esperables (a confirmar)
  - { clave: "PS | SEIZA TO PISTOL", motivo: "⟦entra desde sentado sobre talones: ¿cambia el trabajo?⟧" }
  - { clave: "PS | PS TO BOX JUMP",  motivo: "pliometría: contracción distinta (⟦validar⟧)" }
```

### 4.9 Ajustes al modelo que surgen de las partes 2 y 3 y de las revisiones

1. **Campo `gesto`.** La parte 1 propone la entidad **Gesto** (familia dentro de la ruta; `criterio` = `exercise_2` base). Con lo que mostraron las partes 2 y 3, pasa de "opcional" a **necesario en las rutas heterogéneas** (FL, NC, TTB, PIKE, MN/RP, AF, PS, HR). Propuesta de esta consolidación: cada ejercicio (clave lógica `ruta + exercise_2 + position`) se asocia a un `gesto_id`; el gesto "general" de la ruta es el valor por defecto cuando la ruta es homogénea.
2. **Nota de modelado: los roles por fase son por gesto, no por ruta.** El rol (motor, sinergista, estabilizador) y la contracción dependen de la orientación del cuerpo y de la fase, y la ruta mezcla gestos con orientación distinta. Ejemplos de los propios textos: el glúteo mayor es motor boca abajo (PL, PLPU, BL) y solo co-contrae boca arriba (FL, dragon flag, reverse planche), donde sostienen los flexores de cadera y el abdomen (BS5); dentro de MN/RP, el L-sit/V-sit y el reverse planche tienen distinta cadena; NC mezcla nordic (excéntrico de isquios sobre la rodilla), bisagra (cadera) y calf raises (el sóleo predomina con rodilla flexionada); SS/QC (flexores de cadera en isometría) no se comportan como PS; HR mezcla Jefferson (flexión-relajación de erectores) y arch hold (erectores motores). Por eso `Fase`, `FaseAccion` y `RutaMusculo` se cuelgan de `gesto_id` (y de `ruta_code` solo si la ruta es homogénea), y un test (T22) impide una ruta heterogénea con roles asignados a nivel de ruta.
3. **Más estados que roles.** Las revisiones usan "co-contracción" y "alargado" (Al) además de motor/sinergista/estabilizador/antagonista. Decisión de diseño pendiente: valores adicionales de `rol` o campo aparte.
4. **Banderas.** El bloque didáctico `senal_derivacion` necesita `nivel` (`urgencia` / `derivar` / `precaucion`) y un campo `nota_interna` separado del texto visible al profe (que no puede llevar rótulos clínicos): ver §3.1 y el test T21.
5. **Marcas de evidencia → `Cita.tipo_evidencia`.** `[n]` → `EMG`/`revision`/`texto_de_referencia` según la fuente; `[L1]–[L5]` → `texto_de_referencia` (sin verificar página); `[C]` → `practica_de_profes`/`consenso_de_expertos`; `[M]` → valor nuevo `derivacion_mecanica`; `[R]` → `correccion_de_revisor` (conocimiento estándar sin cita verificada). `⚑H` y `⚑N` → un campo `pendiente_con` (`kinesiologo` | `nacho`) en `Validacion`.
6. **Zonas y precisión.** Los músculos que no tienen región en el dibujo y pesan mucho en las revisiones (el iliopsoas, que sostiene las piernas en FL, dragon flag, SS y QC y sube las piernas en TTB; el recto femoral se agrupa en `quadriceps`) quedan con `precision: ninguna` y se explican solo en texto; el tibial anterior (QC, "tibiales pared") se resuelve sumando el slug `tibialis`, que ya existe en el JSON (costo cero de arte).


## 5. Guía de preguntas para los profes y mini-test antes/después

### 5.1 Cómo usarla
- Entrevista de 20–30 min por profe, **individual** (que no se contagien las respuestas), grabada o con notas; mismas preguntas para todos.
- Antes de la entrevista: mostrarles solo la lista de rutas (tal como aparecen en la plani), no la tabla de músculos.
- Anotar literal lo que dicen: el vocabulario del profe es el vocabulario que vamos a necesitar en el texto "profe".
- Resultado: tabla `pregunta × ruta × frecuencia × quién responde bien` (insumo para priorizar qué rutas se escriben primero).

### 5.2 Preguntas (16)

**A. Qué les preguntan los alumnos**
1. ¿Qué es lo que más te preguntan los alumnos sobre músculos? Dame los últimos 3 ejemplos concretos.
2. ¿Cuál es la pregunta tipo "¿dónde tengo que sentir esto?" más frecuente? ¿En qué ejercicio o ruta?
3. ¿Qué dolores o molestias te cuentan después de clase? ¿En qué ruta aparecen más (codo, muñeca, hombro, lumbar, rodilla, cuello)?
4. ¿Qué te preguntan de "por qué me cuesta más el straddle que el tuck" (u otros escalones)? ¿Qué respondés hoy?

**B. Qué no saben responder**
5. ¿Qué pregunta te dejó sin respuesta o con una respuesta de la que no estabas seguro? ¿Qué hiciste?
6. Recorriendo las rutas de la plani (FL, PL, BL, MU, OAP, HSPU, PHS, TTB, PS, SS, NC, QC, HT, BRIDGE, REVERSE HYPER, SIDE PCK, HR, MN/RP…), ¿en cuáles no sabés qué músculos trabajan? Marcá de 1 (no sé nada) a 5 (lo explico sin dudar).
7. ¿En cuáles te cuesta distinguir "brazo recto" de "brazo flexionado" y por qué eso importa para el cuerpo del alumno?
8. ¿Hay gestos que se confunden por el nombre (por ejemplo, la ruta de L-sit/Manna, o la HR)? ¿Cómo la llamás vos?

**C. Cuándo aparece la duda**
9. ¿En qué momento de la clase surge la pregunta (Initium, Nucleus, Deuteros, Athlos/Epikos, Kinesis, stretching) y cuánto tiempo tenés para responder?
10. ¿Respondés en el momento o lo dejás para después de clase? ¿Qué te gustaría tener a mano en ese momento?

**D. Formato**
11. ¿Dónde mirarías la explicación: en la TV de la sala, en tu celular (admin) o impresa? ¿Por qué?
12. ¿Qué extensión te sirve: una frase, tres líneas, o una ficha de página completa?
13. ¿Preferís un dibujo del cuerpo coloreado, una lista de músculos, un video corto, o texto?
14. Si el alumno tuviera la explicación en su app (Guía), ¿qué tendría que decir y qué NO tendría que decir (por ejemplo, tecnicismos o recomendaciones clínicas)?

**E. Límites y derivación**
15. ¿Cuándo derivás a un kinesiólogo o a un médico? ¿Qué señales usás hoy? ¿Qué señales te gustaría tener definidas por escrito?
16. ¿Qué te daría más seguridad: una cita (libro/paper) al lado de cada explicación, o que la revise un kinesiólogo/lic. en Educación Física y figure su nombre?

### 5.3 Mini-test de conocimiento previo (10 ítems)

Medida: se toma **antes** de que existan los contenidos y se repite **después** de un período de uso (p. ej. 4 semanas) con las mismas preguntas reordenadas. Puntaje por ítem: 0 / 1 / 2 (nada / parcial / completo) contra la respuesta esperada que cargue el validador. Los ítems son sobre **nuestras rutas**, no sobre anatomía de libro. Las respuestas esperadas son placeholders.

| # | Ruta | Pregunta | Formato | Respuesta esperada |
|---|---|---|---|---|
| 1 | FL | ¿Qué músculos hacen la fuerza principal del Front Lever y qué acción articular sostienen? | Abierta | ⟦validador⟧ |
| 2 | FL | ¿Qué cambia mecánicamente entre tuck y straddle y por qué es más difícil? | Abierta | ⟦validador⟧ |
| 3 | PL | ¿Por qué el planche (brazo recto) se siente distinto en el cuerpo que el planche push up (brazo flexionado)? | Abierta | ⟦validador⟧ |
| 4 | OAP / MU | En una dominada y en un muscle up, ¿qué músculos hacen la parte de tracción y cuáles aparecen en la transición? | Abierta | ⟦validador⟧ |
| 5 | HSPU | ¿Qué partes del hombro y del brazo trabajan más en una flexión invertida? | Múltiple opción (con distractores) | ⟦validador⟧ |
| 6 | NC | ¿Qué tipo de contracción predomina en el Nordic Curl y qué músculos la sostienen? | Abierta | ⟦validador⟧ |
| 7 | PS | En un pistol squat, ¿qué factor suele limitar primero: fuerza de cuádriceps, movilidad de tobillo o control de cadera? ¿Cómo lo distinguís? | Abierta | ⟦validador⟧ |
| 8 | TTB | ¿Qué músculos suben las piernas en toes to bar y cuáles estabilizan el agarre y el tronco? | Abierta | ⟦validador⟧ |
| 9 | BRIDGE | ¿Qué articulaciones aportan rango en un puente y cuál suele "robar" el movimiento? | Abierta | ⟦validador⟧ |
| 10 | HR (según nombre que fije Franco) | ¿Qué músculos trabajan en un "bote espinal" y en un side plank con codo? | Abierta | ⟦validador⟧ |

Extras sugeridos (para la fase de medición): 2 preguntas de **"dónde lo siento"** (alumno hipotético dice "me quema el codo en el muscle up") y 1 de **derivación**. Todas con respuesta ⟦validador⟧.

**Diseño de la medición:** n = todos los profes activos (probablemente pocos): usar medida pareada (mismo profe antes/después), versión A/B de las preguntas para no repetir idénticas, y registrar tiempo de respuesta. Con pocos profes el análisis es descriptivo, no estadístico.

Las respuestas esperadas se redactan a partir de los textos del §2 ya validados por un humano, no de este borrador (ver §6.5).

### 5.4 Preguntas para Nacho: siglas y definiciones sin resolver (de las tres partes)

Todo lo de la columna "Lo que sabemos" es hipótesis por nombres; **un error de definición invalida la tabla de músculos de ese gesto** (R3). Pedir la definición con el ejercicio a la vista (video o descripción de cómo se ejecuta). Las preguntas de método (nombres oficiales y criterios) van al final.

| # | Sigla / término | Dónde aparece | Lo que sabemos (hipótesis) | Qué preguntarle |
|---|---|---|---|---|
| 1 | **DP** | FL (13 filas: tuck…half layout, super adv) y DS | Parte 1: sin resolver en FL; en DS "dragon pistol" (hipótesis). Parte 2: ¿"dragon pull"? | ¿Es el mismo "DP" en las dos rutas? ¿Qué es en cada una? |
| 2 | **PQ** | SU (KNEE: "PQ PARCIAL", "PQ", "PQ FULL ROM W") | Sin hipótesis firme | ¿Qué significa y cómo se ejecuta? |
| 3 | **PSU** | SU (KNEE) | Hipótesis: pistol step-up | ¿Confirmás? ¿Diferencia con PQ? |
| 4 | **FR** | NC ("NC BENT FR") | Sin hipótesis | ¿Qué significa? |
| 5 | **PRE** | PLYO ("JUMP PRE") | Sin hipótesis | ¿Qué significa? |
| 6 | **MC** | CARDIO | Hipótesis: mountain climber | ¿Confirmás? |
| 7 | **ICM** | FL (4 filas) | "Ice Cream Maker" (nombre de comunidad; baja confianza) | ¿Es eso? ¿Cómo se ejecuta? |
| 8 | **Yewkies** | FL (5 filas) | Nombre de comunidad sin definición | ¿Qué es y qué trabaja? |
| 9 | **Hefesto** | HD/ID ("Hefesto / Pelican") y nombre de la ruta en la TV | Sin definición | ¿Qué es? ¿Por qué la TV llama a la ruta "Hefesto / Impossible Dips"? |
| 10 | **Elbow Victorian** | FL (13 filas) | Sin definición | ¿Cómo se ejecuta? ¿Por qué está en FL? |
| 11 | **Caseta** | PL, PLPU ("CASETA PL TO STR ASSISTED", "PLPU CASETA") | Sin definición | ¿Qué es? |
| 12 | **"L."** | HT ("HT L. ON BOX OL") | Sin hipótesis | ¿Qué significa? |
| 13 | **BOAT** | FL (7 filas), CORE ANTERIOR | Parte 2: soporte isométrico de core anterior (boat tuck/str/full, boat a invertida) | ¿Es el "boat" de gimnasia? ¿Qué escalones tiene? |
| 14 | **Ariete**, **Zanetti**, **Inv Deadlift** | Parte 2 los lista como nombres de comunidad sin definición (Zanetti en BL) | — | ¿Qué son y dónde están? |
| 15 | **Delta / Omega** | SPAGAT (full/assisted, delta/omega) | Hipótesis: tipos de asistencia | ¿Qué significan? |
| 16 | **HD/ID** | ruta HD/ID | Hipótesis no verificada: "Horizontal Dip / Incline Dip" | ¿Qué significa la sigla? |
| 17 | **HR** | ruta HR | Sin expansión en el repo | ¿Qué significa la sigla? ¿Cómo se llama oficialmente la ruta? |
| 18 | **"Hinge" / "ABS HINGE"** | TTB (CORE ANTERIOR) | Probable anti-extensión con descenso en bisagra (no verificada) | ¿Cómo se ejecuta? |
| 19 | **"Retracción to 90"** | FL (PULL VERTICAL) | Probable arrastre del cuerpo hacia ~90° con brazos rectos | ¿Confirmás? |
| 20 | **SUPINE / PRONE** | BL | Probable orientación de mano/agarre (no confirmado) | ¿Qué indican? |
| 21 | **Russian, Korean, Bulgarian, Hungarian, impossible, supine, protracted dips; Pelican** | HD/ID | "Russian" suele designar el fondo que baja a apoyar los antebrazos (no verificado) | Definición de cada variante |
| 22 | **Bote espinal, espinal cajón, espinal 360, espinal A 1, espinal torsión** | HR | "Bote espinal" muy probablemente un arch hold boca abajo; "A 1" quizá a una pierna | ¿De qué ejercicios se compone cada uno? |
| 23 | **Reverse planche** | MN/RP | La revisión necesita saber si es el apoyo libre (solo manos, boca arriba) o la variante con pies apoyados: **cambia qué músculos son motores** | ¿Cuál es? |
| 24 | **Dragon squat / Dragon HT / QC (seiza, quad box)** | DS, QC | DS: sentadilla monopodal con la pierna libre por detrás; QC: cuádriceps desde arrodillado, sin descripción en el repo | Descripción de cada ejercicio |
| 25 | **FL WIDE, OAC, "L SIT PL.UP"** | FL, OAP | FL WIDE = brazos más abiertos (sin evidencia); OAC = chin-up a una mano (inferido) | ¿Confirmás? |
| 26 | **ATW, LS, GM, shuffle, speed skater** | TTB, L, NC, SU | Around The World, lunge/split squat, good morning (inferido) | ¿Confirmás? |

**Preguntas de método (para alinear con el método de El Templo):**
- ¿Cuál es el nombre oficial de HR, MN/RP, SIDE PCK, HD/ID y FLR? (decide qué texto se muestra y cómo se rotulan las rutas).
- ¿Cuál es el criterio de la DB para clasificar MN/RP como PULL HORIZONTAL y BL como PUSH HORIZONTAL? (hipótesis de la parte 2: extensores vs flexores de hombro; C2/C3 en §1.8).
- ¿FL contiene dragon flag, Victorian, press, boat y rows a propósito, o es una acumulación histórica? ¿Qué gestos reconocés dentro de FL, NC, TTB, PIKE y AF? (§4.6).
- ¿Los escalones (tuck, adv tuck, straddle, half layout, full) son los mismos en todas las rutas de palanca? ¿Dónde cambian el orden?
- ¿PLYO y KL deberían ser rutas?

## 6. Plan de validación

### 6.1 Etapas, responsables y estado

| Etapa | Quién | Estado | Qué valida | Entrega |
|---|---|---|---|---|
| (a) Revisión adversarial | Agente en rol de Lic. en Kinesiología y Fisiatría | **HECHA** (2026-10-21) | Anatomía, mecánica, citas y banderas de las partes 2 y 3 | Apéndice B (86 hallazgos aplicados) |
| (b) Kinesiólogo humano | Persona a designar (Franco) | **Pendiente** | **Solo** las banderas de derivación (§3.1) y la lista consolidada "necesita humano" (§6.3) | Observaciones por PR o planilla; estado por afirmación |
| (c) Nacho | Nacho | **Pendiente** | Alineación con el método de El Templo, nombres oficiales y siglas (§5.4) | Diccionario resuelto (§1.4) que desbloquea los ⚑N |
| (d) Test de profes | Todos los profes activos | **Pendiente** | Que la sección sirva: conocimiento antes/después y qué preguntas responde | Resultados descriptivos (§5.2–5.3) |
| (e) Tests automáticos | CI | **Diseño listo** (T1–T23) | Coherencia entre contenido, catálogo, dibujo y poll de la TV | Tests en el repo cuando exista el modelo |

**Orden recomendado:** (c) antes que (b) en lo que cambia qué músculos son motores (reverse planche, bote espinal, QC, DS), porque de esas definiciones depende la tabla; (b) antes de que cualquier bandera llegue a un profe; (d) "antes" puede hacerse ya (no necesita contenido); (d) "después" solo con contenido validado; (e) acompaña al modelo desde el primer archivo de contenido.
**Criterio de salida:** ninguna afirmación pasa a `validado` si tiene ⚑H sin firma humana o ⚑N sin definición de Nacho, y no se muestra contenido en estado `borrador` a alumnos (test T10).

### 6.2 (a) Revisión por agente kinesiólogo: HECHA

**Qué hizo.** Dos revisiones adversariales (parte 2 y parte 3), en rol de Lic. en Kinesiología y Fisiatría con foco en biomecánica y calistenia. Bajó los abstracts de las fuentes por PMID desde Europe PMC y leyó el texto completo de `[1]` (Prinold) y de Hart 2024 (`[31]`) y la página de la revista de `[35]`. No consultó Neumann ni Kapandji: lo que atribuye a "anatomía estándar" no está verificado contra el libro.
**Qué encontró.** 86 hallazgos: R2 = 45 (9 CRÍTICO, 19 MAYOR, 17 MENOR); R3 = 41 numerados (7, 12, 22; la revisión declara 40 y 21 menores).
- **Mecánica de las palancas (R2-1 a R2-5, R2-9, R2-14):** el documento original asignaba el sostén de piernas y pelvis a la cadena posterior en FL, dragon flag y reverse planche y lo generalizaba a todas las palancas. Boca arriba sostienen los flexores de cadera y el abdomen; boca abajo, glúteo, isquiotibiales y erectores. Además, en un planche sostenido el centro de masa va sobre las manos y lo que crece con la palanca es la distancia hombro–centro de masa.
- **Acciones articulares invertidas:** el empuje del muscle-up es flexión de hombro desde la hiperextensión y la transición va hacia la extensión máxima (R2-6); la vertical exige flexión, no extensión (R2-7).
- **Roles y contracción (R3-1 a R3-4):** sissy y quad curl sostienen la cadera con flexores (no glúteo/isquios); en el side pancake, a favor de la gravedad, trabajan en excéntrico los oblicuos y el cuadrado lumbar del lado contrario; en la caída del swing frenan los extensores de cadera.
- **Banderas:** faltaban las urgencias (columna con síntomas en la zona de la silla de montar o bilaterales, orina oscura post-esfuerzo, "pop" con hematoma, patada en el Aquiles, dolor de pecho, adolescentes con renguera), las banderas sistémicas, las de rodilla (derrame, bloqueo) y las contraindicaciones de la flexión cargada; además había rótulos diagnósticos que el profe no debe usar.
- **Citas** (numeración unificada, Apéndice A): R2 verificó las 36 de la parte 2: 1 mal reportada (`[8]`, dips: el pico de tríceps era menor en banco), 1 sobreinterpretada en sentido contrario (`[28]`), 3 parciales (`[12]`, `[29]`, `[35]`) y 4 usadas como respaldo de filas que no tratan (`[9]`, `[16]`, `[24]`, `[34]`); la afirmación de ausencia de EMG de muscle-up falla (`[37]`, Walker 2023) y para HSPU solo hay un preprint (`[39]`). R3 verificó 69 de las 71 de la parte 3: 1 no dice lo afirmado (`[73]`, McGill & Marshall 2012, en la sección de kettlebell), 2 reportadas a medias (`[46]` Bryanton, `[96]` Finucane), 5 imprecisiones (`[44]`, `[50]`, `[82]`, `[88]`, `[89]`) y 2 extrapolaciones débiles (`[48]`, `[102]`); no verificó `[87]` ni `[106]`. No hallaron DOIs, autores ni números inventados.
**Cómo se corrigió.** Texto de reemplazo de la revisión en el cuerpo (no solo en la referencia) para todos los CRÍTICO y MAYOR, y para los MENORES salvo los parciales: ver Apéndice B (16 críticos, 31 mayores y 37 menores aplicados; 2 menores aplicados en parte; 0 no aplicados).
**Límite de esta etapa.** Es un agente, no una persona matriculada: lo que no tiene cita queda marcado `[R]` o `[C]` y todo lo "a confirmar" quedó como ⚑H.

### 6.3 (b) Kinesiólogo humano: alcance acotado

**Qué se le pide (solo esto):**
1. **Las banderas de derivación** (§3.1: niveles a y b, precauciones c, umbrales de tiempo, a quién se deriva en cada caso y qué puede decir un profe y qué no).
2. **La lista consolidada de puntos "necesita humano"** de ambas revisiones (ordenada; el resto del documento lo validan Nacho, los profes y los tests):

| # | Punto | Origen | Dónde está marcado |
|---|---|---|---|
| H1 | Confirmar la redacción de la cadena anterior (boca arriba) / posterior (boca abajo) y su aplicación a FL, dragon flag, reverse planche, planche y back lever; **revisar si hay el mismo error en otras rutas** (p. ej. el reverse nordic) | R2 §5 #1; R3 §humano #1 | BS5, S3.1, S3.3, S4.1, S4.4, S6.1 |
| H2 | Validar las correcciones de rol: sissy y quad curl (flexores de cadera), side pancake (lado contrario) y swing (extensores en la caída) | R3 §humano #1 | A3, A4, C3, G1 |
| H3 | Qué es exactamente el **reverse planche** del catálogo (apoyo libre o con pies apoyados) y de qué ejercicios se componen bote espinal, espinal cajón/360/A 1, las variantes de fondos, Hefesto, ICM y DP; definiciones de QC, PQ, PSU, DP, delta/omega y dragon squat. *(Compartido con Nacho, §6.4)* | R2 §5 #2; R3 §humano #9 | S3.3, S4.2, S6.2, §5.4 |
| H4 | Posición escapular en el back lever (depresión vs elevación, retracción vs protracción); varía por escuela | R2 §5 #3 | S4.1 |
| H5 | **Umbrales de tiempo** (~2 semanas; 2–3 semanas en rodilla y Aquiles) y criterio para diferenciar dolor muscular tardío de dolor tendinoso | R2 §5 #4; R3 §humano #2 | §3.1 b5, b13, b16 |
| H6 | Progresión de exposición en SAS (sesiones o semanas antes de subir de escalón en BL, German hang, manna, planche) | R2 §5 #5 | BS4, §3.1 c5 |
| H7 | Población **hiperlaxa o con antecedente de luxación**: colgado pasivo, German hang, skin the cat, spagat y bridge; cómo detectarla sin pruebas clínicas | R2 §5 #6; R3 §humano #7 | S2.1, §3.1 c3 |
| H8 | **Menores y adolescentes**: volumen de apoyo de muñeca y colgados, criterios de edad y carga para sissy, seiza/QC, saltos y bridge | R2 §5 #7; R3 §humano #3 | §3.1 b8, b18, c6 |
| H9 | Tamizaje médico previo a las inversiones (excede la kinesiología: validar con un médico) | R2 §5 #8 | S5.1, §3.1 c2 |
| H10 | Posición de la muñeca en el falso agarre (flexión + qué desviación) y su carga cubital | R2 §5 #9 | S2.2 |
| H11 | "Codos hiperextendidos" en la vertical: ¿se corrige siempre o se tolera en hiperlaxos? | R2 §5 #10 | S5.1 |
| H12 | **Jefferson curl con carga**: inclusión y exclusión (osteoporosis, hernia, edad) y cómo progresar la carga | R2 §5 #11; R3 §humano #6 | S6.2, B-NC-3, §3.1 c1 |
| H13 | Circuito de derivación completo: qué es urgencia y qué es derivar, y a quién se deriva (kinesiólogo, médico, guardia) | R3 §humano #2 | §3.1 |
| H14 | Dragon squat, pistol y pigeon con una cadera con dolor articular profundo o hiperlaxa: cuándo regresar el rango y cuándo contraindicar | R3 §humano #4 | B-DS, A2, C1 |
| H15 | Seiza/quad curl y sissy en rodillas con antecedente de menisco o dolor rotuliano: si se permite rango parcial y con qué criterio | R3 §humano #5 | A3, A4 |
| H16 | Primera exposición al nordic: dosis inicial segura (volumen) | R3 §humano #8 | B-NC-1, §3.1 a3, c4 |
| H17 | Escápula en el reverse planche con el hombro en hiperextensión (inclinación anterior y rotación hacia abajo) | R2-12 | S3.3 |
| H18 | Colgado pasivo prolongado en hombros laxos (reemplazo de "sin contracción muscular necesaria") | R2-10 | S2.1 |

**Cómo entregar:** un PR por sección comentable por el kinesiólogo, o una planilla con las filas H1–H18 y las banderas a1–c6 (Franco la vuelca después a los archivos de contenido; ver §4.7). Cada observación se registra con revisor, fecha y versión (`Validacion`, §4.3).

### 6.4 (c) Nacho: alineación con el método y siglas

- **Siglas y definiciones sin resolver:** las 26 filas de §5.4 (DP, PQ, PSU, FR, PRE, MC, ICM, Yewkies, Hefesto, Elbow Victorian, caseta, "L." en HT, BOAT, delta/omega, bote espinal, reverse planche, etc.). Resultado: el diccionario de §1.4 sin ⚑N.
- **Método:** nombres oficiales de HR, MN/RP, SIDE PCK, HD/ID y FLR; criterio de clasificar BL en PUSH y MN/RP en PULL (C2/C3 en §1.8); qué gestos reconoce dentro de FL, NC, TTB, PIKE y AF (§4.6); si los escalones (tuck, adv tuck, straddle, half layout, full) valen igual en todas las rutas de palanca; si PLYO y KL son rutas.
- **Qué se le muestra:** la sección 2 solo en lo que es método (por qué progresa cada ruta y qué cambia entre escalones); no se le pide revisar la anatomía (eso es (b)).

### 6.5 (d) Test de profes antes/después

- **Antes (ya se puede hacer):** entrevista individual de 20–30 min con las 16 preguntas de §5.2 (mostrar solo la lista de rutas de la plani, no la tabla de músculos) + mini-test de §5.3 (10 ítems sobre **nuestras rutas** + 2 de "dónde lo siento" + 1 de derivación). Registrar literal el vocabulario del profe y el tiempo de respuesta.
- **Después:** repetir el mini-test reordenado (versión A/B) tras un período de uso (≈4 semanas). Puntaje 0/1/2 por ítem contra respuestas esperadas **redactadas desde los textos ya validados por un humano**, no desde este borrador. Medida pareada (mismo profe); con pocos profes el análisis es descriptivo.
- **Qué mide:** si la sección reduce preguntas sin respuesta, cuánto tarda el profe en responder y si derivar mejora (pregunta de derivación del mini-test).

### 6.6 (e) Tests automáticos de coherencia

Los tests se corren en CI (el repo no corre tests locales de API). Con el modelo en archivos, la mayoría son puros; los que necesitan el catálogo real usan el `eltemplo_test` ya provisionado o un snapshot JSON de rutas. T21 a T23 son propuestos por esta consolidación a partir de las revisiones.

| # | Test | Qué detecta | Fuente de verdad |
|---|---|---|---|
| T1 | **Cobertura de rutas**: toda `routes.code` con ≥1 ejercicio (o `FB`) tiene entrada en el contenido | Ruta nueva sin explicación | `routes` DB vs `content/rutas/*` |
| T2 | **Sin huérfanos**: toda ruta del contenido existe en `routes` | Contenido de ruta borrada | idem |
| T3 | **Zonas válidas**: todo `musculo.regiones[]` apunta a un `slug` que existe en `anatomia.json` (para la vista declarada) | Slug mal escrito, vista incompatible | `anatomia.json` |
| T4 | **Todo músculo mapea a ≥1 región** o está marcado `precision: ninguna` con motivo | Músculo invisible sin querer | contenido |
| T5 | **Sin zona sin fuente**: toda zona de `ZONA_ES`/TV es alcanzable desde al menos un `RutaMusculo` motor/sinergista | Zona "muerta" en la TV | modelo + dibujo |
| T6 | **Unicidad de fuente**: no existe otra tabla `ZONA_ES`/`TvZonaMuscular` (grep o importación única) | Deriva de las 3 copias | repo |
| T7 | **Roles válidos**: `rol ∈ {motor, sinergista, estabilizador, antagonista}`, `contraccion ∈ {concentrica, excentrica, isometrica, pliometrica}`, cada fase con ≥1 acción | Typos / fase vacía | esquema |
| T8 | **Rol coherente con la acción**: un músculo `motor` de una fase debe estar vinculado (MusculoAccion) a una acción de esa fase | Rol sin sustento anatómico | modelo |
| T9 | **Citas obligatorias**: toda afirmación en estado `validado` tiene ≥1 cita con `ubicacion` no vacía; toda cita referenciada existe | Contenido "validado" sin respaldo | modelo |
| T10 | **Estados**: nada en producción con `estado ∈ {borrador, rechazado}` salvo flag explícito (`mostrar_borradores`) | Mostrar contenido sin revisar al alumno | modelo |
| T11 | **Textos por audiencia**: para cada ruta con `estado ≠ borrador`, existen `profe` y `alumno` no vacíos, y el `alumno` no contiene tecnicismos de una lista bloqueada (p. ej. nombres latinos) | Tono equivocado | textos |
| T12 | **Herencia resuelve**: para cada ruta y cada campo obligatorio, la cadena complejo→ruta→gesto devuelve valor; reporta `sin_contenido` | Campos faltantes silenciosos | modelo |
| T13 | **Overrides válidos**: toda clave de override (`exercise_id`/clave lógica) existe en `exercises`; ningún override quita un músculo que no está heredado | Override roto tras renombrar un ejercicio | DB + modelo |
| T14 | **Etiquetas de ruta alineadas**: `nombre_oficial` de cada ruta coincide con `routes.display_name`, con `route-labels.ts` (api/admin/app) | A4/A5/A6 | repo + DB |
| T15 | **Cobertura de dibujo**: ninguna ruta de fuerza queda con 0 regiones (salvo `FB`, PLYO, KL declarados "sin mapeo") | Bloque TV sin pintar | modelo |
| T16 | **Paridad con la TV actual (regresión)**: mientras convivan, para cada ruta `zonas_nuevas ⊇ zonas_viejas` o la diferencia está listada y aprobada en un archivo `diferencias-aprobadas.yaml` | Cambios de pintura de la TV no revisados | `muscle-zones.ts` vs modelo |
| T17 | **Escalones**: `escalones[]` y `habilidades[]` de la ruta == `route-progression-map.ts` (si no se exporta de ahí) | Doble fuente de progresión | repo |
| T18 | **Cierre de pares**: toda acción con plano tiene `plano ∈ {sagital, frontal, transverso}` y toda articulación usada existe | Datos incompletos | modelo |
| T19 | **Sin números mágicos en citas**: página/sección con formato válido; DOI/URL con regex | Citas inválidas | modelo |
| T20 | **Snapshot del contrato del poll**: `zonas` sigue siendo `string[]` ordenado | Rotura del kiosco | tests de la TV |
| T21 | **Banderas** (propuesto por esta consolidación): toda bandera tiene `nivel` (urgencia / derivar / precaución) y `nota_interna` separada; el texto visible al profe no contiene rótulos de una lista bloqueada (diagnósticos clínicos, nombres de pruebas) | Rótulos diagnósticos en texto visible (R2-22, R3-19) | modelo + textos |
| T22 | **Rol por gesto** (propuesto): ninguna ruta marcada heterogénea tiene `Fase`/`RutaMusculo` asignados a nivel de ruta; toda ruta heterogénea declara sus gestos | Heredar roles de una ruta mezcla orientaciones (R2-1, §4.9) | modelo |
| T23 | **Urgencias** (propuesto): toda ruta que carga la columna, salta o es de cardio referencia el bloque de urgencia correspondiente (a1, a2, a5) | Omisión de las urgencias (R3-5, R3-18) | modelo |

## Apéndice A. Referencias unificadas y renumeradas

Unifica las listas de las partes 2 y 3 sin duplicados (Ekstrom 2007 y Hart 2024 estaban en ambas) y agrega las tres fuentes señaladas por la revisión de la parte 2. **Se conserva la marca de cómo se leyó cada una:** *abstract* (texto del abstract obtenido de Europe PMC/PubMed; no se leyeron métodos ni tablas), *texto completo*, *texto parcial* (secciones), *libro de memoria* (sin verificar página) o *señalada por la revisión* (leída solo por el revisor). Numeración: [1]–[36] = parte 2; [37]–[39] = señaladas por la revisión; [40]–[108] = parte 3 (sin duplicados); [109] = referencia no leída. Las citas del cuerpo fueron renumeradas en consecuencia. "Nota de la revisión" resume lo que las revisiones encontraron de cada cita (detalle en el Apéndice B).

### A.1 Fuentes numeradas

**[1]** Prinold JAI, Bull AMJ. *Scapula kinematics of pull-up techniques: Avoiding impingement risk with training changes.* J Sci Med Sport 2016. PMC4916995, PMID 26383875. — **leída: texto completo vía WebFetch, resumen procesado**

**[2]** Dickie JA, Faulkner JA, Barnes MJ, Lark SD. *Electromyographic analysis of muscle activation during pull-up variations.* J Electromyogr Kinesiol 2017;32:30–36. PMID 28011412, doi:10.1016/j.jelekin.2016.11.004. — **leída: abstract**

**[3]** Youdas JW, et al. *Surface electromyographic activation patterns and elbow joint motion during a pull-up, chin-up, or Perfect-Pullup™ rotational exercise.* J Strength Cond Res 2010;24(12):3404–3414. PMID 21068680, doi:10.1519/jsc.0b013e3181f1598c. — **leída: abstract** *Nota de la revisión:* R2-43: no reporta diferencias en dorsal ancho; no lo afirma explícitamente.

**[4]** Rosaci G, Nigro F, Cortesi M, Ciacci S, Bartolomei S, Fantozzi S. *Electromyographic Analysis of the Support Scale (planche) in Gymnastics and Its Related Preconditioning Strengthening Exercises.* J Strength Cond Res 2025;39(6):680–686. PMID 40014850, doi:10.1519/jsc.0000000000005074. — **leída: abstract**

**[5]** Kochanowicz A, et al. *Changes in the Muscle Activity of Gymnasts During a Handstand on Various Apparatus.* J Strength Cond Res 2019;33(6):1609–1618. PMID 28700510. — **leída: abstract**

**[6]** Kochanowicz A, et al. *Relationship between postural control and muscle activity during a handstand in young and adult gymnasts.* Hum Mov Sci 2018. PMID 29471194, doi:10.1016/j.humov.2018.02.007. — **leída: abstract** *Nota de la revisión:* R2-45: los porcentajes de este estudio son contribución relativa entre músculos, no %MVIC.

**[7]** MacDonald M, Baker JS, Gu Y, Ugbolue UC. *Biomechanical analyses of the handstand: a systematic review.* 2025. PMID 41473027, doi:10.3389/fspor.2025.1694648. — **leída: abstract**

**[8]** McKenzie A, Crowley-McHattan Z, Meir R, Whitting J, Volschenk W. *Bench, Bar, and Ring Dips: Do Kinematics and Muscle Activity Differ?* 2022. PMID 36293792, doi:10.3390/ijerph192013211. — **leída: abstract** *Nota de la revisión:* R2-8: **mal reportada** en la versión original (el pico de tríceps fue menor en banco); corregida en S4.2.

**[9]** Decker MJ, Hintermeister RA, Faber KJ, Hawkins RJ. *Serratus anterior muscle activity during selected rehabilitation exercises.* Am J Sports Med 1999. PMID 10569366. — **leída: abstract** *Nota de la revisión:* R2-37: mide serrato anterior; no respalda filas de bíceps ni manguito (retirada de S4.3).

**[10]** Ludewig PM, Cook TM, Nawoczenski DA. *Three-dimensional scapular orientation and muscle activity at selected positions of humeral elevation.* J Orthop Sports Phys Ther 1996;24(2):57–65. PMID 8832468. — **leída: abstract**

**[11]** Ludewig PM, Reynolds JF. *The association of scapular kinematics and glenohumeral joint pathologies.* J Orthop Sports Phys Ther 2009. PMID 19194022. — **leída: abstract**

**[12]** Timmons MK, et al. *Scapular kinematics and subacromial-impingement syndrome: a meta-analysis.* J Sport Rehabil 2012;21(4). PMID 22388171. — **leída: abstract** *Nota de la revisión:* R2-17: la elevación y la retracción que reporta son claviculares; corregida en BS1.

**[13]** Hwang UJ, et al. *Effect of Humeral-Elevation Angle on Electromyographic Activity in the Serratus Anterior During the Push-Up-Plus Exercise.* J Sport Rehabil 2017. PMID 27632840. — **leída: abstract**

**[14]** Kang FJ, Ou HL, Lin KY, Lin JJ. *Serratus Anterior and Upper Trapezius Electromyographic Analysis of the Push-Up Plus Exercise: A Systematic Review and Meta-Analysis.* J Athl Train 2019. PMID 31584855. — **leída: abstract**

**[15]** Maenhout A, et al. *Electromyographic analysis of knee push up plus variations.* Br J Sports Med 2010. PMID 19752153. — **leída: abstract**

**[16]** Cools AM, et al. *Rehabilitation of scapular muscle balance: which exercises to prescribe?* Am J Sports Med 2007. PMID 17606671. — **leída: abstract** *Nota de la revisión:* R2-37: trata de ejercicios de trapecio, no de rows; retirada de S3.4.

**[17]** Calatayud J, et al. *Bench press and push-up at comparable levels of muscle activity results in similar strength gains.* J Strength Cond Res 2015. PMID 24983847. — **leída: abstract**

**[18]** Gendre P, Boileau P. *The Injured Shoulder in High-Level Male Gymnasts, Part 1: Epidemiology and Pathoanatomy of Surgically Treated Lesions.* Orthop J Sports Med 2021. PMID 34631906. — **leída: abstract** *Nota de la revisión:* R2-41: 27 de 30 hombros (26 gimnastas); subluxación inferior voluntaria como parte del entrenamiento.

**[19]** Gendre P, Boileau P. *…Part 2: Can Athletes Return to Competition After Surgery?* Orthop J Sports Med 2021. PMID 34631907. — **leída: abstract**

**[20]** Ngo JK, Solis-Urra P, Sanchez-Martinez J. *Injury Profile Among Street Workout Practitioners.* Orthop J Sports Med 2021. PMID 34189146. — **leída: abstract**

**[21]** Marina M, Torrado P, Ferrer-Uris B, Busquets A. *Benefits of Training the Iron Cross With Herdos Devices and External Load Added to Body Weight for Young Nonachiever Gymnasts.* 2023. PMID 37734741, doi:10.1123/ijspp.2023-0183. — **leída: abstract**

**[22]** Bohm S, Mersmann F, Arampatzis A. *Human tendon adaptation in response to mechanical loading: a systematic review and meta-analysis of exercise intervention studies on healthy adults.* Sports Med Open 2015. PMID 27747846. — **leída: abstract**

**[23]** McGill S, Andersen J, Cannon J. *Muscle activity and spine load during anterior chain whole body linkage exercises: the body saw, hanging leg raise and walkout from a push-up.* J Sports Sci 2015. PMID 25111163. — **leída: abstract**

**[24]** Escamilla RF, et al. *Core muscle activation during Swiss ball and traditional abdominal exercises.* J Orthop Sports Phys Ther 2010;40(5):265–276. PMID 20436242. — **leída: abstract** *Nota de la revisión:* R2-37: pelota suiza, no FL ni PL; retirada de esas filas. Sigue respaldando el EMG de roll-out y pike (BS5, S6.1).

**[25]** Ekstrom RA, Donatelli RA, Carp KC. *Electromyographic analysis of core trunk, hip, and thigh muscles during 9 rehabilitation exercises.* J Orthop Sports Phys Ther 2007. PMID 18560185. — **leída: abstract** *Nota de la revisión:* Citada en las partes 2 y 3 (unificada).

**[26]** McGill S, Juker D, Kropf P. *Quantitative intramuscular myoelectric activity of quadratus lumborum during a wide variety of tasks.* Clin Biomech 1996. PMID 11415616. — **leída: abstract**

**[27]** Kibler WB, Press J, Sciascia A. *The role of core stability in athletic function.* Sports Med 2006. PMID 16526831. — **leída: abstract**

**[28]** Willett GM, et al. *Relative activity of abdominal muscles during commonly prescribed strengthening exercises.* J Strength Cond Res 2001. PMID 11726260. — **leída: abstract** *Nota de la revisión:* R2-18: **sobreinterpretada** (el abstract apoya la activación diferencial); corregida en S6.1.

**[29]** Youdas JW, et al. *An electromyographic analysis of the Ab-Slide exercise, abdominal crunch, supine double leg thrust, and side bridge in healthy young adults.* J Strength Cond Res 2008. PMID 18978615. — **leída: abstract** *Nota de la revisión:* R2-19: se midió en adultos sanos; la inferencia sobre pacientes es especulación de los autores; corregida en S2.4.

**[30]** Di Fonza D, et al. *Electromyographic Analysis of Latissimus Dorsi Activation During Common Resistance Training Exercises: A Narrative Review.* 2026. PMID 42647355, doi:10.3390/jfmk11030315. — **leída: abstract**

**[31]** Hart E, Bauer AS, Bae DS. *Common upper extremity gymnastics injuries and gymnastic specific return to play protocols.* 2024. PMID 40433250, doi:10.1016/j.jposna.2024.100016. — **leída: abstract** *Nota de la revisión:* Citada en las partes 2 y 3 (unificada): abstract en la parte 2; en la parte 3 se leyó además el texto de la sección de muñeca (PMC12088353, PMID 40433250). Base de las banderas de menores.

**[32]** McGill SM, Brown S. *Creep response of the lumbar spine to prolonged full flexion.* Clin Biomech 1992. PMID 23915616. — **leída: abstract**

**[33]** Sciascia A, Kibler WB. *Current Views of Scapular Dyskinesis and its Possible Clinical Relevance.* 2022. PMID 35136680. — **leída: abstract**

**[34]** von Laßberg C, Rapp W. *The punctum fixum-punctum mobile model: a neuromuscular principle for efficient movement generation?* PLoS One 2015. PMID 25822498. — **leída: abstract** *Nota de la revisión:* R2-37: estudia fases de aceleración, no sostenes.

**[35]** Niespodziński B, Mieszkowski J, Marina M, Kochanowicz A. *Upper Limb Neuromuscular Characteristics during a Press Handstand on Parallel Bars in Young (10–12 Years Old) and Adult Male Artistic Gymnasts.* J Hum Kinet, online 2026-03-16. — **leída: abstract, página de la revista** *Nota de la revisión:* R2-20: la revisión leyó la página de la revista; corregida en S5.3.

**[36]** Tahani HS, Minoonejad H, Zandi S, Ebrahimi E. *Comparison of endurance and electromyographic activity of core muscles in overhead athletes with and without scapular dyskinesis.* 2026. PMID 42218292, doi:10.1038/s41598-026-56082-8. — **leída: abstract**

**[37]** Walker CW, Bruenger AJ, Tucker WS, Lee HR. *Comparison of Muscle Activity During a Ring Muscle Up and a Bar Muscle Up.* Int J Exerc Sci 2023. PMID 38288256, doi:10.70252/fjql7859. — **señalada por la revisión (R2-15), leída solo por el revisor (abstract, Europe PMC)**. n = 10 hombres activos; anillas > barra en trapecio superior, bíceps y flexores de antebrazo en el tirón, y en tríceps y bíceps en el empuje; los estabilizadores escapulares no cambiaron. **Reemplaza la afirmación original de que no había EMG de muscle-up.**

**[38]** Choo CH, Ng WN. *Complete Pectoralis Major Tendon Rupture in a Calisthenics Athlete: A Case Report.* Malays Orthop J 2021. PMID 33880159, doi:10.5704/moj.2103.019. — **señalada por la revisión (R2-24), leída solo por el revisor (abstract mínimo; solo confirma que el caso existe)**.

**[39]** Bove G. *Characterization of Axial Forces to the Head during Kipping Handstand Push-ups.* Preprints.org 2024, doi:10.20944/preprints202309.0271.v2. — **señalada por la revisión (R2-25); preprint NO revisado por pares; leída solo por el revisor (abstract)**.

**[40]** Escamilla RF. My top five concepts for selecting lower extremity exercises for cruciate ligament and patellofemoral rehabilitation. Int J Sports Phys Ther 2023;18(1):414-425. PMC9897005. — **leída — texto completo** *Nota de la revisión:* R3-13: sus datos de talones despegados vienen de sentadillas; no aplican al fondo del sissy. Texto completo leído por la parte 3 y por R3.

**[41]** Escamilla RF. Knee biomechanics of the dynamic squat exercise. Med Sci Sports Exerc 2001. PMID 11194098. — **leída — abstract**

**[42]** Escamilla RF et al. Effects of technique variations on knee biomechanics during the squat and leg press. Med Sci Sports Exerc 2001. PMID 11528346. — **leída — abstract**

**[43]** Escamilla RF et al. A three-dimensional biomechanical analysis of the squat during varying stance widths. Med Sci Sports Exerc 2001. PMID 11404665. — **leída — abstract**

**[44]** Escamilla RF et al. A three-dimensional biomechanical analysis of sumo and conventional style deadlifts. Med Sci Sports Exerc 2000. PMID 10912892. — **leída — abstract** *Nota de la revisión:* R3-31: la redacción original mezclaba trabajo total con momento plantiflexor; corregida en B-NC-2.

**[45]** Fry AC, Smith JC, Schilling BK. Effect of knee position on hip and knee torques during the barbell squat. J Strength Cond Res 2003. PMID 14636100. — **leída — abstract**

**[46]** Bryanton MA et al. Effect of squat depth and barbell load on relative muscular effort in squatting. J Strength Cond Res 2012. PMID 22797000. — **leída — abstract** *Nota de la revisión:* R3-9: **reportada a medias** (omitía que los extensores de cadera aumentan también con la profundidad); corregida en BI2.

**[47]** Caterisano A et al. The effect of back squat depth on the EMG activity of 4 superficial hip and thigh muscles. J Strength Cond Res 2002. PMID 12173958. — **leída — abstract**

**[48]** Richards J et al. A biomechanical investigation of a single-limb squat: implications for lower extremity rehabilitation exercise. J Athl Train 2008. PMID 18833310. — **leída — abstract** *Nota de la revisión:* R3-28: el encuadre "declive = más fácil" era del documento, no del estudio; corregido en A2.

**[49]** Distefano LJ et al. Gluteal muscle activation during common therapeutic exercises. J Orthop Sports Phys Ther 2009. PMID 19574661. — **leída — abstract**

**[50]** Lubahn AJ et al. Hip muscle activation and knee frontal plane motion during weight bearing therapeutic exercises. Int J Sports Phys Ther 2011. PMID 21713231. — **leída — abstract** *Nota de la revisión:* R3-27: la carga sí subió el glúteo mayor integrado en la sentadilla bipodal; corregida en BI5.

**[51]** Mackey ER, Riemann BL. Biomechanical differences between the Bulgarian split-squat and back squat. Int J Exerc Sci 2021. PMID 34055144. — **leída — abstract**

**[52]** Aygun-Polat E et al. Targeted muscle activation in Bulgarian split squat variations: effects of trunk position and suspension-based execution. BMC Sports Sci Med Rehabil 2025. PMID 40867012. — **leída — abstract**

**[53]** Pereira NDS et al. Reverse Nordic curl does not generate superior eccentric activation of the quadriceps muscle than bodyweight squat-based exercises. J Sport Rehabil 2024. PMID 39214520. — **leída — abstract**

**[54]** Macrum E et al. Effect of limiting ankle-dorsiflexion range of motion on lower extremity kinematics and muscle-activation patterns during a squat. J Sport Rehabil 2012. PMID 22100617. — **leída — abstract**

**[55]** Dill KE et al. Altered knee and ankle kinematics during squatting in those with limited weight-bearing-lunge ankle-dorsiflexion range of motion. J Athl Train 2014. PMID 25144599. — **leída — abstract**

**[56]** Hemmerich A et al. Hip, knee, and ankle kinematics of high range of motion activities of daily living. J Orthop Res 2006. PMID 16514664. — **leída — abstract**

**[57]** Rojas-Jaramillo A et al. Impact of the deep squat on articular knee joint structures, friend or enemy? A scoping review. Front Sports Act Living 2024. PMID 39640505. — **leída — abstract**

**[58]** Crossley KM et al. Performance on the single-leg squat task indicates hip abductor muscle function. Am J Sports Med 2011. PMID 21335344. — **leída — abstract**

**[59]** Powers CM. The influence of altered lower-extremity kinematics on patellofemoral joint dysfunction: a theoretical perspective. J Orthop Sports Phys Ther 2003. PMID 14669959. — **leída — abstract**

**[60]** Contreras B et al. A comparison of gluteus maximus, biceps femoris, and vastus lateralis electromyographic activity in the back squat and barbell hip thrust exercises. J Appl Biomech 2015. PMID 26214739. — **leída — abstract**

**[61]** Williams MJ et al. Activation of the gluteus maximus during performance of the back squat, split squat, and barbell hip thrust and the relationship with maximal sprinting. J Strength Cond Res 2021. PMID 33332802. — **leída — abstract**

**[62]** McCurdy K et al. Hip and knee extensor activation during the hip thrust and rear-foot-elevated split squat in trained females. J Strength Cond Res 2021. PMID 33900255. — **leída — abstract**

**[63]** Plotkin DL et al. Hip thrust and back squat training elicit similar gluteus muscle hypertrophy and transfer similarly to the deadlift. Front Physiol 2023. PMID 37877099. PMC10593473. — **leída — abstract**

**[64]** van Dyk N, Behan FP, Whiteley R. Including the Nordic hamstring exercise in injury prevention programmes halves the rate of hamstring injuries: a systematic review and meta-analysis of 8459 athletes. Br J Sports Med 2019. PMID 30808663. — **leída — abstract**

**[65]** Impellizzeri FM, McCall A, van Smeden M. Why methods matter in a meta-analysis: a reappraisal showed inconclusive injury preventive effect of Nordic hamstring exercise. J Clin Epidemiol 2021. PMID 34520846. — **leída — abstract**

**[66]** Petersen J et al. Preventive effect of eccentric training on acute hamstring injuries in men's soccer: a cluster-randomized controlled trial. Am J Sports Med 2011. PMID 21825112. — **leída — abstract**

**[67]** Timmins RG et al. Short biceps femoris fascicles and eccentric knee flexor weakness increase the risk of hamstring injury in elite football (soccer): a prospective cohort study. Br J Sports Med 2016. PMID 26675089. — **leída — abstract** *Nota de la revisión:* R3 (observación): se usaba como respaldo de un signo de lesión que el estudio no aborda; retirada de B-NC-1.

**[68]** Bourne MN et al. Impact of exercise selection on hamstring muscle activation. Br J Sports Med 2017. PMID 27467123. — **leída — abstract**

**[69]** Maeo S et al. Hamstrings hypertrophy is specific to the training exercise: Nordic hamstring versus lengthened state eccentric training. Med Sci Sports Exerc 2024. PMID 38857522. PMC11419281. — **leída — abstract**

**[70]** Maeo S et al. Greater hamstrings muscle hypertrophy but similar damage protection after training at long versus short muscle lengths. Med Sci Sports Exerc 2021. PMID 33009197. — **leída — abstract**

**[71]** Coratella G et al. Muscle damage and the repeated-bout effect after a typical Nordic hamstring exercise session. Int J Sports Med 2025. PMID 40280182. — **leída — abstract**

**[72]** Behan FP et al. The dose-response of pain throughout a Nordic hamstring exercise intervention. Scand J Med Sci Sports 2023. PMID 36651719. — **leída — abstract**

**[73]** McGill SM, Marshall LW. Kettlebell swing, snatch, and bottoms-up carry: back and hip muscle activation, motion, and low back loads. J Strength Cond Res 2012;26(1):16-27. PMID 21997449. — **leída — abstract** *Nota de la revisión:* R3-6: **no dice lo afirmado** en G2 (no compara snatch con swing); corregida. Los datos del swing son textuales.

**[74]** Lake JP, Lauder MA. Mechanical demands of kettlebell swing exercise. J Strength Cond Res 2012. PMID 22207261. — **leída — abstract**

**[75]** Lake JP, Lauder MA. Kettlebell swing training improves maximal and explosive strength. J Strength Cond Res 2012. PMID 22580981. — **leída — abstract**

**[76]** Van Gelder LH et al. EMG analysis and sagittal plane kinematics of the two-handed and single-handed kettlebell swing: a descriptive study. Int J Sports Phys Ther 2015. PMID 26618061. PMC4637916. — **leída — abstract**

**[77]** Del Monte MJ et al. Hamstring myoelectrical activity during three different kettlebell swing exercises. J Strength Cond Res 2020. PMID 28930870. — **leída — abstract**

**[78]** Falatic JA et al. Effects of kettlebell training on aerobic capacity. J Strength Cond Res 2015. PMID 26102260. — **leída — abstract**

**[79]** Hewett TE et al. Biomechanical measures of neuromuscular control and valgus loading of the knee predict anterior cruciate ligament injury risk in female athletes: a prospective study. Am J Sports Med 2005. PMID 15722287. — **leída — abstract**

**[80]** Padua DA et al. The Landing Error Scoring System as a screening tool for an anterior cruciate ligament injury-prevention program in elite-youth soccer athletes. J Athl Train 2015. PMID 25811846. — **leída — abstract**

**[81]** Sugimoto D et al. Specific exercise effects of preventive neuromuscular training intervention on anterior cruciate ligament injury risk reduction in young females: meta-analysis and subgroup analysis. Br J Sports Med 2015. PMID 25452612. — **leída — abstract**

**[82]** Devita P, Skelly WA. Effect of landing stiffness on joint kinetics and energetics in the lower extremity. Med Sci Sports Exerc 1992. PMID 1548984. — **leída — abstract** *Nota de la revisión:* R3-26: el aterrizaje "rígido" tuvo 77° de flexión de rodilla (no "casi extendida"); corregida en E3.

**[83]** Tamura A, Akasaka K, Otsudo T. Contribution of lower extremity joints on energy absorption during soft landing. Int J Environ Res Public Health 2021. PMID 34066090. — **leída — abstract**

**[84]** Zhang Q et al. Optimizing stretch-shortening cycle performance: effects of drop height and landing strategy on lower-limb biomechanics in drop jumps. PeerJ 2025. PMID 40416624. — **leída — abstract**

**[85]** Markovic G. Does plyometric training improve vertical jump height? A meta-analytical review. Br J Sports Med 2007. PMID 17347316. — **leída — abstract**

**[86]** Komi PV. Stretch-shortening cycle: a powerful model to study normal and fatigued muscle. J Biomech 2000. PMID 10899328. — **leída — abstract**

**[87]** Gibala MJ et al. Physiological adaptations to low-volume, high-intensity interval training in health and disease. J Physiol 2012. PMID 22289907. — **leída — abstract** *Nota de la revisión:* No verificada por la revisión 3 (no la abrió). *No verificada por la revisión 3.*

**[88]** Garber CE et al. ACSM position stand. Quantity and quality of exercise for developing and maintaining cardiorespiratory, musculoskeletal, and neuromotor fitness in apparently healthy adults. Med Sci Sports Exerc 2011. PMID 21694556. — **leída — abstract** *Nota de la revisión:* R3-34: "un total de 60 s por ejercicio", no "≥60 s"; R3-18: no es fuente de la conducta ante dolor de pecho.

**[89]** Behm DG et al. Acute effects of muscle stretching on physical performance, range of motion, and injury incidence in healthy active individuals: a systematic review. Appl Physiol Nutr Metab 2016. PMID 26642915. — **leída — abstract** *Nota de la revisión:* R3-33: recomienda estirar dentro de una entrada en calor con actividad dinámica posterior.

**[90]** Weppler CH, Magnusson SP. Increasing muscle extensibility: a matter of increasing length or modifying sensation? Phys Ther 2010;90(3):438-49. — **leída — abstract, OUP vía WebFetch**

**[91]** Konrad A et al. Chronic effects of stretching on range of motion with consideration of potential moderating variables: a systematic review with meta-analysis. J Sport Health Sci 2024. PMID 37301370. PMC10980866. — **leída — abstract**

**[92]** Ingram LA et al. Mechanisms underlying range of motion improvements following acute and chronic static stretching: a systematic review, meta-analysis and multivariate meta-regression. Sports Med 2025. PMID 40180774. PMC12152101. — **leída — abstract**

**[93]** Weir A et al. Doha agreement meeting on terminology and definitions in groin pain in athletes. Br J Sports Med 2015. PMID 26031643. PMC4484366. — **leída — texto parcial: definiciones** *Nota de la revisión:* Se usa solo como fundamento interno de las banderas de ingle (no se le dice al alumno).

**[94]** Griffin DR et al. The Warwick Agreement on femoroacetabular impingement syndrome (FAI syndrome): an international consensus statement. Br J Sports Med 2016. PMID 27629403. — **leída — abstract** *Nota de la revisión:* Se usa solo como fundamento interno (diagnóstico = síntomas + signos + imagen).

**[95]** Harris JD et al. Microinstability of the hip and the splits radiograph. Orthopedics 2016. PMID 26730687. — **leída — abstract**

**[96]** Finucane LM et al. International framework for red flags for potential serious spinal pathologies. J Orthop Sports Phys Ther 2020. PMID 32438853. — **leída — abstract** *Nota de la revisión:* R3-5: **mal aplicada** en la versión original: es un marco para patología espinal grave; sus ejemplos de cauda equina y banderas sistémicas están en el texto completo, que la revisión no leyó.

**[97]** Callaghan JP, McGill SM. Intervertebral disc herniation: studies on a porcine model exposed to highly repetitive flexion/extension motion with compressive force. Clin Biomech 2001. PMID 11114441. — **leída — abstract**

**[98]** Tampier C, Drake JD, Callaghan JP, McGill SM. Progressive disc herniation: an investigation of the mechanism using radiologic, histochemical, and microscopic dissection techniques on a porcine model. Spine 2007. PMID 18246010. — **leída — abstract**

**[99]** Cuthbert M et al. Electromyographical differences between the hyperextension and reverse-hyperextension. J Strength Cond Res 2021. PMID 34027916. — **leída — abstract**

**[100]** Lawrence MA, Chin A, Swanson BT. Biomechanical comparison of the reverse hyperextension machine and the hyperextension exercise. J Strength Cond Res 2019. PMID 30946266. — **leída — abstract**

**[101]** Kavcic N, Grenier S, McGill SM. Determining the stabilizing role of individual torso muscles during rehabilitation exercises. Spine 2004. PMID 15167666. — **leída — abstract**

**[102]** Suprak DN et al. Scapular kinematics and shoulder elevation in a traditional push-up. J Athl Train 2013. PMID 23952043. — **leída — abstract** *Nota de la revisión:* R3-32: condición distinta (hombro a ≈90° con codos abiertos en push-up); extrapolación débil.

**[103]** Madden V et al. Spondylolysis: a narrative review of etiology, diagnosis, and management. Int J Environ Res Public Health 2026. PMID 41752236. PMC12940356. — **leída — abstract**

**[104]** Núñez de Arenas-Arroyo S et al. Immediate and short-term effects of neurodynamic techniques on hamstring flexibility: a systematic review with meta-analysis. PLoS One 2025. PMID 39913497. — **leída — abstract**

**[105]** Ando F et al. Trunk muscle thickness during supine and crawling exercises. Int J Exerc Sci 2023. PMID 38288071. — **leída — abstract**

**[106]** Villegas Meza AD et al. Hip microinstability: current concepts in diagnosis, surgical management, and outcomes. A narrative review. Open Access J Sports Med 2025. PMC12765602. — **leída — texto parcial; usada solo como contexto, no citada en el cuerpo** *Nota de la revisión:* No citada en el cuerpo; no verificada por la revisión 3.

**[107]** Eleftheraki A et al. Hip range of motion and strength in young pre-professionals ballet dancers versus non-dancers. J Dance Med Sci 2025. PMID 39277543. — **leída — abstract**

**[108]** Lee TQ. Biomechanics of hyperflexion and kneeling before and after total knee arthroplasty. Clin Orthop Surg 2014. PMID 24900891. PMC4040370. — **leída — abstract; estudio de cadáver/prótesis, relevancia baja**

**[109]** Michel & Torrado. *Muscle activity in different conditioning exercises for the front lever and full planche.* Freiburger Gerätturntage, 2010 (listado de congreso). No se cita ningún dato de este trabajo. — **no leída; solo vi el título del programa en un resultado de búsqueda**

### A.2 Libros de texto citados de memoria

**[L1]** Neumann DA. *Kinesiology of the Musculoskeletal System: Foundations for Rehabilitation* (3.ª ed.). Elsevier. **(libro de memoria, sin verificar página)** Capítulos de complejo del hombro, codo y antebrazo, muñeca y músculo-articulación axial; acciones articulares, roles musculares, ritmo lumbo-pélvico, insuficiencia activa/pasiva, anatomía de isquios, flexores de cadera, columna. (En la parte 2 era [B1]; en la parte 3, [L1].) Según la revisión, "alcanza" como referencia del brazo de momento de la rótula.

**[L2]** Kapandji AI. *The Physiology of the Joints*, vols. 1 a 3 (miembro superior, miembro inferior, tronco y raquis). **(libro de memoria, sin verificar página)** (En la parte 2 era [B2]; en la parte 3, [L2].) La revisión 3 anota que no es la referencia más sólida para el brazo de momento de la rótula.

**[L3]** Low S. *Overcoming Gravity: A Systematic Approach to Gymnastics and Bodyweight Strength* (2.ª ed.). **(libro de memoria, sin verificar página)** Progresiones, SAS/BAS y consenso de coaching. (En la parte 2 era [B3].) Se intentó un extracto legítimo y los resultados fueron sitios espejo dudosos; no se usaron.

**[L4]** McGill S. *Low Back Disorders: Evidence-Based Prevention and Rehabilitation* y *Ultimate Back Fitness and Performance*. **(libro de memoria, sin verificar página)** Anti-extensión, "core", contexto de cargas de columna. (En la parte 2 era [B4]; en la parte 3, [L4].)

**[L5]** Haff GG, Triplett NT (eds.). *Essentials of Strength Training and Conditioning* (NSCA). Human Kinetics (edición sin verificar). **(libro de memoria, sin verificar página)** Progresiones pliométricas. (En la parte 3 era [L3].)

### A.3 Señaladas por la revisión y no usadas

Lin S et al. *…the chicken-wing muscle up test.* BMC Musculoskelet Disord 2024. PMID 39080680. — señalada por la revisión 2 (leída solo por el revisor). Es un test **diagnóstico** de lesión del rodete usado en cirugía, no un ejercicio: se la registra solo para que nadie confunda la compensación "chicken wing" del muscle-up con ese test. **No se usa como bandera ni se cita en el cuerpo.**

## Apéndice B. Registro de correcciones

Cada hallazgo de las dos revisiones con su severidad, ubicación (parte original → etiqueta en este documento), estado y cómo se aplicó. **Estados:** *aplicado* = se usó el texto de reemplazo de la revisión en el cuerpo (no solo en la referencia); *aplicado parcial* = se aplicó una parte y se dice qué falta y por qué; *no aplicado* = se dice por qué. Las ubicaciones usan las etiquetas del §2: BS1–BS6 (base tren superior), S2–S8 (rutas tren superior y core), BI1–BI6 (base tren inferior), A–I (rutas tren inferior, movilidad, flow, plyo, cardio, kettlebell). `P2 §n` y `P3 l.n` son las secciones o líneas del archivo original de cada parte. La revisión 3 declara 40 hallazgos (21 menores) pero su tabla trae 41 numerados (22 menores): se registran los 41.

### B.1 Revisión de la parte 2 (R2-1 a R2-45)

| ID | Sev. | Ubicación (original → final) | Estado | Cómo |
|---|---|---|---|---|
| R2-1 | CRÍTICO | P2 §1.5 l.88 → BS5 | aplicado | Texto de reemplazo de la revisión (boca arriba extiende y frenan abdomen + flexores de cadera; boca abajo flexiona y frenan glúteo, isquiotibiales, erectores) y tabla resumen por orientación. ⚑H (H1) |
| R2-2 | CRÍTICO | P2 §3.1 FL tabla, cadera → S3.1 | aplicado | Fila de cadera reemplazada: iliopsoas, recto femoral, TFL = M isométrico; glúteo = co-contracción |
| R2-3 | CRÍTICO | P2 §3.3 MN/RP tabla, cadera/columna → S3.3 | aplicado | Fila reemplazada (L/V-sit con flexores; reverse planche libre con abdomen + flexores; glúteo y erectores co-contraen). ⚑H (H3): confirmar que el reverse planche sea el apoyo libre |
| R2-4 | CRÍTICO | P2 §6.1 tabla, cadera (DF) → S6.1 | aplicado | Fila reemplazada: iliopsoas y recto femoral M también en dragon flag; glúteo co-contracción |
| R2-5 | CRÍTICO | P2 §4.4 l.444 y §3.3 l.302 → S4.4 y S3.3 | aplicado | Variable = distancia hombro–centro de masa; el centro de masa queda sobre las manos; más lean (planche) o hombros hacia atrás (reverse planche) |
| R2-6 | CRÍTICO | P2 §2.2 MU tabla, GH → S2.2 | aplicado | Fila reemplazada: transición = extensión máxima + rotación interna; empuje = flexión desde hiperextensión |
| R2-7 | CRÍTICO | P2 §5.1 l.508 → S5.1 | aplicado | "Flexión de hombro necesaria (~180° sin arquear la zona lumbar)" |
| R2-8 | CRÍTICO | P2 §4.2 dips tabla, codo → S4.2 | aplicado | Corregido: el pico de tríceps fue **menor** en banco (0,83 mV) que en barra (1,04) y anillas (1,05); el abstract no dice qué cabeza |
| R2-9 | CRÍTICO | P2 §8 tabla resumen → S8 | aplicado | Filas glúteo/isquiotibiales e iliopsoas/recto femoral/aductores reescritas; por coherencia también erectores (M en BL, PL, PLPU) |
| R2-10 | MAYOR | P2 §2.1 tabla ST, pasivo → S2.1 | aplicado | "La mayor parte de la carga la toman cápsula y ligamentos, con actividad muscular baja"; hombros laxos: preferir colgado activo. ⚑H (H18) |
| R2-11 | MAYOR | P2 §1.4 l.76 → BS4 | aplicado | La cabeza larga del bíceps se estira más con el hombro en extensión y codo recto; en planche es flexor activo; en FL la carga va al pliegue del codo |
| R2-12 | MAYOR | P2 §3.3 tabla ST → S3.3 | aplicado | Con el hombro en hiperextensión la escápula tiende a inclinarse hacia adelante y rotar hacia abajo. ⚑H (H17) |
| R2-13 | MAYOR | P2 §4.1 BL tabla ST vs cue → S4.1 | aplicado | Una sola versión (escápula deprimida y algo retraída); cue conservado. ⚑H (H4) |
| R2-14 | MAYOR | P2 §4.4 PL tabla, columna/cadera → S4.4 | aplicado | Glúteo, isquiotibiales y erectores = M; abdomen = Est; se sacó `[24]`. Aplicado también a la fila de PLPU por coherencia |
| R2-15 | MAYOR | P2 §2.2 l.129 y §7 l.650 → S2.2 y S7 | aplicado | Se incorpora Walker 2023 (`[37]`, n = 10; anillas > barra; "señalada por la revisión, leída solo por el revisor"); MU sale de la lista de rutas sin estudios; se corrigió la afirmación de ausencia de EMG de muscle-up |
| R2-16 | MAYOR | P2 §2.2 cue l.158 → S2.2 | aplicado | "Pasá rápido y controlado por el punto bajo: bajá solo hasta donde puedas empujar sin que el hombro se vaya hacia adelante" |
| R2-17 | MAYOR | P2 §1.1 l.59 (cita `[12]`) → BS1 | aplicado | Elevación y retracción **de la clavícula**; sin diferencia global en inclinación posterior |
| R2-18 | MAYOR | P2 §6.1 l.581 (cita `[28]`) → S6.1 | aplicado | Los autores concluyen que los ejercicios sí activan distinto las porciones del abdomen (n = 25) |
| R2-19 | MAYOR | P2 §2.4 l.210 (cita `[29]`) → S2.4 | aplicado | Adultos sanos; los autores solo especulan sobre pacientes lumbares |
| R2-20 | MAYOR | P2 §5.3 l.547 (cita `[35]`) → S5.3 | aplicado | 63 % = diferencia entre quienes lo logran y quienes no; "control más que fuerza" = premisa del estudio; n = 41 desglosado |
| R2-21 | MAYOR | P2 §3.1 banderas "48 h" → S3.1 | aplicado | Se sacó 48 h; regla general ~2 semanas (§3.1 b5). Umbral ⚑H (H5) |
| R2-22 | MAYOR | P2 banderas con rótulos (l.125, 214, 308, 519, 573, 599; también l.184, 456) → S2.1, S2.3, S2.4, S3.3, S4.4, S5.1, S5.3, S6.1 | aplicado | Reescritas como señal observable; los rótulos (pinzamiento, FAI, compresión neurovascular, gymnast wrist, cardiovascular/ocular) salieron o pasaron a nota interna; donde se cita a los autores va "término del estudio; no se le dice al alumno" |
| R2-23 | MAYOR | P2 todas las rutas, banderas (omisión) → §3.1 | aplicado | Bloque común de banderas transversales (a, b1, b2) referenciado desde cada ruta; se extendió la bandera de codo/palma a FL, FLR, BL, MU, OAR |
| R2-24 | MAYOR | P2 §4.2 dips banderas → S4.2 y §3.1 a4 | aplicado | Bandera de lesión aguda de pectoral (mismo día); caso `[38]` Choo & Ng 2021 |
| R2-25 | MAYOR | P2 §5.2 HSPU cues/banderas → S5.2 y §3.1 b19 | aplicado | Cue de cabeza neutra y bandera de cuello; evidencia de preprint no revisado por pares (`[39]`) |
| R2-26 | MAYOR | P2 §5.1 banderas l.519 → S5.1 y §3.1 a7, c2 | aplicado | Tamizaje previo a las inversiones y señales durante; consulta **médica**. ⚑H (H9) |
| R2-27 | MAYOR | P2 §6.2 CORE POSTERIOR → S6.2 | aplicado | Fila de arch hold boca abajo (erectores, multífidos, glúteo, isquiotibiales = M); definición del "bote espinal" ⚑N |
| R2-28 | MAYOR | P2 §6.2 tabla (flexión-relajación) → S6.2 | aplicado | Párrafo agregado con flexión-relajación y la recomendación de `[32]`; no meter un Jefferson largo antes de un esfuerzo pesado |
| R2-29 | MENOR | P2 §1.1 l.56 → BS1 | aplicado | "Fibras inferiores del serrato anterior y subclavio" |
| R2-30 | MENOR | P2 §2.1 l.116, §3.1 l.237, §4.1 l.353 → S2.1, S3.1, S4.1 | aplicado | "Tríceps = co-contracción (bloquea el codo; su cabeza larga además ayuda a extender el hombro)" en las tres filas |
| R2-31 | MENOR | P2 §3.1 l.255 y §6.1 l.597 → S3.1, S6.1 | aplicado | Cue de hollow: "costillas abajo, pelvis hacia atrás, abdomen duro como si te fueran a pegar" |
| R2-32 | MENOR | P2 §2.4 l.193 y l.202 → S2.4 | aplicado | "El dorsal empuja la barra hacia las caderas (extiende el hombro) para inclinar el tronco hacia atrás" |
| R2-33 | MENOR | P2 §3.3 l.284 → S3.3 | aplicado | L-sit con manos al costado, V-sit/manna detrás; explicación de por qué MN/RP es PULL y BL es PUSH (a confirmar con Nacho ⚑N; ver C2 y C3 en §1.8) |
| R2-34 | MENOR | P2 §4.4 tabla GH → S4.4 | aplicado | "Flexión de hombro sostenida (sagital), con el húmero inclinado hacia adelante" |
| R2-35 | MENOR | P2 §5.3 tabla ST → S5.3 | aplicado | Trapecio superior e inferior = S; trapecio medio = Est |
| R2-36 | MENOR | P2 §5.1 l.500 y l.508 → S5.1 | aplicado | Quedó claro que los jóvenes tenían peor control; "más eficientes" pasó a interpretación |
| R2-37 | MENOR | P2 §4.3 l.405, §3.4 l.318, §3.1 l.238, §1.5 l.89 (citas `[9]`, `[16]`, `[24]`, `[34]`) → S4.3, S3.4, S3.1, BS5 | aplicado | Se sacó la cita de las filas que no respalda (o se marcó "anatomía"); `[34]` aclarada ("en movimientos de aceleración, no en sostenes") |
| R2-38 | MENOR | P2 §2.2 tabla, columna/cadera (kip) → S2.2 | aplicado | Se agregó quién hace la flexión: iliopsoas/recto femoral + abdomen |
| R2-39 | MENOR | P2 §8 l.668 y l.680 → S8 | aplicado | Dorsal ancho = M en MN/RP; trapecio superior: "que no domine (evitar encoger los hombros)" |
| R2-40 | MENOR | P2 §3.1 l.249 → S3.1 | aplicado | "En el bíceps (pliegue del codo), que trabaja fuerte para proteger el codo" (no "compresión") |
| R2-41 | MENOR | P2 §1.4 l.81 (cita `[18]`) → BS4 | aplicado | 27 de 30 hombros (26 gimnastas); se agregó el dato de subluxación inferior voluntaria |
| R2-42 | MENOR | P2 §4.2 l.379 y l.387 → S4.2 | aplicado | Descenso = extensión de hombro; "Russian" = definición a confirmar ⚑N |
| R2-43 | MENOR | P2 §1.2 l.64 (cita `[3]`) → BS2 | aplicado | "No reporta diferencias en dorsal ancho (117–130 % MVIC en los tres ejercicios)" |
| R2-44 | MENOR | P2 terminología general → todo el §2.1 | **aplicado parcial** | Aplicado: TFL, RA, OE/OI (EO unificado a OE), iliopsoas e "isquios" definidos en la leyenda; "PSE" → "ejercicios preparatorios"; η² dicho como "diferencia grande" (con el valor entre paréntesis); "predominio de flexores de cadera"; "inclinación de hombros hacia adelante (lean)"; "la otra mano hace de apoyo lateral"; "estrategia de muñeca"; "trapecio medio (transverso)"; SLAP y tenodesis en lenguaje llano. No aplicado: sacar η² por completo (el valor es el dato del abstract) y reemplazar "isquios" en todas las celdas (queda como abreviatura definida para no ensanchar las tablas) |
| R2-45 | MENOR | P2 §8 l.680 y l.501–502 (cita `[6]`) → S5.1, S5.2, S8 | aplicado | "(contribución relativa, no %MVIC)" cada vez que se cita `[6]` con esos números |

**Observaciones sueltas de la revisión 2** (fuera de la numeración): ritmo escapulohumeral 2:1 es una simplificación (aplicado en BS1); "falso agarre: desviación cubital" no confirmada (⚑H, H10; marcado en S2.2); "proyección sagital" del straddle → "proyección sobre el eje del cuerpo" (aplicado en S3.1); "codos hiperextendidos" discutible (aplicado en S5.1, ⚑H H11); recomendación de `[1]` sobre dominadas frontales asistidas (agregada en S2.3); el "chicken-wing muscle up test" (Lin 2024) es un test diagnóstico quirúrgico, no un ejercicio ni una bandera: no se usó (Apéndice A).

### B.2 Revisión de la parte 3 (R3-1 a R3-41)

| ID | Sev. | Ubicación (original → final) | Estado | Cómo |
|---|---|---|---|---|
| R3-1 | CRÍTICO | P3 A4 SS tabla, cadera (l.210) → A4 | aplicado | Flexores de cadera (recto femoral, iliopsoas) M-ISO; glúteo = co-contracción. Consecuencias en la tabla H (glúteo mayor, psoas). ⚑H (H2) |
| R3-2 | CRÍTICO | P3 A3 QC tabla, cadera (l.187) → A3 | aplicado | Flexores de cadera M-ISO; abdominales Est (antiextensión lumbar). ⚑H (H2) |
| R3-3 | CRÍTICO | P3 C3 SIDE PCK fases y tabla (l.447, 451) y parte H (l.659–660) → C3 e I/H | aplicado | Excéntrico/concéntrico del lado **contrario**; el lado de la inclinación solo en la versión activa. ⚑H (H2) |
| R3-4 | CRÍTICO | P3 G1 swing F4 (l.610) → G1 | aplicado | Frenan en excéntrico los extensores de cadera (glúteo, isquios, aductor mayor); los flexores no frenan nada. ⚑H (H2) |
| R3-5 | CRÍTICO | P3 banderas lumbares en todas las rutas → §3.1 y cada ruta | aplicado | Bloque único de columna (a1 silla de montar/bilateral; b3; b6 sistémicas) y cada ruta pasó a "ver sección 3, columna"; `[96]` se usa solo como marco de banderas de patología grave |
| R3-6 | CRÍTICO (cita) | P3 G2 (l.637) → G2 | aplicado | Se retiró la comparación snatch vs swing que `[73]` no informa |
| R3-7 | CRÍTICO | P3 B-NC-1 banderas (l.333) → B-NC-1 y §3.1 a3 | aplicado | Orina oscura + dolor desproporcionado → **guardia, no kinesiólogo**; primera sesión con volumen bajo |
| R3-8 | MAYOR | P3 B1 isquiotibiales (l.56) → BI1 | aplicado | Porción corta del bíceps femoral es monoarticular |
| R3-9 | MAYOR | P3 B2 profundidad (l.63, cita `[46]`) → BI2 | aplicado | Los extensores de cadera aumentan con profundidad y carga; plantiflexores solo con carga; traducción práctica corregida |
| R3-10 | MAYOR | P3 B-NC-4 calf raises (l.355) → B-NC-4 | aplicado | Sóleo M siempre; con rodilla flexionada predomina el sóleo |
| R3-11 | MAYOR | P3 C1 pigeon/90-90 (l.395) → C1 | aplicado | Se alargan glúteo mayor y piriforme; los rotadores externos profundos no; torsión de rodilla si falta rotación |
| R3-12 | MAYOR | P3 A2 PS cadera libre (l.156) → A2 | aplicado | Flexores muy acortados + isquios de la pierna libre alargados al máximo (primer limitante); progresión con pierna libre apoyada |
| R3-13 | MAYOR | P3 A4 SS evidencia (l.214) → A4 | aplicado | Carga sobre rótula y tendón; LCA solo 0–60° y chica; LCP en el fondo; prudencia con dolor rotuliano |
| R3-14 | MAYOR | P3 B-NC-4 y E3 sin bandera de Aquiles → B-NC-4, E3, §3.1 a5, b16 | aplicado | Derivar si dura >2–3 semanas; urgencia si hay "patada/pedrada". Umbrales ⚑H |
| R3-15 | MAYOR | P3 SS, QC, PLYO, SU, PS: adolescentes → §3.1 a6, b18 y BI2 | aplicado | Apofisitis (bultos de rótula/talón) y renguera nueva con dolor de ingle/muslo/rodilla = médico en el día |
| R3-16 | MAYOR | P3 rodilla en todas las rutas KNEE → §3.1 b13 y rutas | aplicado | Bloque común (derrame, traba, "se sale", dolor >2–3 semanas); un chasquido sin dolor ni hinchazón no es bandera |
| R3-17 | MAYOR | P3 B-NC-3 Jefferson (l.351) → B-NC-3 y §3.1 c1 | aplicado | Contraindicación por osteoporosis/osteopenia, fractura vertebral, hernia reciente o síntomas radiculares; aplica a PIKE con peso |
| R3-18 | MAYOR | P3 F CARDIO banderas (l.600) → F y §3.1 a2 | aplicado | **Emergencia**; se sacó `[88]` como fuente de esa conducta |
| R3-19 | MAYOR | P3 banderas con rótulos (A1, A2, A4, B-DS, C1, C2, C4, C5) → rutas y §3.1 | aplicado | Redactadas como señal observable; FAI, "pars", patelofemoral, microinestabilidad, Doha y "slump" salieron del texto visible (quedan solo como nota interna en C1) |
| R3-20 | MENOR | P3 B3 (l.69) → BI3 | aplicado | Gastrocnemio: con rodilla flexionada queda acortado y limita menos la dorsiflexión |
| R3-21 | MENOR | P3 B3 (l.69) → BI3 | aplicado | Se aclaró que en el sissy el talón está arriba y el límite es otro |
| R3-22 | MENOR | P3 A2 tabla (l.152) → A2 | aplicado | Isquios: largo total cambia poco |
| R3-23 | MENOR | P3 B-HT tabla, rodilla (l.283) → B-HT | aplicado | Cuádriceps activo (vasto lateral 99,5 % vs 110 % MVIC) |
| R3-24 | MENOR | P3 B-HT (l.301) y B-NC-1 (l.333) → B-HT, B-NC-1 | aplicado | Calambre de isquios y apoyo rotuliano pasaron a compensaciones/ajustes, no bandera |
| R3-25 | MENOR | P3 C5 RH fases (l.491) → C5 | aplicado | La lumbar se flexiona algo al fondo (≈20° en máquina) |
| R3-26 | MENOR | P3 E3 (l.581, cita `[82]`) → E3 | aplicado | Aterrizaje rígido: poca flexión (77° vs 117°), no "rodilla casi extendida" |
| R3-27 | MENOR | P3 B5 (l.96, cita `[50]`) → BI5 | aplicado | La banda aumentó el valgo en los tres ejercicios; el glúteo mayor integrado subió solo en la bipodal |
| R3-28 | MENOR | P3 A2 (l.163, cita `[48]`) → A2 | aplicado | Reencuadre: matiza "más declive = mejor" (~16°) |
| R3-29 | MENOR | P3 B-NC-1 (l.321) → B-NC-1 | aplicado | "Resonancia magnética funcional" |
| R3-30 | MENOR | P3 B-NC-1 (l.322, cita `[69]`) → B-NC-1 | aplicado | 1,9 y 2,2 veces relativos al otro grupo; n = 42 con 14 por grupo |
| R3-31 | MENOR | P3 B-NC-2 (l.347, cita `[44]`) → B-NC-2 | aplicado | Convencional: 25–40 % más trabajo mecánico total; sumo: momento dorsiflexor |
| R3-32 | MENOR | P3 C2 (l.429) y D1 (l.530) (cita `[102]`) → C2, D1 | aplicado | Aclarado: condición distinta (hombro a ≈90° con codos abiertos); extrapolación débil |
| R3-33 | MENOR | P3 C0 (l.376, cita `[89]`) → C0 | aplicado | Se agregó la recomendación de estirar dentro de una entrada en calor con actividad dinámica posterior |
| R3-34 | MENOR | P3 B6 (l.104) y C0 (l.373) (cita `[88]`) → BI6, C0 | aplicado | "Un total de 60 s por ejercicio (puede repartirse en series), ≥2 días/semana" |
| R3-35 | MENOR | P3 B2 (l.62, cita `[45]`) → BI2 | aplicado | Se agregó la conclusión de los autores sobre restringir la rodilla |
| R3-36 | MENOR | P3 A2 (l.168) → A2 | aplicado | Matiz del "butt wink" sin carga |
| R3-37 | MENOR | P3 B-DS (l.271) → B-DS | aplicado | Cadera de apoyo en flexión + aducción + rotación interna: progresar el rango lento |
| R3-38 | MENOR | P3 A2 (l.166) → A2 | aplicado | Shrimp: depende de la inclinación del tronco y del avance de la rodilla; no hay datos |
| R3-39 | MENOR | P3 B1 (l.53, cita Hemmerich 2006, `[56]`) → BI1 | aplicado | "Edad media 48 años" |
| R3-40 | MENOR | P3 notación de roles (todas las tablas) → §2.2 | **aplicado parcial** | Aplicado: E → Est (unificado con la parte 2); "A" separado en Ant/Al donde el contexto es inequívoco; la leyenda define rol, contracción y los códigos compuestos. No aplicado: separar rol y contracción en columnas distintas en todas las tablas (obligaría a rehacer unas 25 tablas sin aportar un dato nuevo) |
| R3-41 | MENOR | P3 lenguaje (l.120–123, 170, 277, etc.) → §2.2 | aplicado | "La tibia", "cadera extendida", "trípode", "bloqueo", "plantiflexión" y "iliopsoas" unificados; MVIC, RSI, DOMS y TFL definidos en la leyenda |

**Observaciones sueltas de la revisión 3** (fuera de la numeración): número "≈20–30°" de rodilla en el swing sin fuente → marcado `[C]` (G1); la cita `[67]` (Timmins) se usaba como respaldo de un signo de lesión que el estudio no aborda: el texto de reemplazo de las banderas de isquios ya no la usa; "OL duplica la carga relativa" se deja como `[C]` (aceptable según la revisión); Kapandji no es la referencia más sólida para el brazo de momento de la rótula y Neumann alcanza (se conserva `[L2]` como libro de memoria sin verificar; ver Apéndice A); `[87]` (Gibala) y `[106]` (Villegas Meza) no fueron verificadas por la revisión.

### B.3 Conteo

| Severidad | R2 | R3 | Total | aplicado | aplicado parcial | no aplicado |
|---|---|---|---|---|---|---|
| CRÍTICO | 9 | 7 | 16 | 16 | 0 | 0 |
| MAYOR | 19 | 12 | 31 | 31 | 0 | 0 |
| MENOR | 17 | 22 | 39 | 37 | 2 | 0 |
| **Total** | 45 | 41 | 86 | 84 | 2 | 0 |

Todos los CRÍTICO y MAYOR quedaron **aplicados**. Los dos menores aplicados en parte son R2-44 y R3-40 (se explica qué falta y por qué en cada fila); no hay hallazgos sin aplicar.
