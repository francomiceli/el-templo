<template>
  <!-- Perfil con el lenguaje del rework (2026-10-28): página transparente sobre `.app-bg`, títulos de
       bloque en tinta, cards blancas con borde cálido y filas de 52 px. Sin bordes a la izquierda ni
       texto con opacidad. -->
  <q-page class="profile-page">
    <div class="profile-wrap">
      <!-- D-08: sin perfil no se dibuja "Atleta", ni su inicial, ni una sede vacía: esqueleto del
           mismo tamaño (sin tope, lo resuelve retryProfileLoad). -->
      <header v-if="userStore.profile === null" class="profile-head" aria-busy="true">
        <q-skeleton type="circle" size="64px" animation="none" class="profile-head__avatar-sk" />
        <div class="profile-head__info">
          <q-skeleton type="text" animation="none" width="180px" height="28px" />
          <q-skeleton type="text" animation="none" width="220px" height="20px" />
        </div>
      </header>
      <header v-else class="profile-head">
        <button
          type="button"
          class="profile-head__avatar"
          :aria-label="photoAriaLabel"
          @click="photoOpen = true"
        >
          <MemberAvatar
            :size="64"
            :url="shownPhotoUrl"
            :first-name="userStore.profile.firstName ?? null"
            :last-initial="lastInitial"
            :badge="avatarBadge"
            @image-error="onAvatarImageError"
          />
        </button>
        <div class="profile-head__info">
          <h1 class="profile-head__name">{{ userStore.fullName }}</h1>
          <p class="profile-head__email">{{ userStore.profile?.email }}</p>
        </div>
      </header>

      <section class="profile-section">
        <h2 class="profile-title">Tu cuenta</h2>
        <div class="profile-card">
          <div class="profile-row">
            <q-icon name="location_on" size="22px" class="profile-row__icon" aria-hidden="true" />
            <div class="profile-row__text">
              <span class="profile-row__label">Sede</span>
              <q-skeleton
                v-if="userStore.profile === null"
                type="text"
                animation="none"
                width="120px"
                height="22px"
              />
              <span v-else class="profile-row__value">{{ userStore.branchDisplayName }}</span>
            </div>
          </div>
          <!-- Dirección (calle y altura): la pide una vez el pop-up de Mi Templo; acá se carga,
               cambia o borra. Visible para socios de MdP y para quien ya la tenga cargada. -->
          <button
            v-if="showAddressRow"
            type="button"
            class="profile-row profile-row--link"
            @click="openAddressDialog"
          >
            <q-icon name="home" size="22px" class="profile-row__icon" aria-hidden="true" />
            <div class="profile-row__text profile-row__value--grow">
              <span class="profile-row__label">Dirección</span>
              <span v-if="currentAddress" class="profile-row__value">{{ currentAddress }}</span>
              <span v-else class="profile-row__value profile-row__value--muted">Agregar</span>
            </div>
            <q-icon
              name="chevron_right"
              size="22px"
              class="profile-row__chevron"
              aria-hidden="true"
            />
          </button>
          <!-- Plan: solo el nombre y un link; fechas y días viven en Planes (sketch 028) -->
          <router-link to="/planes" class="profile-row profile-row--link">
            <q-icon
              name="card_membership"
              size="22px"
              class="profile-row__icon"
              aria-hidden="true"
            />
            <div class="profile-row__text">
              <span class="profile-row__label">Tu plan</span>
              <!-- D-09: "Sin plan activo" solo con la suscripción llegada y sin falla de red. Mientras
                   no llega, esqueleto; si falló, "No pudimos cargar tu plan" (una falla es "no sé"). -->
              <q-skeleton
                v-if="subscriptionView === 'skeleton'"
                type="text"
                animation="none"
                width="120px"
                height="22px"
              />
              <span v-else-if="subscriptionView === 'content'" class="profile-row__value">{{
                userStore.subscription?.planName
              }}</span>
              <span
                v-else-if="subscriptionView === 'none'"
                class="profile-row__value profile-row__value--muted"
                >Sin plan activo</span
              >
              <span v-else class="profile-row__value profile-row__value--muted"
                >No pudimos cargar tu plan</span
              >
            </div>
            <span class="profile-row__go">Ver en Planes</span>
            <q-icon
              name="chevron_right"
              size="22px"
              class="profile-row__chevron"
              aria-hidden="true"
            />
          </router-link>
        </div>
      </section>

      <!-- Fase 214 (plan 27, UI-SPEC 4b): foto, visibilidad en las listas y detalle del Aura. -->
      <section v-if="showCommunity" id="comunidad" ref="communityRef" class="profile-section">
        <h2 class="profile-title">Comunidad</h2>
        <div class="profile-card">
          <button
            v-if="userStore.profile?.photo !== undefined"
            type="button"
            class="profile-row profile-row--link"
            @click="photoOpen = true"
          >
            <q-icon name="photo_camera" size="22px" class="profile-row__icon" aria-hidden="true" />
            <div class="profile-row__text">
              <span class="profile-row__label">Foto de perfil</span>
              <span
                class="profile-row__value profile-row__value--regular"
                :class="{
                  'profile-row__value--terra': photoRow.tone === 'terra',
                  'profile-row__value--neg': photoRow.tone === 'neg',
                }"
                >{{ photoRow.value }}</span
              >
              <span class="profile-row__caption">{{ photoRow.caption }}</span>
            </div>
            <q-icon
              name="chevron_right"
              size="22px"
              class="profile-row__chevron"
              aria-hidden="true"
            />
          </button>
          <label
            v-if="userStore.profile?.communityVisible !== undefined"
            ref="visibilityRowRef"
            class="profile-row"
            :class="{ 'profile-row--flash': visibilityFlash }"
          >
            <div class="profile-row__text profile-row__value--grow">
              <span class="profile-row__value profile-row__value--regular"
                >Aparecer en las listas de la clase</span
              >
              <span class="profile-row__caption">{{ VISIBILITY_CAPTION }}</span>
            </div>
            <q-toggle
              :model-value="userStore.profile?.communityVisible"
              color="primary"
              @update:model-value="onVisibilityChange"
            />
          </label>
          <button
            v-if="auraEarned !== null"
            type="button"
            class="profile-row profile-row--link"
            :aria-label="`Tu Aura: ${formatAura(auraEarned)}. Ver el detalle`"
            @click="auraOpen = true"
          >
            <q-icon name="auto_awesome" size="22px" class="profile-row__icon" aria-hidden="true" />
            <div class="profile-row__text">
              <span class="profile-row__label">Tu Aura</span>
              <span class="profile-row__aura">
                <span class="profile-row__spark" aria-hidden="true">✦</span>
                {{ formatAura(auraEarned) }}
              </span>
            </div>
            <q-icon
              name="chevron_right"
              size="22px"
              class="profile-row__chevron"
              aria-hidden="true"
            />
          </button>
        </div>
      </section>

      <section class="profile-section">
        <h2 class="profile-title">Ajustes</h2>
        <!-- SPEC "La Guía pasa a ser las historias" (2026-09-24): se retira la entrada "Empezá acá"
             de Ajustes — la Guía ya tiene su propio tab en el nav. -->
        <div class="profile-card">
          <router-link to="/change-password" class="profile-row profile-row--link">
            <q-icon name="lock" size="22px" class="profile-row__icon" aria-hidden="true" />
            <span class="profile-row__value profile-row__value--grow">Cambiar contraseña</span>
            <q-icon
              name="chevron_right"
              size="22px"
              class="profile-row__chevron"
              aria-hidden="true"
            />
          </router-link>
          <router-link to="/mis-invitados" class="profile-row profile-row--link">
            <q-icon name="card_giftcard" size="22px" class="profile-row__icon" aria-hidden="true" />
            <span class="profile-row__value profile-row__value--grow">Mis invitados</span>
            <q-icon
              name="chevron_right"
              size="22px"
              class="profile-row__chevron"
              aria-hidden="true"
            />
          </router-link>
          <router-link to="/proponer-mejora" class="profile-row profile-row--link">
            <q-icon name="lightbulb" size="22px" class="profile-row__icon" aria-hidden="true" />
            <span class="profile-row__value profile-row__value--grow">Proponer una mejora</span>
            <q-icon
              name="chevron_right"
              size="22px"
              class="profile-row__chevron"
              aria-hidden="true"
            />
          </router-link>
        </div>
      </section>

      <section class="profile-section">
        <h2 class="profile-title">Notificaciones</h2>
        <div class="profile-card">
          <div v-if="preferencesLoading" class="flex flex-center q-pa-md">
            <TemploLoader size="sm" />
          </div>
          <template v-else>
            <label v-for="cat in notificationCategories" :key="cat.key" class="profile-row">
              <div class="profile-row__text profile-row__value--grow">
                <span class="profile-row__value">{{ cat.label }}</span>
                <span class="profile-row__caption">{{ cat.description }}</span>
              </div>
              <q-toggle
                :model-value="preferences[cat.key]"
                color="primary"
                @update:model-value="(val: boolean) => togglePreference(cat.key, val)"
              />
            </label>
          </template>
        </div>
      </section>

      <div class="profile-card">
        <button
          type="button"
          class="profile-row profile-row--link profile-row--danger"
          @click="showDeleteDialog = true"
        >
          <q-icon name="delete_outline" size="22px" class="profile-row__icon" aria-hidden="true" />
          <span class="profile-row__value profile-row__value--grow">Eliminar cuenta</span>
          <q-icon
            name="chevron_right"
            size="22px"
            class="profile-row__chevron"
            aria-hidden="true"
          />
        </button>
      </div>
    </div>

    <ProfilePhotoSheet v-model="photoOpen" />
    <AuraDetailSheet v-if="auraEarned !== null" v-model="auraOpen" />

    <!-- Dirección: mismo par de campos que el pop-up de Mi Templo, en el diálogo claro de trámites. -->
    <q-dialog v-model="showAddressDialog">
      <PremiumDialogCard tone="light">
        <h3 class="pd-title">Tu dirección</h3>
        <p class="pd-text">
          Con la calle y la altura alcanza. Nos ayuda a decidir dónde abrir nuevas sedes y qué
          horarios sumar.
        </p>
        <AddressFields
          v-model:street="addressStreet"
          v-model:number="addressNumber"
          autofocus
          @submit="saveAddressFromProfile"
        />
        <p v-if="addressError" class="pd-help profile-address__error" role="alert">
          {{ addressError }}
        </p>
        <p class="pd-help">
          Es opcional. Solo la ve el equipo de El Templo y no la compartimos con nadie.
        </p>
        <div class="pd-acts">
          <q-btn
            unelevated
            no-caps
            class="pd-cta"
            label="Guardar"
            :disable="!canSaveAddress"
            :loading="addressSaving === 'save'"
            @click="saveAddressFromProfile"
          />
          <q-btn
            v-if="currentAddress"
            flat
            no-caps
            dense
            class="pd-skip"
            label="Borrar mi dirección"
            :loading="addressSaving === 'clear'"
            @click="clearAddressFromProfile"
          />
          <q-btn
            flat
            no-caps
            dense
            class="pd-skip"
            label="Cancelar"
            @click="showAddressDialog = false"
          />
        </div>
      </PremiumDialogCard>
    </q-dialog>

    <!-- Delete Account Dialog (sketch 012 A: destructivo en rojo, sin destello) -->
    <q-dialog v-model="showDeleteDialog" persistent>
      <PremiumDialogCard tone="light">
        <h3 class="pd-title pd-title--neg">Eliminar cuenta</h3>
        <p class="pd-text">
          Esta acción es <strong>permanente</strong>. Se eliminarán todos tus datos personales y no
          podrás recuperar tu cuenta.
        </p>
        <q-input
          v-model="deletePassword"
          class="pd-input"
          type="password"
          label="Confirmá tu contraseña"
          outlined
          :error="!!deleteError"
          :error-message="deleteError"
        />
        <div class="pd-acts">
          <q-btn
            unelevated
            no-caps
            class="pd-cta pd-cta--neg"
            label="Eliminar cuenta"
            :loading="deleteLoading"
            :disable="!deletePassword"
            @click="confirmDeleteAccount"
          />
          <q-btn flat no-caps dense class="pd-skip" label="Cancelar" @click="cancelDelete" />
        </div>
      </PremiumDialogCard>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, reactive, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { useUserStore, MEMBER_STATE_MAX_AGE_MS } from 'stores/useUserStore'
