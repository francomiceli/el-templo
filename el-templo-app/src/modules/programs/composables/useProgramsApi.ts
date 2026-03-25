import { api } from 'src/boot/axios'
import { createLogger } from 'src/utils/logger'
import type { MemberProgramCatalogItem, MemberEnrollmentProgress } from '../types'

export function useProgramsApi() {
  const log = createLogger('useProgramsApi')

  async function getCatalog(): Promise<MemberProgramCatalogItem[]> {
    try {
      const response = await api.get<{ programs: MemberProgramCatalogItem[] }>(
        '/members/programs/catalog',
      )
      return response.data.programs
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error('Failed to fetch program catalog', { error: message })
      throw err
    }
  }

  async function getMyProgress(): Promise<MemberEnrollmentProgress | null> {
    try {
      const response = await api.get('/members/programs/my-progress')
      if (response.status === 204 || !response.data) return null
      return response.data as MemberEnrollmentProgress
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error('Failed to fetch program progress', { error: message })
      throw err
    }
  }

  return { getCatalog, getMyProgress }
}
