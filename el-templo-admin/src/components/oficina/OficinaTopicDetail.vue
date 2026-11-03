<!--
  Detalle de un tema de Oficina (fase 205 D-18): cabecera, acciones y línea de tiempo
  (comentarios como burbujas, el resto de los eventos como líneas discretas) con el
  compositor abajo. No habla con la API: emite `patch`, `comment`, `edit` y `back`.
-->
<template>
  <q-card flat bordered class="oficina-detail column no-wrap">
    <!-- Sin selección (solo escritorio: en móvil la lista ocupa todo) -->
    <div
      v-if="!topic"
      class="col column items-center justify-center text-center text-grey-7 q-pa-xl"
    >
      <q-icon name="forum" size="56px" color="grey-5" />
      <div class="text-subtitle1 q-mt-md">Elegí un tema para ver la conversación</div>
      <div class="text-caption q-mt-xs">
        Acá vas a poder comentar, mencionar a alguien del equipo y cerrar el tema.
      </div>
    </div>

    <template v-else>
      <!-- Cabecera -->
      <div class="q-pa-md oficina-detail__header">
        <div class="row items-start no-wrap">
          <q-btn
            v-if="showBack"
            flat
            round
            dense
            icon="arrow_back"
            class="q-mr-sm"
            aria-label="Volver a la lista"
            @click="emit('back')"
          />
          <div class="col text-h6 text-weight-medium oficina-detail__title">{{ topic.title }}</div>
        </div>

        <div class="row items-center q-gutter-sm q-mt-xs">
          <q-chip
            dense
            square
            :color="STATUS_COLORS[topic.status]"
            :text-color="STATUS_TEXT_COLORS[topic.status]"
          >
            {{ statusChipLabel }}
          </q-chip>
          <q-chip dense square outline color="grey-8">
            <q-icon
              :name="topic.origin === 'sistema' ? 'smart_toy' : 'person'"
              size="16px"
              class="q-mr-xs"
            />
            {{ ORIGIN_LABELS[topic.origin] }}
          </q-chip>
          <template v-if="topic.targetKind">
            <q-btn
              v-if="linkRoute"
              flat
              dense
              no-caps
              color="primary"
              :icon="TARGET_KIND_ICONS[topic.targetKind]"
              :label="linkLabel"
              :to="linkRoute"
            />
            <q-chip v-else dense square outline color="grey-8">
              <q-icon :name="TARGET_KIND_ICONS[topic.targetKind]" size="16px" class="q-mr-xs" />
              {{ linkLabel }}
            </q-chip>
          </template>
          <span v-if="topic.branchName" class="text-caption text-grey-7">
            <q-icon name="place" size="16px" class="q-mr-xs" />{{ topic.branchName }}
          </span>
        </div>

        <div class="text-caption text-grey-7 q-mt-sm">
          {{ createdByLine }}
        </div>

        <q-card v-if="topic.body" flat bordered class="bg-summary-surface q-pa-sm q-mt-md">
          <div class="oficina-detail__body">{{ topic.body }}</div>
        </q-card>
      </div>

      <q-separator />

      <!-- Acciones -->
      <div class="row items-center q-gutter-sm q-pa-md oficina-detail__actions">
        <q-select
          :model-value="topic.assignee?.id ?? null"
          :options="assigneeOptions"
          option-value="value"
          option-label="label"
          emit-value
          map-options
          dense
          outlined
          clearable
          label="Responsable"
          class="oficina-detail__assignee"
          :disable="busy"
          @update:model-value="onAssigneeChange"
        >
          <template #prepend>
            <q-icon name="person_outline" />
          </template>
        </q-select>

        <q-btn
          v-if="!isMine"
          outline
          color="primary"
          icon="front_hand"
          label="Tomar"
          no-caps
          :disable="busy"
          @click="emit('patch', { assigneeId: currentUserId })"
        />

        <q-btn
          outline
          color="primary"
          icon="snooze"
          label="Dormir"
          no-caps
          :disable="busy || topic.status === 'cerrado'"
        >
          <q-menu ref="snoozeMenu" anchor="bottom left" self="top left">
            <div class="q-pa-sm">
              <div class="text-caption text-grey-7 q-px-sm q-pb-xs">Volver a mostrarlo el…</div>
              <div class="row q-gutter-xs q-px-xs q-pb-sm">
                <q-btn dense flat no-caps color="primary" label="Mañana" @click="snoozeIn(1)" />
                <q-btn dense flat no-caps color="primary" label="En 3 días" @click="snoozeIn(3)" />
                <q-btn
                  dense
                  flat
                  no-caps
                  color="primary"
                  label="En 1 semana"
                  @click="snoozeIn(7)"
                />
              </div>
              <q-date
                v-model="snoozeDate"
                flat
                minimal
                mask="YYYY-MM-DD"
                color="primary"
                :options="isFutureDate"
                @update:model-value="onSnoozePick"
              />
            </div>
          </q-menu>
        </q-btn>

        <q-btn
          v-if="topic.status === 'abierto'"
          unelevated
          color="primary"
          icon="check_circle_outline"
          label="Cerrar"
          no-caps
          :disable="busy"
          @click="onClose"
        />
        <q-btn
          v-else
          unelevated
          color="primary"
          icon="lock_open"
          :label="topic.status === 'dormido' ? 'Despertar' : 'Reabrir'"
          no-caps
          :disable="busy"
          @click="emit('patch', { status: 'abierto' })"
        />
        <q-btn
          v-if="topic.status === 'dormido'"
          flat
          color="primary"
          icon="check_circle_outline"
          label="Cerrar"
          no-caps
          :disable="busy"
          @click="onClose"
        />

        <q-space />
        <q-btn
          flat
          dense
          no-caps
          icon="edit"
          label="Editar"
          :disable="busy"
          @click="emit('edit')"
        />
      </div>

      <q-separator />

      <!-- Línea de tiempo -->
      <div ref="timelineRef" class="oficina-detail__timeline q-pa-md" @scroll.passive="onScroll">
        <div v-if="topic.events.length === 0" class="text-center text-grey-6 q-pa-lg">
          Todavía no hay movimientos en este tema.
        </div>

        <template v-for="ev in topic.events" :key="ev.id">
          <div v-if="ev.type === 'comentario'" class="row no-wrap q-mb-md">
            <q-avatar
              size="32px"
              color="primary"
              text-color="white"
              font-size="13px"
              class="q-mr-sm"
            >
              {{ personInitials(ev.actor) }}
            </q-avatar>
            <div class="col">
              <div class="row items-baseline q-gutter-x-sm">
                <span class="text-weight-medium">{{
                  personName(ev.actor) || 'Alguien del equipo'
                }}</span>
                <span class="text-caption text-grey-6" :title="fullDate(ev.createdAt)">
                  {{ relativeTime(ev.createdAt, now) }}
                </span>
              </div>
              <div
                class="oficina-detail__bubble q-pa-sm q-mt-xs rounded-borders"
                :class="ev.actor?.id === currentUserId ? 'bg-summary-surface' : 'bg-grey-2'"
              >
                <template v-for="(part, i) in commentParts(ev.body)" :key="i">
                  <span v-if="part.mention" class="text-primary text-weight-medium">{{
                    part.text
                  }}</span>
                  <template v-else>{{ part.text }}</template>
                </template>
              </div>
            </div>
          </div>

          <div v-else class="row items-center no-wrap text-grey-7 text-caption q-mb-md q-pl-xs">
            <q-icon name="circle" size="6px" color="grey-5" class="q-mr-sm" />
            <span :title="fullDate(ev.createdAt)">
              {{ eventLine(ev) }}
              <span class="text-grey-5">· {{ relativeTime(ev.createdAt, now) }}</span>
            </span>
          </div>
        </template>
      </div>

      <q-separator />

      <!-- Compositor -->
      <div class="q-pa-md">
        <div v-if="topic.status === 'cerrado'" class="row items-center q-gutter-sm">
          <div class="col text-body2 text-grey-7">
            El tema está cerrado. Para comentar hay que reabrirlo.
          </div>
          <q-btn
            outline
            color="primary"
            icon="lock_open"
            label="Reabrir y comentar"
            no-caps
            :disable="busy"
            @click="reopenAndComment"
          />
        </div>
        <!-- v-show (no v-if): si alguien cierra el tema mientras escribís, el borrador sobrevive. -->
        <OficinaComposer
          v-show="topic.status !== 'cerrado'"
          :key="topic.id"
          ref="composerRef"
          :staff="staff"
          :busy="busy"
          @send="(payload) => emit('comment', payload)"
        />
      </div>
    </template>
  </q-card>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useQuasar, type QMenu } from 'quasar';
