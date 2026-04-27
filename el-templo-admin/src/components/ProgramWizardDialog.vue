<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    persistent
  >
    <q-card style="width: 700px; max-width: 95vw">
      <q-card-section>
        <div class="text-h6">
          {{ isEditMode ? 'Editar Programa' : 'Nuevo Programa' }}
        </div>
      </q-card-section>

      <q-separator />

      <q-stepper
        v-model="step"
        vertical
        color="primary"
        animated
        style="max-height: 70vh; overflow-y: auto"
      >
        <!-- ============================================================ -->
        <!-- Step 1: Basic Info -->
        <!-- ============================================================ -->
        <q-step :name="1" title="Informacion Basica" icon="info" :done="step > 1">
          <div class="q-gutter-sm">
            <q-input
              v-model="form.name"
              label="Nombre *"
              dense
              outlined
              maxlength="150"
              :rules="[requiredRule('Nombre')]"
            />
            <q-input
              v-model="form.description"
              label="Descripcion"
              type="textarea"
              :rows="3"
              dense
              outlined
            />
            <q-select
              v-model="form.goalPlanType"
              :options="GOAL_PLAN_TYPE_OPTIONS"
              label="Tipo de Plan por Objetivos"
              dense
              outlined
              emit-value
              map-options
              clearable
              hint="Dejar vacio para programas de contenido"
            />
          </div>

          <q-stepper-navigation>
            <q-btn color="primary" label="Continuar" @click="goToStep(2)" />
            <q-btn
              flat
              color="grey"
              label="Cancelar"
              class="q-ml-sm"
              @click="$emit('update:modelValue', false)"
            />
          </q-stepper-navigation>
        </q-step>

        <!-- ============================================================ -->
        <!-- Step 2: Pricing & Config -->
        <!-- ============================================================ -->
        <q-step :name="2" title="Configuracion" icon="settings" :done="step > 2">
          <div class="q-gutter-sm">
            <div class="row q-col-gutter-sm">
              <div class="col-12 col-sm-6">
                <q-input
                  v-model.number="form.durationWeeks"
                  label="Duracion (semanas) *"
                  type="number"
                  dense
                  outlined
                  :rules="[
                    requiredNumberRule('Duracion'),
                    (v: number | null) =>
                      (v !== null && v >= 1 && v <= 52) || 'Entre 1 y 52 semanas',
                  ]"
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-input
                  v-model.number="form.sessionsPerWeekToAdvance"
                  label="Sesiones/semana para avanzar *"
                  type="number"
                  dense
                  outlined
                  :readonly="isEditMode"
                  :hint="isEditMode ? 'No editable después de crear' : ''"
                  :rules="[requiredNumberRule('Sesiones por semana')]"
                />
              </div>
            </div>

            <div class="row q-col-gutter-sm">
              <div class="col-12 col-sm-6">
                <q-input
                  v-model.number="form.auraWeeklyBonus"
                  label="AURA bonus semanal"
                  type="number"
                  dense
                  outlined
                />
              </div>
              <div class="col-12 col-sm-6">
                <q-input
                  v-model.number="form.auraCompletionBonus"
                  label="AURA bonus completar"
                  type="number"
                  dense
                  outlined
                />
              </div>
            </div>
          </div>

          <q-stepper-navigation>
            <q-btn color="primary" label="Continuar" @click="goToStep(3)" />
            <q-btn flat color="grey" label="Atras" class="q-ml-sm" @click="step = 1" />
          </q-stepper-navigation>
        </q-step>

        <!-- ============================================================ -->
        <!-- Step 3: Content per Week -->
        <!-- ============================================================ -->
        <q-step :name="3" title="Contenido por Semana" icon="library_books" :done="step > 3">
          <div v-if="!form.durationWeeks || form.durationWeeks < 1" class="text-grey-5 text-italic">
            Configura la duracion en el paso anterior
          </div>

          <template v-else>
            <q-expansion-item
              v-for="week in weekNumbers"
              :key="week"
              :label="`Semana ${week}`"
              :caption="`${blocksForWeek(week).length} contenido(s)`"
              group="weeks"
              class="q-mb-xs"
              header-class="bg-grey-2"
            >
              <div class="q-pa-sm">
                <!-- Existing blocks for this week -->
                <div
                  v-for="(block, idx) in blocksForWeek(week)"
                  :key="`block-${week}-${idx}`"
                  class="row items-center q-mb-xs"
                >
                  <q-card flat bordered class="col q-pa-sm">
                    <div class="row items-center no-wrap">
                      <q-badge
                        :color="BLOCK_TYPE_COLORS[block.blockType]"
                        :label="BLOCK_TYPE_LABELS[block.blockType]"
                        class="q-mr-sm"
                      />
                      <span class="text-body2 ellipsis col">{{ block.title }}</span>

                      <!-- Reorder buttons -->
                      <q-btn
                        flat
                        dense
                        round
                        icon="arrow_upward"
                        size="xs"
                        :disable="isFirstInWeek(week, idx)"
                        @click="moveBlock(week, idx, 'up')"
                      >
                        <q-tooltip>Subir</q-tooltip>
                      </q-btn>
                      <q-btn
                        flat
                        dense
                        round
                        icon="arrow_downward"
                        size="xs"
                        :disable="isLastInWeek(week, idx)"
                        @click="moveBlock(week, idx, 'down')"
                      >
                        <q-tooltip>Bajar</q-tooltip>
                      </q-btn>

                      <!-- Edit/Delete -->
                      <q-btn
                        flat
                        dense
                        round
                        icon="edit"
                        size="xs"
                        color="primary"
                        @click="startEditBlock(week, idx)"
                      >
                        <q-tooltip>Editar</q-tooltip>
                      </q-btn>
                      <q-btn
                        flat
                        dense
                        round
                        icon="delete"
                        size="xs"
                        color="negative"
                        :disable="isWeekReadOnly(week)"
                        @click="removeBlock(week, idx)"
                      >
                        <q-tooltip>Eliminar</q-tooltip>
                      </q-btn>
                    </div>
                  </q-card>
                </div>

                <!-- Inline add/edit form -->
                <div
                  v-if="editingBlockWeek === week"
                  class="q-pa-sm bg-grey-1 rounded-borders q-mt-xs"
                >
                  <div class="q-gutter-sm">
                    <q-select
                      v-model="blockForm.blockType"
                      :options="blockTypeOptions"
                      label="Tipo *"
                      dense
                      outlined
                      emit-value
                      map-options
                    />
                    <q-input v-model="blockForm.title" label="Titulo *" dense outlined />

                    <!-- Conditional fields by type -->
                    <q-input
                      v-if="blockForm.blockType === 'video'"
                      v-model="blockForm.videoUrl"
                      label="URL del video (R2)"
                      dense
                      outlined
                    />
                    <q-input
                      v-if="blockForm.blockType === 'text'"
                      v-model="blockForm.content"
                      label="Contenido (markdown)"
                      type="textarea"
                      :rows="4"
                      dense
                      outlined
                    />
                    <q-input
                      v-if="blockForm.blockType === 'pdf'"
                      v-model="blockForm.videoUrl"
                      label="URL del PDF"
                      dense
                      outlined
                    />
                    <q-input
                      v-if="blockForm.blockType === 'exercise'"
                      v-model.number="blockForm.exerciseId"
                      label="ID del ejercicio"
                      type="number"
                      dense
                      outlined
                    />
                  </div>

                  <div class="q-mt-sm row q-gutter-sm">
                    <q-btn
                      dense
                      color="primary"
                      :label="editingBlockIndex !== null ? 'Guardar' : 'Agregar'"
                      :disable="!blockForm.title || !blockForm.blockType"
                      @click="confirmBlock(week)"
                    />
                    <q-btn dense flat color="grey" label="Cancelar" @click="cancelBlockEdit" />
                  </div>
                </div>

                <!-- Add content button -->
                <q-btn
                  v-if="editingBlockWeek !== week && !isWeekReadOnly(week)"
                  flat
                  dense
                  icon="add"
                  label="Agregar contenido"
                  color="primary"
                  class="q-mt-xs"
                  @click="startAddBlock(week)"
                />

                <div
                  v-if="isWeekReadOnly(week)"
                  class="text-caption text-grey-5 q-mt-xs text-italic"
                >
                  Semana con inscripciones activas (solo lectura)
                </div>
              </div>
            </q-expansion-item>
          </template>

          <q-stepper-navigation>
            <q-btn color="primary" label="Continuar" @click="goToStep(4)" />
            <q-btn flat color="grey" label="Atras" class="q-ml-sm" @click="step = 2" />
          </q-stepper-navigation>
        </q-step>

        <!-- ============================================================ -->
        <!-- Step 4: Review & Publish -->
        <!-- ============================================================ -->
        <q-step :name="4" title="Revisar y Publicar" icon="check_circle">
          <q-card flat bordered class="q-mb-md">
            <q-card-section>
              <div class="text-subtitle1 text-weight-bold q-mb-sm">Resumen del Programa</div>

              <div class="q-gutter-xs">
                <div class="row">
                  <span class="text-weight-medium col-4">Nombre:</span>
                  <span class="col">{{ form.name || '—' }}</span>
                </div>
                <div v-if="form.goalPlanType" class="row">
                  <span class="text-weight-medium col-4">Tipo:</span>
                  <span class="col">{{
                    GOAL_PLAN_TYPE_OPTIONS.find((o) => o.value === form.goalPlanType)?.label ??
                    form.goalPlanType
                  }}</span>
                </div>
                <div v-else class="row">
                  <span class="text-weight-medium col-4">Tipo:</span>
                  <span class="col text-grey-6">Contenido</span>
                </div>
                <div class="row">
                  <span class="text-weight-medium col-4">Duracion:</span>
                  <span class="col">{{ form.durationWeeks }} semanas</span>
                </div>
                <div class="row">
                  <span class="text-weight-medium col-4">Sesiones/semana:</span>
                  <span class="col">{{ form.sessionsPerWeekToAdvance }}</span>
                </div>
                <div class="row">
                  <span class="text-weight-medium col-4">AURA semanal:</span>
                  <span class="col">+{{ form.auraWeeklyBonus }}</span>
                </div>
                <div class="row">
                  <span class="text-weight-medium col-4">AURA completar:</span>
                  <span class="col">+{{ form.auraCompletionBonus }}</span>
                </div>

                <q-separator class="q-my-sm" />

                <div class="text-subtitle2 text-weight-bold q-mb-xs">Contenido por semana</div>
                <div v-for="week in weekNumbers" :key="`review-${week}`" class="q-mb-xs">
                  <span class="text-weight-medium">Semana {{ week }}:</span>
                  {{ blocksForWeek(week).length }} bloque(s)
                </div>
              </div>
            </q-card-section>
          </q-card>

          <q-stepper-navigation>
            <q-btn
              color="primary"
              :label="isEditMode ? 'Guardar cambios' : 'Crear Programa'"
              :loading="submitting"
              :disable="submitting || !isFormValid"
              @click="onSubmit"
            />
            <q-btn flat color="grey" label="Atras" class="q-ml-sm" @click="step = 3" />
          </q-stepper-navigation>
        </q-step>
      </q-stepper>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useProgramsApi } from 'src/composables/useProgramsApi';
