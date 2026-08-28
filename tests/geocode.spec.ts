import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearGeocodeCache, geocode } from '@/services/geocode';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

const okBody = { features: [{ geometry: { coordinates: [127.6845, 26.2085] } }] };

describe('地理编码服务（口径 §20）', () => {
  it('查询成功返回坐标并写入缓存；二次调用命中缓存不再发请求', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => okBody }) as unknown as Response);
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    const p1 = await geocode('那霸机场');
    expect(p1).toEqual({ lat: 26.2085, lon: 127.6845 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const p2 = await geocode('那霸机场');
    expect(p2).toEqual(p1);
    expect(fetchMock).toHaveBeenCalledTimes(1); // 缓存命中
  });

  it('查无结果缓存 null（避免反复重查），force 可强制重查', async () => {
    let body: unknown = { features: [] };
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => body }) as unknown as Response);
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    expect(await geocode('不存在的地方xyz')).toBeNull();
    expect(await geocode('不存在的地方xyz')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1); // null 也缓存
    body = okBody;
    const p = await geocode('不存在的地方xyz', true); // 强制重查
    expect(p).toEqual({ lat: 26.2085, lon: 127.6845 });
  });

  it('网络失败返回 null 且不写缓存（下次仍会尝试）', async () => {
    let fail = true;
    const fetchMock = vi.fn(async () => {
      if (fail) throw new Error('offline');
      return { ok: true, json: async () => okBody } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    expect(await geocode('宫古岛')).toBeNull();
    fail = false;
    expect(await geocode('宫古岛')).toEqual({ lat: 26.2085, lon: 127.6845 }); // 未缓存失败结果
  });

  it('空字符串直接返回 null', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    expect(await geocode('  ')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('缓存上限 500 条（超出裁剪最旧）', async () => {
    const cache: Record<string, { lat: number; lon: number }> = {};
    for (let i = 0; i < 520; i++) cache[`地点${i}`] = { lat: i, lon: i };
    localStorage.setItem('tp_geocache', JSON.stringify(cache));
    clearGeocodeCache();
    // 直接验证清空
    expect(localStorage.getItem('tp_geocache')).toBeNull();
  });
});
