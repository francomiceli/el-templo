<template>
  <!-- Pop-up de dirección (calle y altura). Salteable: "Ahora no" o tocar afuera lo cierra. Si no
       guardó, vuelve UNA sola vez a los 14 días y después nunca más; el dato queda en Perfil. -->
  <q-dialog v-model="show">
    <PremiumDialogCard kicker="La comunidad" icon="home">
      <h3 class="pd-title">¿Desde dónde venís a entrenar?</h3>
      <p class="pd-text">
        Queremos conocer mejor a la comunidad para decidir dónde abrir nuevas sedes y qué horarios
        sumar.
      </p>

      <AddressFields
        v-model:street="street"
        v-model:number="number"
        dark
        @submit="onSave"
      />

      <p v-if="errorMessage" class="pd-help address-prompt__error" role="alert">
        {{ errorMessage }}
      </p>

      <p class="pd-help address-prompt__fine">
        Es opcional. Solo la ve el equipo de El Templo, no la compartimos con nadie y la podés
        cambiar o borrar desde tu Perfil. No usamos la ubicación de tu teléfono.
      </p>

      <div class="pd-acts">
        <q-btn
          unelevated
          no-caps
          class="pd-cta"
          label="Guardar"
          :disable="composed === null"
          :loading="saving"
          @click="onSave"
        />
        <q-btn flat no-caps dense class="pd-skip" label="Ahora no" @click="show = false" />
      </div>
    </PremiumDialogCard>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useQuasar } from 'quasar'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { useAuthStore } from 'stores/useAuthStore'
import { useUserStore } from 'stores/useUserStore'
import { useAvisosStore } from 'src/stores/useAvisosStore'
import { useAddressPromptStorage } from 'src/composables/useAddressPromptStorage'
import { createLogger } from 'src/utils/logger'
import { extractError } from 'src/utils/extract-error'
import { PUSH_PERMISSION_ASKED_KEY } from 'src/utils/push-permission-key'
import {
  canShowAddressPrompt,
  composeAddress,
  recordAddressPromptShown,
  shouldAskAddress,
} from 'src/utils/member-address'
import PremiumDialogCard from 'src/components/PremiumDialogCard.vue'
import AddressFields from 'src/components/AddressFields.vue'

const log = createLogger('AddressPromptDialog')
const $q = useQuasar()
const route = useRoute()
const authStore = useAuthStore()
const userStore = useUserStore()
const avisosStore = useAvisosStore()
const promptStorage = useAddressPromptStorage()

/** Respiro para que Mi Templo termine de dibujarse antes de abrir el pop-up. */
const SHOW_DELAY_MS = 1500

const show = ref(false)
const street = ref('')
const number = ref('')
const saving = ref(false)
const errorMessage = ref('')

const composed = computed(() => composeAddress({ street: street.value, number: number.value }))

/**
 * Momento tranquilo: en Mi Templo, con la evaluación de avisos del servidor ya respondida y SIN
 * otro pop-up en esta apertura (vencimiento, calificar, sugerencia o aviso del staff tienen
 * prioridad: uno solo por apertura). Nunca en medio de una reserva o un entrenamiento.
 */
const quietMoment = computed(
  () =>
    shouldAskAddress(userStore.profile) &&
    route.path === '/mi-templo' &&
    avisosStore.evaluated &&
    !avisosStore.loading &&
    avisosStore.prompt === null,
)

// Una sola decisión por sesión (MainLayout no se remonta entre navegaciones).
let decided = false
let timer: ReturnType<typeof setTimeout> | null = null

async function decide(): Promise<void> {
  if (decided) return
  decided = true
  const userId = userStore.profile?.id
  if (userId === undefined) return

  // Cadencia: primera vez, y una segunda a los 14 días si no guardó (utils/member-address.ts).
  const state = await promptStorage.read(userId)
  if (!canShowAddressPrompt(state, new Date())) return

  // Primera apertura en el teléfono: el pre-pedido de notificaciones tiene prioridad (va por
  // fuera de la cola de avisos). Se pide la dirección recién en una apertura posterior.
  if (Capacitor.isNativePlatform()) {
    const { value } = await Preferences.get({ key: PUSH_PERMISSION_ASKED_KEY })
    if (value !== '1') return
  }

  timer = setTimeout(() => {
    timer = null
    // Re-chequeo: en el respiro el socio pudo cambiar de tab o abrirse otro pop-up.
    if (!quietMoment.value) {
      decided = false
      return
    }
    show.value = true
    // Se cuenta al MOSTRARLO (no al cerrarlo): un cierre por app en segundo plano también cuenta
    // como una de las dos veces.
    const next = recordAddressPromptShown(state, new Date())
    void promptStorage.write(userId, next)
    log.info('Address prompt shown', { shows: next.shows })
  }, SHOW_DELAY_MS)
}

watch(
  quietMoment,
  (ok) => {
    if (ok) void decide()
  },
  { immediate: true },
)

// Logout: el próximo socio que entre en este dispositivo arranca de cero.
watch(
  () => authStore.isAuthenticated,
  (isAuth) => {
    if (isAuth) return
    if (timer) clearTimeout(timer)
    timer = null
    decided = false
    show.value = false
    street.value = ''
    number.value = ''
    errorMessage.value = ''
  },
)

onUnmounted(() => {
  if (timer) clearTimeout(timer)
})

async function onSave(): Promise<void> {
  const address = composed.value
  if (address === null || saving.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    await userStore.saveAddress(address)
    show.value = false
    $q.notify({ type: 'positive', message: '¡Gracias! Ya la guardamos.' })
    log.info('Address saved from prompt')
  } catch (err: unknown) {
    // Sin la dirección en el log: es PII.
    log.warn('Address save failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    errorMessage.value = extractError(err, 'No pudimos guardarla. Probá de nuevo.')
  } finally {
    saving.value = false
  }
}
</script>

<style lang="scss" scoped>
@import 'src/css/premium-card';

// Letra chica: mismo `pd-help`, un punto menos para no agrandar el pop-up. Doble clase para
// ganarle al `:slotted(.pd-help)` de PremiumDialogCard sin depender del orden del CSS.
.pd-help.address-prompt__fine {
  font-size: 12px;
}

.pd-help.address-prompt__error {
  color: $pd-neg-on-dark;
}
</style>
