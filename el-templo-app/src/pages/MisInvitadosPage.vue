<!-- Pantalla "Mis invitados" (Fase 194, SC-5): reemplaza a la vieja pantalla de referidos (fases 158/194).
     Cupo, link, estados, descuento y condiciones los calcula el servidor (GET /members/referrals, bloque
     `invitations`): la app solo los muestra. El link lo arma el servidor (T-194-85), el cliente no construye URLs.
     2026-10-29: lenguaje del rework (como Perfil) + "Cómo funciona" con las condiciones aprobadas por Franco
     (`.docs/mis-invitados-condiciones.md`), con los números de la configuración. -->
<template>
  <q-page class="invitados-page">
    <div class="invitados-wrap">
      <header class="invitados-head">
        <h1 class="invitados-head__title">Mis invitados</h1>
        <p class="invitados-head__lead">Invitá a alguien a entrenar con vos.</p>
      </header>

      <!-- Loading: esqueleto del alto de la card de cupo (fase 203, sin saltos al llegar el dato) -->
      <CardSkeleton v-if="loading" :height="236" :radius="16" label="Cargando tus invitaciones" />

      <!-- Load error -->
      <div v-else-if="loadError" class="invitados-card invitados-error">
        <q-icon name="error_outline" size="32px" class="invitados-error__icon" aria-hidden="true" />
        <p class="invitados-error__text">No pudimos cargar tus invitaciones.</p>
        <button type="button" class="invitados-cta" @click="fetchOverview">Reintentar</button>
      </div>

      <!-- Loaded -->
      <template v-else-if="overview">
        <!-- Cupo + invitar + descuento -->
        <section class="invitados-section">
          <h2 class="invitados-title">Tus invitaciones</h2>
          <div class="invitados-card">
            <div class="quota">
              <p class="quota__headline">{{ quotaLabel }}</p>
              <p v-if="renewalLabel" class="quota__caption">{{ renewalLabel }}</p>
              <button
                type="button"
                class="invitados-cta quota__cta"
                :disabled="!canInvite || sharing"
                :aria-busy="sharing"
                @click="shareInvitation"
              >
                <q-icon name="share" size="20px" aria-hidden="true" />
                <span>Invitar a alguien</span>
              </button>
              <p v-if="cannotInviteLabel" class="quota__blocked">
                <q-icon name="info" size="18px" aria-hidden="true" />
                <span>{{ cannotInviteLabel }}</span>
              </p>
            </div>
            <div class="invitados-row">
              <q-icon
                name="local_offer"
                size="22px"
                class="invitados-row__icon"
                aria-hidden="true"
              />
              <div class="invitados-row__text">
                <span class="invitados-row__label">Tu descuento por invitaciones</span>
                <span
                  class="invitados-row__value"
                  :class="{
                    'invitados-row__value--muted': overview.invitations.discount.percent <= 0,
                  }"
                  >{{ discountLabel }}</span
                >
                <span v-if="activeInviteesLabel" class="invitados-row__caption">{{
                  activeInviteesLabel
                }}</span>
              </div>
            </div>
          </div>
        </section>

        <!-- Sin invitados todavía, "Cómo funciona" va enseguida del cupo (pedido de Franco
             2026-10-29). Sin el bloque de condiciones (API vieja durante un deploy) no se muestra
             nada antes que inventar números. -->
        <InvitationRules v-if="!hasInvitees && groups.length > 0" :groups="groups" />

        <!-- Quién me invitó -->
        <section v-if="overview.invitedBy" class="invitados-section">
          <h2 class="invitados-title">Te invitó</h2>
          <div class="invitados-card">
            <div class="invitados-row">
              <div class="invitados-avatar" aria-hidden="true">
                {{ initialOf(overview.invitedBy.inviterName) }}
              </div>
              <div class="invitados-row__text">
                <span class="invitados-row__value">{{
                  inviterDisplayName(overview.invitedBy.inviterName)
                }}</span>
                <span v-if="invitedByCaption" class="invitados-row__caption">{{
                  invitedByCaption
                }}</span>
              </div>
              <span
                class="invitados-pill"
                :class="`invitados-pill--${invitedByStageTone(overview.invitedBy.stage)}`"
                >{{ invitedByStageLabel(overview.invitedBy.stage) }}</span
              >
            </div>
          </div>
        </section>

        <!-- Mis invitados -->
        <section class="invitados-section">
          <h2 class="invitados-title">Invitaste a</h2>
          <div class="invitados-card">
            <template v-if="hasInvitees">
              <div
                v-for="invitee in overview.invitations.invitees"
                :key="`${invitee.source}-${invitee.invitationId ?? 'link'}-${invitee.userId}`"
                class="invitados-row"
              >
                <div class="invitados-avatar" aria-hidden="true">
                  {{ initialOf(invitee.firstName) }}
                </div>
                <div class="invitados-row__text">
                  <span class="invitados-row__value">{{ inviteeName(invitee) }}</span>
                  <span v-if="inviteeCaption(invitee)" class="invitados-row__caption">{{
                    inviteeCaption(invitee)
                  }}</span>
                  <span
                    v-if="discountNote(invitee)"
                    class="invitados-row__note"
                    :class="{ 'invitados-row__note--on': invitee.sumaDescuento }"
                    >{{ discountNote(invitee) }}</span
                  >
                </div>
                <span
                  class="invitados-pill"
                  :class="`invitados-pill--${inviteeStateTone(invitee.state)}`"
                  >{{ inviteeStateLabel(invitee.state) }}</span
                >
              </div>
            </template>

            <!-- Estado vacío -->
            <div v-else class="invitados-empty">
              <q-icon
                name="group_add"
                size="36px"
                class="invitados-empty__icon"
                aria-hidden="true"
              />
              <p class="invitados-empty__heading">Todavía no invitaste a nadie</p>
              <p class="invitados-empty__body">
                Compartí tu link con quien quieras que entrene con vos.
              </p>
            </div>
          </div>
        </section>

        <!-- Cómo funciona al final cuando ya hay invitados (sin invitados va arriba). -->
        <InvitationRules v-if="hasInvitees && groups.length > 0" :groups="groups" />
      </template>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { api } from 'src/boot/axios'
