<!-- Editor de notificación push (Fase 193, Plan B, pedido de Franco
     2026-09-03). Un solo diálogo para las dos cosas:
       - Crear/editar una notificación PROPIA (`kind: 'custom'`): nombre
         interno, categoría (solo en el alta — el PUT no acepta `category`,
         ver `el-templo-api/.../notifications/routes.ts` `updateTemplateSchema`),
         título/cuerpo + variante femenina colapsable, destino, condición
         recetada (catálogo `rule-triggers.ts`), audiencia (sedes/países,
         vacío = todos), cadencia y activo/pausado. Preview en vivo de
         "hoy alcanzaría N socios" con debounce.
       - Editar una de SISTEMA (`kind: 'system'`): mismo diálogo, pero sin
         nombre interno y con la condición mostrada como texto fijo
         ("Disparador del sistema: …") — la API rechaza con 400 cualquier
         campo de condición (`name`/`trigger*`/`scope*`/`cooldownDays`) para
         `kind: 'system'` (ver docblock del PUT), así que este componente ni
         los muestra ni los manda.

     Alcance: `scopeBranchIds`/`scopeCountries` viajan como `null` cuando el
     selector queda vacío ("todos los socios") — la API acepta `null`
     explícito para VACIAR un alcance ya guardado (mismo contrato que los
     avisos); omitir el campo significaría "sin cambios". -->
