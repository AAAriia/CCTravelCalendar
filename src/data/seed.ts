import type { AppData, Schedule } from '@/types';
import { addDays, isoOf, mondayOf } from '@/utils/datetime';
import { uid } from './normalize';

/**
 * 示例数据：冲绳行程预算（来自需求方提供的数据，相对当前周生成，周一为第 0 天）。
 * 已放置 8 条 + 未放置 1 条（本岛北部交通，视是否北上再排）。
 */
export function buildSeedData(): AppData {
  const planId = uid('plan');
  const mon = mondayOf(new Date());
  const D = (n: number): string => isoOf(addDays(mon, n));
  let seq = 0;
  const mk = (o: Partial<Schedule>): Schedule => ({
    id: uid(),
    planId,
    title: '未命名日程',
    type: 'sight',
    location: '',
    date: null,
    startTime: null,
    durationMin: 60,
    expectedDate: null,
    price: null,
    priceVariance: null,
    note: '',
    deletedAt: null,
    createdAt: Date.now() + (seq++),
    updatedAt: Date.now() + (seq++),
    ...o,
  });

  return {
    version: 1,
    plans: [{ id: planId, name: '冲绳 7 日行', createdAt: Date.now(), updatedAt: Date.now() }],
    lastPlanId: planId,
    schedules: [
      // —— 出发日（D0）——
      mk({ title: '广州-HK 高铁 ×2', type: 'transport', location: '广州南站', date: D(0), startTime: '08:30', durationMin: 90, price: 294, note: '深圳下车转一下，单程 72+75。' }),
      mk({ title: '机场大巴/快线 ×2', type: 'transport', location: '香港西九龙 → 机场', date: D(0), startTime: '12:30', durationMin: 60, price: 81, priceVariance: 69, note: '大巴 40.5；机场快线双人票好像人均 75。' }),
      mk({ title: 'HK-冲绳往返机票', type: 'transport', location: '香港国际机场', date: D(0), startTime: '14:30', durationMin: 180, price: 2553, priceVariance: 500, note: '9.30-10.6 或 10.2-10.7/8 两个窗口。' }),
      mk({ title: '冲绳酒店 5 晚（均价 700/2）', type: 'hotel', location: '那霸 · 国际通附近', date: D(0), startTime: '16:00', durationMin: 30, price: 1750, note: '目前刷到贵的 2k+（很爽的海景），便宜的 400+，还可以的 600+。' }),
      // —— 行程中 ——
      mk({ title: '吃饭预算（全程）', type: 'food', location: '全程', date: D(1), startTime: '18:30', durationMin: 60, price: 1200, priceVariance: 300, note: '1 日 2 餐，餐均 100。' }),
      mk({ title: '浮潜', type: 'sight', location: '离岛（还没选）', date: D(2), startTime: '09:00', durationMin: 180, price: 600, note: '还没选哪个岛，预估 14000 日元。' }),
      mk({ title: '冲绳本岛-宫古往返机票', type: 'transport', location: '那霸机场', date: D(4), startTime: '09:00', durationMin: 120, price: 748, priceVariance: -220, note: '行程 1h，最便宜的 428 但是早 7 点，其他 700+ 的是下午。' }),
      mk({ title: '宫古岛交通', type: 'transport', location: '宫古岛', date: D(4), startTime: '11:00', durationMin: 60, price: 200, note: '公交不划算，打车去哪基本都是 100 左右。' }),
      // —— 未放置（日程库候选）——
      mk({ title: '本岛北部交通', type: 'transport', location: '', expectedDate: D(3), priceVariance: 500, note: '如果去北部，包车一日游 2k-，看几个人拼。' }),
    ],
  };
}
