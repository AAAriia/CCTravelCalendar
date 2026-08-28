<template>
  <div class="map-page">
    <header class="mp-head">
      <button class="btn" @click="goBack">← 返回行程板</button>
      <div class="mp-title">地图视图<b v-if="store.currentPlan"> · {{ store.currentPlan.name }}</b></div>
      <div class="spacer"></div>
      <div class="mp-stat" v-if="dayItems.length">
        {{ located.length }}/{{ dayItems.length }} 已定位
        <span v-if="loading" class="loading">定位中…</span>
      </div>
    </header>

    <!-- 日期条：仅显示本周有已放置日程的日子 -->
    <div class="date-strip" v-if="daysWithItems.length">
      <div
        v-for="d in daysWithItems"
        :key="d.iso"
        class="ds-item"
        :class="{ sel: d.iso === selectedDate, 'today-dot': d.iso === todayIso }"
        @click="selectDay(d.iso)"
      >
        <div class="dw">周{{ WEEK_CN[d.day.getDay()] }}</div>
        <div class="dd">{{ d.day.getMonth() + 1 }}/{{ d.day.getDate() }} <small>{{ d.count }}</small></div>
      </div>
      <div class="ds-item nav" title="上一周" @click="store.prevWeek()">◀</div>
      <div class="ds-item nav" title="下一周" @click="store.nextWeek()">▶</div>
    </div>

    <div class="mp-body">
      <div class="map-wrap">
        <div ref="mapEl" class="map-box"></div>
        <div v-if="!loading && !located.length" class="map-empty">
          {{ dayItems.length ? '暂未解析出坐标（可稍后重试或完善地点名，海外地点建议写当地语言）' : '该日期暂无已放置日程' }}
        </div>
      </div>

      <!-- 当日行程侧栏 -->
      <aside class="day-list">
        <div class="dl-h">当日行程（{{ dayItems.length }}）</div>
        <div
          v-for="(s, i) in dayItems"
          :key="s.id"
          class="dl-item"
          :class="{ dim: !coords[s.id] }"
          @click="focusMarker(s)"
        >
          <span class="dl-no" :style="{ '--c': TYPE_MAP[s.type].color }">{{ i + 1 }}</span>
          <div class="dl-main">
            <div class="dl-t">{{ s.title }}</div>
            <div class="dl-sub">
              {{ s.startTime }} · {{ s.location || '未填写地点' }}
              <template v-if="s.price != null"> · {{ fmtPriceRange(s.price, s.varianceUp, s.varianceDown) }}</template>
            </div>
          </div>
          <span v-if="coords[s.id]" class="dl-ok">✓</span>
          <span v-else class="dl-warn" :title="'未定位：' + (s.location || '无地点')">{{ loading ? '…' : '⚠' }}</span>
          <button class="btn sm" @click.stop="openDetail(s.id)">详情</button>
        </div>
        <div v-if="!dayItems.length" class="dl-empty">在行程板放置日程后，这里会按时间顺序展示并连线。</div>
        <button class="btn sm dl-retry" v-if="unresolved.length && !loading" @click="retry">
          重试未定位地点（{{ unresolved.length }}）
        </button>
      </aside>
    </div>

    <DetailModal
      :visible="detail.visible"
      :schedule="detail.target"
      @close="detail.visible = false"
      @save="onFormSave"
      @delete="onDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import L, { type Map as LeafletMap, type Marker } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Schedule } from '@/types';
import { TYPE_MAP, WEEK_CN } from '@/constants';
import { usePlannerStore } from '@/stores/planner';
import { isoOf, parseISO } from '@/utils/datetime';
import { fmtPriceRange } from '@/utils/price';
import { geocode, type GeoPoint } from '@/services/geocode';
import type { FormPatch } from '@/types/form';
import DetailModal from '@/components/DetailModal.vue';
import { toast } from '@/composables/useToast';

const store = usePlannerStore();
const router = useRouter();

const mapEl = ref<HTMLElement | null>(null);
const todayIso = isoOf(new Date());
const coords = reactive<Record<string, GeoPoint>>({});
const loading = ref(false);
const detail = reactive<{ visible: boolean; target: Schedule | null }>({ visible: false, target: null });

let map: LeafletMap | null = null;
const markers = new Map<string, Marker>();
let routeLine: L.Polyline | null = null;

/* ---------------- 数据派生 ---------------- */
/** 本周有已放置日程的日期 */
const daysWithItems = computed(() => {
  const byDate = store.schedulesByDate;
  return store.weekIsoList
    .map((iso, i) => ({ iso, day: store.weekDays[i]!, count: byDate.get(iso)?.length ?? 0 }))
    .filter((d) => d.count > 0);
});

