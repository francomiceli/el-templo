<!-- Pantalla "Mis invitados" (Fase 194, SC-5): reemplaza a la vieja pantalla de referidos (fases 158/194).
     Cupo, link, estados y descuento los calcula el servidor (GET /members/referrals, bloque `invitations`):
     la app solo los muestra. El link lo arma el servidor (T-194-85), el cliente no construye URLs. -->
<template>
  <q-page class="invitados-page" padding>
    <p class="page-title">Mis invitados</p>

    <!-- Loading -->
    <div v-if="loading" class="invitados-loading">
      <TemploLoader />
    </div>

    <!-- Load error -->
    <div v-else-if="loadError" class="invitados-error">
      <q-icon name="error_outline" size="40px" color="negative" />
      <p class="invitados-error__text">No pudimos cargar tus invitaciones.</p>
      <q-btn color="primary" unelevated label="Reintentar" no-caps @click="fetchOverview" />
    </div>

    <!-- Loaded -->
    <template v-else-if="overview">
      <!-- Bloque 1: cupo + invitar -->
      <div class="info-card q-mb-md">
        <q-icon name="card_giftcard" size="24px" color="primary" class="info-card__icon" />
        <div class="info-card__content">
          <span class="info-card__label">Tus invitaciones</span>
          <span class="quota-headline">{{ quotaLabel }}</span>
          <q-btn
            class="q-mt-md"
            color="primary"
            unelevated
            no-caps
            icon="share"
            label="Invitar a alguien"
            :disabled="quotaExhausted"
            :loading="sharing"
            @click="shareInvitation"
          />
        </div>
      </div>

      <!-- Bloque 2: descuento vigente -->
      <div class="info-card q-mb-md">
        <q-icon name="local_offer" size="24px" color="primary" class="info-card__icon" />
        <div class="info-card__content">
          <span class="info-card__label">Tu descuento por invitaciones</span>
          <span
            class="discount-headline"
            :class="{ 'discount-headline--muted': overview.invitations.discount.percent <= 0 }"
            >{{ discountLabel }}</span
          >
        </div>
      </div>

      <!-- Bloque 3: quién me invitó -->
      <template v-if="overview.invitedBy">
        <p class="section-title">Te invitó</p>
        <div class="links-card q-mb-md">
          <div class="link-row">
            <div class="link-row__main">
              <span class="link-row__name">{{ overview.invitedBy.inviterName }}</span>
              <span class="link-row__caption">{{ invitedByCaption }}</span>
            </div>
            <q-chip
              :color="invitedByStageColor(overview.invitedBy.stage)"
              text-color="white"
              dense
              :label="invitedByStageLabel(overview.invitedBy.stage)"
            />
          </div>
        </div>
      </template>

      <!-- Bloque 4: mis invitados -->
      <template v-if="overview.invitations.invitees.length > 0">
        <p class="section-title">Invitaste a</p>
        <div class="links-card q-mb-md">
          <div
            v-for="invitee in overview.invitations.invitees"
            :key="`${invitee.source}-${invitee.userId}`"
            class="link-row"
          >
            <q-avatar color="primary" text-color="white" size="36px" class="link-row__avatar">
              {{ initialOf(invitee.firstName) }}
            </q-avatar>
            <div class="link-row__main">
              <span class="link-row__name">{{ inviteeName(invitee) }}</span>
              <span v-if="inviteeCaption(invitee)" class="link-row__caption">{{
                inviteeCaption(invitee)
              }}</span>
            </div>
            <q-chip
              :color="inviteeStateColor(invitee.state)"
              text-color="white"
              dense
              :label="inviteeStateLabel(invitee.state)"
            />
          </div>
        </div>
      </template>

      <!-- Estado vacío -->
      <div v-else class="invitados-empty">
        <q-icon name="group_add" size="48px" color="primary" />
        <p class="invitados-empty__heading">Todavía no invitaste a nadie</p>
        <p class="invitados-empty__body">
          Compartí tu link con quien quieras que entrene con vos. Mientras los dos sean activos,
          obtienen un descuento en su cuota.
        </p>
      </div>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useQuasar, copyToClipboard } from 'quasar'
