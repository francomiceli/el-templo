<template>
  <q-page class="profile-page" padding>
    <!-- Profile Header -->
    <div class="profile-header">
      <div class="profile-header__avatar">
        <q-icon name="person" size="40px" color="white" />
      </div>
      <div class="profile-header__info">
        <div class="profile-header__name">{{ userStore.fullName || 'Atleta' }}</div>
        <div class="profile-header__email">{{ userStore.profile?.email }}</div>
      </div>
      <q-badge
        v-if="userStore.profile?.level"
        :color="levelColor"
        :label="userStore.displayLevel"
        class="profile-header__level"
      />
    </div>

    <!-- Details Card -->
    <q-card class="profile-card" flat bordered>
      <q-list separator>
        <q-item>
          <q-item-section avatar>
            <q-icon name="location_on" color="secondary" />
          </q-item-section>
          <q-item-section>
            <q-item-label caption>Sucursal</q-item-label>
            <q-item-label>{{ userStore.profile?.branchName }}</q-item-label>
          </q-item-section>
        </q-item>

        <q-item>
          <q-item-section avatar>
            <q-icon name="military_tech" color="secondary" />
          </q-item-section>
          <q-item-section>
            <q-item-label caption>Nivel</q-item-label>
            <q-item-label>
              <q-badge :color="levelColor" :label="userStore.displayLevel" />
            </q-item-label>
          </q-item-section>
        </q-item>
      </q-list>
    </q-card>

    <!-- Subscription Card -->
    <q-card class="profile-card" flat bordered>
      <q-card-section class="profile-card__header">
        <q-icon name="card_membership" color="primary" size="20px" />
        <span class="profile-card__title">Mi Suscripción</span>
      </q-card-section>

      <q-separator />

      <q-card-section>
        <!-- Loading -->
        <div v-if="userStore.subscriptionLoading" class="flex flex-center q-pa-md">
          <q-spinner-dots size="30px" color="primary" />
        </div>

        <!-- Has subscription -->
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
              <span class="subscription-detail__label">Días restantes</span>
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

        <!-- No subscription -->
        <div v-else class="text-center q-pa-sm">
          <div class="text-grey-5 text-italic">Sin suscripción activa</div>
        </div>
      </q-card-section>
    </q-card>

    <!-- Actions -->
    <q-card class="profile-card" flat bordered>
      <q-list>
        <q-item clickable v-ripple to="/change-password">
          <q-item-section avatar>
            <q-icon name="lock" color="secondary" />
          </q-item-section>
          <q-item-section>Cambiar contraseña</q-item-section>
          <q-item-section side>
            <q-icon name="chevron_right" color="grey-5" />
          </q-item-section>
        </q-item>
      </q-list>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useUserStore } from 'stores/useUserStore'
import { formatDate } from 'src/utils/format-date'

const userStore = useUserStore()

const levelColors: Record<string, string> = {
  alfa: 'blue',
  delta: 'green',
  sigma: 'orange',
  omega: 'purple',
  spartan: 'red-10',
}

const levelColor = computed(() => {
  const level = userStore.profile?.level
  if (!level) return 'grey'
  return levelColors[level] || 'grey'
})

onMounted(() => {
  userStore.loadSubscription()
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.profile-page {
  max-width: 500px;
  margin: 0 auto;
}

// ─── Header ──────────────────────────────────────────────────────────

.profile-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
}

.profile-header__avatar {
  width: 56px;
  height: 56px;
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
  font-size: 18px;
  font-weight: 600;
  color: $accent;
  line-height: 1.2;
}

.profile-header__email {
  font-size: 13px;
  color: rgba($accent, 0.5);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-header__level {
  flex-shrink: 0;
}

// ─── Cards ───────────────────────────────────────────────────────────

.profile-card {
  border-radius: 12px;
  border-color: rgba($primary, 0.15);
  margin-bottom: 12px;

  &__header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 12px;
  }

  &__title {
    font-family: 'Montserrat', sans-serif;
    font-size: 15px;
    font-weight: 600;
    color: $accent;
  }
}

// ─── Subscription ────────────────────────────────────────────────────

.subscription-plan {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;

  &__name {
    font-family: 'Montserrat', sans-serif;
    font-size: 16px;
    font-weight: 600;
    color: $accent;
  }
}

.subscription-details {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.subscription-detail {
  text-align: center;

  &__label {
    display: block;
    font-size: 11px;
    color: rgba($accent, 0.5);
    margin-bottom: 2px;
  }

  &__value {
    font-size: 14px;
    font-weight: 500;
    color: $accent;
  }
}
</style>
