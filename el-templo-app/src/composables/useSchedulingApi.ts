/**
 * Scheduling API composable for member-facing endpoints.
 * Follows useAttendanceApi pattern with cleanup() method.
 */

import { api } from 'src/boot/axios'
import type {
  WeeklySlotView,
  BookingRecord,
  HolidayRecord,
  AttendanceWeekRecord,
} from 'src/types/scheduling'

interface WeeklyGridResponse {
  slots: WeeklySlotView[]
  holidays: HolidayRecord[]
  myBookings: BookingRecord[]
  myAttendance: AttendanceWeekRecord[]
  branchTimezone: string
}

interface MyBookingsResponse {
  bookings: BookingRecord[]
}

interface BranchOption {
  id: number
  name: string
}

/**
 * Partner free-week benefit eligibility (Phase 179, D-05/D-06/D-07). Mirrors
 * the trial-eligibility shape but is a discriminated union: `eligible:true`
 * carries the info needed for the pending-benefit banner, `eligible:false`
 * carries a `reason` the UI branches on (D-07: 'expirado' blocks reserving;
 * 'consumido'/'con_plan_activo' fall back to the normal grid). Shape frozen
 * by 179-08 (GET /members/scheduling/partner-benefit).
 */
export type PartnerBenefitEligibility =
  | { eligible: true; partnerName: string; expiresAt: string }
  | {
      eligible: false
      reason: 'sin_beneficio' | 'expirado' | 'consumido' | 'con_plan_activo'
    }

/** Response of POST /reserve-partner-week (201) — shape frozen by 179-08. */
export interface PartnerWeekActivation {
  subscriptionId: number
  bookingId: number
  endDate: string | null
  classesRemaining: number | null
}

/**
 * Trial eligibility for the freemium self-service reservation flow (Phase 119).
 * Authorization is server-side state only — the campaign email token is never
 * trusted here (D-21). Drives the 3 ReservasPage states (D-22):
 *   - eligible && !alreadyBooked → "modo reservar prueba"
 *   - alreadyBooked             → "prueba reservada" confirmation card
 *   - neither                   → existing muro
 */
export interface TrialEligibility {
  eligible: boolean
  alreadyBooked: boolean
  // True cuando el perfil del lead no tiene teléfono cargado: la app debe pedirlo
  // en el diálogo de confirmación de la reserva de prueba (D-05, backend Plan 01).
  phoneRequired: boolean
  booking?: {
    bookingId: number
    date: string
    startTime: string
    branchId: number
    branchName: string
    branchAddress: string | null
    // True while the class is still >24h away — show cancel/change affordances.
    canModify: boolean
  }
}

export function useSchedulingApi() {
  let abortController: AbortController | null = null

  function getSignal(): AbortSignal {
    abortController = new AbortController()
    return abortController.signal
  }

  async function getWeeklyGrid(weekStart: string, branchId?: number): Promise<WeeklyGridResponse> {
    const params: Record<string, unknown> = { weekStart }
    if (branchId) params.branchId = branchId
    const response = await api.get<WeeklyGridResponse>('/members/scheduling/weekly', {
      params,
      signal: getSignal(),
    })
    return response.data
  }

  async function getBranches(): Promise<BranchOption[]> {
    const response = await api.get<{ branches: BranchOption[] }>('/members/scheduling/branches', {
      signal: getSignal(),
    })
    return response.data.branches
  }

  async function reserve(scheduleId: number, date: string): Promise<BookingRecord> {
    const response = await api.post<BookingRecord>(
      '/members/scheduling/reserve',
      { scheduleId, date },
      { signal: getSignal() },
    )
    return response.data
  }

  async function cancelBooking(bookingId: number): Promise<BookingRecord> {
    const response = await api.delete<BookingRecord>(`/members/scheduling/bookings/${bookingId}`, {
      signal: getSignal(),
    })
    return response.data
  }

  async function getMyBookings(weekStart: string): Promise<MyBookingsResponse> {
    const response = await api.get<MyBookingsResponse>('/members/scheduling/my-bookings', {
      params: { weekStart },
      signal: getSignal(),
    })
    return response.data
  }

  async function getTrialEligibility(): Promise<TrialEligibility> {
    const response = await api.get<TrialEligibility>('/members/scheduling/trial-eligibility', {
      signal: getSignal(),
    })
    return response.data
  }

  async function reserveTrial(
    scheduleId: number,
    date: string,
    branchId: number,
    phone?: string,
  ): Promise<BookingRecord> {
    const response = await api.post<BookingRecord>(
      '/members/scheduling/reserve-trial',
      { scheduleId, date, branchId, ...(phone ? { phone } : {}) },
      { signal: getSignal() },
    )
    return response.data
  }

  async function cancelTrial(): Promise<{ cancelled: boolean }> {
    const response = await api.post<{ cancelled: boolean }>(
      '/members/scheduling/cancel-trial',
      {},
      { signal: getSignal() },
    )
    return response.data
  }

  async function getPartnerBenefit(): Promise<PartnerBenefitEligibility> {
    const response = await api.get<PartnerBenefitEligibility>(
      '/members/scheduling/partner-benefit',
      { signal: getSignal() },
    )
    return response.data
  }

  async function reservePartnerWeek(input: {
    scheduleId: number
    date: string
    branchId: number
  }): Promise<PartnerWeekActivation> {
    const response = await api.post<PartnerWeekActivation>(
      '/members/scheduling/reserve-partner-week',
      input,
      { signal: getSignal() },
    )
    return response.data
  }

  async function getBonusUsage(): Promise<BonusUsage> {
    const response = await api.get<BonusUsage>('/members/scheduling/bonus-usage', {
      signal: getSignal(),
    })
    return response.data
  }

  function cleanup() {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
  }

  return {
    getWeeklyGrid,
    reserve,
    cancelBooking,
    getMyBookings,
    getBranches,
    getBonusUsage,
    getTrialEligibility,
    reserveTrial,
    cancelTrial,
    getPartnerBenefit,
    reservePartnerWeek,
    cleanup,
  }
}

export interface BonusUsage {
  applicable: boolean
  used?: number
  limit?: number
  periodStart?: string
  periodEnd?: string
}
