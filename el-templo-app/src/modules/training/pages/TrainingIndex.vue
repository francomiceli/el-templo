<template>
  <q-page padding>
    <h5 class="q-mt-none">Entrenamiento</h5>

    <q-card class="q-mb-md">
      <q-card-section>
        <div class="text-h6">Estado de Autenticacion</div>
        <p v-if="authStore.isAuthenticated">
          Autenticado como: {{ authStore.user?.email }}
        </p>
        <p v-else>No autenticado</p>
      </q-card-section>
    </q-card>

    <q-card>
      <q-card-section>
        <div class="text-h6">Conexion API</div>
        <p>Estado: {{ apiStatus }}</p>
        <q-btn
          color="primary"
          label="Probar API"
          @click="testApi"
          :loading="loading"
        />
      </q-card-section>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from 'stores/useAuthStore'
import { api } from 'boot/axios'

const authStore = useAuthStore()
const apiStatus = ref('No probado')
const loading = ref(false)

async function testApi() {
  loading.value = true
  try {
    const response = await api.get('/health')
    apiStatus.value = `OK - ${response.data.status || 'healthy'}`
  } catch (error) {
    apiStatus.value = 'Error de conexion'
  } finally {
    loading.value = false
  }
}
</script>
