import axios from 'axios'
import { api } from 'src/boot/axios'
import { createLogger } from 'src/utils/logger'
import { isExpectedClientError } from 'src/utils/extract-error'
import type { MemberProgramCatalogItem, MemberEnrollmentProgress } from '../types'

export function useProgramsApi() {
  const log = createLogger('useProgramsApi')

  function logFetchFailure(scope: string, err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const status = axios.isAxiosError(err) ? err.response?.status : undefined
    const data = { error: message, status }
    if (isExpectedClientError(err)) {
      log.warn(`Failed to fetch ${scope}`, data)
    } else {
      log.error(`Failed to fetch ${scope}`, data)
    }
  }

  async function getCatalog(): Promise<MemberProgramCatalogItem[]> {
    try {
      const response = await api.get<{ programs: MemberProgramCatalogItem[] }>(
        '/members/programs/catalog',
      )
      return response.data.programs
    } catch (err: unknown) {
      logFetchFailure('program catalog', err)
      throw err
    }
  }

  async function getMyProgress(): Promise<MemberEnrollmentProgress | null> {
    try {
      const response = await api.get('/members/programs/my-progress')
      if (response.status === 204 || !response.data) return null
      return response.data as MemberEnrollmentProgress
    } catch (err: unknown) {
      logFetchFailure('program progress', err)
      throw err
    }
  }

  return { getCatalog, getMyProgress }
}
