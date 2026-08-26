/** 日程类型枚举（口径文档 §2.1） */
export type ScheduleType = 'transport' | 'hotel' | 'food' | 'sight' | 'shopping' | 'fun';

/** 日程库分组维度（口径文档 §6） */
export type GroupBy = 'type' | 'location' | 'expectedDate';

/** 日程 —— 核心领域对象（口径文档 §2 字段口径表） */
export interface Schedule {
  id: string;
  planId: string;
  /** 事项名称，必填 ≤30 字 */
  title: string;
  /** 类型，六选一 */
  type: ScheduleType;
  /** 地点，选填 ≤30 字，空值分组归"未填写地点" */
  location: string;
  /** 实际日期 YYYY-MM-DD；未放置为 null（口径 §3.1：date 与 startTime 同时有值或同时为空） */
  date: string | null;
  /** 开始时间 HH:mm，30 分钟对齐；未放置为 null */
  startTime: string | null;
  /** 时长（分钟），30–1440，默认 60 */
  durationMin: number;
  /** 预计日期，仅详情展示；取消日程时回写为上次实际日期（口径 §5） */
  expectedDate: string | null;
  /** 预估价格（元），≥0，空 = 不计入统计 */
  price: number | null;
  /** 金额波动（元），可负：正数=可能上浮，负数=可能下浮；空 = 无波动。
   *  区间 = [price + min(v,0), price + max(v,0)]，下限不低于 0（口径 §8） */
  priceVariance: number | null;
  /** 备注，≤200 字，仅详情展示 */
  note: string;
  /** 软删除时间戳；null = 未删除。回收站条目不参与日历/库/分组/统计 */
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** 行程方案 */
export interface Plan {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

/** 本地持久化的全量数据（localStorage schema） */
export interface AppData {
  version: number;
  plans: Plan[];
  schedules: Schedule[];
  lastPlanId: string | null;
}

/** 派生状态：已放置 ⇔ date 与 startTime 均非空（口径 §3.1） */
export const isPlaced = (s: Pick<Schedule, 'date' | 'startTime'>): boolean =>
  s.date !== null && s.startTime !== null;
