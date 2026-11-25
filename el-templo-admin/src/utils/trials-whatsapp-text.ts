import type { TrialListBranchGroup } from 'src/types/scheduling';

/**
 * Texto de "Copiar para WhatsApp" en Sesiones de Prueba: horario y nombre por sede.
 * Sin teléfono (pedido de Franco, 2026-11-25): el mensaje se pega en grupos de WhatsApp
 * y el número de quien viene a probar no tiene que circular ahí.
 */
export function trialsWhatsappText(
  groups: TrialListBranchGroup[],
  dateLabel: string,
  shiftLabel: string
): string {
  const lines: string[] = [`*Sesiones de Prueba — ${dateLabel} (${shiftLabel})*`];
  for (const group of groups) {
    lines.push('');
    lines.push(`*${group.branchName}* (${group.trials.length})`);
    for (const t of group.trials) {
      lines.push(`• ${t.startTime} — ${t.firstName} ${t.lastName}`);
    }
  }
  return lines.join('\n');
}
