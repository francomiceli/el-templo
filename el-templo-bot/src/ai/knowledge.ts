/**
 * Structured business knowledge data for El Templo WhatsApp Bot.
 *
 * All pricing, schedules, rules, and procedures are maintained here
 * as typed constants and composed into a markdown string for injection
 * into the system prompt.
 *
 * Sections are stored as a module-level ordered array of tagged entries
 * (`SECTIONS`) and filtered at call time by client lifecycle state:
 *
 * - `getBusinessKnowledge()` — returns the full set (backward compat).
 * - `getBusinessKnowledge('lead')` — returns ONLY sections tagged `'discovery'`.
 *   PB1 leads during discovery never see retention, upgrade paths, app
 *   troubleshooting, or member policies — only the content they need to
 *   decide to book a trial.
 * - `getBusinessKnowledge('trial' | 'active_member' | 'inactive_member' |
 *    'expired_member')` — returns the full set (identical content to the
 *   no-arg call, zero regression for non-lead states).
 *
 * 16 sections (post v5.3.1 splits + 87-02 method additions): Que es El Templo,
 * Metodo (elevator) [NEW 87-02, discovery], Metodo (detalle) [NEW 87-02,
 * full-only], ROM, Planes y Precios (base), Mejora de plan (upgrade paths,
 * split out of Planes y Precios), Reglas Zero, Horarios por Sede, Clase de
 * Prueba, App (DeportNet), Politicas, Tecnicas de Venta, Objeciones de venta
 * (split from Manejo de Objeciones), Objeciones de retención (split from
 * Manejo de Objeciones), Estrategias de Retencion, 12 Reglas de Oro.
 *
 * Original 1–12 section order is preserved — the two splits insert a new
 * entry immediately after the parent section so flow is unchanged.
 */

import type { ClientState } from "../state/machine.js";

/**
 * Tag vocabulary is intentionally narrow for v5.3.1. Future tags
 * (member-only, admin, locale) can be added without renaming. A section
 * is "discovery-relevant" iff it carries the 'discovery' tag.
 */
type SectionTag = "discovery";

interface KnowledgeSection {
  /** Human-readable title used only for debugging / tests. Not rendered. */
  title: string;
  /** Full formatted body including its own *bold* heading and content. */
  body: string;
  /** Tags. Presence of 'discovery' = include for `clientState === 'lead'`. */
  tags: ReadonlyArray<SectionTag>;
}

// ---------------------------------------------------------------------------
// 1. Pricing
// ---------------------------------------------------------------------------

interface PlanPricing {
  name: string;
  duration: string;
  sessionsPerWeek: string;
  modality: string;
  benefits: string;
  sede: string;
  regular: number;
  zero: number;
}

const FLEX_PLANS: PlanPricing[] = [
  {
    name: "Flex",
    duration: "1 mes",
    sessionsPerWeek: "2 por semana",
    modality: "Turnos fijos",
    benefits: "2 sesiones de regalo",
    sede: "Unica",
    regular: 80_000,
    zero: 65_000,
  },
  {
    name: "Flex+",
    duration: "1 mes",
    sessionsPerWeek: "Hasta 6 por semana",
    modality: "Turnos fijos o libres",
    benefits: "Acceso ROM",
    sede: "Unica",
    regular: 100_000,
    zero: 80_000,
  },
];

const FOUNDATION_PLANS: PlanPricing[] = [
  {
    name: "Foundation",
    duration: "4 meses",
    sessionsPerWeek: "2 por semana",
    modality: "Turnos fijos",
    benefits: "2 sesiones de regalo por mes",
    sede: "Unica",
    regular: 250_000,
    zero: 220_000,
  },
  {
    name: "Foundation+",
    duration: "4 meses",
    sessionsPerWeek: "Hasta 6 por semana",
    modality: "Turnos fijos o libres",
    benefits: "Acceso ROM, Multisede",
    sede: "Multisede",
    regular: 350_000,
    zero: 315_000,
  },
];

