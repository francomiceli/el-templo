import type { QVueGlobals } from 'quasar';

/**
 * Qué pasó con una Sesión de Prueba pendiente al cargarle la membresía al
 * alumno (API: subscriptions/trial-bookings-on-assign.ts). Llega en la
 * respuesta de "Asignar plan" y del alta desde Cobros. Una SP 'converted'
 * deja de contar como prueba en los reportes (el rastro queda en audit_log).
 */
export interface TrialBookingChange {
  bookingId: number;
  date: string;
  startTime: string;
  activityName: string;
  branchName: string;
  outcome: 'converted' | 'cancelled' | 'kept';
  reason: string | null;
}

const OUTCOME_TEXT: Record<TrialBookingChange['outcome'], string> = {
  converted: 'pasó a ser una reserva de su plan',
  cancelled: 'se canceló',
  kept: 'sigue como Sesión de Prueba',
};

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** "vie 02/10" — mediodía local para evitar drift de huso en "YYYY-MM-DD". */
function formatDay(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  const weekday = d.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '');
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${weekday} ${day}/${month}`;
}

/** Una línea por SP: "vie 02/10 10:00 · General · Alberti: se canceló (motivo)". */
export function describeTrialBookingChange(c: TrialBookingChange): string {
  const when = `${formatDay(c.date)} ${c.startTime.slice(0, 5)}`;
  const reason = c.reason ? ` ${c.reason}` : '';
  return `${when} · ${c.activityName} · ${c.branchName}: ${OUTCOME_TEXT[c.outcome]}.${reason}`;
}

/**
 * Avisa a gestión (dialog, hay que cerrarlo) si el alumno tenía Sesiones de
 * Prueba pendientes al cargarle la membresía. No-op si no había ninguna.
 */
export function showTrialBookingChanges(
  $q: QVueGlobals,
  changes: readonly TrialBookingChange[] | undefined
): void {
  if (!changes || changes.length === 0) return;
  const items = changes
    .map((c) => `<li>${escapeHtml(describeTrialBookingChange(c))}</li>`)
    .join('');
  $q.dialog({
    title: 'Tenía una Sesión de Prueba agendada',
    message:
      'Este alumno tenía una Sesión de Prueba pendiente cuando le cargaste la membresía:' +
      `<ul class="q-pl-md q-my-sm">${items}</ul>` +
      'Si hace falta, avisale al alumno.',
    html: true,
    ok: { label: 'Entendido', color: 'primary', flat: true },
    persistent: true,
  });
}