<template>
  <q-dialog v-model="localOpen" persistent>
    <q-card style="min-width: 520px; max-width: 680px; width: 100%">
      <q-card-section>
        <div class="text-h6">{{ dialogTitle }}</div>
        <div
          v-if="isSystem"
          class="comm-origin-chip comm-origin-chip--system q-mt-xs"
        >
          Sistema
        </div>
      </q-card-section>

      <q-card-section class="q-gutter-md" style="max-height: 68vh; overflow-y: auto">
        <q-input
          v-if="!isSystem"
          v-model="form.name"
          label="Nombre interno"
          dense
          outlined
          maxlength="120"
          counter
          hint="Solo lo ve el staff, no el socio."
          :rules="[requiredRule]"
        />

        <q-select
          v-if="isCreate"
          v-model="form.category"
          :options="NOTIFICATION_CATEGORY_OPTIONS"
          label="Categoría"
          dense
          outlined
          emit-value
          map-options
        />
        <div v-else class="row items-center q-gutter-x-xs">
          <span class="text-caption text-grey-7">Categoría:</span>
          <q-badge :color="categoryColor(form.category)" :label="categoryLabel(form.category)" />
          <span class="text-caption text-grey-6">(no editable después de creada)</span>
        </div>

        <q-input
          v-model="form.title"
          label="Título"
          dense
          outlined
          maxlength="200"
          counter
          :rules="[requiredRule]"
        />
        <q-input
          v-model="form.body"
          label="Cuerpo"
          type="textarea"
          autogrow
          dense
          outlined
          :rules="[requiredRule]"
        />

        <q-expansion-item
          dense
          :default-opened="Boolean(form.titleFemale || form.bodyFemale)"
          label="Variante femenina (opcional)"
          header-class="text-caption"
        >
          <q-input
            v-model="form.titleFemale"
            label="Título (femenino)"
            class="q-mt-sm"
            dense
            outlined
            maxlength="200"
            counter
          />
          <q-input
            v-model="form.bodyFemale"
            label="Cuerpo (femenino)"
            type="textarea"
            autogrow
            class="q-mt-sm"
            dense
            outlined
          />
        </q-expansion-item>

        <DestinoSelector v-model="form.destination" />

        <q-separator />
        <div class="text-subtitle2">Condición</div>

        <div v-if="isSystem" class="text-body2 comm-fixed-condition">
          Disparador del sistema: {{ systemDescription }}
        </div>

        <template v-else>
          <q-select
            v-model="form.triggerType"
            :options="RULE_TRIGGER_OPTIONS"
            label="Se cumple cuando…"
            dense
            outlined
            emit-value
            map-options
            :rules="[requiredRule]"
          />
          <div v-if="selectedTrigger" class="text-caption text-grey-7">
            {{ selectedTrigger.helpText }}
          </div>

          <q-input
            v-if="selectedTrigger?.needsValue"
            v-model.number="form.triggerValue"
            type="number"
            label="N días"
            dense
            outlined
            :min="selectedTrigger.minValue"
            :max="selectedTrigger.maxValue"
            :hint="`Entre ${selectedTrigger.minValue} y ${selectedTrigger.maxValue}`"
          />
          <q-select
            v-if="selectedTrigger?.needsSegment"
            v-model="form.triggerSegment"
            :options="MEMBER_SEGMENT_OPTIONS"
            label="Segmento"
            dense
            outlined
            emit-value
            map-options
            :rules="[requiredRule]"
          />

          <q-banner v-if="overlapWarning" class="bg-orange-1 text-orange-10" rounded dense>
            <template #avatar>
              <q-icon name="warning" color="orange-9" />
            </template>
            {{ overlapWarning }}
          </q-banner>

          <div class="row items-center q-gutter-x-sm">
            <q-spinner v-if="previewLoading" size="16px" color="primary" />
            <span v-else-if="previewCount !== null" class="text-body2">
              Hoy alcanzaría <strong>{{ previewCount }}</strong> socios
            </span>
            <span v-else class="text-caption text-grey-6">
              Elegí una condición completa para ver la audiencia
            </span>
          </div>

          <q-separator />
          <div class="text-subtitle2">Audiencia</div>
          <div class="text-caption text-grey-7 q-mb-xs">
            Vacío en los dos selectores = todos los socios.
          </div>
          <q-select
            v-model="form.scopeBranchIds"
            :options="branchOptions"
            label="Sedes"
            dense
            outlined
            multiple
            emit-value
            map-options
            use-chips
            hint="Vacío = todas las sedes"
          />
          <q-select
            v-if="isOwner"
            v-model="form.scopeCountries"
            :options="countryOptions"
            label="Países"
            dense
            outlined
            multiple
            emit-value
            map-options
            use-chips
            hint="Vacío = todos los países"
          />

          <q-separator />
          <q-input
            v-model.number="form.cooldownDays"
            type="number"
            label="No repetir al mismo socio antes de"
            suffix="días"
            dense
            outlined
            min="1"
            max="365"
          />
        </template>

        <q-separator />
        <div class="text-subtitle2">Probar en tu teléfono</div>
        <div class="text-caption text-grey-7 q-mb-xs">
          Manda esta notificación, tal como está escrita ahora, a la cuenta de la app de un socio
          (por ejemplo la tuya). No guarda nada ni cuenta como envío de la regla.
        </div>
        <div class="row items-start q-col-gutter-sm">
          <div class="col-12 col-sm">
            <q-select
              v-model="testMember"
              :options="testMemberOptions"
              :loading="searchingTestMember"
              label="Socio de prueba"
              option-label="displayLabel"
              option-value="id"
              dense
              outlined
              clearable
              use-input
              input-debounce="300"
              hint="Buscá por nombre o DNI. Queda guardado en este navegador."
              @filter="onTestMemberFilter"
            >
              <template #no-option>
                <q-item>
                  <q-item-section class="text-grey">
                    {{ testMemberQuery.length < 2 ? 'Escribí al menos 2 letras' : 'Sin resultados' }}
                  </q-item-section>
                </q-item>
              </template>
            </q-select>
          </div>
          <div class="col-12 col-sm-auto">
            <q-btn
              outline
              color="primary"
              icon="send"
              label="Enviar prueba"
              :loading="sendingTest"
              :disable="!canSendTest"
              @click="handleSendTest"
            />
          </div>
        </div>

        <q-separator />
        <q-toggle v-model="form.isEnabled" color="positive" label="Activo" />
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Cancelar" v-close-popup :disable="saving" />
        <q-btn
          color="primary"
          label="Guardar"
          unelevated
          :loading="saving"
          :disable="!canSave"
          @click="handleSave"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { useAuthStore } from 'src/stores/useAuthStore';