import {
  BLOCK_TYPE_LABELS,
  BLOCK_TYPE_COLORS,
  type Program,
  type ProgramDetail,
  type ContentBlockInput,
  type ContentBlockType,
} from 'src/types/program';
import { GOAL_PLAN_TYPE_OPTIONS } from 'src/types/goal-plan';

const log = createLogger('ProgramWizardDialog');
const $q = useQuasar();
const programsApi = useProgramsApi();

// =========================================================================
// Props & Emits
// =========================================================================

const props = defineProps<{
  modelValue: boolean;
  editingProgram: ProgramDetail | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  saved: [];
}>();

// =========================================================================
// State
// =========================================================================

const step = ref(1);
const submitting = ref(false);

const isEditMode = computed(() => !!props.editingProgram);

const form = ref({
  name: '',
  description: '',
  goalPlanType: null as string | null,
  durationWeeks: null as number | null,
  sessionsPerWeekToAdvance: 3,
  auraWeeklyBonus: 15,
  auraCompletionBonus: 100,
});

const contentBlocks = ref<ContentBlockInput[]>([]);

// Block form for inline add/edit
const editingBlockWeek = ref<number | null>(null);
const editingBlockIndex = ref<number | null>(null);
const blockForm = ref({
  blockType: 'text' as ContentBlockType,
  title: '',
  content: null as string | null,
  videoUrl: null as string | null,
  exerciseId: null as number | null,
});