import { useAuthStore } from 'stores/useAuthStore'
import { api } from 'src/boot/axios'
import { createLogger } from 'src/utils/logger'
import { extractError } from 'src/utils/extract-error'
import { useLoadDeadline } from 'src/composables/useLoadDeadline'
import { resolveProfileSubscriptionView } from 'src/utils/profile-subscription-view'
import TemploLoader from 'src/components/TemploLoader.vue'
import PremiumDialogCard from 'src/components/PremiumDialogCard.vue'
import AddressFields from 'src/components/AddressFields.vue'
import MemberAvatar from 'src/components/MemberAvatar.vue'
import ProfilePhotoSheet from 'src/components/ProfilePhotoSheet.vue'
import AuraDetailSheet from 'src/components/AuraDetailSheet.vue'
import { useCommunityApi } from 'src/composables/useCommunityApi'
import { formatAura } from 'src/utils/aura-format'
import {
  defaultPreferences,
  visibleNotificationCategories,
} from 'src/utils/notification-categories'
import { rejectionReasonLabel } from 'src/utils/photo-messages'
import { AURA_AMOUNTS_UI } from 'src/constants/aura-amounts'
import { ADDRESS_PROMPT_LOCALITY, composeAddress, splitAddress } from 'src/utils/member-address'

const log = createLogger('ProfilePage')
const route = useRoute()
const router = useRouter()
const $q = useQuasar()
const community = useCommunityApi()
const userStore = useUserStore()
const authStore = useAuthStore()
const deadline = useLoadDeadline()

