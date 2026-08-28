import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import MapPicker from '@/components/MapPicker.vue';

/* mock leaflet：记录 map 实例与注册的事件处理器 */
const clickHandlers: Array<(e: { latlng: { lat: number; lng: number } }) => void> = [];
const fakeMap = {
  setView: vi.fn(() => fakeMap),
  getZoom: () => 10,
  on: (ev: string, fn: never) => {
    if (ev === 'click') clickHandlers.push(fn);
  },
  remove: vi.fn(),
};
vi.mock('leaflet', () => {
  const divIcon = () => ({});
  const marker = () => ({ addTo: () => ({ remove: vi.fn() }), remove: vi.fn() });
  const tileLayer = () => ({ addTo: () => undefined });
  const map = () => fakeMap;
  return { default: { map, tileLayer, marker, divIcon }, map, tileLayer, marker, divIcon };
});

afterEach(() => {
  wrapper?.unmount();
});

const fireMapClick = (lat: number, lng: number) => {
  for (const h of clickHandlers) h({ latlng: { lat, lng } });
};

let wrapper: VueWrapper;
const bodyText = () => document.body.textContent ?? '';
const clickBtn = (text: string): boolean => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
  if (!btn) return false;
  btn.click();
  return true;
};
beforeEach(() => {
  clickHandlers.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ features: [] }) }) as unknown as Response),
  );
});

describe('MapPicker 地图选点（口径 §20a）', () => {
  it('点击地图 → 落点坐标 + 反查地址 → 确定后 emit pick', async () => {
    wrapper = mount(MapPicker);
    await flushPromises();
    fireMapClick(26.2085, 127.6845);
    await flushPromises();
    await flushPromises();
    expect(bodyText()).toContain('26.2085');
    expect(bodyText()).toContain('127.6845');
    expect(clickBtn('确定地址')).toBe(true);
    await flushPromises();
    const emitted = wrapper.emitted('pick');
    expect(emitted).toBeTruthy();
    expect(emitted![0]).toEqual([{ address: '', lat: 26.2085, lon: 127.6845 }]);
  });

  it('反查成功 → 地址文本回填', async () => {
    const rev = {
      features: [
        { properties: { name: '楚辺一丁目', city: '那覇市', country: '日本' }, geometry: { coordinates: [127.68, 26.2] } },
      ],
    };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => rev }) as unknown as Response));
    wrapper = mount(MapPicker);
    await flushPromises();
    fireMapClick(26.21, 127.69);
    await flushPromises();
    await flushPromises();
    expect(bodyText()).toContain('楚辺一丁目');
  });

  it('搜索结果点选 → pickFromSearch 带地址与坐标', async () => {
    const searchRes = {
      features: [
        { properties: { name: 'Naha Airport', city: 'Okinawa' }, geometry: { coordinates: [127.6845, 26.2085] } },
      ],
    };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => searchRes }) as unknown as Response));
    wrapper = mount(MapPicker);
    await flushPromises();
    const input = document.querySelector<HTMLInputElement>('.pk-search input')!;
    input.value = 'Naha Airport';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    clickBtn('搜索');
    await flushPromises();
    const item = document.querySelector<HTMLElement>('.pk-result');
    expect(item).toBeTruthy();
    expect(item!.textContent).toContain('Naha Airport');
    item!.click();
    await flushPromises();
    clickBtn('确定地址');
    await flushPromises();
    const emitted = wrapper.emitted('pick');
    expect(emitted![0]).toEqual([{ address: 'Naha Airport · Okinawa', ctx: 'Okinawa', lat: 26.2085, lon: 127.6845, name: 'Naha Airport' }]);
  });

  it('无选点时确定按钮禁用', async () => {
    wrapper = mount(MapPicker);
    await flushPromises();
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === '确定地址') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(true);
  });
});
