<template>
  <q-page class="q-pa-md">
    <!-- Back button -->
    <q-btn flat icon="arrow_back" label="Volver a Franquicias" class="q-mb-md" @click="goBack" />

    <!-- Loading -->
    <div v-if="loading" class="flex flex-center q-pa-xl">
      <q-spinner-dots size="50px" color="primary" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="text-center q-pa-xl text-negative">
      <q-icon name="error" size="xl" class="q-mb-md" />
      <div class="text-h6">{{ error }}</div>
    </div>

    <!-- Not found -->
    <div v-else-if="!application" class="text-center q-pa-xl text-grey-6">
      <q-icon name="search_off" size="xl" class="q-mb-md" />
      <div class="text-h6">Solicitud no encontrada</div>
    </div>

    <!-- Detail content -->
    <template v-else>
      <!-- ========================================== -->
      <!-- 1. Header card -->
      <!-- ========================================== -->
      <q-card flat bordered class="q-mb-md">
        <q-card-section>
          <div class="row items-center no-wrap">
            <div class="text-h5 text-weight-bold col">{{ application.nombre }}</div>
            <q-chip :color="STATUS_COLORS[application.status] ?? 'grey'" text-color="white" dense>
              {{ STATUS_LABELS[application.status] ?? application.status }}
            </q-chip>
            <q-space />
            <div class="text-caption text-grey-6">{{ formatDate(application.createdAt) }}</div>
          </div>
          <div class="text-subtitle2 text-grey-7">{{ application.ciudadPais }}</div>

          <!-- Quick actions -->
          <div class="row q-gutter-sm q-mt-sm">
            <q-btn flat dense icon="chat" color="green" label="WhatsApp" @click="openWhatsApp">
              <q-tooltip>Abrir WhatsApp con {{ application.telefono }}</q-tooltip>
            </q-btn>
            <q-btn flat dense icon="content_copy" label="Copiar Email" @click="copyEmail">
              <q-tooltip>Copiar {{ application.email }}</q-tooltip>
            </q-btn>
            <q-btn flat dense icon="phone" label="Copiar Telefono" @click="copyPhone">
              <q-tooltip>Copiar {{ application.telefono }}</q-tooltip>
            </q-btn>
          </div>
        </q-card-section>
      </q-card>

      <!-- ========================================== -->
      <!-- 2. Application Data card -->
      <!-- ========================================== -->
      <q-card flat bordered class="q-mb-md">
        <q-card-section>
          <div class="text-subtitle1 text-weight-bold q-mb-sm">Datos de la Solicitud</div>
          <div class="row q-col-gutter-md">
            <div class="col-12 col-sm-6">
              <div class="text-caption text-grey-7">Email</div>
              <div class="text-body2">{{ application.email }}</div>
            </div>
            <div class="col-12 col-sm-6">
              <div class="text-caption text-grey-7">Telefono</div>
              <div class="text-body2">{{ application.telefono }}</div>
            </div>
            <div class="col-12 col-sm-6">
              <div class="text-caption text-grey-7">Ciudad / Pais</div>
              <div class="text-body2">{{ application.ciudadPais }}</div>
            </div>
            <div class="col-12 col-sm-6">
              <div class="text-caption text-grey-7">Modelo de interes</div>
              <div class="text-body2">
                {{ MODELO_LABELS[application.modelo] ?? application.modelo }}
              </div>
            </div>
            <div class="col-12 col-sm-6">
              <div class="text-caption text-grey-7">Experiencia</div>
              <div class="text-body2">
                {{ EXPERIENCIA_LABELS[application.experiencia] ?? application.experiencia }}
              </div>
            </div>
            <div class="col-12 col-sm-6">
              <div class="text-caption text-grey-7">Capital disponible</div>
              <div class="text-body2">
                {{ CAPITAL_LABELS[application.capital] ?? application.capital }}
              </div>
            </div>
            <div class="col-12 col-sm-6">
              <div class="text-caption text-grey-7">Como nos conocio</div>
              <div class="text-body2">
                {{ ORIGEN_LABELS[application.origen] ?? application.origen }}
              </div>
            </div>
            <div class="col-12 col-sm-6">
              <div class="text-caption text-grey-7">Fecha de solicitud</div>
              <div class="text-body2">{{ formatDate(application.createdAt) }}</div>
            </div>
          </div>

          <!-- Message -->
          <template v-if="application.mensaje">
            <q-separator class="q-my-sm" />
            <div class="text-caption text-grey-7">Mensaje</div>
            <div class="text-body2">{{ application.mensaje }}</div>
          </template>
        </q-card-section>
      </q-card>

      <!-- ========================================== -->
      <!-- 3. Status Management card -->
      <!-- ========================================== -->
      <q-card flat bordered class="q-mb-md">
        <q-card-section>
          <div class="text-subtitle1 text-weight-bold q-mb-sm">Estado</div>
          <div class="row items-center q-gutter-sm">
            <q-select
              v-model="selectedStatus"
              :options="statusSelectOptions"
              dense
              outlined
              emit-value
              map-options
              class="col-auto"
              style="min-width: 200px"
            />
            <q-btn
              label="Guardar"
              color="primary"
              :disable="selectedStatus === application.status"
              :loading="saving"
              @click="saveStatus"
            />
          </div>
        </q-card-section>
      </q-card>

      <!-- ========================================== -->
      <!-- 4. Notes card -->
      <!-- ========================================== -->
      <q-card flat bordered class="q-mb-md">
        <q-card-section>
          <div class="text-subtitle1 text-weight-bold q-mb-sm">Notas</div>
          <q-input
            v-model="notesText"
            type="textarea"
            outlined
            autogrow
            placeholder="Agregar notas sobre este aplicante..."
          />
          <q-btn
            label="Guardar Notas"
            color="primary"
            class="q-mt-sm"
            :disable="notesText === (application.notes ?? '')"
            :loading="savingNotes"
            @click="saveNotes"
          />
        </q-card-section>
      </q-card>

      <!-- AI Agent Panel (added by 38-03) -->
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Notify } from 'quasar';
import { createLogger } from 'src/utils/logger';
import {
  useFranchiseAdminApi,
  type FranchiseApplication,
} from 'src/composables/useFranchiseAdminApi';
import {
  STATUS_COLORS,
  STATUS_LABELS,
  MODELO_LABELS,
  CAPITAL_LABELS,
  EXPERIENCIA_LABELS,
  ORIGEN_LABELS,
} from 'src/utils/franchise-labels';

