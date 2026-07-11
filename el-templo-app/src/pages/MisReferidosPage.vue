<!-- Pantalla "Mis referidos" (fase 158, VIS-01) — UI-SPEC S1/S2. -->
<template>
  <q-page class="referidos-page" padding>
    <p class="page-title">Mis referidos</p>

    <!-- Loading -->
    <div v-if="loading" class="referidos-loading">
      <TemploLoader />
    </div>

    <!-- Load error -->
    <div v-else-if="loadError" class="referidos-error">
      <q-icon name="error_outline" size="40px" color="negative" />
      <p class="referidos-error__text">No pudimos cargar tus referidos.</p>
      <q-btn color="primary" unelevated label="Reintentar" no-caps @click="fetchReferrals" />
    </div>

    <!-- Loaded -->
    <template v-else-if="overview">
      <!-- Bloque 1: Código + Compartir (SIEMPRE visible) -->
      <div class="info-card info-card--code q-mb-md">
        <q-icon name="card_giftcard" size="24px" color="primary" class="info-card__icon" />
        <div class="info-card__content">
          <span class="info-card__label">Tu código</span>
          <span class="code-value">{{ overview.referralCode }}</span>
          <q-btn
            class="q-mt-md"
            color="primary"
            unelevated
            no-caps
            icon="share"
            label="Compartir mi código"
            :loading="sharing"
            @click="shareCode"
          />
        </div>
      </div>

      <!-- Bloque 2: Descuento vigente -->
      <div class="info-card info-card--discount q-mb-md">
        <q-icon name="local_offer" size="24px" color="primary" class="info-card__icon" />
        <div class="info-card__content">
          <template v-if="overview.discount.percent > 0">
            <span class="discount-headline"
              >Estás pagando {{ overview.discount.percent }}% menos</span
            >
            <span class="discount-breakdown">
              {{ overview.discount.activeCount }} vínculos activos ×
              {{ overview.discount.perLinkPercent }}% = {{ overview.discount.percent }}% (tope
              {{ overview.discount.capPercent }}%)
            </span>
          </template>
          <template v-else>
            <span class="discount-headline discount-headline--muted">
              Todavía no tenés descuento activo
            </span>
          </template>
        </div>
      </div>

      <!-- Bloque 3: Vínculos simétricos -->
      <template v-if="hasAnyLink">
        <template v-if="overview.referred.length > 0">
          <p class="section-title">Trajiste a</p>
          <div class="links-card q-mb-md">
            <div v-for="link in overview.referred" :key="link.userId" class="link-row">
              <div class="link-row__main">
                <span class="link-row__name">{{ link.fullName }}</span>
                <span v-if="link.state === 'suspended'" class="link-row__caption">
                  se reactiva si vuelve
                </span>
              </div>
              <q-chip
                :color="stateColor(link.state)"
                text-color="white"
                dense
                :label="stateLabel(link.state)"
              />
            </div>
          </div>
        </template>

        <template v-if="overview.referredBy">
          <p class="section-title">Te trajo</p>
          <div class="links-card q-mb-md">
            <div class="link-row">
              <div class="link-row__main">
                <span class="link-row__name">{{ overview.referredBy.fullName }}</span>
                <span v-if="overview.referredBy.state === 'suspended'" class="link-row__caption">
                  se reactiva si vuelve
                </span>
              </div>
              <q-chip
                :color="stateColor(overview.referredBy.state)"
                text-color="white"
                dense
                :label="stateLabel(overview.referredBy.state)"
              />
            </div>
          </div>
        </template>
      </template>

      <!-- Estado vacío (cero vínculos): Bloque 1 + Bloque 2 quedan arriba, esto reemplaza el Bloque 3 -->
      <div v-else class="referidos-empty">
        <q-icon name="group_add" size="48px" color="primary" />
        <p class="referidos-empty__heading">Todavía no referiste a nadie</p>
        <p class="referidos-empty__body">
          Compartí tu código con quien quieras entrenar. Mientras vos y tu referido sean activos,
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
import TemploLoader from 'src/components/TemploLoader.vue'