import type { OfficeStaff, OfficeTopicDetail, PatchTopicInput } from 'src/composables/useOfficeApi';
import { relativeTime } from 'src/utils/relative-time';
import OficinaComposer from 'src/components/oficina/OficinaComposer.vue';
import {
  ORIGIN_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  STATUS_TEXT_COLORS,
  TARGET_KIND_ICONS,
  TARGET_KIND_LABELS,
  eventLine,
  personInitials,
  personName,
  shortDate,
  targetRoute,
} from 'src/components/oficina/office-labels';

const props = withDefaults(
  defineProps<{
    topic: OfficeTopicDetail | null;
    staff: OfficeStaff[];
    currentUserId: number;
    busy?: boolean;
    /** Botón "volver" (móvil: el detalle reemplaza la lista). */
    showBack?: boolean;
  }>(),
  { busy: false, showBack: false }
);

const emit = defineEmits<{
  patch: [input: PatchTopicInput];
  comment: [payload: { body: string; mentionUserIds: number[] }];
  edit: [];
  back: [];
}>();

const $q = useQuasar();

const timelineRef = ref<HTMLElement | null>(null);
const composerRef = ref<InstanceType<typeof OficinaComposer> | null>(null);
const snoozeMenu = ref<QMenu | null>(null);
const snoozeDate = ref<string | null>(null);
const now = ref(new Date());

