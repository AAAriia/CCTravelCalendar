<template>
  <div class="wp-wrap">
    <button ref="btnEl" type="button" class="btn week-label-btn" title="点击选择日期" @click="open = !open">
      {{ label }} <span class="caret">▾</span>
    </button>
    <Teleport to="body">
      <div v-if="open" class="wp-backdrop" @click="open = false"></div>
      <div v-if="open" class="wp-pop" :style="popStyle">
        <div class="wp-head">
          <button type="button" class="wp-nav" @click="cur = prevMonth">‹</button>
          <b>{{ cur.getFullYear() }}年{{ cur.getMonth() + 1 }}月</b>
          <button type="button" class="wp-nav" @click="cur = nextMonth">›</button>
          <button type="button" class="btn sm wp-today" @click="pick(todayIso)">今天</button>
        </div>
        <div class="wp-grid wp-week-row">
          <span v-for="w in ['一', '二', '三', '四', '五', '六', '日']" :key="w">{{ w }}</span>
        </div>
        <div class="wp-grid">
          <button
            v-for="c in cells"
            :key="c.key"
            type="button"
            class="wp-day"
            :class="{ dim: c.dim, today: c.iso === todayIso, inweek: weekIsoSet.has(c.iso) }"
            @click="pick(c.iso)"
          >
            {{ c.day }}
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { isoOf, mondayOf, addDays } from '@/utils/datetime';

const props = defineProps<{ label: string; weekStartIso: string }>();
const emit = defineEmits<{ pick: [iso: string] }>();

const open = ref(false);
const cur = ref<Date>(new Date());
const btnEl = ref<HTMLElement | null>(null);

const todayIso = isoOf(new Date());

watch(open, (v) => {
  if (!v) return;
  const ws = new Date(props.weekStartIso);
  cur.value = new Date(ws.getFullYear(), ws.getMonth(), 1);
});

/** 弹层定位：挂在按钮下方（打开时测量，防溢出屏幕） */
const popStyle = reactive({ left: '0px', top: '0px' });
watch(open, (v) => {
  if (!v || !btnEl.value) return;
  const r = btnEl.value.getBoundingClientRect();
  popStyle.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 260))}px`;
  popStyle.top = `${Math.min(r.bottom + 6, window.innerHeight - 330)}px`;
});

const prevMonth = computed(() => new Date(cur.value.getFullYear(), cur.value.getMonth() - 1, 1));
const nextMonth = computed(() => new Date(cur.value.getFullYear(), cur.value.getMonth() + 1, 1));

/** 周一为首的 6×7 网格 */
const cells = computed(() => {
  const first = cur.value;
  const lead = (first.getDay() + 6) % 7;
  const start = addDays(first, -lead);
  const out: { key: string; iso: string; day: number; dim: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    const iso = isoOf(d);
    out.push({ key: iso, iso, day: d.getDate(), dim: d.getMonth() !== cur.value.getMonth() });
  }
  return out;
});

const weekIsoSet = computed(() => {
  const base = mondayOf(parse(props.weekStartIso));
  return new Set(Array.from({ length: 7 }, (_, i) => isoOf(addDays(base, i))));
});

function parse(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function pick(iso: string): void {
  emit('pick', iso);
  open.value = false;
}
</script>

<style scoped>
.wp-wrap { position: relative; }
.week-label-btn { font-size: 14px; font-weight: 600; min-width: 178px; }
.caret { font-size: 10px; color: var(--t4); margin-left: 4px; }
.wp-backdrop { position: fixed; inset: 0; z-index: 2400; }
.wp-pop {
  position: fixed; z-index: 2401; background: #fff; border: 1px solid var(--line);
  border-radius: 12px; box-shadow: 0 16px 40px rgba(17, 24, 39, 0.18);
  padding: 12px 14px; width: 252px;
}
.wp-head { display: flex; align-items: center; gap: 8px; font-size: 14px; margin-bottom: 8px; }
.wp-head b { flex: 1; text-align: center; }
.wp-nav {
  border: 1px solid var(--line); background: #fff; border-radius: 6px; width: 24px; height: 24px;
  cursor: pointer; color: var(--t2); font-size: 14px; line-height: 1;
}
.wp-nav:hover { background: #f9fafb; }
.wp-today { margin-left: 4px; }
.wp-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.wp-week-row span { text-align: center; font-size: 11px; color: var(--t4); padding: 3px 0; }
.wp-day {
  border: none; background: #fff; border-radius: 7px; height: 30px; font-size: 12px;
  cursor: pointer; color: var(--t1); font-family: inherit; position: relative;
}
.wp-day:hover { background: #eff6ff; }
.wp-day.dim { color: #d1d5db; }
.wp-day.today { color: var(--brand); font-weight: 700; }
.wp-day.today::after {
  content: ''; position: absolute; left: 50%; transform: translateX(-50%);
  bottom: 2px; width: 4px; height: 4px; border-radius: 50%; background: var(--brand);
}
.wp-day.inweek { background: #dbeafe; }
.wp-day.inweek.today { outline: 1.5px solid var(--brand); }
</style>