// =========================================================================
// Block type options
// =========================================================================

const blockTypeOptions = (Object.keys(BLOCK_TYPE_LABELS) as ContentBlockType[]).map((key) => ({
  label: BLOCK_TYPE_LABELS[key],
  value: key,
}));

// =========================================================================
// Computed helpers
// =========================================================================

const weekNumbers = computed(() => {
  const weeks = form.value.durationWeeks ?? 0;
  return Array.from({ length: weeks }, (_, i) => i + 1);
});

function blocksForWeek(week: number): ContentBlockInput[] {
  return contentBlocks.value
    .filter((b) => b.weekNumber === week)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function isFirstInWeek(week: number, indexInWeek: number): boolean {
  return indexInWeek === 0;
}

function isLastInWeek(week: number, indexInWeek: number): boolean {
  const weekBlocks = blocksForWeek(week);
  return indexInWeek === weekBlocks.length - 1;
}

function isWeekReadOnly(week: number): boolean {
  // In edit mode with active enrollments, past weeks are read-only per D-41
  if (!isEditMode.value || !props.editingProgram) return false;
  if (props.editingProgram.activeEnrollmentCount === 0) return false;

  // Find the max week that has content as the "current" boundary
  const maxWeekWithContent = contentBlocks.value.reduce((max, b) => Math.max(max, b.weekNumber), 0);
  return week <= maxWeekWithContent && props.editingProgram.activeEnrollmentCount > 0;
}

const isFormValid = computed(() => {
  return (
    form.value.name.trim().length > 0 &&
    form.value.durationWeeks !== null &&
    form.value.durationWeeks >= 1 &&
    form.value.durationWeeks <= 52 &&
    form.value.sessionsPerWeekToAdvance >= 1
  );
});

// =========================================================================
// Validation rules
// =========================================================================

function requiredRule(fieldName: string) {
  return (val: string | null | undefined) => (val && val.length > 0) || `${fieldName} es requerido`;
}

function requiredNumberRule(fieldName: string) {
  return (val: number | null | undefined) =>
    (val !== null && val !== undefined && val >= 0) || `${fieldName} es requerido`;
}

// =========================================================================
// Step navigation
// =========================================================================

function goToStep(targetStep: number) {
  step.value = targetStep;
}

// =========================================================================
// Block management
// =========================================================================

function startAddBlock(week: number) {
  editingBlockWeek.value = week;
  editingBlockIndex.value = null;
  blockForm.value = {
    blockType: 'text',
    title: '',
    content: null,
    videoUrl: null,
    exerciseId: null,
  };
}

function startEditBlock(week: number, indexInWeek: number) {
  const weekBlocks = blocksForWeek(week);
  const block = weekBlocks[indexInWeek];
  if (!block) return;

  editingBlockWeek.value = week;
  editingBlockIndex.value = indexInWeek;
  blockForm.value = {
    blockType: block.blockType,
    title: block.title,
    content: block.content,
    videoUrl: block.videoUrl,
    exerciseId: block.exerciseId,
  };
}

function confirmBlock(week: number) {
  const newBlock: ContentBlockInput = {
    weekNumber: week,
    sortOrder: 0,
    blockType: blockForm.value.blockType,
    title: blockForm.value.title,
    content: blockForm.value.blockType === 'text' ? blockForm.value.content : null,
    videoUrl:
      blockForm.value.blockType === 'video' || blockForm.value.blockType === 'pdf'
        ? blockForm.value.videoUrl
        : null,
    exerciseId: blockForm.value.blockType === 'exercise' ? blockForm.value.exerciseId : null,
  };

  const weekBlocks = blocksForWeek(week);

  if (editingBlockIndex.value !== null) {
    // Editing existing block
    const existingBlock = weekBlocks[editingBlockIndex.value];
    if (existingBlock) {
      // Find the actual index in the full contentBlocks array
      const fullIdx = contentBlocks.value.indexOf(existingBlock);
      if (fullIdx !== -1) {
        newBlock.sortOrder = existingBlock.sortOrder;
        contentBlocks.value[fullIdx] = newBlock;
      }
    }
  } else {
    // Adding new block
    newBlock.sortOrder = weekBlocks.length;
    contentBlocks.value.push(newBlock);
  }

  cancelBlockEdit();
}

function cancelBlockEdit() {
  editingBlockWeek.value = null;
  editingBlockIndex.value = null;
}

function removeBlock(week: number, indexInWeek: number) {
  const weekBlocks = blocksForWeek(week);
  const block = weekBlocks[indexInWeek];
  if (!block) return;

  const fullIdx = contentBlocks.value.indexOf(block);
  if (fullIdx !== -1) {
    contentBlocks.value.splice(fullIdx, 1);
    // Re-index sortOrder for remaining blocks in this week
    reindexWeekBlocks(week);
  }
}

function moveBlock(week: number, indexInWeek: number, direction: 'up' | 'down') {
  const weekBlocks = blocksForWeek(week);
  const targetIdx = direction === 'up' ? indexInWeek - 1 : indexInWeek + 1;
  if (targetIdx < 0 || targetIdx >= weekBlocks.length) return;

  const blockA = weekBlocks[indexInWeek];
  const blockB = weekBlocks[targetIdx];

  // Swap sort orders
  const tempSort = blockA.sortOrder;
  blockA.sortOrder = blockB.sortOrder;
  blockB.sortOrder = tempSort;
}

function reindexWeekBlocks(week: number) {
  const weekBlocks = contentBlocks.value.filter((b) => b.weekNumber === week);
  weekBlocks.sort((a, b) => a.sortOrder - b.sortOrder);
  weekBlocks.forEach((block, i) => {
    block.sortOrder = i;
  });
}

// =========================================================================
// Form Lifecycle — reset on open
// =========================================================================

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;

    step.value = 1;
    editingBlockWeek.value = null;
    editingBlockIndex.value = null;

    if (props.editingProgram) {
      // Edit mode: pre-populate from existing program
      form.value = {
        name: props.editingProgram.name,
        description: props.editingProgram.description ?? '',
        goalPlanType:
          ((props.editingProgram as Record<string, unknown>).goalPlanType as string | null) ?? null,
        durationWeeks: props.editingProgram.durationWeeks,
        sessionsPerWeekToAdvance: props.editingProgram.sessionsPerWeekToAdvance,
        auraWeeklyBonus: props.editingProgram.auraWeeklyBonus,
        auraCompletionBonus: props.editingProgram.auraCompletionBonus,
      };
      // Map ContentBlockDetail to ContentBlockInput (drop id, exerciseName, exerciseVideoUrl)
      contentBlocks.value = props.editingProgram.contentBlocks.map((b) => ({
        weekNumber: b.weekNumber,
        sortOrder: b.sortOrder,
        blockType: b.blockType,
        title: b.title,
        content: b.content,
        videoUrl: b.videoUrl,
        exerciseId: b.exerciseId,
      }));
    } else {
      // Create mode
      form.value = {
        name: '',
        description: '',
        goalPlanType: null,
        durationWeeks: null,
        sessionsPerWeekToAdvance: 3,
        auraWeeklyBonus: 15,
        auraCompletionBonus: 100,
      };
      contentBlocks.value = [];
    }
  }
);