type ReferralState = 'pending' | 'active' | 'suspended'

interface ReferralLinkView {
  userId: number
  fullName: string
  state: ReferralState
}

interface ReferralDiscountView {
  percent: number
  activeCount: number
  perLinkPercent: number
  capPercent: number
}

interface ReferralsResponse {
  referralCode: string
  discount: ReferralDiscountView
  referred: ReferralLinkView[]
  referredBy: ReferralLinkView | null
}

const log = createLogger('MisReferidosPage')
const $q = useQuasar()

const loading = ref(true)
const loadError = ref(false)
const sharing = ref(false)
const overview = ref<ReferralsResponse | null>(null)

const hasAnyLink = computed(
  () =>
    !!overview.value && (overview.value.referred.length > 0 || overview.value.referredBy !== null),
)

const shareUrl = computed(() =>
  overview.value ? `https://app.eltemplo.org/register?ref=${overview.value.referralCode}` : '',
)

function stateColor(state: ReferralState): string {
  switch (state) {
    case 'active':
      return 'positive'
    case 'suspended':
      return 'warning'
    case 'pending':
    default:
      return 'info'
  }
}

function stateLabel(state: ReferralState): string {
  switch (state) {
    case 'active':
      return 'Activo'
    case 'suspended':
      return 'Suspendido'
    case 'pending':
    default:
      return 'Pendiente'
  }
}

async function fetchReferrals() {
  loading.value = true
  loadError.value = false
  try {
    const res = await api.get<ReferralsResponse>('/members/referrals')
    overview.value = res.data
  } catch (err: unknown) {
    loadError.value = true
    log.error('Failed to load referrals', {
      error: err instanceof Error ? err.message : String(err),
    })
    $q.notify({
      message: extractError(err, 'No pudimos cargar tus referidos.'),
      color: 'negative',
      timeout: 4000,
    })
  } finally {
    loading.value = false
  }
}

async function shareCode() {
  if (!overview.value) return
  sharing.value = true
  const url = shareUrl.value
  try {
    const shareMod: typeof import('@capacitor/share') = await import('@capacitor/share')
    const { Share } = shareMod
    await Share.share({
      title: 'Sumate a El Templo',
      text: `Entrená conmigo en El Templo. Usá mi código y los dos empezamos a pagar menos: ${url}`,
      url,
    })
  } catch (shareErr: unknown) {
    log.warn('share failed → fallback clipboard', {
      err: shareErr instanceof Error ? shareErr.message : String(shareErr),
    })
    try {
      await copyToClipboard(url)
      $q.notify({
        message:
          'No pudimos abrir el menú de compartir. Copiamos el link para que lo pegues donde quieras.',
        color: 'warning',
        timeout: 4000,
      })
    } catch (copyErr: unknown) {
      log.error('clipboard fallback failed', {
        err: copyErr instanceof Error ? copyErr.message : String(copyErr),
      })
    }
  } finally {
    sharing.value = false
  }
}

onMounted(fetchReferrals)
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.referidos-page {
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

.referidos-loading {
  display: flex;
  justify-content: center;
  padding: 48px 0;
}

.referidos-error {
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

.code-value {
  font-family: 'Montserrat', sans-serif;
  font-size: 24px;
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: $primary;
  margin-top: 4px;
}

.discount-headline {
  font-family: 'Montserrat', sans-serif;
  font-size: 24px;
  line-height: 1.2;
  font-weight: 700;
  color: $primary;

  &--muted {
    color: rgba($primary, 0.6);
  }
}

.discount-breakdown {
  font-size: 14px;
  line-height: 1.5;
  color: $grey-7;
  margin-top: 8px;
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

  &__main {
    display: flex;
    flex-direction: column;
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

.referidos-empty {
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
