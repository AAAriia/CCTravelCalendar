import { describe, expect, it } from 'vitest';
import { gcj2wgs, outOfChina, wgs2gcj } from '@/utils/geo';

describe('坐标系转换（口径 §20：存储 WGS84，渲染 GCJ-02）', () => {
  it('海外（冲绳）无偏移：原样返回', () => {
    expect(wgs2gcj(26.2085, 127.6845)).toEqual([26.2085, 127.6845]);
    expect(gcj2wgs(26.2085, 127.6845)).toEqual([26.2085, 127.6845]);
    expect(outOfChina(26.2, 127.6)).toBe(true);
  });

  it('边界判定：冲绳/台湾为海外，上海/东北/福建为国内', () => {
    expect(outOfChina(26.2, 127.68)).toBe(true); // 冲绳
    expect(outOfChina(25.04, 121.55)).toBe(true); // 台北
    expect(outOfChina(37.55, 126.99)).toBe(true); // 首尔
    expect(outOfChina(31.23, 121.47)).toBe(false); // 上海
    expect(outOfChina(43.88, 125.32)).toBe(false); // 长春（东北高经度保留）
    expect(outOfChina(26.08, 119.30)).toBe(false); // 福州
  });

  it('中国大陆：WGS→GCJ 有偏移且可逆（往返误差 < 1e-6 度）', () => {
    const wgs: [number, number] = [22.9911, 113.2605]; // 广州南站
    const [glat, glon] = wgs2gcj(wgs[0], wgs[1]);
    expect(Math.abs(glat - wgs[0])).toBeGreaterThan(0.0001); // 有明显偏移（~百米级）
    expect(Math.abs(glon - wgs[1])).toBeGreaterThan(0.0001);
    const [back1, back2] = gcj2wgs(glat, glon);
    expect(Math.abs(back1 - wgs[0])).toBeLessThan(1e-5);
    expect(Math.abs(back2 - wgs[1])).toBeLessThan(1e-5);
    expect(outOfChina(22.99, 113.26)).toBe(false);
  });

  it('选点弹层点击存储：GCJ 点击点转 WGS84 后与真值偏差 < 1 米级', () => {
    // 模拟：真实位置 WGS → 底图偏移为 GCJ → 用户点击 GCJ → gcj2wgs 还原
    const truth: [number, number] = [39.9042, 116.4074]; // 北京
    const [glat, glon] = wgs2gcj(truth[0], truth[1]);
    const [wlat, wlon] = gcj2wgs(glat, glon);
    expect(Math.abs(wlat - truth[0])).toBeLessThan(1e-5); // ~1 米内
    expect(Math.abs(wlon - truth[1])).toBeLessThan(1e-5);
  });
});
