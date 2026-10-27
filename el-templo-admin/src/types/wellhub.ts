/**
 * Fase 204: tipos de la card "Wellhub" de la ficha, del acceso a la app, de la
 * unión de fichas y del reporte Wellhub. Espejan los schemas del API
 * (GET /admin/members/:userId/wellhub, POST /admin/members/:userId/app-access,
 * POST /admin/members/:userId/wellhub-merge, GET /admin/reports/wellhub).
 */

export interface WellhubBookingItem {
  bookingId: number;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm(:ss) */
  startTime: string;
  activityName: string;
  branchName: string;
}

export interface WellhubRecentBookingItem extends WellhubBookingItem {
  /** reservado | confirmado | no_show | cancelado (otros valores se muestran crudos). */
  status: string;
}

export interface WellhubCard {
  gympassId: string;
  linkedSince: string | null;
  lastVisitDate: string | null;
  visitsThisMonth: number;
  visitsTotal: number;
  manualVisitsTotal: number;
  branchesVisited: string[];
  nextWellhubBooking: WellhubBookingItem | null;
  recentWellhubBookings: WellhubRecentBookingItem[];
  showLabel: boolean;
  canConvert: boolean;
  canMerge: boolean;
  hasLoggedIn: boolean;
}

export interface WellhubAppAccessResult {
  ok: boolean;
  emailSent: boolean;
}

export interface WellhubMergeResult {
  ok: boolean;
  targetUserId: number;
  moved: {
    bookings: number;
    attendance: number;
    wellhubBookings: number;
    notes: number;
  };
}

export type WellhubPersonKind = 'nuevo' | 'ex_alumno' | 'socio';

export interface WellhubReportPerson {
  userId: number;
  name: string;
  kind: WellhubPersonKind;
  validatedVisits: number;
  manualVisits: number;
}

export interface WellhubReportConversion {
  userId: number;
  name: string;
  /** nuevo | ex_alumno | otro */
  kind: string;
  planName: string;
  localDate: string;
  branchName: string;
}

export interface WellhubReport {
  /** YYYY-MM */
  month: string;
  branchId: number | null;
  validatedVisits: number;
  manualVisits: number;
  people: {
    unique: number;
    nuevos: number;
    exAlumnos: number;
    socios: number;
    visitsPerPerson: number;
  };
  peopleList: WellhubReportPerson[];
  bookings: {
    confirmed: number;
    canceled: number;
    lateCanceled: number;
    rejected: number;
    noShows: number;
  };
  conversions: {
    count: number;
    ratePct: number;
    items: WellhubReportConversion[];
  };
}

export interface WellhubReportParams {
  /** YYYY-MM */
  month: string;
  branchId?: number;
}
