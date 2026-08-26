import type { AppData } from '@/types';

/**
 * 数据仓储接口 —— 存储层的唯一抽象。
 * v1 使用 LocalRepository（localStorage）实现；
 * 未来接后端 / IndexedDB / 本地文件时新增实现即可，业务代码零改动。
 */
export interface DataRepository {
  /** 读取全量数据；无数据 / 解析失败返回 null（调用方决定是否播种） */
  load(): Promise<AppData | null>;
  /** 全量写入（原子替换） */
  save(data: AppData): Promise<void>;
  /** 清空存储 */
  clear(): Promise<void>;
}
