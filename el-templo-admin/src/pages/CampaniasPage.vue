<template>
  <q-page class="q-pa-md">
    <!-- ================================================================== -->
    <!-- Header -->
    <!-- ================================================================== -->
    <div class="row items-center q-mb-md">
      <div class="col">
        <div class="text-h5">Campañas</div>
        <div class="text-caption text-grey-7">Envíos masivos y seguimiento de conversión</div>
      </div>
      <div class="col-auto">
        <q-btn
          color="primary"
          icon="add"
          label="Nueva campaña"
          unelevated
          @click="openCreateDialog"
        />
      </div>
    </div>

    <!-- ================================================================== -->
    <!-- Global Filter: Country (owner only) -->
    <!-- WR-06: the campaign audience is country-scoped server-side, so a -->
    <!-- "Sucursal" selector next to the irreversible send button would -->
    <!-- misrepresent the blast radius. It was removed (was a no-op). -->
    <!-- ================================================================== -->
    <div v-if="isOwner" class="row items-center q-gutter-sm q-mb-md">
      <div class="col-auto" style="min-width: 180px">
        <q-select
          v-model="selectedCountry"
          :options="countryOptions"
          label="País"
          dense
          outlined
          emit-value
          map-options
          @update:model-value="onCountryChange"
        />
      </div>
    </div>

    <!-- ================================================================== -->
    <!-- Tabs -->
    <!-- ================================================================== -->
    <q-tabs
      v-model="activeTab"
      dense
      align="left"
      class="q-mb-md"
      active-color="primary"
      indicator-color="primary"
    >
      <q-tab name="lista" label="Campañas" icon="campaign" />
      <q-tab name="funnel" label="Funnel" icon="trending_up" :disable="selectedCampaign === null" />
    </q-tabs>

    <q-tab-panels v-model="activeTab" animated>
      <!-- ================================================================ -->
      <!-- Lista Tab -->
      <!-- ================================================================ -->
      <q-tab-panel name="lista">
        <q-table
          :rows="campaigns"
          :columns="campaignColumns"
          row-key="id"
          :loading="loadingList"
          flat
          bordered
          :pagination="{ rowsPerPage: 20 }"
          @row-click="onRowClick"
        >
          <template #body-cell-status="props">
            <q-td :props="props">
              <q-badge
                :color="statusColor(props.row.status)"
                :label="statusLabel(props.row.status)"
              />
            </q-td>
          </template>
          <template #body-cell-sentAt="props">
            <q-td :props="props">
              {{ props.row.sentAt ? formatDate(props.row.sentAt) : '—' }}
            </q-td>
          </template>
          <template #body-cell-acciones="props">
            <q-td :props="props" @click.stop>
              <q-btn
                round
                flat
                dense
                icon="trending_up"
                color="primary"
                @click="openFunnel(props.row)"
              >
                <q-tooltip>Ver funnel</q-tooltip>
              </q-btn>
              <q-btn
                v-if="props.row.status === 'draft' && isOwner"
                round
                flat
                dense
                icon="send"
                color="primary"
                @click="openSendDialog(props.row)"
              >
                <q-tooltip>Enviar campaña</q-tooltip>
              </q-btn>
            </q-td>
          </template>
          <template #no-data>
            <div class="full-width text-center q-pa-lg text-grey-6">
              No hay campañas todavía. Creá una con "Nueva campaña".
            </div>
          </template>
        </q-table>
      </q-tab-panel>

      <!-- ================================================================ -->
      <!-- Funnel Tab -->
      <!-- ================================================================ -->
      <q-tab-panel name="funnel">
        <div v-if="selectedCampaign" class="q-mb-md">
          <div class="text-subtitle1 text-weight-bold">{{ selectedCampaign.name }}</div>
          <div class="text-caption text-grey-7">
            {{ selectedCampaign.subject }} ·
            <q-badge
              :color="statusColor(selectedCampaign.status)"
              :label="statusLabel(selectedCampaign.status)"
            />
          </div>
        </div>
        <CampaignFunnel :data="funnelData" :loading="loadingFunnel" />
      </q-tab-panel>
    </q-tab-panels>

    <!-- ================================================================== -->
    <!-- Create dialog (D-12) -->
    <!-- ================================================================== -->
    <q-dialog v-model="createDialog" persistent>
      <q-card style="min-width: 420px; max-width: 90vw">
        <q-card-section>
          <div class="text-h6">Nueva campaña</div>
        </q-card-section>
        <q-card-section class="q-gutter-md">
          <q-input v-model="form.name" label="Nombre" dense outlined :rules="[requiredRule]" />
          <q-input
            v-model="form.subject"
            label="Asunto del email"
            dense
            outlined
            :rules="[requiredRule]"
          />
          <q-select
            v-if="isOwner"
            v-model="form.country"
            :options="createCountryOptions"
            label="País (opcional)"
            dense
            outlined
            emit-value
            map-options
            clearable
          />
          <q-input
            v-model="form.heroImageUrl"
            label="URL de imagen hero (opcional)"
            dense
            outlined
            hint="Asset auto-alojado en eltemplo.org (D-27)"
          />
          <q-separator />
          <div class="text-caption text-weight-bold text-grey-8">Copy del email</div>
          <q-input
            v-model="form.headline"
            label="Titular (headline)"
            dense
            outlined
            :rules="[requiredRule]"
          />
          <q-input v-model="form.subheadline" label="Subtítulo (subheadline)" dense outlined />
          <q-input
            v-model="form.body"
            label="Cuerpo (body)"
            type="textarea"
            dense
            outlined
            autogrow
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" v-close-popup :disable="creating" />
          <q-btn
            color="primary"
            label="Crear borrador"
            unelevated
            :loading="creating"
            :disable="!canCreate"
            @click="confirmCreate"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ================================================================== -->
    <!-- Send confirmation dialog (D-11, irreversible) -->
    <!-- ================================================================== -->
    <q-dialog v-model="sendDialog" persistent>
      <q-card style="min-width: 380px">
        <q-card-section class="row items-center">
          <q-icon name="warning" color="warning" size="28px" class="q-mr-sm" />
          <div class="text-h6">Enviar campaña</div>
        </q-card-section>
        <q-card-section>
          <template v-if="loadingEligible">
            <q-spinner-dots size="28px" color="primary" />
            <span class="q-ml-sm text-grey-7">Calculando destinatarios…</span>
          </template>
          <template v-else>
            {{ sendConfirmMessage }}
          </template>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" v-close-popup :disable="sending" />
          <q-btn
            color="primary"
            :label="`Enviar a ${eligibleCount}`"
            unelevated
            :loading="sending"
            :disable="loadingEligible"
            @click="confirmSend"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useQuasar, type QTableColumn } from 'quasar';
