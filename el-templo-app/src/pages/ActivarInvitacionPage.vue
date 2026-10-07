<!-- Pantalla "Activar invitación" (Fase 194, D-06). Requiere sesión: llegan acá el registro y el login
     con código, y la landing `/invitacion/:code` cuando ya hay sesión.
     TODO el contenido (nombre del invitador, accesos, días hábiles, motivos de rechazo, sedes) lo decide el
     servidor: la app no hardcodea cantidades ni reglas (T-194-86). -->
<template>
  <q-page class="activar-page" padding>
    <p class="page-title">Activar invitación</p>

    <!-- Loading -->
    <div v-if="stage === 'loading'" class="activar-center">
      <TemploLoader />
    </div>

    <!-- Error de red / servidor al consultar -->
    <div v-else-if="stage === 'loadError'" class="activar-center">
      <q-icon name="error_outline" size="40px" color="negative" />
      <p class="activar-text">{{ blockedMessage }}</p>
      <q-btn color="primary" unelevated no-caps label="Reintentar" @click="loadEligibility()" />
    </div>

    <!-- Sin código / no elegible / rechazo definitivo -->
    <div v-else-if="stage === 'blocked'" class="activar-center">
      <q-icon name="info" size="44px" color="primary" />
      <p class="activar-text" data-test="blocked-message">{{ blockedMessage }}</p>
      <q-btn color="primary" unelevated no-caps label="Ir al inicio" @click="goHome" />
    </div>

    <!-- Activada -->
    <div v-else-if="stage === 'done' && activation" class="activar-center">
      <q-icon name="check_circle" size="48px" color="positive" />
      <p class="activar-headline" data-test="done-message">{{ doneMessage }}</p>
      <q-btn
        color="primary"
        unelevated
        no-caps
        icon="event_available"
        label="Reservar mi primera clase"
        @click="goReservas"
      />
      <q-btn flat no-caps color="primary" label="Ir al inicio" @click="goHome" />
    </div>

    <!-- Formulario -->
    <template v-else-if="stage === 'form' && eligibility">
      <div class="info-card q-mb-md">
        <q-icon name="card_giftcard" size="24px" color="primary" class="info-card__icon" />
        <div class="info-card__content">
          <span class="activar-headline" data-test="offer">{{ offerText }}</span>
        </div>
      </div>

      <q-form class="q-gutter-y-md" @submit.prevent="onSubmit">
        <q-select
          v-model="branchId"
          :options="branchOptions"
          label="¿En qué sede vas a entrenar?"
          emit-value
          map-options
          outlined
          :rules="[requiredRule]"
          lazy-rules
          @update:model-value="onBranchChange"
        />

        <q-input
          v-model="phone"
          label="Teléfono"
          type="tel"
          inputmode="tel"
          outlined
          :rules="phoneRules"
          lazy-rules
          hint="Lo usamos para identificarte, no para spam"
        />

        <q-input v-model="dni" label="DNI (opcional)" outlined inputmode="numeric" />

        <q-banner
          v-if="submitError"
          rounded
          class="bg-negative text-white"
          data-test="submit-error"
        >
          {{ submitError }}
        </q-banner>

        <q-btn
          type="submit"
          color="primary"
          unelevated
          no-caps
          class="full-width"
          label="Activar mis accesos"
          :loading="submitting"
        />
      </q-form>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { api } from 'src/boot/axios'
import { createLogger } from 'src/utils/logger'
import { extractError } from 'src/utils/extract-error'
import { useUserStore, type UserProfile } from 'src/stores/useUserStore'
import TemploLoader from 'src/components/TemploLoader.vue'
import {
  pendingInvitation,
  normalizeInvitationCode,
  isDefinitiveInvitationReason,
  takeRememberedPhone,
} from 'src/utils/pending-invitation'
import { formatLongDate } from 'src/utils/invitation-view'

// Contrato de GET/POST /api/members/referrals/invitations/* (194-10).
interface BranchOption {
  id: number
  name: string
  country: string
}

interface EligibilityResponse {
  inviterFirstName: string | null
  eligible: boolean
  reason: string | null
  message: string | null
  branches: BranchOption[]
  accessesBudget: number | null
  accessBusinessDays: number
}

interface ActivationResponse {
  invitationId: number
  subscriptionId: number
  accessExpiresOn: string
  classesBudget: number | null
  branchId: number
}

