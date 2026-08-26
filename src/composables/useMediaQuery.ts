import { ref } from 'vue';

/** 模块级断点单例：无生命周期依赖，任何模块（含拖拽系统）可直接读取 */
const mobileMql =
  typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(max-width: 767px)') : null;
const isMobile = ref(mobileMql?.matches ?? false);
try {
  mobileMql?.addEventListener('change', (e) => (isMobile.value = e.matches));
} catch {
  /* 个别环境（老 jsdom）不支持 MediaQueryList.addEventListener，降级为静态断点 */
}

export function useIsMobile() {
  return isMobile;
}
