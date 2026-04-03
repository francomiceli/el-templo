// ── Notification Types ──────────────────────────────────────────────────────

export type NotificationCategory =
  | "entrenamiento"
  | "programas"
  | "motivacion"
  | "anuncios";

export type NotificationStatus = "pending" | "sent" | "failed";

export type DevicePlatform = "android" | "ios";

export const NOTIFICATION_CATEGORIES = [
  "entrenamiento",
  "programas",
  "motivacion",
  "anuncios",
] as const;

// ── Service Inputs ──────────────────────────────────────────────────────────

export interface QueueNotificationInput {
  userId: number;
  templateKey: string;
  scheduledAt?: Date;
  titleOverride?: string;
  bodyOverride?: string;
  routeOverride?: string;
}

export interface QueueAdHocInput {
  userId: number;
  title: string;
  body: string;
  category: NotificationCategory;
  route?: string;
  scheduledAt?: Date;
}

// ── Segment Transition Types ────────────────────────────────────────────────

export interface SegmentTransition {
  userId: number;
  oldSegment: string | null;
  newSegment: string;
}

/**
 * Maps segment transition patterns to notification template keys.
 * Transition key format: `{from}_to_{to}` or `any_to_{to}` for catch-all.
 */
export const SEGMENT_TRANSITION_TEMPLATES: Record<string, string> = {
  any_to_en_riesgo: "segment_transition_en_riesgo",
  en_riesgo_to_ghost: "segment_transition_ghost",
  recovery_to_active: "segment_transition_recovery",
  any_to_espartano: "segment_transition_espartano",
};

// ── Template Seed Data ──────────────────────────────────────────────────────

export interface TemplateSeed {
  templateKey: string;
  category: NotificationCategory;
  title: string;
  body: string;
  titleFemale: string;
  bodyFemale: string;
  route: string;
}

export const TEMPLATE_SEEDS: TemplateSeed[] = [
  {
    templateKey: "segment_transition_en_riesgo",
    category: "motivacion",
    title: "Tu práctica te espera",
    body: "Hace un tiempo que no entrenás. Tu cuerpo sigue listo.",
    titleFemale: "Tu práctica te espera",
    bodyFemale: "Hace un tiempo que no entrenás. Tu cuerpo sigue listo.",
    route: "/mi-templo",
  },
  {
    templateKey: "segment_transition_ghost",
    category: "motivacion",
    title: "El Templo no cierra",
    body: "Tu cuerpo sigue siendo tu templo. El único paso que falta es el primero.",
    titleFemale: "El Templo no cierra",
    bodyFemale:
      "Tu cuerpo sigue siendo tu templo. El único paso que falta es el primero.",
    route: "/mi-templo",
  },
  {
    templateKey: "segment_transition_recovery",
    category: "motivacion",
    title: "¡Bienvenido de vuelta!",
    body: "Volver es más difícil que seguir. Por eso vale más.",
    titleFemale: "¡Bienvenida de vuelta!",
    bodyFemale: "Volver es más difícil que seguir. Por eso vale más.",
    route: "/mi-templo",
  },
  {
    templateKey: "segment_transition_espartano",
    category: "motivacion",
    title: "¡Semana increíble!",
    body: "No necesitás aplausos. Tu cuerpo ya sabe.",
    titleFemale: "¡Semana increíble!",
    bodyFemale: "No necesitás aplausos. Tu cuerpo ya sabe.",
    route: "/mi-templo",
  },
  {
    templateKey: "ghost_monthly_reattempt",
    category: "motivacion",
    title: "Sin prisa, sin pausa",
    body: "No es un camino largo. Es un día. Hoy.",
    titleFemale: "Sin prisa, sin pausa",
    bodyFemale: "No es un camino largo. Es un día. Hoy.",
    route: "/mi-templo",
  },
  {
    templateKey: "morning_energy",
    category: "entrenamiento",
    title: "¿Cómo arrancás hoy?",
    body: "Registrá tu energía antes de entrenar. Tu cuerpo tiene algo para decirte.",
    titleFemale: "¿Cómo arrancás hoy?",
    bodyFemale:
      "Registra tu energia antes de entrenar. Tu cuerpo tiene algo para decirte.",
    route: "/mi-templo",
  },
  {
    templateKey: "post_session_soreness",
    category: "entrenamiento",
    title: "Tu cuerpo habla",
    body: "Registrá cómo te sentís después de la sesión.",
    titleFemale: "Tu cuerpo habla",
    bodyFemale: "Registra como te sentis despues de la sesion.",
    route: "/mi-templo",
  },
  {
    templateKey: "weekly_summary",
    category: "entrenamiento",
    title: "Tu resumen semanal",
    body: "Mirá lo que tu constancia construyó esta semana.",
    titleFemale: "Tu resumen semanal",
    bodyFemale: "Mira lo que tu constancia construyo esta semana.",
    route: "/mi-templo",
  },
  {
    templateKey: "program_enrollment",
    category: "programas",
    title: "¡Programa activado!",
    body: "Tu programa fue activado. Entrá para ver tu plan semanal.",
    titleFemale: "¡Programa activado!",
    bodyFemale:
      "Tu programa fue activado. Entra para ver tu plan semanal.",
    route: "/mi-camino",
  },
  {
    templateKey: "program_week_unlock",
    category: "programas",
    title: "Nueva semana desbloqueada",
    body: "Avanzaste a una nueva semana en tu programa. ¡A por ella!",
    titleFemale: "Nueva semana desbloqueada",
    bodyFemale:
      "Avanzaste a una nueva semana en tu programa. A por ella!",
    route: "/mi-camino",
  },
  {
    templateKey: "program_renewal_warning",
    category: "programas",
    title: "Tu programa está por vencer",
    body: "Te quedan 7 días de programa. Hablá con tu coach para renovar.",
    titleFemale: "Tu programa está por vencer",
    bodyFemale:
      "Te quedan 7 dias de programa. Habla con tu coach para renovar.",
    route: "/mi-camino",
  },
];
