<!-- Tab "Referidos" de la ficha del alumno (fase 158, VIS-03) — UI-SPEC S3. -->
<template>
  <div>
    <!-- Loading -->
    <div v-if="loading" class="flex flex-center q-pa-lg">
      <q-spinner-dots size="40px" color="primary" />
    </div>

    <template v-else-if="overview">
      <!-- Lo trajo (referredBy) — con asignación retroactiva si está vacío -->
      <div class="q-mb-md">
        <div class="text-subtitle2 text-weight-bold q-mb-sm">Lo trajo</div>

        <q-list v-if="overview.referredBy">
          <q-item class="q-px-none">
            <q-item-section>
              <q-item-label>
                <a
                  class="referral-link text-primary cursor-pointer"
                  @click="goToMember(overview.referredBy.userId)"
                >
                  {{ overview.referredBy.fullName }}
                </a>
              </q-item-label>
              <q-item-label v-if="overview.referredBy.state === 'suspended'" caption>
                se reactiva si vuelve
              </q-item-label>
            </q-item-section>
            <q-item-section side top>
              <q-chip
                dense
                :color="chipColor(overview.referredBy.state)"
                text-color="white"
                :label="chipLabel(overview.referredBy.state)"
              />
            </q-item-section>
          </q-item>
        </q-list>

        <!-- Fase 173: el alta pregunta "¿quién lo trajo?" antes de que se sepa,
             así que casi siempre queda vacío. Acá se carga cuando el dato
             aparece — sin esto hay que tocar la base a mano. -->
        <div v-else>
          <div class="text-caption text-grey-7 q-mb-sm">
            Sin referidor asignado. Si te enterás de quién lo trajo, cargalo acá.
          </div>
          <div class="row items-start q-col-gutter-sm">
            <div class="col">
              <ReferrerSelect
                ref="referrerSelect"
                v-model="newReferrerId"
                label="¿Quién lo trajo?"
                :disable="assigning"
              />
            </div>
            <div class="col-auto">
              <q-btn
                color="primary"
                label="Asignar"
                unelevated
                :disable="newReferrerId === null"
                :loading="assigning"
                @click="onAssign"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Trajo a (referred[]) — solo si tiene al menos uno -->
      <div v-if="overview.referred.length > 0">
        <div class="text-subtitle2 text-weight-bold q-mb-sm">Trajo a</div>
        <q-list>
          <q-item v-for="link in overview.referred" :key="link.userId" class="q-px-none">
            <q-item-section>
              <q-item-label>
                <a
                  class="referral-link text-primary cursor-pointer"
                  @click="goToMember(link.userId)"
                >
                  {{ link.fullName }}
                </a>
              </q-item-label>
              <q-item-label v-if="link.state === 'suspended'" caption>
                se reactiva si vuelve
              </q-item-label>
            </q-item-section>
            <q-item-section side top>
              <q-chip
                dense
                :color="chipColor(link.state)"
                text-color="white"
                :label="chipLabel(link.state)"
              />
            </q-item-section>
          </q-item>
        </q-list>
      </div>

      <!-- Partner (fase 179, D-15): comercio/marca que trajo al alumno,
           asignación retroactiva desde la ficha y revocación (D-14). -->
      <div class="q-mt-md">
        <div class="text-subtitle2 text-weight-bold q-mb-sm">Partner</div>

        <div v-if="partnerLoading" class="flex flex-center q-pa-md">
          <q-spinner-dots size="24px" color="primary" />
        </div>

        <template v-else-if="partnerLink">
          <q-list>
            <q-item class="q-px-none">
              <q-item-section>
                <q-item-label
                  >{{ partnerLink.partnerName }} ({{ partnerLink.partnerCode }})</q-item-label
                >
                <q-item-label caption>
                  Vinculado el {{ formatDate(partnerLink.createdAt) }} — beneficio
                  {{ benefitStatusLabel(partnerLink.benefitStatus) }}
                </q-item-label>
              </q-item-section>
              <q-item-section side top>
                <q-chip
                  dense
                  :color="partnerStatusChipColor(partnerLink.status)"
                  text-color="white"
                  :label="partnerStatusChipLabel(partnerLink.status)"
                />
              </q-item-section>
            </q-item>
          </q-list>
          <q-btn
            flat
            dense
            color="negative"
            label="Revocar vínculo"
            size="sm"
            :loading="revokingPartner"
            @click="onRevokePartner"
          />
        </template>

        <div v-else>
          <div class="text-caption text-grey-7 q-mb-sm">
            Si el alumno llegó por un comercio, cargalo acá.
          </div>
          <div class="row items-start q-col-gutter-sm">
            <div class="col">
              <q-select
                v-model="selectedPartnerId"
                :options="filteredPartnerOptions"
                option-value="id"
                option-label="displayLabel"
                label="¿Qué partner lo trajo?"
                dense
                outlined
                clearable
                emit-value
                map-options
                use-input
                input-debounce="0"
                :loading="loadingPartners"
                :disable="assigningPartner"
                @filter="onFilterPartners"
              >
                <template #no-option>
                  <q-item>
                    <q-item-section class="text-grey">
                      No se encontró ningún partner activo
                    </q-item-section>
                  </q-item>
                </template>
              </q-select>
            </div>
            <div class="col-auto">
              <q-btn
                color="primary"
                label="Asignar"
                unelevated
                :disable="selectedPartnerId === null"
                :loading="assigningPartner"
                @click="onAssignPartner"
              />
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import axios from 'axios';
import { createLogger } from 'src/utils/logger';
import { useMembersApi, type MemberReferralsResponse } from 'src/composables/useMembersApi';
import {
  usePartnersApi,
  type MemberPartnerLink,
  type PartnerListItem,
  type PartnerLinkStatus,
  type PartnerBenefitStatus,
} from 'src/composables/usePartnersApi';
import { formatDate } from 'src/utils/format-date';
import ReferrerSelect from './ReferrerSelect.vue';