const PERFORMANCE_PLAN: PlanPricing = {
  name: "Performance",
  duration: "8 meses",
  sessionsPerWeek: "Hasta 6 por semana",
  modality: "Turnos fijos o libres",
  benefits:
    "Acceso ROM, Eventos exclusivos, Multisede, Congelamiento por vacaciones",
  sede: "Multisede",
  regular: 600_000,
  zero: 560_000,
};

interface CreditCardPlan {
  name: string;
  duration: string;
  regularTC: number;
  zeroTC: number;
}

const CREDIT_CARD_PLANS: CreditCardPlan[] = [
  {
    name: "Performance",
    duration: "8 meses",
    regularTC: 670_000,
    zeroTC: 625_000,
  },
  {
    name: "Foundation+",
    duration: "4 meses",
    regularTC: 370_000,
    zeroTC: 340_000,
  },
  {
    name: "Foundation",
    duration: "4 meses",
    regularTC: 280_000,
    zeroTC: 245_000,
  },
];

// ---------------------------------------------------------------------------
// 2. Zero pricing rules
// ---------------------------------------------------------------------------

const ZERO_RULES = `Los precios *Zero* son descuentos especiales que se aplican en dos casos:

1. *Boarding Pass (primer mes en El Templo):* Cuando una persona inicia por primera vez y presenta su Boarding Pass, puede acceder a los precios Zero en cualquier membresia. Es un beneficio unico (una sola vez).

2. *Conversion a plan de largo plazo:* Cuando una persona comienza con un plan mensual (Flex) en su primer mes, al renovar puede acceder a los precios Zero exclusivamente en planes de largo plazo (Foundation, Foundation+, Performance).

Fuera de estos casos, se aplican los precios regulares.

*Datos de pago:*
- Alias transferencia (Post SP): eltemplomdp.sa
- Alias renovaciones: eltemplo.mdp
- Numero Cardio: 432 2555 / 432 2222`;

// ---------------------------------------------------------------------------
// 3. Branch schedules
// ---------------------------------------------------------------------------

interface BranchSchedule {
  name: string;
  address: string;
  weekdayMorning: string[];
  weekdayAfternoon: string[];
  saturday: string[] | null;
}

const SCHEDULES: BranchSchedule[] = [
  {
    name: "Constitucion",
    address: "Av. Constitucion 6745",
    weekdayMorning: ["7:00", "8:00", "9:00"],
    weekdayAfternoon: ["17:00", "18:00", "19:00", "20:00"],
    saturday: null,
  },
  {
    name: "Jujuy",
    address: "Jujuy 3761",
    weekdayMorning: ["7:00", "8:00", "9:00", "10:00"],
    weekdayAfternoon: ["17:00", "18:00", "19:00", "20:00"],
    saturday: null,
  },
  {
    name: "Moreno",
    address: "Moreno 3751",
    weekdayMorning: ["7:00", "8:00", "9:00", "10:00"],
    weekdayAfternoon: ["17:00", "18:00", "19:00", "20:00"],
    saturday: ["8:00", "9:00", "10:00", "11:00"],
  },
  {
    name: "Alem",
    address: "Alem 3958",
    weekdayMorning: ["7:00", "8:00", "9:00", "10:00"],
    weekdayAfternoon: ["17:00", "18:00", "19:00", "20:00"],
    saturday: ["8:00", "9:00", "10:00", "11:00"],
  },
  {
    name: "Mario Bravo",
    address: "Mario Bravo 618",
    weekdayMorning: ["7:00", "8:00", "9:00", "10:00"],
    weekdayAfternoon: ["17:00", "18:00", "19:00", "20:00"],
    saturday: null,
  },
];

// ---------------------------------------------------------------------------
// 4. ROM (Range of Motion)
// ---------------------------------------------------------------------------

