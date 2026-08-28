/**
 * 坐标系转换（口径 §20）：高德底图为 GCJ-02，Photon/存储为 WGS84。
 * - 渲染到高德底图前：wgs2gcj（仅中国大陆，海外无偏移）
 * - 从高德底图取点（点击）：gcj2wgs 后再存储/反查
 */

/**
 * 是否中国大陆坐标系范围（GCJ-02 覆盖区）。
 * 粗矩形会把冲绳/东海/台湾误圈入导致海外点被错误偏移，故追加排除：
 * - 东侧海域：东经 > 123.5 且北纬 < 39.5（东海/日本西南诸岛，含冲绳；东北在 39.5 以北保留）
 * - 台湾岛：120–122E / 21.9–25.5N
 */
export const outOfChina = (lat: number, lon: number): boolean => {
  if (!(lon > 73.66 && lon < 135.05 && lat > 18.15 && lat < 53.55)) return true;
  if (lon > 123.5 && lat < 39.5) return true; // 东海/日本方向
  if (lon > 120.0 && lon < 122.0 && lat > 21.9 && lat < 25.5) return true; // 台湾
  return false;
};

function transformLat(x: number, y: number): number {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin((y / 3.0) * Math.PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((y / 12.0) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLon(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin((x / 3.0) * Math.PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((x / 12.0) * Math.PI) + 300.0 * Math.sin((x / 30.0) * Math.PI)) * 2.0) / 3.0;
  return ret;
}

/** WGS84 → GCJ02（海外原样返回） */
export function wgs2gcj(lat: number, lon: number): [number, number] {
  if (outOfChina(lat, lon)) return [lat, lon];
  const a = 6378245.0;
  const ee = 0.00669342162296594323;
  const dLat = transformLat(lon - 105.0, lat - 35.0);
  const dLon = transformLon(lon - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - ee * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  const dl = (dLat * 180.0) / (((a * (1 - ee)) / (magic * sqrtMagic)) * Math.PI);
  const dn = (dLon * 180.0) / ((a / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return [lat + dl, lon + dn];
}

/** GCJ02 → WGS84（迭代逼近；海外原样返回） */
export function gcj2wgs(lat: number, lon: number): [number, number] {
  if (outOfChina(lat, lon)) return [lat, lon];
  let wlat = lat;
  let wlon = lon;
  for (let i = 0; i < 3; i++) {
    const [glat, glon] = wgs2gcj(wlat, wlon);
    wlat -= glat - lat;
    wlon -= glon - lon;
  }
  return [wlat, wlon];
}
