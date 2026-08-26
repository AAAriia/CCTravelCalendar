<template>
  <Teleport to="body">
    <div v-if="state" class="overlay" @pointerdown.self="emit('close')">
      <div class="confirm-box">
        <div class="ct">{{ state.title }}</div>
        <!-- eslint-disable-next-line vue/no-v-html —— 内容仅由本应用代码构造 -->
        <div class="cb" v-html="state.bodyHtml"></div>
        <div class="cf">
          <button class="btn" @click="emit('close')">再想想</button>
          <button class="btn" :class="state.danger ? 'danger' : 'primary'" @click="emit('confirm')">
            {{ state.yesText ?? '确认' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
defineProps<{
  state: { title: string; bodyHtml: string; yesText?: string; danger?: boolean } | null;
}>();
const emit = defineEmits<{ confirm: []; close: [] }>();
</script>