const ROM_DATA = `*ROM* significa *Range of Motion* (Rango Organico de Movilidad). Es una clase complementaria con enfoque en movilidad, control y ampliacion de rangos de movimiento.

*Que trabaja:*
- Movilidad articular
- Control corporal
- Flexibilidad activa
- Recuperacion y calidad de movimiento

Es el complemento ideal para entrenar mejor y evolucionar de forma mas segura.

*Disponible en:* Flex+, Foundation+, Performance.
Los miembros con plan basico (Flex, Foundation) pueden usar sus 2 sesiones de regalo mensuales para probar clases de ROM.

Las clases de ROM se dictan los sabados en las sedes que tienen horario sabatino (Moreno y Alem).`;

// ---------------------------------------------------------------------------
// 5. Trial class flow
// ---------------------------------------------------------------------------

const TRIAL_FLOW = `*Clase de prueba gratuita:*

- La primera clase tiene un valor de $20,000 pero es 100% bonificada con el Boarding Pass (ver *Reglas Zero*).
- Se coordina con un minimo de 24 horas de anticipacion para preparar la recepcion.

*Pasos:*
1. El usuario selecciona su sucursal de preferencia.
2. Elige dia y horario dentro de los disponibles.
3. Proporciona nombre y apellido.
4. Administracion envia el Boarding Pass (ver *Reglas Zero*) con los detalles de la sesion.
5. Se requiere reconfirmacion antes de la clase (sin respuesta, el cupo se libera).

*Que llevar:*
- Ropa comoda
- Sin calzado (se entrena descalzo)
- Toalla de mano (opcional)
- Botella de agua (no de vidrio, hay dispenser disponible)

*Despues de la clase:* se contacta al alumno para conocer su experiencia y guiarlo hacia una membresia.`;

// ---------------------------------------------------------------------------
// 6. App troubleshooting
// ---------------------------------------------------------------------------

const APP_HELP = `*Descarga de la app:*
- Android: https://kommo.cc/K/U8OEZV/U7CGMD
- iPhone, Android o PC (web): https://kommo.cc/K/U8OEZX/U7CGMF

*Activar cuenta:*
1. Toca "Olvidaste tu contrasena?"
2. Ingresa tu email y hace clic en "Enviar email de recuperacion"
3. Crea una contrasena y selecciona "Unite ahora"
4. Ingresa con tu correo y la nueva contrasena

*Reservar una clase (planes plus/libres):*
- Turnos online > selecciona sucursal, membresia, actividad (Calistenia) > elegir horario
- Disponible desde 48hs antes hasta 5 minutos antes del inicio de la clase

*Cancelar una clase:*
- Turnos online > selecciona sucursal, membresia, actividad > selecciona la clase reservada > confirmar cancelacion
- Se puede cancelar hasta 20 minutos antes del inicio

*Ver membresia:*
- Perfil > Mis servicios/membresias > selecciona sucursal > filtra fechas > toca la lupa azul

*Lista de espera:*
- Si un horario aparece en rojo (lleno), podés anotarte en la lista de espera
- El sistema te envia un email si se libera un lugar

*Soporte administrativo:* Lunes a viernes, 7 a 21 hs`;

// ---------------------------------------------------------------------------
// 7. Upgrade paths
// ---------------------------------------------------------------------------

const UPGRADE_PATHS = `*Caminos de mejora de plan:*

- *Flex* (2x/sem) -> *Flex+* (hasta 6x/sem + ROM): para mas flexibilidad y acceso a clases ROM.
- *Flex / Flex+* (1 mes) -> *Foundation* (4 meses): congelas el precio y accedes a descuentos Zero al renovar.
- *Foundation* -> *Foundation+*: suma Multisede + acceso ROM.
- *Cualquier plan* -> *Performance* (8 meses): maximo nivel con Multisede, ROM, eventos exclusivos y congelamiento por vacaciones.

Los planes de largo plazo (Foundation, Foundation+, Performance) se pueden pagar con tarjeta de credito en 3 cuotas sin interes (tarjeta fisica, miercoles y sabados).`;

// ---------------------------------------------------------------------------
// 8. Policies
// ---------------------------------------------------------------------------

