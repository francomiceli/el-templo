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
        <div class="profile-head__avatar" aria-hidden="true">{{ initials }}</div>
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
import { computed, ref, onMounted, onBeforeUnmount, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore, MEMBER_STATE_MAX_AGE_MS } from 'stores/useUserStore'
import { useAuthStore } from 'stores/useAuthStore'
import { api } from 'src/boot/axios'
import { createLogger } from 'src/utils/logger'
import { extractError } from 'src/utils/extract-error'
import { useLoadDeadline } from 'src/composables/useLoadDeadline'
import { resolveProfileSubscriptionView } from 'src/utils/profile-subscription-view'
import TemploLoader from 'src/components/TemploLoader.vue'
import PremiumDialogCard from 'src/components/PremiumDialogCard.vue'

const log = createLogger('ProfilePage')
const router = useRouter()
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

/** Iniciales del avatar (nombre y apellido). Solo se dibuja con el perfil cargado (D-08). */
const initials = computed(() => {
  const parts = userStore.fullName.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
})

// Notification categories (per D-18)
const notificationCategories = [
  {
    key: 'entrenamiento',
    label: 'Entrenamiento',
    description: 'Recordatorios de check-in, resumen semanal',
  },
  {
    key: 'programas',
    label: 'Programas',
    description: 'Confirmación de inscripción, avance semanal',
  },
  {
    key: 'planes',
    label: 'Planes',
    description: 'Cuando cargamos tu plan y avisos de vencimiento',
  },
  {
    key: 'anuncios',
    label: 'Novedades',
    description: 'Nuevas funciones y actualizaciones',
  },
]

// Notification preferences state
const preferencesLoading = ref(true)
const preferences = reactive<Record<string, boolean>>({
  entrenamiento: true,
  programas: true,
  planes: true,
  anuncios: true,
})

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
})

onBeforeUnmount(() => deadline.cleanup())
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
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: linear-gradient(135deg, $pd-btn-a, $pd-btn-b); // blanco encima ≥ 4.9:1
    box-shadow: 0 6px 16px rgba(126, 69, 41, 0.25);
    font-family: 'Montserrat', sans-serif;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: #fff;
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
</style>