import { useCampaignsApi } from 'src/composables/useCampaignsApi';
import { useAuthStore } from 'src/stores/useAuthStore';
import { createLogger } from 'src/utils/logger';
import CampaignFunnel from 'src/components/campaigns/CampaignFunnel.vue';
import type {
  CampaignListItem,
  CampaignFunnel as CampaignFunnelData,
  CampaignCountry,
  CreateCampaignInput,
} from 'src/types/campaign';

// -- Setup -------------------------------------------------------------------

const log = createLogger('CampaniasPage');
const $q = useQuasar();
const campaignsApi = useCampaignsApi();
const authStore = useAuthStore();

// -- Country selector (owner-only) -------------------------------------------

const isOwner = computed(() => authStore.user?.role === 'owner');

const countryOptions = [
  { label: 'Argentina', value: 'AR' as const },
  { label: 'España', value: 'ES' as const },
];

const createCountryOptions = countryOptions;

const selectedCountry = ref<'AR' | 'ES'>('AR');

const countryScope = computed<CampaignCountry | undefined>(() =>
  isOwner.value ? selectedCountry.value : undefined
);

async function onCountryChange() {
  await fetchCampaigns();
}

// -- Tab state ---------------------------------------------------------------

const activeTab = ref<'lista' | 'funnel'>('lista');

// -- Date / status helpers ---------------------------------------------------

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function statusColor(status: string): string {
  switch (status) {
    case 'sent':
      return 'positive';
    case 'sending':
      return 'warning';
    default:
      return 'grey';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'sent':
      return 'Enviada';
    case 'sending':
      return 'Enviando';
    default:
      return 'Borrador';
  }
}

// -- Campaign list -----------------------------------------------------------

const campaigns = ref<CampaignListItem[]>([]);
const loadingList = ref(false);

const campaignColumns: QTableColumn[] = [
  { name: 'name', label: 'Nombre', field: 'name', align: 'left' },
  { name: 'status', label: 'Estado', field: 'status', align: 'left' },
  { name: 'sentAt', label: 'Enviada', field: 'sentAt', align: 'left' },
  {
    name: 'recipientCount',
    label: 'Destinatarios',
    field: 'recipientCount',
    align: 'center',
  },
  { name: 'acciones', label: 'Acciones', field: 'id', align: 'center' },
];