import { createLogger } from 'src/utils/logger'
import { copyWithFallback } from 'src/utils/clipboard'
import { extractError } from 'src/utils/extract-error'
import { useUserStore } from 'src/stores/useUserStore'
import CardSkeleton from 'src/components/CardSkeleton.vue'
import InvitationRules from 'src/components/InvitationRules.vue'
import {
  inviteeStateLabel,
  inviteeStateTone,
  invitedByStageLabel,
  invitedByStageTone,
  inviteeDiscountNote,
  quotaText,
  accessesText,
  expiryText,
  discountText,
  activeInviteesText,
  shareMessage,
  inviterDisplayName,
  type InviteeState,
  type InvitedByStage,
} from 'src/utils/invitation-view'
import {
  conditionGroups,
  quotaRenewalText,
  cannotInviteText,
  type InvitationConditions,
} from 'src/utils/invitation-conditions'

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
  /** 2026-10-29. Opcional: una API anterior al deploy no lo manda. */
  conditions?: InvitationConditions
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

const conditions = computed(() => overview.value?.invitations.conditions ?? null)

// E2: sin plan vigente el botón se deshabilita (lo decide el servidor). Sin el bloque de
// condiciones (API vieja) queda la regla de antes: solo el cupo.
const canInvite = computed(() => {
  if (!overview.value) return false
  return conditions.value
    ? conditions.value.canInvite
    : overview.value.invitations.quota.remaining > 0
})
const cannotInviteLabel = computed(() =>
  conditions.value ? cannotInviteText(conditions.value) : '',
)
const quotaLabel = computed(() =>
  overview.value ? quotaText(overview.value.invitations.quota) : '',
)
const renewalLabel = computed(() => (conditions.value ? quotaRenewalText(conditions.value) : ''))
const discountLabel = computed(() =>
  overview.value ? discountText(overview.value.invitations.discount.percent) : '',
)
const activeInviteesLabel = computed(() =>
  overview.value ? activeInviteesText(overview.value.invitations.discount.activeInvitees) : '',
)
const groups = computed(() => (conditions.value ? conditionGroups(conditions.value) : []))
const hasInvitees = computed(() => (overview.value?.invitations.invitees.length ?? 0) > 0)

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