// ── Cabecera ──────────────────────────────────────────────────────

const statusChipLabel = computed(() => {
  const topic = props.topic;
  if (!topic) return '';
  if (topic.status === 'dormido' && topic.snoozedUntil) {
    return `${STATUS_LABELS.dormido} hasta el ${shortDate(topic.snoozedUntil)}`;
  }
  return STATUS_LABELS[topic.status];
});

const linkRoute = computed(() =>
  props.topic?.targetKind ? targetRoute(props.topic.targetKind, props.topic.targetId) : null
);

const linkLabel = computed(() => {
  const topic = props.topic;
  if (!topic?.targetKind) return '';
  const kind = TARGET_KIND_LABELS[topic.targetKind];
  return topic.targetLabel ? `${kind}: ${topic.targetLabel}` : kind;
});

const createdByLine = computed(() => {
  const topic = props.topic;
  if (!topic) return '';
  const who = topic.origin === 'sistema' ? 'el sistema' : personName(topic.createdBy) || 'alguien';
  return `Abierto por ${who} · ${relativeTime(topic.createdAt, now.value)}`;
});

// ── Responsable ───────────────────────────────────────────────────

const assigneeOptions = computed(() => {
  const options = props.staff.map((person) => ({
    value: person.id,
    label: personName(person) || `Usuario ${person.id}`,
  }));
  // Si el responsable ya no figura en el equipo (se deshabilitó), igual se muestra su nombre.
  const assignee = props.topic?.assignee;
  if (assignee && !options.some((o) => o.value === assignee.id)) {
    options.push({ value: assignee.id, label: personName(assignee) || `Usuario ${assignee.id}` });
  }
  return options;
});

const isMine = computed(() => props.topic?.assignee?.id === props.currentUserId);

function onAssigneeChange(value: number | null): void {
  emit('patch', { assigneeId: value ?? null });
}

// ── Dormir ────────────────────────────────────────────────────────