/**
 * Qué dice la fila "Tu plan" (D-09): "todavía no sé" y "no pudimos cargarlo" nunca se dibujan
 * como "Sin plan activo".
 */
const subscriptionView = computed(() =>
  resolveProfileSubscriptionView({
    subscriptionLoaded: userStore.subscriptionLoaded,
    subscriptionFailed: userStore.subscriptionFailed,
    hasActivePlan: userStore.hasActiveSubscription,
    deadlinePassed: deadline.passed.value,
  }),
)

/** Foto propia (fase 214): la aprobada o, si solo hay una pendiente, esa con la insignia de revisión. */
const photoState = computed(() => userStore.profile?.photo ?? null)
const approvedUrl = computed(() => photoState.value?.url ?? null)
const pendingUrl = computed(() => photoState.value?.pendingUrl ?? null)
const shownPhotoUrl = computed(() => approvedUrl.value ?? pendingUrl.value)
const lastInitial = computed(() => userStore.profile?.lastName?.trim().charAt(0) ?? null)
const avatarBadge = computed<'review' | 'camera' | null>(() => {
  if (pendingUrl.value) return 'review'
  return shownPhotoUrl.value ? null : 'camera'
})
// Mismo texto que el encabezado de Mi Templo.
const photoAriaLabel = computed(() => {
  if (approvedUrl.value && pendingUrl.value) {
    return 'Tu foto de perfil. Tenés una foto nueva en revisión'
  }
  if (approvedUrl.value) return 'Tu foto de perfil'
  if (pendingUrl.value) return 'Tu foto está en revisión'
  return 'Subí tu foto de perfil'
})
const photoOpen = ref(false)
const auraOpen = ref(false)

