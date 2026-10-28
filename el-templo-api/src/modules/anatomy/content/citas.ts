/**
 * Fase 200 D11: citas del Apéndice A de la investigación (109 numeradas + 5
 * libros L1-L5), para el tooltip de las marcas de evidencia. `texto` es la
 * referencia corta (sin PMID ni doi) y `lectura` cómo se leyó la fuente.
 * Las marcas con letra (C, M, R, H, N) no son citas: van en LEYENDA_MARCAS.
 */
import type { CitaDef, MarcaLetra } from "../types";

export const CITAS = [
  {
    id: 1,
    texto:
      "Prinold JAI, Bull AMJ. Scapula kinematics of pull-up techniques: Avoiding impingement risk with training changes. J Sci Med Sport 2016.",
    lectura: "leída: texto completo vía WebFetch, resumen procesado",
  },
  {
    id: 2,
    texto:
      "Dickie JA, Faulkner JA, Barnes MJ, Lark SD. Electromyographic analysis of muscle activation during pull-up variations. J Electromyogr Kinesiol 2017;32:30–36.",
    lectura: "leída: abstract",
  },
  {
    id: 3,
    texto:
      "Youdas JW, et al. Surface electromyographic activation patterns and elbow joint motion during a pull-up, chin-up, or Perfect-Pullup™ rotational exercise. J Strength Cond Res 2010;24(12):3404–3414.",
    lectura:
      "leída: abstract (Nota de la revisión: R2-43: no reporta diferencias en dorsal ancho; no lo afirma explícitamente)",
  },
  {
    id: 4,
    texto:
      "Rosaci G, Nigro F, Cortesi M, Ciacci S, Bartolomei S, Fantozzi S. Electromyographic Analysis of the Support Scale (planche) in Gymnastics and Its Related Preconditioning Strengthening Exercises. J Strength Cond Res 2025;39(6):680–686.",
    lectura: "leída: abstract",
  },
  {
    id: 5,
    texto:
      "Kochanowicz A, et al. Changes in the Muscle Activity of Gymnasts During a Handstand on Various Apparatus. J Strength Cond Res 2019;33(6):1609–1618.",
    lectura: "leída: abstract",
  },
  {
    id: 6,
    texto:
      "Kochanowicz A, et al. Relationship between postural control and muscle activity during a handstand in young and adult gymnasts. Hum Mov Sci 2018.",
    lectura:
      "leída: abstract (Nota de la revisión: R2-45: los porcentajes de este estudio son contribución relativa entre músculos, no %MVIC)",
  },
  {
    id: 7,
    texto:
      "MacDonald M, Baker JS, Gu Y, Ugbolue UC. Biomechanical analyses of the handstand: a systematic review. 2025.",
    lectura: "leída: abstract",
  },
  {
    id: 8,
    texto:
      "McKenzie A, Crowley-McHattan Z, Meir R, Whitting J, Volschenk W. Bench, Bar, and Ring Dips: Do Kinematics and Muscle Activity Differ? 2022.",
    lectura:
      "leída: abstract (Nota de la revisión: R2-8: mal reportada en la versión original (el pico de tríceps fue menor en banco); corregida en S4.2)",
  },
  {
    id: 9,
    texto:
      "Decker MJ, Hintermeister RA, Faber KJ, Hawkins RJ. Serratus anterior muscle activity during selected rehabilitation exercises. Am J Sports Med 1999.",
    lectura:
      "leída: abstract (Nota de la revisión: R2-37: mide serrato anterior; no respalda filas de bíceps ni manguito (retirada de S4.3))",
  },
  {
    id: 10,
    texto:
      "Ludewig PM, Cook TM, Nawoczenski DA. Three-dimensional scapular orientation and muscle activity at selected positions of humeral elevation. J Orthop Sports Phys Ther 1996;24(2):57–65.",
    lectura: "leída: abstract",
  },
  {
    id: 11,
    texto:
      "Ludewig PM, Reynolds JF. The association of scapular kinematics and glenohumeral joint pathologies. J Orthop Sports Phys Ther 2009.",
    lectura: "leída: abstract",
  },
  {
    id: 12,
    texto:
      "Timmons MK, et al. Scapular kinematics and subacromial-impingement syndrome: a meta-analysis. J Sport Rehabil 2012;21(4).",
    lectura:
      "leída: abstract (Nota de la revisión: R2-17: la elevación y la retracción que reporta son claviculares; corregida en BS1)",
  },
  {
    id: 13,
    texto:
      "Hwang UJ, et al. Effect of Humeral-Elevation Angle on Electromyographic Activity in the Serratus Anterior During the Push-Up-Plus Exercise. J Sport Rehabil 2017.",
    lectura: "leída: abstract",
  },
  {
    id: 14,
    texto:
      "Kang FJ, Ou HL, Lin KY, Lin JJ. Serratus Anterior and Upper Trapezius Electromyographic Analysis of the Push-Up Plus Exercise: A Systematic Review and Meta-Analysis. J Athl Train 2019.",
    lectura: "leída: abstract",
  },
  {
    id: 15,
    texto:
      "Maenhout A, et al. Electromyographic analysis of knee push up plus variations. Br J Sports Med 2010.",
    lectura: "leída: abstract",
  },
  {
    id: 16,
    texto:
      "Cools AM, et al. Rehabilitation of scapular muscle balance: which exercises to prescribe? Am J Sports Med 2007.",
    lectura:
      "leída: abstract (Nota de la revisión: R2-37: trata de ejercicios de trapecio, no de rows; retirada de S3.4)",
  },
  {
    id: 17,
    texto:
      "Calatayud J, et al. Bench press and push-up at comparable levels of muscle activity results in similar strength gains. J Strength Cond Res 2015.",
    lectura: "leída: abstract",
  },
  {
    id: 18,
    texto:
      "Gendre P, Boileau P. The Injured Shoulder in High-Level Male Gymnasts, Part 1: Epidemiology and Pathoanatomy of Surgically Treated Lesions. Orthop J Sports Med 2021.",
    lectura:
      "leída: abstract (Nota de la revisión: R2-41: 27 de 30 hombros (26 gimnastas); subluxación inferior voluntaria como parte del entrenamiento)",
  },
  {
    id: 19,
    texto:
      "Gendre P, Boileau P. …Part 2: Can Athletes Return to Competition After Surgery? Orthop J Sports Med 2021.",
    lectura: "leída: abstract",
  },
  {
    id: 20,
    texto:
      "Ngo JK, Solis-Urra P, Sanchez-Martinez J. Injury Profile Among Street Workout Practitioners. Orthop J Sports Med 2021.",
    lectura: "leída: abstract",
  },
  {
    id: 21,
    texto:
      "Marina M, Torrado P, Ferrer-Uris B, Busquets A. Benefits of Training the Iron Cross With Herdos Devices and External Load Added to Body Weight for Young Nonachiever Gymnasts. 2023.",
    lectura: "leída: abstract",
  },
  {
    id: 22,
    texto:
      "Bohm S, Mersmann F, Arampatzis A. Human tendon adaptation in response to mechanical loading: a systematic review and meta-analysis of exercise intervention studies on healthy adults. Sports Med Open 2015.",
    lectura: "leída: abstract",
  },
  {
    id: 23,
    texto:
      "McGill S, Andersen J, Cannon J. Muscle activity and spine load during anterior chain whole body linkage exercises: the body saw, hanging leg raise and walkout from a push-up. J Sports Sci 2015.",
    lectura: "leída: abstract",
  },
  {
    id: 24,
    texto:
      "Escamilla RF, et al. Core muscle activation during Swiss ball and traditional abdominal exercises. J Orthop Sports Phys Ther 2010;40(5):265–276.",
    lectura:
      "leída: abstract (Nota de la revisión: R2-37: pelota suiza, no FL ni PL; retirada de esas filas. Sigue respaldando el EMG de roll-out y pike (BS5, S6.1))",
  },
  {
    id: 25,
    texto:
      "Ekstrom RA, Donatelli RA, Carp KC. Electromyographic analysis of core trunk, hip, and thigh muscles during 9 rehabilitation exercises. J Orthop Sports Phys Ther 2007.",
    lectura:
      "leída: abstract (Nota de la revisión: Citada en las partes 2 y 3 (unificada))",
  },
  {
    id: 26,
    texto:
      "McGill S, Juker D, Kropf P. Quantitative intramuscular myoelectric activity of quadratus lumborum during a wide variety of tasks. Clin Biomech 1996.",
    lectura: "leída: abstract",
  },
  {
    id: 27,
    texto:
      "Kibler WB, Press J, Sciascia A. The role of core stability in athletic function. Sports Med 2006.",
    lectura: "leída: abstract",
  },
  {
    id: 28,
    texto:
      "Willett GM, et al. Relative activity of abdominal muscles during commonly prescribed strengthening exercises. J Strength Cond Res 2001.",
    lectura:
      "leída: abstract (Nota de la revisión: R2-18: sobreinterpretada (el abstract apoya la activación diferencial); corregida en S6.1)",
  },
  {
    id: 29,
    texto:
      "Youdas JW, et al. An electromyographic analysis of the Ab-Slide exercise, abdominal crunch, supine double leg thrust, and side bridge in healthy young adults. J Strength Cond Res 2008.",
    lectura:
      "leída: abstract (Nota de la revisión: R2-19: se midió en adultos sanos; la inferencia sobre pacientes es especulación de los autores; corregida en S2.4)",
  },
  {
    id: 30,
    texto:
      "Di Fonza D, et al. Electromyographic Analysis of Latissimus Dorsi Activation During Common Resistance Training Exercises: A Narrative Review. 2026.",
    lectura: "leída: abstract",
  },
  {
    id: 31,
    texto:
      "Hart E, Bauer AS, Bae DS. Common upper extremity gymnastics injuries and gymnastic specific return to play protocols. 2024.",
    lectura:
      "leída: abstract (Nota de la revisión: Citada en las partes 2 y 3 (unificada): abstract en la parte 2; en la parte 3 se leyó además el texto de la sección de muñeca. Base de las banderas de menores)",
  },
  {
    id: 32,
    texto:
      "McGill SM, Brown S. Creep response of the lumbar spine to prolonged full flexion. Clin Biomech 1992.",
    lectura: "leída: abstract",
  },
  {
    id: 33,
    texto:
      "Sciascia A, Kibler WB. Current Views of Scapular Dyskinesis and its Possible Clinical Relevance. 2022.",
    lectura: "leída: abstract",
  },
  {
    id: 34,
    texto:
      "von Laßberg C, Rapp W. The punctum fixum-punctum mobile model: a neuromuscular principle for efficient movement generation? PLoS One 2015.",
    lectura:
      "leída: abstract (Nota de la revisión: R2-37: estudia fases de aceleración, no sostenes)",
  },
  {
    id: 35,
    texto:
      "Niespodziński B, Mieszkowski J, Marina M, Kochanowicz A. Upper Limb Neuromuscular Characteristics during a Press Handstand on Parallel Bars in Young (10–12 Years Old) and Adult Male Artistic Gymnasts. J Hum Kinet, online 2026-03-16.",
    lectura:
      "leída: abstract, página de la revista (Nota de la revisión: R2-20: la revisión leyó la página de la revista; corregida en S5.3)",
  },
  {
    id: 36,
    texto:
      "Tahani HS, Minoonejad H, Zandi S, Ebrahimi E. Comparison of endurance and electromyographic activity of core muscles in overhead athletes with and without scapular dyskinesis. 2026.",
    lectura: "leída: abstract",
  },
  {
    id: 37,
    texto:
      "Walker CW, Bruenger AJ, Tucker WS, Lee HR. Comparison of Muscle Activity During a Ring Muscle Up and a Bar Muscle Up. Int J Exerc Sci 2023.",
    lectura:
      "señalada por la revisión (R2-15), leída solo por el revisor (abstract, Europe PMC). n = 10 hombres activos; anillas > barra en trapecio superior, bíceps y flexores de antebrazo en el tirón, y en tríceps y bíceps en el empuje; los estabilizadores escapulares no cambiaron. Reemplaza la afirmación original de que no había EMG de muscle-up.",
  },
  {
    id: 38,
    texto:
      "Choo CH, Ng WN. Complete Pectoralis Major Tendon Rupture in a Calisthenics Athlete: A Case Report. Malays Orthop J 2021.",
    lectura:
      "señalada por la revisión (R2-24), leída solo por el revisor (abstract mínimo; solo confirma que el caso existe).",
  },
  {
    id: 39,
    texto:
      "Bove G. Characterization of Axial Forces to the Head during Kipping Handstand Push-ups. Preprints.org 2024.",
    lectura:
      "señalada por la revisión (R2-25); preprint NO revisado por pares; leída solo por el revisor (abstract).",
  },
  {
    id: 40,
    texto:
      "Escamilla RF. My top five concepts for selecting lower extremity exercises for cruciate ligament and patellofemoral rehabilitation. Int J Sports Phys Ther 2023;18(1):414-425.",
    lectura:
      "leída — texto completo (Nota de la revisión: R3-13: sus datos de talones despegados vienen de sentadillas; no aplican al fondo del sissy. Texto completo leído por la parte 3 y por R3)",
  },
  {
    id: 41,
    texto:
      "Escamilla RF. Knee biomechanics of the dynamic squat exercise. Med Sci Sports Exerc 2001.",
    lectura: "leída — abstract",
  },
  {
    id: 42,
    texto:
      "Escamilla RF et al. Effects of technique variations on knee biomechanics during the squat and leg press. Med Sci Sports Exerc 2001.",
    lectura: "leída — abstract",
  },
  {
    id: 43,
    texto:
      "Escamilla RF et al. A three-dimensional biomechanical analysis of the squat during varying stance widths. Med Sci Sports Exerc 2001.",
    lectura: "leída — abstract",
  },
  {
    id: 44,
    texto:
      "Escamilla RF et al. A three-dimensional biomechanical analysis of sumo and conventional style deadlifts. Med Sci Sports Exerc 2000.",
    lectura:
      "leída — abstract (Nota de la revisión: R3-31: la redacción original mezclaba trabajo total con momento plantiflexor; corregida en B-NC-2)",
  },
  {
    id: 45,
    texto:
      "Fry AC, Smith JC, Schilling BK. Effect of knee position on hip and knee torques during the barbell squat. J Strength Cond Res 2003.",
    lectura: "leída — abstract",
  },
  {
    id: 46,
    texto:
      "Bryanton MA et al. Effect of squat depth and barbell load on relative muscular effort in squatting. J Strength Cond Res 2012.",
    lectura:
      "leída — abstract (Nota de la revisión: R3-9: reportada a medias (omitía que los extensores de cadera aumentan también con la profundidad); corregida en BI2)",
  },
  {
    id: 47,
    texto:
      "Caterisano A et al. The effect of back squat depth on the EMG activity of 4 superficial hip and thigh muscles. J Strength Cond Res 2002.",
    lectura: "leída — abstract",
  },
  {
    id: 48,
    texto:
      "Richards J et al. A biomechanical investigation of a single-limb squat: implications for lower extremity rehabilitation exercise. J Athl Train 2008.",
    lectura:
      'leída — abstract (Nota de la revisión: R3-28: el encuadre "declive = más fácil" era del documento, no del estudio; corregido en A2.)',
  },
  {
    id: 49,
    texto:
      "Distefano LJ et al. Gluteal muscle activation during common therapeutic exercises. J Orthop Sports Phys Ther 2009.",
    lectura: "leída — abstract",
  },
  {
    id: 50,
    texto:
      "Lubahn AJ et al. Hip muscle activation and knee frontal plane motion during weight bearing therapeutic exercises. Int J Sports Phys Ther 2011.",
    lectura:
      "leída — abstract (Nota de la revisión: R3-27: la carga sí subió el glúteo mayor integrado en la sentadilla bipodal; corregida en BI5)",
  },
  {
    id: 51,
    texto:
      "Mackey ER, Riemann BL. Biomechanical differences between the Bulgarian split-squat and back squat. Int J Exerc Sci 2021.",
    lectura: "leída — abstract",
  },
  {
    id: 52,
    texto:
      "Aygun-Polat E et al. Targeted muscle activation in Bulgarian split squat variations: effects of trunk position and suspension-based execution. BMC Sports Sci Med Rehabil 2025.",
    lectura: "leída — abstract",
  },
  {
    id: 53,
    texto:
      "Pereira NDS et al. Reverse Nordic curl does not generate superior eccentric activation of the quadriceps muscle than bodyweight squat-based exercises. J Sport Rehabil 2024.",
    lectura: "leída — abstract",
  },
  {
    id: 54,
    texto:
      "Macrum E et al. Effect of limiting ankle-dorsiflexion range of motion on lower extremity kinematics and muscle-activation patterns during a squat. J Sport Rehabil 2012.",
    lectura: "leída — abstract",
  },
  {
    id: 55,
    texto:
      "Dill KE et al. Altered knee and ankle kinematics during squatting in those with limited weight-bearing-lunge ankle-dorsiflexion range of motion. J Athl Train 2014.",
    lectura: "leída — abstract",
  },
  {
    id: 56,
    texto:
      "Hemmerich A et al. Hip, knee, and ankle kinematics of high range of motion activities of daily living. J Orthop Res 2006.",
    lectura: "leída — abstract",
  },
  {
    id: 57,
    texto:
      "Rojas-Jaramillo A et al. Impact of the deep squat on articular knee joint structures, friend or enemy? A scoping review. Front Sports Act Living 2024.",
    lectura: "leída — abstract",
  },
  {
    id: 58,
    texto:
      "Crossley KM et al. Performance on the single-leg squat task indicates hip abductor muscle function. Am J Sports Med 2011.",
    lectura: "leída — abstract",
  },
  {
    id: 59,
    texto:
      "Powers CM. The influence of altered lower-extremity kinematics on patellofemoral joint dysfunction: a theoretical perspective. J Orthop Sports Phys Ther 2003.",
    lectura: "leída — abstract",
  },
  {
    id: 60,
    texto:
      "Contreras B et al. A comparison of gluteus maximus, biceps femoris, and vastus lateralis electromyographic activity in the back squat and barbell hip thrust exercises. J Appl Biomech 2015.",
    lectura: "leída — abstract",
  },
  {
    id: 61,
    texto:
      "Williams MJ et al. Activation of the gluteus maximus during performance of the back squat, split squat, and barbell hip thrust and the relationship with maximal sprinting. J Strength Cond Res 2021.",
    lectura: "leída — abstract",
  },
  {
    id: 62,
    texto:
      "McCurdy K et al. Hip and knee extensor activation during the hip thrust and rear-foot-elevated split squat in trained females. J Strength Cond Res 2021.",
    lectura: "leída — abstract",
  },
  {
    id: 63,
    texto:
      "Plotkin DL et al. Hip thrust and back squat training elicit similar gluteus muscle hypertrophy and transfer similarly to the deadlift. Front Physiol 2023.",
    lectura: "leída — abstract",
  },
  {
    id: 64,
    texto:
      "van Dyk N, Behan FP, Whiteley R. Including the Nordic hamstring exercise in injury prevention programmes halves the rate of hamstring injuries: a systematic review and meta-analysis of 8459 athletes. Br J Sports Med 2019.",
    lectura: "leída — abstract",
  },
  {
    id: 65,
    texto:
      "Impellizzeri FM, McCall A, van Smeden M. Why methods matter in a meta-analysis: a reappraisal showed inconclusive injury preventive effect of Nordic hamstring exercise. J Clin Epidemiol 2021.",
    lectura: "leída — abstract",
  },
  {
    id: 66,
    texto:
      "Petersen J et al. Preventive effect of eccentric training on acute hamstring injuries in men's soccer: a cluster-randomized controlled trial. Am J Sports Med 2011.",
    lectura: "leída — abstract",
  },
  {
    id: 67,
    texto:
      "Timmins RG et al. Short biceps femoris fascicles and eccentric knee flexor weakness increase the risk of hamstring injury in elite football (soccer): a prospective cohort study. Br J Sports Med 2016.",
    lectura:
      "leída — abstract (Nota de la revisión: R3 (observación): se usaba como respaldo de un signo de lesión que el estudio no aborda; retirada de B-NC-1)",
  },
  {
    id: 68,
    texto:
      "Bourne MN et al. Impact of exercise selection on hamstring muscle activation. Br J Sports Med 2017.",
    lectura: "leída — abstract",
  },
  {
    id: 69,
    texto:
      "Maeo S et al. Hamstrings hypertrophy is specific to the training exercise: Nordic hamstring versus lengthened state eccentric training. Med Sci Sports Exerc 2024.",
    lectura: "leída — abstract",
  },
  {
    id: 70,
    texto:
      "Maeo S et al. Greater hamstrings muscle hypertrophy but similar damage protection after training at long versus short muscle lengths. Med Sci Sports Exerc 2021.",
    lectura: "leída — abstract",
  },
  {
    id: 71,
    texto:
      "Coratella G et al. Muscle damage and the repeated-bout effect after a typical Nordic hamstring exercise session. Int J Sports Med 2025.",
    lectura: "leída — abstract",
  },
  {
    id: 72,
    texto:
      "Behan FP et al. The dose-response of pain throughout a Nordic hamstring exercise intervention. Scand J Med Sci Sports 2023.",
    lectura: "leída — abstract",
  },
  {
    id: 73,
    texto:
      "McGill SM, Marshall LW. Kettlebell swing, snatch, and bottoms-up carry: back and hip muscle activation, motion, and low back loads. J Strength Cond Res 2012;26(1):16-27.",
    lectura:
      "leída — abstract (Nota de la revisión: R3-6: no dice lo afirmado en G2 (no compara snatch con swing); corregida. Los datos del swing son textuales)",
  },
  {
    id: 74,
    texto:
      "Lake JP, Lauder MA. Mechanical demands of kettlebell swing exercise. J Strength Cond Res 2012.",
    lectura: "leída — abstract",
  },
  {
    id: 75,
    texto:
      "Lake JP, Lauder MA. Kettlebell swing training improves maximal and explosive strength. J Strength Cond Res 2012.",
    lectura: "leída — abstract",
  },
  {
    id: 76,
    texto:
      "Van Gelder LH et al. EMG analysis and sagittal plane kinematics of the two-handed and single-handed kettlebell swing: a descriptive study. Int J Sports Phys Ther 2015.",
    lectura: "leída — abstract",
  },
  {
    id: 77,
    texto:
      "Del Monte MJ et al. Hamstring myoelectrical activity during three different kettlebell swing exercises. J Strength Cond Res 2020.",
    lectura: "leída — abstract",
  },
  {
    id: 78,
    texto:
      "Falatic JA et al. Effects of kettlebell training on aerobic capacity. J Strength Cond Res 2015.",
    lectura: "leída — abstract",
  },
  {
    id: 79,
    texto:
      "Hewett TE et al. Biomechanical measures of neuromuscular control and valgus loading of the knee predict anterior cruciate ligament injury risk in female athletes: a prospective study. Am J Sports Med 2005.",
    lectura: "leída — abstract",
  },
  {
    id: 80,
    texto:
      "Padua DA et al. The Landing Error Scoring System as a screening tool for an anterior cruciate ligament injury-prevention program in elite-youth soccer athletes. J Athl Train 2015.",
    lectura: "leída — abstract",
  },
  {
    id: 81,
    texto:
      "Sugimoto D et al. Specific exercise effects of preventive neuromuscular training intervention on anterior cruciate ligament injury risk reduction in young females: meta-analysis and subgroup analysis. Br J Sports Med 2015.",
    lectura: "leída — abstract",
  },
  {
    id: 82,
    texto:
      "Devita P, Skelly WA. Effect of landing stiffness on joint kinetics and energetics in the lower extremity. Med Sci Sports Exerc 1992.",
    lectura:
      'leída — abstract (Nota de la revisión: R3-26: el aterrizaje "rígido" tuvo 77° de flexión de rodilla (no "casi extendida"); corregida en E3.)',
  },
  {
    id: 83,
    texto:
      "Tamura A, Akasaka K, Otsudo T. Contribution of lower extremity joints on energy absorption during soft landing. Int J Environ Res Public Health 2021.",
    lectura: "leída — abstract",
  },
  {
    id: 84,
    texto:
      "Zhang Q et al. Optimizing stretch-shortening cycle performance: effects of drop height and landing strategy on lower-limb biomechanics in drop jumps. PeerJ 2025.",
    lectura: "leída — abstract",
  },
  {
    id: 85,
    texto:
      "Markovic G. Does plyometric training improve vertical jump height? A meta-analytical review. Br J Sports Med 2007.",
    lectura: "leída — abstract",
  },
  {
    id: 86,
    texto:
      "Komi PV. Stretch-shortening cycle: a powerful model to study normal and fatigued muscle. J Biomech 2000.",
    lectura: "leída — abstract",
  },
  {
    id: 87,
    texto:
      "Gibala MJ et al. Physiological adaptations to low-volume, high-intensity interval training in health and disease. J Physiol 2012.",
    lectura:
      "leída — abstract (Nota de la revisión: No verificada por la revisión 3 (no la abrió))",
  },
  {
    id: 88,
    texto:
      "Garber CE et al. ACSM position stand. Quantity and quality of exercise for developing and maintaining cardiorespiratory, musculoskeletal, and neuromotor fitness in apparently healthy adults. Med Sci Sports Exerc 2011.",
    lectura:
      'leída — abstract (Nota de la revisión: R3-34: "un total de 60 s por ejercicio", no "≥60 s"; R3-18: no es fuente de la conducta ante dolor de pecho.)',
  },
  {
    id: 89,
    texto:
      "Behm DG et al. Acute effects of muscle stretching on physical performance, range of motion, and injury incidence in healthy active individuals: a systematic review. Appl Physiol Nutr Metab 2016.",
    lectura:
      "leída — abstract (Nota de la revisión: R3-33: recomienda estirar dentro de una entrada en calor con actividad dinámica posterior)",
  },
  {
    id: 90,
    texto:
      "Weppler CH, Magnusson SP. Increasing muscle extensibility: a matter of increasing length or modifying sensation? Phys Ther 2010;90(3):438-49.",
    lectura: "leída — abstract, OUP vía WebFetch",
  },
  {
    id: 91,
    texto:
      "Konrad A et al. Chronic effects of stretching on range of motion with consideration of potential moderating variables: a systematic review with meta-analysis. J Sport Health Sci 2024.",
    lectura: "leída — abstract",
  },
  {
    id: 92,
    texto:
      "Ingram LA et al. Mechanisms underlying range of motion improvements following acute and chronic static stretching: a systematic review, meta-analysis and multivariate meta-regression. Sports Med 2025.",
    lectura: "leída — abstract",
  },
  {
    id: 93,
    texto:
      "Weir A et al. Doha agreement meeting on terminology and definitions in groin pain in athletes. Br J Sports Med 2015.",
    lectura:
      "leída — texto parcial: definiciones (Nota de la revisión: Se usa solo como fundamento interno de las banderas de ingle (no se le dice al alumno))",
  },
  {
    id: 94,
    texto:
      "Griffin DR et al. The Warwick Agreement on femoroacetabular impingement syndrome (FAI syndrome): an international consensus statement. Br J Sports Med 2016.",
    lectura:
      "leída — abstract (Nota de la revisión: Se usa solo como fundamento interno (diagnóstico = síntomas + signos + imagen))",
  },
  {
    id: 95,
    texto:
      "Harris JD et al. Microinstability of the hip and the splits radiograph. Orthopedics 2016.",
    lectura: "leída — abstract",
  },
  {
    id: 96,
    texto:
      "Finucane LM et al. International framework for red flags for potential serious spinal pathologies. J Orthop Sports Phys Ther 2020.",
    lectura:
      "leída — abstract (Nota de la revisión: R3-5: mal aplicada en la versión original: es un marco para patología espinal grave; sus ejemplos de cauda equina y banderas sistémicas están en el texto completo, que la revisión no leyó)",
  },
  {
    id: 97,
    texto:
      "Callaghan JP, McGill SM. Intervertebral disc herniation: studies on a porcine model exposed to highly repetitive flexion/extension motion with compressive force. Clin Biomech 2001.",
    lectura: "leída — abstract",
  },
  {
    id: 98,
    texto:
      "Tampier C, Drake JD, Callaghan JP, McGill SM. Progressive disc herniation: an investigation of the mechanism using radiologic, histochemical, and microscopic dissection techniques on a porcine model. Spine 2007.",
    lectura: "leída — abstract",
  },
  {
    id: 99,
    texto:
      "Cuthbert M et al. Electromyographical differences between the hyperextension and reverse-hyperextension. J Strength Cond Res 2021.",
    lectura: "leída — abstract",
  },
  {
    id: 100,
    texto:
      "Lawrence MA, Chin A, Swanson BT. Biomechanical comparison of the reverse hyperextension machine and the hyperextension exercise. J Strength Cond Res 2019.",
    lectura: "leída — abstract",
  },
  {
    id: 101,
    texto:
      "Kavcic N, Grenier S, McGill SM. Determining the stabilizing role of individual torso muscles during rehabilitation exercises. Spine 2004.",
    lectura: "leída — abstract",
  },
  {
    id: 102,
    texto:
      "Suprak DN et al. Scapular kinematics and shoulder elevation in a traditional push-up. J Athl Train 2013.",
    lectura:
      "leída — abstract (Nota de la revisión: R3-32: condición distinta (hombro a ≈90° con codos abiertos en push-up); extrapolación débil)",
  },
  {
    id: 103,
    texto:
      "Madden V et al. Spondylolysis: a narrative review of etiology, diagnosis, and management. Int J Environ Res Public Health 2026.",
    lectura: "leída — abstract",
  },
  {
    id: 104,
    texto:
      "Núñez de Arenas-Arroyo S et al. Immediate and short-term effects of neurodynamic techniques on hamstring flexibility: a systematic review with meta-analysis. PLoS One 2025.",
    lectura: "leída — abstract",
  },
  {
    id: 105,
    texto:
      "Ando F et al. Trunk muscle thickness during supine and crawling exercises. Int J Exerc Sci 2023.",
    lectura: "leída — abstract",
  },
  {
    id: 106,
    texto:
      "Villegas Meza AD et al. Hip microinstability: current concepts in diagnosis, surgical management, and outcomes. A narrative review. Open Access J Sports Med 2025.",
    lectura:
      "leída — texto parcial; usada solo como contexto, no citada en el cuerpo (Nota de la revisión: No citada en el cuerpo; no verificada por la revisión 3)",
  },
  {
    id: 107,
    texto:
      "Eleftheraki A et al. Hip range of motion and strength in young pre-professionals ballet dancers versus non-dancers. J Dance Med Sci 2025.",
    lectura: "leída — abstract",
  },
  {
    id: 108,
    texto:
      "Lee TQ. Biomechanics of hyperflexion and kneeling before and after total knee arthroplasty. Clin Orthop Surg 2014.",
    lectura: "leída — abstract; estudio de cadáver/prótesis, relevancia baja",
  },
  {
    id: 109,
    texto:
      "Michel & Torrado. Muscle activity in different conditioning exercises for the front lever and full planche. Freiburger Gerätturntage, 2010 (listado de congreso). No se cita ningún dato de este trabajo.",
    lectura:
      "no leída; solo vi el título del programa en un resultado de búsqueda",
  },
  {
    id: "L1",
    texto:
      "Neumann DA. Kinesiology of the Musculoskeletal System: Foundations for Rehabilitation (3.ª ed.). Elsevier.",
    lectura: "libro de memoria, sin verificar página",
  },
  {
    id: "L2",
    texto:
      "Kapandji AI. The Physiology of the Joints, vols. 1 a 3 (miembro superior, miembro inferior, tronco y raquis).",
    lectura: "libro de memoria, sin verificar página",
  },
  {
    id: "L3",
    texto:
      "Low S. Overcoming Gravity: A Systematic Approach to Gymnastics and Bodyweight Strength (2.ª ed.).",
    lectura: "libro de memoria, sin verificar página",
  },
  {
    id: "L4",
    texto:
      "McGill S. Low Back Disorders: Evidence-Based Prevention and Rehabilitation y Ultimate Back Fitness and Performance.",
    lectura: "libro de memoria, sin verificar página",
  },
  {
    id: "L5",
    texto:
      "Haff GG, Triplett NT (eds.). Essentials of Strength Training and Conditioning (NSCA). Human Kinetics (edición sin verificar).",
    lectura: "libro de memoria, sin verificar página",
  },
] as const satisfies readonly CitaDef[];

/** Leyenda de las marcas con letra (investigación, "Leyenda de marcas"). */
export const LEYENDA_MARCAS: Readonly<
  Record<Exclude<MarcaLetra, "L1" | "L2" | "L3" | "L4" | "L5">, string>
> = {
  C: "Consenso de coaching o inferencia desde la anatomía y la física, sin evidencia directa leída: es una hipótesis de trabajo.",
  M: "Derivación mecánica: física básica (momento = peso por brazo de palanca) o geometría. No es una fuente.",
  R: "Texto o corrección de la revisión del kinesiólogo, conocimiento estándar sin cita verificada.",
  H: "Necesita validación de un kinesiólogo humano",
  N: "Necesita definición o confirmación de Nacho",
};
