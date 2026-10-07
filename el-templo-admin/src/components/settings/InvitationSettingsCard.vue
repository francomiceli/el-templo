<template>
  <q-card flat bordered style="max-width: 640px">
    <q-card-section>
      <div class="text-subtitle1 q-mb-xs">Invitaciones</div>

      <q-banner dense rounded class="bg-grey-2 text-grey-9 q-mb-md">
        <template #avatar>
          <q-icon name="info" color="primary" />
        </template>
        Parámetros del programa de invitaciones. Los cambios aplican a las invitaciones que se
        activen desde ahora.
        <span v-if="!canEdit">Solo gestión o el propietario pueden modificarlos.</span>
      </q-banner>

      <div v-if="loading" class="row items-center text-grey-7 q-mb-sm">
        <q-spinner size="18px" class="q-mr-sm" />
        Cargando…
      </div>

      <q-form v-if="loaded" ref="formRef" class="q-gutter-md" @submit.prevent="onSave">
        <div class="row q-col-gutter-md">
          <div v-for="field in numericFields" :key="field.key" class="col-12 col-sm-6">
            <q-input
              v-model.number="form[field.key]"
              :label="field.label"
              :suffix="field.suffix"
              :hint="field.hint"
              type="number"
              dense
              outlined
              :readonly="!canEdit"
              :rules="[rangeRule(field.label, field.min, field.max)]"
              lazy-rules
            />
          </div>
        </div>

        <div>
          <div class="text-subtitle2 q-mb-xs">Accesos por invitación</div>
          <div class="text-caption text-grey-7 q-mb-sm">
            Cantidad de clases que recibe cada invitado, por país. Aplica a las invitaciones que se
            activen desde ahora: las ya activadas conservan los accesos que recibieron.
          </div>
          <div class="row q-col-gutter-md">
            <div v-for="acc in accessFields" :key="acc.country" class="col-12 col-sm-6">
              <q-input
                v-model.number="form.accesses[acc.country]"
                :label="acc.label"
                suffix="accesos"
                :hint="accessHint(acc.country)"
                type="number"
                dense
                outlined
                :readonly="!canEdit || !hasAccessPlan(acc.country)"
                :disable="!hasAccessPlan(acc.country)"
                :rules="[accessRule(acc.label, acc.country)]"
                lazy-rules
              />
            </div>
          </div>
        </div>

        <div>
          <div class="text-subtitle2 q-mb-xs">Tope de descuento en dinero por cobro</div>
          <div class="text-caption text-grey-7 q-mb-sm">
            Máximo que se descuenta por invitación en cada cobro. Vacío = sin tope.
          </div>
          <div class="row q-col-gutter-md">
            <div v-for="cap in capFields" :key="cap.country" class="col-12 col-sm-6">
              <q-input
                v-model.number="form.caps[cap.country]"
                :label="cap.label"
                :prefix="cap.prefix"
                placeholder="Sin tope"
                stack-label
                type="number"
                dense
                outlined
                :clearable="canEdit"
                :readonly="!canEdit"
                :rules="[capRule(cap.label)]"
                lazy-rules
              />
            </div>
          </div>
        </div>

        <q-list dense bordered separator class="rounded-borders">
          <q-item>
            <q-item-section>% por invitado activo</q-item-section>
            <q-item-section side class="text-grey-9">
              {{ settings?.perLinkPercent ?? '-' }}% (configuración AURA)
            </q-item-section>
          </q-item>
          <q-item>
            <q-item-section>Tope de descuento acumulable</q-item-section>
            <q-item-section side class="text-grey-9">
              {{ settings?.maxPercentCap ?? '-' }}%
            </q-item-section>
          </q-item>
        </q-list>

        <div v-if="canEdit" class="row justify-end">
          <q-btn
            type="submit"
            label="Guardar"
            color="primary"
            :loading="saving"
            :disable="saving || !dirty"
          />
        </div>
      </q-form>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import type { QForm } from 'quasar';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { useInvitationSettingsApi } from 'src/composables/useInvitationSettingsApi';
import { useAuthStore } from 'src/stores/useAuthStore';
import type {
  InvitationCapCountry,
  InvitationIntKey,
  InvitationSettings,
  InvitationSettingsPatch,
} from 'src/types/settings';

const log = createLogger('InvitationSettingsCard');
const $q = useQuasar();
const authStore = useAuthStore();
const settingsApi = useInvitationSettingsApi();