import { api } from 'src/boot/axios'
import { createLogger } from 'src/utils/logger'
import { extractError } from 'src/utils/extract-error'
import { useUserStore } from 'src/stores/useUserStore'
import TemploLoader from 'src/components/TemploLoader.vue'
import {
  inviteeStateLabel,
  inviteeStateColor,
  invitedByStageLabel,
  invitedByStageColor,
  quotaText,
  accessesText,
  expiryText,
  discountText,
  shareMessage,
  type InviteeState,
  type InvitedByStage,
} from 'src/utils/invitation-view'

// Contrato de GET /api/members/referrals (194-19). Solo los campos que usa esta pantalla.
interface InviteeView {
  invitationId: number | null
  userId: number
  firstName: string
  lastInitial: string
  state: InviteeState
  accessesUsed: number | null
  accessesBudget: number | null
  activatedAt: string | null
  accessExpiresOn: string | null
  sumaDescuento: boolean
  source: 'invitation' | 'legacy_link'
}

interface InvitedByView {
  inviterId: number
  inviterName: string
  activatedAt: string
  accessesUsed: number
  accessesBudget: number
  accessExpiresOn: string
  stage: InvitedByStage
}

interface InvitationsOverview {
  quota: { limit: number; used: number; remaining: number; month: string }
  inviteUrl: string
  invitees: InviteeView[]
  discount: { percent: number; activeInvitees: number }
}

interface ReferralsResponse {
  invitations: InvitationsOverview
  invitedBy: InvitedByView | null
}

const log = createLogger('MisInvitadosPage')
const $q = useQuasar()
const userStore = useUserStore()

const loading = ref(true)
const loadError = ref(false)
const sharing = ref(false)
const overview = ref<ReferralsResponse | null>(null)

const quotaExhausted = computed(() => (overview.value?.invitations.quota.remaining ?? 0) <= 0)
const quotaLabel = computed(() =>
  overview.value ? quotaText(overview.value.invitations.quota) : '',
)
const discountLabel = computed(() =>
  overview.value
    ? discountText(
        overview.value.invitations.discount.percent,
        overview.value.invitations.discount.activeInvitees,
      )
    : '',
)

const invitedByCaption = computed(() => {
  const by = overview.value?.invitedBy
  if (!by) return ''
  return [accessesText(by.accessesUsed, by.accessesBudget), expiryText(by.accessExpiresOn)]
    .filter(Boolean)
    .join(' · ')
})

function initialOf(firstName: string): string {
  return firstName.trim().charAt(0).toUpperCase()
}

function inviteeName(invitee: InviteeView): string {
  return invitee.lastInitial ? `${invitee.firstName} ${invitee.lastInitial}.` : invitee.firstName
}

