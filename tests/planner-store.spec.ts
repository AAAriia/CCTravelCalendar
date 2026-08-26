import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { usePlannerStore } from '@/stores/planner';
import { isoOf, mondayOf, addDays } from '@/utils/datetime';
import { fmtShort } from '@/utils/format';

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

const boot = async () => {
  const store = usePlannerStore();
  await store.init();
  return store;
};
const findByTitle = (store: ReturnType<typeof usePlannerStore>, title: string) =>
  store.schedules.find((s) => s.title.includes(title))!;
const mondayIso = (n = 0) => isoOf(addDays(mondayOf(new Date()), n));

describe('planner store · 初始化与种子', () => {
  it('首次 init 播种示例数据：1 行程 + 14 日程', async () => {
    const store = await boot();
    expect(store.plans).toHaveLength(1);
    expect(store.schedules).toHaveLength(9);
    expect(store.currentPlanId).toBe(store.plans[0].id);
    expect(store.loaded).toBe(true);
  });

  it('重复 init 幂等（不重复播种）', async () => {
    const store = await boot();
    await store.init();
    expect(store.schedules).toHaveLength(9);
  });

  it('刷新场景：新 store 实例从 localStorage 恢复修改', async () => {
    const store = await boot();
    const food = findByTitle(store, '吃饭');
    store.cancelSchedule(food.id);
    // 模拟刷新：全新 pinia + store
    setActivePinia(createPinia());
    const store2 = await boot();
    expect(store2.schedules.find((s) => s.id === food.id)!.date).toBeNull();
  });
});

describe('planner store · 状态机 E1–E8（口径文档 §3.2）', () => {
  it('E1 新建（无日期时间）→ 未放置，默认时长 60', async () => {
    const store = await boot();
    const [s, warn] = store.createSchedule({ title: '测试 A', type: 'food' });
    expect(warn).toBeNull();
    expect(s.date).toBeNull();
    expect(s.startTime).toBeNull();
    expect(s.durationMin).toBe(60);
    expect(store.activeSchedules.some((x) => x.id === s.id)).toBe(true);
  });

  it('E2 新建（日期+时间）→ 直接上表，09:20 向下对齐 09:00', async () => {
    const store = await boot();
    const [s] = store.createSchedule({ title: '测试 B', type: 'sight', date: mondayIso(2), startTime: '09:20' });
    expect(s.date).toBe(mondayIso(2));
    expect(s.startTime).toBe('09:00');
  });

  it('新建只填日期之一 → 两者置空 + 警告（口径 §3.3）', async () => {
    const store = await boot();
    const [s, warn] = store.createSchedule({ title: '测试 C', type: 'food', date: mondayIso(2) });
    expect(warn).toBe('date-time-mismatch');
    expect(s.date).toBeNull();
    expect(s.startTime).toBeNull();
  });

  it('E3 拖入：落点写入日期时间；日末截断保持时长', async () => {
    const store = await boot();
    const north = findByTitle(store, '北部交通'); // 未放置
    const placed = store.placeSchedule(north.id, mondayIso(0), 600, 'place');
    expect(placed!.date).toBe(mondayIso(0));
    expect(placed!.startTime).toBe('10:00');
    // 浮潜 180 分钟，落点 23:40 → 钳制为 21:00 开始（口径 §4.4 保持时长）
    const dive = findByTitle(store, '浮潜');
    const r2 = store.placeSchedule(dive.id, mondayIso(1), 1420, 'place');
    expect(r2!.startTime).toBe('21:00');
  });

  it('E4 表内拖动改期', async () => {
    const store = await boot();
    const food = findByTitle(store, '吃饭');
    store.placeSchedule(food.id, mondayIso(5), 840, 'move');
    expect(food.date).toBe(mondayIso(5));
    expect(food.startTime).toBe('14:00');
  });

  it('E5 边缘调时长', async () => {
    const store = await boot();
    const traffic = findByTitle(store, '宫古岛交通');
    store.resizeSchedule(traffic.id, 690, 120);
    expect(traffic.startTime).toBe('11:30');
    expect(traffic.durationMin).toBe(120);
    // 越过日末的防御性钳制：保持开始时间、截断时长（口径 §4.4；正常拖拽由调用方先行钳制）
    store.resizeSchedule(traffic.id, 1400, 90);
    expect(traffic.startTime).toBe('23:20');
    expect(traffic.durationMin).toBe(40);
  });

  it('E6 取消：日期时间置空 + 预计日期回写为上次实际日期（口径 §5）', async () => {
    const store = await boot();
    const flight = findByTitle(store, '宫古往返'); // D4 周五 09:00
    expect(flight.expectedDate).toBeNull();
    const lastDate = store.cancelSchedule(flight.id);
    expect(lastDate).toBe(mondayIso(4));
    expect(flight.date).toBeNull();
    expect(flight.startTime).toBeNull();
    expect(flight.expectedDate).toBe(mondayIso(4)); // 回写 ✓
    expect(store.groups.length).toBeGreaterThan(0);
  });

  it('E6 多次取消取最近一次实际日期（口径 §5.2 示例推演）', async () => {
    const store = await boot();
    const s = findByTitle(store, '北部交通'); // 未放置
    // 放到周一 → 取消 → 预计日期 = 周一
    store.placeSchedule(s.id, mondayIso(0), 600, 'place');
    store.cancelSchedule(s.id);
    expect(s.expectedDate).toBe(mondayIso(0));
    // 再放到周六 → 再取消 → 预计日期覆盖为周六
    store.placeSchedule(s.id, mondayIso(5), 720, 'place');
    store.cancelSchedule(s.id);
    expect(s.expectedDate).toBe(mondayIso(5));
    expect(s.date).toBeNull();
  });

  it('E7 编辑：填日期+时间 → 已放置；时间对齐', async () => {
    const store = await boot();
    const s = findByTitle(store, '北部交通');
    const [updated, warn] = store.updateSchedule(s.id, {
      title: s.title, type: s.type, date: mondayIso(4), startTime: '14:20', durationMin: 120,
    });
    expect(warn).toBeNull();
    expect(updated!.date).toBe(mondayIso(4));
    expect(updated!.startTime).toBe('14:00');
  });

  it('E8 编辑：清空日期 → 未放置且预计日期不回写（区别于 E6）', async () => {
    const store = await boot();
    const dive = findByTitle(store, '浮潜'); // D2 09:00
    const [, warn] = store.updateSchedule(dive.id, {
      title: dive.title, type: dive.type, date: null, startTime: null, durationMin: dive.durationMin,
    });
    expect(warn).toBeNull();
    expect(dive.date).toBeNull();
    expect(dive.expectedDate).toBeNull(); // 不回写
  });

  it('E8 编辑只填时间 → 两者置空 + 警告', async () => {
    const store = await boot();
    const food = findByTitle(store, '吃饭');
    const [, warn] = store.updateSchedule(food.id, {
      title: food.title, type: food.type, date: null, startTime: '09:00', durationMin: 60,
    });
    expect(warn).toBe('date-time-mismatch');
    expect(food.date).toBeNull();
    expect(food.startTime).toBeNull();
  });
});