// Fase 194 D-10c: espejo de INVITATION_SETTINGS_WRITE_ROLES de la API. El servidor
// es la autoridad (403 a otros roles); acá solo se decide si se muestra la edición.
const canEdit = computed(() => {
  const role = authStore.user?.role;
  return role === 'gestion' || role === 'admin' || role === 'owner';
});

type IntKey = InvitationIntKey;

interface NumericFieldDef {
  key: IntKey;
  label: string;
  suffix?: string;
  /** Texto del hint SIN el rango: el rango lo agrega `numericFields` desde `limits`. */
  hint: string;
}

interface NumericField extends NumericFieldDef {
  min: number;
  max: number;
}

const NUMERIC_FIELD_DEFS: NumericFieldDef[] = [
  { key: 'monthlyQuota', label: 'Invitaciones por mes', hint: 'Cupo por socio' },
  {
    key: 'accessBusinessDays',
    label: 'Vigencia de los accesos',
    suffix: 'días hábiles',
    hint: 'De lunes a sábado, sin feriados',
  },
  {
    key: 'reinviteWindowDays',
    label: 'Ventana de reinvitación',
    suffix: 'días',
    hint: 'Una persona no puede recibir otra invitación antes',
  },
  {
    key: 'exMemberInactivityMonths',
    label: 'Inactividad de ex socio',
    suffix: 'meses',
    hint: 'Sin membresía para poder ser invitado',
  },
  {
    key: 'latePurchaseWindowDays',
    label: 'Ventana de compra tardía',
    suffix: 'días',
    hint: 'Tras vencer los accesos, la compra aún da descuento',
  },
  {
    key: 'inviteePercent',
    label: 'Descuento del invitado',
    suffix: '%',
    hint: 'Porcentaje que recibe quien compra',
  },
];

// Los rangos son los que devuelve el servidor (`limits`): no se duplican acá (LO-03).
const numericFields = computed<NumericField[]>(() => {
  const limits = settings.value?.limits;
  if (!limits) return [];
  return NUMERIC_FIELD_DEFS.map((def) => ({
    ...def,
    min: limits[def.key].min,
    max: limits[def.key].max,
    hint: `${def.hint} (${limits[def.key].min} a ${limits[def.key].max})`,
  }));
});

const accessFields: Array<{ country: InvitationCapCountry; label: string }> = [
  { country: 'AR', label: 'Argentina' },
  { country: 'ES', label: 'España' },
];

const capFields: Array<{ country: InvitationCapCountry; label: string; prefix: string }> = [
  { country: 'AR', label: 'Argentina (ARS)', prefix: '$' },
  { country: 'ES', label: 'España (EUR)', prefix: '€' },
];

interface FormState extends Record<IntKey, number | null> {
  caps: Record<InvitationCapCountry, number | null>;
  accesses: Record<InvitationCapCountry, number | null>;
}

const formRef = ref<InstanceType<typeof QForm> | null>(null);
const settings = ref<InvitationSettings | null>(null);
const form = ref<FormState>(emptyForm());
const loaded = ref(false);
const saving = ref(false);
const loading = settingsApi.loading;

function emptyForm(): FormState {
  return {
    monthlyQuota: null,
    accessBusinessDays: null,
    reinviteWindowDays: null,
    exMemberInactivityMonths: null,
    latePurchaseWindowDays: null,
    inviteePercent: null,
    caps: { AR: null, ES: null },
    accesses: { AR: null, ES: null },
  };
}

/** Un q-input numérico vaciado puede emitir '' en vez de null: normalizar. */
function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function rangeRule(label: string, min: number, max: number) {
  return (val: unknown) => {
    const n = numberOrNull(val);
    if (n === null || !Number.isInteger(n)) return `${label}: ingresá un número entero`;
    return (n >= min && n <= max) || `${label}: debe estar entre ${min} y ${max}`;
  };
}

/** El país tiene plan Invitación activo: sin plan no hay accesos que editar. */
function hasAccessPlan(country: InvitationCapCountry): boolean {
  return settings.value?.accessesPerInvitation[country] != null;
}

function accessHint(country: InvitationCapCountry): string {
  const range = settings.value?.limits.accessesPerInvitation;
  if (!hasAccessPlan(country)) return 'Este país no tiene un plan de Invitación configurado';
  return range ? `Entre ${range.min} y ${range.max}` : '';
}

