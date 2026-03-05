<template>
  <q-page padding>
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
  </q-page>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useUserStore } from 'stores/useUserStore'
import FlameIcon from 'src/components/FlameIcon.vue'

const userStore = useUserStore()

const levelColors = {
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
</script>

<style scoped lang="scss">
.level-label-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
