import { ref } from 'vue';

/**
 * 日程库组内拖拽排序（口径 §6.1a）：
 * - 手柄 pointerdown 启动；拖动元素跟随指针平移（命令式 transform）
 * - 插入位置以“各条目中点”判定，用蓝色上边线高亮（insertBeforeId 响应式）
 * - 松手提交：按最终顺序调用 onCommit(orderedIds)（由 store 重编 sortOrder）
 */
export function useLibrarySort(getListEl: () => HTMLElement | null, onCommit: (orderedIds: string[]) => void) {
  const dragId = ref<string | null>(null);
  const insertBeforeId = ref<string | null>(null);

  interface Ctx {
    id: string;
    el: HTMLElement;
    startY: number;
    pointerId: number;
    items: { id: string; el: HTMLElement; midY: number }[];
  }
  let ctx: Ctx | null = null;

  function itemEls(list: HTMLElement): HTMLElement[] {
    return [...list.children].filter((n) => (n as HTMLElement).classList?.contains('lib-item')) as HTMLElement[];
  }

  function start(e: PointerEvent, id: string): void {
    if (e.button !== 0) return;
    const list = getListEl();
    if (!list) return;
    const el = itemEls(list).find((n) => n.dataset.id === id);
    if (!el) return;
    e.preventDefault();
    ctx = {
      id,
      el,
      startY: e.clientY,
      pointerId: e.pointerId,
      items: itemEls(list).map((n) => ({
        id: n.dataset.id ?? '',
        el: n,
        midY: n.getBoundingClientRect().top + n.getBoundingClientRect().height / 2,
      })),
    };
    dragId.value = id;
    document.body.classList.add('noselect');
    el.classList.add('sorting');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }

  function onMove(e: PointerEvent): void {
    if (!ctx || e.pointerId !== ctx.pointerId) return;
    ctx.el.style.transform = `translateY(${e.clientY - ctx.startY}px)`;
    // 指针下方第一个条目之前插入；越过所有条目 → 排末尾（insertBeforeId = null）
    let before: string | null = null;
    for (const it of ctx.items) {
      if (it.id === ctx.id) continue;
      if (e.clientY < it.midY) {
        before = it.id;
        break;
      }
    }
    insertBeforeId.value = before;
  }

  function cleanup(): void {
    if (ctx) {
      ctx.el.style.transform = '';
      ctx.el.classList.remove('sorting');
    }
    ctx = null;
    dragId.value = null;
    insertBeforeId.value = null;
    document.body.classList.remove('noselect');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
  }

  function onUp(e: PointerEvent): void {
    if (!ctx || e.pointerId !== ctx.pointerId) return;
    const dragItemId = ctx.id;
    const ids = ctx.items.map((i) => i.id);
    const from = ids.indexOf(dragItemId);
    let insertAt = insertBeforeId.value ? ids.indexOf(insertBeforeId.value) : ids.length;
    if (insertAt < 0) insertAt = ids.length;
    cleanup();
    if (from < 0 || insertAt === from || insertAt === from + 1) return; // 位置未变
    ids.splice(from, 1);
    ids.splice(insertAt > from ? insertAt - 1 : insertAt, 0, dragItemId);
    onCommit(ids);
  }

  function onCancel(e: PointerEvent): void {
    if (!ctx || e.pointerId !== ctx.pointerId) return;
    cleanup();
  }

  return { dragId, insertBeforeId, start };
}
