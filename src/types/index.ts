/** 日程类型枚举（口径文档 §2.1） */
export type ScheduleType = 'transport' | 'hotel' | 'food' | 'sight' | 'shopping' | 'fun';

/** 费用类型（预算表口径）：必须 / 可选 */
export type ExpenseType = 'required' | 'optional';

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
  /** 上浮幅度（元，≥0）；空 = 无上浮。区间口径见 §8 */
  varianceUp: number | null;
  /** 下浮幅度（元，≥0）；空 = 无下浮。区间 = [price - 下浮, price + 上浮]，下限不低于 0 */
  varianceDown: number | null;
  /** 已确认（勾选）：视为敲定的行程；放置到无重叠时段时自动勾选（口径 §14） */
  confirmed: boolean;
  /** 费用类型：必须 / 可选（默认必须），详情与预算表可编辑 */
  expenseType: ExpenseType;
  /** 已付金额（元），≥0；仅在预算表查看与编辑（口径 §15） */
  paidAmount: number | null;
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

/** 界面偏好（跨行程持久化） */
export interface UiState {
  /** 凌晨时段（02:00-07:00）是否折叠；默认 true，用户展开/折叠后记忆（口径 §4.1a） */
  nightCollapsed: boolean;
}

/** 本地持久化的全量数据（localStorage schema） */
export interface AppData {
  version: number;
  plans: Plan[];
  schedules: Schedule[];
  lastPlanId: string | null;
  uiState?: UiState;
}

/** 派生状态：已放置 ⇔ date 与 startTime 均非空（口径 §3.1） */
export const isPlaced = (s: Pick<Schedule, 'date' | 'startTime'>): boolean =>
  s.date !== null && s.startTime !== null;