async function fetchCampaigns() {
  loadingList.value = true;
  try {
    campaigns.value = await campaignsApi.listCampaigns(countryScope.value);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error fetching campaigns', { error: message });
    $q.notify({ type: 'negative', message: 'Error cargando campañas' });
  } finally {
    loadingList.value = false;
  }
}

// -- Funnel detail -----------------------------------------------------------

const selectedCampaign = ref<CampaignListItem | null>(null);
const funnelData = ref<CampaignFunnelData | null>(null);
const loadingFunnel = ref(false);

async function openFunnel(campaign: CampaignListItem) {
  selectedCampaign.value = campaign;
  activeTab.value = 'funnel';
  loadingFunnel.value = true;
  funnelData.value = null;
  try {
    funnelData.value = await campaignsApi.getCampaignFunnel(campaign.id);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error fetching campaign funnel', { error: message });
    $q.notify({ type: 'negative', message: 'Error cargando el funnel' });
  } finally {
    loadingFunnel.value = false;
  }
}

function onRowClick(_evt: Event, row: CampaignListItem) {
  void openFunnel(row);
}

// -- Create dialog (D-12) ----------------------------------------------------

const createDialog = ref(false);
const creating = ref(false);

interface CreateForm {
  name: string;
  subject: string;
  country: CampaignCountry;
  heroImageUrl: string;
  headline: string;
  subheadline: string;
  body: string;
}

function emptyForm(): CreateForm {
  return {
    name: '',
    subject: '',
    country: null,
    heroImageUrl: '',
    headline: '',
    subheadline: '',
    body: '',
  };
}

const form = ref<CreateForm>(emptyForm());

function requiredRule(val: string): boolean | string {
  return (val !== null && val !== undefined && val.trim().length > 0) || 'Requerido';
}

const canCreate = computed(
  () =>
    form.value.name.trim().length > 0 &&
    form.value.subject.trim().length > 0 &&
    form.value.headline.trim().length > 0
);

function openCreateDialog() {
  form.value = emptyForm();
  createDialog.value = true;
}

async function confirmCreate() {
  if (!canCreate.value) return;
  creating.value = true;
  try {
    const payload: CreateCampaignInput = {
      name: form.value.name.trim(),
      subject: form.value.subject.trim(),
      copySlots: {
        headline: form.value.headline.trim(),
        subheadline: form.value.subheadline.trim(),
        body: form.value.body.trim(),
      },
    };
    if (form.value.country) payload.country = form.value.country;
    if (form.value.heroImageUrl.trim()) payload.heroImageUrl = form.value.heroImageUrl.trim();
    await campaignsApi.createCampaign(payload);
    $q.notify({ type: 'positive', message: 'Borrador de campaña creado' });
    createDialog.value = false;
    await fetchCampaigns();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error creating campaign', { error: message });
    $q.notify({
      type: 'negative',
      message: campaignsApi.error.value ?? 'Error creando la campaña',
    });
  } finally {
    creating.value = false;
  }
}

// -- Send confirmation dialog (D-11, irreversible) ---------------------------

const sendDialog = ref(false);
const sending = ref(false);
const loadingEligible = ref(false);
const eligibleCount = ref(0);
const campaignToSend = ref<CampaignListItem | null>(null);

// Exact UI-SPEC Copywriting Contract send-confirmation body (D-11).
const sendConfirmMessage = computed(
  () =>
    `Vas a enviar este email a ${eligibleCount.value} personas. Esta acción no se puede deshacer. ¿Continuar?`
);

async function openSendDialog(campaign: CampaignListItem) {
  campaignToSend.value = campaign;
  eligibleCount.value = 0;
  sendDialog.value = true;
  loadingEligible.value = true;
  try {
    eligibleCount.value = await campaignsApi.getEligibleCount(countryScope.value);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error fetching eligible count', { error: message });
    $q.notify({ type: 'negative', message: 'No se pudo calcular la audiencia' });
  } finally {
    loadingEligible.value = false;
  }
}

async function confirmSend() {
  const campaign = campaignToSend.value;
  if (!campaign) return;
  sending.value = true;
  try {
    const result = await campaignsApi.sendCampaign(campaign.id);
    $q.notify({
      type: 'positive',
      message: `Campaña enviada a ${result.recipientCount} personas`,
    });
    sendDialog.value = false;
    await fetchCampaigns();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error sending campaign', { error: message });
    $q.notify({
      type: 'negative',
      message: campaignsApi.error.value ?? 'Error enviando la campaña',
    });
  } finally {
    sending.value = false;
  }
}

// -- Lifecycle ---------------------------------------------------------------

onMounted(async () => {
  await fetchCampaigns();
});

onUnmounted(() => {
  campaignsApi.cleanup();
});
</script>