const POLICIES = `*Turnos fijos:*
- Los reserva administracion al momento de contratar la membresia.
- Una vez fijados, no se pueden modificar durante la vigencia.
- Si faltás, podés usar las 2 sesiones de regalo para recuperar clases.

*Turnos autogestionados:*
- Disponible para planes Plus (Flex+, Foundation+) y Performance.
- Se gestionan desde la app, seccion "Turnos online".
- Se pueden reservar desde 48hs antes hasta 5 minutos antes de la clase.

*Cancelacion de turnos:*
- Se puede cancelar hasta 20 minutos antes del inicio de la clase.
- Cancelar libera el cupo para otros alumnos.

*Pausa / congelamiento:*
- Solo el plan Performance incluye congelamiento por vacaciones.
- Los demas planes no permiten pausa ni congelamiento.

*Horario de atencion admin:*
- Lunes a viernes, 7 a 21 hs (redes y WhatsApp).

*Formas de pago:*
- Efectivo o transferencia para todos los planes.
- Planes de largo plazo (Foundation, Foundation+, Performance) se abonan preferentemente en efectivo.
- Tarjeta de credito: solo miercoles y sabados, con tarjeta fisica. 3 cuotas sin interes.`;

// ---------------------------------------------------------------------------
// 9. Sales techniques
// ---------------------------------------------------------------------------

const SALES_TECHNIQUES = `*Tecnicas de venta:*

- *Urgencia:* "Cupos limitados por grupo", "Beneficio unico del Boarding Pass (ver *Reglas Zero*)" (solo una vez).
- *Anclaje de precios:* Mostrar primero el precio regular tachado y despues el precio Zero/Boarding Pass (ver *Reglas Zero*) (ej: ~$80,000~ -> *$65,000*).
- *Upselling:* Cuando preguntan por Flex, mencionar Foundation por el beneficio de congelar precio. Al renovar, destacar ahorro a largo plazo.
- *Soft close:* "Con cual de estos planes querés avanzar?", "Querés que te ayude a elegir dia y horario?"
- *Valor antes que precio:* Siempre explicar que incluye el plan y sus beneficios antes de dar el numero.
- *Mostrar Flex primero:* Es el mas accesible y popular. Solo ofrecer Foundation/Performance si preguntan mas o al renovar.`;

// ---------------------------------------------------------------------------
// 10a. Objections — sales (discovery: caro, tiempo, miedo, pensarlo,
// otro lado, lejos, pagar por clase)
// ---------------------------------------------------------------------------

const OBJECTIONS_SALES = `*Manejo de objeciones comunes:*

1. *"Es caro"*
   - Ancla contra el costo diario: un plan Flex son 8 clases, o sea ~$10,000 por clase guiada por profesores.
   - Menciona el descuento del Boarding Pass (ver *Reglas Zero*).
   - Destaca Foundation para congelar precio frente a aumentos.

2. *"No tengo tiempo"*
   - Solo necesitas 2 veces por semana (1 hora cada clase).
   - Horarios flexibles: manana (7-10hs) y tarde (17-20hs), de lunes a viernes.
   - Con planes Plus podés autogestionar tus turnos desde la app.

3. *"Tengo miedo / no estoy en forma"*
   - Las clases son multinivel: el nivel Alfa es para principiantes totales.
   - Los profesores adaptan la dificultad a cada persona.
   - Nunca estas solo, siempre hay acompanamiento profesional.

4. *"Quiero pensarlo"*
   - Responder con calidez y sin apuro: "Claro, sin apuro. Si querés, te cuento cual seria el proximo paso cuando estés lista/o."
   - Mencionar el Boarding Pass (ver *Reglas Zero*) como opcion suave: "Tene en cuenta que el Boarding Pass es de uso unico, asi que cuando te decidas lo aprovechas."
   - Ofrecer una clase de prueba gratuita para que viva la experiencia sin compromiso.
   - Solo mencionar cupos limitados si check_schedule confirmo baja disponibilidad real.

5. *"Ya entreno en otro lado"*
   - La calistenia es complementaria a cualquier deporte.
   - ROM mejora movilidad y previene lesiones para cualquier actividad.
   - La clase de prueba es gratuita, puede comparar.

6. *"Me queda lejos"*
   - 5 sucursales en Mar del Plata: Constitucion, Jujuy, Moreno, Alem, Mario Bravo.
   - Planes Plus y Performance incluyen acceso multisede.

7. *"Puedo pagar por clase?"*
   - Clase suelta: $20,000.
   - Plan Flex mensual: $80,000 por 8 clases = $10,000 cada una. Mucho mejor valor.`;