type Stage = 'loading' | 'loadError' | 'blocked' | 'form' | 'done'

const log = createLogger('ActivarInvitacionPage')
const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const stage = ref<Stage>('loading')
const code = ref<string | null>(null)
const eligibility = ref<EligibilityResponse | null>(null)
const activation = ref<ActivationResponse | null>(null)
const blockedMessage = ref('')
const submitError = ref('')
const submitting = ref(false)

const branchId = ref<number | null>(null)
const phone = ref('')
const dni = ref('')

const branchOptions = computed(() =>
  (eligibility.value?.branches ?? []).map((b) => ({ label: b.name, value: b.id })),
)

// "<Nombre> te invitó: <accessesBudget> accesos gratis en <accessBusinessDays> días hábiles".
// Los números llegan del servidor; sin sede elegida (sede virtual) `accessesBudget` es null y el
// copy queda genérico hasta que la persona elige sede.
const offerText = computed(() => {
  const e = eligibility.value
  if (!e) return ''
  const who = e.inviterFirstName ? `${e.inviterFirstName} te invitó` : 'Te invitaron'
  if (e.accessesBudget === null) {
    return `${who}: accesos gratis para probar El Templo. Elegí tu sede para ver cuántos.`
  }
  const accesos = e.accessesBudget === 1 ? 'acceso gratis' : 'accesos gratis'
  const dias = e.accessBusinessDays === 1 ? 'día hábil' : 'días hábiles'
  return `${who}: ${e.accessesBudget} ${accesos} en ${e.accessBusinessDays} ${dias}`
})

const doneMessage = computed(() => {
  const a = activation.value
  if (!a) return ''
  const until = formatLongDate(a.accessExpiresOn)
  if (a.classesBudget === null) return `¡Listo! Tus accesos están activos hasta el ${until}`
  const accesos = a.classesBudget === 1 ? 'acceso' : 'accesos'
  return `¡Listo! Tenés ${a.classesBudget} ${accesos} hasta el ${until}`
})

const requiredRule = (val: unknown) => !!val || 'Este campo es requerido'
const phoneRules = [
  (val: string) => !!val.trim() || 'El teléfono es requerido',
  (val: string) => val.replace(/\D/g, '').length >= 6 || 'Ingresá un teléfono válido',
]

interface ApiFailure {
  status: number | null
  reason: string | null
  message: string
}

function readFailure(err: unknown, fallback: string): ApiFailure {
  if (axios.isAxiosError(err)) {
    const data: unknown = err.response?.data
    const reason =
      typeof data === 'object' && data !== null && 'reason' in data
        ? (data as { reason?: unknown }).reason
        : null
    return {
      status: err.response?.status ?? null,
      reason: typeof reason === 'string' ? reason : null,
      message: extractError(err, fallback),
    }
  }
  return { status: null, reason: null, message: extractError(err, fallback) }
}

function block(message: string, reason: string | null): void {
  blockedMessage.value = message
  // Motivo que no se arregla reintentando: el código pendiente se limpia (D-26). Los motivos que
  // dependen del invitador (cupo, membresía) se limpian recién cuando la persona descarta el aviso.
  if (isDefinitiveInvitationReason(reason)) pendingInvitation.clear()
  stage.value = 'blocked'
}

// 403 del servidor: la cuenta no es de socio (staff). No se arregla reintentando ni con otro código:
// se muestra el mensaje del servidor y se descarta el código pendiente.
function blockNotMember(failure: ApiFailure): void {
  pendingInvitation.clear()
  blockedMessage.value = failure.message
  stage.value = 'blocked'
}

// Contador anti-race (LO-10): al cambiar de sede varias veces seguidas, solo cuenta la ÚLTIMA
// consulta; una respuesta vieja que llega tarde no pisa el copy de la sede actual.
let eligibilitySeq = 0

