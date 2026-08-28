import type { ScheduleType } from '@/types';

/** 详情/新建弹窗的表单提交结构 */
export interface FormPatch {
  title: string;
  type: ScheduleType;
  location: string;
  address: string;
  lat: number | null;
  lon: number | null;
  date: string | null;
  startTime: string | null;
  durationMin: number;
  expectedDate: string | null;
  price: number | null;
  varianceUp: number | null;
  varianceDown: number | null;
  expenseType: 'required' | 'optional';
  note: string;
}