// ---------------------------------------------------------------------------
// 10b. Objections — retention (no me convencio / tengo dudas)
// ---------------------------------------------------------------------------

const OBJECTIONS_RETENTION = `*Manejo de objeciones (retencion):*

8. *"No me convencio / tengo dudas"*
   - Antes de aceptar, hacer UNA pregunta suave: "Que es lo que te genera dudas? Capaz puedo ayudarte con eso."
   - Si despues de responder sigue sin interes, respetar su decision con calidez: "Perfecto, cualquier cosa aca estoy."
   - No insistir mas de una vez.`;

// ---------------------------------------------------------------------------
// 11. Retention strategies
// ---------------------------------------------------------------------------

const RETENTION_STRATEGIES = `*Estrategias de retencion:*

*Miembro inactivo (>30 dias sin asistir):*
- Contactar con calidez, sin presion: "Hace un tiempo que no te vemos, esta todo bien?"
- Recordar beneficios del entrenamiento y la comunidad.
- Ofrecer reprogramar turnos fijos o cambiar horarios si fue por conveniencia.
- Mencionar las 2 sesiones de regalo para retomar sin perder clases.

*Membresia por vencer:*
- Mostrar opciones de renovacion empezando por Flex (mas accesible).
- Destacar Foundation/Performance para congelar precio y evitar aumentos.
- Mencionar beneficios adicionales de planes de largo plazo: prioridad de turnos, eventos, ROM.
- Soft close: "Cual de estos planes se adapta mejor a tu meta actual?"

*Solicitud de cancelacion o pausa:*
- Entender el motivo antes de ofrecer alternativas.
- Opciones: cambio de turno, cambio de sede, downgrade de plan.
- Solo el plan Performance permite congelamiento por vacaciones.
- Si insiste, escalar a un humano del equipo.

*Miembro que vuelve despues de un tiempo:*
- Bienvenida calida: "Que bueno que vuelvas!"
- Ofrecer experiencia similar a prueba para re-familiarizarse.
- Mencionar novedades (nueva sede, nuevas clases, ROM).
- Guiar hacia contratacion de nueva membresia.`;

// ---------------------------------------------------------------------------
// 12b. Method — elevator pitch (≤200 chars, discovery-tagged) + verbatim
// long-form (team-authored, full-only). See 87-CONTEXT.md pending_content.
// ELEVATOR_TEXT preserves three team hooks: "método internacional", "cuatro
// niveles simultáneos", "no salirse del grupo". Tuteo ("progresás").
// METHOD_DETAIL is byte-for-byte verbatim from the team source modulo
// soft-wrap reflow — do NOT paraphrase, compress, or reformat.
// ---------------------------------------------------------------------------

const ELEVATOR_TEXT = `Es un método internacional de calistenia. Cuatro niveles entrenan en simultáneo en cada clase, así progresás sin salirte del grupo.`;

