import { api } from 'src/boot/axios'

/**
 * Fase 193 (D-06/D-07/D-09): la decisión "corresponde mostrar el popup de
 * propuestas en esta apertura" pasó al servidor (`GET
 * /communications/me/prompt` vía `useAvisosStore`) — este composable queda
 * SOLO para el envío de la sugerencia, que no cambió.
 */
export function useImprovementProposalsApi() {
  async function submitProposal(proposal: string): Promise<void> {
    await api.post('/members/improvement-proposals', { proposal })
  }

  function cleanup() {
    // No subscriptions or timers to clean up
  }

  return { submitProposal, cleanup }
}