function accessRule(label: string, country: InvitationCapCountry) {
  return (val: unknown) => {
    // Sin plan en el país el campo está deshabilitado y no se envía.
    if (!hasAccessPlan(country)) return true;
    const range = settings.value?.limits.accessesPerInvitation;
    return range ? rangeRule(`Accesos (${label})`, range.min, range.max)(val) : true;
  };
}

// Vacío = sin tope; si hay valor tiene que ser un entero positivo.
function capRule(label: string) {
  return (val: unknown) => {
    if (val === null || val === undefined || val === '') return true;
    const n = numberOrNull(val);
    return (
      (n !== null && Number.isInteger(n) && n >= 1) || `${label}: debe ser un entero mayor a 0`
    );
  };
}

function formFromSettings(s: InvitationSettings): FormState {
  return {
    monthlyQuota: s.monthlyQuota,
    accessBusinessDays: s.accessBusinessDays,
    reinviteWindowDays: s.reinviteWindowDays,
    exMemberInactivityMonths: s.exMemberInactivityMonths,
    latePurchaseWindowDays: s.latePurchaseWindowDays,
    inviteePercent: s.inviteePercent,
    // El tope arranca vacío (= sin tope) y se puede borrar (null).
    caps: { AR: s.discountCapAmount.AR, ES: s.discountCapAmount.ES },
    accesses: { AR: s.accessesPerInvitation.AR, ES: s.accessesPerInvitation.ES },
  };
}

function capValue(country: InvitationCapCountry): number | null {
  return numberOrNull(form.value.caps[country]);
}

function accessValue(country: InvitationCapCountry): number | null {
  return numberOrNull(form.value.accesses[country]);
}

// Hay cambios sin guardar respecto de lo último que devolvió el servidor.
const dirty = computed(() => {
  const s = settings.value;
  if (!s) return false;
  const intsChanged = numericFields.value.some((f) => numberOrNull(form.value[f.key]) !== s[f.key]);
  const capsChanged = capFields.some((c) => capValue(c.country) !== s.discountCapAmount[c.country]);
  const accessChanged = accessFields.some(
    (a) => hasAccessPlan(a.country) && accessValue(a.country) !== s.accessesPerInvitation[a.country]
  );
  return intsChanged || capsChanged || accessChanged;
});

function applySettings(s: InvitationSettings) {
  settings.value = s;
  form.value = formFromSettings(s);
}

async function load() {
  try {
    applySettings(await settingsApi.getSettings());
    loaded.value = true;
  } catch (err: unknown) {
    log.warn('Error cargando los parámetros de invitaciones', {
      error: err instanceof Error ? err.message : String(err),
    });
    $q.notify({
      type: 'negative',
      message: settingsApi.error.value ?? 'No se pudieron cargar los parámetros de invitaciones',
    });
  }
}

/** Arma el patch solo con lo que cambió; `null` en un tope lo borra. */
function buildPatch(s: InvitationSettings): InvitationSettingsPatch {
  const patch: InvitationSettingsPatch = {};
  for (const f of numericFields.value) {
    const value = numberOrNull(form.value[f.key]);
    if (value !== null && value !== s[f.key]) patch[f.key] = value;
  }
  const caps: Partial<Record<InvitationCapCountry, number | null>> = {};
  for (const c of capFields) {
    const value = capValue(c.country);
    if (value !== s.discountCapAmount[c.country]) caps[c.country] = value;
  }
  if (Object.keys(caps).length > 0) patch.discountCapAmount = caps;
  // Solo países con plan Invitación y valor cambiado (el servidor no acepta null).
  const accesses: Partial<Record<InvitationCapCountry, number>> = {};
  for (const a of accessFields) {
    const value = accessValue(a.country);
    if (
      hasAccessPlan(a.country) &&
      value !== null &&
      value !== s.accessesPerInvitation[a.country]
    ) {
      accesses[a.country] = value;
    }
  }
  if (Object.keys(accesses).length > 0) patch.accessesPerInvitation = accesses;
  return patch;
}

async function onSave() {
  const current = settings.value;
  if (!current || !canEdit.value) return;
  const valid = await formRef.value?.validate();
  if (!valid) return;

  saving.value = true;
  try {
    applySettings(await settingsApi.updateSettings(buildPatch(current)));
    $q.notify({ type: 'positive', message: 'Parámetros de invitaciones actualizados' });
  } catch (err: unknown) {
    $q.notify({
      type: 'negative',
      message: extractError(err, 'No se pudieron guardar los parámetros de invitaciones'),
      timeout: 5000,
    });
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void load();
});

onBeforeUnmount(() => {
  settingsApi.cleanup();
});
</script>