// URL firmada vencida: se vuelve a pedir `/me` una sola vez; después quedan las iniciales.
let refetchedOnce = false
function onAvatarImageError(): void {
  if (refetchedOnce) return
  refetchedOnce = true
  void userStore.refreshProfile()
}

// Sección "Comunidad" (UI-SPEC 4b). Con una API vieja sin los campos, no se ofrece lo que no existe.
const showCommunity = computed(() => {
  const p = userStore.profile
  if (!p) return false
  return p.photo !== undefined || p.communityVisible !== undefined || userStore.auraVisible
})
const auraEarned = computed<number | null>(() =>
  userStore.auraVisible ? (userStore.profile?.auraEarned ?? null) : null,
)

interface PhotoRow {
  value: string
  caption: string
  tone: 'ink' | 'terra' | 'neg'
}
const photoRow = computed<PhotoRow>(() => {
  const state = photoState.value
  switch (state?.status) {
    case 'pendiente':
      return {
        value: 'En revisión',
        caption: 'La ven tus compañeros cuando la aprobemos.',
        tone: 'ink',
      }
    case 'aprobada':
      return {
        value: 'Aprobada',
        caption: 'Aparece en las listas de la clase.',
        tone: 'ink',
      }
    case 'rechazada': {
      // Supuesto registrado en 214-DECISIONES-AUTONOMAS.md §5 (D-69).
      const label = rejectionReasonLabel(state.rejectionReason)
      return {
        value: 'No fue aprobada',
        caption: label ? `Motivo: ${label}. Podés subir otra.` : 'Podés subir otra.',
        tone: 'neg',
      }
    }
    default:
      return {
        value: 'Subí tu foto',
        caption: `La primera foto aprobada suma ${AURA_AMOUNTS_UI.profilePhoto} de Aura.`,
        tone: 'terra',
      }
  }
})

