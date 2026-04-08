import type { GoalPlanType, GoalPlanMetadata, GoalPlanTier } from "./types";

/**
 * Maps goal plan type to allowed exercise route codes.
 *
 * Source: route codes from el-templo-api/src/db/seed-spom.ts
 * and zone groupings from el-templo-api/src/modules/sessions/pipeline/utils/mobility-routes.ts
 *
 * 100% zone bias: goal plan sessions only use exercises from these routes.
 * Cross-route selection is disabled for goal plan sessions.
 */
export const GOAL_PLAN_ROUTE_MAP: Record<GoalPlanType, string[]> = {
  // Principiante tier
  tren_superior: [
    "HS",
    "HSPU",
    "PHS",
    "OAPU",
    "PLPU", // Upper push
    "MU",
    "OAP",
    "OAR",
    "BL", // Upper pull
    "HD/ID",
    "MN/RP", // Handstand/core (upper-body-adjacent)
    "FL",
    "FLR", // Front lever progressions
    "TTB", // Core
  ],
  tren_inferior: [
    "SU",
    "SS",
    "PS",
    "QC", // Lower knee-dominant
    "DS", // Lower hip-dominant
    "NC",
    "HT", // Core/posterior chain
  ],

  // Intermedio tier
  gluteos: [
    "SU",
    "PS", // Squat/pistol patterns
    "DS", // Hip-dominant
    "NC",
    "HT", // Posterior chain
    "L", // Core/compression
  ],
  cuadriceps: [
    "SS",
    "QC", // Knee-dominant
    "PS", // Pistol squats
    "L", // Core/compression
  ],
  empuje: [
    "HS",
    "HSPU",
    "PHS",
    "OAPU",
    "PLPU", // Push patterns
    "PL", // Planche progressions
    "BL", // Back lever
  ],
  traccion: [
    "MU",
    "OAP",
    "OAR", // Pull patterns
    "MN/RP", // Core/midline
    "FL",
    "FLR", // Front lever progressions
    "TTB", // Core
  ],

  // Avanzado tier
  planche: ["PL", "PLPU", "OAPU", "PHS"], // Planche + complementary push
  front_lever: ["FL", "FLR", "OAR"], // Front lever + horizontal pull

  // Principiante tier — Full Body (all routes)
  full_body: [
    "HS",
    "HSPU",
    "PHS",
    "OAPU",
    "PLPU",
    "MU",
    "OAP",
    "OAR",
    "BL",
    "HD/ID",
    "MN/RP",
    "FL",
    "FLR",
    "TTB",
    "SU",
    "SS",
    "PS",
    "QC",
    "DS",
    "NC",
    "HT",
    "L",
    "PL",
    "HR",
  ],
};

export const ALL_GOAL_PLAN_TYPES: GoalPlanType[] = [
  "tren_superior",
  "tren_inferior",
  "gluteos",
  "cuadriceps",
  "empuje",
  "traccion",
  "planche",
  "front_lever",
  "full_body",
];

export const GOAL_PLAN_TIER_MAP: Record<GoalPlanType, GoalPlanTier> = {
  tren_superior: "principiante",
  tren_inferior: "principiante",
  gluteos: "intermedio",
  cuadriceps: "intermedio",
  empuje: "intermedio",
  traccion: "intermedio",
  planche: "avanzado",
  front_lever: "avanzado",
  full_body: "principiante",
};

/**
 * Static metadata for goal plan display.
 * Hardcoded per user decision (not coach-managed).
 * Spanish text for UI display.
 */
export const GOAL_PLAN_METADATA: GoalPlanMetadata[] = [
  {
    type: "tren_superior",
    name: "Tren Superior",
    tier: "principiante",
    description:
      "Enfocado en el desarrollo integral del tren superior: empuje, traccion, equilibrio y control. Ideal para construir una base solida de fuerza en hombros, brazos, espalda y pecho.",
    zones: ["Hombros", "Brazos", "Espalda", "Pecho"],
    idealFor:
      "Atletas que buscan fortalecer toda la parte superior del cuerpo de manera equilibrada.",
  },
  {
    type: "tren_inferior",
    name: "Tren Inferior",
    tier: "principiante",
    description:
      "Enfocado en piernas y caderas: sentadillas, zancadas, peso muerto y movilidad de cadera. Desarrolla fuerza funcional y estabilidad en todo el tren inferior.",
    zones: ["Piernas", "Caderas", "Gluteos"],
    idealFor:
      "Atletas que quieren desarrollar fuerza y estabilidad en piernas.",
  },
  {
    type: "gluteos",
    name: "Gluteos",
    tier: "intermedio",
    description:
      "Especializado en el desarrollo de gluteos y cadena posterior: peso muerto, sentadillas profundas, hip thrusts y nordic curls. Requiere base previa en tren inferior.",
    zones: ["Gluteos", "Caderas", "Isquiotibiales"],
    idealFor:
      "Atletas con base en tren inferior que buscan desarrollo especifico de gluteos y cadena posterior.",
  },
  {
    type: "cuadriceps",
    name: "Cuadriceps",
    tier: "intermedio",
    description:
      "Especializado en fuerza de cuadriceps y rodilla: sentadillas a una pierna, sissy squats, pistol squats y zancadas. Requiere base previa en tren inferior.",
    zones: ["Cuadriceps", "Rodillas", "Piernas"],
    idealFor:
      "Atletas con base en tren inferior que buscan fuerza especifica en cuadriceps y estabilidad de rodilla.",
  },
  {
    type: "empuje",
    name: "Empuje",
    tier: "intermedio",
    description:
      "Especializado en movimientos de empuje: handstand, flexiones avanzadas, dips y planche progressions. Requiere base previa en tren superior.",
    zones: ["Hombros", "Pecho", "Triceps"],
    idealFor:
      "Atletas con base en tren superior que quieren especializarse en fuerza de empuje.",
  },
  {
    type: "traccion",
    name: "Traccion",
    tier: "intermedio",
    description:
      "Especializado en movimientos de traccion: muscle-ups, dominadas con peso, front lever progressions y remos avanzados.",
    zones: ["Espalda", "Biceps", "Dorsales"],
    idealFor:
      "Atletas con base en tren superior que quieren especializarse en fuerza de traccion.",
  },
  {
    type: "planche",
    name: "Planche",
    tier: "avanzado",
    description:
      "Ruta avanzada exclusivamente enfocada en el planche y sus progresiones. Incluye ejercicios especificos de planche press, lean y hold en todas sus variantes.",
    zones: ["Hombros", "Core", "Munecas"],
    idealFor:
      "Atletas avanzados con objetivo tecnico claro en planche. Requiere base solida en empuje.",
  },
  {
    type: "front_lever",
    name: "Front Lever",
    tier: "avanzado",
    description:
      "Ruta avanzada exclusivamente enfocada en el front lever y sus progresiones. Trabajo especifico de front lever raise, hold y variantes de traccion horizontal.",
    zones: ["Espalda", "Core", "Dorsales"],
    idealFor:
      "Atletas avanzados con objetivo tecnico claro en front lever. Requiere base solida en traccion.",
  },
  {
    type: "full_body",
    name: "Full Body",
    tier: "principiante",
    description:
      "Entrenamiento integral de cuerpo completo utilizando todas las rutas disponibles. Ideal para calistenia en casa sin equipamiento. Combina empuje, traccion, piernas y core en cada sesion.",
    zones: ["Tren Superior", "Tren Inferior", "Core", "Caderas"],
    idealFor:
      "Principiantes que buscan un entrenamiento completo de calistenia en casa sin necesidad de equipamiento.",
  },
];
