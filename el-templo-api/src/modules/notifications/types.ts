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
  route: string;
}

export const TEMPLATE_SEEDS: TemplateSeed[] = [
  {
    templateKey: "segment_transition_en_riesgo",
    category: "motivacion",
    title: "Te extrañamos",
    body: "Hace un tiempo que no entrenas — tu cuerpo te espera. ¡Volvé a entrenar!",
    route: "/mi-templo",
  },
  {
    templateKey: "segment_transition_ghost",
    category: "motivacion",
    title: "Tu cuerpo te espera",
    body: "Sabemos que la vida pasa, pero tu progreso sigue esperándote. ¡Dale una oportunidad!",
    route: "/mi-templo",
  },
  {
    templateKey: "segment_transition_recovery",
    category: "motivacion",
    title: "¡Bienvenido de vuelta!",
    body: "Nos alegra verte de nuevo. Seguí así, cada sesión cuenta.",
    route: "/mi-templo",
  },
  {
    templateKey: "segment_transition_espartano",
    category: "motivacion",
    title: "¡Semana increíble!",
    body: "Tu constancia es inspiradora — seguí así, guerrero.",
    route: "/mi-templo",
  },
  {
    templateKey: "ghost_monthly_reattempt",
    category: "motivacion",
    title: "Te seguimos esperando",
    body: "Hace mucho que no nos vemos. ¿Qué tal una sesión esta semana?",
    route: "/mi-templo",
  },
  {
    templateKey: "morning_energy",
    category: "entrenamiento",
    title: "Buenos días, guerrero",
    body: "¿Cómo te sentís hoy? Registrá tu energía para personalizar tu día.",
    route: "/mi-templo",
  },
  {
    templateKey: "post_session_soreness",
    category: "entrenamiento",
    title: "¿Cómo quedaste?",
    body: "Registrá cómo se siente tu cuerpo después del entrenamiento.",
    route: "/mi-templo",
  },
  {
    templateKey: "weekly_summary",
    category: "entrenamiento",
    title: "Tu resumen semanal",
    body: "Mirá todo lo que lograste esta semana. ¡Seguí así!",
    route: "/mi-templo",
  },
  {
    templateKey: "program_enrollment",
    category: "programas",
    title: "¡Programa activado!",
    body: "Tu programa fue activado. Entrá para ver tu plan semanal.",
    route: "/mi-camino",
  },
  {
    templateKey: "program_week_unlock",
    category: "programas",
    title: "Nueva semana desbloqueada",
    body: "Avanzaste a una nueva semana en tu programa. ¡A por ella!",
    route: "/mi-camino",
  },
  {
    templateKey: "program_renewal_warning",
    category: "programas",
    title: "Tu programa está por vencer",
    body: "Te quedan 7 días de programa. Hablá con tu coach para renovar.",
    route: "/mi-camino",
  },
];