const VISIBILITY_CAPTION =
  'Tus compañeros ven tu nombre de pila, la inicial de tu apellido, tu foto y tu Aura. Si lo apagás, vos tampoco ves quiénes van.'
const visibilitySaving = ref(false)

/** Optimista: el interruptor cambia ya; si el servidor no lo guarda, vuelve atrás (T-214-27-01). */
async function onVisibilityChange(next: boolean): Promise<void> {
  const previous = userStore.profile?.communityVisible
  if (visibilitySaving.value || previous === undefined || previous === next) return
  visibilitySaving.value = true
  userStore.setCommunityVisible(next)
  try {
    await community.setVisibility(next)
    $q.notify({
      type: 'positive',
      message: next ? 'Listo, ya aparecés en las listas.' : 'Listo, ya no aparecés en las listas.',
    })
  } catch (err: unknown) {
    userStore.setCommunityVisible(previous)
    log.error('No se pudo guardar la visibilidad en las listas', {
      error: err instanceof Error ? err.message : String(err),
    })
    $q.notify({ type: 'negative', message: 'No pudimos guardar el cambio. Probá de nuevo.' })
  } finally {
    visibilitySaving.value = false
  }
}

// Aterrizaje desde "Ocultarme" de la hoja de anotados (`/profile#comunidad`): baja a la sección,
// enfoca el interruptor y lo resalta 2 s.
const communityRef = ref<HTMLElement | null>(null)
const visibilityRowRef = ref<HTMLElement | null>(null)
const visibilityFlash = ref(false)
let flashTimer: ReturnType<typeof setTimeout> | null = null
let landed = false

async function landOnCommunity(): Promise<void> {
  if (landed || route.hash !== '#comunidad') return
  await nextTick()
  const section = communityRef.value
  if (!section) return
  landed = true
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  section.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  visibilityRowRef.value?.querySelector<HTMLElement>('[role="switch"], [role="checkbox"]')?.focus({
    preventScroll: true,
  })
  visibilityFlash.value = true
  flashTimer = setTimeout(() => {
    visibilityFlash.value = false
    flashTimer = null
  }, 2000)
}

// La sección solo existe con el perfil cargado: se aterriza apenas aparece.
watch(showCommunity, (visible) => {
  if (visible) void landOnCommunity()
})

// Notification categories (per D-18; #30 suma "Regalos de Aura", solo con el módulo de Aura prendido)
const notificationCategories = computed(() => visibleNotificationCategories(userStore.auraVisible))

