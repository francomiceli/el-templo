import type {
  GoalPlanType,
  GoalPlanMetadata,
  GoalPlanTier,
} from "./types";

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
    // "HR" excluded — only has exercises up to sigma level, fails for omega generation
    "HD/ID",
    "MN/RP", // Handstand/core (upper-body-adjacent)
  ],
  tren_inferior: [
    "SU",
    "SS",
    "PS",
    "QC", // Lower knee-dominant
    "DS", // Lower hip-dominant
  ],

  // Intermedio tier
  empuje: [
    "HS",
    "HSPU",
    "PHS",
    "OAPU",
    "PLPU", // Push patterns
  ],
  traccion: [
    "MU",
    "OAP",
    "OAR",
    "BL", // Pull patterns
  ],

  // Avanzado tier
  planche: ["PL", "PLPU"], // Planche-specific
  front_lever: ["FL", "FLR"], // Front lever-specific
};

export const GOAL_PLAN_DURATIONS = [20, 40, 60] as const;

export const ALL_GOAL_PLAN_TYPES: GoalPlanType[] = [
  "tren_superior",
  "tren_inferior",
  "empuje",
  "traccion",
  "planche",
  "front_lever",
];

export const GOAL_PLAN_TIER_MAP: Record<GoalPlanType, GoalPlanTier> = {
  tren_superior: "principiante",
  tren_inferior: "principiante",
  empuje: "intermedio",
  traccion: "intermedio",
  planche: "avanzado",
  front_lever: "avanzado",
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
];
