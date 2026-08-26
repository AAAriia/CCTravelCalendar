import type { Schedule } from '@/types';
import { hhToMin } from './datetime';

export interface LaidOutSchedule {
  schedule: Schedule;
  /** 所在分道序号（0 起） */
  lane: number;
  /** 所属重叠簇的总道数 */
  lanes: number;
}

/**
 * 重叠并排布局（口径文档 §4.5）：
 * - 按开始时间升序（并列按 id）扫描，划分"重叠簇"（簇内任意日程与簇内已有日程时间相交）
 * - 簇内贪心分配道：放入首条结束时间不冲突的道，否则开新道
 * - 卡片宽度 = 1/lanes，左偏移 = lane/lanes
 */
export function layoutOverlap(cards: Schedule[]): LaidOutSchedule[] {
  const sorted = [...cards].sort(
    (a, b) => hhToMin(a.startTime!) - hhToMin(b.startTime!) || a.id.localeCompare(b.id),
  );
  const out: LaidOutSchedule[] = [];
  let cluster: LaidOutSchedule[] = [];
  let clusterEnd = -1;
  const laneEnds: number[] = [];

  const closeCluster = () => {
    if (!cluster.length) return;
    for (const c of cluster) c.lanes = laneEnds.length;
    out.push(...cluster);
    cluster = [];
    laneEnds.length = 0;
    clusterEnd = -1;
  };

  for (const s of sorted) {
    const st = hhToMin(s.startTime!);
    const en = st + s.durationMin;
    if (cluster.length && st >= clusterEnd) closeCluster();
    let lane = laneEnds.findIndex((e) => e <= st);
    if (lane < 0) {
      laneEnds.push(en);
      lane = laneEnds.length - 1;
    } else {
      laneEnds[lane] = en;
    }
    cluster.push({ schedule: s, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, en);
  }
  closeCluster();
  return out;
}