const log = createLogger('MemberReferralsTab');
const $q = useQuasar();
const router = useRouter();
const membersApi = useMembersApi();
const partnersApi = usePartnersApi();

const props = defineProps<{ userId: number }>();

const overview = ref<MemberReferralsResponse | null>(null);
const loading = ref(false);

// Atribución retroactiva (fase 173).
const newReferrerId = ref<number | null>(null);
const referrerSelect = ref<{ reset: () => void } | null>(null);
const assigning = ref(false);

// Partner (fase 179, D-15): vínculo actual + asignación retroactiva/revocación.
const partnerLink = ref<MemberPartnerLink | null>(null);
const partnerLoading = ref(false);
const allActivePartners = ref<PartnerListItem[]>([]);
const partnerSearch = ref('');
const selectedPartnerId = ref<number | null>(null);
const loadingPartners = ref(false);
const assigningPartner = ref(false);
const revokingPartner = ref(false);

// Chips: misma semántica derivada que la app (S1). El estado viene del server
// (deriveCoveredUntil, D-28); el cliente nunca lo recalcula desde users.status.
type ReferralState = 'pending' | 'active' | 'suspended';

function chipColor(state: ReferralState): string {
  switch (state) {
    case 'active':
      return 'positive';
    case 'suspended':
      return 'warning';
    case 'pending':
    default:
      return 'info';
  }
}

function chipLabel(state: ReferralState): string {
  switch (state) {
    case 'active':
      return 'Activo';
    case 'suspended':
      return 'Suspendido';
    case 'pending':
    default:
      return 'Pendiente';
  }
}

function goToMember(userId: number): void {
  void router.push(`/alumnos/${userId}`);
}

// ─── Partner (fase 179, D-15) ──────────────────────────────────────────────

function partnerStatusChipColor(status: PartnerLinkStatus): string {
  switch (status) {
    case 'qualified':
      return 'positive';
    case 'revoked':
      return 'grey';
    case 'pending':
    default:
      return 'info';
  }
}

