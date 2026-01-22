<template>
  <q-page class="flex flex-center">
    <q-card class="q-pa-md" style="width: 400px; max-width: 90vw">
      <q-card-section>
        <div class="text-h5 text-center">Iniciar Sesion</div>
      </q-card-section>

      <q-card-section>
        <q-form @submit="onSubmit" class="q-gutter-md">
          <q-input
            v-model="email"
            type="email"
            label="Email"
            :rules="emailRules"
            lazy-rules
            outlined
          />

          <q-input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            label="Contrasena"
            :rules="passwordRules"
            lazy-rules
            outlined
          >
            <template v-slot:append>
              <q-icon
                :name="showPassword ? 'visibility_off' : 'visibility'"
                class="cursor-pointer"
                @click="showPassword = !showPassword"
              />
            </template>
          </q-input>

          <q-btn
            type="submit"
            color="primary"
            label="Entrar"
            :loading="loading"
            class="full-width"
          />
        </q-form>
      </q-card-section>

      <q-card-section class="text-center">
        <router-link to="/register" class="text-primary">
          No tienes cuenta? Registrate
        </router-link>
      </q-card-section>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuthStore } from 'stores/useAuthStore';

const router = useRouter();
const $q = useQuasar();
const authStore = useAuthStore();

const email = ref('');
const password = ref('');
const showPassword = ref(false);
const loading = ref(false);

const emailRules = [
  (val) => !!val || 'El email es requerido',
  (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) || 'Email invalido',
];

const passwordRules = [(val) => !!val || 'La contrasena es requerida'];

async function onSubmit() {
  loading.value = true;
  try {
    await authStore.login(email.value, password.value);
    $q.notify({
      type: 'positive',
      message: 'Bienvenido',
    });
    router.push('/');
  } catch (err) {
    const axiosError = err;
    $q.notify({
      type: 'negative',
      message: axiosError?.response?.data?.error || 'Error al iniciar sesion',
    });
  } finally {
    loading.value = false;
  }
}
</script>
