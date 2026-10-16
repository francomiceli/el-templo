import { App } from '@capacitor/app'
import type { PluginListenerHandle } from '@capacitor/core'
import { Capacitor } from '@capacitor/core'
import { createLogger } from 'src/utils/logger'

const log = createLogger('useBackButtonClose')

/**
 * Cierra una hoja/diálogo con el botón "atrás" de Android (fase 199, L40).
 *
 * La app no usa `Platform.is.cordova`, así que QDialog no engancha el historial por sí
 * solo en Capacitor: el listener `backButton` se registra SOLO mientras el diálogo
 * está abierto. Solo en plataforma nativa. Mismo mecanismo que `ProgramSheet`.
 *
 * - `attach()` al abrir, `cleanup()` al cerrar o desmontar (el composable no engancha
 *   `onUnmounted`).
 * - Token anti-carrera: si se cierra mientras `addListener` resuelve, se suelta enseguida.
 */
export function useBackButtonClose(onBack: () => void) {
  let handle: PluginListenerHandle | null = null
  let token = 0

  async function attach(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return
    cleanup()
    const mine = ++token
    try {
      const added = await App.addListener('backButton', () => {
        onBack()
      })
      if (mine !== token) {
        await added.remove()
        return
      }
      handle = added
    } catch (err: unknown) {
      log.warn('No se pudo registrar el botón atrás', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  function cleanup(): void {
    token++
    if (handle) {
      void handle.remove()
      handle = null
    }
  }

  return { attach, cleanup }
}