async function loadEligibility(selectedBranchId?: number): Promise<void> {
  if (!code.value) return
  const firstLoad = !eligibility.value
  if (firstLoad) stage.value = 'loading'
  const seq = ++eligibilitySeq
  try {
    const res = await api.get<EligibilityResponse>('/members/referrals/invitations/eligibility', {
      params: { code: code.value, ...(selectedBranchId ? { branchId: selectedBranchId } : {}) },
    })
    if (seq !== eligibilitySeq) return
    eligibility.value = res.data
    if (!res.data.eligible) {
      block(res.data.message ?? 'No podés activar esta invitación.', res.data.reason)
      return
    }
    if (firstLoad && res.data.branches.length === 1) branchId.value = res.data.branches[0].id
    stage.value = 'form'
  } catch (err: unknown) {
    if (seq !== eligibilitySeq) return
    const failure = readFailure(err, 'No pudimos consultar tu invitación.')
    if (failure.status === 403) {
      blockNotMember(failure)
      return
    }
    if (!firstLoad) {
      // Refresco al cambiar de sede: se mantiene el formulario, solo queda el copy anterior.
      log.warn('No se pudo refrescar la elegibilidad al cambiar de sede', {
        message: failure.message,
      })
      return
    }
    if (failure.status === 404 || failure.status === 400) {
      block(failure.message, failure.reason)
      return
    }
    log.error('Failed to load invitation eligibility', { message: failure.message })
    blockedMessage.value = failure.message
    stage.value = 'loadError'
  }
}

// Al elegir sede se vuelve a consultar: el servidor informa los accesos del país de esa sede.
function onBranchChange(value: number | null): void {
  if (value) void loadEligibility(value)
}

// Perfil y suscripción cambiaron (sede física, plan de accesos): se refrescan para que Reservas y
// Mi Templo los vean sin cerrar sesión. Best-effort: la activación ya está hecha.
async function refreshUserState(): Promise<void> {
  try {
    const res = await api.get<UserProfile>('/auth/me')
    userStore.setProfile(res.data)
    await userStore.loadSubscription()
  } catch (err: unknown) {
    log.warn('No se pudo refrescar el perfil tras activar la invitación', {
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

async function onSubmit(): Promise<void> {
  if (!code.value || branchId.value === null) return
  submitting.value = true
  submitError.value = ''
  try {
    const res = await api.post<ActivationResponse>('/members/referrals/invitations/activate', {
      code: code.value,
      branchId: branchId.value,
      phone: phone.value.trim(),
      ...(dni.value.trim() ? { dni: dni.value.trim() } : {}),
    })
    activation.value = res.data
    pendingInvitation.clear()
    stage.value = 'done'
    void refreshUserState()
  } catch (err: unknown) {
    const failure = readFailure(err, 'No pudimos activar tu invitación.')
    if (failure.status === 403) {
      blockNotMember(failure)
      return
    }
    if (isDefinitiveInvitationReason(failure.reason)) {
      block(failure.message, failure.reason)
      return
    }
    // phone_taken / dni_taken / cupo del invitador / sede inválida: se muestra el mensaje del servidor
    // y la persona puede corregir el dato o salir.
    log.warn('Invitation activation rejected', { reason: failure.reason, status: failure.status })
    submitError.value = failure.message
  } finally {
    submitting.value = false
  }
}

function goHome(): void {
  // Descartar el aviso es explícito: el código pendiente ya no debe secuestrar el próximo login.
  pendingInvitation.clear()
  void router.push('/')
}

function goReservas(): void {
  void router.push({ name: 'reservas' })
}

onMounted(() => {
  const fromQuery = normalizeInvitationCode(route.query.code)
  code.value = fromQuery ?? pendingInvitation.read()
  if (fromQuery) pendingInvitation.save(fromQuery)
  phone.value = takeRememberedPhone() ?? ''

  if (!code.value) {
    blockedMessage.value =
      'No encontramos tu invitación. Pedile a quien te invitó que te comparta el link de nuevo.'
    stage.value = 'blocked'
    return
  }
  void loadEligibility()
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.activar-page {
  max-width: 600px;
  margin: 0 auto;
}

.page-title {
  font-family: 'Montserrat', sans-serif;
  font-size: 20px;
  font-weight: 700;
  color: $primary;
  margin: 8px 0 16px;
}

.activar-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 16px;
  text-align: center;
}

.activar-text {
  font-size: 14px;
  line-height: 1.5;
  color: $grey-7;
  margin: 0;
  max-width: 340px;
}

.activar-headline {
  font-family: 'Montserrat', sans-serif;
  font-size: 18px;
  line-height: 1.3;
  font-weight: 700;
  color: $primary;
}

.info-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  background: white;
  border: 1px solid rgba($primary, 0.15);
  border-radius: 12px;
  border-left: 4px solid $primary;

  &__icon {
    flex-shrink: 0;
    margin-top: 2px;
  }

  &__content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
}
</style>
