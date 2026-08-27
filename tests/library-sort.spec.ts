import { describe, expect, it, vi } from 'vitest';
import { useLibrarySort } from '@/composables/useLibrarySort';

/** 构造带固定几何的组内列表（jsdom 无布局，rect 手工指定） */
function buildList(idxs: string[], itemH = 50, top0 = 100): HTMLElement {
  const list = document.createElement('div');
  list.className = 'grp-items';
  idxs.forEach((id, i) => {
    const el = document.createElement('div');
    el.className = 'lib-item';
    el.dataset.id = id;
    el.getBoundingClientRect = () =>
      ({ top: top0 + i * itemH, bottom: top0 + (i + 1) * itemH, height: itemH } as DOMRect);
    list.appendChild(el);
  });
  document.body.appendChild(list);
  return list;
}

const fire = (type: 'pointermove' | 'pointerup', y: number): void => {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(ev, { pointerId: 1, button: 0, clientX: 500, clientY: y });
  window.dispatchEvent(ev);
};
/** 直接调用 composable 的 start（组件内由 grip 的 emit 接线，此处模拟手柄按下） */
const makeStart = (start: (e: PointerEvent, id: string) => void) => (y: number, id: string): void => {
  const ev = new Event('pointerdown', { bubbles: true, cancelable: true });
  Object.assign(ev, { pointerId: 1, button: 0, clientX: 500, clientY: y });
  start(ev as unknown as PointerEvent, id);
};

describe('useLibrarySort 组内拖拽排序（口径 §6.1a）', () => {
  it('首项拖到末尾：提交 [b, c, a]', () => {
    const list = buildList(['a', 'b', 'c']);
    const commit = vi.fn();
    const { start, dragId, insertBeforeId } = useLibrarySort(() => list, commit);
    makeStart(start)(100, 'a'); // 按住 a 的手柄
    expect(dragId.value).toBe('a');
    fire('pointermove', 240); // 指针越过 b、c 中点（125/175）→ 末尾
    expect(insertBeforeId.value).toBeNull(); // 越过全部 → 排末尾
    fire('pointerup', 240);
    expect(commit).toHaveBeenCalledWith(['b', 'c', 'a']);
    expect(dragId.value).toBeNull(); // 已清理
    list.remove();
  });

  it('末项拖到最前：提交 [c, a, b]', () => {
    const list = buildList(['a', 'b', 'c']);
    const commit = vi.fn();
    const { start } = useLibrarySort(() => list, commit);
    makeStart(start)(200, 'c');
    fire('pointermove', 110); // 在 a 中点(125)之上 → 插到 a 前
    fire('pointerup', 110);
    expect(commit).toHaveBeenCalledWith(['c', 'a', 'b']);
    list.remove();
  });

  it('位置未变（松手在原位）：不提交', () => {
    const list = buildList(['a', 'b', 'c']);
    const commit = vi.fn();
    const { start } = useLibrarySort(() => list, commit);
    makeStart(start)(150, 'b');
    fire('pointermove', 150);
    fire('pointerup', 150);
    expect(commit).not.toHaveBeenCalled();
    list.remove();
  });

  it('pointercancel：安全清理不提交', () => {
    const list = buildList(['a', 'b', 'c']);
    const commit = vi.fn();
    const { start, dragId } = useLibrarySort(() => list, commit);
    makeStart(start)(100, 'a');
    const ev = new Event('pointercancel', { bubbles: true });
    Object.assign(ev, { pointerId: 1 });
    window.dispatchEvent(ev);
    expect(commit).not.toHaveBeenCalled();
    expect(dragId.value).toBeNull();
    list.remove();
  });
});
