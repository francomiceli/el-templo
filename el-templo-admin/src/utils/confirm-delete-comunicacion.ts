/**
 * Confirmación de borrado homogénea para las 3 categorías de Comunicaciones
 * que distinguen sistema/propia (push, avisos, tarjetas — TV es siempre
 * propia). Fase 193, Plan B (pedido de Franco 2026-09-03): ahora CUALQUIER
 * kind se borra igual; cuando es del sistema, el diálogo aclara que se
 * puede restaurar después. Un solo `$q.dialog` (no un componente aparte,
 * mismo criterio "lo más simple" del plan) reusado por las 3 secciones.
 */
import type { QVueGlobals } from 'quasar';

export function confirmDeleteComunicacion(
  $q: QVueGlobals,
  opts: { title: string; itemLabel: string; isSystem: boolean },
): Promise<boolean> {
  const message = opts.isSystem
    ? `¿Borrar "${opts.itemLabel}"? Origen: Sistema. Podés restaurarla después desde "Restaurar las del sistema".`
    : `¿Borrar "${opts.itemLabel}"? Esta acción no se puede deshacer.`;

  return new Promise((resolve) => {
    $q.dialog({
      title: opts.title,
      message,
      cancel: true,
      persistent: true,
    })
      .onOk(() => resolve(true))
      .onCancel(() => resolve(false))
      .onDismiss(() => resolve(false));
  });
}
