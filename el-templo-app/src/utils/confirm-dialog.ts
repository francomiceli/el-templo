import type { DialogChainObject, QVueGlobals } from 'quasar'
import ConfirmDialog from 'src/components/ConfirmDialog.vue'

export interface ConfirmDialogOptions {
  title: string
  message: string
  okLabel: string
  cancelLabel?: string
  /** Acción que pierde algo: botón rojo sin destello */
  destructive?: boolean
  persistent?: boolean
}

/**
 * Abre una confirmación con el estilo de los diálogos de trámite (`ConfirmDialog`). Devuelve la
 * misma cadena que `$q.dialog`, así los llamados siguen usando `.onOk()` / `.onCancel()`.
 */
export function confirmDialog($q: QVueGlobals, options: ConfirmDialogOptions): DialogChainObject {
  return $q.dialog({ component: ConfirmDialog, componentProps: { ...options } })
}
