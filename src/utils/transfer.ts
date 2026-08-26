import type { AppData, Plan, Schedule } from '@/types';
import { SCHEMA_VERSION, TYPE_MAP } from '@/constants';
import { normalizeSchedule } from '@/data/normalize';
import { minToHH } from './datetime';
import { priceRange } from './price';

/* ============ 导出 ============ */

export interface ExportBundle {
  app: 'travel-planner';
  version: number;
  exportedAt: string;
  plans: Plan[];
  schedules: Schedule[];
}

export function buildExportBundle(data: AppData): ExportBundle {
  return {
    app: 'travel-planner',
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    plans: data.plans,
    schedules: data.schedules,
  };
}

/** 触发浏览器下载 */
export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const csvCell = (v: string | number | null): string => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** 当前行程 CSV 导出（Excel 兼容：UTF-8 BOM） */
export function buildPlanCsv(plans: Plan[], schedules: Schedule[]): string {
  const planNames = new Map(plans.map((p) => [p.id, p.name]));
  const header = ['行程', '事项名称', '类型', '日期', '开始时间', '结束时间', '时长(分钟)', '地点', '预计日期', '预估价格', '金额波动', '区间下限', '区间上限', '状态', '备注'];
  const rows = schedules.map((s) => {
    const end = s.startTime ? minToHH(Number(s.startTime.slice(0, 2)) * 60 + Number(s.startTime.slice(3)) + s.durationMin) : '';
    const range = priceRange(s.price, s.priceVariance);
    return [
      planNames.get(s.planId) ?? '',
      s.title,
      TYPE_MAP[s.type].name,
      s.date ?? '',
      s.startTime ?? '',
      end,
      s.durationMin,
      s.location,
      s.expectedDate ?? '',
      s.price ?? '',
      s.priceVariance ?? '',
      s.price == null && s.priceVariance == null ? '' : range.min,
      s.price == null && s.priceVariance == null ? '' : range.max,
      s.deletedAt !== null ? '已删除' : s.date ? '已放置' : '未放置',
      s.note,
    ].map(csvCell).join(',');
  });
  return '\uFEFF' + [header.map(csvCell).join(','), ...rows].join('\r\n');
}

/* ============ 导入 ============ */

export interface ImportReport {
  plans: number; // 导入的行程数
  schedules: number; // 导入的日程数
  skipped: string[]; // 被忽略的条目及原因
}

export interface ImportResult {
  ok: boolean;
  report?: ImportReport;
  error?: string;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * 解析导入 JSON（口径补充 §3：先校验出报告，再原子写入）。
 * mode = merge：按 id 去重（已存在则整条更新），计划与日程合并；
 * mode = overwrite：清空现有数据后整体替换。
 */
export function applyImport(
  rawText: string,
  current: AppData,
  mode: 'merge' | 'overwrite',
): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, error: '不是合法的 JSON 文件' };
  }
  if (!isObj(parsed) || !Array.isArray(parsed.plans) || !Array.isArray(parsed.schedules)) {
    return { ok: false, error: '文件结构不符：需要包含 plans 与 schedules 数组' };
  }

  const report: ImportReport = { plans: 0, schedules: 0, skipped: [] };
  const validPlans: Plan[] = [];
  for (const p of parsed.plans) {
    if (!isObj(p) || typeof p.id !== 'string' || !p.id) {
      report.skipped.push('一条行程缺少 id，已忽略');
      continue;
    }
    validPlans.push({
      id: p.id,
      name: typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 30) : '未命名行程',
      createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now(),
      updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : Date.now(),
    });
    report.plans++;
  }
  if (!validPlans.length) return { ok: false, error: '文件中没有有效行程' };

  const validSchedules: Schedule[] = [];
  for (const s of parsed.schedules) {
    if (!isObj(s)) {
      report.skipped.push('一条日程格式非法，已忽略');
      continue;
    }
    const pid = typeof s.planId === 'string' && validPlans.some((p) => p.id === s.planId) ? s.planId : validPlans[0]!.id;
    validSchedules.push(normalizeSchedule(s, pid));
    report.schedules++;
  }

  // 输出结果（原子：一次性返回完整数据，不产生半写状态）
  if (mode === 'overwrite') {
    current.plans = validPlans;
    current.schedules = validSchedules;
    current.lastPlanId = validPlans[0]!.id;
  } else {
    const planIds = new Set(current.plans.map((p) => p.id));
    for (const p of validPlans) if (!planIds.has(p.id)) current.plans.push(p);
    const byId = new Map(current.schedules.map((s) => [s.id, s]));
    for (const s of validSchedules) byId.set(s.id, s); // 同 id 整条更新
    current.schedules = [...byId.values()];
    if (!current.plans.some((p) => p.id === current.lastPlanId)) {
      current.lastPlanId = current.plans[0]!.id;
    }
  }
  return { ok: true, report };
}