function partnerStatusChipLabel(status: PartnerLinkStatus): string {
  switch (status) {
    case 'qualified':
      return 'Calificado';
    case 'revoked':
      return 'Revocado';
    case 'pending':
    default:
      return 'Pendiente';
  }
}

function benefitStatusLabel(status: PartnerBenefitStatus): string {
  switch (status) {
    case 'consumed':
      return 'consumido';
    case 'expired':
      return 'vencido sin usar';
    case 'pending':
    default:
      return 'pendiente';
  }
}

const filteredPartnerOptions = computed(() => {
  const needle = partnerSearch.value.trim().toLowerCase();
  return allActivePartners.value
    .filter(
      (p) =>
        !needle || p.name.toLowerCase().includes(needle) || p.code.toLowerCase().includes(needle)
    )
    .map((p) => ({ id: p.id, displayLabel: `${p.name} (${p.code})` }));
});

function onFilterPartners(val: string, update: (callback: () => void) => void): void {
  update(() => {
    partnerSearch.value = val;
  });
}

async function loadPartnerLink(): Promise<void> {
  partnerLoading.value = true;
  try {
    partnerLink.value = await partnersApi.getMemberPartnerLink(props.userId);
  } catch (err: unknown) {
    log.error('Failed to load partner link', {
      userId: props.userId,
      error: err instanceof Error ? err.message : String(err),
    });
    $q.notify({
      type: 'negative',
      message: partnersApi.error.value ?? 'No se pudo cargar el vínculo con el partner.',
    });
  } finally {
    partnerLoading.value = false;
  }
}

