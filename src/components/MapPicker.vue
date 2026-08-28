<template>
  <Teleport to="body">
    <div class="overlay picker-overlay" @pointerdown.self="emit('close')">
      <div class="modal picker-modal">
        <div class="modal-h">
          <div class="t">地图选点</div>
          <button type="button" class="modal-x" @click="emit('close')">×</button>
        </div>
        <div class="modal-b">
          <div class="pk-search">
            <input
              v-model.trim="q"
              type="text" maxlength="60" placeholder="搜索地点（国内中文；海外建议英文/当地语言）"
              @keyup.enter="doSearch"
            />
            <button type="button" class="btn primary" :disabled="!q || searching" @click="doSearch">搜索</button>
          </div>
          <div v-if="results.length" class="pk-results">
            <div
              v-for="(r, i) in results" :key="i"
              class="pk-result" :class="{ sel: picked && picked.lat === r.lat && picked.lon === r.lon }"
              @click="pickFromSearch(r)"
            >
              <b>{{ r.name }}</b>
              <span v-if="r.ctx" class="pk-ctx">{{ r.ctx }}</span>
            </div>
          </div>
          <div v-else-if="searched && !searching" class="pk-none">无搜索结果，也可直接在下方地图上点击选点</div>

          <div ref="mapEl" class="pk-map"></div>
          <div class="pk-tip">点击地图任意位置选点（自动反查地址）{{ picked ? '' : '；或使用搜索结果' }}</div>

          <div v-if="picked" class="pk-picked">
            <div class="pk-addr" :title="picked.address">{{ picked.address || '（未命名位置）' }}</div>
            <div class="pk-coord">{{ picked.lat.toFixed(5) }}, {{ picked.lon.toFixed(5) }}</div>
          </div>
        </div>
        <div class="modal-f">
          <button type="button" class="btn" @click="emit('close')">取消</button>
          <button type="button" class="btn primary" :disabled="!picked" @click="confirm">确定地址</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import L, { type Map as LeafletMap, type Marker } from 'leaflet';
import 'leaflet/dist/leaflet.css';

const props = defineProps<{ initLat?: number; initLon?: number }>();
const emit = defineEmits<{ pick: [p: { address: string; lat: number; lon: number }]; close: [] }>();

const q = ref('');
const searching = ref(false);
const searched = ref(false);
const results = ref<Array<{ name: string; ctx: string; address: string; lat: number; lon: number }>>([]);
const picked = ref<{ address: string; lat: number; lon: number } | null>(null);
const mapEl = ref<HTMLElement | null>(null);

let map: LeafletMap | null = null;
let pin: Marker | null = null;

interface PhotonFeature {
  properties: Record<string, unknown>;
  geometry: { coordinates: [number, number] };
}
const featureLabel = (f: PhotonFeature): { name: string; ctx: string } => {
  const p = f.properties;
  const name = String(p.name ?? '').trim();
  const ctx = [p.street, p.housenumber && `${p.housenumber}号`, p.city, p.state, p.country]
    .filter((x) => typeof x === 'string' && x)
    .join(' · ');
  return { name: name || '未命名位置', ctx };
};

async function doSearch(): Promise<void> {
  if (!q.value) return;
  searching.value = true;
  searched.value = true;
  try {
    const res = await fetch(`https://photon.komoot.io/api/?limit=6&q=${encodeURIComponent(q.value)}`);
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { features?: PhotonFeature[] };
    results.value = (data.features ?? []).map((f) => {
      const { name, ctx } = featureLabel(f);
      const [lon, lat] = f.geometry.coordinates;
      return { name, ctx, address: [name, ctx].filter(Boolean).join(' · '), lat, lon };
    });
  } catch {
    results.value = [];
  } finally {
    searching.value = false;
  }
}

function pickFromSearch(r: { address: string; lat: number; lon: number }): void {
  picked.value = { ...r };
  placePin(r.lat, r.lon, 14);
}

async function onMapClick(e: L.LeafletMouseEvent): Promise<void> {
  const { lat, lng: lon } = e.latlng;
  picked.value = { address: '', lat, lon };
  placePin(lat, lon);
  try {
    const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}`);
    if (res.ok) {
      const data = (await res.json()) as { features?: PhotonFeature[] };
      const f = data.features?.[0];
      if (f) {
        const { name, ctx } = featureLabel(f);
        const address = [name, ctx].filter(Boolean).join(' · ');
        if (picked.value && picked.value.lat === lat) picked.value.address = address;
      }
    }
  } catch {
    /* 反查失败保留空地址，坐标仍可用 */
  }
}

function placePin(lat: number, lon: number, zoom?: number): void {
  if (!map) return;
  if (pin) pin.remove();
  pin = L.marker([lat, lon]).addTo(map);
  map.setView([lat, lon], zoom ?? Math.max(map.getZoom(), 12));
}

function confirm(): void {
  if (picked.value) emit('pick', picked.value);
}

onMounted(() => {
  if (!mapEl.value) return;
  const init: [number, number] = [props.initLat ?? 26.2, props.initLon ?? 127.68];
  map = L.map(mapEl.value).setView(init, props.initLat != null ? 14 : 10);
  L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
    maxZoom: 18,
    subdomains: '1234',
    attribution: '&copy; 高德地图',
  }).addTo(map);
  map.on('click', onMapClick);
  if (props.initLat != null && props.initLon != null) {
    picked.value = { address: '', lat: props.initLat, lon: props.initLon };
    placePin(props.initLat, props.initLon);
  }
  setTimeout(() => map?.invalidateSize(), 120);
});
onBeforeUnmount(() => {
  map?.remove();
  map = null;
});
</script>

<style scoped>
.picker-modal { width: 560px; }
.pk-search { display: flex; gap: 8px; margin-bottom: 8px; }
.pk-search input {
  flex: 1; border: 1px solid var(--line); border-radius: 8px; padding: 7px 10px;
  font-size: 13px; font-family: inherit;
}
.pk-results { max-height: 132px; overflow-y: auto; margin-bottom: 8px; }
.pk-result {
  border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; margin-bottom: 4px;
  cursor: pointer; font-size: 12px;
}
.pk-result:hover { border-color: #93c5fd; background: #f8faff; }
.pk-result.sel { border-color: #2563eb; background: #eff6ff; }
.pk-ctx { color: var(--t4); margin-left: 6px; }
.pk-none { font-size: 12px; color: var(--t4); padding: 4px 2px 8px; }
.pk-map { height: 300px; border-radius: 10px; border: 1px solid var(--line); }
.pk-tip { font-size: 11px; color: var(--t4); margin-top: 6px; }
.pk-picked {
  margin-top: 8px; border: 1px solid #bfdbfe; background: #eff6ff; border-radius: 8px; padding: 8px 10px;
}
.pk-addr { font-size: 13px; font-weight: 600; }
.pk-coord { font-size: 11px; color: var(--t4); margin-top: 2px; }

@media (max-width: 767px) {
  .picker-modal { width: 100%; }
  .pk-map { height: 40dvh; }
}
</style>