function discountNote(invitee: InviteeView): string {
  return inviteeDiscountNote(invitee, overview.value?.invitations.invitees ?? [])
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
@import 'src/css/brand';
@import 'src/css/premium-card';

@include pd-sheen-keyframes;

// Lenguaje del rework (como Perfil, 2026-10-28): página transparente sobre `.app-bg`, títulos de
// bloque en tinta, cards blancas con borde cálido, filas con ícono terracota y pills de Reservas.
.invitados-page {
  background-color: transparent; // la foto de fondo (.app-bg) se ve detrás
}

.invitados-wrap {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 600px;
  margin: 0 auto;
  padding: 16px 16px 32px;
}

.invitados-head {
  &__title {
    margin: 0;
    font-family: 'Montserrat', sans-serif;
    font-size: 22px;
    font-weight: 700;
    line-height: 1.25;
    color: $pd-ink;
  }

  &__lead {
    margin: 2px 0 0;
    font-family: 'Geologica', sans-serif;
    font-size: 14px;
    color: $pd-ink;
  }
}

.invitados-section {
  display: flex;
  flex-direction: column;
  gap: 8px; // título → card
}

// Sobre la PÁGINA el título va en tinta (terracota no llega a AA ahí).
.invitados-title {
  @include mt-block-title;
  margin: 0;
  color: $pd-ink;
}

.invitados-card {
  @include pd-surface-light;
  overflow: hidden;
}

.invitados-cta {
  @include pd-cta;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  &:disabled {
    @include pd-cta-disabled;
  }

  &:focus-visible {
    outline: 2px solid $pd-terra-ink;
    outline-offset: 2px;
  }
}

// ── Cupo ──
.quota {
  padding: 16px;

  &__headline {
    margin: 0;
    font-family: 'Montserrat', sans-serif;
    font-size: 19px;
    font-weight: 700;
    line-height: 1.3;
    color: $pd-ink;
  }

  &__caption {
    margin: 4px 0 0;
    font-family: 'Geologica', sans-serif;
    font-size: 13.5px;
    color: $pd-ink-2;
  }

  &__cta {
    margin-top: 14px;
  }

  &__blocked {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin: 10px 0 0;
    font-family: 'Geologica', sans-serif;
    font-size: 13.5px;
    line-height: 1.4;
    color: $pd-ink-2;

    .q-icon {
      flex: none;
      margin-top: 1px;
      color: $pd-terra-ink;
    }
  }
}

// ── Filas: ícono terracota o inicial, texto y pill ──
.invitados-row {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 52px;
  padding: 12px 16px;
  border-top: 1px solid $pd-light-line;

  &:first-child {
    border-top: 0;
  }

  &__icon {
    flex: none;
    color: $pd-terra-ink;
  }

  &__text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  &__label {
    @include pd-label-11;
    color: $pd-ink-2;
  }

  &__value {
    font-family: 'Geologica', sans-serif;
    font-size: 15px;
    font-weight: 500;
    color: $pd-ink;
    overflow-wrap: anywhere;

    &--muted {
      color: $pd-ink-2;
    }
  }

  &__caption {
    font-family: 'Geologica', sans-serif;
    font-size: 13px;
    line-height: 1.4;
    color: $pd-ink-2;
  }

  // E3: si el invitado suma a mi descuento (salvia) o no (tinta secundaria).
  &__note {
    font-family: 'Geologica', sans-serif;
    font-size: 12.5px;
    font-weight: 600;
    color: $pd-ink-2;

    &--on {
      color: $pd-sage;
    }
  }
}

.invitados-avatar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, $pd-btn-a, $pd-btn-b); // blanco encima ≥ 4.9:1
  font-family: 'Montserrat', sans-serif;
  font-size: 15px;
  font-weight: 700;
  color: #fff;
}

// Mismas pills del rework que Reservas (.week-pill), más el tono terracota de "Entrenando".
.invitados-pill {
  flex: none;
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 999px;
  font-family: 'Geologica', sans-serif;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
  white-space: nowrap;

  &--ok {
    color: $pd-sage;
    background: $pd-sage-tint;
  }

  &--neutral {
    color: $pd-ink-3;
    background: #f3ede4;
  }

  &--warn {
    color: $pd-gold-ink;
    background: $pd-gold-tint;
  }

  &--bad {
    color: $pd-neg-title;
    background: #f7e6e2;
  }

  &--terra {
    color: $pd-btn-b; // 6.9:1 sobre el tinte
    background: #f6e9e0;
  }
}

// ── Estado vacío (dentro de la card) ──
.invitados-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 24px 16px;

  &__icon {
    color: $pd-terra-ink;
  }

  &__heading {
    margin: 10px 0 4px;
    font-family: 'Montserrat', sans-serif;
    font-size: 16px;
    font-weight: 700;
    color: $pd-ink;
  }

  &__body {
    margin: 0;
    max-width: 340px;
    font-family: 'Geologica', sans-serif;
    font-size: 14px;
    line-height: 1.5;
    color: $pd-ink-2;
  }
}

// ── Error ──
.invitados-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 16px;
  text-align: center;

  &__icon {
    color: $pd-neg-title;
  }

  &__text {
    margin: 0;
    font-family: 'Geologica', sans-serif;
    font-size: 14px;
    color: $pd-ink-2;
  }
}
</style>
