<!--
  Compositor de comentarios de Oficina (fase 205 D-18).

  Menciones: al tipear `@` se abre un menú con el equipo; elegir a alguien inserta
  `@Nombre Apellido ` en el texto y guarda su id. Al enviar solo viajan los ids cuyo
  texto sigue presente (si borrás el `@Nombre`, no se menciona). El borrador vive acá:
  el padre puede recargar el detalle cada minuto sin pisar lo que se está escribiendo;
  el padre limpia con `clear()` recién cuando la API confirma el comentario.
-->
<template>
  <div class="oficina-composer">
    <div class="relative-position">
      <q-input
        ref="inputRef"
        v-model="text"
        type="textarea"
        autogrow
        outlined
        dense
        maxlength="4000"
        input-style="max-height: 180px; min-height: 40px"
        placeholder="Escribí algo para el equipo… usá @ para mencionar"
        :disable="disabled"
        @update:model-value="onTextChange"
        @click="refreshMention"
        @keydown="onKeydown"
        @keyup="onKeyup"
      />

      <q-menu
        :model-value="mentionOpen"
        no-focus
        no-refocus
        no-parent-event
        fit
        anchor="top left"
        self="bottom left"
        :offset="[0, 4]"
        @update:model-value="onMenuToggle"
      >
        <!-- mousedown.prevent: elegir a alguien no le saca el foco al textarea -->
        <q-list dense class="oficina-composer__mentions" @mousedown.prevent>
          <q-item-label header class="q-pb-none">Mencionar a…</q-item-label>
          <q-item
            v-for="(person, index) in mentionOptions"
            :key="person.id"
            clickable
            :active="index === mentionIndex"
            active-class="bg-summary-surface text-primary"
            @click="insertMention(person)"
          >
            <q-item-section avatar>
              <q-avatar size="24px" color="primary" text-color="white" font-size="11px">
                {{ personInitials(person) }}
              </q-avatar>
            </q-item-section>
            <q-item-section>{{ personName(person) }}</q-item-section>
          </q-item>
        </q-list>
      </q-menu>
    </div>

    <div class="row items-center justify-between q-mt-sm">
      <div class="text-caption text-grey-7 gt-xs">Ctrl + Enter para enviar</div>
      <q-btn
        class="q-ml-auto"
        color="primary"
        icon="send"
        label="Enviar"
        unelevated
        :disable="disabled || !canSend"
        :loading="busy"
        @click="send"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import type { QInput } from 'quasar';
import type { OfficeStaff } from 'src/composables/useOfficeApi';
import { personInitials, personName } from 'src/components/oficina/office-labels';

const props = withDefaults(
  defineProps<{
    staff: OfficeStaff[];
    disabled?: boolean;
    busy?: boolean;
  }>(),
  { disabled: false, busy: false }
);

const emit = defineEmits<{
  send: [payload: { body: string; mentionUserIds: number[] }];
}>();

const MAX_MENTION_OPTIONS = 6;
const MAX_MENTION_QUERY = 20;

const inputRef = ref<QInput | null>(null);
const text = ref('');

/** Menciones insertadas desde el menú: se validan contra el texto al enviar. */
const mentions = ref<Array<{ id: number; token: string }>>([]);

const mentionOpen = ref(false);
const mentionQuery = ref('');
const mentionStart = ref(-1);
const mentionIndex = ref(0);

const canSend = computed(() => text.value.trim().length > 0);

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const mentionOptions = computed<OfficeStaff[]>(() => {
  const query = normalize(mentionQuery.value.trim());
  return props.staff
    .filter((person) => query === '' || normalize(personName(person)).includes(query))
    .slice(0, MAX_MENTION_OPTIONS);
});

function nativeEl(): HTMLInputElement | HTMLTextAreaElement | null {
  return inputRef.value?.nativeEl ?? null;
}

/** Mira lo que hay antes del cursor: si termina en `@algo`, abre el menú. */
function refreshMention(): void {
  const el = nativeEl();
  if (!el || props.disabled) return closeMention();
  const cursor = el.selectionStart ?? text.value.length;
  const before = text.value.slice(0, cursor);
  const match = new RegExp(`(?:^|\\s)@([^\\n@]{0,${MAX_MENTION_QUERY}})$`).exec(before);
  if (!match) return closeMention();
  mentionQuery.value = match[1];
  mentionStart.value = cursor - match[1].length - 1;
  mentionIndex.value = 0;
  mentionOpen.value = mentionOptions.value.length > 0;
}

function closeMention(): void {
  mentionOpen.value = false;
  mentionStart.value = -1;
}

function onMenuToggle(open: boolean): void {
  if (!open) closeMention();
}

function onTextChange(): void {
  // El cursor se actualiza después de que Vue vuelca el valor al textarea.
  void nextTick(refreshMention);
}

const NAV_KEYS = ['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'];

function onKeyup(event: KeyboardEvent): void {
  if (NAV_KEYS.includes(event.key)) return;
  refreshMention();
}

function onKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    send();
    return;
  }
  if (!mentionOpen.value || mentionOptions.value.length === 0) return;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    mentionIndex.value = (mentionIndex.value + 1) % mentionOptions.value.length;
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    mentionIndex.value =
      (mentionIndex.value - 1 + mentionOptions.value.length) % mentionOptions.value.length;
  } else if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault();
    insertMention(mentionOptions.value[mentionIndex.value]);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    closeMention();
  }
}

function insertMention(person: OfficeStaff): void {
  const el = nativeEl();
  if (!el || mentionStart.value < 0) return;
  const cursor = el.selectionStart ?? text.value.length;
  const token = `@${personName(person)}`;
  const insertion = `${token} `;
  text.value = text.value.slice(0, mentionStart.value) + insertion + text.value.slice(cursor);
  mentions.value.push({ id: person.id, token });
  const caret = mentionStart.value + insertion.length;
  closeMention();
  void nextTick(() => {
    const target = nativeEl();
    if (!target) return;
    target.focus();
    target.setSelectionRange(caret, caret);
  });
}

function send(): void {
  const body = text.value.trim();
  if (props.disabled || props.busy || body === '') return;
  const ids = new Set<number>();
  for (const mention of mentions.value) {
    if (text.value.includes(mention.token)) ids.add(mention.id);
  }
  emit('send', { body, mentionUserIds: [...ids] });
}

/** Lo llama el padre cuando la API confirmó el comentario. */
function clear(): void {
  text.value = '';
  mentions.value = [];
  closeMention();
}

function focus(): void {
  inputRef.value?.focus();
}

defineExpose({ clear, focus });
</script>

<style scoped lang="scss">
.oficina-composer__mentions {
  min-width: 220px;
}
</style>