const METHOD_DETAIL = `El Templo tiene un método internacional de entrenamiento de calistenia que combina un sistema de periodización cíclica con experiencias de comunidad únicas en cada clase. Cada alumno entrena con un programa individual adaptado a su nivel — hay cuatro niveles activos simultáneamente en cada clase, desde principiantes hasta atletas avanzados. El sistema está diseñado para que cada persona progrese a su ritmo sin salirse del grupo.

Pero El Templo no es solo entrenamiento. Cada clase tiene momentos distintos que no vas a encontrar en otro lado. Hay momentos donde el entrenamiento se convierte en juego — movimiento grupal, conexión desde el primer minuto. Hay momentos donde profundizamos en un solo movimiento con tiempo y guía real del entrenador. Hay momentos donde conectás todo lo que entrenaste en secuencias fluidas. Hay momentos donde tu entrenador te lleva a probar los movimientos que más querés lograr. Hay momentos donde trabajamos verticales. Hay momentos donde entrenamos la cabeza además del cuerpo — respiración, foco, calma.

No todos los días son iguales — hay distintos tipos de clases a lo largo de la semana, cada una con su propio foco y experiencia.

La app complementa el presencial. Cada alumno puede seguir su programa individual en la app y seguir progresando fuera del local.`;

// ---------------------------------------------------------------------------
// 12. Golden rules
// ---------------------------------------------------------------------------

const GOLDEN_RULES = `*12 Reglas de Oro de Mica:*

1. Siempre responde en espanol con tuteo argentino (vos, querés, podés).
2. Maximo 1-2 emojis por mensaje — calidez sin saturar.
3. Mensajes cortos y escaneables — una idea por parrafo.
4. Una pregunta a la vez — no bombardear con opciones.
5. Mostrar Flex primero (mas popular), ofrecer Foundation/Performance si preguntan mas.
6. Nunca inventar datos — si no sabes, admitilo y ofrece escalar.
7. Decir "cupos disponibles" en vez de "lugares".
8. Despues de book_class [BUTTONS_SENT], no enviar texto adicional.
9. En clase de prueba, pedir solo nombre y preferencia de clase (el telefono ya lo tenés).
10. Escalacion: "Te paso con alguien del equipo, te escriben enseguida" y silencio.
11. Formato WhatsApp: *negrita* y vinetas, nunca ### ni markdown headers.
12. Cerrar con una pregunta o CTA suave — pero si ya hiciste un CTA este turno y el usuario respondió con otra pregunta, respondé la pregunta sin repetir el CTA. El CTA va una sola vez por tema. Si el usuario vuelve a mostrar apertura después, ahí sí podés re-proponer.`;

// ---------------------------------------------------------------------------
// Compose and export
// ---------------------------------------------------------------------------

function formatPrice(amount: number): string {
  return `$${amount.toLocaleString("es-AR")}`;
}

function formatPlan(plan: PlanPricing): string {
  return `- *${plan.name}* (${plan.duration}): ${plan.sessionsPerWeek} | ${plan.modality} | ${plan.benefits} | Sede ${plan.sede} | Regular ${formatPrice(plan.regular)} | Zero ${formatPrice(plan.zero)}`;
}

function formatSchedule(branch: BranchSchedule): string {
  const weekday = `L-V: ${[...branch.weekdayMorning, ...branch.weekdayAfternoon].join(" / ")}`;
  const sat = branch.saturday ? ` | Sab: ${branch.saturday.join(" / ")}` : "";
  return `- *${branch.address}*: ${weekday}${sat}`;
}

function formatCreditCardPlans(): string {
  return CREDIT_CARD_PLANS.map(
    (p) =>
      `- *${p.name}* (${p.duration}): TC Regular ${formatPrice(p.regularTC)} | TC Zero ${formatPrice(p.zeroTC)} (3 cuotas sin interes)`,
  ).join("\n");
}

/**
 * Ordered knowledge sections. 16 entries. Preserves the original 1–12
 * section flow with two splits (section 3 → Planes y Precios + Mejora de
 * plan; section 10 → Objeciones de venta + Objeciones de retención) and
 * two phase-87-02 additions placed immediately after "Que es El Templo":
 *   [1] Metodo (elevator) — discovery-tagged, ≤200 chars
 *   [2] Metodo (detalle)  — full-only (untagged), verbatim team text
 * These align method content with the discovery/member audience boundary:
 * leads get the compressed elevator; non-leads get both elevator and the
 * long-form detalle.
 *
 * A section is included for `clientState === 'lead'` iff its `tags` array
 * contains `'discovery'`. All other states receive every entry.
 */
