<template>
  <q-layout view="lHh Lpr lFf">
    <q-header elevated class="main-header">
      <q-toolbar>
        <q-btn flat dense round icon="menu" aria-label="Menu" @click="toggleLeftDrawer" />

        <q-toolbar-title class="header-title">
          <img
            src="/icons/icon-48.webp"
            alt="El Templo"
            class="header-logo"
          />
          El Templo
        </q-toolbar-title>

        <q-btn
          v-if="authStore.isAuthenticated"
          flat
          round
          icon="logout"
          @click="onLogout"
        >
          <q-tooltip>Cerrar sesion</q-tooltip>
        </q-btn>
      </q-toolbar>
    </q-header>

    <q-drawer v-model="leftDrawerOpen" show-if-above bordered class="main-drawer">
      <q-list>
        <q-item-label header class="drawer-header">Menu</q-item-label>

        <q-item clickable to="/mi-camino" @click="leftDrawerOpen = false">
          <q-item-section avatar>
            <q-icon name="trending_up">
              <q-badge
                v-if="progressionStore.evaluationEligible"
                floating
                rounded
                color="secondary"
              />
            </q-icon>
          </q-item-section>
          <q-item-section>Mi Camino</q-item-section>
        </q-item>

        <q-item clickable to="/training" @click="leftDrawerOpen = false">
          <q-item-section avatar>
            <q-icon name="fitness_center" />
          </q-item-section>
          <q-item-section>Entrenamiento</q-item-section>
        </q-item>

        <q-item clickable to="/training/saberes" @click="leftDrawerOpen = false">
          <q-item-section avatar>
            <q-icon name="menu_book" />
          </q-item-section>
          <q-item-section>Saberes</q-item-section>
        </q-item>

        <q-item clickable to="/profile" @click="leftDrawerOpen = false">
          <q-item-section avatar>
            <q-icon name="person" />
          </q-item-section>
          <q-item-section>Mi Perfil</q-item-section>
        </q-item>
      </q-list>
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useQuasar } from 'quasar'
import { useAuthStore } from 'stores/useAuthStore'
import { useProgressionStore } from 'src/modules/progression/stores/progressionStore'

const $q = useQuasar()
const router = useRouter()
const authStore = useAuthStore()
const progressionStore = useProgressionStore()

const leftDrawerOpen = ref(false)

function toggleLeftDrawer() {
  leftDrawerOpen.value = !leftDrawerOpen.value
}

async function onLogout() {
  await authStore.logout()
  $q.notify({ type: 'positive', message: 'Sesion cerrada' })
  router.push('/login')
}
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.main-header {
  background: linear-gradient(135deg, $primary 0%, #3d5275 100%);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: 'Cinzel', serif;
  font-size: 1.1rem;
  letter-spacing: 0.1em;
  font-weight: 500;
}

.header-logo {
  height: 32px;
  width: 32px;
  border-radius: 6px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.main-drawer {
  background-color: $cream;
}

.drawer-header {
  font-family: 'Cinzel', serif;
  color: $primary;
  letter-spacing: 0.05em;
}
</style>
