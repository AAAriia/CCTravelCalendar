<template>
  <div class="app">
    <TopBar
      @manage-plans="planModal = true"
      @budget="goBudget"
      @import-export="ioModal = true"
      @trash="trashModal = true"
      @reset="askReset"
      @scroll-today="scrollCalendarTo"
    />

    <!-- ===== 桌面布局：周视图 + 右侧日程库 ===== -->
    <template v-if="!isMobile">
      <div class="main">
        <WeekCalendar ref="calRef" @cancel="askCancel" @open="openDetail" />
        <ScheduleLibrary @create="openCreate" @open="openDetail" @copied="openDetail" />
      </div>
    </template>

    <!-- ===== 移动布局：日期条 + 单日视图 + 底部抽屉日程库（口径补充 §4） ===== -->
    <template v-else>
      <div class="date-strip">
        <div
          v-for="(d, i) in store.weekDays"
          :key="store.weekIsoList[i]"
          class="ds-item"
          :class="{ sel: i === mobileDay, 'today-dot': store.weekIsoList[i] === todayIso }"
          @click="mobileDay = i"
        >
          <div class="dw">周{{ WEEK_CN[d.getDay()] }}</div>
          <div class="dd">{{ d.getMonth() + 1 }}/{{ d.getDate() }}</div>
        </div>
      </div>
      <div class="main">
        <WeekCalendar ref="calRef" :mobile-sel="mobileDay" @cancel="askCancel" @open="openDetail" />
      </div>
      <button class="btn primary lib-drawer-btn" @click="libDrawer = true">📋 日程库</button>
      <template v-if="libDrawer">
        <div class="drawer-mask" @click="libDrawer = false"></div>
        <div class="drawer">
          <ScheduleLibrary @create="openCreate" @open="onMobileLibOpen" @copied="openDetail" />
        </div>
      </template>
    </template>

    <!-- ===== 弹窗层 ===== -->
    <DetailModal
      :visible="detail.visible"
      :schedule="detail.target"
      @close="detail.visible = false"
      @save="onFormSave"
      @delete="askDelete"
    />
    <ConfirmDialog :state="confirmState" @confirm="confirmAction?.()" @close="confirmState = null" />
    <PlanManagerModal :visible="planModal" @close="planModal = false" @remove-plan="askRemovePlan" />
    <TrashModal :visible="trashModal" @close="trashModal = false" @purge="askPurge" />
    <ImportExportModal :visible="ioModal" @close="ioModal = false" />
    <PlaceSheet
      :visible="place.visible"
      :schedule="place.target"
      :default-date="store.weekIsoList[mobileDay]"
      @close="place.visible = false"
      @place="onPlace"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { Plan, Schedule } from '@/types';
import { isPlaced } from '@/types';
import type { FormPatch } from '@/types/form';
import { usePlannerStore } from '@/stores/planner';
import { WEEK_CN } from '@/constants';
import { isoOf, minToHH } from '@/utils/datetime';
import { fmtShort } from '@/utils/format';
import { useIsMobile } from '@/composables/useMediaQuery';
import { installDragSystem, setDragUiHooks } from '@/composables/useDragSchedule';
import { toast } from '@/composables/useToast';
import TopBar from '@/components/TopBar.vue';
import WeekCalendar from '@/components/WeekCalendar.vue';
import ScheduleLibrary from '@/components/ScheduleLibrary.vue';
import DetailModal from '@/components/DetailModal.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import PlanManagerModal from '@/components/PlanManagerModal.vue';
import TrashModal from '@/components/TrashModal.vue';
import ImportExportModal from '@/components/ImportExportModal.vue';
import PlaceSheet from '@/components/PlaceSheet.vue';

const store = usePlannerStore();
const route = useRoute();
const router = useRouter();
const isMobile = useIsMobile();

const calRef = ref<InstanceType<typeof WeekCalendar> | null>(null);
const todayIso = isoOf(new Date());

/* ---------------- 弹窗状态 ---------------- */
const detail = reactive<{ visible: boolean; target: Schedule | null }>({ visible: false, target: null });
const confirmState = ref<{ title: string; bodyHtml: string; yesText?: string; danger?: boolean } | null>(null);
const confirmAction = ref<(() => void) | null>(null);
const planModal = ref(false);
const trashModal = ref(false);
const ioModal = ref(false);
const place = reactive<{ visible: boolean; target: Schedule | null }>({ visible: false, target: null });
const libDrawer = ref(false);
const mobileDay = ref(Math.min(6, Math.max(0, ((new Date().getDay() + 6) % 7)))); // 默认选中今天

/* ---------------- 路由 ↔ 行程 深链 ---------------- */
watch(
  () => route.params.planId,
  (id) => {
    if (typeof id === 'string' && id !== store.currentPlanId) store.switchPlan(id);
  },
  { immediate: true },
);