// =========================================================================
// Submit
// =========================================================================

async function onSubmit() {
  if (!isFormValid.value) return;

  submitting.value = true;
  try {
    if (isEditMode.value && props.editingProgram) {
      // Update program metadata
      await programsApi.updateProgram(props.editingProgram.id, {
        name: form.value.name,
        description: form.value.description || null,
        goalPlanType: form.value.goalPlanType,
        auraWeeklyBonus: form.value.auraWeeklyBonus,
        auraCompletionBonus: form.value.auraCompletionBonus,
      } as Partial<Program> & { goalPlanType?: string | null });

      // Update content blocks
      if (contentBlocks.value.length > 0) {
        await programsApi.addContentBlocks(props.editingProgram.id, contentBlocks.value);
      }
    } else {
      // Create new program with content blocks
      await programsApi.createProgram({
        name: form.value.name,
        description: form.value.description || null,
        durationWeeks: form.value.durationWeeks!,
        sessionsPerWeekToAdvance: form.value.sessionsPerWeekToAdvance,
        auraWeeklyBonus: form.value.auraWeeklyBonus,
        auraCompletionBonus: form.value.auraCompletionBonus,
        contentBlocks: contentBlocks.value,
        goalPlanType: form.value.goalPlanType,
      } as Parameters<typeof programsApi.createProgram>[0] & { goalPlanType?: string | null });
    }

    $q.notify({ type: 'positive', message: 'Programa guardado correctamente' });
    emit('saved');
    emit('update:modelValue', false);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error saving program', { error: message });
    $q.notify({ type: 'negative', message: 'Error guardando programa' });
  } finally {
    submitting.value = false;
  }
}
</script>
