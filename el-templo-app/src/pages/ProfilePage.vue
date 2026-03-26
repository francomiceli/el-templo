<template>
  <q-page class="profile-page">
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

    <!-- Details -->
    <q-card class="profile-card" flat bordered>
      <q-list>
        <q-item>
          <q-item-section avatar>
            <q-icon name="location_on" color="secondary" size="22px" />
          </q-item-section>
          <q-item-section>
            <q-item-label class="profile-label">Sucursal</q-item-label>
            <q-item-label class="profile-value">{{ userStore.branchDisplayName }}</q-item-label>
          </q-item-section>
        </q-item>
      </q-list>
    </q-card>

    <!-- Subscription -->
    <q-card class="profile-card" flat bordered>
      <q-card-section class="profile-card__header">
        <span class="profile-card__title">Mi Suscripcion</span>
      </q-card-section>

      <q-separator />

      <q-card-section>
        <div v-if="userStore.subscriptionLoading" class="flex flex-center q-pa-md">
          <q-spinner-dots size="30px" color="primary" />
        </div>

        <template v-else-if="userStore.subscription">
          <div class="subscription-plan">
            <span class="subscription-plan__name">
              {{ userStore.subscription.planName }}
            </span>
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
        </template>

        <div v-else class="text-center q-pa-sm">
          <div class="text-grey-5 text-italic">Sin suscripcion activa</div>
        </div>
      </q-card-section>
    </q-card>

    <!-- Notificaciones (per D-18, D-21) -->
    <q-card class="profile-card" flat bordered>
      <q-card-section class="profile-card__header">
        <span class="profile-card__title">Notificaciones</span>
      </q-card-section>

      <q-separator />

      <q-card-section>
        <div v-if="preferencesLoading" class="flex flex-center q-pa-sm">
          <q-spinner-dots size="24px" color="primary" />
        </div>
        <q-list v-else>
          <q-item v-for="cat in notificationCategories" :key="cat.key" tag="label">
            <q-item-section>
              <q-item-label class="profile-value">{{ cat.label }}</q-item-label>
              <q-item-label caption class="profile-label">{{ cat.description }}</q-item-label>
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
      </q-card-section>
    </q-card>

    <!-- Ajustes (per D-21: Cambiar contrasena grouped with settings) -->
    <q-card class="profile-card" flat bordered>
      <q-card-section class="profile-card__header">
        <span class="profile-card__title">Ajustes</span>
      </q-card-section>

      <q-separator />

      <q-list>
        <q-item clickable v-ripple to="/change-password">
          <q-item-section avatar>
            <q-icon name="lock" color="secondary" size="22px" />
          </q-item-section>
          <q-item-section class="profile-value">Cambiar contrasena</q-item-section>
          <q-item-section side>
            <q-icon name="chevron_right" color="grey-5" />
          </q-item-section>
        </q-item>
      </q-list>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue'
import { useUserStore } from 'stores/useUserStore'
import { formatDate } from 'src/utils/format-date'
import { api } from 'src/boot/axios'
import { createLogger } from 'src/utils/logger'

const log = createLogger('ProfilePage')
const userStore = useUserStore()

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
    key: 'motivacion',
    label: 'Motivacion',
    description: 'Mensajes de re-engagement, celebraciones',
  },
  {
    key: 'anuncios',
    label: 'Anuncios',
    description: 'Comunicados del gimnasio',
  },
] as const

type NotificationCategory = 'entrenamiento' | 'programas' | 'motivacion' | 'anuncios'

const preferencesLoading = ref(true)
const preferences = reactive<Record<NotificationCategory, boolean>>({
  entrenamiento: true,
  programas: true,
  motivacion: true,
  anuncios: true,
})

async function loadPreferences() {
  try {
    const { data } = await api.get<{
      preferences: Record<NotificationCategory, boolean>
    }>('/api/notifications/preferences')
    Object.assign(preferences, data.preferences)
  } catch (err: unknown) {
    log.error('Failed to load notification preferences', {
      error: err instanceof Error ? err.message : String(err),
    })
  } finally {
    preferencesLoading.value = false
  }
}

async function togglePreference(category: NotificationCategory, enabled: boolean) {
  // Optimistic update
  preferences[category] = enabled
  try {
    await api.put('/api/notifications/preferences', { category, enabled })
  } catch (err: unknown) {
    // Revert on failure
    preferences[category] = !enabled
    log.error('Failed to update preference', {
      error: err instanceof Error ? err.message : String(err),
      category,
    })
  }
}

onMounted(() => {
  userStore.loadSubscription()
  loadPreferences()
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.profile-page {
  max-width: 500px;
  margin: 0 auto;
  padding: 16px;
}

.profile-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.profile-header__avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, $primary, $secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.profile-header__info {
  flex: 1;
  min-width: 0;
}

.profile-header__name {
  font-family: 'Montserrat', sans-serif;
  font-size: 17px;
  font-weight: 600;
  color: $accent;
  line-height: 1.3;
}

.profile-header__email {
  font-size: 13px;
  color: rgba($accent, 0.5);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-card {
  border-radius: 12px;
  border-color: rgba($primary, 0.12);
  margin-bottom: 10px;

  &__header {
    padding-bottom: 10px;
  }

  &__title {
    font-family: 'Montserrat', sans-serif;
    font-size: 14px;
    font-weight: 600;
    color: $accent;
  }
}

.profile-label {
  font-size: 12px;
  color: rgba($accent, 0.5);
}

.profile-value {
  font-size: 14px;
  color: $accent;
}

.subscription-plan {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;

  &__name {
    font-size: 15px;
    font-weight: 600;
    color: $accent;
  }
}

.subscription-details {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.subscription-detail {
  text-align: center;

  &__label {
    display: block;
    font-size: 11px;
    color: rgba($accent, 0.45);
    margin-bottom: 2px;
  }

  &__value {
    font-size: 14px;
    font-weight: 500;
    color: $accent;
  }
}
</style>
