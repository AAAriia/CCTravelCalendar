import type { ScheduleType } from '@/types';

/** 类型枚举与颜色口径（口径文档 §2.1） */
export const TYPES: ReadonlyArray<{ k: ScheduleType; name: string; color: string }> = [
  { k: 'transport', name: '交通', color: '#3B82F6' },
  { k: 'hotel', name: '住宿', color: '#8B5CF6' },
  { k: 'food', name: '餐饮', color: '#F59E0B' },
  { k: 'sight', name: '景点', color: '#10B981' },
  { k: 'shopping', name: '购物', color: '#EC4899' },
  { k: 'fun', name: '娱乐', color: '#06B6D4' },
];

export const TYPE_MAP: Record<ScheduleType, { k: ScheduleType; name: string; color: string }> =
  Object.fromEntries(TYPES.map((t) => [t.k, t])) as Record<
    ScheduleType,
    { k: ScheduleType; name: string; color: string }
  >;

/** 时间刻度口径（口径文档 §4.1） */
export const SLOT = 30; // 一格 = 30 分钟
export const SLOT_H = 44; // 一格像素高度
export const DAY_MIN = 1440; // 一天分钟数（不支持跨天）
export const COLS = 7; // 周视图列数（周一为一周第一天）
export const GUTTER = 60; // 时间轴宽度 px

/** 时长选项（详情弹窗下拉，30 分钟步进） */
export const DUR_OPTIONS = [30, 60, 90, 120, 180, 240, 300, 360, 480, 600, 720, 1440];

export const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'] as const;

/** localStorage 存储键与 schema 版本（v2：种子数据更换为冲绳行程 + 新增 priceVariance 字段） */
export const STORAGE_KEY = 'tp_app_v2';
export const SCHEMA_VERSION = 2;
