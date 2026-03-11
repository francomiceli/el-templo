<template>
  <q-page padding>
    <!-- Profile Card -->
    <q-card class="q-mx-auto" style="max-width: 500px">
      <q-card-section>
        <div class="text-h5">Mi Perfil</div>
      </q-card-section>

      <q-card-section>
        <q-list>
          <q-item>
            <q-item-section avatar>
              <q-icon name="email" color="primary" />
            </q-item-section>
            <q-item-section>
              <q-item-label caption>Email</q-item-label>
              <q-item-label>{{ userStore.profile?.email }}</q-item-label>
            </q-item-section>
          </q-item>

          <q-item>
            <q-item-section avatar>
              <q-icon name="person" color="primary" />
            </q-item-section>
            <q-item-section>
              <q-item-label caption>Nombre</q-item-label>
              <q-item-label>{{ userStore.fullName || 'No especificado' }}</q-item-label>
            </q-item-section>
          </q-item>

          <q-item>
            <q-item-section avatar>
              <q-icon name="store" color="primary" />
            </q-item-section>
            <q-item-section>
              <q-item-label caption>Sucursal</q-item-label>
              <q-item-label>{{ userStore.profile?.branchName }}</q-item-label>
            </q-item-section>
          </q-item>

          <q-item>
            <q-item-section avatar>
              <q-icon name="emoji_events" color="primary" />
            </q-item-section>
            <q-item-section>
              <q-item-label caption>Nivel</q-item-label>
              <q-item-label class="level-label-row">
                <FlameIcon size="xs" />
                <q-badge :color="levelColor" :label="userStore.displayLevel" />
                <FlameIcon size="xs" />
              </q-item-label>
            </q-item-section>
          </q-item>

          <q-item>
            <q-item-section avatar>
              <q-icon name="badge" color="primary" />
            </q-item-section>
            <q-item-section>
              <q-item-label caption>Rol</q-item-label>
              <q-item-label class="text-capitalize">{{ userStore.profile?.role }}</q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </q-card-section>
    </q-card>

    <!-- Subscription Card -->
    <q-card class="q-mx-auto q-mt-md" style="max-width: 500px">
      <q-card-section>
        <div class="text-h6">Mi Suscripcion</div>
      </q-card-section>

      <q-card-section>
        <!-- Loading -->
        <div v-if="userStore.subscriptionLoading" class="flex flex-center q-pa-md">
          <q-spinner-dots size="30px" color="primary" />
        </div>

        <!-- Has subscription -->
        <template v-else-if="userStore.subscription">
          <div class="q-mb-sm">
            <span class="text-subtitle1 text-weight-bold">
              {{ userStore.subscription.planName }}
            </span>
            <q-badge
              :color="userStore.subscriptionStatusColor"
              :label="userStore.subscriptionStatusLabel"
              class="q-ml-sm"
            />
          </div>

          <q-list dense>
            <q-item>
              <q-item-section>
                <q-item-label caption>Inicio</q-item-label>
                <q-item-label>{{ formatDate(userStore.subscription.startDate) }}</q-item-label>
              </q-item-section>
            </q-item>
            <q-item>
              <q-item-section>
                <q-item-label caption>Vencimiento</q-item-label>
                <q-item-label>
                  {{
                    userStore.subscription.endDate
                      ? formatDate(userStore.subscription.endDate)
                      : '—'
                  }}
                </q-item-label>
              </q-item-section>
            </q-item>
            <q-item>
              <q-item-section>
                <q-item-label caption>Dias restantes</q-item-label>
                <q-item-label
                  :class="{
                    'text-negative text-weight-bold': userStore.subscription.daysRemaining < 7,
                  }"
                >
                  {{ userStore.subscription.daysRemaining }}
                </q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
        </template>

        <!-- No subscription -->
        <div v-else class="text-grey-5 text-italic">Sin suscripcion activa</div>
      </q-card-section>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useUserStore } from 'stores/useUserStore'
import { formatDate } from 'src/utils/format-date'
import FlameIcon from 'src/components/FlameIcon.vue'

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
.level-label-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