describe('planner store · 统计口径（口径文档 §8：金额区间 = 各日程区间求和）', () => {
  it('本周区间：种子 8 项 ¥7,206~8,295；取消吃饭(1200±300) → 7 项 ¥6,006~6,795', async () => {
    const store = await boot();
    // 种子已放置：D0 高铁294/大巴81+69/机票2553+500/酒店1750 + D1 吃饭1200+300 + D2 浮潜600 + D4 宫古机票748-220/宫古交通200
    expect(store.weekStats.count).toBe(8);
    expect(store.weekStats.min).toBe(7206);
    expect(store.weekStats.max).toBe(8295);
    store.cancelSchedule(findByTitle(store, '吃饭').id);
    expect(store.weekStats.count).toBe(7);
    expect(store.weekStats.min).toBe(6006);
    expect(store.weekStats.max).toBe(6795);
  });

  it('未放置不计入：放置"北部交通"(空金额±500) 后 max +500、min 不变', async () => {
    const store = await boot();
    const north = findByTitle(store, '北部交通');
    store.placeSchedule(north.id, mondayIso(3), 600, 'place');
    expect(store.weekStats.count).toBe(9);
    expect(store.weekStats.min).toBe(7206); // 0~500 → min 贡献 0
    expect(store.weekStats.max).toBe(8795); // 500
  });

  it('切到别的周 → 统计为 0', async () => {
    const store = await boot();
    store.prevWeek();
    expect(store.weekStats.count).toBe(0);
    expect(store.weekStats.min).toBe(0);
    store.goToday();
    expect(store.weekStats.count).toBe(8);
  });
});