import { useMembersApi } from 'src/composables/useMembersApi';
import { useCommunicationsApi } from 'src/composables/useCommunicationsApi';
import type {
  TemplateRow,
  MemberSegmentKey,
  CreateTemplateInput,
  UpdateTemplateInput,
} from 'src/composables/useCommunicationsApi';
import DestinoSelector from 'src/components/comunicaciones/DestinoSelector.vue';
import type { Destination } from 'src/config/destinations';
import {
  RULE_TRIGGER_OPTIONS,
  MEMBER_SEGMENT_OPTIONS,
  NOTIFICATION_CATEGORY_OPTIONS,
  PLAN_EXPIRY_OVERLAP_WARNINGS,
  categoryColor,
  categoryLabel,
  findRuleTrigger,
  systemTriggerDescription,
  type NotificationCategoryKey,
  type RuleTriggerType,
} from 'src/config/rule-triggers';
import type { BranchOption } from 'src/types/member';
import type { MemberSearchResult } from 'src/composables/useMembersApi';

const log = createLogger('PushRuleEditorDialog');
const $q = useQuasar();
const authStore = useAuthStore();
const membersApi = useMembersApi();
const commsApi = useCommunicationsApi();

const props = defineProps<{
  modelValue: boolean;
  template: TemplateRow | null;
  /** Lista completa (system + custom) — necesaria para el aviso de
   * solapamiento con `plan_renewal_warning_*` (D-warning del plan). */
  allTemplates: TemplateRow[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  saved: [];
}>();

const localOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const isSystem = computed(() => props.template?.kind === 'system');
const isCreate = computed(() => props.template === null);
const isOwner = computed(() => authStore.user?.role === 'owner');

const dialogTitle = computed(() => {
  if (isCreate.value) return 'Nueva notificación';
  return isSystem.value ? 'Editar notificación de sistema' : 'Editar notificación';
});

const systemDescription = computed(() =>
  props.template ? systemTriggerDescription(props.template.templateKey) : '',
);

function emptyDestination(): Destination {
  return { type: 'app_section', section: 'mi_templo', whatsappText: null };
}

const form = reactive({
  name: '',
  category: 'anuncios' as NotificationCategoryKey,
  title: '',
  body: '',
  titleFemale: '',
  bodyFemale: '',
  destination: emptyDestination(),
  triggerType: null as RuleTriggerType | null,
  triggerValue: null as number | null,
  triggerSegment: null as MemberSegmentKey | null,
  scopeBranchIds: [] as number[],
  scopeCountries: [] as string[],
  cooldownDays: 30,
  isEnabled: true,
});

const selectedTrigger = computed(() =>
  form.triggerType ? findRuleTrigger(form.triggerType) : undefined,
);

function resetForm(): void {
  const t = props.template;
  if (t) {
    form.name = t.name ?? '';
    form.category = t.category as NotificationCategoryKey;
    form.title = t.title;
    form.body = t.body;
    form.titleFemale = t.titleFemale ?? '';
    form.bodyFemale = t.bodyFemale ?? '';
    form.destination = {
      type: t.destinationType,
      section: t.destinationSection,
      whatsappText: t.whatsappText,
    };
    form.triggerType = t.triggerType;
    form.triggerValue = t.triggerValue;
    form.triggerSegment = t.triggerSegment;
    form.scopeBranchIds = t.scopeBranchIds ?? [];
    form.scopeCountries = t.scopeCountries ?? [];
    form.cooldownDays = t.cooldownDays || 30;
    form.isEnabled = t.isEnabled;
  } else {
    form.name = '';
    form.category = 'anuncios';
    form.title = '';
    form.body = '';
    form.titleFemale = '';
    form.bodyFemale = '';
    form.destination = emptyDestination();
    form.triggerType = null;
    form.triggerValue = null;
    form.triggerSegment = null;
    form.scopeBranchIds = [];
    form.scopeCountries = [];
    form.cooldownDays = 30;
    form.isEnabled = true;
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) resetForm();
  },
);

