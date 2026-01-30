/**
 * Format explanations for training protocols
 *
 * Provides user-friendly names and descriptions for workout formats
 * used in the session player's info icon.
 */

export interface FormatExplanation {
  /** Display name of the format */
  name: string;
  /** Description of how to execute the format */
  description: string;
}

/**
 * Mapping of format codes to their explanations
 */
export const FORMAT_EXPLANATIONS: Record<string, FormatExplanation> = {
  EMOM: {
    name: 'EMOM (Every Minute On the Minute)',
    description: 'Realiza los ejercicios al inicio de cada minuto. El tiempo restante es tu descanso.',
  },
  AMRAP: {
    name: 'AMRAP (As Many Rounds As Possible)',
    description: 'Completa tantas rondas como puedas en el tiempo establecido.',
  },
  FOR_TIME: {
    name: 'For Time',
    description: 'Completa todos los ejercicios lo mas rapido posible con buena tecnica.',
  },
  TABATA: {
    name: 'Tabata',
    description: '20 segundos de trabajo, 10 segundos de descanso. Repite 8 veces.',
  },
  HIIT: {
    name: 'HIIT (High Intensity Interval Training)',
    description: 'Intervalos de alta intensidad seguidos de descanso breve.',
  },
  STRAIGHT_SETS: {
    name: 'Series',
    description: 'Realiza las series y repeticiones indicadas con descanso entre series.',
  },
  COMPLEX: {
    name: 'Complejo',
    description: 'Ejecuta los ejercicios de forma consecutiva sin soltar el peso.',
  },
  LADDER: {
    name: 'Escalera',
    description: 'Las repeticiones aumentan o disminuyen en cada serie.',
  },
  FLOW: {
    name: 'Flow',
    description: 'Movimiento continuo conectando las posiciones de forma fluida.',
  },
};

/**
 * Get format explanation for a given format string
 *
 * @param format - The format code (e.g., "EMOM", "emom", "Tabata")
 * @returns FormatExplanation object or null if not found
 */
export function getFormatExplanation(format: string | undefined | null): FormatExplanation | null {
  if (!format) return null;

  // Normalize format string: uppercase, replace non-alphanumeric with underscore
  const key = format.toUpperCase().replace(/[^A-Z0-9]/g, '_');

  return FORMAT_EXPLANATIONS[key] || null;
}
