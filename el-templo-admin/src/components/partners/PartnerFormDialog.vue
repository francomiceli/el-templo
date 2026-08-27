<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    persistent
  >
    <q-card style="min-width: 450px">
      <q-card-section>
        <div class="text-h6">{{ isEdit ? 'Editar Partner' : 'Nuevo Partner' }}</div>
      </q-card-section>

      <q-card-section>
        <q-form @submit="onSubmit" class="q-gutter-y-md">
          <q-input v-model="form.name" label="Nombre" outlined dense :rules="[required]" />

          <q-input
            v-model="form.code"
            label="Codigo"
            outlined
            dense
            :rules="[required]"
            :disable="isEdit"
            hint="Sin espacios, ej: CAFEX"
          />

          <q-select
            v-model="form.branchId"
            :options="branchOptions"
            label="Sede"
            outlined
            dense
            emit-value
            map-options
            :loading="loadingBranches"
            :rules="[required]"
          />

          <div v-if="currencyText" class="text-caption text-grey-7">{{ currencyText }}</div>

          <q-select
            v-model="form.benefitType"
            :options="benefitTypeOptions"
            label="Tipo de beneficio"
            outlined
            dense
            emit-value
            map-options
          />

          <q-input
            v-if="form.benefitType === 'discount_percent'"
            v-model.number="form.benefitValue"
            label="Valor del beneficio (%)"
            type="number"
            outlined
            dense
            :rules="[benefitValueRule]"
          />

          <q-select
            v-model="form.commissionType"
            :options="commissionTypeOptions"
            label="Tipo de comision"
            outlined
            dense
            emit-value
            map-options
          />

          <q-input
            v-if="form.commissionType === 'fixed'"
            v-model.number="form.commissionValue"
            label="Monto de comision"
            type="number"
            outlined
            dense
            :rules="[commissionValueRule]"
          />

          <q-input v-model="form.contactName" label="Nombre de contacto" outlined dense />
          <q-input v-model="form.contactPhone" label="Telefono de contacto" outlined dense />
          <q-input v-model="form.notes" label="Notas" type="textarea" outlined dense />

          <q-toggle v-if="isEdit" v-model="form.isActive" label="Activo" />

          <q-card-actions align="right">
            <q-btn flat label="Cancelar" @click="$emit('update:modelValue', false)" />
            <q-btn color="primary" label="Guardar" type="submit" :loading="saving" />
          </q-card-actions>
        </q-form>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import {
  usePartnersApi,
  type PartnerListItem,
  type PartnerBenefitType,
  type PartnerCommissionType,
  type CreatePartnerInput,
} from 'src/composables/usePartnersApi';
import { useMembersApi } from 'src/composables/useMembersApi';
import type { BranchOption } from 'src/types/member';

const log = createLogger('PartnerFormDialog');
const $q = useQuasar();
const partnersApi = usePartnersApi();
const membersApi = useMembersApi();

const props = defineProps<{
  modelValue: boolean;
  partner: PartnerListItem | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  saved: [];
}>();

const isEdit = computed(() => !!props.partner);
const saving = ref(false);

const benefitTypeOptions: Array<{ label: string; value: PartnerBenefitType }> = [
  { label: 'Descuento % en la primera cuota', value: 'discount_percent' },
  { label: 'Semana gratis', value: 'free_pass' },
];

const commissionTypeOptions: Array<{ label: string; value: PartnerCommissionType }> = [
  { label: 'Monto fijo', value: 'fixed' },
  { label: 'Sin comision', value: 'none' },
];

const form = ref<{
  name: string;
  code: string;
  branchId: number | null;
  benefitType: PartnerBenefitType;
  benefitValue: number;
  commissionType: PartnerCommissionType;
  commissionValue: number;
  contactName: string;
  contactPhone: string;
  notes: string;
  isActive: boolean;
}>({
  name: '',
  code: '',
  branchId: null,
  benefitType: 'discount_percent',
  benefitValue: 20,
  commissionType: 'fixed',
  commissionValue: 0,
  contactName: '',
  contactPhone: '',
  notes: '',
  isActive: true,
});

const required = (val: unknown) => !!val || val === 0 || 'Campo requerido';

