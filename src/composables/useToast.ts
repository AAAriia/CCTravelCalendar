import { ref } from 'vue';

const msg = ref('');
const visible = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

/** 全局 Toast（模块单例，任何模块可直接调用） */
export function toast(text: string): void {
  msg.value = text;
  visible.value = true;
  clearTimeout(timer);
  timer = setTimeout(() => (visible.value = false), 2400);
}

export function useToast() {
  return { msg, visible };
}