const SECTIONS: ReadonlyArray<KnowledgeSection> = [
  // 1. Que es El Templo — discovery
  {
    title: "Que es El Templo",
    tags: ["discovery"],
    body: `*Que es El Templo*

El Templo es un centro de entrenamiento especializado en *Calistenia*, un metodo que usa tu propio cuerpo como herramienta principal para ganar fuerza, equilibrio y control.

*Sistema por niveles:*
- *Alfa:* Primer paso, ideal para principiantes (1 a 6 meses).
- *Delta:* Para quienes hicieron actividad fisica antes (1 a 12 meses).
- *Omega:* Recorrido en calistenia, progresiones avanzadas (12 a 24 meses).
- *Spartan:* Movimientos especializados, dominio total del cuerpo.

*Importante:* Todas las clases se llaman *Sesion Grupal*. Alfa, Delta, Omega y Spartan son *niveles de progresion*, no actividades separadas. En cada clase conviven alumnos de distintos niveles y los profesores adaptan los ejercicios. Si alguien busca "calistenia alfa", explicar que empieza en nivel Alfa dentro de la Sesion Grupal.

*La clase (60 min):*
Son 100% guiadas por profesores, divididas en 4 bloques de trabajo:
- Fuerza y Tecnica
- Control Corporal
- Base Solida
- Movilidad

Se entrena descalzo. Todo esta pensado para mejorar tu postura y ganar fuerza real de forma integral.`,
  },

  // 2. Metodo (elevator) — discovery (87-02)
  // Compressed 2-sentence pitch (≤200 chars content-only). Drafted from the
  // verbatim team long-form in the next entry, preserving the three hooks
  // required by CONTEXT.md: "método internacional", "cuatro niveles
  // simultáneos", "no salirse del grupo". Tuteo ("progresás"). No emoji,
  // no inline bold/italic inside the body.
  {
    title: "Metodo (elevator)",
    tags: ["discovery"],
    body: `*Metodo (elevator)*

${ELEVATOR_TEXT}`,
  },

  // 3. Metodo (detalle) — full only (87-02)
  // VERBATIM team-authored long-form from 87-CONTEXT.md <pending_content>.
  // Byte-for-byte preservation is required (modulo soft-wrap reflow into
  // flowing paragraphs). Do NOT paraphrase, compress, reformat into bullets,
  // or add headings. Tagging this 'discovery' would blow KGATE-05 headroom.
  {
    title: "Metodo (detalle)",
    tags: [],
    body: `*Metodo (detalle)*

${METHOD_DETAIL}`,
  },

  // 4. ROM — full only
  {
    title: "ROM",
    tags: [],
    body: `*Calisthenics ROM (Range of Motion)*

${ROM_DATA}`,
  },

  // 5. Planes y Precios (base) — discovery
  // NOTE: The original section ended with `*Mejora de plan:*\n${UPGRADE_PATHS}`.
  // That block is split out into the following section so leads never see upgrade paths.
  {
    title: "Planes y Precios",
    tags: ["discovery"],
    body: `*Planes y Membresias*

*Planes Flex (1 mes):*
${FLEX_PLANS.map(formatPlan).join("\n")}

*Planes Foundation (4 meses):*
${FOUNDATION_PLANS.map(formatPlan).join("\n")}

*Plan Performance (8 meses):*
${formatPlan(PERFORMANCE_PLAN)}

*Clase suelta:* $20,000

*Planes con Tarjeta de Credito (tarjeta fisica, miercoles y sabados):*
${formatCreditCardPlans()}`,
  },

  // 6. Mejora de plan — full only (split from Planes y Precios)
  {
    title: "Mejora de plan",
    tags: [],
    body: `*Mejora de plan*

${UPGRADE_PATHS}`,
  },

  // 7. Reglas Zero — discovery
  {
    title: "Reglas Zero",
    tags: ["discovery"],
    body: `*Precios Zero (Descuentos)*

${ZERO_RULES}`,
  },

  // 8. Horarios por Sede — discovery
  {
    title: "Horarios por Sede",
    tags: ["discovery"],
    body: `*Horarios por Sede*

Actividad: Calistenia (todas las sedes). Las clases duran 60 minutos, guiadas por profesores, con 4 bloques de entrenamiento.

${SCHEDULES.map(formatSchedule).join("\n")}

Nota: La sede "Mario Bravo 618" tambien se conoce como sede Mogotes. Es la misma ubicacion.

Clases de ROM: sabados en sedes con horario sabatino (Moreno y Alem).

*Referencia de zonas — qué sede queda más cerca:*

- Centro / microcentro: Jujuy 3761 o Moreno 3751 (las dos quedan a pocas cuadras del centro)
- Puerto / La Perla: Av. Constitución 6745
- Mogotes / Punta Mogotes / barrio sur: Mario Bravo 618 (también conocida como sede Mogotes)
- Alem / Perla Norte / Stella Maris: Alem 3958
- Si el lead menciona una zona que no está en esta lista, preguntale por una referencia cercana antes de sugerir una sede.`,
  },

  // 9. Clase de Prueba — discovery
  {
    title: "Clase de Prueba",
    tags: ["discovery"],
    body: `*Clase de Prueba*

${TRIAL_FLOW}`,
  },

  // 10. App (DeportNet) — full only
  {
    title: "App (DeportNet)",
    tags: [],
    body: `*Ayuda con la App (DeportNet)*

${APP_HELP}`,
  },

  // 11. Politicas — full only
  {
    title: "Politicas",
    tags: [],
    body: `*Politicas del Centro*

${POLICIES}`,
  },

  // 12. Tecnicas de Venta — discovery
  {
    title: "Tecnicas de Venta",
    tags: ["discovery"],
    body: `*Tecnicas de Venta*

${SALES_TECHNIQUES}`,
  },

  // 13. Objeciones de venta — discovery (split from Manejo de Objeciones, items 1–7)
  {
    title: "Objeciones de venta",
    tags: ["discovery"],
    body: `*Objeciones de venta*

${OBJECTIONS_SALES}`,
  },

  // 14. Objeciones de retención — full only (split from Manejo de Objeciones, item 8)
  {
    title: "Objeciones de retención",
    tags: [],
    body: `*Objeciones de retención*

${OBJECTIONS_RETENTION}`,
  },

  // 15. Estrategias de Retencion — full only
  {
    title: "Estrategias de Retencion",
    tags: [],
    body: `*Estrategias de Retencion*

${RETENTION_STRATEGIES}`,
  },

  // 16. Reglas de Oro — discovery (universal: carries discovery tag so leads still see it)
  {
    title: "Reglas de Oro",
    tags: ["discovery"],
    body: `*Reglas de Oro*

${GOLDEN_RULES}`,
  },
];

/**
 * Returns a formatted string containing El Templo business knowledge for
 * injection into the AI system prompt.
 *
 * Behavior:
 * - No argument, or any non-`'lead'` state → full 16-section set
 *   (backward compat, zero regression for trial/active/inactive/expired).
 * - `clientState === 'lead'` → only sections tagged `'discovery'` (9 sections):
 *   Que es El Templo, Metodo (elevator), Planes y Precios (base), Reglas Zero,
 *   Horarios por Sede, Clase de Prueba, Tecnicas de Venta, Objeciones de venta,
 *   Reglas de Oro.
 *
 * Uses WhatsApp-compatible formatting: *bold* for emphasis, bullet lists
 * with - or bullet points, no ### markdown headers. Original 1–12 section
 * order is preserved (filtered, not reordered).
 */
export function getBusinessKnowledge(clientState?: ClientState): string {
  const selected =
    clientState === "lead"
      ? SECTIONS.filter((s) => s.tags.includes("discovery"))
      : SECTIONS;
  return selected.map((s) => s.body).join("\n\n");
}
