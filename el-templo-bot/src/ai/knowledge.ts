/**
 * Structured business knowledge data for El Templo WhatsApp Bot.
 *
 * All pricing, schedules, rules, and procedures are maintained here
 * as typed constants and composed into a markdown string for injection
 * into the system prompt.
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
 * Returns a formatted markdown string containing all El Templo business
 * knowledge, suitable for injection into the AI system prompt.
 */
export function getBusinessKnowledge(): string {
  const sections: string[] = [];

  // 1. Pricing
  sections.push(`### Precios y Membresias

*Planes Flex (1 mes):*
${FLEX_PLANS.map(formatPlan).join("\n")}

*Planes Foundation (4 meses):*
${FOUNDATION_PLANS.map(formatPlan).join("\n")}

*Plan Performance (8 meses):*
${formatPlan(PERFORMANCE_PLAN)}

*Planes con Tarjeta de Credito (tarjeta fisica, miercoles y sabados):*
${formatCreditCardPlans()}`);

  // 2. Zero rules
  sections.push(`### Precios Zero (Descuentos)

${ZERO_RULES}`);

  // 3. Schedules
  sections.push(`### Horarios por Sede

Actividad: Calistenia (todas las sedes). Las clases duran 60 minutos, guiadas por profesores, con 4 bloques de entrenamiento.

${SCHEDULES.map(formatSchedule).join("\n")}

Clases de ROM: sabados en sedes con horario sabatino (Moreno y Alem).`);

  // 4. ROM
  sections.push(`### Calisthenics ROM (Range of Motion)

${ROM_DATA}`);

  // 5. Trial flow
  sections.push(`### Clase de Prueba

${TRIAL_FLOW}`);

  // 6. App help
  sections.push(`### Ayuda con la App

${APP_HELP}`);

  // 7. Upgrade paths
  sections.push(`### Mejora de Plan

${UPGRADE_PATHS}`);

  return sections.join("\n\n");
}
