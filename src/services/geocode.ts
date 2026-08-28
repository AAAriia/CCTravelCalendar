/**
 * 免费地理编码（口径 §20）：Photon (komoot, OSM 数据)
 * - 国内中文地点支持好；海外地点建议写当地语言/英文
 * - 结果永久缓存到 localStorage（坐标不变），上限 500 条
 * - 请求串行 + 300ms 间隔（礼貌限速）
 */

const CACHE_KEY = 'tp_geocache';
const CACHE_CAP = 500;
const MIN_GAP = 300;
const ENDPOINT = 'https://photon.komoot.io/api/';

export interface GeoPoint {
  lat: number;
  lon: number;
}

function readCache(): Record<string, GeoPoint> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, GeoPoint>;
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, GeoPoint>): void {
  try {
    const keys = Object.keys(cache);
    if (keys.length > CACHE_CAP) {
      for (const k of keys.slice(0, keys.length - CACHE_CAP)) delete cache[k];
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* 存储不可用则跳过缓存 */
  }
}

/** 队列：串行 + 间隔 */
let chain: Promise<unknown> = Promise.resolve();
let lastReqAt = 0;

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = Math.max(0, lastReqAt + MIN_GAP - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    lastReqAt = Date.now();
    return task();
  });
  chain = run.catch(() => undefined);
  return run as Promise<T>;
}

async function lookup(query: string): Promise<GeoPoint | null> {
  const url = `${ENDPOINT}?limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Photon ${res.status}`);
  const data = (await res.json()) as { features?: Array<{ geometry?: { coordinates?: [number, number] } }> };
  const c = data.features?.[0]?.geometry?.coordinates;
  if (!Array.isArray(c) || c.length < 2) return null;
  const lon = Number(c[0]);
  const lat = Number(c[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

/**
 * 地点名 → 坐标（含本地缓存）；查不到返回 null（失败也缓存为 null，避免反复重查）
 * force=true 忽略缓存重查（手动重试场景）
 */
export async function geocode(query: string, force = false): Promise<GeoPoint | null> {
  const q = query.trim();
  if (!q) return null;
  const cache = readCache();
  if (!force && q in cache) return cache[q] ?? null;
  try {
    const pt = await enqueue(() => lookup(q));
    cache[q] = pt ?? (null as unknown as GeoPoint);
    writeCache(cache);
    return pt;
  } catch {
    return null; // 网络失败不写缓存（下次仍会尝试）
  }
}

export function clearGeocodeCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* 同上 */
  }
}
