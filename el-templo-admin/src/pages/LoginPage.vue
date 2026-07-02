<template>
  <q-layout>
    <q-page-container>
      <q-page class="flex flex-center">
        <q-card style="min-width: 350px">
          <q-card-section class="bg-primary text-white">
            <div class="text-h6">El Templo Admin</div>
            <div class="text-caption">Acceso para entrenadores y administradores</div>
          </q-card-section>

          <q-card-section>
            <q-form @submit="handleLogin" class="q-gutter-md">
              <q-input
                v-model="email"
                label="Email"
                type="email"
                :rules="[(val) => !!val || 'Email requerido']"
              />
              <q-input
                v-model="password"
                label="Contrasena"
                :type="showPassword ? 'text' : 'password'"
                :rules="[(val) => !!val || 'Contrasena requerida']"
              >
                <template #append>
                  <q-icon
                    :name="showPassword ? 'visibility_off' : 'visibility'"
                    class="cursor-pointer"
                    @click="showPassword = !showPassword"
                  />
                </template>
              </q-input>

              <q-banner v-if="authStore.error" class="bg-negative text-white q-mb-md">
                {{ authStore.error }}
              </q-banner>

              <div class="flex flex-center">
                <q-btn
                  type="submit"
                  label="Ingresar"
                  color="primary"
                  :loading="authStore.loading"
                />
              </div>
            </q-form>
          </q-card-section>
        </q-card>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from 'src/stores/useAuthStore';

const email = ref('');
const password = ref('');
const showPassword = ref(false);
const router = useRouter();
const authStore = useAuthStore();

async function handleLogin() {
  try {
    await authStore.login(email.value, password.value);
    // Navegar a la raíz: el destino real lo resuelve landingForRole() en el
    // guard beforeEach DESPUÉS de checkAuth (owner/admin→/alumnos, empleado→
    // /pagos, Fran→/sessions). Delegar acá evita hardcodear un destino por rol.
    router.push('/');
  } catch {
    // Error already displayed via authStore.error
  }
}
</script>