async function loadActivePartners(): Promise<void> {
  loadingPartners.value = true;
  try {
    allActivePartners.value = await partnersApi.listPartners({ isActive: true });
  } catch (err: unknown) {
    log.error('Failed to load active partners', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    loadingPartners.value = false;
  }
}

/**
 * Asignación retroactiva de partner (D-15). Mismo criterio de mensajería
 * distinta pending/qualified que `onAssign` (referidor de socio) — el
 * status HTTP diferencia el motivo (404 partner inválido, 409 origen ya
 * asignado, mensaje servidor ya distingue socio/partner — D-12); sin
 * status conocido, mensaje genérico.
 */
async function onAssignPartner(): Promise<void> {
  if (selectedPartnerId.value === null) return;
  assigningPartner.value = true;
  try {
    const result = await partnersApi.assignPartnerToMember(props.userId, selectedPartnerId.value);
    selectedPartnerId.value = null;
    partnerSearch.value = '';
    $q.notify({
      type: 'positive',
      message:
        result.status === 'qualified'
          ? 'Partner asignado. Como el alumno ya pagó, la comisión quedó generada.'
          : 'Partner asignado. Cuando pague su primer plan se genera la comisión.',
    });
    // Recarga en vez de mutar local — mismo motivo que el referidor.
    await loadPartnerLink();
  } catch (err: unknown) {
    log.error('Failed to assign partner', {
      userId: props.userId,
      partnerId: selectedPartnerId.value,
      error: err instanceof Error ? err.message : String(err),
    });
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    let message = partnersApi.error.value ?? 'No se pudo asignar el partner.';
    if (status === 404)
      message = partnersApi.error.value ?? 'El partner no existe o está inactivo.';
    if (status === 403) message = 'No tenés permisos para asignar el partner.';
    $q.notify({ type: 'negative', message });
  } finally {
    assigningPartner.value = false;
  }
}

/**
 * Revocación del vínculo (D-14): confirmación explícita del efecto sobre
 * comisiones pendientes (se anulan) vs. ya liquidadas (no se tocan) ANTES
 * de ejecutar (T-179-56).
 */
function onRevokePartner(): void {
  if (!partnerLink.value) return;
  const partnerName = partnerLink.value.partnerName;
  $q.dialog({
    title: 'Revocar vínculo de partner',
    message: `¿Revocar el vínculo con "${partnerName}"? Las comisiones pendientes de este vínculo se van a anular. Las comisiones ya liquidadas no se tocan.`,
    cancel: true,
    persistent: true,
  }).onOk(() => {
    void doRevokePartner();
  });
}

async function doRevokePartner(): Promise<void> {
  revokingPartner.value = true;
  try {
    const result = await partnersApi.revokePartnerFromMember(props.userId);
    $q.notify({
      type: 'positive',
      message:
        result.voidedCommissions > 0
          ? `Vínculo revocado. Se anularon ${result.voidedCommissions} comisión(es) pendiente(s).`
          : 'Vínculo revocado.',
    });
    await loadPartnerLink();
  } catch (err: unknown) {
    log.error('Failed to revoke partner link', {
      userId: props.userId,
      error: err instanceof Error ? err.message : String(err),
    });
    $q.notify({
      type: 'negative',
      message: partnersApi.error.value ?? 'No se pudo revocar el vínculo con el partner.',
    });
  } finally {
    revokingPartner.value = false;
  }
}

async function load() {
  loading.value = true;
  try {
    overview.value = await membersApi.getReferrals(props.userId);
  } catch (err: unknown) {
    log.error('Failed to load referrals', {
      userId: props.userId,
      error: err instanceof Error ? err.message : String(err),
    });
    $q.notify({
      type: 'negative',
      message: membersApi.error.value ?? 'No se pudieron cargar los referidos.',
    });
  } finally {
    loading.value = false;
  }
}

/**
 * Carga el vínculo "lo trajo" después del alta.
 *
 * El mensaje distingue los dos estados porque significan cosas distintas para
 * quien atiende el mostrador: `pending` es "el descuento llega cuando pague",
 * `qualified` es "ya pagó, corre desde el próximo cobro". Sin esa distinción el
 * staff no sabe qué contestar cuando el socio pregunta.
 */
async function onAssign(): Promise<void> {
  if (newReferrerId.value === null) return;
  assigning.value = true;
  try {
    const result = await membersApi.assignReferrer(props.userId, newReferrerId.value);
    newReferrerId.value = null;
    referrerSelect.value?.reset();
    $q.notify({
      type: 'positive',
      message:
        result.status === 'qualified'
          ? 'Referidor asignado. El descuento corre desde el próximo cobro de cada uno.'
          : 'Referidor asignado. Cuando pague su primer plan, ambos reciben el descuento.',
    });
    // Recarga en vez de mutar local: el estado de los chips lo deriva el server
    // (deriveCoveredUntil), el cliente no lo puede inventar.
    await load();
  } catch (err: unknown) {
    log.error('Failed to assign referrer', {
      userId: props.userId,
      referrerId: newReferrerId.value,
      error: err instanceof Error ? err.message : String(err),
    });
    $q.notify({
      type: 'negative',
      message: membersApi.error.value ?? 'No se pudo asignar el referidor.',
    });
  } finally {
    assigning.value = false;
  }
}

onMounted(() => {
  void load();
  void loadPartnerLink();
  void loadActivePartners();
});

// Los cross-links "Lo trajo"/"Trajo a" navegan a otra ficha reutilizando la
// misma instancia de página (solo cambia el route param), así que este tab
// recibe un userId nuevo sin remontarse.
watch(
  () => props.userId,
  () => {
    overview.value = null;
    // Un referidor a medio elegir no puede sobrevivir al cambio de ficha: se
    // asignaría al alumno equivocado.
    newReferrerId.value = null;
    referrerSelect.value?.reset();
    void load();

    // Fase 179 (T-179-55): un partner a medio elegir tampoco puede sobrevivir
    // al cambio de ficha — mismo motivo que el referidor. El catálogo de
    // partners activos (allActivePartners) NO se resetea: es independiente
    // del alumno.
    partnerLink.value = null;
    selectedPartnerId.value = null;
    partnerSearch.value = '';
    void loadPartnerLink();
  }
);
</script>

<style scoped>
.referral-link {
  text-decoration: none;
}
.referral-link:hover {
  text-decoration: underline;
}
</style>
