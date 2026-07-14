<template>
  <q-page class="profile-page" padding>
    <!-- Profile Header -->
    <div class="profile-header">
      <div class="profile-header__avatar">
        <q-icon name="person" size="36px" color="white" />
      </div>
      <div class="profile-header__info">
        <div class="profile-header__name">{{ userStore.fullName || 'Atleta' }}</div>
        <div class="profile-header__email">{{ userStore.profile?.email }}</div>
      </div>
    </div>

    <!-- Sucursal -->
    <div class="info-card q-mb-md">
      <q-icon name="location_on" size="24px" color="primary" class="info-card__icon" />
      <div class="info-card__content">
        <span class="info-card__label">Sucursal</span>
        <span class="info-card__value">{{ userStore.branchDisplayName }}</span>
      </div>
    </div>

    <!-- Subscription -->
    <div class="info-card q-mb-md">
      <q-icon name="card_membership" size="24px" color="primary" class="info-card__icon" />
      <div v-if="userStore.subscriptionLoading" class="info-card__content">
        <TemploLoader size="sm" />
      </div>
      <div v-else-if="userStore.subscription" class="info-card__content">
        <div class="info-card__row">
          <span class="info-card__value">{{ userStore.subscription.planName }}</span>
          <q-badge
            :color="userStore.subscriptionStatusColor"
            :label="userStore.subscriptionStatusLabel"
          />
        </div>
        <div class="subscription-details">
          <div class="subscription-detail">
            <span class="subscription-detail__label">Inicio</span>
            <span class="subscription-detail__value">{{
              formatDate(userStore.subscription.startDate)
            }}</span>
          </div>
          <div class="subscription-detail">
            <span class="subscription-detail__label">Vencimiento</span>
            <span class="subscription-detail__value">{{
              userStore.subscription.endDate ? formatDate(userStore.subscription.endDate) : '—'
            }}</span>
          </div>
          <div class="subscription-detail">
            <span class="subscription-detail__label">Dias restantes</span>
            <span
              class="subscription-detail__value"
              :class="{
                'text-negative text-weight-bold': userStore.subscription.daysRemaining < 7,
              }"
            >
              {{ userStore.subscription.daysRemaining }}
            </span>
          </div>
        </div>
      </div>
      <div v-else class="info-card__content">
        <span class="info-card__label">Mi Suscripcion</span>
        <span class="info-card__value text-grey-5 text-italic">Sin suscripcion activa</span>
      </div>
    </div>

    <!-- Ajustes -->
    <p class="section-title">Ajustes</p>
    <div class="settings-card q-mb-md">
      <div
        class="settings-card__item settings-card__item--clickable"
        @click="$router.push('/change-password')"
      >
        <q-icon name="lock" size="22px" color="primary" />
        <span class="settings-card__label">Cambiar contraseña</span>
        <q-icon name="chevron_right" size="20px" color="grey-5" class="settings-card__chevron" />
      </div>

      <div class="settings-card__divider" />

      <div
        class="settings-card__item settings-card__item--clickable"
        @click="$router.push('/mis-referidos')"
      >
        <q-icon name="card_giftcard" size="22px" color="primary" />
        <span class="settings-card__label">Mis referidos</span>
        <q-icon name="chevron_right" size="20px" color="grey-5" class="settings-card__chevron" />
      </div>

      <div class="settings-card__divider" />

      <div class="settings-card__section-label">
        <q-icon name="notifications" size="18px" color="grey-6" />
        <span>Notificaciones</span>
      </div>

      <div v-if="preferencesLoading" class="flex flex-center q-pa-sm">
        <TemploLoader size="sm" />
      </div>
      <q-list v-else class="notification-list">
        <q-item v-for="cat in notificationCategories" :key="cat.key" tag="label" dense>
          <q-item-section>
            <q-item-label class="settings-card__label">{{ cat.label }}</q-item-label>
            <q-item-label caption class="text-grey-6">{{ cat.description }}</q-item-label>
          </q-item-section>
          <q-item-section side>
            <q-toggle
              :model-value="preferences[cat.key]"
              color="primary"
              @update:model-value="(val: boolean) => togglePreference(cat.key, val)"
            />
          </q-item-section>
        </q-item>
      </q-list>
    </div>

    <!-- Delete Account -->
    <div class="settings-card q-mb-md">
      <div
        class="settings-card__item settings-card__item--clickable settings-card__item--danger"
        @click="showDeleteDialog = true"
      >
        <q-icon name="delete_forever" size="22px" color="negative" />
        <span class="settings-card__label settings-card__label--danger">Eliminar cuenta</span>
        <q-icon name="chevron_right" size="20px" color="grey-5" class="settings-card__chevron" />
      </div>
    </div>

    <!-- Delete Account Dialog -->
    <q-dialog v-model="showDeleteDialog" persistent>
      <q-card style="min-width: 320px">
        <q-card-section>
          <div class="text-h6 text-negative">Eliminar cuenta</div>
        </q-card-section>
        <q-card-section>
          <p class="q-mb-sm">
            Esta accion es <strong>permanente</strong>. Se eliminaran todos tus datos personales y
            no podras recuperar tu cuenta.
          </p>
          <q-input
            v-model="deletePassword"
            type="password"
            label="Confirma tu contraseña"
            outlined
            dense
            :error="!!deleteError"
            :error-message="deleteError"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" @click="cancelDelete" />
          <q-btn
            flat
            label="Eliminar cuenta"
            color="negative"
            :loading="deleteLoading"
            :disable="!deletePassword"
            @click="confirmDeleteAccount"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from 'stores/useUserStore'