// Notification preferences state
const preferencesLoading = ref(true)
const preferences = reactive<Record<string, boolean>>(defaultPreferences())

async function loadPreferences() {
  preferencesLoading.value = true
  try {
    const res = await api.get<{ preferences: Record<string, boolean> }>(
      '/notifications/preferences',
    )
    Object.assign(preferences, res.data.preferences)
  } catch (err: unknown) {
    log.warn('Failed to load notification preferences', {
      error: err instanceof Error ? err.message : String(err),
    })
  } finally {
    preferencesLoading.value = false
  }
}

async function togglePreference(key: string, value: boolean) {
  preferences[key] = value
  try {
    await api.put('/notifications/preferences', { category: key, enabled: value })
  } catch (err: unknown) {
    // Revert on failure
    preferences[key] = !value
    log.error('Failed to update notification preference', {
      key,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// Dirección (calle y altura). PII: nunca va al log.
const currentAddress = computed(() => userStore.profile?.address ?? null)
const showAddressRow = computed(() => {
  const p = userStore.profile
  if (!p || p.role !== 'member') return false
  // `undefined` = API vieja sin el campo: no se ofrece algo que no se puede leer ni guardar.
  if (p.address === undefined) return false
  return p.branchLocality === ADDRESS_PROMPT_LOCALITY || p.address !== null
})
const showAddressDialog = ref(false)
const addressStreet = ref('')
const addressNumber = ref('')
const addressSaving = ref<'save' | 'clear' | null>(null)
const addressError = ref('')
const composedAddress = computed(() =>
  composeAddress({ street: addressStreet.value, number: addressNumber.value }),
)
const canSaveAddress = computed(
  () => composedAddress.value !== null && composedAddress.value !== currentAddress.value,
)

function openAddressDialog() {
  const parts = splitAddress(currentAddress.value)
  addressStreet.value = parts.street
  addressNumber.value = parts.number
  addressError.value = ''
  showAddressDialog.value = true
}

async function persistAddress(address: string | null, mode: 'save' | 'clear') {
  if (addressSaving.value) return
  addressSaving.value = mode
  addressError.value = ''
  try {
    await userStore.saveAddress(address)
    showAddressDialog.value = false
  } catch (err: unknown) {
    log.warn('Address save failed', { error: err instanceof Error ? err.message : String(err) })
    addressError.value = extractError(err, 'No pudimos guardarla. Probá de nuevo.')
  } finally {
    addressSaving.value = null
  }
}

function saveAddressFromProfile() {
  if (!canSaveAddress.value) return
  void persistAddress(composedAddress.value, 'save')
}

function clearAddressFromProfile() {
  void persistAddress(null, 'clear')
}

// Delete account
const showDeleteDialog = ref(false)
const deletePassword = ref('')
const deleteLoading = ref(false)
const deleteError = ref('')

function cancelDelete() {
  showDeleteDialog.value = false
  deletePassword.value = ''
  deleteError.value = ''
}

async function confirmDeleteAccount() {
  deleteLoading.value = true
  deleteError.value = ''
  try {
    await authStore.deleteAccount(deletePassword.value)
    router.replace('/login')
  } catch (err: unknown) {
    deleteError.value = extractError(err, 'Error al eliminar cuenta')
  } finally {
    deleteLoading.value = false
  }
}

onMounted(() => {
  deadline.start()
  // En el mismo tick y en paralelo (ninguna espera a la otra): el estado del socio se comparte con el arranque
  // (dentro de la frescura no pide nada) y las preferencias no esperan a la suscripción.
  void userStore.ensureMemberState({ maxAgeMs: MEMBER_STATE_MAX_AGE_MS })
  void loadPreferences()
  void landOnCommunity()
})

onBeforeUnmount(() => {
  deadline.cleanup()
  community.cleanup()
  if (flashTimer !== null) clearTimeout(flashTimer)
})
</script>

<style scoped lang="scss">
@import 'src/css/brand';
@import 'src/css/premium-card';

.profile-page {
  background-color: transparent; // la foto de fondo (.app-bg) se ve detrás
}

.profile-wrap {
  display: flex;
  flex-direction: column;
  gap: 16px; // entre bloques (Franco: menos aire alrededor de los títulos)
  max-width: 600px;
  margin: 0 auto;
  padding: 16px 16px 32px;
}

// ── Encabezado: iniciales en el círculo terracota, nombre y mail en tinta sobre la página ──
.profile-head {
  display: flex;
  align-items: center;
  gap: 16px;

  &__avatar {
    // Botón que abre la hoja de foto (UI-SPEC 4a): sin aro, la insignia sale de MemberAvatar.
    flex: none;
    display: block;
    width: 64px;
    height: 64px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;

    &:focus-visible {
      outline: 2px solid $pd-terra-ink;
      outline-offset: 3px;
    }
  }

  &__avatar-sk {
    flex: none;
  }

  &__info {
    min-width: 0;
  }

  &__name {
    margin: 0;
    font-family: 'Montserrat', sans-serif;
    font-size: 22px;
    font-weight: 700;
    line-height: 1.25;
    color: $pd-ink;
    overflow-wrap: anywhere;
  }

  &__email {
    margin: 2px 0 0;
    font-family: 'Geologica', sans-serif;
    font-size: 14px;
    color: $pd-ink;
    overflow-wrap: anywhere;
  }
}

.profile-section {
  display: flex;
  flex-direction: column;
  gap: 8px; // título → card
}

// Título de bloque del rework; sobre la PÁGINA va en tinta (terracota no llega a AA ahí).
.profile-title {
  @include mt-block-title;
  margin: 0;
  color: $pd-ink;
}

.profile-card {
  @include pd-surface-light;
  overflow: hidden;
}

// ── Filas: 52 px, ícono terracota, separador interno ──
.profile-row {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 52px;
  padding: 10px 16px;
  border: 0;
  background: none;
  text-align: left;
  text-decoration: none;
  color: $pd-ink;
  font: inherit;

  & + & {
    border-top: 1px solid $pd-light-line;
  }

  &--link {
    cursor: pointer;
    transition: background-color 0.15s ease;

    &:active {
      background-color: #f8f3ec;
    }

    &:focus-visible {
      outline: 2px solid $pd-terra-ink;
      outline-offset: -2px;
    }
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

    &--grow {
      flex: 1;
      min-width: 0;
    }

    &--muted {
      color: $pd-ink-2;
    }

    // Filas de Comunidad (UI-SPEC 4b): valor en 400, no en 500 como las filas viejas.
    &--regular {
      font-weight: 400;
    }

    &--terra {
      color: $pd-terra-ink;
    }

    &--neg {
      color: $pd-neg-title;
    }
  }

  // Valor de Tu Aura: número en Montserrat 700, dorado de texto sobre claro.
  &__aura {
    font-family: 'Montserrat', sans-serif;
    font-size: 15px;
    font-weight: 700;
    color: $pd-gold-ink;
  }

  &__spark {
    color: $pd-gold; // decorativa
  }

  // Resalte del interruptor al llegar desde "Ocultarme": contorno fijo, sin movimiento.
  &--flash {
    outline: 2px solid $pd-terra-ink;
    outline-offset: -2px;
  }

  &__caption {
    font-family: 'Geologica', sans-serif;
    font-size: 13px;
    line-height: 1.35;
    color: $pd-ink-2;
  }

  &__go {
    flex: none;
    font-family: 'Geologica', sans-serif;
    font-size: 13px;
    font-weight: 600;
    color: $pd-terra-ink;
  }

  &__chevron {
    flex: none;
    margin-right: -6px;
    color: $pd-light-edge;
  }

  &--danger {
    .profile-row__icon,
    .profile-row__value {
      color: $pd-neg-title;
    }
  }
}

// Error del diálogo de dirección: doble clase para ganarle al `:slotted(.pd-help)` del marco.
.pd-help.profile-address__error {
  color: $pd-neg-title;
}
</style>