function toYmd(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function isFutureDate(date: string): boolean {
  // q-date entrega las fechas a `options` como YYYY/MM/DD sin importar la máscara.
  return date.replace(/\//g, '-') > toYmd(new Date());
}

function snoozeIn(days: number): void {
  const target = new Date();
  target.setDate(target.getDate() + days);
  snoozeMenu.value?.hide();
  emit('patch', { snoozedUntil: toYmd(target) });
}

function onSnoozePick(value: string | null): void {
  if (!value) return;
  snoozeMenu.value?.hide();
  snoozeDate.value = null;
  emit('patch', { snoozedUntil: value });
}

// ── Cerrar / reabrir ──────────────────────────────────────────────

function onClose(): void {
  $q.dialog({
    title: 'Cerrar tema',
    message: '¿Dejás una nota de cierre? Es opcional y queda en el historial.',
    prompt: {
      model: '',
      type: 'textarea',
      outlined: true,
      autogrow: true,
      maxlength: 4000,
    },
    cancel: { label: 'Cancelar', flat: true, color: 'grey-8' },
    ok: { label: 'Cerrar tema', color: 'primary', unelevated: true },
    persistent: true,
  }).onOk((note: string) => {
    const trimmed = note.trim();
    emit('patch', { status: 'cerrado', note: trimmed === '' ? null : trimmed });
  });
}

let focusComposerOnReopen = false;

function reopenAndComment(): void {
  focusComposerOnReopen = true;
  emit('patch', { status: 'abierto' });
}

watch(
  () => props.topic?.status,
  (status) => {
    if (focusComposerOnReopen && status !== 'cerrado') {
      focusComposerOnReopen = false;
      void nextTick(() => composerRef.value?.focus());
    }
  }
);

// ── Comentarios: menciones resaltadas con spans (texto plano, sin HTML crudo) ──────────────────

interface CommentPart {
  text: string;
  mention: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const mentionRegex = computed<RegExp | null>(() => {
  const names = props.staff
    .map((person) => personName(person))
    .filter((name) => name !== '')
    .sort((a, b) => b.length - a.length);
  if (names.length === 0) return null;
  // Límite de palabra: `@Ana` no se resalta dentro de `@Analía`.
  return new RegExp(`(@(?:${names.map(escapeRegExp).join('|')})(?![\\p{L}\\d]))`, 'u');
});

function commentParts(body: string | null): CommentPart[] {
  const text = body ?? '';
  const regex = mentionRegex.value;
  if (!regex) return [{ text, mention: false }];
  // split con grupo de captura: los índices impares son las menciones.
  return text
    .split(regex)
    .map((part, index) => ({ text: part, mention: index % 2 === 1 }))
    .filter((part) => part.text !== '');
}

function fullDate(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
}

// ── Scroll de la línea de tiempo ──────────────────────────────────

let nearBottom = true;

function onScroll(): void {
  const el = timelineRef.value;
  if (!el) return;
  nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
}

function scrollToBottom(): void {
  const el = timelineRef.value;
  if (el) el.scrollTop = el.scrollHeight;
}

// La página desmonta y remonta el detalle al cambiar de tema, así que el watcher de abajo no
// corre al abrir: al montar también se baja a lo último.
onMounted(() => void nextTick(scrollToBottom));

// Cambia de tema: arranca desde lo último. Llegan novedades del mismo tema: baja solo si
// ya estabas leyendo lo último (no te arrastra si estás releyendo algo más arriba).
watch(
  () => props.topic?.id,
  () => {
    nearBottom = true;
    void nextTick(scrollToBottom);
  }
);
// Cada recarga del tema refresca los "hace N min".
watch(
  () => props.topic,
  () => {
    now.value = new Date();
  }
);
watch(
  () => props.topic?.events.length,
  () => {
    now.value = new Date();
    if (nearBottom) void nextTick(scrollToBottom);
  },
  { flush: 'pre' }
);

defineExpose({
  /** Vacía el compositor (el padre lo llama cuando la API confirmó el comentario enviado). */
  clearComposer: (sentBody?: string) => composerRef.value?.clear(sentBody),
  focusComposer: () => composerRef.value?.focus(),
});
</script>

<style scoped lang="scss">
.oficina-detail {
  min-height: 420px;
}

@media (min-width: 1024px) {
  .oficina-detail {
    height: calc(100vh - 240px);
    min-height: 480px;
  }
}

.oficina-detail__title {
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.oficina-detail__body {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 160px;
  overflow-y: auto;
}

.oficina-detail__assignee {
  min-width: 220px;
}

// Escritorio: la tarjeta tiene alto fijo y solo la conversación scrollea.
// Móvil: el alto es el del contenido y scrollea la página entera.
.oficina-detail__timeline {
  min-height: 160px;
}

@media (min-width: 1024px) {
  .oficina-detail__timeline {
    flex: 1 1 0;
    min-height: 0;
    overflow-y: auto;
  }
}

.oficina-detail__bubble {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
