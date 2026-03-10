/**
 * Scheduling API composable for member-facing endpoints.
 * Follows useAttendanceApi pattern with cleanup() method.
 */

import { api } from 'src/boot/axios'
import type { WeeklySlotView, BookingRecord, HolidayRecord } from 'src/types/scheduling'

interface WeeklyGridResponse {
  slots: WeeklySlotView[]
  holidays: HolidayRecord[]
  myBookings: BookingRecord[]
}

interface MyBookingsResponse {
  bookings: BookingRecord[]
}

export function useSchedulingApi() {
  let abortController: AbortController | null = null

  function getSignal(): AbortSignal {
    abortController = new AbortController()
    return abortController.signal
  }

  async function getWeeklyGrid(weekStart: string): Promise<WeeklyGridResponse> {
    const response = await api.get<WeeklyGridResponse>('/members/scheduling/weekly', {
      params: { weekStart },
      signal: getSignal(),
    })
    return response.data
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

  function cleanup() {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
  }

  return { getWeeklyGrid, reserve, cancelBooking, getMyBookings, cleanup }
}
