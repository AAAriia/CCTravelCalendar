import { beforeEach, describe, expect, it } from 'vitest';
import { LocalRepository } from '@/data/localRepository';
import { STORAGE_KEY } from '@/constants';
import type { AppData } from '@/types';

const rep = new LocalRepository();

const sample = (over: Partial<AppData> = {}): AppData => ({
  version: 1,
  plans: [{ id: 'p1', name: '测试行程', createdAt: 1, updatedAt: 1 }],
  schedules: [
    {
      id: 's1', planId: 'p1', title: '西湖游船', type: 'sight', location: '湖滨',
      date: '2026-08-26', startTime: '09:00', durationMin: 120, expectedDate: null,
      price: 120, priceVariance: null, note: '', deletedAt: null, createdAt: 1, updatedAt: 1,
    },
  ],
  lastPlanId: 'p1',
  ...over,
});

beforeEach(() => localStorage.clear());

describe('LocalRepository（口径 §9 持久化）', () => {
  it('save → load 往返一致', async () => {
    await rep.save(sample());
    const data = await rep.load();
    expect(data!.plans[0].name).toBe('测试行程');
    expect(data!.schedules[0].title).toBe('西湖游船');
    expect(data!.lastPlanId).toBe('p1');
  });

  it('无数据 / JSON 损坏 → null（调用方播种）', async () => {
    expect(await rep.load()).toBeNull();
    localStorage.setItem(STORAGE_KEY, '{broken json');
    expect(await rep.load()).toBeNull();
  });

  it('clear 后读取为 null', async () => {
    await rep.save(sample());
    await rep.clear();
    expect(await rep.load()).toBeNull();
  });

  it('孤儿日程（planId 无效）挂到第一个行程', async () => {
    await rep.save(sample({ schedules: [{ ...sample().schedules[0], id: 's2', planId: 'ghost' }] }));
    const data = await rep.load();
    expect(data!.schedules[0].planId).toBe('p1');
  });

  it('lastPlanId 失效回退到第一个行程', async () => {
    await rep.save(sample({ lastPlanId: 'ghost' }));
    expect((await rep.load())!.lastPlanId).toBe('p1');
  });

  it('坏字段被 normalize 修复而非抛错', async () => {
    const bad = { ...sample().schedules[0], type: 'bad' as unknown as AppData['schedules'][number]['type'], startTime: '99:00' };
    await rep.save(sample({ schedules: [bad] }));
    const data = await rep.load();
    expect(data!.schedules[0].type).toBe('sight');
    expect(data!.schedules[0].date).toBeNull(); // startTime 非法 → 连带置空
  });
});