// ── Sedes / países ─────────────────────────────────────────────────────
const branches = ref<BranchOption[]>([]);
const branchOptions = computed(() => branches.value.map((b) => ({ label: b.name, value: b.id })));
const countryOptions = [
  { label: 'Argentina', value: 'AR' },
  { label: 'España', value: 'ES' },
];

async function loadBranches() {
  try {
    branches.value = await membersApi.getBranches();
  } catch (err: unknown) {
    log.error('Error loading branches', { error: extractError(err, 'Error cargando sedes') });
  }
}

// ── Aviso de solapamiento con plantillas fijas de vencimiento ────────────
const overlapWarning = computed(() => {
  if (isSystem.value || form.triggerType !== 'plan_expires_in_days') return null;
  const match = PLAN_EXPIRY_OVERLAP_WARNINGS.find(
    (w) => w.triggerType === form.triggerType && w.value === form.triggerValue,
  );
  if (!match) return null;
  const systemTemplate = props.allTemplates.find(
    (t) => t.templateKey === match.systemTemplateKey && t.kind === 'system',
  );
  if (!systemTemplate?.isEnabled) return null;
  return `Esta condición coincide con la plantilla fija de sistema "${systemTemplate.title}", que está activa. El socio podría recibir dos avisos parecidos el mismo día — esto no bloquea el guardado.`;
});

// ── Preview de audiencia ("hoy alcanzaría N socios"), con debounce ───────
const previewCount = ref<number | null>(null);
const previewLoading = ref(false);
let previewTimer: ReturnType<typeof setTimeout> | null = null;

function conditionReady(): boolean {
  if (!form.triggerType) return false;
  const trigger = selectedTrigger.value;
  if (!trigger) return false;
  if (trigger.needsValue) return typeof form.triggerValue === 'number' && Number.isInteger(form.triggerValue);
  if (trigger.needsSegment) return Boolean(form.triggerSegment);
  return true;
}

async function runPreview(): Promise<void> {
  if (isSystem.value || !conditionReady() || !form.triggerType) {
    previewCount.value = null;
    return;
  }
  previewLoading.value = true;
  try {
    previewCount.value = await commsApi.previewTemplateAudience({
      triggerType: form.triggerType,
      ...(selectedTrigger.value?.needsValue && form.triggerValue !== null
        ? { triggerValue: form.triggerValue }
        : {}),
      ...(selectedTrigger.value?.needsSegment && form.triggerSegment
        ? { triggerSegment: form.triggerSegment }
        : {}),
      ...(form.scopeBranchIds.length ? { scopeBranchIds: form.scopeBranchIds } : {}),
      ...(form.scopeCountries.length ? { scopeCountries: form.scopeCountries } : {}),
    });
  } catch (err: unknown) {
    log.error('Error previewing audience', { error: extractError(err, 'Error de preview') });
    previewCount.value = null;
  } finally {
    previewLoading.value = false;
  }
}

watch(
  () => [
    form.triggerType,
    form.triggerValue,
    form.triggerSegment,
    form.scopeBranchIds.slice(),
    form.scopeCountries.slice(),
  ],
  () => {
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      void runPreview();
    }, 400);
  },
  { deep: true },
);

// ── Probar en tu teléfono (pedido de Franco, 2026-09-04) ────────────────
// El socio de prueba (normalmente la cuenta de la app del propio admin) se
// recuerda en localStorage: es una conveniencia por navegador, no un dato
// del sistema — si no está o el storage falla, simplemente se vuelve a elegir.

interface TestMemberOption {
  id: number;
  displayLabel: string;
}

const TEST_MEMBER_STORAGE_KEY = 'comunicaciones.testMember';

