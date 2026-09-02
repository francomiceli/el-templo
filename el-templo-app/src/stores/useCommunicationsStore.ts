import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from 'src/boot/axios'
import { createLogger } from 'src/utils/logger'
import { setServerSalesNumber } from 'src/utils/whatsapp'
import { DEFAULT_WHATSAPP_TEXT } from 'src/config/destinations'

const log = createLogger('useCommunicationsStore')

interface MemberConfigResponse {
  salesWhatsappNumber: string | null
  defaultWhatsappText: string
}

/**
 * Fase 193 (D-20/D-21): config del socio para el destino común — el número de
 * WhatsApp de ventas resuelto por la sede del socio y el texto por defecto
 * global. Se hidrata una vez por sesión (ver MainLayout.vue, watcher de
 * `authStore.isAuthenticated`) y alimenta `utils/whatsapp.ts` vía
 * `setServerSalesNumber` — las pantallas que ya usan `buildWhatsAppUrl` no
 * cambian ni una línea.
 */
export const useCommunicationsStore = defineStore('communications', () => {
  const salesNumber = ref<string | null>(null)
  const defaultWhatsappText = ref<string>(DEFAULT_WHATSAPP_TEXT)
  const loaded = ref(false)

  async function loadConfig(): Promise<void> {
    try {
      const { data } = await api.get<MemberConfigResponse>('/communications/me/config')
      salesNumber.value = data.salesWhatsappNumber
      defaultWhatsappText.value = data.defaultWhatsappText
      setServerSalesNumber(data.salesWhatsappNumber)
      loaded.value = true
    } catch (err: unknown) {
      // Fail-open hacia el hardcode (D-21): si el fetch falla, NO se toca
      // setServerSalesNumber — utils/whatsapp.ts se queda con el mapa AR/ES.
      log.error('Failed to load communications config', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return {
    salesNumber,
    defaultWhatsappText,
    loaded,
    loadConfig,
  }
})
