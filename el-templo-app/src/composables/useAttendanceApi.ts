import { api } from 'src/boot/axios'

export interface AttendanceRecord {
  id: number
  memberId: number
  memberName: string
  branchId: number
  branchName: string
  checkedInAt: string
  confirmedAt: string | null
  status: 'registrado' | 'confirmado'
  source: 'qr' | 'manual'
}

interface AttendanceHistoryResponse {
  data: AttendanceRecord[]
  total: number
}

export function useAttendanceApi() {
  async function checkIn(qrToken: string): Promise<AttendanceRecord> {
    const response = await api.post<AttendanceRecord>('/members/attendance/check-in', {
      qrToken,
    })
    return response.data
  }

  async function getHistory(page: number, limit: number): Promise<AttendanceHistoryResponse> {
    const response = await api.get<AttendanceHistoryResponse>('/members/attendance/history', {
      params: { page, limit },
    })
    return response.data
  }

  function cleanup() {
    // No subscriptions or timers to clean up
  }

  return { checkIn, getHistory, cleanup }
}
