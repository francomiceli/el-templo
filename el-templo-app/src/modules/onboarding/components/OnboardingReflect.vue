<template>
  <div class="reflect-screen" role="button" tabindex="0" @click="skip" @keydown.enter="skip">
    <p v-if="answerEcho" class="reflect-echo">{{ answerEcho }}</p>

    <div class="reflect-rule reflect-rule--top" aria-hidden="true" />

    <!-- Safe: `line` comes from REFLECT_COPY (static, in-repo). Simple
         `**word**` → <strong> parse, nothing user-provided. -->
    <p class="reflect-line" v-html="renderedLine" />

    <div class="reflect-rule reflect-rule--bottom" aria-hidden="true" />

    <p class="reflect-hint">tocá para continuar</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    line: string
    answerEcho?: string
    autoAdvanceMs?: number
  }>(),
  {
    answerEcho: '',
    autoAdvanceMs: 5000,
  },
)

const emit = defineEmits<{
  continue: []
}>()

const advanced = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

const renderedLine = computed(() =>
  props.line.replace(/\*\*(.+?)\*\*/g, '<span class="reflect-emphasis">$1</span>'),
)

function skip() {
  if (advanced.value) return
  advanced.value = true
  if (timer) clearTimeout(timer)
  emit('continue')
}

onMounted(() => {
  timer = setTimeout(() => {
    if (!advanced.value) {
      advanced.value = true
      emit('continue')
    }
  }, props.autoAdvanceMs)
})

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>

<style lang="scss" scoped>
@import 'src/css/brand';

$terracotta: $brand-terracotta;
$cream: #f2ede5;

.reflect-screen {
  width: 100%;
  max-width: 420px;
  padding: 48px 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 16px;
  cursor: pointer;
  user-select: none;
  outline: none;

  &:focus-visible {
    box-shadow: 0 0 0 2px rgba($terracotta, 0.4);
    border-radius: 12px;
  }
}

.reflect-echo {
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 0.6875rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba($cream, 0.5);
  margin: 0;
  animation: fade-in 400ms ease both;
}

.reflect-rule {
  width: 44px;
  height: 1px;
  background: rgba($terracotta, 0.7);
  animation: rule-draw 600ms ease both;

  &--top {
    animation-delay: 100ms;
  }

  &--bottom {
    animation-delay: 700ms;
  }
}

.reflect-line {
  font-family: 'Geologica', sans-serif;
  font-weight: 300;
  font-style: italic;
  font-size: 1.3125rem;
  line-height: 1.5;
  color: $cream;
  margin: 12px 0;
  max-width: 340px;
  text-shadow: 0 1px 10px rgba(0, 0, 0, 0.5);
  animation: fade-up 600ms 200ms ease both;

  :deep(.reflect-emphasis) {
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-style: normal;
    color: $terracotta;
    letter-spacing: 0.04em;
  }
}

.reflect-hint {
  font-family: 'Geologica', sans-serif;
  font-size: 0.6875rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba($cream, 0.3);
  margin: 24px 0 0;
  animation: fade-in 600ms 1200ms ease both;
}

@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes fade-up {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes rule-draw {
  from {
    opacity: 0;
    transform: scaleX(0);
  }
  to {
    opacity: 0.7;
    transform: scaleX(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .reflect-echo,
  .reflect-rule,
  .reflect-line,
  .reflect-hint {
    animation: none;
  }
}
</style>