const selectedDate = ref('');
watch(
  () => daysWithItems.value,
  (list) => {
    if (!list.length) {
      selectedDate.value = '';
      return;
    }
    if (!list.some((d) => d.iso === selectedDate.value)) {
      selectedDate.value = list.find((d) => d.iso === todayIso)?.iso ?? list[0]!.iso;
    }
  },
  { immediate: true },
);

const dayItems = computed<Schedule[]>(() => {
  if (!selectedDate.value) return [];
  const list = store.schedulesByDate.get(selectedDate.value) ?? [];
  return [...list].sort((a, b) => (a.startTime! < b.startTime! ? -1 : 1));
});

const located = computed(() => dayItems.value.filter((s) => coords[s.id]));
const unresolved = computed(() => dayItems.value.filter((s) => !coords[s.id] && s.location));

/* ---------------- 地图 ---------------- */
function ensureMap(): void {
  if (map || !mapEl.value) return;
  map = L.map(mapEl.value, { zoomControl: true, attributionControl: true }).setView([26.5, 127.9], 9);
  // 高德瓦片（免 Key，国内稳定）；底图为 GCJ-02，中国大陆坐标需纠偏（wgs2gcj）
  L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
    maxZoom: 18,
    subdomains: '1234',
    attribution: '&copy; 高德地图 | 坐标数据 &copy; OpenStreetMap (Photon)',
  }).addTo(map);
}

