/**
 * Structured business knowledge data for El Templo WhatsApp Bot.
 *
 * All pricing, schedules, rules, and procedures are maintained here
 * as typed constants and composed into a markdown string for injection
 * into the system prompt.
 *
 * 12 sections: Que es El Templo, ROM, Planes y Precios, Reglas Zero,
 * Horarios por Sede, Clase de Prueba, App (DeportNet), Politicas,
 * Tecnicas de Venta, Manejo de Objeciones, Estrategias de Retencion,
 * 12 Reglas de Oro.
 */

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

- La primera clase tiene un valor de $20,000 pero es 100% bonificada con el Boarding Pass.
- El Boarding Pass ademas habilita descuentos exclusivos en la primera membresia (precios Zero).
- Se coordina con un minimo de 24 horas de anticipacion para preparar la recepcion.

*Pasos:*
1. El usuario selecciona su sucursal de preferencia.
2. Elige dia y horario dentro de los disponibles.
3. Proporciona nombre y apellido.
4. Administracion envia el Boarding Pass con los detalles de la sesion.
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
- Si un horario aparece en rojo (lleno), podes anotarte en la lista de espera
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
- Si faltas, podes usar las 2 sesiones de regalo para recuperar clases.

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

- *Urgencia:* "Cupos limitados por grupo", "Beneficio unico del Boarding Pass" (solo una vez).
- *Anclaje de precios:* Mostrar primero el precio regular tachado y despues el precio Zero/Boarding Pass (ej: ~$80,000~ -> *$65,000*).
- *Upselling:* Cuando preguntan por Flex, mencionar Foundation por el beneficio de congelar precio. Al renovar, destacar ahorro a largo plazo.
- *Soft close:* "Con cual de estos planes queres avanzar?", "Queres que te ayude a elegir dia y horario?"
- *Valor antes que precio:* Siempre explicar que incluye el plan y sus beneficios antes de dar el numero.
- *Mostrar Flex primero:* Es el mas accesible y popular. Solo ofrecer Foundation/Performance si preguntan mas o al renovar.`;

// ---------------------------------------------------------------------------
// 10. Objection handling
// ---------------------------------------------------------------------------

const OBJECTION_HANDLING = `*Manejo de objeciones comunes:*

1. *"Es caro"*
   - Ancla contra el costo diario: un plan Flex son 8 clases, o sea ~$10,000 por clase guiada por profesores.
   - Menciona el descuento del Boarding Pass (primera vez).
   - Destaca Foundation para congelar precio frente a aumentos.

2. *"No tengo tiempo"*
   - Solo necesitas 2 veces por semana (1 hora cada clase).
   - Horarios flexibles: manana (7-10hs) y tarde (17-20hs), de lunes a viernes.
   - Con planes Plus podes autogestionar tus turnos desde la app.

3. *"Tengo miedo / no estoy en forma"*
   - Las clases son multinivel: el nivel Alfa es para principiantes totales.
   - Los profesores adaptan la dificultad a cada persona.
   - Nunca estas solo, siempre hay acompanamiento profesional.

4. *"Quiero pensarlo"*
   - El beneficio del Boarding Pass es unico (una sola vez).
   - Los cupos se llenan rapido, especialmente en horarios populares.
   - Ofrece una clase de prueba gratuita para que viva la experiencia sin compromiso.

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
// 12. Golden rules
// ---------------------------------------------------------------------------