describe('planner store · 日程库分组口径（口径文档 §6）', () => {
  it('按类型：六类固定顺序，空类也保留', async () => {
    const store = await boot();
    expect(store.groupBy).toBe('type');
    expect(store.groups.map((g) => g.name)).toEqual(['交通', '住宿', '餐饮', '景点', '购物', '娱乐']);
    expect(store.groups.map((g) => g.items.length)).toEqual([6, 1, 1, 1, 0, 0]);
  });

  it('按地点：字典序，"未填写地点"排最后', async () => {
    const store = await boot();
    store.setGroupBy('location');
    const names = store.groups.map((g) => g.name);
    expect(names[names.length - 1]).toBe('未填写地点');
    expect(store.groups.find((g) => g.name === '未填写地点')!.items).toHaveLength(1); // 本岛北部交通
    expect(new Set(names).size).toBe(names.length);
  });

  it('按预计日期：升序，"未设定"排最后', async () => {
    const store = await boot();
    store.setGroupBy('expectedDate');
    const names = store.groups.map((g) => g.name);
    expect(names[names.length - 1]).toBe('未设定');
    // 种子：北部交通 expectedDate=D3 一个日期组 + 未设定（8 条）
    expect(names).toHaveLength(2);
    expect(store.groups.find((g) => g.name === '未设定')!.items).toHaveLength(8);
  });

  it('取消后日程出现在预计日期 = 上次实际日期的分组（回写独立验证）', async () => {
    const store = await boot();
    store.cancelSchedule(findByTitle(store, '吃饭').id); // D1 → 周二
    store.setGroupBy('expectedDate');
    const g = store.groups.find((x) => x.items.some((i) => i.title.includes('吃饭')));
    expect(g!.name).toContain(fmtShort(mondayIso(1)));
  });

  it('setGroupBy 重置折叠状态（口径 §6.1）', async () => {
    const store = await boot();
    store.toggleCollapsed('type:food');
    expect(store.collapsed.has('type:food')).toBe(true);
    store.setGroupBy('location');
    expect(store.collapsed.size).toBe(0);
  });
});

describe('planner store · 删除与回收站', () => {
  it('删除 → 回收站，不参与日历/库/统计；恢复 → 回到原位（含日期时间）', async () => {
    const store = await boot();
    const food = findByTitle(store, '吃饭');
    const before = store.weekStats.count;
    store.deleteSchedule(food.id);
    expect(food.deletedAt).not.toBeNull();
    expect(store.activeSchedules.some((s) => s.id === food.id)).toBe(false);
    expect(store.trashedSchedules.map((s) => s.id)).toContain(food.id);
    expect(store.weekStats.count).toBe(before - 1);
    // 恢复：日期时间保留
    store.restoreSchedule(food.id);
    expect(food.deletedAt).toBeNull();
    expect(food.date).not.toBeNull();
    expect(store.weekStats.count).toBe(before);
  });

  it('彻底删除：物理移除，不可恢复', async () => {
    const store = await boot();
    const s = findByTitle(store, '北部交通');
    store.deleteSchedule(s.id);
    expect(store.purgeSchedule(s.id)).toBe(true);
    expect(store.schedules.some((x) => x.id === s.id)).toBe(false);
    expect(store.trashedSchedules).toHaveLength(0);
  });

  it('已删除日程不响应状态机事件', async () => {
    const store = await boot();
    const s = findByTitle(store, '北部交通');
    store.deleteSchedule(s.id);
    expect(store.cancelSchedule(s.id)).toBeNull();
    expect(store.placeSchedule(s.id, mondayIso(0), 600, 'place')).toBeNull();
    expect(store.resizeSchedule(s.id, 0, 60)).toBeNull();
  });
});

describe('planner store · 行程管理', () => {
  it('新建行程 → 切换为当前，库为空', async () => {
    const store = await boot();
    const p = store.createPlan('国庆北京行');
    expect(store.currentPlanId).toBe(p.id);
    expect(store.activeSchedules).toHaveLength(0);
    expect(store.weekStats.count).toBe(0);
  });

  it('重命名行程', async () => {
    const store = await boot();
    const id = store.plans[0].id;
    store.renamePlan(id, '新名字');
    expect(store.plans[0].name).toBe('新名字');
  });

  it('删除当前行程 → 行程与日程级联删除并切到剩余行程', async () => {
    const store = await boot();
    const second = store.createPlan('第二个');
    store.switchPlan(store.plans[0].id);
    const n = store.removePlan(store.plans[0].id);
    expect(n).toBe(9);
    expect(store.plans.map((p) => p.id)).toEqual([second.id]);
    expect(store.currentPlanId).toBe(second.id);
  });

  it('删除唯一行程 → 自动创建"我的行程"兜底', async () => {
    const store = await boot();
    store.removePlan(store.plans[0].id);
    expect(store.plans).toHaveLength(1);
    expect(store.plans[0].name).toBe('我的行程');
    expect(store.schedules).toHaveLength(0);
  });

  it('重置示例数据：恢复种子并回到本周/按类型', async () => {
    const store = await boot();
    store.cancelSchedule(findByTitle(store, '吃饭').id);
    store.nextWeek();
    store.setGroupBy('location');
    await store.resetToSeed();
    expect(store.schedules).toHaveLength(9);
    expect(store.weekStats.count).toBe(8);
    expect(store.groupBy).toBe('type');
  });
});