function loadStoredTestMember(): TestMemberOption | null {
  try {
    const raw = localStorage.getItem(TEST_MEMBER_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as TestMemberOption).id === 'number' &&
      typeof (parsed as TestMemberOption).displayLabel === 'string'
    ) {
      return parsed as TestMemberOption;
    }
    return null;
  } catch {
    return null;
  }
}

function storeTestMember(member: TestMemberOption | null): void {
  try {
    if (member) localStorage.setItem(TEST_MEMBER_STORAGE_KEY, JSON.stringify(member));
    else localStorage.removeItem(TEST_MEMBER_STORAGE_KEY);
  } catch {
    // storage bloqueado o lleno: la elección vale solo para este diálogo
  }
}

// Declarado acá (y no en "Guardar") porque `canSendTest` lo lee.
const saving = ref(false);

const testMember = ref<TestMemberOption | null>(loadStoredTestMember());
const testMemberOptions = ref<TestMemberOption[]>([]);
const testMemberQuery = ref('');
const searchingTestMember = ref(false);
const sendingTest = ref(false);

watch(testMember, (member) => storeTestMember(member));

function memberDisplayLabel(m: MemberSearchResult): string {
  const name = `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || `Socio #${m.id}`;
  return m.dni ? `${name} (${m.dni})` : name;
}

function onTestMemberFilter(val: string, update: (fn: () => void) => void): void {
  testMemberQuery.value = val;
  if (!val || val.length < 2) {
    update(() => {
      testMemberOptions.value = [];
    });
    return;
  }
  searchingTestMember.value = true;
  membersApi
    .searchMembers(val, 10)
    .then((members) => {
      update(() => {
        testMemberOptions.value = members.map((m) => ({
          id: m.id,
          displayLabel: memberDisplayLabel(m),
        }));
      });
    })
    .catch((err: unknown) => {
      log.error('Error buscando socio de prueba', {
        error: extractError(err, 'Error buscando socios'),
      });
      update(() => {
        testMemberOptions.value = [];
      });
    })
    .finally(() => {
      searchingTestMember.value = false;
    });
}

const canSendTest = computed(
  () =>
    Boolean(testMember.value) &&
    form.title.trim().length > 0 &&
    form.body.trim().length > 0 &&
    !sendingTest.value &&
    !saving.value,
);