const log = createLogger('FranchiseDetailPage');
const route = useRoute();
const router = useRouter();
const franchiseApi = useFranchiseAdminApi();

// =========================================================================
// State
// =========================================================================

const loading = ref(true);
const error = ref<string | null>(null);
const application = ref<FranchiseApplication | null>(null);
const selectedStatus = ref('new');
const notesText = ref('');
const saving = ref(false);
const savingNotes = ref(false);

const applicationId = computed(() => Number(route.params.id));

// =========================================================================
// Options
// =========================================================================

const statusSelectOptions = [
  { label: 'Nueva', value: 'new' },
  { label: 'Contactada', value: 'contacted' },
  { label: 'Negociando', value: 'negotiating' },
  { label: 'Cerrada', value: 'closed' },
];

// =========================================================================
// Data loading
// =========================================================================

async function loadApplication() {
  loading.value = true;
  error.value = null;
  try {
    application.value = await franchiseApi.getApplication(applicationId.value);
    selectedStatus.value = application.value.status;
    notesText.value = application.value.notes ?? '';
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading franchise application', { error: message, id: applicationId.value });
    error.value = 'Error cargando solicitud';
  } finally {
    loading.value = false;
  }
}

// =========================================================================
// Save handlers
// =========================================================================

async function saveStatus() {
  saving.value = true;
  try {
    application.value = await franchiseApi.updateApplication(applicationId.value, {
      status: selectedStatus.value,
    });
    Notify.create({ type: 'positive', message: 'Estado actualizado' });
  } catch {
    // Error handled by composable
  } finally {
    saving.value = false;
  }
}

async function saveNotes() {
  savingNotes.value = true;
  try {
    application.value = await franchiseApi.updateApplication(applicationId.value, {
      notes: notesText.value,
    });
    Notify.create({ type: 'positive', message: 'Notas guardadas' });
  } catch {
    // Error handled by composable
  } finally {
    savingNotes.value = false;
  }
}

// =========================================================================
// Quick action handlers
// =========================================================================

function openWhatsApp() {
  if (!application.value) return;
  // Format phone for WhatsApp: remove spaces, dashes, keep + prefix
  const phone = application.value.telefono.replace(/[\s-]/g, '');
  const url = `https://wa.me/${phone.replace('+', '')}`;
  window.open(url, '_blank');
}

function copyEmail() {
  if (!application.value) return;
  navigator.clipboard.writeText(application.value.email);
  Notify.create({ type: 'positive', message: 'Email copiado', timeout: 1500 });
}

function copyPhone() {
  if (!application.value) return;
  navigator.clipboard.writeText(application.value.telefono);
  Notify.create({ type: 'positive', message: 'Telefono copiado', timeout: 1500 });
}

// =========================================================================
// Helpers
// =========================================================================

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-AR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// =========================================================================
// Navigation
// =========================================================================

function goBack() {
  router.push('/franquicias');
}

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(() => {
  loadApplication();
});
</script>