function benefitValueRule(val: number): true | string {
  if (form.value.benefitType !== 'discount_percent') return true;
  return (val >= 1 && val <= 100) || 'Debe estar entre 1 y 100';
}

function commissionValueRule(val: number): true | string {
  if (form.value.commissionType !== 'fixed') return true;
  return val >= 0 || 'No puede ser negativo';
}

// =========================================================================
// Branches (para el selector de sede + moneda derivada, D-13)
// =========================================================================

const branchOptions = ref<Array<{ label: string; value: number; country?: string }>>([]);
const loadingBranches = ref(false);

async function fetchBranches() {
  loadingBranches.value = true;
  try {
    const branches = await membersApi.getBranches();
    branchOptions.value = branches.map((b: BranchOption) => ({
      label: b.name,
      value: b.id,
      country: b.country,
    }));
  } catch (err: unknown) {
    log.error('Failed to load branches', {
      err: err instanceof Error ? err.message : String(err),
    });
  } finally {
    loadingBranches.value = false;
  }
}

// La moneda NUNCA es un campo del formulario (D-13): se deriva de la sede
// elegida, solo texto informativo.
const currencyText = computed(() => {
  const branch = branchOptions.value.find((b) => b.value === form.value.branchId);
  if (!branch) return '';
  const currency = branch.country === 'ES' ? 'EUR' : 'ARS';
  return `Se liquida en ${currency} segun la sede`;
});

watch(
  () => props.modelValue,
  async (show) => {
    if (!show) return;

    await fetchBranches();

    if (props.partner) {
      form.value = {
        name: props.partner.name,
        code: props.partner.code,
        branchId: props.partner.branchId,
        benefitType: props.partner.benefitType,
        benefitValue: props.partner.benefitValue,
        commissionType: props.partner.commissionType,
        commissionValue: props.partner.commissionValue,
        contactName: props.partner.contactName ?? '',
        contactPhone: props.partner.contactPhone ?? '',
        notes: props.partner.notes ?? '',
        isActive: props.partner.isActive,
      };
    } else {
      form.value = {
        name: '',
        code: '',
        branchId: null,
        benefitType: 'discount_percent',
        benefitValue: 20,
        commissionType: 'fixed',
        commissionValue: 0,
        contactName: '',
        contactPhone: '',
        notes: '',
        isActive: true,
      };
    }
  }
);

async function onSubmit() {
  if (!form.value.branchId) return;
  saving.value = true;
  try {
    // D-05/D-19: la semana gratis no lleva valor (fijo, 0). Sin comision no
    // lleva monto (fijo, 0) — el backend rechaza cualquier otro valor.
    const benefitValue = form.value.benefitType === 'free_pass' ? 0 : form.value.benefitValue;
    const commissionValue = form.value.commissionType === 'none' ? 0 : form.value.commissionValue;

    if (isEdit.value && props.partner) {
      await partnersApi.updatePartner(props.partner.id, {
        name: form.value.name,
        benefitType: form.value.benefitType,
        benefitValue,
        commissionType: form.value.commissionType,
        commissionValue,
        contactName: form.value.contactName || null,
        contactPhone: form.value.contactPhone || null,
        notes: form.value.notes || null,
        isActive: form.value.isActive,
      });
      $q.notify({ type: 'positive', message: 'Partner actualizado' });
    } else {
      const input: CreatePartnerInput = {
        name: form.value.name,
        code: form.value.code,
        branchId: form.value.branchId,
        benefitType: form.value.benefitType,
        benefitValue,
        commissionType: form.value.commissionType,
        commissionValue,
        contactName: form.value.contactName || undefined,
        contactPhone: form.value.contactPhone || undefined,
        notes: form.value.notes || undefined,
      };
      await partnersApi.createPartner(input);
      $q.notify({ type: 'positive', message: 'Partner creado' });
    }
    emit('update:modelValue', false);
    emit('saved');
  } catch (err: unknown) {
    // D-03: el mensaje del 409 (cuál de los 3 espacios de nombres colisionó)
    // viene textual de la API — se muestra tal cual, sin un mapeo aparte.
    const message = extractError(err, 'Error al guardar el partner');
    log.error('Failed to save partner', {
      err: err instanceof Error ? err.message : String(err),
    });
    $q.notify({ type: 'negative', message });
  } finally {
    saving.value = false;
  }
}
</script>