async function handleSendTest(): Promise<void> {
  if (!testMember.value) return;
  sendingTest.value = true;
  try {
    const result = await commsApi.sendTestTemplate({
      userId: testMember.value.id,
      title: form.title.trim(),
      body: form.body.trim(),
      destination: form.destination,
    });
    if (result.status === 'sent') {
      $q.notify({
        type: 'positive',
        message: `Prueba enviada a ${result.memberName}. Tendría que llegar al teléfono en segundos.`,
      });
    } else if (result.status === 'no_tokens') {
      $q.notify({
        type: 'warning',
        message: `${result.memberName} no tiene la app con notificaciones activas en ningún teléfono.`,
      });
    } else {
      $q.notify({
        type: 'negative',
        message: `No se pudo entregar la prueba a ${result.memberName}. Revisá que la app esté instalada y con notificaciones permitidas.`,
      });
    }
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudo enviar la prueba');
    log.error('Error enviando notificación de prueba', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    sendingTest.value = false;
  }
}

// ── Validación ──────────────────────────────────────────────────────────

function requiredRule(val: string | number | null): boolean | string {
  if (typeof val === 'number') return true;
  return Boolean(val && val.trim().length > 0) || 'Requerido';
}

const canSave = computed(() => {
  if (!isSystem.value && !form.name.trim()) return false;
  if (!form.title.trim() || !form.body.trim()) return false;
  if (!isSystem.value) {
    if (!form.triggerType) return false;
    const trigger = selectedTrigger.value;
    if (trigger?.needsValue) {
      if (form.triggerValue === null || !Number.isInteger(form.triggerValue)) return false;
      if (trigger.minValue !== undefined && form.triggerValue < trigger.minValue) return false;
      if (trigger.maxValue !== undefined && form.triggerValue > trigger.maxValue) return false;
    }
    if (trigger?.needsSegment && !form.triggerSegment) return false;
    if (!form.cooldownDays || form.cooldownDays < 1 || form.cooldownDays > 365) return false;
  }
  return true;
});

// ── Guardar ─────────────────────────────────────────────────────────────

async function handleSave(): Promise<void> {
  saving.value = true;
  try {
    if (props.template) {
      const payload: UpdateTemplateInput = {
        title: form.title.trim(),
        body: form.body.trim(),
        destination: form.destination,
        isEnabled: form.isEnabled,
      };
      if (form.titleFemale.trim()) payload.titleFemale = form.titleFemale.trim();
      if (form.bodyFemale.trim()) payload.bodyFemale = form.bodyFemale.trim();

      if (!isSystem.value && form.triggerType) {
        payload.name = form.name.trim();
        payload.triggerType = form.triggerType;
        const trigger = selectedTrigger.value;
        // `null` explícito cuando el disparador no lleva ese parámetro: al
        // cambiar de "vence en N días" a un disparador de estado, el N viejo
        // no debe quedar guardado.
        payload.triggerValue =
          trigger?.needsValue && form.triggerValue !== null ? form.triggerValue : null;
        payload.triggerSegment =
          trigger?.needsSegment && form.triggerSegment ? form.triggerSegment : null;
        // `null` explícito = "todos": vaciar el selector en el edit SÍ borra
        // el alcance guardado (la API lo acepta desde el fix post-revisión).
        payload.scopeBranchIds = form.scopeBranchIds.length ? form.scopeBranchIds : null;
        payload.scopeCountries = form.scopeCountries.length ? form.scopeCountries : null;
        payload.cooldownDays = form.cooldownDays;
      }

      await commsApi.updateTemplate(props.template.id, payload);
    } else {
      if (!form.triggerType) return;
      const trigger = selectedTrigger.value;
      const payload: CreateTemplateInput = {
        name: form.name.trim(),
        category: form.category,
        title: form.title.trim(),
        body: form.body.trim(),
        destination: form.destination,
        triggerType: form.triggerType,
        cooldownDays: form.cooldownDays,
        isEnabled: form.isEnabled,
      };
      if (form.titleFemale.trim()) payload.titleFemale = form.titleFemale.trim();
      if (form.bodyFemale.trim()) payload.bodyFemale = form.bodyFemale.trim();
      if (trigger?.needsValue && form.triggerValue !== null) {
        payload.triggerValue = form.triggerValue;
      }
      if (trigger?.needsSegment && form.triggerSegment) {
        payload.triggerSegment = form.triggerSegment;
      }
      if (form.scopeBranchIds.length) payload.scopeBranchIds = form.scopeBranchIds;
      if (form.scopeCountries.length) payload.scopeCountries = form.scopeCountries;

      await commsApi.createTemplate(payload);
    }

    $q.notify({ type: 'positive', message: props.template ? 'Notificación actualizada' : 'Notificación creada' });
    emit('saved');
    localOpen.value = false;
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudo guardar la notificación');
    log.error('Error saving template', { error: message, templateId: props.template?.id ?? null });
    $q.notify({ type: 'negative', message });
  } finally {
    saving.value = false;
  }
}

onMounted(loadBranches);
onUnmounted(() => {
  if (previewTimer) clearTimeout(previewTimer);
  membersApi.cleanup();
  commsApi.cleanup();
});
</script>

<style lang="scss" scoped>
$aged-gold: #b89b5e;
$warm-stone: #d9cfc1;

.comm-origin-chip {
  display: inline-block;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  border-radius: 10px;
  padding: 3px 10px;

  &--system {
    background-color: rgba($aged-gold, 0.18);
    color: darken($aged-gold, 22%);
  }
}

.comm-fixed-condition {
  background-color: #f2ede5;
  border: 1px solid $warm-stone;
  border-radius: 6px;
  padding: 8px 12px;
}
</style>