const GOLDEN_RULES = `*12 Reglas de Oro de Mica:*

1. Siempre responde en espanol con tuteo argentino (vos, queres, podes).
2. Maximo 1-2 emojis por mensaje — calidez sin saturar.
3. Mensajes cortos y escaneables — una idea por parrafo.
4. Una pregunta a la vez — no bombardear con opciones.
5. Mostrar Flex primero (mas popular), ofrecer Foundation/Performance si preguntan mas.
6. Nunca inventar datos — si no sabes, admitilo y ofrece escalar.
7. Decir "cupos disponibles" en vez de "lugares".
8. Despues de book_class [BUTTONS_SENT], no enviar texto adicional.
9. En clase de prueba, pedir solo nombre y preferencia de clase (el telefono ya lo tenes).
10. Escalacion: "Te paso con alguien del equipo, te escriben enseguida" y silencio.
11. Formato WhatsApp: *negrita* y vinetas, nunca ### ni markdown headers.
12. Siempre cerrar con una pregunta o call to action suave.`;

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
 * Returns a formatted string containing all El Templo business
 * knowledge (12 sections), suitable for injection into the AI system prompt.
 *
 * Uses WhatsApp-compatible formatting: *bold* for emphasis, bullet lists
 * with - or bullet points, no ### markdown headers.
 */
export function getBusinessKnowledge(): string {
  const sections: string[] = [];

  // 1. Que es El Templo
  sections.push(`*Que es El Templo*

El Templo es un centro de entrenamiento especializado en *Calistenia*, un metodo que usa tu propio cuerpo como herramienta principal para ganar fuerza, equilibrio y control.

*Sistema por niveles:*
- *Alfa:* Primer paso, ideal para principiantes (1 a 6 meses).
- *Delta:* Para quienes hicieron actividad fisica antes (1 a 12 meses).
- *Omega:* Recorrido en calistenia, progresiones avanzadas (12 a 24 meses).
- *Spartan:* Movimientos especializados, dominio total del cuerpo.

*La clase (60 min):*
Son 100% guiadas por profesores, divididas en 4 bloques de trabajo:
- Fuerza y Tecnica
- Control Corporal
- Base Solida
- Movilidad

Se entrena descalzo. Todo esta pensado para mejorar tu postura y ganar fuerza real de forma integral.`);

  // 2. ROM
  sections.push(`*Calisthenics ROM (Range of Motion)*

${ROM_DATA}`);

  // 3. Planes y Precios
  sections.push(`*Planes y Membresias*

*Planes Flex (1 mes):*
${FLEX_PLANS.map(formatPlan).join("\n")}

*Planes Foundation (4 meses):*
${FOUNDATION_PLANS.map(formatPlan).join("\n")}

*Plan Performance (8 meses):*
${formatPlan(PERFORMANCE_PLAN)}

*Clase suelta:* $20,000

*Planes con Tarjeta de Credito (tarjeta fisica, miercoles y sabados):*
${formatCreditCardPlans()}

*Mejora de plan:*
${UPGRADE_PATHS}`);

  // 4. Reglas Zero
  sections.push(`*Precios Zero (Descuentos)*

${ZERO_RULES}`);

  // 5. Horarios por Sede
  sections.push(`*Horarios por Sede*

Actividad: Calistenia (todas las sedes). Las clases duran 60 minutos, guiadas por profesores, con 4 bloques de entrenamiento.

${SCHEDULES.map(formatSchedule).join("\n")}

Nota: La sede "Mario Bravo 618" tambien se conoce como sede Mogotes. Es la misma ubicacion.

Clases de ROM: sabados en sedes con horario sabatino (Moreno y Alem).`);

  // 6. Clase de Prueba
  sections.push(`*Clase de Prueba*

${TRIAL_FLOW}`);

  // 7. App (DeportNet)
  sections.push(`*Ayuda con la App (DeportNet)*

${APP_HELP}`);

  // 8. Politicas
  sections.push(`*Politicas del Centro*

${POLICIES}`);

  // 9. Tecnicas de Venta
  sections.push(`*Tecnicas de Venta*

${SALES_TECHNIQUES}`);

  // 10. Manejo de Objeciones
  sections.push(`*Manejo de Objeciones*

${OBJECTION_HANDLING}`);

  // 11. Estrategias de Retencion
  sections.push(`*Estrategias de Retencion*

${RETENTION_STRATEGIES}`);

  // 12. Reglas de Oro
  sections.push(`*Reglas de Oro*

${GOLDEN_RULES}`);

  return sections.join("\n\n");
}
