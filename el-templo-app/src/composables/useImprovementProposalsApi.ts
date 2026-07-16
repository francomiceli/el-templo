import { api } from 'src/boot/axios'
import { Preferences } from '@capacitor/preferences'
import { createLogger } from 'src/utils/logger'

const log = createLogger('useImprovementProposalsApi')

/**
 * Cadencia de re-prompt del popup de propuestas: si el socio no envió nada,
 * el popup vuelve a aparecer recién pasados 7 días de la última vez.
 */
const REPROMPT_MS = 7 * 24 * 60 * 60 * 1000

export interface ProposalPromptStatus {
  shouldPrompt: boolean
  campaign: number
}

/**
 * Evaluación compartida "¿corresponde mostrar el popup de propuestas en esta
 * apertura?". Cacheada a nivel módulo para que ImprovementPromptDialog y
 * RatingPromptDialog (que le cede la apertura) consulten UNA sola vez por
 * apertura, sin depender del orden de montaje ni duplicar el fetch.
 */
let evaluation: Promise<ProposalPromptStatus | null> | null = null

export function evaluateProposalPrompt(): Promise<ProposalPromptStatus | null> {
  if (!evaluation) evaluation = computePromptEligibility()
  return evaluation
}

/**
 * Guard para RatingPromptDialog: la puntuación cede la apertura cuando el
 * popup de propuestas va a mostrarse (un solo popup automático por apertura;
 * la puntuación pendiente sigue vigente para la próxima).
 */
export async function proposalPromptWillShow(): Promise<boolean> {
  try {
    return (await evaluateProposalPrompt()) !== null
  } catch {
    return false
  }
}

/** Reset al desloguear: la próxima sesión evalúa de cero. */
export function resetProposalPromptEvaluation(): void {
  evaluation = null
}

function lastShownKey(campaign: number): string {
  return `mejoras_prompt_last_shown_c${campaign}`
}

/** Marca "mostrado ahora" para la cadencia de 7 días del re-prompt. */
export async function markProposalPromptShown(campaign: number): Promise<void> {
  await Preferences.set({ key: lastShownKey(campaign), value: String(Date.now()) })
}

async function computePromptEligibility(): Promise<ProposalPromptStatus | null> {
  try {
    const { data } = await api.get<ProposalPromptStatus>(
      '/members/improvement-proposals/prompt-status',
    )
    if (!data.shouldPrompt) return null

    const { value } = await Preferences.get({ key: lastShownKey(data.campaign) })
    if (value && Date.now() - Number(value) < REPROMPT_MS) return null

    return data
  } catch (err: unknown) {
    // No cachear el fallo: la próxima apertura reintenta.
    evaluation = null
    log.warn('Failed to evaluate proposal prompt eligibility', {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

export function useImprovementProposalsApi() {
  async function submitProposal(proposal: string): Promise<void> {
    await api.post('/members/improvement-proposals', { proposal })
  }

  function cleanup() {
    // No subscriptions or timers to clean up
  }

  return { submitProposal, cleanup }
}