function inviteeCaption(invitee: InviteeView): string {
  return [
    accessesText(invitee.accessesUsed, invitee.accessesBudget),
    // El vencimiento solo importa mientras los accesos están vigentes.
    invitee.state === 'invitado' || invitee.state === 'entrenando'
      ? expiryText(invitee.accessExpiresOn)
      : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

async function fetchOverview() {
  loading.value = true
  loadError.value = false
  try {
    const res = await api.get<ReferralsResponse>('/members/referrals')
    overview.value = res.data
  } catch (err: unknown) {
    loadError.value = true
    log.error('Failed to load invitations overview', {
      error: err instanceof Error ? err.message : String(err),
    })
    $q.notify({
      message: extractError(err, 'No pudimos cargar tus invitaciones.'),
      color: 'negative',
      timeout: 4000,
    })
  } finally {
    loading.value = false
  }
}

// Android/iOS rechazan la promesa del share sheet cuando el usuario lo cierra.
// No es un fallo: no hay que caer al fallback ni avisar nada.
function isShareCanceled(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return msg.includes('cancel') || msg.includes('abort')
}

// El WebView de Android niega `navigator.clipboard.writeText` (Write permission
// denied) y copyToClipboard de Quasar no tiene fallback propio en ese caso.
async function copyWithFallback(text: string): Promise<boolean> {
  try {
    await copyToClipboard(text)
    return true
  } catch (copyErr: unknown) {
    log.warn('clipboard API failed → fallback execCommand', {
      err: copyErr instanceof Error ? copyErr.message : String(copyErr),
    })
  }
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    textarea.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch (execErr: unknown) {
    log.error('clipboard fallback failed', {
      err: execErr instanceof Error ? execErr.message : String(execErr),
    })
    return false
  }
}

async function shareInvitation() {
  if (!overview.value) return
  sharing.value = true
  // T-194-85: el link lo arma el servidor; el cliente solo lo comparte.
  const url = overview.value.invitations.inviteUrl
  const text = shareMessage(userStore.profile?.firstName ?? null, url)
  try {
    const shareMod: typeof import('@capacitor/share') = await import('@capacitor/share')
    const { Share } = shareMod
    await Share.share({
      title: 'Sumate a El Templo',
      text,
      url,
    })
  } catch (shareErr: unknown) {
    if (isShareCanceled(shareErr)) {
      sharing.value = false
      return
    }
    log.warn('share failed → fallback clipboard', {
      err: shareErr instanceof Error ? shareErr.message : String(shareErr),
    })
    const copied = await copyWithFallback(url)
    $q.notify(
      copied
        ? {
            message:
              'No pudimos abrir el menú de compartir. Copiamos el link para que lo pegues donde quieras.',
            color: 'warning',
            timeout: 4000,
          }
        : {
            message: `No pudimos compartir ni copiar el link: ${url}`,
            color: 'negative',
            timeout: 8000,
            actions: [{ label: 'Cerrar', color: 'white' }],
          },
    )
  } finally {
    sharing.value = false
  }
}

onMounted(fetchOverview)
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.invitados-page {
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

.invitados-loading {
  display: flex;
  justify-content: center;
  padding: 48px 0;
}

.invitados-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 16px;
  text-align: center;

  &__text {
    font-size: 14px;
    color: $grey-7;
    margin: 0;
  }
}

.section-title {
  font-family: 'Montserrat', sans-serif;
  font-size: 16px;
  font-weight: 600;
  color: rgba($primary, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 4px 0 8px;
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

  &__label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba($primary, 0.5);
    display: block;
  }
}

.quota-headline {
  font-family: 'Montserrat', sans-serif;
  font-size: 18px;
  line-height: 1.3;
  font-weight: 700;
  color: $primary;
  margin-top: 4px;
}

.discount-headline {
  font-family: 'Montserrat', sans-serif;
  font-size: 18px;
  line-height: 1.3;
  font-weight: 700;
  color: $primary;
  margin-top: 4px;

  &--muted {
    color: rgba($primary, 0.6);
  }
}

.links-card {
  background: white;
  border: 1px solid rgba($primary, 0.15);
  border-radius: 12px;
  border-left: 4px solid $primary;
  overflow: hidden;
}

.link-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 16px;

  & + & {
    border-top: 1px solid rgba($primary, 0.08);
  }

  &__avatar {
    flex-shrink: 0;
  }

  &__main {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }

  &__name {
    font-size: 14px;
    font-weight: 400;
    line-height: 1.5;
    color: $primary;
  }

  &__caption {
    font-size: 12px;
    line-height: 1.4;
    color: $grey-6;
    margin-top: 2px;
  }
}

.invitados-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 32px 16px;

  &__heading {
    font-family: 'Montserrat', sans-serif;
    font-size: 16px;
    font-weight: 600;
    color: $primary;
    margin: 16px 0 8px;
  }

  &__body {
    font-size: 14px;
    line-height: 1.5;
    color: $grey-7;
    margin: 0;
    max-width: 340px;
  }
}
</style>