/* ---------------- 详情 / 新建 ---------------- */
function openDetail(id: string): void {
  const s = store.schedules.find((x) => x.id === id);
  if (!s) return;
  detail.target = s;
  detail.visible = true;
}
function openCreate(): void {
  detail.target = null;
  detail.visible = true;
}
function onFormSave(patch: FormPatch): void {
  if (detail.target) {
    const [, warn] = store.updateSchedule(detail.target.id, patch);
    if (warn === 'date-time-mismatch') toast('日期与时间需同时填写，已按"未放置"保存');
    else toast('已保存');
  } else {
    const [, warn] = store.createSchedule(patch);
    if (warn === 'date-time-mismatch') toast('日期与时间需同时填写，已按"未放置"保存');
    else toast('已创建');
  }
  detail.visible = false;
}

/* ---------------- 取消（E6）与删除 ---------------- */
function askCancel(id: string): void {
  const s = store.schedules.find((x) => x.id === id);
  if (!s || !isPlaced(s)) return;
  confirmState.value = {
    title: '取消该日程？',
    bodyHtml: `“${escapeHtml(s.title)}”将移回日程库：日期与时间清空，<br>预计日期将更新为 <b>${fmtShort(s.date)}</b>（上次实际日期）。`,
    yesText: '确认取消',
  };
  confirmAction.value = () => {
    const last = store.cancelSchedule(id);
    confirmState.value = null;
    if (last) toast(`已取消，预计日期回写为 ${fmtShort(last)}`);
  };
}

function askDelete(id: string): void {
  const s = store.schedules.find((x) => x.id === id);
  if (!s) return;
  detail.visible = false;
  confirmState.value = {
    title: '删除该日程？',
    bodyHtml: `“${escapeHtml(s.title)}”将移入回收站，可随时恢复；<br>注意：删除 ≠ 取消（取消会保留在日程库中等待重排）。`,
    yesText: '删除',
    danger: true,
  };
  confirmAction.value = () => {
    store.deleteSchedule(id);
    confirmState.value = null;
    toast('已移入回收站');
  };
}

function askPurge(s: Schedule): void {
  confirmState.value = {
    title: '彻底删除？',
    bodyHtml: `“${escapeHtml(s.title)}”将被永久删除，不可恢复。`,
    yesText: '彻底删除',
    danger: true,
  };
  confirmAction.value = () => {
    store.purgeSchedule(s.id);
    confirmState.value = null;
    toast('已彻底删除');
  };
}

function askRemovePlan(p: Plan): void {
  const n = store.schedules.filter((s) => s.planId === p.id).length;
  confirmState.value = {
    title: `删除行程「${escapeHtml(p.name)}」？`,
    bodyHtml: `该行程的 <b>${n}</b> 条日程（含回收站）将被永久删除，且不可恢复。`,
    yesText: '删除行程',
    danger: true,
  };
  confirmAction.value = () => {
    store.removePlan(p.id);
    confirmState.value = null;
    planModal.value = false;
    void router.push({ name: 'plan', params: { planId: store.currentPlanId! } });
    toast('行程已删除');
  };
}

function askReset(): void {
  confirmState.value = {
    title: '重置示例数据？',
    bodyHtml: '将清空本地所有修改，恢复为内置的"杭州 3 日游"示例。',
    yesText: '确认重置',
    danger: true,
  };
  confirmAction.value = () => {
    void store.resetToSeed();
    confirmState.value = null;
    void router.replace({ name: 'plan', params: { planId: store.currentPlanId! } });
    toast('已重置示例数据');
  };
}

/* ---------------- 移动端：点选放置 ---------------- */
function onMobileLibOpen(id: string): void {
  const s = store.schedules.find((x) => x.id === id);
  if (!s) return;
  if (isMobile.value && !isPlaced(s)) {
    place.target = s;
    place.visible = true;
  } else {
    openDetail(id);
  }
}

function onPlace(date: string, startMin: number, durationMin: number): void {
  if (!place.target) return;
  place.target.durationMin = durationMin;
  store.placeSchedule(place.target.id, date, startMin, 'place');
  place.visible = false;
  libDrawer.value = false;
  toast(`已放置到 ${fmtShort(date)} ${minToHH(startMin)}`);
}

/* ---------------- 拖拽系统装配 ---------------- */
onMounted(() => {
  installDragSystem();
  setDragUiHooks(openDetail);
});

function goBudget(): void {
  void router.push({ name: 'budget', params: { planId: store.currentPlanId! } });
}

function scrollCalendarTo(top: number): void {
  calRef.value?.scrollTo(top);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
</script>