/** WGS84 → GCJ02（仅中国大陆范围；海外无偏移） */
function wgs2gcj(lat: number, lon: number): [number, number] {
  if (!(lon > 73.66 && lon < 135.05 && lat > 18.15 && lat < 53.55)) return [lat, lon];
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

function numberIcon(n: number, color: string): L.DivIcon {
  return L.divIcon({
    className: 'mp-pin',
    html: `<span style="--c:${color}">${n}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function renderMarkers(): void {
  if (!map) return;
  for (const m of markers.values()) m.remove();
  markers.clear();
  routeLine?.remove();
  routeLine = null;
  const pts: Array<{ s: Schedule; p: GeoPoint }> = [];
  dayItems.value.forEach((s, i) => {
    const p = coords[s.id];
    if (!p) return;
    pts.push({ s, p });
    const [mlat, mlon] = wgs2gcj(p.lat, p.lon);
    const marker = L.marker([mlat, mlon], { icon: numberIcon(i + 1, TYPE_MAP[s.type].color) })
      .addTo(map!)
      .bindPopup(
        `<b>${i + 1}. ${escapeHtml(s.title)}</b><br>${s.startTime} - ${endHH(s)}<br>` +
          `${escapeHtml(s.location)}${s.price != null ? `<br>${fmtPriceRange(s.price, s.varianceUp, s.varianceDown)}` : ''}`,
      );
    markers.set(s.id, marker);
  });
  if (pts.length >= 2) {
    routeLine = L.polyline(pts.map((x) => wgs2gcj(x.p.lat, x.p.lon)), {
      color: '#2563eb',
      weight: 2,
      opacity: 0.7,
      dashArray: '6 8',
    }).addTo(map);
  }
  if (pts.length === 1) {
    const [la, lo] = wgs2gcj(pts[0]!.p.lat, pts[0]!.p.lon);
    map.setView([la, lo], 12);
  } else if (pts.length >= 2) {
    map.fitBounds(L.latLngBounds(pts.map((x) => wgs2gcj(x.p.lat, x.p.lon))), { padding: [50, 50] });
  }
}

function focusMarker(s: Schedule): void {
  const m = markers.get(s.id);
  if (m && map) {
    map.panTo(m.getLatLng(), { animate: true });
    m.openPopup();
  }
}

/* ---------------- 地理编码 ---------------- */
async function resolveAll(force = false): Promise<void> {
  const targets = force ? unresolved.value : dayItems.value.filter((s) => s.location);
  if (!targets.length) return;
  loading.value = true;
  try {
    // 逐个串行（geocode 内部已限速）；缓存命中即时
    for (const s of targets) {
      const p = await geocode(s.location, force && !!coords[s.id]);
      if (p) coords[s.id] = p;
      renderMarkers();
    }
  } finally {
    loading.value = false;
  }
}

function retry(): void {
  void resolveAll(true);
}

watch(selectedDate, () => {
  for (const k of Object.keys(coords)) delete coords[k];
  renderMarkers();
  void resolveAll();
});
watch(() => dayItems.value.map((s) => s.id).join(','), () => renderMarkers());

onMounted(() => {
  ensureMap();
  setTimeout(() => map?.invalidateSize(), 100);
  void resolveAll();
});
onBeforeUnmount(() => {
  map?.remove();
  map = null;
});

/* ---------------- 详情弹窗 ---------------- */
function openDetail(id: string): void {
  const s = store.schedules.find((x) => x.id === id);
  if (!s) return;
  detail.target = s;
  detail.visible = true;
}
function onFormSave(patch: FormPatch): void {
  if (!detail.target) return;
  const [, warn] = store.updateSchedule(detail.target.id, patch);
  if (warn === 'date-time-mismatch') toast('日期与时间需同时填写，已按"未放置"保存');
  else toast('已保存');
  detail.visible = false;
  void resolveAll();
}
function onDelete(): void {
  if (!detail.target) return;
  store.deleteSchedule(detail.target.id);
  detail.visible = false;
  toast('已移入回收站');
}

function selectDay(iso: string): void {
  selectedDate.value = iso;
}
function goBack(): void {
  void router.push({ name: 'plan', params: { planId: store.currentPlanId! } });
}
const endHH = (s: Schedule) => {
  const m = Number(s.startTime!.slice(0, 2)) * 60 + Number(s.startTime!.slice(3)) + s.durationMin;
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const escapeHtml = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
void parseISO;
</script>

<style scoped>
.map-page { height: 100vh; height: 100dvh; display: flex; flex-direction: column; background: var(--bg); }
.mp-head {
  flex: none; height: 52px; background: var(--panel); border-bottom: 1px solid var(--line);
  display: flex; align-items: center; gap: 14px; padding: 0 16px;
}
.mp-title { font-size: 16px; font-weight: 600; }
.mp-title b { color: var(--brand); }
.mp-stat { font-size: 12px; color: var(--t3); }
.loading { color: #b45309; margin-left: 6px; }

.date-strip {
  display: flex; background: var(--panel); border-bottom: 1px solid var(--line);
  overflow-x: auto; flex: none; padding: 6px 8px; gap: 6px;
}
.date-strip .ds-item {
  flex: 1 1 0; min-width: 52px; text-align: center; border-radius: 10px; padding: 5px 0; cursor: pointer;
  border: 1px solid transparent;
}
.ds-item .dw { font-size: 11px; color: var(--t3); }
.ds-item .dd { font-size: 14px; font-weight: 600; }
.ds-item .dd small { color: var(--t4); font-weight: 400; }
.ds-item.sel { background: #eff6ff; border-color: #93c5fd; }
.ds-item.sel .dw, .ds-item.sel .dd { color: #1d4ed8; }
.ds-item.nav { min-width: 36px; flex: none; display: flex; align-items: center; justify-content: center; color: var(--t3); }

.mp-body { flex: 1; display: flex; min-height: 0; }
.map-wrap { flex: 1; position: relative; min-width: 0; }
.map-box { position: absolute; inset: 0; }
.map-empty {
  position: absolute; left: 50%; top: 14px; transform: translateX(-50%);
  background: rgba(17, 24, 39, 0.75); color: #fff; font-size: 12px; border-radius: 999px;
  padding: 6px 14px; z-index: 500; max-width: 86%; text-align: center;
}

.day-list {
  width: 300px; flex: none; background: var(--panel); border-left: 1px solid var(--line);
  display: flex; flex-direction: column; overflow-y: auto; padding: 10px 12px 20px;
}
.dl-h { font-size: 13px; font-weight: 700; margin-bottom: 8px; }
.dl-item {
  display: flex; gap: 8px; align-items: center; border: 1px solid var(--line); border-radius: 8px;
  padding: 7px 8px; margin-bottom: 6px; cursor: pointer;
}
.dl-item:hover { border-color: #d1d5db; background: #fafafa; }
.dl-item.dim { opacity: 0.75; }
.dl-no {
  flex: none; width: 20px; height: 20px; border-radius: 50%; background: var(--c); color: #fff;
  font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center;
}
.dl-main { flex: 1; min-width: 0; }
.dl-t { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dl-sub { font-size: 11px; color: var(--t3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dl-ok { color: #10b981; font-size: 12px; }
.dl-warn { color: #f59e0b; font-size: 12px; }
.dl-empty { font-size: 12px; color: var(--t4); padding: 14px 4px; }
.dl-retry { margin-top: 4px; }

:deep(.mp-pin span) {
  display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: 50%; background: var(--c); color: #fff;
  font-size: 12px; font-weight: 700; border: 2px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,.35);
}
:deep(.leaflet-popup-content) { font-size: 12px; line-height: 1.6; margin: 10px 12px; }

@media (max-width: 767px) {
  .mp-body { flex-direction: column; }
  .day-list { width: auto; border-left: none; border-top: 1px solid var(--line); max-height: 40dvh; }
}
</style>