import { useAuthStore } from 'stores/useAuthStore'
import { formatDate } from 'src/utils/format-date'
import { api } from 'src/boot/axios'
import { createLogger } from 'src/utils/logger'
import { extractError } from 'src/utils/extract-error'
import TemploLoader from 'src/components/TemploLoader.vue'

const log = createLogger('ProfilePage')
const router = useRouter()
const userStore = useUserStore()
const authStore = useAuthStore()

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
    description: 'Confirmacion de inscripcion, avance semanal',
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

onMounted(async () => {
  if (!userStore.subscription && !userStore.subscriptionLoading) {
    await userStore.loadSubscription()
  }
  loadPreferences()
})
</script>

<style scoped lang="scss">
@use 'sass:color';
@import 'src/css/quasar.variables.scss';

.profile-page {
  max-width: 600px;
  margin: 0 auto;
}

.profile-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 0 20px;

  &__avatar {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: linear-gradient(135deg, $primary, color.adjust($primary, $lightness: 8%));
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  &__name {
    font-family: 'Montserrat', sans-serif;
    font-size: 20px;
    font-weight: 700;
    color: $primary;
  }

  &__email {
    font-size: 13px;
    color: $grey-7;
    margin-top: 2px;
  }
}

.section-title {
  font-family: 'Montserrat', sans-serif;
  font-size: 14px;
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

  &--clickable {
    cursor: pointer;
    align-items: center;
    transition: box-shadow 0.15s ease;

    &:active {
      box-shadow: 0 0 0 2px rgba($primary, 0.15);
    }
  }

  &__icon {
    flex-shrink: 0;
    margin-top: 2px;
  }

  &__content {
    flex: 1;
    min-width: 0;

    &--full {
      margin-left: -36px; // align with card edge past icon
      padding-left: 36px;
    }
  }

  &__row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  &__label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba($primary, 0.5);
    display: block;
  }

  &__value {
    font-family: 'Montserrat', sans-serif;
    font-size: 14px;
    font-weight: 600;
    color: $primary;
  }
}

.subscription-details {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.subscription-detail {
  display: flex;
  justify-content: space-between;
  align-items: center;

  &__label {
    font-size: 13px;
    color: rgba($accent, 0.5);
  }

  &__value {
    font-size: 14px;
    font-weight: 500;
    color: $accent;
  }
}

.settings-card {
  background: white;
  border: 1px solid rgba($primary, 0.15);
  border-radius: 12px;
  border-left: 4px solid $primary;
  padding: 0;
  overflow: hidden;

  &__item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;

    &--clickable {
      cursor: pointer;
      transition: background 0.15s ease;

      &:active {
        background: rgba($primary, 0.04);
      }
    }
  }

  &__label {
    font-family: 'Montserrat', sans-serif;
    font-size: 14px;
    font-weight: 600;
    color: $primary;
    flex: 1;
  }

  &__chevron {
    flex-shrink: 0;
  }

  &__divider {
    height: 1px;
    background: rgba($primary, 0.08);
    margin: 0 16px;
  }

  &__section-label {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px 4px;
    font-size: 11px;
    font-weight: 600;
    color: $grey-6;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
}

.settings-card__item--danger {
  &:active {
    background: rgba($negative, 0.04);
  }
}

.settings-card__label--danger {
  color: $negative !important;
}

.notification-list {
  padding: 0 8px;

  :deep(.q-item) {
    padding: 6px 8px;
  }
}
</style>
